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
  const symbolName = contract.name;
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
  
  // Context for AI supervision
  const aiContext = { recentTicks: [], recentSignals: [], recentTrades: [], maxTicks: 100 };
  
  // Initialize Strategy
  const strategy = new StrategyClass({ tickSize });
  strategy.initialize(contractId, tickSize);
  
  // Initialize Market Data Feed (Rithmic TICKER_PLANT)
  const marketFeed = new MarketDataFeed();
  
  // Log startup
  ui.addLog('info', `Strategy: ${strategyName}${supervisionEnabled ? ' + AI' : ''}`);
  ui.addLog('info', `Account: ${accountName}`);
  ui.addLog('info', `Symbol: ${symbolName} | Qty: ${contracts}`);
  ui.addLog('info', `Target: $${dailyTarget} | Risk: $${maxRisk}`);
  if (supervisionEnabled) {
    const agentCount = supervisionEngine.getActiveCount();
    ui.addLog('info', `AI Agents: ${agentCount} active`);
  }
  ui.addLog('info', 'Connecting to market data...');
  
  // Handle strategy signals
  strategy.on('signal', async (signal) => {
    ui.addLog('info', `SIGNAL DETECTED: ${signal.direction?.toUpperCase()}`);
    
    if (!running) {
      ui.addLog('info', 'Signal ignored: not running');
      return;
    }
    if (pendingOrder) {
      ui.addLog('info', 'Signal ignored: order pending');
      return;
    }
    if (currentPosition !== 0) {
      ui.addLog('info', `Signal ignored: position open (${currentPosition})`);
      return;
    }
    
    let { direction, entry, stopLoss, takeProfit, confidence } = signal;
    let orderSize = contracts;
    
    aiContext.recentSignals.push({ ...signal, timestamp: Date.now() });
    if (aiContext.recentSignals.length > 10) aiContext.recentSignals.shift();
    
    ui.addLog('info', `Signal: ${direction.toUpperCase()} @ ${entry.toFixed(2)} (${(confidence * 100).toFixed(0)}%)`);
    
    // Multi-Agent AI Supervision
    if (supervisionEnabled && supervisionEngine) {
      ui.addLog('info', 'AI analyzing signal...');
      
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
        ui.addLog('info', `AI: ${supervisionResult.reason || 'Error'}`);
      } else if (supervisionResult.decision === 'reject') {
        ui.addLog('info', `AI rejected (${supervisionResult.confidence}%): ${supervisionResult.reason}`);
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
        ui.addLog('info', `AI ${action} (${supervisionResult.confidence}%): ${supervisionResult.reason}`);
        
        // Check timing
        if (opt.aiTiming === 'wait') {
          ui.addLog('info', 'AI: Wait for better entry');
          return;
        } else if (opt.aiTiming === 'cancel') {
          ui.addLog('info', 'AI: Signal cancelled');
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
        ui.addLog('fill_' + (direction === 'long' ? 'buy' : 'sell'), 
          `OPENED ${direction.toUpperCase()} ${orderSize}x @ market`);
        
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
  let lastPrice = null;
  let lastBid = null;
  let lastAsk = null;
  let ticksPerSecond = 0;
  let lastTickSecond = Math.floor(Date.now() / 1000);
  
  marketFeed.on('tick', (tick) => {
    tickCount++;
    const latencyStart = Date.now();
    const currentSecond = Math.floor(Date.now() / 1000);
    
    // Count ticks per second
    if (currentSecond === lastTickSecond) {
      ticksPerSecond++;
    } else {
      ticksPerSecond = 1;
      lastTickSecond = currentSecond;
    }
    
    aiContext.recentTicks.push(tick);
    if (aiContext.recentTicks.length > aiContext.maxTicks) aiContext.recentTicks.shift();
    
    // Smart logs for tick flow
    const price = tick.price || tick.tradePrice;
    const bid = tick.bid || tick.bidPrice;
    const ask = tick.ask || tick.askPrice;
    
    // Log first tick
    if (tickCount === 1) {
      ui.addLog('info', `First tick received @ ${price?.toFixed(2) || 'N/A'}`);
      ui.addLog('info', `Tick type: ${tick.type || 'unknown'}`);
    }
    
    // Log price changes
    if (price && lastPrice && price !== lastPrice) {
      const direction = price > lastPrice ? 'UP' : 'DOWN';
      const change = Math.abs(price - lastPrice).toFixed(2);
      if (tickCount <= 10 || tickCount % 50 === 0) {
        ui.addLog('info', `Price ${direction} ${change} -> ${price.toFixed(2)}`);
      }
    }
    
    // Log bid/ask spread
    if (bid && ask && (bid !== lastBid || ask !== lastAsk)) {
      const spread = (ask - bid).toFixed(2);
      if (tickCount <= 5) {
        ui.addLog('info', `Spread: ${spread} (Bid: ${bid.toFixed(2)} / Ask: ${ask.toFixed(2)})`);
      }
    }
    
    lastPrice = price;
    lastBid = bid;
    lastAsk = ask;
    
    strategy.processTick({
      contractId: tick.contractId || contractId,
      price: price, bid: bid, ask: ask,
      volume: tick.volume || tick.size || 1, 
      side: tick.side || tick.lastTradeSide || 'unknown',
      timestamp: tick.timestamp || Date.now()
    });
    
    stats.latency = Date.now() - latencyStart;
    
    // Periodic status logs
    if (tickCount === 10) ui.addLog('info', `Receiving ticks... (${ticksPerSecond}/sec)`);
    if (tickCount === 50) ui.addLog('info', `50 ticks processed, strategy analyzing...`);
    if (tickCount % 200 === 0) {
      ui.addLog('info', `Tick #${tickCount} @ ${price?.toFixed(2) || 'N/A'} | ${ticksPerSecond}/sec`);
    }
  });
  
  marketFeed.on('connected', () => { 
    stats.connected = true; 
    ui.addLog('connected', 'Market data connected!');
    ui.addLog('info', 'Subscribing to market data...');
  });
  marketFeed.on('subscribed', (symbol) => ui.addLog('info', `Subscribed to ${symbol}`));
  marketFeed.on('debug', (msg) => ui.addLog('info', msg));
  marketFeed.on('error', (err) => ui.addLog('error', `Market: ${err.message}`));
  marketFeed.on('disconnected', () => { stats.connected = false; ui.addLog('error', 'Market disconnected'); });
  
  // Connect to market data (Rithmic TICKER_PLANT)
  try {
    const rithmicCredentials = service.getRithmicCredentials?.();
    if (!rithmicCredentials) {
      throw new Error('Rithmic credentials not available');
    }
    await marketFeed.connect(rithmicCredentials);
    await marketFeed.subscribe(symbolName, contract.exchange || 'CME');
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
  
  // Keyboard handler
  const setupKeyHandler = () => {
    if (!process.stdin.isTTY) return;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    const onKey = (str, key) => {
      if (key && (key.name === 'x' || key.name === 'X' || (key.ctrl && key.name === 'c'))) {
        running = false; stopReason = 'manual';
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
  await marketFeed.disconnect();
  if (cleanupKeys) cleanupKeys();
  ui.cleanup();
  
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.resume();
  
  // Duration
  const durationMs = Date.now() - stats.startTime;
  const hours = Math.floor(durationMs / 3600000);
  const minutes = Math.floor((durationMs % 3600000) / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  stats.duration = hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  
  renderSessionSummary(stats, stopReason);
  
  console.log('\n  Returning to menu in 3 seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));
};

module.exports = { executeAlgo };
