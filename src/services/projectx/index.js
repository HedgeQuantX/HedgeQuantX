/**
 * @fileoverview ProjectX API Service
 * @module services/projectx
 * 
 * STRICT RULE: Display ONLY values returned by API. No estimation, no simulation.
 */

const { request } = require('../../utils/http');
const { PROPFIRMS } = require('../../config');
const { TIMEOUTS, DEBUG } = require('../../config/settings');
const { getLimiter } = require('../../security/rateLimit');
const {
  validateUsername,
  validatePassword,
  validateApiKey,
  validateAccountId,
  sanitizeString,
  maskSensitive,
} = require('../../security');
const { getMarketHolidays, checkHoliday, checkMarketHours } = require('./market');
const { calculateLifetimeStats, calculateDailyPnL, formatTrades } = require('./stats');
const { logger } = require('../../utils/logger');

const log = logger.scope('ProjectX');

/**
 * ProjectX API Service for prop firm connections
 */
class ProjectXService {
  /**
   * @param {string} [propfirmKey='topstep'] - PropFirm identifier
   */
  constructor(propfirmKey = 'topstep') {
    this.propfirm = PROPFIRMS[propfirmKey] || PROPFIRMS.topstep;
    this.propfirmKey = propfirmKey;
    this.token = null;
    this.user = null;
    this._limiters = {
      api: getLimiter('api'),
      login: getLimiter('login'),
      orders: getLimiter('orders'),
    };
  }

  // ==================== GETTERS ====================
  
  getToken() { return this.token; }
  getPropfirm() { return this.propfirmKey; }

  // ==================== HTTP ====================

  /**
   * Make an API request with rate limiting
   * @private
   */
  async _request(host, path, method = 'GET', data = null, limiterType = 'api') {
    const limiter = this._limiters[limiterType] || this._limiters.api;
    return limiter.execute(() => this._doRequest(host, path, method, data));
  }

  /**
   * Execute the actual HTTP request
   * @private
   */
  async _doRequest(host, path, method, data) {
    const url = `https://${host}${path}`;
    
    try {
      const response = await request(url, {
        method,
        body: data,
        token: this.token,
        timeout: TIMEOUTS.API_REQUEST,
      });
      
      return response;
    } catch (err) {
      log.error('Request failed', { path, error: err.message });
      throw err;
    }
  }

  // ==================== AUTH ====================

  /**
   * Login with username and password
   * @param {string} userName - Username
   * @param {string} password - Password
   * @returns {Promise<{success: boolean, token?: string, error?: string}>}
   */
  async login(userName, password) {
    try {
      validateUsername(userName);
      validatePassword(password, { requireUppercase: false, requireNumber: false });
      
      const response = await this._request(
        this.propfirm.userApi, '/Login', 'POST',
        { userName: sanitizeString(userName), password },
        'login'
      );
      
      if (response.statusCode === 200 && response.data.token) {
        this.token = response.data.token;
        log.info('Login successful', { user: sanitizeString(userName) });
        return { success: true, token: maskSensitive(this.token) };
      }
      
      const error = response.data.errorMessage || 'Invalid credentials';
      log.warn('Login failed', { error });
      return { success: false, error };
    } catch (err) {
      log.error('Login error', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Login with API key
   * @param {string} userName - Username
   * @param {string} apiKey - API key
   * @returns {Promise<{success: boolean, token?: string, error?: string}>}
   */
  async loginWithApiKey(userName, apiKey) {
    try {
      validateUsername(userName);
      validateApiKey(apiKey);
      
      const response = await this._request(
        this.propfirm.userApi, '/Login/key', 'POST',
        { userName: sanitizeString(userName), apiKey },
        'login'
      );
      
      if (response.statusCode === 200 && response.data.token) {
        this.token = response.data.token;
        log.info('API key login successful');
        return { success: true, token: maskSensitive(this.token) };
      }
      
      return { success: false, error: response.data.errorMessage || 'Invalid API key' };
    } catch (err) {
      log.error('API key login error', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Logout and clear token
   */
  logout() {
    this.token = null;
    this.user = null;
    log.debug('Logged out');
  }

  // ==================== USER ====================

  /**
   * Get user information
   * @returns {Promise<{success: boolean, user?: Object, error?: string}>}
   */
  async getUser() {
    try {
      const response = await this._request(this.propfirm.userApi, '/User', 'GET');
      
      if (response.statusCode === 200) {
        this.user = response.data;
        return { success: true, user: response.data };
      }
      
      return { success: false, error: 'Failed to get user info' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==================== ACCOUNTS ====================

  /**
   * Get trading accounts with REAL P&L from API
   * 
   * Data sources:
   * - /TradingAccount: accountId, accountName, balance, status, type
   * - /AccountTemplate/userTemplates: startingBalance
   * - /Position?accountId=X: profitAndLoss (unrealized P&L)
   * 
   * @returns {Promise<{success: boolean, accounts: Array, error?: string}>}
   */
  async getTradingAccounts() {
    try {
      const response = await this._request(this.propfirm.userApi, '/TradingAccount', 'GET');
      
      if (response.statusCode !== 200) {
        return { success: false, accounts: [], error: 'Failed to get accounts' };
      }

      const accounts = Array.isArray(response.data) ? response.data : [];
      
      // Get account templates for startingBalance
      let templates = [];
      try {
        const templateRes = await this._request(this.propfirm.userApi, '/AccountTemplate/userTemplates', 'GET');
        if (templateRes.statusCode === 200 && Array.isArray(templateRes.data)) {
          templates = templateRes.data;
        }
      } catch {
        log.debug('Failed to get templates');
      }

      const enrichedAccounts = await Promise.all(
        accounts.map(account => this._enrichAccount(account, templates))
      );

      return { success: true, accounts: enrichedAccounts };
    } catch (err) {
      log.error('Failed to get accounts', { error: err.message });
      return { success: false, accounts: [], error: err.message };
    }
  }

  /**
   * Enrich account with P&L data
   * @private
   */
  async _enrichAccount(account, templates) {
    const template = templates.find(t =>
      account.accountName && (
        account.accountName.includes(t.title) ||
        t.title.includes(account.accountName)
      )
    );

    const enriched = {
      accountId: account.accountId,
      accountName: account.accountName,
      balance: account.balance,
      status: account.status,
      type: account.type,
      startingBalance: template?.startingBalance || null,
      platform: 'ProjectX',
      propfirm: this.propfirm.name,
      openPnL: null,
      todayPnL: null,
      profitAndLoss: null,
    };

    // Only fetch P&L for active accounts
    if (account.status !== 0) {
      return enriched;
    }

    // Get unrealized P&L from open positions
    let openPnL = 0;
    try {
      const posRes = await this._request(
        this.propfirm.userApi,
        `/Position?accountId=${account.accountId}`,
        'GET'
      );
      
      if (posRes.statusCode === 200 && Array.isArray(posRes.data)) {
        for (const pos of posRes.data) {
          if (pos.profitAndLoss != null) {
            openPnL += pos.profitAndLoss;
          }
        }
      }
    } catch {
      log.debug('Failed to get positions', { accountId: account.accountId });
    }

    // Get realized P&L from today's trades
    let todayPnL = 0;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tradesRes = await this._request(
        this.propfirm.gatewayApi,
        '/api/Trade/search',
        'POST',
        {
          accountId: account.accountId,
          startTimestamp: today.toISOString(),
          endTimestamp: new Date().toISOString(),
        }
      );
      
      if (tradesRes.statusCode === 200) {
        const trades = Array.isArray(tradesRes.data) ? tradesRes.data : (tradesRes.data.trades || []);
        for (const trade of trades) {
          if (trade.profitAndLoss != null) {
            todayPnL += trade.profitAndLoss;
          }
        }
      }
    } catch {
      log.debug('Failed to get today trades', { accountId: account.accountId });
    }

    enriched.openPnL = openPnL;
    enriched.todayPnL = todayPnL;
    enriched.profitAndLoss = openPnL + todayPnL;

    return enriched;
  }

  // ==================== TRADING ====================

  /**
   * Get open positions
   * @param {number|string} accountId - Account ID
   * @returns {Promise<{success: boolean, positions: Array, error?: string}>}
   */
  async getPositions(accountId) {
    try {
      const id = validateAccountId(accountId);
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Position/searchOpen',
        'POST',
        { accountId: id }
      );
      
      if (response.statusCode === 200) {
        const positions = response.data.positions || response.data || [];
        return { success: true, positions: Array.isArray(positions) ? positions : [] };
      }
      
      return { success: true, positions: [] };
    } catch (err) {
      return { success: true, positions: [], error: err.message };
    }
  }

  /**
   * Get open orders
   * @param {number|string} accountId - Account ID
   * @returns {Promise<{success: boolean, orders: Array, error?: string}>}
   */
  async getOrders(accountId) {
    try {
      const id = validateAccountId(accountId);
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Order/searchOpen',
        'POST',
        { accountId: id }
      );
      
      if (response.statusCode === 200) {
        const orders = response.data.orders || response.data || [];
        return { success: true, orders: Array.isArray(orders) ? orders : [] };
      }
      
      return { success: true, orders: [] };
    } catch (err) {
      return { success: true, orders: [], error: err.message };
    }
  }

  /**
   * Place an order
   * @param {Object} orderData - Order details
   * @returns {Promise<{success: boolean, order?: Object, error?: string}>}
   */
  async placeOrder(orderData) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Order/place',
        'POST',
        orderData,
        'orders'
      );
      
      if (response.statusCode === 200 && response.data.success) {
        log.info('Order placed', { orderId: response.data.orderId });
        return { success: true, order: response.data };
      }
      
      return { success: false, error: response.data.errorMessage || 'Order failed' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Cancel an order
   * @param {number|string} orderId - Order ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async cancelOrder(orderId) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Order/cancel',
        'POST',
        { orderId: parseInt(orderId, 10) },
        'orders'
      );
      
      return { success: response.statusCode === 200 && response.data.success };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Cancel all open orders for an account
   * @param {number|string} accountId - Account ID
   * @returns {Promise<{success: boolean, cancelled: number, error?: string}>}
   */
  async cancelAllOrders(accountId) {
    try {
      const id = validateAccountId(accountId);
      const ordersResult = await this.getOrders(id);
      
      if (!ordersResult.success || !ordersResult.orders?.length) {
        return { success: true, cancelled: 0 };
      }
      
      const pendingOrders = ordersResult.orders.filter(o =>
        o.status === 'Working' || o.status === 'Pending' ||
        o.status === 0 || o.status === 1
      );
      
      let cancelled = 0;
      for (const order of pendingOrders) {
        const result = await this.cancelOrder(order.orderId || order.id);
        if (result.success) cancelled++;
      }
      
      return { success: true, cancelled };
    } catch (err) {
      return { success: false, cancelled: 0, error: err.message };
    }
  }

  /**
   * Close a position
   * @param {number|string} accountId - Account ID
   * @param {number|string} contractId - Contract ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async closePosition(accountId, contractId) {
    try {
      const id = validateAccountId(accountId);
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Position/closeContract',
        'POST',
        { accountId: id, contractId },
        'orders'
      );
      
      return { success: response.statusCode === 200 && response.data.success };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ==================== TRADES & STATS ====================

  /**
   * Get trade history
   * @param {number|string} accountId - Account ID
   * @param {number} [days=30] - Days of history
   * @returns {Promise<{success: boolean, trades: Array, error?: string}>}
   */
  async getTradeHistory(accountId, days = 30) {
    try {
      const id = validateAccountId(accountId);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Trade/search',
        'POST',
        {
          accountId: id,
          startTimestamp: startDate.toISOString(),
          endTimestamp: endDate.toISOString(),
        }
      );

      if (response.statusCode === 200 && response.data) {
        const trades = Array.isArray(response.data) ? response.data : (response.data.trades || []);
        return { success: true, trades: formatTrades(trades) };
      }

      return { success: true, trades: [] };
    } catch (err) {
      return { success: true, trades: [], error: err.message };
    }
  }

  /**
   * Get daily statistics
   * @param {number|string} accountId - Account ID
   * @returns {Promise<{success: boolean, stats: Array, error?: string}>}
   */
  async getDailyStats(accountId) {
    try {
      const id = validateAccountId(accountId);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Trade/search',
        'POST',
        {
          accountId: id,
          startTimestamp: startOfMonth.toISOString(),
          endTimestamp: now.toISOString(),
        }
      );

      if (response.statusCode === 200 && response.data) {
        const trades = Array.isArray(response.data) ? response.data : (response.data.trades || []);
        return { success: true, stats: calculateDailyPnL(trades) };
      }

      return { success: false, stats: [] };
    } catch (err) {
      return { success: false, stats: [], error: err.message };
    }
  }

  /**
   * Get lifetime statistics
   * @param {number|string} accountId - Account ID
   * @returns {Promise<{success: boolean, stats: Object|null, error?: string}>}
   */
  async getLifetimeStats(accountId) {
    try {
      const tradesResult = await this.getTradeHistory(accountId, 90);
      
      if (!tradesResult.success || !tradesResult.trades.length) {
        return { success: true, stats: null };
      }
      
      return { success: true, stats: calculateLifetimeStats(tradesResult.trades) };
    } catch (err) {
      return { success: false, stats: null, error: err.message };
    }
  }

  // ==================== CONTRACTS ====================

  /**
   * Get available contracts from Gateway API
   * Returns RAW data from API - NO static mapping, NO mock data
   * 
   * @returns {Promise<{success: boolean, contracts: Array, error?: string}>}
   */
  async getContracts() {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Contract/available',
        'POST',
        { live: false }
      );
      
      if (response.statusCode === 200) {
        const rawContracts = response.data.contracts || response.data || [];
        
        // Return active contracts with RAW API data only
        const contracts = rawContracts
          .filter(c => c.activeContract === true)
          .sort((a, b) => {
            const grpA = a.contractGroup || '';
            const grpB = b.contractGroup || '';
            if (grpA !== grpB) return grpA.localeCompare(grpB);
            return (a.name || '').localeCompare(b.name || '');
          });
        
        return { success: true, contracts };
      }
      
      return { success: false, contracts: [], error: 'Failed to fetch contracts' };
    } catch (err) {
      return { success: false, contracts: [], error: err.message };
    }
  }

  /**
   * Search contracts
   * @param {string} searchText - Search text
   * @returns {Promise<{success: boolean, contracts: Array, error?: string}>}
   */
  async searchContracts(searchText) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Contract/search',
        'POST',
        { searchText: sanitizeString(searchText), live: false }
      );
      
      if (response.statusCode === 200) {
        return { success: true, contracts: response.data.contracts || response.data || [] };
      }
      
      return { success: false, contracts: [] };
    } catch (err) {
      return { success: false, contracts: [], error: err.message };
    }
  }

  // ==================== MARKET STATUS ====================

  getMarketHolidays() { return getMarketHolidays(); }
  checkHoliday() { return checkHoliday(); }
  checkMarketHours() { return checkMarketHours(); }

  /**
   * Get market status
   * @returns {Promise<{success: boolean, isOpen: boolean, message: string}>}
   */
  async getMarketStatus() {
    const hours = checkMarketHours();
    return { success: true, isOpen: hours.isOpen, message: hours.message };
  }
}

module.exports = { ProjectXService };
