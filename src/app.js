/**
 * @fileoverview Main application router
 * @module app
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const figlet = require('figlet');
const { execSync } = require('child_process');
const path = require('path');

const { ProjectXService, connections } = require('./services');
const { PROPFIRM_CHOICES, getPropFirmsByPlatform } = require('./config');
const { getDevice, getSeparator, printLogo, getLogoWidth, drawBoxHeader, drawBoxFooter, centerText } = require('./ui');
const { validateUsername, validatePassword, maskSensitive } = require('./security');

// Pages
const { showStats } = require('./pages/stats');
const { showAccounts } = require('./pages/accounts');
const { showPositions } = require('./pages/positions');
const { showOrders } = require('./pages/orders');
const { showUserInfo } = require('./pages/user');

// Current service reference
let currentService = null;

/**
 * Displays the application banner
 */
const banner = async () => {
  console.clear();
  const boxWidth = getLogoWidth();
  const version = require('../package.json').version;
  
  console.log(chalk.cyan('╔' + '═'.repeat(boxWidth - 2) + '╗'));
  
  const logoText = figlet.textSync('HEDGEQUANTX', { font: 'ANSI Shadow' });
  logoText.split('\n').forEach(line => {
    if (line.trim()) {
      const padded = centerText(line, boxWidth - 2);
      console.log(chalk.cyan('║') + chalk.cyan(padded) + chalk.cyan('║'));
    }
  });
  
  console.log(chalk.cyan('╠' + '═'.repeat(boxWidth - 2) + '╣'));
  console.log(chalk.cyan('║') + chalk.white(centerText(`Prop Futures Algo Trading  v${version}`, boxWidth - 2)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(boxWidth - 2) + '╝'));
  console.log();
};

/**
 * Login prompt with validation
 * @param {string} propfirmName - PropFirm display name
 * @returns {Promise<{username: string, password: string}>}
 */
const loginPrompt = async (propfirmName) => {
  const device = getDevice();
  console.log();
  console.log(chalk.cyan(`Connecting to ${propfirmName}...`));
  console.log();

  const credentials = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: chalk.white.bold('Username:'),
      validate: (input) => {
        try {
          validateUsername(input);
          return true;
        } catch (e) {
          return e.message;
        }
      }
    },
    {
      type: 'password',
      name: 'password',
      message: chalk.white.bold('Password:'),
      mask: '*',
      validate: (input) => {
        try {
          validatePassword(input);
          return true;
        } catch (e) {
          return e.message;
        }
      }
    }
  ]);

  return credentials;
};

/**
 * ProjectX platform connection menu
 */
const projectXMenu = async () => {
  const propfirms = getPropFirmsByPlatform('ProjectX');
  
  const { propfirm } = await inquirer.prompt([
    {
      type: 'list',
      name: 'propfirm',
      message: chalk.white.bold('Select PropFirm:'),
      choices: [
        ...propfirms.map(pf => ({ name: chalk.cyan(pf.displayName), value: pf.key })),
        new inquirer.Separator(),
        { name: chalk.gray('Back'), value: 'back' }
      ],
      pageSize: 15
    }
  ]);

  if (propfirm === 'back') return null;

  const credentials = await loginPrompt(propfirms.find(p => p.key === propfirm).displayName);
  const spinner = ora('Authenticating...').start();

  try {
    const service = new ProjectXService(propfirm);
    const result = await service.login(credentials.username, credentials.password);

    if (result.success) {
      await service.getUser();
      connections.add('projectx', service, service.propfirm.name);
      currentService = service;
      spinner.succeed(`Connected to ${service.propfirm.name}`);
      return service;
    } else {
      spinner.fail(result.error || 'Authentication failed');
      return null;
    }
  } catch (error) {
    spinner.fail(error.message);
    return null;
  }
};

/**
 * Main connection menu
 */
const mainMenu = async () => {
  const { connection } = await inquirer.prompt([
    {
      type: 'list',
      name: 'connection',
      message: chalk.white.bold('Choose Your Connection:'),
      choices: [
        { name: chalk.cyan('ProjectX'), value: 'projectx' },
        { name: chalk.gray('Rithmic (Coming Soon)'), value: 'rithmic', disabled: 'Coming Soon' },
        { name: chalk.gray('Tradovate (Coming Soon)'), value: 'tradovate', disabled: 'Coming Soon' },
        new inquirer.Separator(),
        { name: chalk.red('Exit'), value: 'exit' }
      ]
    }
  ]);

  return connection;
};

/**
 * Dashboard menu after login
 * @param {Object} service - Connected service
 */
const dashboardMenu = async (service) => {
  const device = getDevice();
  const user = service.user;

  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.green.bold(`  Connected to ${service.propfirm.name}`));
  if (user) {
    console.log(chalk.white(`  Welcome, ${user.userName.toUpperCase()}!`));
  }
  console.log(chalk.gray(getSeparator()));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.white.bold('Dashboard:'),
      choices: [
        { name: chalk.cyan('View Accounts'), value: 'accounts' },
        { name: chalk.cyan('View Positions'), value: 'positions' },
        { name: chalk.cyan('View Orders'), value: 'orders' },
        { name: chalk.cyan('View Stats'), value: 'stats' },
        { name: chalk.cyan('User Info'), value: 'userinfo' },
        new inquirer.Separator(),
        { name: chalk.magenta('Algo-Trading'), value: 'algotrading' },
        new inquirer.Separator(),
        { name: chalk.yellow('Update HQX'), value: 'update' },
        { name: chalk.red('Disconnect'), value: 'disconnect' },
        { name: chalk.red('Exit'), value: 'exit' }
      ],
      pageSize: 12
    }
  ]);

  return action;
};

/**
 * Handles the update process
 */
const handleUpdate = async () => {
  const spinner = ora('Checking for updates...').start();
  
  try {
    const cliPath = path.resolve(__dirname, '..');
    
    // Stash local changes
    try {
      execSync('git stash', { cwd: cliPath, stdio: 'pipe' });
    } catch (e) { /* ignore */ }
    
    // Pull latest
    execSync('git pull origin main', { cwd: cliPath, stdio: 'pipe' });
    
    spinner.text = 'Installing dependencies...';
    execSync('npm install', { cwd: cliPath, stdio: 'pipe' });
    
    spinner.succeed('Updated successfully! Please restart the CLI.');
    process.exit(0);
  } catch (error) {
    spinner.fail('Update failed: ' + error.message);
  }
};

/**
 * Main application loop
 */
const run = async () => {
  await banner();
  
  // Try to restore session
  const spinner = ora('Restoring session...').start();
  const restored = await connections.restoreFromStorage();
  
  if (restored) {
    spinner.succeed('Session restored');
    currentService = connections.getAll()[0].service;
  } else {
    spinner.info('No active session');
  }

  // Main loop
  while (true) {
    if (!connections.isConnected()) {
      const choice = await mainMenu();
      
      if (choice === 'exit') {
        console.log(chalk.gray('Goodbye!'));
        process.exit(0);
      }
      
      if (choice === 'projectx') {
        const service = await projectXMenu();
        if (service) currentService = service;
      }
    } else {
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
          console.log(chalk.yellow('Algo-Trading coming soon...'));
          await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
          break;
        case 'update':
          await handleUpdate();
          break;
        case 'disconnect':
          connections.disconnectAll();
          currentService = null;
          console.log(chalk.yellow('Disconnected'));
          break;
        case 'exit':
          console.log(chalk.gray('Goodbye!'));
          process.exit(0);
      }
    }
  }
};

module.exports = { run, banner, loginPrompt, mainMenu, dashboardMenu };
