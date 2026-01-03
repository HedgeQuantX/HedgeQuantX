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
const {
  projectXMenu,
  rithmicMenu,
  tradovateMenu,
  addPropAccountMenu,
  dashboardMenu,
  handleUpdate,
} = require('./menus');

/** @type {Object|null} */
let currentService = null;

// ==================== TERMINAL ====================

/**
 * Restore terminal state
 */
const restoreTerminal = () => {
  try {
    process.stdout.write('\x1B[?1049l');
    process.stdout.write('\x1B[?25h');
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeAllListeners('keypress');
  } catch {
    // Ignore terminal errors
  }
};

// Signal handlers
process.on('exit', restoreTerminal);
process.on('SIGINT', () => { restoreTerminal(); process.exit(0); });
process.on('SIGTERM', () => { restoreTerminal(); process.exit(0); });

process.on('uncaughtException', (err) => {
  restoreTerminal();
  log.error('Uncaught Exception', { error: err.message });
  console.error(chalk.red('Uncaught Exception:'), err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  restoreTerminal();
  log.error('Unhandled Rejection', { reason: String(reason) });
  console.error(chalk.red('Unhandled Rejection:'), reason);
  process.exit(1);
});

// ==================== STATS ====================

/**
 * Refresh cached stats from all connections
 */
const refreshStats = async () => {
  if (connections.count() === 0) {
    clearCachedStats();
    return;
  }

  try {
    const allAccounts = await connections.getAllAccounts();
    const activeAccounts = allAccounts.filter(acc => acc.status === 0);

    let totalBalance = null;
    let totalPnl = null;
    let hasBalanceData = false;
    let hasPnlData = false;

    for (const account of activeAccounts) {
      if (account.balance != null) {
        totalBalance = (totalBalance || 0) + account.balance;
        hasBalanceData = true;
      }
      if (account.profitAndLoss != null) {
        totalPnl = (totalPnl || 0) + account.profitAndLoss;
        hasPnlData = true;
      }
    }

    setCachedStats({
      connections: connections.count(),
      accounts: activeAccounts.length,
      balance: hasBalanceData ? totalBalance : null,
      pnl: hasPnlData ? totalPnl : null,
      pnlPercent: null,
    });
  } catch (err) {
    log.warn('Failed to refresh stats', { error: err.message });
  }
};

// ==================== BANNER ====================

/**
 * Display application banner
 * @param {boolean} [clear=true] - Whether to clear screen first
 */
const banner = async (clear = true) => {
  if (clear) console.clear();
  
  const termWidth = process.stdout.columns || 100;
  const isMobile = termWidth < 60;
  const boxWidth = isMobile ? Math.max(termWidth - 2, 40) : Math.max(getLogoWidth(), 98);
  const innerWidth = boxWidth - 2;
  const version = require('../package.json').version;

  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));

  // Logo
  const logoLines = isMobile ? getMobileLogo() : getFullLogo();
  
  for (const [hq, x] of logoLines) {
    const fullLine = chalk.cyan(hq) + chalk.yellow(x);
    const totalLen = hq.length + x.length;
    const padding = innerWidth - totalLen;
    const leftPad = Math.floor(padding / 2);
    console.log(chalk.cyan('║') + ' '.repeat(leftPad) + fullLine + ' '.repeat(padding - leftPad) + chalk.cyan('║'));
  }

  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  
  const tagline = isMobile ? `HQX v${version}` : `PROP FUTURES ALGO TRADING  v${version}`;
  console.log(chalk.cyan('║') + chalk.white(centerText(tagline, innerWidth)) + chalk.cyan('║'));
};

/**
 * Get full logo lines
 * @returns {Array<[string, string]>}
 */
const getFullLogo = () => [
  ['██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗', '██╗  ██╗'],
  ['██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝', '╚██╗██╔╝'],
  ['███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ', ' ╚███╔╝ '],
  ['██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ', ' ██╔██╗ '],
  ['██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ', '██╔╝ ██╗'],
  ['╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ', '╚═╝  ╚═╝'],
];

/**
 * Get mobile logo lines
 * @returns {Array<[string, string]>}
 */
const getMobileLogo = () => [
  ['██╗  ██╗ ██████╗ ', '██╗  ██╗'],
  ['██║  ██║██╔═══██╗', '╚██╗██╔╝'],
  ['███████║██║   ██║', ' ╚███╔╝ '],
  ['██╔══██║██║▄▄ ██║', ' ██╔██╗ '],
  ['██║  ██║╚██████╔╝', '██╔╝ ██╗'],
  ['╚═╝  ╚═╝ ╚══▀▀═╝ ', '╚═╝  ╚═╝'],
];

/**
 * Display banner with closing border
 */
const bannerClosed = async () => {
  await banner();
  const termWidth = process.stdout.columns || 100;
  const boxWidth = termWidth < 60 ? Math.max(termWidth - 2, 40) : Math.max(getLogoWidth(), 98);
  console.log(chalk.cyan('╚' + '═'.repeat(boxWidth - 2) + '╝'));
};

// ==================== MENUS ====================

/**
 * Main menu (platform selection)
 * @returns {Promise<string>}
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

  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PLATFORM', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));

  menuRow(chalk.cyan('[1] ProjectX'), chalk.cyan('[2] Rithmic'));
  menuRow(chalk.cyan('[3] Tradovate'), chalk.red('[X] Exit'));

  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));

  const input = await prompts.textInput(chalk.cyan('Select (1/2/3/X)'));

  const actions = { '1': 'projectx', '2': 'rithmic', '3': 'tradovate', 'x': 'exit' };
  return actions[(input || '').toLowerCase()] || 'exit';
};

// ==================== MAIN LOOP ====================

/**
 * Main application loop
 */
const run = async () => {
  try {
    log.info('Starting HQX CLI');
    await bannerClosed();

    // Restore session
    const spinner = ora({ text: 'RESTORING SESSION...', color: 'yellow' }).start();
    const restored = await connections.restoreFromStorage();

    if (restored) {
      spinner.succeed('SESSION RESTORED');
      currentService = connections.getAll()[0].service;
      await refreshStats();
    } else {
      spinner.info('NO ACTIVE SESSION');
    }

    // Main loop
    while (true) {
      try {
        prepareStdin();

        if (!connections.isConnected()) {
          console.clear();
          await banner(false);
          const choice = await mainMenu();

          if (choice === 'exit') {
            console.log(chalk.gray('GOODBYE!'));
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
          // Clear screen first, show banner, then spinner while loading
          console.clear();
          await banner(false);
          
          const spinner = ora({ text: 'LOADING DASHBOARD...', color: 'cyan' }).start();
          await refreshStats();
          spinner.succeed('READY');
          
          const action = await dashboardMenu(currentService);

          switch (action) {
            case 'accounts':
              await showAccounts(currentService);
              break;

            case 'stats':
              await showStats(currentService);
              break;

            case 'add_prop_account': {
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
            }

            case 'algotrading':
              try {
                await algoTradingMenu(currentService);
              } catch (err) {
                console.log(chalk.red(`  Algo error: ${err.message}`));
                prepareStdin();
              }
              break;

            case 'update':
              await handleUpdate();
              break;

            case 'disconnect':
              connections.disconnectAll();
              currentService = null;
              clearCachedStats();
              console.log(chalk.yellow('DISCONNECTED'));
              break;
          }
        }
      } catch (loopError) {
        log.error('Loop error', { error: loopError.message });
        console.error(chalk.red('Error:'), loopError.message);
      }
    }
  } catch (error) {
    log.error('Fatal error', { error: error.message });
    console.error(chalk.red('Fatal error:'), error.message);
    process.exit(1);
  }
};

module.exports = { run, banner, mainMenu, dashboardMenu };
