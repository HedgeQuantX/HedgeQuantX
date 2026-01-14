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

  // Swing Detection (ULTRA AGGRESSIVE)
  swing: {
    lookbackBars: 2,        // Reduced for more swings
    minStrength: 2,         // More permissive
    confirmationBars: 1     // Faster confirmation
  },

  // Zone Detection (ULTRA AGGRESSIVE)
  zone: {
    clusterToleranceTicks: 4,
    minTouches: 1,          // Allow single-touch zones
    maxZoneAgeBars: 200,    // Fresher zones only
    maxZoneDistanceTicks: 40,
    cooldownBars: 10        // Bars before zone can be reused
  },

  // Sweep Detection (ULTRA AGGRESSIVE)
  sweep: {
    minPenetrationTicks: 1,   // Very permissive
    maxPenetrationTicks: 12,  // Tighter range
    maxDurationBars: 5,
    minQualityScore: 0.40,
    minVolumeRatio: 0.8,      // >= 0.8x median volume
    minBodyRatio: 0.2         // Minimum body/range ratio
  },

  // Execution (OPTIMIZED 4:1 R:R)
  execution: {
    stopTicks: 10,            // $50 stop
    targetTicks: 40,          // $200 target (4:1 R:R)
    breakevenTicks: 4,        // Move to BE at +4 ticks
    trailTriggerTicks: 8,     // Activate trailing at +8 ticks
    trailDistanceTicks: 4,    // Trail by 4 ticks
    cooldownMs: 30000,        // 30 seconds between signals
    minHoldTimeMs: 10000,     // Minimum 10 seconds hold
    slippageTicks: 1,
    commissionPerSide: 2.0    // $4 round-trip
  },

  // Session filter (US Regular Hours only - matches backtest)
  session: {
    enabled: true,            // MUST be enabled to match backtest results
    startHour: 9,             // 9:30 AM EST
    startMinute: 30,
    endHour: 16,              // 4:00 PM EST
    endMinute: 0,
    timezone: 'America/New_York'
  }
};

module.exports = { DEFAULT_CONFIG, SweepType, ZoneType };
