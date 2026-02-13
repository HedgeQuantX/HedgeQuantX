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

// Rich color helpers for professional HF display
const C = {
  // Symbol - bright cyan
  sym: (s) => chalk.hex('#00FFFF').bold(s),
  
  // Price - bright white/yellow
  price: (p) => chalk.hex('#FFFFFF').bold(p),
  priceUp: (p) => chalk.hex('#00FF00').bold(p),
  priceDown: (p) => chalk.hex('#FF4444').bold(p),
  
  // Direction
  long: (s) => chalk.hex('#00FF00').bold(s),
  short: (s) => chalk.hex('#FF4444').bold(s),
  bull: (s) => chalk.hex('#00DD00')(s),
  bear: (s) => chalk.hex('#FF6666')(s),
  
  // Values & metrics
  val: (v) => chalk.hex('#00BFFF')(v),           // Deep sky blue
  valHigh: (v) => chalk.hex('#FF00FF').bold(v),  // Magenta for extreme
  zscore: (v) => chalk.hex('#FFD700')(v),        // Gold for Z-score
  
  // Status indicators
  ok: (s) => chalk.hex('#00FF00')(s),
  warn: (s) => chalk.hex('#FFA500').bold(s),     // Orange warning
  danger: (s) => chalk.hex('#FF0000').bold(s),   // Red danger
  
  // Neutral/info
  dim: (s) => chalk.hex('#888888')(s),
  info: (s) => chalk.hex('#AAAAAA')(s),
  muted: (s) => chalk.hex('#666666')(s),
  
  // Special states
  signal: (s) => chalk.hex('#FFFF00').bold(s),   // Bright yellow signal
  toxic: (s) => chalk.hex('#FF0000').bgHex('#330000').bold(s),
  
  // Labels
  label: (s) => chalk.hex('#888888')(s),
  separator: () => chalk.hex('#444444')('|'),
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
    const priceDir = priceDiff > 0.01 ? '▲' : priceDiff < -0.01 ? '▼' : '─';
    const priceDirColor = priceDiff > 0 ? C.bull : priceDiff < 0 ? C.bear : C.muted;
    const priceDisplay = priceDiff > 0 ? C.priceUp(price) : priceDiff < 0 ? C.priceDown(price) : C.price(price);
    this._lastPrice = priceNum;
    
    // Track tick velocity
    const lastTicks = this._lastTicks || 0;
    const tickVelocity = (tickCount || bars || 0) - lastTicks;
    this._lastTicks = tickCount || bars || 0;
    
    // Not enough data - still warming up
    // HQX Scalping is a TICK strategy - needs minimum ticks for QUANT models
    const tickTotal = tickCount || 0;
    const minTicks = 500; // Minimum ticks needed for Z-score, VPIN, OFI calculations
    
    if (tickTotal < minTicks || !price) {
      const pct = Math.min(100, Math.round((tickTotal / minTicks) * 100));
      const remaining = minTicks - tickTotal;
      const pctColor = pct < 30 ? C.warn : pct < 70 ? C.val : C.ok;
      return {
        type: 'system',
        message: `[${C.sym(sym)}] ${price ? C.price(price) : C.dim('-.--')} ${C.separator()} ${C.label('Calibrating')} ${pctColor(pct + '%')} ${C.separator()} ${C.val(tickTotal + '/' + minTicks)} ${C.label('ticks')} ${C.separator()} ${C.val('+' + tickVelocity + '/s')}`,
        logToSession: false
      };
    }
    
    // Compute current states with precision for uniqueness
    const absZ = Math.abs(zScore);
    const ofiPct = (ofi * 100).toFixed(0);
    const vpinPct = (vpin * 100).toFixed(0);
    const buyPctRound = Math.round(buyPct || 50);
    const deltaRound = Math.round(delta || 0);
    
    // Z-Score color based on level - more vivid
    const zColor = absZ >= CONFIG.Z_EXTREME ? C.valHigh : 
                   absZ >= CONFIG.Z_HIGH ? C.signal : 
                   absZ >= CONFIG.Z_BUILDING ? C.zscore : C.muted;
    const zStr = zColor(`${zScore.toFixed(2)}σ`);
    
    // OFI color based on direction - more vivid
    const ofiColor = ofi > CONFIG.OFI_STRONG ? C.long :
                     ofi > CONFIG.OFI_THRESHOLD ? C.bull : 
                     ofi < -CONFIG.OFI_STRONG ? C.short :
                     ofi < -CONFIG.OFI_THRESHOLD ? C.bear : C.muted;
    const ofiStr = ofiColor(`${ofi >= 0 ? '+' : ''}${ofiPct}%`);
    
    // VPIN color based on toxicity - more vivid
    const vpinColor = vpin > CONFIG.VPIN_TOXIC ? C.toxic : 
                      vpin > CONFIG.VPIN_ELEVATED ? C.warn : C.ok;
    const vpinStr = vpinColor(`${vpinPct}%`);
    
    // Delta (buy-sell imbalance) display - more vivid
    const deltaAbs = Math.abs(deltaRound);
    const deltaColor = deltaRound > 50 ? C.long : deltaRound > 0 ? C.bull : 
                       deltaRound < -50 ? C.short : deltaRound < 0 ? C.bear : C.muted;
    const deltaStr = deltaColor(`${deltaRound > 0 ? '+' : ''}${deltaRound}`);
    
    // Buy percentage color
    const buyColor = buyPctRound > 60 ? C.bull : buyPctRound < 40 ? C.bear : C.muted;
    const buyStr = buyColor(`${buyPctRound}%`);
    
    // Active position - show position management with unique data
    if (position !== 0) {
      const isLong = position > 0;
      const side = isLong ? C.long('● LONG') : C.short('● SHORT');
      const flowFavor = (isLong && ofi > 0) || (!isLong && ofi < 0);
      const flowLabel = flowFavor ? C.ok('✓ aligned') : C.warn('⚠ adverse');
      const exitClose = absZ < 0.5;
      const exitInfo = exitClose ? C.warn('⚡ EXIT ZONE') : C.ok('holding');
      
      return {
        type: 'trade',
        message: `[${C.sym(sym)}] ${side} ${priceDirColor(priceDir)} ${priceDisplay} ${C.separator()} ${C.label('Z:')}${zStr} ${exitInfo} ${C.separator()} ${C.label('Δ:')}${deltaStr} ${C.separator()} ${flowLabel}`,
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
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${priceDisplay} ${C.separator()} ${C.label('VPIN:')}${vpinStr} ${C.toxic('☠ TOXIC')} ${C.separator()} ${C.label('Z:')}${zStr} ${C.separator()} ${C.label('Δ:')}${deltaStr} ${C.separator()} ${C.danger('NO ENTRY')}`;
      logType = 'risk';
    }
    // Z-Score extreme + OFI confirms = SIGNAL
    else if (absZ >= CONFIG.Z_EXTREME && 
             ((zScore < 0 && ofi > CONFIG.OFI_THRESHOLD) || (zScore > 0 && ofi < -CONFIG.OFI_THRESHOLD))) {
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${priceDisplay} ${C.separator()} ${C.label('Z:')}${zStr} ${C.signal('★ EXTREME')} ${C.separator()} ${C.label('OFI:')}${ofiStr} ${C.ok('✓')} ${C.separator()} ${dirColor('► ' + direction + ' SIGNAL')}`;
      logType = 'signal';
    }
    // Z-Score extreme but OFI doesn't confirm
    else if (absZ >= CONFIG.Z_EXTREME) {
      const ofiNeed = zScore < 0 ? C.dim('need >15%') : C.dim('need <-15%');
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${priceDisplay} ${C.separator()} ${C.label('Z:')}${zStr} ${C.signal('!')} ${C.separator()} ${C.label('OFI:')}${ofiStr} ${ofiNeed} ${C.separator()} ${C.warn('◐ PENDING')}`;
      logType = 'signal';
    }
    // Z-Score high - setup forming
    else if (absZ >= CONFIG.Z_HIGH) {
      const needed = (CONFIG.Z_EXTREME - absZ).toFixed(2);
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${priceDisplay} ${C.separator()} ${C.label('Z:')}${zStr} ${C.val('+' + needed + 'σ')} ${C.label('to signal')} ${C.separator()} ${C.label('OFI:')}${ofiStr} ${C.separator()} ${C.label('Δ:')}${deltaStr}`;
    }
    // Z-Score building
    else if (absZ >= CONFIG.Z_BUILDING) {
      const needed = (CONFIG.Z_HIGH - absZ).toFixed(2);
      const bias = zScore < 0 ? C.bull('bid ↑') : C.bear('ask ↓');
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${priceDisplay} ${C.separator()} ${C.label('Z:')}${zStr} ${bias} ${C.separator()} ${C.val('+' + needed + 'σ')} ${C.label('to setup')} ${C.separator()} ${C.label('Δ:')}${deltaStr}`;
    }
    // Z-Score neutral - scanning
    else {
      // Cycle through different useful info each second to avoid repetition
      const infoType = Math.floor(Date.now() / 1000) % 4;
      let context;
      switch (infoType) {
        case 0:
          context = `${C.label('Δ:')}${deltaStr} ${C.separator()} ${C.label('Buy:')}${buyStr}`;
          break;
        case 1:
          context = `${C.label('VPIN:')}${vpinStr} ${C.separator()} ${C.label('OFI:')}${ofiStr}`;
          break;
        case 2:
          context = `${C.val(tickVelocity)} ${C.label('ticks/s')} ${C.separator()} ${C.label('Δ:')}${deltaStr}`;
          break;
        default:
          context = `${C.label('OFI:')}${ofiStr} ${C.separator()} ${C.label('Buy:')}${buyStr}`;
      }
      message = `[${C.sym(sym)}] ${priceDirColor(priceDir)} ${priceDisplay} ${C.separator()} ${C.label('Z:')}${zStr} ${C.muted('scanning')} ${C.separator()} ${context}`;
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
