/**
 * Smart Logs Engine - Institutional HFT Terminal
 * Professional hedge fund terminology with extensive message variety
 * Imports 50 messages per phase from strategy-specific files
 */

'use strict';

const chalk = require('chalk');
const HQX2B = require('./smart-logs-hqx2b');
const QUANT = require('./smart-logs-quant');

const CONFIG = { MAX_RECENT: 80, SESSION_LOG_INTERVAL: 10 };

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

class SmartLogsEngine {
  constructor(strategyId, symbol) {
    this.strategyId = strategyId || 'hqx-2b';
    this.symbolCode = symbol;
    this.counter = 0;
    this.recent = [];
  }

  setSymbol(s) { this.symbolCode = s; }

  _unique(gen, d) {
    let msg, i = 0;
    do { msg = gen(d); i++; } while (this.recent.includes(msg) && i < 15);
    this.recent.push(msg);
    if (this.recent.length > CONFIG.MAX_RECENT) this.recent.shift();
    return msg;
  }

  getLog(state = {}) {
    this.counter++;
    const { trend = 'neutral', position = 0, zones = 0, swings = 0, bars = 0,
            price = 0, delta = 0, buyPct = 50, tickCount = 0,
            zScore = 0, vpin = 0, ofi = 0, setupForming = false } = state;

    const isQuant = this.strategyId !== 'hqx-2b';
    const T = isQuant ? QUANT : HQX2B;

    const d = {
      sym: getSym(this.symbolCode),
      price: price > 0 ? price.toFixed(2) : '-.--',
      delta, zones, swings, bars,
      ticks: tickCount > 1000 ? `${(tickCount/1000).toFixed(0)}k` : String(tickCount),
      // Real QUANT metrics from strategy (keep sign for direction)
      zScore: zScore.toFixed(2),
      zScoreAbs: Math.abs(zScore).toFixed(2),
      vpin: (vpin * 100).toFixed(0),
      ofi: ofi > 0 ? `+${ofi.toFixed(0)}` : ofi.toFixed(0),
      rawZScore: zScore,  // For direction calculation
    };

    if (position !== 0) {
      const side = position > 0 ? 'LONG' : 'SHORT';
      const pnl = (position > 0 && delta > 0) || (position < 0 && delta < 0) ? 'FAVOR' : 'ADVERSE';
      return {
        type: 'trade',
        message: `▶ [${d.sym}] ${side} ACTIVE @ ${d.price} | OFI: ${delta > 0 ? '+' : ''}${delta} | Flow: ${pnl}`,
        logToSession: this.counter % CONFIG.SESSION_LOG_INTERVAL === 0
      };
    }

    // Determine phase and message type based on strategy
    let gen, type;
    
    if (isQuant) {
      // QUANT: tick-based, uses zScore/vpin/ofi
      const minTicks = 50;
      const isBuilding = bars < minTicks;
      const bull = trend === 'bullish' || zScore > 1.5 || buyPct > 58;
      const bear = trend === 'bearish' || zScore < -1.5 || buyPct < 42;
      const ready = Math.abs(zScore) > 2.0 && setupForming;
      
      if (ready) { gen = T.ready; type = 'signal'; }
      else if (isBuilding) { gen = T.building; type = 'system'; }
      else if (bull) { gen = T.bull; type = 'bullish'; }
      else if (bear) { gen = T.bear; type = 'bearish'; }
      else { gen = T.zones; type = 'analysis'; }  // zones = analysis for QUANT
    } else {
      // HQX-2B: bar-based, uses zones/swings
      const minBars = 3;
      const isBuilding = bars < minBars;
      const hasZones = zones > 0 || swings >= 2;
      const bull = trend === 'bullish' || buyPct > 55;
      const bear = trend === 'bearish' || buyPct < 45;
      const ready = setupForming && zones > 0;
      
      if (ready) { gen = T.ready; type = 'signal'; }
      else if (isBuilding) { gen = T.building; type = 'system'; }
      else if (bull) { gen = T.bull; type = 'bullish'; }
      else if (bear) { gen = T.bear; type = 'bearish'; }
      else if (hasZones) { gen = T.zones; type = 'analysis'; }
      else { gen = T.neutral; type = 'analysis'; }
    }

    return { 
      type, 
      message: this._unique(gen, d), 
      logToSession: this.counter % CONFIG.SESSION_LOG_INTERVAL === 0 
    };
  }

  reset() { this.recent = []; this.counter = 0; }
}

function createEngine(strategyId, symbol) { return new SmartLogsEngine(strategyId, symbol); }
module.exports = { SmartLogsEngine, createEngine, CONFIG };
