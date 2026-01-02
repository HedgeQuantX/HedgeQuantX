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
  hashAccountId,
} = require('./accounts');
const { placeOrder, cancelOrder, getOrders, getOrderHistory, closePosition } = require('./orders');
const { decodeFrontMonthContract } = require('./protobuf');
const { TIMEOUTS, CACHE } = require('../../config/settings');
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
  /**
   * @param {string} propfirmKey - PropFirm identifier
   */
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
  }

  // ==================== AUTH ====================

  /**
   * Login to Rithmic
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<{success: boolean, user?: Object, accounts?: Array, error?: string}>}
   */
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
          
          // Fetch accounts
          try {
            await fetchAccounts(this);
            log.debug('Fetched accounts', { count: this.accounts.length });
          } catch (err) {
            log.warn('Failed to fetch accounts', { error: err.message });
          }
          
          // Store credentials for reconnection
          this.credentials = { username, password };
          
          // Connect to PNL_PLANT
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

  /**
   * Connect to PNL_PLANT for balance data
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<boolean>}
   */
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

  /**
   * Connect to TICKER_PLANT for symbol lookup
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Promise<boolean>}
   */
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
  async placeOrder(orderData) { return placeOrder(this, orderData); }
  async cancelOrder(orderId) { return cancelOrder(this, orderId); }
  async closePosition(accountId, symbol) { return closePosition(this, accountId, symbol); }

  // ==================== STUBS ====================

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
      gateway: this.propfirm.gateway || RITHMIC_ENDPOINTS.CHICAGO,
    };
  }

  // ==================== CONTRACTS ====================

  /**
   * Get all available contracts from Rithmic API
   * @returns {Promise<{success: boolean, contracts: Array, source?: string, error?: string}>}
   */
  async getContracts() {
    // Check cache
    if (this._contractsCache && Date.now() - this._contractsCacheTime < CACHE.CONTRACTS_TTL) {
      return { success: true, contracts: this._contractsCache, source: 'cache' };
    }

    if (!this.credentials) {
      return { success: false, error: 'Not logged in' };
    }

    try {
      // Connect to TICKER_PLANT if needed
      if (!this.tickerConn) {
        const connected = await this.connectTicker(this.credentials.username, this.credentials.password);
        if (!connected) {
          return { success: false, error: 'Failed to connect to TICKER_PLANT' };
        }
      }

      this.tickerConn.setMaxListeners(5000);

      log.debug('Fetching contracts from Rithmic API');
      const contracts = await this._fetchAllFrontMonths();

      if (!contracts.length) {
        return { success: false, error: 'No tradeable contracts found' };
      }

      // Cache results
      this._contractsCache = contracts;
      this._contractsCacheTime = Date.now();

      return { success: true, contracts, source: 'api' };
    } catch (err) {
      log.error('getContracts error', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  /**
   * Search contracts
   * @param {string} searchText - Search text
   * @returns {Promise<Array>}
   */
  async searchContracts(searchText) {
    const result = await this.getContracts();
    if (!searchText || !result.success) return result.contracts || [];
    
    const search = searchText.toUpperCase();
    return result.contracts.filter(c =>
      c.symbol.toUpperCase().includes(search) ||
      c.name.toUpperCase().includes(search)
    );
  }

  /**
   * Fetch all front month contracts from API
   * @private
   */
  async _fetchAllFrontMonths() {
    if (!this.tickerConn) {
      throw new Error('TICKER_PLANT not connected');
    }

    return new Promise((resolve) => {
      const contracts = new Map();
      const productsToCheck = new Map();

      // Handler for ProductCodes responses
      const productHandler = (msg) => {
        if (msg.templateId !== 112) return;
        
        const decoded = this._decodeProductCodes(msg.data);
        if (!decoded.productCode || !decoded.exchange) return;
        
        const validExchanges = ['CME', 'CBOT', 'NYMEX', 'COMEX', 'NYBOT', 'CFE'];
        if (!validExchanges.includes(decoded.exchange)) return;
        
        const name = (decoded.productName || '').toLowerCase();
        if (name.includes('option') || name.includes('swap') || name.includes('spread')) return;
        
        const key = `${decoded.productCode}:${decoded.exchange}`;
        if (!productsToCheck.has(key)) {
          productsToCheck.set(key, {
            productCode: decoded.productCode,
            productName: decoded.productName || decoded.productCode,
            exchange: decoded.exchange,
          });
        }
      };

      // Handler for FrontMonth responses
      const frontMonthHandler = (msg) => {
        if (msg.templateId !== 114) return;
        
        const decoded = decodeFrontMonthContract(msg.data);
        if (decoded.rpCode[0] === '0' && decoded.tradingSymbol) {
          contracts.set(decoded.userMsg, {
            symbol: decoded.tradingSymbol,
            baseSymbol: decoded.userMsg,
            exchange: decoded.exchange,
          });
        }
      };

      this.tickerConn.on('message', productHandler);
      this.tickerConn.on('message', frontMonthHandler);

      // Request all product codes
      this.tickerConn.send('RequestProductCodes', {
        templateId: 111,
        userMsg: ['get-products'],
      });

      // After timeout, request front months
      setTimeout(() => {
        this.tickerConn.removeListener('message', productHandler);
        log.debug('Collected products', { count: productsToCheck.size });

        for (const product of productsToCheck.values()) {
          this.tickerConn.send('RequestFrontMonthContract', {
            templateId: 113,
            userMsg: [product.productCode],
            symbol: product.productCode,
            exchange: product.exchange,
          });
        }

        // Collect results after timeout
        setTimeout(() => {
          this.tickerConn.removeListener('message', frontMonthHandler);

          const results = [];
          for (const [baseSymbol, contract] of contracts) {
            const productKey = `${baseSymbol}:${contract.exchange}`;
            const product = productsToCheck.get(productKey);

            // 100% API data - no static symbol info
            results.push({
              symbol: contract.symbol,
              baseSymbol,
              name: product?.productName || baseSymbol,
              exchange: contract.exchange,
              // All other data comes from API at runtime
            });
          }

          // Sort alphabetically by base symbol
          results.sort((a, b) => a.baseSymbol.localeCompare(b.baseSymbol));

          log.debug('Got contracts from API', { count: results.length });
          resolve(results);
        }, TIMEOUTS.RITHMIC_PRODUCTS);
      }, TIMEOUTS.RITHMIC_CONTRACTS);
    });
  }

  /**
   * Decode ProductCodes response
   * @private
   */
  _decodeProductCodes(buffer) {
    const result = {};
    let offset = 0;

    const readVarint = (buf, off) => {
      let value = 0;
      let shift = 0;
      while (off < buf.length) {
        const byte = buf[off++];
        value |= (byte & 0x7F) << shift;
        if (!(byte & 0x80)) break;
        shift += 7;
      }
      return [value, off];
    };

    const readString = (buf, off) => {
      const [len, newOff] = readVarint(buf, off);
      return [buf.slice(newOff, newOff + len).toString('utf8'), newOff + len];
    };

    while (offset < buffer.length) {
      try {
        const [tag, tagOff] = readVarint(buffer, offset);
        const wireType = tag & 0x7;
        const fieldNumber = tag >>> 3;
        offset = tagOff;

        if (wireType === 0) {
          const [, newOff] = readVarint(buffer, offset);
          offset = newOff;
        } else if (wireType === 2) {
          const [val, newOff] = readString(buffer, offset);
          offset = newOff;
          if (fieldNumber === 110101) result.exchange = val;
          if (fieldNumber === 100749) result.productCode = val;
          if (fieldNumber === 100003) result.productName = val;
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    return result;
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

  /**
   * Disconnect all connections
   */
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
