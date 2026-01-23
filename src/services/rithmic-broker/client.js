/**
 * RithmicBroker Client
 * 
 * Client for CLI to communicate with the RithmicBroker daemon.
 * Provides same interface as RithmicService for seamless integration.
 */

'use strict';

const WebSocket = require('ws');
const EventEmitter = require('events');
const { BROKER_PORT } = require('./daemon');
const manager = require('./manager');

/**
 * RithmicBroker Client - connects to daemon via WebSocket
 */
class RithmicBrokerClient extends EventEmitter {
  constructor(propfirmKey) {
    super();
    this.propfirmKey = propfirmKey;
    this.ws = null;
    this.connected = false;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.credentials = null;
    this.accounts = [];
    this.propfirm = { name: propfirmKey };
  }

  /**
   * Connect to daemon
   */
  async connect() {
    if (this.connected) return { success: true };
    
    // Ensure daemon is running
    const daemonStatus = await manager.ensureRunning();
    if (!daemonStatus.success) {
      return { success: false, error: daemonStatus.error || 'Failed to start daemon' };
    }
    
    return new Promise((resolve) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${BROKER_PORT}`);
      
      const timeout = setTimeout(() => {
        this.ws?.terminate();
        resolve({ success: false, error: 'Connection timeout' });
      }, 5000);
      
      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.connected = true;
        resolve({ success: true });
      });
      
      this.ws.on('message', (data) => this._handleMessage(data));
      
      this.ws.on('close', () => {
        this.connected = false;
        this.emit('disconnected');
      });
      
      this.ws.on('error', (err) => {
        clearTimeout(timeout);
        this.connected = false;
        resolve({ success: false, error: err.message });
      });
    });
  }

  /**
   * Handle incoming message from daemon
   */
  _handleMessage(data) {
    try {
      const msg = JSON.parse(data.toString());
      
      // Handle response to pending request
      if (msg.requestId && this.pendingRequests.has(msg.requestId)) {
        const { resolve } = this.pendingRequests.get(msg.requestId);
        this.pendingRequests.delete(msg.requestId);
        resolve(msg);
        return;
      }
      
      // Handle broadcast events
      if (msg.type === 'pnlUpdate') this.emit('pnlUpdate', msg.payload);
      if (msg.type === 'positionUpdate') this.emit('positionUpdate', msg.payload);
      if (msg.type === 'trade') this.emit('trade', msg.payload);
    } catch (e) { /* ignore parse errors */ }
  }

  /**
   * Send request to daemon and wait for response
   */
  async _request(type, payload = {}, timeout = 30000) {
    if (!this.connected) {
      const conn = await this.connect();
      if (!conn.success) return { error: conn.error };
    }
    
    const requestId = String(++this.requestId);
    
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({ error: 'Request timeout' });
      }, timeout);
      
      this.pendingRequests.set(requestId, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        }
      });
      
      try {
        this.ws.send(JSON.stringify({ type, payload, requestId }));
      } catch (e) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        resolve({ error: e.message });
      }
    });
  }

  // ==================== RithmicService-compatible API ====================

  /**
   * Login to Rithmic via daemon
   * @param {string} username - Rithmic username
   * @param {string} password - Rithmic password
   * @param {Object} options - Optional settings
   * @param {Array} options.cachedAccounts - Use cached accounts to avoid API call (CRITICAL for Rithmic limit)
   */
  async login(username, password, options = {}) {
    const result = await this._request('login', {
      propfirmKey: this.propfirmKey,
      username,
      password,
      cachedAccounts: options.cachedAccounts || null,  // Pass to daemon to avoid fetchAccounts
    }, 60000);
    
    if (result.error) {
      return { success: false, error: result.error };
    }
    
    if (result.payload?.success) {
      this.credentials = { username, password };
      this.accounts = result.payload.accounts || [];
      return { success: true, accounts: this.accounts, user: { userName: username } };
    }
    
    return { success: false, error: result.payload?.error || 'Login failed' };
  }

  /**
   * Get trading accounts
   */
  async getTradingAccounts() {
    const result = await this._request('getAccounts');
    if (result.error) return { success: false, accounts: [] };
    
    const accounts = (result.payload?.accounts || [])
      .filter(a => a.propfirmKey === this.propfirmKey);
    
    return { success: true, accounts };
  }

  /**
   * Get cached P&L (NO API CALL - from daemon cache)
   */
  async getAccountPnL(accountId) {
    const result = await this._request('getPnL', { accountId });
    return result.payload || { pnl: null };
  }

  /**
   * Get positions
   */
  async getPositions() {
    const result = await this._request('getPositions', { propfirmKey: this.propfirmKey });
    if (result.error) return { success: false, positions: [] };
    return result.payload || { success: true, positions: [] };
  }

  /**
   * Place order
   */
  async placeOrder(orderData) {
    const result = await this._request('placeOrder', {
      propfirmKey: this.propfirmKey,
      orderData,
    }, 15000);
    
    if (result.error) return { success: false, error: result.error };
    return result.payload || { success: false, error: 'No response' };
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId) {
    const result = await this._request('cancelOrder', {
      propfirmKey: this.propfirmKey,
      orderId,
    });
    
    if (result.error) return { success: false, error: result.error };
    return result.payload || { success: false, error: 'No response' };
  }

  /**
   * Get contracts
   */
  async getContracts() {
    const result = await this._request('getContracts', { propfirmKey: this.propfirmKey });
    if (result.error) {
      // Debug: show exactly what error came from daemon
      if (process.env.HQX_DEBUG === '1') {
        console.log('[BrokerClient] getContracts error:', result.error, 'propfirmKey:', this.propfirmKey);
      }
      return { success: false, contracts: [], error: result.error };
    }
    return result.payload || { success: true, contracts: [] };
  }

  /**
   * Search contracts
   */
  async searchContracts(searchText) {
    const result = await this._request('searchContracts', {
      propfirmKey: this.propfirmKey,
      searchText,
    });
    if (result.error) return { success: false, contracts: [] };
    return result.payload || { success: true, contracts: [] };
  }

  /**
   * Get Rithmic credentials for MarketDataFeed
   */
  getRithmicCredentials() {
    // Sync call - return cached credentials
    if (!this.credentials) return null;
    return {
      userId: this.credentials.username,
      password: this.credentials.password,
      systemName: this.propfirm?.systemName || 'Apex',
      gateway: 'wss://rprotocol.rithmic.com:443',
    };
  }

  /**
   * Get async Rithmic credentials from daemon
   * @returns {Object|null} Credentials object or null
   * @throws {Error} If daemon returns error
   */
  async getRithmicCredentialsAsync() {
    const result = await this._request('getRithmicCredentials', { propfirmKey: this.propfirmKey });
    if (result.error) {
      throw new Error(result.error);
    }
    return result.payload || null;
  }

  /**
   * Disconnect from daemon (does NOT stop daemon)
   */
  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.credentials = null;
    this.accounts = [];
  }

  /**
   * Logout from Rithmic (stops daemon connection for this propfirm)
   */
  async logout() {
    const result = await this._request('logout', { propfirmKey: this.propfirmKey });
    this.disconnect();
    return result.payload || { success: true };
  }

  // ==================== Compatibility methods ====================

  getToken() { return this.connected ? 'broker-connected' : null; }
  getPropfirm() { return this.propfirmKey; }
  async getUser() { return { userName: this.credentials?.username }; }
  
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
    if (ctHour === 16 && ctDay >= 1 && ctDay <= 4) return { isOpen: false, message: 'Daily maintenance' };
    return { isOpen: true, message: 'Market is open' };
  }
}

module.exports = { RithmicBrokerClient };
