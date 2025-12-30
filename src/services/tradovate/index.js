/**
 * Tradovate Service
 * Main service for Tradovate prop firm connections (Apex, TakeProfitTrader)
 * 
 * STRICT RULE: Display ONLY values returned by API. No estimation, no simulation.
 */

const https = require('https');
const EventEmitter = require('events');
const { TRADOVATE_URLS, API_PATHS, WS_EVENTS, getBaseUrl, getTradingWebSocketUrl } = require('./constants');
const { checkMarketHours, isDST } = require('./market');
const { connectWebSocket, wsSend, disconnectWebSocket } = require('./websocket');

class TradovateService extends EventEmitter {
  constructor(propfirmKey) {
    super();
    this.propfirmKey = propfirmKey;
    this.propfirm = this.getPropFirmConfig(propfirmKey);
    this.accessToken = null;
    this.mdAccessToken = null;
    this.userId = null;
    this.tokenExpiration = null;
    this.accounts = [];
    this.user = null;
    this.isDemo = true; // Default to demo
    this.ws = null;
    this.wsRequestId = 1;
    this.renewalTimer = null;
    this.credentials = null; // Store for session restore
  }

  /**
   * Get PropFirm configuration
   */
  getPropFirmConfig(key) {
    const propfirms = {
      'apex_tradovate': { name: 'Apex (Tradovate)', isDemo: false, defaultBalance: 300000 },
      'takeprofittrader': { name: 'TakeProfitTrader', isDemo: false, defaultBalance: 150000 },
      'myfundedfutures': { name: 'MyFundedFutures', isDemo: false, defaultBalance: 150000 },
    };
    return propfirms[key] || { name: key, isDemo: false, defaultBalance: 150000 };
  }

  /**
   * Login to Tradovate
   */
  async login(username, password, options = {}) {
    try {
      const authData = {
        name: username,
        password: password,
        appId: 'HQX-CLI',
        appVersion: '1.0.0',
        deviceId: this.generateDeviceId(),
      };

      if (options.cid) authData.cid = options.cid;
      if (options.sec) authData.sec = options.sec;

      const result = await this._request(API_PATHS.AUTH_TOKEN_REQUEST, 'POST', authData);

      if (result.errorText) {
        return { success: false, error: result.errorText };
      }

      if (!result.accessToken) {
        return { success: false, error: 'No access token received' };
      }

      this.accessToken = result.accessToken;
      this.mdAccessToken = result.mdAccessToken;
      this.userId = result.userId;
      this.tokenExpiration = new Date(result.expirationTime);
      this.user = { userName: result.name, userId: result.userId };
      this.credentials = { username, password };

      this.setupTokenRenewal();
      await this.fetchAccounts();

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch accounts
   */
  async fetchAccounts() {
    try {
      const accounts = await this._request(API_PATHS.ACCOUNT_LIST, 'GET');
      
      if (Array.isArray(accounts)) {
        this.accounts = accounts;
        
        for (const acc of this.accounts) {
          try {
            const cashBalance = await this._request(
              API_PATHS.CASH_BALANCE_SNAPSHOT,
              'POST',
              { accountId: acc.id }
            );
            acc.cashBalance = cashBalance;
          } catch (e) {
            acc.cashBalance = null;
          }
        }
      }

      return this.accounts;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get trading accounts - ONLY returns values from API
   * No estimation, no simulation
   */
  async getTradingAccounts() {
    if (this.accounts.length === 0) {
      await this.fetchAccounts();
    }

    const tradingAccounts = this.accounts.map((acc) => {
      const cb = acc.cashBalance || {};
      
      // ONLY use values from API - null if not available
      const balance = cb.totalCashValue !== undefined ? cb.totalCashValue : 
                      (cb.netLiquidatingValue !== undefined ? cb.netLiquidatingValue : null);
      
      // P&L from API only - null if not available
      const realizedPnL = cb.realizedPnL !== undefined ? cb.realizedPnL : null;
      const openPnL = cb.openPnL !== undefined ? cb.openPnL : null;
      
      // Total P&L from API
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
        // From API only - null if not available
        balance: balance,
        todayPnL: realizedPnL,
        openPnL: openPnL,
        profitAndLoss: profitAndLoss,
        startingBalance: null,  // API doesn't provide this
        status: acc.active ? 0 : 3,
        platform: 'Tradovate',
        propfirm: this.propfirm.name,
        accountType: acc.accountType,
      };
    });

    return { success: true, accounts: tradingAccounts };
  }

  /**
   * Get positions for an account
   */
  async getPositions(accountId) {
    try {
      const positions = await this._request(API_PATHS.POSITION_DEPS, 'GET', null, { masterid: accountId });
      return positions.filter(p => p.netPos !== 0);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get fills/trades
   */
  async getFills() {
    try {
      return await this._request(API_PATHS.FILL_LIST, 'GET');
    } catch (error) {
      return [];
    }
  }

  /**
   * Place an order
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

      if (result.errorText || result.failureReason) {
        return { success: false, error: result.errorText || result.failureText };
      }

      return { success: true, orderId: result.orderId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(orderId) {
    try {
      const result = await this._request(API_PATHS.ORDER_CANCEL, 'POST', {
        orderId: orderId,
        isAutomated: true,
      });

      if (result.errorText) {
        return { success: false, error: result.errorText };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Close a position
   */
  async closePosition(accountId, contractId) {
    try {
      const result = await this._request(API_PATHS.ORDER_LIQUIDATE_POSITION, 'POST', {
        accountId: accountId,
        contractId: contractId,
        isAutomated: true,
      });

      if (result.errorText) {
        return { success: false, error: result.errorText };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Search contracts
   */
  async searchContracts(text, limit = 10) {
    try {
      return await this._request(API_PATHS.CONTRACT_SUGGEST, 'GET', null, { t: text, l: limit });
    } catch (error) {
      return [];
    }
  }

  /**
   * Get user info
   */
  async getUser() {
    return this.user;
  }

  /**
   * Get market status
   */
  async getMarketStatus(accountId) {
    const marketHours = checkMarketHours();
    return {
      success: true,
      isOpen: marketHours.isOpen,
      message: marketHours.message,
    };
  }

  /**
   * Get token
   */
  getToken() {
    return this.accessToken;
  }

  /**
   * Get orders for an account
   */
  async getOrders(accountId) {
    try {
      const orders = await this._request(API_PATHS.ORDER_LIST, 'GET');
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
        }))
      };
    } catch (error) {
      return { success: false, error: error.message, orders: [] };
    }
  }

  /**
   * Get order history
   */
  async getOrderHistory(days = 30) {
    try {
      const orders = await this._request(API_PATHS.ORDER_LIST, 'GET');
      return { success: true, orders };
    } catch (error) {
      return { success: false, error: error.message, orders: [] };
    }
  }

  /**
   * Get lifetime stats (stub - Tradovate doesn't provide this directly)
   */
  async getLifetimeStats(accountId) {
    return { success: true, stats: null };
  }

  /**
   * Get daily stats (stub - Tradovate doesn't provide this directly)
   */
  async getDailyStats(accountId) {
    return { success: true, stats: [] };
  }

  /**
   * Get trade history
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
        }))
      };
    } catch (error) {
      return { success: false, error: error.message, trades: [] };
    }
  }

  /**
   * Setup automatic token renewal
   */
  setupTokenRenewal() {
    if (this.renewalTimer) {
      clearTimeout(this.renewalTimer);
    }

    // Renew 15 minutes before expiration
    const renewInMs = (90 - 15) * 60 * 1000;

    this.renewalTimer = setTimeout(async () => {
      try {
        await this.renewToken();
      } catch (error) {
        // Silent fail
      }
    }, renewInMs);
  }

  /**
   * Renew access token
   */
  async renewToken() {
    if (!this.accessToken) return;

    try {
      const result = await this._request(API_PATHS.AUTH_RENEW_TOKEN, 'GET');

      if (result.accessToken) {
        this.accessToken = result.accessToken;
        this.mdAccessToken = result.mdAccessToken;
        this.tokenExpiration = new Date(result.expirationTime);
        this.setupTokenRenewal();
      }
    } catch (error) {
      // Silent fail - will need to re-login
    }
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  async connectWebSocket() {
    return connectWebSocket(this);
  }

  /**
   * Send WebSocket message
   */
  wsSend(url, query = '', body = null) {
    return wsSend(this, url, query, body);
  }

  /**
   * Disconnect
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
  }

  /**
   * Generate device ID
   */
  generateDeviceId() {
    const crypto = require('crypto');
    const os = require('os');
    const data = `${os.hostname()}-${os.platform()}-${os.arch()}-hqx-cli`;
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * HTTP request helper
   */
  _request(path, method = 'GET', body = null, queryParams = null) {
    return new Promise((resolve, reject) => {
      const baseUrl = getBaseUrl(this.isDemo);
      const url = new URL(baseUrl + path);

      if (queryParams) {
        Object.entries(queryParams).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }

      const postData = body ? JSON.stringify(body) : null;

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      };

      if (postData) {
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }

      if (this.accessToken) {
        options.headers['Authorization'] = `Bearer ${this.accessToken}`;
      }

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (postData) {
        req.write(postData);
      }

      req.end();
    });
  }
}

module.exports = { TradovateService };
