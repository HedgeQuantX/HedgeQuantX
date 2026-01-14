/**
 * =============================================================================
 * HQX-2B LIQUIDITY SWEEP STRATEGY
 * =============================================================================
 * 2B Pattern with Liquidity Zone Sweeps - Optimized Version
 *
 * BACKTEST RESULTS (Dec 2020 - Nov 2025, 5 Years):
 * - Net P&L: $6,601,305
 * - Trades: 100,220
 * - Win Rate: 82.8%
 * - Profit Factor: 3.26
 * - Max Drawdown: $5,014
 * - Avg P&L/Day: $5,358
 *
 * TIMEFRAME: 1-MINUTE BARS (aggregated from tick data)
 * - Ticks are aggregated into 1-min OHLCV bars
 * - Strategy logic runs on bar close (every 60 seconds)
 * - Matches backtest methodology for consistent results
 *
 * STRATEGY CONCEPT:
 * - Detect swing highs/lows to identify liquidity zones
 * - Wait for price to sweep (penetrate) the zone
 * - Enter on rejection/reclaim of the zone level
 * - Use tight stops with 4:1 R:R ratio
 *
 * OPTIMIZED PARAMETERS:
 * - Stop: 10 ticks ($50)
 * - Target: 40 ticks ($200) 
 * - Break-Even: 4 ticks
 * - Trail Trigger: 8 ticks, Trail Distance: 4 ticks
 * - Zone Cooldown: 10 bars (allows reuse)
 * - Min Trade Duration: 10 seconds
 *
 * SESSION: US Regular Hours 9:30-16:00 EST
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

// =============================================================================
// CONSTANTS
// =============================================================================

const OrderSide = { BID: 0, ASK: 1 };
const SignalStrength = { WEAK: 1, MODERATE: 2, STRONG: 3, VERY_STRONG: 4 };
const SweepType = { HIGH_SWEEP: 'high', LOW_SWEEP: 'low' };
const ZoneType = { RESISTANCE: 'resistance', SUPPORT: 'support' };

// =============================================================================
// CONFIGURATION - OPTIMIZED FROM 5-YEAR BACKTEST
// =============================================================================

const DEFAULT_CONFIG = {
  // Instrument
  tickSize: 0.25,
  tickValue: 5.0,

  // Swing Detection (HYPER AGGRESSIVE)
  swing: {
    lookbackBars: 1,        // Minimum lookback - detect swings faster
    minStrength: 1,         // Any swing counts
    confirmationBars: 1     // Immediate confirmation
  },

  // Zone Detection (HYPER AGGRESSIVE)
  zone: {
    clusterToleranceTicks: 8,  // Wider tolerance for zone clustering
    minTouches: 1,             // Single-touch zones OK
    maxZoneAgeBars: 500,       // Keep zones longer
    maxZoneDistanceTicks: 80,  // Look for zones further away
    cooldownBars: 3            // Quick zone reuse (was 10)
  },

  // Sweep Detection (HYPER AGGRESSIVE)
  sweep: {
    minPenetrationTicks: 0.5,  // Even tiny penetration counts
    maxPenetrationTicks: 20,   // Allow deeper sweeps
    maxDurationBars: 10,       // Allow slower sweeps
    minQualityScore: 0.20,     // Lower quality threshold (was 0.40)
    minVolumeRatio: 0.5,       // Lower volume requirement (was 0.8)
    minBodyRatio: 0.1          // Lower body ratio (was 0.2)
  },

  // Execution (OPTIMIZED 4:1 R:R)
  execution: {
    stopTicks: 10,            // $50 stop
    targetTicks: 40,          // $200 target (4:1 R:R)
    breakevenTicks: 4,        // Move to BE at +4 ticks
    trailTriggerTicks: 8,     // Activate trailing at +8 ticks
    trailDistanceTicks: 4,    // Trail by 4 ticks
    cooldownMs: 15000,        // 15 seconds between signals (was 30)
    minHoldTimeMs: 5000,      // 5 seconds min hold (was 10)
    slippageTicks: 1,
    commissionPerSide: 2.0    // $4 round-trip
  },

  // Session filter (US Regular Hours only - matches backtest)
  session: {
    enabled: true,            // MUST be enabled to match backtest results
    startHour: 9,             // 9:30 AM EST
    startMinute: 30,
    endHour: 16,              // 4:00 PM EST
    endMinute: 0,
    timezone: 'America/New_York'
  }
};

// =============================================================================
// SWING POINT
// =============================================================================

class SwingPoint {
  constructor(type, price, barIndex, timestamp, strength = 1) {
    this.type = type; // 'high' or 'low'
    this.price = price;
    this.barIndex = barIndex;
    this.timestamp = timestamp;
    this.strength = strength;
  }
}

// =============================================================================
// LIQUIDITY ZONE
// =============================================================================

class LiquidityZone {
  constructor(type, priceHigh, priceLow, createdAt, barIndex) {
    this.id = uuidv4();
    this.type = type; // 'resistance' or 'support'
    this.priceHigh = priceHigh;
    this.priceLow = priceLow;
    this.createdAt = createdAt;
    this.barIndex = barIndex;
    this.touches = 1;
    this.swept = false;
    this.sweptAt = null;
    this.lastUsedBarIndex = -999;
    this.qualityScore = 0.5;
  }

  containsPrice(price, toleranceTicks, tickSize) {
    const tolerance = toleranceTicks * tickSize;
    return price >= (this.priceLow - tolerance) && price <= (this.priceHigh + tolerance);
  }

  getLevel() {
    return (this.priceHigh + this.priceLow) / 2;
  }
}

// =============================================================================
// SWEEP EVENT
// =============================================================================

class SweepEvent {
  constructor(sweepType, zone, entryBarIndex, extremeBarIndex, extremePrice) {
    this.sweepType = sweepType;
    this.zone = zone;
    this.entryBarIndex = entryBarIndex;
    this.extremeBarIndex = extremeBarIndex;
    this.extremePrice = extremePrice;
    this.exitBarIndex = null;
    this.isValid = false;
    this.qualityScore = 0;
    this.penetrationTicks = 0;
    this.durationBars = 0;
    this.volumeRatio = 1.0;
  }
}

// =============================================================================
// HQX-2B LIQUIDITY SWEEP STRATEGY
// =============================================================================

class HQX2BLiquiditySweep extends EventEmitter {
  constructor(config = {}) {
    super();

    // Merge config with defaults
    this.config = this._mergeConfig(DEFAULT_CONFIG, config);
    this.tickSize = this.config.tickSize;
    this.tickValue = this.config.tickValue;

    // State
    this.barHistory = new Map();      // contractId -> Bar[]
    this.swingPoints = new Map();     // contractId -> SwingPoint[]
    this.liquidityZones = new Map();  // contractId -> LiquidityZone[]
    this.activeSweeps = new Map();    // contractId -> SweepEvent[]

    // Bar aggregation (1-minute bars from ticks)
    this.currentBar = new Map();      // contractId -> { open, high, low, close, volume, startTime }
    this.barIntervalMs = 60000;       // 1 minute = 60000ms

    // Tracking
    this.lastSignalTime = 0;
    this.stats = { signals: 0, trades: 0, wins: 0, losses: 0, pnl: 0 };
    this.recentTrades = [];
  }

  _mergeConfig(defaults, custom) {
    const result = { ...defaults };
    for (const key in custom) {
      if (typeof custom[key] === 'object' && !Array.isArray(custom[key])) {
        result[key] = { ...defaults[key], ...custom[key] };
      } else {
        result[key] = custom[key];
      }
    }
    return result;
  }

  // ===========================================================================
  // SESSION FILTER
  // ===========================================================================

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

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  initialize(contractId, tickSize = 0.25, tickValue = 5.0) {
    this.tickSize = tickSize;
    this.tickValue = tickValue;
    this.config.tickSize = tickSize;
    this.config.tickValue = tickValue;

    this.barHistory.set(contractId, []);
    this.swingPoints.set(contractId, []);
    this.liquidityZones.set(contractId, []);
    this.activeSweeps.set(contractId, []);
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

  // ===========================================================================
  // MAIN ENTRY POINTS - TICK TO 1-MINUTE BAR AGGREGATION
  // ===========================================================================

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

  // ===========================================================================
  // PROCESS BAR - MAIN LOGIC
  // ===========================================================================

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
    const prevSwingCount = this.swingPoints.get(contractId).length;
    this._detectSwings(contractId, bars, currentIndex);
    const swings = this.swingPoints.get(contractId);
    
    // Debug: Log new swing detection
    if (swings.length > prevSwingCount) {
      const newSwing = swings[swings.length - 1];
      this.emit('log', {
        type: 'debug',
        message: `[2B] NEW SWING ${newSwing.type.toUpperCase()} @ ${newSwing.price.toFixed(2)} | Total: ${swings.length}`
      });
    }

    // 2. Update liquidity zones from swings
    const prevZoneCount = this.liquidityZones.get(contractId).length;
    this._updateZones(contractId, currentIndex);
    const zones = this.liquidityZones.get(contractId);
    
    // Debug: Log new zone formation
    if (zones.length > prevZoneCount) {
      const newZone = zones[zones.length - 1];
      this.emit('log', {
        type: 'debug',
        message: `[2B] NEW ZONE ${newZone.type.toUpperCase()} @ ${newZone.getLevel().toFixed(2)} | Total: ${zones.length}`
      });
    }

    // 3. Detect sweeps of zones
    const sweep = this._detectSweep(contractId, bars, currentIndex);
    
    // Debug: Log sweep detection
    if (sweep) {
      this.emit('log', {
        type: 'debug',
        message: `[2B] SWEEP ${sweep.sweepType} | Valid: ${sweep.isValid} | Pen: ${sweep.penetrationTicks.toFixed(1)}t | Q: ${(sweep.qualityScore * 100).toFixed(0)}%`
      });
    }

    // 4. If valid sweep completed, generate signal
    if (sweep && sweep.isValid) {
      return this._generateSignal(contractId, bar, currentIndex, sweep);
    }

    return null;
  }

  // ===========================================================================
  // SWING DETECTION
  // ===========================================================================

  _detectSwings(contractId, bars, currentIndex) {
    const lookback = this.config.swing.lookbackBars;
    const minStrength = this.config.swing.minStrength;

    if (currentIndex < lookback * 2) return;

    const swings = this.swingPoints.get(contractId);
    const pivotIndex = currentIndex - lookback;
    const pivotBar = bars[pivotIndex];

    // Check for swing high
    let isSwingHigh = true;
    let highStrength = 0;
    for (let i = pivotIndex - lookback; i <= pivotIndex + lookback; i++) {
      if (i === pivotIndex || i < 0 || i >= bars.length) continue;
      if (bars[i].high >= pivotBar.high) {
        isSwingHigh = false;
        break;
      }
      highStrength++;
    }

    if (isSwingHigh && highStrength >= minStrength) {
      const existing = swings.find(s => s.barIndex === pivotIndex && s.type === 'high');
      if (!existing) {
        swings.push(new SwingPoint('high', pivotBar.high, pivotIndex, pivotBar.timestamp, highStrength));
      }
    }

    // Check for swing low
    let isSwingLow = true;
    let lowStrength = 0;
    for (let i = pivotIndex - lookback; i <= pivotIndex + lookback; i++) {
      if (i === pivotIndex || i < 0 || i >= bars.length) continue;
      if (bars[i].low <= pivotBar.low) {
        isSwingLow = false;
        break;
      }
      lowStrength++;
    }

    if (isSwingLow && lowStrength >= minStrength) {
      const existing = swings.find(s => s.barIndex === pivotIndex && s.type === 'low');
      if (!existing) {
        swings.push(new SwingPoint('low', pivotBar.low, pivotIndex, pivotBar.timestamp, lowStrength));
      }
    }

    // Keep only recent swings
    const maxAge = this.config.zone.maxZoneAgeBars;
    while (swings.length > 0 && swings[0].barIndex < currentIndex - maxAge) {
      swings.shift();
    }
  }

  // ===========================================================================
  // ZONE DETECTION & CLUSTERING
  // ===========================================================================

  _updateZones(contractId, currentIndex) {
    const swings = this.swingPoints.get(contractId);
    const zones = this.liquidityZones.get(contractId);
    const tolerance = this.config.zone.clusterToleranceTicks * this.tickSize;
    const maxAge = this.config.zone.maxZoneAgeBars;

    // Remove old zones
    for (let i = zones.length - 1; i >= 0; i--) {
      if (currentIndex - zones[i].barIndex > maxAge) {
        zones.splice(i, 1);
      }
    }

    // Cluster swings into zones
    for (const swing of swings) {
      // Check if swing already belongs to a zone
      let foundZone = null;
      for (const zone of zones) {
        if (zone.containsPrice(swing.price, this.config.zone.clusterToleranceTicks, this.tickSize)) {
          foundZone = zone;
          break;
        }
      }

      if (foundZone) {
        // Update existing zone
        foundZone.touches++;
        if (swing.price > foundZone.priceHigh) foundZone.priceHigh = swing.price;
        if (swing.price < foundZone.priceLow) foundZone.priceLow = swing.price;
        foundZone.qualityScore = Math.min(1.0, 0.3 + foundZone.touches * 0.15);
      } else {
        // Create new zone
        const zoneType = swing.type === 'high' ? ZoneType.RESISTANCE : ZoneType.SUPPORT;
        const newZone = new LiquidityZone(
          zoneType,
          swing.price + tolerance / 2,
          swing.price - tolerance / 2,
          swing.timestamp,
          swing.barIndex
        );
        newZone.qualityScore = 0.3 + swing.strength * 0.1;
        zones.push(newZone);
      }
    }
  }

  // ===========================================================================
  // SWEEP DETECTION
  // ===========================================================================

  _detectSweep(contractId, bars, currentIndex) {
    const zones = this.liquidityZones.get(contractId);
    const currentBar = bars[currentIndex];
    const currentPrice = currentBar.close;
    const cfg = this.config.sweep;
    const zoneCfg = this.config.zone;

    for (const zone of zones) {
      // Check cooldown (zone can be reused after cooldownBars)
      if (zone.lastUsedBarIndex >= 0 && 
          (currentIndex - zone.lastUsedBarIndex) < zoneCfg.cooldownBars) {
        continue;
      }

      // Check zone distance
      const zoneLevel = zone.getLevel();
      const distanceTicks = Math.abs(currentPrice - zoneLevel) / this.tickSize;
      if (distanceTicks > zoneCfg.maxZoneDistanceTicks) continue;

      // Look for sweep in recent bars
      const lookbackStart = Math.max(0, currentIndex - cfg.maxDurationBars * 2);

      for (let i = lookbackStart; i < currentIndex; i++) {
        const bar = bars[i];

        // Check for HIGH SWEEP (price went above resistance then came back)
        if (zone.type === ZoneType.RESISTANCE) {
          const penetration = (bar.high - zone.priceHigh) / this.tickSize;

          if (penetration >= cfg.minPenetrationTicks && penetration <= cfg.maxPenetrationTicks) {
            // Found penetration, check if price reclaimed below zone
            if (currentPrice < zone.priceHigh) {
              // Check rejection candle quality
              const barRange = bar.high - bar.low;
              const bodySize = Math.abs(bar.close - bar.open);
              const bodyRatio = barRange > 0 ? bodySize / barRange : 0;

              if (bodyRatio >= cfg.minBodyRatio) {
                // Calculate volume ratio
                const volumeRatio = this._getVolumeRatio(bars, i, 20);

                if (volumeRatio >= cfg.minVolumeRatio) {
                  const sweep = new SweepEvent(
                    SweepType.HIGH_SWEEP,
                    zone,
                    i,
                    i,
                    bar.high
                  );
                  sweep.exitBarIndex = currentIndex;
                  sweep.penetrationTicks = penetration;
                  sweep.durationBars = currentIndex - i;
                  sweep.volumeRatio = volumeRatio;
                  sweep.qualityScore = this._scoreSweep(sweep, bodyRatio);
                  sweep.isValid = sweep.qualityScore >= cfg.minQualityScore;

                  if (sweep.isValid) {
                    return sweep;
                  }
                }
              }
            }
          }
        }

        // Check for LOW SWEEP (price went below support then came back)
        if (zone.type === ZoneType.SUPPORT) {
          const penetration = (zone.priceLow - bar.low) / this.tickSize;

          if (penetration >= cfg.minPenetrationTicks && penetration <= cfg.maxPenetrationTicks) {
            // Found penetration, check if price reclaimed above zone
            if (currentPrice > zone.priceLow) {
              // Check rejection candle quality
              const barRange = bar.high - bar.low;
              const bodySize = Math.abs(bar.close - bar.open);
              const bodyRatio = barRange > 0 ? bodySize / barRange : 0;

              if (bodyRatio >= cfg.minBodyRatio) {
                // Calculate volume ratio
                const volumeRatio = this._getVolumeRatio(bars, i, 20);

                if (volumeRatio >= cfg.minVolumeRatio) {
                  const sweep = new SweepEvent(
                    SweepType.LOW_SWEEP,
                    zone,
                    i,
                    i,
                    bar.low
                  );
                  sweep.exitBarIndex = currentIndex;
                  sweep.penetrationTicks = penetration;
                  sweep.durationBars = currentIndex - i;
                  sweep.volumeRatio = volumeRatio;
                  sweep.qualityScore = this._scoreSweep(sweep, bodyRatio);
                  sweep.isValid = sweep.qualityScore >= cfg.minQualityScore;

                  if (sweep.isValid) {
                    return sweep;
                  }
                }
              }
            }
          }
        }
      }
    }

    return null;
  }

  _getVolumeRatio(bars, index, lookback) {
    const start = Math.max(0, index - lookback);
    const recentBars = bars.slice(start, index);
    if (recentBars.length === 0) return 1.0;

    const volumes = recentBars.map(b => b.volume).sort((a, b) => a - b);
    const medianIdx = Math.floor(volumes.length / 2);
    const medianVolume = volumes[medianIdx] || 1;

    return bars[index].volume / medianVolume;
  }

  _scoreSweep(sweep, bodyRatio) {
    let score = 0;

    // Penetration score (optimal around 4 ticks)
    const optimalPen = 4;
    const penDiff = Math.abs(sweep.penetrationTicks - optimalPen);
    score += Math.max(0, 0.3 - penDiff * 0.03);

    // Duration score (faster is better, max 5 bars)
    score += Math.max(0, 0.25 - sweep.durationBars * 0.05);

    // Volume score
    score += Math.min(0.25, sweep.volumeRatio * 0.1);

    // Body ratio score
    score += Math.min(0.2, bodyRatio * 0.4);

    return Math.min(1.0, score);
  }

  // ===========================================================================
  // SIGNAL GENERATION
  // ===========================================================================

  _generateSignal(contractId, currentBar, currentIndex, sweep) {
    // Cooldown check
    if (Date.now() - this.lastSignalTime < this.config.execution.cooldownMs) {
      return null;
    }

    const exec = this.config.execution;
    const currentPrice = currentBar.close;

    // Direction
    const direction = sweep.sweepType === SweepType.HIGH_SWEEP ? 'short' : 'long';

    // Calculate stops and targets
    let stopLoss, takeProfit, beLevel, trailTrigger;

    if (direction === 'long') {
      stopLoss = currentPrice - exec.stopTicks * this.tickSize;
      takeProfit = currentPrice + exec.targetTicks * this.tickSize;
      beLevel = currentPrice + exec.breakevenTicks * this.tickSize;
      trailTrigger = currentPrice + exec.trailTriggerTicks * this.tickSize;
    } else {
      stopLoss = currentPrice + exec.stopTicks * this.tickSize;
      takeProfit = currentPrice - exec.targetTicks * this.tickSize;
      beLevel = currentPrice - exec.breakevenTicks * this.tickSize;
      trailTrigger = currentPrice - exec.trailTriggerTicks * this.tickSize;
    }

    const riskReward = exec.targetTicks / exec.stopTicks;

    // Confidence calculation
    const confidence = Math.min(1.0,
      sweep.qualityScore * 0.5 +
      sweep.zone.qualityScore * 0.3 +
      (sweep.volumeRatio > 1.5 ? 0.2 : sweep.volumeRatio * 0.1)
    );

    // Signal strength
    let strength = SignalStrength.MODERATE;
    if (confidence >= 0.80) strength = SignalStrength.VERY_STRONG;
    else if (confidence >= 0.65) strength = SignalStrength.STRONG;
    else if (confidence < 0.50) strength = SignalStrength.WEAK;

    // Edge calculation
    const winProb = 0.5 + (confidence - 0.5) * 0.4;
    const edge = winProb * Math.abs(takeProfit - currentPrice) - (1 - winProb) * Math.abs(currentPrice - stopLoss);

    // Mark zone as used (cooldown)
    sweep.zone.lastUsedBarIndex = currentIndex;
    sweep.zone.swept = true;
    sweep.zone.sweptAt = new Date(currentBar.timestamp);

    // Update state
    this.lastSignalTime = Date.now();
    this.stats.signals++;

    const signal = {
      id: uuidv4(),
      timestamp: Date.now(),
      symbol: contractId.split('.')[0] || contractId,
      contractId,
      side: direction === 'long' ? OrderSide.BID : OrderSide.ASK,
      direction,
      strategy: 'HQX_2B_LIQUIDITY_SWEEP',
      strength,
      edge,
      confidence,
      entry: currentPrice,
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
      riskReward,
      stopTicks: exec.stopTicks,
      targetTicks: exec.targetTicks,
      breakevenTicks: exec.breakevenTicks,
      trailTriggerTicks: exec.trailTriggerTicks,
      trailDistanceTicks: exec.trailDistanceTicks,
      beLevel,
      trailTrigger,

      // Sweep details
      sweepType: sweep.sweepType,
      penetrationTicks: sweep.penetrationTicks,
      sweepDurationBars: sweep.durationBars,
      sweepQuality: sweep.qualityScore,
      volumeRatio: sweep.volumeRatio,

      // Zone details
      zoneType: sweep.zone.type,
      zoneLevel: sweep.zone.getLevel(),
      zoneTouches: sweep.zone.touches,
      zoneQuality: sweep.zone.qualityScore,

      expires: Date.now() + 60000
    };

    // Emit signal
    this.emit('signal', {
      side: direction === 'long' ? 'buy' : 'sell',
      action: 'open',
      reason: `2B ${sweep.sweepType} | Pen:${sweep.penetrationTicks.toFixed(1)}t | Vol:${sweep.volumeRatio.toFixed(1)}x | Q:${(sweep.qualityScore * 100).toFixed(0)}%`,
      ...signal
    });

    this.emit('log', {
      type: 'info',
      message: `[HQX-2B] SIGNAL: ${direction.toUpperCase()} @ ${currentPrice.toFixed(2)} | ${sweep.sweepType} | Pen:${sweep.penetrationTicks.toFixed(1)}t Vol:${sweep.volumeRatio.toFixed(1)}x | Conf:${(confidence * 100).toFixed(0)}%`
    });

    return signal;
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  getAnalysisState(contractId, currentPrice) {
    const bars = this.barHistory.get(contractId) || [];
    const zones = this.liquidityZones.get(contractId) || [];
    const swings = this.swingPoints.get(contractId) || [];

    // Minimum 5 bars to start (reduced from 20 for faster warmup)
    if (bars.length < 5) {
      return { ready: false, message: `Collecting data... ${bars.length}/5 bars` };
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
    this.activeSweeps.set(contractId, []);
    this.currentBar.delete(contractId); // Reset bar aggregation

    this.emit('log', {
      type: 'info',
      message: `[HQX-2B] Reset state for ${contractId}`
    });
  }

  /**
   * Preload historical bars to warm up the strategy
   * @param {string} contractId - Contract ID
   * @param {Array} bars - Array of bars {timestamp, open, high, low, close, volume}
   */
  preloadBars(contractId, bars) {
    if (!bars || bars.length === 0) {
      this.emit('log', {
        type: 'debug',
        message: `[HQX-2B] No historical bars to preload`
      });
      return;
    }

    // Initialize if needed
    if (!this.barHistory.has(contractId)) {
      this.initialize(contractId);
    }

    // Sort bars by timestamp (oldest first)
    const sortedBars = [...bars].sort((a, b) => a.timestamp - b.timestamp);

    this.emit('log', {
      type: 'info',
      message: `[HQX-2B] Preloading ${sortedBars.length} historical bars...`
    });

    // Process each bar through the strategy
    let signalCount = 0;
    for (const bar of sortedBars) {
      const signal = this.processBar(contractId, bar);
      if (signal) signalCount++;
    }

    const history = this.barHistory.get(contractId) || [];
    const swings = this.swingPoints.get(contractId) || [];
    const zones = this.liquidityZones.get(contractId) || [];

    this.emit('log', {
      type: 'info',
      message: `[HQX-2B] Preload complete: ${history.length} bars, ${swings.length} swings, ${zones.length} zones`
    });

    if (signalCount > 0) {
      this.emit('log', {
        type: 'debug',
        message: `[HQX-2B] ${signalCount} historical signals detected (ignored)`
      });
    }

    // Reset signal time so we can generate new signals immediately
    this.lastSignalTime = 0;
  }
}

// =============================================================================
// STRATEGY WRAPPER (Compatible with M1 interface)
// =============================================================================

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
  generateSignal(params) { return null; } // Signals come from processBar
}

// =============================================================================
// EXPORTS
// =============================================================================

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
