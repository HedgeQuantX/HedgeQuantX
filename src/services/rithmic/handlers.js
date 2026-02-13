/**
 * Rithmic Message Handlers
 * Handles ORDER_PLANT and PNL_PLANT messages
 * 
 * HFT-GRADE OPTIMIZATIONS:
 * - Pre-allocated result objects
 * - Minimal object creation in hot paths
 * - No debug logging in production
 */

const { proto, decodeAccountPnL, decodeInstrumentPnL } = require('./protobuf');
const { RES, STREAM } = require('./constants');
const { sanitizeQuantity } = require('./protobuf-utils');

// HFT: Debug completely disabled - no function call overhead
const DEBUG = false;
const debug = DEBUG ? (...args) => {} : () => {};

// HFT: Pre-allocated objects for hot path handlers
const _pnlDataTemplate = {
  accountBalance: 0,
  cashOnHand: 0,
  marginBalance: 0,
  openPositionPnl: 0,
  closedPositionPnl: 0,
  dayPnl: 0,
};

const _positionTemplate = {
  accountId: '',
  symbol: '',
  exchange: 'CME',
  quantity: 0,
  averagePrice: 0,
  openPnl: 0,
  closedPnl: 0,
  dayPnl: 0,
  isSnapshot: false,
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
 * Stores trade routes in service.tradeRoutes Map keyed by exchange
 */
const handleTradeRoutes = (service, data) => {
  try {
    const res = proto.decode('ResponseTradeRoutes', data);
    debug('Trade routes response:', JSON.stringify(res));
    
    // Store trade route if we have exchange and trade_route
    if (res.exchange && res.tradeRoute) {
      const routeInfo = {
        fcmId: res.fcmId,
        ibId: res.ibId,
        exchange: res.exchange,
        tradeRoute: res.tradeRoute,
        status: res.status,
        isDefault: res.isDefault || false,
      };
      
      // Use exchange as key, prefer default route
      const existing = service.tradeRoutes.get(res.exchange);
      if (!existing || res.isDefault) {
        service.tradeRoutes.set(res.exchange, routeInfo);
        debug('Stored trade route for', res.exchange, ':', res.tradeRoute, res.isDefault ? '(default)' : '');
      }
    }
    
    // Signal completion when rpCode is '0'
    if (res.rpCode?.[0] === '0') {
      debug('Trade routes complete, total:', service.tradeRoutes.size);
      service.emit('tradeRoutesComplete');
    }
    
    service.emit('tradeRoutes', res);
  } catch (e) {
    debug('Error decoding trade routes:', e.message);
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
 * rpCode[0] = '0' means accepted, anything else = rejected by gateway
 */
const handleNewOrderResponse = (service, data) => {
  try {
    const res = proto.decode('ResponseNewOrder', data);
    
    const isAccepted = res.rpCode?.[0] === '0';
    
    // Build rejection reason from rpCode array
    // rpCode is typically ['code', 'message'] or just ['code']
    let rejectReason = null;
    if (!isAccepted) {
      // Try to get the error message from rpCode[1] or rqHandlerRpCode[1]
      const rpMsg = res.rpCode?.slice(1).join(' ') || '';
      const rqMsg = res.rqHandlerRpCode?.slice(1).join(' ') || '';
      rejectReason = rpMsg || rqMsg || null;
      
      // If no message, interpret the code
      if (!rejectReason && res.rpCode?.[0]) {
        const codeMap = {
          '1': 'Invalid request',
          '2': 'Invalid account',
          '3': 'Invalid symbol',
          '4': 'Invalid quantity',
          '5': 'Insufficient buying power',
          '6': 'Market closed',
          '7': 'Order rejected by risk system',
          '8': 'Position limit exceeded',
          '9': 'Rate limit exceeded',
        };
        rejectReason = codeMap[res.rpCode[0]] || `Gateway rejected (code: ${res.rpCode[0]})`;
      }
      
      console.log('[Rithmic] Gateway rejection:', rejectReason, '| rpCode:', res.rpCode, '| rqHandlerRpCode:', res.rqHandlerRpCode);
    }
    
    const order = {
      basketId: res.basketId || null,
      symbol: res.symbol,
      exchange: res.exchange || 'CME',
      notifyType: isAccepted ? 1 : 6, // 1=STATUS (accepted), 6=REJECT
      status: isAccepted ? 2 : 6,
      text: rejectReason,
      rpCode: res.rpCode,
      userMsg: res.userMsg,
    };
    service.emit('orderNotification', order);
    service.emit('newOrderResponse', res);
  } catch (e) {
    console.error('Error decoding ResponseNewOrder:', e.message);
  }
};

/**
 * Handle account PnL update
 * HFT: Optimized for minimal allocations
 */
const handleAccountPnLUpdate = (service, data) => {
  const pnl = decodeAccountPnL(data);
  
  if (pnl.accountId) {
    // HFT: Reuse cached object from Map or create once
    let pnlData = service.accountPnL.get(pnl.accountId);
    if (!pnlData) {
      pnlData = {
        accountBalance: 0,
        cashOnHand: 0,
        marginBalance: 0,
        openPositionPnl: 0,
        closedPositionPnl: 0,
        dayPnl: 0,
      };
      service.accountPnL.set(pnl.accountId, pnlData);
    }
    
    // HFT: Mutate existing object instead of creating new
    pnlData.accountBalance = parseFloat(pnl.accountBalance || 0);
    pnlData.cashOnHand = parseFloat(pnl.cashOnHand || 0);
    pnlData.marginBalance = parseFloat(pnl.marginBalance || 0);
    pnlData.openPositionPnl = parseFloat(pnl.openPositionPnl || 0);
    pnlData.closedPositionPnl = parseFloat(pnl.closedPositionPnl || 0);
    pnlData.dayPnl = parseFloat(pnl.dayPnl || 0);
    
    service.emit('pnlUpdate', pnl);
  }
};

/**
 * Handle instrument PnL update (positions)
 * HFT: Optimized for minimal allocations - reuses position objects
 */
const handleInstrumentPnLUpdate = (service, data) => {
  const pos = decodeInstrumentPnL(data);
  
  if (pos.symbol && pos.accountId) {
    const key = `${pos.accountId}:${pos.symbol}:${pos.exchange || 'CME'}`;
    
    // CRITICAL: Sanitize quantity to prevent overflow (18446744073709552000 bug)
    const rawQty = pos.netQuantity || pos.openPositionQuantity || ((pos.buyQty || 0) - (pos.sellQty || 0));
    const netQty = sanitizeQuantity(rawQty);
    
    if (netQty !== 0) {
      // HFT: Reuse existing position object or create once
      let position = service.positions.get(key);
      if (!position) {
        position = {
          accountId: '',
          symbol: '',
          exchange: 'CME',
          quantity: 0,
          averagePrice: 0,
          openPnl: 0,
          closedPnl: 0,
          dayPnl: 0,
          isSnapshot: false,
        };
        service.positions.set(key, position);
      }
      
      // HFT: Mutate existing object
      position.accountId = pos.accountId;
      position.symbol = pos.symbol;
      position.exchange = pos.exchange || 'CME';
      position.quantity = netQty;
      position.averagePrice = pos.avgOpenFillPrice || 0;
      position.openPnl = parseFloat(pos.openPositionPnl || pos.dayOpenPnl || 0);
      position.closedPnl = parseFloat(pos.closedPositionPnl || pos.dayClosedPnl || 0);
      position.dayPnl = parseFloat(pos.dayPnl || 0);
      position.isSnapshot = pos.isSnapshot || false;
      
      service.emit('positionUpdate', position);
    } else {
      service.positions.delete(key);
    }
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
 * NotifyType: 1=STATUS, 2=MODIFY, 3=CANCEL, 4=TRIGGER, 5=FILL, 6=REJECT
 */
const handleExchangeNotification = (service, data) => {
  try {
    const res = proto.decode('ExchangeOrderNotification', data);
    debug('Exchange notification:', res.notifyType, res.symbol, res.status);
    
    // Build rejection text from available fields
    // Priority: text > reportText > remarks > status code interpretation
    let rejectText = res.text || res.reportText || res.remarks || null;
    if (!rejectText && res.notifyType === 6) {
      // Map common Rithmic status codes to human-readable messages
      const statusMap = {
        '1': 'Order pending',
        '2': 'Order working',
        '3': 'Order filled',
        '4': 'Order partially filled',
        '5': 'Order rejected by exchange',
        '6': 'Order cancelled',
        '7': 'Order expired',
        '8': 'Order suspended',
      };
      rejectText = statusMap[res.status] || `Exchange rejected (code: ${res.status || 'unknown'})`;
      console.log('[Rithmic] Exchange rejection:', rejectText, '| status:', res.status, '| symbol:', res.symbol);
    }
    
    // Emit orderNotification for placeOrder listener
    // This is critical for order tracking
    const orderNotif = {
      basketId: res.basketId,
      accountId: res.accountId,
      symbol: res.symbol,
      exchange: res.exchange || 'CME',
      notifyType: res.notifyType, // 1=STATUS, 5=FILL, 6=REJECT
      status: res.notifyType === 5 ? 3 : res.notifyType === 6 ? 6 : 2,
      fillPrice: res.fillPrice ? parseFloat(res.fillPrice) : null,
      fillSize: res.fillSize ? parseInt(res.fillSize) : null,
      avgFillPrice: res.avgFillPrice ? parseFloat(res.avgFillPrice) : null,
      totalFillSize: res.totalFillSize ? parseInt(res.totalFillSize) : null,
      confirmedSize: res.confirmedSize ? parseInt(res.confirmedSize) : null,
      text: rejectText,
      userMsg: res.userTag ? [res.userTag] : null,
    };
    service.emit('orderNotification', orderNotif);
    
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
