/**
 * One Account Mode
 */

const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');

const { connections } = require('../../services');
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
  
  // Select account - display RAW API fields
  const options = activeAccounts.map(acc => {
    // Use what API returns: accountName for ProjectX, rithmicAccountId for Rithmic
    const name = acc.accountName || acc.rithmicAccountId || acc.accountId;
    const balance = acc.balance !== null && acc.balance !== undefined 
      ? ` - $${acc.balance.toLocaleString()}` 
      : '';
    return {
      label: `${name} (${acc.propfirm || acc.platform || 'Unknown'})${balance}`,
      value: acc
    };
  });
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
 * Symbol selection - sorted with popular indices first
 */
const selectSymbol = async (service, account) => {
  const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();
  
  const contractsResult = await service.getContracts();
  if (!contractsResult.success || !contractsResult.contracts?.length) {
    spinner.fail('Failed to load contracts');
    return null;
  }
  
  let contracts = contractsResult.contracts;
  
  // Sort: Popular indices first (ES, NQ, MES, MNQ, RTY, YM, etc.)
  const popularPrefixes = ['ES', 'NQ', 'MES', 'MNQ', 'M2K', 'RTY', 'YM', 'MYM', 'NKD', 'GC', 'SI', 'CL'];
  
  contracts.sort((a, b) => {
    const nameA = a.name || '';
    const nameB = b.name || '';
    
    // Check if names start with popular prefixes
    const idxA = popularPrefixes.findIndex(p => nameA.startsWith(p));
    const idxB = popularPrefixes.findIndex(p => nameB.startsWith(p));
    
    // Both are popular - sort by popularity order
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    // Only A is popular - A first
    if (idxA !== -1) return -1;
    // Only B is popular - B first
    if (idxB !== -1) return 1;
    // Neither - alphabetical
    return nameA.localeCompare(nameB);
  });
  
  spinner.succeed(`Found ${contracts.length} contracts`);
  
  // Display sorted contracts from API
  const options = contracts.map(c => ({
    label: `${c.name} - ${c.description}`,
    value: c
  }));
  
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
 * 100% API data - no simulation, no mock data, no local calculations
 */
const launchAlgo = async (service, account, contract, config) => {
  const { contracts, dailyTarget, maxRisk, showName } = config;
  
  // Use RAW API fields
  const accountName = showName 
    ? (account.accountName || account.rithmicAccountId || account.accountId) 
    : 'HQX *****';
  const symbolName = contract.name;
  const connectionType = account.platform || 'ProjectX';
  
  const ui = new AlgoUI({ subtitle: 'HQX Algo Trading', mode: 'one-account' });
  
  const stats = {
    accountName,
    symbol: symbolName,
    qty: contracts,
    target: dailyTarget,
    risk: maxRisk,
    propfirm: account.propfirm || 'Unknown',
    platform: connectionType,
    pnl: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    latency: 0,
    connected: true,
    startTime: Date.now()
  };
  
  let running = true;
  let stopReason = null;
  let lastPnL = 0;
  
  // Log startup info from API
  ui.addLog('info', `Connection: ${connectionType}`);
  ui.addLog('info', `Account: ${accountName}`);
  ui.addLog('info', `Symbol: ${symbolName} | Qty: ${contracts}`);
  ui.addLog('info', `Target: $${dailyTarget} | Max Risk: $${maxRisk}`);
  ui.addLog('info', 'Monitoring positions from API...');
  
  // Measure API latency (real network round-trip)
  const measureLatency = async () => {
    try {
      const start = Date.now();
      await service.getPositions(account.accountId);
      stats.latency = Date.now() - start;
    } catch (e) {
      stats.latency = 0;
    }
  };
  
  // Poll data from API - 100% real data
  const pollAPI = async () => {
    try {
      // Get positions from API
      const posResult = await service.getPositions(account.accountId);
      
      if (posResult.success && posResult.positions) {
        // Find position for selected contract
        const position = posResult.positions.find(p => {
          const posSymbol = p.contractId || p.symbol || '';
          return posSymbol.includes(contract.name) || posSymbol.includes(contract.id);
        });
        
        if (position) {
          // P&L directly from API - no calculation
          const apiPnL = position.profitAndLoss || 0;
          
          // Detect trade completion (P&L changed)
          if (lastPnL !== 0 && Math.abs(apiPnL - lastPnL) > 0.01) {
            const tradePnL = apiPnL - lastPnL;
            stats.trades++;
            
            if (tradePnL > 0) {
              stats.wins++;
              ui.addLog('trade', `+$${tradePnL.toFixed(2)} (from API)`);
            } else {
              stats.losses++;
              ui.addLog('loss', `-$${Math.abs(tradePnL).toFixed(2)} (from API)`);
            }
          }
          
          lastPnL = apiPnL;
          stats.pnl = apiPnL;
          
          // Log position info from API
          if (position.quantity && position.quantity !== 0) {
            const side = position.quantity > 0 ? 'LONG' : 'SHORT';
            const qty = Math.abs(position.quantity);
            ui.addLog('info', `Position: ${side} ${qty}x | P&L: $${apiPnL.toFixed(2)}`);
          }
        } else {
          // No position - flat
          if (stats.pnl !== 0) {
            ui.addLog('info', 'Position closed - Flat');
          }
        }
      }
      
      // Get account balance from API
      const accountResult = await service.getTradingAccounts();
      if (accountResult.success && accountResult.accounts) {
        const acc = accountResult.accounts.find(a => a.accountId === account.accountId);
        if (acc && acc.profitAndLoss !== undefined) {
          stats.pnl = acc.profitAndLoss;
        }
      }
      
      // Check target/risk limits (using API P&L)
      if (stats.pnl >= dailyTarget) {
        stopReason = 'target';
        running = false;
        ui.addLog('success', `TARGET REACHED! +$${stats.pnl.toFixed(2)}`);
      } else if (stats.pnl <= -maxRisk) {
        stopReason = 'risk';
        running = false;
        ui.addLog('error', `MAX RISK! -$${Math.abs(stats.pnl).toFixed(2)}`);
      }
      
    } catch (e) {
      ui.addLog('error', `API Error: ${e.message}`);
    }
  };
  
  const refreshInterval = setInterval(() => { if (running) ui.render(stats); }, 250);
  
  // Measure API latency every 5 seconds
  measureLatency(); // Initial measurement
  const latencyInterval = setInterval(() => { if (running) measureLatency(); }, 5000);
  
  // Poll data from API every 2 seconds
  pollAPI(); // Initial poll
  const apiInterval = setInterval(() => { if (running) pollAPI(); }, 2000);
  
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
  clearInterval(latencyInterval);
  clearInterval(apiInterval);
  if (cleanupKeys) cleanupKeys();
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
