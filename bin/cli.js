#!/usr/bin/env node

const chalk = require('chalk');
const figlet = require('figlet');
const inquirer = require('inquirer');
const ora = require('ora');
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
      ]
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
      pageSize: 15
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
    console.log(chalk.white(`  Welcome, ${user.firstName || user.userName}!`));
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
        { name: chalk.green('User Info'), value: 'userinfo' },
        new inquirer.Separator(),
        { name: chalk.yellow('Disconnect'), value: 'disconnect' }
      ]
    }
  ]);

  return action;
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
      
      result.accounts.forEach((account, index) => {
        console.log(chalk.cyan(`  ${index + 1}. ${account.accountName || account.name || `Account #${account.accountId}`}`));
        if (account.balance !== undefined) {
          console.log(chalk.white(`     Balance: $${account.balance.toLocaleString()}`));
        }
        if (account.status !== undefined) {
          const statusText = account.status === 1 ? chalk.green('Active') : chalk.red('Inactive');
          console.log(chalk.white(`     Status: ${statusText}`));
        }
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
              case 'userinfo':
                await showUserInfo(currentService);
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
