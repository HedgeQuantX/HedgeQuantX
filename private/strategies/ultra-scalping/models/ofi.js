/**
 * =============================================================================
 * MODEL 6: ORDER FLOW IMBALANCE - OFI (20% weight)
 * =============================================================================
 * Formula: OFI = (BuyPressure - SellPressure) / Total
 * 
 * Uses close position within bar as buy/sell indicator
 * Range: [-1, 1]
 * 
 * DO NOT MODIFY - validated by backtest
 */

/**
 * Compute Order Flow Imbalance
 * @param {Object[]} bars - Bar history [{ high, low, close, volume }]
 * @param {number} lookback - Lookback period (default 20)
 * @returns {number} OFI value (-1 to 1)
 */
function computeOrderFlowImbalance(bars, lookback = 20) {
  if (bars.length < lookback) return 0;

  const recentBars = bars.slice(-lookback);
  let totalBuyPressure = 0;
  let totalSellPressure = 0;

  for (const bar of recentBars) {
    const barRange = bar.high - bar.low;
    if (barRange > 0) {
      // Use close position within bar as buy/sell indicator
      const closePosition = (bar.close - bar.low) / barRange;
      totalBuyPressure += closePosition * bar.volume;
      totalSellPressure += (1 - closePosition) * bar.volume;
    }
  }

  const totalPressure = totalBuyPressure + totalSellPressure;
  if (totalPressure < 1) return 0;

  // OFI = (Buy - Sell) / Total, range [-1, 1]
  return (totalBuyPressure - totalSellPressure) / totalPressure;
}

module.exports = { computeOrderFlowImbalance };
