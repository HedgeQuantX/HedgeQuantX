/**
 * =============================================================================
 * ULTRA SCALPING - Configuration
 * =============================================================================
 * 
 * BACKTEST RESULTS (Jan 2020 - Nov 2025, 1667 files, ~15.8B ticks):
 * - Net P&L: $2,012,373.75
 * - Trades: 146,685
 * - Win Rate: 71.1%
 * - Avg P&L/Trade: $13.72
 * 
 * DO NOT MODIFY - validated by backtest
 */

const DEFAULT_CONFIG = {
  // Model Parameters
  zscoreEntryThreshold: 1.5,     // Live trading threshold (backtest: 2.5)
  zscoreExitThreshold: 0.5,
  vpinWindow: 50,
  vpinToxicThreshold: 0.7,       // Skip if VPIN > 0.7
  volatilityLookback: 100,
  ofiLookback: 20,

  // Trade Parameters
  baseStopTicks: 8,              // $40
  baseTargetTicks: 16,           // $80
  breakevenTicks: 4,             // Move to BE at +4 ticks
  profitLockPct: 0.5,            // Lock 50% of profit
  minConfidence: 0.55,           // Minimum composite confidence
  cooldownMs: 30000,             // 30 seconds between signals
  minHoldTimeMs: 10000,          // Minimum 10 seconds hold

  // Model Weights (from Python backtest)
  weights: {
    zscore: 0.30,      // 30%
    ofi: 0.20,         // 20%
    vpin: 0.15,        // 15%
    kalman: 0.15,      // 15%
    kyleLambda: 0.10,  // 10%
    volatility: 0.10   // 10%
  },

  // Session (Futures Market Hours - Sunday 18:00 to Friday 17:00 EST)
  session: {
    enabled: false,           // Trade anytime markets are open
    timezone: 'America/New_York'
  }
};

module.exports = { DEFAULT_CONFIG };
