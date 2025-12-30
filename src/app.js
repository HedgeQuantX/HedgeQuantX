/**
 * @fileoverview Main application router
 * @module app
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

const { connections } = require('./services');
const { getLogoWidth, centerText, prepareStdin } = require('./ui');
const { logger } = require('./utils');
const { setCachedStats, clearCachedStats } = require('./services/stats-cache');

const log = logger.scope('App');

// Pages
const { showStats } = require('./pages/stats');
const { showAccounts } = require('./pages/accounts');
const { algoTradingMenu } = require('./pages/algo');

// Menus
const { projectXMenu, rithmicMenu, tradovateMenu, addPropAccountMenu, dashboardMenu, handleUpdate } = require('./menus');

// Current service reference
let currentService = null;
let currentPlatform = null; // 'projectx' or 'rithmic'

/**
 * Global terminal restoration - ensures terminal is always restored on exit
 */
const restoreTerminal = () => {
  try {
    // Exit alternate screen buffer
    process.stdout.write('\x1B[?1049l');
    // Show cursor
    process.stdout.write('\x1B[?25h');
    // Disable raw mode
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    // Remove all keypress listeners
    process.stdin.removeAllListeners('keypress');
  } catch (e) {
    // Ignore errors during cleanup
  }
};

// Register global handlers to restore terminal on exit/crash
process.on('exit', restoreTerminal);
process.on('SIGINT', () => { restoreTerminal(); process.exit(0); });
process.on('SIGTERM', () => { restoreTerminal(); process.exit(0); });
process.on('uncaughtException', (err) => {
  restoreTerminal();
  console.error(chalk.red('Uncaught Exception:'), err.message);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  restoreTerminal();
  console.error(chalk.red('Unhandled Rejection:'), reason);
  process.exit(1);
});

/**
 * Refresh cached stats (call after connection/disconnection/add account)
 */
const refreshStats = async () => {
  if (connections.count() > 0) {
    try {
      const allAccounts = await connections.getAllAccounts();
      const activeAccounts = allAccounts.filter(acc => acc.status === 0);
      
      // Sum only non-null values from API
      let totalBalance = null;
      let totalPnl = null;
      let hasBalanceData = false;
      let hasPnlData = false;
      
      activeAccounts.forEach(account => {
        // Balance: only sum if API returned a value
        if (account.balance !== null && account.balance !== undefined) {
          totalBalance = (totalBalance || 0) + account.balance;
          hasBalanceData = true;
        }
        
        // P&L: only sum if API returned a value
        if (account.profitAndLoss !== null && account.profitAndLoss !== undefined) {
          totalPnl = (totalPnl || 0) + account.profitAndLoss;
          hasPnlData = true;
        }
      });
      
      setCachedStats({
        connections: connections.count(),
        accounts: activeAccounts.length,
        balance: hasBalanceData ? totalBalance : null,
        pnl: hasPnlData ? totalPnl : null,
        pnlPercent: null
      });
    } catch (e) {
      // Ignore errors
    }
  } else {
    clearCachedStats();
  }
};

/**
 * Displays the application banner with stats if connected
 */
const banner = async () => {
  console.clear();
  const termWidth = process.stdout.columns || 100;
  const isMobile = termWidth < 60;
  // Logo HEDGEQUANTX + X = 94 chars, need 98 for box (94 + 2 borders + 2 padding)
  const boxWidth = isMobile ? Math.max(termWidth - 2, 40) : Math.max(getLogoWidth(), 98);
  const innerWidth = boxWidth - 2;
  const version = require('../package.json').version;
  
  // Draw logo - compact for mobile, full for desktop
  
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  
  if (isMobile) {
    // Compact HQX logo for mobile - X in yellow
    const logoHQ = [
      '██╗  ██╗ ██████╗ ',
      '██║  ██║██╔═══██╗',
      '███████║██║   ██║',
      '██╔══██║██║▄▄ ██║',
      '██║  ██║╚██████╔╝',
      '╚═╝  ╚═╝ ╚══▀▀═╝ '
    ];
    const logoX = [
      '██╗  ██╗',
      '╚██╗██╔╝',
      ' ╚███╔╝ ',
      ' ██╔██╗ ',
      '██╔╝ ██╗',
      '╚═╝  ╚═╝'
    ];
    
    logoHQ.forEach((line, i) => {
      const fullLine = chalk.cyan(line) + chalk.yellow(logoX[i]);
      const totalLen = line.length + logoX[i].length;
      const padding = innerWidth - totalLen;
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      console.log(chalk.cyan('║') + ' '.repeat(leftPad) + fullLine + ' '.repeat(rightPad) + chalk.cyan('║'));
    });
  } else {
    // Full HEDGEQUANTX logo for desktop
    const logo = [
      '██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗',
      '██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝',
      '███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ',
      '██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ',
      '██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ',
      '╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   '
    ];
    const logoX = [
      '██╗  ██╗',
      '╚██╗██╔╝',
      ' ╚███╔╝ ',
      ' ██╔██╗ ',
      '██╔╝ ██╗',
      '╚═╝  ╚═╝'
    ];
    
    logo.forEach((line, i) => {
      const mainPart = chalk.cyan(line);
      const xPart = chalk.yellow(logoX[i]);
      const fullLine = mainPart + xPart;
      const totalLen = line.length + logoX[i].length;
      const padding = innerWidth - totalLen;
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      console.log(chalk.cyan('║') + ' '.repeat(leftPad) + fullLine + ' '.repeat(rightPad) + chalk.cyan('║'));
    });
  }
  
  // Tagline
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  const tagline = isMobile ? `HQX v${version}` : `Prop Futures Algo Trading  v${version}`;
  console.log(chalk.cyan('║') + chalk.white(centerText(tagline, innerWidth)) + chalk.cyan('║'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();
};

/**
 * Main connection menu
 */
const mainMenu = async () => {
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const col1Width = Math.floor(innerWidth / 2);
  const col2Width = innerWidth - col1Width;
  
  // Connection menu box
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PLATFORM', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  
  // Menu row helper (2 columns)
  const menuRow = (left, right) => {
    const leftText = '  ' + left;
    const rightText = right ? '  ' + right : '';
    const leftLen = leftText.replace(/\x1b\[[0-9;]*m/g, '').length;
    const rightLen = rightText.replace(/\x1b\[[0-9;]*m/g, '').length;
    const leftPad = col1Width - leftLen;
    const rightPad = col2Width - rightLen;
    console.log(chalk.cyan('║') + leftText + ' '.repeat(Math.max(0, leftPad)) + rightText + ' '.repeat(Math.max(0, rightPad)) + chalk.cyan('║'));
  };
  
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  // Use list type - more stable stdin handling
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.cyan('Select platform:'),
      choices: [
        { name: chalk.cyan('[1] ProjectX'), value: 'projectx' },
        { name: chalk.cyan('[2] Rithmic'), value: 'rithmic' },
        { name: chalk.cyan('[3] Tradovate'), value: 'tradovate' },
        { name: chalk.red('[X] Exit'), value: 'exit' }
      ],
      loop: false
    }
  ]);

  return action;
};

/**
 * Main application loop
 */
const run = async () => {
  try {
    log.info('Starting HQX CLI');
    await banner();
    
    // Try to restore session
    log.debug('Attempting to restore session');
    const spinner = ora({ text: 'Restoring session...', color: 'yellow' }).start();
    const restored = await connections.restoreFromStorage();
    
    if (restored) {
      spinner.succeed('Session restored');
      currentService = connections.getAll()[0].service;
      log.info('Session restored', { connections: connections.count() });
      // Refresh stats after session restore
      await refreshStats();
    } else {
      spinner.info('No active session');
      log.debug('No session to restore');
    }

    // Main loop
    while (true) {
      try {
        // Ensure stdin is ready for prompts (fixes input leaking to bash)
        prepareStdin();
        
        // Display banner (uses cached stats, no refetch)
        await banner();
        
        if (!connections.isConnected()) {
          const choice = await mainMenu();
          log.debug('Main menu choice', { choice });
          
          if (choice === 'exit') {
            log.info('User exit');
            console.log(chalk.gray('Goodbye!'));
            process.exit(0);
          }
          
          if (choice === 'projectx') {
            const service = await projectXMenu();
            if (service) {
              currentService = service;
              await refreshStats(); // Refresh after new connection
            }
          }
          
          if (choice === 'rithmic') {
            const service = await rithmicMenu();
            if (service) {
              currentService = service;
              await refreshStats(); // Refresh after new connection
            }
          }
          
          if (choice === 'tradovate') {
            const service = await tradovateMenu();
            if (service) {
              currentService = service;
              await refreshStats(); // Refresh after new connection
            }
          }
        } else {
          const action = await dashboardMenu(currentService);
          log.debug('Dashboard action', { action });
          
          switch (action) {
            case 'accounts':
              await showAccounts(currentService);
              break;

            case 'stats':
              await showStats(currentService);
              break;
            case 'add_prop_account':
              // Show platform selection menu
              const platformChoice = await addPropAccountMenu();
              if (platformChoice === 'projectx') {
                const newService = await projectXMenu();
                if (newService) {
                  currentService = newService;
                  await refreshStats(); // Refresh after adding account
                }
              } else if (platformChoice === 'rithmic') {
                const newService = await rithmicMenu();
                if (newService) {
                  currentService = newService;
                  await refreshStats(); // Refresh after adding account
                }
              } else if (platformChoice === 'tradovate') {
                const newService = await tradovateMenu();
                if (newService) {
                  currentService = newService;
                  await refreshStats(); // Refresh after adding account
                }
              }
              break;
            case 'algotrading':
              await algoTradingMenu(currentService);
              break;
            case 'update':
              const updateResult = await handleUpdate();
              if (updateResult === 'restart') return; // Stop loop, new process spawned
              break;
            case 'disconnect':
              const connCount = connections.count();
              connections.disconnectAll();
              currentService = null;
              clearCachedStats();
              console.log(chalk.yellow(`Disconnected ${connCount} connection${connCount > 1 ? 's' : ''}`));
              break;
            case 'exit':
              console.log(chalk.gray('Goodbye!'));
              process.exit(0);
          }
        }
      } catch (loopError) {
        console.error(chalk.red('Error in main loop:'), loopError.message);
        // Continue the loop
      }
    }
  } catch (error) {
    console.error(chalk.red('Fatal error:'), error.message);
    process.exit(1);
  }
};

module.exports = { run, banner, mainMenu, dashboardMenu };
