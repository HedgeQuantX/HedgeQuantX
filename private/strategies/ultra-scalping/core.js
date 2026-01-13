/**
 * =============================================================================
 * HQX ULTRA SCALPING STRATEGY - Core Engine
 * =============================================================================
 * 6 Mathematical Models with 4-Layer Trailing Stop System
 * 
 * DO NOT MODIFY LOGIC - validated by backtest
 */

const EventEmitter = require('events');
const { DEFAULT_CONFIG } = require('./config');
const { generateSignal } = require('./signal');
const {
  computeZScore,
  computeVPIN,
  computeKyleLambda,
  applyKalmanFilter,
  createKalmanState,
  calculateATR,
  detectVolatilityRegime,
  computeOrderFlowImbalance
} = require('./models');

class HQXUltraScalping extends EventEmitter {
  constructor(config = {}) {
    super();

    // Tick specifications
    this.tickSize = config.tickSize || 0.25;
    this.tickValue = config.tickValue || 5.0;

    // Merge with default config
    this.config = { ...DEFAULT_CONFIG, ...config };

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

    // === STATS ===
    this.stats = { signals: 0, trades: 0, wins: 0, losses: 0, pnl: 0 };
  }

  initialize(contractId, tickSize = 0.25, tickValue = 5.0) {
    this.tickSize = tickSize;
    this.tickValue = tickValue;

    this.barHistory.set(contractId, []);
    this.priceBuffer.set(contractId, []);
    this.volumeBuffer.set(contractId, []);
    this.atrHistory.set(contractId, []);
    this.kalmanStates.set(contractId, createKalmanState());

    this.emit('log', {
      type: 'info',
      message: `[HQX-UltraScalping] Initialized for ${contractId}: tick=${tickSize}, value=${tickValue}`
    });
    this.emit('log', {
      type: 'info',
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

    // MODEL 1: Z-SCORE
    const zscore = computeZScore(prices);

    // MODEL 2: VPIN
    const vpin = computeVPIN(volumes, this.config.vpinWindow);

    // MODEL 3: KYLE'S LAMBDA
    const kyleLambda = computeKyleLambda(bars);

    // MODEL 4: KALMAN FILTER
    const kalmanState = this.kalmanStates.get(contractId);
    const kalmanResult = applyKalmanFilter(kalmanState, bar.close);
    this.kalmanStates.set(contractId, {
      estimate: kalmanResult.estimate,
      errorCovariance: kalmanResult.errorCovariance
    });
    const kalmanEstimate = kalmanResult.newEstimate;

    // MODEL 5: VOLATILITY REGIME
    const atr = calculateATR(bars);
    const atrHist = this.atrHistory.get(contractId);
    atrHist.push(atr);
    if (atrHist.length > 500) atrHist.shift();
    const { regime, params: volParams } = detectVolatilityRegime(atr, atrHist, this.tickSize);

    // MODEL 6: ORDER FLOW IMBALANCE
    const ofi = computeOrderFlowImbalance(bars, this.config.ofiLookback);

    // Cooldown check
    if (Date.now() - this.lastSignalTime < this.config.cooldownMs) {
      return null;
    }

    // SIGNAL GENERATION
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

      // Emit signal
      this.emit('signal', {
        side: signal.direction === 'long' ? 'buy' : 'sell',
        action: 'open',
        reason: `Z=${zscore.toFixed(2)}, VPIN=${(vpin * 100).toFixed(0)}%, OFI=${(ofi * 100).toFixed(0)}%, cf=${(signal.confidence * 100).toFixed(0)}%`,
        ...signal
      });

      this.emit('log', {
        type: 'info',
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
      vpin: vpin,
      ofi: ofi,
      kyleLambda: kyleLambda,
      regime: regime,
      stopTicks: Math.round(this.config.baseStopTicks * params.stopMultiplier),
      targetTicks: Math.round(this.config.baseTargetTicks * params.targetMultiplier),
      threshold: params.zscoreThreshold,
      barsProcessed: bars.length,
      models: '6 (Z-Score, VPIN, Kyle, Kalman, Vol, OFI)'
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

    this.emit('log', {
      type: 'debug',
      message: `[HQX] Trade result: ${pnl > 0 ? 'WIN' : 'LOSS'} $${pnl.toFixed(2)}, streak: ${pnl > 0 ? this.winStreak : -this.lossStreak}`
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

    this.emit('log', {
      type: 'info',
      message: `[HQX-UltraScalping] Reset state for ${contractId}`
    });
  }
}

module.exports = { HQXUltraScalping };
