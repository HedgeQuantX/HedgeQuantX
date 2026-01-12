/**
 * @fileoverview Services module exports
 * @module services
 * 
 * Rithmic-only service hub + AI Supervision + Dual Proxy Support
 */

const { RithmicService } = require('./rithmic/index');
const { HQXServerService } = require('./hqx-server/index');
const { storage, connections } = require('./session');
const aiSupervision = require('./ai-supervision');
const llmproxy = require('./llmproxy');

module.exports = {
  // Platform Service (Rithmic only)
  RithmicService,
  
  // HQX Algo Server
  HQXServerService,
  
  // Session Management
  storage,
  connections,
  
  // AI Supervision
  aiSupervision,
  
  // LLM API Proxy (for API key providers via LiteLLM)
  llmproxy,
};
