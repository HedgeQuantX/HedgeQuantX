/**
 * @fileoverview Daemon Message Handlers
 * @module services/daemon/handlers
 * 
 * Handlers for all daemon IPC messages.
 * Extracted from server.js to keep files under 500 lines.
 * 
 * NO MOCK DATA - All data from real Rithmic API
 */

'use strict';

const { MSG_TYPE } = require('./constants');
const { createMessage } = require('./protocol');
const { logger } = require('../../utils/logger');

const log = logger.scope('DaemonHandlers');

/**
 * Create handlers bound to a daemon server instance
 * @param {Object} daemon - DaemonServer instance
 * @returns {Object} Handler functions
 */
function createHandlers(daemon) {
  
  // ==================== AUTH HANDLERS ====================
  
  async function handleLogin(socket, id, data) {
    const { propfirmKey, username, password } = data;
    
    if (!propfirmKey || !username || !password) {
      daemon._send(socket, createMessage(MSG_TYPE.LOGIN_RESULT, {
        success: false,
        error: 'Missing credentials',
      }, id));
      return;
    }
    
    // Lazy load RithmicService
    const { RithmicService } = require('../rithmic');
    
    // Disconnect existing connection if any
    if (daemon.rithmic) {
      try {
        await daemon.rithmic.disconnect();
      } catch (_) {}
    }
    
    daemon.rithmic = new RithmicService(propfirmKey);
    
    // Set up event forwarding to all clients
    setupRithmicEvents(daemon);
    
    const result = await daemon.rithmic.login(username, password);
    
    if (result.success) {
      daemon.propfirm = {
        key: propfirmKey,
        name: daemon.rithmic.propfirm.name,
      };
      
      // Save session for restore
      const { storage } = require('../session');
      storage.save([{
        type: 'rithmic',
        propfirm: daemon.propfirm.name,
        propfirmKey,
        credentials: { username, password },
        accounts: daemon.rithmic.accounts,
      }]);
      
      log.info('Login successful', { propfirm: daemon.propfirm.name, accounts: result.accounts?.length });
    } else {
      daemon.rithmic = null;
      daemon.propfirm = null;
    }
    
    daemon._send(socket, createMessage(MSG_TYPE.LOGIN_RESULT, {
      success: result.success,
      error: result.error || null,
      propfirm: daemon.propfirm,
      accounts: result.accounts || [],
    }, id));
  }
  
  async function handleRestoreSession(socket, id) {
    const { storage } = require('../session');
    const sessions = storage.load();
    const rithmicSession = sessions.find(s => s.type === 'rithmic' && s.credentials);
    
    if (!rithmicSession) {
      daemon._send(socket, createMessage(MSG_TYPE.LOGIN_RESULT, {
        success: false,
        error: 'No saved session',
      }, id));
      return;
    }
    
    const { propfirmKey, credentials, accounts } = rithmicSession;
    const { RithmicService } = require('../rithmic');
    
    daemon.rithmic = new RithmicService(propfirmKey);
    setupRithmicEvents(daemon);
    
    const result = await daemon.rithmic.login(
      credentials.username,
      credentials.password,
      { skipFetchAccounts: !!accounts, cachedAccounts: accounts }
    );
    
    if (result.success) {
      daemon.propfirm = {
        key: propfirmKey,
        name: daemon.rithmic.propfirm.name,
      };
      log.info('Session restored', { propfirm: daemon.propfirm.name });
    } else {
      daemon.rithmic = null;
      daemon.propfirm = null;
    }
    
    daemon._send(socket, createMessage(MSG_TYPE.LOGIN_RESULT, {
      success: result.success,
      error: result.error || null,
      propfirm: daemon.propfirm,
      accounts: result.accounts || [],
      restored: true,
    }, id));
  }
  
  async function handleLogout(socket, id) {
    if (daemon.rithmic) {
      await daemon.rithmic.disconnect();
      daemon.rithmic = null;
      daemon.propfirm = null;
      
      const { storage } = require('../session');
      storage.clear();
    }
    
    daemon._send(socket, createMessage(MSG_TYPE.STATUS, {
      connected: false,
      logout: true,
    }, id));
  }
  
  // ==================== DATA HANDLERS ====================
  
  async function handleGetAccounts(socket, id) {
    if (!daemon.rithmic) {
      daemon._send(socket, createMessage(MSG_TYPE.ACCOUNTS, {
        success: false,
        error: 'Not connected',
        accounts: [],
      }, id));
      return;
    }
    
    const result = await daemon.rithmic.getTradingAccounts();
    daemon._send(socket, createMessage(MSG_TYPE.ACCOUNTS, result, id));
  }
  
  async function handleGetPositions(socket, id) {
    if (!daemon.rithmic) {
      daemon._send(socket, createMessage(MSG_TYPE.POSITIONS, {
        success: false,
        error: 'Not connected',
        positions: [],
      }, id));
      return;
    }
    
    const result = await daemon.rithmic.getPositions();
    daemon._send(socket, createMessage(MSG_TYPE.POSITIONS, result, id));
  }
  
  async function handleGetOrders(socket, id) {
    if (!daemon.rithmic) {
      daemon._send(socket, createMessage(MSG_TYPE.ORDERS, {
        success: false,
        error: 'Not connected',
        orders: [],
      }, id));
      return;
    }
    
    const result = await daemon.rithmic.getOrders();
    daemon._send(socket, createMessage(MSG_TYPE.ORDERS, result, id));
  }
  
  async function handleGetPnL(socket, id, data) {
    if (!daemon.rithmic) {
      daemon._send(socket, createMessage(MSG_TYPE.PNL, {
        success: false,
        error: 'Not connected',
      }, id));
      return;
    }
    
    const { accountId } = data || {};
    const pnl = accountId 
      ? daemon.rithmic.getAccountPnL(accountId)
      : null;
    
    daemon._send(socket, createMessage(MSG_TYPE.PNL, {
      success: true,
      pnl,
    }, id));
  }
  
  // ==================== TRADING HANDLERS ====================
  
  async function handlePlaceOrder(socket, id, data) {
    if (!daemon.rithmic) {
      daemon._send(socket, createMessage(MSG_TYPE.ORDER_RESULT, {
        success: false,
        error: 'Not connected',
      }, id));
      return;
    }
    
    const result = await daemon.rithmic.placeOrder(data);
    daemon._send(socket, createMessage(MSG_TYPE.ORDER_RESULT, result, id));
  }
  
  async function handleCancelOrder(socket, id, data) {
    if (!daemon.rithmic) {
      daemon._send(socket, createMessage(MSG_TYPE.ORDER_RESULT, {
        success: false,
        error: 'Not connected',
      }, id));
      return;
    }
    
    const result = await daemon.rithmic.cancelOrder(data.orderId);
    daemon._send(socket, createMessage(MSG_TYPE.ORDER_RESULT, result, id));
  }
  
  async function handleCancelAll(socket, id, data) {
    if (!daemon.rithmic) {
      daemon._send(socket, createMessage(MSG_TYPE.ORDER_RESULT, {
        success: false,
        error: 'Not connected',
      }, id));
      return;
    }
    
    const result = await daemon.rithmic.cancelAllOrders(data.accountId);
    daemon._send(socket, createMessage(MSG_TYPE.ORDER_RESULT, result, id));
  }
  
  async function handleClosePosition(socket, id, data) {
    if (!daemon.rithmic) {
      daemon._send(socket, createMessage(MSG_TYPE.ORDER_RESULT, {
        success: false,
        error: 'Not connected',
      }, id));
      return;
    }
    
    const result = await daemon.rithmic.closePosition(data.accountId, data.symbol);
    daemon._send(socket, createMessage(MSG_TYPE.ORDER_RESULT, result, id));
  }
  
  // ==================== CONTRACT HANDLERS ====================
  
  async function handleGetContracts(socket, id) {
    if (!daemon.rithmic) {
      daemon._send(socket, createMessage(MSG_TYPE.CONTRACTS, {
        success: false,
        error: 'Not connected',
        contracts: [],
      }, id));
      return;
    }
    
    const result = await daemon.rithmic.getContracts();
    daemon._send(socket, createMessage(MSG_TYPE.CONTRACTS, result, id));
  }
  
  async function handleSearchContracts(socket, id, data) {
    if (!daemon.rithmic) {
      daemon._send(socket, createMessage(MSG_TYPE.CONTRACTS, {
        success: false,
        error: 'Not connected',
        contracts: [],
      }, id));
      return;
    }
    
    const result = await daemon.rithmic.searchContracts(data.search);
    daemon._send(socket, createMessage(MSG_TYPE.CONTRACTS, result, id));
  }
  
  // ==================== MARKET DATA HANDLERS ====================
  
  async function handleSubscribeMarket(socket, id, data) {
    daemon._send(socket, createMessage(MSG_TYPE.STATUS, {
      success: true,
      subscribed: data.symbol,
    }, id));
  }
  
  async function handleUnsubscribeMarket(socket, id, data) {
    daemon._send(socket, createMessage(MSG_TYPE.STATUS, {
      success: true,
      unsubscribed: data.symbol,
    }, id));
  }
  
  // ==================== ALGO HANDLERS ====================
  
  async function handleStartAlgo(socket, id, data) {
    daemon._send(socket, createMessage(MSG_TYPE.ALGO_STATUS, {
      success: false,
      error: 'Algo trading in daemon not yet implemented',
    }, id));
  }
  
  async function handleStopAlgo(socket, id, data) {
    daemon._send(socket, createMessage(MSG_TYPE.ALGO_STATUS, {
      success: false,
      error: 'Algo trading in daemon not yet implemented',
    }, id));
  }
  
  return {
    handleLogin,
    handleRestoreSession,
    handleLogout,
    handleGetAccounts,
    handleGetPositions,
    handleGetOrders,
    handleGetPnL,
    handlePlaceOrder,
    handleCancelOrder,
    handleCancelAll,
    handleClosePosition,
    handleGetContracts,
    handleSearchContracts,
    handleSubscribeMarket,
    handleUnsubscribeMarket,
    handleStartAlgo,
    handleStopAlgo,
  };
}

/**
 * Setup Rithmic event forwarding to all clients
 * @param {Object} daemon - DaemonServer instance
 */
function setupRithmicEvents(daemon) {
  if (!daemon.rithmic) return;
  
  // Forward order updates to all clients
  daemon.rithmic.on('orderUpdate', (order) => {
    daemon._broadcast(createMessage(MSG_TYPE.EVENT_ORDER_UPDATE, order));
  });
  
  // Forward position updates
  daemon.rithmic.on('positionUpdate', (position) => {
    daemon._broadcast(createMessage(MSG_TYPE.EVENT_POSITION_UPDATE, position));
  });
  
  // Forward P&L updates
  daemon.rithmic.on('pnlUpdate', (pnl) => {
    daemon._broadcast(createMessage(MSG_TYPE.EVENT_PNL_UPDATE, pnl));
  });
  
  // Forward fills
  daemon.rithmic.on('fill', (fill) => {
    daemon._broadcast(createMessage(MSG_TYPE.EVENT_FILL, fill));
  });
  
  // Forward disconnect events
  daemon.rithmic.on('disconnected', (info) => {
    daemon._broadcast(createMessage(MSG_TYPE.EVENT_DISCONNECTED, info));
  });
}

module.exports = { createHandlers, setupRithmicEvents };
