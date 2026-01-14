var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// hqx-2b/config.js
var require_config = __commonJS({
  "hqx-2b/config.js"(exports2, module2) {
    var SweepType2 = { HIGH_SWEEP: "high", LOW_SWEEP: "low" };
    var ZoneType2 = { RESISTANCE: "resistance", SUPPORT: "support" };
    var DEFAULT_CONFIG2 = {
      // Instrument
      tickSize: 0.25,
      tickValue: 5,
      // Swing Detection (ULTRA AGGRESSIVE)
      swing: {
        lookbackBars: 2,
        // Reduced for more swings
        minStrength: 2,
        // More permissive
        confirmationBars: 1
        // Faster confirmation
      },
      // Zone Detection (ULTRA AGGRESSIVE)
      zone: {
        clusterToleranceTicks: 4,
        minTouches: 1,
        // Allow single-touch zones
        maxZoneAgeBars: 200,
        // Fresher zones only
        maxZoneDistanceTicks: 40,
        cooldownBars: 10
        // Bars before zone can be reused
      },
      // Sweep Detection (ULTRA AGGRESSIVE)
      sweep: {
        minPenetrationTicks: 1,
        // Very permissive
        maxPenetrationTicks: 12,
        // Tighter range
        maxDurationBars: 5,
        minQualityScore: 0.4,
        minVolumeRatio: 0.8,
        // >= 0.8x median volume
        minBodyRatio: 0.2
        // Minimum body/range ratio
      },
      // Execution (OPTIMIZED 4:1 R:R)
      execution: {
        stopTicks: 10,
        // $50 stop
        targetTicks: 40,
        // $200 target (4:1 R:R)
        breakevenTicks: 4,
        // Move to BE at +4 ticks
        trailTriggerTicks: 8,
        // Activate trailing at +8 ticks
        trailDistanceTicks: 4,
        // Trail by 4 ticks
        cooldownMs: 3e4,
        // 30 seconds between signals
        minHoldTimeMs: 1e4,
        // Minimum 10 seconds hold
        slippageTicks: 1,
        commissionPerSide: 2
        // $4 round-trip
      },
      // Session filter (US Regular Hours only - matches backtest)
      session: {
        enabled: true,
        // MUST be enabled to match backtest results
        startHour: 9,
        // 9:30 AM EST
        startMinute: 30,
        endHour: 16,
        // 4:00 PM EST
        endMinute: 0,
        timezone: "America/New_York"
      }
    };
    module2.exports = { DEFAULT_CONFIG: DEFAULT_CONFIG2, SweepType: SweepType2, ZoneType: ZoneType2 };
  }
});

// common/types.js
var require_types = __commonJS({
  "common/types.js"(exports2, module2) {
    var OrderSide2 = { BID: 0, ASK: 1 };
    var SignalStrength2 = { WEAK: 1, MODERATE: 2, STRONG: 3, VERY_STRONG: 4 };
    module2.exports = { OrderSide: OrderSide2, SignalStrength: SignalStrength2 };
  }
});

// hqx-2b/signal.js
var require_signal = __commonJS({
  "hqx-2b/signal.js"(exports2, module2) {
    var { v4: uuidv4 } = require("uuid");
    var { OrderSide: OrderSide2, SignalStrength: SignalStrength2 } = require_types();
    var { SweepType: SweepType2 } = require_config();
    function generateSignal(params) {
      const {
        contractId,
        currentBar,
        currentIndex,
        sweep,
        config,
        tickSize
      } = params;
      const exec = config.execution;
      const currentPrice = currentBar.close;
      const direction = sweep.sweepType === SweepType2.HIGH_SWEEP ? "short" : "long";
      let stopLoss, takeProfit, beLevel, trailTrigger;
      if (direction === "long") {
        stopLoss = currentPrice - exec.stopTicks * tickSize;
        takeProfit = currentPrice + exec.targetTicks * tickSize;
        beLevel = currentPrice + exec.breakevenTicks * tickSize;
        trailTrigger = currentPrice + exec.trailTriggerTicks * tickSize;
      } else {
        stopLoss = currentPrice + exec.stopTicks * tickSize;
        takeProfit = currentPrice - exec.targetTicks * tickSize;
        beLevel = currentPrice - exec.breakevenTicks * tickSize;
        trailTrigger = currentPrice - exec.trailTriggerTicks * tickSize;
      }
      const riskReward = exec.targetTicks / exec.stopTicks;
      const confidence = Math.min(
        1,
        sweep.qualityScore * 0.5 + sweep.zone.qualityScore * 0.3 + (sweep.volumeRatio > 1.5 ? 0.2 : sweep.volumeRatio * 0.1)
      );
      let strength = SignalStrength2.MODERATE;
      if (confidence >= 0.8) strength = SignalStrength2.VERY_STRONG;
      else if (confidence >= 0.65) strength = SignalStrength2.STRONG;
      else if (confidence < 0.5) strength = SignalStrength2.WEAK;
      const winProb = 0.5 + (confidence - 0.5) * 0.4;
      const edge = winProb * Math.abs(takeProfit - currentPrice) - (1 - winProb) * Math.abs(currentPrice - stopLoss);
      sweep.zone.lastUsedBarIndex = currentIndex;
      sweep.zone.swept = true;
      sweep.zone.sweptAt = new Date(currentBar.timestamp);
      return {
        id: uuidv4(),
        timestamp: Date.now(),
        symbol: contractId.split(".")[0] || contractId,
        contractId,
        side: direction === "long" ? OrderSide2.BID : OrderSide2.ASK,
        direction,
        strategy: "HQX_2B_LIQUIDITY_SWEEP",
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
        expires: Date.now() + 6e4
      };
    }
    module2.exports = { generateSignal };
  }
});

// hqx-2b/detection/swings.js
var require_swings = __commonJS({
  "hqx-2b/detection/swings.js"(exports2, module2) {
    var SwingPoint = class {
      constructor(type, price, barIndex, timestamp, strength = 1) {
        this.type = type;
        this.price = price;
        this.barIndex = barIndex;
        this.timestamp = timestamp;
        this.strength = strength;
      }
    };
    function detectSwings(bars, currentIndex, existingSwings, config, maxAge) {
      const { lookbackBars, minStrength } = config;
      const swings = [...existingSwings];
      if (currentIndex < lookbackBars * 2) return swings;
      const pivotIndex = currentIndex - lookbackBars;
      const pivotBar = bars[pivotIndex];
      let isSwingHigh = true;
      let highStrength = 0;
      for (let i = pivotIndex - lookbackBars; i <= pivotIndex + lookbackBars; i++) {
        if (i === pivotIndex || i < 0 || i >= bars.length) continue;
        if (bars[i].high >= pivotBar.high) {
          isSwingHigh = false;
          break;
        }
        highStrength++;
      }
      if (isSwingHigh && highStrength >= minStrength) {
        const existing = swings.find((s) => s.barIndex === pivotIndex && s.type === "high");
        if (!existing) {
          swings.push(new SwingPoint("high", pivotBar.high, pivotIndex, pivotBar.timestamp, highStrength));
        }
      }
      let isSwingLow = true;
      let lowStrength = 0;
      for (let i = pivotIndex - lookbackBars; i <= pivotIndex + lookbackBars; i++) {
        if (i === pivotIndex || i < 0 || i >= bars.length) continue;
        if (bars[i].low <= pivotBar.low) {
          isSwingLow = false;
          break;
        }
        lowStrength++;
      }
      if (isSwingLow && lowStrength >= minStrength) {
        const existing = swings.find((s) => s.barIndex === pivotIndex && s.type === "low");
        if (!existing) {
          swings.push(new SwingPoint("low", pivotBar.low, pivotIndex, pivotBar.timestamp, lowStrength));
        }
      }
      while (swings.length > 0 && swings[0].barIndex < currentIndex - maxAge) {
        swings.shift();
      }
      return swings;
    }
    module2.exports = { SwingPoint, detectSwings };
  }
});

// hqx-2b/detection/zones.js
var require_zones = __commonJS({
  "hqx-2b/detection/zones.js"(exports2, module2) {
    var { v4: uuidv4 } = require("uuid");
    var { ZoneType: ZoneType2 } = require_config();
    var LiquidityZone = class {
      constructor(type, priceHigh, priceLow, createdAt, barIndex) {
        this.id = uuidv4();
        this.type = type;
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
        return price >= this.priceLow - tolerance && price <= this.priceHigh + tolerance;
      }
      getLevel() {
        return (this.priceHigh + this.priceLow) / 2;
      }
    };
    function updateZones(swings, existingZones, currentIndex, config, tickSize) {
      const { clusterToleranceTicks, maxZoneAgeBars } = config;
      const zones = [...existingZones];
      const tolerance = clusterToleranceTicks * tickSize;
      for (let i = zones.length - 1; i >= 0; i--) {
        if (currentIndex - zones[i].barIndex > maxZoneAgeBars) {
          zones.splice(i, 1);
        }
      }
      for (const swing of swings) {
        let foundZone = null;
        for (const zone of zones) {
          if (zone.containsPrice(swing.price, clusterToleranceTicks, tickSize)) {
            foundZone = zone;
            break;
          }
        }
        if (foundZone) {
          foundZone.touches++;
          if (swing.price > foundZone.priceHigh) foundZone.priceHigh = swing.price;
          if (swing.price < foundZone.priceLow) foundZone.priceLow = swing.price;
          foundZone.qualityScore = Math.min(1, 0.3 + foundZone.touches * 0.15);
        } else {
          const zoneType = swing.type === "high" ? ZoneType2.RESISTANCE : ZoneType2.SUPPORT;
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
      return zones;
    }
    module2.exports = { LiquidityZone, updateZones };
  }
});

// hqx-2b/detection/sweeps.js
var require_sweeps = __commonJS({
  "hqx-2b/detection/sweeps.js"(exports2, module2) {
    var { SweepType: SweepType2, ZoneType: ZoneType2 } = require_config();
    var SweepEvent = class {
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
        this.volumeRatio = 1;
      }
    };
    function getVolumeRatio(bars, index, lookback) {
      const start = Math.max(0, index - lookback);
      const recentBars = bars.slice(start, index);
      if (recentBars.length === 0) return 1;
      const volumes = recentBars.map((b) => b.volume).sort((a, b) => a - b);
      const medianIdx = Math.floor(volumes.length / 2);
      const medianVolume = volumes[medianIdx] || 1;
      return bars[index].volume / medianVolume;
    }
    function scoreSweep(sweep, bodyRatio) {
      let score = 0;
      const optimalPen = 4;
      const penDiff = Math.abs(sweep.penetrationTicks - optimalPen);
      score += Math.max(0, 0.3 - penDiff * 0.03);
      score += Math.max(0, 0.25 - sweep.durationBars * 0.05);
      score += Math.min(0.25, sweep.volumeRatio * 0.1);
      score += Math.min(0.2, bodyRatio * 0.4);
      return Math.min(1, score);
    }
    function detectSweep(zones, bars, currentIndex, sweepConfig, zoneConfig, tickSize) {
      const currentBar = bars[currentIndex];
      const currentPrice = currentBar.close;
      const cfg = sweepConfig;
      for (const zone of zones) {
        if (zone.lastUsedBarIndex >= 0 && currentIndex - zone.lastUsedBarIndex < zoneConfig.cooldownBars) {
          continue;
        }
        const zoneLevel = zone.getLevel();
        const distanceTicks = Math.abs(currentPrice - zoneLevel) / tickSize;
        if (distanceTicks > zoneConfig.maxZoneDistanceTicks) continue;
        const lookbackStart = Math.max(0, currentIndex - cfg.maxDurationBars * 2);
        for (let i = lookbackStart; i < currentIndex; i++) {
          const bar = bars[i];
          if (zone.type === ZoneType2.RESISTANCE) {
            const penetration = (bar.high - zone.priceHigh) / tickSize;
            if (penetration >= cfg.minPenetrationTicks && penetration <= cfg.maxPenetrationTicks) {
              if (currentPrice < zone.priceHigh) {
                const barRange = bar.high - bar.low;
                const bodySize = Math.abs(bar.close - bar.open);
                const bodyRatio = barRange > 0 ? bodySize / barRange : 0;
                if (bodyRatio >= cfg.minBodyRatio) {
                  const volumeRatio = getVolumeRatio(bars, i, 20);
                  if (volumeRatio >= cfg.minVolumeRatio) {
                    const sweep = new SweepEvent(
                      SweepType2.HIGH_SWEEP,
                      zone,
                      i,
                      i,
                      bar.high
                    );
                    sweep.exitBarIndex = currentIndex;
                    sweep.penetrationTicks = penetration;
                    sweep.durationBars = currentIndex - i;
                    sweep.volumeRatio = volumeRatio;
                    sweep.qualityScore = scoreSweep(sweep, bodyRatio);
                    sweep.isValid = sweep.qualityScore >= cfg.minQualityScore;
                    if (sweep.isValid) {
                      return sweep;
                    }
                  }
                }
              }
            }
          }
          if (zone.type === ZoneType2.SUPPORT) {
            const penetration = (zone.priceLow - bar.low) / tickSize;
            if (penetration >= cfg.minPenetrationTicks && penetration <= cfg.maxPenetrationTicks) {
              if (currentPrice > zone.priceLow) {
                const barRange = bar.high - bar.low;
                const bodySize = Math.abs(bar.close - bar.open);
                const bodyRatio = barRange > 0 ? bodySize / barRange : 0;
                if (bodyRatio >= cfg.minBodyRatio) {
                  const volumeRatio = getVolumeRatio(bars, i, 20);
                  if (volumeRatio >= cfg.minVolumeRatio) {
                    const sweep = new SweepEvent(
                      SweepType2.LOW_SWEEP,
                      zone,
                      i,
                      i,
                      bar.low
                    );
                    sweep.exitBarIndex = currentIndex;
                    sweep.penetrationTicks = penetration;
                    sweep.durationBars = currentIndex - i;
                    sweep.volumeRatio = volumeRatio;
                    sweep.qualityScore = scoreSweep(sweep, bodyRatio);
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
    module2.exports = { SweepEvent, detectSweep, getVolumeRatio, scoreSweep };
  }
});

// hqx-2b/detection/index.js
var require_detection = __commonJS({
  "hqx-2b/detection/index.js"(exports2, module2) {
    var { SwingPoint, detectSwings } = require_swings();
    var { LiquidityZone, updateZones } = require_zones();
    var { SweepEvent, detectSweep } = require_sweeps();
    module2.exports = {
      SwingPoint,
      detectSwings,
      LiquidityZone,
      updateZones,
      SweepEvent,
      detectSweep
    };
  }
});

// hqx-2b/core.js
var require_core = __commonJS({
  "hqx-2b/core.js"(exports2, module2) {
    var EventEmitter2 = require("events");
    var { DEFAULT_CONFIG: DEFAULT_CONFIG2, ZoneType: ZoneType2 } = require_config();
    var { generateSignal } = require_signal();
    var { detectSwings, updateZones, detectSweep } = require_detection();
    function mergeConfig(defaults, custom) {
      const result = { ...defaults };
      for (const key in custom) {
        if (typeof custom[key] === "object" && !Array.isArray(custom[key]) && custom[key] !== null) {
          result[key] = { ...defaults[key], ...custom[key] };
        } else {
          result[key] = custom[key];
        }
      }
      return result;
    }
    var HQX2BLiquiditySweep2 = class extends EventEmitter2 {
      constructor(config = {}) {
        super();
        this.config = mergeConfig(DEFAULT_CONFIG2, config);
        this.tickSize = this.config.tickSize;
        this.tickValue = this.config.tickValue;
        this.barHistory = /* @__PURE__ */ new Map();
        this.swingPoints = /* @__PURE__ */ new Map();
        this.liquidityZones = /* @__PURE__ */ new Map();
        this.currentBar = /* @__PURE__ */ new Map();
        this.barIntervalMs = 6e4;
        this.lastSignalTime = 0;
        this.stats = { signals: 0, trades: 0, wins: 0, losses: 0, pnl: 0 };
        this.recentTrades = [];
      }
      initialize(contractId, tickSize = 0.25, tickValue = 5) {
        this.tickSize = tickSize;
        this.tickValue = tickValue;
        this.config.tickSize = tickSize;
        this.config.tickValue = tickValue;
        this.barHistory.set(contractId, []);
        this.swingPoints.set(contractId, []);
        this.liquidityZones.set(contractId, []);
        this.currentBar.delete(contractId);
        this.emit("log", {
          type: "info",
          message: `[HQX-2B] Initialized for ${contractId}: tick=${tickSize}, value=${tickValue}, TF=1min`
        });
        this.emit("log", {
          type: "info",
          message: `[HQX-2B] Params: Stop=${this.config.execution.stopTicks}t, Target=${this.config.execution.targetTicks}t, BE=${this.config.execution.breakevenTicks}t, Trail=${this.config.execution.trailTriggerTicks}/${this.config.execution.trailDistanceTicks}`
        });
      }
      /**
       * Check if current time is within trading session (9:30-16:00 EST)
       */
      isWithinSession(timestamp) {
        if (!this.config.session.enabled) return true;
        const date = new Date(timestamp);
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
        if (!this.isWithinSession(ts)) {
          return null;
        }
        let bar = this.currentBar.get(contractId);
        const barStartTime = Math.floor(ts / this.barIntervalMs) * this.barIntervalMs;
        if (!bar || bar.startTime !== barStartTime) {
          if (bar) {
            const closedBar = {
              timestamp: bar.startTime,
              open: bar.open,
              high: bar.high,
              low: bar.low,
              close: bar.close,
              volume: bar.volume
            };
            const signal = this.processBar(contractId, closedBar);
            this.currentBar.set(contractId, {
              startTime: barStartTime,
              open: price,
              high: price,
              low: price,
              close: price,
              volume: vol
            });
            return signal;
          } else {
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
          bar.high = Math.max(bar.high, price);
          bar.low = Math.min(bar.low, price);
          bar.close = price;
          bar.volume += vol;
          return null;
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
        let bars = this.barHistory.get(contractId);
        if (!bars) {
          this.initialize(contractId);
          bars = this.barHistory.get(contractId);
        }
        bars.push(bar);
        if (bars.length > 500) bars.shift();
        const currentIndex = bars.length - 1;
        if (bars.length < this.config.swing.lookbackBars * 3) {
          return null;
        }
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
        if (updatedSwings.length > prevSwingCount) {
          const newSwing = updatedSwings[updatedSwings.length - 1];
          this.emit("log", {
            type: "debug",
            message: `[2B] NEW SWING ${newSwing.type.toUpperCase()} @ ${newSwing.price.toFixed(2)} | Total: ${updatedSwings.length}`
          });
        }
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
        if (updatedZones.length > prevZoneCount) {
          const newZone = updatedZones[updatedZones.length - 1];
          this.emit("log", {
            type: "debug",
            message: `[2B] NEW ZONE ${newZone.type.toUpperCase()} @ ${newZone.getLevel().toFixed(2)} | Total: ${updatedZones.length}`
          });
        }
        const sweep = detectSweep(
          updatedZones,
          bars,
          currentIndex,
          this.config.sweep,
          this.config.zone,
          this.tickSize
        );
        if (sweep) {
          this.emit("log", {
            type: "debug",
            message: `[2B] SWEEP ${sweep.sweepType} | Valid: ${sweep.isValid} | Pen: ${sweep.penetrationTicks.toFixed(1)}t | Q: ${(sweep.qualityScore * 100).toFixed(0)}%`
          });
        }
        if (sweep && sweep.isValid) {
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
            this.emit("signal", {
              side: signal.direction === "long" ? "buy" : "sell",
              action: "open",
              reason: `2B ${sweep.sweepType} | Pen:${sweep.penetrationTicks.toFixed(1)}t | Vol:${sweep.volumeRatio.toFixed(1)}x | Q:${(sweep.qualityScore * 100).toFixed(0)}%`,
              ...signal
            });
            this.emit("log", {
              type: "info",
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
        const sortedZones = zones.map((z) => ({ zone: z, distance: Math.abs(currentPrice - z.getLevel()) })).sort((a, b) => a.distance - b.distance);
        const nearestResistance = sortedZones.find((z) => z.zone.type === ZoneType2.RESISTANCE);
        const nearestSupport = sortedZones.find((z) => z.zone.type === ZoneType2.SUPPORT);
        return {
          ready: true,
          barsProcessed: bars.length,
          swingsDetected: swings.length,
          activeZones: zones.length,
          nearestResistance: nearestResistance ? nearestResistance.zone.getLevel() : null,
          nearestSupport: nearestSupport ? nearestSupport.zone.getLevel() : null,
          stopTicks: this.config.execution.stopTicks,
          targetTicks: this.config.execution.targetTicks,
          strategy: "HQX-2B Liquidity Sweep (Optimized)"
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
        this.emit("log", {
          type: "debug",
          message: `[HQX-2B] Trade result: ${pnl > 0 ? "WIN" : "LOSS"} $${pnl.toFixed(2)}`
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
        this.currentBar.delete(contractId);
        this.emit("log", {
          type: "info",
          message: `[HQX-2B] Reset state for ${contractId}`
        });
      }
    };
    module2.exports = { HQX2BLiquiditySweep: HQX2BLiquiditySweep2 };
  }
});

// hqx-2b/index.js
var EventEmitter = require("events");
var { HQX2BLiquiditySweep } = require_core();
var { OrderSide, SignalStrength } = require_types();
var { SweepType, ZoneType, DEFAULT_CONFIG } = require_config();
var HQX2BStrategy = class extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.strategy = new HQX2BLiquiditySweep(config);
    this.strategy.on("signal", (sig) => this.emit("signal", sig));
    this.strategy.on("log", (log) => this.emit("log", log));
  }
  // Interface methods (compatible with M1)
  processTick(tick) {
    return this.strategy.processTick(tick);
  }
  onTick(tick) {
    return this.strategy.onTick(tick);
  }
  onTrade(trade) {
    return this.strategy.onTrade(trade);
  }
  processBar(contractId, bar) {
    return this.strategy.processBar(contractId, bar);
  }
  initialize(contractId, tickSize, tickValue) {
    return this.strategy.initialize(contractId, tickSize, tickValue);
  }
  getAnalysisState(contractId, price) {
    return this.strategy.getAnalysisState(contractId, price);
  }
  recordTradeResult(pnl) {
    return this.strategy.recordTradeResult(pnl);
  }
  reset(contractId) {
    return this.strategy.reset(contractId);
  }
  getStats() {
    return this.strategy.getStats();
  }
  getBarHistory(contractId) {
    return this.strategy.getBarHistory(contractId);
  }
  generateSignal(params) {
    return null;
  }
  // Signals come from processBar
};
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
