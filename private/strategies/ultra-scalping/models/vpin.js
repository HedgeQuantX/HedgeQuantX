/**
 * =============================================================================
 * MODEL 2: VPIN - Volume-Synchronized Probability of Informed Trading (15% weight)
 * =============================================================================
 * Formula: VPIN = |BuyVol - SellVol| / TotalVol
 * 
 * Filter: Skip trade if VPIN > 0.7 (too much informed trading)
 * 
 * DO NOT MODIFY - validated by backtest
 */

/**
 * Compute VPIN (Volume-Synchronized Probability of Informed Trading)
 * @param {Object[]} volumes - Volume buffer [{ buy, sell }]
 * @param {number} vpinWindow - Lookback window (default 50)
 * @returns {number} VPIN value (0-1)
 */
function computeVPIN(volumes, vpinWindow = 50) {
  if (volumes.length < vpinWindow) return 0.5;

  const recentVolumes = volumes.slice(-vpinWindow);
  let totalBuy = 0;
  let totalSell = 0;

  for (const v of recentVolumes) {
    totalBuy += v.buy;
    totalSell += v.sell;
  }

  const totalVolume = totalBuy + totalSell;
  if (totalVolume < 1) return 0.5;

  // VPIN = |Buy - Sell| / Total
  return Math.abs(totalBuy - totalSell) / totalVolume;
}

module.exports = { computeVPIN };
