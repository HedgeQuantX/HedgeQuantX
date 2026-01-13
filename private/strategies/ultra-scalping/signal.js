/**
 * =============================================================================
 * ULTRA SCALPING - Signal Generation
 * =============================================================================
 * Combines all 6 models to generate trading signals
 * 
 * DO NOT MODIFY - validated by backtest
 */

const { v4: uuidv4 } = require('uuid');
const { OrderSide, SignalStrength } = require('../common/types');

/**
 * Generate trading signal from model outputs
 * @param {Object} params - Signal parameters
 * @returns {Object|null} Signal or null
 */
function generateSignal(params) {
  const {
    contractId,
    currentPrice,
    zscore,
    vpin,
    kyleLambda,
    kalmanEstimate,
    regime,
    volParams,
    ofi,
    config,
    tickSize
  } = params;

  // === ENTRY CONDITIONS ===

  // 1. Z-Score threshold check
  const absZscore = Math.abs(zscore);
  if (absZscore < volParams.zscoreThreshold) {
    return null; // Not enough deviation
  }

  // 2. VPIN toxic flow filter
  if (vpin > config.vpinToxicThreshold) {
    return null; // Too much informed trading, skip
  }

  // 3. Determine direction
  let direction;
  if (zscore < -volParams.zscoreThreshold) {
    // Price below mean - expect reversion UP
    direction = 'long';
  } else if (zscore > volParams.zscoreThreshold) {
    // Price above mean - expect reversion DOWN
    direction = 'short';
  } else {
    return null;
  }

  // 4. OFI confirmation
  const ofiConfirms =
    (direction === 'long' && ofi > 0.1) ||
    (direction === 'short' && ofi < -0.1);

  // 5. Kalman filter confirmation (price vs filtered price)
  const kalmanDiff = currentPrice - kalmanEstimate;
  const kalmanConfirms =
    (direction === 'long' && kalmanDiff < 0) ||
    (direction === 'short' && kalmanDiff > 0);

  // === CALCULATE MODEL SCORES ===
  const scores = {
    zscore: Math.min(1.0, absZscore / 4.0),      // Normalize to 0-1
    vpin: 1.0 - vpin,                             // Lower VPIN = better
    kyleLambda: kyleLambda > 0.001 ? 0.5 : 0.8,  // Moderate lambda is good
    kalman: kalmanConfirms ? 0.8 : 0.4,
    volatility: regime === 'normal' ? 0.8 : regime === 'low' ? 0.7 : 0.6,
    ofi: ofiConfirms ? 0.9 : 0.5,
    composite: 0 // Calculated below
  };

  // Weighted composite score (from Python backtest weights)
  scores.composite =
    scores.zscore * config.weights.zscore +           // 30%
    scores.vpin * config.weights.vpin +               // 15%
    scores.kyleLambda * config.weights.kyleLambda +   // 10%
    scores.kalman * config.weights.kalman +           // 15%
    scores.volatility * config.weights.volatility +   // 10%
    scores.ofi * config.weights.ofi;                  // 20%

  // Apply volatility bonus/penalty
  const confidence = Math.min(1.0, scores.composite + volParams.confidenceBonus);

  // Minimum confidence threshold
  if (confidence < config.minConfidence) {
    return null;
  }

  // === CALCULATE TRADE PARAMETERS ===
  const stopTicks = Math.round(config.baseStopTicks * volParams.stopMultiplier);
  const targetTicks = Math.round(config.baseTargetTicks * volParams.targetMultiplier);

  // Ensure minimum R:R of 1.5
  const actualStopTicks = Math.max(6, Math.min(12, stopTicks));
  const actualTargetTicks = Math.max(actualStopTicks * 1.5, Math.min(24, targetTicks));

  let stopLoss, takeProfit, beBreakeven, profitLockLevel;

  if (direction === 'long') {
    stopLoss = currentPrice - actualStopTicks * tickSize;
    takeProfit = currentPrice + actualTargetTicks * tickSize;
    beBreakeven = currentPrice + config.breakevenTicks * tickSize;
    profitLockLevel = currentPrice + (actualTargetTicks * config.profitLockPct) * tickSize;
  } else {
    stopLoss = currentPrice + actualStopTicks * tickSize;
    takeProfit = currentPrice - actualTargetTicks * tickSize;
    beBreakeven = currentPrice - config.breakevenTicks * tickSize;
    profitLockLevel = currentPrice - (actualTargetTicks * config.profitLockPct) * tickSize;
  }

  const riskReward = actualTargetTicks / actualStopTicks;

  // Trailing parameters
  const trailTriggerTicks = Math.round(actualTargetTicks * 0.5);
  const trailDistanceTicks = Math.round(actualStopTicks * 0.4);

  // Signal strength
  let strength = SignalStrength.MODERATE;
  if (confidence >= 0.85) strength = SignalStrength.VERY_STRONG;
  else if (confidence >= 0.75) strength = SignalStrength.STRONG;
  else if (confidence < 0.60) strength = SignalStrength.WEAK;

  // Edge calculation
  const winProb = 0.5 + (confidence - 0.5) * 0.4;
  const edge = winProb * Math.abs(takeProfit - currentPrice) - (1 - winProb) * Math.abs(currentPrice - stopLoss);

  return {
    id: uuidv4(),
    timestamp: Date.now(),
    symbol: contractId.split('.')[0] || contractId,
    contractId,
    side: direction === 'long' ? OrderSide.BID : OrderSide.ASK,
    direction,
    strategy: 'HQX_ULTRA_SCALPING_6MODELS',
    strength,
    edge,
    confidence,
    entry: currentPrice,
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    riskReward,
    stopTicks: actualStopTicks,
    targetTicks: actualTargetTicks,
    trailTriggerTicks,
    trailDistanceTicks,
    beBreakeven,
    profitLockLevel,

    // Model values for debugging/monitoring
    zScore: zscore,
    zScoreExit: config.zscoreExitThreshold,
    vpinValue: vpin,
    kyleLambda,
    kalmanEstimate,
    volatilityRegime: regime,
    ofiValue: ofi,
    models: scores,

    // Order flow confirmation flag
    orderFlowConfirmed: ofiConfirms,
    kalmanConfirmed: kalmanConfirms,

    expires: Date.now() + 60000
  };
}

module.exports = { generateSignal };
