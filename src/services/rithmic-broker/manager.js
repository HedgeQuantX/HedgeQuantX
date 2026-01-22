/**
 * RithmicBroker Manager
 * 
 * Start/stop/status functions for the RithmicBroker daemon.
 * Similar pattern to cliproxy/manager.js
 */

'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');

const { BROKER_PORT, BROKER_DIR, PID_FILE, LOG_FILE } = require('./daemon');

// Path to daemon script
const DAEMON_SCRIPT = path.join(__dirname, 'daemon.js');

/**
 * Check if daemon is running
 * @returns {Promise<{running: boolean, pid: number|null}>}
 */
const isRunning = async () => {
  // Check PID file first
  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      process.kill(pid, 0); // Test if process exists
      return { running: true, pid };
    } catch (e) {
      // Process doesn't exist, clean up stale PID file
      try { fs.unlinkSync(PID_FILE); } catch (e2) { /* ignore */ }
    }
  }
  
  // Try connecting to WebSocket
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${BROKER_PORT}`);
    const timeout = setTimeout(() => {
      ws.terminate();
      resolve({ running: false, pid: null });
    }, 2000);
    
    ws.on('open', () => {
      clearTimeout(timeout);
      ws.close();
      resolve({ running: true, pid: null });
    });
    
    ws.on('error', () => {
      clearTimeout(timeout);
      resolve({ running: false, pid: null });
    });
  });
};

/**
 * Start the daemon
 * @returns {Promise<{success: boolean, error: string|null, pid: number|null}>}
 */
const start = async () => {
  const status = await isRunning();
  if (status.running) {
    return { success: true, error: null, pid: status.pid, alreadyRunning: true };
  }
  
  // Ensure directory exists
  if (!fs.existsSync(BROKER_DIR)) {
    fs.mkdirSync(BROKER_DIR, { recursive: true });
  }
  
  try {
    // Open log file for daemon output
    const logFd = fs.openSync(LOG_FILE, 'a');
    
    // Spawn detached daemon process
    const child = spawn(process.execPath, [DAEMON_SCRIPT], {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: BROKER_DIR,
      env: { ...process.env, HQX_BROKER_DAEMON: '1' },
    });
    
    child.unref();
    fs.closeSync(logFd);
    
    // Wait for daemon to start
    await new Promise(r => setTimeout(r, 2000));
    
    const runStatus = await isRunning();
    if (runStatus.running) {
      return { success: true, error: null, pid: runStatus.pid || child.pid };
    } else {
      // Read log for error details
      let errorDetail = 'Failed to start RithmicBroker daemon';
      if (fs.existsSync(LOG_FILE)) {
        const log = fs.readFileSync(LOG_FILE, 'utf8').slice(-500);
        if (log) errorDetail += `: ${log.split('\n').filter(l => l).pop()}`;
      }
      return { success: false, error: errorDetail, pid: null };
    }
  } catch (error) {
    return { success: false, error: error.message, pid: null };
  }
};

/**
 * Stop the daemon
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
const stop = async () => {
  const status = await isRunning();
  if (!status.running) {
    return { success: true, error: null };
  }
  
  try {
    // Try graceful shutdown via WebSocket
    const ws = new WebSocket(`ws://127.0.0.1:${BROKER_PORT}`);
    
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.terminate();
        reject(new Error('Shutdown timeout'));
      }, 5000);
      
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'logout', payload: {}, requestId: 'shutdown' }));
        setTimeout(() => {
          clearTimeout(timeout);
          ws.close();
          resolve();
        }, 1000);
      });
      
      ws.on('error', () => {
        clearTimeout(timeout);
        reject(new Error('Connection failed'));
      });
    });
    
    // Wait for process to exit
    await new Promise(r => setTimeout(r, 1000));
    
    // Verify stopped
    const newStatus = await isRunning();
    if (!newStatus.running) {
      return { success: true, error: null };
    }
    
    // Force kill if still running
    if (status.pid) {
      try {
        process.kill(status.pid, 'SIGKILL');
      } catch (e) { /* ignore */ }
    }
    
    // Clean up PID file
    if (fs.existsSync(PID_FILE)) {
      try { fs.unlinkSync(PID_FILE); } catch (e) { /* ignore */ }
    }
    
    return { success: true, error: null };
  } catch (error) {
    // Force kill via PID
    if (status.pid) {
      try {
        process.kill(status.pid, 'SIGKILL');
        if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
        return { success: true, error: null };
      } catch (e) { /* ignore */ }
    }
    return { success: false, error: error.message };
  }
};

/**
 * Get daemon status
 * @returns {Promise<Object>}
 */
const getStatus = async () => {
  const status = await isRunning();
  
  if (!status.running) {
    return { running: false, pid: null, connections: [], uptime: 0 };
  }
  
  // Get detailed status from daemon
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${BROKER_PORT}`);
    const timeout = setTimeout(() => {
      ws.terminate();
      resolve({ running: true, pid: status.pid, connections: [], uptime: 0 });
    }, 3000);
    
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'status', requestId: 'status' }));
    });
    
    ws.on('message', (data) => {
      clearTimeout(timeout);
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'status') {
          ws.close();
          resolve(msg.payload);
        }
      } catch (e) {
        ws.close();
        resolve({ running: true, pid: status.pid, connections: [], uptime: 0 });
      }
    });
    
    ws.on('error', () => {
      clearTimeout(timeout);
      resolve({ running: true, pid: status.pid, connections: [], uptime: 0 });
    });
  });
};

/**
 * Ensure daemon is running (start if not)
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
const ensureRunning = async () => {
  const status = await isRunning();
  if (status.running) {
    return { success: true, error: null };
  }
  return start();
};

/**
 * Restart the daemon
 * @returns {Promise<{success: boolean, error: string|null}>}
 */
const restart = async () => {
  await stop();
  await new Promise(r => setTimeout(r, 1000));
  return start();
};

module.exports = {
  isRunning,
  start,
  stop,
  getStatus,
  ensureRunning,
  restart,
  BROKER_PORT,
  BROKER_DIR,
  PID_FILE,
  LOG_FILE,
};
