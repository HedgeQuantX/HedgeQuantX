/**
 * Algo Trading Page
 */

const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');

const { connections } = require('../services');
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
 * Launch Algo
 */
const launchAlgo = async (service, account, contract, numContracts) => {
  const accountName = account.accountName || account.name || 'Account #' + account.accountId;
  const symbolName = contract.name || contract.symbol || contract.id;
  
  console.log();
  console.log(chalk.green.bold('  [>] Launching HQX Algo...'));
  console.log();
  
  const spinner = ora('Connecting to HQX Server...').start();
  
  // Try to connect to HQX Server
  let hqxConnected = false;
  // TODO: Implement HQX Server connection
  
  spinner.warn('HQX Server unavailable - Running in Demo Mode');
  
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.cyan.bold('  HQX Ultra-Scalping Algo'));
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.white(`  Status:    ${chalk.green('RUNNING')}`));
  console.log(chalk.white(`  Account:   ${chalk.cyan(accountName)}`));
  console.log(chalk.white(`  Symbol:    ${chalk.cyan(symbolName)}`));
  console.log(chalk.white(`  Contracts: ${chalk.cyan(numContracts)}`));
  console.log(chalk.white(`  Mode:      ${hqxConnected ? chalk.green('LIVE') : chalk.yellow('DEMO')}`));
  console.log(chalk.gray(getSeparator()));
  console.log();
  
  // Activity logs
  const logs = [];
  
  const addLog = (type, message) => {
    const timestamp = new Date().toLocaleTimeString();
    const typeColors = {
      info: chalk.cyan,
      signal: chalk.yellow,
      trade: chalk.green,
      error: chalk.red,
      warning: chalk.yellow
    };
    const color = typeColors[type] || chalk.white;
    logs.push({ timestamp, type, message, color });
    if (logs.length > 10) logs.shift();
  };
  
  const displayLogs = () => {
    console.log(chalk.gray('  Recent Activity:'));
    logs.forEach(log => {
      console.log(chalk.gray(`  [${log.timestamp}]`) + ' ' + log.color(log.message));
    });
  };
  
  addLog('info', 'Algo initialized');
  addLog('info', `Monitoring ${symbolName}...`);
  displayLogs();
  
  console.log();
  console.log(chalk.yellow('  Demo mode: No real trades will be executed.'));
  console.log();
  
  // Stop menu
  const { stopAction } = await inquirer.prompt([
    {
      type: 'list',
      name: 'stopAction',
      message: chalk.red.bold(''),
      choices: [
        { name: chalk.red.bold('[X] Stop Algo'), value: 'stop' }
      ],
      pageSize: 1,
      loop: false
    }
  ]);
  
  if (stopAction === 'stop') {
    console.log();
    console.log(chalk.yellow('  Stopping algo...'));
    console.log(chalk.green('  [OK] Algo stopped successfully'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
  }
};

module.exports = { algoTradingMenu };
