/**
 * =============================================================================
 * HQX-2B LIQUIDITY SWEEP STRATEGY - Entry Point
 * =============================================================================
 * 
 * BACKTEST RESULTS (Dec 2020 - Nov 2025, 5 Years):
 * - Net P&L: $6,601,305
 * - Trades: 100,220
 * - Win Rate: 82.8%
 * - Profit Factor: 3.26
 * 
 * STRATEGY:
 * - Detect swing highs/lows to identify liquidity zones
 * - Wait for price to sweep (penetrate) the zone
 * - Enter on rejection/reclaim of the zone level
 * - Use tight stops with 4:1 R:R ratio
 */

const EventEmitter = require('events');
const { HQX2BLiquiditySweep } = require('./core');
const { OrderSide, SignalStrength } = require('../common/types');
const { SweepType, ZoneType, DEFAULT_CONFIG } = require('./config');

/**
 * Strategy Wrapper (M2 compatible interface)
 */
class HQX2BStrategy extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.strategy = new HQX2BLiquiditySweep(config);

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
  preloadBars(contractId, bars) { return this.strategy.preloadBars(contractId, bars); }
  getHealthStatus(contractId) { return this.strategy.getHealthStatus(contractId); }
  generateSignal(params) { return null; } // Signals come from processBar
}

module.exports = {
  HQX2BLiquiditySweep,
  HQX2BStrategy,
  // Aliases
  M2: HQX2BStrategy,
  S2: HQX2BLiquiditySweep,
  OrderSide,
  SignalStrength,
  SweepType,
  ZoneType,
  DEFAULT_CONFIG
};
