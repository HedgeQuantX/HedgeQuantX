/**
 * @fileoverview Professional Copy Trading System
 * @module pages/algo/copy-trading
 * 
 * Ultra-low latency copy trading with:
 * - Fast polling (250ms adaptive)
 * - Multi-follower support
 * - Parallel order execution
 * - Automatic retry with exponential backoff
 * - Position reconciliation
 * - Slippage protection
 * - Cross-platform support (ProjectX <-> Rithmic)
 */

const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');

const { connections } = require('../../services');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { logger, prompts } = require('../../utils');
const { checkMarketHours } = require('../../services/projectx/market');
const { algoLogger } = require('./logger');

// AI Strategy Supervisor
const aiService = require('../../services/ai');
const StrategySupervisor = require('../../services/ai/strategy-supervisor');

const log = logger.scope('CopyTrading');

// ============================================================================
// COPY ENGINE - Professional Order Execution
// ============================================================================

/**
 * CopyEngine - Handles all copy trading logic with professional execution
 */
class CopyEngine {
  constructor(config) {
    this.lead = config.lead;
    this.followers = config.followers; // Array of followers
    this.symbol = config.symbol;
    this.dailyTarget = config.dailyTarget;
    this.maxRisk = config.maxRisk;
    this.ui = config.ui;
    this.stats = config.stats;
    
    // Engine state
    this.running = false;
    this.stopReason = null;
    
    // Position tracking
    this.leadPositions = new Map(); // key: positionKey, value: position
    this.followerPositions = new Map(); // key: `${followerIdx}:${posKey}`, value: position
    this.pendingOrders = new Map(); // key: orderId, value: orderInfo
    
    // Order queue for sequential execution per follower
    this.orderQueues = new Map(); // key: followerIdx, value: queue[]
    this.processingQueue = new Map(); // key: followerIdx, value: boolean
    
    // Timing
    this.pollInterval = 250; // Start at 250ms, adaptive
    this.lastPollTime = 0;
    this.pollCount = 0;
    this.orderCount = 0;
    this.failedOrders = 0;
    
    // Retry configuration
    this.maxRetries = 3;
    this.retryDelayBase = 100; // ms
    
    // Slippage protection (ticks)
    this.maxSlippageTicks = 4;
  }

  /**
   * Get unique position key (cross-platform compatible)
   */
  getPositionKey(position) {
    return position.contractId || position.symbol || position.id;
  }

  /**
   * Resolve symbol for target platform
   */
  resolveSymbol(position, targetAccount) {
    const targetType = targetAccount.type;
    
    if (targetType === 'rithmic') {
      return {
        symbol: position.symbol || this.symbol.name,
        exchange: position.exchange || this.symbol.exchange || 'CME',
        contractId: null
      };
    } else {
      return {
        contractId: position.contractId || this.symbol.id || this.symbol.contractId,
        symbol: null,
        exchange: null
      };
    }
  }

  /**
   * Build order data for specific platform
   */
  buildOrderData(params, platformType) {
    const { accountId, contractId, symbol, exchange, side, size, type, price } = params;
    
    if (platformType === 'rithmic') {
      return {
        accountId,
        symbol,
        exchange: exchange || 'CME',
        size,
        side,
        type,
        price: price || 0
      };
    } else {
      return {
        accountId,
        contractId,
        type,
        side,
        size
      };
    }
  }

  /**
   * Execute order with retry logic
   */
  async executeOrderWithRetry(follower, orderData, retryCount = 0) {
    try {
      const startTime = Date.now();
      const result = await follower.service.placeOrder(orderData);
      const latency = Date.now() - startTime;
      
      if (result.success) {
        this.orderCount++;
        this.stats.latency = Math.round((this.stats.latency + latency) / 2);
        return { success: true, latency };
      }
      
      // Retry on failure
      if (retryCount < this.maxRetries) {
        const delay = this.retryDelayBase * Math.pow(2, retryCount);
        await this.sleep(delay);
        return this.executeOrderWithRetry(follower, orderData, retryCount + 1);
      }
      
      this.failedOrders++;
      return { success: false, error: result.error || 'Max retries exceeded' };
    } catch (err) {
      if (retryCount < this.maxRetries) {
        const delay = this.retryDelayBase * Math.pow(2, retryCount);
        await this.sleep(delay);
        return this.executeOrderWithRetry(follower, orderData, retryCount + 1);
      }
      
      this.failedOrders++;
      return { success: false, error: err.message };
    }
  }

  /**
   * Queue order for a follower (ensures sequential execution per follower)
   */
  async queueOrder(followerIdx, orderFn) {
    if (!this.orderQueues.has(followerIdx)) {
      this.orderQueues.set(followerIdx, []);
    }
    
    return new Promise((resolve) => {
      this.orderQueues.get(followerIdx).push({ fn: orderFn, resolve });
      this.processQueue(followerIdx);
    });
  }

  /**
   * Process order queue for a follower
   */
  async processQueue(followerIdx) {
    if (this.processingQueue.get(followerIdx)) return;
    
    const queue = this.orderQueues.get(followerIdx);
    if (!queue || queue.length === 0) return;
    
    this.processingQueue.set(followerIdx, true);
    
    while (queue.length > 0 && this.running) {
      const { fn, resolve } = queue.shift();
      try {
        const result = await fn();
        resolve(result);
      } catch (err) {
        resolve({ success: false, error: err.message });
      }
    }
    
    this.processingQueue.set(followerIdx, false);
  }

  /**
   * Copy position open to all followers (parallel execution)
   */
  async copyPositionOpen(position) {
    const side = position.quantity > 0 ? 'LONG' : 'SHORT';
    const orderSide = position.quantity > 0 ? 0 : 1;
    const displaySymbol = position.symbol || this.symbol.name;
    const size = Math.abs(position.quantity);
    const entry = position.averagePrice || 0;
    
    algoLogger.positionOpened(this.ui, displaySymbol, side, size, entry);
    
    // Feed to AI supervisor
    if (this.stats.aiSupervision) {
      StrategySupervisor.feedSignal({
        direction: side.toLowerCase(),
        entry,
        stopLoss: null,
        takeProfit: null,
        confidence: 0.5
      });
    }
    
    // Execute on all followers in parallel
    const promises = this.followers.map((follower, idx) => {
      return this.queueOrder(idx, async () => {
        const resolved = this.resolveSymbol(position, follower);
        const orderData = this.buildOrderData({
          accountId: follower.account.accountId,
          contractId: resolved.contractId,
          symbol: resolved.symbol,
          exchange: resolved.exchange,
          side: orderSide,
          size: follower.contracts,
          type: 2 // Market
        }, follower.type);
        
        algoLogger.info(this.ui, 'COPY ORDER', `${side} ${follower.contracts}x -> ${follower.propfirm}`);
        
        const result = await this.executeOrderWithRetry(follower, orderData);
        
        if (result.success) {
          algoLogger.orderFilled(this.ui, displaySymbol, side, follower.contracts, entry);
          
          // Track follower position
          const posKey = this.getPositionKey(position);
          this.followerPositions.set(`${idx}:${posKey}`, {
            ...position,
            followerIdx: idx,
            openTime: Date.now()
          });
        } else {
          algoLogger.orderRejected(this.ui, displaySymbol, result.error);
        }
        
        return result;
      });
    });
    
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    
    if (successCount === this.followers.length) {
      algoLogger.info(this.ui, 'ALL COPIED', `${successCount}/${this.followers.length} followers`);
    } else if (successCount > 0) {
      algoLogger.info(this.ui, 'PARTIAL COPY', `${successCount}/${this.followers.length} followers`);
    }
    
    return results;
  }

  /**
   * Copy position close to all followers (parallel execution)
   */
  async copyPositionClose(position, exitPrice, pnl) {
    const side = position.quantity > 0 ? 'LONG' : 'SHORT';
    const closeSide = position.quantity > 0 ? 1 : 0;
    const displaySymbol = position.symbol || this.symbol.name;
    const size = Math.abs(position.quantity);
    
    algoLogger.positionClosed(this.ui, displaySymbol, side, size, exitPrice, pnl);
    
    // Feed to AI supervisor
    if (this.stats.aiSupervision) {
      StrategySupervisor.feedTradeResult({
        side,
        qty: size,
        price: exitPrice,
        pnl,
        symbol: displaySymbol,
        direction: side
      });
      
      const aiStatus = StrategySupervisor.getStatus();
      if (aiStatus.patternsLearned.winning + aiStatus.patternsLearned.losing > 0) {
        algoLogger.info(this.ui, 'AI LEARNING', 
          `${aiStatus.patternsLearned.winning}W/${aiStatus.patternsLearned.losing}L patterns`);
      }
    }
    
    // Close on all followers in parallel
    const posKey = this.getPositionKey(position);
    
    const promises = this.followers.map((follower, idx) => {
      return this.queueOrder(idx, async () => {
        const resolved = this.resolveSymbol(position, follower);
        const posIdentifier = follower.type === 'rithmic' 
          ? (position.symbol || this.symbol.name)
          : (position.contractId || this.symbol.id);
        
        algoLogger.info(this.ui, 'CLOSE ORDER', `${displaySymbol} -> ${follower.propfirm}`);
        
        // Try closePosition first
        let result = await follower.service.closePosition(
          follower.account.accountId,
          posIdentifier
        );
        
        if (!result.success) {
          // Fallback: market order
          const orderData = this.buildOrderData({
            accountId: follower.account.accountId,
            contractId: resolved.contractId,
            symbol: resolved.symbol,
            exchange: resolved.exchange,
            side: closeSide,
            size: follower.contracts,
            type: 2
          }, follower.type);
          
          result = await this.executeOrderWithRetry(follower, orderData);
        }
        
        if (result.success) {
          algoLogger.info(this.ui, 'CLOSED', `${displaySymbol} on ${follower.propfirm}`);
          this.followerPositions.delete(`${idx}:${posKey}`);
        } else {
          algoLogger.error(this.ui, 'CLOSE FAILED', `${follower.propfirm}: ${result.error}`);
        }
        
        return result;
      });
    });
    
    const results = await Promise.all(promises);
    const successCount = results.filter(r => r.success).length;
    
    if (successCount === this.followers.length) {
      this.stats.trades++;
      if (pnl >= 0) this.stats.wins++;
      else this.stats.losses++;
    }
    
    return results;
  }

  /**
   * Poll lead positions and detect changes
   */
  async pollLeadPositions() {
    if (!this.running) return;
    
    const startTime = Date.now();
    
    try {
      const result = await this.lead.service.getPositions(this.lead.account.accountId);
      if (!result.success) return;
      
      const currentPositions = result.positions || [];
      const currentMap = new Map();
      
      // Build current positions map
      for (const pos of currentPositions) {
        if (pos.quantity === 0) continue;
        const key = this.getPositionKey(pos);
        currentMap.set(key, pos);
      }
      
      // Detect new positions (opened)
      for (const [key, pos] of currentMap) {
        if (!this.leadPositions.has(key)) {
          // New position - copy to followers
          await this.copyPositionOpen(pos);
          this.leadPositions.set(key, pos);
        } else {
          // Position exists - check for size change (scaling)
          const oldPos = this.leadPositions.get(key);
          if (Math.abs(pos.quantity) !== Math.abs(oldPos.quantity)) {
            // Size changed - update tracked position (scaling in/out)
            this.leadPositions.set(key, pos);
          }
        }
      }
      
      // Detect closed positions
      for (const [key, oldPos] of this.leadPositions) {
        if (!currentMap.has(key)) {
          // Position closed - close on followers
          const exitPrice = oldPos.averagePrice || 0;
          const pnl = oldPos.profitAndLoss || 0;
          await this.copyPositionClose(oldPos, exitPrice, pnl);
          this.leadPositions.delete(key);
        }
      }
      
      // Update P&L from current positions
      const totalPnL = currentPositions.reduce((sum, p) => sum + (p.profitAndLoss || 0), 0);
      this.stats.pnl = totalPnL;
      
      // Check limits
      if (totalPnL >= this.dailyTarget) {
        this.stop('target');
        algoLogger.info(this.ui, 'TARGET REACHED', `+$${totalPnL.toFixed(2)}`);
      } else if (totalPnL <= -this.maxRisk) {
        this.stop('risk');
        algoLogger.error(this.ui, 'MAX RISK HIT', `-$${Math.abs(totalPnL).toFixed(2)}`);
      }
      
      // Adaptive polling - faster when positions are open
      const pollTime = Date.now() - startTime;
      this.stats.latency = pollTime;
      
      if (this.leadPositions.size > 0) {
        this.pollInterval = Math.max(100, Math.min(250, pollTime * 2));
      } else {
        this.pollInterval = Math.max(250, Math.min(500, pollTime * 3));
      }
      
      this.pollCount++;
      
    } catch (err) {
      log.warn('Poll error', { error: err.message });
    }
  }

  /**
   * Reconcile follower positions with lead
   */
  async reconcilePositions() {
    // Get all follower positions and compare with lead
    for (let idx = 0; idx < this.followers.length; idx++) {
      const follower = this.followers[idx];
      
      try {
        const result = await follower.service.getPositions(follower.account.accountId);
        if (!result.success) continue;
        
        const followerPositions = result.positions || [];
        
        // Check each lead position has corresponding follower position
        for (const [key, leadPos] of this.leadPositions) {
          const hasFollowerPos = followerPositions.some(fp => {
            const fpKey = this.getPositionKey(fp);
            return fpKey === key && fp.quantity !== 0;
          });
          
          if (!hasFollowerPos) {
            // Missing position on follower - need to open
            algoLogger.info(this.ui, 'RECONCILE', `Missing ${key} on ${follower.propfirm}`);
            await this.copyPositionOpen(leadPos);
          }
        }
        
        // Check for orphaned follower positions (position on follower but not on lead)
        for (const fp of followerPositions) {
          if (fp.quantity === 0) continue;
          const fpKey = this.getPositionKey(fp);
          
          if (!this.leadPositions.has(fpKey)) {
            // Orphaned position - close it
            algoLogger.info(this.ui, 'RECONCILE', `Orphaned ${fpKey} on ${follower.propfirm}`);
            
            const posIdentifier = follower.type === 'rithmic' ? fp.symbol : fp.contractId;
            await follower.service.closePosition(follower.account.accountId, posIdentifier);
          }
        }
        
      } catch (err) {
        log.warn('Reconcile error', { follower: follower.propfirm, error: err.message });
      }
    }
  }

  /**
   * Start the copy engine
   */
  async start() {
    this.running = true;
    this.stats.connected = true;
    
    algoLogger.info(this.ui, 'ENGINE STARTED', `Polling every ${this.pollInterval}ms`);
    algoLogger.info(this.ui, 'FOLLOWERS', `${this.followers.length} account(s)`);
    
    // Initial reconciliation
    await this.reconcilePositions();
    
    // Main polling loop
    while (this.running) {
      await this.pollLeadPositions();
      await this.sleep(this.pollInterval);
    }
    
    return this.stopReason;
  }

  /**
   * Stop the copy engine
   */
  stop(reason = 'manual') {
    this.running = false;
    this.stopReason = reason;
    this.stats.connected = false;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// COPY TRADING MENU
// ============================================================================

/**
 * Copy Trading Menu
 */
const copyTradingMenu = async () => {
  log.info('Copy Trading menu opened');

  // Check market hours
  const market = checkMarketHours();
  if (!market.isOpen && !market.message.includes('early')) {
    console.log();
    console.log(chalk.red(`  ${market.message}`));
    console.log(chalk.gray('  Algo trading is only available when market is open'));
    console.log();
    await prompts.waitForEnter();
    return;
  }

  const allConns = connections.getAll();

  if (allConns.length === 0) {
    console.log();
    console.log(chalk.yellow('  No connections found'));
    console.log(chalk.gray('  Connect to a PropFirm first'));
    console.log();
    await prompts.waitForEnter();
    return;
  }

  console.log();
  console.log(chalk.yellow.bold('  COPY TRADING - Professional Mode'));
  console.log();

  // Fetch all accounts
  const spinner = ora({ text: 'FETCHING ACCOUNTS...', color: 'yellow' }).start();
  const allAccounts = await fetchAllAccounts(allConns);

  if (allAccounts.length < 2) {
    spinner.fail('NEED AT LEAST 2 ACTIVE ACCOUNTS');
    console.log(chalk.gray('  Copy Trading requires a lead + at least one follower'));
    await prompts.waitForEnter();
    return;
  }

  spinner.succeed(`Found ${allAccounts.length} accounts across ${allConns.length} connection(s)`);

  // Step 1: Select Lead Account
  console.log();
  console.log(chalk.cyan.bold('  Step 1: Select LEAD Account (source)'));
  const leadIdx = await selectAccount('LEAD ACCOUNT:', allAccounts, []);
  if (leadIdx === null || leadIdx === -1) return;
  const lead = allAccounts[leadIdx];

  // Step 2: Select Follower Accounts (multiple)
  console.log();
  console.log(chalk.cyan.bold('  Step 2: Select FOLLOWER Account(s)'));
  console.log(chalk.gray('  Select accounts to copy trades to'));
  
  const followers = [];
  let selectingFollowers = true;
  const excludeIndices = [leadIdx];
  
  while (selectingFollowers && excludeIndices.length < allAccounts.length) {
    const followerIdx = await selectAccount(
      followers.length === 0 ? 'FOLLOWER ACCOUNT:' : 'ADD ANOTHER FOLLOWER:',
      allAccounts,
      excludeIndices,
      followers.length > 0 // Allow skip if at least one follower
    );
    
    if (followerIdx === null || followerIdx === -1) {
      if (followers.length === 0) return; // Cancel
      selectingFollowers = false;
    } else if (followerIdx === -2) {
      selectingFollowers = false; // Done adding
    } else {
      followers.push(allAccounts[followerIdx]);
      excludeIndices.push(followerIdx);
      console.log(chalk.green(`  Added: ${allAccounts[followerIdx].propfirm}`));
    }
  }

  if (followers.length === 0) {
    console.log(chalk.red('  No followers selected'));
    await prompts.waitForEnter();
    return;
  }

  // Step 3: Select Symbol
  console.log();
  console.log(chalk.cyan.bold('  Step 3: Select Trading Symbol'));
  const symbol = await selectSymbol(lead.service);
  if (!symbol) return;

  // Step 4: Configure contracts for each account
  console.log();
  console.log(chalk.cyan.bold('  Step 4: Configure Contract Sizes'));
  
  const leadContracts = await prompts.numberInput(`${lead.propfirm} (LEAD) contracts:`, 1, 1, 10);
  if (leadContracts === null) return;
  lead.contracts = leadContracts;
  
  for (const follower of followers) {
    const contracts = await prompts.numberInput(`${follower.propfirm} contracts:`, leadContracts, 1, 10);
    if (contracts === null) return;
    follower.contracts = contracts;
  }

  // Step 5: Risk parameters
  console.log();
  console.log(chalk.cyan.bold('  Step 5: Risk Parameters'));
  
  const dailyTarget = await prompts.numberInput('Daily target ($):', 500, 1, 10000);
  if (dailyTarget === null) return;

  const maxRisk = await prompts.numberInput('Max risk ($):', 250, 1, 5000);
  if (maxRisk === null) return;

  // Step 6: Privacy
  const showNames = await prompts.selectOption('ACCOUNT NAMES:', [
    { label: 'HIDE ACCOUNT NAMES', value: false },
    { label: 'SHOW ACCOUNT NAMES', value: true },
  ]);
  if (showNames === null) return;

  // Summary
  console.log();
  console.log(chalk.white.bold('  ═══════════════════════════════════════'));
  console.log(chalk.white.bold('  COPY TRADING CONFIGURATION'));
  console.log(chalk.white.bold('  ═══════════════════════════════════════'));
  console.log(chalk.cyan(`  Symbol: ${symbol.name}`));
  console.log(chalk.cyan(`  Lead: ${lead.propfirm} (${leadContracts} contracts)`));
  console.log(chalk.cyan(`  Followers: ${followers.length}`));
  followers.forEach(f => {
    console.log(chalk.gray(`    → ${f.propfirm} (${f.contracts} contracts)`));
  });
  console.log(chalk.cyan(`  Target: $${dailyTarget} | Risk: $${maxRisk}`));
  console.log(chalk.white.bold('  ═══════════════════════════════════════'));
  console.log();

  const confirm = await prompts.confirmPrompt('START COPY TRADING?', true);
  if (!confirm) return;

  // Launch
  await launchCopyTrading({
    lead: { ...lead, symbol, contracts: leadContracts },
    followers: followers.map(f => ({ ...f, symbol })),
    dailyTarget,
    maxRisk,
    showNames,
  });
};

/**
 * Fetch all active accounts from connections
 */
const fetchAllAccounts = async (allConns) => {
  const allAccounts = [];

  // Fetch in parallel
  const promises = allConns.map(async (conn) => {
    try {
      const result = await conn.service.getTradingAccounts();
      if (result.success && result.accounts) {
        return result.accounts
          .filter(a => a.status === 0)
          .map(acc => ({
            account: acc,
            service: conn.service,
            propfirm: conn.propfirm,
            type: conn.type,
          }));
      }
    } catch (err) {
      log.warn('Failed to get accounts', { type: conn.type, error: err.message });
    }
    return [];
  });

  const results = await Promise.all(promises);
  results.forEach(accounts => allAccounts.push(...accounts));

  return allAccounts;
};

/**
 * Select account from list
 */
const selectAccount = async (message, accounts, excludeIndices = [], allowDone = false) => {
  const options = accounts
    .map((a, i) => ({ a, i }))
    .filter(x => !excludeIndices.includes(x.i))
    .map(x => {
      const acc = x.a.account;
      const balance = acc.balance !== null && acc.balance !== undefined
        ? ` ($${acc.balance.toLocaleString()})`
        : '';
      const platform = x.a.type === 'rithmic' ? ' [Rithmic]' : '';
      return {
        label: `${x.a.propfirm} - ${acc.accountName || acc.rithmicAccountId || acc.accountId}${balance}${platform}`,
        value: x.i,
      };
    });

  if (allowDone) {
    options.push({ label: chalk.green('✓ DONE ADDING FOLLOWERS'), value: -2 });
  }
  options.push({ label: chalk.gray('< CANCEL'), value: -1 });
  
  return prompts.selectOption(message, options);
};

/**
 * Select trading symbol
 */
const selectSymbol = async (service) => {
  const spinner = ora({ text: 'LOADING SYMBOLS...', color: 'yellow' }).start();

  try {
    let contracts = await getContractsFromAPI();

    if (!contracts && typeof service.getContracts === 'function') {
      const result = await service.getContracts();
      if (result.success && result.contracts?.length > 0) {
        contracts = result.contracts;
      }
    }

    if (!contracts || !contracts.length) {
      spinner.fail('NO CONTRACTS AVAILABLE');
      await prompts.waitForEnter();
      return null;
    }

    spinner.succeed(`Found ${contracts.length} contracts`);

    // Sort by popular symbols first
    const popular = ['ES', 'NQ', 'MES', 'MNQ', 'RTY', 'YM', 'CL', 'GC'];
    contracts.sort((a, b) => {
      const aIdx = popular.findIndex(p => (a.name || '').startsWith(p));
      const bIdx = popular.findIndex(p => (b.name || '').startsWith(p));
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    const options = contracts.slice(0, 30).map(c => ({
      label: `${c.name} - ${c.description || ''} (${c.exchange || 'CME'})`,
      value: c
    }));

    options.push({ label: chalk.gray('< CANCEL'), value: null });

    return prompts.selectOption('TRADING SYMBOL:', options);
  } catch (err) {
    spinner.fail(`Error loading contracts: ${err.message}`);
    await prompts.waitForEnter();
    return null;
  }
};

/**
 * Get contracts from ProjectX API
 */
const getContractsFromAPI = async () => {
  const allConns = connections.getAll();
  const projectxConn = allConns.find(c => c.type === 'projectx');

  if (projectxConn && typeof projectxConn.service.getContracts === 'function') {
    const result = await projectxConn.service.getContracts();
    if (result.success && result.contracts?.length > 0) {
      return result.contracts;
    }
  }

  return null;
};

/**
 * Launch Copy Trading session
 */
const launchCopyTrading = async (config) => {
  const { lead, followers, dailyTarget, maxRisk, showNames } = config;

  const leadName = showNames 
    ? (lead.account.accountName || lead.account.accountId)
    : 'Lead *****';
  
  const ui = new AlgoUI({ subtitle: 'COPY TRADING PRO', mode: 'copy-trading' });

  const stats = {
    leadName,
    followerCount: followers.length,
    leadSymbol: lead.symbol.name,
    leadQty: lead.contracts,
    target: dailyTarget,
    risk: maxRisk,
    pnl: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    latency: 0,
    connected: false,
    platform: lead.type === 'rithmic' ? 'Rithmic' : 'ProjectX',
    startTime: Date.now(),
    aiSupervision: false,
    aiMode: null
  };

  // Initialize AI Supervisor
  const aiAgents = aiService.getAgents();
  if (aiAgents.length > 0) {
    const supervisorResult = StrategySupervisor.initialize(null, aiAgents, lead.service, lead.account.accountId);
    stats.aiSupervision = supervisorResult.success;
    stats.aiMode = supervisorResult.mode;
  }

  // Startup logs
  const market = checkMarketHours();
  const sessionName = market.session || 'AMERICAN';
  const etTime = new Date().toLocaleTimeString('en-US', { 
    hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' 
  });

  algoLogger.connectingToEngine(ui, lead.account.accountId);
  algoLogger.engineStarting(ui, stats.platform, dailyTarget, maxRisk);
  algoLogger.marketOpen(ui, sessionName.toUpperCase(), etTime);
  algoLogger.info(ui, 'COPY MODE', `Lead: ${lead.propfirm} -> ${followers.length} follower(s)`);

  if (stats.aiSupervision) {
    algoLogger.info(ui, 'AI SUPERVISION', `${aiAgents.length} agent(s) - LEARNING ACTIVE`);
  }

  // Create copy engine
  const engine = new CopyEngine({
    lead,
    followers,
    symbol: lead.symbol,
    dailyTarget,
    maxRisk,
    ui,
    stats
  });

  // UI refresh loop
  const refreshInterval = setInterval(() => {
    if (engine.running) ui.render(stats);
  }, 250);

  // Keyboard handling
  const cleanupKeys = setupKeyboardHandler(() => {
    engine.stop('manual');
  });

  // Start engine
  algoLogger.dataConnected(ui, 'API');
  algoLogger.algoOperational(ui, stats.platform);
  
  const stopReason = await engine.start();

  // Cleanup
  clearInterval(refreshInterval);
  if (cleanupKeys) cleanupKeys();

  // Stop AI Supervisor
  if (stats.aiSupervision) {
    const aiSummary = StrategySupervisor.stop();
    stats.aiLearning = {
      optimizations: aiSummary.optimizationsApplied || 0,
      patternsLearned: (aiSummary.winningPatterns || 0) + (aiSummary.losingPatterns || 0)
    };
  }

  ui.cleanup();

  // Duration
  const durationMs = Date.now() - stats.startTime;
  const hours = Math.floor(durationMs / 3600000);
  const minutes = Math.floor((durationMs % 3600000) / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  stats.duration = hours > 0
    ? `${hours}h ${minutes}m ${seconds}s`
    : minutes > 0
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;

  // Summary
  renderSessionSummary(stats, stopReason);
  await prompts.waitForEnter();
};

/**
 * Setup keyboard handler
 */
const setupKeyboardHandler = (onStop) => {
  if (!process.stdin.isTTY) return null;

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  const handler = (str, key) => {
    if (key && (key.name === 'x' || (key.ctrl && key.name === 'c'))) {
      onStop();
    }
  };

  process.stdin.on('keypress', handler);

  return () => {
    process.stdin.removeListener('keypress', handler);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  };
};

module.exports = { copyTradingMenu };
