var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// ultra-scalping/config.js
var require_config = __commonJS({
  "ultra-scalping/config.js"(exports2, module2) {
    var DEFAULT_CONFIG = {
      // Model Parameters
      zscoreEntryThreshold: 1.5,
      // Live trading threshold (backtest: 2.5)
      zscoreExitThreshold: 0.5,
      vpinWindow: 50,
      vpinToxicThreshold: 0.7,
      // Skip if VPIN > 0.7
      volatilityLookback: 100,
      ofiLookback: 20,
      // Trade Parameters
      baseStopTicks: 8,
      // $40
      baseTargetTicks: 16,
      // $80
      breakevenTicks: 4,
      // Move to BE at +4 ticks
      profitLockPct: 0.5,
      // Lock 50% of profit
      minConfidence: 0.55,
      // Minimum composite confidence
      cooldownMs: 3e4,
      // 30 seconds between signals
      // Model Weights (from Python backtest)
      weights: {
        zscore: 0.3,
        // 30%
        ofi: 0.2,
        // 20%
        vpin: 0.15,
        // 15%
        kalman: 0.15,
        // 15%
        kyleLambda: 0.1,
        // 10%
        volatility: 0.1
        // 10%
      }
    };
    module2.exports = { DEFAULT_CONFIG };
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

// ultra-scalping/signal.js
var require_signal = __commonJS({
  "ultra-scalping/signal.js"(exports2, module2) {
    var { v4: uuidv4 } = require("uuid");
    var { OrderSide: OrderSide2, SignalStrength: SignalStrength2 } = require_types();
    function generateSignal(params) {
      const {
        contractId,
        currentPrice,
        zscore,
        vpin,
        kyleLambda,
        kalmanEstimate,
        regime,
        volParams,
        ofi,
        config,
        tickSize
      } = params;
      const absZscore = Math.abs(zscore);
      if (absZscore < volParams.zscoreThreshold) {
        return null;
      }
      if (vpin > config.vpinToxicThreshold) {
        return null;
      }
      let direction;
      if (zscore < -volParams.zscoreThreshold) {
        direction = "long";
      } else if (zscore > volParams.zscoreThreshold) {
        direction = "short";
      } else {
        return null;
      }
      const ofiConfirms = direction === "long" && ofi > 0.1 || direction === "short" && ofi < -0.1;
      const kalmanDiff = currentPrice - kalmanEstimate;
      const kalmanConfirms = direction === "long" && kalmanDiff < 0 || direction === "short" && kalmanDiff > 0;
      const scores = {
        zscore: Math.min(1, absZscore / 4),
        // Normalize to 0-1
        vpin: 1 - vpin,
        // Lower VPIN = better
        kyleLambda: kyleLambda > 1e-3 ? 0.5 : 0.8,
        // Moderate lambda is good
        kalman: kalmanConfirms ? 0.8 : 0.4,
        volatility: regime === "normal" ? 0.8 : regime === "low" ? 0.7 : 0.6,
        ofi: ofiConfirms ? 0.9 : 0.5,
        composite: 0
        // Calculated below
      };
      scores.composite = scores.zscore * config.weights.zscore + // 30%
      scores.vpin * config.weights.vpin + // 15%
      scores.kyleLambda * config.weights.kyleLambda + // 10%
      scores.kalman * config.weights.kalman + // 15%
      scores.volatility * config.weights.volatility + // 10%
      scores.ofi * config.weights.ofi;
      const confidence = Math.min(1, scores.composite + volParams.confidenceBonus);
      if (confidence < config.minConfidence) {
        return null;
      }
      const stopTicks = Math.round(config.baseStopTicks * volParams.stopMultiplier);
      const targetTicks = Math.round(config.baseTargetTicks * volParams.targetMultiplier);
      const actualStopTicks = Math.max(6, Math.min(12, stopTicks));
      const actualTargetTicks = Math.max(actualStopTicks * 1.5, Math.min(24, targetTicks));
      let stopLoss, takeProfit, beBreakeven, profitLockLevel;
      if (direction === "long") {
        stopLoss = currentPrice - actualStopTicks * tickSize;
        takeProfit = currentPrice + actualTargetTicks * tickSize;
        beBreakeven = currentPrice + config.breakevenTicks * tickSize;
        profitLockLevel = currentPrice + actualTargetTicks * config.profitLockPct * tickSize;
      } else {
        stopLoss = currentPrice + actualStopTicks * tickSize;
        takeProfit = currentPrice - actualTargetTicks * tickSize;
        beBreakeven = currentPrice - config.breakevenTicks * tickSize;
        profitLockLevel = currentPrice - actualTargetTicks * config.profitLockPct * tickSize;
      }
      const riskReward = actualTargetTicks / actualStopTicks;
      const trailTriggerTicks = Math.round(actualTargetTicks * 0.5);
      const trailDistanceTicks = Math.round(actualStopTicks * 0.4);
      let strength = SignalStrength2.MODERATE;
      if (confidence >= 0.85) strength = SignalStrength2.VERY_STRONG;
      else if (confidence >= 0.75) strength = SignalStrength2.STRONG;
      else if (confidence < 0.6) strength = SignalStrength2.WEAK;
      const winProb = 0.5 + (confidence - 0.5) * 0.4;
      const edge = winProb * Math.abs(takeProfit - currentPrice) - (1 - winProb) * Math.abs(currentPrice - stopLoss);
      return {
        id: uuidv4(),
        timestamp: Date.now(),
        symbol: contractId.split(".")[0] || contractId,
        contractId,
        side: direction === "long" ? OrderSide2.BID : OrderSide2.ASK,
        direction,
        strategy: "HQX_ULTRA_SCALPING_6MODELS",
        strength,
        edge,
        confidence,
        entry: currentPrice,
        entryPrice: currentPrice,
        stopLoss,
        takeProfit,
        riskReward,
        stopTicks: actualStopTicks,
        targetTicks: actualTargetTicks,
        trailTriggerTicks,
        trailDistanceTicks,
        beBreakeven,
        profitLockLevel,
        // Model values for debugging/monitoring
        zScore: zscore,
        zScoreExit: config.zscoreExitThreshold,
        vpinValue: vpin,
        kyleLambda,
        kalmanEstimate,
        volatilityRegime: regime,
        ofiValue: ofi,
        models: scores,
        // Order flow confirmation flag
        orderFlowConfirmed: ofiConfirms,
        kalmanConfirmed: kalmanConfirms,
        expires: Date.now() + 6e4
      };
    }
    module2.exports = { generateSignal };
  }
});

// ultra-scalping/models/zscore.js
var require_zscore = __commonJS({
  "ultra-scalping/models/zscore.js"(exports2, module2) {
    function computeZScore(prices, window = 50) {
      if (prices.length < window) return 0;
      const recentPrices = prices.slice(-window);
      const mean = recentPrices.reduce((a, b) => a + b, 0) / window;
      const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / window;
      const std = Math.sqrt(variance);
      if (std < 1e-4) return 0;
      const currentPrice = prices[prices.length - 1];
      return (currentPrice - mean) / std;
    }
    module2.exports = { computeZScore };
  }
});

// ultra-scalping/models/vpin.js
var require_vpin = __commonJS({
  "ultra-scalping/models/vpin.js"(exports2, module2) {
    function computeVPIN(volumes, vpinWindow = 50) {
      if (volumes.length < vpinWindow) return 0.5;
      const recentVolumes = volumes.slice(-vpinWindow);
      let totalBuy = 0;
      let totalSell = 0;
      for (const v of recentVolumes) {
        totalBuy += v.buy;
        totalSell += v.sell;
      }
      const totalVolume = totalBuy + totalSell;
      if (totalVolume < 1) return 0.5;
      return Math.abs(totalBuy - totalSell) / totalVolume;
    }
    module2.exports = { computeVPIN };
  }
});

// ultra-scalping/models/kyle.js
var require_kyle = __commonJS({
  "ultra-scalping/models/kyle.js"(exports2, module2) {
    function computeKyleLambda(bars) {
      if (bars.length < 20) return 0;
      const recentBars = bars.slice(-20);
      const priceChanges = [];
      const volumes = [];
      for (let i = 1; i < recentBars.length; i++) {
        priceChanges.push(recentBars[i].close - recentBars[i - 1].close);
        volumes.push(recentBars[i].volume);
      }
      const meanPrice = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
      const meanVol = volumes.reduce((a, b) => a + b, 0) / volumes.length;
      let covariance = 0;
      let varianceVol = 0;
      for (let i = 0; i < priceChanges.length; i++) {
        covariance += (priceChanges[i] - meanPrice) * (volumes[i] - meanVol);
        varianceVol += Math.pow(volumes[i] - meanVol, 2);
      }
      covariance /= priceChanges.length;
      varianceVol /= priceChanges.length;
      if (varianceVol < 1e-4) return 0;
      return Math.abs(covariance / varianceVol);
    }
    module2.exports = { computeKyleLambda };
  }
});

// ultra-scalping/models/kalman.js
var require_kalman = __commonJS({
  "ultra-scalping/models/kalman.js"(exports2, module2) {
    var KALMAN_PROCESS_NOISE = 0.01;
    var KALMAN_MEASUREMENT_NOISE = 0.1;
    function applyKalmanFilter(state, measurement) {
      if (!state || state.estimate === 0) {
        return {
          estimate: measurement,
          errorCovariance: 1,
          newEstimate: measurement
        };
      }
      const predictedEstimate = state.estimate;
      const predictedCovariance = state.errorCovariance + KALMAN_PROCESS_NOISE;
      const kalmanGain = predictedCovariance / (predictedCovariance + KALMAN_MEASUREMENT_NOISE);
      const newEstimate = predictedEstimate + kalmanGain * (measurement - predictedEstimate);
      const newCovariance = (1 - kalmanGain) * predictedCovariance;
      return {
        estimate: newEstimate,
        errorCovariance: newCovariance,
        newEstimate
      };
    }
    function createKalmanState() {
      return {
        estimate: 0,
        errorCovariance: 1
      };
    }
    module2.exports = {
      applyKalmanFilter,
      createKalmanState,
      KALMAN_PROCESS_NOISE,
      KALMAN_MEASUREMENT_NOISE
    };
  }
});

// ultra-scalping/models/volatility.js
var require_volatility = __commonJS({
  "ultra-scalping/models/volatility.js"(exports2, module2) {
    function calculateATR(bars, period = 14) {
      if (bars.length < period + 1) return 2.5;
      const trValues = [];
      for (let i = bars.length - period; i < bars.length; i++) {
        const bar = bars[i];
        const prevClose = bars[i - 1].close;
        const tr = Math.max(
          bar.high - bar.low,
          Math.abs(bar.high - prevClose),
          Math.abs(bar.low - prevClose)
        );
        trValues.push(tr);
      }
      return trValues.reduce((a, b) => a + b, 0) / trValues.length;
    }
    function detectVolatilityRegime(atr, atrHistory, tickSize) {
      let atrPercentile = 0.5;
      if (atrHistory.length >= 20) {
        atrPercentile = atrHistory.filter((a) => a <= atr).length / atrHistory.length;
      }
      let regime, params;
      if (atrPercentile < 0.25) {
        regime = "low";
        params = {
          stopMultiplier: 0.8,
          targetMultiplier: 0.9,
          zscoreThreshold: 1.2,
          confidenceBonus: 0.05
        };
      } else if (atrPercentile < 0.75) {
        regime = "normal";
        params = {
          stopMultiplier: 1,
          targetMultiplier: 1,
          zscoreThreshold: 1.5,
          confidenceBonus: 0
        };
      } else {
        regime = "high";
        params = {
          stopMultiplier: 1.3,
          targetMultiplier: 1.2,
          zscoreThreshold: 2,
          confidenceBonus: -0.05
        };
      }
      return { regime, params, atrPercentile };
    }
    module2.exports = { calculateATR, detectVolatilityRegime };
  }
});

// ultra-scalping/models/ofi.js
var require_ofi = __commonJS({
  "ultra-scalping/models/ofi.js"(exports2, module2) {
    function computeOrderFlowImbalance(bars, lookback = 20) {
      if (bars.length < lookback) return 0;
      const recentBars = bars.slice(-lookback);
      let totalBuyPressure = 0;
      let totalSellPressure = 0;
      for (const bar of recentBars) {
        const barRange = bar.high - bar.low;
        if (barRange > 0) {
          const closePosition = (bar.close - bar.low) / barRange;
          totalBuyPressure += closePosition * bar.volume;
          totalSellPressure += (1 - closePosition) * bar.volume;
        }
      }
      const totalPressure = totalBuyPressure + totalSellPressure;
      if (totalPressure < 1) return 0;
      return (totalBuyPressure - totalSellPressure) / totalPressure;
    }
    module2.exports = { computeOrderFlowImbalance };
  }
});

// ultra-scalping/models/index.js
var require_models = __commonJS({
  "ultra-scalping/models/index.js"(exports2, module2) {
    var { computeZScore } = require_zscore();
    var { computeVPIN } = require_vpin();
    var { computeKyleLambda } = require_kyle();
    var { applyKalmanFilter, createKalmanState } = require_kalman();
    var { calculateATR, detectVolatilityRegime } = require_volatility();
    var { computeOrderFlowImbalance } = require_ofi();
    module2.exports = {
      computeZScore,
      computeVPIN,
      computeKyleLambda,
      applyKalmanFilter,
      createKalmanState,
      calculateATR,
      detectVolatilityRegime,
      computeOrderFlowImbalance
    };
  }
});

// ultra-scalping/core.js
var require_core = __commonJS({
  "ultra-scalping/core.js"(exports2, module2) {
    var EventEmitter2 = require("events");
    var { DEFAULT_CONFIG } = require_config();
    var { generateSignal } = require_signal();
    var {
      computeZScore,
      computeVPIN,
      computeKyleLambda,
      applyKalmanFilter,
      createKalmanState,
      calculateATR,
      detectVolatilityRegime,
      computeOrderFlowImbalance
    } = require_models();
    var HQXUltraScalping2 = class extends EventEmitter2 {
      constructor(config = {}) {
        super();
        this.tickSize = config.tickSize || 0.25;
        this.tickValue = config.tickValue || 5;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.barHistory = /* @__PURE__ */ new Map();
        this.priceBuffer = /* @__PURE__ */ new Map();
        this.volumeBuffer = /* @__PURE__ */ new Map();
        this.kalmanStates = /* @__PURE__ */ new Map();
        this.atrHistory = /* @__PURE__ */ new Map();
        this.recentTrades = [];
        this.winStreak = 0;
        this.lossStreak = 0;
        this.lastSignalTime = 0;
        this.stats = { signals: 0, trades: 0, wins: 0, losses: 0, pnl: 0 };
      }
      initialize(contractId, tickSize = 0.25, tickValue = 5) {
        this.tickSize = tickSize;
        this.tickValue = tickValue;
        this.barHistory.set(contractId, []);
        this.priceBuffer.set(contractId, []);
        this.volumeBuffer.set(contractId, []);
        this.atrHistory.set(contractId, []);
        this.kalmanStates.set(contractId, createKalmanState());
        this.emit("log", {
          type: "info",
          message: `[HQX-UltraScalping] Initialized for ${contractId}: tick=${tickSize}, value=${tickValue}`
        });
        this.emit("log", {
          type: "info",
          message: `[HQX-UltraScalping] 6 Models: Z-Score(30%), OFI(20%), VPIN(15%), Kalman(15%), Kyle(10%), Vol(10%)`
        });
      }
      processTick(tick) {
        const { contractId, price, volume, timestamp } = tick;
        const bar = {
          timestamp: timestamp || Date.now(),
          open: price,
          high: price,
          low: price,
          close: price,
          volume: volume || 1
        };
        return this.processBar(contractId, bar);
      }
      onTick(tick) {
        return this.processTick(tick);
      }
      onTrade(trade) {
        return this.processTick({
          contractId: trade.contractId || trade.symbol,
          price: trade.price,
          volume: trade.size || trade.volume || 1,
          side: trade.side,
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
        const prices = this.priceBuffer.get(contractId);
        prices.push(bar.close);
        if (prices.length > 200) prices.shift();
        const volumes = this.volumeBuffer.get(contractId);
        const barRange = bar.high - bar.low;
        let buyVol = bar.volume * 0.5;
        let sellVol = bar.volume * 0.5;
        if (barRange > 0) {
          const closePosition = (bar.close - bar.low) / barRange;
          buyVol = bar.volume * closePosition;
          sellVol = bar.volume * (1 - closePosition);
        }
        volumes.push({ buy: buyVol, sell: sellVol });
        if (volumes.length > 100) volumes.shift();
        if (bars.length < 50) return null;
        const zscore = computeZScore(prices);
        const vpin = computeVPIN(volumes, this.config.vpinWindow);
        const kyleLambda = computeKyleLambda(bars);
        const kalmanState = this.kalmanStates.get(contractId);
        const kalmanResult = applyKalmanFilter(kalmanState, bar.close);
        this.kalmanStates.set(contractId, {
          estimate: kalmanResult.estimate,
          errorCovariance: kalmanResult.errorCovariance
        });
        const kalmanEstimate = kalmanResult.newEstimate;
        const atr = calculateATR(bars);
        const atrHist = this.atrHistory.get(contractId);
        atrHist.push(atr);
        if (atrHist.length > 500) atrHist.shift();
        const { regime, params: volParams } = detectVolatilityRegime(atr, atrHist, this.tickSize);
        const ofi = computeOrderFlowImbalance(bars, this.config.ofiLookback);
        if (Date.now() - this.lastSignalTime < this.config.cooldownMs) {
          return null;
        }
        const signal = generateSignal({
          contractId,
          currentPrice: bar.close,
          zscore,
          vpin,
          kyleLambda,
          kalmanEstimate,
          regime,
          volParams,
          ofi,
          config: this.config,
          tickSize: this.tickSize
        });
        if (signal) {
          this.lastSignalTime = Date.now();
          this.stats.signals++;
          this.emit("signal", {
            side: signal.direction === "long" ? "buy" : "sell",
            action: "open",
            reason: `Z=${zscore.toFixed(2)}, VPIN=${(vpin * 100).toFixed(0)}%, OFI=${(ofi * 100).toFixed(0)}%, cf=${(signal.confidence * 100).toFixed(0)}%`,
            ...signal
          });
          this.emit("log", {
            type: "info",
            message: `[HQX] SIGNAL: ${signal.direction.toUpperCase()} @ ${bar.close.toFixed(2)} | Z:${zscore.toFixed(2)} VPIN:${(vpin * 100).toFixed(0)}% OFI:${(ofi * 100).toFixed(0)}% Kyle:${kyleLambda.toFixed(5)} Regime:${regime} | Conf:${(signal.confidence * 100).toFixed(0)}%`
          });
        }
        return signal;
      }
      shouldExitByZScore(contractId) {
        const prices = this.priceBuffer.get(contractId);
        if (!prices || prices.length < 50) return false;
        const zscore = computeZScore(prices);
        return Math.abs(zscore) < this.config.zscoreExitThreshold;
      }
      getModelValues(contractId) {
        const prices = this.priceBuffer.get(contractId);
        const volumes = this.volumeBuffer.get(contractId);
        const bars = this.barHistory.get(contractId);
        if (!prices || !volumes || !bars || bars.length < 50) {
          return null;
        }
        const zscore = computeZScore(prices);
        const vpin = computeVPIN(volumes, this.config.vpinWindow);
        const kyleLambda = computeKyleLambda(bars);
        const ofi = computeOrderFlowImbalance(bars, this.config.ofiLookback);
        return {
          zscore: Math.min(1, Math.abs(zscore) / 4),
          vpin: 1 - vpin,
          kyleLambda: kyleLambda > 1e-3 ? 0.5 : 0.8,
          kalman: 0.7,
          volatility: 0.7,
          ofi: Math.abs(ofi) > 0.1 ? 0.8 : 0.5,
          composite: 0.7,
          raw: { zscore, vpin, kyleLambda, ofi }
        };
      }
      getAnalysisState(contractId, currentPrice) {
        const bars = this.barHistory.get(contractId) || [];
        if (bars.length < 50) {
          return { ready: false, message: `Collecting data... ${bars.length}/50 bars` };
        }
        const prices = this.priceBuffer.get(contractId) || [];
        const volumes = this.volumeBuffer.get(contractId) || [];
        const atrHist = this.atrHistory.get(contractId) || [];
        const zscore = computeZScore(prices);
        const vpin = computeVPIN(volumes, this.config.vpinWindow);
        const ofi = computeOrderFlowImbalance(bars, this.config.ofiLookback);
        const kyleLambda = computeKyleLambda(bars);
        const atr = calculateATR(bars);
        const { regime, params } = detectVolatilityRegime(atr, atrHist, this.tickSize);
        return {
          ready: true,
          zScore: zscore,
          vpin,
          ofi,
          kyleLambda,
          regime,
          stopTicks: Math.round(this.config.baseStopTicks * params.stopMultiplier),
          targetTicks: Math.round(this.config.baseTargetTicks * params.targetMultiplier),
          threshold: params.zscoreThreshold,
          barsProcessed: bars.length,
          models: "6 (Z-Score, VPIN, Kyle, Kalman, Vol, OFI)"
        };
      }
      recordTradeResult(pnl) {
        this.recentTrades.push({ netPnl: pnl, timestamp: Date.now() });
        if (this.recentTrades.length > 100) this.recentTrades.shift();
        if (pnl > 0) {
          this.winStreak++;
          this.lossStreak = 0;
          this.stats.wins++;
        } else {
          this.lossStreak++;
          this.winStreak = 0;
          this.stats.losses++;
        }
        this.stats.trades++;
        this.stats.pnl += pnl;
        this.emit("log", {
          type: "debug",
          message: `[HQX] Trade result: ${pnl > 0 ? "WIN" : "LOSS"} $${pnl.toFixed(2)}, streak: ${pnl > 0 ? this.winStreak : -this.lossStreak}`
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
        this.priceBuffer.set(contractId, []);
        this.volumeBuffer.set(contractId, []);
        this.atrHistory.set(contractId, []);
        this.kalmanStates.set(contractId, createKalmanState());
        this.emit("log", {
          type: "info",
          message: `[HQX-UltraScalping] Reset state for ${contractId}`
        });
      }
    };
    module2.exports = { HQXUltraScalping: HQXUltraScalping2 };
  }
});

// ultra-scalping/index.js
var EventEmitter = require("events");
var { HQXUltraScalping } = require_core();
var { OrderSide, SignalStrength } = require_types();
var UltraScalpingStrategy = class extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.strategy = new HQXUltraScalping(config);
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
  getModelValues(contractId) {
    return this.strategy.getModelValues(contractId);
  }
  shouldExitByZScore(contractId) {
    return this.strategy.shouldExitByZScore(contractId);
  }
  generateSignal(params) {
    return null;
  }
  // Signals come from processBar
};
module.exports = {
  HQXUltraScalping,
  UltraScalpingStrategy,
  // Aliases for backward compatibility
  M1: UltraScalpingStrategy,
  S1: HQXUltraScalping,
  OrderSide,
  SignalStrength
};
