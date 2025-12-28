/**
 * @fileoverview Secure session management with encryption
 * @module services/session
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { encrypt, decrypt, maskSensitive } = require('../security');
const { ProjectXService } = require('./projectx');

const SESSION_DIR = path.join(os.homedir(), '.hedgequantx');
const SESSION_FILE = path.join(SESSION_DIR, 'session.enc');

/**
 * Secure session storage with AES-256 encryption
 */
const storage = {
  /**
   * Ensures the session directory exists with proper permissions
   * @private
   */
  _ensureDir() {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
    }
  },

  /**
   * Saves sessions with encryption
   * @param {Array} sessions - Sessions to save
   */
  save(sessions) {
    try {
      this._ensureDir();
      const data = JSON.stringify(sessions);
      const encrypted = encrypt(data);
      fs.writeFileSync(SESSION_FILE, encrypted, { mode: 0o600 });
    } catch (e) {
      // Silently fail - don't expose errors
    }
  },

  /**
   * Loads and decrypts sessions
   * @returns {Array} Decrypted sessions or empty array
   */
  load() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        const encrypted = fs.readFileSync(SESSION_FILE, 'utf8');
        const decrypted = decrypt(encrypted);
        if (decrypted) {
          return JSON.parse(decrypted);
        }
      }
    } catch (e) {
      // Session corrupted or from different machine - clear it
      this.clear();
    }
    return [];
  },

  /**
   * Securely clears session data
   */
  clear() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        // Overwrite with random data before deleting
        const size = fs.statSync(SESSION_FILE).size;
        fs.writeFileSync(SESSION_FILE, require('crypto').randomBytes(size));
        fs.unlinkSync(SESSION_FILE);
      }
    } catch (e) {
      // Ignore errors
    }
  }
};

/**
 * Multi-connection manager with secure token handling
 */
const connections = {
  /** @type {Array} Active connections */
  services: [],

  /**
   * Adds a new connection
   * @param {string} type - Connection type (projectx, rithmic, etc.)
   * @param {Object} service - Service instance
   * @param {string} [propfirm] - PropFirm name
   * @param {string} [token] - Auth token
   */
  add(type, service, propfirm = null, token = null) {
    this.services.push({
      type,
      service,
      propfirm,
      token: token || service.token,
      connectedAt: new Date()
    });
    this.saveToStorage();
  },

  /**
   * Saves all sessions to encrypted storage
   */
  saveToStorage() {
    const sessions = this.services.map(conn => ({
      type: conn.type,
      propfirm: conn.propfirm,
      token: conn.service.token || conn.token
    }));
    storage.save(sessions);
  },

  /**
   * Restores sessions from encrypted storage
   * @returns {Promise<boolean>} True if sessions were restored
   */
  async restoreFromStorage() {
    const sessions = storage.load();
    
    for (const session of sessions) {
      try {
        if (session.type === 'projectx' && session.token) {
          const propfirmKey = session.propfirm.toLowerCase().replace(/ /g, '_');
          const service = new ProjectXService(propfirmKey);
          service.token = session.token;

          // Validate token is still valid
          const userResult = await service.getUser();
          if (userResult.success) {
            this.services.push({
              type: session.type,
              service,
              propfirm: session.propfirm,
              token: session.token,
              connectedAt: new Date()
            });
          }
        }
      } catch (e) {
        // Invalid session - skip
      }
    }
    
    return this.services.length > 0;
  },

  /**
   * Removes a connection by index
   * @param {number} index - Connection index
   */
  remove(index) {
    if (index >= 0 && index < this.services.length) {
      const conn = this.services[index];
      if (conn.service && conn.service.logout) {
        conn.service.logout();
      }
      this.services.splice(index, 1);
      this.saveToStorage();
    }
  },

  /**
   * Gets all connections
   * @returns {Array} All connections
   */
  getAll() {
    return this.services;
  },

  /**
   * Gets connections by type
   * @param {string} type - Connection type
   * @returns {Array} Filtered connections
   */
  getByType(type) {
    return this.services.filter(c => c.type === type);
  },

  /**
   * Gets connection count
   * @returns {number} Number of connections
   */
  count() {
    return this.services.length;
  },

  /**
   * Gets all accounts from all connections
   * @returns {Promise<Array>} All accounts
   */
  async getAllAccounts() {
    const allAccounts = [];
    
    for (const conn of this.services) {
      try {
        const result = await conn.service.getTradingAccounts();
        if (result.success && result.accounts) {
          result.accounts.forEach(account => {
            allAccounts.push({
              ...account,
              connectionType: conn.type,
              propfirm: conn.propfirm || conn.type,
              service: conn.service
            });
          });
        }
      } catch (e) {
        // Skip failed connections
      }
    }
    
    return allAccounts;
  },

  /**
   * Checks if any connection is active
   * @returns {boolean} True if connected
   */
  isConnected() {
    return this.services.length > 0;
  },

  /**
   * Disconnects all connections and clears sessions
   */
  disconnectAll() {
    this.services.forEach(conn => {
      if (conn.service && conn.service.logout) {
        conn.service.logout();
      }
    });
    this.services = [];
    storage.clear();
  },

  /**
   * Gets masked connection info for logging
   * @returns {Array} Masked connection info
   */
  getInfo() {
    return this.services.map(conn => ({
      type: conn.type,
      propfirm: conn.propfirm,
      token: maskSensitive(conn.token),
      connectedAt: conn.connectedAt
    }));
  }
};

module.exports = { storage, connections };
