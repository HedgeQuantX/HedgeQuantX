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
 * Symbol selection - RAW API data only
 */
const selectSymbol = async (service, account) => {
  const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();
  
  const contractsResult = await service.getContracts();
  if (!contractsResult.success || !contractsResult.contracts?.length) {
    spinner.fail('Failed to load contracts');
    return null;
  }
  
  const contracts = contractsResult.contracts;
  spinner.succeed(`Found ${contracts.length} contracts`);
  
  // Display EXACTLY what API returns - no modifications
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
    platform: account.platform || 'ProjectX',
    pnl: 0, trades: 0, wins: 0, losses: 0,
    latency: 0, connected: false,
    startTime: Date.now()  // Track start time for duration
  };
  
  // Measure API latency (CLI <-> API)
  const measureLatency = async () => {
    try {
      const start = Date.now();
      await service.getPositions(account.accountId);
      stats.latency = Date.now() - start;
    } catch (e) {
      stats.latency = 0;
    }
  };
  
  let running = true;
  let stopReason = null;
  
  // Local algo - no external server needed
  ui.addLog('info', `Starting algo on ${stats.platform}...`);
  ui.addLog('info', `Symbol: ${symbolName} | Qty: ${contracts}`);
  ui.addLog('info', `Target: $${dailyTarget} | Risk: $${maxRisk}`);
  stats.connected = true;
  
  // Poll P&L from API every 2 seconds
  const pollPnL = async () => {
    try {
      // Get positions to check P&L
      const posResult = await service.getPositions(account.accountId);
      if (posResult.success && posResult.positions) {
        // Find position for our symbol
        const pos = posResult.positions.find(p => 
          (p.contractId || p.symbol || '').includes(contract.name || contract.symbol)
        );
        if (pos && pos.profitAndLoss !== undefined) {
          const prevPnL = stats.pnl;
          stats.pnl = pos.profitAndLoss;
          
          // Detect trade completion
          if (Math.abs(stats.pnl - prevPnL) > 0.01 && prevPnL !== 0) {
            const tradePnL = stats.pnl - prevPnL;
            stats.trades++;
            if (tradePnL >= 0) {
              stats.wins++;
              ui.addLog('trade', `Trade closed: +$${tradePnL.toFixed(2)}`);
            } else {
              stats.losses++;
              ui.addLog('loss', `Trade closed: -$${Math.abs(tradePnL).toFixed(2)}`);
            }
          }
        }
      }
      
      // Check target/risk limits
      if (stats.pnl >= dailyTarget) {
        stopReason = 'target';
        running = false;
        ui.addLog('success', `TARGET REACHED! +$${stats.pnl.toFixed(2)}`);
      } else if (stats.pnl <= -maxRisk) {
        stopReason = 'risk';
        running = false;
        ui.addLog('error', `MAX RISK HIT! -$${Math.abs(stats.pnl).toFixed(2)}`);
      }
    } catch (e) {
      // Silent fail - will retry
    }
  };
  
  const refreshInterval = setInterval(() => { if (running) ui.render(stats); }, 250);
  
  // Measure API latency every 5 seconds
  measureLatency(); // Initial measurement
  const latencyInterval = setInterval(() => { if (running) measureLatency(); }, 5000);
  
  // Poll P&L from API every 2 seconds
  pollPnL(); // Initial poll
  const pnlInterval = setInterval(() => { if (running) pollPnL(); }, 2000);
  
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
  clearInterval(pnlInterval);
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
