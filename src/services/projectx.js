/**
 * ProjectX API Service
 * Handles all API communication with PropFirm platforms
 */

const https = require('https');
const { PROPFIRMS } = require('../config');

class ProjectXService {
  constructor(propfirmKey = 'topstep') {
    this.propfirm = PROPFIRMS[propfirmKey] || PROPFIRMS.topstep;
    this.token = null;
    this.user = null;
  }

  /**
   * Make HTTPS request
   */
  async _request(host, path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: host,
        port: 443,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
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
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) req.write(JSON.stringify(data));
      req.end();
    });
  }

  // ==================== AUTH ====================

  async login(userName, password) {
    try {
      const response = await this._request(this.propfirm.userApi, '/Login', 'POST', { userName, password });
      if (response.statusCode === 200 && response.data.token) {
        this.token = response.data.token;
        return { success: true, token: this.token };
      }
      return { success: false, error: response.data.errorMessage || 'Invalid credentials' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async loginWithApiKey(userName, apiKey) {
    try {
      const response = await this._request(this.propfirm.userApi, '/Login/key', 'POST', { userName, apiKey });
      if (response.statusCode === 200 && response.data.token) {
        this.token = response.data.token;
        return { success: true, token: this.token };
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

  async getPositions(accountId) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Position/searchOpen',
        'POST',
        { accountId: parseInt(accountId) }
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
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Order/searchOpen',
        'POST',
        { accountId: parseInt(accountId) }
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
        this.propfirm.gatewayApi,
        '/api/Order/place',
        'POST',
        orderData
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
        this.propfirm.gatewayApi,
        '/api/Order/cancel',
        'POST',
        { orderId: parseInt(orderId) }
      );
      return { success: response.statusCode === 200 && response.data.success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async closePosition(accountId, contractId) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Position/closeContract',
        'POST',
        { accountId: parseInt(accountId), contractId }
      );
      return { success: response.statusCode === 200 && response.data.success };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // ==================== TRADES & STATS ====================

  async getTradeHistory(accountId, days = 30) {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Trade/search',
        'POST',
        { 
          accountId: parseInt(accountId),
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

  async getDailyStats(accountId) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Trade/search',
        'POST',
        { 
          accountId: parseInt(accountId),
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

  async getLifetimeStats(accountId) {
    try {
      const tradesResult = await this.getTradeHistory(accountId, 90);
      
      if (!tradesResult.success || tradesResult.trades.length === 0) {
        return { success: true, stats: null };
      }

      const trades = tradesResult.trades;
      let stats = {
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

      let consecutiveWins = 0, consecutiveLosses = 0;

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

  async searchContracts(searchText) {
    try {
      const response = await this._request(
        this.propfirm.gatewayApi,
        '/api/Contract/search',
        'POST',
        { searchText, live: false }
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
