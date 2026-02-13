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
const path = require('path');
const { spawn, execSync } = require('child_process');
const { SOCKET_PATH, PID_FILE, SOCKET_DIR } = require('./constants');
const { DaemonServer } = require('./server');
const { DaemonClient, getDaemonClient } = require('./client');
const { logger } = require('../../utils/logger');

const log = logger.scope('Daemon');

/** Isolated daemon directory - survives npm updates */
const DAEMON_INSTALL_DIR = path.join(SOCKET_DIR, 'daemon');
const DAEMON_ENTRY = path.join(DAEMON_INSTALL_DIR, 'cli-daemon.js');
const DAEMON_VERSION_FILE = path.join(DAEMON_INSTALL_DIR, 'version.txt');

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
 * Get current package version
 * @returns {string}
 */
function getCurrentVersion() {
  try {
    const pkg = require('../../../package.json');
    return pkg.version;
  } catch (_) {
    return '0.0.0';
  }
}

/**
 * Get installed daemon version
 * @returns {string|null}
 */
function getInstalledDaemonVersion() {
  try {
    if (fs.existsSync(DAEMON_VERSION_FILE)) {
      return fs.readFileSync(DAEMON_VERSION_FILE, 'utf8').trim();
    }
  } catch (_) {}
  return null;
}

/**
 * Install daemon to isolated directory
 * This copies all necessary files so daemon survives npm updates
 * @returns {boolean}
 */
function installDaemon() {
  const currentVersion = getCurrentVersion();
  const installedVersion = getInstalledDaemonVersion();
  
  // Skip if already installed with same version
  if (installedVersion === currentVersion && fs.existsSync(DAEMON_ENTRY)) {
    log.debug('Daemon already installed', { version: currentVersion });
    return true;
  }
  
  log.info('Installing daemon to isolated directory', { version: currentVersion });
  
  try {
    // Create daemon directory
    if (!fs.existsSync(DAEMON_INSTALL_DIR)) {
      fs.mkdirSync(DAEMON_INSTALL_DIR, { recursive: true, mode: 0o700 });
    }
    
    // Get source directory (where this package is installed)
    const srcDir = path.resolve(__dirname, '../../..');
    
    // Files/directories to copy for daemon to work
    const filesToCopy = [
      'src/cli-daemon.js',
      'src/services/daemon',
      'src/services/rithmic',
      'src/services/session.js',
      'src/services/index.js',
      'src/config',
      'src/security',
      'src/utils',
      'package.json',
    ];
    
    // Copy each file/directory
    for (const file of filesToCopy) {
      const srcPath = path.join(srcDir, file);
      const destPath = path.join(DAEMON_INSTALL_DIR, file);
      
      if (!fs.existsSync(srcPath)) {
        log.warn('Source not found', { file });
        continue;
      }
      
      // Create parent directory
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      
      // Copy file or directory
      if (fs.statSync(srcPath).isDirectory()) {
        copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
    
    // Copy node_modules that daemon needs
    const nodeModulesDir = path.join(srcDir, 'node_modules');
    const destNodeModules = path.join(DAEMON_INSTALL_DIR, 'node_modules');
    
    // Essential dependencies for daemon
    const deps = ['protobufjs', 'ws', 'long', 'signale', 'chalk', 'figures'];
    
    if (!fs.existsSync(destNodeModules)) {
      fs.mkdirSync(destNodeModules, { recursive: true });
    }
    
    for (const dep of deps) {
      const srcDep = path.join(nodeModulesDir, dep);
      const destDep = path.join(destNodeModules, dep);
      
      if (fs.existsSync(srcDep) && !fs.existsSync(destDep)) {
        copyDirSync(srcDep, destDep);
      }
    }
    
    // Write version file
    fs.writeFileSync(DAEMON_VERSION_FILE, currentVersion);
    
    log.info('Daemon installed successfully');
    return true;
  } catch (err) {
    log.error('Failed to install daemon', { error: err.message });
    return false;
  }
}

/**
 * Recursively copy directory
 * @param {string} src
 * @param {string} dest
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
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
 * Start daemon in background (from isolated directory)
 * @returns {Promise<boolean>}
 */
async function startDaemonBackground() {
  if (isDaemonRunning()) {
    log.debug('Daemon already running');
    return true;
  }
  
  // Install daemon to isolated directory first
  const installed = installDaemon();
  if (!installed) {
    log.error('Failed to install daemon');
    return false;
  }
  
  // Check if isolated daemon entry exists
  if (!fs.existsSync(DAEMON_ENTRY)) {
    log.error('Daemon entry not found', { path: DAEMON_ENTRY });
    // Fallback to direct execution
    return startDaemonDirect();
  }
  
  return new Promise((resolve) => {
    // Spawn daemon from isolated directory (survives npm updates)
    const daemon = spawn(process.execPath, [DAEMON_ENTRY], {
      detached: true,
      stdio: 'ignore',
      cwd: DAEMON_INSTALL_DIR,
      env: {
        ...process.env,
        NODE_PATH: path.join(DAEMON_INSTALL_DIR, 'node_modules'),
      },
    });
    
    daemon.unref();
    
    // Wait for daemon to start
    let attempts = 0;
    const maxAttempts = 30;
    
    const check = setInterval(() => {
      attempts++;
      
      if (isDaemonRunning()) {
        clearInterval(check);
        log.debug('Daemon started from isolated directory');
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
 * Start daemon directly (fallback if isolation fails)
 * @returns {Promise<boolean>}
 */
function startDaemonDirect() {
  return new Promise((resolve) => {
    const daemon = spawn(process.execPath, [
      require.resolve('../../cli-daemon'),
    ], {
      detached: true,
      stdio: 'ignore',
    });
    
    daemon.unref();
    
    let attempts = 0;
    const maxAttempts = 20;
    
    const check = setInterval(() => {
      attempts++;
      
      if (isDaemonRunning()) {
        clearInterval(check);
        log.debug('Daemon started (direct mode)');
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
  
  // Installation
  installDaemon,
  getCurrentVersion,
  getInstalledDaemonVersion,
  
  // Utilities
  isDaemonRunning,
  getDaemonPid,
  
  // Constants
  SOCKET_PATH,
  PID_FILE,
  DAEMON_INSTALL_DIR,
};
