/**
 * =============================================================================
 * HQX-2B - Signal Generation
 * =============================================================================
 * Generates trading signals from validated sweeps
 * 
 * DO NOT MODIFY - validated by backtest
 */

const { v4: uuidv4 } = require('uuid');
const { OrderSide, SignalStrength } = require('../common/types');
const { SweepType } = require('./config');

/**
 * Generate trading signal from sweep event
 * @param {Object} params - Signal parameters
 * @returns {Object|null} Signal or null
 */
function generateSignal(params) {
  const {
    contractId,
    currentBar,
    currentIndex,
    sweep,
    config,
    tickSize
  } = params;

  const exec = config.execution;
  const currentPrice = currentBar.close;

  // Direction
  const direction = sweep.sweepType === SweepType.HIGH_SWEEP ? 'short' : 'long';

  // Calculate stops and targets
  let stopLoss, takeProfit, beLevel, trailTrigger;

  if (direction === 'long') {
    stopLoss = currentPrice - exec.stopTicks * tickSize;
    takeProfit = currentPrice + exec.targetTicks * tickSize;
    beLevel = currentPrice + exec.breakevenTicks * tickSize;
    trailTrigger = currentPrice + exec.trailTriggerTicks * tickSize;
  } else {
    stopLoss = currentPrice + exec.stopTicks * tickSize;
    takeProfit = currentPrice - exec.targetTicks * tickSize;
    beLevel = currentPrice - exec.breakevenTicks * tickSize;
    trailTrigger = currentPrice - exec.trailTriggerTicks * tickSize;
  }

  const riskReward = exec.targetTicks / exec.stopTicks;

  // Confidence calculation
  const confidence = Math.min(1.0,
    sweep.qualityScore * 0.5 +
    sweep.zone.qualityScore * 0.3 +
    (sweep.volumeRatio > 1.5 ? 0.2 : sweep.volumeRatio * 0.1)
  );

  // Signal strength
  let strength = SignalStrength.MODERATE;
  if (confidence >= 0.80) strength = SignalStrength.VERY_STRONG;
  else if (confidence >= 0.65) strength = SignalStrength.STRONG;
  else if (confidence < 0.50) strength = SignalStrength.WEAK;

  // Edge calculation
  const winProb = 0.5 + (confidence - 0.5) * 0.4;
  const edge = winProb * Math.abs(takeProfit - currentPrice) - (1 - winProb) * Math.abs(currentPrice - stopLoss);

  // Mark zone as used (cooldown)
  sweep.zone.lastUsedBarIndex = currentIndex;
  sweep.zone.swept = true;
  sweep.zone.sweptAt = new Date(currentBar.timestamp);

  return {
    id: uuidv4(),
    timestamp: Date.now(),
    symbol: contractId.split('.')[0] || contractId,
    contractId,
    side: direction === 'long' ? OrderSide.BID : OrderSide.ASK,
    direction,
    strategy: 'HQX_2B_LIQUIDITY_SWEEP',
    strength,
    edge,
    confidence,
    entry: currentPrice,
    entryPrice: currentPrice,
    stopLoss,
    takeProfit,
    riskReward,
    stopTicks: exec.stopTicks,
    targetTicks: exec.targetTicks,
    breakevenTicks: exec.breakevenTicks,
    trailTriggerTicks: exec.trailTriggerTicks,
    trailDistanceTicks: exec.trailDistanceTicks,
    beLevel,
    trailTrigger,

    // Sweep details
    sweepType: sweep.sweepType,
    penetrationTicks: sweep.penetrationTicks,
    sweepDurationBars: sweep.durationBars,
    sweepQuality: sweep.qualityScore,
    volumeRatio: sweep.volumeRatio,

    // Zone details
    zoneType: sweep.zone.type,
    zoneLevel: sweep.zone.getLevel(),
    zoneTouches: sweep.zone.touches,
    zoneQuality: sweep.zone.qualityScore,

    expires: Date.now() + 60000
  };
}

module.exports = { generateSignal };
