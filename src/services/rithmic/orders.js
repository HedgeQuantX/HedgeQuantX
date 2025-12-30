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
  closePosition
};
