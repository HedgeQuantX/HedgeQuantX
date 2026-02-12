/**
 * Algo Executor - Execution engine for algo modes with AI supervision
 */
const readline = require('readline');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { loadStrategy } = require('../../lib/m');
const { MarketDataFeed } = require('../../lib/data');
const { SupervisionEngine } = require('../../services/ai-supervision');
const smartLogs = require('../../lib/smart-logs');
const { createEngine: createLogsEngine } = require('../../lib/smart-logs-engine');
const { sessionLogger } = require('../../services/session-logger');

/**
 * Execute algo strategy with market data
 * @param {Object} params - Execution parameters
 * @param {Object} params.service - Rithmic trading service
 * @param {Object} params.account - Account object
 * @param {Object} params.contract - Contract object
 * @param {Object} params.config - Algo config (contracts, target, risk, showName)
 * @param {Object} params.strategy - Strategy info object with id, name
 * @param {Object} params.options - Optional: supervisionConfig for multi-agent AI
 */
const executeAlgo = async ({ service, account, contract, config, strategy: strategyInfo, options = {} }) => {
  const { contracts, dailyTarget, maxRisk, showName } = config;
  const { supervisionConfig, subtitle, startSpinner } = options;
  
  const strategyId = strategyInfo?.id || 'ultra-scalping';
  const strategyName = strategyInfo?.name || 'HQX Scalping';
  const strategyModule = loadStrategy(strategyId);
  const StrategyClass = strategyModule.M1; // loadStrategy normalizes to M1
  
  const supervisionEnabled = supervisionConfig?.supervisionEnabled && supervisionConfig?.agents?.length > 0;
  const supervisionEngine = supervisionEnabled ? new SupervisionEngine(supervisionConfig) : null;
  
  const accountName = showName 
    ? (account.accountName || account.rithmicAccountId || account.accountId) 
    : 'HQX *****';
  const symbolName = contract.name || contract.baseSymbol || 'Unknown';
  const symbolCode = contract.symbol || contract.baseSymbol || contract.id;  // Rithmic symbol for subscription
  const contractId = contract.symbol || contract.baseSymbol || contract.id;  // For strategy tracking
  const tickSize = contract.tickSize || 0.25;
  
  const ui = new AlgoUI({ 
    subtitle: subtitle || (supervisionEnabled ? `${strategyName} + AI` : strategyName), 
    mode: 'one-account' 
  });
  
  const stats = {
    accountName, symbol: symbolName, qty: contracts, target: dailyTarget, risk: maxRisk,
    propfirm: account.propfirm || account.platform || 'Rithmic', platform: account.platform || 'Rithmic',
    pnl: 0, trades: 0, wins: 0, losses: 0, latency: 0, connected: false, startTime: Date.now()
  };
  
  let running = true, stopReason = null, startingPnL = null;
  let currentPosition = 0, pendingOrder = false, tickCount = 0, lastBias = 'FLAT';
  
  const aiContext = { recentTicks: [], recentSignals: [], recentTrades: [], maxTicks: 100 };
  
  const strategy = new StrategyClass({ tickSize });
  strategy.initialize(contractId, tickSize);
  
  // Set strategy for context-aware smart logs
  smartLogs.setStrategy(strategyId);
  const logsEngine = createLogsEngine(strategyId, symbolCode);
  
  // Start session logger for persistent logs
  const logFile = sessionLogger.start({
    strategy: strategyId,
    account: accountName,
    symbol: symbolName,
    contracts,
    target: dailyTarget,
    risk: maxRisk
  });
  
  // Log detailed contract info for debugging
  sessionLogger.log('CONFIG', `symbolCode=${symbolCode} contractId=${contractId} exchange=${contract.exchange} tickSize=${tickSize}`);
  sessionLogger.log('CONFIG', `account=${account.accountId} rithmicId=${account.rithmicAccountId || 'N/A'}`);
  
  strategy.on('log', (log) => {
    const type = log.type === 'debug' ? 'debug' : log.type === 'info' ? 'analysis' : 'system';
    ui.addLog(type, log.message);
    sessionLogger.log(type.toUpperCase(), log.message);
  });
  
  const marketFeed = new MarketDataFeed();
  
  // Stop the initialization spinner before UI takes over
  if (startSpinner) startSpinner.succeed('Algo initialized');
  
  ui.addLog('system', `Strategy: ${strategyName}${supervisionEnabled ? ' + AI' : ''}`);
  ui.addLog('system', `Account: ${accountName}`);
  ui.addLog('system', `Symbol: ${symbolName} | Qty: ${contracts}`);
  ui.addLog('risk', `Target: $${dailyTarget} | Risk: $${maxRisk}`);
  if (supervisionEnabled) {
    const agentCount = supervisionEngine.getActiveCount();
    ui.addLog('analysis', `AI Agents: ${agentCount} active`);
  }
  ui.addLog('system', 'Connecting to market data...');
  
  strategy.on('signal', async (signal) => {
    const dir = signal.direction?.toUpperCase() || 'UNKNOWN';
    const signalLog = smartLogs.getSignalLog(dir, symbolCode, (signal.confidence || 0) * 100, strategyName);
    ui.addLog('signal', `${signalLog.message}`);
    ui.addLog('signal', signalLog.details);
    sessionLogger.signal(dir, signal.entry, signal.confidence, signalLog.details);
    
    if (!running) {
      const riskLog = smartLogs.getRiskCheckLog(false, 'Algo stopped');
      ui.addLog('risk', riskLog.message);
      return;
    }
    if (pendingOrder) {
      const riskLog = smartLogs.getRiskCheckLog(false, 'Order pending');
      ui.addLog('risk', riskLog.message);
      return;
    }
    if (currentPosition !== 0) {
      const riskLog = smartLogs.getRiskCheckLog(false, `Position open (${currentPosition})`);
      ui.addLog('risk', riskLog.message);
      return;
    }
    
    let { direction, entry, stopLoss, takeProfit, confidence } = signal;
    let orderSize = contracts;
    
    aiContext.recentSignals.push({ ...signal, timestamp: Date.now() });
    if (aiContext.recentSignals.length > 10) aiContext.recentSignals.shift();
    
    const riskLog = smartLogs.getRiskCheckLog(true, `${direction.toUpperCase()} @ ${entry.toFixed(2)}`);
    ui.addLog('risk', `${riskLog.message} - ${riskLog.details}`);
    
    // Multi-Agent AI Supervision
    if (supervisionEnabled && supervisionEngine) {
      ui.addLog('analysis', 'AI analyzing signal...');
      
      const supervisionResult = await supervisionEngine.supervise({
        symbolId: symbolName,
        signal: { direction, entry, stopLoss, takeProfit, confidence, size: contracts },
        recentTicks: aiContext.recentTicks,
        recentSignals: aiContext.recentSignals,
        recentTrades: aiContext.recentTrades,
        stats,
        config: { dailyTarget, maxRisk }
      });
      
      if (!supervisionResult.success) {
        ui.addLog('error', `AI: ${supervisionResult.reason || 'Error'}`);
      } else if (supervisionResult.decision === 'reject') {
        ui.addLog('reject', `AI rejected (${supervisionResult.confidence}%): ${supervisionResult.reason}`);
        return;
      } else {
        // Apply optimizations
        const opt = supervisionResult.optimizedSignal;
        if (opt.aiOptimized) {
          if (opt.entry !== entry) entry = opt.entry;
          if (opt.stopLoss !== stopLoss) stopLoss = opt.stopLoss;
          if (opt.takeProfit !== takeProfit) takeProfit = opt.takeProfit;
          if (opt.size && opt.size !== contracts) orderSize = opt.size;
        }
        const action = supervisionResult.decision === 'modify' ? 'optimized' : 'approved';
        ui.addLog('ready', `AI ${action} (${supervisionResult.confidence}%): ${supervisionResult.reason}`);
        
        // Check timing
        if (opt.aiTiming === 'wait') {
          ui.addLog('analysis', 'AI: Wait for better entry');
          return;
        } else if (opt.aiTiming === 'cancel') {
          ui.addLog('reject', 'AI: Signal cancelled');
          return;
        }
      }
    }
    
    // Place order
    pendingOrder = true;
    try {
      const orderSide = direction === 'long' ? 0 : 1;
      const orderResult = await service.placeOrder({
        accountId: account.rithmicAccountId || account.accountId,
        symbol: symbolCode,
        exchange: contract.exchange || 'CME',
        type: 2,
        side: orderSide,
        size: orderSize
      });
      
      if (orderResult.success) {
        currentPosition = direction === 'long' ? orderSize : -orderSize;
        stats.trades++;
        const entryLog = smartLogs.getEntryLog(direction.toUpperCase(), symbolCode, orderSize, entry);
        ui.addLog('fill_' + (direction === 'long' ? 'buy' : 'sell'), entryLog.message);
        ui.addLog('trade', entryLog.details);
        sessionLogger.trade('ENTRY', direction.toUpperCase(), entry, orderSize, orderResult.orderId);
        
        // Bracket orders
        if (stopLoss && takeProfit) {
          await service.placeOrder({
            accountId: account.rithmicAccountId || account.accountId,
            symbol: symbolCode, exchange: contract.exchange || 'CME',
            type: 4, side: direction === 'long' ? 1 : 0,
            size: orderSize, price: stopLoss
          });
          await service.placeOrder({
            accountId: account.rithmicAccountId || account.accountId,
            symbol: symbolCode, exchange: contract.exchange || 'CME',
            type: 1, side: direction === 'long' ? 1 : 0,
            size: orderSize, price: takeProfit
          });
          ui.addLog('trade', `SL: ${stopLoss.toFixed(2)} | TP: ${takeProfit.toFixed(2)}`);
        }
      } else {
        ui.addLog('error', `Order failed: ${orderResult.error}`);
        sessionLogger.error('Order failed', orderResult.error);
      }
    } catch (e) {
      ui.addLog('error', `Order error: ${e.message}`);
      sessionLogger.error('Order exception', e);
    }
    pendingOrder = false;
  });
  
  let lastPrice = null, lastBid = null, lastAsk = null;
  let ticksPerSecond = 0, lastTickSecond = Math.floor(Date.now() / 1000);
  let lastBiasLogSecond = 0, lastStateLogSecond = 0;
  let buyVolume = 0, sellVolume = 0, lastTickTime = 0, tickLatencies = [];
  let runningDelta = 0, runningBuyPct = 50; // For live logs
  
  marketFeed.on('tick', (tick) => {
    tickCount++;
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000);
    
    // Debug first tick
    if (tickCount === 1) {
      const p = Number(tick.price) || Number(tick.tradePrice) || 'NULL';
      sessionLogger.log('TICK', `#${tickCount} price=${p} symbol=${tick.symbol || tick.contractId || 'N/A'}`);
    }
    
    // Count ticks per second
    if (currentSecond === lastTickSecond) {
      ticksPerSecond++;
    } else {
      ticksPerSecond = 1;
      lastTickSecond = currentSecond;
    }
    
    aiContext.recentTicks.push(tick);
    if (aiContext.recentTicks.length > aiContext.maxTicks) aiContext.recentTicks.shift();
    
    const price = Number(tick.price) || Number(tick.tradePrice) || null;
    const bid = Number(tick.bid) || Number(tick.bidPrice) || null;
    const ask = Number(tick.ask) || Number(tick.askPrice) || null;
    const volume = Number(tick.volume) || Number(tick.size) || 1;
    
    // Track buy/sell volume (ensure numeric addition)
    if (tick.side === 'buy' || tick.aggressor === 1) buyVolume += volume;
    else if (tick.side === 'sell' || tick.aggressor === 2) sellVolume += volume;
    else if (price && lastPrice) {
      if (price > lastPrice) buyVolume += volume;
      else if (price < lastPrice) sellVolume += volume;
    }
    
    // Log first tick
    if (tickCount === 1) {
      ui.addLog('connected', `First tick @ ${price?.toFixed(2) || 'N/A'}`);
    }
    
    // Update bias from volume + log tick stats (every 30s)
    if (currentSecond - lastBiasLogSecond >= 30 && tickCount > 1) {
      lastBiasLogSecond = currentSecond;
      const totalVol = buyVolume + sellVolume;
      const buyPressure = totalVol > 0 ? (buyVolume / totalVol) * 100 : 50;
      lastBias = buyPressure > 55 ? 'LONG' : buyPressure < 45 ? 'SHORT' : 'FLAT';
      runningDelta = buyVolume - sellVolume;
      runningBuyPct = buyPressure;
      sessionLogger.log('TICK', `count=${tickCount} last=${price?.toFixed(2)} bias=${lastBias} vol=${totalVol}`);
      buyVolume = 0; sellVolume = 0;
    }
    
    // Strategy state log for session logger (every 60s)
    if (currentSecond - lastStateLogSecond >= 60 && tickCount > 1) {
      lastStateLogSecond = currentSecond;
      const state = strategy.getAnalysisState?.(contractId, price);
      if (state) {
        sessionLogger.state(state.activeZones || 0, state.swingsDetected || 0, state.barsProcessed || 0, lastBias);
      }
    }
    
    // AI status every 60s
    if (currentSecond % 60 === 0 && supervisionEnabled && supervisionEngine) {
      ui.addLog('analysis', `AI: ${supervisionEngine.getStatus().agents.map(a => a.name.split(' ')[0]).join(', ')}`);
    }
    
    lastPrice = price;
    lastBid = bid;
    lastAsk = ask;
    
    // Only process tick if we have a valid price
    // IMPORTANT: Always use our contractId for consistency with getAnalysisState
    if (price && price > 0) {
      strategy.processTick({
        contractId: contractId,
        price: price, bid: bid, ask: ask,
        volume: volume, 
        side: tick.side || tick.lastTradeSide || 'unknown',
        timestamp: tick.timestamp || Date.now()
      });
    }
    
    // Calculate latency from Rithmic ssboe/usecs or inter-tick timing
    if (tick.ssboe && tick.usecs !== undefined) {
      const tickTimeMs = (tick.ssboe * 1000) + Math.floor(tick.usecs / 1000);
      const latency = now - tickTimeMs;
      if (latency >= 0 && latency < 5000) stats.latency = latency;
    } else if (lastTickTime > 0) {
      const timeSinceLastTick = now - lastTickTime;
      if (timeSinceLastTick < 100) {
        tickLatencies.push(timeSinceLastTick);
        if (tickLatencies.length > 20) tickLatencies.shift();
        stats.latency = Math.round(tickLatencies.reduce((a, b) => a + b, 0) / tickLatencies.length);
      }
    }
    lastTickTime = now;
  });
  
  marketFeed.on('connected', () => { stats.connected = true; ui.addLog('connected', 'Market data connected'); });
  marketFeed.on('subscribed', (symbol) => ui.addLog('system', `Subscribed: ${symbol}`));
  marketFeed.on('error', (err) => ui.addLog('error', `Market: ${err.message}`));
  marketFeed.on('disconnected', () => { stats.connected = false; ui.addLog('error', 'Market disconnected'); });
  
  try {
    // Try sync (RithmicService) then async (BrokerClient)
    let rithmicCredentials = service.getRithmicCredentials?.();
    if (!rithmicCredentials && service.getRithmicCredentialsAsync) {
      try {
        rithmicCredentials = await service.getRithmicCredentialsAsync();
      } catch (credErr) {
        throw new Error(`Broker error: ${credErr.message} - try "hqx login"`);
      }
    }
    if (!rithmicCredentials) throw new Error('Rithmic credentials not available - try "hqx login"');
    if (service.disconnectTicker) await service.disconnectTicker(); // Avoid TICKER conflict
    await marketFeed.connect(rithmicCredentials);
    await marketFeed.subscribe(symbolCode, contract.exchange || 'CME');
    
    // Load historical bars for instant warmup
    if (strategy.preloadBars) {
      ui.addLog('system', 'Loading historical data...');
      try {
        const histBars = await marketFeed.getHistoricalBars(symbolCode, contract.exchange || 'CME', 30);
        if (histBars && histBars.length > 0) {
          strategy.preloadBars(contractId, histBars);
          ui.addLog('system', `Loaded ${histBars.length} historical bars - ready to trade!`);
          sessionLogger.log('HISTORY', `Preloaded ${histBars.length} bars`);
        } else {
          ui.addLog('system', 'No history available - warming up with live data...');
        }
      } catch (histErr) {
        ui.addLog('system', `History load failed: ${histErr.message} - using live data`);
        sessionLogger.log('HISTORY', `Failed: ${histErr.message}`);
      }
    }
  } catch (e) {
    ui.addLog('error', `Failed to connect: ${e.message}`);
  }
  
  // P&L polling - uses CACHED data (NO API CALLS to avoid Rithmic rate limits)
  const pollPnL = async () => {
    try {
      const accId = account.rithmicAccountId || account.accountId;
      
      // Get P&L from cache (handle sync/async)
      let pnlData = null;
      if (service.getAccountPnL) {
        const result = service.getAccountPnL(accId);
        pnlData = result && result.then ? await result : result;
      }
      
      if (pnlData && pnlData.pnl !== null && pnlData.pnl !== undefined && !isNaN(pnlData.pnl)) {
        if (startingPnL === null) startingPnL = pnlData.pnl;
        const newPnl = pnlData.pnl - startingPnL;
        if (!isNaN(newPnl)) {
          stats.pnl = newPnl;
          if (stats.pnl !== 0) strategy.recordTradeResult(stats.pnl);
        }
      }
      
      // Check positions (every 10s)
      if (Date.now() % 10000 < 2000) {
        const posResult = await service.getPositions(accId);
        if (posResult.success && posResult.positions) {
          const pos = posResult.positions.find(p => {
            const sym = p.contractId || p.symbol || '';
            return sym.includes(contract.name) || sym.includes(contractId);
          });
          if (pos && pos.quantity !== 0) {
            currentPosition = pos.quantity;
          } else {
            currentPosition = 0;
          }
        }
      }
      
      // Risk checks (only if pnl is valid)
      if (!isNaN(stats.pnl)) {
        if (stats.pnl >= dailyTarget) {
          stopReason = 'target'; running = false;
          ui.addLog('fill_win', `TARGET REACHED! +$${stats.pnl.toFixed(2)}`);
          sessionLogger.log('TARGET', `Daily target reached: +$${stats.pnl.toFixed(2)}`);
        } else if (stats.pnl <= -maxRisk) {
          stopReason = 'risk'; running = false;
          ui.addLog('fill_loss', `MAX RISK! -$${Math.abs(stats.pnl).toFixed(2)}`);
          sessionLogger.log('RISK', `Max risk hit: -$${Math.abs(stats.pnl).toFixed(2)}`);
        }
        sessionLogger.pnl(stats.pnl, 0, currentPosition);
      }
    } catch (e) { /* silent */ }
  };
  
  const refreshInterval = setInterval(() => { if (running) ui.render(stats); }, 100);
  const pnlInterval = setInterval(() => { if (running) pollPnL(); }, 2000);
  pollPnL();
  
  // Event-driven logs - only log when something significant happens
  let lastLiveLogSecond = 0;
  const liveLogInterval = setInterval(() => {
    if (!running) return;
    const now = Math.floor(Date.now() / 1000);
    if (now === lastLiveLogSecond) return;
    lastLiveLogSecond = now;
    
    // Get strategy state for context
    const state = strategy.getAnalysisState?.(contractId, lastPrice);
    const logState = {
      bars: state?.barsProcessed || 0,
      swings: state?.swingsDetected || 0,
      zones: state?.activeZones || 0,
      trend: lastBias === 'LONG' ? 'bullish' : lastBias === 'SHORT' ? 'bearish' : 'neutral',
      nearZone: (state?.nearestSupport || state?.nearestResistance) ? true : false,
      nearestSupport: state?.nearestSupport || null,
      nearestResistance: state?.nearestResistance || null,
      setupForming: state?.ready && state?.activeZones > 0,
      position: currentPosition,
      price: lastPrice || 0,
      delta: runningDelta,
      buyPct: runningBuyPct,
      tickCount,
      // QUANT strategy metrics (real from strategy)
      zScore: state?.zScore || 0,
      vpin: state?.vpin || 0,
      ofi: state?.ofi || 0,
    };
    
    // Only log if an event was detected (log !== null)
    const log = logsEngine.getLog(logState);
    if (log) {
      ui.addLog(log.type, log.message);
      if (log.logToSession) sessionLogger.log('ANALYSIS', log.message);
    }
  }, 1000);
  
  const setupKeyHandler = () => {
    if (!process.stdin.isTTY) return null;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onKey = (str, key) => {
      // Handle 'x', 'X', '$', '£', or Ctrl+C to stop
      const keyName = key?.name?.toLowerCase();
      const char = str || '';
      if (keyName === 'x' || char === '$' || char === '£' || (key?.ctrl && keyName === 'c')) {
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
  
  await new Promise(resolve => { const check = setInterval(() => { if (!running) { clearInterval(check); resolve(); } }, 100); });
  
  clearInterval(refreshInterval);
  clearInterval(pnlInterval);
  clearInterval(liveLogInterval);
  
  // Flatten any open position before stopping
  if (currentPosition !== 0) {
    ui.addLog('system', `Flattening position: ${currentPosition > 0 ? 'LONG' : 'SHORT'} ${Math.abs(currentPosition)}`);
    sessionLogger.log('EXIT', `Flattening position: ${currentPosition}`);
    try {
      const flattenResult = await service.placeOrder({
        accountId: account.rithmicAccountId || account.accountId,
        symbol: symbolCode,
        exchange: contract.exchange || 'CME',
        type: 2, // Market
        side: currentPosition > 0 ? 1 : 0, // Sell if long, Buy if short
        size: Math.abs(currentPosition)
      });
      if (flattenResult.success) {
        ui.addLog('fill_' + (currentPosition > 0 ? 'sell' : 'buy'), `Position flattened @ market`);
        sessionLogger.log('EXIT', `Position flattened successfully`);
      } else {
        ui.addLog('error', `Flatten failed: ${flattenResult.error}`);
        sessionLogger.log('EXIT', `Flatten failed: ${flattenResult.error}`);
      }
    } catch (e) {
      ui.addLog('error', `Flatten error: ${e.message}`);
      sessionLogger.log('EXIT', `Flatten error: ${e.message}`);
    }
    // Wait for fill
    await new Promise(r => setTimeout(r, 2000));
  }
  
  await marketFeed.disconnect();
  if (cleanupKeys) cleanupKeys();
  ui.cleanup();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.resume();
  
  const durationMs = Date.now() - stats.startTime;
  const h = Math.floor(durationMs / 3600000), m = Math.floor((durationMs % 3600000) / 60000), s = Math.floor((durationMs % 60000) / 1000);
  stats.duration = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  
  // End session logger and get log file path
  const sessionLogPath = sessionLogger.end(stats, stopReason?.toUpperCase() || 'MANUAL');
  renderSessionSummary(stats, stopReason);
  if (sessionLogPath) {
    console.log(`\n  Session log: ${sessionLogPath}`);
  }
  
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => {
    rl.question('\n  Press Enter to return to menu...', () => {
      rl.close();
      resolve();
    });
  });
};

module.exports = { executeAlgo };
