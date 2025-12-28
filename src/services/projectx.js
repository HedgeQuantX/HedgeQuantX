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

  // ==================== MARKET STATUS ====================

  /**
   * Gets US market holidays for the current year
   * @returns {Array<{date: string, name: string, earlyClose: boolean}>}
   */
  getMarketHolidays() {
    const year = new Date().getFullYear();
    
    // CME Futures holidays - markets closed or early close
    // Dates are approximate, actual dates may vary slightly
    const holidays = [
      // New Year's Day
      { date: `${year}-01-01`, name: "New Year's Day", earlyClose: false },
      // Martin Luther King Jr. Day (3rd Monday of January)
      { date: this._getNthWeekday(year, 0, 1, 3), name: 'MLK Day', earlyClose: false },
      // Presidents Day (3rd Monday of February)
      { date: this._getNthWeekday(year, 1, 1, 3), name: "Presidents' Day", earlyClose: false },
      // Good Friday (Friday before Easter) - calculated dynamically
      { date: this._getGoodFriday(year), name: 'Good Friday', earlyClose: false },
      // Memorial Day (Last Monday of May)
      { date: this._getLastWeekday(year, 4, 1), name: 'Memorial Day', earlyClose: false },
      // Juneteenth (June 19)
      { date: `${year}-06-19`, name: 'Juneteenth', earlyClose: false },
      // Independence Day (July 4)
      { date: `${year}-07-04`, name: 'Independence Day', earlyClose: false },
      { date: `${year}-07-03`, name: 'Independence Day Eve', earlyClose: true },
      // Labor Day (1st Monday of September)
      { date: this._getNthWeekday(year, 8, 1, 1), name: 'Labor Day', earlyClose: false },
      // Thanksgiving (4th Thursday of November)
      { date: this._getNthWeekday(year, 10, 4, 4), name: 'Thanksgiving', earlyClose: false },
      { date: this._getDayAfter(this._getNthWeekday(year, 10, 4, 4)), name: 'Black Friday', earlyClose: true },
      // Christmas
      { date: `${year}-12-25`, name: 'Christmas Day', earlyClose: false },
      { date: `${year}-12-24`, name: 'Christmas Eve', earlyClose: true },
      // New Year's Eve
      { date: `${year}-12-31`, name: "New Year's Eve", earlyClose: true },
    ];
    
    return holidays;
  }

  /**
   * Helper: Get nth weekday of a month
   * @private
   */
  _getNthWeekday(year, month, weekday, n) {
    const firstDay = new Date(year, month, 1);
    let count = 0;
    for (let day = 1; day <= 31; day++) {
      const d = new Date(year, month, day);
      if (d.getMonth() !== month) break;
      if (d.getDay() === weekday) {
        count++;
        if (count === n) {
          return d.toISOString().split('T')[0];
        }
      }
    }
    return null;
  }

  /**
   * Helper: Get last weekday of a month
   * @private
   */
  _getLastWeekday(year, month, weekday) {
    const lastDay = new Date(year, month + 1, 0);
    for (let day = lastDay.getDate(); day >= 1; day--) {
      const d = new Date(year, month, day);
      if (d.getDay() === weekday) {
        return d.toISOString().split('T')[0];
      }
    }
    return null;
  }

  /**
   * Helper: Get Good Friday (Friday before Easter)
   * @private
   */
  _getGoodFriday(year) {
    // Easter calculation (Anonymous Gregorian algorithm)
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    
    // Good Friday is 2 days before Easter
    const easter = new Date(year, month, day);
    const goodFriday = new Date(easter);
    goodFriday.setDate(easter.getDate() - 2);
    return goodFriday.toISOString().split('T')[0];
  }

  /**
   * Helper: Get day after a date
   * @private
   */
  _getDayAfter(dateStr) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  /**
   * Checks if today is a market holiday
   * @returns {{isHoliday: boolean, holiday?: {date: string, name: string, earlyClose: boolean}}}
   */
  checkHoliday() {
    const today = new Date().toISOString().split('T')[0];
    const holidays = this.getMarketHolidays();
    const holiday = holidays.find(h => h.date === today);
    
    if (holiday) {
      return { isHoliday: !holiday.earlyClose, holiday };
    }
    return { isHoliday: false };
  }

  /**
   * Checks if futures market is open based on CME hours and holidays
   * @returns {{isOpen: boolean, message: string}}
   */
  checkMarketHours() {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcHour = now.getUTCHours();
    
    // Check holidays first
    const holidayCheck = this.checkHoliday();
    if (holidayCheck.isHoliday) {
      return { isOpen: false, message: `Market closed - ${holidayCheck.holiday.name}` };
    }
    if (holidayCheck.holiday && holidayCheck.holiday.earlyClose && utcHour >= 18) {
      return { isOpen: false, message: `Market closed early - ${holidayCheck.holiday.name}` };
    }
    
    // CME Futures hours (in UTC):
    // Open: Sunday 23:00 UTC (6:00 PM ET)
    // Close: Friday 22:00 UTC (5:00 PM ET)
    // Daily maintenance: 22:00-23:00 UTC (5:00-6:00 PM ET)
    
    // Saturday - closed all day
    if (utcDay === 6) {
      return { isOpen: false, message: 'Market closed - Weekend (Saturday)' };
    }
    
    // Sunday before 23:00 UTC - closed
    if (utcDay === 0 && utcHour < 23) {
      return { isOpen: false, message: 'Market closed - Opens Sunday 6:00 PM ET' };
    }
    
    // Friday after 22:00 UTC - closed
    if (utcDay === 5 && utcHour >= 22) {
      return { isOpen: false, message: 'Market closed - Weekend' };
    }
    
    // Daily maintenance 22:00-23:00 UTC (except Friday close)
    if (utcHour === 22 && utcDay !== 5) {
      return { isOpen: false, message: 'Market closed - Daily maintenance (5:00-6:00 PM ET)' };
    }
    
    return { isOpen: true, message: 'Market is open' };
  }

  /**
   * Gets market status for an account
   * @param {number|string} accountId - Account ID
   * @returns {Promise<{success: boolean, isOpen: boolean, message: string}>}
   */
  async getMarketStatus(accountId) {
    const hours = this.checkMarketHours();
    return { success: true, isOpen: hours.isOpen, message: hours.message };
  }
}

module.exports = { ProjectXService };
