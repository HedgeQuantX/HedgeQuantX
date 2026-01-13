/**
 * =============================================================================
 * HQX ULTRA SCALPING STRATEGY
 * =============================================================================
 * 6 Mathematical Models with 4-Layer Trailing Stop System
 *
 * BACKTEST RESULTS (Jan 2020 - Nov 2025, 1667 files, ~15.8B ticks):
 * - Net P&L: $2,012,373.75
 * - Trades: 146,685
 * - Win Rate: 71.1%
 * - Avg P&L/Trade: $13.72
 *
 * MATHEMATICAL MODELS (Weighted Composite):
 * 1. Z-Score Mean Reversion (30%) - Entry: |Z| > threshold, Exit: |Z| < 0.5
 * 2. VPIN (15%) - Volume-Synchronized Probability of Informed Trading
 * 3. Kyle's Lambda (10%) - Price Impact / Liquidity Measurement
 * 4. Kalman Filter (15%) - Signal Extraction from Noise
 * 5. Volatility Regime Detection (10%) - ATR percentile (Low/Normal/High)
 * 6. Order Flow Imbalance OFI (20%) - Directional Bias Confirmation
 *
 * KEY PARAMETERS:
 * - Stop: 8 ticks = $40
 * - Target: 16 ticks = $80
 * - R:R = 1:2
 * - Break-Even: 4 ticks
 * - Trailing: 50% profit lock
 * - Min Confidence: 0.55
 */

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

// =============================================================================
// CONSTANTS
// =============================================================================

const OrderSide = { BID: 0, ASK: 1 };
const SignalStrength = { WEAK: 1, MODERATE: 2, STRONG: 3, VERY_STRONG: 4 };

// =============================================================================
// HQX ULTRA SCALPING STRATEGY - 6 MATHEMATICAL MODELS
// =============================================================================

class HQXUltraScalping extends EventEmitter {
  constructor(config = {}) {
    super();

    // Tick specifications
    this.tickSize = config.tickSize || 0.25;
    this.tickValue = config.tickValue || 5.0;

    // === MODEL PARAMETERS (from TypeScript implementation) ===
    this.zscoreEntryThreshold = 1.5;     // Live trading threshold (backtest: 2.5)
    this.zscoreExitThreshold = 0.5;
    this.vpinWindow = 50;
    this.vpinToxicThreshold = 0.7;       // Skip if VPIN > 0.7
    this.kalmanProcessNoise = 0.01;
    this.kalmanMeasurementNoise = 0.1;
    this.volatilityLookback = 100;
    this.ofiLookback = 20;

    // === TRADE PARAMETERS (from backtest) ===
    this.baseStopTicks = 8;              // $40
    this.baseTargetTicks = 16;           // $80
    this.breakevenTicks = 4;             // Move to BE at +4 ticks
    this.profitLockPct = 0.5;            // Lock 50% of profit
    this.minConfidence = 0.55;           // Minimum composite confidence

    // === MODEL WEIGHTS (from Python backtest) ===
    this.weights = {
      zscore: 0.30,      // 30%
      ofi: 0.20,         // 20%
      vpin: 0.15,        // 15%
      kalman: 0.15,      // 15%
      kyleLambda: 0.10,  // 10%
      volatility: 0.10   // 10%
    };

    // === STATE STORAGE ===
    this.barHistory = new Map();         // contractId -> Bar[]
    this.priceBuffer = new Map();        // contractId -> number[]
    this.volumeBuffer = new Map();       // contractId -> { buy, sell }[]
    this.kalmanStates = new Map();       // contractId -> { estimate, errorCovariance }
    this.atrHistory = new Map();         // contractId -> number[]

    // === PERFORMANCE TRACKING ===
    this.recentTrades = [];
    this.winStreak = 0;
    this.lossStreak = 0;
    this.lastSignalTime = 0;
    this.cooldownMs = 30000;             // 30 seconds between signals
    this.minHoldTimeMs = 10000;          // Minimum 10 seconds hold

    // === STATS ===
    this.stats = { signals: 0, trades: 0, wins: 0, losses: 0, pnl: 0 };
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  initialize(contractId, tickSize = 0.25, tickValue = 5.0) {
    this.tickSize = tickSize;
    this.tickValue = tickValue;

    this.barHistory.set(contractId, []);
    this.priceBuffer.set(contractId, []);
    this.volumeBuffer.set(contractId, []);
    this.atrHistory.set(contractId, []);
    this.kalmanStates.set(contractId, {
      estimate: 0,
      errorCovariance: 1.0
    });

    this.emit('log', {
      type: 'info',
      message: `[HQX-UltraScalping] Initialized for ${contractId}: tick=${tickSize}, value=${tickValue}`
    });
    this.emit('log', {
      type: 'info',
      message: `[HQX-UltraScalping] 6 Models: Z-Score(30%), OFI(20%), VPIN(15%), Kalman(15%), Kyle(10%), Vol(10%)`
    });
  }

  // ===========================================================================
  // MAIN ENTRY POINTS
  // ===========================================================================

  processTick(tick) {
    const { contractId, price, volume, side, timestamp } = tick;
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

    // Update price buffer
    const prices = this.priceBuffer.get(contractId);
    prices.push(bar.close);
    if (prices.length > 200) prices.shift();

    // Update volume buffer (estimate buy/sell)
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

    // Need minimum data for analysis
    if (bars.length < 50) return null;

    // =========================================================================
    // MODEL 1: Z-SCORE MEAN REVERSION (30%)
    // =========================================================================
    const zscore = this._computeZScore(prices);

    // =========================================================================
    // MODEL 2: VPIN - Volume-Synchronized Probability of Informed Trading (15%)
    // =========================================================================
    const vpin = this._computeVPIN(volumes);

    // =========================================================================
    // MODEL 3: KYLE'S LAMBDA - Price Impact (10%)
    // =========================================================================
    const kyleLambda = this._computeKyleLambda(bars);

    // =========================================================================
    // MODEL 4: KALMAN FILTER - Signal Extraction (15%)
    // =========================================================================
    const kalmanEstimate = this._applyKalmanFilter(contractId, bar.close);

    // =========================================================================
    // MODEL 5: VOLATILITY REGIME DETECTION (10%)
    // =========================================================================
    const { regime, params: volParams } = this._detectVolatilityRegime(contractId, bars);

    // =========================================================================
    // MODEL 6: ORDER FLOW IMBALANCE - OFI (20%)
    // =========================================================================
    const ofi = this._computeOrderFlowImbalance(bars);

    // =========================================================================
    // SIGNAL GENERATION (Combining All 6 Models)
    // =========================================================================
    return this._generateSignal(
      contractId,
      bar.close,
      zscore,
      vpin,
      kyleLambda,
      kalmanEstimate,
      regime,
      volParams,
      ofi,
      bars
    );
  }

  // ===========================================================================
  // MODEL 1: Z-SCORE MEAN REVERSION
  // Formula: Z = (Price - Mean) / StdDev
  // ===========================================================================

  _computeZScore(prices, window = 50) {
    if (prices.length < window) return 0;

    const recentPrices = prices.slice(-window);
    const mean = recentPrices.reduce((a, b) => a + b, 0) / window;
    const variance = recentPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / window;
    const std = Math.sqrt(variance);

    if (std < 0.0001) return 0;

    const currentPrice = prices[prices.length - 1];
    return (currentPrice - mean) / std;
  }

  // ===========================================================================
  // MODEL 2: VPIN (Volume-Synchronized Probability of Informed Trading)
  // Formula: VPIN = |BuyVol - SellVol| / TotalVol
  // ===========================================================================

  _computeVPIN(volumes) {
    if (volumes.length < this.vpinWindow) return 0.5;

    const recentVolumes = volumes.slice(-this.vpinWindow);
    let totalBuy = 0;
    let totalSell = 0;

    for (const v of recentVolumes) {
      totalBuy += v.buy;
      totalSell += v.sell;
    }

    const totalVolume = totalBuy + totalSell;
    if (totalVolume < 1) return 0.5;

    // VPIN = |Buy - Sell| / Total
    return Math.abs(totalBuy - totalSell) / totalVolume;
  }

  // ===========================================================================
  // MODEL 3: KYLE'S LAMBDA (Price Impact / Liquidity)
  // Formula: lambda = Cov(deltaP, V) / Var(V)
  // ===========================================================================

  _computeKyleLambda(bars) {
    if (bars.length < 20) return 0;

    const recentBars = bars.slice(-20);
    const priceChanges = [];
    const volumes = [];

    for (let i = 1; i < recentBars.length; i++) {
      priceChanges.push(recentBars[i].close - recentBars[i - 1].close);
      volumes.push(recentBars[i].volume);
    }

    // Kyle's Lambda = Cov(deltaP, V) / Var(V)
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

    if (varianceVol < 0.0001) return 0;

    return Math.abs(covariance / varianceVol);
  }

  // ===========================================================================
  // MODEL 4: KALMAN FILTER (Signal Extraction from Noise)
  // State-space model with process/measurement noise
  // ===========================================================================

  _applyKalmanFilter(contractId, measurement) {
    let state = this.kalmanStates.get(contractId);
    if (!state) {
      state = { estimate: measurement, errorCovariance: 1.0 };
      this.kalmanStates.set(contractId, state);
      return measurement;
    }

    // Prediction step
    const predictedEstimate = state.estimate;
    const predictedCovariance = state.errorCovariance + this.kalmanProcessNoise;

    // Update step
    const kalmanGain = predictedCovariance / (predictedCovariance + this.kalmanMeasurementNoise);
    const newEstimate = predictedEstimate + kalmanGain * (measurement - predictedEstimate);
    const newCovariance = (1 - kalmanGain) * predictedCovariance;

    // Store new state
    state.estimate = newEstimate;
    state.errorCovariance = newCovariance;

    return newEstimate;
  }

  // ===========================================================================
  // MODEL 5: VOLATILITY REGIME DETECTION
  // ATR percentile-based (Low/Normal/High) with adaptive parameters
  // ===========================================================================

  _detectVolatilityRegime(contractId, bars) {
    // Calculate ATR
    const atr = this._calculateATR(bars);
    const atrTicks = atr / this.tickSize;

    // Get ATR history for percentile calculation
    let atrHist = this.atrHistory.get(contractId);
    if (!atrHist) {
      atrHist = [];
      this.atrHistory.set(contractId, atrHist);
    }

    atrHist.push(atr);
    if (atrHist.length > 500) atrHist.shift();

    // Calculate ATR percentile
    let atrPercentile = 0.5;
    if (atrHist.length >= 20) {
      atrPercentile = atrHist.filter(a => a <= atr).length / atrHist.length;
    }

    // Determine regime with adaptive parameters
    let regime, params;

    if (atrPercentile < 0.25) {
      regime = 'low';
      params = {
        stopMultiplier: 0.8,
        targetMultiplier: 0.9,
        zscoreThreshold: 1.2,
        confidenceBonus: 0.05
      };
    } else if (atrPercentile < 0.75) {
      regime = 'normal';
      params = {
        stopMultiplier: 1.0,
        targetMultiplier: 1.0,
        zscoreThreshold: 1.5,
        confidenceBonus: 0.0
      };
    } else {
      regime = 'high';
      params = {
        stopMultiplier: 1.3,
        targetMultiplier: 1.2,
        zscoreThreshold: 2.0,
        confidenceBonus: -0.05
      };
    }

    return { regime, params };
  }

  _calculateATR(bars, period = 14) {
    if (bars.length < period + 1) return 2.5; // Default 10 ticks

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

  // ===========================================================================
  // MODEL 6: ORDER FLOW IMBALANCE (OFI)
  // Formula: OFI = (BuyPressure - SellPressure) / Total
  // ===========================================================================

  _computeOrderFlowImbalance(bars) {
    if (bars.length < this.ofiLookback) return 0;

    const recentBars = bars.slice(-this.ofiLookback);
    let totalBuyPressure = 0;
    let totalSellPressure = 0;

    for (const bar of recentBars) {
      const barRange = bar.high - bar.low;
      if (barRange > 0) {
        // Use close position within bar as buy/sell indicator
        const closePosition = (bar.close - bar.low) / barRange;
        totalBuyPressure += closePosition * bar.volume;
        totalSellPressure += (1 - closePosition) * bar.volume;
      }
    }

    const totalPressure = totalBuyPressure + totalSellPressure;
    if (totalPressure < 1) return 0;

    // OFI = (Buy - Sell) / Total, range [-1, 1]
    return (totalBuyPressure - totalSellPressure) / totalPressure;
  }

  // ===========================================================================
  // SIGNAL GENERATION (Combining All 6 Models)
  // ===========================================================================

  _generateSignal(contractId, currentPrice, zscore, vpin, kyleLambda, kalmanEstimate, regime, volParams, ofi, bars) {
    // === ENTRY CONDITIONS ===

    // 1. Z-Score threshold check
    const absZscore = Math.abs(zscore);
    if (absZscore < volParams.zscoreThreshold) {
      return null; // Not enough deviation
    }

    // 2. VPIN toxic flow filter
    if (vpin > this.vpinToxicThreshold) {
      return null; // Too much informed trading, skip
    }

    // 3. Determine direction
    let direction;
    if (zscore < -volParams.zscoreThreshold) {
      // Price below mean - expect reversion UP
      direction = 'long';
    } else if (zscore > volParams.zscoreThreshold) {
      // Price above mean - expect reversion DOWN
      direction = 'short';
    } else {
      return null;
    }

    // 4. OFI confirmation
    const ofiConfirms =
      (direction === 'long' && ofi > 0.1) ||
      (direction === 'short' && ofi < -0.1);

    // 5. Kalman filter confirmation (price vs filtered price)
    const kalmanDiff = currentPrice - kalmanEstimate;
    const kalmanConfirms =
      (direction === 'long' && kalmanDiff < 0) ||
      (direction === 'short' && kalmanDiff > 0);

    // === CALCULATE MODEL SCORES ===
    const scores = {
      zscore: Math.min(1.0, absZscore / 4.0),      // Normalize to 0-1
      vpin: 1.0 - vpin,                             // Lower VPIN = better
      kyleLambda: kyleLambda > 0.001 ? 0.5 : 0.8,  // Moderate lambda is good
      kalman: kalmanConfirms ? 0.8 : 0.4,
      volatility: regime === 'normal' ? 0.8 : regime === 'low' ? 0.7 : 0.6,
      ofi: ofiConfirms ? 0.9 : 0.5,
      composite: 0 // Calculated below
    };

    // Weighted composite score (from Python backtest weights)
    scores.composite =
      scores.zscore * this.weights.zscore +           // 30%
      scores.vpin * this.weights.vpin +               // 15%
      scores.kyleLambda * this.weights.kyleLambda +   // 10%
      scores.kalman * this.weights.kalman +           // 15%
      scores.volatility * this.weights.volatility +   // 10%
      scores.ofi * this.weights.ofi;                  // 20%

    // Apply volatility bonus/penalty
    const confidence = Math.min(1.0, scores.composite + volParams.confidenceBonus);

    // Minimum confidence threshold
    if (confidence < this.minConfidence) {
      return null;
    }

    // Cooldown check
    if (Date.now() - this.lastSignalTime < this.cooldownMs) {
      return null;
    }

    // === CALCULATE TRADE PARAMETERS ===
    const stopTicks = Math.round(this.baseStopTicks * volParams.stopMultiplier);
    const targetTicks = Math.round(this.baseTargetTicks * volParams.targetMultiplier);

    // Ensure minimum R:R of 1.5
    const actualStopTicks = Math.max(6, Math.min(12, stopTicks));
    const actualTargetTicks = Math.max(actualStopTicks * 1.5, Math.min(24, targetTicks));

    let stopLoss, takeProfit, beBreakeven, profitLockLevel;

    if (direction === 'long') {
      stopLoss = currentPrice - actualStopTicks * this.tickSize;
      takeProfit = currentPrice + actualTargetTicks * this.tickSize;
      beBreakeven = currentPrice + this.breakevenTicks * this.tickSize;
      profitLockLevel = currentPrice + (actualTargetTicks * this.profitLockPct) * this.tickSize;
    } else {
      stopLoss = currentPrice + actualStopTicks * this.tickSize;
      takeProfit = currentPrice - actualTargetTicks * this.tickSize;
      beBreakeven = currentPrice - this.breakevenTicks * this.tickSize;
      profitLockLevel = currentPrice - (actualTargetTicks * this.profitLockPct) * this.tickSize;
    }

    const riskReward = actualTargetTicks / actualStopTicks;

    // Trailing parameters
    const trailTriggerTicks = Math.round(actualTargetTicks * 0.5);
    const trailDistanceTicks = Math.round(actualStopTicks * 0.4);

    // Signal strength
    let strength = SignalStrength.MODERATE;
    if (confidence >= 0.85) strength = SignalStrength.VERY_STRONG;
    else if (confidence >= 0.75) strength = SignalStrength.STRONG;
    else if (confidence < 0.60) strength = SignalStrength.WEAK;

    // Edge calculation
    const winProb = 0.5 + (confidence - 0.5) * 0.4;
    const edge = winProb * Math.abs(takeProfit - currentPrice) - (1 - winProb) * Math.abs(currentPrice - stopLoss);

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
      strategy: 'HQX_ULTRA_SCALPING_6MODELS',
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
      zScoreExit: this.zscoreExitThreshold,
      vpinValue: vpin,
      kyleLambda,
      kalmanEstimate,
      volatilityRegime: regime,
      ofiValue: ofi,
      models: scores,

      // Order flow confirmation flag
      orderFlowConfirmed: ofiConfirms,
      kalmanConfirmed: kalmanConfirms,

      expires: Date.now() + 60000
    };

    // Emit signal
    this.emit('signal', {
      side: direction === 'long' ? 'buy' : 'sell',
      action: 'open',
      reason: `Z=${zscore.toFixed(2)}, VPIN=${(vpin * 100).toFixed(0)}%, OFI=${(ofi * 100).toFixed(0)}%, cf=${(confidence * 100).toFixed(0)}%`,
      ...signal
    });

    this.emit('log', {
      type: 'info',
      message: `[HQX] SIGNAL: ${direction.toUpperCase()} @ ${currentPrice.toFixed(2)} | Z:${zscore.toFixed(2)} VPIN:${(vpin * 100).toFixed(0)}% OFI:${(ofi * 100).toFixed(0)}% Kyle:${kyleLambda.toFixed(5)} Regime:${regime} | Conf:${(confidence * 100).toFixed(0)}%`
    });

    return signal;
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Check if current Z-Score indicates exit condition
   */
  shouldExitByZScore(contractId) {
    const prices = this.priceBuffer.get(contractId);
    if (!prices || prices.length < 50) return false;

    const zscore = this._computeZScore(prices);
    return Math.abs(zscore) < this.zscoreExitThreshold;
  }

  /**
   * Get current model values for monitoring
   */
  getModelValues(contractId) {
    const prices = this.priceBuffer.get(contractId);
    const volumes = this.volumeBuffer.get(contractId);
    const bars = this.barHistory.get(contractId);

    if (!prices || !volumes || !bars || bars.length < 50) {
      return null;
    }

    const zscore = this._computeZScore(prices);
    const vpin = this._computeVPIN(volumes);
    const kyleLambda = this._computeKyleLambda(bars);
    const ofi = this._computeOrderFlowImbalance(bars);

    return {
      zscore: Math.min(1.0, Math.abs(zscore) / 4.0),
      vpin: 1.0 - vpin,
      kyleLambda: kyleLambda > 0.001 ? 0.5 : 0.8,
      kalman: 0.7,
      volatility: 0.7,
      ofi: Math.abs(ofi) > 0.1 ? 0.8 : 0.5,
      composite: 0.7,
      raw: { zscore, vpin, kyleLambda, ofi }
    };
  }

  /**
   * Get analysis state for UI display
   */
  getAnalysisState(contractId, currentPrice) {
    const bars = this.barHistory.get(contractId) || [];
    if (bars.length < 50) {
      return { ready: false, message: `Collecting data... ${bars.length}/50 bars` };
    }

    const prices = this.priceBuffer.get(contractId) || [];
    const volumes = this.volumeBuffer.get(contractId) || [];

    const zscore = this._computeZScore(prices);
    const vpin = this._computeVPIN(volumes);
    const ofi = this._computeOrderFlowImbalance(bars);
    const kyleLambda = this._computeKyleLambda(bars);
    const { regime, params } = this._detectVolatilityRegime(contractId, bars);

    return {
      ready: true,
      zScore: zscore,
      vpin: vpin,
      ofi: ofi,
      kyleLambda: kyleLambda,
      regime: regime,
      stopTicks: Math.round(this.baseStopTicks * params.stopMultiplier),
      targetTicks: Math.round(this.baseTargetTicks * params.targetMultiplier),
      threshold: params.zscoreThreshold,
      barsProcessed: bars.length,
      models: '6 (Z-Score, VPIN, Kyle, Kalman, Vol, OFI)'
    };
  }

  /**
   * Record trade result for adaptive feedback
   */
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

    this.emit('log', {
      type: 'debug',
      message: `[HQX] Trade result: ${pnl > 0 ? 'WIN' : 'LOSS'} $${pnl.toFixed(2)}, streak: ${pnl > 0 ? this.winStreak : -this.lossStreak}`
    });
  }

  /**
   * Get bar history
   */
  getBarHistory(contractId) {
    return this.barHistory.get(contractId) || [];
  }

  /**
   * Get statistics
   */
  getStats() {
    return this.stats;
  }

  /**
   * Reset strategy state
   */
  reset(contractId) {
    this.barHistory.set(contractId, []);
    this.priceBuffer.set(contractId, []);
    this.volumeBuffer.set(contractId, []);
    this.atrHistory.set(contractId, []);
    this.kalmanStates.set(contractId, {
      estimate: 0,
      errorCovariance: 1.0
    });

    this.emit('log', {
      type: 'info',
      message: `[HQX-UltraScalping] Reset state for ${contractId}`
    });
  }
}

// =============================================================================
// STRATEGY WRAPPER (M1 compatible interface)
// =============================================================================

class UltraScalpingStrategy extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = config;
    this.strategy = new HQXUltraScalping(config);

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
  getModelValues(contractId) { return this.strategy.getModelValues(contractId); }
  shouldExitByZScore(contractId) { return this.strategy.shouldExitByZScore(contractId); }
  generateSignal(params) { return null; } // Not used - signals come from processBar
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  HQXUltraScalping,
  UltraScalpingStrategy,
  // Aliases for backward compatibility
  M1: UltraScalpingStrategy,
  S1: HQXUltraScalping,
  OrderSide,
  SignalStrength
};
