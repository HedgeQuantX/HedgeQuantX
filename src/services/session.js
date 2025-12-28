/**
 * Session Management
 * Handles multi-connection state and persistence
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { ProjectXService } = require('./projectx');

const SESSION_FILE = path.join(os.homedir(), '.hedgequantx', 'session.json');

// Session Storage
const storage = {
  save(sessions) {
    try {
      const dir = path.dirname(SESSION_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(SESSION_FILE, JSON.stringify(sessions, null, 2));
    } catch (e) { /* ignore */ }
  },
  
  load() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      }
    } catch (e) { /* ignore */ }
    return [];
  },
  
  clear() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        fs.unlinkSync(SESSION_FILE);
      }
    } catch (e) { /* ignore */ }
  }
};

// Connection Manager
const connections = {
  services: [],
  
  add(type, service, propfirm = null, token = null) {
    this.services.push({ 
      type, 
      service, 
      propfirm, 
      token, 
      connectedAt: new Date() 
    });
    this.saveToStorage();
  },
  
  saveToStorage() {
    const sessions = this.services.map(conn => ({
      type: conn.type,
      propfirm: conn.propfirm,
      token: conn.service.token || conn.token
    }));
    storage.save(sessions);
  },
  
  async restoreFromStorage() {
    const sessions = storage.load();
    for (const session of sessions) {
      try {
        if (session.type === 'projectx' && session.token) {
          const service = new ProjectXService(session.propfirm.toLowerCase().replace(/ /g, '_'));
          service.token = session.token;
          
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
      } catch (e) { /* invalid session */ }
    }
    return this.services.length > 0;
  },
  
  remove(index) {
    this.services.splice(index, 1);
    this.saveToStorage();
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
          result.accounts.forEach(account => {
            allAccounts.push({
              ...account,
              connectionType: conn.type,
              propfirm: conn.propfirm || conn.type,
              service: conn.service
            });
          });
        }
      } catch (e) { /* ignore */ }
    }
    return allAccounts;
  },
  
  isConnected() {
    return this.services.length > 0;
  },
  
  disconnectAll() {
    this.services.forEach(conn => {
      if (conn.service && conn.service.logout) {
        conn.service.logout();
      }
    });
    this.services = [];
    storage.clear();
  }
};

module.exports = { storage, connections };
