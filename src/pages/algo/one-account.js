/**
 * One Account Mode
 */

const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');

const { connections } = require('../../services');
const { HQXServerService } = require('../../services/hqx-server');
const { AlgoUI } = require('./ui');
const { prompts } = require('../../utils');
const { checkMarketHours } = require('../../services/projectx/market');

/**
 * One Account Menu
 */
const oneAccountMenu = async (service) => {
  // Check if market is open
  const market = checkMarketHours();
  if (!market.isOpen) {
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
  const options = activeAccounts.map(acc => ({
    label: `${acc.accountName || acc.accountId} (${acc.propfirm || 'Unknown'}) - $${(acc.balance || 0).toLocaleString()}`,
    value: acc
  }));
  options.push({ label: '< Back', value: 'back' });
  
  const selectedAccount = await prompts.selectOption('Select Account:', options);
  if (!selectedAccount || selectedAccount === 'back') return;
  
  const accountService = connections.getServiceForAccount(selectedAccount.accountId) || service;
  
  // Select symbol
  const contract = await selectSymbol(accountService, selectedAccount);
  if (!contract) return;
  
  // Configure algo
  const config = await configureAlgo(selectedAccount, contract);
  if (!config) return;
  
  await launchAlgo(accountService, selectedAccount, contract, config);
};

/**
 * Symbol selection - same as copy-trading
 */
const selectSymbol = async (service, account) => {
  const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();
  
  const contractsResult = await service.getContracts();
  if (!contractsResult.success || !contractsResult.contracts?.length) {
    spinner.fail('Failed to load contracts');
    return null;
  }
  
  // Normalize contract structure - API returns { name: "ESH6", description: "E-mini S&P 500..." }
  const contracts = contractsResult.contracts.map(c => ({
    ...c,
    symbol: c.name || c.symbol,
    name: c.description || c.name || c.symbol
  }));
  
  spinner.succeed(`Found ${contracts.length} contracts`);
  
  const options = contracts.map(c => ({ label: c.name, value: c }));
  options.push({ label: '< Back', value: 'back' });
  
  const contract = await prompts.selectOption('Select Symbol:', options);
  return contract === 'back' ? null : contract;
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
  
  const showName = await prompts.confirmPrompt('Show account name?', true);
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
  const accountName = showName ? (account.accountName || account.accountId) : 'HQX *****';
  const symbolName = contract.name || contract.symbol;
  
  const ui = new AlgoUI({ subtitle: 'HQX Ultra-Scalping', mode: 'one-account' });
  
  const stats = {
    accountName, symbol: symbolName, contracts,
    target: dailyTarget, risk: maxRisk,
    pnl: 0, trades: 0, wins: 0, losses: 0,
    latency: 0, connected: false
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
  hqx.on('signal', (d) => {
    stats.signals = (stats.signals || 0) + 1;
    ui.addLog('signal', `${d.side === 'long' ? 'BUY' : 'SELL'} @ ${d.entry?.toFixed(2) || 'MKT'}`);
  });
  hqx.on('trade', (d) => {
    stats.trades++;
    stats.pnl += d.pnl || 0;
    if (d.pnl >= 0) { stats.wins++; ui.addLog('trade', `+$${d.pnl.toFixed(2)}`); }
    else { stats.losses++; ui.addLog('loss', `-$${Math.abs(d.pnl).toFixed(2)}`); }
    
    if (stats.pnl >= dailyTarget) {
      stopReason = 'target'; running = false;
      ui.addLog('success', `TARGET! +$${stats.pnl.toFixed(2)}`);
      hqx.stopAlgo();
    } else if (stats.pnl <= -maxRisk) {
      stopReason = 'risk'; running = false;
      ui.addLog('error', `MAX RISK! -$${Math.abs(stats.pnl).toFixed(2)}`);
      hqx.stopAlgo();
    }
  });
  hqx.on('error', (d) => { ui.addLog('error', d.message || 'Error'); });
  hqx.on('disconnected', () => { stats.connected = false; ui.addLog('warning', 'Disconnected'); });
  
  // Start on server
  if (stats.connected) {
    ui.addLog('info', 'Starting algo...');
    
    let rithmicCreds = null;
    if (service.getRithmicCredentials) rithmicCreds = service.getRithmicCredentials();
    
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
  
  // Summary
  console.clear();
  console.log();
  console.log(chalk.cyan('  === Session Summary ==='));
  console.log();
  console.log(chalk.white(`  Stop Reason: ${stopReason || 'unknown'}`));
  console.log(chalk.white(`  Trades: ${stats.trades} (W: ${stats.wins} / L: ${stats.losses})`));
  console.log((stats.pnl >= 0 ? chalk.green : chalk.red)(`  P&L: ${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)}`));
  console.log();
  
  await prompts.waitForEnter();
};

module.exports = { oneAccountMenu };
