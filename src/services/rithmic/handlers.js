/**
 * Rithmic Message Handlers
 * Handles ORDER_PLANT and PNL_PLANT messages
 */

const { proto, decodeAccountPnL, decodeInstrumentPnL } = require('./protobuf');
const { RES, STREAM } = require('./constants');

/**
 * Create ORDER_PLANT message handler
 * @param {RithmicService} service - The Rithmic service instance
 */
const createOrderHandler = (service) => {
  return (msg) => {
    const { templateId, data } = msg;

    switch (templateId) {
      case RES.LOGIN_INFO:
        handleLoginInfo(service, data);
        break;
      case RES.ACCOUNT_LIST:
        handleAccountList(service, data);
        break;
      case RES.TRADE_ROUTES:
        handleTradeRoutes(service, data);
        break;
      case RES.SHOW_ORDERS:
        handleShowOrdersResponse(service, data);
        break;
      case STREAM.EXCHANGE_NOTIFICATION:
        service.emit('exchangeNotification', data);
        break;
      case STREAM.ORDER_NOTIFICATION:
        service.emit('orderNotification', data);
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

    switch (templateId) {
      case RES.PNL_POSITION_SNAPSHOT:
      case RES.PNL_POSITION_UPDATES:
        // OK response, nothing to do
        break;
      case STREAM.ACCOUNT_PNL_UPDATE:
        handleAccountPnLUpdate(service, data);
        break;
      case STREAM.INSTRUMENT_PNL_UPDATE:
        handleInstrumentPnLUpdate(service, data);
        break;
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
    const res = proto.decode('ResponseAccountList', data);
    
    if (res.rpCode?.[0] === '0') {
      // End of list
      service.emit('accountListComplete');
    } else if (res.accountId) {
      const account = {
        fcmId: res.fcmId,
        ibId: res.ibId,
        accountId: res.accountId,
        accountName: res.accountName,
        accountCurrency: res.accountCurrency,
      };
      service.accounts.push(account);
      service.emit('accountReceived', account);
    }
  } catch (e) {
    // Ignore decode errors
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
    if (pnl.accountId) {
      service.accountPnL.set(pnl.accountId, {
        accountBalance: parseFloat(pnl.accountBalance || 0),
        cashOnHand: parseFloat(pnl.cashOnHand || 0),
        marginBalance: parseFloat(pnl.marginBalance || 0),
        openPositionPnl: parseFloat(pnl.openPositionPnl || 0),
        closedPositionPnl: parseFloat(pnl.closedPositionPnl || 0),
        dayPnl: parseFloat(pnl.dayPnl || 0),
      });
      service.emit('pnlUpdate', pnl);
    }
  } catch (e) {
    // Ignore decode errors
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

module.exports = {
  createOrderHandler,
  createPnLHandler
};
