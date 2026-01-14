/**
 * Algo Executor - Shared execution engine for all algo modes
 * Handles market data, signals, orders, and P&L tracking
 * Supports multi-agent AI supervision for signal optimization
 */

const readline = require('readline');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { loadStrategy } = require('../../lib/m');
const { MarketDataFeed } = require('../../lib/data');
const { SupervisionEngine } = require('../../services/ai-supervision');
const smartLogs = require('../../lib/smart-logs');

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
  const { supervisionConfig, subtitle } = options;
  
  // Load the selected strategy module dynamically
  const strategyId = strategyInfo?.id || 'ultra-scalping';
  const strategyName = strategyInfo?.name || 'HQX Scalping';
  const strategyModule = loadStrategy(strategyId);
  const StrategyClass = strategyModule.M1; // loadStrategy normalizes to M1
  
  // Initialize AI Supervision Engine if configured
  const supervisionEnabled = supervisionConfig?.supervisionEnabled && supervisionConfig?.agents?.length > 0;
  const supervisionEngine = supervisionEnabled ? new SupervisionEngine(supervisionConfig) : null;
  
  const accountName = showName 
    ? (account.accountName || account.rithmicAccountId || account.accountId) 
    : 'HQX *****';
  const symbolName = contract.name;  // Display name: "Micro E-mini S&P 500"
  const symbolCode = contract.symbol || contract.id;  // Rithmic symbol: "MESH6"
  const contractId = contract.id;
  const tickSize = contract.tickSize || 0.25;
  
  const ui = new AlgoUI({ 
    subtitle: subtitle || (supervisionEnabled ? `${strategyName} + AI` : strategyName), 
    mode: 'one-account' 
  });
  
  const stats = {
    accountName,
    symbol: symbolName,
    qty: contracts,
    target: dailyTarget,
    risk: maxRisk,
    propfirm: account.propfirm || 'Unknown',
    platform: account.platform || 'Rithmic',
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
  let currentPosition = 0;
  let pendingOrder = false;
  let tickCount = 0;
  let lastBias = 'FLAT';
  
  // Context for AI supervision
  const aiContext = { recentTicks: [], recentSignals: [], recentTrades: [], maxTicks: 100 };
  
  // Initialize Strategy
  const strategy = new StrategyClass({ tickSize });
  strategy.initialize(contractId, tickSize);
  
  // Handle strategy debug logs
  strategy.on('log', (log) => {
    const type = log.type === 'debug' ? 'debug' : log.type === 'info' ? 'analysis' : 'system';
    ui.addLog(type, log.message);
  });
  
  // Initialize Market Data Feed (Rithmic TICKER_PLANT)
  const marketFeed = new MarketDataFeed();
  
  // Log startup
  ui.addLog('system', `Strategy: ${strategyName}${supervisionEnabled ? ' + AI' : ''}`);
  ui.addLog('system', `Account: ${accountName}`);
  ui.addLog('system', `Symbol: ${symbolName} | Qty: ${contracts}`);
  ui.addLog('risk', `Target: $${dailyTarget} | Risk: $${maxRisk}`);
  if (supervisionEnabled) {
    const agentCount = supervisionEngine.getActiveCount();
    ui.addLog('analysis', `AI Agents: ${agentCount} active`);
  }
  ui.addLog('system', 'Connecting to market data...');
  
  // Handle strategy signals
  strategy.on('signal', async (signal) => {
    const dir = signal.direction?.toUpperCase() || 'UNKNOWN';
    const signalLog = smartLogs.getSignalLog(dir, symbolCode, (signal.confidence || 0) * 100, strategyName);
    ui.addLog('signal', `${signalLog.message}`);
    ui.addLog('signal', signalLog.details);
    
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
        accountId: account.accountId,
        contractId: contractId,
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
        
        // Bracket orders
        if (stopLoss && takeProfit) {
          await service.placeOrder({
            accountId: account.accountId, contractId, type: 4,
            side: direction === 'long' ? 1 : 0, size: orderSize, stopPrice: stopLoss
          });
          await service.placeOrder({
            accountId: account.accountId, contractId, type: 1,
            side: direction === 'long' ? 1 : 0, size: orderSize, limitPrice: takeProfit
          });
          ui.addLog('trade', `SL: ${stopLoss.toFixed(2)} | TP: ${takeProfit.toFixed(2)}`);
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
  let lastPrice = null;
  let lastBid = null;
  let lastAsk = null;
  let ticksPerSecond = 0;
  let lastTickSecond = Math.floor(Date.now() / 1000);
  let lastLogSecond = 0;
  let buyVolume = 0;
  let sellVolume = 0;
  let barCount = 0;
  
  // Track tick arrival times for latency estimation
  let lastTickTime = 0;
  let tickLatencies = [];
  
  marketFeed.on('tick', (tick) => {
    tickCount++;
    const now = Date.now();
    const currentSecond = Math.floor(now / 1000);
    
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
    
    // === SMART LOGS - REDUCED FREQUENCY ===
    if (currentSecond !== lastLogSecond && tickCount > 1) {
      lastLogSecond = currentSecond;
      
      const totalVol = buyVolume + sellVolume;
      const buyPressure = totalVol > 0 ? (buyVolume / totalVol) * 100 : 50;
      const delta = buyVolume - sellVolume;
      
      // Determine market bias
      let bias = 'FLAT';
      if (buyPressure > 55) bias = 'LONG';
      else if (buyPressure < 45) bias = 'SHORT';
      
      // Log bias when it changes, or every 5 seconds if strong signal
      const strongSignal = Math.abs(delta) > 20 || buyPressure > 65 || buyPressure < 35;
      if (bias !== lastBias || (strongSignal && currentSecond % 5 === 0) || (!strongSignal && currentSecond % 15 === 0)) {
        const biasLog = smartLogs.getMarketBiasLog(bias, delta, buyPressure);
        const biasType = bias === 'LONG' ? 'bullish' : bias === 'SHORT' ? 'bearish' : 'analysis';
        ui.addLog(biasType, `${biasLog.message} ${biasLog.details || ''}`);
        lastBias = bias;
      }
      
      // Strategy state log every 30 seconds (reduced frequency)
      if (currentSecond % 30 === 0) {
        const state = strategy.getAnalysisState?.(contractId, price);
        if (state) {
          if (!state.ready) {
            ui.addLog('system', state.message);
          } else {
            const resStr = state.nearestResistance ? state.nearestResistance.toFixed(2) : '--';
            const supStr = state.nearestSupport ? state.nearestSupport.toFixed(2) : '--';
            
            // Combined single line for zones info
            ui.addLog('analysis', `Zones: ${state.activeZones} | R: ${resStr} | S: ${supStr} | Swings: ${state.swingsDetected}`);
            
            // HF-grade proximity logs with precise distance info
            if (price && state.nearestResistance) {
              const gapR = state.nearestResistance - price;
              const ticksR = Math.round(gapR / tickSize);
              const dirR = gapR > 0 ? 'below' : 'above';
              const absTicksR = Math.abs(ticksR);
              if (absTicksR <= 50) { // Only show if within 50 ticks
                ui.addLog('analysis', `PROX R: ${Math.abs(gapR).toFixed(2)} pts (${absTicksR} ticks ${dirR}) | Trigger: price must sweep ABOVE then reject`);
              }
            }
            if (price && state.nearestSupport) {
              const gapS = price - state.nearestSupport;
              const ticksS = Math.round(gapS / tickSize);
              const dirS = gapS > 0 ? 'above' : 'below';
              const absTicksS = Math.abs(ticksS);
              if (absTicksS <= 50) { // Only show if within 50 ticks
                ui.addLog('analysis', `PROX S: ${Math.abs(gapS).toFixed(2)} pts (${absTicksS} ticks ${dirS}) | Trigger: price must sweep BELOW then reject`);
              }
            }
            
            // Strategy status - what we're waiting for
            if (state.activeZones === 0) {
              ui.addLog('risk', 'Building liquidity map - scanning swing points for zone formation...');
            } else if (!state.nearestSupport && !state.nearestResistance) {
              ui.addLog('risk', 'Zones detected but outside proximity range - waiting for price approach');
            } else if (!state.nearestSupport) {
              ui.addLog('analysis', 'Monitoring resistance for HIGH SWEEP opportunity (SHORT entry on rejection)');
            } else if (!state.nearestResistance) {
              ui.addLog('analysis', 'Monitoring support for LOW SWEEP opportunity (LONG entry on rejection)');
            } else {
              ui.addLog('ready', 'Both zones active - monitoring for liquidity sweep with rejection confirmation');
            }
          }
        }
      }
      
      // Scanning log every 20 seconds (when no position)
      if (currentSecond % 20 === 0 && currentPosition === 0) {
        const scanLog = smartLogs.getScanningLog(true);
        ui.addLog('system', scanLog.message);
      }
      
      // Tick flow log every 45 seconds (less frequent)
      if (currentSecond % 45 === 0) {
        const tickLog = smartLogs.getTickFlowLog(tickCount, ticksPerSecond);
        ui.addLog('debug', `${tickLog.message} ${tickLog.details}`);
      }
      
      // AI Agents status log every 60 seconds
      if (currentSecond % 60 === 0 && supervisionEnabled && supervisionEngine) {
        const status = supervisionEngine.getStatus();
        const agentNames = status.agents.map(a => a.name.split(' ')[0]).join(', ');
        ui.addLog('analysis', `AI Supervision active: ${agentNames} (${status.availableAgents} agents monitoring)`);
      }
      
      // Reset volume counters
      buyVolume = 0;
      sellVolume = 0;
    }
    
    lastPrice = price;
    lastBid = bid;
    lastAsk = ask;
    
    strategy.processTick({
      contractId: tick.contractId || contractId,
      price: price, bid: bid, ask: ask,
      volume: volume, 
      side: tick.side || tick.lastTradeSide || 'unknown',
      timestamp: tick.timestamp || Date.now()
    });
    
    // Calculate latency from Rithmic ssboe/usecs (exchange timestamp)
    // Priority: ssboe/usecs (real exchange time) > inter-tick timing (fallback)
    if (tick.ssboe && tick.usecs !== undefined) {
      // Rithmic sends ssboe (seconds since epoch) and usecs (microseconds)
      const tickTimeMs = (tick.ssboe * 1000) + Math.floor(tick.usecs / 1000);
      const latency = now - tickTimeMs;
      // Only update if reasonable (0-5000ms) - avoids clock sync issues
      if (latency >= 0 && latency < 5000) {
        stats.latency = latency;
      }
    } else if (lastTickTime > 0) {
      // Fallback: estimate from inter-tick timing
      const timeSinceLastTick = now - lastTickTime;
      if (timeSinceLastTick < 100) {
        tickLatencies.push(timeSinceLastTick);
        if (tickLatencies.length > 20) tickLatencies.shift();
        stats.latency = Math.round(tickLatencies.reduce((a, b) => a + b, 0) / tickLatencies.length);
      }
    }
    lastTickTime = now;
  });
  
  marketFeed.on('connected', () => { 
    stats.connected = true; 
    ui.addLog('connected', 'Market data connected');
  });
  marketFeed.on('subscribed', (symbol) => ui.addLog('system', `Subscribed: ${symbol}`));
  // Suppress debug logs - not needed in production
  // marketFeed.on('debug', (msg) => ui.addLog('debug', msg));
  marketFeed.on('error', (err) => ui.addLog('error', `Market: ${err.message}`));
  marketFeed.on('disconnected', () => { stats.connected = false; ui.addLog('error', 'Market disconnected'); });
  
  // Connect to market data (Rithmic TICKER_PLANT)
  try {
    const rithmicCredentials = service.getRithmicCredentials?.();
    if (!rithmicCredentials) {
      throw new Error('Rithmic credentials not available');
    }
    await marketFeed.connect(rithmicCredentials);
    await marketFeed.subscribe(symbolCode, contract.exchange || 'CME');
    
    // Preload historical bars for HQX-2B strategy only (bar-based strategy)
    if (strategyId === 'hqx-2b' && strategy.preloadBars) {
      ui.addLog('system', 'Loading historical bars...');
      try {
        const historicalBars = await marketFeed.getHistoricalBars(symbolCode, contract.exchange || 'CME', 30);
        if (historicalBars && historicalBars.length > 0) {
          strategy.preloadBars(contractId, historicalBars);
          ui.addLog('system', `Loaded ${historicalBars.length} bars - strategy ready!`);
        } else {
          ui.addLog('system', 'No historical bars - collecting live data...');
        }
      } catch (histErr) {
        ui.addLog('debug', `Historical data unavailable: ${histErr.message}`);
        ui.addLog('system', 'Collecting live data...');
      }
    }
  } catch (e) {
    ui.addLog('error', `Failed to connect: ${e.message}`);
  }
  
  // Poll P&L
  const pollPnL = async () => {
    try {
      const accountResult = await service.getTradingAccounts();
      if (accountResult.success && accountResult.accounts) {
        const acc = accountResult.accounts.find(a => a.accountId === account.accountId);
        if (acc && acc.profitAndLoss !== undefined) {
          if (startingPnL === null) startingPnL = acc.profitAndLoss;
          stats.pnl = acc.profitAndLoss - startingPnL;
          if (stats.pnl !== 0) strategy.recordTradeResult(stats.pnl);
        }
      }
      
      const posResult = await service.getPositions(account.accountId);
      if (posResult.success && posResult.positions) {
        const pos = posResult.positions.find(p => {
          const sym = p.contractId || p.symbol || '';
          return sym.includes(contract.name) || sym.includes(contractId);
        });
        
        if (pos && pos.quantity !== 0) {
          currentPosition = pos.quantity;
          const pnl = pos.profitAndLoss || 0;
          if (pnl > 0) stats.wins = Math.max(stats.wins, 1);
          else if (pnl < 0) stats.losses = Math.max(stats.losses, 1);
        } else {
          currentPosition = 0;
        }
      }
      
      if (stats.pnl >= dailyTarget) {
        stopReason = 'target'; running = false;
        ui.addLog('fill_win', `TARGET REACHED! +$${stats.pnl.toFixed(2)}`);
      } else if (stats.pnl <= -maxRisk) {
        stopReason = 'risk'; running = false;
        ui.addLog('fill_loss', `MAX RISK! -$${Math.abs(stats.pnl).toFixed(2)}`);
      }
    } catch (e) { /* silent */ }
  };
  
  // Start loops
  const refreshInterval = setInterval(() => { if (running) ui.render(stats); }, 250);
  const pnlInterval = setInterval(() => { if (running) pollPnL(); }, 2000);
  pollPnL();
  
  // Keyboard handler for exit (X or Ctrl+C)
  const setupKeyHandler = () => {
    if (!process.stdin.isTTY) return;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const onKey = (str, key) => { if (key && (key.name === 'x' || key.name === 'X' || (key.ctrl && key.name === 'c'))) { running = false; stopReason = 'manual'; } };
    process.stdin.on('keypress', onKey);
    return () => { process.stdin.removeListener('keypress', onKey); if (process.stdin.isTTY) process.stdin.setRawMode(false); };
  };
  const cleanupKeys = setupKeyHandler();
  
  // Wait for stop signal
  await new Promise(resolve => { const check = setInterval(() => { if (!running) { clearInterval(check); resolve(); } }, 100); });
  
  // Cleanup
  clearInterval(refreshInterval);
  clearInterval(pnlInterval);
  await marketFeed.disconnect();
  if (cleanupKeys) cleanupKeys();
  ui.cleanup();
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.resume();
  
  // Duration and summary
  const durationMs = Date.now() - stats.startTime;
  const h = Math.floor(durationMs / 3600000), m = Math.floor((durationMs % 3600000) / 60000), s = Math.floor((durationMs % 60000) / 1000);
  stats.duration = h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  renderSessionSummary(stats, stopReason);
  console.log('\n  Returning to menu in 3 seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));
};

module.exports = { executeAlgo };
