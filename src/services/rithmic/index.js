/**
 * Rithmic Service
 * Main service for Rithmic prop firm connections
 */

const EventEmitter = require('events');
const { RithmicConnection } = require('./connection');
const { RITHMIC_ENDPOINTS, RITHMIC_SYSTEMS } = require('./constants');
const { createOrderHandler, createPnLHandler } = require('./handlers');
const { fetchAccounts, getTradingAccounts, requestPnLSnapshot, subscribePnLUpdates, getPositions, hashAccountId } = require('./accounts');
const { placeOrder, cancelOrder, getOrders, getOrderHistory, closePosition } = require('./orders');

// Debug mode
const DEBUG = process.env.HQX_DEBUG === '1';
const debug = (...args) => DEBUG && console.log('[Rithmic:Service]', ...args);

// PropFirm configurations
const PROPFIRM_CONFIGS = {
  'apex': { name: 'Apex Trader Funding', systemName: 'Apex', defaultBalance: 300000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'apex_rithmic': { name: 'Apex Trader Funding', systemName: 'Apex', defaultBalance: 300000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'topstep_r': { name: 'Topstep (Rithmic)', systemName: RITHMIC_SYSTEMS.TOPSTEP, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'bulenox_r': { name: 'Bulenox (Rithmic)', systemName: RITHMIC_SYSTEMS.BULENOX, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'earn2trade': { name: 'Earn2Trade', systemName: RITHMIC_SYSTEMS.EARN_2_TRADE, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'mescapital': { name: 'MES Capital', systemName: RITHMIC_SYSTEMS.MES_CAPITAL, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'tradefundrr': { name: 'TradeFundrr', systemName: RITHMIC_SYSTEMS.TRADEFUNDRR, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'thetradingpit': { name: 'The Trading Pit', systemName: RITHMIC_SYSTEMS.THE_TRADING_PIT, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'fundedfutures': { name: 'Funded Futures Network', systemName: RITHMIC_SYSTEMS.FUNDED_FUTURES_NETWORK, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'propshop': { name: 'PropShop Trader', systemName: RITHMIC_SYSTEMS.PROPSHOP_TRADER, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  '4proptrader': { name: '4PropTrader', systemName: RITHMIC_SYSTEMS.FOUR_PROP_TRADER, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'daytraders': { name: 'DayTraders.com', systemName: RITHMIC_SYSTEMS.DAY_TRADERS, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  '10xfutures': { name: '10X Futures', systemName: RITHMIC_SYSTEMS.TEN_X_FUTURES, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'lucidtrading': { name: 'Lucid Trading', systemName: RITHMIC_SYSTEMS.LUCID_TRADING, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'thrivetrading': { name: 'Thrive Trading', systemName: RITHMIC_SYSTEMS.THRIVE_TRADING, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  'legendstrading': { name: 'Legends Trading', systemName: RITHMIC_SYSTEMS.LEGENDS_TRADING, defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.CHICAGO },
};

class RithmicService extends EventEmitter {
  constructor(propfirmKey) {
    super();
    this.propfirmKey = propfirmKey;
    this.propfirm = PROPFIRM_CONFIGS[propfirmKey] || { 
      name: propfirmKey, 
      systemName: 'Rithmic Paper Trading', 
      defaultBalance: 150000, 
      gateway: RITHMIC_ENDPOINTS.PAPER 
    };
    this.orderConn = null;
    this.pnlConn = null;
    this.loginInfo = null;
    this.accounts = [];
    this.accountPnL = new Map();
    this.positions = new Map();
    this.orders = [];
    this.user = null;
    this.credentials = null;
  }

  /**
   * Login to Rithmic
   */
  async login(username, password) {
    try {
      this.orderConn = new RithmicConnection();
      const gateway = this.propfirm.gateway || RITHMIC_ENDPOINTS.CHICAGO;
      
      const config = {
        uri: gateway,
        systemName: this.propfirm.systemName,
        userId: username,
        password: password,
        appName: 'HQX-CLI',
        appVersion: '1.0.0',
      };

      await this.orderConn.connect(config);
      this.orderConn.on('message', createOrderHandler(this));

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Login timeout - server did not respond' });
        }, 30000);

        this.orderConn.once('loggedIn', async (data) => {
          clearTimeout(timeout);
          this.loginInfo = data;
          this.user = { userName: username, fcmId: data.fcmId, ibId: data.ibId };
          
          try { await fetchAccounts(this); } catch (e) {}
          
          if (this.accounts.length === 0) {
            this.accounts = [{
              accountId: username,
              accountName: username,
              fcmId: data.fcmId,
              ibId: data.ibId,
            }];
          }
          
          this.credentials = { username, password };
          
          debug('Accounts found:', this.accounts.length);
          debug('Account IDs:', this.accounts.map(a => a.accountId));
          
          // Connect to PNL_PLANT for balance/P&L data
          try {
            debug('Connecting to PNL_PLANT...');
            const pnlConnected = await this.connectPnL(username, password);
            debug('PNL_PLANT connected:', pnlConnected, 'pnlConn:', !!this.pnlConn);
            
            if (this.pnlConn) {
              debug('Requesting P&L snapshot...');
              await requestPnLSnapshot(this);
              debug('accountPnL map size after snapshot:', this.accountPnL.size);
              subscribePnLUpdates(this);
            }
          } catch (e) {
            debug('PnL connection failed:', e.message);
          }
          
          // Get accounts with P&L data (if available)
          const result = await getTradingAccounts(this);
          debug('Final accounts:', result.accounts.length);
          
          resolve({ success: true, user: this.user, accounts: result.accounts });
        });

        this.orderConn.once('loginFailed', (data) => {
          clearTimeout(timeout);
          resolve({ success: false, error: data.message || 'Login failed' });
        });

        this.orderConn.login('ORDER_PLANT');
      });

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Connect to PNL_PLANT for balance data
   */
  async connectPnL(username, password) {
    try {
      this.pnlConn = new RithmicConnection();
      const gateway = this.propfirm.gateway || RITHMIC_ENDPOINTS.CHICAGO;

      const config = {
        uri: gateway,
        systemName: this.propfirm.systemName,
        userId: username,
        password: password,
        appName: 'HQX-CLI',
        appVersion: '1.0.0',
      };

      await this.pnlConn.connect(config);
      this.pnlConn.on('message', createPnLHandler(this));

      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 10000);

        this.pnlConn.once('loggedIn', () => {
          clearTimeout(timeout);
          resolve(true);
        });

        this.pnlConn.once('loginFailed', () => {
          clearTimeout(timeout);
          resolve(false);
        });

        this.pnlConn.login('PNL_PLANT');
      });
    } catch (e) {
      return false;
    }
  }

  // Delegate to modules
  async getTradingAccounts() { return getTradingAccounts(this); }
  async getPositions() { return getPositions(this); }
  async getOrders() { return getOrders(this); }
  async getOrderHistory(date) { return getOrderHistory(this, date); }
  async placeOrder(orderData) { return placeOrder(this, orderData); }
  async cancelOrder(orderId) { return cancelOrder(this, orderId); }
  async closePosition(accountId, symbol) { return closePosition(this, accountId, symbol); }

  // Stubs for API compatibility
  async getUser() { return this.user; }
  async getLifetimeStats() { return { success: true, stats: null }; }
  async getDailyStats() { return { success: true, stats: [] }; }
  async getTradeHistory() { return { success: true, trades: [] }; }
  
  async getMarketStatus() {
    const status = this.checkMarketHours();
    return { success: true, isOpen: status.isOpen, message: status.message };
  }

  getToken() { return this.loginInfo ? 'connected' : null; }
  getPropfirm() { return this.propfirmKey || 'apex'; }

  getRithmicCredentials() {
    if (!this.credentials) return null;
    return {
      userId: this.credentials.username,
      password: this.credentials.password,
      systemName: this.propfirm.systemName,
      gateway: this.propfirm.gateway || 'wss://rprotocol.rithmic.com:443'
    };
  }

  // All available contracts for Rithmic
  _getAvailableContracts() {
    return [
      { symbol: 'ESH5', name: 'E-mini S&P 500 Mar 2025', exchange: 'CME', group: 'Index' },
      { symbol: 'NQH5', name: 'E-mini NASDAQ-100 Mar 2025', exchange: 'CME', group: 'Index' },
      { symbol: 'MESH5', name: 'Micro E-mini S&P 500 Mar 2025', exchange: 'CME', group: 'Micro' },
      { symbol: 'MNQH5', name: 'Micro E-mini NASDAQ-100 Mar 2025', exchange: 'CME', group: 'Micro' },
      { symbol: 'MCLE5', name: 'Micro Crude Oil Mar 2025', exchange: 'NYMEX', group: 'Micro' },
      { symbol: 'MGCG5', name: 'Micro Gold Feb 2025', exchange: 'COMEX', group: 'Micro' },
      { symbol: 'CLH5', name: 'Crude Oil Mar 2025', exchange: 'NYMEX', group: 'Energy' },
      { symbol: 'GCG5', name: 'Gold Feb 2025', exchange: 'COMEX', group: 'Metals' },
      { symbol: 'SIH5', name: 'Silver Mar 2025', exchange: 'COMEX', group: 'Metals' },
      { symbol: 'RTYH5', name: 'E-mini Russell 2000 Mar 2025', exchange: 'CME', group: 'Index' },
      { symbol: 'YMH5', name: 'E-mini Dow Jones Mar 2025', exchange: 'CBOT', group: 'Index' },
      { symbol: 'ZBH5', name: '30-Year US Treasury Bond Mar 2025', exchange: 'CBOT', group: 'Bonds' },
      { symbol: 'ZNH5', name: '10-Year US Treasury Note Mar 2025', exchange: 'CBOT', group: 'Bonds' },
    ];
  }

  async getContracts() {
    return { success: true, contracts: this._getAvailableContracts() };
  }

  async searchContracts(searchText) {
    const contracts = this._getAvailableContracts();
    if (!searchText) return contracts;
    const search = searchText.toUpperCase();
    return contracts.filter(c => c.symbol.includes(search) || c.name.toUpperCase().includes(search));
  }

  checkMarketHours() {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcHour = now.getUTCHours();
    
    const isDST = now.getTimezoneOffset() < Math.max(
      new Date(now.getFullYear(), 0, 1).getTimezoneOffset(),
      new Date(now.getFullYear(), 6, 1).getTimezoneOffset()
    );
    const ctOffset = isDST ? 5 : 6;
    const ctHour = (utcHour - ctOffset + 24) % 24;
    const ctDay = utcHour < ctOffset ? (utcDay + 6) % 7 : utcDay;

    if (ctDay === 6) return { isOpen: false, message: 'Market closed (Saturday)' };
    if (ctDay === 0 && ctHour < 17) return { isOpen: false, message: 'Market opens Sunday 5:00 PM CT' };
    if (ctDay === 5 && ctHour >= 16) return { isOpen: false, message: 'Market closed (Friday after 4PM CT)' };
    if (ctHour === 16 && ctDay >= 1 && ctDay <= 4) return { isOpen: false, message: 'Daily maintenance (4:00-5:00 PM CT)' };
    return { isOpen: true, message: 'Market is open' };
  }

  async disconnect() {
    if (this.orderConn) {
      await this.orderConn.disconnect();
      this.orderConn = null;
    }
    if (this.pnlConn) {
      await this.pnlConn.disconnect();
      this.pnlConn = null;
    }
    this.accounts = [];
    this.accountPnL.clear();
    this.positions.clear();
    this.orders = [];
    this.loginInfo = null;
    this.user = null;
    this.credentials = null;
  }
}

module.exports = { RithmicService, RITHMIC_SYSTEMS, RITHMIC_ENDPOINTS };
