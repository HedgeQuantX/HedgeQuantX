#!/usr/bin/env node

/**
 * @fileoverview HedgeQuantX CLI - Entry Point
 * @module cli
 * @description Prop Futures Algo Trading CLI
 * @version 1.2.0
 */

'use strict';

const { program } = require('commander');
const pkg = require('../package.json');

// Handle uncaught errors gracefully
process.on('uncaughtException', (err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err.message);
  process.exit(1);
});

// CLI configuration
program
  .name('hedgequantx')
  .description('Prop Futures Algo Trading CLI')
  .version(pkg.version);

program
  .command('start', { isDefault: true })
  .description('Start the interactive CLI')
  .action(async () => {
    const { run } = require('../src/app');
    await run();
  });

program
  .command('version')
  .description('Show version')
  .action(() => {
    console.log(`HedgeQuantX CLI v${pkg.version}`);
  });

// Parse and run
program.parse(process.argv);
