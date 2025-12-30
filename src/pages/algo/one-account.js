/**
 * One Account Mode - Single account algo trading
 * Lightweight - UI + HQX Server connection only
 */

const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const readline = require('readline');

const { connections } = require('../../services');
const { HQXServerService } = require('../../services/hqx-server');
const { FUTURES_SYMBOLS } = require('../../config');
const { AlgoUI, checkMarketStatus } = require('./ui');

/**
 * One Account Menu - Select account and launch
 */
const oneAccountMenu = async (service) => {
  const spinner = ora('Fetching active accounts...').start();
  
  // Get ALL accounts from ALL connections
  const allAccounts = await connections.getAllAccounts();
  
  if (!allAccounts?.length) {
    spinner.fail('No accounts found');
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return;
  }
  
  const activeAccounts = allAccounts.filter(acc => acc.status === 0);
  
  if (!activeAccounts.length) {
    spinner.fail('No active accounts');
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return;
  }
  
  spinner.succeed(`Found ${activeAccounts.length} active account(s)`);
  
  // Select account - show propfirm for clarity
  const { selectedAccount } = await inquirer.prompt([{
    type: 'list',
    name: 'selectedAccount',
    message: 'Select Account:',
    choices: [
      ...activeAccounts.map(acc => ({
        name: chalk.cyan(`${acc.accountName || acc.accountId}`) + 
              chalk.gray(` (${acc.propfirm || 'Unknown'})`) + 
              chalk.white(` - $${(acc.balance || 0).toLocaleString()}`),
        value: acc
      })),
      new inquirer.Separator(),
      { name: chalk.yellow('< Back'), value: 'back' }
    ]
  }]);
  
  if (selectedAccount === 'back') return;
  
  // Find the service for this account
  const accountService = connections.getServiceForAccount(selectedAccount.accountId) || service;
  
  // Select symbol
  const contract = await selectSymbol(accountService, selectedAccount);
  if (!contract) return;
  
  // Configure algo
  const config = await configureAlgo(selectedAccount, contract);
  if (!config) return;
  
  // Launch with the correct service for this account
  await launchAlgo(accountService, selectedAccount, contract, config);
};

/**
 * Symbol selection
 */
const selectSymbol = async (service, account) => {
  const spinner = ora('Loading contracts...').start();
  
  const contractsResult = await service.getContracts();
  if (!contractsResult.success) {
    spinner.fail('Failed to load contracts');
    return null;
  }
  
  spinner.succeed('Contracts loaded');
  
  // Group by category
  const categories = {};
  for (const c of contractsResult.contracts) {
    const cat = c.group || 'Other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(c);
  }
  
  // Build choices
  const choices = [];
  for (const [cat, contracts] of Object.entries(categories)) {
    choices.push(new inquirer.Separator(chalk.gray(`--- ${cat} ---`)));
    for (const c of contracts.slice(0, 10)) {
      choices.push({ name: chalk.white(c.name || c.symbol), value: c });
    }
  }
  choices.push(new inquirer.Separator());
  choices.push({ name: chalk.yellow('< Back'), value: 'back' });
  
  const { contract } = await inquirer.prompt([{
    type: 'list',
    name: 'contract',
    message: 'Select Symbol:',
    choices,
    pageSize: 20
  }]);
  
  return contract === 'back' ? null : contract;
};

/**
 * Configure algo parameters
 */
const configureAlgo = async (account, contract) => {
  console.log();
  console.log(chalk.cyan('  Configure Algo Parameters'));
  console.log();
  
  const { contracts } = await inquirer.prompt([{
    type: 'number',
    name: 'contracts',
    message: 'Number of contracts:',
    default: 1,
    validate: v => v > 0 && v <= 10 ? true : 'Enter 1-10'
  }]);
  
  const { dailyTarget } = await inquirer.prompt([{
    type: 'number',
    name: 'dailyTarget',
    message: 'Daily target ($):',
    default: 200,
    validate: v => v > 0 ? true : 'Must be positive'
  }]);
  
  const { maxRisk } = await inquirer.prompt([{
    type: 'number',
    name: 'maxRisk',
    message: 'Max risk ($):',
    default: 100,
    validate: v => v > 0 ? true : 'Must be positive'
  }]);
  
  const { showName } = await inquirer.prompt([{
    type: 'confirm',
    name: 'showName',
    message: 'Show account name?',
    default: true
  }]);
  
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: chalk.yellow('Start algo trading?'),
    default: true
  }]);
  
  if (!confirm) return null;
  
  return { contracts, dailyTarget, maxRisk, showName };
};

/**
 * Launch algo trading
 */
const launchAlgo = async (service, account, contract, config) => {
  const { contracts, dailyTarget, maxRisk, showName } = config;
  const accountName = showName ? (account.accountName || account.accountId) : 'HQX *****';
  const symbolName = contract.name || contract.symbol;
  
  // Initialize UI
  const ui = new AlgoUI({ subtitle: 'HQX Ultra-Scalping' });
  
  // Stats state
  const stats = {
    accountName,
    symbol: symbolName,
    contracts,
    target: dailyTarget,
    risk: maxRisk,
    pnl: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    latency: 0,
    connected: false
  };
  
  let running = true;
  let stopReason = null;
  
  // Connect to HQX Server
  const hqx = new HQXServerService();
  
  const spinner = ora('Connecting to HQX Server...').start();
  
  try {
    const auth = await hqx.authenticate(account.accountId.toString(), account.propfirm || 'topstep');
    if (!auth.success) throw new Error(auth.error || 'Auth failed');
    
    spinner.text = 'Connecting WebSocket...';
    const conn = await hqx.connect();
    if (!conn.success) throw new Error('WebSocket failed');
    
    spinner.succeed('Connected to HQX Server');
    stats.connected = true;
    
  } catch (err) {
    spinner.warn('HQX Server unavailable - offline mode');
    stats.connected = false;
  }
  
  // Event handlers
  hqx.on('latency', (data) => { stats.latency = data.latency || 0; });
  
  hqx.on('log', (data) => {
    let msg = data.message;
    if (!showName && account.accountName) {
      msg = msg.replace(new RegExp(account.accountName, 'gi'), 'HQX *****');
    }
    ui.addLog(data.type || 'info', msg);
  });
  
  hqx.on('signal', (data) => {
    stats.signals = (stats.signals || 0) + 1;
    const side = data.side === 'long' ? 'BUY' : 'SELL';
    ui.addLog('signal', `${side} @ ${data.entry?.toFixed(2) || 'MKT'}`);
  });
  
  hqx.on('trade', (data) => {
    stats.trades++;
    stats.pnl += data.pnl || 0;
    if (data.pnl >= 0) {
      stats.wins++;
      ui.addLog('trade', `+$${data.pnl.toFixed(2)}`);
    } else {
      stats.losses++;
      ui.addLog('loss', `-$${Math.abs(data.pnl).toFixed(2)}`);
    }
    
    // Check targets
    if (stats.pnl >= dailyTarget) {
      stopReason = 'target';
      running = false;
      ui.addLog('success', `TARGET REACHED! +$${stats.pnl.toFixed(2)}`);
      hqx.stopAlgo();
    } else if (stats.pnl <= -maxRisk) {
      stopReason = 'risk';
      running = false;
      ui.addLog('error', `MAX RISK! -$${Math.abs(stats.pnl).toFixed(2)}`);
      hqx.stopAlgo();
    }
  });
  
  hqx.on('error', (data) => {
    ui.addLog('error', data.message || 'Error');
  });
  
  hqx.on('disconnected', () => {
    stats.connected = false;
    ui.addLog('warning', 'Server disconnected');
  });
  
  // Start algo on server
  if (stats.connected) {
    ui.addLog('info', 'Starting algo...');
    
    // Get credentials if Rithmic
    let rithmicCreds = null;
    if (service.getRithmicCredentials) {
      rithmicCreds = service.getRithmicCredentials();
    }
    
    hqx.startAlgo({
      accountId: account.accountId,
      contractId: contract.id || contract.contractId,
      symbol: contract.symbol || contract.name,
      contracts,
      dailyTarget,
      maxRisk,
      propfirm: account.propfirm || 'topstep',
      propfirmToken: service.getToken ? service.getToken() : null,
      rithmicCredentials: rithmicCreds
    });
  }
  
  // UI refresh interval
  const refreshInterval = setInterval(() => {
    if (running) ui.render(stats);
  }, 250);
  
  // Keyboard handler
  const setupKeyHandler = () => {
    if (!process.stdin.isTTY) return;
    
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    const onKey = (str, key) => {
      if (key && (key.name === 'x' || key.name === 'X' || (key.ctrl && key.name === 'c'))) {
        running = false;
        stopReason = 'manual';
      }
    };
    
    process.stdin.on('keypress', onKey);
    return () => {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    };
  };
  
  const cleanupKeys = setupKeyHandler();
  
  // Wait for stop
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (!running) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });
  
  // Cleanup
  clearInterval(refreshInterval);
  if (cleanupKeys) cleanupKeys();
  
  if (stats.connected) {
    hqx.stopAlgo();
    hqx.disconnect();
  }
  
  ui.cleanup();
  
  // Final summary
  console.clear();
  console.log();
  console.log(chalk.cyan('  === Session Summary ==='));
  console.log();
  console.log(chalk.white(`  Stop Reason: ${stopReason || 'unknown'}`));
  console.log(chalk.white(`  Trades: ${stats.trades} (W: ${stats.wins} / L: ${stats.losses})`));
  const pnlColor = stats.pnl >= 0 ? chalk.green : chalk.red;
  console.log(pnlColor(`  P&L: ${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)}`));
  console.log();
  
  await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to continue...' }]);
};

module.exports = { oneAccountMenu };
