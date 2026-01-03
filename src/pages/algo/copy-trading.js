/**
 * @fileoverview Copy Trading Mode
 * @module pages/algo/copy-trading
 */

const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');

const { connections } = require('../../services');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { logger, prompts } = require('../../utils');
const { checkMarketHours } = require('../../services/projectx/market');
const { algoLogger } = require('./logger');

const log = logger.scope('CopyTrading');

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
  const spinner = ora({ text: 'FETCHING ACCOUNTS...', color: 'yellow' }).start();
  const allAccounts = await fetchAllAccounts(allConns);

  if (allAccounts.length < 2) {
    spinner.fail('NEED AT LEAST 2 ACTIVE ACCOUNTS');
    await prompts.waitForEnter();
    return;
  }

  spinner.succeed(`Found ${allAccounts.length} active accounts`);

  // Step 1: Select Lead Account
  console.log(chalk.cyan('  Step 1: Select LEAD Account'));
  const leadIdx = await selectAccount('LEAD ACCOUNT:', allAccounts, -1);
  if (leadIdx === null || leadIdx === -1) return;
  const lead = allAccounts[leadIdx];

  // Step 2: Select Follower Account
  console.log();
  console.log(chalk.cyan('  Step 2: Select FOLLOWER Account'));
  const followerIdx = await selectAccount('FOLLOWER ACCOUNT:', allAccounts, leadIdx);
  if (followerIdx === null || followerIdx === -1) return;
  const follower = allAccounts[followerIdx];

  // Step 3: Select Symbol
  console.log();
  console.log(chalk.cyan('  Step 3: Select Trading Symbol'));
  const symbol = await selectSymbol(lead.service);
  if (!symbol) return;

  // Step 4: Configure Parameters
  console.log();
  console.log(chalk.cyan('  Step 4: Configure Parameters'));

  const leadContracts = await prompts.numberInput('LEAD CONTRACTS:', 1, 1, 10);
  if (leadContracts === null) return;

  const followerContracts = await prompts.numberInput('FOLLOWER CONTRACTS:', leadContracts, 1, 10);
  if (followerContracts === null) return;

  const dailyTarget = await prompts.numberInput('Daily target ($):', 400, 1, 10000);
  if (dailyTarget === null) return;

  const maxRisk = await prompts.numberInput('Max risk ($):', 200, 1, 5000);
  if (maxRisk === null) return;

  // Step 5: Privacy
  const showNames = await prompts.selectOption('ACCOUNT NAMES:', [
    { label: 'HIDE ACCOUNT NAMES', value: false },
    { label: 'SHOW ACCOUNT NAMES', value: true },
  ]);
  if (showNames === null) return;

  // Confirm
  console.log();
  console.log(chalk.white('  Summary:'));
  console.log(chalk.cyan(`  Symbol: ${symbol.name}`));
  console.log(chalk.cyan(`  Lead: ${lead.propfirm} x${leadContracts}`));
  console.log(chalk.cyan(`  Follower: ${follower.propfirm} x${followerContracts}`));
  console.log(chalk.cyan(`  Target: $${dailyTarget} | Risk: $${maxRisk}`));
  console.log();

  const confirm = await prompts.confirmPrompt('START COPY TRADING?', true);
  if (!confirm) return;

  // Launch
  await launchCopyTrading({
    lead: { ...lead, symbol, contracts: leadContracts },
    follower: { ...follower, symbol, contracts: followerContracts },
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

  options.push({ label: '< CANCEL', value: -1 });
  return prompts.selectOption(message, options);
};

/**
 * Select trading symbol
 * @param {Object} service - Service instance
 * @returns {Promise<Object|null>}
 */
const selectSymbol = async (service) => {
  const spinner = ora({ text: 'LOADING SYMBOLS...', color: 'yellow' }).start();

  try {
    // Try ProjectX API first for consistency
    let contracts = await getContractsFromAPI();

    // Fallback to service
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

    // Build options from RAW API data - no static mapping
    const options = [];
    let currentGroup = null;

    for (const c of contracts) {
      // Use RAW API field: contractGroup
      if (c.contractGroup && c.contractGroup !== currentGroup) {
        currentGroup = c.contractGroup;
        options.push({
          label: chalk.cyan.bold(`── ${currentGroup} ──`),
          value: null,
          disabled: true,
        });
      }

      // Use RAW API fields: name (symbol), description (full name), exchange
      const label = `  ${c.name} - ${c.description} (${c.exchange})`;
      options.push({ label, value: c });
    }

    options.push({ label: '', value: null, disabled: true });
    options.push({ label: chalk.gray('< CANCEL'), value: null });

    return prompts.selectOption('TRADING SYMBOL:', options);
  } catch (err) {
    spinner.fail(`Error loading contracts: ${err.message}`);
    await prompts.waitForEnter();
    return null;
  }
};

/**
 * Get contracts from ProjectX API - RAW data only
 * @returns {Promise<Array|null>}
 */
const getContractsFromAPI = async () => {
  const allConns = connections.getAll();
  const projectxConn = allConns.find(c => c.type === 'projectx');

  if (projectxConn && typeof projectxConn.service.getContracts === 'function') {
    const result = await projectxConn.service.getContracts();
    if (result.success && result.contracts?.length > 0) {
      // Return RAW API data - no mapping
      return result.contracts;
    }
  }

  return null;
};

/**
 * Launch Copy Trading session
 * @param {Object} config - Session configuration
 */
const launchCopyTrading = async (config) => {
  const { lead, follower, dailyTarget, maxRisk, showNames } = config;

  // Account names (masked for privacy)
  const leadName = showNames ? lead.account.accountId : 'HQX Lead *****';
  const followerName = showNames ? follower.account.accountId : 'HQX Follower *****';

  const ui = new AlgoUI({ subtitle: 'HQX Copy Trading', mode: 'copy-trading' });

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
    platform: lead.account.platform || 'ProjectX',
  };

  let running = true;
  let stopReason = null;
  
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

  // Smart startup logs (same as HQX-TG)
  const market = checkMarketHours();
  const sessionName = market.session || 'AMERICAN';
  const etTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
  
  algoLogger.connectingToEngine(ui, lead.account.accountId);
  algoLogger.engineStarting(ui, stats.platform, dailyTarget, maxRisk);
  algoLogger.marketOpen(ui, sessionName.toUpperCase(), etTime);
  algoLogger.info(ui, 'COPY MODE', `Lead: ${lead.propfirm} -> Follower: ${follower.propfirm}`);
  algoLogger.dataConnected(ui, 'API');
  algoLogger.algoOperational(ui, stats.platform);
  stats.connected = true;
  
  // Track lead positions and copy to follower
  let lastLeadPositions = [];
  
  const pollAndCopy = async () => {
    try {
      // Get lead positions
      const leadResult = await lead.service.getPositions(lead.account.accountId);
      if (!leadResult.success) return;
      
      const currentPositions = leadResult.positions || [];
      
      // Detect new positions on lead
      for (const pos of currentPositions) {
        const existing = lastLeadPositions.find(p => p.contractId === pos.contractId);
        if (!existing && pos.quantity !== 0) {
          // New position opened - copy to follower
          const side = pos.quantity > 0 ? 'LONG' : 'SHORT';
          const orderSide = pos.quantity > 0 ? 0 : 1; // 0=Buy, 1=Sell
          const symbol = pos.symbol || pos.contractId;
          const size = Math.abs(pos.quantity);
          const entry = pos.averagePrice || 0;
          
          algoLogger.positionOpened(ui, symbol, side, size, entry);
          algoLogger.info(ui, 'COPYING TO FOLLOWER', `${side} ${size}x ${symbol}`);
          
          // Place order on follower account
          try {
            const orderResult = await follower.service.placeOrder({
              accountId: follower.account.accountId,
              contractId: pos.contractId,
              type: 2, // Market order
              side: orderSide,
              size: follower.contracts
            });
            
            if (orderResult.success) {
              algoLogger.orderFilled(ui, symbol, side, follower.contracts, entry);
              algoLogger.info(ui, 'FOLLOWER ORDER', `${side} ${follower.contracts}x filled`);
            } else {
              algoLogger.orderRejected(ui, symbol, orderResult.error || 'Order failed');
            }
          } catch (err) {
            algoLogger.error(ui, 'FOLLOWER ORDER FAILED', err.message);
          }
        }
      }
      
      // Detect closed positions
      for (const oldPos of lastLeadPositions) {
        const stillOpen = currentPositions.find(p => p.contractId === oldPos.contractId);
        if (!stillOpen || stillOpen.quantity === 0) {
          const side = oldPos.quantity > 0 ? 'LONG' : 'SHORT';
          const closeSide = oldPos.quantity > 0 ? 1 : 0; // Opposite side to close
          const symbol = oldPos.symbol || oldPos.contractId;
          const size = Math.abs(oldPos.quantity);
          const exit = stillOpen?.averagePrice || oldPos.averagePrice || 0;
          const pnl = oldPos.profitAndLoss || 0;
          
          algoLogger.positionClosed(ui, symbol, side, size, exit, pnl);
          algoLogger.info(ui, 'CLOSING ON FOLLOWER', symbol);
          
          // Close position on follower account
          try {
            // First try closePosition API
            const closeResult = await follower.service.closePosition(
              follower.account.accountId,
              oldPos.contractId
            );
            
            if (closeResult.success) {
              algoLogger.info(ui, 'FOLLOWER CLOSED', `${symbol} position closed`);
            } else {
              // Fallback: place market order to close
              const orderResult = await follower.service.placeOrder({
                accountId: follower.account.accountId,
                contractId: oldPos.contractId,
                type: 2, // Market order
                side: closeSide,
                size: follower.contracts
              });
              
              if (orderResult.success) {
                algoLogger.info(ui, 'FOLLOWER CLOSED', `${symbol} via market order`);
              } else {
                algoLogger.error(ui, 'FOLLOWER CLOSE FAILED', orderResult.error || 'Close failed');
              }
            }
          } catch (err) {
            algoLogger.error(ui, 'FOLLOWER CLOSE ERROR', err.message);
          }
        }
      }
      
      lastLeadPositions = currentPositions;
      
      // Update P&L from lead
      const leadPnL = currentPositions.reduce((sum, p) => sum + (p.profitAndLoss || 0), 0);
      if (leadPnL !== stats.pnl) {
        const diff = leadPnL - stats.pnl;
        if (Math.abs(diff) > 0.01 && stats.pnl !== 0) {
          stats.trades++;
          if (diff >= 0) stats.wins++;
          else stats.losses++;
        }
        stats.pnl = leadPnL;
      }
      
      // Check target/risk limits
      if (stats.pnl >= dailyTarget) {
        stopReason = 'target';
        running = false;
        algoLogger.targetHit(ui, lead.symbol.name, 0, stats.pnl);
        algoLogger.info(ui, 'DAILY TARGET REACHED', `+$${stats.pnl.toFixed(2)} - Stopping algo`);
      } else if (stats.pnl <= -maxRisk) {
        stopReason = 'risk';
        running = false;
        algoLogger.dailyLimitWarning(ui, stats.pnl, -maxRisk);
        algoLogger.error(ui, 'MAX RISK HIT', `-$${Math.abs(stats.pnl).toFixed(2)} - Stopping algo`);
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
  measureLatency(); // Initial measurement
  const latencyInterval = setInterval(() => { if (running) measureLatency(); }, 5000);
  
  // Poll and copy every 2 seconds
  pollAndCopy(); // Initial poll
  const copyInterval = setInterval(() => { if (running) pollAndCopy(); }, 2000);

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
  clearInterval(copyInterval);
  if (cleanupKeys) cleanupKeys();
  ui.cleanup();

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
