/**
 * @fileoverview Main application router - Rithmic Only (Daemon Mode)
 * @module app
 * 
 * The TUI always uses the daemon for Rithmic connections.
 * Daemon is auto-started in background if not running.
 * This allows TUI updates without losing connection.
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('./services');
const { getLogoWidth, centerText, prepareStdin, clearScreen } = require('./ui');
const { logger, prompts } = require('./utils');
const { setCachedStats, clearCachedStats } = require('./services/stats-cache');
const { startDaemonBackground, isDaemonRunning, getDaemonClient } = require('./services/daemon');

const log = logger.scope('App');

// Pages
const { showStats } = require('./pages/stats');
const { showAccounts } = require('./pages/accounts');
const { algoTradingMenu } = require('./pages/algo');
const { aiAgentsMenu, getActiveAgentCount } = require('./pages/ai-agents');

// Menus
const { rithmicMenu, dashboardMenu, handleUpdate } = require('./menus');
const { PROPFIRM_CHOICES } = require('./config');
const { showPropfirmSelection } = require('./menus/connect');

/** @type {Object|null} */
let currentService = null;

/** @type {Object|null} Daemon client for IPC */
let daemonClient = null;

/**
 * Create a proxy service that uses daemon for all operations
 * @param {Object} client - DaemonClient instance
 * @param {Object} propfirm - Propfirm info
 * @param {Object} credentials - Optional credentials {username, password}
 * @returns {Object} Service-like object
 */
function createDaemonProxyService(client, propfirm, credentials = null) {
  const checkMarketHours = () => {
    const now = new Date(), utcDay = now.getUTCDay(), utcHour = now.getUTCHours();
    const isDST = now.getTimezoneOffset() < Math.max(
      new Date(now.getFullYear(), 0, 1).getTimezoneOffset(),
      new Date(now.getFullYear(), 6, 1).getTimezoneOffset());
    const ctOffset = isDST ? 5 : 6, ctHour = (utcHour - ctOffset + 24) % 24;
    const ctDay = utcHour < ctOffset ? (utcDay + 6) % 7 : utcDay;
    if (ctDay === 6) return { isOpen: false, message: 'Market closed (Saturday)' };
    if (ctDay === 0 && ctHour < 17) return { isOpen: false, message: 'Market opens Sunday 5PM CT' };
    if (ctDay === 5 && ctHour >= 16) return { isOpen: false, message: 'Market closed (Friday 4PM CT)' };
    if (ctHour === 16 && ctDay >= 1 && ctDay <= 4) return { isOpen: false, message: 'Daily maintenance' };
    return { isOpen: true, message: 'Market is open' };
  };
  
  // Store credentials for algo trading (market data feed)
  let storedCredentials = credentials;
  
  return {
    propfirm, propfirmKey: propfirm?.key, accounts: [], credentials: storedCredentials,
    async getTradingAccounts() { return client.getTradingAccounts(); },
    async getPositions() { return client.getPositions(); },
    async getOrders() { return client.getOrders(); },
    async placeOrder(data) { return client.placeOrder(data); },
    async cancelOrder(orderId) { return client.cancelOrder(orderId); },
    async cancelAllOrders(accountId) { return client.cancelAllOrders(accountId); },
    async closePosition(accountId, symbol) { return client.closePosition(accountId, symbol); },
    async getContracts() { return client.getContracts(); },
    async searchContracts(search) { return client.searchContracts(search); },
    getAccountPnL() { return { pnl: null, openPnl: null, closedPnl: null, balance: null }; },
    getToken() { return 'daemon-connected'; },
    getPropfirm() { return propfirm?.key || 'apex'; },
    getRithmicCredentials() {
      // Return credentials for algo trading market data connection
      if (!storedCredentials) return null;
      const { RITHMIC_ENDPOINTS } = require('./services/rithmic');
      const { getPropFirm } = require('./config/propfirms');
      
      // Get the proper rithmicSystem from propfirm config
      const propfirmKey = propfirm?.key || 'apex_rithmic';
      const propfirmConfig = getPropFirm(propfirmKey);
      const systemName = propfirmConfig?.rithmicSystem || propfirm?.rithmicSystem || propfirm?.name || 'Apex';
      
      return {
        userId: storedCredentials.username,
        password: storedCredentials.password,
        systemName,
        gateway: RITHMIC_ENDPOINTS?.CHICAGO || 'wss://rprotocol.rithmic.com:443',
      };
    },
    setCredentials(creds) { storedCredentials = creds; },
    checkMarketHours,
    async disconnect() { return { success: true }; },
    // For algo - disconnect ticker before starting new market data connection
    async disconnectTicker() { return { success: true }; },
  };
}

// ==================== TERMINAL ====================

const restoreTerminal = () => {
  try {
    // Show cursor
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
    // Filter active accounts: status === 'active' (Rithmic) OR status === 0 OR no status
    const activeAccounts = allAccounts.filter(acc => 
      acc.status === 0 || acc.status === 'active' || acc.status === undefined || acc.status === null
    );

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
      agents: getActiveAgentCount(),
    });
  } catch (err) {
    log.warn('Failed to refresh stats', { error: err.message });
  }
};

// ==================== BANNER ====================

const banner = async () => {
  clearScreen();
  
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
  
  if (isMobile) {
    const tagline = `HQX V${version}`;
    console.log(chalk.cyan('║') + chalk.yellow(centerText(tagline, innerWidth)) + chalk.cyan('║'));
  } else {
    const taglineBase = 'PROP FUTURES ALGO TRADING  ';
    const taglineVersion = `V${version}`;
    const totalLen = taglineBase.length + taglineVersion.length;
    const padLeft = Math.floor((innerWidth - totalLen) / 2);
    const padRight = innerWidth - totalLen - padLeft;
    console.log(chalk.cyan('║') + ' '.repeat(padLeft) + chalk.yellow(taglineBase) + chalk.magenta(taglineVersion) + ' '.repeat(padRight) + chalk.cyan('║'));
  }
  
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
    
    // First launch - show banner
    await banner();
    
    // ==================== DAEMON AUTO-START ====================
    // Always ensure daemon is running for persistent connections
    let spinner = ora({ text: 'Starting daemon...', color: 'cyan' }).start();
    
    if (!isDaemonRunning()) {
      const daemonStarted = await startDaemonBackground();
      if (!daemonStarted) {
        spinner.warn('Daemon failed to start - using direct mode');
        await new Promise(r => setTimeout(r, 500));
      } else {
        spinner.succeed('Daemon started');
      }
    } else {
      spinner.succeed('Daemon running');
    }
    
    // Connect to daemon
    daemonClient = getDaemonClient();
    const daemonConnected = await daemonClient.connect();
    
    if (!daemonConnected) {
      log.warn('Could not connect to daemon, falling back to direct mode');
    }
    
    // ==================== SESSION RESTORE ====================
    spinner = ora({ text: 'Restoring session...', color: 'cyan' }).start();
    
    // Try to restore via daemon first
    let restored = false;
    if (daemonConnected) {
      try {
        const status = await daemonClient.getStatus();
        
        if (status.connected) {
          // Daemon already has a connection, use it
          const accountsResult = await daemonClient.getTradingAccounts();
          if (accountsResult.success && accountsResult.accounts?.length > 0) {
            // Get credentials for algo trading
            let credentials = null;
            try {
              const credResult = await daemonClient.getCredentials();
              if (credResult.success) {
                credentials = credResult.credentials;
              }
            } catch (credErr) {
              log.warn('Failed to get credentials', { error: credErr.message });
            }
            
            // Create a proxy service that uses daemon
            currentService = createDaemonProxyService(daemonClient, status.propfirm, credentials);
            connections.services.push({
              type: 'rithmic',
              service: currentService,
              propfirm: status.propfirm?.name,
              propfirmKey: status.propfirm?.key,
              connectedAt: new Date(),
            });
            restored = true;
            spinner.succeed(`Session active: ${status.propfirm?.name} (${accountsResult.accounts.length} accounts)`);
          }
        } else {
          // Daemon not connected, try to restore session via daemon
          const restoreResult = await daemonClient.restoreSession();
          if (restoreResult.success) {
            // Get credentials for algo trading
            let credentials = null;
            try {
              const credResult = await daemonClient.getCredentials();
              if (credResult.success) {
                credentials = credResult.credentials;
              }
            } catch (credErr) {
              log.warn('Failed to get credentials', { error: credErr.message });
            }
            
            currentService = createDaemonProxyService(daemonClient, restoreResult.propfirm, credentials);
            connections.services.push({
              type: 'rithmic',
              service: currentService,
              propfirm: restoreResult.propfirm?.name,
              propfirmKey: restoreResult.propfirm?.key,
              connectedAt: new Date(),
            });
            restored = true;
            spinner.succeed(`Session restored: ${restoreResult.propfirm?.name} (${restoreResult.accounts?.length || 0} accounts)`);
          }
        }
      } catch (err) {
        log.warn('Daemon restore failed', { error: err.message });
      }
    }
    
    // Fallback to direct restore if daemon failed
    if (!restored) {
      restored = await connections.restoreFromStorage();
      if (restored) {
        const conn = connections.getAll()[0];
        currentService = conn.service;
        const accountCount = currentService.accounts?.length || 0;
        spinner.succeed(`Session restored: ${conn.propfirm} (${accountCount} accounts)`);
      }
    }

    if (restored) {
      await new Promise(r => setTimeout(r, 500));
      const spinner2 = ora({ text: 'Loading dashboard...', color: 'yellow' }).start();
      await refreshStats();
      global.__hqxSpinner = spinner2;
    } else {
      spinner.info('No saved session - please login');
      await new Promise(r => setTimeout(r, 500));
      global.__hqxSpinner = null;
    }

    // Main loop
    while (true) {
      try {
        prepareStdin();

        if (!connections.isConnected()) {
          // Not connected - show banner + propfirm selection
          await banner();
          
          const selectedPropfirm = await showPropfirmSelection();
          if (!selectedPropfirm) {
            console.log(chalk.gray('GOODBYE!'));
            process.exit(0);
          }
          
          const { loginPrompt } = require('./menus/connect');
          const credentials = await loginPrompt(selectedPropfirm.name);
          
          if (credentials) {
            const spinner = ora({ text: 'CONNECTING TO RITHMIC...', color: 'yellow' }).start();
            try {
              let result;
              
              // Try daemon connection first (persistent)
              if (daemonClient?.connected) {
                result = await daemonClient.login(selectedPropfirm.key, credentials.username, credentials.password);
                if (result.success) {
                  // Pass credentials for algo trading market data
                  currentService = createDaemonProxyService(daemonClient, result.propfirm, credentials);
                  connections.services.push({
                    type: 'rithmic', service: currentService,
                    propfirm: selectedPropfirm.name, propfirmKey: selectedPropfirm.key, connectedAt: new Date(),
                  });
                  spinner.succeed(`CONNECTED TO ${selectedPropfirm.name.toUpperCase()} (${result.accounts?.length || 0} ACCOUNTS) [DAEMON]`);
                  await refreshStats();
                  await new Promise(r => setTimeout(r, 1500));
                } else {
                  spinner.fail((result.error || 'AUTHENTICATION FAILED').toUpperCase());
                  await new Promise(r => setTimeout(r, 2000));
                }
              } else {
                // Fallback to direct connection
                const { RithmicService } = require('./services/rithmic');
                const service = new RithmicService(selectedPropfirm.key);
                result = await service.login(credentials.username, credentials.password);
                if (result.success) {
                  connections.add('rithmic', service, selectedPropfirm.name);
                  spinner.succeed(`CONNECTED TO ${selectedPropfirm.name.toUpperCase()} (${result.accounts?.length || 0} ACCOUNTS)`);
                  currentService = service;
                  await refreshStats();
                  await new Promise(r => setTimeout(r, 1500));
                } else {
                  spinner.fail((result.error || 'AUTHENTICATION FAILED').toUpperCase());
                  await new Promise(r => setTimeout(r, 2000));
                }
              }
            } catch (error) {
              spinner.fail(`CONNECTION ERROR: ${error.message.toUpperCase()}`);
              await new Promise(r => setTimeout(r, 2000));
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
              const updateResult = await handleUpdate();
              if (updateResult === 'exit') {
                running = false;
              }
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
