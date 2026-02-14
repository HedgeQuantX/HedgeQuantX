/**
 * @fileoverview Centralized application settings and constants
 * @module config/settings
 */

// ==================== TIMEOUTS ====================
const TIMEOUTS = {
  // HTTP Requests
  API_REQUEST: 15000,
  LOGIN_REQUEST: 30000,
  
  // WebSocket
  WS_CONNECTION: 10000,
  WS_HEARTBEAT: 5000,
  WS_RECONNECT_BASE: 1000,
  WS_RECONNECT_MAX: 30000,
  
  // Rithmic Protocol
  RITHMIC_LOGIN: 30000,
  RITHMIC_PNL: 10000,
  RITHMIC_TICKER: 10000,
  RITHMIC_CONTRACTS: 5000,
  RITHMIC_PRODUCTS: 8000,
  
  // UI
  SPINNER_INTERVAL: 250,
  MENU_DEBOUNCE: 100,
};

// ==================== RATE LIMITS ====================
const RATE_LIMITS = {
  API: { maxRequests: 60, windowMs: 60000, minInterval: 100 },
  LOGIN: { maxRequests: 5, windowMs: 60000, minInterval: 2000 },
  ORDERS: { maxRequests: 30, windowMs: 60000, minInterval: 200 },
  DATA: { maxRequests: 120, windowMs: 60000, minInterval: 50 },
};

// ==================== SECURITY ====================
const SECURITY = {
  // Encryption
  ALGORITHM: 'aes-256-gcm',
  IV_LENGTH: 16,
  AUTH_TAG_LENGTH: 16,
  SALT_LENGTH: 32,
  KEY_LENGTH: 32,
  PBKDF2_ITERATIONS: 100000,
  
  // Password Policy
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  PASSWORD_REQUIRE_UPPERCASE: true,
  PASSWORD_REQUIRE_NUMBER: true,
  PASSWORD_REQUIRE_SPECIAL: false,
  
  // Session
  SESSION_DIR: '.hedgequantx',
  SESSION_FILE: 'session.enc',
  FILE_PERMISSIONS: 0o600,
  DIR_PERMISSIONS: 0o700,
  
  // Tokens
  TOKEN_VISIBLE_CHARS: 4,
  MAX_RECONNECT_ATTEMPTS: 5,
};

// ==================== VALIDATION ====================
const VALIDATION = {
  USERNAME_MIN: 3,
  USERNAME_MAX: 50,
  USERNAME_PATTERN: /^[a-zA-Z0-9._@-]+$/,
  
  API_KEY_MIN: 10,
  API_KEY_MAX: 256,
  API_KEY_PATTERN: /^[a-zA-Z0-9_-]+$/,
  
  SYMBOL_MIN: 1,
  SYMBOL_MAX: 20,
  SYMBOL_PATTERN: /^[A-Z0-9]+$/,
  
  QUANTITY_MIN: 1,
  QUANTITY_MAX: 1000,
  
  PRICE_MIN: 0,
  PRICE_MAX: 1000000,
  
  ACCOUNT_ID_MAX: Number.MAX_SAFE_INTEGER,
  
  STRING_MAX_LENGTH: 1000,
};

// ==================== HQX SERVER (ULTRA LOW LATENCY) ====================
const HQX_SERVER = {
  DEFAULT_HOST: process.env.HQX_HOST || null,
  DEFAULT_PORT: 3500,
  VERSION: 'v1',
  
  // Latency optimizations
  CONNECT_TIMEOUT: 5000,        // Fast connection timeout
  AUTH_TIMEOUT: 5000,           // Fast auth timeout
  INITIAL_HEARTBEAT: 1000,      // Start at 1s, adapts based on latency
  MIN_HEARTBEAT: 250,           // Minimum 250ms for high latency
  MAX_HEARTBEAT: 2000,          // Maximum 2s for low latency
  
  // Reconnection (fast initial, then backoff)
  RECONNECT_INITIAL: 100,       // Start at 100ms
  RECONNECT_MAX: 10000,         // Max 10s
  MAX_RECONNECT_ATTEMPTS: 10,   // More attempts for trading
  
  // Buffer sizes
  MAX_PAYLOAD: 65536,           // 64KB
  SEND_BUFFER: 65536,
  RECV_BUFFER: 65536,
  
  // Latency thresholds (ms) for adaptive heartbeat
  LATENCY_EXCELLENT: 10,        // <10ms = 2s heartbeat
  LATENCY_GOOD: 50,             // <50ms = 1s heartbeat
  LATENCY_FAIR: 100,            // <100ms = 500ms heartbeat
  // >100ms = 250ms heartbeat
  
  get host() {
    const h = process.env.HQX_HOST || this.DEFAULT_HOST;
    if (!h) throw new Error('HQX_HOST environment variable is required');
    return h;
  },
  get port() {
    return parseInt(process.env.HQX_PORT, 10) || this.DEFAULT_PORT;
  },
  get wsUrl() {
    if (process.env.HQX_WS_URL) return process.env.HQX_WS_URL;
    const protocol = process.env.HQX_WS_SECURE === 'false' ? 'ws' : 'wss';
    return `${protocol}://${this.host}:${this.port}/ws`;
  },
};

// ==================== CACHE ====================
const CACHE = {
  CONTRACTS_TTL: 300000, // 5 minutes
  STATS_TTL: 60000, // 1 minute
};

// ==================== DEBUG ====================
const DEBUG = {
  get enabled() {
    return process.env.HQX_DEBUG === '1';
  },
  LOG_FILE: 'debug.log',
};

// ==================== PROXY ====================
// Static residential proxy for prop firm connections (avoids VPN/datacenter blocks)
// All credentials loaded from environment variables - NEVER hardcode
const PROXY = {
  /**
   * Parse proxy config from env: HQX_PROXY_FR, HQX_PROXY_US, HQX_PROXY_UK
   * Format: host:port:username:password
   */
  _parse(envVar) {
    const val = process.env[envVar];
    if (!val) return null;
    const [host, port, username, password] = val.split(':');
    if (!host || !port || !username || !password) return null;
    return { host, port: parseInt(port, 10), username, password, type: 'socks5' };
  },
  get FRANCE() { return this._parse('HQX_PROXY_FR'); },
  get US() { return this._parse('HQX_PROXY_US'); },
  get UK() { return this._parse('HQX_PROXY_UK'); },
  get active() {
    if (process.env.HQX_PROXY_DISABLED === '1') return null;
    // Try region-specific, then any available
    const region = process.env.HQX_PROXY_REGION || 'FRANCE';
    return this[region.toUpperCase()] || this.FRANCE || this.US || this.UK || null;
  },
  get url() {
    // Direct URL override takes priority
    if (process.env.HQX_PROXY_URL) return process.env.HQX_PROXY_URL;
    const p = this.active;
    if (!p) return null;
    return `socks5://${p.username}:${p.password}@${p.host}:${p.port}`;
  },
};

module.exports = {
  TIMEOUTS,
  RATE_LIMITS,
  SECURITY,
  VALIDATION,
  HQX_SERVER,
  CACHE,
  DEBUG,
  PROXY,
};
