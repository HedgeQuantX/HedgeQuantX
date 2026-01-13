/**
 * Mathematical Models for HQX Ultra Scalping
 * @module lib/m/s1-models
 * 
 * 6 Mathematical Models:
 * 1. Z-Score Mean Reversion
 * 2. VPIN (Volume-Synchronized Probability of Informed Trading)
 * 3. Kyle's Lambda (Price Impact / Liquidity)
 * 4. Kalman Filter (Signal Extraction)
 * 5. Volatility Regime Detection
 * 6. Order Flow Imbalance (OFI)
 */

/**
 * MODEL 1: Z-SCORE MEAN REVERSION
 * @param {number[]} prices - Price array
 * @param {number} window - Lookback window
 * @returns {number} Z-Score value
 */
function computeZScore(prices, window = 50) {
  if (prices.length < window) return 0;
  const recentPrices = prices.slice(-window);
  const mean = recentPrices.reduce((a, b) => a + b, 0) / window;
  const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / window;
  const std = Math.sqrt(variance);
  if (std < 0.0001) return 0;
  return (prices[prices.length - 1] - mean) / std;
}

/**
 * MODEL 2: VPIN
 * @param {Array<{buy: number, sell: number}>} volumes - Volume data
 * @param {number} vpinWindow - VPIN window size
 * @returns {number} VPIN value (0-1)
 */
function computeVPIN(volumes, vpinWindow = 50) {
  if (volumes.length < vpinWindow) return 0.5;
  const recent = volumes.slice(-vpinWindow);
  let totalBuy = 0, totalSell = 0;
  for (const v of recent) { totalBuy += v.buy; totalSell += v.sell; }
  const total = totalBuy + totalSell;
  if (total < 1) return 0.5;
  return Math.abs(totalBuy - totalSell) / total;
}

/**
 * MODEL 3: KYLE'S LAMBDA
 * @param {Array} bars - Bar data
 * @returns {number} Kyle's Lambda value
 */
function computeKyleLambda(bars) {
  if (bars.length < 20) return 0;
  const recent = bars.slice(-20);
  const priceChanges = [], vols = [];
  for (let i = 1; i < recent.length; i++) {
    priceChanges.push(recent[i].close - recent[i - 1].close);
    vols.push(recent[i].volume);
  }
  const meanP = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
  const meanV = vols.reduce((a, b) => a + b, 0) / vols.length;
  let cov = 0, varV = 0;
  for (let i = 0; i < priceChanges.length; i++) {
    cov += (priceChanges[i] - meanP) * (vols[i] - meanV);
    varV += Math.pow(vols[i] - meanV, 2);
  }
  cov /= priceChanges.length;
  varV /= priceChanges.length;
  if (varV < 0.0001) return 0;
  return Math.abs(cov / varV);
}

/**
 * MODEL 4: KALMAN FILTER
 * @param {Object} state - {estimate, errorCovariance}
 * @param {number} measurement - New measurement
 * @param {number} processNoise - Process noise
 * @param {number} measurementNoise - Measurement noise
 * @returns {Object} Updated state and estimate
 */
function applyKalmanFilter(state, measurement, processNoise = 0.01, measurementNoise = 0.1) {
  if (!state || state.estimate === 0) {
    return {
      state: { estimate: measurement, errorCovariance: 1.0 },
      estimate: measurement
    };
  }
  const predictedEstimate = state.estimate;
  const predictedCovariance = state.errorCovariance + processNoise;
  const kalmanGain = predictedCovariance / (predictedCovariance + measurementNoise);
  const newEstimate = predictedEstimate + kalmanGain * (measurement - predictedEstimate);
  const newCovariance = (1 - kalmanGain) * predictedCovariance;
  return {
    state: { estimate: newEstimate, errorCovariance: newCovariance },
    estimate: newEstimate
  };
}

/**
 * Calculate ATR
 * @param {Array} bars - Bar data
 * @param {number} period - ATR period
 * @returns {number} ATR value
 */
function calculateATR(bars, period = 14) {
  if (bars.length < period + 1) return 2.5;
  const trValues = [];
  for (let i = bars.length - period; i < bars.length; i++) {
    const bar = bars[i];
    const prevClose = bars[i - 1].close;
    const tr = Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
    trValues.push(tr);
  }
  return trValues.reduce((a, b) => a + b, 0) / trValues.length;
}

/**
 * MODEL 5: VOLATILITY REGIME
 * @param {Array} atrHistory - ATR history
 * @param {number} currentATR - Current ATR
 * @returns {Object} Regime and parameters
 */
function detectVolatilityRegime(atrHistory, currentATR) {
  let atrPercentile = 0.5;
  if (atrHistory.length >= 20) {
    atrPercentile = atrHistory.filter(a => a <= currentATR).length / atrHistory.length;
  }

  let regime, params;
  if (atrPercentile < 0.25) {
    regime = 'low';
    params = { stopMultiplier: 0.8, targetMultiplier: 0.9, zscoreThreshold: 1.2, confidenceBonus: 0.05 };
  } else if (atrPercentile < 0.75) {
    regime = 'normal';
    params = { stopMultiplier: 1.0, targetMultiplier: 1.0, zscoreThreshold: 1.5, confidenceBonus: 0.0 };
  } else {
    regime = 'high';
    params = { stopMultiplier: 1.3, targetMultiplier: 1.2, zscoreThreshold: 2.0, confidenceBonus: -0.05 };
  }
  return { regime, params };
}

/**
 * MODEL 6: ORDER FLOW IMBALANCE
 * @param {Array} bars - Bar data
 * @param {number} ofiLookback - Lookback period
 * @returns {number} OFI value (-1 to 1)
 */
function computeOrderFlowImbalance(bars, ofiLookback = 20) {
  if (bars.length < ofiLookback) return 0;
  const recent = bars.slice(-ofiLookback);
  let buyPressure = 0, sellPressure = 0;
  for (const bar of recent) {
    const range = bar.high - bar.low;
    if (range > 0) {
      const closePos = (bar.close - bar.low) / range;
      buyPressure += closePos * bar.volume;
      sellPressure += (1 - closePos) * bar.volume;
    }
  }
  const total = buyPressure + sellPressure;
  if (total < 1) return 0;
  return (buyPressure - sellPressure) / total;
}

module.exports = {
  computeZScore,
  computeVPIN,
  computeKyleLambda,
  applyKalmanFilter,
  calculateATR,
  detectVolatilityRegime,
  computeOrderFlowImbalance,
};
