/**
 * Copy Trading Mode
 */

const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');

const { connections } = require('../../services');
const { HQXServerService } = require('../../services/hqx-server');
const { AlgoUI } = require('./ui');
const { logger, prompts } = require('../../utils');

const log = logger.scope('CopyTrading');

/**
 * Copy Trading Menu
 */
const copyTradingMenu = async () => {
  log.info('Copy Trading menu opened');
  const allConns = connections.getAll();
  
  if (allConns.length < 2) {
    console.log();
    console.log(chalk.yellow('  Copy Trading requires 2 connected accounts'));
    console.log(chalk.gray('  Connect to another PropFirm first'));
    console.log();
    await prompts.waitForEnter();
    return;
  }
  
  console.log();
  console.log(chalk.magenta.bold('  Copy Trading Setup'));
  console.log();
  
  const spinner = ora({ text: 'Fetching accounts...', color: 'yellow' }).start();
  
  const allAccounts = [];
  for (const conn of allConns) {
    try {
      const result = await conn.service.getTradingAccounts();
      if (result.success && result.accounts) {
        const active = result.accounts.filter(a => a.status === 0);
        for (const acc of active) {
          allAccounts.push({ account: acc, service: conn.service, propfirm: conn.propfirm, type: conn.type });
        }
      }
    } catch (e) {}
  }
  
  if (allAccounts.length < 2) {
    spinner.fail('Need at least 2 active accounts');
    await prompts.waitForEnter();
    return;
  }
  
  spinner.succeed(`Found ${allAccounts.length} active accounts`);
  
  // Step 1: Select Lead Account
  console.log(chalk.cyan('  Step 1: Select LEAD Account'));
  const leadOptions = allAccounts.map((a, i) => ({
    label: `${a.propfirm} - ${a.account.accountName || a.account.accountId} ($${a.account.balance.toLocaleString()})`,
    value: i
  }));
  leadOptions.push({ label: '< Cancel', value: -1 });
  
  const leadIdx = await prompts.selectOption('Lead Account:', leadOptions);
  if (leadIdx === null || leadIdx === -1) return;
  const lead = allAccounts[leadIdx];
  
  // Step 2: Select Follower Account
  console.log();
  console.log(chalk.cyan('  Step 2: Select FOLLOWER Account'));
  const followerOptions = allAccounts
    .map((a, i) => ({ a, i }))
    .filter(x => x.i !== leadIdx)
    .map(x => ({
      label: `${x.a.propfirm} - ${x.a.account.accountName || x.a.account.accountId} ($${x.a.account.balance.toLocaleString()})`,
      value: x.i
    }));
  followerOptions.push({ label: '< Cancel', value: -1 });
  
  const followerIdx = await prompts.selectOption('Follower Account:', followerOptions);
  if (followerIdx === null || followerIdx === -1) return;
  const follower = allAccounts[followerIdx];
  
  // Step 3: Select Trading Symbol
  console.log();
  console.log(chalk.cyan('  Step 3: Select Trading Symbol'));
  const symbol = await selectSymbol(lead.service, 'Trading');
  if (!symbol) return;
  
  // Step 4: Configure parameters
  console.log();
  console.log(chalk.cyan('  Step 4: Configure Parameters'));
  
  const leadContracts = await prompts.numberInput('Lead contracts:', 1, 1, 10);
  if (leadContracts === null) return;
  
  const followerContracts = await prompts.numberInput('Follower contracts:', leadContracts, 1, 10);
  if (followerContracts === null) return;
  
  const dailyTarget = await prompts.numberInput('Daily target ($):', 400, 1, 10000);
  if (dailyTarget === null) return;
  
  const maxRisk = await prompts.numberInput('Max risk ($):', 200, 1, 5000);
  if (maxRisk === null) return;
  
  // Step 5: Privacy
  const showNames = await prompts.selectOption('Account names:', [
    { label: 'Hide account names', value: false },
    { label: 'Show account names', value: true }
  ]);
  if (showNames === null) return;
  
  // Confirm
  console.log();
  console.log(chalk.white('  Summary:'));
  console.log(chalk.gray(`  Symbol: ${symbol.name}`));
  console.log(chalk.gray(`  Lead: ${lead.propfirm} x${leadContracts}`));
  console.log(chalk.gray(`  Follower: ${follower.propfirm} x${followerContracts}`));
  console.log(chalk.gray(`  Target: $${dailyTarget} | Risk: $${maxRisk}`));
  console.log();
  
  const confirm = await prompts.confirmPrompt('Start Copy Trading?', true);
  if (!confirm) return;
  
  // Launch
  await launchCopyTrading({
    lead: { ...lead, symbol, contracts: leadContracts },
    follower: { ...follower, symbol, contracts: followerContracts },
    dailyTarget, maxRisk, showNames
  });
};

// Cached contracts from API
let cachedContracts = null;

/**
 * Get contracts from ProjectX API (shared for all services)
 */
const getContractsFromAPI = async () => {
  if (cachedContracts) return cachedContracts;
  
  // Find a ProjectX connection to get contracts from API
  const allConns = connections.getAll();
  const projectxConn = allConns.find(c => c.type === 'projectx');
  
  if (projectxConn && typeof projectxConn.service.getContracts === 'function') {
    const result = await projectxConn.service.getContracts();
    if (result.success && result.contracts?.length > 0) {
      // Normalize contract structure - API returns { name: "ESH6", description: "E-mini S&P 500..." }
      cachedContracts = result.contracts.map(c => ({
        ...c,
        symbol: c.name || c.symbol,
        name: c.description || c.name || c.symbol
      }));
      return cachedContracts;
    }
  }
  
  return null;
};

/**
 * Symbol selection helper - uses API contracts for all services
 */
const selectSymbol = async (service, label) => {
  try {
    const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();
    
    // Always use contracts from ProjectX API for consistency
    let contracts = await getContractsFromAPI();
    
    // Fallback to service's own contracts if no ProjectX available
    if (!contracts && typeof service.getContracts === 'function') {
      const result = await service.getContracts();
      if (result.success && result.contracts?.length > 0) {
        contracts = result.contracts;
      }
    }
    
    if (!contracts || contracts.length === 0) {
      spinner.fail('No contracts available');
      return null;
    }
    
    spinner.succeed(`Found ${contracts.length} contracts`);
    
    const options = contracts.map(c => ({ label: c.name || c.symbol, value: c }));
    options.push({ label: '< Cancel', value: null });
    
    return await prompts.selectOption(`${label} Symbol:`, options);
  } catch (e) {
    console.log(chalk.red('  Error loading contracts'));
    return null;
  }
};

/**
 * Launch Copy Trading
 */
const launchCopyTrading = async (config) => {
  const { lead, follower, dailyTarget, maxRisk, showNames } = config;
  
  const leadName = showNames ? (lead.account.accountName || lead.account.accountId) : 'HQX Lead *****';
  const followerName = showNames ? (follower.account.accountName || follower.account.accountId) : 'HQX Follower *****';
  
  const ui = new AlgoUI({ subtitle: 'HQX Copy Trading' });
  
  const stats = {
    leadName, followerName,
    leadSymbol: lead.symbol.name,
    followerSymbol: follower.symbol.name,
    leadQty: lead.contracts,
    followerQty: follower.contracts,
    target: dailyTarget, risk: maxRisk,
    pnl: 0, trades: 0, wins: 0, losses: 0,
    latency: 0, connected: false
  };
  
  let running = true;
  let stopReason = null;
  
  const hqx = new HQXServerService();
  const spinner = ora({ text: 'Connecting to HQX Server...', color: 'yellow' }).start();
  
  try {
    const auth = await hqx.authenticate(lead.account.accountId.toString(), lead.propfirm || 'topstep');
    if (!auth.success) throw new Error(auth.error);
    
    const conn = await hqx.connect();
    if (!conn.success) throw new Error('WebSocket failed');
    
    spinner.succeed('Connected');
    stats.connected = true;
  } catch (err) {
    spinner.warn('HQX Server unavailable');
  }
  
  // Event handlers
  hqx.on('latency', (d) => { stats.latency = d.latency || 0; });
  hqx.on('log', (d) => {
    let msg = d.message;
    if (!showNames) {
      if (lead.account.accountName) msg = msg.replace(new RegExp(lead.account.accountName, 'gi'), 'Lead *****');
      if (follower.account.accountName) msg = msg.replace(new RegExp(follower.account.accountName, 'gi'), 'Follower *****');
    }
    ui.addLog(d.type || 'info', msg);
  });
  hqx.on('trade', (d) => {
    stats.trades++;
    stats.pnl += d.pnl || 0;
    d.pnl >= 0 ? stats.wins++ : stats.losses++;
    ui.addLog(d.pnl >= 0 ? 'trade' : 'loss', `${d.pnl >= 0 ? '+' : ''}$${d.pnl.toFixed(2)}`);
    
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
  hqx.on('copy', (d) => { ui.addLog('trade', `COPIED: ${d.side} ${d.quantity}x`); });
  hqx.on('error', (d) => { ui.addLog('error', d.message); });
  hqx.on('disconnected', () => { stats.connected = false; });
  
  // Start on server
  if (stats.connected) {
    ui.addLog('info', 'Starting Copy Trading...');
    
    let leadCreds = null, followerCreds = null;
    if (lead.service.getRithmicCredentials) leadCreds = lead.service.getRithmicCredentials();
    if (follower.service.getRithmicCredentials) followerCreds = follower.service.getRithmicCredentials();
    
    hqx.startCopyTrading({
      leadAccountId: lead.account.accountId,
      leadContractId: lead.symbol.id || lead.symbol.contractId,
      leadSymbol: lead.symbol.symbol || lead.symbol.name,
      leadContracts: lead.contracts,
      leadPropfirm: lead.propfirm,
      leadToken: lead.service.getToken?.() || null,
      leadRithmicCredentials: leadCreds,
      followerAccountId: follower.account.accountId,
      followerContractId: follower.symbol.id || follower.symbol.contractId,
      followerSymbol: follower.symbol.symbol || follower.symbol.name,
      followerContracts: follower.contracts,
      followerPropfirm: follower.propfirm,
      followerToken: follower.service.getToken?.() || null,
      followerRithmicCredentials: followerCreds,
      dailyTarget, maxRisk
    });
  }
  
  const refreshInterval = setInterval(() => { if (running) ui.render(stats); }, 250);
  
  // Keyboard
  const setupKeys = () => {
    if (!process.stdin.isTTY) return null;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    const handler = (str, key) => {
      if (key && (key.name === 'x' || (key.ctrl && key.name === 'c'))) {
        running = false; stopReason = 'manual';
      }
    };
    process.stdin.on('keypress', handler);
    return () => {
      process.stdin.removeListener('keypress', handler);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    };
  };
  
  const cleanupKeys = setupKeys();
  
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
  console.log(chalk.cyan('  === Copy Trading Summary ==='));
  console.log();
  console.log(chalk.white(`  Stop: ${stopReason || 'unknown'}`));
  console.log(chalk.white(`  Trades: ${stats.trades} (W: ${stats.wins} / L: ${stats.losses})`));
  console.log((stats.pnl >= 0 ? chalk.green : chalk.red)(`  P&L: ${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)}`));
  console.log();
  
  await prompts.waitForEnter();
};

module.exports = { copyTradingMenu };
