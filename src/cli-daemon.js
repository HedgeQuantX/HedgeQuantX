#!/usr/bin/env node
/**
 * @fileoverview HQX Daemon Entry Point
 * @module cli-daemon
 * 
 * Standalone entry point for daemon process.
 * Run with: node src/cli-daemon.js
 */

'use strict';

// Load bytenode for protected modules
try {
  require('bytenode');
} catch (_) {}

const { startDaemonForeground } = require('./services/daemon');

// Start daemon
startDaemonForeground().catch((err) => {
  console.error('Daemon error:', err.message);
  process.exit(1);
});
