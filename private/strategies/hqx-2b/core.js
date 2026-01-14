/**
 * =============================================================================
 * HQX-2B LIQUIDITY SWEEP STRATEGY - Core Engine
 * =============================================================================
 * 2B Pattern with Liquidity Zone Sweeps
 * 
 * DO NOT MODIFY LOGIC - validated by backtest
 */

const EventEmitter = require('events');
const { DEFAULT_CONFIG, ZoneType } = require('./config');
const { generateSignal } = require('./signal');
const { detectSwings, updateZones, detectSweep } = require('./detection');

/**
 * Deep merge config objects
 */
function mergeConfig(defaults, custom) {
  const result = { ...defaults };
  for (const key in custom) {
    if (typeof custom[key] === 'object' && !Array.isArray(custom[key]) && custom[key] !== null) {
      result[key] = { ...defaults[key], ...custom[key] };
    } else {
      result[key] = custom[key];
    }
  }
  return result;
}

class HQX2BLiquiditySweep extends EventEmitter {
  constructor(config = {}) {
    super();

    // Merge config with defaults
    this.config = mergeConfig(DEFAULT_CONFIG, config);
    this.tickSize = this.config.tickSize;
    this.tickValue = this.config.tickValue;

    // State
    this.barHistory = new Map();      // contractId -> Bar[]
    this.swingPoints = new Map();     // contractId -> SwingPoint[]
    this.liquidityZones = new Map();  // contractId -> LiquidityZone[]

    // Bar aggregation (1-minute bars from ticks)
    this.currentBar = new Map();      // contractId -> { open, high, low, close, volume, startTime }
    this.barIntervalMs = 60000;       // 1 minute = 60000ms

    // Tracking
    this.lastSignalTime = 0;
    this.stats = { signals: 0, trades: 0, wins: 0, losses: 0, pnl: 0 };
    this.recentTrades = [];
  }

  initialize(contractId, tickSize = 0.25, tickValue = 5.0) {
    this.tickSize = tickSize;
    this.tickValue = tickValue;
    this.config.tickSize = tickSize;
    this.config.tickValue = tickValue;

    this.barHistory.set(contractId, []);
    this.swingPoints.set(contractId, []);
    this.liquidityZones.set(contractId, []);
    this.currentBar.delete(contractId); // Reset bar aggregation

    this.emit('log', {
      type: 'info',
      message: `[HQX-2B] Initialized for ${contractId}: tick=${tickSize}, value=${tickValue}, TF=1min`
    });
    this.emit('log', {
      type: 'info',
      message: `[HQX-2B] Params: Stop=${this.config.execution.stopTicks}t, Target=${this.config.execution.targetTicks}t, BE=${this.config.execution.breakevenTicks}t, Trail=${this.config.execution.trailTriggerTicks}/${this.config.execution.trailDistanceTicks}`
    });
  }

  /**
   * Check if current time is within trading session (9:30-16:00 EST)
   */
  isWithinSession(timestamp) {
    if (!this.config.session.enabled) return true;
    
    const date = new Date(timestamp);
    // Convert to EST (UTC-5, or UTC-4 during DST)
    const estOffset = this.isDST(date) ? -4 : -5;
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    const estHours = (utcHours + estOffset + 24) % 24;
    
    const { startHour, startMinute, endHour, endMinute } = this.config.session;
    const currentMins = estHours * 60 + utcMinutes;
    const startMins = startHour * 60 + startMinute;
    const endMins = endHour * 60 + endMinute;
    
    return currentMins >= startMins && currentMins < endMins;
  }

  /**
   * Check if date is in US Daylight Saving Time
   */
  isDST(date) {
    const jan = new Date(date.getFullYear(), 0, 1);
    const jul = new Date(date.getFullYear(), 6, 1);
    const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    return date.getTimezoneOffset() < stdOffset;
  }

  /**
   * Process incoming tick and aggregate into 1-minute bars
   * Only calls processBar() when a bar closes (every 60 seconds)
   */
  processTick(tick) {
    const { contractId, price, volume, timestamp } = tick;
    const ts = timestamp || Date.now();
    const vol = volume || 1;

    // Session filter - only process during US regular hours (9:30-16:00 EST)
    if (!this.isWithinSession(ts)) {
      return null;
    }

    // Get current bar for this contract
    let bar = this.currentBar.get(contractId);
    
    // Calculate bar start time (floor to minute)
    const barStartTime = Math.floor(ts / this.barIntervalMs) * this.barIntervalMs;

    if (!bar || bar.startTime !== barStartTime) {
      // New bar period - close previous bar first if exists
      if (bar) {
        // Close the previous bar and process it
        const closedBar = {
          timestamp: bar.startTime,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume
        };
        
        // Process the closed bar through strategy logic
        const signal = this.processBar(contractId, closedBar);
        
        // Start new bar
        this.currentBar.set(contractId, {
          startTime: barStartTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: vol
        });
        
        return signal; // Return signal from closed bar
      } else {
        // First bar ever
        this.currentBar.set(contractId, {
          startTime: barStartTime,
          open: price,
          high: price,
          low: price,
          close: price,
          volume: vol
        });
        return null;
      }
    } else {
      // Same bar period - update OHLC
      bar.high = Math.max(bar.high, price);
      bar.low = Math.min(bar.low, price);
      bar.close = price;
      bar.volume += vol;
      return null; // No signal until bar closes
    }
  }

  onTick(tick) {
    return this.processTick(tick);
  }

  onTrade(trade) {
    return this.processTick({
      contractId: trade.contractId || trade.symbol,
      price: trade.price,
      volume: trade.size || trade.volume || 1,
      timestamp: trade.timestamp || Date.now()
    });
  }

  processBar(contractId, bar) {
    // Get or initialize history
    let bars = this.barHistory.get(contractId);
    if (!bars) {
      this.initialize(contractId);
      bars = this.barHistory.get(contractId);
    }

    // Add bar to history
    bars.push(bar);
    if (bars.length > 500) bars.shift();

    const currentIndex = bars.length - 1;

    // Need minimum data
    if (bars.length < this.config.swing.lookbackBars * 3) {
      return null;
    }

    // 1. Detect new swing points
    const swings = this.swingPoints.get(contractId);
    const prevSwingCount = swings.length;
    const updatedSwings = detectSwings(
      bars, 
      currentIndex, 
      swings, 
      this.config.swing,
      this.config.zone.maxZoneAgeBars
    );
    this.swingPoints.set(contractId, updatedSwings);

    // Debug: Log new swing detection
    if (updatedSwings.length > prevSwingCount) {
      const newSwing = updatedSwings[updatedSwings.length - 1];
      this.emit('log', {
        type: 'debug',
        message: `[2B] NEW SWING ${newSwing.type.toUpperCase()} @ ${newSwing.price.toFixed(2)} | Total: ${updatedSwings.length}`
      });
    }

    // 2. Update liquidity zones from swings
    const zones = this.liquidityZones.get(contractId);
    const prevZoneCount = zones.length;
    const updatedZones = updateZones(
      updatedSwings,
      zones,
      currentIndex,
      this.config.zone,
      this.tickSize
    );
    this.liquidityZones.set(contractId, updatedZones);

    // Debug: Log new zone formation
    if (updatedZones.length > prevZoneCount) {
      const newZone = updatedZones[updatedZones.length - 1];
      this.emit('log', {
        type: 'debug',
        message: `[2B] NEW ZONE ${newZone.type.toUpperCase()} @ ${newZone.getLevel().toFixed(2)} | Total: ${updatedZones.length}`
      });
    }

    // 3. Detect sweeps of zones
    const sweep = detectSweep(
      updatedZones,
      bars,
      currentIndex,
      this.config.sweep,
      this.config.zone,
      this.tickSize
    );

    // Debug: Log sweep detection attempts
    if (sweep) {
      this.emit('log', {
        type: 'debug',
        message: `[2B] SWEEP ${sweep.sweepType} | Valid: ${sweep.isValid} | Pen: ${sweep.penetrationTicks.toFixed(1)}t | Q: ${(sweep.qualityScore * 100).toFixed(0)}%`
      });
    }

    // 4. If valid sweep completed, generate signal
    if (sweep && sweep.isValid) {
      // Cooldown check
      if (Date.now() - this.lastSignalTime < this.config.execution.cooldownMs) {
        return null;
      }

      const signal = generateSignal({
        contractId,
        currentBar: bar,
        currentIndex,
        sweep,
        config: this.config,
        tickSize: this.tickSize
      });

      if (signal) {
        this.lastSignalTime = Date.now();
        this.stats.signals++;

        // Emit signal
        this.emit('signal', {
          side: signal.direction === 'long' ? 'buy' : 'sell',
          action: 'open',
          reason: `2B ${sweep.sweepType} | Pen:${sweep.penetrationTicks.toFixed(1)}t | Vol:${sweep.volumeRatio.toFixed(1)}x | Q:${(sweep.qualityScore * 100).toFixed(0)}%`,
          ...signal
        });

        this.emit('log', {
          type: 'info',
          message: `[HQX-2B] SIGNAL: ${signal.direction.toUpperCase()} @ ${bar.close.toFixed(2)} | ${sweep.sweepType} | Pen:${sweep.penetrationTicks.toFixed(1)}t Vol:${sweep.volumeRatio.toFixed(1)}x | Conf:${(signal.confidence * 100).toFixed(0)}%`
        });

        return signal;
      }
    }

    return null;
  }

  getAnalysisState(contractId, currentPrice) {
    const bars = this.barHistory.get(contractId) || [];
    const zones = this.liquidityZones.get(contractId) || [];
    const swings = this.swingPoints.get(contractId) || [];

    if (bars.length < 20) {
      return { ready: false, message: `Collecting data... ${bars.length}/20 bars` };
    }

    // Find nearest zones
    const sortedZones = zones
      .map(z => ({ zone: z, distance: Math.abs(currentPrice - z.getLevel()) }))
      .sort((a, b) => a.distance - b.distance);

    const nearestResistance = sortedZones.find(z => z.zone.type === ZoneType.RESISTANCE);
    const nearestSupport = sortedZones.find(z => z.zone.type === ZoneType.SUPPORT);

    return {
      ready: true,
      barsProcessed: bars.length,
      swingsDetected: swings.length,
      activeZones: zones.length,
      nearestResistance: nearestResistance ? nearestResistance.zone.getLevel() : null,
      nearestSupport: nearestSupport ? nearestSupport.zone.getLevel() : null,
      stopTicks: this.config.execution.stopTicks,
      targetTicks: this.config.execution.targetTicks,
      strategy: 'HQX-2B Liquidity Sweep (Optimized)'
    };
  }

  recordTradeResult(pnl) {
    this.recentTrades.push({ netPnl: pnl, timestamp: Date.now() });
    if (this.recentTrades.length > 100) this.recentTrades.shift();

    if (pnl > 0) {
      this.stats.wins++;
    } else {
      this.stats.losses++;
    }

    this.stats.trades++;
    this.stats.pnl += pnl;

    this.emit('log', {
      type: 'debug',
      message: `[HQX-2B] Trade result: ${pnl > 0 ? 'WIN' : 'LOSS'} $${pnl.toFixed(2)}`
    });
  }

  getBarHistory(contractId) {
    return this.barHistory.get(contractId) || [];
  }

  getStats() {
    return this.stats;
  }

  reset(contractId) {
    this.barHistory.set(contractId, []);
    this.swingPoints.set(contractId, []);
    this.liquidityZones.set(contractId, []);
    this.currentBar.delete(contractId); // Reset bar aggregation

    this.emit('log', {
      type: 'info',
      message: `[HQX-2B] Reset state for ${contractId}`
    });
  }
}

module.exports = { HQX2BLiquiditySweep };
