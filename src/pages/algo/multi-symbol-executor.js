/**
 * Multi-Symbol Executor - Trade up to 5 symbols in parallel
 * Single TICKER_PLANT connection, multiple strategy instances
 */
const readline = require('readline');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { loadStrategy } = require('../../lib/m');
const { MarketDataFeed } = require('../../lib/data');
const smartLogs = require('../../lib/smart-logs');
const { createEngine: createLogsEngine } = require('../../lib/smart-logs-engine');
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
        position: 0,
        buyVolume: 0,
        sellVolume: 0,
        runningDelta: 0,
        runningBuyPct: 50
      },
      pendingOrder: false,
      startingPnL: null
    });
    
    // Forward signals
    strategy.on('signal', async (signal) => {
      await handleSignal(symbolCode, signal);
    });
    
    // Filter logs - only show important events (swings, zones, signals)
    strategy.on('log', (log) => {
      const msg = log.message || '';
      // Skip bar close logs (too noisy with 5 symbols)
      if (msg.includes('[BAR]')) return;
      // Skip routine pivot checks
      if (msg.includes('Checking pivot')) return;
      // Show swing and zone events
      const prefix = `[${symbolCode}] `;
      ui.addLog(log.type === 'debug' ? 'debug' : 'analysis', prefix + msg);
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
  const logsEngine = createLogsEngine(strategyId);
  
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
      sessionLogger.log('TICK', `[${symbolCode}] #1 price=${price} symbol=${symbolCode}`);
    }
    
    data.stats.lastPrice = price;
    
    // Track buy/sell volume for delta calculation
    if (tick.side === 'buy' || tick.aggressor === 1) {
      data.stats.buyVolume += volume;
    } else if (tick.side === 'sell' || tick.aggressor === 2) {
      data.stats.sellVolume += volume;
    } else if (price && data.stats.lastPrice) {
      if (price > data.stats.lastPrice) data.stats.buyVolume += volume;
      else if (price < data.stats.lastPrice) data.stats.sellVolume += volume;
    }
    
    // Update running delta/buyPct every 1000 ticks
    if (data.stats.tickCount % 1000 === 0) {
      const totalVol = data.stats.buyVolume + data.stats.sellVolume;
      if (totalVol > 0) {
        data.stats.runningDelta = data.stats.buyVolume - data.stats.sellVolume;
        data.stats.runningBuyPct = (data.stats.buyVolume / totalVol) * 100;
      }
      data.stats.buyVolume = 0;
      data.stats.sellVolume = 0;
    }
    
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
  
  // Log aggregated stats periodically (every 30s to session, every 3min to UI)
  const logInterval = setInterval(() => {
    const now = Math.floor(Date.now() / 1000);
    let totalTicks = 0, totalBars = 0, totalZones = 0, totalSwings = 0;
    for (const [sym, data] of symbolData) {
      totalTicks += data.stats.tickCount;
      const state = data.strategy.getAnalysisState?.(sym, data.stats.lastPrice);
      totalBars += state?.barsProcessed || 0;
      totalZones += state?.activeZones || 0;
      totalSwings += state?.swingsDetected || 0;
    }
    // Session log every 30s
    if (now - lastLogSecond >= 30) {
      sessionLogger.log('TICK', `count=${totalTicks} bars=${totalBars} zones=${totalZones} swings=${totalSwings}`);
      if (now - lastLogSecond >= 180) {
        ui.addLog('analysis', `Stats: ${totalTicks} ticks | ${totalBars} bars | ${totalZones} zones | ${totalSwings} swings`);
      }
      lastLogSecond = now;
    }
  }, 10000);
  
  marketFeed.on('connected', () => { globalStats.connected = true; ui.addLog('connected', 'Market data connected'); });
  marketFeed.on('error', (err) => ui.addLog('error', `Market: ${err.message}`));
  marketFeed.on('disconnected', () => { globalStats.connected = false; ui.addLog('error', 'Market disconnected'); });
  
  // Connect and subscribe to all symbols
  try {
    // Try sync first (RithmicService), then async (RithmicBrokerClient)
    let rithmicCredentials = service.getRithmicCredentials?.();
    if (!rithmicCredentials && service.getRithmicCredentialsAsync) {
      try {
        rithmicCredentials = await service.getRithmicCredentialsAsync();
      } catch (credErr) {
        throw new Error(`Broker error: ${credErr.message} - try "hqx login"`);
      }
    }
    if (!rithmicCredentials) throw new Error('Rithmic credentials not available - try "hqx login"');
    
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
  
  // P&L polling - uses CACHED data (NO API CALLS)
  let startingPnL = null;
  const pollPnL = async () => {
    try {
      const accId = account.rithmicAccountId || account.accountId;
      
      // Get P&L from cache (sync for RithmicService, async for BrokerClient)
      let pnlData = null;
      if (service.getAccountPnL) {
        const result = service.getAccountPnL(accId);
        pnlData = result && result.then ? await result : result; // Handle both sync/async
      }
      
      if (pnlData && pnlData.pnl !== null && pnlData.pnl !== undefined && !isNaN(pnlData.pnl)) {
        if (startingPnL === null) startingPnL = pnlData.pnl;
        const newPnl = pnlData.pnl - startingPnL;
        if (!isNaN(newPnl)) globalStats.pnl = newPnl;
      }
      
      // Check positions (less frequent - every 10s)
      if (Date.now() % 10000 < 2000) {
        const posResult = await service.getPositions(accId);
        if (posResult.success && posResult.positions) {
          for (const [sym, data] of symbolData) {
            const pos = posResult.positions.find(p => (p.contractId || p.symbol || '').includes(sym));
            data.stats.position = pos?.quantity || 0;
          }
        }
      }
      
      // Risk checks (only if pnl is valid)
      if (!isNaN(globalStats.pnl)) {
        if (globalStats.pnl >= dailyTarget) {
          stopReason = 'target'; running = false;
          ui.addLog('fill_win', `TARGET REACHED! +$${globalStats.pnl.toFixed(2)}`);
        } else if (globalStats.pnl <= -maxRisk) {
          stopReason = 'risk'; running = false;
          ui.addLog('fill_loss', `MAX RISK! -$${Math.abs(globalStats.pnl).toFixed(2)}`);
        }
      }
    } catch (e) { /* silent */ }
  };
  
  const refreshInterval = setInterval(() => { if (running) ui.render(globalStats); }, 100);
  const pnlInterval = setInterval(() => { if (running) pollPnL(); }, 2000);
  pollPnL();
  
  // Live analysis logs every 5 seconds (rotates through symbols with data)
  let liveLogSymbolIndex = 0;
  let lastLiveLogTime = 0;
  const liveLogInterval = setInterval(() => {
    if (!running) return;
    const now = Date.now();
    if (now - lastLiveLogTime < 5000) return; // Every 5 seconds
    lastLiveLogTime = now;
    
    // Get symbols with tick data (skip symbols without data)
    const symbolCodes = Array.from(symbolData.keys());
    if (symbolCodes.length === 0) return;
    
    // Find next symbol with data
    let attempts = 0;
    let symbolCode, data;
    do {
      symbolCode = symbolCodes[liveLogSymbolIndex % symbolCodes.length];
      liveLogSymbolIndex++;
      data = symbolData.get(symbolCode);
      attempts++;
    } while ((!data || data.stats.tickCount === 0) && attempts < symbolCodes.length);
    
    if (!data) return;
    
    const state = data.strategy.getAnalysisState?.(symbolCode, data.stats.lastPrice);
    const buyPct = data.stats.runningBuyPct || 50;
    const logState = {
      bars: state?.barsProcessed || 0,
      swings: state?.swingsDetected || 0,
      zones: state?.activeZones || 0,
      trend: buyPct > 55 ? 'bullish' : buyPct < 45 ? 'bearish' : 'neutral',
      nearZone: (state?.nearestSupport || state?.nearestResistance) ? true : false,
      setupForming: state?.ready && state?.activeZones > 0,
      position: data.stats.position || 0,
      price: data.stats.lastPrice || 0,
      delta: data.stats.runningDelta || 0,
      buyPct: buyPct,
      tickCount: data.stats.tickCount || 0,
      // QUANT metrics - REAL values from strategy
      zScore: state?.zScore || 0,
      vpin: state?.vpin || 0,
      ofi: state?.ofi || 0,
    };
    
    // Only log if we have meaningful data
    if (logState.price > 0 || logState.tickCount > 0) {
      logsEngine.setSymbol(symbolCode);
      const log = logsEngine.getLog(logState);
      ui.addLog(log.type, log.message);
      if (log.logToSession) sessionLogger.log('ANALYSIS', `[${symbolCode}] ${log.message}`);
    }
  }, 1000);
  
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
  clearInterval(liveLogInterval);
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
  
  const sessionLogPath = sessionLogger.end(globalStats, stopReason?.toUpperCase() || 'MANUAL');
  
  renderSessionSummary(globalStats, stopReason);
  if (sessionLogPath) {
    console.log(`\n  Session log: ${sessionLogPath}`);
  }
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => {
    rl.question('\n  Press Enter to return to menu...', () => { rl.close(); resolve(); });
  });
};

module.exports = { executeMultiSymbol };
