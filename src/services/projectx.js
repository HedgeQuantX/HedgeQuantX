/**
 * @fileoverview ProjectX API Service with security features
 * @module services/projectx
 */

const https = require('https');
const { PROPFIRMS } = require('../config');
const { 
  validateUsername, 
  validatePassword, 
  validateApiKey,
  validateAccountId,
  sanitizeString,
  maskSensitive 
} = require('../security');
const { getLimiter } = require('../security/rateLimit');

/**
 * ProjectX API Service
 * Handles all API communication with PropFirm platforms
 */
class ProjectXService {
  /**
   * Creates a new ProjectX service instance
   * @param {string} [propfirmKey='topstep'] - PropFirm identifier
   */
  constructor(propfirmKey = 'topstep') {
    this.propfirm = PROPFIRMS[propfirmKey] || PROPFIRMS.topstep;
    this.token = null;
    this.user = null;
    this.rateLimiter = getLimiter('api');
    this.loginLimiter = getLimiter('login');
    this.orderLimiter = getLimiter('orders');
  }

  /**
   * Makes a rate-limited HTTPS request
   * @param {string} host - API host
   * @param {string} path - API path
   * @param {string} [method='GET'] - HTTP method
   * @param {Object} [data=null] - Request body
   * @param {string} [limiterType='api'] - Rate limiter to use
   * @returns {Promise<{statusCode: number, data: any}>}
   * @private
   */
  async _request(host, path, method = 'GET', data = null, limiterType = 'api') {
    const limiter = limiterType === 'login' ? this.loginLimiter : 
                    limiterType === 'orders' ? this.orderLimiter : this.rateLimiter;
    
    return limiter.execute(() => this._doRequest(host, path, method, data));
  }

  /**
   * Performs the actual HTTPS request
   * @private
   */
  async _doRequest(host, path, method, data) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: host,
        port: 443,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'HedgeQuantX-CLI/1.1.1'
        },
        timeout: 15000
      };

      if (this.token) {
        options.headers['Authorization'] = `Bearer ${this.token}`;
      }

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, data: body });
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }

  // ==================== AUTH ====================

  /**
   * Authenticates with username and password
   * @param {string} userName - Username
   * @param {string} password - Password
   * @returns {Promise<{success: boolean, token?: string, error?: string}>}
   */
  async login(userName, password) {
    try {
      // Validate inputs
      validateUsername(userName);
      validatePassword(password);
      
      const response = await this._request(
        this.propfirm.userApi, 
        '/Login', 
        'POST', 
        { userName: sanitizeString(userName), password },
        'login'
      );
      
      if (response.statusCode === 200 && response.data.token) {
        this.token = response.data.token;
        return { success: true, token: maskSensitive(this.token) };
      }
      
      return { success: false, error: response.data.errorMessage || 'Invalid credentials' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Authenticates with API key
   * @param {string} userName - Username
   * @param {string} apiKey - API key
   * @returns {Promise<{success: boolean, token?: string, error?: string}>}
   */
  async loginWithApiKey(userName, apiKey) {
    try {
      validateUsername(userName);
      validateApiKey(apiKey);
      
      const response = await this._request(
        this.propfirm.userApi, 
        '/Login/key', 
        'POST', 
        { userName: sanitizeString(userName), apiKey },
        'login'
      );
      
      if (response.statusCode === 200 && response.data.token) {
        this.token = response.data.token;
        return { success: true, token: maskSensitive(this.token) };
      }
      
      return { success: false, error: response.data.errorMessage || 'Invalid API key' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Logs out and clears credentials
   */
  logout() {
    this.token = null;
    this.user = null;
  }

  // ==================== USER ====================

  /**
   * Gets current user information
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
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==================== ACCOUNTS ====================

  /**
   * Gets all trading accounts
   * @returns {Promise<{success: boolean, accounts?: Array, error?: string}>}
   */
  async getTradingAccounts() {
    try {
      const response = await this._request(this.propfirm.userApi, '/TradingAccount', 'GET');
      
      if (response.statusCode === 200) {
        const accounts = Array.isArray(response.data) ? response.data : [];
        return { success: true, accounts };
      }
      
      return { success: false, accounts: [], error: 'Failed to get accounts' };
    } catch (error) {
      return { success: false, accounts: [], error: error.message };
    }
  }

  // ==================== TRADING (GatewayAPI) ====================

  /**
   * Gets open positions for an account
   * @param {number|string} accountId - Account ID
   * @returns {Promise<{success: boolean, positions?: Array, error?: string}>}
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
    } catch (error) {
      return { success: true, positions: [], error: error.message };
    }
  }

  /**
   * Gets open orders for an account
   * @param {number|string} accountId - Account ID
   * @returns {Promise<{success: boolean, orders?: Array, error?: string}>}
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
    } catch (error) {
      return { success: true, orders: [], error: error.message };
    }
  }

  /**
   * Places an order
   * @param {Object} orderData - Order data
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
        return { success: true, order: response.data };
      }
      
      return { success: false, error: response.data.errorMessage || 'Order failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancels an order
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
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Closes a position
   * @param {number|string} accountId - Account ID
   * @param {string} contractId - Contract ID
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
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==================== TRADES & STATS ====================

  /**
   * Gets trade history for an account
   * @param {number|string} accountId - Account ID
   * @param {number} [days=30] - Number of days to fetch
   * @returns {Promise<{success: boolean, trades?: Array, error?: string}>}
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
          endTimestamp: endDate.toISOString()
        }
      );

      if (response.statusCode === 200 && response.data) {
        let trades = [];
        if (Array.isArray(response.data)) {
          trades = response.data;
        } else if (response.data.trades) {
          trades = response.data.trades;
        }

        return {
          success: true,
          trades: trades.map(t => ({
            ...t,
            timestamp: t.creationTimestamp || t.timestamp,
            pnl: t.profitAndLoss || t.pnl || 0
          }))
        };
      }

      return { success: true, trades: [] };
    } catch (error) {
      return { success: true, trades: [], error: error.message };
    }
  }

  /**
   * Gets daily statistics for an account
   * @param {number|string} accountId - Account ID
   * @returns {Promise<{success: boolean, stats?: Array, error?: string}>}
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
          endTimestamp: now.toISOString()
        }
      );

      if (response.statusCode === 200 && response.data) {
        let trades = Array.isArray(response.data) ? response.data : (response.data.trades || []);

        // Group by day
        const dailyPnL = {};
        trades.forEach(t => {
          const ts = t.creationTimestamp || t.timestamp;
          if (ts) {
            const d = new Date(ts);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            dailyPnL[key] = (dailyPnL[key] || 0) + (t.profitAndLoss || t.pnl || 0);
          }
        });

        return {
          success: true,
          stats: Object.entries(dailyPnL).map(([date, pnl]) => ({ date, profitAndLoss: pnl }))
        };
      }

      return { success: false, stats: [] };
    } catch (error) {
      return { success: false, stats: [], error: error.message };
    }
  }

  /**
   * Gets lifetime statistics for an account
   * @param {number|string} accountId - Account ID
   * @returns {Promise<{success: boolean, stats?: Object, error?: string}>}
   */
  async getLifetimeStats(accountId) {
    try {
      const tradesResult = await this.getTradeHistory(accountId, 90);

      if (!tradesResult.success || tradesResult.trades.length === 0) {
        return { success: true, stats: null };
      }

      const trades = tradesResult.trades;
      const stats = {
        totalTrades: trades.length,
        winningTrades: 0,
        losingTrades: 0,
        totalWinAmount: 0,
        totalLossAmount: 0,
        bestTrade: 0,
        worstTrade: 0,
        totalVolume: 0,
        maxConsecutiveWins: 0,
        maxConsecutiveLosses: 0,
        longTrades: 0,
        shortTrades: 0
      };

      let consecutiveWins = 0;
      let consecutiveLosses = 0;

      trades.forEach(t => {
        const pnl = t.profitAndLoss || t.pnl || 0;
        const size = t.size || t.quantity || 1;

        stats.totalVolume += Math.abs(size);
        
        if (t.side === 0) stats.longTrades++;
        else if (t.side === 1) stats.shortTrades++;

        if (pnl > 0) {
          stats.winningTrades++;
          stats.totalWinAmount += pnl;
          if (pnl > stats.bestTrade) stats.bestTrade = pnl;
          consecutiveWins++;
          consecutiveLosses = 0;
          if (consecutiveWins > stats.maxConsecutiveWins) stats.maxConsecutiveWins = consecutiveWins;
        } else if (pnl < 0) {
          stats.losingTrades++;
          stats.totalLossAmount += Math.abs(pnl);
          if (pnl < stats.worstTrade) stats.worstTrade = pnl;
          consecutiveLosses++;
          consecutiveWins = 0;
          if (consecutiveLosses > stats.maxConsecutiveLosses) stats.maxConsecutiveLosses = consecutiveLosses;
        }
      });

      stats.profitFactor = stats.totalLossAmount > 0 ? stats.totalWinAmount / stats.totalLossAmount : 0;
      stats.avgWin = stats.winningTrades > 0 ? stats.totalWinAmount / stats.winningTrades : 0;
      stats.avgLoss = stats.losingTrades > 0 ? stats.totalLossAmount / stats.losingTrades : 0;

      return { success: true, stats };
    } catch (error) {
      return { success: false, stats: null, error: error.message };
    }
  }

  // ==================== CONTRACTS ====================

  /**
   * Searches for contracts
   * @param {string} searchText - Search text
   * @returns {Promise<{success: boolean, contracts?: Array, error?: string}>}
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
    } catch (error) {
      return { success: false, contracts: [], error: error.message };
    }
  }
}

module.exports = { ProjectXService };
