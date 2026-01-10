/**
 * Context Builder for AI Supervision
 * 
 * Builds the market context from real Rithmic data
 * to send to AI agents for signal analysis.
 */

const { getSymbol, getCurrentSession, isGoodSessionForSymbol } = require('./symbols');

/**
 * Build DOM (Depth of Market) summary from raw data
 */
const buildDOMSummary = (domData) => {
  if (!domData || !domData.bids || !domData.asks) {
    return { available: false };
  }

  const bids = domData.bids.slice(0, 10);
  const asks = domData.asks.slice(0, 10);
  
  const totalBidSize = bids.reduce((sum, b) => sum + (b.size || 0), 0);
  const totalAskSize = asks.reduce((sum, a) => sum + (a.size || 0), 0);
  const imbalance = totalBidSize - totalAskSize;
  const imbalanceRatio = totalAskSize > 0 ? totalBidSize / totalAskSize : 1;

  return {
    available: true,
    topBid: bids[0]?.price || null,
    topAsk: asks[0]?.price || null,
    spread: asks[0] && bids[0] ? asks[0].price - bids[0].price : null,
    totalBidSize,
    totalAskSize,
    imbalance,
    imbalanceRatio: Math.round(imbalanceRatio * 100) / 100,
    bidLevels: bids.length,
    askLevels: asks.length,
    dominantSide: imbalance > 0 ? 'buyers' : imbalance < 0 ? 'sellers' : 'neutral'
  };
};

/**
 * Build Order Flow summary from recent ticks
 */
const buildOrderFlowSummary = (recentTicks, windowSize = 50) => {
  if (!recentTicks || recentTicks.length === 0) {
    return { available: false };
  }

  const ticks = recentTicks.slice(-windowSize);
  
  let buyVolume = 0;
  let sellVolume = 0;
  let totalVolume = 0;
  let highPrice = -Infinity;
  let lowPrice = Infinity;

  for (const tick of ticks) {
    const vol = tick.volume || 1;
    totalVolume += vol;
    
    if (tick.side === 'buy' || tick.lastTradeSide === 'buy') {
      buyVolume += vol;
    } else if (tick.side === 'sell' || tick.lastTradeSide === 'sell') {
      sellVolume += vol;
    }
    
    if (tick.price > highPrice) highPrice = tick.price;
    if (tick.price < lowPrice) lowPrice = tick.price;
  }

  const delta = buyVolume - sellVolume;
  const deltaPercent = totalVolume > 0 ? (delta / totalVolume) * 100 : 0;

  return {
    available: true,
    tickCount: ticks.length,
    totalVolume,
    buyVolume,
    sellVolume,
    delta,
    deltaPercent: Math.round(deltaPercent),
    highPrice: highPrice === -Infinity ? null : highPrice,
    lowPrice: lowPrice === Infinity ? null : lowPrice,
    range: highPrice !== -Infinity && lowPrice !== Infinity ? highPrice - lowPrice : null,
    lastPrice: ticks[ticks.length - 1]?.price || null,
    trend: delta > 0 ? 'bullish' : delta < 0 ? 'bearish' : 'neutral'
  };
};

/**
 * Build trade history summary from recent signals/trades
 */
const buildTradeHistory = (recentSignals, recentTrades) => {
  const signals = recentSignals || [];
  const trades = recentTrades || [];

  const wins = trades.filter(t => t.pnl > 0).length;
  const losses = trades.filter(t => t.pnl < 0).length;
  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

  const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
  const avgWin = wins > 0 ? trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / wins : 0;
  const avgLoss = losses > 0 ? Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0) / losses) : 0;

  return {
    recentSignals: signals.length,
    totalTrades,
    wins,
    losses,
    winRate: Math.round(winRate),
    totalPnL: Math.round(totalPnL * 100) / 100,
    avgWin: Math.round(avgWin * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    profitFactor: avgLoss > 0 ? Math.round((avgWin / avgLoss) * 100) / 100 : 0
  };
};

/**
 * Build current position info
 */
const buildPositionInfo = (position, currentPrice) => {
  if (!position || position.quantity === 0) {
    return { hasPosition: false, quantity: 0 };
  }

  const qty = position.quantity;
  const entryPrice = position.averagePrice || position.entryPrice;
  const unrealizedPnL = position.profitAndLoss || 0;
  const side = qty > 0 ? 'long' : 'short';

  return {
    hasPosition: true,
    side,
    quantity: Math.abs(qty),
    entryPrice,
    currentPrice,
    unrealizedPnL: Math.round(unrealizedPnL * 100) / 100,
    ticksInProfit: entryPrice && currentPrice 
      ? Math.round((side === 'long' ? currentPrice - entryPrice : entryPrice - currentPrice) * 4)
      : 0
  };
};

/**
 * Build complete market context for AI analysis
 */
const buildMarketContext = ({
  symbolId,
  signal,
  recentTicks = [],
  recentSignals = [],
  recentTrades = [],
  domData = null,
  position = null,
  stats = {},
  config = {}
}) => {
  const symbol = getSymbol(symbolId);
  const session = getCurrentSession();
  const sessionCheck = isGoodSessionForSymbol(symbolId);
  const orderFlow = buildOrderFlowSummary(recentTicks);
  const dom = buildDOMSummary(domData);
  const history = buildTradeHistory(recentSignals, recentTrades);
  const positionInfo = buildPositionInfo(position, orderFlow.lastPrice);

  return {
    timestamp: new Date().toISOString(),
    
    // Symbol info
    symbol: {
      id: symbolId,
      name: symbol?.name || symbolId,
      tickSize: symbol?.tickSize || 0.25,
      tickValue: symbol?.tickValue || 12.50,
      characteristics: symbol?.characteristics || {},
      correlations: symbol?.correlations || {}
    },
    
    // Current session
    session: {
      name: session.name,
      description: session.description,
      isGoodTime: sessionCheck.good,
      sessionNote: sessionCheck.reason
    },
    
    // The signal to analyze
    signal: {
      direction: signal.direction,
      entry: signal.entry,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      confidence: signal.confidence,
      pattern: signal.pattern || 'unknown',
      timestamp: signal.timestamp || Date.now()
    },
    
    // Market data
    orderFlow,
    dom,
    
    // Position and history
    position: positionInfo,
    history,
    
    // Session stats
    sessionStats: {
      pnl: stats.pnl || 0,
      trades: stats.trades || 0,
      wins: stats.wins || 0,
      losses: stats.losses || 0,
      target: config.dailyTarget || stats.target || 500,
      maxRisk: config.maxRisk || stats.risk || 300,
      progressToTarget: stats.pnl && config.dailyTarget 
        ? Math.round((stats.pnl / config.dailyTarget) * 100) 
        : 0
    }
  };
};

/**
 * Format context as a string for AI prompt
 */
const formatContextForPrompt = (context) => {
  return `
## MARKET CONTEXT

**Symbol**: ${context.symbol.name} (${context.symbol.id})
**Tick Size**: ${context.symbol.tickSize} | **Tick Value**: $${context.symbol.tickValue}
**Session**: ${context.session.description} ${context.session.isGoodTime ? '✓' : '⚠'}

### SIGNAL TO ANALYZE
- Direction: ${context.signal.direction.toUpperCase()}
- Entry: ${context.signal.entry}
- Stop Loss: ${context.signal.stopLoss}
- Take Profit: ${context.signal.takeProfit}
- Strategy Confidence: ${Math.round(context.signal.confidence * 100)}%

### ORDER FLOW (Last ${context.orderFlow.tickCount || 0} ticks)
- Delta: ${context.orderFlow.delta || 0} (${context.orderFlow.deltaPercent || 0}%)
- Buy Volume: ${context.orderFlow.buyVolume || 0}
- Sell Volume: ${context.orderFlow.sellVolume || 0}
- Trend: ${context.orderFlow.trend || 'unknown'}
- Range: ${context.orderFlow.range?.toFixed(2) || 'N/A'}

### DOM ANALYSIS
${context.dom.available 
  ? `- Spread: ${context.dom.spread?.toFixed(2) || 'N/A'}
- Bid Size: ${context.dom.totalBidSize} | Ask Size: ${context.dom.totalAskSize}
- Imbalance Ratio: ${context.dom.imbalanceRatio}x
- Dominant Side: ${context.dom.dominantSide}`
  : '- DOM data not available'}

### POSITION
${context.position.hasPosition 
  ? `- ${context.position.side.toUpperCase()} ${context.position.quantity}x @ ${context.position.entryPrice}
- Unrealized P&L: $${context.position.unrealizedPnL}`
  : '- No open position'}

### SESSION PERFORMANCE
- P&L: $${context.sessionStats.pnl} / $${context.sessionStats.target} target
- Trades: ${context.sessionStats.trades} (W: ${context.sessionStats.wins} / L: ${context.sessionStats.losses})
- Progress: ${context.sessionStats.progressToTarget}%
`;
};

module.exports = {
  buildMarketContext,
  formatContextForPrompt,
  buildDOMSummary,
  buildOrderFlowSummary,
  buildTradeHistory,
  buildPositionInfo
};
