/**
 * Rithmic Service
 * Main service for Rithmic prop firm connections
 */

const EventEmitter = require('events');
const { RithmicConnection } = require('./connection');
const { proto, decodeAccountPnL, decodeInstrumentPnL } = require('./protobuf');
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
    this.positions = new Map(); // symbol -> position data (from InstrumentPnLPositionUpdate)
    this.orders = []; // Active orders
    this.user = null;
    this.credentials = null; // Store for PNL connection
  }

  /**
   * Get PropFirm configuration
   * Note: Apex and other prop firms use the Chicago gateway (rprotocol.rithmic.com), NOT Paper Trading endpoint
   */
  getPropFirmConfig(key) {
    const propfirms = {
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
    return propfirms[key] || { name: key, systemName: 'Rithmic Paper Trading', defaultBalance: 150000, gateway: RITHMIC_ENDPOINTS.PAPER };
  }

  /**
   * Login to Rithmic
   */
  async login(username, password) {
    try {
      // Connect to ORDER_PLANT
      this.orderConn = new RithmicConnection();
      
      // Use propfirm-specific gateway (Chicago for Apex and most prop firms)
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

      // Setup message handler for ORDER_PLANT
      this.orderConn.on('message', (msg) => this.handleOrderMessage(msg));

      // Login
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Login timeout - server did not respond' });
        }, 30000);

        this.orderConn.once('loggedIn', async (data) => {
          clearTimeout(timeout);
          this.loginInfo = data;
          this.user = { userName: username, fcmId: data.fcmId, ibId: data.ibId };
          
          // Try to get accounts but don't fail if it doesn't work
          try {
            await this.fetchAccounts();
          } catch (e) {
            // Accounts fetch failed, ignore
          }
          
          // Create default account if none found
          if (this.accounts.length === 0) {
            this.accounts = [{
              accountId: username,
              accountName: username,
              fcmId: data.fcmId,
              ibId: data.ibId,
            }];
          }
          
          // Store credentials for PNL connection
          this.credentials = { username, password };
          
          // Format accounts for response
          const formattedAccounts = this.accounts.map(acc => ({
            accountId: acc.accountId,
            accountName: acc.accountName || acc.accountId,
            balance: this.propfirm.defaultBalance,
            startingBalance: this.propfirm.defaultBalance,
            profitAndLoss: 0,
            status: 0
          }));
          
          resolve({ 
            success: true, 
            user: this.user,
            accounts: formattedAccounts
          });
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

      // Use propfirm-specific gateway (Chicago for Apex and most prop firms)
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
   * Note: Rithmic often fails to return accounts, so we use a short timeout
   */
  async fetchAccounts() {
    if (!this.orderConn || !this.loginInfo) {
      return [];
    }

    // Quick timeout - don't wait too long for accounts
    return new Promise((resolve) => {
      const accounts = [];
      
      const timeout = setTimeout(() => {
        this.accounts = accounts;
        resolve(accounts);
      }, 2000); // 2 seconds max

      this.once('accountReceived', (account) => {
        accounts.push(account);
      });

      this.once('accountListComplete', () => {
        clearTimeout(timeout);
        this.accounts = accounts;
        resolve(accounts);
      });

      // Request account list
      try {
        this.orderConn.send('RequestAccountList', {
          templateId: REQ.ACCOUNT_LIST,
          userMsg: ['HQX'],
          fcmId: this.loginInfo.fcmId,
          ibId: this.loginInfo.ibId,
        });
      } catch (e) {
        clearTimeout(timeout);
        resolve([]);
      }
    });
  }

  /**
   * Get trading accounts (formatted like ProjectX)
   */
  async getTradingAccounts() {
    // Only try to fetch if we don't have accounts yet
    if (this.accounts.length === 0 && this.orderConn && this.loginInfo) {
      try {
        await this.fetchAccounts();
      } catch (e) {
        // Ignore fetch errors
      }
    }

    let tradingAccounts = this.accounts.map((acc, index) => {
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

    // If no accounts but user is logged in, create a default account from login info
    if (tradingAccounts.length === 0 && this.user) {
      const userName = this.user.userName || 'Unknown';
      tradingAccounts = [{
        accountId: this.hashAccountId(userName),
        rithmicAccountId: userName,
        accountName: userName,
        name: userName,
        balance: this.propfirm.defaultBalance,
        startingBalance: this.propfirm.defaultBalance,
        profitAndLoss: 0,
        status: 0, // Active
        platform: 'Rithmic',
        propfirm: this.propfirm.name,
      }];
    }

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
      case RES.SHOW_ORDERS:
        this.onShowOrdersResponse(data);
        break;
      case STREAM.EXCHANGE_NOTIFICATION:
        this.onExchangeNotification(data);
        break;
      case STREAM.ORDER_NOTIFICATION:
        this.onOrderNotification(data);
        break;
    }
  }

  onShowOrdersResponse(data) {
    try {
      const res = proto.decode('ResponseShowOrders', data);
      if (res.rpCode?.[0] === '0') {
        // End of orders list
        this.emit('ordersReceived');
      }
    } catch (e) {
      // Ignore
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
    // Handle instrument-level PnL - this contains position data
    try {
      const pos = decodeInstrumentPnL(data);
      if (pos.symbol && pos.accountId) {
        const key = `${pos.accountId}:${pos.symbol}:${pos.exchange}`;
        // Net quantity can come from netQuantity field or calculated from buy/sell
        const netQty = pos.netQuantity || pos.openPositionQuantity || ((pos.buyQty || 0) - (pos.sellQty || 0));
        
        if (netQty !== 0) {
          // We have an open position
          this.positions.set(key, {
            accountId: pos.accountId,
            symbol: pos.symbol,
            exchange: pos.exchange || 'CME',
            quantity: netQty,
            averagePrice: pos.avgOpenFillPrice || 0,
            openPnl: parseFloat(pos.openPositionPnl || pos.dayOpenPnl || 0),
            closedPnl: parseFloat(pos.closedPositionPnl || pos.dayClosedPnl || 0),
            dayPnl: parseFloat(pos.dayPnl || 0),
            isSnapshot: pos.isSnapshot || false,
          });
        } else {
          // Position closed
          this.positions.delete(key);
        }
        
        this.emit('positionUpdate', this.positions.get(key));
      }
    } catch (e) {
      // Ignore decode errors
    }
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
   * Get positions via PNL_PLANT
   * Positions are streamed via InstrumentPnLPositionUpdate (template 450)
   */
  async getPositions() {
    // If PNL connection not established, try to connect
    if (!this.pnlConn && this.credentials) {
      await this.connectPnL(this.credentials.username, this.credentials.password);
      // Request snapshot to populate positions
      await this.requestPnLSnapshot();
    }
    
    // Return cached positions
    const positions = Array.from(this.positions.values()).map(pos => ({
      symbol: pos.symbol,
      exchange: pos.exchange,
      quantity: pos.quantity,
      averagePrice: pos.averagePrice,
      unrealizedPnl: pos.openPnl,
      realizedPnl: pos.closedPnl,
      side: pos.quantity > 0 ? 'LONG' : 'SHORT',
    }));
    
    return { success: true, positions };
  }

  /**
   * Get orders via ORDER_PLANT
   * Uses RequestShowOrders (template 320) -> ResponseShowOrders (template 321)
   */
  async getOrders() {
    if (!this.orderConn || !this.loginInfo) {
      return { success: true, orders: [] };
    }

    return new Promise((resolve) => {
      const orders = [];
      const timeout = setTimeout(() => {
        resolve({ success: true, orders });
      }, 3000);

      // Listen for order notifications
      const orderHandler = (notification) => {
        // RithmicOrderNotification contains order details
        if (notification.orderId) {
          orders.push({
            orderId: notification.orderId,
            symbol: notification.symbol,
            exchange: notification.exchange,
            side: notification.transactionType === 1 ? 'BUY' : 'SELL',
            quantity: notification.quantity,
            filledQuantity: notification.filledQuantity || 0,
            price: notification.price,
            orderType: notification.orderType,
            status: notification.status,
          });
        }
      };

      this.once('ordersReceived', () => {
        clearTimeout(timeout);
        this.removeListener('orderNotification', orderHandler);
        resolve({ success: true, orders });
      });

      this.on('orderNotification', orderHandler);

      // Send request
      try {
        for (const acc of this.accounts) {
          this.orderConn.send('RequestShowOrders', {
            templateId: REQ.SHOW_ORDERS,
            userMsg: ['HQX'],
            fcmId: acc.fcmId || this.loginInfo.fcmId,
            ibId: acc.ibId || this.loginInfo.ibId,
            accountId: acc.accountId,
          });
        }
      } catch (e) {
        clearTimeout(timeout);
        resolve({ success: false, error: e.message, orders: [] });
      }
    });
  }

  /**
   * Get lifetime stats (stub for Rithmic - not available via API)
   */
  async getLifetimeStats(accountId) {
    return { success: true, stats: null };
  }

  /**
   * Get daily stats (stub for Rithmic - not available via API)
   */
  async getDailyStats(accountId) {
    return { success: true, stats: [] };
  }

  /**
   * Get trade history (stub for Rithmic)
   */
  async getTradeHistory(accountId, days = 30) {
    return { success: true, trades: [] };
  }

  /**
   * Get market status
   */
  async getMarketStatus(accountId) {
    const marketHours = this.checkMarketHours();
    return {
      success: true,
      isOpen: marketHours.isOpen,
      message: marketHours.message,
    };
  }

  /**
   * Get token (stub - Rithmic uses WebSocket, not tokens)
   */
  getToken() {
    return this.loginInfo ? 'connected' : null;
  }

  /**
   * Search contracts (stub - would need TICKER_PLANT)
   */
  async searchContracts(searchText) {
    // Common futures contracts
    const contracts = [
      { symbol: 'ESH5', name: 'E-mini S&P 500 Mar 2025', exchange: 'CME' },
      { symbol: 'NQH5', name: 'E-mini NASDAQ-100 Mar 2025', exchange: 'CME' },
      { symbol: 'CLH5', name: 'Crude Oil Mar 2025', exchange: 'NYMEX' },
      { symbol: 'GCG5', name: 'Gold Feb 2025', exchange: 'COMEX' },
      { symbol: 'MESH5', name: 'Micro E-mini S&P 500 Mar 2025', exchange: 'CME' },
      { symbol: 'MNQH5', name: 'Micro E-mini NASDAQ-100 Mar 2025', exchange: 'CME' },
    ];
    const search = searchText.toUpperCase();
    return contracts.filter(c => c.symbol.includes(search) || c.name.toUpperCase().includes(search));
  }

  /**
   * Place order via ORDER_PLANT
   */
  async placeOrder(orderData) {
    if (!this.orderConn || !this.loginInfo) {
      return { success: false, error: 'Not connected' };
    }

    try {
      this.orderConn.send('RequestNewOrder', {
        templateId: REQ.NEW_ORDER,
        userMsg: ['HQX'],
        fcmId: this.loginInfo.fcmId,
        ibId: this.loginInfo.ibId,
        accountId: orderData.accountId,
        symbol: orderData.symbol,
        exchange: orderData.exchange || 'CME',
        quantity: orderData.size,
        transactionType: orderData.side === 0 ? 1 : 2, // 1=Buy, 2=Sell
        duration: 1, // DAY
        orderType: orderData.type === 2 ? 1 : 2, // 1=Market, 2=Limit
        price: orderData.price || 0,
      });

      return { success: true, message: 'Order submitted' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId) {
    if (!this.orderConn || !this.loginInfo) {
      return { success: false, error: 'Not connected' };
    }

    try {
      this.orderConn.send('RequestCancelOrder', {
        templateId: REQ.CANCEL_ORDER,
        userMsg: ['HQX'],
        fcmId: this.loginInfo.fcmId,
        ibId: this.loginInfo.ibId,
        orderId: orderId,
      });

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Close position (market order to flatten)
   */
  async closePosition(accountId, symbol) {
    // Get current position
    const positions = Array.from(this.positions.values());
    const position = positions.find(p => p.accountId === accountId && p.symbol === symbol);

    if (!position) {
      return { success: false, error: 'Position not found' };
    }

    // Place opposite order
    return this.placeOrder({
      accountId,
      symbol,
      exchange: position.exchange,
      size: Math.abs(position.quantity),
      side: position.quantity > 0 ? 1 : 0, // Sell if long, Buy if short
      type: 2, // Market
    });
  }

  /**
   * Get order history
   * Uses RequestShowOrderHistorySummary (template 324)
   */
  async getOrderHistory(date) {
    if (!this.orderConn || !this.loginInfo) {
      return { success: true, orders: [] };
    }

    // Default to today
    const dateStr = date || new Date().toISOString().slice(0, 10).replace(/-/g, '');
    
    return new Promise((resolve) => {
      const orders = [];
      const timeout = setTimeout(() => {
        resolve({ success: true, orders });
      }, 3000);

      try {
        for (const acc of this.accounts) {
          this.orderConn.send('RequestShowOrderHistorySummary', {
            templateId: REQ.SHOW_ORDER_HISTORY,
            userMsg: ['HQX'],
            fcmId: acc.fcmId || this.loginInfo.fcmId,
            ibId: acc.ibId || this.loginInfo.ibId,
            accountId: acc.accountId,
            date: dateStr,
          });
        }
        
        // Wait for response
        setTimeout(() => {
          clearTimeout(timeout);
          resolve({ success: true, orders });
        }, 2000);
      } catch (e) {
        clearTimeout(timeout);
        resolve({ success: false, error: e.message, orders: [] });
      }
    });
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
    this.positions.clear();
    this.orders = [];
    this.loginInfo = null;
    this.user = null;
    this.credentials = null;
  }
}

module.exports = { RithmicService, RITHMIC_SYSTEMS, RITHMIC_ENDPOINTS };
