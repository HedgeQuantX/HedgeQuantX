/**
 * One Account Mode - HQX Ultra Scalping
 */

const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');

const { connections } = require('../../services');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { prompts } = require('../../utils');
const { checkMarketHours } = require('../../services/projectx/market');

// Strategy & Market Data (obfuscated)
const { M1 } = require('../../../dist/lib/m/s1');
const { MarketDataFeed } = require('../../../dist/lib/data');
const { algoLogger } = require('./logger');



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
    // Use what API returns: accountName for ProjectX, rithmicAccountId for Rithmic
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
  
  const dailyTarget = await prompts.numberInput('Daily target ($):', 1000, 1, 10000);
  if (dailyTarget === null) return null;

  const maxRisk = await prompts.numberInput('Max risk ($):', 500, 1, 5000);
  if (maxRisk === null) return null;
  
  const showName = await prompts.confirmPrompt('Show account name?', false);
  if (showName === null) return null;
  
  const confirm = await prompts.confirmPrompt('Start algo trading?', true);
  if (!confirm) return null;
  
  // Show spinner while initializing
  const initSpinner = ora({ text: 'Initializing algo trading...', color: 'yellow' }).start();
  await new Promise(r => setTimeout(r, 500));
  initSpinner.succeed('Launching algo...');
  
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
  const connectionType = account.platform || 'ProjectX';
  const tickSize = contract.tickSize || 0.25;
  const tickValue = contract.tickValue || 5.0;
  
  const ui = new AlgoUI({ subtitle: 'HQX ULTRA SCALPING', mode: 'one-account' });
  
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
  let lastTradeCount = 0; // Track number of trades from API
  let lastPositionQty = 0; // Track position changes
  
  // Initialize Strategy (M1 is singleton instance)
  const strategy = M1;
  strategy.initialize(contractId, tickSize, tickValue);
  
  // Initialize Market Data Feed
  const marketFeed = new MarketDataFeed({ propfirm: account.propfirm });
  
  // Smart startup logs (same as HQX-TG)
  const market = checkMarketHours();
  const sessionName = market.session || 'AMERICAN';
  const etTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
  
  algoLogger.connectingToEngine(ui, account.accountId);
  algoLogger.engineStarting(ui, connectionType, dailyTarget, maxRisk);
  algoLogger.marketOpen(ui, sessionName.toUpperCase(), etTime);
  
  // Handle strategy signals
  strategy.on('signal', async (signal) => {
    if (!running || pendingOrder || currentPosition !== 0) return;
    
    const { side, direction, entry, stopLoss, takeProfit, confidence } = signal;
    
    // Calculate position size with kelly
    const kelly = Math.min(0.25, confidence);
    const riskAmount = Math.round(maxRisk * kelly);
    const riskPct = Math.round((riskAmount / maxRisk) * 100);
    
    algoLogger.positionSized(ui, contracts, kelly, riskAmount, riskPct);
    
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
        const sideStr = direction === 'long' ? 'BUY' : 'SELL';
        const positionSide = direction === 'long' ? 'LONG' : 'SHORT';
        
        algoLogger.orderSubmitted(ui, symbolName, sideStr, contracts, entry);
        algoLogger.orderFilled(ui, symbolName, sideStr, contracts, entry);
        algoLogger.positionOpened(ui, symbolName, positionSide, contracts, entry);
        algoLogger.entryConfirmed(ui, sideStr, contracts, symbolName, entry);
        
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
          
          algoLogger.stopsSet(ui, stopLoss, takeProfit);
        }
      } else {
        algoLogger.orderRejected(ui, symbolName, orderResult.error || 'Unknown error');
      }
    } catch (e) {
      algoLogger.error(ui, 'ORDER ERROR', e.message);
    }
    pendingOrder = false;
  });
  
  // Handle market data ticks
  let lastHeartbeat = Date.now();
  let tps = 0;
  
  marketFeed.on('tick', (tick) => {
    tickCount++;
    tps++;
    const latencyStart = Date.now();
    
    // Debug: log first tick to see structure
    if (tickCount === 1) {
      algoLogger.info(ui, 'FIRST TICK', `price=${tick.price} bid=${tick.bid} ask=${tick.ask} vol=${tick.volume}`);
    }
    
    // Feed tick to strategy
    const tickData = {
      contractId: tick.contractId || contractId,
      price: tick.price || tick.lastPrice || tick.bid,
      bid: tick.bid,
      ask: tick.ask,
      volume: tick.volume || tick.size || 1,
      side: tick.lastTradeSide || tick.side || 'unknown',
      timestamp: tick.timestamp || Date.now()
    };
    
    strategy.processTick(tickData);
    
    stats.latency = Date.now() - latencyStart;
    
    // Heartbeat every 30 seconds (smart log instead of tick count)
    if (Date.now() - lastHeartbeat > 30000) {
      algoLogger.heartbeat(ui, tps, stats.latency);
      lastHeartbeat = Date.now();
      tps = 0;
    }
  });
  
  marketFeed.on('connected', () => {
    stats.connected = true;
    algoLogger.dataConnected(ui, 'RTC');
    algoLogger.algoOperational(ui, connectionType);
  });
  
  marketFeed.on('error', (err) => {
    algoLogger.error(ui, 'MARKET ERROR', err.message);
  });
  
  marketFeed.on('disconnected', (err) => {
    stats.connected = false;
    algoLogger.dataDisconnected(ui, 'WEBSOCKET', err?.message);
  });
  
  // Connect to market data
  try {
    const propfirmKey = (account.propfirm || 'topstep').toLowerCase().replace(/\s+/g, '_');
    
    // CRITICAL: Get a fresh token for WebSocket connection
    // TopStep invalidates WebSocket sessions for old tokens
    algoLogger.info(ui, 'REFRESHING AUTH TOKEN...');
    const token = await service.getFreshToken?.() || service.token || service.getToken?.();
    
    if (!token) {
      algoLogger.error(ui, 'NO AUTH TOKEN', 'Please reconnect');
    } else {
      algoLogger.info(ui, 'TOKEN OK', `${token.length} chars`);
      algoLogger.info(ui, 'CONNECTING', `${propfirmKey.toUpperCase()} | ${contractId}`);
      
      await marketFeed.connect(token, propfirmKey);
      
      // Wait for connection to stabilize
      await new Promise(r => setTimeout(r, 2000));
      
      if (marketFeed.isConnected()) {
        await marketFeed.subscribe(symbolName, contractId);
        algoLogger.info(ui, 'SUBSCRIBED', `${symbolName} real-time feed active`);
      } else {
        algoLogger.error(ui, 'CONNECTION LOST', 'Before subscribe');
      }
    }
  } catch (e) {
    algoLogger.error(ui, 'CONNECTION ERROR', e.message.substring(0, 50));
  }
  
  // Poll account P&L and sync with real trades from API
  const pollPnL = async () => {
    try {
      // Get account P&L
      const accountResult = await service.getTradingAccounts();
      if (accountResult.success && accountResult.accounts) {
        const acc = accountResult.accounts.find(a => a.accountId === account.accountId);
        if (acc && acc.profitAndLoss !== undefined) {
          if (startingPnL === null) startingPnL = acc.profitAndLoss;
          stats.pnl = acc.profitAndLoss - startingPnL;
        }
      }
      
      // Check positions - detect when position closes
      const posResult = await service.getPositions(account.accountId);
      if (posResult.success && posResult.positions) {
        const pos = posResult.positions.find(p => {
          const sym = p.contractId || p.symbol || '';
          return sym.includes(contract.name) || sym.includes(contractId);
        });
        
        const newPositionQty = pos?.quantity || 0;
        
        // Position just closed - cancel remaining orders and log result
        if (lastPositionQty !== 0 && newPositionQty === 0) {
          // Cancel all open orders to prevent new positions
          try {
            await service.cancelAllOrders(account.accountId);
            algoLogger.info(ui, 'ORDERS CANCELLED', 'Position closed - brackets removed');
          } catch (e) {
            // Silent fail
          }
          
          // Get real trade data from API
          try {
            const tradesResult = await service.getTrades(account.accountId);
            if (tradesResult.success && tradesResult.trades?.length > 0) {
              // Count completed trades (those with profitAndLoss not null)
              const completedTrades = tradesResult.trades.filter(t => t.profitAndLoss !== null);
              
              // Update stats from real trades
              let wins = 0, losses = 0;
              for (const trade of completedTrades) {
                if (trade.profitAndLoss > 0) wins++;
                else if (trade.profitAndLoss < 0) losses++;
              }
              stats.trades = completedTrades.length;
              stats.wins = wins;
              stats.losses = losses;
              
              // Log the trade that just closed
              const lastTrade = completedTrades[completedTrades.length - 1];
              if (lastTrade) {
                const pnl = lastTrade.profitAndLoss || 0;
                const side = lastTrade.side === 0 ? 'LONG' : 'SHORT';
                const exitPrice = lastTrade.price || 0;
                
                if (pnl >= 0) {
                  algoLogger.targetHit(ui, symbolName, exitPrice, pnl);
                } else {
                  algoLogger.stopHit(ui, symbolName, exitPrice, Math.abs(pnl));
                }
                algoLogger.positionClosed(ui, symbolName, side, contracts, exitPrice, pnl);
                
                // Record in strategy for adaptation
                strategy.recordTradeResult(pnl);
              }
            }
          } catch (e) {
            // Silent fail - trades API might not be available
          }
        }
        
        lastPositionQty = newPositionQty;
        currentPosition = newPositionQty;
      }
      
      // Check target/risk
      if (stats.pnl >= dailyTarget) {
        stopReason = 'target';
        running = false;
        algoLogger.info(ui, 'DAILY TARGET REACHED', `+$${stats.pnl.toFixed(2)}`);
      } else if (stats.pnl <= -maxRisk) {
        stopReason = 'risk';
        running = false;
        algoLogger.dailyLimitWarning(ui, stats.pnl, -maxRisk);
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
  
  // Cleanup with timeout protection
  clearInterval(refreshInterval);
  clearInterval(pnlInterval);
  
  // Disconnect market feed with timeout
  try {
    await Promise.race([
      marketFeed.disconnect(),
      new Promise(r => setTimeout(r, 3000))
    ]);
  } catch {}
  
  // Cleanup keyboard handler
  try { if (cleanupKeys) cleanupKeys(); } catch {}
  
  // Cleanup UI
  try { ui.cleanup(); } catch {}
  
  // Reset stdin
  try {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.resume();
  } catch {}
  
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
