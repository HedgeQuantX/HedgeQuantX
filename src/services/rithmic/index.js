/**
 * Rithmic Service
 * Main service for Rithmic prop firm connections
 */

const EventEmitter = require('events');
const { RithmicConnection } = require('./connection');
const { proto, decodeAccountPnL } = require('./protobuf');
const { RITHMIC_ENDPOINTS, RITHMIC_SYSTEMS, REQ, RES, STREAM } = require('./constants');

class RithmicService extends EventEmitter {
  constructor(propfirmKey) {
    super();
    this.propfirmKey = propfirmKey;
    this.propfirm = this.getPropFirmConfig(propfirmKey);
    this.orderConn = null;
    this.pnlConn = null;
    this.loginInfo = null;
    this.accounts = [];
    this.accountPnL = new Map(); // accountId -> pnl data
    this.user = null;
  }

  /**
   * Get PropFirm configuration
   */
  getPropFirmConfig(key) {
    const propfirms = {
      'apex': { name: 'Apex Trader Funding', systemName: RITHMIC_SYSTEMS.APEX, defaultBalance: 300000 },
      'topstep_r': { name: 'Topstep (Rithmic)', systemName: RITHMIC_SYSTEMS.TOPSTEP, defaultBalance: 150000 },
      'bulenox_r': { name: 'Bulenox (Rithmic)', systemName: RITHMIC_SYSTEMS.BULENOX, defaultBalance: 150000 },
      'earn2trade': { name: 'Earn2Trade', systemName: RITHMIC_SYSTEMS.EARN_2_TRADE, defaultBalance: 150000 },
      'mescapital': { name: 'MES Capital', systemName: RITHMIC_SYSTEMS.MES_CAPITAL, defaultBalance: 150000 },
      'tradefundrr': { name: 'TradeFundrr', systemName: RITHMIC_SYSTEMS.TRADEFUNDRR, defaultBalance: 150000 },
      'thetradingpit': { name: 'The Trading Pit', systemName: RITHMIC_SYSTEMS.THE_TRADING_PIT, defaultBalance: 150000 },
      'fundedfutures': { name: 'Funded Futures Network', systemName: RITHMIC_SYSTEMS.FUNDED_FUTURES_NETWORK, defaultBalance: 150000 },
      'propshop': { name: 'PropShop Trader', systemName: RITHMIC_SYSTEMS.PROPSHOP_TRADER, defaultBalance: 150000 },
      '4proptrader': { name: '4PropTrader', systemName: RITHMIC_SYSTEMS.FOUR_PROP_TRADER, defaultBalance: 150000 },
      'daytraders': { name: 'DayTraders.com', systemName: RITHMIC_SYSTEMS.DAY_TRADERS, defaultBalance: 150000 },
      '10xfutures': { name: '10X Futures', systemName: RITHMIC_SYSTEMS.TEN_X_FUTURES, defaultBalance: 150000 },
      'lucidtrading': { name: 'Lucid Trading', systemName: RITHMIC_SYSTEMS.LUCID_TRADING, defaultBalance: 150000 },
      'thrivetrading': { name: 'Thrive Trading', systemName: RITHMIC_SYSTEMS.THRIVE_TRADING, defaultBalance: 150000 },
      'legendstrading': { name: 'Legends Trading', systemName: RITHMIC_SYSTEMS.LEGENDS_TRADING, defaultBalance: 150000 },
    };
    return propfirms[key] || { name: key, systemName: 'Rithmic Paper Trading', defaultBalance: 150000 };
  }

  /**
   * Login to Rithmic
   */
  async login(username, password) {
    try {
      // Connect to ORDER_PLANT
      this.orderConn = new RithmicConnection();
      
      const config = {
        uri: RITHMIC_ENDPOINTS.PAPER,
        systemName: this.propfirm.systemName,
        userId: username,
        password: password,
        appName: 'HQX-CLI',
        appVersion: '1.0.0',
      };

      await this.orderConn.connect(config);

      // Setup message handler for ORDER_PLANT
      this.orderConn.on('message', (msg) => this.handleOrderMessage(msg));

      // Login
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Login timeout'));
        }, 15000);

        this.orderConn.once('loggedIn', async (data) => {
          clearTimeout(timeout);
          this.loginInfo = data;
          this.user = { userName: username };
          
          try {
            // Get accounts
            await this.fetchAccounts();
            resolve({ success: true });
          } catch (e) {
            resolve({ success: false, error: e.message });
          }
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

      const config = {
        uri: RITHMIC_ENDPOINTS.PAPER,
        systemName: this.propfirm.systemName,
        userId: username,
        password: password,
        appName: 'HQX-CLI',
        appVersion: '1.0.0',
      };

      await this.pnlConn.connect(config);
      this.pnlConn.on('message', (msg) => this.handlePnLMessage(msg));

      return new Promise((resolve, reject) => {
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

  /**
   * Fetch accounts from ORDER_PLANT
   */
  async fetchAccounts() {
    if (!this.orderConn || !this.loginInfo) {
      throw new Error('Not connected');
    }

    // Request login info first
    await this.requestLoginInfo();

    // Then request accounts
    return new Promise((resolve, reject) => {
      const accounts = [];
      let completed = false;

      const timeout = setTimeout(() => {
        if (!completed) {
          completed = true;
          this.accounts = accounts;
          resolve(accounts);
        }
      }, 5000);

      const handleAccount = (account) => {
        accounts.push(account);
      };

      this.once('accountReceived', handleAccount);
      this.once('accountListComplete', () => {
        if (!completed) {
          completed = true;
          clearTimeout(timeout);
          this.accounts = accounts;
          resolve(accounts);
        }
      });

      // Request account list
      this.orderConn.send('RequestAccountList', {
        templateId: REQ.ACCOUNT_LIST,
        userMsg: ['HQX'],
        fcmId: this.loginInfo.fcmId,
        ibId: this.loginInfo.ibId,
      });
    });
  }

  /**
   * Request login info
   */
  async requestLoginInfo() {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(), 3000);

      this.once('loginInfoReceived', (info) => {
        clearTimeout(timeout);
        this.loginInfo = { ...this.loginInfo, ...info };
        resolve(info);
      });

      this.orderConn.send('RequestLoginInfo', {
        templateId: REQ.LOGIN_INFO,
        userMsg: ['HQX'],
      });
    });
  }

  /**
   * Get trading accounts (formatted like ProjectX)
   */
  async getTradingAccounts() {
    if (this.accounts.length === 0) {
      await this.fetchAccounts();
    }

    const tradingAccounts = this.accounts.map((acc, index) => {
      const pnl = this.accountPnL.get(acc.accountId) || {};
      const balance = parseFloat(pnl.accountBalance || pnl.marginBalance || pnl.cashOnHand || 0) || this.propfirm.defaultBalance;
      const startingBalance = this.propfirm.defaultBalance;
      const profitAndLoss = balance - startingBalance;

      return {
        accountId: this.hashAccountId(acc.accountId),
        rithmicAccountId: acc.accountId,
        accountName: acc.accountName || acc.accountId,
        name: acc.accountName || acc.accountId,
        balance: balance,
        startingBalance: startingBalance,
        profitAndLoss: profitAndLoss,
        status: 0, // Active
        platform: 'Rithmic',
        propfirm: this.propfirm.name,
      };
    });

    return { success: true, accounts: tradingAccounts };
  }

  /**
   * Request PnL snapshot for accounts
   */
  async requestPnLSnapshot() {
    if (!this.pnlConn || !this.loginInfo) return;

    for (const acc of this.accounts) {
      this.pnlConn.send('RequestPnLPositionSnapshot', {
        templateId: REQ.PNL_POSITION_SNAPSHOT,
        userMsg: ['HQX'],
        fcmId: acc.fcmId || this.loginInfo.fcmId,
        ibId: acc.ibId || this.loginInfo.ibId,
        accountId: acc.accountId,
      });
    }

    // Wait for responses
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Subscribe to PnL updates
   */
  subscribePnLUpdates() {
    if (!this.pnlConn || !this.loginInfo) return;

    for (const acc of this.accounts) {
      this.pnlConn.send('RequestPnLPositionUpdates', {
        templateId: REQ.PNL_POSITION_UPDATES,
        userMsg: ['HQX'],
        request: 1, // Subscribe
        fcmId: acc.fcmId || this.loginInfo.fcmId,
        ibId: acc.ibId || this.loginInfo.ibId,
        accountId: acc.accountId,
      });
    }
  }

  /**
   * Handle ORDER_PLANT messages
   */
  handleOrderMessage(msg) {
    const { templateId, data } = msg;

    switch (templateId) {
      case RES.LOGIN_INFO:
        this.onLoginInfo(data);
        break;
      case RES.ACCOUNT_LIST:
        this.onAccountList(data);
        break;
      case RES.TRADE_ROUTES:
        this.onTradeRoutes(data);
        break;
      case STREAM.EXCHANGE_NOTIFICATION:
        this.onExchangeNotification(data);
        break;
      case STREAM.ORDER_NOTIFICATION:
        this.onOrderNotification(data);
        break;
    }
  }

  /**
   * Handle PNL_PLANT messages
   */
  handlePnLMessage(msg) {
    const { templateId, data } = msg;

    switch (templateId) {
      case RES.PNL_POSITION_SNAPSHOT:
      case RES.PNL_POSITION_UPDATES:
        // OK response
        break;
      case STREAM.ACCOUNT_PNL_UPDATE:
        this.onAccountPnLUpdate(data);
        break;
      case STREAM.INSTRUMENT_PNL_UPDATE:
        this.onInstrumentPnLUpdate(data);
        break;
    }
  }

  onLoginInfo(data) {
    try {
      const res = proto.decode('ResponseLoginInfo', data);
      this.emit('loginInfoReceived', {
        fcmId: res.fcmId,
        ibId: res.ibId,
        firstName: res.firstName,
        lastName: res.lastName,
        userType: res.userType,
      });
    } catch (e) {
      // Ignore
    }
  }

  onAccountList(data) {
    try {
      const res = proto.decode('ResponseAccountList', data);
      
      if (res.rpCode?.[0] === '0') {
        // End of list
        this.emit('accountListComplete');
      } else if (res.accountId) {
        const account = {
          fcmId: res.fcmId,
          ibId: res.ibId,
          accountId: res.accountId,
          accountName: res.accountName,
          accountCurrency: res.accountCurrency,
        };
        this.accounts.push(account);
        this.emit('accountReceived', account);
      }
    } catch (e) {
      // Ignore
    }
  }

  onTradeRoutes(data) {
    try {
      const res = proto.decode('ResponseTradeRoutes', data);
      this.emit('tradeRoutes', res);
    } catch (e) {
      // Ignore
    }
  }

  onAccountPnLUpdate(data) {
    try {
      const pnl = decodeAccountPnL(data);
      if (pnl.accountId) {
        this.accountPnL.set(pnl.accountId, {
          accountBalance: parseFloat(pnl.accountBalance || 0),
          cashOnHand: parseFloat(pnl.cashOnHand || 0),
          marginBalance: parseFloat(pnl.marginBalance || 0),
          openPositionPnl: parseFloat(pnl.openPositionPnl || 0),
          closedPositionPnl: parseFloat(pnl.closedPositionPnl || 0),
          dayPnl: parseFloat(pnl.dayPnl || 0),
        });
        this.emit('pnlUpdate', pnl);
      }
    } catch (e) {
      // Ignore
    }
  }

  onInstrumentPnLUpdate(data) {
    // Handle instrument-level PnL if needed
  }

  onExchangeNotification(data) {
    this.emit('exchangeNotification', data);
  }

  onOrderNotification(data) {
    this.emit('orderNotification', data);
  }

  /**
   * Hash account ID to numeric (for compatibility)
   */
  hashAccountId(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Get user info
   */
  async getUser() {
    return this.user;
  }

  /**
   * Check market hours (same as ProjectX)
   */
  checkMarketHours() {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();
    const utcTime = utcHour * 60 + utcMinute;

    // CME Futures: Sunday 5PM CT - Friday 4PM CT
    // CT = UTC-6 (CST) or UTC-5 (CDT)
    const ctOffset = this.isDST(now) ? 5 : 6;
    const ctHour = (utcHour - ctOffset + 24) % 24;
    const ctDay = utcHour < ctOffset ? (utcDay + 6) % 7 : utcDay;

    // Market closed Saturday all day
    if (ctDay === 6) {
      return { isOpen: false, message: 'Market closed (Saturday)' };
    }

    // Sunday before 5PM CT
    if (ctDay === 0 && ctHour < 17) {
      return { isOpen: false, message: 'Market opens Sunday 5:00 PM CT' };
    }

    // Friday after 4PM CT
    if (ctDay === 5 && ctHour >= 16) {
      return { isOpen: false, message: 'Market closed (Friday after 4PM CT)' };
    }

    // Daily maintenance 4PM-5PM CT (Mon-Thu)
    if (ctHour === 16 && ctDay >= 1 && ctDay <= 4) {
      return { isOpen: false, message: 'Daily maintenance (4:00-5:00 PM CT)' };
    }

    return { isOpen: true, message: 'Market is open' };
  }

  isDST(date) {
    const jan = new Date(date.getFullYear(), 0, 1);
    const jul = new Date(date.getFullYear(), 6, 1);
    const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    return date.getTimezoneOffset() < stdOffset;
  }

  /**
   * Disconnect all connections
   */
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
    this.loginInfo = null;
    this.user = null;
  }
}

module.exports = { RithmicService, RITHMIC_SYSTEMS, RITHMIC_ENDPOINTS };
