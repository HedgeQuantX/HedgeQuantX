/**
 * Rithmic Orders Module
 * Order placement, cancellation, and history
 */

const { REQ } = require('./constants');

// Debug mode
const DEBUG = process.env.HQX_DEBUG === '1';

/**
 * Place order via ORDER_PLANT and wait for confirmation
 * @param {RithmicService} service - The Rithmic service instance
 * @param {Object} orderData - Order parameters
 */
const placeOrder = async (service, orderData) => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: false, error: 'Not connected' };
  }

  // Generate unique user message for tracking
  const orderTag = `HQX-${Date.now()}`;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      service.removeListener('orderNotification', onNotification);
      resolve({ success: false, error: 'Order timeout - no confirmation received' });
    }, 5000);

    const onNotification = (order) => {
      // Match by symbol and approximate timing
      if (order.symbol === orderData.symbol) {
        clearTimeout(timeout);
        service.removeListener('orderNotification', onNotification);
        
        // Check if order was accepted/filled
        if (order.status === 2 || order.status === 3 || order.notifyType === 15) {
          // Status 2 = Working, 3 = Filled, notifyType 15 = Complete
          resolve({
            success: true,
            orderId: order.basketId,
            status: order.status,
            fillPrice: order.avgFillPrice || orderData.price,
            filledQty: order.totalFillSize || orderData.size,
          });
        } else if (order.status === 5 || order.status === 6) {
          // Status 5 = Rejected, 6 = Cancelled
          resolve({
            success: false,
            error: `Order rejected: status ${order.status}`,
            orderId: order.basketId,
          });
        }
        // Keep listening for other statuses
      }
    };

    service.on('orderNotification', onNotification);

    try {
      service.orderConn.send('RequestNewOrder', {
        templateId: REQ.NEW_ORDER,
        userMsg: [orderTag],
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
    } catch (error) {
      clearTimeout(timeout);
      service.removeListener('orderNotification', onNotification);
      resolve({ success: false, error: error.message });
    }
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

module.exports = {
  placeOrder,
  cancelOrder,
  getOrders,
  getOrderHistory,
  getOrderHistoryDates,
  getTradeHistoryFull,
  closePosition
};
