/**
 * Rithmic Message Handlers
 * Handles ORDER_PLANT and PNL_PLANT messages
 * 
 * FAST SCALPING: Handles order fill notifications (351) for position tracking
 * 
 * OPTIMIZED FOR LOW LATENCY:
 * - Fast path for order notifications (351)
 * - Minimal object creation in hot path
 * - Template ID check before proto decode
 * - Latency tracking for fills
 */

const { proto, decodeAccountPnL, decodeInstrumentPnL } = require('./protobuf');
const { RES, STREAM } = require('./constants');
const { performance } = require('perf_hooks');

// Debug mode - use no-op function when disabled for zero overhead
const DEBUG = process.env.HQX_DEBUG === '1';
const debug = DEBUG ? (...args) => console.log('[Rithmic:Handler]', ...args) : () => {};

// ==================== HIGH-RESOLUTION TIMING ====================
// Use process.hrtime.bigint for sub-millisecond precision

/**
 * Get high-resolution timestamp in nanoseconds
 * @returns {bigint}
 */
const hrNow = () => process.hrtime.bigint();

/**
 * Convert nanoseconds to milliseconds with precision
 * @param {bigint} ns 
 * @returns {number}
 */
const nsToMs = (ns) => Number(ns) / 1_000_000;

// ==================== LATENCY TRACKING ====================
// Track order-to-fill latency for performance monitoring
// OPTIMIZED: Circular buffer (no array.shift), high-resolution timing

const LatencyTracker = {
  _pending: new Map(), // orderTag -> entryTime (bigint nanoseconds)
  _samples: null,      // Pre-allocated Float64Array circular buffer
  _maxSamples: 100,
  _head: 0,            // Next write position
  _count: 0,           // Number of valid samples
  _initialized: false,
  
  /**
   * Initialize circular buffer (lazy init)
   * @private
   */
  _init() {
    if (this._initialized) return;
    this._samples = new Float64Array(this._maxSamples);
    this._initialized = true;
  },
  
  /**
   * Record order sent time with high-resolution timestamp
   * @param {string} orderTag 
   * @param {number} entryTimeMs - Date.now() when order was sent (for compatibility)
   */
  recordEntry(orderTag, entryTimeMs) {
    // Store high-resolution time for precise measurement
    this._pending.set(orderTag, hrNow());
  },
  
  /**
   * Record fill received, calculate latency with sub-ms precision
   * @param {string} orderTag 
   * @returns {number|null} Round-trip latency in ms (with decimal precision), or null if not tracked
   */
  recordFill(orderTag) {
    const entryTime = this._pending.get(orderTag);
    if (!entryTime) return null;
    
    this._pending.delete(orderTag);
    const latencyNs = hrNow() - entryTime;
    const latencyMs = nsToMs(latencyNs);
    
    // Store in circular buffer (no shift, O(1))
    this._init();
    this._samples[this._head] = latencyMs;
    this._head = (this._head + 1) % this._maxSamples;
    if (this._count < this._maxSamples) this._count++;
    
    return latencyMs;
  },
  
  /**
   * Get average latency
   * @returns {number|null}
   */
  getAverage() {
    if (this._count === 0) return null;
    let sum = 0;
    for (let i = 0; i < this._count; i++) {
      sum += this._samples[i];
    }
    return sum / this._count;
  },
  
  /**
   * Get min/max/avg stats with high precision
   * @returns {Object}
   */
  getStats() {
    if (this._count === 0) {
      return { min: null, max: null, avg: null, p50: null, p99: null, samples: 0 };
    }
    
    // Get valid samples
    const valid = [];
    for (let i = 0; i < this._count; i++) {
      valid.push(this._samples[i]);
    }
    valid.sort((a, b) => a - b);
    
    const sum = valid.reduce((a, b) => a + b, 0);
    
    return {
      min: valid[0],
      max: valid[valid.length - 1],
      avg: sum / valid.length,
      p50: valid[Math.floor(valid.length * 0.5)],
      p99: valid[Math.floor(valid.length * 0.99)] || valid[valid.length - 1],
      samples: this._count,
    };
  },
  
  /**
   * Get last N latency samples
   * @param {number} n 
   * @returns {number[]}
   */
  getRecent(n = 10) {
    if (this._count === 0) return [];
    const result = [];
    const start = this._count < this._maxSamples ? 0 : this._head;
    for (let i = 0; i < Math.min(n, this._count); i++) {
      const idx = (start + this._count - 1 - i + this._maxSamples) % this._maxSamples;
      result.push(this._samples[idx]);
    }
    return result;
  },
  
  /**
   * Clear all tracking data
   */
  clear() {
    this._pending.clear();
    this._head = 0;
    this._count = 0;
    if (this._samples) {
      this._samples.fill(0);
    }
  }
};

/**
 * Create ORDER_PLANT message handler
 * @param {RithmicService} service - The Rithmic service instance
 */
const createOrderHandler = (service) => {
  return (msg) => {
    const { templateId, data } = msg;
    
    debug('ORDER_PLANT message received, templateId:', templateId);

    switch (templateId) {
      case RES.LOGIN_INFO:
        debug('Handling LOGIN_INFO');
        handleLoginInfo(service, data);
        break;
      case RES.ACCOUNT_LIST:
        debug('Handling ACCOUNT_LIST (303)');
        handleAccountList(service, data);
        break;
      case RES.TRADE_ROUTES:
        handleTradeRoutes(service, data);
        break;
      case RES.SHOW_ORDERS:
        handleShowOrdersResponse(service, data);
        break;
      case RES.NEW_ORDER:
        debug('Handling NEW_ORDER response (313)');
        handleNewOrderResponse(service, data);
        break;
      case STREAM.EXCHANGE_NOTIFICATION:
        debug('Handling EXCHANGE_NOTIFICATION (352)');
        handleExchangeNotification(service, data);
        break;
      case STREAM.ORDER_NOTIFICATION:
        debug('Handling ORDER_NOTIFICATION (351)');
        handleOrderNotification(service, data);
        break;
    }
  };
};

/**
 * Create PNL_PLANT message handler
 * @param {RithmicService} service - The Rithmic service instance
 */
const createPnLHandler = (service) => {
  return (msg) => {
    const { templateId, data } = msg;
    
    debug('PNL message received, templateId:', templateId);

    switch (templateId) {
      case RES.PNL_POSITION_SNAPSHOT:
      case RES.PNL_POSITION_UPDATES:
        debug('PNL snapshot/updates response OK');
        break;
      case STREAM.ACCOUNT_PNL_UPDATE:
        debug('Account PNL update received');
        handleAccountPnLUpdate(service, data);
        break;
      case STREAM.INSTRUMENT_PNL_UPDATE:
        debug('Instrument PNL update received');
        handleInstrumentPnLUpdate(service, data);
        break;
      default:
        debug('Unknown PNL templateId:', templateId);
    }
  };
};

/**
 * Handle login info response
 */
const handleLoginInfo = (service, data) => {
  try {
    const res = proto.decode('ResponseLoginInfo', data);
    service.emit('loginInfoReceived', {
      fcmId: res.fcmId,
      ibId: res.ibId,
      firstName: res.firstName,
      lastName: res.lastName,
      userType: res.userType,
    });
  } catch (e) {
    // Ignore decode errors
  }
};

/**
 * Handle account list response
 */
const handleAccountList = (service, data) => {
  try {
    debug('Decoding ResponseAccountList...');
    const res = proto.decode('ResponseAccountList', data);
    debug('Decoded account list response:', JSON.stringify(res));
    
    if (res.rpCode?.[0] === '0') {
      // End of list
      debug('Account list complete signal received');
      service.emit('accountListComplete');
    } else if (res.accountId) {
      const account = {
        fcmId: res.fcmId,
        ibId: res.ibId,
        accountId: res.accountId,
        accountName: res.accountName,
        accountCurrency: res.accountCurrency,
      };
      debug('Account received:', account.accountId);
      service.accounts.push(account);
      service.emit('accountReceived', account);
    } else {
      debug('No accountId and no rpCode[0]=0, raw response:', res);
    }
  } catch (e) {
    debug('Error decoding account list:', e.message);
  }
};

/**
 * Handle trade routes response
 */
const handleTradeRoutes = (service, data) => {
  try {
    const res = proto.decode('ResponseTradeRoutes', data);
    service.emit('tradeRoutes', res);
  } catch (e) {
    // Ignore decode errors
  }
};

/**
 * Handle show orders response
 */
const handleShowOrdersResponse = (service, data) => {
  try {
    const res = proto.decode('ResponseShowOrders', data);
    if (res.rpCode?.[0] === '0') {
      service.emit('ordersReceived');
    }
  } catch (e) {
    // Ignore decode errors
  }
};

/**
 * Handle account PnL update
 */
const handleAccountPnLUpdate = (service, data) => {
  try {
    const pnl = decodeAccountPnL(data);
    debug('Decoded Account PNL:', JSON.stringify(pnl));
    
    if (pnl.accountId) {
      const pnlData = {
        accountBalance: parseFloat(pnl.accountBalance || 0),
        cashOnHand: parseFloat(pnl.cashOnHand || 0),
        marginBalance: parseFloat(pnl.marginBalance || 0),
        openPositionPnl: parseFloat(pnl.openPositionPnl || 0),
        closedPositionPnl: parseFloat(pnl.closedPositionPnl || 0),
        dayPnl: parseFloat(pnl.dayPnl || 0),
      };
      debug('Storing PNL for account:', pnl.accountId, pnlData);
      service.accountPnL.set(pnl.accountId, pnlData);
      service.emit('pnlUpdate', pnl);
    } else {
      debug('No accountId in PNL response');
    }
  } catch (e) {
    debug('Error decoding Account PNL:', e.message);
  }
};

/**
 * Handle instrument PnL update (positions)
 */
const handleInstrumentPnLUpdate = (service, data) => {
  try {
    const pos = decodeInstrumentPnL(data);
    if (pos.symbol && pos.accountId) {
      const key = `${pos.accountId}:${pos.symbol}:${pos.exchange}`;
      const netQty = pos.netQuantity || pos.openPositionQuantity || ((pos.buyQty || 0) - (pos.sellQty || 0));
      
      if (netQty !== 0) {
        service.positions.set(key, {
          accountId: pos.accountId,
          symbol: pos.symbol,
          exchange: pos.exchange || 'CME',
          quantity: netQty,
          averagePrice: pos.avgOpenFillPrice || 0,
          openPnl: parseFloat(pos.openPositionPnl || pos.dayOpenPnl || 0),
          closedPnl: parseFloat(pos.closedPositionPnl || pos.dayClosedPnl || 0),
          dayPnl: parseFloat(pos.dayPnl || 0),
          isSnapshot: pos.isSnapshot || false,
        });
      } else {
        service.positions.delete(key);
      }
      
      service.emit('positionUpdate', service.positions.get(key));
    }
  } catch (e) {
    // Ignore decode errors
  }
};

/**
 * Handle new order response (313) - confirms order accepted
 */
const handleNewOrderResponse = (service, data) => {
  try {
    const res = proto.decode('ResponseNewOrder', data);
    const orderTag = res.userMsg?.[0] || null;
    const timestamp = performance.now();
    
    debug('New order response:', {
      orderTag,
      rpCode: res.rpCode,
      basketId: res.basketId,
      ssboe: res.ssboe,
      usecs: res.usecs,
    });

    // Emit for position manager tracking
    service.emit('orderAccepted', {
      orderTag,
      basketId: res.basketId,
      rpCode: res.rpCode,
      timestamp,
    });
  } catch (e) {
    debug('Error decoding new order response:', e.message);
  }
};

// ==================== PRE-ALLOCATED OBJECTS ====================
// Reusable objects for hot path to avoid GC pressure

const FillInfoPool = {
  // Pre-allocated fill info template
  _template: {
    orderTag: null,
    basketId: null,
    orderId: null,
    status: null,
    symbol: null,
    exchange: null,
    accountId: null,
    fillQuantity: 0,
    totalFillQuantity: 0,
    remainingQuantity: 0,
    avgFillPrice: 0,
    lastFillPrice: 0,
    transactionType: 0,
    orderType: 0,
    quantity: 0,
    ssboe: 0,
    usecs: 0,
    localTimestamp: 0,
    roundTripLatencyMs: null,
  },
  
  /**
   * Fill template with notification data
   * @param {Object} notif - Decoded notification
   * @param {number} receiveTime - Local receive timestamp
   * @param {number|null} latency - Round-trip latency
   * @returns {Object}
   */
  fill(notif, receiveTime, latency) {
    const o = this._template;
    o.orderTag = notif.userMsg?.[0] || null;
    o.basketId = notif.basketId;
    o.orderId = notif.orderId;
    o.status = notif.status;
    o.symbol = notif.symbol;
    o.exchange = notif.exchange;
    o.accountId = notif.accountId;
    o.fillQuantity = notif.fillQuantity || 0;
    o.totalFillQuantity = notif.totalFillQuantity || 0;
    o.remainingQuantity = notif.remainingQuantity || 0;
    o.avgFillPrice = parseFloat(notif.avgFillPrice || 0);
    o.lastFillPrice = parseFloat(notif.fillPrice || 0);
    o.transactionType = notif.transactionType;
    o.orderType = notif.orderType;
    o.quantity = notif.quantity;
    o.ssboe = notif.ssboe;
    o.usecs = notif.usecs;
    o.localTimestamp = receiveTime;
    o.roundTripLatencyMs = latency;
    return o;
  },
  
  /**
   * Create a copy for async operations that need to keep the data
   * @param {Object} fillInfo 
   * @returns {Object}
   */
  clone(fillInfo) {
    return { ...fillInfo };
  }
};

/**
 * Handle order notification (351) - CRITICAL for fill tracking
 * This is the primary notification for order status changes including FILLS
 * 
 * ULTRA-OPTIMIZED:
 * - Pre-allocated fill info object (zero allocation in hot path)
 * - Fast path for fill detection
 * - High-resolution latency tracking
 */
const handleOrderNotification = (service, data) => {
  const receiveTime = Date.now();
  
  try {
    const notif = proto.decode('RithmicOrderNotification', data);
    const orderTag = notif.userMsg?.[0] || null;
    
    // FAST PATH: Check for fill immediately
    const fillQty = notif.fillQuantity || notif.totalFillQuantity || 0;
    const isFill = fillQty > 0;
    
    // Calculate round-trip latency if this is a fill we're tracking
    let roundTripLatency = null;
    if (isFill && orderTag) {
      roundTripLatency = LatencyTracker.recordFill(orderTag);
    }
    
    debug('Order notification:', {
      orderTag,
      status: notif.status,
      filledQty: fillQty,
      avgFillPrice: notif.avgFillPrice,
      roundTripLatency,
    });

    // OPTIMIZED: Use pre-allocated object
    const fillInfo = FillInfoPool.fill(notif, receiveTime, roundTripLatency);

    // Emit raw notification
    service.emit('orderNotification', fillInfo);

    // Emit fill event if this is a fill
    if (isFill) {
      debug('ORDER FILLED:', {
        orderTag,
        side: fillInfo.transactionType === 1 ? 'BUY' : 'SELL',
        qty: fillQty,
        avgPrice: fillInfo.avgFillPrice,
        latencyMs: roundTripLatency,
      });
      
      // Clone for fill event (async handlers may need to keep the data)
      service.emit('orderFilled', FillInfoPool.clone(fillInfo));
    }
  } catch (e) {
    debug('Error decoding order notification:', e.message);
  }
};

/**
 * Handle exchange notification (352) - exchange-level order updates
 */
const handleExchangeNotification = (service, data) => {
  try {
    const notif = proto.decode('ExchangeOrderNotification', data);
    const timestamp = performance.now();
    
    debug('Exchange notification:', {
      orderTag: notif.userMsg?.[0],
      text: notif.text,
      reportType: notif.reportType,
    });

    service.emit('exchangeNotification', {
      orderTag: notif.userMsg?.[0] || null,
      text: notif.text,
      reportType: notif.reportType,
      timestamp,
    });
  } catch (e) {
    debug('Error decoding exchange notification:', e.message);
  }
};

module.exports = {
  createOrderHandler,
  createPnLHandler,
  LatencyTracker,
};
