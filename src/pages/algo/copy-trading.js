/**
 * @fileoverview Copy Trading Mode with Strategy Selection
 * @module pages/algo/copy-trading
 */

const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');

const { connections } = require('../../services');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { logger, prompts } = require('../../utils');
const { checkMarketHours } = require('../../services/rithmic/market');

// Strategy Registry & Market Data
const { getAvailableStrategies, loadStrategy, getStrategy } = require('../../lib/m');
const { MarketDataFeed } = require('../../lib/data');

const log = logger.scope('CopyTrading');


/**
 * Strategy Selection
 * @returns {Promise<string|null>} Selected strategy ID or null
 */
const selectStrategy = async () => {
  const strategies = getAvailableStrategies();
  
  const options = strategies.map(s => ({
    label: s.id === 'ultra-scalping' ? 'HQX Scalping' : 'HQX Sweep',
    value: s.id
  }));
  options.push({ label: chalk.gray('< Back'), value: 'back' });
  
  const selected = await prompts.selectOption('Select Strategy:', options);
  return selected === 'back' ? null : selected;
};


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

  if (allConns.length < 2) {
    console.log();
    console.log(chalk.yellow(`  Copy Trading requires 2 connected accounts (found: ${allConns.length})`));
    console.log(chalk.gray('  Connect to another PropFirm first'));
    console.log();
    await prompts.waitForEnter();
    return;
  }

  console.log();
  console.log(chalk.yellow.bold('  Copy Trading Setup'));
  console.log();

  // Fetch all accounts
  const spinner = ora({ text: 'Fetching accounts...', color: 'yellow' }).start();
  const allAccounts = await fetchAllAccounts(allConns);

  if (allAccounts.length < 2) {
    spinner.fail('Need at least 2 active accounts');
    await prompts.waitForEnter();
    return;
  }

  spinner.succeed(`Found ${allAccounts.length} active accounts`);

  // Step 1: Select Lead Account
  console.log(chalk.cyan('  Step 1: Select LEAD Account'));
  const leadIdx = await selectAccount('Lead Account:', allAccounts, -1);
  if (leadIdx === null || leadIdx === -1) return;
  const lead = allAccounts[leadIdx];

  // Step 2: Select Follower Account
  console.log();
  console.log(chalk.cyan('  Step 2: Select FOLLOWER Account'));
  const followerIdx = await selectAccount('Follower Account:', allAccounts, leadIdx);
  if (followerIdx === null || followerIdx === -1) return;
  const follower = allAccounts[followerIdx];

  // Step 3: Select Symbol
  console.log();
  console.log(chalk.cyan('  Step 3: Select Trading Symbol'));
  const symbol = await selectSymbol(lead.service);
  if (!symbol) return;

  // Step 4: Select Strategy
  console.log();
  console.log(chalk.cyan('  Step 4: Select Trading Strategy'));
  const strategyId = await selectStrategy();
  if (!strategyId) return;

  // Step 5: Configure Parameters
  console.log();
  console.log(chalk.cyan('  Step 5: Configure Parameters'));

  const leadContracts = await prompts.numberInput('Lead contracts:', 1, 1, 10);
  if (leadContracts === null) return;

  const followerContracts = await prompts.numberInput('Follower contracts:', leadContracts, 1, 10);
  if (followerContracts === null) return;

  const dailyTarget = await prompts.numberInput('Daily target ($):', 400, 1, 10000);
  if (dailyTarget === null) return;

  const maxRisk = await prompts.numberInput('Max risk ($):', 200, 1, 5000);
  if (maxRisk === null) return;

  // Step 6: Privacy
  const showNames = await prompts.selectOption('Account names:', [
    { label: 'Hide account names', value: false },
    { label: 'Show account names', value: true },
  ]);
  if (showNames === null) return;

  // Confirm
  const strategyInfo = getStrategy(strategyId);
  console.log();
  console.log(chalk.white('  Summary:'));
  console.log(chalk.cyan(`  Strategy: ${strategyInfo.name}`));
  console.log(chalk.cyan(`  Symbol: ${symbol.name}`));
  console.log(chalk.cyan(`  Lead: ${lead.propfirm} x${leadContracts}`));
  console.log(chalk.cyan(`  Follower: ${follower.propfirm} x${followerContracts}`));
  console.log(chalk.cyan(`  Target: $${dailyTarget} | Risk: $${maxRisk}`));
  console.log();

  const confirm = await prompts.confirmPrompt('Start Copy Trading?', true);
  if (!confirm) return;

  // Launch
  await launchCopyTrading({
    lead: { ...lead, symbol, contracts: leadContracts },
    follower: { ...follower, symbol, contracts: followerContracts },
    strategyId,
    dailyTarget,
    maxRisk,
    showNames,
  });
};

/**
 * Fetch all active accounts from connections
 * @param {Array} allConns - All connections
 * @returns {Promise<Array>}
 */
const fetchAllAccounts = async (allConns) => {
  const allAccounts = [];

  for (const conn of allConns) {
    try {
      const result = await conn.service.getTradingAccounts();
      if (result.success && result.accounts) {
        const active = result.accounts.filter(a => a.status === 0);
        for (const acc of active) {
          allAccounts.push({
            account: acc,
            service: conn.service,
            propfirm: conn.propfirm,
            type: conn.type,
          });
        }
      }
    } catch (err) {
      log.warn('Failed to get accounts', { type: conn.type, error: err.message });
    }
  }

  return allAccounts;
};

/**
 * Select account from list
 * @param {string} message - Prompt message
 * @param {Array} accounts - Available accounts
 * @param {number} excludeIdx - Index to exclude
 * @returns {Promise<number|null>}
 */
const selectAccount = async (message, accounts, excludeIdx) => {
  const options = accounts
    .map((a, i) => ({ a, i }))
    .filter(x => x.i !== excludeIdx)
    .map(x => {
      const acc = x.a.account;
      const balance = acc.balance !== null ? ` ($${acc.balance.toLocaleString()})` : '';
      return {
        label: `${x.a.propfirm} - ${acc.accountName || acc.rithmicAccountId || acc.name || acc.accountId}${balance}`,
        value: x.i,
      };
    });

  options.push({ label: '< Cancel', value: -1 });
  return prompts.selectOption(message, options);
};

/**
 * Select trading symbol
 * @param {Object} service - Service instance
 * @returns {Promise<Object|null>}
 */
const selectSymbol = async (service) => {
  const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();

  try {
    // Try Rithmic API first for consistency
    let contracts = await getContractsFromAPI();

    // Fallback to service
    if (!contracts && typeof service.getContracts === 'function') {
      const result = await service.getContracts();
      if (result.success && result.contracts?.length > 0) {
        contracts = result.contracts;
      }
    }

    if (!contracts || !contracts.length) {
      spinner.fail('No contracts available');
      await prompts.waitForEnter();
      return null;
    }

    spinner.succeed(`Found ${contracts.length} contracts`);

    // Build options from RAW API data - no static mapping
    const options = [];
    let currentGroup = null;

    for (const c of contracts) {
      // Use RAW API field: contractGroup
      if (c.contractGroup && c.contractGroup !== currentGroup) {
        currentGroup = c.contractGroup;
        options.push({
          label: chalk.cyan.bold(`-- ${currentGroup} --`),
          value: null,
          disabled: true,
        });
      }

      // Use RAW API fields: symbol (trading symbol), name (product name), exchange
      const label = `  ${c.symbol} - ${c.name} (${c.exchange})`;
      options.push({ label, value: c });
    }

    options.push({ label: '', value: null, disabled: true });
    options.push({ label: chalk.gray('< Cancel'), value: null });

    return prompts.selectOption('Trading Symbol:', options);
  } catch (err) {
    spinner.fail(`Error loading contracts: ${err.message}`);
    await prompts.waitForEnter();
    return null;
  }
};

/**
 * Get contracts from Rithmic API - RAW data only
 * @returns {Promise<Array|null>}
 */
const getContractsFromAPI = async () => {
  const allConns = connections.getAll();
  const rithmicConn = allConns.find(c => c.type === 'rithmic');

  if (rithmicConn && typeof rithmicConn.service.getContracts === 'function') {
    const result = await rithmicConn.service.getContracts();
    if (result.success && result.contracts?.length > 0) {
      // Return RAW API data - no mapping
      return result.contracts;
    }
  }

  return null;
};

/**
 * Launch Copy Trading session with strategy
 * @param {Object} config - Session configuration
 */
const launchCopyTrading = async (config) => {
  const { lead, follower, strategyId, dailyTarget, maxRisk, showNames } = config;

  // Load strategy dynamically
  const strategyInfo = getStrategy(strategyId);
  const strategyModule = loadStrategy(strategyId);

  // Account names (masked for privacy)
  const leadName = showNames ? lead.account.accountId : 'HQX Lead *****';
  const followerName = showNames ? follower.account.accountId : 'HQX Follower *****';
  
  const tickSize = lead.symbol.tickSize || 0.25;
  const contractId = lead.symbol.id;

  const ui = new AlgoUI({ subtitle: `${strategyInfo.name} - Copy Trading`, mode: 'copy-trading' });

  const stats = {
    leadName,
    followerName,
    leadSymbol: lead.symbol.name,
    followerSymbol: follower.symbol.name,
    leadQty: lead.contracts,
    followerQty: follower.contracts,
    target: dailyTarget,
    risk: maxRisk,
    pnl: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    latency: 0,
    connected: false,
    platform: lead.account.platform || 'Rithmic',
    startTime: Date.now(),
  };

  let running = true;
  let stopReason = null;
  let currentPosition = 0;
  let pendingOrder = false;
  let tickCount = 0;
  
  // Initialize Strategy dynamically
  const strategy = new strategyModule.M1({ tickSize });
  strategy.initialize(contractId, tickSize);
  
  // Initialize Market Data Feed
  const marketFeed = new MarketDataFeed({ propfirm: lead.propfirm });
  
  // Measure API latency (CLI <-> API)
  const measureLatency = async () => {
    try {
      const start = Date.now();
      await lead.service.getPositions(lead.account.accountId);
      stats.latency = Date.now() - start;
    } catch (e) {
      stats.latency = 0;
    }
  };

  // Log startup
  ui.addLog('info', `Strategy: ${strategyInfo.name}`);
  ui.addLog('info', `Lead: ${stats.leadName} -> Follower: ${stats.followerName}`);
  ui.addLog('info', `Symbol: ${stats.leadSymbol} | Target: $${dailyTarget} | Risk: $${maxRisk}`);
  ui.addLog('info', `Params: ${strategyInfo.params.stopTicks}t stop, ${strategyInfo.params.targetTicks}t target (${strategyInfo.params.riskReward})`);
  ui.addLog('info', 'Connecting to market data...');
  
  // Handle strategy signals - execute on BOTH accounts
  strategy.on('signal', async (signal) => {
    if (!running || pendingOrder || currentPosition !== 0) return;
    
    const { side, direction, entry, stopLoss, takeProfit, confidence } = signal;
    
    ui.addLog('signal', `${direction.toUpperCase()} signal @ ${entry.toFixed(2)} (${(confidence * 100).toFixed(0)}%)`);
    
    pendingOrder = true;
    try {
      const orderSide = direction === 'long' ? 0 : 1;
      
      // Place on LEAD account
      const leadResult = await lead.service.placeOrder({
        accountId: lead.account.accountId,
        contractId: contractId,
        type: 2,
        side: orderSide,
        size: lead.contracts
      });
      
      if (leadResult.success) {
        ui.addLog('trade', `LEAD: ${direction.toUpperCase()} ${lead.contracts}x`);
        
        // Place on FOLLOWER account
        const followerResult = await follower.service.placeOrder({
          accountId: follower.account.accountId,
          contractId: contractId,
          type: 2,
          side: orderSide,
          size: follower.contracts
        });
        
        if (followerResult.success) {
          ui.addLog('trade', `FOLLOWER: ${direction.toUpperCase()} ${follower.contracts}x`);
          currentPosition = direction === 'long' ? lead.contracts : -lead.contracts;
          stats.trades++;
          
          // Place bracket orders on both accounts
          if (stopLoss && takeProfit) {
            const exitSide = direction === 'long' ? 1 : 0;
            
            // Lead SL/TP
            await lead.service.placeOrder({
              accountId: lead.account.accountId, contractId, type: 4, side: exitSide, size: lead.contracts, stopPrice: stopLoss
            });
            await lead.service.placeOrder({
              accountId: lead.account.accountId, contractId, type: 1, side: exitSide, size: lead.contracts, limitPrice: takeProfit
            });
            
            // Follower SL/TP
            await follower.service.placeOrder({
              accountId: follower.account.accountId, contractId, type: 4, side: exitSide, size: follower.contracts, stopPrice: stopLoss
            });
            await follower.service.placeOrder({
              accountId: follower.account.accountId, contractId, type: 1, side: exitSide, size: follower.contracts, limitPrice: takeProfit
            });
            
            ui.addLog('info', `SL: ${stopLoss.toFixed(2)} | TP: ${takeProfit.toFixed(2)}`);
          }
        } else {
          ui.addLog('error', `Follower order failed: ${followerResult.error}`);
        }
      } else {
        ui.addLog('error', `Lead order failed: ${leadResult.error}`);
      }
    } catch (e) {
      ui.addLog('error', `Order error: ${e.message}`);
    }
    pendingOrder = false;
  });
  
  // Handle market data ticks
  marketFeed.on('tick', (tick) => {
    tickCount++;
    const latencyStart = Date.now();
    
    strategy.processTick({
      contractId: tick.contractId || contractId,
      price: tick.price,
      bid: tick.bid,
      ask: tick.ask,
      volume: tick.volume || 1,
      side: tick.lastTradeSide || 'unknown',
      timestamp: tick.timestamp || Date.now()
    });
    
    stats.latency = Date.now() - latencyStart;
    
    if (tickCount % 100 === 0) {
      ui.addLog('info', `Tick #${tickCount} @ ${tick.price?.toFixed(2) || 'N/A'}`);
    }
  });
  
  marketFeed.on('connected', () => {
    stats.connected = true;
    ui.addLog('success', 'Market data connected!');
  });
  
  marketFeed.on('error', (err) => {
    ui.addLog('error', `Market: ${err.message}`);
  });
  
  marketFeed.on('disconnected', () => {
    stats.connected = false;
    ui.addLog('error', 'Market data disconnected');
  });
  
  // Connect to market data
  try {
    const token = lead.service.token || lead.service.getToken?.();
    const propfirmKey = (lead.propfirm || 'topstep').toLowerCase().replace(/\s+/g, '_');
    await marketFeed.connect(token, propfirmKey, contractId);
    await marketFeed.subscribe(lead.symbol.name, contractId);
  } catch (e) {
    ui.addLog('error', `Failed to connect: ${e.message}`);
  }
  
  // Poll combined P&L from both accounts
  const pollPnL = async () => {
    try {
      let combinedPnL = 0;
      
      // Lead P&L
      const leadResult = await lead.service.getPositions(lead.account.accountId);
      if (leadResult.success && leadResult.positions) {
        const pos = leadResult.positions.find(p => {
          const sym = p.contractId || p.symbol || '';
          return sym.includes(lead.symbol.name) || sym.includes(contractId);
        });
        if (pos) combinedPnL += pos.profitAndLoss || 0;
      }
      
      // Follower P&L
      const followerResult = await follower.service.getPositions(follower.account.accountId);
      if (followerResult.success && followerResult.positions) {
        const pos = followerResult.positions.find(p => {
          const sym = p.contractId || p.symbol || '';
          return sym.includes(follower.symbol.name) || sym.includes(contractId);
        });
        if (pos) combinedPnL += pos.profitAndLoss || 0;
      }
      
      // Update stats
      if (combinedPnL !== stats.pnl) {
        const diff = combinedPnL - stats.pnl;
        if (Math.abs(diff) > 0.01 && stats.pnl !== 0) {
          if (diff >= 0) stats.wins++;
          else stats.losses++;
        }
        stats.pnl = combinedPnL;
        
        if (stats.pnl !== 0) {
          strategy.recordTradeResult(stats.pnl);
        }
      }
      
      // Check target/risk limits
      if (stats.pnl >= dailyTarget) {
        stopReason = 'target';
        running = false;
        ui.addLog('success', `TARGET REACHED! +$${stats.pnl.toFixed(2)}`);
      } else if (stats.pnl <= -maxRisk) {
        stopReason = 'risk';
        running = false;
        ui.addLog('error', `MAX RISK HIT! -$${Math.abs(stats.pnl).toFixed(2)}`);
      }
    } catch (e) {
      // Silent fail - will retry
    }
  };

  // UI refresh loop
  const refreshInterval = setInterval(() => {
    if (running) ui.render(stats);
  }, 250);
  
  // Measure API latency every 5 seconds
  measureLatency();
  const latencyInterval = setInterval(() => { if (running) measureLatency(); }, 5000);
  
  // Poll P&L every 2 seconds
  pollPnL();
  const pnlInterval = setInterval(() => { if (running) pollPnL(); }, 2000);

  // Keyboard handling
  const cleanupKeys = setupKeyboardHandler(() => {
    running = false;
    stopReason = 'manual';
  });

  // Wait for stop
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (!running) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });

  // Cleanup
  clearInterval(refreshInterval);
  clearInterval(latencyInterval);
  clearInterval(pnlInterval);
  await marketFeed.disconnect();
  if (cleanupKeys) cleanupKeys();
  ui.cleanup();
  
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  process.stdin.resume();

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

  // Show summary
  renderSessionSummary(stats, stopReason);
  await prompts.waitForEnter();
};

/**
 * Setup keyboard handler
 * @param {Function} onStop - Stop callback
 * @returns {Function|null} Cleanup function
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
