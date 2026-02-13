/**
 * @fileoverview Daemon Proxy Service
 * @module services/daemon/proxy
 * 
 * Provides a RithmicService-compatible interface that:
 * - Uses daemon if available (persistent connection)
 * - Falls back to direct connection (standalone mode)
 * 
 * This allows app.js and other code to work transparently
 * whether daemon is running or not.
 * 
 * NO MOCK DATA - All data from real Rithmic API (via daemon or direct)
 */

'use strict';

const EventEmitter = require('events');
const { getDaemonClient, isDaemonRunning } = require('./index');
const { logger } = require('../../utils/logger');

const log = logger.scope('DaemonProxy');

/**
 * Proxy service that wraps daemon client or direct RithmicService
 * Implements same interface as RithmicService
 */
class DaemonProxyService extends EventEmitter {
  constructor() {
    super();
    
    /** @type {Object|null} DaemonClient or RithmicService */
    this._backend = null;
    
    /** @type {string} 'daemon' | 'direct' */
    this._mode = null;
    
    /** @type {Object|null} Propfirm info */
    this.propfirm = null;
    
    /** @type {string|null} */
    this.propfirmKey = null;
    
    /** @type {Array} Cached accounts */
    this.accounts = [];
    
    /** @type {Object|null} Credentials for direct mode */
    this.credentials = null;
  }
  
  /**
   * Check if using daemon mode
   * @returns {boolean}
   */
  isDaemonMode() {
    return this._mode === 'daemon';
  }
  
  /**
   * Login to Rithmic (via daemon or direct)
   * @param {string} username
   * @param {string} password
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  async login(username, password, options = {}) {
    // Try daemon first
    if (isDaemonRunning()) {
      try {
        const client = getDaemonClient();
        const connected = await client.connect();
        
        if (connected) {
          const result = await client.login(this.propfirmKey, username, password);
          
          if (result.success) {
            this._backend = client;
            this._mode = 'daemon';
            this.accounts = result.accounts || [];
            this.propfirm = result.propfirm;
            this.credentials = { username, password };
            
            // Forward events from daemon
            this._setupDaemonEvents();
            
            log.info('Connected via daemon', { propfirm: this.propfirm?.name });
            return result;
          }
        }
      } catch (err) {
        log.warn('Daemon login failed, falling back to direct', { error: err.message });
      }
    }
    
    // Fallback to direct connection
    const { RithmicService } = require('../rithmic');
    const service = new RithmicService(this.propfirmKey);
    
    const result = await service.login(username, password, options);
    
    if (result.success) {
      this._backend = service;
      this._mode = 'direct';
      this.accounts = service.accounts || [];
      this.propfirm = service.propfirm;
      this.credentials = { username, password };
      
      // Forward events from service
      this._setupDirectEvents();
      
      log.info('Connected directly', { propfirm: this.propfirm?.name });
    }
    
    return result;
  }
  
  /**
   * Restore session
   * @returns {Promise<Object>}
   */
  async restoreSession() {
    // Try daemon first
    if (isDaemonRunning()) {
      try {
        const client = getDaemonClient();
        const connected = await client.connect();
        
        if (connected) {
          const status = await client.getStatus();
          
          // If daemon is already connected, use it
          if (status.connected) {
            this._backend = client;
            this._mode = 'daemon';
            this.propfirm = status.propfirm;
            
            const accountsResult = await client.getTradingAccounts();
            this.accounts = accountsResult.accounts || [];
            
            this._setupDaemonEvents();
            
            log.info('Using existing daemon connection', { propfirm: this.propfirm?.name });
            return { success: true, accounts: this.accounts, propfirm: this.propfirm };
          }
          
          // Try to restore via daemon
          const result = await client.restoreSession();
          
          if (result.success) {
            this._backend = client;
            this._mode = 'daemon';
            this.accounts = result.accounts || [];
            this.propfirm = result.propfirm;
            
            this._setupDaemonEvents();
            
            log.info('Session restored via daemon', { propfirm: this.propfirm?.name });
            return result;
          }
        }
      } catch (err) {
        log.warn('Daemon restore failed, falling back to direct', { error: err.message });
      }
    }
    
    // Fallback to direct restore
    const { connections } = require('../session');
    const restored = await connections.restoreFromStorage();
    
    if (restored) {
      const conn = connections.getAll()[0];
      this._backend = conn.service;
      this._mode = 'direct';
      this.accounts = conn.service.accounts || [];
      this.propfirm = conn.service.propfirm;
      this.propfirmKey = conn.service.propfirmKey;
      
      this._setupDirectEvents();
      
      return { success: true, accounts: this.accounts, propfirm: this.propfirm };
    }
    
    return { success: false, error: 'No session to restore' };
  }
  
  /**
   * Setup event forwarding from daemon client
   */
  _setupDaemonEvents() {
    if (!this._backend || this._mode !== 'daemon') return;
    
    const client = this._backend;
    
    client.on('orderUpdate', (data) => this.emit('orderUpdate', data));
    client.on('positionUpdate', (data) => this.emit('positionUpdate', data));
    client.on('pnlUpdate', (data) => this.emit('pnlUpdate', data));
    client.on('fill', (data) => this.emit('fill', data));
    client.on('marketData', (data) => this.emit('marketData', data));
    client.on('rithmicDisconnected', (data) => this.emit('disconnected', data));
    client.on('rithmicReconnected', (data) => this.emit('reconnected', data));
  }
  
  /**
   * Setup event forwarding from direct service
   */
  _setupDirectEvents() {
    if (!this._backend || this._mode !== 'direct') return;
    
    const service = this._backend;
    
    service.on('orderUpdate', (data) => this.emit('orderUpdate', data));
    service.on('positionUpdate', (data) => this.emit('positionUpdate', data));
    service.on('pnlUpdate', (data) => this.emit('pnlUpdate', data));
    service.on('fill', (data) => this.emit('fill', data));
    service.on('disconnected', (data) => this.emit('disconnected', data));
  }
  
  // ==================== DELEGATED METHODS ====================
  // These work the same whether using daemon or direct
  
  async getTradingAccounts() {
    if (!this._backend) return { success: false, accounts: [] };
    
    if (this._mode === 'daemon') {
      return this._backend.getTradingAccounts();
    }
    return this._backend.getTradingAccounts();
  }
  
  async getPositions() {
    if (!this._backend) return { success: false, positions: [] };
    
    if (this._mode === 'daemon') {
      return this._backend.getPositions();
    }
    return this._backend.getPositions();
  }
  
  async getOrders() {
    if (!this._backend) return { success: false, orders: [] };
    
    if (this._mode === 'daemon') {
      return this._backend.getOrders();
    }
    return this._backend.getOrders();
  }
  
  getAccountPnL(accountId) {
    if (!this._backend) return { pnl: null, openPnl: null, closedPnl: null, balance: null };
    
    if (this._mode === 'daemon') {
      // For daemon, we need to make async call but this is sync interface
      // Return cached value or null
      return { pnl: null, openPnl: null, closedPnl: null, balance: null };
    }
    return this._backend.getAccountPnL(accountId);
  }
  
  async placeOrder(orderData) {
    if (!this._backend) return { success: false, error: 'Not connected' };
    
    if (this._mode === 'daemon') {
      return this._backend.placeOrder(orderData);
    }
    return this._backend.placeOrder(orderData);
  }
  
  async cancelOrder(orderId) {
    if (!this._backend) return { success: false, error: 'Not connected' };
    
    if (this._mode === 'daemon') {
      return this._backend.cancelOrder(orderId);
    }
    return this._backend.cancelOrder(orderId);
  }
  
  async cancelAllOrders(accountId) {
    if (!this._backend) return { success: false, error: 'Not connected' };
    
    if (this._mode === 'daemon') {
      return this._backend.cancelAllOrders(accountId);
    }
    return this._backend.cancelAllOrders(accountId);
  }
  
  async closePosition(accountId, symbol) {
    if (!this._backend) return { success: false, error: 'Not connected' };
    
    if (this._mode === 'daemon') {
      return this._backend.closePosition(accountId, symbol);
    }
    return this._backend.closePosition(accountId, symbol);
  }
  
  async getContracts() {
    if (!this._backend) return { success: false, contracts: [] };
    
    if (this._mode === 'daemon') {
      return this._backend.getContracts();
    }
    return this._backend.getContracts();
  }
  
  async searchContracts(search) {
    if (!this._backend) return { success: false, contracts: [] };
    
    if (this._mode === 'daemon') {
      return this._backend.searchContracts(search);
    }
    return this._backend.searchContracts(search);
  }
  
  // Methods that only work in direct mode (for algo trading)
  // These return the actual RithmicService for algo executor
  
  /**
   * Get underlying service for algo trading
   * @returns {Object|null} RithmicService or null if daemon mode
   */
  getDirectService() {
    if (this._mode === 'direct') {
      return this._backend;
    }
    return null;
  }
  
  /**
   * Get Rithmic credentials for market data feed
   * @returns {Object|null}
   */
  getRithmicCredentials() {
    if (this._mode === 'direct' && this._backend) {
      return this._backend.getRithmicCredentials();
    }
    
    // For daemon mode, return stored credentials
    if (this.credentials && this.propfirmKey) {
      const { RITHMIC_ENDPOINTS } = require('../rithmic');
      return {
        userId: this.credentials.username,
        password: this.credentials.password,
        systemName: this.propfirm?.systemName || 'Apex',
        gateway: RITHMIC_ENDPOINTS?.CHICAGO || 'wss://rprotocol.rithmic.com:443',
      };
    }
    
    return null;
  }
  
  getToken() {
    return this._backend ? 'connected' : null;
  }
  
  getPropfirm() {
    return this.propfirmKey || 'apex';
  }
  
  checkMarketHours() {
    if (this._mode === 'direct' && this._backend) {
      return this._backend.checkMarketHours();
    }
    
    // Fallback implementation
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
    if (ctDay === 0 && ctHour < 17) return { isOpen: false, message: 'Market opens Sunday 5PM CT' };
    if (ctDay === 5 && ctHour >= 16) return { isOpen: false, message: 'Market closed (Friday 4PM CT)' };
    if (ctHour === 16 && ctDay >= 1 && ctDay <= 4) return { isOpen: false, message: 'Daily maintenance' };
    
    return { isOpen: true, message: 'Market is open' };
  }
  
  async getMarketStatus() {
    return { success: true, ...this.checkMarketHours() };
  }
  
  async getUser() {
    if (this._mode === 'direct' && this._backend) {
      return this._backend.getUser();
    }
    return null;
  }
  
  async disconnect() {
    if (this._mode === 'daemon') {
      // Don't disconnect daemon, just disconnect client
      this._backend?.disconnect();
    } else if (this._mode === 'direct') {
      await this._backend?.disconnect();
    }
    
    this._backend = null;
    this._mode = null;
    this.accounts = [];
    this.credentials = null;
  }
}

module.exports = { DaemonProxyService };
