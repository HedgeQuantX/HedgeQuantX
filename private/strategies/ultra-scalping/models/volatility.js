/**
 * =============================================================================
 * MODEL 5: VOLATILITY REGIME DETECTION (10% weight)
 * =============================================================================
 * ATR percentile-based (Low/Normal/High) with adaptive parameters
 * 
 * Regimes:
 * - Low (< 25th percentile): tighter stops, lower threshold
 * - Normal (25-75th percentile): standard params
 * - High (> 75th percentile): wider stops, higher threshold
 * 
 * DO NOT MODIFY - validated by backtest
 */

/**
 * Calculate ATR (Average True Range)
 * @param {Object[]} bars - Bar history [{ high, low, close }]
 * @param {number} period - ATR period (default 14)
 * @returns {number} ATR value
 */
function calculateATR(bars, period = 14) {
  if (bars.length < period + 1) return 2.5; // Default 10 ticks

  const trValues = [];
  for (let i = bars.length - period; i < bars.length; i++) {
    const bar = bars[i];
    const prevClose = bars[i - 1].close;
    const tr = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prevClose),
      Math.abs(bar.low - prevClose)
    );
    trValues.push(tr);
  }

  return trValues.reduce((a, b) => a + b, 0) / trValues.length;
}

/**
 * Detect volatility regime and return adaptive parameters
 * @param {number} atr - Current ATR value
 * @param {number[]} atrHistory - Historical ATR values
 * @param {number} tickSize - Tick size
 * @returns {Object} { regime, params }
 */
function detectVolatilityRegime(atr, atrHistory, tickSize) {
  // Calculate ATR percentile
  let atrPercentile = 0.5;
  if (atrHistory.length >= 20) {
    atrPercentile = atrHistory.filter(a => a <= atr).length / atrHistory.length;
  }

  // Determine regime with adaptive parameters
  let regime, params;

  if (atrPercentile < 0.25) {
    regime = 'low';
    params = {
      stopMultiplier: 0.8,
      targetMultiplier: 0.9,
      zscoreThreshold: 1.2,
      confidenceBonus: 0.05
    };
  } else if (atrPercentile < 0.75) {
    regime = 'normal';
    params = {
      stopMultiplier: 1.0,
      targetMultiplier: 1.0,
      zscoreThreshold: 1.5,
      confidenceBonus: 0.0
    };
  } else {
    regime = 'high';
    params = {
      stopMultiplier: 1.3,
      targetMultiplier: 1.2,
      zscoreThreshold: 2.0,
      confidenceBonus: -0.05
    };
  }

  return { regime, params, atrPercentile };
}

module.exports = { calculateATR, detectVolatilityRegime };
