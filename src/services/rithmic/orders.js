/**
 * Rithmic Orders Module
 * Order placement, cancellation, and history
 */

const { REQ } = require('./constants');

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
 * Get available order history dates
 * @param {RithmicService} service - The Rithmic service instance
 * @returns {Promise<{success: boolean, dates: string[]}>}
 */
const getOrderHistoryDates = async (service) => {
  if (!service.orderConn || !service.loginInfo || service.accounts.length === 0) {
    return { success: false, dates: [] };
  }

  return new Promise((resolve) => {
    const dates = [];
    const timeout = setTimeout(() => {
      service.orderConn.removeListener('message', handler);
      resolve({ success: true, dates });
    }, 5000);

    const handler = (msg) => {
      if (msg.templateId === 319) {
        // ResponseShowOrderHistoryDates returns dates
        if (msg.date) {
          if (Array.isArray(msg.date)) {
            dates.push(...msg.date);
          } else {
            dates.push(msg.date);
          }
        }
        if (msg.rpCode && msg.rpCode[0] === '0') {
          clearTimeout(timeout);
          service.orderConn.removeListener('message', handler);
          resolve({ success: true, dates });
        }
      }
    };

    service.orderConn.on('message', handler);

    try {
      // Send for each account
      for (const acc of service.accounts) {
        service.orderConn.send('RequestShowOrderHistoryDates', {
          templateId: REQ.SHOW_ORDER_HISTORY_DATES,
          userMsg: ['HQX'],
          fcmId: acc.fcmId || service.loginInfo.fcmId,
          ibId: acc.ibId || service.loginInfo.ibId,
          accountId: acc.accountId,
        });
      }
    } catch (e) {
      clearTimeout(timeout);
      service.orderConn.removeListener('message', handler);
      resolve({ success: false, error: e.message, dates: [] });
    }
  });
};

/**
 * Get order history for a specific date using show_order_history_summary
 * @param {RithmicService} service - The Rithmic service instance
 * @param {string} date - Date in YYYYMMDD format
 * @returns {Promise<{success: boolean, orders: Array}>}
 */
const getOrderHistory = async (service, date) => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: true, orders: [] };
  }

  const dateStr = date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  
  return new Promise((resolve) => {
    const orders = [];
    let receivedEnd = false;
    
    const timeout = setTimeout(() => {
      service.removeListener('exchangeNotification', handler);
      resolve({ success: true, orders });
    }, 10000);

    const handler = (notification) => {
      // ExchangeOrderNotification with isSnapshot=true contains history
      if (notification && notification.symbol) {
        orders.push({
          id: notification.fillId || notification.basketId || `${Date.now()}`,
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
          isSnapshot: notification.isSnapshot,
          profitAndLoss: 0, // Will be calculated from fills
          pnl: 0,
        });
      }
      
      // Check for end of snapshot (rpCode = '0')
      if (notification && notification.rpCode && notification.rpCode[0] === '0') {
        receivedEnd = true;
        clearTimeout(timeout);
        service.removeListener('exchangeNotification', handler);
        resolve({ success: true, orders });
      }
    };

    service.on('exchangeNotification', handler);

    try {
      // Use template 324 (RequestShowOrderHistorySummary) 
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
      
      // Wait for responses
      setTimeout(() => {
        if (!receivedEnd) {
          clearTimeout(timeout);
          service.removeListener('exchangeNotification', handler);
          resolve({ success: true, orders });
        }
      }, 5000);
    } catch (e) {
      clearTimeout(timeout);
      service.removeListener('exchangeNotification', handler);
      resolve({ success: false, error: e.message, orders: [] });
    }
  });
};

/**
 * Get full trade history for multiple dates
 * @param {RithmicService} service - The Rithmic service instance
 * @param {number} days - Number of days to fetch (default 30)
 * @returns {Promise<{success: boolean, trades: Array}>}
 */
const getTradeHistoryFull = async (service, days = 30) => {
  if (!service.orderConn || !service.loginInfo) {
    return { success: false, trades: [] };
  }

  // Get available dates
  const { dates } = await getOrderHistoryDates(service);
  if (!dates || dates.length === 0) {
    return { success: true, trades: [] };
  }

  // Sort dates descending and limit to requested days
  const sortedDates = dates.sort((a, b) => b.localeCompare(a)).slice(0, days);
  
  const allTrades = [];
  
  // Fetch history for each date
  for (const date of sortedDates) {
    const { orders } = await getOrderHistory(service, date);
    // Filter only fills (notifyType 5)
    const fills = orders.filter(o => o.notifyType === 5 || o.fillPrice);
    allTrades.push(...fills);
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
