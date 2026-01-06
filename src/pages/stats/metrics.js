/**
 * @fileoverview Stats metrics calculations
 * @module pages/stats/metrics
 * 
 * STRICT RULE: All calculations based on API data only
 */

/**
 * Calculate quantitative metrics from trade data
 * @param {Array} trades - Trade array from API
 * @param {number} totalStartingBalance - Starting balance
 * @param {number} totalPnL - Total P&L from API
 * @returns {Object} Calculated metrics
 */
const calculateQuantMetrics = (trades, totalStartingBalance, totalPnL) => {
  const tradePnLs = trades.map(t => t.profitAndLoss || t.pnl || 0);
  const avgReturn = tradePnLs.length > 0 ? tradePnLs.reduce((a, b) => a + b, 0) / tradePnLs.length : 0;
  
  // Standard deviation
  const variance = tradePnLs.length > 0 
    ? tradePnLs.reduce((sum, pnl) => sum + Math.pow(pnl - avgReturn, 2), 0) / tradePnLs.length 
    : 0;
  const stdDev = Math.sqrt(variance);
  
  // Downside deviation
  const downsideReturns = tradePnLs.filter(pnl => pnl < 0);
  const downsideVariance = downsideReturns.length > 0 
    ? downsideReturns.reduce((sum, pnl) => sum + Math.pow(pnl, 2), 0) / downsideReturns.length 
    : 0;
  const downsideDev = Math.sqrt(downsideVariance);
  
  // Ratios
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev).toFixed(2) : 'N/A';
  const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev).toFixed(2) : 'N/A';
  
  // Max Drawdown
  let maxDrawdown = 0;
  let peak = totalStartingBalance || 0;
  let equity = peak;
  if (peak > 0 && tradePnLs.length > 0) {
    tradePnLs.forEach(pnl => {
      equity += pnl;
      if (equity > peak) peak = equity;
      const drawdown = peak > 0 ? (peak - equity) / peak * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });
  }
  
  const returnPercent = totalStartingBalance > 0 ? ((totalPnL / totalStartingBalance) * 100).toFixed(2) : 'N/A';
  
  return {
    avgReturn,
    stdDev,
    downsideDev,
    sharpeRatio,
    sortinoRatio,
    maxDrawdown,
    returnPercent,
  };
};

/**
 * Aggregate stats from lifetime stats or trades
 * @param {Array} activeAccounts - Active accounts with lifetimeStats
 * @param {Array} allTrades - All trades from API
 * @returns {Object} Aggregated stats
 */
const aggregateStats = (activeAccounts, allTrades) => {
  let stats = {
    totalTrades: 0, winningTrades: 0, losingTrades: 0,
    totalWinAmount: 0, totalLossAmount: 0,
    bestTrade: 0, worstTrade: 0, totalVolume: 0,
    maxConsecutiveWins: 0, maxConsecutiveLosses: 0,
    longTrades: 0, shortTrades: 0, longWins: 0, shortWins: 0
  };
  
  // First: aggregate lifetimeStats from APIs
  for (const account of activeAccounts) {
    if (account.lifetimeStats) {
      const s = account.lifetimeStats;
      stats.totalTrades += s.totalTrades || 0;
      stats.winningTrades += s.winningTrades || 0;
      stats.losingTrades += s.losingTrades || 0;
      stats.totalWinAmount += s.totalWinAmount || 0;
      stats.totalLossAmount += s.totalLossAmount || 0;
      stats.bestTrade = Math.max(stats.bestTrade, s.bestTrade || 0);
      stats.worstTrade = Math.min(stats.worstTrade, s.worstTrade || 0);
      stats.totalVolume += s.totalVolume || 0;
      stats.maxConsecutiveWins = Math.max(stats.maxConsecutiveWins, s.maxConsecutiveWins || 0);
      stats.maxConsecutiveLosses = Math.max(stats.maxConsecutiveLosses, s.maxConsecutiveLosses || 0);
      stats.longTrades += s.longTrades || 0;
      stats.shortTrades += s.shortTrades || 0;
    }
  }
  
  // If no lifetimeStats, calculate from trade history
  if (stats.totalTrades === 0 && allTrades.length > 0) {
    stats.totalTrades = allTrades.length;
    let consecutiveWins = 0, consecutiveLosses = 0;
    
    for (const trade of allTrades) {
      const pnl = trade.profitAndLoss || trade.pnl || 0;
      const size = trade.size || trade.fillSize || trade.quantity || 1;
      // Rithmic: 1=BUY, 2=SELL. Other APIs: 0=BUY, 1=SELL
      const side = trade.side;
      const isBuy = side === 0 || side === 1; // 0 or 1 = BUY depending on API
      const isSell = side === 2 || (side === 1 && trade.connectionType !== 'rithmic'); // 2 = SELL for Rithmic
      
      stats.totalVolume += Math.abs(size);
      
      // For Rithmic: 1=BUY (long), 2=SELL (short)
      if (side === 1) {
        stats.longTrades++;
        if (pnl > 0) stats.longWins++;
      } else if (side === 2) {
        stats.shortTrades++;
        if (pnl > 0) stats.shortWins++;
      } else if (side === 0) {
        // Other APIs: 0=BUY
        stats.longTrades++;
        if (pnl > 0) stats.longWins++;
      }
      
      if (pnl > 0) {
        stats.winningTrades++;
        stats.totalWinAmount += pnl;
        consecutiveWins++;
        consecutiveLosses = 0;
        if (consecutiveWins > stats.maxConsecutiveWins) stats.maxConsecutiveWins = consecutiveWins;
        if (pnl > stats.bestTrade) stats.bestTrade = pnl;
      } else if (pnl < 0) {
        stats.losingTrades++;
        stats.totalLossAmount += Math.abs(pnl);
        consecutiveLosses++;
        consecutiveWins = 0;
        if (consecutiveLosses > stats.maxConsecutiveLosses) stats.maxConsecutiveLosses = consecutiveLosses;
        if (pnl < stats.worstTrade) stats.worstTrade = pnl;
      }
    }
  }
  
  return stats;
};

/**
 * Calculate derived metrics
 * @param {Object} stats - Aggregated stats
 * @param {number} totalStartingBalance - Starting balance
 * @param {number} totalPnL - Total P&L
 * @returns {Object} Derived metrics
 */
const calculateDerivedMetrics = (stats, totalStartingBalance, totalPnL) => {
  const winRate = stats.totalTrades > 0 ? ((stats.winningTrades / stats.totalTrades) * 100).toFixed(1) : 'N/A';
  const avgWin = stats.winningTrades > 0 ? (stats.totalWinAmount / stats.winningTrades).toFixed(2) : '0.00';
  const avgLoss = stats.losingTrades > 0 ? (stats.totalLossAmount / stats.losingTrades).toFixed(2) : '0.00';
  const profitFactor = stats.totalLossAmount > 0 
    ? (stats.totalWinAmount / stats.totalLossAmount).toFixed(2) 
    : (stats.totalWinAmount > 0 ? '∞' : 'N/A');
  const netPnL = stats.totalWinAmount - stats.totalLossAmount;
  const returnPercent = totalStartingBalance > 0 ? ((totalPnL / totalStartingBalance) * 100).toFixed(2) : 'N/A';
  const longWinRate = stats.longTrades > 0 ? ((stats.longWins / stats.longTrades) * 100).toFixed(1) : 'N/A';
  const shortWinRate = stats.shortTrades > 0 ? ((stats.shortWins / stats.shortTrades) * 100).toFixed(1) : 'N/A';
  const expectancy = stats.totalTrades > 0 ? netPnL / stats.totalTrades : 0;
  const riskRewardRatio = parseFloat(avgLoss) > 0 ? (parseFloat(avgWin) / parseFloat(avgLoss)).toFixed(2) : 'N/A';
  
  return {
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    netPnL,
    returnPercent,
    longWinRate,
    shortWinRate,
    expectancy,
    riskRewardRatio,
  };
};

/**
 * Calculate HQX score
 * @param {Object} stats - Stats object
 * @param {Object} metrics - Derived metrics
 * @param {number} totalStartingBalance - Starting balance
 * @returns {Object} Score data
 */
const calculateHQXScore = (stats, metrics, totalStartingBalance) => {
  const winRateNum = metrics.winRate !== 'N/A' ? parseFloat(metrics.winRate) : 0;
  const winRateScore = Math.min(100, winRateNum * 1.5);
  const profitFactorScore = metrics.profitFactor === '∞' ? 100 : metrics.profitFactor === 'N/A' ? 0 : Math.min(100, parseFloat(metrics.profitFactor) * 40);
  const consistencyScore = stats.maxConsecutiveLosses > 0 ? Math.max(0, 100 - (stats.maxConsecutiveLosses * 15)) : 100;
  const riskScore = stats.worstTrade !== 0 && totalStartingBalance > 0 
    ? Math.max(0, 100 - (Math.abs(stats.worstTrade) / totalStartingBalance * 1000)) 
    : 50;
  const volumeScore = Math.min(100, stats.totalTrades * 2);
  const returnNum = metrics.returnPercent !== 'N/A' ? parseFloat(metrics.returnPercent) : 0;
  const returnScore = Math.min(100, Math.max(0, returnNum * 10 + 50));
  
  const hqxScore = Math.round((winRateScore + profitFactorScore + consistencyScore + riskScore + volumeScore + returnScore) / 6);
  const scoreGrade = hqxScore >= 90 ? 'S' : hqxScore >= 80 ? 'A' : hqxScore >= 70 ? 'B' : hqxScore >= 60 ? 'C' : hqxScore >= 50 ? 'D' : 'F';
  
  return {
    hqxScore,
    scoreGrade,
    breakdown: [
      { name: 'Win Rate', score: winRateScore },
      { name: 'Profit Factor', score: profitFactorScore },
      { name: 'Consistency', score: consistencyScore },
      { name: 'Risk Management', score: riskScore },
      { name: 'Volume', score: volumeScore },
      { name: 'Returns', score: returnScore }
    ]
  };
};

module.exports = {
  calculateQuantMetrics,
  aggregateStats,
  calculateDerivedMetrics,
  calculateHQXScore,
};
