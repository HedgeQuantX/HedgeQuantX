/**
 * Smart Logs Engine - Unified Event-Driven Intelligent Logs
 * ==========================================================
 * 
 * UNIFIED SYSTEM for all CLI strategies:
 * - Same engine, same event detection logic
 * - Strategy-specific vocabulary (HQX-2B: bars/swings/zones, QUANT: ticks/Z-Score/VPIN/OFI)
 * - Uses smartLogs.getLiveAnalysisLog() for varied, non-repetitive messages
 * 
 * Only logs when something SIGNIFICANT happens - no spam, no repetitive messages
 * 
 * COLOR SCHEME:
 * - Symbols: cyan (NQ, ES, CL, GC)
 * - Prices: white bold
 * - Bullish/Long: green
 * - Bearish/Short: red
 * - Neutral/System: gray/dim
 * - Signals: yellow/magenta
 * - Risk/Warnings: red bold
 * - Values: blue (Z-Score, VPIN, OFI numbers)
 */

'use strict';

const chalk = require('chalk');
const smartLogs = require('./smart-logs');
const { getContextualMessage } = require('./smart-logs-context');

// Color helpers for consistent styling
const C = {
  // Symbols & identifiers
  sym: (s) => chalk.cyan.bold(s),
  
  // Prices
  price: (p) => chalk.white.bold(p),
  
  // Direction
  long: (s) => chalk.green.bold(s),
  short: (s) => chalk.red.bold(s),
  bull: (s) => chalk.green(s),
  bear: (s) => chalk.red(s),
  
  // Values & metrics
  val: (v) => chalk.blue(v),
  valHigh: (v) => chalk.magenta.bold(v),
  
  // Status
  ok: (s) => chalk.green(s),
  warn: (s) => chalk.yellow(s),
  danger: (s) => chalk.red.bold(s),
  
  // System/neutral
  dim: (s) => chalk.dim(s),
  info: (s) => chalk.gray(s),
  
  // Special
  signal: (s) => chalk.yellow.bold(s),
  zone: (s) => chalk.magenta(s),
  regime: (s) => chalk.cyan(s),
};

const CONFIG = { 
  SESSION_LOG_INTERVAL: 10,
  // HQX-2B thresholds
  PRICE_CHANGE_TICKS: 4,
  DELTA_CHANGE_THRESHOLD: 200,
  // QUANT thresholds
  Z_EXTREME: 2.0,
  Z_HIGH: 1.5,
  Z_BUILDING: 1.0,
  OFI_THRESHOLD: 0.15,
  VPIN_TOXIC: 0.6,
  QUANT_WARMUP_TICKS: 250,
  // Heartbeat interval - frequent updates in scanning mode
  HEARTBEAT_MS: 5000,  // 5 seconds
};

const SYMBOLS = {
  NQ: 'NQ', MNQ: 'MNQ', ES: 'ES', MES: 'MES', YM: 'YM', MYM: 'MYM',
  CL: 'CL', MCL: 'MCL', GC: 'GC', MGC: 'MGC', SI: 'SI', SIL: 'SIL',
  RTY: 'RTY', M2K: 'M2K', ZB: 'ZB', ZN: 'ZN',
};

function getSym(s) {
  if (!s) return 'FUT';
  const b = s.split(':')[0].replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '').toUpperCase();
  return SYMBOLS[b] || b;
}

/**
 * Unified Smart Logs Engine
 * Works with any strategy - adapts vocabulary based on strategyId
 */
class SmartLogsEngine {
  constructor(strategyId, symbol) {
    this.strategyId = strategyId || 'hqx-2b';
    this.symbolCode = symbol;
    this.counter = 0;
    this.lastState = null;
    
    // State tracking for event detection (both strategies)
    this.lastBias = null;
    this.warmupLogged = false;
    
    // HQX-2B specific
    this.lastBars = 0;
    this.lastSwings = 0;
    this.lastZones = 0;
    this.lastNearZone = false;
    
    // QUANT specific
    this.lastZRegime = null;
    this.lastVpinToxic = false;
  }

  setSymbol(s) { this.symbolCode = s; }

  /**
   * Get log message - unified entry point
   * Detects strategy and routes to appropriate handler
   */
  getLog(state = {}) {
    this.counter++;
    const sym = getSym(this.symbolCode);
    const price = state.price > 0 ? state.price.toFixed(2) : '-.--';
    const { position = 0, delta = 0 } = state;

    // Active position - same for all strategies
    if (position !== 0) {
      const isLong = position > 0;
      const side = isLong ? C.long('LONG') : C.short('SHORT');
      const flowFavor = (isLong && delta > 0) || (!isLong && delta < 0);
      const flowLabel = flowFavor ? C.ok('FAVOR') : C.danger('ADVERSE');
      const deltaStr = delta > 0 ? C.bull(`+${delta}`) : C.bear(`${delta}`);
      return {
        type: 'trade',
        message: `[${C.sym(sym)}] ${side} ACTIVE @ ${C.price(price)} | Delta: ${deltaStr} | Flow: ${flowLabel}`,
        logToSession: true
      };
    }

    // Route to strategy-specific handler
    if (this.strategyId === 'ultra-scalping') {
      return this._getQuantLog(state, sym, price);
    } else {
      return this._getHqx2bLog(state, sym, price);
    }
  }

  /**
   * HQX-2B Liquidity Sweep - Bar/Swing/Zone based events
   */
  _getHqx2bLog(state, sym, price) {
    const { bars = 0, swings = 0, zones = 0, nearZone = false, trend = 'neutral', delta = 0 } = state;
    
    let event = null;
    let logType = 'analysis';
    let message = null;

    // EVENT 1: Warmup complete (10+ bars)
    if (bars >= 10 && !this.warmupLogged) {
      this.warmupLogged = true;
      event = 'warmup';
      const warmupMsg = getContextualMessage(this.symbolCode, this.strategyId, 'warmup');
      message = `[${C.sym(sym)}] ${C.ok('2B ready')} | ${C.val(bars)} bars | ${C.dim(warmupMsg)}`;
      logType = 'system';
    }
    // EVENT 2: New zone created
    else if (zones > this.lastZones && zones > 0) {
      event = 'new_zone';
      const signalMsg = getContextualMessage(this.symbolCode, this.strategyId, 'signal');
      message = `[${C.sym(sym)}] ${C.price(price)} | ${C.zone('Zone #' + zones)} | ${C.signal(signalMsg)}`;
      logType = 'signal';
    }
    // EVENT 3: New swing detected
    else if (swings > this.lastSwings && swings > 0) {
      event = 'new_swing';
      const scanMsg = getContextualMessage(this.symbolCode, this.strategyId, 'scanning');
      message = `[${C.sym(sym)}] ${C.price(price)} | ${C.info('Swing #' + swings)} | ${C.dim(scanMsg)}`;
    }
    // EVENT 4: Zone approach (price near zone)
    else if (nearZone && !this.lastNearZone && zones > 0) {
      event = 'zone_approach';
      const signalMsg = getContextualMessage(this.symbolCode, this.strategyId, 'signal');
      message = `[${C.sym(sym)}] ${C.price(price)} | ${C.warn('Zone approach')} | ${C.signal(signalMsg)}`;
      logType = 'signal';
    }
    // EVENT 5: Bias flip
    else if (this.lastBias && trend !== this.lastBias && trend !== 'neutral' && this.lastBias !== 'neutral') {
      event = 'bias_flip';
      const arrow = trend === 'bullish' ? C.bull('▲') : C.bear('▼');
      const oldBias = this.lastBias === 'bullish' ? C.bull(this.lastBias) : C.bear(this.lastBias);
      const newBias = trend === 'bullish' ? C.bull(trend) : C.bear(trend);
      const flipMsg = getContextualMessage(this.symbolCode, this.strategyId, trend);
      message = `[${C.sym(sym)}] ${arrow} ${oldBias} → ${newBias} | ${C.dim(flipMsg)}`;
    }

    // Update state tracking
    this.lastBars = bars;
    this.lastSwings = swings;
    this.lastZones = zones;
    this.lastNearZone = nearZone;
    this.lastBias = trend;

    if (event && message) {
      return { type: logType, message, logToSession: event === 'new_zone' || event === 'bias_flip' };
    }
    return null;
  }

  /**
   * QUANT (HQX Ultra Scalping) - Tick/Z-Score/VPIN/OFI based events
   */
  _getQuantLog(state, sym, price) {
    const { tickCount = 0, zScore = 0, vpin = 0, ofi = 0 } = state;
    const ticks = tickCount || state.bars || 0;
    
    const absZ = Math.abs(zScore);
    const vpinToxic = vpin > CONFIG.VPIN_TOXIC;
    const zRegime = absZ >= CONFIG.Z_EXTREME ? 'extreme' : absZ >= CONFIG.Z_HIGH ? 'high' : absZ >= CONFIG.Z_BUILDING ? 'building' : 'neutral';
    const bias = ofi > CONFIG.OFI_THRESHOLD ? 'bullish' : ofi < -CONFIG.OFI_THRESHOLD ? 'bearish' : 'neutral';

    let event = null;
    let logType = 'analysis';
    let message = null;

    // Helper for Z-Score color
    const zColor = (z) => {
      const absVal = Math.abs(z);
      const formatted = `${z.toFixed(1)}σ`;
      if (absVal >= CONFIG.Z_EXTREME) return C.valHigh(formatted);
      if (absVal >= CONFIG.Z_HIGH) return C.warn(formatted);
      if (absVal >= CONFIG.Z_BUILDING) return C.val(formatted);
      return C.dim(formatted);
    };

    // EVENT 1: Warmup complete (250 ticks for QUANT models)
    if (ticks >= CONFIG.QUANT_WARMUP_TICKS && !this.warmupLogged) {
      this.warmupLogged = true;
      event = 'warmup';
      const warmupMsg = getContextualMessage(this.symbolCode, this.strategyId, 'warmup');
      message = `[${C.sym(sym)}] ${C.ok('QUANT ready')} | ${C.val(ticks)} ticks | ${C.dim(warmupMsg)}`;
      logType = 'system';
    }
    // EVENT 2: Z-Score regime change
    else if (this.lastZRegime !== null && zRegime !== this.lastZRegime) {
      event = 'z_regime';
      // Get instrument-specific market context message
      const marketCtx = bias === 'bullish' ? 'bullish' : bias === 'bearish' ? 'bearish' : 'neutral';
      const instrumentMsg = getContextualMessage(this.symbolCode, this.strategyId, marketCtx);
      
      if (zRegime === 'extreme') {
        logType = 'signal';
        const dir = zScore < 0 ? C.long('LONG') : C.short('SHORT');
        const signalMsg = getContextualMessage(this.symbolCode, this.strategyId, 'signal');
        message = `[${C.sym(sym)}] ${C.price(price)} | Z: ${zColor(zScore)} ${C.signal('EXTREME')} | ${dir} | ${C.signal(signalMsg)}`;
      } else if (zRegime === 'high') {
        logType = 'signal';
        message = `[${C.sym(sym)}] ${C.price(price)} | Z: ${zColor(zScore)} ${C.warn('HIGH')} | ${C.dim(instrumentMsg)}`;
      } else if (zRegime === 'building') {
        message = `[${C.sym(sym)}] ${C.price(price)} | Z: ${zColor(zScore)} ${C.info('building')} | ${C.dim(instrumentMsg)}`;
      } else {
        const scanMsg = getContextualMessage(this.symbolCode, this.strategyId, 'scanning');
        message = `[${C.sym(sym)}] ${C.price(price)} | Z: ${C.ok('normalized')} | ${C.dim(scanMsg)}`;
      }
    }
    // EVENT 3: Bias flip (OFI direction change)
    else if (this.lastBias !== null && bias !== this.lastBias && bias !== 'neutral' && this.lastBias !== 'neutral') {
      event = 'bias_flip';
      const arrow = bias === 'bullish' ? C.bull('▲') : C.bear('▼');
      const oldBias = this.lastBias === 'bullish' ? C.bull(this.lastBias) : C.bear(this.lastBias);
      const newBias = bias === 'bullish' ? C.bull(bias) : C.bear(bias);
      const flipMsg = getContextualMessage(this.symbolCode, this.strategyId, bias);
      message = `[${C.sym(sym)}] ${arrow} OFI: ${oldBias} → ${newBias} | ${C.dim(flipMsg)}`;
    }
    // EVENT 4: VPIN toxicity change
    else if (this.lastVpinToxic !== null && vpinToxic !== this.lastVpinToxic) {
      event = 'vpin';
      const vpinPct = (vpin * 100).toFixed(0);
      if (vpinToxic) {
        message = `[${C.sym(sym)}] ${C.price(price)} | VPIN: ${C.danger(vpinPct + '%')} ${C.danger('TOXIC')} - informed flow`;
        logType = 'risk';
      } else {
        message = `[${C.sym(sym)}] ${C.price(price)} | VPIN: ${C.ok(vpinPct + '%')} ${C.ok('clean')} - normal flow`;
      }
    }

    // Update state tracking
    this.lastZRegime = zRegime;
    this.lastBias = bias;
    this.lastVpinToxic = vpinToxic;

    if (event && message) {
      return { type: logType, message, logToSession: event === 'z_regime' || event === 'bias_flip' };
    }
    
    // EVENT-DRIVEN ONLY: No spam, no repetitive logs
    // Silence = system is scanning, nothing notable happening
    // This is professional HF behavior
    return null;
  }

  reset() { 
    this.lastState = null;
    this.counter = 0;
    this.lastBias = null;
    this.warmupLogged = false;
    // HQX-2B
    this.lastBars = 0;
    this.lastSwings = 0;
    this.lastZones = 0;
    this.lastNearZone = false;
    // QUANT
    this.lastZRegime = null;
    this.lastVpinToxic = false;
  }
}

function createEngine(strategyId, symbol) { return new SmartLogsEngine(strategyId, symbol); }
module.exports = { SmartLogsEngine, createEngine, CONFIG };
