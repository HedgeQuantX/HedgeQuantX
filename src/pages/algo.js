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
        { name: chalk.gray('Copy Trading (Coming Soon)'), value: 'copy_trading', disabled: 'Coming Soon' },
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
      // Disabled - Coming Soon
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
  
  // Confirmation
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white.bold('  Algo Configuration:'));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Account:   ${chalk.cyan(accountName)}`));
  console.log(chalk.white(`  Symbol:    ${chalk.cyan(contract.name || selectedSymbol.value)}`));
  console.log(chalk.white(`  Contracts: ${chalk.cyan(contracts)}`));
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
  
  await launchAlgo(service, account, contract, contracts);
};

/**
 * Launch Algo with HQX Server Connection
 */
const launchAlgo = async (service, account, contract, numContracts) => {
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
  
  // Activity logs
  const logs = [];
  const MAX_LOGS = 12;
  
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
  
  const displayUI = () => {
    clearScreen();
    console.log();
    console.log(chalk.gray(getSeparator()));
    console.log(chalk.cyan.bold('  HQX Ultra-Scalping Algo'));
    console.log(chalk.gray(getSeparator()));
    console.log(chalk.white(`  Status:    ${algoRunning ? chalk.green('RUNNING') : chalk.yellow('CONNECTING...')}`));
    console.log(chalk.white(`  Account:   ${chalk.cyan(accountName)}`));
    console.log(chalk.white(`  Symbol:    ${chalk.cyan(symbolName)}`));
    console.log(chalk.white(`  Contracts: ${chalk.cyan(numContracts)}`));
    console.log(chalk.white(`  Mode:      ${hqxConnected ? chalk.green('LIVE') : chalk.yellow('OFFLINE')}`));
    console.log(chalk.gray(getSeparator()));
    
    // Stats bar
    console.log();
    console.log(chalk.white('  Stats: ') + 
      chalk.gray('Trades: ') + chalk.cyan(stats.trades) + 
      chalk.gray(' | Wins: ') + chalk.green(stats.wins) + 
      chalk.gray(' | Losses: ') + chalk.red(stats.losses) + 
      chalk.gray(' | Win Rate: ') + chalk.yellow(stats.winRate + '%') +
      chalk.gray(' | P&L: ') + (stats.pnl >= 0 ? chalk.green('$' + stats.pnl.toFixed(2)) : chalk.red('-$' + Math.abs(stats.pnl).toFixed(2)))
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
    hqxServer.startAlgo({
      accountId: account.accountId,
      contractId: contract.id || contract.contractId,
      symbol: symbol,
      contracts: numContracts,
      dailyTarget: 500,  // Default daily target
      maxRisk: 200,      // Default max risk
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
  
  // Wait for X key to stop
  await waitForStopKey();
  
  // Stop algo
  addLog('warning', 'Stopping algo...');
  displayUI();
  
  if (hqxConnected) {
    hqxServer.stopAlgo();
  }
  
  hqxServer.disconnect();
  algoRunning = false;
  
  console.log();
  console.log(chalk.green('  [OK] Algo stopped successfully'));
  console.log();
  
  // Final stats
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white.bold('  Session Summary'));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Total Trades:  ${chalk.cyan(stats.trades)}`));
  console.log(chalk.white(`  Wins:          ${chalk.green(stats.wins)}`));
  console.log(chalk.white(`  Losses:        ${chalk.red(stats.losses)}`));
  console.log(chalk.white(`  Win Rate:      ${chalk.yellow(stats.winRate + '%')}`));
  console.log(chalk.white(`  Total P&L:     ${stats.pnl >= 0 ? chalk.green('+$' + stats.pnl.toFixed(2)) : chalk.red('-$' + Math.abs(stats.pnl).toFixed(2))}`));
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
