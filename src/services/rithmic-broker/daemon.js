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
    
    // Restore connections from state (with cached accounts - no API spam)
    await this.reconnectManager.restoreConnections(STATE_FILE);
    
    this.wss = new WebSocket.Server({ port: BROKER_PORT, host: '127.0.0.1' });
    this.wss.on('connection', (ws) => this._handleClient(ws));
    this.wss.on('error', (err) => log('ERROR', 'WSS error', { error: err.message }));
    
    this.running = true;
    log('INFO', 'Daemon started', { pid: process.pid, port: BROKER_PORT });
    
    process.on('SIGTERM', () => this.stop());
    process.on('SIGINT', () => this.stop());
    
    // Auto-save state every 30s
    setInterval(() => this._saveState(), 30000);
    
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
    if (!conn?.service) return { error: 'Not connected to broker', requestId };
    
    try {
      const result = await conn.service.getContracts();
      return { type: 'contracts', payload: result, requestId };
    } catch (err) {
      log('ERROR', 'getContracts failed', { propfirm: payload.propfirmKey, error: err.message });
      return { type: 'contracts', payload: { success: false, error: err.message, contracts: [] }, requestId };
    }
  }

  async _handleSearchContracts(payload, requestId) {
    const conn = this.connections.get(payload.propfirmKey);
    if (!conn?.service) return { error: 'Not connected', requestId };
    return { type: 'searchResults', payload: await conn.service.searchContracts(payload.searchText), requestId };
  }

  _handleGetCredentials(payload, requestId) {
    const conn = this.connections.get(payload.propfirmKey);
    if (!conn?.service) return { error: 'Not connected', requestId };
    return { type: 'credentials', payload: conn.service.getRithmicCredentials?.() || null, requestId };
  }

  /**
   * Save state including accounts (for reconnection without API calls)
   */
  _saveState() {
    const state = { connections: [], savedAt: new Date().toISOString() };
    for (const [key, conn] of this.connections) {
      if (conn.credentials) {
        state.connections.push({ 
          propfirmKey: key, 
          credentials: conn.credentials,
          accounts: conn.accounts || [],  // Save accounts to avoid fetchAccounts on restore
          connectedAt: conn.connectedAt
        });
      }
    }
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }
}

// Main entry point
if (require.main === module) {
  const daemon = new RithmicBrokerDaemon();
  daemon.start().catch((e) => { console.error('Daemon failed:', e.message); process.exit(1); });
}

module.exports = { RithmicBrokerDaemon, BROKER_PORT, BROKER_DIR, PID_FILE, LOG_FILE, STATE_FILE };
