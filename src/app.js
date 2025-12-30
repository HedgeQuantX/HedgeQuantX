/**
 * @fileoverview Main application router
 * @module app
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('./services');
const { getLogoWidth, centerText, prepareStdin } = require('./ui');
const { logger, prompts } = require('./utils');
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

/**
 * Global terminal restoration
 */
const restoreTerminal = () => {
  try {
    process.stdout.write('\x1B[?1049l');
    process.stdout.write('\x1B[?25h');
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeAllListeners('keypress');
  } catch (e) {}
};

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
 * Refresh cached stats
 */
const refreshStats = async () => {
  if (connections.count() > 0) {
    try {
      const allAccounts = await connections.getAllAccounts();
      const activeAccounts = allAccounts.filter(acc => acc.status === 0);
      
      let totalBalance = null, totalPnl = null;
      let hasBalanceData = false, hasPnlData = false;
      
      activeAccounts.forEach(account => {
        if (account.balance !== null && account.balance !== undefined) {
          totalBalance = (totalBalance || 0) + account.balance;
          hasBalanceData = true;
        }
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
    } catch (e) {}
  } else {
    clearCachedStats();
  }
};

/**
 * Display banner
 */
const banner = async () => {
  console.clear();
  const termWidth = process.stdout.columns || 100;
  const isMobile = termWidth < 60;
  const boxWidth = isMobile ? Math.max(termWidth - 2, 40) : Math.max(getLogoWidth(), 98);
  const innerWidth = boxWidth - 2;
  const version = require('../package.json').version;
  
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  
  if (isMobile) {
    const logoHQ = ['██╗  ██╗ ██████╗ ','██║  ██║██╔═══██╗','███████║██║   ██║','██╔══██║██║▄▄ ██║','██║  ██║╚██████╔╝','╚═╝  ╚═╝ ╚══▀▀═╝ '];
    const logoX = ['██╗  ██╗','╚██╗██╔╝',' ╚███╔╝ ',' ██╔██╗ ','██╔╝ ██╗','╚═╝  ╚═╝'];
    logoHQ.forEach((line, i) => {
      const fullLine = chalk.cyan(line) + chalk.yellow(logoX[i]);
      const totalLen = line.length + logoX[i].length;
      const padding = innerWidth - totalLen;
      const leftPad = Math.floor(padding / 2);
      console.log(chalk.cyan('║') + ' '.repeat(leftPad) + fullLine + ' '.repeat(padding - leftPad) + chalk.cyan('║'));
    });
  } else {
    const logo = [
      '██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗',
      '██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝',
      '███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ',
      '██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ',
      '██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ',
      '╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   '
    ];
    const logoX = ['██╗  ██╗','╚██╗██╔╝',' ╚███╔╝ ',' ██╔██╗ ','██╔╝ ██╗','╚═╝  ╚═╝'];
    logo.forEach((line, i) => {
      const fullLine = chalk.cyan(line) + chalk.yellow(logoX[i]);
      const totalLen = line.length + logoX[i].length;
      const padding = innerWidth - totalLen;
      const leftPad = Math.floor(padding / 2);
      console.log(chalk.cyan('║') + ' '.repeat(leftPad) + fullLine + ' '.repeat(padding - leftPad) + chalk.cyan('║'));
    });
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  const tagline = isMobile ? `HQX v${version}` : `Prop Futures Algo Trading  v${version}`;
  console.log(chalk.cyan('║') + chalk.white(centerText(tagline, innerWidth)) + chalk.cyan('║'));
  // No closing line - dashboard will continue the box
};

/**
 * Main menu
 */
const mainMenu = async () => {
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const col1Width = Math.floor(innerWidth / 2);
  
  const menuRow = (left, right) => {
    const leftPlain = left.replace(/\x1b\[[0-9;]*m/g, '');
    const rightPlain = right ? right.replace(/\x1b\[[0-9;]*m/g, '') : '';
    const leftPadded = '  ' + left + ' '.repeat(Math.max(0, col1Width - leftPlain.length - 2));
    const rightPadded = (right || '') + ' '.repeat(Math.max(0, innerWidth - col1Width - rightPlain.length));
    console.log(chalk.cyan('║') + leftPadded + rightPadded + chalk.cyan('║'));
  };
  
  // Continue from banner
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PLATFORM', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  
  menuRow(chalk.cyan('[1] ProjectX'), chalk.cyan('[2] Rithmic'));
  menuRow(chalk.cyan('[3] Tradovate'), chalk.red('[X] Exit'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));

  const input = await prompts.textInput('Select (1/2/3/X)');
  
  const actionMap = {
    '1': 'projectx',
    '2': 'rithmic',
    '3': 'tradovate',
    'x': 'exit'
  };

  return actionMap[(input || '').toLowerCase()] || 'exit';
};

/**
 * Main application loop
 */
const run = async () => {
  try {
    log.info('Starting HQX CLI');
    await banner();
    
    const spinner = ora({ text: 'Restoring session...', color: 'yellow' }).start();
    const restored = await connections.restoreFromStorage();
    
    if (restored) {
      spinner.succeed('Session restored');
      currentService = connections.getAll()[0].service;
      await refreshStats();
    } else {
      spinner.info('No active session');
    }

    while (true) {
      try {
        prepareStdin();
        await banner();
        
        if (!connections.isConnected()) {
          const choice = await mainMenu();
          
          if (choice === 'exit') {
            console.log(chalk.gray('Goodbye!'));
            process.exit(0);
          }
          
          let service = null;
          if (choice === 'projectx') service = await projectXMenu();
          else if (choice === 'rithmic') service = await rithmicMenu();
          else if (choice === 'tradovate') service = await tradovateMenu();
          
          if (service) {
            currentService = service;
            await refreshStats();
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
              const platformChoice = await addPropAccountMenu();
              let newService = null;
              if (platformChoice === 'projectx') newService = await projectXMenu();
              else if (platformChoice === 'rithmic') newService = await rithmicMenu();
              else if (platformChoice === 'tradovate') newService = await tradovateMenu();
              if (newService) {
                currentService = newService;
                await refreshStats();
              }
              break;
            case 'algotrading':
              await algoTradingMenu(currentService);
              break;
            case 'update':
              await handleUpdate();
              break;
            case 'disconnect':
              connections.disconnectAll();
              currentService = null;
              clearCachedStats();
              console.log(chalk.yellow('Disconnected'));
              break;
          }
        }
      } catch (loopError) {
        console.error(chalk.red('Error:'), loopError.message);
      }
    }
  } catch (error) {
    console.error(chalk.red('Fatal error:'), error.message);
    process.exit(1);
  }
};

module.exports = { run, banner, mainMenu, dashboardMenu };
