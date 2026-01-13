#!/usr/bin/env node

/**
 * HedgeQuantX CLI - Entry Point
 * Prop Futures Algo Trading with Protected Strategy
 * @version 2.1.0
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

// Load bytenode for protected strategy
try {
  require('bytenode');
} catch (e) {
  // Bytenode not available, will use source files
}

// CLI configuration
program
  .name('hqx')
  .description('HedgeQuantX - Prop Futures Algo Trading CLI')
  .version(pkg.version)
  .option('-u, --update', 'Update HQX to latest version');

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

// Handle -u flag before parsing commands
if (process.argv.includes('-u') || process.argv.includes('--update')) {
  const { execSync } = require('child_process');
  console.log('Updating HedgeQuantX...');
  try {
    execSync('npm install -g @hedgequantx/cli@latest', { stdio: 'inherit' });
    console.log('Update complete! Run "hqx" to start.');
  } catch (e) {
    console.error('Update failed:', e.message);
  }
  process.exit(0);
}

// Parse and run
program.parse(process.argv);
