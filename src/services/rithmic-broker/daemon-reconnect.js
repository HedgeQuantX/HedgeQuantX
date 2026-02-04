/**
 * Daemon Reconnection Module
 * 
 * Handles connection monitoring and smart reconnection with rate limiting.
 * Designed to avoid API quota exhaustion (Rithmic limit: 2000 GetAccounts calls)
 * 
 * Key principles:
 * - Never spam reconnection attempts
 * - Reuse cached accounts (no fetchAccounts on reconnect)
 * - Rate limit: 1 attempt per hour, max 10 per day
 */

'use strict';

const fs = require('fs');

// Rate limiting configuration
const RECONNECT_CONFIG = {
  MIN_INTERVAL_MS: 3600000,    // 1 hour minimum between attempts
  MAX_PER_DAY: 10,             // Max 10 reconnects per 24h
  HEALTH_CHECK_INTERVAL: 30000, // Check every 30s
  RESTORE_RETRY_DELAY: 5000,   // 5s between restore attempts
  RESTORE_MAX_ATTEMPTS: 3,     // Max 3 attempts on restore
};

/**
 * ReconnectManager - Manages connection monitoring and reconnection
 */
class ReconnectManager {
  constructor(daemon, logger) {
    this.daemon = daemon;
    this.log = logger;
    this.healthCheckTimer = null;
    
    // Rate limiting state per propfirm
    this.reconnectState = new Map(); // propfirmKey -> { lastAttempt, countToday, resetTime }
  }

  /**
   * Start health check loop
   */
  startHealthCheck() {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    
    this.healthCheckTimer = setInterval(() => {
      this._checkAllConnections();
    }, RECONNECT_CONFIG.HEALTH_CHECK_INTERVAL);
    
    this.log('INFO', 'Health check started', { interval: RECONNECT_CONFIG.HEALTH_CHECK_INTERVAL });
  }

  /**
   * Stop health check loop
   */
  stopHealthCheck() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Check all connections health
   */
  _checkAllConnections() {
    for (const [propfirmKey, conn] of this.daemon.connections) {
      this._checkConnection(propfirmKey, conn);
    }
  }

  /**
   * Check single connection health
   */
  _checkConnection(propfirmKey, conn) {
    const service = conn.service;
    
    // No service = not connected
    if (!service) {
      if (conn.status !== 'disconnected' && conn.status !== 'reconnecting') {
        conn.status = 'disconnected';
        this._broadcastStatus(propfirmKey, 'disconnected');
      }
      return;
    }
    
    // Check if ORDER_PLANT is alive
    const isAlive = service.orderConn?.isConnected && 
                    service.orderConn?.connectionState === 'LOGGED_IN';
    
    if (!isAlive && conn.status === 'connected') {
      this.log('WARN', 'Health check: connection lost', { propfirm: propfirmKey });
      conn.status = 'disconnected';
      this._broadcastStatus(propfirmKey, 'disconnected');
      
      // Attempt reconnect if we have credentials
      if (conn.credentials) {
        this._attemptReconnect(propfirmKey, conn);
      }
    } else if (isAlive && conn.status !== 'connected') {
      conn.status = 'connected';
      this._broadcastStatus(propfirmKey, 'connected');
    }
  }

  /**
   * Setup connection event monitoring for a service
   */
  setupConnectionMonitoring(propfirmKey, service) {
    const conn = this.daemon.connections.get(propfirmKey);
    if (!conn) return;

    service.on('disconnected', ({ plant, code, reason }) => {
      this.log('WARN', 'Service disconnected', { propfirm: propfirmKey, plant, code, reason });
      conn.status = 'disconnected';
      this._broadcastStatus(propfirmKey, 'disconnected', { code, reason });
    });

    service.on('reconnecting', () => {
      this.log('INFO', 'Service reconnecting', { propfirm: propfirmKey });
      conn.status = 'reconnecting';
      this._broadcastStatus(propfirmKey, 'reconnecting');
    });

    service.on('reconnected', ({ accounts }) => {
      this.log('INFO', 'Service reconnected', { propfirm: propfirmKey });
      conn.status = 'connected';
      conn.connectedAt = new Date().toISOString();
      if (accounts) conn.accounts = accounts;
      this._broadcastStatus(propfirmKey, 'connected');
    });

    service.on('reconnectFailed', ({ error }) => {
      this.log('WARN', 'Service reconnect failed', { propfirm: propfirmKey, error });
      // Don't change status - let health check handle it
    });
  }

  /**
   * Attempt reconnection with rate limiting
   */
  async _attemptReconnect(propfirmKey, conn) {
    // Check rate limits
    if (!this._canReconnect(propfirmKey)) {
      this.log('WARN', 'Reconnect rate limited', { propfirm: propfirmKey });
      this._broadcastStatus(propfirmKey, 'rate_limited', { 
        message: 'Reconnection rate limited. Try again later or run "hqx login".' 
      });
      return;
    }

    conn.status = 'reconnecting';
    this._broadcastStatus(propfirmKey, 'reconnecting');
    this._recordReconnectAttempt(propfirmKey);

    this.log('INFO', 'Attempting reconnect', { propfirm: propfirmKey });

    try {
      // Disconnect old service
      if (conn.service) {
        try { await conn.service.disconnect(); } catch (e) { /* ignore */ }
      }

      // Create new service and login WITH cached accounts (no API call for accounts)
      const Service = this.daemon.loadRithmicService();
      const service = new Service(propfirmKey);

      const result = await service.login(conn.credentials.username, conn.credentials.password, {
        skipFetchAccounts: true,
        cachedAccounts: conn.accounts
      });

      if (result.success) {
        this.log('INFO', 'Reconnect successful', { propfirm: propfirmKey });
        
        conn.service = service;
        conn.status = 'connected';
        conn.connectedAt = new Date().toISOString();
        // Keep existing accounts (from cache)
        
        this.daemon._setupPnLUpdates(propfirmKey, service);
        this.setupConnectionMonitoring(propfirmKey, service);
        this.daemon._saveState();
        
        this._broadcastStatus(propfirmKey, 'connected');
      } else {
        this.log('WARN', 'Reconnect failed', { propfirm: propfirmKey, error: result.error });
        conn.status = 'disconnected';
        this._broadcastStatus(propfirmKey, 'disconnected', { error: result.error });
      }
    } catch (err) {
      this.log('ERROR', 'Reconnect error', { propfirm: propfirmKey, error: err.message });
      conn.status = 'disconnected';
      this._broadcastStatus(propfirmKey, 'disconnected', { error: err.message });
    }
  }

  /**
   * Check if we can attempt reconnection (rate limiting)
   */
  _canReconnect(propfirmKey) {
    const now = Date.now();
    let state = this.reconnectState.get(propfirmKey);
    
    if (!state) {
      state = { lastAttempt: 0, countToday: 0, resetTime: now };
      this.reconnectState.set(propfirmKey, state);
    }

    // Reset daily counter
    if (now - state.resetTime > 86400000) {
      state.countToday = 0;
      state.resetTime = now;
    }

    // Check minimum interval
    if (now - state.lastAttempt < RECONNECT_CONFIG.MIN_INTERVAL_MS) {
      return false;
    }

    // Check daily limit
    if (state.countToday >= RECONNECT_CONFIG.MAX_PER_DAY) {
      return false;
    }

    return true;
  }

  /**
   * Record a reconnect attempt
   */
  _recordReconnectAttempt(propfirmKey) {
    const state = this.reconnectState.get(propfirmKey) || { 
      lastAttempt: 0, 
      countToday: 0, 
      resetTime: Date.now() 
    };
    
    state.lastAttempt = Date.now();
    state.countToday++;
    this.reconnectState.set(propfirmKey, state);
  }

  /**
   * Validate cached accounts - ensure all fields are proper strings
   */
  _validateAccounts(accounts) {
    if (!Array.isArray(accounts)) return [];
    
    return accounts.filter(acc => {
      // Must have accountId as string
      if (!acc || typeof acc.accountId !== 'string') return false;
      // fcmId and ibId should be strings if present
      if (acc.fcmId && typeof acc.fcmId !== 'string') return false;
      if (acc.ibId && typeof acc.ibId !== 'string') return false;
      return true;
    });
  }

  /**
   * Restore connections from state with retry logic
   */
  async restoreConnections(stateFile) {
    if (!fs.existsSync(stateFile)) return;

    try {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      
      for (const saved of data.connections || []) {
        if (!saved.credentials || !saved.propfirmKey) continue;

        this.log('INFO', 'Restoring connection', { propfirm: saved.propfirmKey });
        
        // Validate cached accounts to prevent crashes from corrupted data
        const validAccounts = this._validateAccounts(saved.accounts);
        if (saved.accounts?.length && validAccounts.length !== saved.accounts.length) {
          this.log('WARN', 'Some cached accounts invalid, will re-fetch', { 
            propfirm: saved.propfirmKey,
            original: saved.accounts?.length || 0,
            valid: validAccounts.length
          });
        }
        
        let success = false;
        let attempts = 0;

        while (!success && attempts < RECONNECT_CONFIG.RESTORE_MAX_ATTEMPTS) {
          attempts++;
          
          try {
            const result = await this.daemon._handleLogin({
              ...saved.credentials,
              propfirmKey: saved.propfirmKey,
              // Only use cached accounts if they are valid, otherwise re-fetch
              cachedAccounts: validAccounts.length > 0 ? validAccounts : null
            }, null);

            if (result.payload?.success) {
              success = true;
              this.log('INFO', 'Connection restored', { propfirm: saved.propfirmKey });
            } else {
              this.log('WARN', 'Restore attempt failed', {
                propfirm: saved.propfirmKey,
                attempt: attempts,
                error: result.payload?.error || result.error
              });

              if (attempts < RECONNECT_CONFIG.RESTORE_MAX_ATTEMPTS) {
                await new Promise(r => setTimeout(r, RECONNECT_CONFIG.RESTORE_RETRY_DELAY));
              }
            }
          } catch (e) {
            this.log('ERROR', 'Restore attempt error', { 
              propfirm: saved.propfirmKey, 
              attempt: attempts,
              error: e.message 
            });
            
            if (attempts < RECONNECT_CONFIG.RESTORE_MAX_ATTEMPTS) {
              await new Promise(r => setTimeout(r, RECONNECT_CONFIG.RESTORE_RETRY_DELAY));
            }
          }
        }

        if (!success) {
          this.log('WARN', 'Failed to restore, storing for later', { propfirm: saved.propfirmKey });
          this.daemon.connections.set(saved.propfirmKey, {
            service: null,
            credentials: saved.credentials,
            connectedAt: null,
            accounts: validAccounts,
            status: 'disconnected',
          });
        }
      }
    } catch (e) {
      this.log('ERROR', 'Restore failed', { error: e.message });
      // Delete corrupted state file
      try { fs.unlinkSync(stateFile); } catch (e2) { /* ignore */ }
    }
  }

  /**
   * Broadcast connection status to CLI clients
   */
  _broadcastStatus(propfirmKey, status, extra = {}) {
    this.daemon._broadcast({
      type: 'connectionStatus',
      payload: { propfirmKey, status, ...extra }
    });
  }
}

module.exports = { ReconnectManager, RECONNECT_CONFIG };
