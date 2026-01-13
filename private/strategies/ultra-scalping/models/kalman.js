/**
 * =============================================================================
 * MODEL 4: KALMAN FILTER - Signal Extraction from Noise (15% weight)
 * =============================================================================
 * State-space model with process/measurement noise
 * 
 * Process Noise: 0.01
 * Measurement Noise: 0.1
 * 
 * DO NOT MODIFY - validated by backtest
 */

const KALMAN_PROCESS_NOISE = 0.01;
const KALMAN_MEASUREMENT_NOISE = 0.1;

/**
 * Apply Kalman Filter to extract signal from noise
 * @param {Object} state - Current Kalman state { estimate, errorCovariance }
 * @param {number} measurement - Current price measurement
 * @returns {Object} { estimate, errorCovariance, newEstimate }
 */
function applyKalmanFilter(state, measurement) {
  if (!state || state.estimate === 0) {
    return {
      estimate: measurement,
      errorCovariance: 1.0,
      newEstimate: measurement
    };
  }

  // Prediction step
  const predictedEstimate = state.estimate;
  const predictedCovariance = state.errorCovariance + KALMAN_PROCESS_NOISE;

  // Update step
  const kalmanGain = predictedCovariance / (predictedCovariance + KALMAN_MEASUREMENT_NOISE);
  const newEstimate = predictedEstimate + kalmanGain * (measurement - predictedEstimate);
  const newCovariance = (1 - kalmanGain) * predictedCovariance;

  return {
    estimate: newEstimate,
    errorCovariance: newCovariance,
    newEstimate: newEstimate
  };
}

/**
 * Create initial Kalman state
 * @returns {Object} Initial state
 */
function createKalmanState() {
  return {
    estimate: 0,
    errorCovariance: 1.0
  };
}

module.exports = { 
  applyKalmanFilter, 
  createKalmanState,
  KALMAN_PROCESS_NOISE,
  KALMAN_MEASUREMENT_NOISE
};
