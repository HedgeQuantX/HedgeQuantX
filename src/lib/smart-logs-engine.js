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
 */

'use strict';

const chalk = require('chalk');
const smartLogs = require('./smart-logs');
const { getContextualMessage } = require('./smart-logs-context');

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
    this.lastHeartbeat = 0;
    
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
      const side = position > 0 ? 'LONG' : 'SHORT';
      const flow = (position > 0 && delta > 0) || (position < 0 && delta < 0) ? 'FAVOR' : 'ADVERSE';
      return {
        type: 'trade',
        message: `[${sym}] ${side} ACTIVE @ ${price} | Delta: ${delta > 0 ? '+' : ''}${delta} | Flow: ${flow}`,
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
      message = `[${sym}] 2B ready | ${bars} bars | ${warmupMsg}`;
      logType = 'system';
    }
    // EVENT 2: New zone created
    else if (zones > this.lastZones && zones > 0) {
      event = 'new_zone';
      const signalMsg = getContextualMessage(this.symbolCode, this.strategyId, 'signal');
      message = `[${sym}] ${price} | Zone #${zones} | ${signalMsg}`;
      logType = 'signal';
    }
    // EVENT 3: New swing detected
    else if (swings > this.lastSwings && swings > 0) {
      event = 'new_swing';
      const scanMsg = getContextualMessage(this.symbolCode, this.strategyId, 'scanning');
      message = `[${sym}] ${price} | Swing #${swings} | ${scanMsg}`;
    }
    // EVENT 4: Zone approach (price near zone)
    else if (nearZone && !this.lastNearZone && zones > 0) {
      event = 'zone_approach';
      const signalMsg = getContextualMessage(this.symbolCode, this.strategyId, 'signal');
      message = `[${sym}] ${price} | Zone approach | ${signalMsg}`;
      logType = 'signal';
    }
    // EVENT 5: Bias flip
    else if (this.lastBias && trend !== this.lastBias && trend !== 'neutral' && this.lastBias !== 'neutral') {
      event = 'bias_flip';
      const arrow = trend === 'bullish' ? chalk.green('▲') : chalk.red('▼');
      const flipMsg = getContextualMessage(this.symbolCode, this.strategyId, trend);
      message = `[${sym}] ${arrow} ${this.lastBias} → ${trend} | ${flipMsg}`;
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

    // EVENT 1: Warmup complete (250 ticks for QUANT models)
    if (ticks >= CONFIG.QUANT_WARMUP_TICKS && !this.warmupLogged) {
      this.warmupLogged = true;
      event = 'warmup';
      const warmupMsg = getContextualMessage(this.symbolCode, this.strategyId, 'warmup');
      message = `[${sym}] QUANT ready | ${ticks} ticks | ${warmupMsg}`;
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
        const dir = zScore < 0 ? 'LONG' : 'SHORT';
        const signalMsg = getContextualMessage(this.symbolCode, this.strategyId, 'signal');
        message = `[${sym}] ${price} | Z: ${zScore.toFixed(1)}σ | ${dir} | ${signalMsg}`;
      } else if (zRegime === 'high') {
        logType = 'signal';
        message = `[${sym}] ${price} | Z: ${zScore.toFixed(1)}σ | ${instrumentMsg}`;
      } else if (zRegime === 'building') {
        message = `[${sym}] ${price} | Z building (${zScore.toFixed(1)}σ) | ${instrumentMsg}`;
      } else {
        const scanMsg = getContextualMessage(this.symbolCode, this.strategyId, 'scanning');
        message = `[${sym}] ${price} | Z normalized | ${scanMsg}`;
      }
    }
    // EVENT 3: Bias flip (OFI direction change)
    else if (this.lastBias !== null && bias !== this.lastBias && bias !== 'neutral' && this.lastBias !== 'neutral') {
      event = 'bias_flip';
      const arrow = bias === 'bullish' ? chalk.green('▲') : chalk.red('▼');
      const flipMsg = getContextualMessage(this.symbolCode, this.strategyId, bias);
      message = `[${sym}] ${arrow} OFI: ${this.lastBias} → ${bias} | ${flipMsg}`;
    }
    // EVENT 4: VPIN toxicity change
    else if (this.lastVpinToxic !== null && vpinToxic !== this.lastVpinToxic) {
      event = 'vpin';
      if (vpinToxic) {
        message = `[${sym}] ${price} | VPIN toxic (${(vpin * 100).toFixed(0)}%) - informed flow detected`;
        logType = 'risk';
      } else {
        message = `[${sym}] ${price} | VPIN clean (${(vpin * 100).toFixed(0)}%) - normal flow`;
      }
    }

    // Update state tracking
    this.lastZRegime = zRegime;
    this.lastBias = bias;
    this.lastVpinToxic = vpinToxic;

    if (event && message) {
      this.lastHeartbeat = Date.now();
      return { type: logType, message, logToSession: event === 'z_regime' || event === 'bias_flip' };
    }
    
    // HEARTBEAT: Show status every 30s when no events (proves strategy is active)
    const now = Date.now();
    if (this.warmupLogged && now - this.lastHeartbeat >= 30000) {
      this.lastHeartbeat = now;
      // Use instrument + strategy contextual message
      const marketCtx = bias === 'bullish' ? 'bullish' : bias === 'bearish' ? 'bearish' : 'neutral';
      const ctxMsg = getContextualMessage(this.symbolCode, this.strategyId, marketCtx);
      return {
        type: 'analysis',
        message: `[${sym}] ${price} | Z: ${zScore.toFixed(1)}σ | OFI: ${(ofi * 100).toFixed(0)}% | ${ctxMsg}`,
        logToSession: false
      };
    }
    
    return null;
  }

  reset() { 
    this.lastState = null;
    this.counter = 0;
    this.lastBias = null;
    this.warmupLogged = false;
    this.lastHeartbeat = 0;
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
