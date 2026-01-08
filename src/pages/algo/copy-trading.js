/**
 * Copy Trading Mode - HQX Ultra Scalping
 * Same as One Account but copies trades to multiple followers
 */

const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');

const { connections } = require('../../services');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { prompts } = require('../../utils');
const { checkMarketHours } = require('../../services/rithmic/market');

// Strategy & Market Data
const { M1 } = require('../../lib/m/s1');
const { MarketDataFeed } = require('../../lib/data');

/**
 * Copy Trading Menu
 */
const copyTradingMenu = async () => {
  // Check if market is open
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
  
  if (activeAccounts.length < 2) {
    spinner.fail(`Need at least 2 active accounts (found: ${activeAccounts.length})`);
    console.log(chalk.gray('  Connect to another PropFirm first'));
    await prompts.waitForEnter();
    return;
  }
  
  spinner.succeed(`Found ${activeAccounts.length} active accounts`);
  
  // Step 1: Select LEAD Account
  console.log();
  console.log(chalk.cyan.bold('  STEP 1: SELECT LEAD ACCOUNT'));
  const leadOptions = activeAccounts.map(acc => {
    const name = acc.accountName || acc.rithmicAccountId || acc.accountId;
    const balance = acc.balance !== null && acc.balance !== undefined 
      ? ` - $${acc.balance.toLocaleString()}` 
      : '';
    return {
      label: `${name} (${acc.propfirm || acc.platform || 'Unknown'})${balance}`,
      value: acc
    };
  });
  leadOptions.push({ label: '< Back', value: 'back' });
  
  const leadAccount = await prompts.selectOption('Lead Account:', leadOptions);
  if (!leadAccount || leadAccount === 'back') return;
  
  // Step 2: Select FOLLOWER Account(s)
  console.log();
  console.log(chalk.yellow.bold('  STEP 2: SELECT FOLLOWER ACCOUNT(S)'));
  console.log(chalk.gray('  (Select accounts to copy trades to)'));
  
  const followers = [];
  const availableFollowers = activeAccounts.filter(a => a.accountId !== leadAccount.accountId);
  
  while (availableFollowers.length > 0) {
    const remaining = availableFollowers.filter(a => !followers.find(f => f.accountId === a.accountId));
    if (remaining.length === 0) break;
    
    const followerOptions = remaining.map(acc => {
      const name = acc.accountName || acc.rithmicAccountId || acc.accountId;
      const balance = acc.balance !== null && acc.balance !== undefined 
        ? ` - $${acc.balance.toLocaleString()}` 
        : '';
      return {
        label: `${name} (${acc.propfirm || acc.platform || 'Unknown'})${balance}`,
        value: acc
      };
    });
    
    if (followers.length > 0) {
      followerOptions.push({ label: chalk.green('✓ Done selecting followers'), value: 'done' });
    }
    followerOptions.push({ label: '< Back', value: 'back' });
    
    const msg = followers.length === 0 ? 'Select Follower:' : `Add another follower (${followers.length} selected):`;
    const selected = await prompts.selectOption(msg, followerOptions);
    
    if (!selected || selected === 'back') {
      if (followers.length === 0) return;
      break;
    }
    if (selected === 'done') break;
    
    followers.push(selected);
    console.log(chalk.green(`  ✓ Added: ${selected.accountName || selected.accountId}`));
  }
  
  if (followers.length === 0) {
    console.log(chalk.red('  No followers selected'));
    await prompts.waitForEnter();
    return;
  }
  
  // Step 3: Select Symbol
  console.log();
  console.log(chalk.magenta.bold('  STEP 3: SELECT SYMBOL'));
  const leadService = leadAccount.service || connections.getServiceForAccount(leadAccount.accountId);
  const contract = await selectSymbol(leadService);
  if (!contract) return;
  
  // Step 4: Configure Parameters
  console.log();
  console.log(chalk.cyan.bold('  STEP 4: CONFIGURE PARAMETERS'));
  console.log();
  
  const leadContracts = await prompts.numberInput('Lead contracts:', 1, 1, 10);
  if (leadContracts === null) return;
  
  const followerContracts = await prompts.numberInput('Follower contracts (each):', leadContracts, 1, 10);
  if (followerContracts === null) return;
  
  const dailyTarget = await prompts.numberInput('Daily target ($):', 400, 1, 10000);
  if (dailyTarget === null) return;
  
  const maxRisk = await prompts.numberInput('Max risk ($):', 200, 1, 5000);
  if (maxRisk === null) return;
  
  const showNames = await prompts.confirmPrompt('Show account names?', false);
  if (showNames === null) return;
  
  // Summary
  console.log();
  console.log(chalk.white.bold('  SUMMARY:'));
  console.log(chalk.cyan(`  Symbol: ${contract.name}`));
  console.log(chalk.cyan(`  Lead: ${leadAccount.propfirm} x${leadContracts}`));
  console.log(chalk.yellow(`  Followers (${followers.length}):`));
  for (const f of followers) {
    console.log(chalk.yellow(`    - ${f.propfirm} x${followerContracts}`));
  }
  console.log(chalk.cyan(`  Target: $${dailyTarget} | Risk: $${maxRisk}`));
  console.log();
  
  const confirm = await prompts.confirmPrompt('Start Copy Trading?', true);
  if (!confirm) return;
  
  await launchCopyTrading({
    lead: { account: leadAccount, contracts: leadContracts },
    followers: followers.map(f => ({ account: f, contracts: followerContracts })),
    contract,
    dailyTarget,
    maxRisk,
    showNames
  });
};

/**
 * Symbol selection - sorted with popular indices first
 */
const selectSymbol = async (service) => {
  const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();
  
  const contractsResult = await service.getContracts();
  if (!contractsResult.success || !contractsResult.contracts?.length) {
    spinner.fail('Failed to load contracts');
    return null;
  }
  
  let contracts = contractsResult.contracts;
  
  // Sort: Popular indices first
  const popularPrefixes = ['ES', 'NQ', 'MES', 'MNQ', 'M2K', 'RTY', 'YM', 'MYM', 'NKD', 'GC', 'SI', 'CL'];
  
  contracts.sort((a, b) => {
    const baseA = a.baseSymbol || a.symbol || '';
    const baseB = b.baseSymbol || b.symbol || '';
    const idxA = popularPrefixes.findIndex(p => baseA === p || baseA.startsWith(p));
    const idxB = popularPrefixes.findIndex(p => baseB === p || baseB.startsWith(p));
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return baseA.localeCompare(baseB);
  });
  
  spinner.succeed(`Found ${contracts.length} contracts`);
  
  const options = contracts.map(c => ({
    label: `${c.symbol} - ${c.name} (${c.exchange})`,
    value: c
  }));
  options.push({ label: chalk.gray('< Back'), value: 'back' });
  
  const selected = await prompts.selectOption(chalk.yellow('Select Symbol:'), options);
  return selected === 'back' || selected === null ? null : selected;
};

/**
 * Launch Copy Trading - HQX Ultra Scalping with trade copying
 */
const launchCopyTrading = async (config) => {
  const { lead, followers, contract, dailyTarget, maxRisk, showNames } = config;
  
  const leadAccount = lead.account;
  const leadService = leadAccount.service || connections.getServiceForAccount(leadAccount.accountId);
  const leadName = showNames 
    ? (leadAccount.accountName || leadAccount.rithmicAccountId || leadAccount.accountId) 
    : 'HQX Lead *****';
  const symbolName = contract.name;
  const contractId = contract.id;
  const tickSize = contract.tickSize || 0.25;
  
  const followerNames = followers.map((f, i) => 
    showNames ? (f.account.accountName || f.account.accountId) : `HQX Follower ${i + 1} *****`
  );
  
  const ui = new AlgoUI({ subtitle: 'HQX Copy Trading', mode: 'copy-trading' });
  
  const stats = {
    accountName: leadName,
    followerNames,
    symbol: symbolName,
    qty: lead.contracts,
    followerQty: followers[0]?.contracts || lead.contracts,
    target: dailyTarget,
    risk: maxRisk,
    propfirm: leadAccount.propfirm || 'Unknown',
    platform: leadAccount.platform || 'Rithmic',
    pnl: 0,
    followerPnl: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    latency: 0,
    connected: false,
    startTime: Date.now(),
    followersCount: followers.length
  };
  
  let running = true;
  let stopReason = null;
  let startingPnL = null;
  let currentPosition = 0;
  let pendingOrder = false;
  let tickCount = 0;
  
  // Initialize Strategy
  const strategy = new M1({ tickSize });
  strategy.initialize(contractId, tickSize);
  
  // Initialize Market Data Feed
  const marketFeed = new MarketDataFeed({ propfirm: leadAccount.propfirm });
  
  // Log startup
  ui.addLog('info', `Lead: ${leadName} | Followers: ${followers.length}`);
  ui.addLog('info', `Symbol: ${symbolName} | Lead Qty: ${lead.contracts} | Follower Qty: ${followers[0]?.contracts}`);
  ui.addLog('info', `Target: $${dailyTarget} | Max Risk: $${maxRisk}`);
  ui.addLog('info', 'Connecting to market data...');
  
  // Handle strategy signals - place on lead AND all followers
  strategy.on('signal', async (signal) => {
    if (!running || pendingOrder || currentPosition !== 0) return;
    
    const { direction, entry, stopLoss, takeProfit, confidence } = signal;
    
    ui.addLog('signal', `${direction.toUpperCase()} signal @ ${entry.toFixed(2)} (${(confidence * 100).toFixed(0)}%)`);
    
    pendingOrder = true;
    try {
      const orderSide = direction === 'long' ? 0 : 1;
      
      // Place order on LEAD
      const leadResult = await leadService.placeOrder({
        accountId: leadAccount.accountId,
        contractId: contractId,
        type: 2,
        side: orderSide,
        size: lead.contracts
      });
      
      if (leadResult.success) {
        currentPosition = direction === 'long' ? lead.contracts : -lead.contracts;
        stats.trades++;
        ui.addLog('trade', `LEAD: ${direction.toUpperCase()} ${lead.contracts}x @ market`);
        
        // Place orders on ALL FOLLOWERS
        for (let i = 0; i < followers.length; i++) {
          const f = followers[i];
          const fService = f.account.service || connections.getServiceForAccount(f.account.accountId);
          
          try {
            const fResult = await fService.placeOrder({
              accountId: f.account.accountId,
              contractId: contractId,
              type: 2,
              side: orderSide,
              size: f.contracts
            });
            
            if (fResult.success) {
              ui.addLog('trade', `FOLLOWER ${i + 1}: ${direction.toUpperCase()} ${f.contracts}x @ market`);
            } else {
              ui.addLog('error', `FOLLOWER ${i + 1}: Order failed`);
            }
          } catch (e) {
            ui.addLog('error', `FOLLOWER ${i + 1}: ${e.message}`);
          }
        }
        
        // Place bracket orders on lead (SL/TP)
        if (stopLoss && takeProfit) {
          await leadService.placeOrder({
            accountId: leadAccount.accountId, contractId, type: 4,
            side: direction === 'long' ? 1 : 0, size: lead.contracts, stopPrice: stopLoss
          });
          await leadService.placeOrder({
            accountId: leadAccount.accountId, contractId, type: 1,
            side: direction === 'long' ? 1 : 0, size: lead.contracts, limitPrice: takeProfit
          });
          ui.addLog('info', `SL: ${stopLoss.toFixed(2)} | TP: ${takeProfit.toFixed(2)}`);
        }
      } else {
        ui.addLog('error', `Lead order failed: ${leadResult.error}`);
      }
    } catch (e) {
      ui.addLog('error', `Order error: ${e.message}`);
    }
    pendingOrder = false;
  });
  
  // Handle market data ticks
  marketFeed.on('tick', (tick) => {
    tickCount++;
    const latencyStart = Date.now();
    
    strategy.processTick({
      contractId: tick.contractId || contractId,
      price: tick.price,
      bid: tick.bid,
      ask: tick.ask,
      volume: tick.volume || 1,
      side: tick.lastTradeSide || 'unknown',
      timestamp: tick.timestamp || Date.now()
    });
    
    stats.latency = Date.now() - latencyStart;
    
    if (tickCount % 100 === 0) {
      ui.addLog('info', `Tick #${tickCount} @ ${tick.price?.toFixed(2) || 'N/A'}`);
    }
  });
  
  marketFeed.on('connected', () => {
    stats.connected = true;
    ui.addLog('success', 'Market data connected!');
  });
  
  marketFeed.on('error', (err) => ui.addLog('error', `Market: ${err.message}`));
  marketFeed.on('disconnected', () => { stats.connected = false; ui.addLog('error', 'Market data disconnected'); });
  
  // Connect to market data
  try {
    const token = leadService.token || leadService.getToken?.();
    const propfirmKey = (leadAccount.propfirm || 'topstep').toLowerCase().replace(/\s+/g, '_');
    await marketFeed.connect(token, propfirmKey, contractId);
    await marketFeed.subscribe(symbolName, contractId);
  } catch (e) {
    ui.addLog('error', `Failed to connect: ${e.message}`);
  }
  
  // Poll P&L from lead and followers
  const pollPnL = async () => {
    try {
      // Lead P&L
      const leadResult = await leadService.getTradingAccounts();
      if (leadResult.success && leadResult.accounts) {
        const acc = leadResult.accounts.find(a => a.accountId === leadAccount.accountId);
        if (acc && acc.profitAndLoss !== undefined) {
          if (startingPnL === null) startingPnL = acc.profitAndLoss;
          stats.pnl = acc.profitAndLoss - startingPnL;
        }
      }
      
      // Check target/risk
      if (stats.pnl >= dailyTarget) {
        stopReason = 'target';
        running = false;
        ui.addLog('success', `TARGET REACHED! +$${stats.pnl.toFixed(2)}`);
      } else if (stats.pnl <= -maxRisk) {
        stopReason = 'risk';
        running = false;
        ui.addLog('error', `MAX RISK! -$${Math.abs(stats.pnl).toFixed(2)}`);
      }
    } catch (e) { /* silent */ }
  };
  
  // Start intervals
  const refreshInterval = setInterval(() => { if (running) ui.render(stats); }, 250);
  const pnlInterval = setInterval(() => { if (running) pollPnL(); }, 2000);
  pollPnL();
  
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
      if (!running) { clearInterval(check); resolve(); }
    }, 100);
  });
  
  // Cleanup
  clearInterval(refreshInterval);
  clearInterval(pnlInterval);
  await marketFeed.disconnect();
  if (cleanupKeys) cleanupKeys();
  ui.cleanup();
  
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.resume();
  
  // Duration
  const durationMs = Date.now() - stats.startTime;
  const hours = Math.floor(durationMs / 3600000);
  const minutes = Math.floor((durationMs % 3600000) / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  stats.duration = hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  
  renderSessionSummary(stats, stopReason);
  
  console.log('\n  Returning to menu in 3 seconds...');
  await new Promise(resolve => setTimeout(resolve, 3000));
};

module.exports = { copyTradingMenu };
