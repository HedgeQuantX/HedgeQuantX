/**
 * @fileoverview Position Manager for Fast Scalping
 * @module services/position-manager
 * 
 * Manages position lifecycle with:
 * - 10 second minimum hold (prop firm rule - NON-NEGOTIABLE)
 * - Intelligent exit based on momentum (OFI 50%, Kalman 25%, Z-Score 25%)
 * - Trailing stop after profit threshold
 * - 60 second failsafe exit (NON-NEGOTIABLE)
 * - VPIN protection filter
 * 
 * USES EXISTING MATH MODELS from HQX Ultra Scalping Strategy:
 * - OFI (Order Flow Imbalance)
 * - Kalman Filter with velocity tracking
 * - Z-Score Mean Reversion
 * - VPIN for toxicity detection
 * 
 * Data source: Rithmic ORDER_PLANT (fills), PNL_PLANT (positions), TICKER_PLANT (prices)
 */

const EventEmitter = require('events');
const { performance } = require('perf_hooks');
const { FAST_SCALPING } = require('../config/settings');
const { logger } = require('../utils/logger');

const log = logger.scope('PositionMgr');

// =============================================================================
// MOMENTUM THRESHOLDS (from analysis)
// =============================================================================
const MOMENTUM = {
  STRONG_FAVORABLE: 0.5,   // momentum > 0.5 + profit → HOLD
  WEAK_THRESHOLD: 0.2,     // momentum < 0.2 + profit → EXIT with profit
  ADVERSE_THRESHOLD: -0.3, // momentum < -0.3 → EXIT immediately
  VPIN_DANGER: 0.7,        // VPIN > 0.7 → informed traders = EXIT
};

// Momentum weights
const WEIGHTS = {
  OFI: 0.50,      // Order Flow Imbalance - 50%
  KALMAN: 0.25,   // Kalman Velocity - 25%
  ZSCORE: 0.25,   // Z-Score progression - 25%
};

/**
 * Position state for tracking
 * @typedef {Object} ManagedPosition
 * @property {string} orderTag - Entry order correlation ID
 * @property {string} accountId - Account ID
 * @property {string} symbol - Trading symbol (e.g., NQH5)
 * @property {string} exchange - Exchange (e.g., CME)
 * @property {number} side - 0=Long, 1=Short
 * @property {number} size - Position size
 * @property {number} entryPrice - Average fill price
 * @property {number} entryTime - Entry timestamp (ms)
 * @property {number} fillTime - When fill was confirmed (ms)
 * @property {number} highWaterMark - Highest price since entry (for trailing)
 * @property {number} lowWaterMark - Lowest price since entry (for trailing)
 * @property {string} status - 'pending' | 'active' | 'holding' | 'exiting' | 'closed'
 * @property {boolean} holdComplete - True after MIN_HOLD_MS elapsed
 * @property {Object|null} exitReason - Why position was exited
 * @property {number} tickSize - Tick size from API
 * @property {number} tickValue - Tick value from API
 * @property {string} contractId - Contract ID for strategy lookups
 */

/**
 * Position Manager Service
 * Handles position lifecycle for fast scalping strategy
 */
class PositionManager extends EventEmitter {
  /**
   * @param {RithmicService} rithmicService - Connected Rithmic service
   * @param {Object} strategy - HQX Ultra Scalping strategy instance (M1)
   */
  constructor(rithmicService, strategy = null) {
    super();
    this.rithmic = rithmicService;
    this.strategy = strategy; // Reference to HQX Ultra Scalping strategy
    
    /** @type {Map<string, ManagedPosition>} orderTag -> position */
    this.positions = new Map();
    
    /** @type {Map<string, number>} symbol -> latest price */
    this.latestPrices = new Map();
    
    /** @type {Map<string, Object>} symbol -> contract info (tickSize, tickValue) */
    this.contractInfo = new Map();
    
    /** @type {NodeJS.Timer|null} */
    this._monitorInterval = null;
    
    /** @type {boolean} */
    this._isRunning = false;
    
    // Bind event handlers
    this._onOrderFilled = this._onOrderFilled.bind(this);
    this._onPriceUpdate = this._onPriceUpdate.bind(this);
    this._onPositionUpdate = this._onPositionUpdate.bind(this);
  }

  /**
   * Set the strategy reference (for accessing math models)
   * @param {Object} strategy - HQX Ultra Scalping strategy instance
   */
  setStrategy(strategy) {
    this.strategy = strategy;
    log.debug('Strategy reference set');
  }

  /**
   * Set contract info from API (tick size, tick value)
   * @param {string} symbol - Trading symbol
   * @param {Object} info - { tickSize, tickValue, contractId }
   */
  setContractInfo(symbol, info) {
    this.contractInfo.set(symbol, {
      tickSize: info.tickSize,
      tickValue: info.tickValue,
      contractId: info.contractId,
    });
    log.debug('Contract info set', { symbol, tickSize: info.tickSize, tickValue: info.tickValue });
  }

  /**
   * Start the position manager
   * Attaches to Rithmic service events
   */
  start() {
    if (this._isRunning) return;
    
    log.info('Starting position manager', {
      minHoldMs: FAST_SCALPING.MIN_HOLD_MS,
      maxHoldMs: FAST_SCALPING.MAX_HOLD_MS,
      targetTicks: FAST_SCALPING.TARGET_TICKS,
      stopTicks: FAST_SCALPING.STOP_TICKS,
      momentumWeights: WEIGHTS,
    });
    
    // Subscribe to Rithmic events
    this.rithmic.on('orderFilled', this._onOrderFilled);
    this.rithmic.on('priceUpdate', this._onPriceUpdate);
    this.rithmic.on('positionUpdate', this._onPositionUpdate);
    
    // Start monitoring loop
    this._monitorInterval = setInterval(() => {
      this._monitorPositions();
    }, FAST_SCALPING.MONITOR_INTERVAL_MS);
    
    this._isRunning = true;
    log.debug('Position manager started');
  }

  /**
   * Stop the position manager
   * Removes event listeners and stops monitoring
   */
  stop() {
    if (!this._isRunning) return;
    
    log.info('Stopping position manager');
    
    // Remove event listeners
    this.rithmic.off('orderFilled', this._onOrderFilled);
    this.rithmic.off('priceUpdate', this._onPriceUpdate);
    this.rithmic.off('positionUpdate', this._onPositionUpdate);
    
    // Stop monitoring
    if (this._monitorInterval) {
      clearInterval(this._monitorInterval);
      this._monitorInterval = null;
    }
    
    this._isRunning = false;
    log.debug('Position manager stopped');
  }

  /**
   * Register a new entry order
   * Called immediately after fastEntry() to track the position
   * 
   * @param {Object} entryResult - Result from fastEntry()
   * @param {Object} orderData - Original order data
   * @param {Object} contractInfo - { tickSize, tickValue, contractId } from API
   * @returns {string} orderTag for tracking
   */
  registerEntry(entryResult, orderData, contractInfo = null) {
    if (!entryResult.success) {
      log.warn('Cannot register failed entry', { error: entryResult.error });
      return null;
    }
    
    const { orderTag, entryTime, latencyMs } = entryResult;
    
    // Get contract info from cache or parameter
    const info = contractInfo || this.contractInfo.get(orderData.symbol) || {
      tickSize: null,
      tickValue: null,
      contractId: orderData.contractId || orderData.symbol,
    };
    
    /** @type {ManagedPosition} */
    const position = {
      orderTag,
      accountId: orderData.accountId,
      symbol: orderData.symbol,
      exchange: orderData.exchange || 'CME',
      side: orderData.side, // 0=Long, 1=Short
      size: orderData.size,
      entryPrice: null, // Will be filled from order notification (async)
      entryTime,
      fillTime: null,
      highWaterMark: null,
      lowWaterMark: null,
      status: 'pending', // Waiting for fill confirmation
      holdComplete: false,
      exitReason: null,
      latencyMs,
      // Contract info from API (NOT hardcoded)
      tickSize: info.tickSize,
      tickValue: info.tickValue,
      contractId: info.contractId,
    };
    
    this.positions.set(orderTag, position);
    
    log.debug('Registered entry', {
      orderTag,
      symbol: orderData.symbol,
      side: orderData.side === 0 ? 'LONG' : 'SHORT',
      size: orderData.size,
      latencyMs,
      tickSize: info.tickSize,
    });
    
    return orderTag;
  }

  /**
   * Handle order fill notification from Rithmic (templateId: 351)
   * This is ASYNC - does not block fastEntry()
   * @private
   */
  _onOrderFilled(fillInfo) {
    const { orderTag, avgFillPrice, totalFillQuantity, symbol, transactionType, localTimestamp } = fillInfo;
    
    if (!orderTag) return;
    
    const position = this.positions.get(orderTag);
    if (!position) {
      // Could be an exit order fill - check if any position is exiting
      for (const [tag, pos] of this.positions) {
        if (pos.status === 'exiting' && pos.symbol === symbol) {
          // This is likely our exit fill
          pos.status = 'closed';
          const holdDuration = Date.now() - pos.fillTime;
          const pnlTicks = this._calculatePnlTicks(pos, avgFillPrice);
          
          log.info('EXIT FILLED', {
            orderTag: tag,
            symbol,
            exitPrice: avgFillPrice,
            entryPrice: pos.entryPrice,
            pnlTicks,
            holdDurationMs: holdDuration,
            reason: pos.exitReason,
          });
          
          this.emit('exitFilled', {
            orderTag: tag,
            position: pos,
            exitPrice: avgFillPrice,
            pnlTicks,
            holdDurationMs: holdDuration,
          });
          
          this.positions.delete(tag);
          return;
        }
      }
      log.debug('Fill for untracked order', { orderTag });
      return;
    }
    
    if (position.status === 'pending') {
      // Entry fill confirmed - UPDATE with real fill price
      position.entryPrice = avgFillPrice;
      position.fillTime = Date.now();
      position.highWaterMark = avgFillPrice;
      position.lowWaterMark = avgFillPrice;
      position.status = 'holding'; // Now in holding period
      
      const fillLatency = position.fillTime - position.entryTime;
      
      log.info('ENTRY FILLED', {
        orderTag,
        symbol,
        side: position.side === 0 ? 'LONG' : 'SHORT',
        size: position.size,
        price: avgFillPrice,
        entryLatencyMs: position.latencyMs,
        fillLatencyMs: fillLatency,
      });
      
      this.emit('entryFilled', {
        orderTag,
        position,
        fillLatencyMs: fillLatency,
      });
      
      // Schedule hold completion check
      setTimeout(() => {
        this._onHoldComplete(orderTag);
      }, FAST_SCALPING.MIN_HOLD_MS);
      
      // Schedule 60s failsafe (NON-NEGOTIABLE)
      setTimeout(() => {
        this._failsafeExit(orderTag);
      }, FAST_SCALPING.MAX_HOLD_MS);
      
    } else if (position.status === 'exiting') {
      // Exit fill confirmed
      position.status = 'closed';
      
      const holdDuration = Date.now() - position.fillTime;
      const pnlTicks = this._calculatePnlTicks(position, avgFillPrice);
      
      log.info('EXIT FILLED', {
        orderTag,
        symbol,
        exitPrice: avgFillPrice,
        entryPrice: position.entryPrice,
        pnlTicks,
        holdDurationMs: holdDuration,
        reason: position.exitReason,
      });
      
      this.emit('exitFilled', {
        orderTag,
        position,
        exitPrice: avgFillPrice,
        pnlTicks,
        holdDurationMs: holdDuration,
      });
      
      // Clean up
      this.positions.delete(orderTag);
    }
  }

  /**
   * 60 second failsafe exit (NON-NEGOTIABLE)
   * Forces market exit if position still open
   * @private
   */
  _failsafeExit(orderTag) {
    const position = this.positions.get(orderTag);
    if (!position) return;
    
    // Only force exit if still active (not already exiting/closed)
    if (position.status === 'holding' || position.status === 'active') {
      const currentPrice = this.latestPrices.get(position.symbol);
      const pnlTicks = currentPrice ? this._calculatePnlTicks(position, currentPrice) : 0;
      
      log.warn('FAILSAFE EXIT - 60s max hold exceeded', {
        orderTag,
        symbol: position.symbol,
        pnlTicks,
      });
      
      this._executeExit(orderTag, {
        type: 'failsafe',
        reason: '60s max hold exceeded (NON-NEGOTIABLE)',
        pnlTicks,
      });
    }
  }

  /**
   * Handle price update from market data
   * @private
   */
  _onPriceUpdate(priceData) {
    const { symbol, price, timestamp } = priceData;
    
    this.latestPrices.set(symbol, price);
    
    // Update high/low water marks for active positions
    for (const [orderTag, position] of this.positions) {
      if (position.symbol === symbol && (position.status === 'holding' || position.status === 'active') && position.entryPrice) {
        if (position.side === 0) { // Long
          position.highWaterMark = Math.max(position.highWaterMark, price);
        } else { // Short
          position.lowWaterMark = Math.min(position.lowWaterMark, price);
        }
      }
    }
  }

  /**
   * Handle position update from PNL_PLANT
   * @private
   */
  _onPositionUpdate(posData) {
    log.debug('Position update from PNL_PLANT', {
      symbol: posData?.symbol,
      qty: posData?.quantity,
    });
  }

  /**
   * Called when minimum hold period is complete
   * @private
   */
  _onHoldComplete(orderTag) {
    const position = this.positions.get(orderTag);
    if (!position) return;
    
    if (position.status === 'holding') {
      position.holdComplete = true;
      position.status = 'active'; // Now eligible for exit
      
      log.info('Hold complete - now monitoring for exit', {
        orderTag,
        symbol: position.symbol,
        entryPrice: position.entryPrice,
      });
      
      this.emit('holdComplete', { orderTag, position });
    }
  }

  /**
   * Main monitoring loop - runs every MONITOR_INTERVAL_MS
   * @private
   */
  _monitorPositions() {
    const now = Date.now();
    
    for (const [orderTag, position] of this.positions) {
      // Skip if not ready to exit
      if (position.status !== 'active') continue;
      
      const currentPrice = this.latestPrices.get(position.symbol);
      if (!currentPrice) continue;
      
      const holdDuration = now - position.fillTime;
      const pnlTicks = this._calculatePnlTicks(position, currentPrice);
      
      // Check exit conditions
      const exitReason = this._checkExitConditions(position, currentPrice, pnlTicks, holdDuration);
      
      if (exitReason) {
        this._executeExit(orderTag, exitReason);
      }
    }
  }

  /**
   * Check if position should be exited
   * Uses momentum calculation with OFI/Kalman/Z-Score from strategy
   * 
   * Data sources:
   * - pnlTicks: Calculated from entryPrice (Rithmic fill) and currentPrice (market data)
   * - VPIN: Strategy's computeVPIN()
   * - Momentum: Strategy's OFI, Kalman, Z-Score
   * 
   * @private
   * @returns {Object|null} Exit reason or null
   */
  _checkExitConditions(position, currentPrice, pnlTicks, holdDuration) {
    // Cannot evaluate exit conditions without PnL data
    if (pnlTicks === null) {
      log.debug('Cannot check exit - no PnL data', { symbol: position.symbol });
      return null;
    }
    
    const targetTicks = FAST_SCALPING.TARGET_TICKS;
    const stopTicks = FAST_SCALPING.STOP_TICKS;
    
    // 1. TARGET HIT - Always exit at target
    if (pnlTicks >= targetTicks) {
      return { type: 'target', reason: 'Target reached', pnlTicks };
    }
    
    // 2. STOP HIT - Always exit at stop
    if (pnlTicks <= -stopTicks) {
      return { type: 'stop', reason: 'Stop loss hit', pnlTicks };
    }
    
    // 3. VPIN DANGER - Informed traders detected (from strategy)
    const vpin = this._getVPIN(position);
    if (vpin !== null && vpin > MOMENTUM.VPIN_DANGER) {
      return { type: 'vpin', reason: `VPIN spike ${(vpin * 100).toFixed(0)}% - informed traders`, pnlTicks, vpin };
    }
    
    // 4. TRAILING STOP (only if in profit above threshold)
    if (pnlTicks >= FAST_SCALPING.TRAILING_ACTIVATION_TICKS) {
      const trailingPnl = this._calculateTrailingPnl(position, currentPrice);
      if (trailingPnl !== null && trailingPnl <= -FAST_SCALPING.TRAILING_DISTANCE_TICKS) {
        return { type: 'trailing', reason: 'Trailing stop triggered', pnlTicks, trailingPnl };
      }
    }
    
    // 5. MOMENTUM-BASED EXIT (using strategy's math models)
    const momentum = this._calculateMomentum(position);
    
    if (momentum !== null) {
      // Strong favorable momentum + profit → HOLD (let it run)
      if (momentum > MOMENTUM.STRONG_FAVORABLE && pnlTicks > 4) {
        // Don't exit - momentum is strong in our favor
        return null;
      }
      
      // Weak momentum + profit → EXIT (secure profit)
      if (momentum < MOMENTUM.WEAK_THRESHOLD && pnlTicks > 0) {
        return { type: 'momentum_weak', reason: 'Weak momentum - securing profit', pnlTicks, momentum };
      }
      
      // Adverse momentum → EXIT immediately
      if (momentum < MOMENTUM.ADVERSE_THRESHOLD) {
        return { type: 'momentum_adverse', reason: 'Adverse momentum detected', pnlTicks, momentum };
      }
    }
    
    return null;
  }

  /**
   * Calculate momentum score using strategy's existing math models
   * Weighted: OFI (50%) + Kalman Velocity (25%) + Z-Score (25%)
   * 
   * Data sources:
   * - OFI: Strategy's computeOrderFlowImbalance()
   * - Kalman: Strategy's kalmanStates
   * - Z-Score: Strategy's computeZScore()
   * 
   * @private
   * @param {ManagedPosition} position
   * @returns {number|null} Momentum score [-1 to 1], positive = favorable, null if insufficient data
   */
  _calculateMomentum(position) {
    if (!this.strategy) {
      return null;
    }
    
    // Get individual model values (all from API/strategy, not invented)
    const ofi = this._getOFI(position);
    const velocity = this._getKalmanVelocity(position);
    const zscore = this._getZScore(position);
    
    // Count how many models have data
    let availableModels = 0;
    let totalWeight = 0;
    let weightedSum = 0;
    
    // 1. OFI (50%) - Order Flow Imbalance
    if (ofi !== null) {
      // For long: positive OFI = favorable, For short: negative OFI = favorable
      const favorableOfi = position.side === 0 ? ofi : -ofi;
      const ofiScore = Math.min(1, Math.max(-1, favorableOfi));
      weightedSum += ofiScore * WEIGHTS.OFI;
      totalWeight += WEIGHTS.OFI;
      availableModels++;
    }
    
    // 2. Kalman Velocity (25%)
    if (velocity !== null) {
      const tickSize = this._getTickSize(position);
      if (tickSize !== null) {
        // Normalize velocity: favorable direction = positive
        const favorableVelocity = position.side === 0 ? velocity : -velocity;
        // Normalize to [-1, 1]: 4 ticks of velocity = 1.0 score
        const normalizedVelocity = favorableVelocity / (tickSize * 4);
        const velocityScore = Math.min(1, Math.max(-1, normalizedVelocity));
        weightedSum += velocityScore * WEIGHTS.KALMAN;
        totalWeight += WEIGHTS.KALMAN;
        availableModels++;
      }
    }
    
    // 3. Z-Score (25%) - Progression toward mean
    if (zscore !== null) {
      let zscoreScore;
      if (position.side === 0) {
        // Long: entered when Z < -threshold, improving = Z moving toward 0
        // Z > -0.5 means close to mean = favorable
        zscoreScore = zscore > -0.5 ? 0.5 : -0.5;
      } else {
        // Short: entered when Z > threshold, improving = Z moving toward 0
        // Z < 0.5 means close to mean = favorable
        zscoreScore = zscore < 0.5 ? 0.5 : -0.5;
      }
      weightedSum += zscoreScore * WEIGHTS.ZSCORE;
      totalWeight += WEIGHTS.ZSCORE;
      availableModels++;
    }
    
    // Need at least 1 model with data to calculate momentum
    if (availableModels === 0 || totalWeight === 0) {
      return null;
    }
    
    // Normalize by actual total weight (in case some models unavailable)
    const momentum = weightedSum / totalWeight;
    
    // Clamp to [-1, 1]
    return Math.min(1, Math.max(-1, momentum));
  }

  /**
   * Get OFI (Order Flow Imbalance) from strategy
   * Data source: Strategy's computeOrderFlowImbalance() or getModelValues()
   * @private
   * @returns {number|null} OFI value [-1, 1] or null if unavailable
   */
  _getOFI(position) {
    if (!this.strategy) return null;
    
    const contractId = position.contractId || position.symbol;
    
    // Try strategy's computeOrderFlowImbalance (direct calculation from bars)
    if (typeof this.strategy.computeOrderFlowImbalance === 'function') {
      const bars = this.strategy.getBarHistory?.(contractId);
      if (bars && bars.length >= 20) {
        try {
          return this.strategy.computeOrderFlowImbalance(bars);
        } catch (error) {
          log.debug('OFI calculation failed', { error: error.message });
        }
      }
    }
    
    // Try getModelValues (pre-calculated values)
    const modelValues = this.strategy.getModelValues?.(contractId);
    if (modelValues && modelValues.rawOfi !== undefined) {
      return modelValues.rawOfi;
    }
    
    return null;
  }

  /**
   * Get Kalman velocity from strategy's Kalman filter
   * Data source: Strategy's kalmanStates or kalmanFilterManager
   * @private
   * @returns {number|null} Velocity value or null if unavailable
   */
  _getKalmanVelocity(position) {
    if (!this.strategy) return null;
    
    const contractId = position.contractId || position.symbol;
    
    // Try to access kalmanStates from strategy
    if (this.strategy.kalmanStates) {
      const state = this.strategy.kalmanStates.get(contractId);
      if (state && typeof state.estimate === 'number') {
        const currentPrice = this.latestPrices.get(position.symbol);
        if (currentPrice !== undefined && currentPrice !== null) {
          // Velocity = price difference from Kalman estimate
          // Positive = price above estimate (upward momentum)
          return currentPrice - state.estimate;
        }
      }
    }
    
    return null;
  }

  /**
   * Get Z-Score from strategy
   * Data source: Strategy's computeZScore() or priceBuffer
   * @private
   * @returns {number|null} Z-Score value or null if unavailable
   */
  _getZScore(position) {
    if (!this.strategy) return null;
    
    const contractId = position.contractId || position.symbol;
    
    // Try strategy's computeZScore (direct calculation from price buffer)
    if (typeof this.strategy.computeZScore === 'function') {
      const prices = this.strategy.priceBuffer?.get(contractId);
      if (prices && prices.length >= 50) {
        try {
          return this.strategy.computeZScore(prices);
        } catch (error) {
          log.debug('Z-Score calculation failed', { error: error.message });
        }
      }
    }
    
    return null;
  }

  /**
   * Get VPIN from strategy
   * Data source: Strategy's computeVPIN() or volumeBuffer
   * @private
   * @returns {number|null} VPIN value [0, 1] or null if unavailable
   */
  _getVPIN(position) {
    if (!this.strategy) return null;
    
    const contractId = position.contractId || position.symbol;
    
    // Try strategy's computeVPIN (direct calculation from volume buffer)
    if (typeof this.strategy.computeVPIN === 'function') {
      const volumes = this.strategy.volumeBuffer?.get(contractId);
      if (volumes && volumes.length >= 50) {
        try {
          return this.strategy.computeVPIN(volumes);
        } catch (error) {
          log.debug('VPIN calculation failed', { error: error.message });
        }
      }
    }
    
    // Try getModelValues (pre-calculated, stored as 1 - vpin for scoring)
    const modelValues = this.strategy.getModelValues?.(contractId);
    if (modelValues && typeof modelValues.vpin === 'number') {
      // modelValues.vpin is normalized score (1 - vpin), convert back
      return 1 - modelValues.vpin;
    }
    
    return null;
  }

  /**
   * Execute exit order
   * @private
   */
  _executeExit(orderTag, exitReason) {
    const position = this.positions.get(orderTag);
    if (!position || position.status === 'exiting' || position.status === 'closed') return;
    
    position.status = 'exiting';
    position.exitReason = exitReason;
    
    log.info('Executing EXIT', {
      orderTag,
      symbol: position.symbol,
      reason: exitReason.reason,
      pnlTicks: exitReason.pnlTicks,
      momentum: exitReason.momentum,
    });
    
    // Fire exit order (opposite side)
    const exitSide = position.side === 0 ? 1 : 0; // Reverse: Long->Sell, Short->Buy
    
    const exitResult = this.rithmic.fastExit({
      accountId: position.accountId,
      symbol: position.symbol,
      exchange: position.exchange,
      size: position.size,
      side: exitSide,
    });
    
    if (exitResult.success) {
      log.debug('Exit order fired', {
        orderTag: position.orderTag,
        exitOrderTag: exitResult.orderTag,
        latencyMs: exitResult.latencyMs,
      });
      
      this.emit('exitOrderFired', {
        orderTag,
        exitOrderTag: exitResult.orderTag,
        exitReason,
        latencyMs: exitResult.latencyMs,
      });
    } else {
      log.error('Exit order FAILED', {
        orderTag,
        error: exitResult.error,
      });
      // Reset status to try again next cycle
      position.status = 'active';
      position.exitReason = null;
    }
  }

  /**
   * Get tick size for position (from API, not hardcoded)
   * @private
   */
  _getTickSize(position) {
    // First try position's stored tickSize (from API)
    if (position.tickSize !== null && position.tickSize !== undefined) {
      return position.tickSize;
    }
    
    // Then try contract info cache
    const info = this.contractInfo.get(position.symbol);
    if (info && info.tickSize) {
      return info.tickSize;
    }
    
    // Last resort: log warning and return null (will cause issues)
    log.warn('No tick size available for symbol', { symbol: position.symbol });
    return null;
  }

  /**
   * Get tick value for position (from API, not hardcoded)
   * @private
   */
  _getTickValue(position) {
    if (position.tickValue !== null && position.tickValue !== undefined) {
      return position.tickValue;
    }
    
    const info = this.contractInfo.get(position.symbol);
    if (info && info.tickValue) {
      return info.tickValue;
    }
    
    log.warn('No tick value available for symbol', { symbol: position.symbol });
    return null;
  }

  /**
   * Calculate P&L in ticks from entry
   * Data source: position.entryPrice (from Rithmic fill), tickSize (from API)
   * @private
   * @returns {number|null} PnL in ticks, null if cannot calculate
   */
  _calculatePnlTicks(position, currentPrice) {
    if (position.entryPrice === null || position.entryPrice === undefined) {
      return null;
    }
    
    if (currentPrice === null || currentPrice === undefined) {
      return null;
    }
    
    const tickSize = this._getTickSize(position);
    if (tickSize === null || tickSize === undefined) {
      log.error('Cannot calculate PnL - no tick size from API', { symbol: position.symbol });
      return null;
    }
    
    const priceDiff = currentPrice - position.entryPrice;
    const signedDiff = position.side === 0 ? priceDiff : -priceDiff;
    
    return Math.round(signedDiff / tickSize);
  }

  /**
   * Calculate trailing P&L from high/low water mark
   * Data source: position water marks (from price updates), tickSize (from API)
   * @private
   * @returns {number|null} Trailing PnL in ticks, null if cannot calculate
   */
  _calculateTrailingPnl(position, currentPrice) {
    const tickSize = this._getTickSize(position);
    if (tickSize === null || tickSize === undefined) {
      return null;
    }
    
    if (position.side === 0) { // Long
      if (position.highWaterMark === null || position.highWaterMark === undefined) {
        return null;
      }
      const dropFromHigh = position.highWaterMark - currentPrice;
      return -Math.round(dropFromHigh / tickSize);
    } else { // Short
      if (position.lowWaterMark === null || position.lowWaterMark === undefined) {
        return null;
      }
      const riseFromLow = currentPrice - position.lowWaterMark;
      return -Math.round(riseFromLow / tickSize);
    }
  }

  /**
   * Get all active positions
   * @returns {Array<ManagedPosition>}
   */
  getActivePositions() {
    return Array.from(this.positions.values()).filter(
      p => p.status === 'holding' || p.status === 'active'
    );
  }

  /**
   * Get position by order tag
   * @param {string} orderTag 
   * @returns {ManagedPosition|null}
   */
  getPosition(orderTag) {
    return this.positions.get(orderTag) || null;
  }

  /**
   * Check if we can enter a new position
   * (no existing position in same symbol - 1 position at a time)
   * @param {string} symbol 
   * @returns {boolean}
   */
  canEnter(symbol) {
    for (const position of this.positions.values()) {
      if (position.symbol === symbol && position.status !== 'closed') {
        return false;
      }
    }
    return true;
  }

  /**
   * Get momentum thresholds (for UI display)
   * @returns {Object}
   */
  getMomentumThresholds() {
    return { ...MOMENTUM };
  }

  /**
   * Get momentum weights (for UI display)
   * @returns {Object}
   */
  getMomentumWeights() {
    return { ...WEIGHTS };
  }
}

module.exports = { PositionManager };
