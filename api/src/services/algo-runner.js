/**
 * Algo Runner
 *
 * Manages algo execution per session.
 * Uses loadStrategy from HQX-CLI and MarketDataFeed for real-time ticks.
 * Emits events via EventEmitter (forwarded to WebSocket by ws/handler.js).
 *
 * Mirrors CLI algo-executor behavior:
 * - Strategy log forwarding (M1 log events → WS)
 * - SmartLogsEngine (1s interval, real quant state)
 * - Daily target/risk auto-stop
 * - Latency tracking
 * - Win/loss log types (fill_win, fill_loss, fill_buy, fill_sell)
 *
 * NO MOCK DATA - All data from Rithmic API.
 */

'use strict';

const EventEmitter = require('events');

// CLI imports — lazy loaded, may not exist in all deploy environments
let MarketDataFeed, loadStrategy, SmartLogsEngine;
try {
  ({ MarketDataFeed } = require('../../../src/lib/data'));
  ({ loadStrategy } = require('../../../src/lib/m'));
  ({ SmartLogsEngine } = require('../../../src/lib/smart-logs-engine'));
  console.log('[AlgoRunner] Strategy modules loaded successfully');
} catch (err) {
  console.error('[AlgoRunner] Failed to load strategy modules:', err.message);
  MarketDataFeed = null;
  loadStrategy = null;
  SmartLogsEngine = null;
}
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
    this.logsEngine = null;
    this.running = false;

    // Position state
    this.position = null; // { side, qty, entryPrice, symbol, exchange, accountId }
    this.bracketCleanup = null;

    // Stats — mirrors CLI algo-executor
    this.stats = {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnl: 0,
      startTime: null,
      lastLatency: null,
    };

    // Config (set on start)
    this.config = null;

    // Tick state for SmartLogsEngine
    this._lastPrice = 0;
    this._tickCount = 0;
    this._runningDelta = 0;
    this._runningBuyPct = 50;
    this._currentBias = 'FLAT';

    // Smart logs interval
    this._smartLogsInterval = null;
  }

  /**
   * Start algo execution
   * @param {Object} config - { strategyId, symbol, exchange, accountId, size, dailyTarget, maxRisk, accountName, propfirm }
   */
  async start(config) {
    if (this.running) {
      this._log('warn', 'Algo already running');
      return { success: false, error: 'Algo already running' };
    }

    const {
      strategyId, symbol, exchange = 'CME', accountId, size = 1,
      dailyTarget = null, maxRisk = null, accountName = null, propfirm = null,
    } = config;

    if (!strategyId || !symbol || !accountId) {
      return { success: false, error: 'Missing required config: strategyId, symbol, accountId' };
    }

    this.config = {
      strategyId, symbol, exchange, accountId, size,
      dailyTarget, maxRisk, accountName, propfirm,
    };

    if (!MarketDataFeed || !loadStrategy) {
      console.error('[AlgoRunner] Cannot start: MarketDataFeed=%s, loadStrategy=%s', !!MarketDataFeed, !!loadStrategy);
      return { success: false, error: 'Strategy engine not available in this environment' };
    }

    try {
      // Load strategy
      this._log('system', `Strategy: ${strategyId}`);
      const module = loadStrategy(strategyId);
      this.strategy = new module.M1();

      // Forward strategy log emissions to WebSocket pipeline (like CLI algo-executor line 103)
      this.strategy.on('log', (log) => {
        if (log.type === 'debug') return; // Skip verbose debug logs
        const type = log.type === 'info' ? 'analysis' : log.type || 'system';
        this._log(type, log.message);
      });

      // Get tick info for the symbol
      this.tickInfo = getTickInfo(symbol);

      // Initialize SmartLogsEngine (like CLI algo-executor line 87)
      if (SmartLogsEngine) {
        const symbolCode = symbol.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '').toUpperCase();
        this.logsEngine = new SmartLogsEngine(strategyId, symbolCode);
      }

      // Connect to market data feed
      this._log('system', `Account: ${accountName || accountId}`);
      this._log('system', `Symbol: ${symbol} | Qty: ${size}`);
      if (dailyTarget || maxRisk) {
        this._log('risk', `Target: $${dailyTarget || 'N/A'} | Risk: $${maxRisk || 'N/A'}`);
      }
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
      this.feed.on('connected', () => {
        this._log('connected', 'Market data feed connected');
      });
      this.feed.on('disconnected', () => {
        this._log('warn', 'Market data feed disconnected');
        if (this.running) this._emitStatus();
      });

      await this.feed.connect(creds);
      await this.feed.subscribe(symbol, exchange);

      // Start processing ticks
      this.running = true;
      this.stats.startTime = Date.now();
      this._log('ready', `Algo started: ${strategyId} on ${symbol} (${size} contracts)`);

      this.feed.on('tick', (tick) => this._onTick(tick));

      // Start SmartLogsEngine interval (1s, like CLI algo-executor line 530)
      this._startSmartLogs();

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
  async stop(reason = 'manual') {
    if (!this.running) {
      return { success: true, message: 'Algo not running' };
    }

    this.running = false;
    this._log('system', 'Stopping algo - cancelling orders...');

    // Stop smart logs
    if (this._smartLogsInterval) {
      clearInterval(this._smartLogsInterval);
      this._smartLogsInterval = null;
    }

    // Cancel brackets if any
    if (this.bracketCleanup) {
      try {
        await this.bracketCleanup();
        this._log('system', 'All pending orders cancelled');
      } catch (_) {}
      this.bracketCleanup = null;
    }

    // Flatten position if open
    if (this.position) {
      this._log('system', `Flattening ${this.position.side} ${this.position.qty} @ market...`);
      try {
        await this.service.closePosition(this.position.accountId, this.position.symbol);
        this._log('system', 'Position verified flat');
        this.position = null;
      } catch (err) {
        this._log('error', `Failed to flatten: ${err.message}`);
      }
    }

    await this._cleanupFeed();

    // Emit session summary (like CLI renderSessionSummary)
    const duration = Date.now() - (this.stats.startTime || Date.now());
    const winRate = this.stats.trades > 0
      ? ((this.stats.wins / this.stats.trades) * 100).toFixed(1)
      : '0.0';

    this._log('system', `Algo stopped — ${reason.toUpperCase()}`);

    this.emit('summary', {
      reason,
      duration,
      trades: this.stats.trades,
      wins: this.stats.wins,
      losses: this.stats.losses,
      winRate: Number(winRate),
      pnl: this.stats.totalPnl,
      target: this.config?.dailyTarget || null,
    });

    this._emitStatus();
    this.emit('stopped', { reason, stats: { ...this.stats } });

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
   * Start SmartLogsEngine 1-second interval (mirrors CLI algo-executor line 530)
   */
  _startSmartLogs() {
    if (!this.logsEngine || !this.strategy) return;

    let lastSecond = 0;
    this._smartLogsInterval = setInterval(() => {
      if (!this.running) return;
      const now = Math.floor(Date.now() / 1000);
      if (now === lastSecond) return;
      lastSecond = now;

      // Get real strategy state (like CLI algo-executor line 537)
      const contractId = this.config.symbol;
      const state = this.strategy.getAnalysisState?.(contractId, this._lastPrice);

      const logState = {
        bars: state?.barsProcessed || 0,
        swings: state?.swingsDetected || 0,
        zones: state?.activeZones || 0,
        trend: this._currentBias === 'LONG' ? 'bullish' : this._currentBias === 'SHORT' ? 'bearish' : 'neutral',
        position: this.position ? (this.position.side === 'long' ? 1 : -1) : 0,
        price: this._lastPrice || 0,
        delta: this._runningDelta,
        buyPct: this._runningBuyPct,
        tickCount: this._tickCount,
        // QUANT strategy metrics (real from strategy)
        zScore: state?.zScore || 0,
        vpin: state?.vpin || 0,
        ofi: state?.ofi || 0,
      };

      const log = this.logsEngine.getLog(logState);
      if (log) {
        // Strip chalk ANSI codes for web display
        const cleanMsg = log.message.replace(
          // eslint-disable-next-line no-control-regex
          /\u001b\[[0-9;]*m/g, ''
        );
        this.emit('smartlog', {
          type: log.type || 'analysis',
          message: cleanMsg,
          timestamp: Date.now(),
          // Send raw metrics for frontend coloring
          metrics: {
            price: this._lastPrice,
            zScore: state?.zScore || 0,
            vpin: state?.vpin || 0,
            ofi: state?.ofi || 0,
            delta: this._runningDelta,
            buyPct: this._runningBuyPct,
            position: this.position ? this.position.side : null,
            tickCount: this._tickCount,
          },
        });
      }
    }, 1000);
  }

  /**
   * Process incoming tick
   */
  _onTick(tick) {
    if (!this.running || !this.strategy) return;

    const price = tick.price;
    if (!price) return;

    // Track latency
    if (tick.timestamp) {
      this.stats.lastLatency = Math.max(0, Date.now() - tick.timestamp);
    }

    // Track tick state for SmartLogsEngine
    this._lastPrice = price;
    this._tickCount++;

    // Update running delta/buyPct from tick side
    if (tick.side === 'BUY' || tick.side === 0) {
      this._runningDelta++;
      this._runningBuyPct = Math.min(100, this._runningBuyPct + 0.1);
    } else if (tick.side === 'SELL' || tick.side === 1) {
      this._runningDelta--;
      this._runningBuyPct = Math.max(0, this._runningBuyPct - 0.1);
    }

    // Emit tick to WebSocket (price streaming)
    this.emit('tick', {
      price,
      bid: tick.bid || null,
      ask: tick.ask || null,
      volume: tick.volume || 0,
      timestamp: tick.timestamp || Date.now(),
      latency: this.stats.lastLatency,
    });

    // Feed tick to strategy — M1 uses processTick(tick) with contractId
    try {
      const signal = this.strategy.processTick({
        contractId: this.config.symbol,
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

    const { direction, entry, entryPrice, stopLoss, takeProfit, confidence } = signal;
    const entryPx = entry || entryPrice;
    const sl = stopLoss || signal.sl;
    const tp = takeProfit || signal.tp;
    const { symbol, exchange, accountId, size } = this.config;

    this.emit('signal', {
      direction,
      entry: entryPx || null,
      sl: sl || null,
      tp: tp || null,
      confidence: confidence || null,
    });

    this._log('signal', `Signal: ${direction.toUpperCase()} @ ${entryPx || 'MKT'} | SL=${sl} | TP=${tp} | conf=${((confidence || 0) * 100).toFixed(0)}%`);

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

    const fillPrice = result.fillPrice || entryPx || 0;

    this.position = {
      side: direction,
      qty: size,
      entryPrice: fillPrice,
      symbol,
      exchange,
      accountId,
      entryTime: Date.now(),
      orderId: result.orderId,
    };

    this.emit('position', {
      symbol,
      qty: direction === 'long' ? size : -size,
      side: direction,
      entryPrice: fillPrice,
      openPnl: 0,
    });

    // Use fill_buy / fill_sell like CLI
    const fillType = direction === 'long' ? 'fill_buy' : 'fill_sell';
    this._log(fillType, `Entered ${direction.toUpperCase()} ${size}x ${symbol} @ ${fillPrice}`);
    this._log('trade', `SL: ${sl} | TP: ${tp} (OCO)`);

    this._currentBias = direction === 'long' ? 'LONG' : 'SHORT';

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
        this._monitorBracketFill(fillPrice, sl, tp, direction);
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
        const isWin = pnl > 0;

        // Update stats
        this.stats.trades++;
        this.stats.totalPnl += pnl;
        if (isWin) this.stats.wins++;
        else if (pnl < 0) this.stats.losses++;

        // Emit fill_win / fill_loss like CLI
        const resultType = isWin ? 'fill_win' : 'fill_loss';
        this._log(resultType, `${isWin ? 'WIN' : 'LOSS'} ${isWin ? '+' : ''}$${pnl.toFixed(2)} | ${direction.toUpperCase()} ${entryPrice} → ${exitPrice} (${ticks.toFixed(1)} ticks, ${(duration / 1000).toFixed(0)}s)`);

        this.emit('trade', {
          direction,
          entry: entryPrice,
          exit: exitPrice,
          pnl,
          ticks: Math.round(ticks * 100) / 100,
          duration,
          isWin,
        });

        this.emit('pnl', {
          dayPnl: this.stats.totalPnl,
          openPnl: 0,
          closedPnl: this.stats.totalPnl,
        });

        // Emit updated stats
        const winRate = this.stats.trades > 0
          ? ((this.stats.wins / this.stats.trades) * 100)
          : 0;
        this.emit('statsUpdate', {
          trades: this.stats.trades,
          wins: this.stats.wins,
          losses: this.stats.losses,
          winRate,
          totalPnl: this.stats.totalPnl,
          latency: this.stats.lastLatency,
        });

        this.position = null;
        this.bracketCleanup = null;
        this._currentBias = 'FLAT';
        this.service.removeListener('orderNotification', listener);
        this._emitStatus();

        // Emit position flat
        this.emit('position', {
          symbol: this.config.symbol,
          qty: 0,
          side: 'flat',
          entryPrice: 0,
          openPnl: 0,
        });

        // Check daily target/risk auto-stop (like CLI)
        this._checkAutoStop();
      }
    };

    this.service.on('orderNotification', listener);

    // Safety: remove listener if algo stops
    this.once('stopped', () => {
      this.service.removeListener('orderNotification', listener);
    });
  }

  /**
   * Daily target/risk auto-stop (like CLI algo-executor)
   */
  _checkAutoStop() {
    if (!this.config) return;

    const { dailyTarget, maxRisk } = this.config;
    const pnl = this.stats.totalPnl;

    if (dailyTarget && pnl >= dailyTarget) {
      this._log('fill_win', `TARGET REACHED! +$${pnl.toFixed(2)}`);
      this.stop('target');
    } else if (maxRisk && pnl <= -maxRisk) {
      this._log('fill_loss', `MAX RISK! -$${Math.abs(pnl).toFixed(2)}`);
      this.stop('risk');
    }
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
