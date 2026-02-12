/**
 * Rithmic Message Handlers
 * Handles ORDER_PLANT and PNL_PLANT messages
 */

const { proto, decodeAccountPnL, decodeInstrumentPnL } = require('./protobuf');
const { RES, STREAM } = require('./constants');

// Debug mode
const DEBUG = process.env.HQX_DEBUG === '1';
const debug = (...args) => DEBUG && console.log('[Rithmic:Handler]', ...args);

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
      case RES.ACCOUNT_RMS:
        debug('Handling ACCOUNT_RMS (305)');
        handleAccountRmsInfo(service, data);
        break;
      case RES.TRADE_ROUTES:
        handleTradeRoutes(service, data);
        break;
      case RES.SHOW_ORDERS:
        handleShowOrdersResponse(service, data);
        break;
      case RES.NEW_ORDER:
        handleNewOrderResponse(service, data);
        break;
      case STREAM.EXCHANGE_NOTIFICATION:
        handleExchangeNotification(service, data);
        break;
      case STREAM.ORDER_NOTIFICATION:
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
 * Handle new order response (template 313)
 */
const handleNewOrderResponse = (service, data) => {
  try {
    const res = proto.decode('ResponseNewOrder', data);
    debug('New order response:', JSON.stringify(res));
    
    // Emit as orderNotification for the placeOrder listener
    if (res.basketId || res.orderId) {
      const order = {
        basketId: res.basketId || res.orderId,
        accountId: res.accountId,
        symbol: res.symbol,
        exchange: res.exchange || 'CME',
        status: res.rpCode?.[0] === '0' ? 2 : 5, // 2=Working, 5=Rejected
        notifyType: res.rpCode?.[0] === '0' ? 1 : 0, // 1=Accepted
        rpCode: res.rpCode,
        userMsg: res.userMsg,
      };
      service.emit('orderNotification', order);
    }
    
    // Also emit specific event
    service.emit('newOrderResponse', res);
  } catch (e) {
    debug('Error decoding ResponseNewOrder:', e.message);
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
 * Handle account RMS info response (status, limits, etc.)
 */
const handleAccountRmsInfo = (service, data) => {
  try {
    const res = proto.decode('ResponseAccountRmsInfo', data);
    debug('Decoded Account RMS Info:', JSON.stringify(res));
    
    if (res.accountId) {
      const rmsInfo = {
        accountId: res.accountId,
        status: res.status || null,
        currency: res.currency || null,
        algorithm: res.algorithm || null,
        lossLimit: res.lossLimit || null,
        minAccountBalance: res.minAccountBalance || null,
        minMarginBalance: res.minMarginBalance || null,
        buyLimit: res.buyLimit || null,
        sellLimit: res.sellLimit || null,
        maxOrderQuantity: res.maxOrderQuantity || null,
        autoLiquidate: res.autoLiquidate || null,
        autoLiquidateThreshold: res.autoLiquidateThreshold || null,
      };
      debug('Account RMS Info for', res.accountId, ':', rmsInfo);
      
      // Store RMS info in service
      if (!service.accountRmsInfo) service.accountRmsInfo = new Map();
      service.accountRmsInfo.set(res.accountId, rmsInfo);
      
      service.emit('accountRmsInfoReceived', rmsInfo);
    } else if (res.rpCode?.[0] === '0') {
      debug('Account RMS Info complete signal');
      service.emit('accountRmsInfoComplete');
    }
  } catch (e) {
    debug('Error decoding Account RMS Info:', e.message);
  }
};

/**
 * Handle exchange order notification (fills/trades)
 * NotifyType: 5 = FILL
 */
const handleExchangeNotification = (service, data) => {
  try {
    const res = proto.decode('ExchangeOrderNotification', data);
    debug('Exchange notification:', res.notifyType, res.symbol);
    
    // notifyType 5 = FILL (trade executed)
    if (res.notifyType === 5 && res.fillPrice && res.fillSize) {
      const trade = {
        id: res.fillId || `${Date.now()}-${res.basketId}`,
        accountId: res.accountId,
        symbol: res.symbol,
        exchange: res.exchange || 'CME',
        side: res.transactionType, // 1=BUY, 2=SELL
        price: parseFloat(res.fillPrice),
        size: parseInt(res.fillSize),
        fillTime: res.fillTime,
        fillDate: res.fillDate,
        basketId: res.basketId,
        avgFillPrice: parseFloat(res.avgFillPrice || res.fillPrice),
        totalFillSize: parseInt(res.totalFillSize || res.fillSize),
        timestamp: Date.now(),
        ssboe: res.ssboe,
        usecs: res.usecs,
      };
      
      debug('Trade (fill) captured:', trade.symbol, trade.side === 1 ? 'BUY' : 'SELL', trade.size, '@', trade.price);
      
      // Store in trades history
      if (!service.trades) service.trades = [];
      service.trades.push(trade);
      
      // Keep max 1000 trades in memory
      if (service.trades.length > 1000) {
        service.trades = service.trades.slice(-1000);
      }
      
      service.emit('trade', trade);
    }
    
    service.emit('exchangeNotification', res);
  } catch (e) {
    debug('Error decoding ExchangeOrderNotification:', e.message);
  }
};

/**
 * Handle Rithmic order notification
 */
const handleOrderNotification = (service, data) => {
  try {
    const res = proto.decode('RithmicOrderNotification', data);
    debug('Order notification:', res.notifyType, res.symbol, res.status);
    
    // Track order status changes
    if (res.basketId) {
      const order = {
        basketId: res.basketId,
        accountId: res.accountId,
        symbol: res.symbol,
        exchange: res.exchange || 'CME',
        side: res.transactionType,
        quantity: res.quantity,
        price: res.price,
        status: res.status,
        notifyType: res.notifyType,
        avgFillPrice: res.avgFillPrice,
        totalFillSize: res.totalFillSize,
        totalUnfilledSize: res.totalUnfilledSize,
        timestamp: Date.now(),
      };
      
      service.emit('orderNotification', order);
      
      // If order is complete (notifyType 15), calculate P&L
      if (res.notifyType === 15 && res.avgFillPrice) {
        debug('Order complete:', res.basketId, 'avg fill:', res.avgFillPrice);
      }
    }
  } catch (e) {
    debug('Error decoding RithmicOrderNotification:', e.message);
  }
};

module.exports = {
  createOrderHandler,
  createPnLHandler
};
