/**
 * @fileoverview Rithmic Service - Main service for Rithmic prop firm connections
 * @module services/rithmic
 * 
 * NO FAKE DATA - Only real values from Rithmic API
 */

const EventEmitter = require('events');
const { RithmicConnection } = require('./connection');
const { RITHMIC_ENDPOINTS, RITHMIC_SYSTEMS } = require('./constants');
const { createOrderHandler, createPnLHandler } = require('./handlers');
const {
  fetchAccounts,
  getTradingAccounts,
  requestPnLSnapshot,
  subscribePnLUpdates,
  getPositions,
} = require('./accounts');
const { placeOrder, cancelOrder, getOrders, getOrderHistory, getOrderHistoryDates, getTradeHistoryFull, closePosition } = require('./orders');
const { fillsToRoundTrips, calculateTradeStats } = require('./trades');
const { getContracts, searchContracts } = require('./contracts');
const { TIMEOUTS } = require('../../config/settings');
const { logger } = require('../../utils/logger');

const log = logger.scope('Rithmic');

/** PropFirm configurations */
const PROPFIRM_CONFIGS = {
  apex: { name: 'Apex Trader Funding', systemName: 'Apex', gateway: RITHMIC_ENDPOINTS.CHICAGO },
  apex_rithmic: { name: 'Apex Trader Funding', systemName: 'Apex', gateway: RITHMIC_ENDPOINTS.CHICAGO },
  topstep_r: { name: 'Topstep (Rithmic)', systemName: RITHMIC_SYSTEMS.TOPSTEP, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  bulenox_r: { name: 'Bulenox (Rithmic)', systemName: RITHMIC_SYSTEMS.BULENOX, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  earn2trade: { name: 'Earn2Trade', systemName: RITHMIC_SYSTEMS.EARN_2_TRADE, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  mescapital: { name: 'MES Capital', systemName: RITHMIC_SYSTEMS.MES_CAPITAL, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  tradefundrr: { name: 'TradeFundrr', systemName: RITHMIC_SYSTEMS.TRADEFUNDRR, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  thetradingpit: { name: 'The Trading Pit', systemName: RITHMIC_SYSTEMS.THE_TRADING_PIT, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  fundedfutures: { name: 'Funded Futures Network', systemName: RITHMIC_SYSTEMS.FUNDED_FUTURES_NETWORK, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  propshop: { name: 'PropShop Trader', systemName: RITHMIC_SYSTEMS.PROPSHOP_TRADER, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  '4proptrader': { name: '4PropTrader', systemName: RITHMIC_SYSTEMS.FOUR_PROP_TRADER, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  daytraders: { name: 'DayTraders.com', systemName: RITHMIC_SYSTEMS.DAY_TRADERS, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  '10xfutures': { name: '10X Futures', systemName: RITHMIC_SYSTEMS.TEN_X_FUTURES, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  lucidtrading: { name: 'Lucid Trading', systemName: RITHMIC_SYSTEMS.LUCID_TRADING, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  thrivetrading: { name: 'Thrive Trading', systemName: RITHMIC_SYSTEMS.THRIVE_TRADING, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  legendstrading: { name: 'Legends Trading', systemName: RITHMIC_SYSTEMS.LEGENDS_TRADING, gateway: RITHMIC_ENDPOINTS.CHICAGO },
  // Rithmic Paper Trading - uses CHICAGO endpoint
  rithmic_paper: { name: 'Rithmic Paper Trading', systemName: RITHMIC_SYSTEMS.PAPER, gateway: RITHMIC_ENDPOINTS.CHICAGO },
};

/**
 * Rithmic Service for prop firm trading
 */
class RithmicService extends EventEmitter {
  constructor(propfirmKey) {
    super();
    this.propfirmKey = propfirmKey;
    this.propfirm = PROPFIRM_CONFIGS[propfirmKey] || {
      name: propfirmKey,
      systemName: 'Rithmic Paper Trading',
      gateway: RITHMIC_ENDPOINTS.PAPER,
    };
    
    // Connections
    this.orderConn = null;
    this.pnlConn = null;
    this.tickerConn = null;
    
    // State
    this.loginInfo = null;
    this.accounts = [];
    this.accountPnL = new Map();
    this.positions = new Map();
    this.orders = [];
    this.user = null;
    this.credentials = null;
    
    // Cache
    this._contractsCache = null;
    this._contractsCacheTime = 0;
    
    // Trades history (captured from ExchangeOrderNotification fills)
    this.trades = [];
  }

  // ==================== AUTH ====================

  async login(username, password) {
    try {
      this.orderConn = new RithmicConnection();
      
      const config = {
        uri: this.propfirm.gateway || RITHMIC_ENDPOINTS.CHICAGO,
        systemName: this.propfirm.systemName,
        userId: username,
        password,
        appName: 'HQX-CLI',
        appVersion: '2.0.0',
      };

      await this.orderConn.connect(config);
      this.orderConn.on('message', createOrderHandler(this));

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Login timeout - server did not respond' });
        }, TIMEOUTS.RITHMIC_LOGIN);

        this.orderConn.once('loggedIn', async (data) => {
          clearTimeout(timeout);
          this.loginInfo = data;
          this.user = { userName: username, fcmId: data.fcmId, ibId: data.ibId };
          
          try {
            await fetchAccounts(this);
            log.debug('Fetched accounts', { count: this.accounts.length });
          } catch (err) {
            log.warn('Failed to fetch accounts', { error: err.message });
          }
          
          this.credentials = { username, password };
          
          try {
            const pnlConnected = await this.connectPnL(username, password);
            if (pnlConnected && this.pnlConn) {
              await requestPnLSnapshot(this);
              subscribePnLUpdates(this);
            }
          } catch (err) {
            log.warn('PnL connection failed', { error: err.message });
          }
          
          const result = await getTradingAccounts(this);
          log.info('Login successful', { accounts: result.accounts.length });
          
          resolve({ success: true, user: this.user, accounts: result.accounts });
        });

        this.orderConn.once('loginFailed', (data) => {
          clearTimeout(timeout);
          log.warn('Login failed', { error: data.message });
          resolve({ success: false, error: data.message || 'Login failed' });
        });

        this.orderConn.login('ORDER_PLANT');
      });
    } catch (err) {
      log.error('Login error', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  async connectPnL(username, password) {
    try {
      this.pnlConn = new RithmicConnection();
      
      const config = {
        uri: this.propfirm.gateway || RITHMIC_ENDPOINTS.CHICAGO,
        systemName: this.propfirm.systemName,
        userId: username,
        password,
        appName: 'HQX-CLI',
        appVersion: '2.0.0',
      };

      await this.pnlConn.connect(config);
      this.pnlConn.on('message', createPnLHandler(this));

      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), TIMEOUTS.RITHMIC_PNL);

        this.pnlConn.once('loggedIn', () => {
          clearTimeout(timeout);
          log.debug('PNL_PLANT connected');
          resolve(true);
        });

        this.pnlConn.once('loginFailed', () => {
          clearTimeout(timeout);
          resolve(false);
        });

        this.pnlConn.login('PNL_PLANT');
      });
    } catch (err) {
      log.warn('PNL connection error', { error: err.message });
      return false;
    }
  }

  async connectTicker(username, password) {
    try {
      this.tickerConn = new RithmicConnection();
      
      const config = {
        uri: this.propfirm.gateway || RITHMIC_ENDPOINTS.CHICAGO,
        systemName: this.propfirm.systemName,
        userId: username,
        password,
        appName: 'HQX-CLI',
        appVersion: '2.0.0',
      };

      await this.tickerConn.connect(config);

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          log.debug('TICKER_PLANT timeout');
          resolve(false);
        }, TIMEOUTS.RITHMIC_TICKER);

        this.tickerConn.once('loggedIn', () => {
          clearTimeout(timeout);
          log.debug('TICKER_PLANT connected');
          resolve(true);
        });

        this.tickerConn.once('loginFailed', () => {
          clearTimeout(timeout);
          resolve(false);
        });

        this.tickerConn.login('TICKER_PLANT');
      });
    } catch (err) {
      log.warn('TICKER connection error', { error: err.message });
      return false;
    }
  }

  // ==================== DELEGATED METHODS ====================

  async getTradingAccounts() { return getTradingAccounts(this); }
  async getPositions() { return getPositions(this); }
  async getOrders() { return getOrders(this); }
  async getOrderHistory(date) { return getOrderHistory(this, date); }
  async getOrderHistoryDates() { return getOrderHistoryDates(this); }
  async getTradeHistoryFull(days) { return getTradeHistoryFull(this, days); }
  async placeOrder(orderData) { return placeOrder(this, orderData); }
  async cancelOrder(orderId) { return cancelOrder(this, orderId); }
  async closePosition(accountId, symbol) { return closePosition(this, accountId, symbol); }
  async getContracts() { return getContracts(this); }
  async searchContracts(searchText) { return searchContracts(this, searchText); }

  // ==================== STATS & HISTORY ====================

  async getUser() { return this.user; }
  
  /**
   * Get trade history from Rithmic API as round-trips
   * @param {string} accountId - Optional account filter
   * @param {number} days - Number of days to look back (default 30)
   */
  async getTradeHistory(accountId, days = 30) {
    // Fetch fills from API
    const result = await getTradeHistoryFull(this, days);
    
    if (!result.success) {
      return { success: false, trades: [] };
    }
    
    let fills = result.trades || [];
    
    // Filter by account if specified
    if (accountId) {
      fills = fills.filter(t => t.accountId === accountId);
    }
    
    // Convert fills to round-trips with P&L
    const roundTrips = fillsToRoundTrips(fills);
    
    return { success: true, trades: roundTrips };
  }
  
  /**
   * Get raw fills (not matched to round-trips)
   * @param {string} accountId - Optional account filter
   * @param {number} days - Number of days to look back (default 30)
   */
  async getRawFills(accountId, days = 30) {
    const result = await getTradeHistoryFull(this, days);
    
    if (!result.success) {
      return { success: false, fills: [] };
    }
    
    let fills = result.trades || [];
    
    if (accountId) {
      fills = fills.filter(t => t.accountId === accountId);
    }
    
    return { success: true, fills };
  }
  
  /**
   * Get lifetime stats calculated from trade history
   */
  async getLifetimeStats(accountId) {
    const { trades } = await this.getTradeHistory(accountId, 365);
    
    if (!trades || trades.length === 0) {
      return { success: true, stats: null };
    }
    
    // Calculate stats from round-trips
    const stats = calculateTradeStats(trades);
    
    return { success: true, stats };
  }
  
  /**
   * Get daily stats from trade history
   */
  async getDailyStats(accountId, days = 30) {
    const { trades } = await this.getTradeHistory(accountId, days);
    
    // Group by date
    const dailyStats = new Map();
    
    for (const trade of trades) {
      const date = new Date(trade.timestamp).toISOString().slice(0, 10);
      
      if (!dailyStats.has(date)) {
        dailyStats.set(date, {
          date,
          trades: 0,
          volume: 0,
          buys: 0,
          sells: 0,
        });
      }
      
      const day = dailyStats.get(date);
      day.trades++;
      day.volume += trade.size;
      if (trade.side === 1) day.buys++;
      else if (trade.side === 2) day.sells++;
    }
    
    // Convert to array and sort by date
    const stats = Array.from(dailyStats.values()).sort((a, b) => b.date.localeCompare(a.date));
    
    return { success: true, stats };
  }

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
      gateway: this.propfirm.gateway || RITHMIC_ENDPOINTS.CHICAGO,
    };
  }

  // ==================== MARKET HOURS ====================

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

  // ==================== CLEANUP ====================

  async disconnect() {
    const connections = [this.orderConn, this.pnlConn, this.tickerConn];
    
    for (const conn of connections) {
      if (conn) {
        try {
          await conn.disconnect();
        } catch (err) {
          log.warn('Disconnect error', { error: err.message });
        }
      }
    }

    this.orderConn = null;
    this.pnlConn = null;
    this.tickerConn = null;
    this.accounts = [];
    this.accountPnL.clear();
    this.positions.clear();
    this.orders = [];
    this.loginInfo = null;
    this.user = null;
    this.credentials = null;
    this._contractsCache = null;

    log.info('Disconnected');
  }
}

module.exports = { RithmicService, RITHMIC_SYSTEMS, RITHMIC_ENDPOINTS };
