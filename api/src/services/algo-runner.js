/**
 * Algo Runner
 *
 * Manages algo execution per session.
 * Uses loadStrategy from HQX-CLI and MarketDataFeed for real-time ticks.
 * Emits events via a callback (forwarded to WebSocket by ws/handler.js).
 *
 * Same core logic as nq-auto-trader but event-driven for WebSocket streaming.
 *
 * NO MOCK DATA - All data from Rithmic API.
 */

'use strict';

const EventEmitter = require('events');

// CLI imports
const { MarketDataFeed } = require('../../../src/lib/data');
const { loadStrategy } = require('../../../src/lib/m');
const { getTickInfo } = require('../../../src/services/rithmic/trades');

class AlgoRunner extends EventEmitter {
  /**
   * @param {Object} service - RithmicService instance
   */
  constructor(service) {
    super();
    this.service = service;
    this.feed = null;
    this.strategy = null;
    this.running = false;

    // Position state
    this.position = null; // { side, qty, entryPrice, symbol, exchange, accountId }
    this.bracketCleanup = null;

    // Stats
    this.stats = {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnl: 0,
      startTime: null,
    };

    // Config (set on start)
    this.config = null;
  }

  /**
   * Start algo execution
   * @param {Object} config - { strategyId, symbol, exchange, accountId, size }
   */
  async start(config) {
    if (this.running) {
      this._log('warn', 'Algo already running');
      return { success: false, error: 'Algo already running' };
    }

    const { strategyId, symbol, exchange = 'CME', accountId, size = 1 } = config;

    if (!strategyId || !symbol || !accountId) {
      return { success: false, error: 'Missing required config: strategyId, symbol, accountId' };
    }

    this.config = { strategyId, symbol, exchange, accountId, size };

    try {
      // Load strategy
      this._log('info', `Loading strategy: ${strategyId}`);
      const module = loadStrategy(strategyId);
      this.strategy = new module.M1();

      // Get tick info for the symbol
      this.tickInfo = getTickInfo(symbol);

      // Connect to market data feed
      this._log('info', `Connecting market data feed for ${symbol}`);
      const creds = this.service.getRithmicCredentials();
      if (!creds) {
        return { success: false, error: 'No Rithmic credentials - not logged in' };
      }

      // Disconnect service's TICKER_PLANT so MarketDataFeed can use it
      await this.service.disconnectTicker();

      this.feed = new MarketDataFeed();

      this.feed.on('debug', (msg) => this._log('debug', `[Feed] ${msg}`));
      this.feed.on('error', (err) => this._log('error', `[Feed] ${err.message}`));
      this.feed.on('connected', () => this._log('info', 'Market data feed connected'));
      this.feed.on('disconnected', () => {
        this._log('warn', 'Market data feed disconnected');
        if (this.running) {
          this._emitStatus();
        }
      });

      await this.feed.connect(creds);
      await this.feed.subscribe(symbol, exchange);

      // Start processing ticks
      this.running = true;
      this.stats.startTime = Date.now();
      this._log('info', `Algo started: ${strategyId} on ${symbol} (${size} contracts)`);

      this.feed.on('tick', (tick) => this._onTick(tick));

      this._emitStatus();

      return { success: true };
    } catch (err) {
      this._log('error', `Failed to start algo: ${err.message}`);
      await this._cleanupFeed();
      return { success: false, error: 'Failed to initialize algo strategy' };
    }
  }

  /**
   * Stop algo execution
   */
  async stop() {
    if (!this.running) {
      return { success: true, message: 'Algo not running' };
    }

    this.running = false;
    this._log('info', 'Stopping algo...');

    // Cancel brackets if any
    if (this.bracketCleanup) {
      try { await this.bracketCleanup(); } catch (_) {}
      this.bracketCleanup = null;
    }

    // Flatten position if open
    if (this.position) {
      this._log('info', 'Flattening open position...');
      try {
        await this.service.closePosition(this.position.accountId, this.position.symbol);
        this.position = null;
      } catch (err) {
        this._log('error', `Failed to flatten: ${err.message}`);
      }
    }

    await this._cleanupFeed();
    this._log('info', 'Algo stopped');
    this._emitStatus();

    return { success: true, stats: this.stats };
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      running: this.running,
      config: this.config,
      position: this.position,
      stats: { ...this.stats },
      connected: this.feed?.connected || false,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Process incoming tick
   */
  _onTick(tick) {
    if (!this.running || !this.strategy) return;

    const price = tick.price;
    if (!price) return;

    // Emit tick to WebSocket
    this.emit('tick', {
      price,
      bid: tick.bid || null,
      ask: tick.ask || null,
      volume: tick.volume || 0,
      timestamp: tick.timestamp || Date.now(),
    });

    // Feed tick to strategy
    try {
      const signal = this.strategy.onTick({
        price,
        bid: tick.bid || price,
        ask: tick.ask || price,
        volume: tick.volume || 0,
        size: tick.size || 0,
        side: tick.side,
        timestamp: tick.timestamp || Date.now(),
      });

      if (signal && signal.direction && !this.position) {
        this._onSignal(signal);
      }
    } catch (err) {
      // Strategy errors should not crash the runner
      this._log('error', `Strategy error: ${err.message}`);
    }
  }

  /**
   * Handle strategy signal
   */
  async _onSignal(signal) {
    if (!this.running || this.position) return;

    const { direction, entry, sl, tp, confidence } = signal;
    const { symbol, exchange, accountId, size } = this.config;

    this.emit('signal', {
      direction,
      entry: entry || null,
      sl: sl || null,
      tp: tp || null,
      confidence: confidence || null,
    });

    this._log('info', `Signal: ${direction} @ ${entry || 'MKT'} SL=${sl} TP=${tp} conf=${confidence}`);

    // Place entry order (market)
    const side = direction === 'long' ? 0 : 1; // 0=Buy, 1=Sell
    const result = await this.service.placeOrder({
      accountId,
      symbol,
      exchange,
      size,
      side,
      type: 2, // Market
    });

    if (!result.success) {
      this._log('error', `Entry order failed: ${result.error}`);
      return;
    }

    const entryPrice = result.fillPrice || entry || 0;

    this.position = {
      side: direction,
      qty: size,
      entryPrice,
      symbol,
      exchange,
      accountId,
      entryTime: Date.now(),
      orderId: result.orderId,
    };

    this.emit('position', {
      symbol,
      qty: direction === 'long' ? size : -size,
      entryPrice,
      openPnl: 0,
    });

    this._log('info', `Entered ${direction} ${size} @ ${entryPrice}`);

    // Place OCO bracket if SL and TP provided
    if (sl && tp) {
      const bracketResult = await this.service.placeOCOBracket({
        accountId,
        symbol,
        exchange,
        size,
        stopPrice: sl,
        targetPrice: tp,
        isLong: direction === 'long',
      });

      if (bracketResult.success) {
        this.bracketCleanup = bracketResult.cleanup;
        this._log('info', `Brackets placed: SL=${sl} TP=${tp}`);

        // Listen for bracket fill to record trade
        this._monitorBracketFill(entryPrice, sl, tp, direction);
      } else {
        this._log('error', `Bracket failed: ${bracketResult.error}`);
      }
    }
  }

  /**
   * Monitor for position close (bracket fill, manual close, etc.)
   */
  _monitorBracketFill(entryPrice, sl, tp, direction) {
    const listener = (order) => {
      if (!this.position) return;

      // Check for fill on our brackets
      if (order.notifyType === 5 && order.symbol === this.config.symbol) {
        const exitPrice = order.avgFillPrice || order.fillPrice || 0;
        if (!exitPrice) return;

        const priceDiff = direction === 'long'
          ? exitPrice - entryPrice
          : entryPrice - exitPrice;

        const ticks = priceDiff / this.tickInfo.tickSize;
        const pnl = ticks * this.tickInfo.tickValue * this.config.size;
        const duration = Date.now() - this.position.entryTime;

        // Update stats
        this.stats.trades++;
        this.stats.totalPnl += pnl;
        if (pnl > 0) this.stats.wins++;
        else if (pnl < 0) this.stats.losses++;

        this.emit('trade', {
          direction,
          entry: entryPrice,
          exit: exitPrice,
          pnl,
          ticks: Math.round(ticks * 100) / 100,
          duration,
        });

        this.emit('pnl', {
          dayPnl: this.stats.totalPnl,
          openPnl: 0,
          closedPnl: this.stats.totalPnl,
        });

        this._log('info', `Trade closed: ${direction} ${entryPrice} -> ${exitPrice} = $${pnl.toFixed(2)} (${ticks.toFixed(1)} ticks)`);

        this.position = null;
        this.bracketCleanup = null;
        this.service.removeListener('orderNotification', listener);
        this._emitStatus();
      }
    };

    this.service.on('orderNotification', listener);

    // Safety: remove listener if algo stops
    this.once('stopped', () => {
      this.service.removeListener('orderNotification', listener);
    });
  }

  async _cleanupFeed() {
    if (this.feed) {
      try {
        await this.feed.disconnect();
      } catch (_) {}
      this.feed = null;
    }
  }

  _emitStatus() {
    this.emit('status', {
      connected: this.feed?.connected || false,
      running: this.running,
      position: this.position ? {
        side: this.position.side,
        qty: this.position.qty,
        entryPrice: this.position.entryPrice,
        symbol: this.position.symbol,
      } : null,
      stats: { ...this.stats },
    });
  }

  _log(level, message) {
    this.emit('log', { level, message, timestamp: Date.now() });
  }
}

module.exports = { AlgoRunner };
