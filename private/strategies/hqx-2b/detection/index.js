/**
 * =============================================================================
 * HQX-2B - Detection Modules Index
 * =============================================================================
 */

const { SwingPoint, detectSwings } = require('./swings');
const { LiquidityZone, updateZones } = require('./zones');
const { SweepEvent, detectSweep } = require('./sweeps');

module.exports = {
  SwingPoint,
  detectSwings,
  LiquidityZone,
  updateZones,
  SweepEvent,
  detectSweep
};
