/**
 * @fileoverview Secure session management - Rithmic Only
 * @module services/session
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { encrypt, decrypt, maskSensitive } = require('../security/encryption');
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
      log.debug('Created session directory');
    }
  },

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

  clear() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
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

// Lazy load RithmicService to avoid circular dependencies
let RithmicService;
const loadServices = () => {
  if (!RithmicService) {
    ({ RithmicService } = require('./rithmic'));
  }
};

/**
 * Multi-connection manager (Rithmic only)
 */
const connections = {
  /** @type {Array<{type: string, service: Object, propfirm: string, propfirmKey: string, connectedAt: Date}>} */
  services: [],

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

  saveToStorage() {
    // Load existing sessions to preserve AI agents
    const existingSessions = storage.load();
    const aiSessions = existingSessions.filter(s => s.type === 'ai');
    
    // Build Rithmic sessions
    const rithmicSessions = this.services.map(conn => ({
      type: conn.type,
      propfirm: conn.propfirm,
      propfirmKey: conn.service.propfirmKey || conn.propfirmKey,
      credentials: conn.service.credentials,
    }));
    
    // Merge: AI sessions + Rithmic sessions
    storage.save([...aiSessions, ...rithmicSessions]);
  },

  async restoreFromStorage() {
    loadServices();
    const sessions = storage.load();
    
    // Filter only Rithmic sessions (AI sessions are managed by ai-agents.js)
    const rithmicSessions = sessions.filter(s => s.type === 'rithmic');
    
    if (!rithmicSessions.length) {
      return false;
    }
    
    log.info('Restoring sessions', { count: rithmicSessions.length });
    
    for (const session of rithmicSessions) {
      try {
        await this._restoreSession(session);
      } catch (err) {
        log.warn('Failed to restore session', { type: session.type, error: err.message });
      }
    }
    
    return this.services.length > 0;
  },

  async _restoreSession(session) {
    const { type, propfirm, propfirmKey } = session;
    
    // Only restore Rithmic sessions
    if (type === 'rithmic' && session.credentials) {
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
    }
  },

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

  disconnectAll() {
    for (const conn of this.services) {
      try {
        if (conn.service?.disconnect) {
          conn.service.disconnect();
        }
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

  getInfo() {
    return this.services.map(conn => ({
      type: conn.type,
      propfirm: conn.propfirm,
      connectedAt: conn.connectedAt,
    }));
  },
};

module.exports = { storage, connections };
