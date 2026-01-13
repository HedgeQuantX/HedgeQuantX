/**
 * =============================================================================
 * ULTRA SCALPING MODELS - Index
 * =============================================================================
 * Re-exports all 6 mathematical models
 */

const { computeZScore } = require('./zscore');
const { computeVPIN } = require('./vpin');
const { computeKyleLambda } = require('./kyle');
const { applyKalmanFilter, createKalmanState } = require('./kalman');
const { calculateATR, detectVolatilityRegime } = require('./volatility');
const { computeOrderFlowImbalance } = require('./ofi');

module.exports = {
  computeZScore,
  computeVPIN,
  computeKyleLambda,
  applyKalmanFilter,
  createKalmanState,
  calculateATR,
  detectVolatilityRegime,
  computeOrderFlowImbalance
};
