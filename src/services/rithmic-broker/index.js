/**
 * RithmicBroker Service
 * 
 * Persistent Rithmic connection manager.
 * Daemon runs in background, survives CLI restarts.
 * 
 * Usage:
 *   const { RithmicBrokerClient, manager } = require('./rithmic-broker');
 *   
 *   // Start daemon if not running
 *   await manager.ensureRunning();
 *   
 *   // Create client (same API as RithmicService)
 *   const client = new RithmicBrokerClient('apex');
 *   await client.login(username, password);
 *   
 *   // Use like RithmicService
 *   const accounts = await client.getTradingAccounts();
 */

'use strict';

const { RithmicBrokerClient } = require('./client');
const manager = require('./manager');
const { BROKER_PORT, BROKER_DIR, PID_FILE, LOG_FILE, STATE_FILE } = require('./daemon');

module.exports = {
  // Client class (use instead of RithmicService)
  RithmicBrokerClient,
  
  // Manager functions
  manager,
  isRunning: manager.isRunning,
  start: manager.start,
  stop: manager.stop,
  getStatus: manager.getStatus,
  ensureRunning: manager.ensureRunning,
  restart: manager.restart,
  
  // Constants
  BROKER_PORT,
  BROKER_DIR,
  PID_FILE,
  LOG_FILE,
  STATE_FILE,
};
