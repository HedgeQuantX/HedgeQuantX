/**
 * =============================================================================
 * MODEL 3: KYLE'S LAMBDA - Price Impact / Liquidity (10% weight)
 * =============================================================================
 * Formula: lambda = Cov(deltaP, V) / Var(V)
 * 
 * Measures market impact and liquidity
 * 
 * DO NOT MODIFY - validated by backtest
 */

/**
 * Compute Kyle's Lambda (Price Impact / Liquidity)
 * @param {Object[]} bars - Bar history [{ close, volume }]
 * @returns {number} Kyle's Lambda value
 */
function computeKyleLambda(bars) {
  if (bars.length < 20) return 0;

  const recentBars = bars.slice(-20);
  const priceChanges = [];
  const volumes = [];

  for (let i = 1; i < recentBars.length; i++) {
    priceChanges.push(recentBars[i].close - recentBars[i - 1].close);
    volumes.push(recentBars[i].volume);
  }

  // Kyle's Lambda = Cov(deltaP, V) / Var(V)
  const meanPrice = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
  const meanVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;

  let covariance = 0;
  let varianceVol = 0;

  for (let i = 0; i < priceChanges.length; i++) {
    covariance += (priceChanges[i] - meanPrice) * (volumes[i] - meanVol);
    varianceVol += Math.pow(volumes[i] - meanVol, 2);
  }

  covariance /= priceChanges.length;
  varianceVol /= priceChanges.length;

  if (varianceVol < 0.0001) return 0;

  return Math.abs(covariance / varianceVol);
}

module.exports = { computeKyleLambda };
