/**
 * ProjectX API Service
 * Main service for ProjectX prop firm connections
 * 
 * STRICT RULE: Display ONLY values returned by API. No estimation, no simulation.
 */

const https = require('https');
const { PROPFIRMS } = require('../../config');

// Debug mode - set HQX_DEBUG=1 to enable
const DEBUG = process.env.HQX_DEBUG === '1';
const debug = (...args) => DEBUG && console.log('[ProjectX]', ...args);
const { 
  validateUsername, 
  validatePassword, 
  validateApiKey,
  validateAccountId,
  sanitizeString,
  maskSensitive 
} = require('../../security');
const { getLimiter } = require('../../security/rateLimit');
const { getMarketHolidays, checkHoliday, checkMarketHours } = require('./market');
const { calculateLifetimeStats, calculateDailyPnL, formatTrades } = require('./stats');

class ProjectXService {
  constructor(propfirmKey = 'topstep') {
    this.propfirm = PROPFIRMS[propfirmKey] || PROPFIRMS.topstep;
    this.propfirmKey = propfirmKey;
    this.token = null;
    this.user = null;
    this.rateLimiter = getLimiter('api');
    this.loginLimiter = getLimiter('login');
    this.orderLimiter = getLimiter('orders');
  }

  getToken() { return this.token; }
  getPropfirm() { return this.propfirmKey; }

  // ==================== HTTP ====================

  async _request(host, path, method = 'GET', data = null, limiterType = 'api') {
    const limiter = limiterType === 'login' ? this.loginLimiter : 
                    limiterType === 'orders' ? this.orderLimiter : this.rateLimiter;
    return limiter.execute(() => this._doRequest(host, path, method, data));
  }

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
          'User-Agent': 'HedgeQuantX-CLI/1.3.0'
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
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }

  // ==================== AUTH ====================

  async login(userName, password) {
    try {
      validateUsername(userName);
      validatePassword(password);
      
      const response = await this._request(
        this.propfirm.userApi, '/Login', 'POST',
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
        return { success: true, token: maskSensitive(this.token) };
      }
      
      return { success: false, error: response.data.errorMessage || 'Invalid API key' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  logout() {
    this.token = null;
    this.user = null;
  }

  // ==================== USER ====================

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
   * Get trading accounts with REAL P&L from API
   * 
   * Data sources (all from userApi):
   * - /TradingAccount: accountId, accountName, balance, status, type
   * - /AccountTemplate/userTemplates: startingBalance
   * - /Position?accountId=X: profitAndLoss (unrealized P&L from open positions)
   * 
   * All values come from API. No estimation.
   */
  async getTradingAccounts() {
    try {
      // 1. Get accounts
      const response = await this._request(this.propfirm.userApi, '/TradingAccount', 'GET');
      debug('getTradingAccounts response:', JSON.stringify(response.data, null, 2));
      
      if (response.statusCode !== 200) {
        return { success: false, accounts: [], error: 'Failed to get accounts' };
      }

      const accounts = Array.isArray(response.data) ? response.data : [];
      
      // 2. Get account templates (for startingBalance)
      let templates = [];
      try {
        const templateRes = await this._request(this.propfirm.userApi, '/AccountTemplate/userTemplates', 'GET');
        if (templateRes.statusCode === 200 && Array.isArray(templateRes.data)) {
          templates = templateRes.data;
          debug('Templates:', JSON.stringify(templates, null, 2));
        }
      } catch (e) {
        debug('Failed to get templates:', e.message);
      }

      const enrichedAccounts = [];

      for (const account of accounts) {
        // Find matching template for startingBalance
        const template = templates.find(t => 
          account.accountName && (
            account.accountName.includes(t.title) || 
            t.title.includes(account.accountName)
          )
        );
        
        const enriched = {
          accountId: account.accountId,
          accountName: account.accountName,
          balance: account.balance,                              // From /TradingAccount
          status: account.status,                                // From /TradingAccount
          type: account.type,                                    // From /TradingAccount
          startingBalance: template?.startingBalance || null,    // From /AccountTemplate
          platform: 'ProjectX',
          propfirm: this.propfirm.name,
          openPnL: null,
          profitAndLoss: null,
        };

        // Get P&L for active accounts only
        if (account.status === 0) {
          let openPnL = 0;
          let todayPnL = 0;
          
          // 1. Get unrealized P&L from open positions
          try {
            const posRes = await this._request(
              this.propfirm.userApi, 
              `/Position?accountId=${account.accountId}`, 
              'GET'
            );
            debug(`Positions for ${account.accountId}:`, JSON.stringify(posRes.data, null, 2));
            
            if (posRes.statusCode === 200 && Array.isArray(posRes.data)) {
              for (const pos of posRes.data) {
                if (pos.profitAndLoss !== undefined && pos.profitAndLoss !== null) {
                  openPnL += pos.profitAndLoss;
                }
              }
            }
          } catch (e) {
            debug('Failed to get positions:', e.message);
          }
          
          // 2. Get realized P&L from today's closed trades
          try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const now = new Date();
            
            const tradesRes = await this._request(
              this.propfirm.gatewayApi, 
              '/api/Trade/search', 
              'POST',
              { 
                accountId: account.accountId, 
                startTimestamp: today.toISOString(), 
                endTimestamp: now.toISOString() 
              }
            );
            debug(`Today trades for ${account.accountId}:`, JSON.stringify(tradesRes.data, null, 2));
            
            if (tradesRes.statusCode === 200) {
              const trades = Array.isArray(tradesRes.data) ? tradesRes.data : (tradesRes.data.trades || []);
              for (const trade of trades) {
                if (trade.profitAndLoss !== undefined && trade.profitAndLoss !== null) {
                  todayPnL += trade.profitAndLoss;
                }
              }
            }
          } catch (e) {
            debug('Failed to get today trades:', e.message);
          }
          
          enriched.openPnL = openPnL;
          enriched.todayPnL = todayPnL;
          enriched.profitAndLoss = openPnL + todayPnL;  // Total day P&L = unrealized + realized
        }

        debug(`Account ${account.accountId}:`, {
          balance: enriched.balance,
          startingBalance: enriched.startingBalance,
          openPnL: enriched.openPnL,
          profitAndLoss: enriched.profitAndLoss
        });

        enrichedAccounts.push(enriched);
      }

      return { success: true, accounts: enrichedAccounts };
    } catch (error) {
      return { success: false, accounts: [], error: error.message };
    }
  }

  // ==================== TRADING ====================

  async getPositions(accountId) {
    try {
      const id = validateAccountId(accountId);
      const response = await this._request(
        this.propfirm.gatewayApi, '/api/Position/searchOpen', 'POST', { accountId: id }
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

  async getOrders(accountId) {
    try {
      const id = validateAccountId(accountId);
      const response = await this._request(
        this.propfirm.gatewayApi, '/api/Order/searchOpen', 'POST', { accountId: id }
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

  async placeOrder(orderData) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi, '/api/Order/place', 'POST', orderData, 'orders'
      );
      if (response.statusCode === 200 && response.data.success) {
        return { success: true, order: response.data };
      }
      return { success: false, error: response.data.errorMessage || 'Order failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async cancelOrder(orderId) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi, '/api/Order/cancel', 'POST',
        { orderId: parseInt(orderId, 10) }, 'orders'
      );
      return { success: response.statusCode === 200 && response.data.success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async cancelAllOrders(accountId) {
    try {
      const id = validateAccountId(accountId);
      const ordersResult = await this.getOrders(id);
      if (!ordersResult.success || !ordersResult.orders) {
        return { success: true, cancelled: 0 };
      }
      
      const pendingOrders = ordersResult.orders.filter(o => 
        o.status === 'Working' || o.status === 'Pending' || o.status === 0 || o.status === 1
      );
      
      let cancelled = 0;
      for (const order of pendingOrders) {
        const result = await this.cancelOrder(order.orderId || order.id);
        if (result.success) cancelled++;
      }
      
      return { success: true, cancelled };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async closePosition(accountId, contractId) {
    try {
      const id = validateAccountId(accountId);
      const response = await this._request(
        this.propfirm.gatewayApi, '/api/Position/closeContract', 'POST',
        { accountId: id, contractId }, 'orders'
      );
      return { success: response.statusCode === 200 && response.data.success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==================== TRADES & STATS ====================

  async getTradeHistory(accountId, days = 30) {
    try {
      const id = validateAccountId(accountId);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const response = await this._request(
        this.propfirm.gatewayApi, '/api/Trade/search', 'POST',
        { accountId: id, startTimestamp: startDate.toISOString(), endTimestamp: endDate.toISOString() }
      );

      if (response.statusCode === 200 && response.data) {
        let trades = Array.isArray(response.data) ? response.data : (response.data.trades || []);
        return { success: true, trades: formatTrades(trades) };
      }

      return { success: true, trades: [] };
    } catch (error) {
      return { success: true, trades: [], error: error.message };
    }
  }

  async getDailyStats(accountId) {
    try {
      const id = validateAccountId(accountId);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const response = await this._request(
        this.propfirm.gatewayApi, '/api/Trade/search', 'POST',
        { accountId: id, startTimestamp: startOfMonth.toISOString(), endTimestamp: now.toISOString() }
      );

      if (response.statusCode === 200 && response.data) {
        let trades = Array.isArray(response.data) ? response.data : (response.data.trades || []);
        return { success: true, stats: calculateDailyPnL(trades) };
      }

      return { success: false, stats: [] };
    } catch (error) {
      return { success: false, stats: [], error: error.message };
    }
  }

  async getLifetimeStats(accountId) {
    try {
      const tradesResult = await this.getTradeHistory(accountId, 90);
      if (!tradesResult.success || tradesResult.trades.length === 0) {
        return { success: true, stats: null };
      }
      return { success: true, stats: calculateLifetimeStats(tradesResult.trades) };
    } catch (error) {
      return { success: false, stats: null, error: error.message };
    }
  }

  // ==================== CONTRACTS ====================

  async searchContracts(searchText) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi, '/api/Contract/search', 'POST',
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

  getMarketHolidays() { return getMarketHolidays(); }
  checkHoliday() { return checkHoliday(); }
  checkMarketHours() { return checkMarketHours(); }

  async getMarketStatus(accountId) {
    const hours = checkMarketHours();
    return { success: true, isOpen: hours.isOpen, message: hours.message };
  }
}

module.exports = { ProjectXService };
