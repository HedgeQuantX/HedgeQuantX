/**
 * Smart Logs Engine - Event-Driven Intelligent Logs
 * Only logs when something SIGNIFICANT happens in the strategy
 * No spam, no repetitive messages - just real events
 */

'use strict';

const chalk = require('chalk');
const HQX2B = require('./smart-logs-hqx2b');
const QUANT = require('./smart-logs-quant');
const smartLogs = require('./smart-logs');

const CONFIG = { 
  SESSION_LOG_INTERVAL: 10,
  PRICE_CHANGE_TICKS: 4,      // Log when price moves 4+ ticks
  DELTA_CHANGE_THRESHOLD: 200, // Log when delta changes 200+
  ZONE_APPROACH_TICKS: 5,     // Log when within 5 ticks of zone
  LOG_INTERVAL_SECONDS: 5,    // Log every N seconds with quant data
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

class SmartLogsEngine {
  constructor(strategyId, symbol) {
    this.strategyId = strategyId || 'hqx-2b';
    this.symbolCode = symbol;
    this.counter = 0;
    this.lastState = null;
    this.lastLogTime = 0;
  }

  setSymbol(s) { this.symbolCode = s; }

  /**
   * Detect significant events by comparing current vs previous state
   * Returns array of events sorted by priority (1 = highest)
   */
  _detectEvents(current, previous) {
    if (!previous) return [{ type: 'init', priority: 5 }];
    
    const events = [];
    const tickSize = 0.25; // Default, should come from config
    
    // New bar created
    if (current.bars > previous.bars) {
      events.push({ type: 'newBar', priority: 4, data: { count: current.bars } });
    }
    
    // New swing detected
    if (current.swings > previous.swings) {
      events.push({ type: 'newSwing', priority: 2, data: { count: current.swings } });
    }
    
    // New zone created
    if (current.zones > previous.zones) {
      events.push({ type: 'newZone', priority: 1, data: { count: current.zones } });
    }
    
    // Zone approached (became near when wasn't before)
    if (current.nearZone && !previous.nearZone) {
      events.push({ type: 'approachZone', priority: 1, data: { 
        zonePrice: current.nearestSupport || current.nearestResistance 
      }});
    }
    
    // Bias flip (bull <-> bear)
    if (previous.trend && current.trend !== previous.trend && 
        current.trend !== 'neutral' && previous.trend !== 'neutral') {
      events.push({ type: 'biasFlip', priority: 2, data: { 
        from: previous.trend, to: current.trend 
      }});
    }
    
    // Significant price move (4+ ticks)
    if (current.price > 0 && previous.price > 0) {
      const priceDiff = Math.abs(current.price - previous.price);
      const ticksMoved = priceDiff / tickSize;
      if (ticksMoved >= CONFIG.PRICE_CHANGE_TICKS) {
        events.push({ type: 'priceMove', priority: 3, data: { 
          from: previous.price, to: current.price, ticks: ticksMoved 
        }});
      }
    }
    
    // Delta shift (significant change in order flow)
    const deltaDiff = Math.abs(current.delta - (previous.delta || 0));
    if (deltaDiff >= CONFIG.DELTA_CHANGE_THRESHOLD) {
      events.push({ type: 'deltaShift', priority: 3, data: { 
        from: previous.delta || 0, to: current.delta 
      }});
    }
    
    // Sort by priority (lower = more important)
    return events.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Format event into display message
   */
  _formatEvent(event, state) {
    const sym = getSym(this.symbolCode);
    const price = state.price > 0 ? state.price.toFixed(2) : '-.--';
    const T = this.strategyId === 'hqx-2b' ? HQX2B : QUANT;
    
    switch (event.type) {
      case 'init':
        return { type: 'system', message: T.init({ sym, bars: state.bars, swings: state.swings, zones: state.zones }) };
      
      case 'newBar':
        return { type: 'system', message: T.newBar({ sym, bars: state.bars, price }) };
      
      case 'newSwing':
        return { type: 'analysis', message: T.newSwing({ sym, swings: state.swings, price }) };
      
      case 'newZone':
        return { type: 'signal', message: T.newZone({ sym, zones: state.zones, price }) };
      
      case 'approachZone':
        const zonePrice = event.data.zonePrice;
        const distance = zonePrice ? Math.abs(state.price - zonePrice) / 0.25 : 0;
        return { type: 'signal', message: T.approachZone({ sym, price, zonePrice: zonePrice?.toFixed(2) || 'N/A', distance: distance.toFixed(1) }) };
      
      case 'biasFlip':
        return { type: 'analysis', message: T.biasFlip({ sym, from: event.data.from, to: event.data.to, delta: state.delta }) };
      
      case 'priceMove':
        const dir = event.data.to > event.data.from ? 'up' : 'down';
        return { type: 'analysis', message: T.priceMove({ sym, price, dir, ticks: event.data.ticks.toFixed(1) }) };
      
      case 'deltaShift':
        return { type: 'analysis', message: T.deltaShift({ sym, from: event.data.from, to: event.data.to }) };
      
      default:
        return null;
    }
  }

  getLog(state = {}) {
    this.counter++;
    const { position = 0, delta = 0, zScore = 0, vpin = 0, ofi = 0 } = state;
    const sym = getSym(this.symbolCode);
    const price = state.price > 0 ? state.price.toFixed(2) : '-.--';
    const T = this.strategyId === 'hqx-2b' ? HQX2B : QUANT;
    const now = Date.now();

    // Active position - always log
    if (position !== 0) {
      const side = position > 0 ? 'LONG' : 'SHORT';
      const pnl = (position > 0 && delta > 0) || (position < 0 && delta < 0) ? 'FAVOR' : 'ADVERSE';
      return {
        type: 'trade',
        message: `[${sym}] ${side} ACTIVE @ ${price} | Delta: ${delta > 0 ? '+' : ''}${delta} | Flow: ${pnl}`,
        logToSession: true
      };
    }

    // Detect events
    const events = this._detectEvents(state, this.lastState);
    this.lastState = { ...state };

    // For QUANT strategy: ALWAYS use rich QUANT-specific smart-logs with metrics
    if (this.strategyId === 'ultra-scalping') {
      const timeSinceLastLog = now - this.lastLogTime;
      
      // Log every 5 seconds with quant metrics
      if (timeSinceLastLog >= CONFIG.LOG_INTERVAL_SECONDS * 1000) {
        this.lastLogTime = now;
        
        // Still warming up - use building messages from QUANT pool
        if (state.bars < 50) {
          const d = { sym, ticks: state.bars || 0, price };
          return {
            type: 'system',
            message: QUANT.building(d),
            logToSession: this.counter % CONFIG.SESSION_LOG_INTERVAL === 0
          };
        }
        
        // Ready - use rich QUANT context messages
        // Determine market context from QUANT metrics
        // zScore: mean reversion indicator (-3 to +3)
        // vpin: toxicity 0-1 (higher = more informed trading)
        // ofi: order flow imbalance -1 to +1 (positive = buying pressure)
        const absZ = Math.abs(zScore);
        const ofiAbs = Math.abs(ofi);
        const zScoreAbs = absZ.toFixed(1);
        const vpinPct = (vpin * 100).toFixed(0);
        const ofiPct = (ofi > 0 ? '+' : '') + (ofi * 100).toFixed(0) + '%';
        
        // Build data object for QUANT message pools
        const d = { 
          sym, price, 
          zScore: zScore.toFixed(1), 
          zScoreAbs, 
          rawZScore: zScore,
          vpin: vpinPct, 
          ofi: ofiPct, 
          ticks: state.bars || 0 
        };
        
        let logType = 'analysis';
        let message;
        
        if (absZ >= 2.0) {
          // Strong signal zone - use bull/bear messages
          logType = 'signal';
          message = zScore < 0 ? QUANT.bull(d) : QUANT.bear(d);
        } else if (absZ >= 1.5) {
          // Approaching threshold - use ready messages
          logType = 'signal';
          message = QUANT.ready(d);
        } else if (absZ >= 1.0 || ofiAbs >= 0.2) {
          // Building edge - use zones messages
          message = QUANT.zones(d);
        } else {
          // Normal market - use neutral messages
          message = QUANT.neutral(d);
        }
        
        return { 
          type: logType, 
          message,
          logToSession: this.counter % CONFIG.SESSION_LOG_INTERVAL === 0 
        };
      }
      return null;
    }

    // HQX-2B strategy: event-based logging
    // No events = no log (SILENCE)
    if (events.length === 0) {
      return null;
    }

    // Format the most important event
    const log = this._formatEvent(events[0], state);
    if (log) {
      log.logToSession = this.counter % CONFIG.SESSION_LOG_INTERVAL === 0;
    }
    return log;
  }

  reset() { 
    this.lastState = null; 
    this.counter = 0; 
    this.lastLogTime = 0;
  }
}

function createEngine(strategyId, symbol) { return new SmartLogsEngine(strategyId, symbol); }
module.exports = { SmartLogsEngine, createEngine, CONFIG };
