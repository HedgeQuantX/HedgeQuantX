/**
 * Local Storage Service
 * Stores user data locally on their machine
 * - Saved connections (PropFirm credentials)
 * - Session history
 * - User preferences
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// Storage directory in user's home folder
const STORAGE_DIR = path.join(os.homedir(), '.hedgequantx');
const CONNECTIONS_FILE = path.join(STORAGE_DIR, 'connections.enc');
const SETTINGS_FILE = path.join(STORAGE_DIR, 'settings.json');
const HISTORY_FILE = path.join(STORAGE_DIR, 'history.json');

// Encryption key derived from machine ID
const getEncryptionKey = () => {
  const machineId = `${os.hostname()}-${os.platform()}-${os.userInfo().username}`;
  return crypto.createHash('sha256').update(machineId).digest();
};

class LocalStorageService {
  constructor() {
    this._ensureStorageDir();
  }

  /**
   * Ensure storage directory exists
   */
  _ensureStorageDir() {
    if (!fs.existsSync(STORAGE_DIR)) {
      fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o700 });
    }
  }

  /**
   * Encrypt data
   */
  _encrypt(data) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt data
   */
  _decrypt(encryptedData) {
    try {
      const key = getEncryptionKey();
      const [ivHex, encrypted] = encryptedData.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (error) {
      return null;
    }
  }

  // ==================== CONNECTIONS ====================

  /**
   * Save a PropFirm connection
   */
  saveConnection(connection) {
    const connections = this.getConnections();
    
    // Check if connection already exists
    const existingIndex = connections.findIndex(
      c => c.propfirm === connection.propfirm && c.username === connection.username
    );
    
    const connectionData = {
      id: connection.id || crypto.randomUUID(),
      propfirm: connection.propfirm,
      propfirmName: connection.propfirmName,
      username: connection.username,
      password: connection.password, // Encrypted in file
      lastUsed: Date.now(),
      createdAt: connection.createdAt || Date.now()
    };
    
    if (existingIndex >= 0) {
      connections[existingIndex] = connectionData;
    } else {
      connections.push(connectionData);
    }
    
    // Save encrypted
    const encrypted = this._encrypt(connections);
    fs.writeFileSync(CONNECTIONS_FILE, encrypted, { mode: 0o600 });
    
    return connectionData;
  }

  /**
   * Get all saved connections
   */
  getConnections() {
    try {
      if (!fs.existsSync(CONNECTIONS_FILE)) {
        return [];
      }
      const encrypted = fs.readFileSync(CONNECTIONS_FILE, 'utf8');
      return this._decrypt(encrypted) || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Get connection by ID
   */
  getConnection(id) {
    const connections = this.getConnections();
    return connections.find(c => c.id === id);
  }

  /**
   * Delete a connection
   */
  deleteConnection(id) {
    const connections = this.getConnections();
    const filtered = connections.filter(c => c.id !== id);
    
    if (filtered.length === connections.length) {
      return false; // Not found
    }
    
    const encrypted = this._encrypt(filtered);
    fs.writeFileSync(CONNECTIONS_FILE, encrypted, { mode: 0o600 });
    return true;
  }

  /**
   * Update last used timestamp
   */
  updateConnectionLastUsed(id) {
    const connections = this.getConnections();
    const connection = connections.find(c => c.id === id);
    
    if (connection) {
      connection.lastUsed = Date.now();
      const encrypted = this._encrypt(connections);
      fs.writeFileSync(CONNECTIONS_FILE, encrypted, { mode: 0o600 });
    }
  }

  // ==================== SETTINGS ====================

  /**
   * Save user settings
   */
  saveSettings(settings) {
    const currentSettings = this.getSettings();
    const merged = { ...currentSettings, ...settings };
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(merged, null, 2), { mode: 0o600 });
    return merged;
  }

  /**
   * Get user settings
   */
  getSettings() {
    try {
      if (!fs.existsSync(SETTINGS_FILE)) {
        return this._getDefaultSettings();
      }
      const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
      return { ...this._getDefaultSettings(), ...JSON.parse(data) };
    } catch (error) {
      return this._getDefaultSettings();
    }
  }

  /**
   * Default settings
   */
  _getDefaultSettings() {
    return {
      defaultContracts: 1,
      defaultDailyTarget: 500,
      defaultMaxRisk: 250,
      autoConnect: false,
      theme: 'dark',
      notifications: true,
      analyticsEnabled: true // User can opt-out
    };
  }

  // ==================== HISTORY ====================

  /**
   * Add to trading history
   */
  addToHistory(entry) {
    const history = this.getHistory();
    
    history.push({
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      ...entry
    });
    
    // Keep last 1000 entries
    const trimmed = history.slice(-1000);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(trimmed, null, 2), { mode: 0o600 });
    
    return entry;
  }

  /**
   * Get trading history
   */
  getHistory(limit = 100) {
    try {
      if (!fs.existsSync(HISTORY_FILE)) {
        return [];
      }
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      const history = JSON.parse(data);
      return history.slice(-limit);
    } catch (error) {
      return [];
    }
  }

  /**
   * Get stats from history
   */
  getLocalStats() {
    const history = this.getHistory(1000);
    const trades = history.filter(h => h.type === 'trade');
    
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.pnl > 0).length;
    const losses = trades.filter(t => t.pnl < 0).length;
    const totalPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    
    return {
      totalTrades,
      wins,
      losses,
      winRate: totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : 0,
      totalPnl: totalPnl.toFixed(2),
      avgPnl: totalTrades > 0 ? (totalPnl / totalTrades).toFixed(2) : 0
    };
  }

  /**
   * Clear all history
   */
  clearHistory() {
    if (fs.existsSync(HISTORY_FILE)) {
      fs.unlinkSync(HISTORY_FILE);
    }
  }

  // ==================== UTILITIES ====================

  /**
   * Get storage path info
   */
  getStoragePath() {
    return STORAGE_DIR;
  }

  /**
   * Check if storage exists
   */
  hasStoredData() {
    return fs.existsSync(CONNECTIONS_FILE) || fs.existsSync(HISTORY_FILE);
  }

  /**
   * Export all data (for backup)
   */
  exportData() {
    return {
      connections: this.getConnections(),
      settings: this.getSettings(),
      history: this.getHistory(1000),
      exportedAt: Date.now()
    };
  }

  /**
   * Clear all data
   */
  clearAll() {
    if (fs.existsSync(CONNECTIONS_FILE)) fs.unlinkSync(CONNECTIONS_FILE);
    if (fs.existsSync(SETTINGS_FILE)) fs.unlinkSync(SETTINGS_FILE);
    if (fs.existsSync(HISTORY_FILE)) fs.unlinkSync(HISTORY_FILE);
  }
}

// Singleton
const localStorage = new LocalStorageService();

module.exports = { LocalStorageService, localStorage };
