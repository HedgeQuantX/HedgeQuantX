/**
 * @fileoverview Main application router
 * @module app
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

const { connections } = require('./services');
const { getLogoWidth, centerText, prepareStdin } = require('./ui');

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
  
  // Get stats if connected (only active accounts: status === 0)
  let statsInfo = null;
  if (connections.count() > 0) {
    try {
      const allAccounts = await connections.getAllAccounts();
      const activeAccounts = allAccounts.filter(acc => acc.status === 0);
      let totalBalance = 0;
      let totalStartingBalance = 0;
      let totalPnl = 0;
      
      activeAccounts.forEach(account => {
        totalBalance += account.balance || 0;
        totalStartingBalance += account.startingBalance || 0;
        totalPnl += account.profitAndLoss || 0;
      });
      
      const pnl = totalPnl !== 0 ? totalPnl : (totalBalance - totalStartingBalance);
      const pnlPercent = totalStartingBalance > 0 ? ((pnl / totalStartingBalance) * 100).toFixed(1) : '0.0';
      
      statsInfo = {
        connections: connections.count(),
        accounts: activeAccounts.length,
        balance: totalBalance,
        pnl: pnl,
        pnlPercent: pnlPercent
      };
    } catch (e) {
      // Ignore errors
    }
  }
  
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
  
  // Stats bar if connected
  if (statsInfo) {
    console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
    
    const pnlColor = statsInfo.pnl >= 0 ? chalk.green : chalk.red;
    const pnlSign = statsInfo.pnl >= 0 ? '+' : '';
    
    const connStr = `Connections: ${statsInfo.connections}`;
    const accStr = `Accounts: ${statsInfo.accounts}`;
    const balStr = `Balance: $${statsInfo.balance.toLocaleString()}`;
    const pnlStr = `P&L: $${statsInfo.pnl.toLocaleString()} (${pnlSign}${statsInfo.pnlPercent}%)`;
    
    // Build full stats text and calculate padding
    const statsText = `${connStr}    ${accStr}    ${balStr}    ${pnlStr}`;
    const statsLen = statsText.length;
    const statsLeftPad = Math.floor((innerWidth - statsLen) / 2);
    const statsRightPad = innerWidth - statsLen - statsLeftPad;
    
    console.log(chalk.cyan('║') + ' '.repeat(statsLeftPad) +
      chalk.white(connStr) + '    ' +
      chalk.white(accStr) + '    ' +
      chalk.white('Balance: ') + chalk.green(`$${statsInfo.balance.toLocaleString()}`) + '    ' +
      chalk.white('P&L: ') + pnlColor(`$${statsInfo.pnl.toLocaleString()} (${pnlSign}${statsInfo.pnlPercent}%)`) + 
      ' '.repeat(statsRightPad) + chalk.cyan('║')
    );
  }
  
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
  
  menuRow(chalk.cyan('[1] ProjectX'), chalk.cyan('[2] Rithmic'));
  menuRow(chalk.cyan('[3] Tradovate'), chalk.red('[X] Exit'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan('Enter choice (1/2/3/X):'),
      validate: (input) => {
        const valid = ['1', '2', '3', 'x', 'X'];
        if (valid.includes(input)) return true;
        return 'Please enter 1, 2, 3 or X';
      }
    }
  ]);

  // Map input to action
  const actionMap = {
    '1': 'projectx',
    '2': 'rithmic',
    '3': 'tradovate',
    'x': 'exit',
    'X': 'exit'
  };

  return actionMap[action] || 'exit';
};

/**
 * Main application loop
 */
const run = async () => {
  try {
    await banner();
    
    // Try to restore session
    const spinner = ora('Restoring session...').start();
    const restored = await connections.restoreFromStorage();
    
    if (restored) {
      spinner.succeed('Session restored');
      currentService = connections.getAll()[0].service;
    } else {
      spinner.info('No active session');
    }

    // Main loop
    while (true) {
      try {
        // Ensure stdin is ready for prompts (fixes input leaking to bash)
        prepareStdin();
        
        // Refresh banner with stats
        await banner();
        
        if (!connections.isConnected()) {
          const choice = await mainMenu();
          
          if (choice === 'exit') {
            console.log(chalk.gray('Goodbye!'));
            process.exit(0);
          }
          
          if (choice === 'projectx') {
            const service = await projectXMenu();
            if (service) currentService = service;
          }
          
          if (choice === 'rithmic') {
            const service = await rithmicMenu();
            if (service) currentService = service;
          }
          
          if (choice === 'tradovate') {
            const service = await tradovateMenu();
            if (service) currentService = service;
          }
        } else {
          const action = await dashboardMenu(currentService);
          
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
                if (newService) currentService = newService;
              } else if (platformChoice === 'rithmic') {
                const newService = await rithmicMenu();
                if (newService) currentService = newService;
              } else if (platformChoice === 'tradovate') {
                const newService = await tradovateMenu();
                if (newService) currentService = newService;
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
