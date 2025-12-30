/**
 * ProjectX Statistics Module
 * Trade statistics calculations
 */

/**
 * Calculate lifetime statistics from trades
 * @param {Array} trades - Array of trade objects
 * @returns {Object} Calculated statistics
 */
const calculateLifetimeStats = (trades) => {
  if (!trades || trades.length === 0) {
    return null;
  }

  const stats = {
    totalTrades: trades.length,
    winningTrades: 0,
    losingTrades: 0,
    totalWinAmount: 0,
    totalLossAmount: 0,
    bestTrade: 0,
    worstTrade: 0,
    totalVolume: 0,
    maxConsecutiveWins: 0,
    maxConsecutiveLosses: 0,
    longTrades: 0,
    shortTrades: 0
  };

  let consecutiveWins = 0;
  let consecutiveLosses = 0;

  trades.forEach(t => {
    const pnl = t.profitAndLoss || t.pnl || 0;
    const size = t.size || t.quantity || 1;

    stats.totalVolume += Math.abs(size);
    
    if (t.side === 0) stats.longTrades++;
    else if (t.side === 1) stats.shortTrades++;

    if (pnl > 0) {
      stats.winningTrades++;
      stats.totalWinAmount += pnl;
      if (pnl > stats.bestTrade) stats.bestTrade = pnl;
      consecutiveWins++;
      consecutiveLosses = 0;
      if (consecutiveWins > stats.maxConsecutiveWins) stats.maxConsecutiveWins = consecutiveWins;
    } else if (pnl < 0) {
      stats.losingTrades++;
      stats.totalLossAmount += Math.abs(pnl);
      if (pnl < stats.worstTrade) stats.worstTrade = pnl;
      consecutiveLosses++;
      consecutiveWins = 0;
      if (consecutiveLosses > stats.maxConsecutiveLosses) stats.maxConsecutiveLosses = consecutiveLosses;
    }
  });

  stats.profitFactor = stats.totalLossAmount > 0 ? stats.totalWinAmount / stats.totalLossAmount : 0;
  stats.avgWin = stats.winningTrades > 0 ? stats.totalWinAmount / stats.winningTrades : 0;
  stats.avgLoss = stats.losingTrades > 0 ? stats.totalLossAmount / stats.losingTrades : 0;

  return stats;
};

/**
 * Calculate daily P&L from trades
 * @param {Array} trades - Array of trade objects
 * @returns {Array} Daily P&L array
 */
const calculateDailyPnL = (trades) => {
  if (!trades || trades.length === 0) {
    return [];
  }

  const dailyPnL = {};
  
  trades.forEach(t => {
    const ts = t.creationTimestamp || t.timestamp;
    if (ts) {
      const d = new Date(ts);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dailyPnL[key] = (dailyPnL[key] || 0) + (t.profitAndLoss || t.pnl || 0);
    }
  });

  return Object.entries(dailyPnL).map(([date, pnl]) => ({ date, profitAndLoss: pnl }));
};

/**
 * Format trades for consistent output
 * @param {Array} trades - Raw trades from API
 * @returns {Array} Formatted trades
 */
const formatTrades = (trades) => {
  if (!Array.isArray(trades)) return [];
  
  return trades.map(t => ({
    ...t,
    timestamp: t.creationTimestamp || t.timestamp,
    pnl: t.profitAndLoss || t.pnl || 0
  }));
};

module.exports = {
  calculateLifetimeStats,
  calculateDailyPnL,
  formatTrades
};
