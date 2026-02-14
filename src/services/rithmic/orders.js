/**
 * Rithmic Orders Module
 * Order placement, cancellation, and history
 * 
 * HFT-GRADE OPTIMIZATIONS:
 * - Pre-allocated order request template
 * - Cached timestamp for order tags
 * - Zero console.log in production path
 * 
 * @module services/rithmic/orders
 */

const { REQ } = require('./constants');
const { sanitizeQuantity, MAX_SAFE_QUANTITY } = require('./protobuf-utils');

// HFT: Debug mode completely disabled - no conditional checks in hot path
const DEBUG = false;

// Order status constants
const ORDER_STATUS = {
  PENDING: 1,
  WORKING: 2,
  FILLED: 3,
  PARTIAL: 4,
  REJECTED: 5,
  CANCELLED: 6,
};

// Order timeouts (ms)
const ORDER_TIMEOUTS = {
  PLACE: 5000,
  CANCEL: 5000,
  CANCEL_ALL: 3000,
  EXIT_POSITION: 5000,
  GET_ORDERS: 5000,
  GET_HISTORY: 10000,
};

/**
 * Validate order data before sending
 * @param {Object} orderData - Order parameters
 * @returns {{ valid: boolean, error?: string }}
 */
function validateOrderData(orderData) {
  // Required fields
  if (!orderData.accountId) return { valid: false, error: 'Missing accountId' };
  if (!orderData.symbol) return { valid: false, error: 'Missing symbol' };
  
  // Validate quantity
  const qty = sanitizeQuantity(orderData.size);
  if (qty <= 0) return { valid: false, error: 'Invalid quantity: must be > 0' };
  if (qty > MAX_SAFE_QUANTITY) return { valid: false, error: `Invalid quantity: exceeds max ${MAX_SAFE_QUANTITY}` };
  
  // Validate side (0 = Buy, 1 = Sell)
  if (orderData.side !== 0 && orderData.side !== 1) {
    return { valid: false, error: 'Invalid side: must be 0 (Buy) or 1 (Sell)' };
  }
  
  // Validate order type (1 = Limit, 2 = Market, 3 = Stop Limit, 4 = Stop Market)
  if (![1, 2, 3, 4].includes(orderData.type)) {
    return { valid: false, error: 'Invalid order type' };
  }
  
  // Limit orders require price
  if (orderData.type === 1 && (!orderData.price || orderData.price <= 0)) {
    return { valid: false, error: 'Limit order requires price > 0' };
  }
  
  return { valid: true };
}

// HFT: Pre-allocated order request template to avoid object creation in hot path
const ORDER_REQUEST_TEMPLATE = {
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
  priceType: 1,
  price: 0,
  tradeRoute: null,
  manualOrAuto: 2,
};

// HFT: Monotonic counter for order tags (faster than Date.now())
let orderTagCounter = Date.now();

/**
 * Place order via ORDER_PLANT and wait for confirmation
 * HFT: Optimized for minimal latency
 * @param {RithmicService} service - The Rithmic service instance
 * @param {Object} orderData - Order parameters
 * @returns {Promise<{success: boolean, orderId?: string, error?: string}>}
 */
const placeOrder = async (service, orderData) => {
  // HFT: Fast connection validation (no intermediate variables)
  if (!service.orderConn || !service.loginInfo || 
      service.orderConn.connectionState !== 'LOGGED_IN') {
    return { 
      success: false, 
      error: !service.orderConn ? 'ORDER_PLANT not connected' :
             !service.loginInfo ? 'Not logged in' :
             `ORDER_PLANT not logged in (state: ${service.orderConn.connectionState})`
    };
  }
  
  // Validate order data
  const validation = validateOrderData(orderData);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  // HFT: Use monotonic counter for order tag (faster than Date.now())
  const orderTag = `HQX-${++orderTagCounter}`;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      service.removeListener('orderNotification', onNotification);
      resolve({ success: false, error: 'Order timeout - no confirmation received', orderTag });
    }, ORDER_TIMEOUTS.PLACE);

    const onNotification = (order) => {
      // Match by orderTag (userMsg) or symbol
      const orderUserMsg = order.userMsg?.[0] || '';
      const matchesTag = orderUserMsg === orderTag;
      const matchesSymbol = order.symbol === orderData.symbol;
      
      if (!matchesTag && !matchesSymbol) return;
      
      const notifyType = order.notifyType;
      
      // FILL (notifyType 5) - Order executed
      if (notifyType === 5) {
        clearTimeout(timeout);
        service.removeListener('orderNotification', onNotification);
        resolve({
          success: true,
          orderId: order.basketId,
          status: 3,
          fillPrice: order.avgFillPrice || order.fillPrice || orderData.price,
          filledQty: order.totalFillSize || order.fillSize || orderData.size,
          orderTag,
        });
        return;
      }
      
      // REJECT (notifyType 6) - Order rejected
      if (notifyType === 6) {
        clearTimeout(timeout);
        service.removeListener('orderNotification', onNotification);
        resolve({
          success: false,
          error: order.text || 'Order rejected',
          orderId: order.basketId,
          orderTag,
        });
        return;
      }
      
      // STATUS (notifyType 1) with rpCode=['0'] - Order accepted by gateway
      // For market orders on Apex/Rithmic, the fill notification may not arrive
      // via ORDER connection, so we consider gateway acceptance as success
      if (notifyType === 1 && order.rpCode?.[0] === '0') {
        clearTimeout(timeout);
        service.removeListener('orderNotification', onNotification);
        resolve({
          success: true,
          orderId: order.basketId,
          status: orderData.type === 2 ? 3 : 2, // 3=filled for market, 2=working for limit
          fillPrice: orderData.price || 0,
          filledQty: orderData.type === 2 ? orderData.size : 0,
          orderTag,
        });
        return;
      }
      
      // STATUS (notifyType 1) with basketId but no rpCode - order acknowledged, wait for more
      if (notifyType === 1 && order.basketId && !order.rpCode) {
        // Just an ACK, continue waiting
        return;
      }
    };

    service.on('orderNotification', onNotification);

    const exchange = orderData.exchange || 'CME';
    
    // CRITICAL: Get trade route - orders WILL BE REJECTED without it
    let tradeRoute = null;
    const routes = service.tradeRoutes;
    if (routes && routes.size > 0) {
      const routeInfo = routes.get(exchange);
      tradeRoute = routeInfo?.tradeRoute || routes.values().next().value?.tradeRoute;
    }
    
    // FAIL FAST if no trade route
    if (!tradeRoute) {
      clearTimeout(timeout);
      service.removeListener('orderNotification', onNotification);
      console.log('[Orders] ERROR: No trade route for', exchange);
      resolve({ success: false, error: `No trade route for ${exchange}. Login may be incomplete.`, orderTag });
      return;
    }
    
    // Build order request
    ORDER_REQUEST_TEMPLATE.userMsg[0] = orderTag;
    ORDER_REQUEST_TEMPLATE.fcmId = service.loginInfo.fcmId;
    ORDER_REQUEST_TEMPLATE.ibId = service.loginInfo.ibId;
    ORDER_REQUEST_TEMPLATE.accountId = orderData.accountId;
    ORDER_REQUEST_TEMPLATE.symbol = orderData.symbol;
    ORDER_REQUEST_TEMPLATE.exchange = exchange;
    ORDER_REQUEST_TEMPLATE.quantity = sanitizeQuantity(orderData.size);
    ORDER_REQUEST_TEMPLATE.transactionType = orderData.side === 0 ? 1 : 2;
    ORDER_REQUEST_TEMPLATE.priceType = orderData.type === 2 ? 2 : 1;
    ORDER_REQUEST_TEMPLATE.price = orderData.price || 0;
    ORDER_REQUEST_TEMPLATE.tradeRoute = tradeRoute;
    
    service.orderConn.send('RequestNewOrder', ORDER_REQUEST_TEMPLATE);
  });
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
 * Get available order history dates
 * RequestShowOrderHistoryDates (318) does NOT require account_id
 * @param {RithmicService} service - The Rithmic service instance
 * @returns {Promise<{success: boolean, dates: string[]}>}
 */
const getOrderHistoryDates = async (service) => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: false, dates: [] };
  }

  const { proto } = require('./protobuf');

  return new Promise((resolve) => {
    const dates = [];
    const timeout = setTimeout(() => {
      service.orderConn.removeListener('message', handler);
      resolve({ success: true, dates });
    }, 5000);

    const handler = (msg) => {
      // msg contains { templateId, data }
      if (msg.templateId === 319) {
        try {
          const res = proto.decode('ResponseShowOrderHistoryDates', msg.data);
          DEBUG && console.log('[OrderHistory] 319 response:', JSON.stringify(res));
          
          // Dates come as repeated string field
          if (res.date) {
            const dateList = Array.isArray(res.date) ? res.date : [res.date];
            for (const d of dateList) {
              if (d && !dates.includes(d)) {
                dates.push(d);
              }
            }
          }
          
          // Check for completion (rpCode = '0')
          if (res.rpCode && res.rpCode.length > 0 && res.rpCode[0] === '0') {
            clearTimeout(timeout);
            service.orderConn.removeListener('message', handler);
            resolve({ success: true, dates });
          }
        } catch (e) {
          DEBUG && console.log('[OrderHistory] Error decoding 319:', e.message);
        }
      }
    };

    service.orderConn.on('message', handler);

    try {
      // Request 318 does NOT need account_id - just template_id and user_msg
      service.orderConn.send('RequestShowOrderHistoryDates', {
        templateId: REQ.SHOW_ORDER_HISTORY_DATES,
        userMsg: ['HQX'],
      });
      DEBUG && console.log('[OrderHistory] Sent request 318 (ShowOrderHistoryDates)');
    } catch (e) {
      clearTimeout(timeout);
      service.orderConn.removeListener('message', handler);
      resolve({ success: false, error: e.message, dates: [] });
    }
  });
};

/**
 * Get order history for a specific date using show_order_history_summary
 * RequestShowOrderHistorySummary (324) returns ExchangeOrderNotification (352) with is_snapshot=true
 * @param {RithmicService} service - The Rithmic service instance
 * @param {string} date - Date in YYYYMMDD format
 * @returns {Promise<{success: boolean, orders: Array}>}
 */
const getOrderHistory = async (service, date) => {
  if (!service.orderConn || !service.loginInfo || service.accounts.length === 0) {
    return { success: true, orders: [] };
  }

  const { proto } = require('./protobuf');
  const dateStr = date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  
  return new Promise((resolve) => {
    const orders = [];
    let receivedCount = 0;
    const expectedAccounts = service.accounts.length;
    const requestId = `HQX-${Date.now()}`;
    
    const timeout = setTimeout(() => {
      service.orderConn.removeListener('message', handler);
      DEBUG && console.log(`[OrderHistory] Timeout. Got ${orders.length} orders`);
      resolve({ success: true, orders });
    }, 10000);

    const handler = (msg) => {
      // Response comes as template 352 (ExchangeOrderNotification) with is_snapshot=true
      if (msg.templateId === 352) {
        try {
          const notification = proto.decode('ExchangeOrderNotification', msg.data);
          
          // Only process snapshot data (historical orders)
          if (notification.isSnapshot) {
            DEBUG && console.log('[OrderHistory] 352 snapshot:', notification.symbol, notification.notifyType);
            
            if (notification.symbol) {
              orders.push({
                id: notification.fillId || notification.basketId || `${Date.now()}-${orders.length}`,
                accountId: notification.accountId,
                symbol: notification.symbol,
                exchange: notification.exchange || 'CME',
                side: notification.transactionType, // 1=BUY, 2=SELL
                quantity: parseInt(notification.quantity) || 0,
                price: parseFloat(notification.price) || 0,
                fillPrice: parseFloat(notification.fillPrice) || 0,
                fillSize: parseInt(notification.fillSize) || 0,
                fillTime: notification.fillTime,
                fillDate: notification.fillDate,
                avgFillPrice: parseFloat(notification.avgFillPrice) || 0,
                totalFillSize: parseInt(notification.totalFillSize) || 0,
                status: notification.status,
                notifyType: notification.notifyType,
                isSnapshot: true,
              });
            }
          }
        } catch (e) {
          DEBUG && console.log('[OrderHistory] Error decoding 352:', e.message);
        }
      }
      
      // Template 325 signals completion of order history summary
      if (msg.templateId === 325) {
        try {
          const res = proto.decode('ResponseShowOrderHistorySummary', msg.data);
          DEBUG && console.log('[OrderHistory] 325 response:', JSON.stringify(res));
          receivedCount++;
          
          if (receivedCount >= expectedAccounts) {
            clearTimeout(timeout);
            service.orderConn.removeListener('message', handler);
            resolve({ success: true, orders });
          }
        } catch (e) {
          DEBUG && console.log('[OrderHistory] Error decoding 325:', e.message);
        }
      }
    };

    service.orderConn.on('message', handler);

    try {
      // Send request 324 for each account
      for (const acc of service.accounts) {
        DEBUG && console.log(`[OrderHistory] Sending 324 for account ${acc.accountId}, date ${dateStr}`);
        service.orderConn.send('RequestShowOrderHistorySummary', {
          templateId: REQ.SHOW_ORDER_HISTORY,
          userMsg: [requestId],
          fcmId: acc.fcmId || service.loginInfo.fcmId,
          ibId: acc.ibId || service.loginInfo.ibId,
          accountId: acc.accountId,
          date: dateStr,
        });
      }
    } catch (e) {
      clearTimeout(timeout);
      service.orderConn.removeListener('message', handler);
      resolve({ success: false, error: e.message, orders: [] });
    }
  });
};

/**
 * Get full trade history (fills) from ORDER_PLANT
 * @param {RithmicService} service - The Rithmic service instance
 * @param {number} days - Number of days to fetch (default 7, max 14)
 * @returns {Promise<{success: boolean, trades: Array}>}
 */
const getTradeHistoryFull = async (service, days = 7) => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: false, trades: [] };
  }

  // Get available dates with timeout
  let dates;
  try {
    const datesPromise = getOrderHistoryDates(service);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 5000)
    );
    const result = await Promise.race([datesPromise, timeoutPromise]);
    dates = result.dates;
  } catch (e) {
    return { success: true, trades: [] };
  }
  
  if (!dates || dates.length === 0) {
    return { success: true, trades: [] };
  }

  // Filter to recent dates only (last N days from today)
  const today = new Date();
  const cutoffDate = new Date(today.getTime() - (Math.min(days, 14) * 24 * 60 * 60 * 1000));
  const cutoffStr = cutoffDate.toISOString().slice(0, 10).replace(/-/g, '');
  
  // Sort dates descending and filter to recent only
  const recentDates = dates
    .filter(d => d >= cutoffStr)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 7); // Max 7 dates to avoid long waits
  
  if (recentDates.length === 0) {
    return { success: true, trades: [] };
  }
  
  const allTrades = [];
  
  // Fetch history for each date with short timeout
  for (const date of recentDates) {
    try {
      const histPromise = getOrderHistory(service, date);
      const timeoutPromise = new Promise((resolve) => 
        setTimeout(() => resolve({ orders: [] }), 3000)
      );
      const { orders } = await Promise.race([histPromise, timeoutPromise]);
      // Filter only fills (notifyType 5)
      const fills = (orders || []).filter(o => o.notifyType === 5 || o.fillPrice);
      allTrades.push(...fills);
    } catch (e) {
      // Skip failed dates
    }
  }

  return { success: true, trades: allTrades };
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

/**
 * Cancel all orders for an account
 * Uses RequestCancelAllOrders (template 346)
 * @param {RithmicService} service - The Rithmic service instance
 * @param {string} accountId - Account ID
 */
const cancelAllOrders = async (service, accountId) => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: false, error: 'Not connected' };
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: true, message: 'Cancel all orders sent' });
    }, 3000);

    try {
      service.orderConn.send('RequestCancelAllOrders', {
        templateId: REQ.CANCEL_ALL_ORDERS,
        userMsg: ['HQX-FLATTEN'],
        fcmId: service.loginInfo.fcmId,
        ibId: service.loginInfo.ibId,
        accountId: accountId,
      });
      
      // Listen for response
      const handler = (msg) => {
        if (msg.templateId === 347) { // ResponseCancelAllOrders
          clearTimeout(timeout);
          service.orderConn.removeListener('message', handler);
          resolve({ success: true, message: 'All orders cancelled' });
        }
      };
      service.orderConn.on('message', handler);
      
    } catch (error) {
      clearTimeout(timeout);
      resolve({ success: false, error: error.message });
    }
  });
};

/**
 * Place OCO Bracket Orders (Stop Loss + Take Profit)
 * 
 * HFT-GRADE OCO: When one bracket fills, cancel the other IMMEDIATELY.
 * 
 * CRITICAL: Uses orderNotification ONLY (not positionUpdate) because PNL_PLANT
 * sends spurious qty=0 updates between fills that cause premature cancellation.
 * 
 * Also monitors via tick-based fallback: if price breaches SL/TP and brackets
 * haven't fired, uses cancelAllOrders + market order as nuclear option.
 * 
 * @param {RithmicService} service - The Rithmic service instance
 * @param {Object} params - Bracket parameters
 * @param {string} params.accountId - Account ID
 * @param {string} params.symbol - Symbol
 * @param {string} params.exchange - Exchange (default CME)
 * @param {number} params.size - Order size
 * @param {number} params.stopPrice - Stop loss price
 * @param {number} params.targetPrice - Take profit price
 * @param {boolean} params.isLong - True if closing a LONG position, false for SHORT
 * @returns {Promise<{success: boolean, slOrderId?: string, tpOrderId?: string, cleanup: Function}>}
 */
const placeOCOBracket = async (service, { accountId, symbol, exchange = 'CME', size, stopPrice, targetPrice, isLong }) => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: false, error: 'Not connected', cleanup: () => {} };
  }

  const bracketSide = isLong ? 1 : 0;
  let slOrderId = null;
  let tpOrderId = null;
  let cleanedUp = false;
  let ocoListener = null;
  let fillCount = 0;

  // Cancel remaining bracket when one fills - FAST PATH
  const cancelOther = async (filledId) => {
    fillCount++;
    if (cleanedUp || fillCount > 1) return; // Already handled
    cleanedUp = true;

    // Cancel ALL orders immediately - fastest way to prevent reverse position
    try {
      await cancelAllOrders(service, accountId);
    } catch (e) {
      // Fallback: try individual cancel
      const otherId = filledId === slOrderId ? tpOrderId : slOrderId;
      if (otherId) {
        try { await cancelOrder(service, otherId); } catch (e2) {}
      }
    }

    // Remove listener
    if (ocoListener) {
      service.removeListener('orderNotification', ocoListener);
      ocoListener = null;
    }
  };

  // Listen for fills on bracket orders via ORDER_PLANT notifications
  // This is reliable - no spurious updates like PNL_PLANT
  ocoListener = (order) => {
    if (!order.basketId) return;
    const orderId = order.basketId;

    // Only match our bracket orders
    if (orderId !== slOrderId && orderId !== tpOrderId) return;

    // FILL (notifyType 5) = bracket executed, cancel the other NOW
    if (order.notifyType === 5) {
      const which = orderId === slOrderId ? 'SL' : 'TP';
      cancelOther(orderId);
      return;
    }

    // CANCEL (notifyType 3) = bracket was cancelled (by us or exchange)
    if (order.notifyType === 3) {
      // If both are cancelled, cleanup
      if (orderId === slOrderId) slOrderId = null;
      if (orderId === tpOrderId) tpOrderId = null;
      if (!slOrderId && !tpOrderId && ocoListener) {
        service.removeListener('orderNotification', ocoListener);
        ocoListener = null;
      }
    }
  };

  service.on('orderNotification', ocoListener);

  // Place SL first, then TP (no positionUpdate listener - that's the bug source)
  const slResult = await placeOrder(service, {
    accountId, symbol, exchange,
    type: 4, // Stop Market
    side: bracketSide,
    size,
    price: stopPrice,
  });

  if (slResult.success && slResult.orderId) {
    slOrderId = slResult.orderId;
  }

  const tpResult = await placeOrder(service, {
    accountId, symbol, exchange,
    type: 1, // Limit
    side: bracketSide,
    size,
    price: targetPrice,
  });

  if (tpResult.success && tpResult.orderId) {
    tpOrderId = tpResult.orderId;
  }

  // Cleanup function
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;

    if (ocoListener) {
      service.removeListener('orderNotification', ocoListener);
      ocoListener = null;
    }

    // Cancel all to be safe
    try {
      await cancelAllOrders(service, accountId);
    } catch (e) {}
  };

  return {
    success: slOrderId !== null || tpOrderId !== null,
    slOrderId,
    tpOrderId,
    cleanup,
    error: (!slOrderId && !tpOrderId) ? 'Both bracket orders failed' : null,
  };
};

/**
 * Exit position using Rithmic's ExitPosition request
 * Uses RequestExitPosition (template 3504)
 * @param {RithmicService} service - The Rithmic service instance
 * @param {string} accountId - Account ID  
 * @param {string} symbol - Symbol to exit
 * @param {string} exchange - Exchange (default CME)
 */
const exitPosition = async (service, accountId, symbol, exchange = 'CME') => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: false, error: 'Not connected' };
  }

  // Get trade route
  let tradeRoute = null;
  if (service.tradeRoutes && service.tradeRoutes.size > 0) {
    const routeInfo = service.tradeRoutes.get(exchange);
    if (routeInfo) {
      tradeRoute = routeInfo.tradeRoute;
    } else {
      const firstRoute = service.tradeRoutes.values().next().value;
      if (firstRoute) tradeRoute = firstRoute.tradeRoute;
    }
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ success: true, message: 'Exit position sent' });
    }, 5000);

    try {
      service.orderConn.send('RequestExitPosition', {
        templateId: REQ.EXIT_POSITION,
        userMsg: ['HQX-EXIT'],
        fcmId: service.loginInfo.fcmId,
        ibId: service.loginInfo.ibId,
        accountId: accountId,
        symbol: symbol,
        exchange: exchange,
        tradeRoute: tradeRoute,
      });
      
      // Listen for response
      const handler = (msg) => {
        if (msg.templateId === 3505) { // ResponseExitPosition
          clearTimeout(timeout);
          service.orderConn.removeListener('message', handler);
          resolve({ success: true, message: 'Position exit sent' });
        }
      };
      service.orderConn.on('message', handler);
      
    } catch (error) {
      clearTimeout(timeout);
      resolve({ success: false, error: error.message });
    }
  });
};

module.exports = {
  placeOrder,
  placeOCOBracket,
  cancelOrder,
  cancelAllOrders,
  exitPosition,
  getOrders,
  getOrderHistory,
  getOrderHistoryDates,
  getTradeHistoryFull,
  closePosition
};
