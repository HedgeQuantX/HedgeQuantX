/**
 * @fileoverview Daemon Client - TUI connection to daemon
 * @module services/daemon/client
 * 
 * Connects to the HQX daemon via Unix socket.
 * Provides async request/response API for TUI.
 * 
 * NO MOCK DATA - All data comes from daemon (which gets it from Rithmic)
 */

'use strict';

const net = require('net');
const EventEmitter = require('events');
const { SOCKET_PATH, MSG_TYPE, TIMEOUTS } = require('./constants');
const { createMessage, encode, MessageParser, RequestHandler } = require('./protocol');
const { logger } = require('../../utils/logger');

const log = logger.scope('DaemonClient');

/**
 * Daemon Client for TUI
 * Connects to daemon and provides async API
 */
class DaemonClient extends EventEmitter {
  constructor() {
    super();
    
    /** @type {net.Socket|null} */
    this.socket = null;
    
    /** @type {MessageParser} */
    this.parser = new MessageParser();
    
    /** @type {RequestHandler} */
    this.requests = new RequestHandler();
    
    /** @type {boolean} */
    this.connected = false;
    
    /** @type {NodeJS.Timeout|null} */
    this.pingInterval = null;
    
    /** @type {Object|null} Cached daemon info */
    this.daemonInfo = null;
    
    /** @type {boolean} Auto-reconnect enabled */
    this.autoReconnect = true;
    
    /** @type {number} Reconnect attempts */
    this.reconnectAttempts = 0;
    
    /** @type {number} Max reconnect attempts */
    this.maxReconnectAttempts = 10;
    
    /** @type {NodeJS.Timeout|null} Reconnect timer */
    this.reconnectTimer = null;
    
    /** @type {boolean} Intentionally disconnecting */
    this._disconnecting = false;
  }
  
  /**
   * Connect to daemon
   * @returns {Promise<boolean>}
   */
  async connect() {
    if (this.connected) return true;
    
    return new Promise((resolve) => {
      this.socket = net.createConnection(SOCKET_PATH);
      
      this.socket.on('connect', async () => {
        log.debug('Connected to daemon');
        this.connected = true;
        
        // Perform handshake
        try {
          this.daemonInfo = await this._request(MSG_TYPE.HANDSHAKE, null, TIMEOUTS.HANDSHAKE);
          log.debug('Handshake complete', this.daemonInfo);
          
          // Reset reconnect attempts on successful connection
          this.reconnectAttempts = 0;
          
          // Start ping interval
          this._startPing();
          
          resolve(true);
        } catch (err) {
          log.error('Handshake failed', { error: err.message });
          this.disconnect();
          resolve(false);
        }
      });
      
      this.socket.on('data', (data) => {
        const messages = this.parser.feed(data);
        for (const msg of messages) {
          this._handleMessage(msg);
        }
      });
      
      this.socket.on('close', () => {
        log.debug('Disconnected from daemon');
        const wasConnected = this.connected;
        this._cleanup();
        this.emit('disconnected');
        
        // Auto-reconnect if enabled and not intentionally disconnecting
        if (wasConnected && this.autoReconnect && !this._disconnecting) {
          this._scheduleReconnect();
        }
      });
      
      this.socket.on('error', (err) => {
        if (err.code === 'ENOENT') {
          log.debug('Daemon not running');
        } else if (err.code === 'ECONNREFUSED') {
          log.debug('Daemon connection refused');
        } else {
          log.warn('Socket error', { error: err.message });
        }
        this._cleanup();
        resolve(false);
      });
    });
  }
  
  /**
   * Check if daemon is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    const connected = await this.connect();
    return connected;
  }
  
  /**
   * Disconnect from daemon
   * @param {boolean} [permanent=false] - If true, disable auto-reconnect
   */
  disconnect(permanent = false) {
    this._disconnecting = true;
    if (permanent) {
      this.autoReconnect = false;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.socket) {
      this.socket.destroy();
    }
    this._cleanup();
    this._disconnecting = false;
  }
  
  /**
   * Cleanup state (does NOT clear reconnect state)
   */
  _cleanup() {
    this.connected = false;
    this.requests.clear();
    this.parser.reset();
    
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    this.socket = null;
  }
  
  /**
   * Enable/disable auto-reconnect
   * @param {boolean} enable
   */
  setAutoReconnect(enable) {
    this.autoReconnect = enable;
    if (!enable && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  
  /**
   * Start ping interval
   */
  _startPing() {
    this.pingInterval = setInterval(async () => {
      try {
        await this._request(MSG_TYPE.PING, null, TIMEOUTS.PING_TIMEOUT);
      } catch (err) {
        log.warn('Ping failed, will auto-reconnect');
        // Don't call disconnect() - let socket close trigger reconnect
        if (this.socket) {
          this.socket.destroy();
        }
      }
    }, TIMEOUTS.PING_INTERVAL);
  }
  
  /**
   * Schedule auto-reconnect with exponential backoff
   */
  _scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error('Max reconnect attempts reached, giving up');
      this.emit('reconnectFailed');
      return;
    }
    
    // Exponential backoff: 1s, 2s, 4s, 8s... max 30s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    log.debug(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      log.debug('Attempting reconnect...');
      
      const success = await this.connect();
      if (success) {
        log.debug('Reconnected successfully');
        this.reconnectAttempts = 0;
        this.emit('reconnected');
      }
      // If failed, the connect() will trigger another close -> scheduleReconnect
    }, delay);
  }
  
  /**
   * Handle incoming message
   * @param {Object} msg
   */
  _handleMessage(msg) {
    const { type, data, replyTo } = msg;
    
    // Check if this is a response to a pending request
    if (replyTo && this.requests.resolve(replyTo, data)) {
      return;
    }
    
    // Handle push events from daemon
    switch (type) {
      case MSG_TYPE.EVENT_ORDER_UPDATE:
        this.emit('orderUpdate', data);
        break;
        
      case MSG_TYPE.EVENT_POSITION_UPDATE:
        this.emit('positionUpdate', data);
        break;
        
      case MSG_TYPE.EVENT_PNL_UPDATE:
        this.emit('pnlUpdate', data);
        break;
        
      case MSG_TYPE.EVENT_FILL:
        this.emit('fill', data);
        break;
        
      case MSG_TYPE.EVENT_DISCONNECTED:
        this.emit('rithmicDisconnected', data);
        break;
        
      case MSG_TYPE.EVENT_RECONNECTED:
        this.emit('rithmicReconnected', data);
        break;
        
      case MSG_TYPE.MARKET_DATA:
      case MSG_TYPE.TICK:
        this.emit('marketData', data);
        break;
        
      case MSG_TYPE.ALGO_LOG:
        this.emit('algoLog', data);
        break;
        
      case MSG_TYPE.PONG:
        // Handled by request handler
        break;
        
      default:
        log.debug('Unhandled message', { type });
    }
  }
  
  /**
   * Send request and wait for response
   * @param {string} type - Message type
   * @param {any} data - Request data
   * @param {number} [timeout] - Timeout in ms
   * @returns {Promise<any>} Response data
   */
  async _request(type, data, timeout = TIMEOUTS.REQUEST) {
    if (!this.connected || !this.socket) {
      throw new Error('Not connected to daemon');
    }
    
    const msg = createMessage(type, data);
    const promise = this.requests.createRequest(msg.id, timeout);
    
    this.socket.write(encode(msg));
    
    return promise;
  }
  
  // ==================== PUBLIC API ====================
  
  /**
   * Get daemon status
   * @returns {Promise<Object>}
   */
  async getStatus() {
    return this._request(MSG_TYPE.GET_STATUS);
  }
  
  /**
   * Login to Rithmic via daemon
   * @param {string} propfirmKey
   * @param {string} username
   * @param {string} password
   * @returns {Promise<Object>}
   */
  async login(propfirmKey, username, password) {
    return this._request(MSG_TYPE.LOGIN, { propfirmKey, username, password }, TIMEOUTS.LOGIN);
  }
  
  /**
   * Restore session from storage
   * @returns {Promise<Object>}
   */
  async restoreSession() {
    return this._request(MSG_TYPE.RESTORE_SESSION, null, TIMEOUTS.LOGIN);
  }
  
  /**
   * Logout
   * @returns {Promise<Object>}
   */
  async logout() {
    return this._request(MSG_TYPE.LOGOUT);
  }
  
  /**
   * Get trading accounts
   * @returns {Promise<Object>}
   */
  async getTradingAccounts() {
    return this._request(MSG_TYPE.GET_ACCOUNTS);
  }
  
  /**
   * Get positions
   * @returns {Promise<Object>}
   */
  async getPositions() {
    return this._request(MSG_TYPE.GET_POSITIONS);
  }
  
  /**
   * Get orders
   * @returns {Promise<Object>}
   */
  async getOrders() {
    return this._request(MSG_TYPE.GET_ORDERS);
  }
  
  /**
   * Get P&L for account
   * @param {string} accountId
   * @returns {Promise<Object>}
   */
  async getPnL(accountId) {
    return this._request(MSG_TYPE.GET_PNL, { accountId });
  }
  
  /**
   * Place order
   * @param {Object} orderData
   * @returns {Promise<Object>}
   */
  async placeOrder(orderData) {
    return this._request(MSG_TYPE.PLACE_ORDER, orderData);
  }
  
  /**
   * Cancel order
   * @param {string} orderId
   * @returns {Promise<Object>}
   */
  async cancelOrder(orderId) {
    return this._request(MSG_TYPE.CANCEL_ORDER, { orderId });
  }
  
  /**
   * Cancel all orders for account
   * @param {string} accountId
   * @returns {Promise<Object>}
   */
  async cancelAllOrders(accountId) {
    return this._request(MSG_TYPE.CANCEL_ALL, { accountId });
  }
  
  /**
   * Close position
   * @param {string} accountId
   * @param {string} symbol
   * @returns {Promise<Object>}
   */
  async closePosition(accountId, symbol) {
    return this._request(MSG_TYPE.CLOSE_POSITION, { accountId, symbol });
  }
  
  /**
   * Get contracts
   * @returns {Promise<Object>}
   */
  async getContracts() {
    return this._request(MSG_TYPE.GET_CONTRACTS);
  }
  
  /**
   * Search contracts
   * @param {string} search
   * @returns {Promise<Object>}
   */
  async searchContracts(search) {
    return this._request(MSG_TYPE.SEARCH_CONTRACTS, { search });
  }
  
  /**
   * Get credentials for algo trading
   * @returns {Promise<Object>}
   */
  async getCredentials() {
    return this._request(MSG_TYPE.GET_CREDENTIALS);
  }
  
  /**
   * Subscribe to market data
   * @param {string} symbol
   * @returns {Promise<Object>}
   */
  async subscribeMarket(symbol) {
    return this._request(MSG_TYPE.SUBSCRIBE_MARKET, { symbol });
  }
  
  /**
   * Unsubscribe from market data
   * @param {string} symbol
   * @returns {Promise<Object>}
   */
  async unsubscribeMarket(symbol) {
    return this._request(MSG_TYPE.UNSUBSCRIBE_MARKET, { symbol });
  }
  
  /**
   * Start algo trading
   * @param {Object} config
   * @returns {Promise<Object>}
   */
  async startAlgo(config) {
    return this._request(MSG_TYPE.START_ALGO, config);
  }
  
  /**
   * Stop algo trading
   * @param {string} algoId
   * @returns {Promise<Object>}
   */
  async stopAlgo(algoId) {
    return this._request(MSG_TYPE.STOP_ALGO, { algoId });
  }
  
  /**
   * Shutdown daemon
   * @returns {Promise<Object>}
   */
  async shutdown() {
    return this._request(MSG_TYPE.SHUTDOWN);
  }
}

// Singleton instance
let instance = null;

/**
 * Get daemon client instance
 * @returns {DaemonClient}
 */
function getDaemonClient() {
  if (!instance) {
    instance = new DaemonClient();
  }
  return instance;
}

module.exports = { DaemonClient, getDaemonClient };
