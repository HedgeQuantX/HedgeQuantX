/**
 * Multi-Symbol Executor - Trade up to 5 symbols in parallel
 * Single TICKER_PLANT connection, multiple strategy instances
 */
const readline = require('readline');
const { AlgoUI } = require('./ui');
const { loadStrategy } = require('../../lib/m');
const { MarketDataFeed } = require('../../lib/data');
const smartLogs = require('../../lib/smart-logs');
const { sessionLogger } = require('../../services/session-logger');

/**
 * Execute algo strategy on multiple symbols
 * @param {Object} params - Execution parameters
 * @param {Object} params.service - Rithmic trading service
 * @param {Object} params.account - Account object
 * @param {Array} params.contracts - Array of contract objects (max 5)
 * @param {Object} params.config - Algo config (contracts, target, risk, showName)
 * @param {Object} params.strategy - Strategy info object with id, name
 * @param {Object} params.options - Optional: supervisionConfig, startSpinner
 */
const executeMultiSymbol = async ({ service, account, contracts, config, strategy: strategyInfo, options = {} }) => {
  const { contractsPerSymbol, dailyTarget, maxRisk, showName } = config;
  const { startSpinner } = options;
  
  const strategyId = strategyInfo?.id || 'hqx-2b';
  const strategyName = strategyInfo?.name || 'HQX-2B';
  const strategyModule = loadStrategy(strategyId);
  const StrategyClass = strategyModule.M1;
  
  const accountName = showName 
    ? (account.accountName || account.rithmicAccountId || account.accountId) 
    : 'HQX *****';
  
  // Create strategy instance and stats for each symbol
  const symbolData = new Map();
  
  for (const contract of contracts) {
    const symbolCode = contract.symbol || contract.baseSymbol || contract.id;
    const tickSize = contract.tickSize || 0.25;
    
    const strategy = new StrategyClass({ tickSize });
    strategy.initialize(symbolCode, tickSize);
    
    symbolData.set(symbolCode, {
      contract,
      strategy,
      tickSize,
      symbolCode,
      symbolName: contract.name || contract.baseSymbol || symbolCode,
      stats: {
        pnl: 0,
        trades: 0,
        wins: 0,
        losses: 0,
        tickCount: 0,
        lastPrice: null,
        position: 0
      },
      pendingOrder: false,
      startingPnL: null
    });
    
    // Forward signals
    strategy.on('signal', async (signal) => {
      await handleSignal(symbolCode, signal);
    });
    
    strategy.on('log', (log) => {
      const prefix = `[${symbolCode}] `;
      ui.addLog(log.type === 'debug' ? 'debug' : 'analysis', prefix + log.message);
    });
  }
  
  // Aggregated stats
  const globalStats = {
    accountName,
    symbols: contracts.map(c => c.baseSymbol || c.symbol).join(', '),
    symbolCount: contracts.length,
    qty: contractsPerSymbol,
    target: dailyTarget,
    risk: maxRisk,
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
  
  // UI setup
  const ui = new AlgoUI({ 
    subtitle: `${strategyName} - ${contracts.length} Symbols`, 
    mode: 'multi-symbol' 
  });
  
  smartLogs.setStrategy(strategyId);
  
  // Start session logger
  const logFile = sessionLogger.start({
    strategy: strategyId,
    account: accountName,
    symbol: globalStats.symbols,
    contracts: contractsPerSymbol,
    target: dailyTarget,
    risk: maxRisk,
    multiSymbol: true,
    symbolCount: contracts.length
  });
  
  sessionLogger.log('CONFIG', `Multi-symbol mode: ${contracts.length} symbols`);
  for (const contract of contracts) {
    sessionLogger.log('CONFIG', `Symbol: ${contract.symbol} exchange=${contract.exchange} tickSize=${contract.tickSize}`);
  }
  
  if (startSpinner) startSpinner.succeed('Multi-symbol algo initialized');
  
  ui.addLog('system', `Strategy: ${strategyName} | Symbols: ${contracts.length}`);
  ui.addLog('system', `Account: ${accountName}`);
  for (const contract of contracts) {
    ui.addLog('system', `  ${contract.symbol} - ${contract.name || contract.baseSymbol}`);
  }
  ui.addLog('risk', `Target: $${dailyTarget} | Risk: $${maxRisk} | Qty: ${contractsPerSymbol}/symbol`);
  ui.addLog('system', 'Connecting to market data...');
  
  // Signal handler
  const handleSignal = async (symbolCode, signal) => {
    const data = symbolData.get(symbolCode);
    if (!data) return;
    
    const dir = signal.direction?.toUpperCase() || 'UNKNOWN';
    ui.addLog('signal', `[${symbolCode}] ${dir} @ ${signal.entry?.toFixed(2)} | Conf: ${((signal.confidence || 0) * 100).toFixed(0)}%`);
    sessionLogger.signal(dir, signal.entry, signal.confidence, `[${symbolCode}]`);
    
    if (!running || data.pendingOrder || data.stats.position !== 0) {
      ui.addLog('risk', `[${symbolCode}] Signal blocked - ${!running ? 'stopped' : data.pendingOrder ? 'order pending' : 'position open'}`);
      return;
    }
    
    // Place order
    data.pendingOrder = true;
    try {
      const orderSide = signal.direction === 'long' ? 0 : 1;
      const orderResult = await service.placeOrder({
        accountId: account.rithmicAccountId || account.accountId,
        symbol: symbolCode,
        exchange: data.contract.exchange || 'CME',
        type: 2,
        side: orderSide,
        size: contractsPerSymbol
      });
      
      if (orderResult.success) {
        data.stats.position = signal.direction === 'long' ? contractsPerSymbol : -contractsPerSymbol;
        data.stats.trades++;
        globalStats.trades++;
        
        ui.addLog('fill_' + (signal.direction === 'long' ? 'buy' : 'sell'), 
          `[${symbolCode}] ${dir} ${contractsPerSymbol}x @ ${signal.entry?.toFixed(2)}`);
        sessionLogger.trade('ENTRY', dir, signal.entry, contractsPerSymbol, `[${symbolCode}]`);
        
        // Bracket orders
        if (signal.stopLoss && signal.takeProfit) {
          await service.placeOrder({
            accountId: account.rithmicAccountId || account.accountId,
            symbol: symbolCode, exchange: data.contract.exchange || 'CME',
            type: 4, side: signal.direction === 'long' ? 1 : 0,
            size: contractsPerSymbol, price: signal.stopLoss
          });
          await service.placeOrder({
            accountId: account.rithmicAccountId || account.accountId,
            symbol: symbolCode, exchange: data.contract.exchange || 'CME',
            type: 1, side: signal.direction === 'long' ? 1 : 0,
            size: contractsPerSymbol, price: signal.takeProfit
          });
          ui.addLog('trade', `[${symbolCode}] SL: ${signal.stopLoss.toFixed(2)} | TP: ${signal.takeProfit.toFixed(2)}`);
        }
      } else {
        ui.addLog('error', `[${symbolCode}] Order failed: ${orderResult.error}`);
        sessionLogger.error(`[${symbolCode}] Order failed`, orderResult.error);
      }
    } catch (e) {
      ui.addLog('error', `[${symbolCode}] Order error: ${e.message}`);
    }
    data.pendingOrder = false;
  };
  
  // Market data feed (single connection for all symbols)
  const marketFeed = new MarketDataFeed();
  
  let lastLogSecond = 0;
  
  marketFeed.on('tick', (tick) => {
    const symbolCode = tick.symbol || tick.contractId;
    const data = symbolData.get(symbolCode);
    if (!data) return;
    
    data.stats.tickCount++;
    const price = Number(tick.price) || Number(tick.tradePrice) || null;
    const volume = Number(tick.volume) || Number(tick.size) || 1;
    
    if (data.stats.tickCount === 1) {
      ui.addLog('connected', `[${symbolCode}] First tick @ ${price?.toFixed(2) || 'N/A'}`);
    }
    
    data.stats.lastPrice = price;
    
    // Process tick through strategy
    if (price && price > 0) {
      data.strategy.processTick({
        contractId: symbolCode,
        price,
        bid: Number(tick.bid) || null,
        ask: Number(tick.ask) || null,
        volume,
        side: tick.side || 'unknown',
        timestamp: tick.timestamp || Date.now()
      });
    }
    
    // Latency
    if (tick.ssboe && tick.usecs !== undefined) {
      const tickTimeMs = (tick.ssboe * 1000) + Math.floor(tick.usecs / 1000);
      const latency = Date.now() - tickTimeMs;
      if (latency >= 0 && latency < 5000) globalStats.latency = latency;
    }
  });
  
  // Log aggregated stats periodically
  const logInterval = setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    if (now - lastLogSecond >= 60) {
      lastLogSecond = now;
      let totalTicks = 0;
      let totalBars = 0;
      for (const [sym, data] of symbolData) {
        totalTicks += data.stats.tickCount;
        const state = data.strategy.getAnalysisState?.(sym, data.stats.lastPrice);
        totalBars += state?.barsProcessed || 0;
      }
      ui.addLog('debug', `Total: ${totalTicks} ticks | ${totalBars} bars | ${contracts.length} symbols`);
      
      // Log per-symbol state
      for (const [sym, data] of symbolData) {
        const state = data.strategy.getAnalysisState?.(sym, data.stats.lastPrice);
        if (state?.ready) {
          ui.addLog('analysis', `[${sym}] Zones: ${state.activeZones} | Swings: ${state.swingsDetected}`);
        }
      }
    }
  }, 5000);
  
  marketFeed.on('connected', () => { globalStats.connected = true; ui.addLog('connected', 'Market data connected'); });
  marketFeed.on('error', (err) => ui.addLog('error', `Market: ${err.message}`));
  marketFeed.on('disconnected', () => { globalStats.connected = false; ui.addLog('error', 'Market disconnected'); });
  
  // Connect and subscribe to all symbols
  try {
    const rithmicCredentials = service.getRithmicCredentials?.();
    if (!rithmicCredentials) throw new Error('Rithmic credentials not available');
    
    if (service.disconnectTicker) await service.disconnectTicker();
    await marketFeed.connect(rithmicCredentials);
    
    for (const contract of contracts) {
      const symbolCode = contract.symbol || contract.baseSymbol;
      await marketFeed.subscribe(symbolCode, contract.exchange || 'CME');
      ui.addLog('system', `Subscribed: ${symbolCode}`);
    }
  } catch (e) {
    ui.addLog('error', `Failed to connect: ${e.message}`);
  }
  
  // P&L polling
  const pollPnL = async () => {
    try {
      const accountResult = await service.getTradingAccounts();
      if (accountResult.success && accountResult.accounts) {
        const acc = accountResult.accounts.find(a => a.accountId === account.accountId);
        if (acc && acc.profitAndLoss !== undefined) {
          // For multi-symbol, we track total P&L
          globalStats.pnl = acc.profitAndLoss;
        }
      }
      
      // Check positions per symbol
      const posResult = await service.getPositions(account.accountId);
      if (posResult.success && posResult.positions) {
        for (const [sym, data] of symbolData) {
          const pos = posResult.positions.find(p => (p.contractId || p.symbol || '').includes(sym));
          data.stats.position = pos?.quantity || 0;
        }
      }
      
      // Risk checks
      if (globalStats.pnl >= dailyTarget) {
        stopReason = 'target'; running = false;
        ui.addLog('fill_win', `TARGET REACHED! +$${globalStats.pnl.toFixed(2)}`);
      } else if (globalStats.pnl <= -maxRisk) {
        stopReason = 'risk'; running = false;
        ui.addLog('fill_loss', `MAX RISK! -$${Math.abs(globalStats.pnl).toFixed(2)}`);
      }
    } catch (e) { /* silent */ }
  };
  
  const refreshInterval = setInterval(() => { if (running) ui.render(globalStats); }, 100);
  const pnlInterval = setInterval(() => { if (running) pollPnL(); }, 2000);
  pollPnL();
  
  // Key handler
  const setupKeyHandler = () => {
    if (!process.stdin.isTTY) return null;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onKey = (str, key) => {
      const keyName = key?.name?.toLowerCase();
      if (keyName === 'x' || (key?.ctrl && keyName === 'c')) {
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
    const check = setInterval(() => { if (!running) { clearInterval(check); resolve(); } }, 100);
  });
  
  // Cleanup
  clearInterval(refreshInterval);
  clearInterval(pnlInterval);
  clearInterval(logInterval);
  await marketFeed.disconnect();
  if (cleanupKeys) cleanupKeys();
  ui.cleanup();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.resume();
  
  // Summary
  const durationMs = Date.now() - globalStats.startTime;
  const h = Math.floor(durationMs / 3600000);
  const m = Math.floor((durationMs % 3600000) / 60000);
  const s = Math.floor((durationMs % 60000) / 1000);
  globalStats.duration = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  
  sessionLogger.end(globalStats, stopReason?.toUpperCase() || 'MANUAL');
  
  console.log('\n');
  console.log('  Multi-Symbol Session Summary');
  console.log('  ────────────────────────────');
  console.log(`  Symbols: ${globalStats.symbols}`);
  console.log(`  Duration: ${globalStats.duration}`);
  console.log(`  Trades: ${globalStats.trades} | P&L: $${globalStats.pnl.toFixed(2)}`);
  console.log(`  Stop: ${stopReason || 'manual'}`);
  console.log();
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => {
    rl.question('  Press Enter to return to menu...', () => { rl.close(); resolve(); });
  });
};

module.exports = { executeMultiSymbol };
