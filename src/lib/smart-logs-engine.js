/**
 * Smart Logs Engine - Professional HF-Grade Real-Time Logs
 * =========================================================
 * 
 * REAL-TIME logs every second showing:
 * 1. Current price action
 * 2. QUANT model states (Z-Score, VPIN, OFI)
 * 3. Why we're not entering (or why we ARE entering)
 * 4. Market microstructure insights
 * 
 * NO fake messages - everything is derived from real tick data
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
   * Main entry - ALWAYS returns a UNIQUE log showing real-time market state
   * Each message is different based on actual changing market data
   */
  getLog(state = {}) {
    const sym = getSym(this.symbolCode);
    const price = state.price > 0 ? state.price.toFixed(2) : null;
    const { position = 0, zScore = 0, vpin = 0, ofi = 0, tickCount = 0, bars = 0, delta = 0, buyPct = 50 } = state;
    
    // Track price movement for context
    const priceNum = state.price || 0;
    const lastPrice = this._lastPrice || priceNum;
    const priceDiff = priceNum - lastPrice;
    const priceDir = priceDiff > 0.01 ? '▲' : priceDiff < -0.01 ? '▼' : '•';
    const priceDirColor = priceDiff > 0 ? C.bull : priceDiff < 0 ? C.bear : C.dim;
    this._lastPrice = priceNum;
    
    // Track tick velocity
    const lastTicks = this._lastTicks || 0;
    const tickVelocity = (tickCount || bars || 0) - lastTicks;
    this._lastTicks = tickCount || bars || 0;
    
    // Not enough data - still warming up
    const dataPoints = bars || tickCount || 0;
    if (dataPoints < 50 || !price) {
      const pct = Math.min(100, Math.round((dataPoints / 50) * 100));
      const remaining = 50 - dataPoints;
      return {
        type: 'system',
        message: `[${C.sym(sym)}] ${price ? C.price(price) : '-.--'} | Calibrating ${C.val(pct + '%')} | ${remaining} samples to ready | +${tickVelocity}/s`,
        logToSession: false
      };
    }
    
    // Compute current states with precision for uniqueness
    const absZ = Math.abs(zScore);
    const ofiPct = (ofi * 100).toFixed(0);
    const vpinPct = (vpin * 100).toFixed(0);
    const buyPctRound = Math.round(buyPct || 50);
    const deltaRound = Math.round(delta || 0);
    
    // Z-Score color based on level
    const zColor = absZ >= CONFIG.Z_EXTREME ? C.valHigh : 
                   absZ >= CONFIG.Z_HIGH ? C.warn : 
                   absZ >= CONFIG.Z_BUILDING ? C.val : C.dim;
    const zStr = zColor(`${zScore.toFixed(2)}σ`);
    
    // OFI color based on direction
    const ofiColor = ofi > CONFIG.OFI_THRESHOLD ? C.bull : 
                     ofi < -CONFIG.OFI_THRESHOLD ? C.bear : C.dim;
    const ofiStr = ofiColor(`${ofi >= 0 ? '+' : ''}${ofiPct}%`);
    
    // VPIN color based on toxicity
    const vpinColor = vpin > CONFIG.VPIN_TOXIC ? C.danger : 
                      vpin > CONFIG.VPIN_ELEVATED ? C.warn : C.ok;
    const vpinStr = vpinColor(`${vpinPct}%`);
    
    // Delta (buy-sell imbalance) display
    const deltaColor = deltaRound > 0 ? C.bull : deltaRound < 0 ? C.bear : C.dim;
    const deltaStr = deltaColor(`${deltaRound > 0 ? '+' : ''}${deltaRound}`);
    
    // Active position - show position management with unique data
    if (position !== 0) {
      const isLong = position > 0;
      const side = isLong ? C.long('LONG') : C.short('SHORT');
      const flowFavor = (isLong && ofi > 0) || (!isLong && ofi < 0);
      const flowLabel = flowFavor ? C.ok('aligned') : C.warn('adverse');
      const exitClose = absZ < 0.5;
      const exitInfo = exitClose ? C.warn('EXIT ZONE') : 'holding';
      
      return {
        type: 'trade',
        message: `[${C.sym(sym)}] ${side} ${priceDirColor(priceDir)} ${C.price(price)} | Z:${zStr} ${exitInfo} | Δ:${deltaStr} | Flow:${flowLabel}`,
        logToSession: false
      };
    }
    
    // No position - show WHY we're not entering with unique context each time
    const direction = zScore < 0 ? 'LONG' : 'SHORT';
    const dirColor = zScore < 0 ? C.long : C.short;
    
    let logType = 'analysis';
    let message;
    
    // VPIN toxic - highest priority blocker
    if (vpin > CONFIG.VPIN_TOXIC) {
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${C.price(price)} | VPIN:${vpinStr} ${C.danger('TOXIC')} | Z:${zStr} | Δ:${deltaStr} | Hold`;
      logType = 'risk';
    }
    // Z-Score extreme + OFI confirms = SIGNAL
    else if (absZ >= CONFIG.Z_EXTREME && 
             ((zScore < 0 && ofi > CONFIG.OFI_THRESHOLD) || (zScore > 0 && ofi < -CONFIG.OFI_THRESHOLD))) {
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${C.price(price)} | Z:${zStr} ${C.signal('EXTREME')} | OFI:${ofiStr} ${C.ok('✓')} | ${dirColor(direction)} SIGNAL`;
      logType = 'signal';
    }
    // Z-Score extreme but OFI doesn't confirm
    else if (absZ >= CONFIG.Z_EXTREME) {
      const ofiNeed = zScore < 0 ? `need >${15}%` : `need <-${15}%`;
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${C.price(price)} | Z:${zStr} ${C.signal('!')} | OFI:${ofiStr} ${ofiNeed} | ${C.warn('pending')}`;
      logType = 'signal';
    }
    // Z-Score high - setup forming
    else if (absZ >= CONFIG.Z_HIGH) {
      const needed = (CONFIG.Z_EXTREME - absZ).toFixed(2);
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${C.price(price)} | Z:${zStr} +${needed}σ to signal | OFI:${ofiStr} | Δ:${deltaStr}`;
    }
    // Z-Score building
    else if (absZ >= CONFIG.Z_BUILDING) {
      const needed = (CONFIG.Z_HIGH - absZ).toFixed(2);
      const bias = zScore < 0 ? 'bid' : 'ask';
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${C.price(price)} | Z:${zStr} ${bias} pressure | +${needed}σ to setup | Δ:${deltaStr}`;
    }
    // Z-Score neutral - scanning
    else {
      // Cycle through different useful info each second to avoid repetition
      const infoType = Math.floor(Date.now() / 1000) % 4;
      let context;
      switch (infoType) {
        case 0:
          context = `Δ:${deltaStr} | Buy:${buyPctRound}%`;
          break;
        case 1:
          context = `VPIN:${vpinStr} | OFI:${ofiStr}`;
          break;
        case 2:
          context = `${tickVelocity} ticks/s | Δ:${deltaStr}`;
          break;
        default:
          context = `OFI:${ofiStr} | Buy:${buyPctRound}%`;
      }
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${C.price(price)} | Z:${zStr} scanning | ${context}`;
    }
    
    return { type: logType, message, logToSession: logType === 'signal' };
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
