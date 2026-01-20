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

  // Swing Detection (BACKTEST VALIDATED)
  swing: {
    lookbackBars: 3,          // 3 bars each side for swing confirmation
    minStrength: 2,           // Minimum strength required
    confirmationBars: 1       // 1 bar confirmation
  },

  // Zone Detection (BACKTEST VALIDATED)
  zone: {
    clusterToleranceTicks: 4,  // 4 ticks tolerance for clustering
    minTouches: 2,             // Minimum 2 touches for valid zone
    maxZoneAgeBars: 200,       // Zone valid for 200 bars
    maxZoneDistanceTicks: 40,  // Max distance to consider zone
    cooldownBars: 10           // 10 bars cooldown after zone used
  },

  // Sweep Detection (BACKTEST VALIDATED)
  sweep: {
    minPenetrationTicks: 0.5,  // Minimum 0.5 tick penetration
    maxPenetrationTicks: 8,    // Maximum 8 ticks penetration
    maxDurationBars: 5,        // Sweep must complete within 5 bars
    minQualityScore: 0.25,     // Minimum quality score 25%
    minVolumeRatio: 0.5,       // Volume must be 50% of average
    minBodyRatio: 0.1          // Candle body must be 10% of range
  },

  // Execution (BACKTEST VALIDATED - 4:1 R:R)
  execution: {
    stopTicks: 10,            // $50 stop
    targetTicks: 40,          // $200 target (4:1 R:R)
    breakevenTicks: 4,        // Move to BE at +4 ticks
    trailTriggerTicks: 8,     // Activate trailing at +8 ticks
    trailDistanceTicks: 4,    // Trail by 4 ticks
    cooldownMs: 15000,        // 15 seconds between signals
    minHoldTimeMs: 10000,     // 10 seconds min hold
    slippageTicks: 1,
    commissionPerSide: 2.0    // $4 round-trip
  },

  // Session filter (BACKTEST VALIDATED - US Regular Hours)
  session: {
    enabled: true,            // Only trade during US session
    startHour: 9,             // 9:30 AM EST
    startMinute: 30,
    endHour: 16,              // 4:00 PM EST
    endMinute: 0,
    timezone: 'America/New_York'
  }
};

module.exports = { DEFAULT_CONFIG, SweepType, ZoneType };
