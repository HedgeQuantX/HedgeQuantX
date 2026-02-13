/**
 * @fileoverview HQX Daemon Module
 * @module services/daemon
 * 
 * Provides persistent Rithmic connection via background daemon.
 * TUI can restart/update without losing connection.
 * 
 * Architecture:
 * 
 *   ┌─────────────────────────────────────────────────────┐
 *   │  HQX DAEMON (hqx --daemon)                          │
 *   │  ─────────────────────────────────────────────────  │
 *   │  • Persistent process (survives TUI restarts)      │
 *   │  • Maintains Rithmic WebSocket connections          │
 *   │  • ORDER_PLANT, PNL_PLANT, TICKER_PLANT            │
 *   │  • Handles reconnection automatically               │
 *   │  • Runs algo strategies                             │
 *   └──────────────────────┬──────────────────────────────┘
 *                          │ Unix Socket IPC
 *   ┌──────────────────────▼──────────────────────────────┐
 *   │  HQX TUI (hqx)                                      │
 *   │  ─────────────────────────────────────────────────  │
 *   │  • User interface                                   │
 *   │  • Can restart/update without connection loss       │
 *   │  • Sends commands to daemon                         │
 *   │  • Receives events/data from daemon                 │
 *   └─────────────────────────────────────────────────────┘
 * 
 * Usage:
 *   hqx --daemon     # Start daemon in background
 *   hqx              # Start TUI (connects to daemon if available)
 *   hqx --stop       # Stop daemon
 */

'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { SOCKET_PATH, PID_FILE, SOCKET_DIR } = require('./constants');
const { DaemonServer } = require('./server');
const { DaemonClient, getDaemonClient } = require('./client');
const { logger } = require('../../utils/logger');

const log = logger.scope('Daemon');

/**
 * Check if daemon is running
 * @returns {boolean}
 */
function isDaemonRunning() {
  if (!fs.existsSync(PID_FILE)) {
    return false;
  }
  
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'));
    
    // Check if process is alive
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // Process not running, clean up stale files
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
    if (fs.existsSync(SOCKET_PATH)) {
      fs.unlinkSync(SOCKET_PATH);
    }
    return false;
  }
}

/**
 * Get daemon PID
 * @returns {number|null}
 */
function getDaemonPid() {
  if (!fs.existsSync(PID_FILE)) {
    return null;
  }
  
  try {
    return parseInt(fs.readFileSync(PID_FILE, 'utf8'));
  } catch (_) {
    return null;
  }
}

/**
 * Start daemon in foreground (blocking)
 * Used when running `hqx --daemon`
 * @returns {Promise<void>}
 */
async function startDaemonForeground() {
  if (isDaemonRunning()) {
    console.log('Daemon already running (PID:', getDaemonPid() + ')');
    process.exit(1);
  }
  
  const daemon = new DaemonServer();
  
  // Handle shutdown signals
  process.on('SIGINT', () => daemon.stop());
  process.on('SIGTERM', () => daemon.stop());
  
  const started = await daemon.start();
  
  if (!started) {
    console.error('Failed to start daemon');
    process.exit(1);
  }
  
  console.log('Daemon started (PID:', process.pid + ')');
  console.log('Socket:', SOCKET_PATH);
  
  // Restore session if available
  const { storage } = require('../session');
  const sessions = storage.load();
  const rithmicSession = sessions.find(s => s.type === 'rithmic' && s.credentials);
  
  if (rithmicSession) {
    console.log('Restoring session...');
    const { RithmicService } = require('../rithmic');
    
    daemon.rithmic = new RithmicService(rithmicSession.propfirmKey);
    daemon._setupRithmicEvents();
    
    const result = await daemon.rithmic.login(
      rithmicSession.credentials.username,
      rithmicSession.credentials.password,
      { skipFetchAccounts: true, cachedAccounts: rithmicSession.accounts }
    );
    
    if (result.success) {
      daemon.propfirm = {
        key: rithmicSession.propfirmKey,
        name: daemon.rithmic.propfirm.name,
      };
      console.log('Session restored:', daemon.propfirm.name);
      console.log('Accounts:', daemon.rithmic.accounts?.length || 0);
    } else {
      console.log('Session restore failed:', result.error);
    }
  }
  
  console.log('Daemon ready. Press Ctrl+C to stop.');
}

/**
 * Start daemon in background
 * @returns {Promise<boolean>}
 */
async function startDaemonBackground() {
  if (isDaemonRunning()) {
    log.debug('Daemon already running');
    return true;
  }
  
  return new Promise((resolve) => {
    // Spawn daemon process
    const daemon = spawn(process.execPath, [
      require.resolve('../../cli-daemon'),
    ], {
      detached: true,
      stdio: 'ignore',
    });
    
    daemon.unref();
    
    // Wait for daemon to start
    let attempts = 0;
    const maxAttempts = 20;
    
    const check = setInterval(() => {
      attempts++;
      
      if (isDaemonRunning()) {
        clearInterval(check);
        log.debug('Daemon started');
        resolve(true);
      } else if (attempts >= maxAttempts) {
        clearInterval(check);
        log.error('Daemon failed to start');
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Stop daemon
 * @returns {boolean}
 */
function stopDaemon() {
  const pid = getDaemonPid();
  
  if (!pid) {
    console.log('Daemon not running');
    return true;
  }
  
  try {
    process.kill(pid, 'SIGTERM');
    console.log('Daemon stopped (PID:', pid + ')');
    return true;
  } catch (err) {
    console.error('Failed to stop daemon:', err.message);
    return false;
  }
}

/**
 * Ensure daemon is running, start if not
 * @returns {Promise<DaemonClient|null>}
 */
async function ensureDaemon() {
  // Check if daemon is running
  if (!isDaemonRunning()) {
    log.debug('Daemon not running, starting...');
    const started = await startDaemonBackground();
    
    if (!started) {
      return null;
    }
  }
  
  // Connect client
  const client = getDaemonClient();
  const connected = await client.connect();
  
  if (!connected) {
    log.error('Failed to connect to daemon');
    return null;
  }
  
  return client;
}

module.exports = {
  // Server
  DaemonServer,
  startDaemonForeground,
  startDaemonBackground,
  stopDaemon,
  
  // Client
  DaemonClient,
  getDaemonClient,
  ensureDaemon,
  
  // Utilities
  isDaemonRunning,
  getDaemonPid,
  
  // Constants
  SOCKET_PATH,
  PID_FILE,
};
