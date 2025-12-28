#!/usr/bin/env node

const chalk = require('chalk');
const figlet = require('figlet');
const inquirer = require('inquirer');
const ora = require('ora');
const { execSync } = require('child_process');
const path = require('path');
const { program } = require('commander');
const { ProjectXService } = require('../src/services/projectx');

// Session courante
let currentService = null;

// Liste des PropFirms ProjectX
const projectXPropfirms = [
  { name: 'Topstep', value: 'topstep' },
  { name: 'Alpha Futures', value: 'alpha_futures' },
  { name: 'TickTickTrader', value: 'tickticktrader' },
  { name: 'Bulenox', value: 'bulenox' },
  { name: 'TradeDay', value: 'tradeday' },
  { name: 'Blusky', value: 'blusky' },
  { name: 'Goat Futures', value: 'goat_futures' },
  { name: 'The Futures Desk', value: 'futures_desk' },
  { name: 'DayTraders', value: 'daytraders' },
  { name: 'E8 Futures', value: 'e8_futures' },
  { name: 'Blue Guardian Futures', value: 'blue_guardian' },
  { name: 'FuturesElite', value: 'futures_elite' },
  { name: 'FXIFY', value: 'fxify' },
  { name: 'Hola Prime', value: 'hola_prime' },
  { name: 'Top One Futures', value: 'top_one_futures' },
  { name: 'Funding Futures', value: 'funding_futures' },
  { name: 'TX3 Funding', value: 'tx3_funding' },
  { name: 'Lucid Trading', value: 'lucid_trading' },
  { name: 'Tradeify', value: 'tradeify' },
  { name: 'Earn2Trade (Coming Soon!)', value: 'earn2trade', disabled: 'Coming Soon' },
];

// Banner
const banner = () => {
  console.clear();
  console.log(
    chalk.cyan(
      figlet.textSync('HEDGEQUANTX', {
        font: 'ANSI Shadow',
        horizontalLayout: 'default',
        verticalLayout: 'default'
      })
    )
  );
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.yellow.bold('  Prop Futures Algo Trading'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();
};

// Menu principal - Choix de connexion
const mainMenu = async () => {
  const { connection } = await inquirer.prompt([
    {
      type: 'list',
      name: 'connection',
      message: chalk.white.bold('Choose Your Connection:'),
      choices: [
        { name: chalk.green('ProjectX'), value: 'projectx' },
        { name: chalk.green('Rithmic'), value: 'rithmic' },
        { name: chalk.green('Tradovate'), value: 'tradovate' },
        new inquirer.Separator(),
        { name: chalk.red('Exit'), value: 'exit' }
      ],
      pageSize: 10,
      loop: false
    }
  ]);

  return connection;
};

// Menu PropFirm pour ProjectX
const projectXMenu = async () => {
  console.log();
  const { propfirm } = await inquirer.prompt([
    {
      type: 'list',
      name: 'propfirm',
      message: chalk.white.bold('Choose Your Propfirm:'),
      choices: [
        ...projectXPropfirms.map(pf => ({
          name: pf.disabled ? chalk.gray(pf.name) : chalk.green(pf.name),
          value: pf.value,
          disabled: pf.disabled
        })),
        new inquirer.Separator(),
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      pageSize: 25,
      loop: false
    }
  ]);

  return propfirm;
};

// Login prompt
const loginPrompt = async (propfirmName) => {
  console.log();
  console.log(chalk.cyan(`Connecting to ${propfirmName}...`));
  console.log();

  const credentials = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: chalk.white.bold('Enter Your Username:'),
      validate: (input) => input.length > 0 || 'Username is required'
    },
    {
      type: 'password',
      name: 'password',
      message: chalk.white.bold('Enter Your Password:'),
      mask: '*',
      validate: (input) => input.length > 0 || 'Password is required'
    }
  ]);

  return credentials;
};

// Menu après connexion
const dashboardMenu = async (service) => {
  const user = service.user;
  const propfirmName = service.getPropfirmName();

  console.log();
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.green.bold(`  Connected to ${propfirmName}`));
  if (user) {
    console.log(chalk.white(`  Welcome, ${user.userName}!`));
  }
  console.log(chalk.gray('─'.repeat(60)));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.white.bold('What would you like to do?'),
      choices: [
        { name: chalk.green('View Accounts'), value: 'accounts' },
        { name: chalk.green('View Positions'), value: 'positions' },
        { name: chalk.green('View Orders'), value: 'orders' },
        { name: chalk.green('View Stats'), value: 'stats' },
        { name: chalk.green('User Info'), value: 'userinfo' },
        new inquirer.Separator(),
        { name: chalk.magenta('Algo-Trading'), value: 'algotrading' },
        new inquirer.Separator(),
        { name: chalk.cyan('Refresh CLI (git pull)'), value: 'refresh' },
        { name: chalk.yellow('Disconnect'), value: 'disconnect' }
      ],
      pageSize: 10,
      loop: false
    }
  ]);

  return action;
};

// Account Status Enum (ProjectX UserAPI)
const ACCOUNT_STATUS = {
  0: { text: 'Active', color: 'green' },
  1: { text: 'End Of Day', color: 'cyan' },
  2: { text: 'Halted', color: 'red' },
  3: { text: 'Paused', color: 'yellow' },
  4: { text: 'Holiday', color: 'blue' },
  5: { text: 'Expired', color: 'gray' },
  6: { text: 'Terminated', color: 'red' },
  7: { text: 'Cancelled', color: 'red' },
  8: { text: 'Failed', color: 'red' },
  9: { text: 'Passed', color: 'green' }
};

// Account Type Enum (ProjectX UserAPI)
const ACCOUNT_TYPE = {
  0: { text: 'Practice', color: 'blue' },
  1: { text: 'Evaluation', color: 'yellow' },
  2: { text: 'Live', color: 'green' },
  3: { text: 'Express', color: 'magenta' },
  4: { text: 'Sim', color: 'gray' }
};

// Afficher les comptes
const showAccounts = async (service) => {
  const spinner = ora('Fetching accounts...').start();
  
  const result = await service.getTradingAccounts();
  
  if (result.success && result.accounts) {
    spinner.succeed('Accounts loaded');
    console.log();
    
    if (result.accounts.length === 0) {
      console.log(chalk.yellow('  No accounts found.'));
    } else {
      console.log(chalk.white.bold('  Your Trading Accounts:'));
      console.log(chalk.gray('  ' + '─'.repeat(50)));
      
      // Tri des comptes: Active (1) d'abord, puis par type (Live=3 d'abord)
      const sortedAccounts = [...result.accounts].sort((a, b) => {
        // Status: Active (1) en premier, puis Pending (0), puis autres
        const statusOrder = { 1: 0, 0: 1, 2: 2, 6: 3, 7: 4, 3: 5, 4: 6, 5: 7 };
        const statusA = statusOrder[a.status] !== undefined ? statusOrder[a.status] : 99;
        const statusB = statusOrder[b.status] !== undefined ? statusOrder[b.status] : 99;
        if (statusA !== statusB) return statusA - statusB;
        
        // Type: Live (3) d'abord, puis Express (2), Evaluation (1), Sim (0)
        const typeOrder = { 3: 0, 2: 1, 1: 2, 0: 3 };
        const typeA = typeOrder[a.type] !== undefined ? typeOrder[a.type] : 99;
        const typeB = typeOrder[b.type] !== undefined ? typeOrder[b.type] : 99;
        return typeA - typeB;
      });

      sortedAccounts.forEach((account, index) => {
        console.log(chalk.cyan(`  ${index + 1}. ${account.accountName || account.name || `Account #${account.accountId}`}`));
        
        if (account.balance !== undefined) {
          const balanceColor = account.balance >= 0 ? chalk.green : chalk.red;
          console.log(`     Balance: ${balanceColor('$' + account.balance.toLocaleString())}`);
        }
        
        // Status
        const statusInfo = ACCOUNT_STATUS[account.status] || { text: `Unknown (${account.status})`, color: 'gray' };
        console.log(`     Status: ${chalk[statusInfo.color](statusInfo.text)}`);

        // Type
        const typeInfo = ACCOUNT_TYPE[account.type] || { text: `Unknown (${account.type})`, color: 'white' };
        console.log(`     Type: ${chalk[typeInfo.color](typeInfo.text)}`);
        
        console.log();
      });
    }
  } else {
    spinner.fail('Failed to fetch accounts');
    console.log(chalk.red(`  Error: ${result.error}`));
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Afficher les infos utilisateur
const showUserInfo = async (service) => {
  const spinner = ora('Fetching user info...').start();
  
  const result = await service.getUser();
  
  if (result.success && result.user) {
    spinner.succeed('User info loaded');
    console.log();
    
    const user = result.user;
    console.log(chalk.white.bold('  User Information:'));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    console.log(chalk.white(`  Username:   ${user.userName || 'N/A'}`));
    console.log(chalk.white(`  Name:       ${user.firstName || ''} ${user.lastName || ''}`));
    console.log(chalk.white(`  Email:      ${user.email || 'N/A'}`));
    console.log(chalk.white(`  User ID:    ${user.userId || 'N/A'}`));
    console.log();
  } else {
    spinner.fail('Failed to fetch user info');
    console.log(chalk.red(`  Error: ${result.error}`));
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Afficher les positions
const showPositions = async (service) => {
  // D'abord récupérer les comptes
  const accountsResult = await service.getTradingAccounts();
  
  if (!accountsResult.success || !accountsResult.accounts || accountsResult.accounts.length === 0) {
    console.log(chalk.yellow('  No accounts available to check positions.'));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  const spinner = ora('Fetching positions...').start();
  
  let allPositions = [];
  for (const account of accountsResult.accounts) {
    const result = await service.getPositions(account.accountId);
    if (result.success && result.positions) {
      allPositions = allPositions.concat(result.positions.map(p => ({
        ...p,
        accountName: account.accountName || account.name || `Account #${account.accountId}`
      })));
    }
  }
  
  spinner.succeed('Positions loaded');
  console.log();
  
  if (allPositions.length === 0) {
    console.log(chalk.yellow('  No open positions.'));
  } else {
    console.log(chalk.white.bold('  Open Positions:'));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    
    allPositions.forEach((pos, index) => {
      console.log(chalk.cyan(`  ${index + 1}. ${pos.symbolId || pos.contractId || 'Unknown'}`));
      console.log(chalk.white(`     Account: ${pos.accountName}`));
      console.log(chalk.white(`     Size: ${pos.positionSize || pos.size || 0}`));
      if (pos.averagePrice) {
        console.log(chalk.white(`     Avg Price: $${pos.averagePrice}`));
      }
      if (pos.profitAndLoss !== undefined) {
        const pnlColor = pos.profitAndLoss >= 0 ? chalk.green : chalk.red;
        console.log(pnlColor(`     P&L: $${pos.profitAndLoss.toFixed(2)}`));
      }
      console.log();
    });
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Afficher les ordres
const showOrders = async (service) => {
  const accountsResult = await service.getTradingAccounts();
  
  if (!accountsResult.success || !accountsResult.accounts || accountsResult.accounts.length === 0) {
    console.log(chalk.yellow('  No accounts available to check orders.'));
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  const spinner = ora('Fetching orders...').start();
  
  let allOrders = [];
  for (const account of accountsResult.accounts) {
    const result = await service.getOrders(account.accountId);
    if (result.success && result.orders) {
      allOrders = allOrders.concat(result.orders.map(o => ({
        ...o,
        accountName: account.accountName || account.name || `Account #${account.accountId}`
      })));
    }
  }
  
  spinner.succeed('Orders loaded');
  console.log();
  
  if (allOrders.length === 0) {
    console.log(chalk.yellow('  No recent orders.'));
  } else {
    console.log(chalk.white.bold('  Recent Orders:'));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    
    allOrders.slice(0, 10).forEach((order, index) => {
      const statusColors = {
        0: chalk.gray,
        1: chalk.yellow,
        2: chalk.green,
        3: chalk.red
      };
      const statusNames = {
        0: 'Pending',
        1: 'Open',
        2: 'Filled',
        3: 'Cancelled'
      };
      const statusColor = statusColors[order.status] || chalk.white;
      const statusName = statusNames[order.status] || 'Unknown';
      
      console.log(chalk.cyan(`  ${index + 1}. ${order.symbolId || 'Unknown'}`));
      console.log(chalk.white(`     Account: ${order.accountName}`));
      console.log(chalk.white(`     Size: ${order.positionSize || order.size || 0}`));
      console.log(statusColor(`     Status: ${statusName}`));
      console.log();
    });
  }
  
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Afficher les stats de tous les comptes
const showStats = async (service) => {
  const spinner = ora('Fetching stats for all accounts...').start();
  
  const accountsResult = await service.getTradingAccounts();
  
  if (!accountsResult.success || !accountsResult.accounts || accountsResult.accounts.length === 0) {
    spinner.fail('No accounts found');
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  // Variables pour les totaux
  let totalBalance = 0;
  let totalStartingBalance = 0;
  let totalPnL = 0;
  let allTrades = [];
  let totalOpenPositions = 0;
  let totalOpenOrders = 0;

  spinner.text = 'Fetching detailed stats...';

  // Collecter les données de tous les comptes
  for (const account of accountsResult.accounts) {
    totalBalance += account.balance || 0;
    
    // Starting Balance estimation
    const accountName = account.accountName || '';
    let startingBalance = 0;
    if (accountName.includes('150')) startingBalance = 150000;
    else if (accountName.includes('100')) startingBalance = 100000;
    else if (accountName.includes('50')) startingBalance = 50000;
    else if (accountName.includes('25')) startingBalance = 25000;
    totalStartingBalance += startingBalance;
    
    // Positions
    const posResult = await service.getPositions(account.accountId);
    if (posResult.success && posResult.positions) {
      totalOpenPositions += posResult.positions.length;
    }
    
    // Orders
    const ordersResult = await service.getOrders(account.accountId);
    if (ordersResult.success && ordersResult.orders) {
      totalOpenOrders += ordersResult.orders.filter(o => o.status === 1).length;
      
      // Collecter les trades (ordres remplis)
      const filledOrders = ordersResult.orders.filter(o => o.status === 2);
      allTrades = allTrades.concat(filledOrders.map(o => ({
        ...o,
        accountName: account.accountName
      })));
    }
  }

  totalPnL = totalBalance - totalStartingBalance;

  // Calculer les métriques de trading
  let winningTrades = 0;
  let losingTrades = 0;
  let totalWinAmount = 0;
  let totalLossAmount = 0;
  let bestTrade = 0;
  let worstTrade = 0;

  // Note: Ces calculs sont approximatifs car l'API Orders ne retourne pas le P&L par trade
  // Pour des stats précises, il faudrait utiliser un endpoint dédié aux trades historiques
  const totalTrades = allTrades.length;

  spinner.succeed('Stats loaded');
  console.log();
  
  // ═══════════════════════════════════════════════════════
  // TOTAL PORTFOLIO SUMMARY
  // ═══════════════════════════════════════════════════════
  console.log(chalk.yellow.bold('  ╔═══════════════════════════════════════════════════════╗'));
  console.log(chalk.yellow.bold('  ║           PORTFOLIO SUMMARY                          ║'));
  console.log(chalk.yellow.bold('  ╚═══════════════════════════════════════════════════════╝'));
  console.log();
  
  console.log(chalk.white.bold('  Total Accounts:    ') + chalk.cyan(accountsResult.accounts.length));
  
  const totalBalanceColor = totalBalance >= 0 ? chalk.green : chalk.red;
  console.log(chalk.white.bold('  Total Balance:     ') + totalBalanceColor('$' + totalBalance.toLocaleString()));
  
  if (totalStartingBalance > 0) {
    console.log(chalk.white.bold('  Starting Balance:  ') + chalk.white('$' + totalStartingBalance.toLocaleString()));
    const pnlColor = totalPnL >= 0 ? chalk.green : chalk.red;
    const pnlPercent = ((totalPnL / totalStartingBalance) * 100).toFixed(2);
    console.log(chalk.white.bold('  Total P&L:         ') + pnlColor('$' + totalPnL.toLocaleString() + ' (' + pnlPercent + '%)'));
  }
  
  console.log(chalk.white.bold('  Open Positions:    ') + chalk.white(totalOpenPositions));
  console.log(chalk.white.bold('  Open Orders:       ') + chalk.white(totalOpenOrders));
  console.log(chalk.white.bold('  Total Trades:      ') + chalk.white(totalTrades));
  
  console.log();
  console.log(chalk.gray('  ' + '═'.repeat(55)));
  
  // ═══════════════════════════════════════════════════════
  // INDIVIDUAL ACCOUNT STATS
  // ═══════════════════════════════════════════════════════
  console.log();
  console.log(chalk.white.bold('  Individual Account Statistics:'));
  console.log(chalk.gray('  ' + '─'.repeat(55)));

  for (const account of accountsResult.accounts) {
    const accountName = account.accountName || account.name || `Account #${account.accountId}`;
    const statusInfo = ACCOUNT_STATUS[account.status] || { text: 'Unknown', color: 'gray' };
    const typeInfo = ACCOUNT_TYPE[account.type] || { text: 'Unknown', color: 'white' };
    
    console.log();
    console.log(chalk.cyan.bold(`  ${accountName}`));
    console.log(chalk.gray('  ' + '─'.repeat(50)));
    
    // Balance
    const balance = account.balance || 0;
    const balanceColor = balance >= 0 ? chalk.green : chalk.red;
    console.log(`     Balance:        ${balanceColor('$' + balance.toLocaleString())}`);
    
    // Status & Type
    console.log(`     Status:         ${chalk[statusInfo.color](statusInfo.text)}`);
    console.log(`     Type:           ${chalk[typeInfo.color](typeInfo.text)}`);
    
    // Starting Balance
    let startingBalance = null;
    if (accountName.includes('150')) startingBalance = 150000;
    else if (accountName.includes('100')) startingBalance = 100000;
    else if (accountName.includes('50')) startingBalance = 50000;
    else if (accountName.includes('25')) startingBalance = 25000;
    
    if (startingBalance) {
      const pnl = balance - startingBalance;
      const pnlPercent = ((pnl / startingBalance) * 100).toFixed(2);
      const pnlColor = pnl >= 0 ? chalk.green : chalk.red;
      console.log(`     Starting:       ${chalk.white('$' + startingBalance.toLocaleString())}`);
      console.log(`     P&L:            ${pnlColor('$' + pnl.toLocaleString() + ' (' + pnlPercent + '%)')}`);
    }
    
    // Positions
    const posResult = await service.getPositions(account.accountId);
    if (posResult.success && posResult.positions) {
      const openPositions = posResult.positions.length;
      console.log(`     Open Positions: ${chalk.white(openPositions)}`);
      
      if (openPositions > 0) {
        let totalUnrealizedPnL = 0;
        posResult.positions.forEach(pos => {
          if (pos.profitAndLoss !== undefined) {
            totalUnrealizedPnL += pos.profitAndLoss;
          }
        });
        const unrealizedColor = totalUnrealizedPnL >= 0 ? chalk.green : chalk.red;
        console.log(`     Unrealized P&L: ${unrealizedColor('$' + totalUnrealizedPnL.toFixed(2))}`);
      }
    }
    
    // Orders
    const ordersResult = await service.getOrders(account.accountId);
    if (ordersResult.success && ordersResult.orders) {
      const openOrders = ordersResult.orders.filter(o => o.status === 1).length;
      const filledOrders = ordersResult.orders.filter(o => o.status === 2).length;
      console.log(`     Open Orders:    ${chalk.white(openOrders)}`);
      console.log(`     Filled Trades:  ${chalk.white(filledOrders)}`);
    }
  }
  
  console.log();
  console.log(chalk.gray('  ' + '═'.repeat(55)));
  console.log();
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

// Menu Algo-Trading
const algoTradingMenu = async (service) => {
  console.log();
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.magenta.bold('  Algo-Trading'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.white.bold('Algo-Trading Options:'),
      choices: [
        { name: chalk.green('Start Strategy'), value: 'start' },
        { name: chalk.green('Stop Strategy'), value: 'stop' },
        { name: chalk.green('View Active Strategies'), value: 'view' },
        { name: chalk.green('Strategy Settings'), value: 'settings' },
        { name: chalk.green('Backtest'), value: 'backtest' },
        new inquirer.Separator(),
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      pageSize: 10,
      loop: false
    }
  ]);

  switch (action) {
    case 'start':
      console.log();
      console.log(chalk.yellow('  Strategy engine coming soon...'));
      console.log(chalk.gray('  This feature will allow you to run automated trading strategies.'));
      break;
    case 'stop':
      console.log();
      console.log(chalk.yellow('  No active strategies to stop.'));
      break;
    case 'view':
      console.log();
      console.log(chalk.yellow('  No active strategies.'));
      break;
    case 'settings':
      console.log();
      console.log(chalk.yellow('  Strategy settings coming soon...'));
      break;
    case 'backtest':
      console.log();
      console.log(chalk.yellow('  Backtesting engine coming soon...'));
      break;
    case 'back':
      return 'back';
  }

  if (action !== 'back') {
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
  }
  
  return action;
};

// Fonction principale
const main = async () => {
  banner();

  let running = true;
  
  while (running) {
    const connection = await mainMenu();

    switch (connection) {
      case 'projectx':
        const propfirm = await projectXMenu();
        if (propfirm === 'back') {
          banner();
          continue;
        }

        // Créer le service
        currentService = new ProjectXService(propfirm);
        
        // Login
        const credentials = await loginPrompt(currentService.getPropfirmName());
        
        const spinner = ora('Authenticating...').start();
        const loginResult = await currentService.login(credentials.username, credentials.password);
        
        if (loginResult.success) {
          // Récupérer les infos utilisateur
          await currentService.getUser();
          spinner.succeed('Connected successfully!');
          
          // Dashboard loop
          let connected = true;
          while (connected) {
            banner();
            const action = await dashboardMenu(currentService);
            
            switch (action) {
              case 'accounts':
                await showAccounts(currentService);
                break;
              case 'positions':
                await showPositions(currentService);
                break;
              case 'orders':
                await showOrders(currentService);
                break;
              case 'stats':
                await showStats(currentService);
                break;
              case 'userinfo':
                await showUserInfo(currentService);
                break;
              case 'algotrading':
                let algoRunning = true;
                while (algoRunning) {
                  banner();
                  const algoResult = await algoTradingMenu(currentService);
                  if (algoResult === 'back') {
                    algoRunning = false;
                  }
                }
                break;
              case 'refresh':
                const spinnerRefresh = ora('Updating CLI from GitHub...').start();
                try {
                  const cliDir = path.resolve(__dirname, '..');
                  // Vérifier que c'est bien le repo HQX-CLI
                  const gitRemote = execSync('git remote get-url origin', { cwd: cliDir, stdio: 'pipe' }).toString().trim();
                  if (!gitRemote.includes('HQX-CLI')) {
                    throw new Error('Not in HQX-CLI directory. Please run: cd ~/HQX-CLI && git pull');
                  }
                  execSync('git pull origin main', { cwd: cliDir, stdio: 'pipe' });
                  spinnerRefresh.succeed('CLI updated successfully!');
                  console.log(chalk.green('  Changes applied. Continue using the CLI.'));
                } catch (err) {
                  spinnerRefresh.fail('Update failed');
                  console.log(chalk.red(`  Error: ${err.message}`));
                  console.log(chalk.yellow('  Manual update: cd ~/HQX-CLI && git pull'));
                }
                console.log();
                await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
                break;
              case 'disconnect':
                currentService.logout();
                currentService = null;
                connected = false;
                banner();
                console.log(chalk.yellow('  Disconnected.'));
                console.log();
                break;
            }
          }
        } else {
          spinner.fail('Authentication failed');
          console.log(chalk.red(`  Error: ${loginResult.error}`));
          console.log();
          await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
          banner();
        }
        break;

      case 'rithmic':
        console.log();
        console.log(chalk.cyan('Rithmic connection...'));
        console.log(chalk.gray('Feature coming soon!'));
        console.log();
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        banner();
        break;

      case 'tradovate':
        console.log();
        console.log(chalk.cyan('Tradovate connection...'));
        console.log(chalk.gray('Feature coming soon!'));
        console.log();
        await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
        banner();
        break;

      case 'exit':
        console.log();
        console.log(chalk.yellow('Goodbye!'));
        running = false;
        break;
    }
  }
};

// Configuration CLI
program
  .name('hedgequantx')
  .description('Prop Futures Algo Trading CLI')
  .version('1.0.0');

program
  .command('status')
  .description('Show system status')
  .action(() => {
    console.log(chalk.green('System Status: Online'));
  });

program
  .command('start')
  .description('Start trading')
  .action(() => {
    console.log(chalk.green('Starting trading engine...'));
  });

program
  .command('stop')
  .description('Stop trading')
  .action(() => {
    console.log(chalk.red('Stopping trading engine...'));
  });

// Si aucune commande, lancer le menu interactif
if (!process.argv.slice(2).length) {
  main().catch(console.error);
} else {
  program.parse();
}
