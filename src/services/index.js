/**
 * @fileoverview Services module exports
 * @module services
 * 
 * Rithmic-only service hub
 */

const { RithmicService } = require('./rithmic/index');
const { HQXServerService } = require('./hqx-server/index');
const { storage, connections } = require('./session');

module.exports = {
  // Platform Service (Rithmic only)
  RithmicService,
  
  // HQX Algo Server
  HQXServerService,
  
  // Session Management
  storage,
  connections,
};
