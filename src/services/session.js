/**
 * @fileoverview Secure session management with encryption
 * @module services/session
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { encrypt, decrypt, maskSensitive, secureWipe } = require('../security/encryption');
const { SECURITY } = require('../config/settings');
const { logger } = require('../utils/logger');

const log = logger.scope('Session');

const SESSION_DIR = path.join(os.homedir(), SECURITY.SESSION_DIR);
const SESSION_FILE = path.join(SESSION_DIR, SECURITY.SESSION_FILE);

/**
 * Secure session storage with AES-256-GCM encryption
 */
const storage = {
  /**
   * Ensures the session directory exists with proper permissions
   * @private
   */
  _ensureDir() {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true, mode: SECURITY.DIR_PERMISSIONS });
      log.debug('Created session directory');
    }
  },

  /**
   * Saves sessions with encryption
   * @param {Array} sessions - Sessions to save
   * @returns {boolean} Success status
   */
  save(sessions) {
    try {
      this._ensureDir();
      const data = JSON.stringify(sessions);
      const encrypted = encrypt(data);
      fs.writeFileSync(SESSION_FILE, encrypted, { mode: SECURITY.FILE_PERMISSIONS });
      log.debug('Session saved', { count: sessions.length });
      return true;
    } catch (err) {
      log.error('Failed to save session', { error: err.message });
      return false;
    }
  },

  /**
   * Loads and decrypts sessions
   * @returns {Array} Decrypted sessions or empty array
   */
  load() {
    try {
      if (!fs.existsSync(SESSION_FILE)) {
        return [];
      }
      
      const encrypted = fs.readFileSync(SESSION_FILE, 'utf8');
      const decrypted = decrypt(encrypted);
      
      if (!decrypted) {
        log.warn('Session decryption failed - clearing');
        this.clear();
        return [];
      }
      
      const sessions = JSON.parse(decrypted);
      log.debug('Session loaded', { count: sessions.length });
      return sessions;
    } catch (err) {
      log.error('Failed to load session', { error: err.message });
      this.clear();
      return [];
    }
  },

  /**
   * Securely clears session data
   * @returns {boolean} Success status
   */
  clear() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        // Overwrite with random data before deleting
        const size = fs.statSync(SESSION_FILE).size;
        if (size > 0) {
          fs.writeFileSync(SESSION_FILE, crypto.randomBytes(size));
        }
        fs.unlinkSync(SESSION_FILE);
        log.debug('Session cleared securely');
      }
      return true;
    } catch (err) {
      log.error('Failed to clear session', { error: err.message });
      return false;
    }
  },
};

// Lazy load services to avoid circular dependencies
let ProjectXService, RithmicService, TradovateService;
const loadServices = () => {
  if (!ProjectXService) {
    ({ ProjectXService } = require('./projectx'));
    ({ RithmicService } = require('./rithmic'));
    ({ TradovateService } = require('./tradovate'));
  }
};

/**
 * Multi-connection manager with secure token handling
 */
const connections = {
  /** @type {Array<{type: string, service: Object, propfirm: string, propfirmKey: string, token: string, connectedAt: Date}>} */
  services: [],

  /**
   * Adds a new connection
   * @param {string} type - Connection type (projectx, rithmic, tradovate)
   * @param {Object} service - Service instance
   * @param {string} [propfirm] - PropFirm name
   * @param {string} [token] - Auth token
   */
  add(type, service, propfirm = null, token = null) {
    this.services.push({
      type,
      service,
      propfirm,
      propfirmKey: service.propfirmKey,
      token: token || service.token,
      connectedAt: new Date(),
    });
    this.saveToStorage();
    log.info('Connection added', { type, propfirm: propfirm || type });
  },

  /**
   * Saves all sessions to encrypted storage
   */
  saveToStorage() {
    const sessions = this.services.map(conn => {
      const session = {
        type: conn.type,
        propfirm: conn.propfirm,
        propfirmKey: conn.service.propfirmKey || conn.propfirmKey,
      };
      
      if (conn.type === 'projectx') {
        session.token = conn.service.token || conn.token;
      } else if (conn.type === 'rithmic' || conn.type === 'tradovate') {
        session.credentials = conn.service.credentials;
      }
      
      return session;
    });
    
    storage.save(sessions);
  },

  /**
   * Restores sessions from encrypted storage
   * @returns {Promise<boolean>} True if sessions were restored
   */
  async restoreFromStorage() {
    loadServices();
    const sessions = storage.load();
    
    if (!sessions.length) {
      return false;
    }
    
    log.info('Restoring sessions', { count: sessions.length });
    
    for (const session of sessions) {
      try {
        await this._restoreSession(session);
      } catch (err) {
        log.warn('Failed to restore session', { type: session.type, error: err.message });
      }
    }
    
    return this.services.length > 0;
  },

  /**
   * Restores a single session
   * @private
   */
  async _restoreSession(session) {
    const { type, propfirm, propfirmKey } = session;
    
    if (type === 'projectx' && session.token) {
      const service = new ProjectXService(propfirmKey || 'topstep');
      service.token = session.token;
      
      const userResult = await service.getUser();
      if (userResult.success) {
        this.services.push({
          type,
          service,
          propfirm,
          propfirmKey,
          token: session.token,
          connectedAt: new Date(),
        });
        log.debug('ProjectX session restored');
      }
    } else if (type === 'rithmic' && session.credentials) {
      const service = new RithmicService(propfirmKey || 'apex_rithmic');
      const result = await service.login(session.credentials.username, session.credentials.password);
      
      if (result.success) {
        this.services.push({
          type,
          service,
          propfirm,
          propfirmKey,
          connectedAt: new Date(),
        });
        log.debug('Rithmic session restored');
      }
    } else if (type === 'tradovate' && session.credentials) {
      const service = new TradovateService(propfirmKey || 'tradovate');
      const result = await service.login(session.credentials.username, session.credentials.password);
      
      if (result.success) {
        this.services.push({
          type,
          service,
          propfirm,
          propfirmKey,
          connectedAt: new Date(),
        });
        log.debug('Tradovate session restored');
      }
    }
  },

  /**
   * Removes a connection by index
   * @param {number} index - Connection index
   */
  remove(index) {
    if (index < 0 || index >= this.services.length) return;
    
    const conn = this.services[index];
    
    if (conn.service?.logout) {
      try {
        conn.service.logout();
      } catch (err) {
        log.warn('Logout failed', { error: err.message });
      }
    }
    
    // Clear credentials from memory
    if (conn.service?.credentials) {
      conn.service.credentials = null;
    }
    
    this.services.splice(index, 1);
    this.saveToStorage();
    log.info('Connection removed', { type: conn.type });
  },

  /**
   * Gets all connections
   * @returns {Array}
   */
  getAll() {
    return this.services;
  },

  /**
   * Gets connections by type
   * @param {string} type - Connection type
   * @returns {Array}
   */
  getByType(type) {
    return this.services.filter(c => c.type === type);
  },

  /**
   * Gets connection count
   * @returns {number}
   */
  count() {
    return this.services.length;
  },

  /**
   * Gets all accounts from all connections
   * @returns {Promise<Array>}
   */
  async getAllAccounts() {
    const allAccounts = [];
    
    for (const conn of this.services) {
      try {
        const result = await conn.service.getTradingAccounts();
        
        if (result.success && result.accounts) {
          for (const account of result.accounts) {
            allAccounts.push({
              ...account,
              connectionType: conn.type,
              propfirm: conn.propfirm || conn.type,
              service: conn.service,
            });
          }
        }
      } catch (err) {
        log.warn('Failed to get accounts', { type: conn.type, error: err.message });
      }
    }
    
    return allAccounts;
  },

  /**
   * Gets the service for a specific account
   * @param {string|number} accountId - Account ID
   * @returns {Object|null}
   */
  getServiceForAccount(accountId) {
    for (const conn of this.services) {
      if (!conn.service?.accounts) continue;
      
      const found = conn.service.accounts.find(acc =>
        acc.accountId == accountId ||
        acc.rithmicAccountId == accountId ||
        acc.accountName == accountId
      );
      
      if (found) return conn.service;
    }
    return null;
  },

  /**
   * Checks if any connection is active
   * @returns {boolean}
   */
  isConnected() {
    return this.services.length > 0;
  },

  /**
   * Disconnects all connections and clears sessions
   */
  disconnectAll() {
    for (const conn of this.services) {
      try {
        if (conn.service?.logout) {
          conn.service.logout();
        }
        if (conn.service?.disconnect) {
          conn.service.disconnect();
        }
        // Clear credentials
        if (conn.service?.credentials) {
          conn.service.credentials = null;
        }
      } catch (err) {
        log.warn('Disconnect failed', { type: conn.type, error: err.message });
      }
    }
    
    this.services = [];
    storage.clear();
    log.info('All connections disconnected');
  },

  /**
   * Gets masked connection info for logging
   * @returns {Array}
   */
  getInfo() {
    return this.services.map(conn => ({
      type: conn.type,
      propfirm: conn.propfirm,
      token: maskSensitive(conn.token),
      connectedAt: conn.connectedAt,
    }));
  },
};

module.exports = { storage, connections };
