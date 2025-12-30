/**
 * Copy Trading Mode - Mirror trades from Lead to Follower
 * Lightweight - UI + HQX Server handles all execution
 */

const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const readline = require('readline');

const { connections } = require('../../services');
const { HQXServerService } = require('../../services/hqx-server');
const { FUTURES_SYMBOLS } = require('../../config');
const { AlgoUI } = require('./ui');

/**
 * Copy Trading Menu
 */
const copyTradingMenu = async () => {
  const allConns = connections.getAll();
  
  if (allConns.length < 2) {
    console.log();
    console.log(chalk.yellow('  Copy Trading requires 2 connected accounts'));
    console.log(chalk.gray('  Connect to another PropFirm first'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return;
  }
  
  console.log();
  console.log(chalk.magenta.bold('  Copy Trading Setup'));
  console.log();
  
  // Get all active accounts from all connections
  const allAccounts = [];
  for (const conn of allConns) {
    try {
      const result = await conn.service.getTradingAccounts();
      if (result.success && result.accounts) {
        const active = result.accounts.filter(a => a.status === 0);
        for (const acc of active) {
          allAccounts.push({
            account: acc,
            service: conn.service,
            propfirm: conn.propfirm,
            type: conn.type
          });
        }
      }
    } catch (e) { /* ignore */ }
  }
  
  if (allAccounts.length < 2) {
    console.log(chalk.yellow('  Need at least 2 active accounts'));
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return;
  }
  
  // Step 1: Select Lead Account
  console.log(chalk.cyan('  Step 1: Select LEAD Account (source of trades)'));
  const leadChoices = allAccounts.map((a, i) => ({
    name: `${a.propfirm} - ${a.account.accountName || a.account.accountId} ($${a.account.balance.toLocaleString()})`,
    value: i
  }));
  leadChoices.push({ name: chalk.yellow('< Cancel'), value: -1 });
  
  const { leadIdx } = await inquirer.prompt([{
    type: 'list',
    name: 'leadIdx',
    message: 'Lead Account:',
    choices: leadChoices
  }]);
  
  if (leadIdx === -1) return;
  const lead = allAccounts[leadIdx];
  
  // Step 2: Select Follower Account
  console.log();
  console.log(chalk.cyan('  Step 2: Select FOLLOWER Account (copies trades)'));
  const followerChoices = allAccounts
    .map((a, i) => ({ a, i }))
    .filter(x => x.i !== leadIdx)
    .map(x => ({
      name: `${x.a.propfirm} - ${x.a.account.accountName || x.a.account.accountId} ($${x.a.account.balance.toLocaleString()})`,
      value: x.i
    }));
  followerChoices.push({ name: chalk.yellow('< Cancel'), value: -1 });
  
  const { followerIdx } = await inquirer.prompt([{
    type: 'list',
    name: 'followerIdx',
    message: 'Follower Account:',
    choices: followerChoices
  }]);
  
  if (followerIdx === -1) return;
  const follower = allAccounts[followerIdx];
  
  // Step 3: Select Symbol for Lead
  console.log();
  console.log(chalk.cyan('  Step 3: Select Symbol for LEAD'));
  const leadSymbol = await selectSymbol(lead.service, 'Lead');
  if (!leadSymbol) return;
  
  // Step 4: Select Symbol for Follower
  console.log();
  console.log(chalk.cyan('  Step 4: Select Symbol for FOLLOWER'));
  const followerSymbol = await selectSymbol(follower.service, 'Follower');
  if (!followerSymbol) return;
  
  // Step 5: Configure parameters
  console.log();
  console.log(chalk.cyan('  Step 5: Configure Parameters'));
  
  const { leadContracts } = await inquirer.prompt([{
    type: 'number',
    name: 'leadContracts',
    message: 'Lead contracts:',
    default: 1
  }]);
  
  const { followerContracts } = await inquirer.prompt([{
    type: 'number',
    name: 'followerContracts',
    message: 'Follower contracts:',
    default: leadContracts
  }]);
  
  const { dailyTarget } = await inquirer.prompt([{
    type: 'number',
    name: 'dailyTarget',
    message: 'Daily target ($):',
    default: 400
  }]);
  
  const { maxRisk } = await inquirer.prompt([{
    type: 'number',
    name: 'maxRisk',
    message: 'Max risk ($):',
    default: 200
  }]);
  
  // Step 6: Privacy
  const { showNames } = await inquirer.prompt([{
    type: 'confirm',
    name: 'showNames',
    message: 'Show account names?',
    default: false
  }]);
  
  // Confirm
  console.log();
  console.log(chalk.white('  Summary:'));
  console.log(chalk.gray(`  Lead: ${lead.propfirm} -> ${leadSymbol.name} x${leadContracts}`));
  console.log(chalk.gray(`  Follower: ${follower.propfirm} -> ${followerSymbol.name} x${followerContracts}`));
  console.log(chalk.gray(`  Target: $${dailyTarget} | Risk: $${maxRisk}`));
  console.log();
  
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: chalk.yellow('Start Copy Trading?'),
    default: true
  }]);
  
  if (!confirm) return;
  
  // Launch
  await launchCopyTrading({
    lead: { ...lead, symbol: leadSymbol, contracts: leadContracts },
    follower: { ...follower, symbol: followerSymbol, contracts: followerContracts },
    dailyTarget,
    maxRisk,
    showNames
  });
};

/**
 * Symbol selection helper
 */
const selectSymbol = async (service, label) => {
  try {
    const result = await service.getContracts();
    if (!result.success) return null;
    
    const choices = [];
    const cats = {};
    
    for (const c of result.contracts) {
      const cat = c.group || 'Other';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(c);
    }
    
    for (const [cat, list] of Object.entries(cats)) {
      choices.push(new inquirer.Separator(chalk.gray(`--- ${cat} ---`)));
      for (const c of list.slice(0, 8)) {
        choices.push({ name: c.name || c.symbol, value: c });
      }
    }
    choices.push(new inquirer.Separator());
    choices.push({ name: chalk.yellow('< Cancel'), value: null });
    
    const { symbol } = await inquirer.prompt([{
      type: 'list',
      name: 'symbol',
      message: `${label} Symbol:`,
      choices,
      pageSize: 15
    }]);
    
    return symbol;
  } catch (e) {
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
  
  // UI with copy trading subtitle
  const ui = new AlgoUI({ subtitle: 'HQX Copy Trading' });
  
  // Combined stats
  const stats = {
    accountName: `${leadName} -> ${followerName}`,
    symbol: `${lead.symbol.name} / ${follower.symbol.name}`,
    contracts: `${lead.contracts}/${follower.contracts}`,
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
      stopReason = 'target';
      running = false;
      ui.addLog('success', `TARGET! +$${stats.pnl.toFixed(2)}`);
      hqx.stopAlgo();
    } else if (stats.pnl <= -maxRisk) {
      stopReason = 'risk';
      running = false;
      ui.addLog('error', `MAX RISK! -$${Math.abs(stats.pnl).toFixed(2)}`);
      hqx.stopAlgo();
    }
  });
  
  hqx.on('copy', (d) => {
    ui.addLog('trade', `COPIED: ${d.side} ${d.quantity}x to Follower`);
  });
  
  hqx.on('error', (d) => { ui.addLog('error', d.message); });
  hqx.on('disconnected', () => { stats.connected = false; });
  
  // Start copy trading on server
  if (stats.connected) {
    ui.addLog('info', 'Starting Copy Trading...');
    
    // Get credentials
    let leadCreds = null, followerCreds = null;
    
    if (lead.service.getRithmicCredentials) {
      leadCreds = lead.service.getRithmicCredentials();
    }
    if (follower.service.getRithmicCredentials) {
      followerCreds = follower.service.getRithmicCredentials();
    }
    
    hqx.startCopyTrading({
      // Lead config
      leadAccountId: lead.account.accountId,
      leadContractId: lead.symbol.id || lead.symbol.contractId,
      leadSymbol: lead.symbol.symbol || lead.symbol.name,
      leadContracts: lead.contracts,
      leadPropfirm: lead.propfirm,
      leadToken: lead.service.getToken ? lead.service.getToken() : null,
      leadRithmicCredentials: leadCreds,
      
      // Follower config
      followerAccountId: follower.account.accountId,
      followerContractId: follower.symbol.id || follower.symbol.contractId,
      followerSymbol: follower.symbol.symbol || follower.symbol.name,
      followerContracts: follower.contracts,
      followerPropfirm: follower.propfirm,
      followerToken: follower.service.getToken ? follower.service.getToken() : null,
      followerRithmicCredentials: followerCreds,
      
      // Targets
      dailyTarget,
      maxRisk
    });
  }
  
  // UI refresh
  const refreshInterval = setInterval(() => {
    if (running) ui.render(stats);
  }, 250);
  
  // Keyboard
  const setupKeys = () => {
    if (!process.stdin.isTTY) return null;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    const handler = (str, key) => {
      if (key && (key.name === 'x' || (key.ctrl && key.name === 'c'))) {
        running = false;
        stopReason = 'manual';
      }
    };
    process.stdin.on('keypress', handler);
    
    return () => {
      process.stdin.removeListener('keypress', handler);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    };
  };
  
  const cleanupKeys = setupKeys();
  
  // Wait
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (!running) { clearInterval(check); resolve(); }
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
  
  // Summary
  console.clear();
  console.log();
  console.log(chalk.cyan('  === Copy Trading Summary ==='));
  console.log();
  console.log(chalk.white(`  Stop: ${stopReason || 'unknown'}`));
  console.log(chalk.white(`  Trades: ${stats.trades} (W: ${stats.wins} / L: ${stats.losses})`));
  const c = stats.pnl >= 0 ? chalk.green : chalk.red;
  console.log(c(`  P&L: ${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)}`));
  console.log();
  
  await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
};

module.exports = { copyTradingMenu };
