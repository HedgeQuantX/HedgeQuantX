/**
 * Copy Trading Executor - Execution engine for copy trading
 * Handles signal processing, order placement, and AI supervision
 */

const readline = require('readline');
const { connections } = require('../../services');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { SupervisionEngine } = require('../../services/ai-supervision');
const { loadStrategy } = require('../../lib/m');
const { MarketDataFeed } = require('../../lib/data');

/**
 * Launch Copy Trading execution
 */
const launchCopyTrading = async (config) => {
  const { lead, followers, contract, dailyTarget, maxRisk, showNames, supervisionConfig, strategy: strategyInfo } = config;
  
  // Load the selected strategy module dynamically
  const strategyId = strategyInfo?.id || 'ultra-scalping';
  const strategyName = strategyInfo?.name || 'HQX Scalping';
  const strategyModule = loadStrategy(strategyId);
  const StrategyClass = strategyModule.M1;
  
  // Initialize AI Supervision if configured
  const supervisionEnabled = supervisionConfig?.supervisionEnabled && supervisionConfig?.agents?.length > 0;
  const supervisionEngine = supervisionEnabled ? new SupervisionEngine(supervisionConfig) : null;
  const aiContext = { recentTicks: [], recentSignals: [], maxTicks: 100 };
  
  const leadAccount = lead.account;
  const leadService = leadAccount.service || connections.getServiceForAccount(leadAccount.accountId);
  const leadName = showNames 
    ? (leadAccount.accountName || leadAccount.rithmicAccountId || leadAccount.accountId) 
    : 'HQX Lead *****';
  const symbolName = contract.name;
  const contractId = contract.id;
  const tickSize = contract.tickSize || 0.25;
  
  const followerNames = followers.map((f, i) => 
    showNames ? (f.account.accountName || f.account.accountId) : `HQX Follower ${i + 1} *****`
  );
  
  const ui = new AlgoUI({ 
    subtitle: supervisionEnabled ? `${strategyName} Copy + AI` : `${strategyName} Copy`, 
    mode: 'copy-trading' 
  });
  
  const stats = {
    accountName: leadName,
    followerNames,
    symbol: symbolName,
    qty: lead.contracts,
    followerQty: followers[0]?.contracts || lead.contracts,
    target: dailyTarget,
    risk: maxRisk,
    propfirm: leadAccount.propfirm || 'Unknown',
    platform: leadAccount.platform || 'Rithmic',
    pnl: 0,
    followerPnl: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    latency: 0,
    connected: false,
    startTime: Date.now(),
    followersCount: followers.length
  };
  
  let running = true;
  let stopReason = null;
  let startingPnL = null;
  let currentPosition = 0;
  let pendingOrder = false;
  let tickCount = 0;
  
  // Initialize Strategy
  const strategy = new StrategyClass({ tickSize });
  strategy.initialize(contractId, tickSize);
  
  // Initialize Market Data Feed (Rithmic TICKER_PLANT)
  const marketFeed = new MarketDataFeed();
  
  // Log startup
  ui.addLog('info', `Lead: ${leadName} | Followers: ${followers.length}`);
  ui.addLog('info', `Symbol: ${symbolName} | Qty: ${lead.contracts}/${followers[0]?.contracts}`);
  ui.addLog('info', `Target: $${dailyTarget} | Risk: $${maxRisk}`);
  if (supervisionEnabled) ui.addLog('info', `AI: ${supervisionEngine.getActiveCount()} agents`);
  ui.addLog('info', 'Connecting...');
  
  // Handle strategy signals
  strategy.on('signal', async (signal) => {
    if (!running || pendingOrder || currentPosition !== 0) return;
    
    let { direction, entry, stopLoss, takeProfit, confidence } = signal;
    
    aiContext.recentSignals.push({ ...signal, timestamp: Date.now() });
    if (aiContext.recentSignals.length > 10) aiContext.recentSignals.shift();
    
    ui.addLog('signal', `${direction.toUpperCase()} @ ${entry.toFixed(2)} (${(confidence * 100).toFixed(0)}%)`);
    
    // AI Supervision
    if (supervisionEnabled && supervisionEngine) {
      const result = await supervisionEngine.supervise({
        symbolId: symbolName,
        signal: { direction, entry, stopLoss, takeProfit, confidence },
        recentTicks: aiContext.recentTicks,
        recentSignals: aiContext.recentSignals,
        stats,
        config: { dailyTarget, maxRisk }
      });
      
      if (result.decision === 'reject') {
        ui.addLog('info', `AI rejected: ${result.reason}`);
        return;
      }
      
      // Apply optimizations
      if (result.optimizedSignal?.aiOptimized) {
        const opt = result.optimizedSignal;
        if (opt.entry) entry = opt.entry;
        if (opt.stopLoss) stopLoss = opt.stopLoss;
        if (opt.takeProfit) takeProfit = opt.takeProfit;
      }
      ui.addLog('info', `AI ${result.decision} (${result.confidence}%)`);
    }
    
    // Execute orders
    pendingOrder = true;
    try {
      const orderSide = direction === 'long' ? 0 : 1;
      
      // Place order on LEAD
      const leadResult = await leadService.placeOrder({
        accountId: leadAccount.accountId,
        contractId,
        type: 2,
        side: orderSide,
        size: lead.contracts
      });
      
      if (leadResult.success) {
        currentPosition = direction === 'long' ? lead.contracts : -lead.contracts;
        stats.trades++;
        ui.addLog('trade', `LEAD: ${direction.toUpperCase()} ${lead.contracts}x`);
        
        // Place orders on FOLLOWERS
        await placeFollowerOrders(followers, contractId, orderSide, direction, ui);
        
        // Bracket orders on lead
        if (stopLoss && takeProfit) {
          await placeBracketOrders(leadService, leadAccount, contractId, direction, lead.contracts, stopLoss, takeProfit);
          ui.addLog('info', `SL: ${stopLoss.toFixed(2)} | TP: ${takeProfit.toFixed(2)}`);
        }
      } else {
        ui.addLog('error', `Lead failed: ${leadResult.error}`);
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
    
    aiContext.recentTicks.push(tick);
    if (aiContext.recentTicks.length > aiContext.maxTicks) aiContext.recentTicks.shift();
    
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
    if (tickCount % 100 === 0) ui.addLog('info', `#${tickCount} @ ${tick.price?.toFixed(2) || 'N/A'}`);
  });
  
  marketFeed.on('connected', () => { stats.connected = true; ui.addLog('success', 'Connected!'); });
  marketFeed.on('error', (err) => ui.addLog('error', `Market: ${err.message}`));
  marketFeed.on('disconnected', () => { stats.connected = false; ui.addLog('error', 'Disconnected'); });
  
  // Connect to market data (Rithmic TICKER_PLANT)
  try {
    // Try sync first (RithmicService), then async (RithmicBrokerClient)
    let rithmicCredentials = leadService.getRithmicCredentials?.();
    if (!rithmicCredentials && leadService.getRithmicCredentialsAsync) {
      try {
        rithmicCredentials = await leadService.getRithmicCredentialsAsync();
      } catch (credErr) {
        throw new Error(`Broker error: ${credErr.message} - try "hqx login"`);
      }
    }
    if (!rithmicCredentials) {
      throw new Error('Rithmic credentials not available - try "hqx login"');
    }
    await marketFeed.connect(rithmicCredentials);
    await marketFeed.subscribe(symbolName, contract.exchange || 'CME');
  } catch (e) {
    ui.addLog('error', `Connect failed: ${e.message}`);
  }
  
  // Poll P&L
  const pollPnL = async () => {
    try {
      const res = await leadService.getTradingAccounts();
      if (res.success && res.accounts) {
        const acc = res.accounts.find(a => a.accountId === leadAccount.accountId);
        if (acc?.profitAndLoss !== undefined) {
          if (startingPnL === null) startingPnL = acc.profitAndLoss;
          stats.pnl = acc.profitAndLoss - startingPnL;
        }
      }
      if (stats.pnl >= dailyTarget) {
        stopReason = 'target';
        running = false;
        ui.addLog('success', `TARGET! +$${stats.pnl.toFixed(2)}`);
      } else if (stats.pnl <= -maxRisk) {
        stopReason = 'risk';
        running = false;
        ui.addLog('error', `RISK! -$${Math.abs(stats.pnl).toFixed(2)}`);
      }
    } catch (e) { /* silent */ }
  };
  
  // Start intervals
  const refreshInterval = setInterval(() => { if (running) ui.render(stats); }, 250);
  const pnlInterval = setInterval(() => { if (running) pollPnL(); }, 2000);
  pollPnL();
  
  // Keyboard handler
  const cleanupKeys = setupKeyHandler(() => { running = false; stopReason = 'manual'; });
  
  // Wait for stop
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (!running) { clearInterval(check); resolve(); }
    }, 100);
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
  
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise(resolve => {
    rl.question('\n  Press Enter to return to menu...', () => {
      rl.close();
      resolve();
    });
  });
};

/**
 * Place orders on all follower accounts
 */
const placeFollowerOrders = async (followers, contractId, orderSide, direction, ui) => {
  for (let i = 0; i < followers.length; i++) {
    const f = followers[i];
    const fService = f.account.service || connections.getServiceForAccount(f.account.accountId);
    
    try {
      const fResult = await fService.placeOrder({
        accountId: f.account.accountId,
        contractId,
        type: 2,
        side: orderSide,
        size: f.contracts
      });
      
      if (fResult.success) {
        ui.addLog('trade', `F${i + 1}: ${direction.toUpperCase()} ${f.contracts}x`);
      } else {
        ui.addLog('error', `F${i + 1}: Failed`);
      }
    } catch (e) {
      ui.addLog('error', `F${i + 1}: ${e.message}`);
    }
  }
};

/**
 * Place bracket orders (stop loss and take profit)
 */
const placeBracketOrders = async (service, account, contractId, direction, size, stopLoss, takeProfit) => {
  const exitSide = direction === 'long' ? 1 : 0;
  
  await service.placeOrder({
    accountId: account.accountId,
    contractId,
    type: 4,
    side: exitSide,
    size,
    stopPrice: stopLoss
  });
  
  await service.placeOrder({
    accountId: account.accountId,
    contractId,
    type: 1,
    side: exitSide,
    size,
    limitPrice: takeProfit
  });
};

/**
 * Setup keyboard handler for stopping
 */
const setupKeyHandler = (onStop) => {
  if (!process.stdin.isTTY) return null;
  
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  
  const onKey = (str, key) => {
    // Handle 'x', 'X', or Ctrl+C to stop
    const keyName = key?.name?.toLowerCase();
    if (keyName === 'x' || (key?.ctrl && keyName === 'c')) {
      onStop();
    }
  };
  
  process.stdin.on('keypress', onKey);
  
  return () => {
    process.stdin.removeListener('keypress', onKey);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  };
};

module.exports = { launchCopyTrading };
