/**
 * Smart Logs Engine - Professional HF-Grade Adaptive Logs
 * ========================================================
 * 
 * PRINCIPLES:
 * 1. NO repetitive messages - each log must be unique and meaningful
 * 2. Adaptive to real market context - uses actual QUANT metrics
 * 3. Professional HF language - precise, technical, actionable
 * 4. Event-driven only - silence means scanning, no spam
 * 
 * This replaces the old rotating generic messages with
 * intelligent, context-aware logs that reflect the actual
 * algorithmic decision process.
 */

'use strict';

const chalk = require('chalk');

// Color helpers for consistent styling
const C = {
  sym: (s) => chalk.cyan.bold(s),
  price: (p) => chalk.white.bold(p),
  long: (s) => chalk.green.bold(s),
  short: (s) => chalk.red.bold(s),
  bull: (s) => chalk.green(s),
  bear: (s) => chalk.red(s),
  val: (v) => chalk.blue(v),
  valHigh: (v) => chalk.magenta.bold(v),
  ok: (s) => chalk.green(s),
  warn: (s) => chalk.yellow(s),
  danger: (s) => chalk.red.bold(s),
  dim: (s) => chalk.dim(s),
  info: (s) => chalk.gray(s),
  signal: (s) => chalk.yellow.bold(s),
};

const CONFIG = { 
  Z_EXTREME: 2.0,
  Z_HIGH: 1.5,
  Z_BUILDING: 1.0,
  OFI_STRONG: 0.20,
  OFI_THRESHOLD: 0.15,
  VPIN_TOXIC: 0.65,
  VPIN_ELEVATED: 0.50,
};

function getSym(s) {
  if (!s) return 'FUT';
  const b = s.split(':')[0].replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '').toUpperCase();
  const map = { ENQ: 'NQ', EP: 'ES', RTY: 'RTY', EMD: 'EMD', MGC: 'GC', MCL: 'CL' };
  return map[b] || b;
}

/**
 * Professional HF Smart Logs Engine
 */
class SmartLogsEngine {
  constructor(strategyId, symbol) {
    this.strategyId = strategyId || 'ultra-scalping';
    this.symbolCode = symbol;
    this.lastLogHash = null;
    this.lastLogTime = 0;
    this.eventCounter = 0;
    
    // State tracking for change detection
    this.prev = {
      zRegime: null,
      ofiDir: null,
      vpinLevel: null,
      position: 0,
      ready: false,
    };
  }

  setSymbol(s) { this.symbolCode = s; }

  /**
   * Main entry - returns log only when meaningful event occurs
   * Returns null for silence (professional: no news = scanning)
   */
  getLog(state = {}) {
    const sym = getSym(this.symbolCode);
    const price = state.price > 0 ? state.price.toFixed(2) : null;
    const { position = 0, zScore = 0, vpin = 0, ofi = 0, tickCount = 0, bars = 0 } = state;
    
    // Not enough data - still warming up
    const dataPoints = tickCount || bars || 0;
    if (dataPoints < 50 || !price) {
      // Only log warmup progress at milestones
      if (!this.prev.ready && dataPoints > 0) {
        const pct = Math.min(100, Math.round((dataPoints / 50) * 100));
        const milestone = Math.floor(pct / 25) * 25;
        const lastMilestone = this._lastWarmupMilestone || 0;
        if (milestone > lastMilestone) {
          this._lastWarmupMilestone = milestone;
          return {
            type: 'system',
            message: `[${C.sym(sym)}] Calibrating QUANT models... ${C.val(pct + '%')} (${dataPoints} samples)`,
            logToSession: false
          };
        }
      }
      return null;
    }
    
    // Mark as ready
    if (!this.prev.ready) {
      this.prev.ready = true;
      return {
        type: 'system',
        message: `[${C.sym(sym)}] ${C.price(price)} | ${C.ok('QUANT models calibrated')} | Scanning for alpha`,
        logToSession: true
      };
    }
    
    // Active position - always show
    if (position !== 0) {
      const isLong = position > 0;
      const side = isLong ? C.long('LONG') : C.short('SHORT');
      const deltaFavor = (isLong && ofi > 0) || (!isLong && ofi < 0);
      const flowLabel = deltaFavor ? C.ok('ALIGNED') : C.warn('ADVERSE');
      const ofiStr = (ofi * 100).toFixed(0);
      const zStr = zScore.toFixed(2);
      
      // Only log position updates when something changes
      const posHash = `pos-${position}-${Math.round(ofi * 10)}`;
      if (posHash !== this.lastLogHash) {
        this.lastLogHash = posHash;
        return {
          type: 'trade',
          message: `[${C.sym(sym)}] ${side} @ ${C.price(price)} | OFI:${ofiStr}% ${flowLabel} | Z:${zStr}σ`,
          logToSession: true
        };
      }
      return null;
    }
    
    // Compute current regimes
    const absZ = Math.abs(zScore);
    const zRegime = absZ >= CONFIG.Z_EXTREME ? 'extreme' : 
                    absZ >= CONFIG.Z_HIGH ? 'high' : 
                    absZ >= CONFIG.Z_BUILDING ? 'building' : 'neutral';
    const ofiDir = ofi > CONFIG.OFI_STRONG ? 'strong-bull' :
                   ofi > CONFIG.OFI_THRESHOLD ? 'bull' :
                   ofi < -CONFIG.OFI_STRONG ? 'strong-bear' :
                   ofi < -CONFIG.OFI_THRESHOLD ? 'bear' : 'neutral';
    const vpinLevel = vpin > CONFIG.VPIN_TOXIC ? 'toxic' :
                      vpin > CONFIG.VPIN_ELEVATED ? 'elevated' : 'normal';
    
    // Detect events (changes in regime)
    let event = null;
    let message = null;
    let logType = 'analysis';
    
    const zColor = absZ >= CONFIG.Z_EXTREME ? C.valHigh : 
                   absZ >= CONFIG.Z_HIGH ? C.warn : 
                   absZ >= CONFIG.Z_BUILDING ? C.val : C.dim;
    const zStr = zColor(`${zScore.toFixed(2)}σ`);
    const ofiPct = (ofi * 100).toFixed(0);
    const vpinPct = (vpin * 100).toFixed(0);
    
    // EVENT 1: Z-Score regime change (most important)
    if (zRegime !== this.prev.zRegime && this.prev.zRegime !== null) {
      event = 'z_regime';
      const dir = zScore < 0 ? 'LONG' : 'SHORT';
      
      if (zRegime === 'extreme') {
        logType = 'signal';
        const ofiConfirm = (zScore < 0 && ofi > CONFIG.OFI_THRESHOLD) || 
                          (zScore > 0 && ofi < -CONFIG.OFI_THRESHOLD);
        if (ofiConfirm) {
          message = `[${C.sym(sym)}] ${C.price(price)} | Z:${zStr} ${C.signal('EXTREME')} | ${C.long(dir)} | OFI:${ofiPct}% ${C.ok('CONFIRMS')}`;
        } else {
          message = `[${C.sym(sym)}] ${C.price(price)} | Z:${zStr} ${C.signal('EXTREME')} | ${C.warn(dir + ' pending')} | OFI:${ofiPct}% awaiting`;
        }
      } else if (zRegime === 'high') {
        logType = 'signal';
        message = `[${C.sym(sym)}] ${C.price(price)} | Z:${zStr} ${C.warn('building')} | ${dir} setup forming | OFI:${ofiPct}%`;
      } else if (zRegime === 'building' && this.prev.zRegime === 'neutral') {
        message = `[${C.sym(sym)}] ${C.price(price)} | Z:${zStr} | Deviation detected | Monitoring`;
      } else if (zRegime === 'neutral' && (this.prev.zRegime === 'high' || this.prev.zRegime === 'extreme')) {
        message = `[${C.sym(sym)}] ${C.price(price)} | Z:${C.ok('normalized')} | Mean reversion complete`;
      }
    }
    // EVENT 2: OFI direction flip (significant)
    else if (ofiDir !== this.prev.ofiDir && this.prev.ofiDir !== null && 
             ofiDir !== 'neutral' && this.prev.ofiDir !== 'neutral') {
      event = 'ofi_flip';
      const wasLong = this.prev.ofiDir.includes('bull');
      const nowLong = ofiDir.includes('bull');
      if (wasLong !== nowLong) {
        const arrow = nowLong ? C.bull('▲') : C.bear('▼');
        const newDir = nowLong ? C.bull('BUY') : C.bear('SELL');
        message = `[${C.sym(sym)}] ${C.price(price)} | ${arrow} OFI flip → ${newDir} pressure | ${ofiPct}% | Z:${zStr}`;
      }
    }
    // EVENT 3: VPIN level change (toxicity warning)
    else if (vpinLevel !== this.prev.vpinLevel && this.prev.vpinLevel !== null) {
      event = 'vpin_change';
      if (vpinLevel === 'toxic') {
        logType = 'risk';
        message = `[${C.sym(sym)}] ${C.price(price)} | VPIN:${C.danger(vpinPct + '% TOXIC')} | Informed flow detected | Hold`;
      } else if (vpinLevel === 'elevated' && this.prev.vpinLevel === 'normal') {
        message = `[${C.sym(sym)}] ${C.price(price)} | VPIN:${C.warn(vpinPct + '%')} elevated | Monitoring toxicity`;
      } else if (vpinLevel === 'normal' && this.prev.vpinLevel === 'toxic') {
        message = `[${C.sym(sym)}] ${C.price(price)} | VPIN:${C.ok(vpinPct + '%')} normalized | Flow clean`;
      }
    }
    
    // Update state tracking
    this.prev.zRegime = zRegime;
    this.prev.ofiDir = ofiDir;
    this.prev.vpinLevel = vpinLevel;
    this.prev.position = position;
    
    // Return event or null (silence = professional scanning)
    if (event && message) {
      this.lastLogHash = `${event}-${zRegime}-${ofiDir}-${vpinLevel}`;
      return { type: logType, message, logToSession: logType === 'signal' || logType === 'risk' };
    }
    
    return null;
  }

  reset() { 
    this.lastLogHash = null;
    this.lastLogTime = 0;
    this.eventCounter = 0;
    this._lastWarmupMilestone = 0;
    this.prev = {
      zRegime: null,
      ofiDir: null,
      vpinLevel: null,
      position: 0,
      ready: false,
    };
  }
}

function createEngine(strategyId, symbol) { return new SmartLogsEngine(strategyId, symbol); }
module.exports = { SmartLogsEngine, createEngine, CONFIG, C };
