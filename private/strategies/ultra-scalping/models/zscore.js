/**
 * =============================================================================
 * MODEL 1: Z-SCORE MEAN REVERSION (30% weight)
 * =============================================================================
 * Formula: Z = (Price - Mean) / StdDev
 * 
 * Entry: |Z| > threshold (1.5 live, 2.5 backtest)
 * Exit: |Z| < 0.5
 * 
 * DO NOT MODIFY - validated by backtest
 */

/**
 * Compute Z-Score for mean reversion
 * @param {number[]} prices - Price buffer
 * @param {number} window - Lookback window (default 50)
 * @returns {number} Z-Score value
 */
function computeZScore(prices, window = 50) {
  if (prices.length < window) return 0;

  const recentPrices = prices.slice(-window);
  const mean = recentPrices.reduce((a, b) => a + b, 0) / window;
  const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / window;
  const std = Math.sqrt(variance);

  if (std < 0.0001) return 0;

  const currentPrice = prices[prices.length - 1];
  return (currentPrice - mean) / std;
}

module.exports = { computeZScore };
