/**
 * One Account Mode - HQX Ultra Scalping
 */

const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');

const { connections } = require('../../services');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { prompts } = require('../../utils');
const { checkMarketHours } = require('../../services/rithmic/market');

// Strategy & Market Data
const { M1 } = require('../../lib/m/s1');
const { MarketDataFeed } = require('../../lib/data');



/**
 * One Account Menu
 */
const oneAccountMenu = async (service) => {
  // Check if market is open (skip early close check - market may still be open)
  const market = checkMarketHours();
  if (!market.isOpen && !market.message.includes('early')) {
    console.log();
    console.log(chalk.red(`  ${market.message}`));
    console.log(chalk.gray('  Algo trading is only available when market is open'));
    console.log();
    await prompts.waitForEnter();
    return;
  }
  
  const spinner = ora({ text: 'Fetching active accounts...', color: 'yellow' }).start();
  
  const allAccounts = await connections.getAllAccounts();
  
  if (!allAccounts?.length) {
    spinner.fail('No accounts found');
    await prompts.waitForEnter();
    return;
  }
  
  const activeAccounts = allAccounts.filter(acc => acc.status === 0);
  
  if (!activeAccounts.length) {
    spinner.fail('No active accounts');
    await prompts.waitForEnter();
    return;
  }
  
  spinner.succeed(`Found ${activeAccounts.length} active account(s)`);
  
  // Select account - display RAW API fields
  const options = activeAccounts.map(acc => {
    // Use what API returns: rithmicAccountId or accountName for Rithmic
    const name = acc.accountName || acc.rithmicAccountId || acc.accountId;
    const balance = acc.balance !== null && acc.balance !== undefined 
      ? ` - $${acc.balance.toLocaleString()}` 
      : '';
    return {
      label: `${name} (${acc.propfirm || acc.platform || 'Unknown'})${balance}`,
      value: acc
    };
  });
  options.push({ label: '< Back', value: 'back' });
  
  const selectedAccount = await prompts.selectOption('Select Account:', options);
  if (!selectedAccount || selectedAccount === 'back') return;
  
  // Use the service attached to the account (from getAllAccounts), fallback to getServiceForAccount
  const accountService = selectedAccount.service || connections.getServiceForAccount(selectedAccount.accountId) || service;
  
  // Select symbol
  const contract = await selectSymbol(accountService, selectedAccount);
  if (!contract) return;
  
  // Configure algo
  const config = await configureAlgo(selectedAccount, contract);
  if (!config) return;
  
  await launchAlgo(accountService, selectedAccount, contract, config);
};

/**
 * Symbol selection - sorted with popular indices first
 */
const selectSymbol = async (service, account) => {
  const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();
  
  const contractsResult = await service.getContracts();
  if (!contractsResult.success || !contractsResult.contracts?.length) {
    spinner.fail('Failed to load contracts');
    return null;
  }
  
  let contracts = contractsResult.contracts;
  
  // Sort: Popular indices first (ES, NQ, MES, MNQ, RTY, YM, etc.)
  const popularPrefixes = ['ES', 'NQ', 'MES', 'MNQ', 'M2K', 'RTY', 'YM', 'MYM', 'NKD', 'GC', 'SI', 'CL'];
  
  contracts.sort((a, b) => {
    const nameA = a.name || '';
    const nameB = b.name || '';
    
    // Check if names start with popular prefixes
    const idxA = popularPrefixes.findIndex(p => nameA.startsWith(p));
    const idxB = popularPrefixes.findIndex(p => nameB.startsWith(p));
    
    // Both are popular - sort by popularity order
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    // Only A is popular - A first
    if (idxA !== -1) return -1;
    // Only B is popular - B first
    if (idxB !== -1) return 1;
    // Neither - alphabetical
    return nameA.localeCompare(nameB);
  });
  
  spinner.succeed(`Found ${contracts.length} contracts`);
  
  // Display sorted contracts from API
  const options = contracts.map(c => ({
    label: `${c.name} - ${c.description}`,
    value: c
  }));
  
  options.push({ label: chalk.gray('< Back'), value: 'back' });
  
  const contract = await prompts.selectOption(chalk.yellow('Select Symbol:'), options);
  return contract === 'back' || contract === null ? null : contract;
};

/**
 * Configure algo
 */
const configureAlgo = async (account, contract) => {
  console.log();
  console.log(chalk.cyan('  Configure Algo Parameters'));
  console.log();
  
  const contracts = await prompts.numberInput('Number of contracts:', 1, 1, 10);
  if (contracts === null) return null;
  
  const dailyTarget = await prompts.numberInput('Daily target ($):', 200, 1, 10000);
  if (dailyTarget === null) return null;
  
  const maxRisk = await prompts.numberInput('Max risk ($):', 100, 1, 5000);
  if (maxRisk === null) return null;
  
  const showName = await prompts.confirmPrompt('Show account name?', false);
  if (showName === null) return null;
  
  const confirm = await prompts.confirmPrompt('Start algo trading?', true);
  if (!confirm) return null;
  
  return { contracts, dailyTarget, maxRisk, showName };
};

/**
 * Launch algo trading - HQX Ultra Scalping Strategy
 * Real-time market data + Strategy signals + Auto order execution
 */
const launchAlgo = async (service, account, contract, config) => {
  const { contracts, dailyTarget, maxRisk, showName } = config;
  
  // Use RAW API fields
  const accountName = showName 
    ? (account.accountName || account.rithmicAccountId || account.accountId) 
    : 'HQX *****';
  const symbolName = contract.name;
  const contractId = contract.id;
  const connectionType = account.platform || 'Rithmic';
  const tickSize = contract.tickSize || 0.25;
  
  const ui = new AlgoUI({ subtitle: 'HQX Ultra Scalping', mode: 'one-account' });
  
  const stats = {
    accountName,
    symbol: symbolName,
    qty: contracts,
    target: dailyTarget,
    risk: maxRisk,
    propfirm: account.propfirm || 'Unknown',
    platform: connectionType,
    pnl: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    latency: 0,
    connected: false,
    startTime: Date.now()
  };
  
  let running = true;
  let stopReason = null;
  let startingPnL = null;
  let currentPosition = 0; // Current position qty (+ long, - short)
  let pendingOrder = false; // Prevent duplicate orders
  let tickCount = 0;
  
  // Initialize Strategy
  const strategy = new M1({ tickSize });
  strategy.initialize(contractId, tickSize);
  
  // Initialize Market Data Feed
  const marketFeed = new MarketDataFeed({ propfirm: account.propfirm });
  
  // Log startup
  ui.addLog('info', `Connection: ${connectionType}`);
  ui.addLog('info', `Account: ${accountName}`);
  ui.addLog('info', `Symbol: ${symbolName} | Qty: ${contracts}`);
  ui.addLog('info', `Target: $${dailyTarget} | Max Risk: $${maxRisk}`);
  ui.addLog('info', 'Connecting to market data...');
  
  // Handle strategy signals
  strategy.on('signal', async (signal) => {
    if (!running || pendingOrder || currentPosition !== 0) return;
    
    const { side, direction, entry, stopLoss, takeProfit, confidence } = signal;
    
    ui.addLog('signal', `${direction.toUpperCase()} signal @ ${entry.toFixed(2)} (${(confidence * 100).toFixed(0)}%)`);
    
    // Place order via API
    pendingOrder = true;
    try {
      const orderSide = direction === 'long' ? 0 : 1; // 0=Buy, 1=Sell
      const orderResult = await service.placeOrder({
        accountId: account.accountId,
        contractId: contractId,
        type: 2, // Market order
        side: orderSide,
        size: contracts
      });
      
      if (orderResult.success) {
        currentPosition = direction === 'long' ? contracts : -contracts;
        stats.trades++;
        ui.addLog('trade', `OPENED ${direction.toUpperCase()} ${contracts}x @ market`);
        
        // Place bracket orders (SL/TP)
        if (stopLoss && takeProfit) {
          // Stop Loss
          await service.placeOrder({
            accountId: account.accountId,
            contractId: contractId,
            type: 4, // Stop order
            side: direction === 'long' ? 1 : 0, // Opposite side
            size: contracts,
            stopPrice: stopLoss
          });
          
          // Take Profit
          await service.placeOrder({
            accountId: account.accountId,
            contractId: contractId,
            type: 1, // Limit order
            side: direction === 'long' ? 1 : 0,
            size: contracts,
            limitPrice: takeProfit
          });
          
          ui.addLog('info', `SL: ${stopLoss.toFixed(2)} | TP: ${takeProfit.toFixed(2)}`);
        }
      } else {
        ui.addLog('error', `Order failed: ${orderResult.error}`);
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
    
    // Feed tick to strategy
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
    
    // Log every 100th tick to show activity
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
    const token = service.token || service.getToken?.();
    const propfirmKey = (account.propfirm || 'topstep').toLowerCase().replace(/\s+/g, '_');
    await marketFeed.connect(token, propfirmKey, contractId);
    await marketFeed.subscribe(symbolName, contractId);
  } catch (e) {
    ui.addLog('error', `Failed to connect: ${e.message}`);
  }
  
  // Poll account P&L from API
  const pollPnL = async () => {
    try {
      const accountResult = await service.getTradingAccounts();
      if (accountResult.success && accountResult.accounts) {
        const acc = accountResult.accounts.find(a => a.accountId === account.accountId);
        if (acc && acc.profitAndLoss !== undefined) {
          if (startingPnL === null) startingPnL = acc.profitAndLoss;
          stats.pnl = acc.profitAndLoss - startingPnL;
          
          // Record trade result in strategy
          if (stats.pnl !== 0) {
            strategy.recordTradeResult(stats.pnl);
          }
        }
      }
      
      // Check positions
      const posResult = await service.getPositions(account.accountId);
      if (posResult.success && posResult.positions) {
        const pos = posResult.positions.find(p => {
          const sym = p.contractId || p.symbol || '';
          return sym.includes(contract.name) || sym.includes(contractId);
        });
        
        if (pos && pos.quantity !== 0) {
          currentPosition = pos.quantity;
          const side = pos.quantity > 0 ? 'LONG' : 'SHORT';
          const pnl = pos.profitAndLoss || 0;
          
          // Check if position closed (win/loss)
          if (pnl > 0) stats.wins = Math.max(stats.wins, 1);
          else if (pnl < 0) stats.losses = Math.max(stats.losses, 1);
        } else {
          currentPosition = 0;
        }
      }
      
      // Check target/risk
      if (stats.pnl >= dailyTarget) {
        stopReason = 'target';
        running = false;
        ui.addLog('success', `TARGET REACHED! +$${stats.pnl.toFixed(2)}`);
      } else if (stats.pnl <= -maxRisk) {
        stopReason = 'risk';
        running = false;
        ui.addLog('error', `MAX RISK! -$${Math.abs(stats.pnl).toFixed(2)}`);
      }
    } catch (e) {
      // Silently handle polling errors
    }
  };
  
  // Start polling and UI refresh
  const refreshInterval = setInterval(() => { if (running) ui.render(stats); }, 250);
  const pnlInterval = setInterval(() => { if (running) pollPnL(); }, 2000);
  pollPnL(); // Initial poll
  
  // Keyboard handler
  const setupKeyHandler = () => {
    if (!process.stdin.isTTY) return;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    const onKey = (str, key) => {
      if (key && (key.name === 'x' || key.name === 'X' || (key.ctrl && key.name === 'c'))) {
        running = false;
        stopReason = 'manual';
      }
    };
    process.stdin.on('keypress', onKey);
    return () => {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    };
  };
  
  const cleanupKeys = setupKeyHandler();
  
  // Wait for stop
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (!running) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });
  
  // Cleanup
  clearInterval(refreshInterval);
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
  
  // Summary
  renderSessionSummary(stats, stopReason);
  
  console.log('\n  Returning to menu in 3 seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));
};

module.exports = { oneAccountMenu };
