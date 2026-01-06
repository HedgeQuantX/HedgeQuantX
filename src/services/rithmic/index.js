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
   * Get trade history from Rithmic API
   * @param {string} accountId - Optional account filter
   * @param {number} days - Number of days to look back (default 30)
   */
  async getTradeHistory(accountId, days = 30) {
    // Fetch from API
    const result = await getTradeHistoryFull(this, days);
    
    if (!result.success) {
      return { success: false, trades: [] };
    }
    
    let trades = result.trades || [];
    
    // Filter by account if specified
    if (accountId) {
      trades = trades.filter(t => t.accountId === accountId);
    }
    
    // Add timestamp from fillDate/fillTime if not present
    trades = trades.map(t => ({
      ...t,
      timestamp: t.timestamp || this._parseDateTime(t.fillDate, t.fillTime),
    }));
    
    // Sort by timestamp descending (newest first)
    trades.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    return { success: true, trades };
  }
  
  /**
   * Parse Rithmic date/time to timestamp
   * @private
   */
  _parseDateTime(dateStr, timeStr) {
    if (!dateStr) return Date.now();
    try {
      // dateStr format: YYYYMMDD, timeStr format: HH:MM:SS
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const time = timeStr || '00:00:00';
      return new Date(`${year}-${month}-${day}T${time}Z`).getTime();
    } catch (e) {
      return Date.now();
    }
  }
  
  /**
   * Get lifetime stats calculated from trade history
   */
  async getLifetimeStats(accountId) {
    const { trades } = await this.getTradeHistory(accountId, 365);
    
    if (trades.length === 0) {
      return { success: true, stats: null };
    }
    
    // Calculate stats from trades
    let totalTrades = trades.length;
    let winningTrades = 0;
    let losingTrades = 0;
    let totalProfit = 0;
    let totalLoss = 0;
    let longTrades = 0;
    let shortTrades = 0;
    let totalVolume = 0;
    
    // Group fills by basketId to calculate P&L per trade
    const tradeGroups = new Map();
    for (const trade of trades) {
      const key = trade.basketId || trade.id;
      if (!tradeGroups.has(key)) {
        tradeGroups.set(key, []);
      }
      tradeGroups.get(key).push(trade);
    }
    
    for (const [, fills] of tradeGroups) {
      const firstFill = fills[0];
      totalVolume += fills.reduce((sum, f) => sum + f.size, 0);
      
      if (firstFill.side === 1) longTrades++;
      else if (firstFill.side === 2) shortTrades++;
      
      // P&L calculation requires entry/exit matching which needs position tracking
      // For now, count trades
      totalTrades = tradeGroups.size;
    }
    
    const stats = {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate: totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(2) : 0,
      totalProfit,
      totalLoss,
      netPnL: totalProfit - totalLoss,
      longTrades,
      shortTrades,
      totalVolume,
    };
    
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
