/**
 * =============================================================================
 * HQX ULTRA SCALPING STRATEGY - Entry Point
 * =============================================================================
 * 
 * BACKTEST RESULTS (Jan 2020 - Nov 2025, 1667 files, ~15.8B ticks):
 * - Net P&L: $2,012,373.75
 * - Trades: 146,685
 * - Win Rate: 71.1%
 * - Avg P&L/Trade: $13.72
 * 
 * MATHEMATICAL MODELS (Weighted Composite):
 * 1. Z-Score Mean Reversion (30%)
 * 2. VPIN (15%)
 * 3. Kyle's Lambda (10%)
 * 4. Kalman Filter (15%)
 * 5. Volatility Regime Detection (10%)
 * 6. Order Flow Imbalance OFI (20%)
 */

const EventEmitter = require('events');
const { HQXUltraScalping } = require('./core');
const { OrderSide, SignalStrength } = require('../common/types');

/**
 * Strategy Wrapper (M1 compatible interface)
 */
class UltraScalpingStrategy extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.strategy = new HQXUltraScalping(config);

    // Forward events
    this.strategy.on('signal', (sig) => this.emit('signal', sig));
    this.strategy.on('log', (log) => this.emit('log', log));
  }

  // Interface methods (compatible with M1)
  processTick(tick) { return this.strategy.processTick(tick); }
  onTick(tick) { return this.strategy.onTick(tick); }
  onTrade(trade) { return this.strategy.onTrade(trade); }
  processBar(contractId, bar) { return this.strategy.processBar(contractId, bar); }
  initialize(contractId, tickSize, tickValue) { return this.strategy.initialize(contractId, tickSize, tickValue); }
  getAnalysisState(contractId, price) { return this.strategy.getAnalysisState(contractId, price); }
  recordTradeResult(pnl) { return this.strategy.recordTradeResult(pnl); }
  reset(contractId) { return this.strategy.reset(contractId); }
  getStats() { return this.strategy.getStats(); }
  getBarHistory(contractId) { return this.strategy.getBarHistory(contractId); }
  getModelValues(contractId) { return this.strategy.getModelValues(contractId); }
  shouldExitByZScore(contractId) { return this.strategy.shouldExitByZScore(contractId); }
  generateSignal(params) { return null; } // Signals come from processBar
}

module.exports = {
  HQXUltraScalping,
  UltraScalpingStrategy,
  // Aliases for backward compatibility
  M1: UltraScalpingStrategy,
  S1: HQXUltraScalping,
  OrderSide,
  SignalStrength
};
