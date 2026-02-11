/**
 * RithmicBroker Daemon
 * 
 * Background process that maintains persistent Rithmic connections.
 * Survives CLI restarts/updates. Only stops on explicit logout or reboot.
 * 
 * Communication: WebSocket server on port 18765
 * 
 * Key features:
 * - Persistent connections (no disconnect on CLI restart)
 * - Smart reconnection with rate limiting (max 10/day)
 * - Cached accounts (no repeated API calls)
 */

'use strict';

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { ReconnectManager } = require('./daemon-reconnect');

// Paths
const BROKER_DIR = path.join(os.homedir(), '.hqx', 'rithmic-broker');
const PID_FILE = path.join(BROKER_DIR, 'broker.pid');
const LOG_FILE = path.join(BROKER_DIR, 'broker.log');
const STATE_FILE = path.join(BROKER_DIR, 'state.json');
const BROKER_PORT = 18765;

// Lazy load RithmicService
let RithmicService = null;
const loadRithmicService = () => {
  if (!RithmicService) {
    ({ RithmicService } = require('../rithmic'));
  }
  return RithmicService;
};

// Logger
const log = (level, msg, data = {}) => {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg} ${JSON.stringify(data)}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (e) { /* ignore */ }
  if (process.env.HQX_DEBUG === '1') console.log(`[Broker] [${level}] ${msg}`, data);
};

/**
 * RithmicBroker Daemon Class
 */
class RithmicBrokerDaemon {
  constructor() {
    this.wss = null;
    this.clients = new Set();
    this.connections = new Map(); // propfirmKey -> { service, credentials, connectedAt, accounts, status }
    this.pnlCache = new Map();    // accountId -> { pnl, openPnl, closedPnl, balance, updatedAt }
    this.running = false;
    
    // Reconnection manager (handles health checks & reconnection with rate limiting)
    this.reconnectManager = new ReconnectManager(this, log);
    
    // Expose loadRithmicService for ReconnectManager
    this.loadRithmicService = loadRithmicService;
  }

  async start() {
    if (this.running) return;
    
    if (!fs.existsSync(BROKER_DIR)) fs.mkdirSync(BROKER_DIR, { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid));
    log('INFO', 'Starting daemon...', { pid: process.pid });
    
    // Restore connections from state (with cached accounts - no API spam)
    try {
      await this.reconnectManager.restoreConnections(STATE_FILE);
    } catch (e) {
      log('WARN', 'Failed to restore connections', { error: e.message });
    }
    
    // Create WebSocket server with proper error handling
    try {
      this.wss = new WebSocket.Server({ port: BROKER_PORT, host: '127.0.0.1' });
    } catch (e) {
      log('ERROR', 'Failed to create WebSocket server', { error: e.message, port: BROKER_PORT });
      throw e;
    }
    
    // Wait for server to be listening
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('WSS listen timeout')), 5000);
      this.wss.on('listening', () => { clearTimeout(timeout); resolve(); });
      this.wss.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
    
    this.wss.on('connection', (ws) => this._handleClient(ws));
    this.wss.on('error', (err) => log('ERROR', 'WSS error', { error: err.message }));
    
    this.running = true;
    log('INFO', 'Daemon started successfully', { pid: process.pid, port: BROKER_PORT });
    
    // Save state on ANY termination signal
    const gracefulShutdown = (signal) => {
      log('WARN', `Received ${signal}, saving state...`);
      this._saveState();
      this.stop();
    };
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
    process.on('uncaughtException', (err) => {
      log('ERROR', 'Uncaught exception, saving state...', { error: err.message });
      this._saveState();
      process.exit(1);
    });
    process.on('unhandledRejection', (err) => {
      log('ERROR', 'Unhandled rejection', { error: err?.message || String(err) });
      this._saveState();
    });
    
    // Auto-save state every 5s (critical for surviving updates)
    setInterval(() => this._saveState(), 5000);
    
    // Start health check (monitoring + rate-limited reconnection)
    this.reconnectManager.startHealthCheck();
  }

  async stop() {
    log('INFO', 'Daemon stopping...');
    this.running = false;
    
    // Stop health check
    this.reconnectManager.stopHealthCheck();
    
    for (const [key, conn] of this.connections) {
      try { if (conn.service?.disconnect) await conn.service.disconnect(); } 
      catch (e) { log('WARN', 'Disconnect error', { propfirm: key, error: e.message }); }
    }
    this.connections.clear();
    
    if (this.wss) {
      for (const client of this.clients) client.close(1000, 'Daemon shutting down');
      this.wss.close();
    }
    
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
    
    log('INFO', 'Daemon stopped');
    process.exit(0);
  }

  _handleClient(ws) {
    this.clients.add(ws);
    log('DEBUG', 'Client connected', { total: this.clients.size });
    
    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const response = await this._handleMessage(msg);
        ws.send(JSON.stringify(response));
      } catch (e) {
        ws.send(JSON.stringify({ error: e.message, requestId: null }));
      }
    });
    
    ws.on('close', () => { this.clients.delete(ws); });
    ws.on('error', () => { this.clients.delete(ws); });
  }

  async _handleMessage(msg) {
    const { type, payload = {}, requestId } = msg;
    
    const handlers = {
      ping: () => ({ type: 'pong', requestId }),
      status: () => ({ type: 'status', payload: this._getStatus(), requestId }),
      login: () => this._handleLogin(payload, requestId),
      logout: () => this._handleLogout(payload, requestId),
      getAccounts: () => this._handleGetAccounts(requestId),
      getPnL: () => this._handleGetPnL(payload, requestId),
      getPositions: () => this._handleGetPositions(payload, requestId),
      placeOrder: () => this._handlePlaceOrder(payload, requestId),
      cancelOrder: () => this._handleCancelOrder(payload, requestId),
      getContracts: () => this._handleGetContracts(payload, requestId),
      searchContracts: () => this._handleSearchContracts(payload, requestId),
      getRithmicCredentials: () => this._handleGetCredentials(payload, requestId),
    };
    
    if (handlers[type]) {
      try { return await handlers[type](); } 
      catch (e) { return { error: e.message, requestId }; }
    }
    return { error: `Unknown type: ${type}`, requestId };
  }

  _getStatus() {
    const conns = [];
    for (const [key, conn] of this.connections) {
      const isAlive = conn.service?.orderConn?.isConnected && 
                      conn.service?.orderConn?.connectionState === 'LOGGED_IN';
      conns.push({
        propfirmKey: key,
        propfirm: conn.service?.propfirm?.name || key,
        connectedAt: conn.connectedAt,
        accountCount: conn.accounts?.length || 0,
        status: conn.status || (isAlive ? 'connected' : 'disconnected'),
        isAlive,
      });
    }
    return { running: this.running, pid: process.pid, uptime: process.uptime(), connections: conns };
  }

  async _handleLogin(payload, requestId) {
    const { propfirmKey, username, password, cachedAccounts } = payload;
    if (!propfirmKey || !username || !password) {
      return { error: 'Missing credentials', requestId };
    }
    
    // Already connected?
    if (this.connections.has(propfirmKey)) {
      const conn = this.connections.get(propfirmKey);
      if (conn.service?.loginInfo) {
        return { type: 'loginResult', payload: { success: true, accounts: conn.accounts, alreadyConnected: true }, requestId };
      }
    }
    
    const Service = loadRithmicService();
    const service = new Service(propfirmKey);
    
    log('INFO', 'Logging in...', { propfirm: propfirmKey, hasCachedAccounts: !!cachedAccounts });
    
    // Login with optional cached accounts (skips fetchAccounts API call)
    const loginOptions = cachedAccounts ? { skipFetchAccounts: true, cachedAccounts } : {};
    const result = await service.login(username, password, loginOptions);
    
    if (result.success) {
      // Use cached accounts if provided, otherwise use result from login
      const accounts = cachedAccounts || result.accounts || [];
      
      this.connections.set(propfirmKey, {
        service,
        credentials: { username, password },
        connectedAt: new Date().toISOString(),
        accounts,
        status: 'connected',
      });
      
      this._setupPnLUpdates(propfirmKey, service);
      this.reconnectManager.setupConnectionMonitoring(propfirmKey, service);
      this._saveState();
      
      log('INFO', 'Login successful', { propfirm: propfirmKey, accounts: accounts.length });
      return { type: 'loginResult', payload: { success: true, accounts }, requestId };
    }
    
    log('WARN', 'Login failed', { propfirm: propfirmKey, error: result.error });
    return { type: 'loginResult', payload: { success: false, error: result.error }, requestId };
  }

  _setupPnLUpdates(propfirmKey, service) {
    service.on('pnlUpdate', (pnl) => {
      if (pnl.accountId) {
        this.pnlCache.set(pnl.accountId, {
          pnl: pnl.dayPnl || ((pnl.openPositionPnl || 0) + (pnl.closedPositionPnl || 0)),
          openPnl: pnl.openPositionPnl || 0,
          closedPnl: pnl.closedPositionPnl || 0,
          balance: pnl.accountBalance || 0,
          updatedAt: Date.now(),
        });
      }
      this._broadcast({ type: 'pnlUpdate', payload: pnl });
    });
    service.on('positionUpdate', (pos) => this._broadcast({ type: 'positionUpdate', payload: pos }));
    service.on('trade', (trade) => this._broadcast({ type: 'trade', payload: trade }));
  }

  _broadcast(msg) {
    const data = JSON.stringify(msg);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(data); } catch (e) { /* ignore */ }
      }
    }
  }

  async _handleLogout(payload, requestId) {
    const { propfirmKey } = payload;
    if (propfirmKey) {
      const conn = this.connections.get(propfirmKey);
      if (conn?.service) { await conn.service.disconnect(); this.connections.delete(propfirmKey); }
    } else {
      await this.stop();
    }
    this._saveState();
    return { type: 'logoutResult', payload: { success: true }, requestId };
  }

  async _handleGetAccounts(requestId) {
    const allAccounts = [];
    for (const [propfirmKey, conn] of this.connections) {
      // Include accounts even if service is temporarily disconnected (from cache)
      for (const acc of conn.accounts || []) {
        allAccounts.push({ 
          ...acc, 
          propfirmKey, 
          propfirm: conn.service?.propfirm?.name || propfirmKey,
          connectionStatus: conn.status
        });
      }
    }
    return { type: 'accounts', payload: { accounts: allAccounts }, requestId };
  }

  _handleGetPnL(payload, requestId) {
    const cached = this.pnlCache.get(payload.accountId);
    return { type: 'pnl', payload: cached || { pnl: null }, requestId };
  }

  async _handleGetPositions(payload, requestId) {
    const conn = this.connections.get(payload.propfirmKey);
    if (!conn?.service) return { error: 'Not connected', requestId };
    return { type: 'positions', payload: await conn.service.getPositions(), requestId };
  }

  async _handlePlaceOrder(payload, requestId) {
    const conn = this.connections.get(payload.propfirmKey);
    if (!conn?.service) return { error: 'Not connected', requestId };
    return { type: 'orderResult', payload: await conn.service.placeOrder(payload.orderData), requestId };
  }

  async _handleCancelOrder(payload, requestId) {
    const conn = this.connections.get(payload.propfirmKey);
    if (!conn?.service) return { error: 'Not connected', requestId };
    return { type: 'cancelResult', payload: await conn.service.cancelOrder(payload.orderId), requestId };
  }

  async _handleGetContracts(payload, requestId) {
    const conn = this.connections.get(payload.propfirmKey);
    if (!conn?.service) {
      log('WARN', 'getContracts: Not connected', { propfirm: payload.propfirmKey, hasConn: !!conn });
      return { error: 'Not connected to broker', requestId };
    }
    
    // Log service state for debugging
    const hasCredentials = !!conn.service.credentials;
    const hasTickerConn = !!conn.service.tickerConn;
    const tickerState = conn.service.tickerConn?.connectionState;
    log('DEBUG', 'getContracts request', { propfirm: payload.propfirmKey, hasCredentials, hasTickerConn, tickerState });
    
    try {
      const result = await conn.service.getContracts();
      
      // Log detailed result
      const tickerStateAfter = conn.service.tickerConn?.connectionState;
      log('DEBUG', 'getContracts result', { 
        propfirm: payload.propfirmKey, 
        success: result.success, 
        count: result.contracts?.length || 0,
        source: result.source,
        tickerStateAfter,
        error: result.error 
      });
      
      // If no contracts found, return fallback list for common futures
      if (!result.success || result.contracts?.length === 0) {
        log('WARN', 'Using fallback contracts list');
        const fallbackContracts = this._getFallbackContracts();
        return { type: 'contracts', payload: { success: true, contracts: fallbackContracts, source: 'fallback' }, requestId };
      }
      
      return { type: 'contracts', payload: result, requestId };
    } catch (err) {
      log('ERROR', 'getContracts exception', { propfirm: payload.propfirmKey, error: err.message, stack: err.stack?.split('\n')[1] });
      // Return fallback on error
      log('WARN', 'Using fallback contracts due to error');
      const fallbackContracts = this._getFallbackContracts();
      return { type: 'contracts', payload: { success: true, contracts: fallbackContracts, source: 'fallback' }, requestId };
    }
  }
  
  /**
   * Get fallback contracts list when TICKER_PLANT fails
   * These are common futures that most prop firms support
   */
  _getFallbackContracts() {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    
    // Determine front month code (H=Mar, M=Jun, U=Sep, Z=Dec for indices)
    const monthCodes = ['H', 'H', 'H', 'M', 'M', 'M', 'U', 'U', 'U', 'Z', 'Z', 'Z'];
    const frontMonth = monthCodes[month];
    const yearCode = String(year).slice(-1);
    const suffix = frontMonth + yearCode;
    
    return [
      { symbol: `MNQ${suffix}`, baseSymbol: 'MNQ', name: 'Micro E-mini Nasdaq-100', exchange: 'CME', tickSize: 0.25 },
      { symbol: `MES${suffix}`, baseSymbol: 'MES', name: 'Micro E-mini S&P 500', exchange: 'CME', tickSize: 0.25 },
      { symbol: `NQ${suffix}`, baseSymbol: 'NQ', name: 'E-mini Nasdaq-100', exchange: 'CME', tickSize: 0.25 },
      { symbol: `ES${suffix}`, baseSymbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', tickSize: 0.25 },
      { symbol: `MCL${suffix}`, baseSymbol: 'MCL', name: 'Micro WTI Crude Oil', exchange: 'NYMEX', tickSize: 0.01 },
      { symbol: `MGC${suffix}`, baseSymbol: 'MGC', name: 'Micro Gold', exchange: 'COMEX', tickSize: 0.10 },
      { symbol: `M2K${suffix}`, baseSymbol: 'M2K', name: 'Micro E-mini Russell 2000', exchange: 'CME', tickSize: 0.10 },
      { symbol: `MYM${suffix}`, baseSymbol: 'MYM', name: 'Micro E-mini Dow', exchange: 'CBOT', tickSize: 0.50 },
      { symbol: `RTY${suffix}`, baseSymbol: 'RTY', name: 'E-mini Russell 2000', exchange: 'CME', tickSize: 0.10 },
      { symbol: `YM${suffix}`, baseSymbol: 'YM', name: 'E-mini Dow', exchange: 'CBOT', tickSize: 1.00 },
      { symbol: `CL${suffix}`, baseSymbol: 'CL', name: 'Crude Oil', exchange: 'NYMEX', tickSize: 0.01 },
      { symbol: `GC${suffix}`, baseSymbol: 'GC', name: 'Gold', exchange: 'COMEX', tickSize: 0.10 },
    ];
  }

  async _handleSearchContracts(payload, requestId) {
    const conn = this.connections.get(payload.propfirmKey);
    if (!conn?.service) return { error: 'Not connected', requestId };
    return { type: 'searchResults', payload: await conn.service.searchContracts(payload.searchText), requestId };
  }

  _handleGetCredentials(payload, requestId) {
    const conn = this.connections.get(payload.propfirmKey);
    if (!conn) {
      log('WARN', 'getCredentials: propfirm not found', { propfirm: payload.propfirmKey });
      return { error: `Propfirm "${payload.propfirmKey}" not connected - run "hqx login"`, requestId };
    }
    if (!conn.service) {
      log('WARN', 'getCredentials: service is null', { propfirm: payload.propfirmKey, status: conn.status });
      return { error: `Connection lost for "${payload.propfirmKey}" - run "hqx login"`, requestId };
    }
    const creds = conn.service.getRithmicCredentials?.();
    if (!creds) {
      log('WARN', 'getCredentials: credentials null', { propfirm: payload.propfirmKey });
      return { error: `Credentials not available for "${payload.propfirmKey}"`, requestId };
    }
    return { type: 'credentials', payload: creds, requestId };
  }

  /**
   * Sanitize account for safe serialization - ensure all fields are proper types
   */
  _sanitizeAccount(acc) {
    if (!acc || typeof acc !== 'object') return null;
    if (!acc.accountId) return null;
    
    return {
      accountId: String(acc.accountId),
      fcmId: acc.fcmId ? String(acc.fcmId) : undefined,
      ibId: acc.ibId ? String(acc.ibId) : undefined,
      accountName: acc.accountName ? String(acc.accountName) : undefined,
      currency: acc.currency ? String(acc.currency) : undefined,
    };
  }

  /**
   * Save state including accounts (for reconnection without API calls)
   * CRITICAL: This state allows reconnection without hitting Rithmic's 2000 GetAccounts limit
   */
  _saveState() {
    const state = { connections: [], savedAt: new Date().toISOString() };
    for (const [key, conn] of this.connections) {
      if (conn.credentials) {
        // Sanitize accounts to prevent corrupted data
        const accounts = (conn.accounts || [])
          .map(a => this._sanitizeAccount(a))
          .filter(Boolean);
        
        state.connections.push({ 
          propfirmKey: key, 
          credentials: conn.credentials,
          accounts,
          connectedAt: conn.connectedAt,
          propfirm: conn.service?.propfirm?.name || key
        });
      }
    }
    try { 
      fs.writeFileSync(STATE_FILE, JSON.stringify(state)); 
      log('DEBUG', 'State saved', { connections: state.connections.length });
    } catch (e) { 
      log('ERROR', 'Failed to save state', { error: e.message });
    }
  }
}

// Main entry point
if (require.main === module) {
  // Ensure log directory exists early
  if (!fs.existsSync(BROKER_DIR)) {
    fs.mkdirSync(BROKER_DIR, { recursive: true });
  }
  
  // Log startup attempt
  const startupLog = (msg) => {
    const ts = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${ts}] [STARTUP] ${msg}\n`);
  };
  
  startupLog(`Daemon starting (pid=${process.pid}, node=${process.version})`);
  
  try {
    const daemon = new RithmicBrokerDaemon();
    daemon.start().catch((e) => { 
      startupLog(`FATAL: start() failed - ${e.message}`);
      console.error('Daemon failed:', e.message); 
      process.exit(1); 
    });
  } catch (e) {
    startupLog(`FATAL: constructor failed - ${e.message}`);
    console.error('Daemon failed:', e.message);
    process.exit(1);
  }
}

module.exports = { RithmicBrokerDaemon, BROKER_PORT, BROKER_DIR, PID_FILE, LOG_FILE, STATE_FILE };
