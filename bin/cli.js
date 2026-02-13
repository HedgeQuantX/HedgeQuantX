#!/usr/bin/env node

/**
 * HedgeQuantX CLI - Entry Point
 * Prop Futures Algo Trading with Protected Strategy
 * 
 * Modes:
 *   hqx           - Start TUI (connects to daemon if available, or standalone)
 *   hqx --daemon  - Start daemon in foreground (persistent Rithmic connection)
 *   hqx --stop    - Stop running daemon
 *   hqx --status  - Check daemon status
 *   hqx -u        - Update HQX to latest version
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
  .option('-u, --update', 'Update HQX to latest version')
  .option('-d, --daemon', 'Start daemon (persistent Rithmic connection)')
  .option('--stop', 'Stop running daemon')
  .option('--status', 'Check daemon status');

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

program
  .command('daemon')
  .description('Start daemon in foreground')
  .action(async () => {
    const { startDaemonForeground } = require('../src/services/daemon');
    await startDaemonForeground();
  });

// Handle special flags before parsing
const args = process.argv;

// Handle -u flag
if (args.includes('-u') || args.includes('--update')) {
  const { execSync } = require('child_process');
  console.log('Updating HedgeQuantX...');
  try {
    execSync('npm update -g hedgequantx', { stdio: 'inherit' });
    console.log('Update complete! Run "hqx" to start.');
  } catch (e) {
    console.error('Update failed:', e.message);
  }
  process.exit(0);
}

// Handle --daemon flag
if (args.includes('-d') || args.includes('--daemon')) {
  const { startDaemonForeground } = require('../src/services/daemon');
  startDaemonForeground().catch((err) => {
    console.error('Daemon error:', err.message);
    process.exit(1);
  });
} 
// Handle --stop flag
else if (args.includes('--stop')) {
  const { stopDaemon } = require('../src/services/daemon');
  stopDaemon();
  process.exit(0);
}
// Handle --status flag
else if (args.includes('--status')) {
  const { isDaemonRunning, getDaemonPid, SOCKET_PATH } = require('../src/services/daemon');
  
  if (isDaemonRunning()) {
    console.log('Daemon Status: RUNNING');
    console.log('  PID:', getDaemonPid());
    console.log('  Socket:', SOCKET_PATH);
  } else {
    console.log('Daemon Status: NOT RUNNING');
  }
  process.exit(0);
}
// Normal TUI startup
else {
  program.parse(process.argv);
}
