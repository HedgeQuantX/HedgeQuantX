/**
 * @fileoverview Tradovate Service - Main service for Tradovate prop firm connections
 * @module services/tradovate
 * 
 * STRICT RULE: Display ONLY values returned by API. No estimation, no simulation.
 */

const crypto = require('crypto');
const os = require('os');
const EventEmitter = require('events');
const { request } = require('../../utils/http');
const { TIMEOUTS } = require('../../config/settings');
const { TRADOVATE_URLS, API_PATHS, getBaseUrl, getTradingWebSocketUrl } = require('./constants');
const { checkMarketHours, isDST } = require('./market');
const { connectWebSocket, wsSend, disconnectWebSocket } = require('./websocket');
const { logger } = require('../../utils/logger');

const log = logger.scope('Tradovate');

/** PropFirm configurations */
const PROPFIRM_CONFIGS = {
  apex_tradovate: { name: 'Apex (Tradovate)', isDemo: false },
  takeprofittrader: { name: 'TakeProfitTrader', isDemo: false },
  myfundedfutures: { name: 'MyFundedFutures', isDemo: false },
};

/**
 * Tradovate Service for prop firm trading
 */
class TradovateService extends EventEmitter {
  /**
   * @param {string} propfirmKey - PropFirm identifier
   */
  constructor(propfirmKey) {
    super();
    this.propfirmKey = propfirmKey;
    this.propfirm = PROPFIRM_CONFIGS[propfirmKey] || { name: propfirmKey, isDemo: false };
    
    // Auth
    this.accessToken = null;
    this.mdAccessToken = null;
    this.userId = null;
    this.tokenExpiration = null;
    
    // State
    this.accounts = [];
    this.user = null;
    this.isDemo = true;
    this.credentials = null;
    
    // WebSocket
    this.ws = null;
    this.wsRequestId = 1;
    this.renewalTimer = null;
    
    // Device ID cache
    this._deviceId = null;
  }

  // ==================== AUTH ====================

  /**
   * Login to Tradovate
   * @param {string} username - Username
   * @param {string} password - Password
   * @param {Object} [options] - Additional options (cid, sec)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async login(username, password, options = {}) {
    try {
      const authData = {
        name: username,
        password,
        appId: 'HQX-CLI',
        appVersion: '2.0.0',
        deviceId: this._getDeviceId(),
      };

      if (options.cid) authData.cid = options.cid;
      if (options.sec) authData.sec = options.sec;

      const result = await this._request(API_PATHS.AUTH_TOKEN_REQUEST, 'POST', authData);

      if (result.data.errorText) {
        log.warn('Login failed', { error: result.data.errorText });
        return { success: false, error: result.data.errorText };
      }

      if (!result.data.accessToken) {
        return { success: false, error: 'No access token received' };
      }

      this.accessToken = result.data.accessToken;
      this.mdAccessToken = result.data.mdAccessToken;
      this.userId = result.data.userId;
      this.tokenExpiration = new Date(result.data.expirationTime);
      this.user = { userName: result.data.name, userId: result.data.userId };
      this.credentials = { username, password };

      this._setupTokenRenewal();
      await this._fetchAccounts();

      log.info('Login successful', { accounts: this.accounts.length });
      return { success: true };
    } catch (err) {
      log.error('Login error', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Generate device ID (cached)
   * @private
   */
  _getDeviceId() {
    if (this._deviceId) return this._deviceId;
    
    const data = `${os.hostname()}-${os.platform()}-${os.arch()}-hqx-cli`;
    this._deviceId = crypto.createHash('md5').update(data).digest('hex');
    return this._deviceId;
  }

  /**
   * Setup automatic token renewal
   * @private
   */
  _setupTokenRenewal() {
    if (this.renewalTimer) {
      clearTimeout(this.renewalTimer);
    }

    // Renew 15 minutes before expiration
    const renewInMs = (90 - 15) * 60 * 1000;

    this.renewalTimer = setTimeout(async () => {
      try {
        await this._renewToken();
      } catch (err) {
        log.warn('Token renewal failed', { error: err.message });
      }
    }, renewInMs);
  }

  /**
   * Renew access token
   * @private
   */
  async _renewToken() {
    if (!this.accessToken) return;

    const result = await this._request(API_PATHS.AUTH_RENEW_TOKEN, 'GET');

    if (result.data.accessToken) {
      this.accessToken = result.data.accessToken;
      this.mdAccessToken = result.data.mdAccessToken;
      this.tokenExpiration = new Date(result.data.expirationTime);
      this._setupTokenRenewal();
      log.debug('Token renewed');
    }
  }

  // ==================== ACCOUNTS ====================

  /**
   * Fetch accounts from API
   * @private
   */
  async _fetchAccounts() {
    const result = await this._request(API_PATHS.ACCOUNT_LIST, 'GET');

    if (!Array.isArray(result.data)) {
      return;
    }

    this.accounts = result.data;

    // Fetch cash balance for each account
    for (const acc of this.accounts) {
      try {
        const balanceResult = await this._request(
          API_PATHS.CASH_BALANCE_SNAPSHOT,
          'POST',
          { accountId: acc.id }
        );
        acc.cashBalance = balanceResult.data;
      } catch {
        acc.cashBalance = null;
      }
    }
  }

  /**
   * Get trading accounts with REAL P&L from API
   * @returns {Promise<{success: boolean, accounts: Array}>}
   */
  async getTradingAccounts() {
    if (!this.accounts.length) {
      await this._fetchAccounts();
    }

    const tradingAccounts = this.accounts.map((acc) => {
      const cb = acc.cashBalance || {};

      // ONLY use values from API - null if not available
      const balance = cb.totalCashValue ?? cb.netLiquidatingValue ?? null;
      const realizedPnL = cb.realizedPnL ?? null;
      const openPnL = cb.openPnL ?? null;

      // Total P&L
      let profitAndLoss = null;
      if (cb.totalPnL !== undefined) {
        profitAndLoss = cb.totalPnL;
      } else if (realizedPnL !== null || openPnL !== null) {
        profitAndLoss = (realizedPnL || 0) + (openPnL || 0);
      }

      return {
        accountId: acc.id,
        tradovateAccountId: acc.id,
        accountName: acc.name,
        name: acc.name,
        balance,
        todayPnL: realizedPnL,
        openPnL,
        profitAndLoss,
        startingBalance: null,
        status: acc.active ? 0 : 3,
        platform: 'Tradovate',
        propfirm: this.propfirm.name,
        accountType: acc.accountType,
      };
    });

    return { success: true, accounts: tradingAccounts };
  }

  // ==================== POSITIONS ====================

  /**
   * Get positions for an account
   * @param {number} accountId - Account ID
   * @returns {Promise<Array>}
   */
  async getPositions(accountId) {
    try {
      const result = await this._request(API_PATHS.POSITION_DEPS, 'GET', null, { masterid: accountId });
      return result.data.filter(p => p.netPos !== 0);
    } catch {
      return [];
    }
  }

  // ==================== ORDERS ====================

  /**
   * Get orders
   * @param {number} [accountId] - Optional account filter
   * @returns {Promise<{success: boolean, orders: Array, error?: string}>}
   */
  async getOrders(accountId) {
    try {
      const result = await this._request(API_PATHS.ORDER_LIST, 'GET');
      const orders = Array.isArray(result.data) ? result.data : [];
      
      const filtered = accountId
        ? orders.filter(o => o.accountId === accountId)
        : orders;

      return {
        success: true,
        orders: filtered.map(o => ({
          orderId: o.id,
          accountId: o.accountId,
          symbol: o.contractId,
          side: o.action === 'Buy' ? 0 : 1,
          quantity: o.orderQty,
          filledQuantity: o.filledQty || 0,
          price: o.price,
          status: o.ordStatus === 'Working' ? 1 : (o.ordStatus === 'Filled' ? 2 : 0),
          orderType: o.orderType,
        })),
      };
    } catch (err) {
      return { success: false, error: err.message, orders: [] };
    }
  }

  /**
   * Place an order
   * @param {Object} orderData - Order details
   * @returns {Promise<{success: boolean, orderId?: number, error?: string}>}
   */
  async placeOrder(orderData) {
    try {
      const result = await this._request(API_PATHS.ORDER_PLACE, 'POST', {
        accountId: orderData.accountId,
        action: orderData.side === 0 ? 'Buy' : 'Sell',
        symbol: orderData.symbol,
        orderQty: orderData.size,
        orderType: orderData.type === 2 ? 'Market' : 'Limit',
        price: orderData.price,
        isAutomated: true,
      });

      if (result.data.errorText || result.data.failureReason) {
        return { success: false, error: result.data.errorText || result.data.failureText };
      }

      log.info('Order placed', { orderId: result.data.orderId });
      return { success: true, orderId: result.data.orderId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Cancel an order
   * @param {number} orderId - Order ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async cancelOrder(orderId) {
    try {
      const result = await this._request(API_PATHS.ORDER_CANCEL, 'POST', {
        orderId,
        isAutomated: true,
      });

      if (result.data.errorText) {
        return { success: false, error: result.data.errorText };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Close a position
   * @param {number} accountId - Account ID
   * @param {number} contractId - Contract ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async closePosition(accountId, contractId) {
    try {
      const result = await this._request(API_PATHS.ORDER_LIQUIDATE_POSITION, 'POST', {
        accountId,
        contractId,
        isAutomated: true,
      });

      if (result.data.errorText) {
        return { success: false, error: result.data.errorText };
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==================== TRADES ====================

  /**
   * Get fills/trades
   * @returns {Promise<Array>}
   */
  async getFills() {
    try {
      const result = await this._request(API_PATHS.FILL_LIST, 'GET');
      return result.data || [];
    } catch {
      return [];
    }
  }

  /**
   * Get trade history
   * @param {number} [accountId] - Account filter
   * @param {number} [days=30] - Days of history
   * @returns {Promise<{success: boolean, trades: Array, error?: string}>}
   */
  async getTradeHistory(accountId, days = 30) {
    try {
      const fills = await this.getFills();
      const filtered = accountId
        ? fills.filter(f => f.accountId === accountId)
        : fills;

      return {
        success: true,
        trades: filtered.map(f => ({
          tradeId: f.id,
          accountId: f.accountId,
          symbol: f.contractId,
          side: f.action === 'Buy' ? 0 : 1,
          quantity: f.qty,
          price: f.price,
          timestamp: f.timestamp,
        })),
      };
    } catch (err) {
      return { success: false, error: err.message, trades: [] };
    }
  }

  /**
   * Get order history
   * @param {number} [days=30] - Days of history
   * @returns {Promise<{success: boolean, orders: Array, error?: string}>}
   */
  async getOrderHistory(days = 30) {
    try {
      const result = await this._request(API_PATHS.ORDER_LIST, 'GET');
      return { success: true, orders: result.data || [] };
    } catch (err) {
      return { success: false, error: err.message, orders: [] };
    }
  }

  // ==================== CONTRACTS ====================

  /**
   * Search contracts
   * @param {string} text - Search text
   * @param {number} [limit=10] - Result limit
   * @returns {Promise<Array>}
   */
  async searchContracts(text, limit = 10) {
    try {
      const result = await this._request(API_PATHS.CONTRACT_SUGGEST, 'GET', null, { t: text, l: limit });
      return result.data || [];
    } catch {
      return [];
    }
  }

  // ==================== STUBS ====================

  async getUser() { return this.user; }
  async getLifetimeStats() { return { success: true, stats: null }; }
  async getDailyStats() { return { success: true, stats: [] }; }

  getToken() { return this.accessToken; }

  async getMarketStatus() {
    const hours = checkMarketHours();
    return { success: true, isOpen: hours.isOpen, message: hours.message };
  }

  // ==================== WEBSOCKET ====================

  async connectWebSocket() { return connectWebSocket(this); }
  
  wsSend(url, query = '', body = null) {
    return wsSend(this, url, query, body);
  }

  // ==================== HTTP ====================

  /**
   * Make an HTTP request
   * @private
   */
  async _request(path, method = 'GET', body = null, queryParams = null) {
    const baseUrl = getBaseUrl(this.isDemo);
    let url = `${baseUrl}${path}`;

    if (queryParams) {
      const params = new URLSearchParams(queryParams).toString();
      url += `?${params}`;
    }

    return request(url, {
      method,
      body,
      token: this.accessToken,
      timeout: TIMEOUTS.API_REQUEST,
    });
  }

  // ==================== CLEANUP ====================

  /**
   * Disconnect and cleanup
   */
  async disconnect() {
    if (this.renewalTimer) {
      clearTimeout(this.renewalTimer);
      this.renewalTimer = null;
    }

    disconnectWebSocket(this);

    this.accessToken = null;
    this.mdAccessToken = null;
    this.accounts = [];
    this.user = null;
    this.credentials = null;

    log.info('Disconnected');
  }
}

module.exports = { TradovateService };
