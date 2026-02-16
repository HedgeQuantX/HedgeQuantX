/**
 * Algo Runner
 *
 * Manages algo execution per session.
 * Uses loadStrategy from HQX-CLI and MarketDataFeed for real-time ticks.
 * Emits events via EventEmitter (forwarded to WebSocket by ws/handler.js).
 *
 * Mirrors CLI algo-executor behavior:
 * - Strategy log forwarding (M1 log events → WS)
 * - SmartLogsEngine (1s interval via algo-smart-logs.js)
 * - Daily target/risk auto-stop
 * - Latency tracking
 * - Win/loss log types (fill_win, fill_loss, fill_buy, fill_sell)
 *
 * NO MOCK DATA - All data from Rithmic API.
 */

'use strict';

const EventEmitter = require('events');
const { startSmartLogs } = require('./algo-smart-logs');

// CLI imports — lazy loaded, may not exist in all deploy environments
let MarketDataFeed, loadStrategy;
try {
  ({ MarketDataFeed } = require('../../../src/lib/data'));
  ({ loadStrategy } = require('../../../src/lib/m'));
  console.log('[AlgoRunner] Strategy modules loaded successfully');
} catch (err) {
  console.error('[AlgoRunner] Failed to load strategy modules:', err.message);
  MarketDataFeed = null;
  loadStrategy = null;
}
const { getTickInfo } = require('../../../src/services/rithmic/trades');

class AlgoRunner extends EventEmitter {
  constructor(service) {
    super();
    this.service = service;
    this.feed = null;
    this.strategy = null;
    this.running = false;

    this.position = null;
    this.bracketCleanup = null;

    this.stats = { trades: 0, wins: 0, losses: 0, totalPnl: 0, startTime: null, lastLatency: null };
    this.config = null;

    // Tick state for SmartLogsEngine
    this._lastPrice = 0;
    this._tickCount = 0;
    this._runningDelta = 0;
    this._runningBuyPct = 50;
    this._currentBias = 'FLAT';
    this._stopSmartLogs = null;
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

    this.config = { strategyId, symbol, exchange, accountId, size, dailyTarget, maxRisk, accountName, propfirm };

    if (!MarketDataFeed || !loadStrategy) {
      return { success: false, error: 'Strategy engine not available in this environment' };
    }

    try {
      this._log('system', `Strategy: ${strategyId}`);
      const module = loadStrategy(strategyId);
      this.strategy = new module.M1();

      // Forward strategy log emissions (like CLI algo-executor line 103)
      this.strategy.on('log', (log) => {
        if (log.type === 'debug') return;
        this._log(log.type === 'info' ? 'analysis' : log.type || 'system', log.message);
      });

      this.tickInfo = getTickInfo(symbol);

      // Initial system logs (mirrors CLI)
      this._log('system', `Account: ${accountName || accountId}`);
      this._log('system', `Symbol: ${symbol} | Qty: ${size}`);
      if (dailyTarget || maxRisk) {
        this._log('risk', `Target: $${dailyTarget || 'N/A'} | Risk: $${maxRisk || 'N/A'}`);
      }
      this._log('info', `Connecting market data feed for ${symbol}`);

      const creds = this.service.getRithmicCredentials();
      if (!creds) return { success: false, error: 'No Rithmic credentials - not logged in' };

      await this.service.disconnectTicker();
      this.feed = new MarketDataFeed();

      this.feed.on('debug', (msg) => this._log('debug', `[Feed] ${msg}`));
      this.feed.on('error', (err) => this._log('error', `[Feed] ${err.message}`));
      this.feed.on('connected', () => this._log('connected', 'Market data feed connected'));
      this.feed.on('disconnected', () => {
        this._log('warn', 'Market data feed disconnected');
        if (this.running) this._emitStatus();
      });

      await this.feed.connect(creds);
      await this.feed.subscribe(symbol, exchange);

      this.running = true;
      this.stats.startTime = Date.now();
      this._log('ready', `Algo started: ${strategyId} on ${symbol} (${size} contracts)`);

      this.feed.on('tick', (tick) => this._onTick(tick));
      this._stopSmartLogs = startSmartLogs(this);
      this._emitStatus();

      return { success: true };
    } catch (err) {
      this._log('error', `Failed to start algo: ${err.message}`);
      await this._cleanupFeed();
      return { success: false, error: 'Failed to initialize algo strategy' };
    }
  }

  async stop(reason = 'manual') {
    if (!this.running) return { success: true, message: 'Algo not running' };

    this.running = false;
    this._log('system', 'Stopping algo — killing all orders & positions...');

    if (this._stopSmartLogs) { this._stopSmartLogs(); this._stopSmartLogs = null; }

    // -----------------------------------------------------------------------
    // STEP 1: Cancel ALL orders on the account (nuclear — not just brackets)
    // -----------------------------------------------------------------------
    const accountId = this.config?.accountId;
    if (accountId) {
      try {
        await this.service.cancelAllOrders(accountId);
        this._log('system', 'All orders cancelled');
      } catch (err) {
        this._log('error', `Cancel all orders failed: ${err.message}`);
      }
    }

    // Clean up bracket listener regardless
    if (this.bracketCleanup) {
      try { await this.bracketCleanup(); } catch (_) {}
      this.bracketCleanup = null;
    }

    // -----------------------------------------------------------------------
    // STEP 2: Flatten ALL real positions from Rithmic (not just internal state)
    // -----------------------------------------------------------------------
    try {
      const posResult = await this.service.getPositions();
      const openPositions = (posResult.positions || []).filter((p) => p.quantity && p.quantity !== 0);

      for (const pos of openPositions) {
        const sym = pos.symbol;
        const qty = Math.abs(pos.quantity);
        const side = pos.quantity > 0 ? 'LONG' : 'SHORT';
        this._log('system', `Flattening ${side} ${qty}x ${sym} @ market...`);

        try {
          // closePosition reads real position from service.positions and places market order
          const closeResult = await this.service.closePosition(accountId, sym);
          if (closeResult.success) {
            this._log('system', `${sym} flattened`);
          } else {
            // Fallback: use Rithmic-native ExitPosition (template 3504)
            this._log('warn', `closePosition failed for ${sym}, using exitPosition fallback...`);
            await this.service.exitPosition(accountId, sym, pos.exchange || 'CME');
            this._log('system', `${sym} exit sent via Rithmic`);
          }
        } catch (err) {
          this._log('error', `Failed to flatten ${sym}: ${err.message}`);
          // Last resort: exitPosition
          try { await this.service.exitPosition(accountId, sym, pos.exchange || 'CME'); } catch (_) {}
        }
      }

      if (openPositions.length === 0 && this.position) {
        // Internal state says we have a position but Rithmic says flat — sync it
        this._log('system', 'No open positions found on Rithmic — already flat');
      }
    } catch (err) {
      this._log('error', `Failed to check positions: ${err.message}`);
      // Fallback: try to close internal position if we know about it
      if (this.position) {
        try {
          await this.service.closePosition(this.position.accountId, this.position.symbol);
        } catch (_) {}
      }
    }

    this.position = null;

    // -----------------------------------------------------------------------
    // STEP 3: Cleanup feed & emit summary
    // -----------------------------------------------------------------------
    await this._cleanupFeed();

    const duration = Date.now() - (this.stats.startTime || Date.now());
    const winRate = this.stats.trades > 0 ? ((this.stats.wins / this.stats.trades) * 100).toFixed(1) : '0.0';
    this._log('system', `Algo stopped — ${reason.toUpperCase()}`);

    this.emit('summary', {
      reason, duration,
      trades: this.stats.trades, wins: this.stats.wins, losses: this.stats.losses,
      winRate: Number(winRate), pnl: this.stats.totalPnl,
      target: this.config?.dailyTarget || null,
    });

    this._emitStatus();
    this.emit('stopped', { reason, stats: { ...this.stats } });
    return { success: true, stats: this.stats };
  }

  getStatus() {
    return {
      running: this.running, config: this.config, position: this.position,
      stats: { ...this.stats }, connected: this.feed?.connected || false,
    };
  }

  // ---------------------------------------------------------------------------
  // Tick processing
  // ---------------------------------------------------------------------------

  _onTick(tick) {
    if (!this.running || !this.strategy) return;
    const price = tick.price;
    if (!price) return;

    if (tick.timestamp) this.stats.lastLatency = Math.max(0, Date.now() - tick.timestamp);

    this._lastPrice = price;
    this._tickCount++;

    if (tick.side === 'BUY' || tick.side === 0) {
      this._runningDelta++;
      this._runningBuyPct = Math.min(100, this._runningBuyPct + 0.1);
    } else if (tick.side === 'SELL' || tick.side === 1) {
      this._runningDelta--;
      this._runningBuyPct = Math.max(0, this._runningBuyPct - 0.1);
    }

    this.emit('tick', {
      price, bid: tick.bid || null, ask: tick.ask || null,
      volume: tick.volume || 0, timestamp: tick.timestamp || Date.now(),
      latency: this.stats.lastLatency,
    });

    try {
      const signal = this.strategy.processTick({
        contractId: this.config.symbol, price,
        bid: tick.bid || price, ask: tick.ask || price,
        volume: tick.volume || 0, size: tick.size || 0,
        side: tick.side, timestamp: tick.timestamp || Date.now(),
      });
      if (signal && signal.direction && !this.position) this._onSignal(signal);
    } catch (err) {
      this._log('error', `Strategy error: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Signal & order execution
  // ---------------------------------------------------------------------------

  async _onSignal(signal) {
    if (!this.running || this.position) return;

    const { direction, entry, entryPrice, stopLoss, takeProfit, confidence } = signal;
    const entryPx = entry || entryPrice;
    const sl = stopLoss || signal.sl;
    const tp = takeProfit || signal.tp;
    const { symbol, exchange, accountId, size } = this.config;

    this.emit('signal', { direction, entry: entryPx || null, sl: sl || null, tp: tp || null, confidence: confidence || null });
    this._log('signal', `Signal: ${direction.toUpperCase()} @ ${entryPx || 'MKT'} | SL=${sl} | TP=${tp} | conf=${((confidence || 0) * 100).toFixed(0)}%`);

    const side = direction === 'long' ? 0 : 1;
    const result = await this.service.placeOrder({ accountId, symbol, exchange, size, side, type: 2 });

    if (!result.success) { this._log('error', `Entry order failed: ${result.error}`); return; }

    const fillPrice = result.fillPrice || entryPx || 0;
    this.position = { side: direction, qty: size, entryPrice: fillPrice, symbol, exchange, accountId, entryTime: Date.now(), orderId: result.orderId };

    this.emit('position', { symbol, qty: direction === 'long' ? size : -size, side: direction, entryPrice: fillPrice, openPnl: 0 });
    this._log(direction === 'long' ? 'fill_buy' : 'fill_sell', `Entered ${direction.toUpperCase()} ${size}x ${symbol} @ ${fillPrice}`);
    this._log('trade', `SL: ${sl} | TP: ${tp} (OCO)`);
    this._currentBias = direction === 'long' ? 'LONG' : 'SHORT';

    if (sl && tp) {
      const br = await this.service.placeOCOBracket({ accountId, symbol, exchange, size, stopPrice: sl, targetPrice: tp, isLong: direction === 'long' });
      if (br.success) {
        this.bracketCleanup = br.cleanup;
        this._log('info', `Brackets placed: SL=${sl} TP=${tp}`);
        this._monitorBracketFill(fillPrice, sl, tp, direction);
      } else {
        this._log('error', `Bracket failed: ${br.error}`);
      }
    }
  }

  _monitorBracketFill(entryPrice, sl, tp, direction) {
    const listener = (order) => {
      if (!this.position) return;
      if (order.notifyType !== 5 || order.symbol !== this.config.symbol) return;
      const exitPrice = order.avgFillPrice || order.fillPrice || 0;
      if (!exitPrice) return;

      const priceDiff = direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
      const ticks = priceDiff / this.tickInfo.tickSize;
      const pnl = ticks * this.tickInfo.tickValue * this.config.size;
      const duration = Date.now() - this.position.entryTime;
      const isWin = pnl > 0;

      this.stats.trades++;
      this.stats.totalPnl += pnl;
      if (isWin) this.stats.wins++; else if (pnl < 0) this.stats.losses++;

      this._log(isWin ? 'fill_win' : 'fill_loss', `${isWin ? 'WIN' : 'LOSS'} ${isWin ? '+' : ''}$${pnl.toFixed(2)} | ${direction.toUpperCase()} ${entryPrice} → ${exitPrice} (${ticks.toFixed(1)} ticks, ${(duration / 1000).toFixed(0)}s)`);

      this.emit('trade', { direction, entry: entryPrice, exit: exitPrice, pnl, ticks: Math.round(ticks * 100) / 100, duration, isWin });
      this.emit('pnl', { dayPnl: this.stats.totalPnl, openPnl: 0, closedPnl: this.stats.totalPnl });

      const winRate = this.stats.trades > 0 ? (this.stats.wins / this.stats.trades) * 100 : 0;
      this.emit('statsUpdate', { trades: this.stats.trades, wins: this.stats.wins, losses: this.stats.losses, winRate, totalPnl: this.stats.totalPnl, latency: this.stats.lastLatency });

      this.position = null;
      this.bracketCleanup = null;
      this._currentBias = 'FLAT';
      this.service.removeListener('orderNotification', listener);
      this._emitStatus();
      this.emit('position', { symbol: this.config.symbol, qty: 0, side: 'flat', entryPrice: 0, openPnl: 0 });
      this._checkAutoStop();
    };

    this.service.on('orderNotification', listener);
    this.once('stopped', () => this.service.removeListener('orderNotification', listener));
  }

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
    if (this.feed) { try { await this.feed.disconnect(); } catch (_) {} this.feed = null; }
  }

  _emitStatus() {
    this.emit('status', {
      connected: this.feed?.connected || false, running: this.running,
      position: this.position ? { side: this.position.side, qty: this.position.qty, entryPrice: this.position.entryPrice, symbol: this.position.symbol } : null,
      stats: { ...this.stats },
    });
  }

  _log(level, message) { this.emit('log', { level, message, timestamp: Date.now() }); }
}

module.exports = { AlgoRunner };
