/**
 * Algo Trading Page
 */

const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const readline = require('readline');

const { connections } = require('../services');
const { HQXServerService } = require('../services/hqx-server');
const { FUTURES_SYMBOLS } = require('../config');
const { getDevice, getSeparator } = require('../ui');

/**
 * Algo Trading Menu
 */
const algoTradingMenu = async (service) => {
  const device = getDevice();
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.magenta.bold('  Algo-Trading'));
  console.log(chalk.gray(getSeparator()));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.white.bold('Select Mode:'),
      choices: [
        { name: chalk.cyan('One Account'), value: 'one_account' },
        { name: chalk.green('Copy Trading'), value: 'copy_trading' },
        new inquirer.Separator(),
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      pageSize: 10,
      loop: false
    }
  ]);

  switch (action) {
    case 'one_account':
      await oneAccountMenu(service);
      break;
    case 'copy_trading':
      await copyTradingMenu();
      break;
    case 'back':
      return 'back';
  }
  
  return action;
};

/**
 * One Account Menu - Select active account
 */
const oneAccountMenu = async (service) => {
  const spinner = ora('Fetching active accounts...').start();
  
  const result = await service.getTradingAccounts();
  
  if (!result.success || !result.accounts || result.accounts.length === 0) {
    spinner.fail('No accounts found');
    console.log(chalk.yellow('  You need at least one trading account.'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }
  
  // Filter only active accounts (status === 0)
  const activeAccounts = result.accounts.filter(acc => acc.status === 0);
  
  if (activeAccounts.length === 0) {
    spinner.fail('No active accounts found');
    console.log(chalk.yellow('  You need at least one active trading account (status: Active).'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }
  
  spinner.succeed(`Found ${activeAccounts.length} active account(s)`);
  console.log();
  
  const accountChoices = activeAccounts.map(account => ({
    name: chalk.cyan(`${account.accountName || account.name || 'Account #' + account.accountId} - Balance: $${account.balance.toLocaleString()}`),
    value: account
  }));
  
  accountChoices.push(new inquirer.Separator());
  accountChoices.push({ name: chalk.yellow('< Back'), value: 'back' });
  
  const { selectedAccount } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedAccount',
      message: chalk.white.bold('Select Account:'),
      choices: accountChoices,
      pageSize: 15,
      loop: false
    }
  ]);
  
  if (selectedAccount === 'back') {
    return;
  }
  
  // Check market status
  console.log();
  const marketSpinner = ora('Checking market status...').start();
  
  const marketHours = service.checkMarketHours();
  const marketStatus = await service.getMarketStatus(selectedAccount.accountId);
  
  if (!marketHours.isOpen) {
    marketSpinner.fail('Market is CLOSED');
    console.log();
    console.log(chalk.red.bold('  [X] ' + marketHours.message));
    console.log();
    console.log(chalk.gray('  Futures markets (CME) trading hours:'));
    console.log(chalk.gray('  Sunday 5:00 PM CT - Friday 4:00 PM CT'));
    console.log(chalk.gray('  Daily maintenance: 4:00 PM - 5:00 PM CT'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }
  
  if (marketStatus.success && !marketStatus.isOpen) {
    marketSpinner.fail('Cannot trade on this account');
    console.log();
    console.log(chalk.red.bold('  [X] ' + marketStatus.message));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }
  
  marketSpinner.succeed('Market is OPEN - Ready to trade!');
  
  await selectSymbolMenu(service, selectedAccount);
};

/**
 * Symbol Selection Menu
 */
const selectSymbolMenu = async (service, account) => {
  const device = getDevice();
  const accountName = account.accountName || account.name || 'Account #' + account.accountId;
  
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.cyan.bold(`  Account: ${accountName}`));
  console.log(chalk.gray(getSeparator()));
  console.log();
  
  const symbolChoices = FUTURES_SYMBOLS.map(symbol => ({
    name: chalk.cyan(device.isMobile ? symbol.value : symbol.name),
    value: symbol
  }));
  
  symbolChoices.push(new inquirer.Separator());
  symbolChoices.push({ name: chalk.yellow('< Back'), value: 'back' });
  
  const { selectedSymbol } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedSymbol',
      message: chalk.white.bold('Select Symbol:'),
      choices: symbolChoices,
      pageSize: 15,
      loop: false
    }
  ]);
  
  if (selectedSymbol === 'back') {
    return;
  }
  
  // Search contract via Gateway API
  const spinner = ora(`Searching for ${selectedSymbol.value} contract...`).start();
  const contractResult = await service.searchContracts(selectedSymbol.searchText, false);
  
  let contract = null;
  if (contractResult.success && contractResult.contracts && contractResult.contracts.length > 0) {
    contract = contractResult.contracts.find(c => c.activeContract) || contractResult.contracts[0];
    spinner.succeed(`Found: ${contract.name || selectedSymbol.value}`);
    if (contract.tickSize && contract.tickValue) {
      console.log(chalk.gray(`  Tick Size: ${contract.tickSize} | Tick Value: $${contract.tickValue}`));
    }
  } else {
    spinner.warn(`Using ${selectedSymbol.value} (contract details unavailable)`);
    contract = {
      id: selectedSymbol.value,
      name: selectedSymbol.name,
      symbol: selectedSymbol.value
    };
  }
  
  console.log();
  
  // Number of contracts
  const { contracts } = await inquirer.prompt([
    {
      type: 'input',
      name: 'contracts',
      message: chalk.white.bold('Number of Contracts:'),
      default: '1',
      validate: (input) => {
        const num = parseInt(input);
        if (isNaN(num) || num <= 0 || num > 100) {
          return 'Please enter a valid number between 1 and 100';
        }
        return true;
      },
      filter: (input) => parseInt(input)
    }
  ]);

  // Risk Management
  console.log();
  console.log(chalk.cyan.bold('  Risk Management'));
  console.log(chalk.gray('  Set your daily target and maximum risk to auto-stop the algo.'));
  console.log();

  const { dailyTarget } = await inquirer.prompt([
    {
      type: 'input',
      name: 'dailyTarget',
      message: chalk.white.bold('Daily Target ($):'),
      default: '500',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) {
          return 'Please enter a valid amount greater than 0';
        }
        return true;
      },
      filter: (input) => parseFloat(input)
    }
  ]);

  const { maxRisk } = await inquirer.prompt([
    {
      type: 'input',
      name: 'maxRisk',
      message: chalk.white.bold('Max Risk ($):'),
      default: '200',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) {
          return 'Please enter a valid amount greater than 0';
        }
        return true;
      },
      filter: (input) => parseFloat(input)
    }
  ]);
  
  // Confirmation
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white.bold('  Algo Configuration:'));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Account:      ${chalk.cyan(accountName)}`));
  console.log(chalk.white(`  Symbol:       ${chalk.cyan(contract.name || selectedSymbol.value)}`));
  console.log(chalk.white(`  Contracts:    ${chalk.cyan(contracts)}`));
  console.log(chalk.white(`  Daily Target: ${chalk.green('$' + dailyTarget.toFixed(2))}`));
  console.log(chalk.white(`  Max Risk:     ${chalk.red('$' + maxRisk.toFixed(2))}`));
  console.log(chalk.gray(getSeparator()));
  console.log();
  
  const { launch } = await inquirer.prompt([
    {
      type: 'list',
      name: 'launch',
      message: chalk.white.bold('Ready to launch?'),
      choices: [
        { name: chalk.green.bold('[>] Launch Algo'), value: 'launch' },
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      loop: false
    }
  ]);
  
  if (launch === 'back') {
    return;
  }
  
  await launchAlgo(service, account, contract, contracts, dailyTarget, maxRisk);
};

/**
 * Launch Algo with HQX Server Connection
 */
const launchAlgo = async (service, account, contract, numContracts, dailyTarget, maxRisk) => {
  const accountName = account.accountName || account.name || 'Account #' + account.accountId;
  const symbolName = contract.name || contract.symbol || contract.id;
  const symbol = contract.symbol || contract.id;
  
  console.log();
  console.log(chalk.green.bold('  [>] Launching HQX Algo...'));
  console.log();
  
  // Initialize HQX Server connection
  const hqxServer = new HQXServerService();
  let hqxConnected = false;
  let algoRunning = false;
  let stopReason = null;
  
  // Activity logs
  const logs = [];
  const MAX_LOGS = 10;
  
  // Stats
  let stats = {
    trades: 0,
    wins: 0,
    losses: 0,
    pnl: 0,
    signals: 0,
    winRate: '0.0'
  };
  
  const addLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    logs.push({ timestamp, type, message });
    if (logs.length > MAX_LOGS) logs.shift();
  };
  
  const clearScreen = () => {
    console.clear();
  };
  
  // Check market hours
  const checkMarketStatus = () => {
    const now = new Date();
    const utcDay = now.getUTCDay();
    const utcHour = now.getUTCHours();
    const isDST = (() => {
      const jan = new Date(now.getFullYear(), 0, 1);
      const jul = new Date(now.getFullYear(), 6, 1);
      return now.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
    })();
    const ctOffset = isDST ? 5 : 6;
    const ctHour = (utcHour - ctOffset + 24) % 24;
    const ctDay = utcHour < ctOffset ? (utcDay + 6) % 7 : utcDay;

    if (ctDay === 6) return { isOpen: false, message: 'Market closed (Saturday)' };
    if (ctDay === 0 && ctHour < 17) return { isOpen: false, message: 'Market opens Sunday 5:00 PM CT' };
    if (ctDay === 5 && ctHour >= 16) return { isOpen: false, message: 'Market closed (Friday after 4PM CT)' };
    if (ctHour === 16 && ctDay >= 1 && ctDay <= 4) return { isOpen: false, message: 'Daily maintenance (4:00-5:00 PM CT)' };
    return { isOpen: true, message: 'Market OPEN' };
  };

  const displayUI = () => {
    clearScreen();
    const marketStatus = checkMarketStatus();
    console.log();
    console.log(chalk.gray(getSeparator()));
    console.log(chalk.cyan.bold('  HQX Ultra-Scalping Algo'));
    console.log(chalk.gray(getSeparator()));
    console.log(chalk.white(`  Status:    ${algoRunning ? chalk.green('RUNNING') : chalk.yellow('CONNECTING...')}`));
    console.log(chalk.white(`  Account:   ${chalk.cyan(accountName)}`));
    console.log(chalk.white(`  Symbol:    ${chalk.cyan(symbolName)}`));
    console.log(chalk.white(`  Contracts: ${chalk.cyan(numContracts)}`));
    console.log(chalk.white(`  Server:    ${hqxConnected ? chalk.green('CONNECTED') : chalk.red('DISCONNECTED')}`));
    console.log(chalk.white(`  Market:    ${marketStatus.isOpen ? chalk.green(marketStatus.message) : chalk.red(marketStatus.message)}`));
    console.log(chalk.gray(getSeparator()));

    // Risk Management
    console.log();
    const targetProgress = Math.min(100, Math.max(0, (stats.pnl / dailyTarget) * 100));
    const riskProgress = Math.min(100, (Math.abs(Math.min(0, stats.pnl)) / maxRisk) * 100);
    console.log(chalk.white('  Target:  ') + chalk.green('$' + dailyTarget.toFixed(2)) + 
      chalk.gray(' | Progress: ') + (targetProgress >= 100 ? chalk.green.bold(targetProgress.toFixed(1) + '%') : chalk.yellow(targetProgress.toFixed(1) + '%')));
    console.log(chalk.white('  Risk:    ') + chalk.red('$' + maxRisk.toFixed(2)) + 
      chalk.gray(' | Used: ') + (riskProgress >= 100 ? chalk.red.bold(riskProgress.toFixed(1) + '%') : chalk.cyan(riskProgress.toFixed(1) + '%')));
    
    // Stats bar
    console.log();
    console.log(chalk.white('  Stats: ') + 
      chalk.gray('Trades: ') + chalk.cyan(stats.trades) + 
      chalk.gray(' | Wins: ') + chalk.green(stats.wins) + 
      chalk.gray(' | Losses: ') + chalk.red(stats.losses) + 
      chalk.gray(' | Win Rate: ') + chalk.yellow(stats.winRate + '%') +
      chalk.gray(' | P&L: ') + (stats.pnl >= 0 ? chalk.green('+$' + stats.pnl.toFixed(2)) : chalk.red('-$' + Math.abs(stats.pnl).toFixed(2)))
    );
    console.log();
    
    // Activity logs
    console.log(chalk.gray(getSeparator()));
    console.log(chalk.white.bold('  Activity Log'));
    console.log(chalk.gray(getSeparator()));
    
    const typeColors = {
      info: chalk.cyan,
      success: chalk.green,
      signal: chalk.yellow.bold,
      trade: chalk.green.bold,
      error: chalk.red,
      warning: chalk.yellow
    };
    
    if (logs.length === 0) {
      console.log(chalk.gray('  Waiting for activity...'));
    } else {
      logs.forEach(log => {
        const color = typeColors[log.type] || chalk.white;
        const icon = log.type === 'signal' ? '[*]' : 
                     log.type === 'trade' ? '[>]' : 
                     log.type === 'error' ? '[X]' : 
                     log.type === 'success' ? '[OK]' : '[.]';
        console.log(chalk.gray(`  [${log.timestamp}]`) + ' ' + color(`${icon} ${log.message}`));
      });
    }
    
    console.log(chalk.gray(getSeparator()));
    console.log();
    console.log(chalk.yellow('  Press X to stop algo...'));
    console.log();
  };
  
  // Connect to HQX Server
  const spinner = ora('Authenticating with HQX Server...').start();
  
  try {
    // Authenticate
    const authResult = await hqxServer.authenticate(account.accountId.toString(), account.propfirm || 'projectx');
    
    if (!authResult.success) {
      spinner.fail('Authentication failed: ' + (authResult.error || 'Unknown error'));
      addLog('error', 'Authentication failed');
      
      // Fallback to offline mode
      console.log(chalk.yellow('  Running in offline demo mode...'));
      console.log();
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      return;
    }
    
    spinner.text = 'Connecting to WebSocket...';
    
    // Connect WebSocket
    const connectResult = await hqxServer.connect();
    
    if (connectResult.success) {
      spinner.succeed('Connected to HQX Server');
      hqxConnected = true;
    } else {
      throw new Error('WebSocket connection failed');
    }
    
  } catch (error) {
    spinner.warn('HQX Server unavailable - Running in offline mode');
    hqxConnected = false;
  }
  
  // Setup event handlers
  hqxServer.on('log', (data) => {
    addLog(data.type || 'info', data.message);
    displayUI();
  });
  
  hqxServer.on('signal', (data) => {
    stats.signals++;
    const side = data.side === 'long' ? 'BUY' : 'SELL';
    addLog('signal', `${side} Signal @ ${data.entry?.toFixed(2) || 'N/A'} | SL: ${data.stop?.toFixed(2) || 'N/A'} | TP: ${data.target?.toFixed(2) || 'N/A'}`);
    displayUI();
    
    // Execute order via PropFirm API if connected
    if (hqxConnected && service) {
      executeSignal(service, account, contract, numContracts, data);
    }
  });
  
  hqxServer.on('trade', (data) => {
    stats.trades++;
    stats.pnl += data.pnl || 0;
    if (data.pnl > 0) {
      stats.wins++;
      addLog('trade', `Closed +$${data.pnl.toFixed(2)} (${data.reason || 'take_profit'})`);
    } else {
      stats.losses++;
      addLog('trade', `Closed -$${Math.abs(data.pnl).toFixed(2)} (${data.reason || 'stop_loss'})`);
    }
    stats.winRate = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(1) : '0.0';
    
    // Check daily target
    if (stats.pnl >= dailyTarget) {
      stopReason = 'target';
      addLog('success', `Daily target reached! +$${stats.pnl.toFixed(2)}`);
      algoRunning = false;
      if (hqxConnected) {
        hqxServer.stopAlgo();
      }
    }
    
    // Check max risk
    if (stats.pnl <= -maxRisk) {
      stopReason = 'risk';
      addLog('error', `Max risk reached! -$${Math.abs(stats.pnl).toFixed(2)}`);
      algoRunning = false;
      if (hqxConnected) {
        hqxServer.stopAlgo();
      }
    }
    
    displayUI();
  });
  
  hqxServer.on('stats', (data) => {
    stats = { ...stats, ...data };
    displayUI();
  });
  
  hqxServer.on('error', (data) => {
    addLog('error', data.message || 'Unknown error');
    displayUI();
  });
  
  hqxServer.on('disconnected', () => {
    hqxConnected = false;
    addLog('warning', 'Disconnected from HQX Server');
    displayUI();
  });
  
  // Start algo
  if (hqxConnected) {
    addLog('info', 'Starting HQX Ultra-Scalping...');
    addLog('info', `Target: $${dailyTarget.toFixed(2)} | Risk: $${maxRisk.toFixed(2)}`);
    hqxServer.startAlgo({
      accountId: account.accountId,
      contractId: contract.id || contract.contractId,
      symbol: symbol,
      contracts: numContracts,
      dailyTarget: dailyTarget,
      maxRisk: maxRisk,
      propfirm: account.propfirm || 'projectx',
      propfirmToken: service.getToken ? service.getToken() : null
    });
    algoRunning = true;
  } else {
    addLog('warning', 'Running in offline demo mode');
    addLog('info', 'No real trades will be executed');
    algoRunning = true;
  }
  
  displayUI();
  
  // Wait for X key OR auto-stop (target/risk reached)
  await new Promise((resolve) => {
    // Check for auto-stop every 500ms
    const checkInterval = setInterval(() => {
      if (!algoRunning || stopReason) {
        clearInterval(checkInterval);
        if (process.stdin.isTTY && process.stdin.isRaw) {
          process.stdin.setRawMode(false);
        }
        resolve();
      }
    }, 500);

    // Also listen for X key
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      
      const onKeypress = (str, key) => {
        if (key && (key.name === 'x' || key.name === 'X' || (key.ctrl && key.name === 'c'))) {
          clearInterval(checkInterval);
          process.stdin.setRawMode(false);
          process.stdin.removeListener('keypress', onKeypress);
          resolve();
        }
      };
      
      process.stdin.on('keypress', onKeypress);
    }
  });
  
  // Stop algo
  if (!stopReason) {
    addLog('warning', 'Stopping algo...');
  }
  
  // Cancel all pending orders and close positions
  addLog('info', 'Cancelling pending orders...');
  displayUI();
  
  try {
    // Cancel all orders
    const cancelResult = await service.cancelAllOrders(account.accountId);
    if (cancelResult.success) {
      addLog('success', 'All pending orders cancelled');
    } else {
      addLog('warning', 'No pending orders to cancel');
    }
  } catch (e) {
    addLog('warning', 'Could not cancel orders: ' + e.message);
  }
  
  displayUI();
  
  // Close all positions for this symbol
  addLog('info', 'Closing open positions...');
  displayUI();
  
  try {
    const positions = await service.getPositions(account.accountId);
    if (positions.success && positions.positions) {
      const symbolPos = positions.positions.find(p => 
        p.symbol === symbol || 
        p.contractId === (contract.id || contract.contractId)
      );
      
      if (symbolPos && symbolPos.quantity !== 0) {
        const closeResult = await service.closePosition(account.accountId, symbolPos.contractId || symbolPos.symbol);
        if (closeResult.success) {
          addLog('success', `Position closed: ${Math.abs(symbolPos.quantity)} ${symbol}`);
        } else {
          addLog('error', 'Failed to close position: ' + (closeResult.error || 'Unknown'));
        }
      } else {
        addLog('info', 'No open position to close');
      }
    }
  } catch (e) {
    addLog('warning', 'Could not close positions: ' + e.message);
  }
  
  displayUI();
  
  if (hqxConnected && algoRunning) {
    hqxServer.stopAlgo();
  }
  
  hqxServer.disconnect();
  algoRunning = false;
  
  console.log();
  if (stopReason === 'target') {
    console.log(chalk.green.bold('  [OK] Daily target reached! Algo stopped.'));
  } else if (stopReason === 'risk') {
    console.log(chalk.red.bold('  [X] Max risk reached! Algo stopped.'));
  } else {
    console.log(chalk.yellow('  [OK] Algo stopped by user'));
  }
  console.log();
  
  // Final stats
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white.bold('  Session Summary'));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Daily Target:  ${chalk.green('$' + dailyTarget.toFixed(2))}`));
  console.log(chalk.white(`  Max Risk:      ${chalk.red('$' + maxRisk.toFixed(2))}`));
  console.log(chalk.white(`  Final P&L:     ${stats.pnl >= 0 ? chalk.green('+$' + stats.pnl.toFixed(2)) : chalk.red('-$' + Math.abs(stats.pnl).toFixed(2))}`));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Total Trades:  ${chalk.cyan(stats.trades)}`));
  console.log(chalk.white(`  Wins:          ${chalk.green(stats.wins)}`));
  console.log(chalk.white(`  Losses:        ${chalk.red(stats.losses)}`));
  console.log(chalk.white(`  Win Rate:      ${chalk.yellow(stats.winRate + '%')}`));
  console.log(chalk.gray(getSeparator()));
  console.log();
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

/**
 * Execute signal via PropFirm API
 */
const executeSignal = async (service, account, contract, numContracts, signal) => {
  try {
    const orderData = {
      accountId: account.accountId,
      contractId: contract.id || contract.contractId,
      type: 2,  // Market order
      side: signal.side === 'long' ? 0 : 1,  // 0=Buy, 1=Sell
      size: numContracts
    };
    
    // Place order via ProjectX Gateway API
    const result = await service.placeOrder(orderData);
    
    if (result.success) {
      console.log(chalk.green(`  [OK] Order executed: ${signal.side.toUpperCase()} ${numContracts} contracts`));
    } else {
      console.log(chalk.red(`  [X] Order failed: ${result.error || 'Unknown error'}`));
    }
  } catch (error) {
    console.log(chalk.red(`  [X] Order error: ${error.message}`));
  }
};

/**
 * Copy Trading Menu
 */
const copyTradingMenu = async () => {
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.green.bold('  Copy Trading Setup'));
  console.log(chalk.gray(getSeparator()));
  console.log();

  // Check market status first
  const marketSpinner = ora('Checking market status...').start();
  
  // Use a simple market hours check
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const isDST = (() => {
    const jan = new Date(now.getFullYear(), 0, 1);
    const jul = new Date(now.getFullYear(), 6, 1);
    return now.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  })();
  const ctOffset = isDST ? 5 : 6;
  const ctHour = (utcHour - ctOffset + 24) % 24;
  const ctDay = utcHour < ctOffset ? (utcDay + 6) % 7 : utcDay;

  let marketClosed = false;
  let marketMessage = '';

  if (ctDay === 6) {
    marketClosed = true;
    marketMessage = 'Market closed (Saturday)';
  } else if (ctDay === 0 && ctHour < 17) {
    marketClosed = true;
    marketMessage = 'Market opens Sunday 5:00 PM CT';
  } else if (ctDay === 5 && ctHour >= 16) {
    marketClosed = true;
    marketMessage = 'Market closed (Friday after 4PM CT)';
  } else if (ctHour === 16 && ctDay >= 1 && ctDay <= 4) {
    marketClosed = true;
    marketMessage = 'Daily maintenance (4:00-5:00 PM CT)';
  }

  if (marketClosed) {
    marketSpinner.fail('Market is CLOSED');
    console.log();
    console.log(chalk.red.bold('  [X] ' + marketMessage));
    console.log();
    console.log(chalk.gray('  Futures markets (CME) trading hours:'));
    console.log(chalk.gray('  Sunday 5:00 PM CT - Friday 4:00 PM CT'));
    console.log(chalk.gray('  Daily maintenance: 4:00 PM - 5:00 PM CT'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  marketSpinner.succeed('Market is OPEN - Ready to trade!');
  console.log();

  // Get all active accounts from all connections
  const allAccounts = await connections.getAllAccounts();
  const activeAccounts = allAccounts.filter(acc => acc.status === 0);

  if (activeAccounts.length < 2) {
    console.log(chalk.red('  [X] You need at least 2 active accounts for copy trading.'));
    console.log(chalk.gray('      Connect more prop firm accounts first.'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  // Step 1: Risk Management Settings
  console.log(chalk.cyan.bold('  Step 1: Risk Management'));
  console.log(chalk.gray('  Set your daily target and maximum risk to auto-stop copy trading.'));
  console.log();

  const { dailyTarget } = await inquirer.prompt([
    {
      type: 'input',
      name: 'dailyTarget',
      message: chalk.white.bold('Daily Target ($):'),
      default: '500',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) {
          return 'Please enter a valid amount greater than 0';
        }
        return true;
      },
      filter: (input) => parseFloat(input)
    }
  ]);

  const { maxRisk } = await inquirer.prompt([
    {
      type: 'input',
      name: 'maxRisk',
      message: chalk.white.bold('Max Risk ($):'),
      default: '200',
      validate: (input) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) {
          return 'Please enter a valid amount greater than 0';
        }
        return true;
      },
      filter: (input) => parseFloat(input)
    }
  ]);

  console.log();
  console.log(chalk.gray('  Daily Target: ') + chalk.green('$' + dailyTarget.toFixed(2)));
  console.log(chalk.gray('  Max Risk:     ') + chalk.red('$' + maxRisk.toFixed(2)));
  console.log();

  // Step 2: Select Lead Account
  console.log(chalk.cyan.bold('  Step 2: Select Lead Account'));
  console.log(chalk.gray('  The lead account is the master account whose trades will be copied.'));
  console.log();

  const leadChoices = activeAccounts.map(acc => ({
    name: chalk.cyan(`${acc.accountName || acc.name} - ${acc.propfirm} - $${acc.balance.toLocaleString()}`),
    value: acc
  }));
  leadChoices.push(new inquirer.Separator());
  leadChoices.push({ name: chalk.yellow('< Back'), value: 'back' });

  const { leadAccount } = await inquirer.prompt([
    {
      type: 'list',
      name: 'leadAccount',
      message: chalk.white.bold('Lead Account:'),
      choices: leadChoices,
      pageSize: 15,
      loop: false
    }
  ]);

  if (leadAccount === 'back') return;

  // Step 3: Select Follower Account
  console.log();
  console.log(chalk.cyan.bold('  Step 3: Select Follower Account'));
  console.log(chalk.gray('  The follower account will copy trades from the lead account.'));
  console.log();

  const followerChoices = activeAccounts
    .filter(acc => acc.accountId !== leadAccount.accountId)
    .map(acc => ({
      name: chalk.cyan(`${acc.accountName || acc.name} - ${acc.propfirm} - $${acc.balance.toLocaleString()}`),
      value: acc
    }));
  followerChoices.push(new inquirer.Separator());
  followerChoices.push({ name: chalk.yellow('< Back'), value: 'back' });

  const { followerAccount } = await inquirer.prompt([
    {
      type: 'list',
      name: 'followerAccount',
      message: chalk.white.bold('Follower Account:'),
      choices: followerChoices,
      pageSize: 15,
      loop: false
    }
  ]);

  if (followerAccount === 'back') return;

  // Step 4: Select Lead Symbol
  console.log();
  console.log(chalk.cyan.bold('  Step 4: Configure Lead Symbol'));
  console.log();

  const { leadSymbol } = await inquirer.prompt([
    {
      type: 'list',
      name: 'leadSymbol',
      message: chalk.white.bold('Lead Symbol:'),
      choices: FUTURES_SYMBOLS.map(s => ({
        name: chalk.cyan(s.name),
        value: s
      })),
      pageSize: 15,
      loop: false
    }
  ]);

  const { leadContracts } = await inquirer.prompt([
    {
      type: 'input',
      name: 'leadContracts',
      message: chalk.white.bold('Lead Number of Contracts:'),
      default: '1',
      validate: (input) => {
        const num = parseInt(input);
        if (isNaN(num) || num <= 0 || num > 100) {
          return 'Please enter a valid number between 1 and 100';
        }
        return true;
      },
      filter: (input) => parseInt(input)
    }
  ]);

  // Step 5: Select Follower Symbol
  console.log();
  console.log(chalk.cyan.bold('  Step 5: Configure Follower Symbol'));
  console.log();

  const { followerSymbol } = await inquirer.prompt([
    {
      type: 'list',
      name: 'followerSymbol',
      message: chalk.white.bold('Follower Symbol:'),
      choices: FUTURES_SYMBOLS.map(s => ({
        name: chalk.cyan(s.name),
        value: s
      })),
      pageSize: 15,
      loop: false
    }
  ]);

  const { followerContracts } = await inquirer.prompt([
    {
      type: 'input',
      name: 'followerContracts',
      message: chalk.white.bold('Follower Number of Contracts:'),
      default: '1',
      validate: (input) => {
        const num = parseInt(input);
        if (isNaN(num) || num <= 0 || num > 100) {
          return 'Please enter a valid number between 1 and 100';
        }
        return true;
      },
      filter: (input) => parseInt(input)
    }
  ]);

  // Configuration Summary
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white.bold('  Copy Trading Configuration'));
  console.log(chalk.gray(getSeparator()));
  console.log();
  console.log(chalk.white('  RISK MANAGEMENT'));
  console.log(chalk.white(`    Daily Target: ${chalk.green('$' + dailyTarget.toFixed(2))}`));
  console.log(chalk.white(`    Max Risk:     ${chalk.red('$' + maxRisk.toFixed(2))}`));
  console.log();
  console.log(chalk.white('  LEAD ACCOUNT'));
  console.log(chalk.white(`    Account:   ${chalk.cyan(leadAccount.accountName || leadAccount.name)}`));
  console.log(chalk.white(`    PropFirm:  ${chalk.magenta(leadAccount.propfirm)}`));
  console.log(chalk.white(`    Symbol:    ${chalk.cyan(leadSymbol.name)}`));
  console.log(chalk.white(`    Contracts: ${chalk.cyan(leadContracts)}`));
  console.log();
  console.log(chalk.white('  FOLLOWER ACCOUNT'));
  console.log(chalk.white(`    Account:   ${chalk.cyan(followerAccount.accountName || followerAccount.name)}`));
  console.log(chalk.white(`    PropFirm:  ${chalk.magenta(followerAccount.propfirm)}`));
  console.log(chalk.white(`    Symbol:    ${chalk.cyan(followerSymbol.name)}`));
  console.log(chalk.white(`    Contracts: ${chalk.cyan(followerContracts)}`));
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log();

  const { launch } = await inquirer.prompt([
    {
      type: 'list',
      name: 'launch',
      message: chalk.white.bold('Ready to launch Copy Trading?'),
      choices: [
        { name: chalk.green.bold('[>] Launch Copy Trading'), value: 'launch' },
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      loop: false
    }
  ]);

  if (launch === 'back') return;

  // Launch Copy Trading
  await launchCopyTrading({
    dailyTarget,
    maxRisk,
    lead: {
      account: leadAccount,
      symbol: leadSymbol,
      contracts: leadContracts,
      service: leadAccount.service
    },
    follower: {
      account: followerAccount,
      symbol: followerSymbol,
      contracts: followerContracts,
      service: followerAccount.service
    }
  });
};

/**
 * Launch Copy Trading
 */
const launchCopyTrading = async (config) => {
  const { lead, follower, dailyTarget, maxRisk } = config;

  console.log();
  console.log(chalk.green.bold('  [>] Launching Copy Trading...'));
  console.log();

  let isRunning = true;
  let stopReason = null;
  let lastLeadPosition = null;
  const logs = [];
  const MAX_LOGS = 12;

  const stats = {
    copiedTrades: 0,
    leadTrades: 0,
    followerTrades: 0,
    errors: 0,
    pnl: 0
  };

  const addLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    logs.push({ timestamp, type, message });
    if (logs.length > MAX_LOGS) logs.shift();
  };

  const displayUI = () => {
    console.clear();
    console.log();
    console.log(chalk.gray(getSeparator()));
    console.log(chalk.green.bold('  HQX Copy Trading'));
    console.log(chalk.gray(getSeparator()));
    console.log(chalk.white(`  Status: ${isRunning ? chalk.green('RUNNING') : chalk.red('STOPPED')}`));
    console.log(chalk.gray(getSeparator()));
    console.log();

    // Risk Management
    console.log(chalk.white.bold('  RISK MANAGEMENT'));
    const targetProgress = Math.min(100, (stats.pnl / dailyTarget) * 100);
    const riskProgress = Math.min(100, (Math.abs(Math.min(0, stats.pnl)) / maxRisk) * 100);
    console.log(chalk.white(`    Target:  ${chalk.green('$' + dailyTarget.toFixed(2))} | Progress: ${targetProgress >= 100 ? chalk.green.bold(targetProgress.toFixed(1) + '%') : chalk.yellow(targetProgress.toFixed(1) + '%')}`));
    console.log(chalk.white(`    Risk:    ${chalk.red('$' + maxRisk.toFixed(2))} | Used: ${riskProgress >= 100 ? chalk.red.bold(riskProgress.toFixed(1) + '%') : chalk.cyan(riskProgress.toFixed(1) + '%')}`));
    console.log(chalk.white(`    P&L:     ${stats.pnl >= 0 ? chalk.green('+$' + stats.pnl.toFixed(2)) : chalk.red('-$' + Math.abs(stats.pnl).toFixed(2))}`));
    console.log();

    // Lead info
    console.log(chalk.white.bold('  LEAD'));
    console.log(chalk.white(`    ${chalk.cyan(lead.account.accountName)} @ ${chalk.magenta(lead.account.propfirm)}`));
    console.log(chalk.white(`    ${chalk.cyan(lead.symbol.value)} x ${lead.contracts}`));
    console.log();

    // Follower info
    console.log(chalk.white.bold('  FOLLOWER'));
    console.log(chalk.white(`    ${chalk.cyan(follower.account.accountName)} @ ${chalk.magenta(follower.account.propfirm)}`));
    console.log(chalk.white(`    ${chalk.cyan(follower.symbol.value)} x ${follower.contracts}`));
    console.log();

    // Stats
    console.log(chalk.gray(getSeparator()));
    console.log(chalk.white('  Stats: ') +
      chalk.gray('Lead Trades: ') + chalk.cyan(stats.leadTrades) +
      chalk.gray(' | Copied: ') + chalk.green(stats.copiedTrades) +
      chalk.gray(' | Errors: ') + chalk.red(stats.errors)
    );
    console.log(chalk.gray(getSeparator()));

    // Logs
    console.log(chalk.white.bold('  Activity Log'));
    console.log(chalk.gray(getSeparator()));

    if (logs.length === 0) {
      console.log(chalk.gray('  Monitoring lead account for trades...'));
    } else {
      const typeColors = {
        info: chalk.cyan,
        success: chalk.green,
        trade: chalk.green.bold,
        copy: chalk.yellow.bold,
        error: chalk.red,
        warning: chalk.yellow
      };

      logs.forEach(log => {
        const color = typeColors[log.type] || chalk.white;
        const icon = log.type === 'trade' ? '[>]' :
                     log.type === 'copy' ? '[+]' :
                     log.type === 'error' ? '[X]' :
                     log.type === 'success' ? '[OK]' : '[.]';
        console.log(chalk.gray(`  [${log.timestamp}]`) + ' ' + color(`${icon} ${log.message}`));
      });
    }

    console.log(chalk.gray(getSeparator()));
    console.log();
    console.log(chalk.yellow('  Press X to stop copy trading...'));
    console.log();
  };

  addLog('info', 'Copy trading initialized');
  addLog('info', `Monitoring ${lead.account.accountName} for position changes`);
  displayUI();

  // Position monitoring loop
  const monitorInterval = setInterval(async () => {
    if (!isRunning) return;

    try {
      // Get follower positions for P&L tracking
      const followerPositions = await follower.service.getPositions(follower.account.rithmicAccountId || follower.account.accountId);
      
      if (followerPositions.success && followerPositions.positions) {
        const followerPos = followerPositions.positions.find(p => 
          p.symbol === follower.symbol.value || 
          p.symbol?.includes(follower.symbol.searchText)
        );
        
        // Update P&L from follower position
        if (followerPos && typeof followerPos.unrealizedPnl === 'number') {
          stats.pnl = followerPos.unrealizedPnl;
        }
      }

      // Check if daily target reached
      if (stats.pnl >= dailyTarget) {
        isRunning = false;
        stopReason = 'target';
        addLog('success', `Daily target reached! +$${stats.pnl.toFixed(2)}`);
        
        // Close follower position
        try {
          await follower.service.closePosition(
            follower.account.rithmicAccountId || follower.account.accountId,
            follower.symbol.value
          );
          addLog('info', 'Follower position closed');
        } catch (e) {
          // Position may already be closed
        }
        
        displayUI();
        return;
      }

      // Check if max risk reached
      if (stats.pnl <= -maxRisk) {
        isRunning = false;
        stopReason = 'risk';
        addLog('error', `Max risk reached! -$${Math.abs(stats.pnl).toFixed(2)}`);
        
        // Close follower position
        try {
          await follower.service.closePosition(
            follower.account.rithmicAccountId || follower.account.accountId,
            follower.symbol.value
          );
          addLog('info', 'Follower position closed');
        } catch (e) {
          // Position may already be closed
        }
        
        displayUI();
        return;
      }

      // Get lead positions
      const leadPositions = await lead.service.getPositions(lead.account.rithmicAccountId || lead.account.accountId);
      
      let currentLeadPosition = null;
      if (leadPositions.success && leadPositions.positions) {
        currentLeadPosition = leadPositions.positions.find(p => 
          p.symbol === lead.symbol.value || 
          p.symbol?.includes(lead.symbol.searchText)
        );
      }

      // Detect position changes
      const hadPosition = lastLeadPosition && lastLeadPosition.quantity !== 0;
      const hasPosition = currentLeadPosition && currentLeadPosition.quantity !== 0;

      if (!hadPosition && hasPosition) {
        // New position opened
        stats.leadTrades++;
        const side = currentLeadPosition.quantity > 0 ? 'LONG' : 'SHORT';
        addLog('trade', `Lead opened ${side} ${Math.abs(currentLeadPosition.quantity)} @ ${currentLeadPosition.averagePrice || 'MKT'}`);
        
        // Copy to follower
        await copyTradeToFollower(follower, currentLeadPosition, 'open');
        stats.copiedTrades++;
        displayUI();

      } else if (hadPosition && !hasPosition) {
        // Position closed
        addLog('trade', `Lead closed position`);
        
        // Close follower position
        await copyTradeToFollower(follower, lastLeadPosition, 'close');
        stats.copiedTrades++;
        displayUI();

      } else if (hadPosition && hasPosition && lastLeadPosition.quantity !== currentLeadPosition.quantity) {
        // Position size changed
        const diff = currentLeadPosition.quantity - lastLeadPosition.quantity;
        const action = diff > 0 ? 'added' : 'reduced';
        addLog('trade', `Lead ${action} ${Math.abs(diff)} contracts`);
        
        // Adjust follower position
        await copyTradeToFollower(follower, { ...currentLeadPosition, quantityChange: diff }, 'adjust');
        stats.copiedTrades++;
        displayUI();
      }

      lastLeadPosition = currentLeadPosition ? { ...currentLeadPosition } : null;

    } catch (error) {
      stats.errors++;
      addLog('error', `Monitor error: ${error.message}`);
      displayUI();
    }
  }, 2000); // Check every 2 seconds

  // Wait for X key OR auto-stop (target/risk reached)
  await new Promise((resolve) => {
    // Check for auto-stop every 500ms
    const checkInterval = setInterval(() => {
      if (!isRunning || stopReason) {
        clearInterval(checkInterval);
        clearInterval(monitorInterval);
        if (process.stdin.isTTY && process.stdin.isRaw) {
          process.stdin.setRawMode(false);
        }
        resolve();
      }
    }, 500);

    // Also listen for X key
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      
      const onKeypress = (str, key) => {
        if (key && (key.name === 'x' || key.name === 'X' || (key.ctrl && key.name === 'c'))) {
          clearInterval(checkInterval);
          clearInterval(monitorInterval);
          process.stdin.setRawMode(false);
          process.stdin.removeListener('keypress', onKeypress);
          resolve();
        }
      };
      
      process.stdin.on('keypress', onKeypress);
    }
  });

  // Cleanup
  isRunning = false;

  console.log();
  if (stopReason === 'target') {
    console.log(chalk.green.bold('  [OK] Daily target reached! Copy trading stopped.'));
  } else if (stopReason === 'risk') {
    console.log(chalk.red.bold('  [X] Max risk reached! Copy trading stopped.'));
  } else {
    console.log(chalk.yellow('  [OK] Copy trading stopped by user'));
  }
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white.bold('  Session Summary'));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Daily Target:  ${chalk.green('$' + dailyTarget.toFixed(2))}`));
  console.log(chalk.white(`  Max Risk:      ${chalk.red('$' + maxRisk.toFixed(2))}`));
  console.log(chalk.white(`  Final P&L:     ${stats.pnl >= 0 ? chalk.green('+$' + stats.pnl.toFixed(2)) : chalk.red('-$' + Math.abs(stats.pnl).toFixed(2))}`));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Lead Trades:   ${chalk.cyan(stats.leadTrades)}`));
  console.log(chalk.white(`  Copied Trades: ${chalk.green(stats.copiedTrades)}`));
  console.log(chalk.white(`  Errors:        ${chalk.red(stats.errors)}`));
  console.log(chalk.gray(getSeparator()));
  console.log();

  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

/**
 * Copy trade to follower account
 */
const copyTradeToFollower = async (follower, position, action) => {
  try {
    const service = follower.service;
    const accountId = follower.account.rithmicAccountId || follower.account.accountId;

    if (action === 'open') {
      // Open new position
      const side = position.quantity > 0 ? 0 : 1; // 0=Buy, 1=Sell
      const result = await service.placeOrder({
        accountId: accountId,
        symbol: follower.symbol.value,
        exchange: 'CME',
        size: follower.contracts,
        side: side,
        type: 2 // Market
      });

      if (result.success) {
        console.log(chalk.green(`  [+] Follower: Opened ${side === 0 ? 'LONG' : 'SHORT'} ${follower.contracts} ${follower.symbol.value}`));
      } else {
        throw new Error(result.error || 'Order failed');
      }

    } else if (action === 'close') {
      // Close position
      const result = await service.closePosition(accountId, follower.symbol.value);

      if (result.success) {
        console.log(chalk.green(`  [+] Follower: Closed position`));
      } else {
        throw new Error(result.error || 'Close failed');
      }

    } else if (action === 'adjust') {
      // Adjust position size
      const side = position.quantityChange > 0 ? 0 : 1;
      const size = Math.abs(position.quantityChange);
      const adjustedSize = Math.round(size * (follower.contracts / Math.abs(position.quantity - position.quantityChange)));

      if (adjustedSize > 0) {
        const result = await service.placeOrder({
          accountId: accountId,
          symbol: follower.symbol.value,
          exchange: 'CME',
          size: adjustedSize,
          side: side,
          type: 2
        });

        if (result.success) {
          console.log(chalk.green(`  [+] Follower: Adjusted by ${side === 0 ? '+' : '-'}${adjustedSize}`));
        }
      }
    }

  } catch (error) {
    console.log(chalk.red(`  [X] Follower error: ${error.message}`));
  }
};

/**
 * Wait for X key to stop
 */
const waitForStopKey = () => {
  return new Promise((resolve) => {
    // Enable raw mode to capture keypresses
    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      
      const onKeypress = (str, key) => {
        if (key && (key.name === 'x' || key.name === 'X' || (key.ctrl && key.name === 'c'))) {
          process.stdin.setRawMode(false);
          process.stdin.removeListener('keypress', onKeypress);
          resolve();
        }
      };
      
      process.stdin.on('keypress', onKeypress);
    } else {
      // Fallback: wait 30 seconds in non-TTY mode
      setTimeout(resolve, 30000);
    }
  });
};

module.exports = { algoTradingMenu };
