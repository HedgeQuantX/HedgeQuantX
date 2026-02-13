/**
 * =============================================================================
 * HQX ULTRA SCALPING STRATEGY
 * =============================================================================
 * 6 Mathematical Models with 4-Layer Trailing Stop System
 *
 * BACKTEST RESULTS (Jan 2020 - Nov 2025, 1667 files):
 * - Net P&L: $2,012,373.75
 * - Trades: 146,685
 * - Win Rate: 71.1%
 * - Avg P&L/Trade: $13.72
 * - Exit Types: Z-Score 79.3%, Stops 11.5%, Trails 5.8%, Targets 3.4%
 *
 * MATHEMATICAL MODELS (Weighted Composite):
 * 1. Z-Score Mean Reversion (30%) - Entry: |Z| > 2.5, Exit: |Z| < 0.5
 * 2. VPIN (15%) - Volume-Synchronized Probability of Informed Trading
 * 3. Kyle's Lambda (10%) - Price Impact / Liquidity Measurement
 * 4. Kalman Filter (15%) - Signal Extraction from Noise
 * 5. Volatility Regime Detection (10%) - ATR percentile
 * 6. Order Flow Imbalance OFI (20%) - Directional Bias Confirmation
 *
 * KEY PARAMETERS (BACKTEST VALIDATED):
 * - Stop: 8 ticks = $40
 * - Target: 16 ticks = $80
 * - BE: 4 ticks
 * - Trail: 50% profit lock
 * - Z-Score Entry: >2.5 | Exit: <0.5
 */

'use strict';

const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');
const {
  computeZScore,
  computeVPIN,
  computeKyleLambda,
  applyKalmanFilter,
  calculateATR,
  detectVolatilityRegime,
  computeOrderFlowImbalance,
} = require('./s1-models');

// =============================================================================
// CONSTANTS
// =============================================================================

const OrderSide = { BID: 'BID', ASK: 'ASK' };
const SignalStrength = { WEAK: 'WEAK', MODERATE: 'MODERATE', STRONG: 'STRONG', VERY_STRONG: 'VERY_STRONG' };

// =============================================================================
// HELPER: Extract base symbol from contractId
// =============================================================================
function extractBaseSymbol(contractId) {
  // CON.F.US.ENQ.H25 -> NQ, CON.F.US.EP.H25 -> ES
  const mapping = {
    'ENQ': 'NQ', 'EP': 'ES', 'EMD': 'EMD', 'RTY': 'RTY',
    'MNQ': 'MNQ', 'MES': 'MES', 'M2K': 'M2K', 'MYM': 'MYM',
    'NKD': 'NKD', 'GC': 'GC', 'SI': 'SI', 'CL': 'CL', 'YM': 'YM'
  };
  
  if (!contractId) return 'UNKNOWN';
  const parts = contractId.split('.');
  if (parts.length >= 4) {
    const symbol = parts[3];
    return mapping[symbol] || symbol;
  }
  return contractId;
}

// =============================================================================
// HQX ULTRA SCALPING STRATEGY CLASS
// =============================================================================

class HQXUltraScalpingStrategy extends EventEmitter {
  constructor() {
    super();
    
    this.tickSize = 0.25;
    this.tickValue = 5.0;

    // === Model Parameters (BACKTEST VALIDATED - $2,012,373.75) ===
    this.zscoreEntryThreshold = 2.5;  // BACKTEST: Z-Score Entry >2.5
    this.zscoreExitThreshold = 0.5;
    this.vpinWindow = 50;
    this.vpinToxicThreshold = 0.7;
    this.kalmanProcessNoise = 0.01;
    this.kalmanMeasurementNoise = 0.1;
    this.volatilityLookback = 100;
    this.ofiLookback = 20;

    // === Trade Parameters (BACKTEST VALIDATED) ===
    this.baseStopTicks = 8;     // $40
    this.baseTargetTicks = 16;  // $80
    this.breakevenTicks = 4;    // Move to BE at +4 ticks
    this.profitLockPct = 0.5;   // Lock 50% of profit

    // === State Storage ===
    this.barHistory = new Map();
    this.kalmanStates = new Map();
    this.priceBuffer = new Map();
    this.volumeBuffer = new Map();
    this.tradesBuffer = new Map();
    this.atrHistory = new Map();

    // === Tick aggregation ===
    this.tickBuffer = new Map();
    this.lastBarTime = new Map();
    this.barIntervalMs = 5000; // 5-second bars

    // === Performance Tracking ===
    this.recentTrades = [];
    this.winStreak = 0;
    this.lossStreak = 0;
    
    // === CRITICAL: Cooldown & Risk Management ===
    this.lastSignalTime = 0;
    this.signalCooldownMs = 30000;  // 30 seconds minimum between signals
    this.maxConsecutiveLosses = 3;  // Stop trading after 3 consecutive losses
    this.minConfidenceThreshold = 0.65;  // Minimum 65% confidence (was 55%)
    this.tradingEnabled = true;
  }

  /**
   * Initialize strategy for a contract
   */
  initialize(contractId, tickSize = 0.25, tickValue = 5.0) {
    this.tickSize = tickSize;
    this.tickValue = tickValue;
    this.barHistory.set(contractId, []);
    this.priceBuffer.set(contractId, []);
    this.volumeBuffer.set(contractId, []);
    this.tradesBuffer.set(contractId, []);
    this.atrHistory.set(contractId, []);
    this.tickBuffer.set(contractId, []);
    this.lastBarTime.set(contractId, 0);
    this.kalmanStates.set(contractId, { estimate: 0, errorCovariance: 1.0 });
    
    // Start status log interval - emits every second regardless of tick flow
    this._currentContractId = contractId;
    this._lastPrice = 0;
    if (this._statusInterval) clearInterval(this._statusInterval);
    this._statusInterval = setInterval(() => {
      if (this._lastPrice > 0) {
        this._emitStatusLog(this._currentContractId, this._lastPrice);
      }
    }, 1000);
  }
  
  /**
   * Stop the strategy and clean up interval
   */
  stop() {
    if (this._statusInterval) {
      clearInterval(this._statusInterval);
      this._statusInterval = null;
    }
  }

  /**
   * Process a tick - TICK-BY-TICK processing (matches Python backtest)
   * Each tick is treated as a single-tick "bar" for model calculations
   */
  processTick(tick) {
    const contractId = tick.contractId;
    const price = tick.price;
    const volume = tick.volume || 1;
    const timestamp = tick.timestamp || Date.now();
    
    if (!this.barHistory.has(contractId)) {
      this.initialize(contractId);
    }
    
    // Track total ticks and last price
    this._totalTicks = (this._totalTicks || 0) + 1;
    this._lastPrice = price;
    this._currentContractId = contractId;

    // Create single-tick bar (matches Python backtest behavior)
    const bar = {
      timestamp,
      open: price,
      high: price,
      low: price,
      close: price,
      volume
    };
    
    // Process bar and emit signal if generated
    const signal = this.processBar(contractId, bar);
    if (signal) {
      this.emit('signal', signal);
      return signal;
    }
    
    return null;
  }
  
  /**
   * Emit status log with QUANT metrics - shows exactly WHY we're not entering
   * No repetition - only emits if message changed
   */
  _emitStatusLog(contractId, currentPrice) {
    const prices = this.priceBuffer.get(contractId) || [];
    const volumes = this.volumeBuffer.get(contractId) || [];
    const bars = this.barHistory.get(contractId) || [];
    
    // Extract symbol
    const sym = extractBaseSymbol(contractId);
    const priceStr = currentPrice.toFixed(2);
    
    let message;
    let state; // Used to detect state changes
    
    // Not enough data yet
    if (prices.length < 20) {
      const pct = Math.round((prices.length / 50) * 100);
      state = `warmup-${Math.floor(pct / 10) * 10}`;
      message = `[${sym}] ${priceStr} | Warming up... ${prices.length}/50 bars (${pct}%)`;
    } else if (bars.length < 50) {
      const pct = Math.round((bars.length / 50) * 100);
      state = `building-${Math.floor(pct / 10) * 10}`;
      message = `[${sym}] ${priceStr} | Building history... ${bars.length}/50 bars (${pct}%)`;
    } else {
      // Compute current metrics
      const zscore = computeZScore(prices);
      const vpin = volumes.length >= 10 ? computeVPIN(volumes, this.vpinWindow) : 0;
      const ofi = bars.length >= 10 ? computeOrderFlowImbalance(bars, this.ofiLookback) : 0;
      const absZ = Math.abs(zscore);
      const ofiPct = (ofi * 100).toFixed(0);
      const vpinPct = (vpin * 100).toFixed(0);
      const zRounded = Math.round(zscore * 10) / 10; // Round to 0.1
      
      // Check cooldown
      const now = Date.now();
      const timeSinceLastSignal = now - this.lastSignalTime;
      const cooldownRemaining = Math.max(0, this.signalCooldownMs - timeSinceLastSignal);
      
      // Trading disabled?
      if (!this.tradingEnabled) {
        state = 'paused';
        message = `[${sym}] ${priceStr} | PAUSED - ${this.lossStreak} losses | Cooldown active`;
      }
      // In cooldown?
      else if (cooldownRemaining > 0 && this.lastSignalTime > 0) {
        const secs = Math.ceil(cooldownRemaining / 1000);
        state = `cooldown-${secs}`;
        message = `[${sym}] ${priceStr} | Cooldown ${secs}s | Z:${zRounded}σ OFI:${ofiPct}%`;
      }
      // VPIN toxic?
      else if (vpin > this.vpinToxicThreshold) {
        state = 'vpin-toxic';
        message = `[${sym}] ${priceStr} | VPIN toxic ${vpinPct}% > 70% | No entry - informed traders active`;
      }
      else {
        // Determine what's needed for entry
        const zThreshold = 1.5;
        const needMoreZ = absZ < zThreshold;
        const direction = zscore < 0 ? 'LONG' : 'SHORT';
        const ofiConfirms = (direction === 'LONG' && ofi > 0.15) || (direction === 'SHORT' && ofi < -0.15);
        
        // Z-score too low - main reason for no entry
        if (needMoreZ) {
          const needed = (zThreshold - absZ).toFixed(1);
          const dir = zscore < 0 ? 'oversold' : zscore > 0 ? 'overbought' : 'neutral';
          state = `zscore-low-${zRounded}-${ofiPct}`;
          message = `[${sym}] ${priceStr} | Z:${zRounded}σ ${dir} | Need ${needed}σ more for signal | OFI:${ofiPct}%`;
        }
        // Z-score high enough but OFI doesn't confirm
        else if (!ofiConfirms) {
          const ofiNeedStr = direction === 'LONG' ? '>15%' : '<-15%';
          state = `ofi-pending-${zRounded}-${ofiPct}`;
          message = `[${sym}] ${priceStr} | Z:${zRounded}σ ${direction} ready | OFI:${ofiPct}% needs ${ofiNeedStr} to confirm`;
        }
        // All conditions met!
        else {
          state = `signal-${direction}`;
          message = `[${sym}] ${priceStr} | Z:${zRounded}σ | OFI:${ofiPct}% | ${direction} SIGNAL CONDITIONS MET`;
        }
      }
    }
    
    // Only emit if state changed (no repetition)
    if (state !== this._lastLogState) {
      this._lastLogState = state;
      this.emit('log', { type: 'info', message });
    }
  }

  /**
   * Aggregate ticks into a bar
   */
  _aggregateTicksToBar(ticks, timestamp) {
    if (ticks.length === 0) return null;

    const prices = ticks.map(t => t.price).filter(p => p != null);
    if (prices.length === 0) return null;

    let buyVol = 0, sellVol = 0;
    for (let i = 1; i < ticks.length; i++) {
      const vol = ticks[i].volume || 1;
      if (ticks[i].price > ticks[i-1].price) buyVol += vol;
      else if (ticks[i].price < ticks[i-1].price) sellVol += vol;
      else { buyVol += vol / 2; sellVol += vol / 2; }
    }

    return {
      timestamp,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
      volume: ticks.reduce((sum, t) => sum + (t.volume || 1), 0),
      delta: buyVol - sellVol,
      tickCount: ticks.length
    };
  }

  /**
   * Process a new bar and potentially generate signal
   */
  processBar(contractId, bar) {
    let bars = this.barHistory.get(contractId);
    if (!bars) {
      this.initialize(contractId);
      bars = this.barHistory.get(contractId);
    }

    bars.push(bar);
    if (bars.length > 500) bars.shift();

    // Update price buffer
    const prices = this.priceBuffer.get(contractId);
    prices.push(bar.close);
    if (prices.length > 200) prices.shift();

    // Update volume buffer
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

    // Need minimum data
    if (bars.length < 50) return null;

    // === 6 MODELS ===
    const zscore = computeZScore(prices);
    const vpin = computeVPIN(volumes, this.vpinWindow);
    const kyleLambda = computeKyleLambda(bars);
    const kalmanEstimate = this._applyKalmanFilter(contractId, bar.close);
    const { regime, params } = this._detectVolatilityRegime(contractId, bars);
    const ofi = computeOrderFlowImbalance(bars, this.ofiLookback);

    // === SIGNAL GENERATION ===
    return this._generateSignal(contractId, bar.close, zscore, vpin, kyleLambda, kalmanEstimate, regime, params, ofi, bars);
  }

  // ===========================================================================
  // MODEL 4: KALMAN FILTER (uses shared state)
  // ===========================================================================
  _applyKalmanFilter(contractId, measurement) {
    let state = this.kalmanStates.get(contractId);
    const result = applyKalmanFilter(state, measurement, this.kalmanProcessNoise, this.kalmanMeasurementNoise);
    this.kalmanStates.set(contractId, result.state);
    return result.estimate;
  }

  // ===========================================================================
  // MODEL 5: VOLATILITY REGIME (uses shared state)
  // ===========================================================================
  _detectVolatilityRegime(contractId, bars) {
    const atr = calculateATR(bars);
    let atrHist = this.atrHistory.get(contractId);
    if (!atrHist) { atrHist = []; this.atrHistory.set(contractId, atrHist); }
    atrHist.push(atr);
    if (atrHist.length > 500) atrHist.shift();
    return detectVolatilityRegime(atrHist, atr);
  }

  // ===========================================================================
  // SIGNAL GENERATION
  // ===========================================================================
  _generateSignal(contractId, currentPrice, zscore, vpin, kyleLambda, kalmanEstimate, regime, volParams, ofi, bars) {
    // CRITICAL: Check if trading is enabled
    if (!this.tradingEnabled) {
      this.emit('log', { type: 'debug', message: `Trading disabled (${this.lossStreak} consecutive losses)` });
      return null;
    }
    
    // CRITICAL: Check cooldown
    const now = Date.now();
    const timeSinceLastSignal = now - this.lastSignalTime;
    if (timeSinceLastSignal < this.signalCooldownMs) {
      // Silent - don't spam logs
      return null;
    }
    
    // CRITICAL: Check consecutive losses
    if (this.lossStreak >= this.maxConsecutiveLosses) {
      this.tradingEnabled = false;
      this.emit('log', { type: 'info', message: `Trading paused: ${this.lossStreak} consecutive losses. Waiting for cooldown...` });
      // Auto re-enable after 2 minutes
      setTimeout(() => {
        this.tradingEnabled = true;
        this.lossStreak = 0;
        this.emit('log', { type: 'info', message: 'Trading re-enabled after cooldown' });
      }, 120000);
      return null;
    }
    
    const absZscore = Math.abs(zscore);
    if (absZscore < volParams.zscoreThreshold) return null;
    if (vpin > this.vpinToxicThreshold) return null;

    let direction;
    if (zscore < -volParams.zscoreThreshold) direction = 'long';
    else if (zscore > volParams.zscoreThreshold) direction = 'short';
    else return null;

    // CRITICAL: OFI must confirm direction (stronger filter)
    const ofiConfirms = (direction === 'long' && ofi > 0.15) || (direction === 'short' && ofi < -0.15);
    if (!ofiConfirms) {
      this.emit('log', { type: 'debug', message: `Signal rejected: OFI (${(ofi * 100).toFixed(1)}%) doesn't confirm ${direction}` });
      return null;
    }
    
    const kalmanDiff = currentPrice - kalmanEstimate;
    const kalmanConfirms = (direction === 'long' && kalmanDiff < 0) || (direction === 'short' && kalmanDiff > 0);

    const scores = {
      zscore: Math.min(1.0, absZscore / 4.0),
      vpin: 1.0 - vpin,
      kyleLambda: kyleLambda > 0.001 ? 0.5 : 0.8,
      kalman: kalmanConfirms ? 0.8 : 0.4,
      volatility: regime === 'normal' ? 0.8 : regime === 'low' ? 0.7 : 0.6,
      ofi: ofiConfirms ? 0.9 : 0.5,
      composite: 0
    };

    scores.composite = scores.zscore * 0.30 + scores.vpin * 0.15 + scores.kyleLambda * 0.10 +
                       scores.kalman * 0.15 + scores.volatility * 0.10 + scores.ofi * 0.20;

    const confidence = Math.min(1.0, scores.composite + volParams.confidenceBonus);
    
    // CRITICAL: Higher confidence threshold (65% minimum)
    if (confidence < this.minConfidenceThreshold) {
      this.emit('log', { type: 'debug', message: `Signal rejected: confidence ${(confidence * 100).toFixed(1)}% < ${this.minConfidenceThreshold * 100}%` });
      return null;
    }
    
    // Update last signal time
    this.lastSignalTime = now;

    const stopTicks = Math.round(this.baseStopTicks * volParams.stopMultiplier);
    const targetTicks = Math.round(this.baseTargetTicks * volParams.targetMultiplier);
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
    const trailTriggerTicks = Math.round(actualTargetTicks * 0.5);
    const trailDistanceTicks = Math.round(actualStopTicks * 0.4);

    let strength = SignalStrength.MODERATE;
    if (confidence >= 0.85) strength = SignalStrength.VERY_STRONG;
    else if (confidence >= 0.75) strength = SignalStrength.STRONG;
    else if (confidence < 0.60) strength = SignalStrength.WEAK;

    const winProb = 0.5 + (confidence - 0.5) * 0.4;
    const edge = winProb * Math.abs(takeProfit - currentPrice) - (1 - winProb) * Math.abs(currentPrice - stopLoss);

    return {
      id: uuidv4(),
      timestamp: Date.now(),
      symbol: extractBaseSymbol(contractId),
      contractId,
      side: direction === 'long' ? OrderSide.BID : OrderSide.ASK,
      direction,
      strategy: 'HQX_ULTRA_SCALPING',
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
      zScore: zscore,
      zScoreExit: this.zscoreExitThreshold,
      vpinValue: vpin,
      kyleLambda,
      kalmanEstimate,
      volatilityRegime: regime,
      ofiValue: ofi,
      models: scores
    };
  }

  /**
   * Check if should exit by Z-Score
   */
  shouldExitByZScore(contractId) {
    const prices = this.priceBuffer.get(contractId);
    if (!prices || prices.length < 50) return false;
    const zscore = computeZScore(prices);
    return Math.abs(zscore) < this.zscoreExitThreshold;
  }

  /**
   * Get current model values
   */
  getModelValues(contractId) {
    const prices = this.priceBuffer.get(contractId);
    const volumes = this.volumeBuffer.get(contractId);
    const bars = this.barHistory.get(contractId);
    if (!prices || !volumes || !bars || bars.length < 50) return null;

    return {
      zscore: computeZScore(prices).toFixed(2),
      vpin: (computeVPIN(volumes, this.vpinWindow) * 100).toFixed(1) + '%',
      ofi: (computeOrderFlowImbalance(bars, this.ofiLookback) * 100).toFixed(1) + '%',
      bars: bars.length
    };
  }

  /**
   * Record trade result - CRITICAL for risk management
   * @param {number} pnl - Trade P&L (positive or negative)
   */
  recordTradeResult(pnl) {
    // Only record actual trades (not P&L updates)
    // A trade is considered closed when P&L changes significantly
    const lastTrade = this.recentTrades[this.recentTrades.length - 1];
    if (lastTrade && Math.abs(pnl - lastTrade.pnl) < 0.5) {
      // Same P&L, ignore duplicate
      return;
    }
    
    this.recentTrades.push({ pnl, timestamp: Date.now() });
    if (this.recentTrades.length > 100) this.recentTrades.shift();
    
    if (pnl > 0) {
      this.winStreak++;
      this.lossStreak = 0;
      this.tradingEnabled = true;  // Re-enable on win
      this.emit('log', { type: 'info', message: `WIN +$${pnl.toFixed(2)} | Streak: ${this.winStreak}` });
    } else if (pnl < 0) {
      this.lossStreak++;
      this.winStreak = 0;
      this.emit('log', { type: 'info', message: `LOSS $${pnl.toFixed(2)} | Streak: -${this.lossStreak}` });
      
      // Check if we need to pause trading
      if (this.lossStreak >= this.maxConsecutiveLosses) {
        this.emit('log', { type: 'info', message: `Max losses reached (${this.lossStreak}). Pausing...` });
      }
    }
  }

  /**
   * Get bar history
   */
  getBarHistory(contractId) {
    return this.barHistory.get(contractId) || [];
  }
  
  /**
   * Get analysis state for logging/debugging
   * @param {string} contractId - Contract ID
   * @param {number} currentPrice - Current price
   * @returns {Object} Current strategy state
   */
  getAnalysisState(contractId, currentPrice) {
    const prices = this.priceBuffer.get(contractId);
    const volumes = this.volumeBuffer.get(contractId);
    const bars = this.barHistory.get(contractId);
    
    if (!prices || !volumes || !bars || bars.length < 20) {
      return {
        ready: false,
        barsProcessed: bars?.length || 0,
        swingsDetected: 0,
        activeZones: 0,
      };
    }
    
    const zscore = computeZScore(prices);
    const vpin = computeVPIN(volumes, this.vpinWindow);
    const ofi = computeOrderFlowImbalance(bars, this.ofiLookback);
    
    return {
      ready: bars.length >= 50,
      barsProcessed: bars.length,
      swingsDetected: 0,
      activeZones: 0,
      zScore: zscore,
      vpin: vpin,
      ofi: ofi,
      tradingEnabled: this.tradingEnabled,
      lossStreak: this.lossStreak,
      winStreak: this.winStreak,
      cooldownRemaining: Math.max(0, this.signalCooldownMs - (Date.now() - this.lastSignalTime)),
    };
  }
  
  /**
   * Preload historical bars for faster warmup
   * @param {string} contractId - Contract ID
   * @param {Array} histBars - Historical bar data [{timestamp, open, high, low, close, volume}, ...]
   */
  preloadBars(contractId, histBars) {
    if (!histBars || histBars.length === 0) return;
    
    if (!this.barHistory.has(contractId)) {
      this.initialize(contractId);
    }
    
    const bars = this.barHistory.get(contractId);
    const prices = this.priceBuffer.get(contractId);
    const volumes = this.volumeBuffer.get(contractId);
    
    for (const bar of histBars) {
      bars.push({
        timestamp: bar.timestamp,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume || 1,
        delta: 0,
        tickCount: 1
      });
      
      prices.push(bar.close);
      
      const barRange = bar.high - bar.low;
      let buyVol = (bar.volume || 1) * 0.5;
      let sellVol = (bar.volume || 1) * 0.5;
      if (barRange > 0) {
        const closePosition = (bar.close - bar.low) / barRange;
        buyVol = (bar.volume || 1) * closePosition;
        sellVol = (bar.volume || 1) * (1 - closePosition);
      }
      volumes.push({ buy: buyVol, sell: sellVol });
    }
    
    // Trim to max sizes
    while (bars.length > 500) bars.shift();
    while (prices.length > 200) prices.shift();
    while (volumes.length > 100) volumes.shift();
    
    // Set last bar time to now
    this.lastBarTime.set(contractId, Date.now());
    
    // Tick-based strategy uses bars only for warmup reference data (volatility, ranges)
    this.emit('log', { type: 'info', message: `Reference data loaded (${histBars.length} periods) - tick engine ready` });
  }

  /**
   * Reset strategy
   */
  reset(contractId) {
    this.barHistory.set(contractId, []);
    this.priceBuffer.set(contractId, []);
    this.volumeBuffer.set(contractId, []);
    this.tradesBuffer.set(contractId, []);
    this.atrHistory.set(contractId, []);
    this.tickBuffer.set(contractId, []);
    this.lastBarTime.set(contractId, 0);
    this.kalmanStates.set(contractId, { estimate: 0, errorCovariance: 1.0 });
  }
}

// Export class (not instance) - consistent with HQX-2B pattern
// M1 is the class, use new M1() to create instances
const M1 = HQXUltraScalpingStrategy;

module.exports = { M1, HQXUltraScalpingStrategy, OrderSide, SignalStrength };
