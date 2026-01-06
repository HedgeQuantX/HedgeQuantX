/**
 * @fileoverview Main application router - Rithmic Only
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
const { rithmicMenu, dashboardMenu, handleUpdate } = require('./menus');

/** @type {Object|null} */
let currentService = null;

// ==================== TERMINAL ====================

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

const banner = async () => {
  console.clear();
  
  const termWidth = process.stdout.columns || 100;
  const isMobile = termWidth < 60;
  const boxWidth = isMobile ? Math.max(termWidth - 2, 40) : Math.max(getLogoWidth(), 98);
  const innerWidth = boxWidth - 2;
  const version = require('../package.json').version;

  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));

  const logoLines = isMobile ? getMobileLogo() : getFullLogo();
  
  for (const [hq, x] of logoLines) {
    const fullLine = chalk.cyan(hq) + chalk.yellow(x);
    const totalLen = hq.length + x.length;
    const padding = innerWidth - totalLen;
    const leftPad = Math.floor(padding / 2);
    console.log(chalk.cyan('║') + ' '.repeat(leftPad) + fullLine + ' '.repeat(padding - leftPad) + chalk.cyan('║'));
  }

  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  
  const tagline = isMobile ? `HQX v${version}` : `Prop Futures Algo Trading  v${version}`;
  console.log(chalk.cyan('║') + chalk.white(centerText(tagline, innerWidth)) + chalk.cyan('║'));
};

const getFullLogo = () => [
  ['██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗', '██╗  ██╗'],
  ['██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝', '╚██╗██╔╝'],
  ['███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ', ' ╚███╔╝ '],
  ['██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ', ' ██╔██╗ '],
  ['██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ', '██╔╝ ██╗'],
  ['╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ', '╚═╝  ╚═╝'],
];

const getMobileLogo = () => [
  ['██╗  ██╗ ██████╗ ', '██╗  ██╗'],
  ['██║  ██║██╔═══██╗', '╚██╗██╔╝'],
  ['███████║██║   ██║', ' ╚███╔╝ '],
  ['██╔══██║██║▄▄ ██║', ' ██╔██╗ '],
  ['██║  ██║╚██████╔╝', '██╔╝ ██╗'],
  ['╚═╝  ╚═╝ ╚══▀▀═╝ ', '╚═╝  ╚═╝'],
];

const bannerClosed = async () => {
  await banner();
  const termWidth = process.stdout.columns || 100;
  const boxWidth = termWidth < 60 ? Math.max(termWidth - 2, 40) : Math.max(getLogoWidth(), 98);
  console.log(chalk.cyan('╚' + '═'.repeat(boxWidth - 2) + '╝'));
};

// ==================== MAIN LOOP ====================

const run = async () => {
  try {
    log.info('Starting HQX CLI');
    await bannerClosed();

    // Restore session
    const spinner = ora({ text: 'Restoring session...', color: 'yellow' }).start();
    const restored = await connections.restoreFromStorage();

    if (restored) {
      spinner.succeed('Session restored');
      currentService = connections.getAll()[0].service;
      await refreshStats();
    } else {
      spinner.info('No active session');
    }

    // Main loop
    while (true) {
      try {
        prepareStdin();
        await banner();

        if (!connections.isConnected()) {
          // Not connected - show Rithmic menu directly
          const boxWidth = getLogoWidth();
          const innerWidth = boxWidth - 2;
          
          console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
          console.log(chalk.cyan('║') + chalk.white.bold(centerText('CONNECT TO PROPFIRM', innerWidth)) + chalk.cyan('║'));
          console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
          console.log(chalk.cyan('║') + '  ' + chalk.cyan('[1] Connect') + ' '.repeat(innerWidth - 14) + chalk.cyan('║'));
          console.log(chalk.cyan('║') + '  ' + chalk.red('[X] Exit') + ' '.repeat(innerWidth - 11) + chalk.cyan('║'));
          console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
          
          const input = await prompts.textInput(chalk.cyan('Select (1/X):'));
          
          if (!input || input.toLowerCase() === 'x') {
            console.log(chalk.gray('Goodbye!'));
            process.exit(0);
          }
          
          if (input === '1') {
            const service = await rithmicMenu();
            if (service) {
              currentService = service;
              await refreshStats();
            }
          }
        } else {
          // Connected - show dashboard
          await refreshStats();
          
          const action = await dashboardMenu(currentService);

          switch (action) {
            case 'accounts':
              await showAccounts(currentService);
              break;

            case 'stats':
              await showStats(currentService);
              break;

            case 'add_prop_account': {
              const newService = await rithmicMenu();
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
              console.log(chalk.yellow('Disconnected'));
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

module.exports = { run, banner, dashboardMenu };
