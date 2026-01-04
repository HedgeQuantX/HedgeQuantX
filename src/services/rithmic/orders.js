/**
 * Rithmic Orders Module
 * Order placement, cancellation, and history
 * 
 * FAST SCALPING: fastEntry() and fastExit() for ultra-low latency execution
 * Target: < 5ms local processing (network latency separate)
 * 
 * OPTIMIZATIONS:
 * - Pre-allocated order template objects
 * - Fast orderTag generation (no Date.now in hot path)
 * - Direct proto encoding with cached types
 * - Minimal object creation
 */

const { REQ } = require('./constants');
const { proto } = require('./protobuf');
const { LatencyTracker } = require('./handlers');
const { performance } = require('perf_hooks');

// ==================== FAST ORDER TAG ====================
// Pre-generate prefix once at module load (not per-order)
const ORDER_TAG_PREFIX = `HQX${process.pid}-`;
let orderIdCounter = 0;

/**
 * Ultra-fast order tag generation
 * Avoids Date.now() and string interpolation in hot path
 * @returns {string}
 */
const generateOrderTag = () => ORDER_TAG_PREFIX + (++orderIdCounter);

// ==================== PRE-ALLOCATED ORDER TEMPLATES ====================
// Reusable order object to minimize GC pressure

/**
 * Order object pool for zero-allocation hot path
 */
const OrderPool = {
  // Pre-allocated order template
  _template: {
    templateId: REQ.NEW_ORDER,
    userMsg: [''],
    fcmId: '',
    ibId: '',
    accountId: '',
    symbol: '',
    exchange: 'CME',
    quantity: 0,
    transactionType: 1,
    duration: 1,
    orderType: 1,
    manualOrAuto: 2,
  },
  
  /**
   * Get order object with values filled in
   * Reuses same object to avoid allocation
   */
  fill(orderTag, loginInfo, orderData) {
    const o = this._template;
    o.userMsg[0] = orderTag;
    o.fcmId = loginInfo.fcmId;
    o.ibId = loginInfo.ibId;
    o.accountId = orderData.accountId;
    o.symbol = orderData.symbol;
    o.exchange = orderData.exchange || 'CME';
    o.quantity = orderData.size;
    o.transactionType = orderData.side === 0 ? 1 : 2;
    return o;
  }
};

/**
 * Ultra-fast market order entry - HOT PATH
 * NO SL/TP, NO await confirmation, fire-and-forget
 * Target latency: < 5ms local processing
 * 
 * OPTIMIZATIONS:
 * - Reuses pre-allocated order object
 * - Fast orderTag (no Date.now)
 * - Uses fastEncode for cached protobuf type
 * - Minimal branching
 * 
 * @param {RithmicService} service - The Rithmic service instance
 * @param {Object} orderData - { accountId, symbol, exchange, size, side }
 * @returns {{ success: boolean, orderTag: string, entryTime: number, latencyMs: number }}
 */
const fastEntry = (service, orderData) => {
  const startTime = performance.now();
  const orderTag = generateOrderTag();
  const entryTime = Date.now();
  
  // Fast connection check
  if (!service.orderConn?.isConnected || !service.loginInfo) {
    return { 
      success: false, 
      error: 'Not connected',
      orderTag,
      entryTime,
      latencyMs: performance.now() - startTime,
    };
  }

  try {
    // OPTIMIZED: Use pre-allocated order object
    const order = OrderPool.fill(orderTag, service.loginInfo, orderData);
    
    // OPTIMIZED: Use fastEncode with cached type
    const buffer = proto.fastEncode('RequestNewOrder', order);
    
    // ULTRA-OPTIMIZED: Try direct socket write first, fallback to fastSend
    const sent = service.orderConn.ultraSend 
      ? service.orderConn.ultraSend(buffer)
      : (service.orderConn.fastSend(buffer), true);
    
    if (!sent) {
      service.orderConn.fastSend(buffer);
    }
    
    // Track for round-trip latency measurement
    LatencyTracker.recordEntry(orderTag, entryTime);

    return { 
      success: true, 
      orderTag,
      entryTime,
      latencyMs: performance.now() - startTime,
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      orderTag,
      entryTime,
      latencyMs: performance.now() - startTime,
    };
  }
};

/**
 * Ultra-fast market exit - for position closing
 * Fire-and-forget like fastEntry
 * Same optimizations as fastEntry
 * 
 * @param {RithmicService} service - The Rithmic service instance
 * @param {Object} orderData - { accountId, symbol, exchange, size, side }
 * @returns {{ success: boolean, orderTag: string, exitTime: number, latencyMs: number }}
 */
const fastExit = (service, orderData) => {
  const startTime = performance.now();
  const orderTag = generateOrderTag();
  const exitTime = Date.now();
  
  if (!service.orderConn?.isConnected || !service.loginInfo) {
    return { 
      success: false, 
      error: 'Not connected',
      orderTag,
      exitTime,
      latencyMs: performance.now() - startTime,
    };
  }

  try {
    // OPTIMIZED: Use pre-allocated order object
    const order = OrderPool.fill(orderTag, service.loginInfo, orderData);
    
    // OPTIMIZED: Use fastEncode with cached type
    const buffer = proto.fastEncode('RequestNewOrder', order);
    
    // ULTRA-OPTIMIZED: Try direct socket write first, fallback to fastSend
    const sent = service.orderConn.ultraSend 
      ? service.orderConn.ultraSend(buffer)
      : (service.orderConn.fastSend(buffer), true);
    
    if (!sent) {
      service.orderConn.fastSend(buffer);
    }
    
    return { 
      success: true, 
      orderTag,
      exitTime,
      latencyMs: performance.now() - startTime,
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      orderTag,
      exitTime,
      latencyMs: performance.now() - startTime,
    };
  }
};

/**
 * Place order via ORDER_PLANT
 * @param {RithmicService} service - The Rithmic service instance
 * @param {Object} orderData - Order parameters
 */
const placeOrder = async (service, orderData) => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: false, error: 'Not connected' };
  }

  try {
    service.orderConn.send('RequestNewOrder', {
      templateId: REQ.NEW_ORDER,
      userMsg: ['HQX'],
      fcmId: service.loginInfo.fcmId,
      ibId: service.loginInfo.ibId,
      accountId: orderData.accountId,
      symbol: orderData.symbol,
      exchange: orderData.exchange || 'CME',
      quantity: orderData.size,
      transactionType: orderData.side === 0 ? 1 : 2, // 1=Buy, 2=Sell
      duration: 1, // DAY
      orderType: orderData.type === 2 ? 1 : 2, // 1=Market, 2=Limit
      price: orderData.price || 0,
    });

    return { success: true, message: 'Order submitted' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Cancel order
 * @param {RithmicService} service - The Rithmic service instance
 * @param {string} orderId - Order ID to cancel
 */
const cancelOrder = async (service, orderId) => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: false, error: 'Not connected' };
  }

  try {
    service.orderConn.send('RequestCancelOrder', {
      templateId: REQ.CANCEL_ORDER,
      userMsg: ['HQX'],
      fcmId: service.loginInfo.fcmId,
      ibId: service.loginInfo.ibId,
      orderId: orderId,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Get active orders
 * @param {RithmicService} service - The Rithmic service instance
 */
const getOrders = async (service) => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: true, orders: [] };
  }

  return new Promise((resolve) => {
    const orders = [];
    const timeout = setTimeout(() => {
      resolve({ success: true, orders });
    }, 3000);

    const orderHandler = (notification) => {
      if (notification.orderId) {
        orders.push({
          orderId: notification.orderId,
          symbol: notification.symbol,
          exchange: notification.exchange,
          side: notification.transactionType === 1 ? 'BUY' : 'SELL',
          quantity: notification.quantity,
          filledQuantity: notification.filledQuantity || 0,
          price: notification.price,
          orderType: notification.orderType,
          status: notification.status,
        });
      }
    };

    service.once('ordersReceived', () => {
      clearTimeout(timeout);
      service.removeListener('orderNotification', orderHandler);
      resolve({ success: true, orders });
    });

    service.on('orderNotification', orderHandler);

    try {
      for (const acc of service.accounts) {
        service.orderConn.send('RequestShowOrders', {
          templateId: REQ.SHOW_ORDERS,
          userMsg: ['HQX'],
          fcmId: acc.fcmId || service.loginInfo.fcmId,
          ibId: acc.ibId || service.loginInfo.ibId,
          accountId: acc.accountId,
        });
      }
    } catch (e) {
      clearTimeout(timeout);
      resolve({ success: false, error: e.message, orders: [] });
    }
  });
};

/**
 * Get order history
 * @param {RithmicService} service - The Rithmic service instance
 * @param {string} date - Date in YYYYMMDD format
 */
const getOrderHistory = async (service, date) => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: true, orders: [] };
  }

  const dateStr = date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  
  return new Promise((resolve) => {
    const orders = [];
    const timeout = setTimeout(() => {
      resolve({ success: true, orders });
    }, 3000);

    try {
      for (const acc of service.accounts) {
        service.orderConn.send('RequestShowOrderHistorySummary', {
          templateId: REQ.SHOW_ORDER_HISTORY,
          userMsg: ['HQX'],
          fcmId: acc.fcmId || service.loginInfo.fcmId,
          ibId: acc.ibId || service.loginInfo.ibId,
          accountId: acc.accountId,
          date: dateStr,
        });
      }
      
      setTimeout(() => {
        clearTimeout(timeout);
        resolve({ success: true, orders });
      }, 2000);
    } catch (e) {
      clearTimeout(timeout);
      resolve({ success: false, error: e.message, orders: [] });
    }
  });
};

/**
 * Close position (market order to flatten)
 * @param {RithmicService} service - The Rithmic service instance
 * @param {string} accountId - Account ID
 * @param {string} symbol - Symbol to close
 */
const closePosition = async (service, accountId, symbol) => {
  const positions = Array.from(service.positions.values());
  const position = positions.find(p => p.accountId === accountId && p.symbol === symbol);

  if (!position) {
    return { success: false, error: 'Position not found' };
  }

  return placeOrder(service, {
    accountId,
    symbol,
    exchange: position.exchange,
    size: Math.abs(position.quantity),
    side: position.quantity > 0 ? 1 : 0, // Sell if long, Buy if short
    type: 2, // Market
  });
};

module.exports = {
  placeOrder,
  cancelOrder,
  getOrders,
  getOrderHistory,
  closePosition,
  // Fast scalping - ultra-low latency
  fastEntry,
  fastExit,
};
