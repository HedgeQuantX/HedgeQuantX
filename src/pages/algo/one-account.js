/**
 * One Account Mode
 */

const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');

const { connections } = require('../../services');
const { HQXServerService } = require('../../services/hqx-server');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { prompts } = require('../../utils');
const { checkMarketHours } = require('../../services/projectx/market');

/**
 * One Account Menu
 */
const oneAccountMenu = async (service) => {
  // Check if market is open (skip early close check - market may still be open)
  const market = checkMarketHours();
  if (!market.isOpen && !market.message.includes('early')) {
    console.log();
    console.log(chalk.red(`  ${market.message}`));
    console.log(chalk.gray('  Algo trading is only available when market is open'));
    console.log();
    await prompts.waitForEnter();
    return;
  }
  
  const spinner = ora({ text: 'Fetching active accounts...', color: 'yellow' }).start();
  
  const allAccounts = await connections.getAllAccounts();
  
  if (!allAccounts?.length) {
    spinner.fail('No accounts found');
    await prompts.waitForEnter();
    return;
  }
  
  const activeAccounts = allAccounts.filter(acc => acc.status === 0);
  
  if (!activeAccounts.length) {
    spinner.fail('No active accounts');
    await prompts.waitForEnter();
    return;
  }
  
  spinner.succeed(`Found ${activeAccounts.length} active account(s)`);
  
  // Select account
  // Display name priority: accountName (ProjectX) > rithmicAccountId (Rithmic) > name > accountId
  const options = activeAccounts.map(acc => ({
    label: `${acc.accountName || acc.rithmicAccountId || acc.name || acc.accountId} (${acc.propfirm || 'Unknown'})${acc.balance !== null ? ` - $${acc.balance.toLocaleString()}` : ''}`,
    value: acc
  }));
  options.push({ label: '< Back', value: 'back' });
  
  const selectedAccount = await prompts.selectOption('Select Account:', options);
  if (!selectedAccount || selectedAccount === 'back') return;
  
  // Use the service attached to the account (from getAllAccounts), fallback to getServiceForAccount
  const accountService = selectedAccount.service || connections.getServiceForAccount(selectedAccount.accountId) || service;
  
  // Select symbol
  const contract = await selectSymbol(accountService, selectedAccount);
  if (!contract) return;
  
  // Configure algo
  const config = await configureAlgo(selectedAccount, contract);
  if (!config) return;
  
  await launchAlgo(accountService, selectedAccount, contract, config);
};

/**
 * Symbol selection - grouped by category with indices first
 */
const selectSymbol = async (service, account) => {
  const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();
  
  const contractsResult = await service.getContracts();
  if (!contractsResult.success || !contractsResult.contracts?.length) {
    spinner.fail('Failed to load contracts');
    return null;
  }
  
  // Contracts are already sorted by category from getContracts()
  const contracts = contractsResult.contracts;
  
  spinner.succeed(`Found ${contracts.length} contracts`);
  
  // Build options from RAW API response - no static data
  const options = [];
  let currentGroup = null;
  
  for (const c of contracts) {
    // Category header from API field contractGroup
    if (c.contractGroup !== currentGroup) {
      currentGroup = c.contractGroup;
      if (currentGroup) {
        options.push({ 
          label: chalk.cyan.bold(`── ${currentGroup} ──`), 
          value: null, 
          disabled: true 
        });
      }
    }
    
    // Display using RAW API fields only
    const label = `  ${c.name} - ${c.description} (${c.exchange})`;
    options.push({ label, value: c });
  }
  
  options.push({ label: '', value: null, disabled: true }); // Spacer
  options.push({ label: chalk.gray('< Back'), value: 'back' });
  
  const contract = await prompts.selectOption(chalk.yellow('Select Symbol:'), options);
  return contract === 'back' || contract === null ? null : contract;
};

/**
 * Configure algo
 */
const configureAlgo = async (account, contract) => {
  console.log();
  console.log(chalk.cyan('  Configure Algo Parameters'));
  console.log();
  
  const contracts = await prompts.numberInput('Number of contracts:', 1, 1, 10);
  if (contracts === null) return null;
  
  const dailyTarget = await prompts.numberInput('Daily target ($):', 200, 1, 10000);
  if (dailyTarget === null) return null;
  
  const maxRisk = await prompts.numberInput('Max risk ($):', 100, 1, 5000);
  if (maxRisk === null) return null;
  
  const showName = await prompts.confirmPrompt('Show account name?', false);
  if (showName === null) return null;
  
  const confirm = await prompts.confirmPrompt('Start algo trading?', true);
  if (!confirm) return null;
  
  return { contracts, dailyTarget, maxRisk, showName };
};

/**
 * Launch algo trading
 */
const launchAlgo = async (service, account, contract, config) => {
  const { contracts, dailyTarget, maxRisk, showName } = config;
  // Use real account ID from API
  const realAccountId = account.rithmicAccountId || account.accountName || account.accountId;
  const accountName = showName ? realAccountId : 'HQX *****';
  // Use RAW API field 'name' for symbol (e.g., "MESH6")
  const symbolName = contract.name;
  
  const ui = new AlgoUI({ subtitle: 'HQX Algo Trading', mode: 'one-account' });
  
  const stats = {
    accountName, symbol: symbolName, contracts,
    target: dailyTarget, risk: maxRisk,
    propfirm: account.propfirm || 'Unknown',
    pnl: 0, trades: 0, wins: 0, losses: 0,
    latency: 0, connected: false,
    startTime: Date.now()  // Track start time for duration
  };
  
  let running = true;
  let stopReason = null;
  
  const hqx = new HQXServerService();
  const spinner = ora({ text: 'Connecting to HQX Server...', color: 'yellow' }).start();
  
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
  }
  
  // Event handlers
  hqx.on('latency', (d) => { stats.latency = d.latency || 0; });
  hqx.on('log', (d) => {
    let msg = d.message;
    if (!showName && account.accountName) msg = msg.replace(new RegExp(account.accountName, 'gi'), 'HQX *****');
    ui.addLog(d.type || 'info', msg);
  });
  
  // REAL P&L direct from Rithmic - no calculation
  hqx.on('stats', (d) => {
    if (d.realTimePnL) {
      stats.pnl = d.realTimePnL.totalPnL;
    }
    stats.trades = d.trades;
    stats.wins = d.wins;
    stats.losses = d.losses;
  });
  
  hqx.on('error', (d) => { ui.addLog('error', d.message || 'Error'); });
  hqx.on('disconnected', () => { stats.connected = false; ui.addLog('warning', 'Disconnected'); });
  
  // Start on server
  if (stats.connected) {
    ui.addLog('info', 'Starting algo...');
    
    // Get Rithmic credentials from the account's service
    let rithmicCreds = null;
    if (service && service.getRithmicCredentials) {
      rithmicCreds = service.getRithmicCredentials();
    }
    
    hqx.startAlgo({
      accountId: account.accountId,
      contractId: contract.id || contract.contractId,
      symbol: contract.symbol || contract.name,
      contracts, dailyTarget, maxRisk,
      propfirm: account.propfirm || 'topstep',
      propfirmToken: service.getToken?.() || null,
      rithmicCredentials: rithmicCreds
    });
  }
  
  const refreshInterval = setInterval(() => { if (running) ui.render(stats); }, 250);
  
  // Keyboard
  const setupKeyHandler = () => {
    if (!process.stdin.isTTY) return;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    const onKey = (str, key) => {
      if (key && (key.name === 'x' || key.name === 'X' || (key.ctrl && key.name === 'c'))) {
        running = false; stopReason = 'manual';
      }
    };
    process.stdin.on('keypress', onKey);
    return () => {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    };
  };
  
  const cleanupKeys = setupKeyHandler();
  
  await new Promise(resolve => {
    const check = setInterval(() => { if (!running) { clearInterval(check); resolve(); } }, 100);
  });
  
  clearInterval(refreshInterval);
  if (cleanupKeys) cleanupKeys();
  if (stats.connected) { hqx.stopAlgo(); hqx.disconnect(); }
  ui.cleanup();
  
  // Calculate duration
  const durationMs = Date.now() - stats.startTime;
  const hours = Math.floor(durationMs / 3600000);
  const minutes = Math.floor((durationMs % 3600000) / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  stats.duration = hours > 0 
    ? `${hours}h ${minutes}m ${seconds}s`
    : minutes > 0 
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;
  
  // Summary
  renderSessionSummary(stats, stopReason);
  
  await prompts.waitForEnter();
};

module.exports = { oneAccountMenu };
