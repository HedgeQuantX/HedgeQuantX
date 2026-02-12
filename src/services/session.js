/**
 * @fileoverview Secure session management - Direct Rithmic Connection
 * @module services/session
 * 
 * NO DAEMON - Direct connection to Rithmic API
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { encrypt, decrypt } = require('../security/encryption');
const { SECURITY } = require('../config/settings');
const { logger } = require('../utils/logger');

const log = logger.scope('Session');

const SESSION_DIR = path.join(os.homedir(), SECURITY.SESSION_DIR);
const SESSION_FILE = path.join(SESSION_DIR, SECURITY.SESSION_FILE);

/**
 * Secure session storage with AES-256-GCM encryption
 */
const storage = {
  _ensureDir() {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true, mode: SECURITY.DIR_PERMISSIONS });
    }
  },

  save(sessions) {
    try {
      this._ensureDir();
      const data = JSON.stringify(sessions);
      const encrypted = encrypt(data);
      fs.writeFileSync(SESSION_FILE, encrypted, { mode: SECURITY.FILE_PERMISSIONS });
      return true;
    } catch (err) {
      log.error('Failed to save session', { error: err.message });
      return false;
    }
  },

  load() {
    try {
      if (!fs.existsSync(SESSION_FILE)) {
        return [];
      }
      
      const encrypted = fs.readFileSync(SESSION_FILE, 'utf8');
      const decrypted = decrypt(encrypted);
      
      if (!decrypted) {
        this.clear();
        return [];
      }
      
      return JSON.parse(decrypted);
    } catch (err) {
      log.error('Failed to load session', { error: err.message });
      this.clear();
      return [];
    }
  },

  clear() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        const size = fs.statSync(SESSION_FILE).size;
        if (size > 0) {
          fs.writeFileSync(SESSION_FILE, crypto.randomBytes(size));
        }
        fs.unlinkSync(SESSION_FILE);
      }
      return true;
    } catch (err) {
      log.error('Failed to clear session', { error: err.message });
      return false;
    }
  },
};

// Lazy load RithmicService
let RithmicService;
const loadRithmicService = () => {
  if (!RithmicService) {
    ({ RithmicService } = require('./rithmic'));
  }
  return RithmicService;
};

/**
 * Multi-connection manager - Direct Rithmic connections
 */
const connections = {
  /** @type {Array<{type: string, service: Object, propfirm: string, propfirmKey: string, connectedAt: Date}>} */
  services: [],

  /**
   * Add a new connection
   */
  add(type, service, propfirm = null) {
    this.services.push({
      type,
      service,
      propfirm,
      propfirmKey: service.propfirmKey,
      connectedAt: new Date(),
    });
    this.saveToStorage();
    log.info('Connection added', { type, propfirm: propfirm || type });
  },

  /**
   * Sanitize account data for caching
   * IMPORTANT: Keep rithmicAccountId for PnL lookups
   */
  _sanitizeAccount(acc) {
    if (!acc || typeof acc !== 'object') return null;
    
    // Get the real Rithmic account ID (text like "APEX-130042-63")
    const rithmicId = acc.rithmicAccountId || acc.accountId;
    if (!rithmicId) return null;
    
    return {
      accountId: rithmicId,  // Use the real Rithmic ID, not the hash
      fcmId: acc.fcmId ? String(acc.fcmId) : undefined,
      ibId: acc.ibId ? String(acc.ibId) : undefined,
      accountName: acc.accountName ? String(acc.accountName) : undefined,
    };
  },

  /**
   * Save sessions to encrypted storage
   */
  saveToStorage() {
    const existingSessions = storage.load();
    const aiSessions = existingSessions.filter(s => s.type === 'ai');
    
    const rithmicSessions = this.services.map(conn => {
      const rawAccounts = conn.service.accounts || [];
      const accounts = rawAccounts.map(a => this._sanitizeAccount(a)).filter(Boolean);
      
      return {
        type: conn.type,
        propfirm: conn.propfirm,
        propfirmKey: conn.service.propfirmKey || conn.propfirmKey,
        credentials: conn.service.credentials,
        accounts,
      };
    });
    
    storage.save([...aiSessions, ...rithmicSessions]);
  },

  /**
   * Restore sessions from storage - Direct connection to Rithmic
   */
  async restoreFromStorage() {
    const sessions = storage.load();
    const rithmicSessions = sessions.filter(s => s.type === 'rithmic' && s.credentials);
    
    if (!rithmicSessions.length) {
      log.debug('No saved sessions to restore');
      return false;
    }
    
    log.info('Restoring sessions', { count: rithmicSessions.length });
    
    for (const session of rithmicSessions) {
      try {
        const success = await this._restoreSession(session);
        if (!success) {
          log.warn('Session restore returned false', { propfirm: session.propfirm });
        }
      } catch (err) {
        log.error('Failed to restore session', { propfirm: session.propfirm, error: err.message });
      }
    }
    
    return this.services.length > 0;
  },

  /**
   * Restore a single session using direct RithmicService
   * @returns {boolean} true if restore succeeded
   */
  async _restoreSession(session) {
    const { type, propfirm, propfirmKey } = session;
    
    if (type !== 'rithmic' || !session.credentials) {
      return false;
    }
    
    const Service = loadRithmicService();
    const service = new Service(propfirmKey || 'apex_rithmic');
    
    // Validate cached accounts
    let validAccounts = null;
    if (session.accounts && Array.isArray(session.accounts)) {
      validAccounts = session.accounts
        .map(a => this._sanitizeAccount(a))
        .filter(Boolean);
      if (validAccounts.length === 0) validAccounts = null;
    }
    
    log.debug('Restoring session', { 
      propfirm, 
      propfirmKey,
      hasCredentials: !!session.credentials,
      cachedAccounts: validAccounts?.length || 0 
    });
    
    // Login with cached accounts to avoid Rithmic API limit
    const loginOptions = validAccounts 
      ? { skipFetchAccounts: true, cachedAccounts: validAccounts } 
      : {};
    
    const result = await service.login(
      session.credentials.username, 
      session.credentials.password, 
      loginOptions
    );
    
    if (result.success) {
      this.services.push({
        type,
        service,
        propfirm,
        propfirmKey,
        connectedAt: new Date(),
      });
      log.info('Session restored', { 
        propfirm, 
        accounts: service.accounts?.length || 0,
        hasPnL: !!service.pnlConn,
        hasOrder: !!service.orderConn
      });
      return true;
    } else {
      log.warn('Session restore failed', { propfirm, error: result.error });
      return false;
    }
  },

  /**
   * Remove a connection by index
   */
  remove(index) {
    if (index < 0 || index >= this.services.length) return;
    
    const conn = this.services[index];
    
    if (conn.service?.disconnect) {
      try {
        conn.service.disconnect();
      } catch (err) {
        log.warn('Disconnect failed', { error: err.message });
      }
    }
    
    if (conn.service?.credentials) {
      conn.service.credentials = null;
    }
    
    this.services.splice(index, 1);
    this.saveToStorage();
    log.info('Connection removed', { type: conn.type });
  },

  getAll() {
    return this.services;
  },

  getByType(type) {
    return this.services.filter(c => c.type === type);
  },

  count() {
    return this.services.length;
  },

  /**
   * Get all accounts from all connections
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
   * Get service for a specific account
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

  isConnected() {
    return this.services.length > 0;
  },

  /**
   * Disconnect all connections
   */
  async disconnectAll() {
    for (const conn of this.services) {
      try {
        if (conn.service?.disconnect) {
          await conn.service.disconnect();
        }
      } catch (err) {
        log.warn('Disconnect failed', { type: conn.type, error: err.message });
      }
    }
    
    this.services = [];
    storage.clear();
    log.info('All connections disconnected');
  },

  getInfo() {
    return this.services.map(conn => ({
      type: conn.type,
      propfirm: conn.propfirm,
      connectedAt: conn.connectedAt,
    }));
  },
};

module.exports = { storage, connections };
