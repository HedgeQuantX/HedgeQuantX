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
const { aiAgentsMenu, getActiveAgentCount } = require('./pages/ai-agents');

// Menus
const { rithmicMenu, dashboardMenu, handleUpdate } = require('./menus');
const { PROPFIRM_CHOICES } = require('./config');

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
process.on('SIGINT', () => { 
  restoreTerminal();
  // Draw bottom border before exit
  const termWidth = process.stdout.columns || 100;
  const boxWidth = termWidth < 60 ? Math.max(termWidth - 2, 40) : Math.max(getLogoWidth(), 98);
  console.log(chalk.cyan('\n╚' + '═'.repeat(boxWidth - 2) + '╝'));
  console.log(chalk.gray('GOODBYE!'));
  process.exit(0);
});
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
  
  const tagline = isMobile ? `HQX V${version}` : `PROP FUTURES ALGO TRADING  V${version}`;
  console.log(chalk.cyan('║') + chalk.yellow(centerText(tagline, innerWidth)) + chalk.cyan('║'));
  
  // ALWAYS close the banner
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
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

// ==================== MAIN LOOP ====================

const run = async () => {
  try {
    log.info('Starting HQX CLI');
    
    // First launch - show banner then try restore session
    await banner();
    
    const spinner = ora({ text: 'LOADING...', color: 'yellow' }).start();
    
    const restored = await connections.restoreFromStorage();

    if (restored) {
      currentService = connections.getAll()[0].service;
      await refreshStats();
      spinner.succeed('SESSION RESTORED');
    } else {
      spinner.stop(); // Stop spinner - no session to restore
    }
    
    // Store spinner globally so dashboardMenu can stop it before clear
    global.__hqxSpinner = null;

    // Main loop
    while (true) {
      try {
        prepareStdin();

        if (!connections.isConnected()) {
          // Not connected - show banner + propfirm selection
          await banner();
          // Not connected - show propfirm selection directly
          const boxWidth = getLogoWidth();
          const innerWidth = boxWidth - 2;
          const numCols = 3;
          
          const propfirms = PROPFIRM_CHOICES;
          const numbered = propfirms.map((pf, i) => ({ num: i + 1, key: pf.value, name: pf.name }));
          
          // Find max name length for alignment
          const maxNameLen = Math.max(...numbered.map(n => n.name.length));
          const colWidth = 4 + 1 + maxNameLen + 2; // [##] + space + name + gap
          const totalContentWidth = numCols * colWidth;
          const leftMargin = Math.max(2, Math.floor((innerWidth - totalContentWidth) / 2));
          
          // New rectangle (banner is always closed)
          console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
          console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM', innerWidth)) + chalk.cyan('║'));
          console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
          
          const rows = Math.ceil(numbered.length / numCols);
          for (let row = 0; row < rows; row++) {
            let lineParts = [];
            for (let col = 0; col < numCols; col++) {
              const idx = row + col * rows;
              if (idx < numbered.length) {
                const item = numbered[idx];
                const numStr = item.num.toString().padStart(2, ' ');
                const namePadded = item.name.padEnd(maxNameLen);
                lineParts.push({ num: `[${numStr}]`, name: namePadded });
              } else {
                lineParts.push(null);
              }
            }
            
            let line = ' '.repeat(leftMargin);
            for (let i = 0; i < lineParts.length; i++) {
              if (lineParts[i]) {
                line += chalk.cyan(lineParts[i].num) + ' ' + chalk.white(lineParts[i].name);
              } else {
                line += ' '.repeat(4 + 1 + maxNameLen);
              }
              if (i < lineParts.length - 1) line += '  ';
            }
            
            const lineLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
            const rightPad = Math.max(0, innerWidth - lineLen);
            console.log(chalk.cyan('║') + line + ' '.repeat(rightPad) + chalk.cyan('║'));
          }
          
          console.log(chalk.cyan('╠' + '─'.repeat(innerWidth) + '╣'));
          console.log(chalk.cyan('║') + chalk.red(centerText('[X] EXIT', innerWidth)) + chalk.cyan('║'));
          console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
          
          const input = await prompts.textInput(chalk.cyan('SELECT (1-' + numbered.length + '/X): '));
          
          if (!input || input.toLowerCase() === 'x') {
            console.log(chalk.gray('GOODBYE!'));
            process.exit(0);
          }
          
          const action = parseInt(input);
          if (!isNaN(action) && action >= 1 && action <= numbered.length) {
            const selectedPropfirm = numbered[action - 1];
            const { loginPrompt } = require('./menus/connect');
            const credentials = await loginPrompt(selectedPropfirm.name);
            
            if (credentials) {
              const spinner = ora({ text: 'CONNECTING TO RITHMIC...', color: 'yellow' }).start();
              try {
                const { RithmicService } = require('./services/rithmic');
                const service = new RithmicService(selectedPropfirm.key);
                const result = await service.login(credentials.username, credentials.password);
                
                if (result.success) {
                  spinner.text = 'FETCHING ACCOUNTS...';
                  const accResult = await service.getTradingAccounts();
                  connections.add('rithmic', service, service.propfirm.name);
                  spinner.succeed(`CONNECTED TO ${service.propfirm.name.toUpperCase()} (${accResult.accounts?.length || 0} ACCOUNTS)`);
                  currentService = service;
                  await refreshStats();
                  await new Promise(r => setTimeout(r, 1500));
                } else {
                  spinner.fail((result.error || 'AUTHENTICATION FAILED').toUpperCase());
                  await new Promise(r => setTimeout(r, 2000));
                }
              } catch (error) {
                spinner.fail(`CONNECTION ERROR: ${error.message.toUpperCase()}`);
                await new Promise(r => setTimeout(r, 2000));
              }
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
                console.log(chalk.red(`  ALGO ERROR: ${err.message.toUpperCase()}`));
                prepareStdin();
              }
              break;

            case 'aiagents':
              await aiAgentsMenu();
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
