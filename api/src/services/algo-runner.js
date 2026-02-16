/**
 * Algo Runner — Web equivalent of CLI algo-executor.js
 * Mirrors CLI: strategy init, signal/tick processing, OCO brackets, P&L polling, emergency flatten.
 * NO MOCK DATA - All data from Rithmic API.
 */

'use strict';

const EventEmitter = require('events');
const { startSmartLogs } = require('./algo-smart-logs');
const { emergencyFlatten, startPnlPolling, checkAutoStop } = require('./algo-runner-stop');

let MarketDataFeed, loadStrategy;
try {
  ({ MarketDataFeed } = require('../../../src/lib/data'));
  ({ loadStrategy } = require('../../../src/lib/m'));
  console.log('[AlgoRunner] Strategy modules loaded');
} catch (err) {
  console.error('[AlgoRunner] Strategy modules unavailable:', err.message);
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

    // Position tracking (mirrors CLI currentPosition + pendingOrder)
    this.position = null;
    this._currentPosition = 0; // Raw qty like CLI (positive=long, negative=short)
    this._pendingOrder = false;
    this.bracketCleanup = null;
    this._activeBrackets = { slOrderId: null, tpOrderId: null, entryPrice: null };

    this.stats = { trades: 0, wins: 0, losses: 0, totalPnl: 0, startTime: null, lastLatency: null };
    this.config = null;
    this.tickInfo = null;

    // Cooldown after position close to prevent immediate re-entry (ms)
    this._lastCloseTime = 0;
    this._closeCooldownMs = 2000;

    // Tick state (mirrors CLI variables)
    this._lastPrice = 0;
    this._tickCount = 0;
    this._runningDelta = 0;
    this._runningBuyPct = 50;
    this._currentBias = 'FLAT';
    this._buyVolume = 0;
    this._sellVolume = 0;
    this._lastTickTime = 0;
    this._lastBiasLogSecond = 0;

    this._stopSmartLogs = null;
    this._pnlInterval = null;
    this._positionUpdateHandler = null;
    this._startingPnL = null;

    // Buffer smartlog events for WS replay
    this.on('smartlog', (data) => this._bufferSmartLog(data));
  }

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
      // --- Strategy init (CLI algo-executor lines 35-83) ---
      this._log('system', `Strategy: ${strategyId}`);
      const module = loadStrategy(strategyId);
      this.strategy = new module.M1();
      this.tickInfo = getTickInfo(symbol);
      this.strategy.initialize(symbol, this.tickInfo.tickSize, this.tickInfo.tickValue);

      // Forward strategy log emissions — suppress duplicates when SmartLogsEngine active
      this.strategy.on('log', (log) => {
        if (log.type === 'debug') return;
        if (this._stopSmartLogs && (log.type === 'info' || log.type === 'analysis' || log.type === 'signal')) return;
        this._log(log.type === 'info' ? 'analysis' : log.type || 'system', log.message);
      });

      // Listen for signal events (CLI line 178) — primary signal path
      this.strategy.on('signal', (signal) => {
        if (!this._pendingOrder && this._currentPosition === 0) {
          this._onSignal(signal);
        }
      });

      // Initial system logs (CLI lines 119-127)
      this._log('system', `Account: ${accountName || accountId}`);
      this._log('system', `Symbol: ${symbol} | Qty: ${size}`);
      if (dailyTarget || maxRisk) {
        this._log('risk', `Target: $${dailyTarget || 'N/A'} | Risk: $${maxRisk || 'N/A'}`);
      }
      this._log('system', 'Connecting to market data...');

      const creds = this.service.getRithmicCredentials();
      if (!creds) return { success: false, error: 'No Rithmic credentials - not logged in' };

      // Clear stale position data (CLI line 67-69)
      if (this.service.positions) this.service.positions.clear();

      // --- positionUpdate listener (CLI lines 129-176) ---
      this._setupPositionUpdateListener();

      await this.service.disconnectTicker();
      await new Promise(r => setTimeout(r, 1500)); // Wait for Rithmic to release TICKER_PLANT slot
      this.feed = new MarketDataFeed();

      this.feed.on('debug', (msg) => this._log('debug', `[Feed] ${msg}`));
      this.feed.on('error', (err) => this._log('error', `[Feed] ${err.message}`));
      this.feed.on('connected', () => { this._log('connected', 'Market data feed connected'); });
      this.feed.on('disconnected', () => {
        this._log('warn', 'Market data feed disconnected');
        this._lastTickTime = 0;
        if (this.running) this._emitStatus();
      });

      console.log(`[AlgoRunner] Connecting TICKER_PLANT: gateway=${creds.gateway} system=${creds.systemName}`);
      await this.feed.connect(creds);
      console.log(`[AlgoRunner] TICKER_PLANT connected, wsState=${this.feed.connection?.ws?.readyState}`);

      // CRITICAL: Attach tick listener + set running BEFORE subscribe
      // so first ticks arriving during subscribe are not lost
      this.running = true;
      this.stats.startTime = Date.now();
      this._lastTickTime = Date.now();
      this.feed.on('tick', (tick) => this._onTick(tick));

      await this.feed.subscribe(symbol, exchange);

      // Skip HISTORY_PLANT warmup — opening a 2nd connection kills TICKER_PLANT streaming
      // on Rithmic Paper. Strategy warms up with live ticks instead.
      this._log('system', 'Warming up with live ticks...');

      this._log('ready', `Algo started: ${strategyId} on ${symbol} (${size} contracts)`);
      this._stopSmartLogs = startSmartLogs(this);

      // Feed health check (10s) — diagnose silent disconnects
      this._feedHealthInterval = setInterval(() => {
        if (!this.running) return;
        console.log(`[AlgoRunner] health: ${Math.round((Date.now() - this.stats.startTime) / 1000)}s ticks=${this._tickCount} ws=${this.feed?.connection?.ws?.readyState ?? -1}`);
      }, 10000);

      // P&L polling (CLI lines 461-526) — every 2s
      this._startPnlPolling();

      this._emitStatus();
      return { success: true };
    } catch (err) {
      this._log('error', `Failed to start algo: ${err.message}`);
      await this._cleanupFeed();
      return { success: false, error: 'Failed to initialize algo strategy' };
    }
  }

  // ---------------------------------------------------------------------------
  // STOP — delegates to algo-runner-stop.js (5-step emergency flatten)
  // ---------------------------------------------------------------------------
  async stop(reason = 'manual') {
    return emergencyFlatten(this, reason);
  }

  getStatus() {
    return {
      running: this.running, config: this.config, position: this.position,
      stats: { ...this.stats }, connected: this.feed?.connected || false,
    };
  }

  // ---------------------------------------------------------------------------
  // Tick processing (mirrors CLI lines 316-413)
  // ---------------------------------------------------------------------------
  _onTick(tick) {
    if (!this.running || !this.strategy) return;

    const now = Date.now();
    const price = Number(tick.price) || Number(tick.tradePrice) || null;
    if (!price || price <= 0) return;

    const bid = Number(tick.bid) || Number(tick.bidPrice) || null;
    const ask = Number(tick.ask) || Number(tick.askPrice) || null;
    const volume = Number(tick.volume) || Number(tick.size) || 1;

    this._tickCount++;
    this._lastPrice = price;
    this._lastTickTime = now;

    // Log first tick (CLI line 352-354)
    if (this._tickCount === 1) {
      this._log('connected', `First tick @ ${price.toFixed(2)}`);
    }

    // Tick count to console (first 10, then every 100/5000)
    if (this._tickCount <= 10 || (this._tickCount <= 500 && this._tickCount % 100 === 0) || this._tickCount % 5000 === 0) console.log(`[AlgoRunner] tick#${this._tickCount} p=${price} t=${tick.type || '?'}`);

    // Buy/sell volume tracking (CLI lines 344-349)
    if (tick.side === 'buy' || tick.side === 'BUY' || tick.aggressor === 1 || tick.side === 0) {
      this._buyVolume += volume;
    } else if (tick.side === 'sell' || tick.side === 'SELL' || tick.aggressor === 2 || tick.side === 1) {
      this._sellVolume += volume;
    } else if (this._lastPrice) {
      if (price > this._lastPrice) this._buyVolume += volume;
      else if (price < this._lastPrice) this._sellVolume += volume;
    }

    // Update bias every 30s (CLI lines 357-366)
    const currentSecond = Math.floor(now / 1000);
    if (currentSecond - this._lastBiasLogSecond >= 30 && this._tickCount > 1) {
      this._lastBiasLogSecond = currentSecond;
      const totalVol = this._buyVolume + this._sellVolume;
      const buyPressure = totalVol > 0 ? (this._buyVolume / totalVol) * 100 : 50;
      this._currentBias = buyPressure > 55 ? 'LONG' : buyPressure < 45 ? 'SHORT' : 'FLAT';
      this._runningDelta = this._buyVolume - this._sellVolume;
      this._runningBuyPct = buyPressure;
      this._buyVolume = 0;
      this._sellVolume = 0;
    }

    // Latency (CLI lines 398-412) — prefer ssboe/usecs from Rithmic
    if (tick.ssboe && tick.usecs !== undefined) {
      const tickTimeMs = (tick.ssboe * 1000) + Math.floor(tick.usecs / 1000);
      const lat = now - tickTimeMs;
      if (lat >= 0 && lat < 5000) this.stats.lastLatency = lat;
    } else if (tick.timestamp) {
      const lat = Math.max(0, now - tick.timestamp);
      if (lat < 5000) this.stats.lastLatency = lat;
    }

    // Emit tick to WS
    this.emit('tick', {
      price, bid, ask, volume,
      timestamp: tick.timestamp || now,
      latency: this.stats.lastLatency,
    });

    // Process tick through strategy (CLI lines 388-396)
    try {
      this.strategy.processTick({
        contractId: this.config.symbol, price, bid: bid || price, ask: ask || price,
        volume, side: tick.side || tick.lastTradeSide || 'unknown',
        timestamp: tick.timestamp || now,
      });
      // Signal handled via strategy.on('signal') — not return value
    } catch (err) {
      this._log('error', `Strategy error: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Signal & order execution (mirrors CLI lines 178-306)
  // ---------------------------------------------------------------------------
  async _onSignal(signal) {
    if (!this.running || this._pendingOrder || this._currentPosition !== 0) return;

    // Cooldown after bracket close — prevent re-entry while OCO cleanup processes
    if (this._lastCloseTime && (Date.now() - this._lastCloseTime) < this._closeCooldownMs) {
      this._log('risk', 'Cooldown active — waiting for bracket cleanup');
      return;
    }

    const { direction, entry, entryPrice, stopLoss, takeProfit, confidence } = signal;
    const entryPx = entry || entryPrice;
    const sl = stopLoss || signal.sl;
    const tp = takeProfit || signal.tp;
    const { symbol, exchange, accountId, size } = this.config;

    this.emit('signal', {
      direction, entry: entryPx || null, sl: sl || null, tp: tp || null, confidence: confidence || null,
    });
    // Signal log is generated by WS handler from the 'signal' event above — no _log here to avoid duplicates

    // Place order (CLI line 251-261)
    this._pendingOrder = true;
    try {
      const orderSide = direction === 'long' ? 0 : 1;
      const result = await this.service.placeOrder({ accountId, symbol, exchange, size, side: orderSide, type: 2 });

      if (!result.success) {
        this._log('error', `Entry order failed: ${result.error}`);
        this._pendingOrder = false;
        return;
      }

      // Update position (CLI line 264)
      this._currentPosition = direction === 'long' ? size : -size;
      const fillPrice = result.fillPrice || entryPx || 0;
      this.position = { side: direction, qty: size, entryPrice: fillPrice, symbol, exchange, accountId, entryTime: Date.now(), orderId: result.orderId };

      this.emit('position', { symbol, qty: this._currentPosition, side: direction, entryPrice: fillPrice, openPnl: 0 });
      this._log(direction === 'long' ? 'fill_buy' : 'fill_sell', `Entered ${direction.toUpperCase()} ${size}x ${symbol} @ ${fillPrice}`);
      this._currentBias = direction === 'long' ? 'LONG' : 'SHORT';

      // Bracket orders with OCO (CLI lines 273-296)
      if (sl && tp) {
        this._activeBrackets.entryPrice = fillPrice;
        const br = await this.service.placeOCOBracket({ accountId, symbol, exchange, size, stopPrice: sl, targetPrice: tp, isLong: direction === 'long' });
        if (br.success) {
          this._activeBrackets.slOrderId = br.slOrderId;
          this._activeBrackets.tpOrderId = br.tpOrderId;
          this.bracketCleanup = br.cleanup;
          this._log('trade', `SL: ${sl} | TP: ${tp} (OCO)`);
          this._monitorBracketFill(fillPrice, sl, tp, direction);
        } else {
          this._log('error', `Bracket failed: ${br.error}`);
        }
      }
    } catch (err) {
      this._log('error', `Order error: ${err.message}`);
    }
    this._pendingOrder = false;
  }

  // ---------------------------------------------------------------------------
  // Bracket fill monitor
  // ---------------------------------------------------------------------------
  _monitorBracketFill(entryPrice, sl, tp, direction) {
    let handled = false;
    const listener = (order) => {
      if (handled || this._currentPosition === 0) return;
      if (order.notifyType !== 5 || order.symbol !== this.config.symbol) return;
      const exitPrice = order.avgFillPrice || order.fillPrice || 0;
      if (!exitPrice) return;
      handled = true;

      const priceDiff = direction === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice;
      const ticks = priceDiff / this.tickInfo.tickSize;
      const pnl = ticks * this.tickInfo.tickValue * this.config.size;
      const dur = Date.now() - (this.position?.entryTime || Date.now());
      const isWin = pnl > 0;

      this.stats.trades++;
      this.stats.totalPnl += pnl;
      if (isWin) this.stats.wins++;
      else if (pnl < 0) this.stats.losses++;

      this._log(isWin ? 'fill_win' : 'fill_loss',
        `${isWin ? 'WIN' : 'LOSS'} ${isWin ? '+' : ''}$${pnl.toFixed(2)} | ${direction.toUpperCase()} ${entryPrice} \u2192 ${exitPrice} (${ticks.toFixed(1)} ticks, ${(dur / 1000).toFixed(0)}s)`);

      this.emit('trade', { direction, entry: entryPrice, exit: exitPrice, pnl, ticks: Math.round(ticks * 100) / 100, duration: dur, isWin });
      this.emit('pnl', { dayPnl: this.stats.totalPnl, openPnl: 0, closedPnl: this.stats.totalPnl });

      const winRate = this.stats.trades > 0 ? (this.stats.wins / this.stats.trades) * 100 : 0;
      this.emit('statsUpdate', { trades: this.stats.trades, wins: this.stats.wins, losses: this.stats.losses, winRate, totalPnl: this.stats.totalPnl, latency: this.stats.lastLatency });

      // Set cooldown BEFORE resetting position to prevent race with new signals
      this._lastCloseTime = Date.now();
      this.position = null;
      this._currentPosition = 0;
      this._pendingOrder = false;
      this.bracketCleanup = null;
      this._activeBrackets = { slOrderId: null, tpOrderId: null, entryPrice: null };
      this._currentBias = 'FLAT';
      this.service.removeListener('orderNotification', listener);
      this._emitStatus();
      this.emit('position', { symbol: this.config.symbol, qty: 0, side: 'flat', entryPrice: 0, openPnl: 0 });
      this._checkAutoStop();
    };

    this.service.on('orderNotification', listener);
    this.once('stopped', () => this.service.removeListener('orderNotification', listener));
  }

  // ---------------------------------------------------------------------------
  // positionUpdate listener (mirrors CLI lines 129-176)
  // CRITICAL: Cancel orphan brackets when position closes externally
  // ---------------------------------------------------------------------------
  _setupPositionUpdateListener() {
    const accId = this.config.accountId;
    const symbol = this.config.symbol;

    this._positionUpdateHandler = async (pos) => {
      const posSymbol = pos.contractId || pos.symbol || '';
      const matchesSymbol = posSymbol.includes(symbol) || symbol.includes(posSymbol);
      const matchesAccount = pos.accountId === accId;
      if (!matchesSymbol || !matchesAccount) return;

      const qty = parseInt(pos.quantity) || 0;
      if (isNaN(qty) || Math.abs(qty) >= 1000 || qty === this._currentPosition) return;

      const oldPos = this._currentPosition;
      this._currentPosition = qty;

      if (qty === 0 && oldPos !== 0) {
        // If bracket monitor already handled this close (cooldown set), skip trade count
        const alreadyHandled = this._lastCloseTime && (Date.now() - this._lastCloseTime) < 1000;
        if (!alreadyHandled) {
          this._log('trade', `Position closed (was ${oldPos})`);
          this.stats.trades++;
        }
        this._pendingOrder = false;
        this._lastCloseTime = Date.now();

        // Cancel orphan brackets (CLI lines 153-161)
        if (this._activeBrackets.slOrderId || this._activeBrackets.tpOrderId) {
          try {
            await this.service.cancelAllOrders(accId);
            if (!alreadyHandled) this._log('system', 'Brackets cancelled');
          } catch (_) {}
          this._activeBrackets = { slOrderId: null, tpOrderId: null, entryPrice: null };
        }
      } else if (qty !== 0 && oldPos === 0) {
        this._log('trade', `Position opened: ${qty}`);
      } else if (Math.sign(qty) !== Math.sign(oldPos)) {
        // Position reversed — emergency: cancel all and flatten
        this._log('error', `Position REVERSED: ${oldPos} -> ${qty} — cancelling all orders`);
        try {
          await this.service.cancelAllOrders(accId);
        } catch (_) {}
        this._activeBrackets = { slOrderId: null, tpOrderId: null, entryPrice: null };
      }
    };

    if (typeof this.service.on === 'function') {
      this.service.on('positionUpdate', this._positionUpdateHandler);
    }
  }

  _removePositionUpdateListener() {
    if (this._positionUpdateHandler && typeof this.service.removeListener === 'function') {
      this.service.removeListener('positionUpdate', this._positionUpdateHandler);
      this._positionUpdateHandler = null;
    }
  }

  // P&L polling + auto-stop — delegated to algo-runner-stop.js
  _startPnlPolling() { startPnlPolling(this); }
  _checkAutoStop() { checkAutoStop(this); }

  async _cleanupFeed() {
    if (this._feedHealthInterval) { clearInterval(this._feedHealthInterval); this._feedHealthInterval = null; }
    if (this.feed) { try { await this.feed.disconnect(); } catch (_) {} this.feed = null; }
  }

  _emitStatus() {
    this.emit('status', {
      connected: this.feed?.connected || false, running: this.running,
      position: this.position ? { side: this.position.side, qty: this.position.qty, entryPrice: this.position.entryPrice, symbol: this.position.symbol } : null,
      stats: { ...this.stats },
    });
  }

  _log(level, message) {
    const entry = { level, message, timestamp: Date.now() };
    // Debug logs → console only (not frontend)
    if (level === 'debug') {
      console.log(`[AlgoRunner][DBG] ${message}`);
      return;
    }
    // Buffer logs so WS clients connecting after start can replay
    if (!this._logBuffer) this._logBuffer = [];
    if (this._logBuffer.length < 200) this._logBuffer.push(entry);
    this.emit('log', entry);
  }

  /**
   * Buffer smartlog events for WS replay (smartlogs bypass _log)
   */
  _bufferSmartLog(data) {
    if (!this._logBuffer) this._logBuffer = [];
    const entry = { level: data.type || 'analysis', message: data.message, timestamp: data.timestamp || Date.now(), kind: 'smartlog' };
    if (this._logBuffer.length < 200) this._logBuffer.push(entry);
  }
}

module.exports = { AlgoRunner };
