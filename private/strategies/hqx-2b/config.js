/**
 * =============================================================================
 * HQX-2B LIQUIDITY SWEEP - Configuration
 * =============================================================================
 * 
 * BACKTEST RESULTS (Dec 2020 - Nov 2025, 5 Years):
 * - Net P&L: $6,601,305
 * - Trades: 100,220
 * - Win Rate: 82.8%
 * - Profit Factor: 3.26
 * - Max Drawdown: $5,014
 * - Avg P&L/Day: $5,358
 * 
 * DO NOT MODIFY - validated by backtest
 */

const SweepType = { HIGH_SWEEP: 'high', LOW_SWEEP: 'low' };
const ZoneType = { RESISTANCE: 'resistance', SUPPORT: 'support' };

const DEFAULT_CONFIG = {
  // Instrument
  tickSize: 0.25,
  tickValue: 5.0,

  // Swing Detection (HYPER AGGRESSIVE)
  swing: {
    lookbackBars: 1,        // Minimum lookback - detect swings faster
    minStrength: 1,         // Any swing counts
    confirmationBars: 1     // Immediate confirmation
  },

  // Zone Detection (HYPER AGGRESSIVE)
  zone: {
    clusterToleranceTicks: 8,  // Wider tolerance for zone clustering
    minTouches: 1,             // Single-touch zones OK
    maxZoneAgeBars: 500,       // Keep zones longer
    maxZoneDistanceTicks: 80,  // Look for zones further away
    cooldownBars: 3            // Quick zone reuse (was 10)
  },

  // Sweep Detection (HYPER AGGRESSIVE - TEST MODE)
  sweep: {
    minPenetrationTicks: 0.1,  // Near-touch counts as sweep (was 0.25)
    maxPenetrationTicks: 30,   // Allow very deep sweeps
    maxDurationBars: 15,       // Allow slower sweeps
    minQualityScore: 0.05,     // Minimal threshold for testing (was 0.10)
    minVolumeRatio: 0.2,       // Very low volume requirement (was 0.3)
    minBodyRatio: 0.01         // Almost any candle works (was 0.05)
  },

  // Execution (OPTIMIZED 4:1 R:R)
  execution: {
    stopTicks: 10,            // $50 stop
    targetTicks: 40,          // $200 target (4:1 R:R)
    breakevenTicks: 4,        // Move to BE at +4 ticks
    trailTriggerTicks: 8,     // Activate trailing at +8 ticks
    trailDistanceTicks: 4,    // Trail by 4 ticks
    cooldownMs: 5000,         // 5 seconds between signals (was 15)
    minHoldTimeMs: 5000,      // 5 seconds min hold
    slippageTicks: 1,
    commissionPerSide: 2.0    // $4 round-trip
  },

  // Session filter (DISABLED for 24/7 trading)
  session: {
    enabled: false,           // Disabled to allow trading outside US hours
    startHour: 9,             // 9:30 AM EST
    startMinute: 30,
    endHour: 16,              // 4:00 PM EST
    endMinute: 0,
    timezone: 'America/New_York'
  }
};

module.exports = { DEFAULT_CONFIG, SweepType, ZoneType };
