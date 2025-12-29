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
const { RithmicService } = require('./services/rithmic');
const { TradovateService } = require('./services/tradovate');
const { PROPFIRM_CHOICES, getPropFirmsByPlatform, getPropFirm } = require('./config');
const { getDevice, getSeparator, printLogo, getLogoWidth, drawBoxHeader, drawBoxFooter, centerText, createBoxMenu } = require('./ui');
const { validateUsername, validatePassword, maskSensitive } = require('./security');

// Pages
const { showStats } = require('./pages/stats');
const { showAccounts } = require('./pages/accounts');
const { algoTradingMenu } = require('./pages/algo');

// Current service reference
let currentService = null;
let currentPlatform = null; // 'projectx' or 'rithmic'

/**
 * Displays the application banner with stats if connected
 */
const banner = async () => {
  console.clear();
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const version = require('../package.json').version;
  
  // Get stats if connected (only active accounts: status === 0)
  let statsInfo = null;
  if (connections.count() > 0) {
    try {
      const allAccounts = await connections.getAllAccounts();
      const activeAccounts = allAccounts.filter(acc => acc.status === 0);
      let totalBalance = 0;
      let totalStartingBalance = 0;
      let totalPnl = 0;
      
      activeAccounts.forEach(account => {
        totalBalance += account.balance || 0;
        totalStartingBalance += account.startingBalance || 0;
        totalPnl += account.profitAndLoss || 0;
      });
      
      const pnl = totalPnl !== 0 ? totalPnl : (totalBalance - totalStartingBalance);
      const pnlPercent = totalStartingBalance > 0 ? ((pnl / totalStartingBalance) * 100).toFixed(1) : '0.0';
      
      statsInfo = {
        connections: connections.count(),
        accounts: activeAccounts.length,
        balance: totalBalance,
        pnl: pnl,
        pnlPercent: pnlPercent
      };
    } catch (e) {
      // Ignore errors
    }
  }
  
  // Draw logo HEDGEQUANTX
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  
  const logo = [
    '██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗',
    '██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝',
    '███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ',
    '██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ',
    '██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ',
    '╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   '
  ];
  const logoX = [
    '██╗  ██╗',
    '╚██╗██╔╝',
    ' ╚███╔╝ ',
    ' ██╔██╗ ',
    '██╔╝ ██╗',
    '╚═╝  ╚═╝'
  ];
  
  logo.forEach((line, i) => {
    const mainPart = chalk.cyan(line);
    const xPart = chalk.yellow(logoX[i]);
    const fullLine = mainPart + xPart;
    const totalLen = line.length + logoX[i].length;
    const padding = innerWidth - totalLen;
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    console.log(chalk.cyan('║') + ' '.repeat(leftPad) + fullLine + ' '.repeat(rightPad) + chalk.cyan('║'));
  });
  
  // Tagline
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  console.log(chalk.cyan('║') + chalk.white(centerText(`Prop Futures Algo Trading  v${version}`, innerWidth)) + chalk.cyan('║'));
  
  // Stats bar if connected
  if (statsInfo) {
    console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
    
    const pnlColor = statsInfo.pnl >= 0 ? chalk.green : chalk.red;
    const pnlSign = statsInfo.pnl >= 0 ? '+' : '';
    
    const connStr = `Connections: ${statsInfo.connections}`;
    const accStr = `Accounts: ${statsInfo.accounts}`;
    const balStr = `Balance: $${statsInfo.balance.toLocaleString()}`;
    const pnlStr = `P&L: $${statsInfo.pnl.toLocaleString()} (${pnlSign}${statsInfo.pnlPercent}%)`;
    
    // Build full stats text and calculate padding
    const statsText = `${connStr}    ${accStr}    ${balStr}    ${pnlStr}`;
    const statsLen = statsText.length;
    const statsLeftPad = Math.floor((innerWidth - statsLen) / 2);
    const statsRightPad = innerWidth - statsLen - statsLeftPad;
    
    console.log(chalk.cyan('║') + ' '.repeat(statsLeftPad) +
      chalk.white(connStr) + '    ' +
      chalk.white(accStr) + '    ' +
      chalk.white('Balance: ') + chalk.green(`$${statsInfo.balance.toLocaleString()}`) + '    ' +
      chalk.white('P&L: ') + pnlColor(`$${statsInfo.pnl.toLocaleString()} (${pnlSign}${statsInfo.pnlPercent}%)`) + 
      ' '.repeat(statsRightPad) + chalk.cyan('║')
    );
  }
  
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
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
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const numCols = 3;
  const colWidth = Math.floor(innerWidth / numCols);
  
  // Build numbered list
  const numbered = propfirms.map((pf, i) => ({
    num: i + 1,
    key: pf.key,
    name: pf.displayName
  }));
  
  // PropFirm selection box
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  
  // Display in 3 columns with fixed width alignment
  const rows = Math.ceil(numbered.length / numCols);
  const maxNum = numbered.length;
  const numWidth = maxNum >= 10 ? 4 : 3; // [XX] or [X]
  
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < numCols; col++) {
      const idx = row + col * rows;
      if (idx < numbered.length) {
        const item = numbered[idx];
        const numStr = item.num.toString().padStart(2, ' ');
        const coloredText = chalk.cyan(`[${numStr}]`) + ' ' + chalk.white(item.name);
        const textLen = 4 + 1 + item.name.length; // [XX] + space + name
        const padding = colWidth - textLen - 2;
        line += '  ' + coloredText + ' '.repeat(Math.max(0, padding));
      } else {
        line += ' '.repeat(colWidth);
      }
    }
    // Adjust for exact width
    const lineLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    const adjust = innerWidth - lineLen;
    console.log(chalk.cyan('║') + line + ' '.repeat(Math.max(0, adjust)) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  const backText = '  ' + chalk.red('[X] Back');
  const backLen = '[X] Back'.length + 2;
  console.log(chalk.cyan('║') + backText + ' '.repeat(innerWidth - backLen) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  const validInputs = numbered.map(n => n.num.toString());
  validInputs.push('x', 'X');
  
  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan(`Enter choice (1-${numbered.length}/X):`),
      validate: (input) => {
        if (validInputs.includes(input)) return true;
        return `Please enter 1-${numbered.length} or X`;
      }
    }
  ]);

  if (action.toLowerCase() === 'x') return null;
  
  const selectedIdx = parseInt(action) - 1;
  const selectedPropfirm = numbered[selectedIdx];

  const credentials = await loginPrompt(selectedPropfirm.name);
  const spinner = ora('Authenticating...').start();

  try {
    const service = new ProjectXService(selectedPropfirm.key);
    const result = await service.login(credentials.username, credentials.password);

    if (result.success) {
      await service.getUser();
      connections.add('projectx', service, service.propfirm.name);
      currentService = service;
      currentPlatform = 'projectx';
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
 * Rithmic platform connection menu
 */
const rithmicMenu = async () => {
  const propfirms = getPropFirmsByPlatform('Rithmic');
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const numCols = 3;
  const colWidth = Math.floor(innerWidth / numCols);
  
  // Build numbered list
  const numbered = propfirms.map((pf, i) => ({
    num: i + 1,
    key: pf.key,
    name: pf.displayName,
    systemName: pf.rithmicSystem
  }));
  
  // PropFirm selection box
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM (RITHMIC)', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  
  // Display in 3 columns with fixed width alignment
  const rows = Math.ceil(numbered.length / numCols);
  
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < numCols; col++) {
      const idx = row + col * rows;
      if (idx < numbered.length) {
        const item = numbered[idx];
        const numStr = item.num.toString().padStart(2, ' ');
        const coloredText = chalk.cyan(`[${numStr}]`) + ' ' + chalk.white(item.name);
        const textLen = 4 + 1 + item.name.length;
        const padding = colWidth - textLen - 2;
        line += '  ' + coloredText + ' '.repeat(Math.max(0, padding));
      } else {
        line += ' '.repeat(colWidth);
      }
    }
    const lineLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    const adjust = innerWidth - lineLen;
    console.log(chalk.cyan('║') + line + ' '.repeat(Math.max(0, adjust)) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  const backText = '  ' + chalk.red('[X] Back');
  const backLen = '[X] Back'.length + 2;
  console.log(chalk.cyan('║') + backText + ' '.repeat(innerWidth - backLen) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  const validInputs = numbered.map(n => n.num.toString());
  validInputs.push('x', 'X');
  
  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan(`Enter choice (1-${numbered.length}/X):`),
      validate: (input) => {
        if (validInputs.includes(input)) return true;
        return `Please enter 1-${numbered.length} or X`;
      }
    }
  ]);

  if (action.toLowerCase() === 'x') return null;
  
  const selectedIdx = parseInt(action) - 1;
  const selectedPropfirm = numbered[selectedIdx];

  const credentials = await loginPrompt(selectedPropfirm.name);
  const spinner = ora('Connecting to Rithmic...').start();

  try {
    const service = new RithmicService(selectedPropfirm.key);
    const result = await service.login(credentials.username, credentials.password);

    if (result.success) {
      spinner.text = 'Fetching accounts...';
      const accResult = await service.getTradingAccounts();
      
      connections.add('rithmic', service, service.propfirm.name);
      currentService = service;
      currentPlatform = 'rithmic';
      spinner.succeed(`Connected to ${service.propfirm.name} (${accResult.accounts?.length || 0} accounts)`);
      
      // Small pause to see the success message
      await new Promise(r => setTimeout(r, 1500));
      return service;
    } else {
      spinner.fail(result.error || 'Authentication failed');
      await new Promise(r => setTimeout(r, 2000));
      return null;
    }
  } catch (error) {
    spinner.fail(`Connection error: ${error.message}`);
    await new Promise(r => setTimeout(r, 2000));
    return null;
  }
};

/**
 * Tradovate platform connection menu
 */
const tradovateMenu = async () => {
  const propfirms = getPropFirmsByPlatform('Tradovate');
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  
  // Build numbered list
  const numbered = propfirms.map((pf, i) => ({
    num: i + 1,
    key: pf.key,
    name: pf.displayName
  }));
  
  // PropFirm selection box
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM (TRADOVATE)', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  
  // Display propfirms
  for (const item of numbered) {
    const numStr = item.num.toString().padStart(2, ' ');
    const text = '  ' + chalk.cyan(`[${numStr}]`) + ' ' + chalk.white(item.name);
    const textLen = 4 + 1 + item.name.length + 2;
    console.log(chalk.cyan('║') + text + ' '.repeat(innerWidth - textLen) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  const backText = '  ' + chalk.red('[X] Back');
  const backLen = '[X] Back'.length + 2;
  console.log(chalk.cyan('║') + backText + ' '.repeat(innerWidth - backLen) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  const validInputs = numbered.map(n => n.num.toString());
  validInputs.push('x', 'X');
  
  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan(`Enter choice (1-${numbered.length}/X):`),
      validate: (input) => {
        if (validInputs.includes(input)) return true;
        return `Please enter 1-${numbered.length} or X`;
      }
    }
  ]);

  if (action.toLowerCase() === 'x') return null;
  
  const selectedIdx = parseInt(action) - 1;
  const selectedPropfirm = numbered[selectedIdx];

  const credentials = await loginPrompt(selectedPropfirm.name);
  const spinner = ora('Connecting to Tradovate...').start();

  try {
    const service = new TradovateService(selectedPropfirm.key);
    const result = await service.login(credentials.username, credentials.password);

    if (result.success) {
      spinner.text = 'Fetching accounts...';
      await service.getTradingAccounts();
      
      connections.add('tradovate', service, service.propfirm.name);
      currentService = service;
      currentPlatform = 'tradovate';
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
 * Add Prop Account menu (select platform)
 */
const addPropAccountMenu = async () => {
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const col1Width = Math.floor(innerWidth / 2);
  const col2Width = innerWidth - col1Width;
  
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('ADD PROP ACCOUNT', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  
  const menuRow = (left, right) => {
    const leftText = '  ' + left;
    const rightText = right ? '  ' + right : '';
    const leftLen = leftText.replace(/\x1b\[[0-9;]*m/g, '').length;
    const rightLen = rightText.replace(/\x1b\[[0-9;]*m/g, '').length;
    const leftPad = col1Width - leftLen;
    const rightPad = col2Width - rightLen;
    console.log(chalk.cyan('║') + leftText + ' '.repeat(Math.max(0, leftPad)) + rightText + ' '.repeat(Math.max(0, rightPad)) + chalk.cyan('║'));
  };
  
  menuRow(chalk.cyan('[1] ProjectX'), chalk.cyan('[2] Rithmic'));
  menuRow(chalk.cyan('[3] Tradovate'), chalk.red('[X] Back'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan('Enter choice (1/2/3/X):'),
      validate: (input) => {
        const valid = ['1', '2', '3', 'x', 'X'];
        if (valid.includes(input)) return true;
        return 'Please enter 1, 2, 3 or X';
      }
    }
  ]);

  const actionMap = {
    '1': 'projectx',
    '2': 'rithmic',
    '3': 'tradovate',
    'x': null,
    'X': null
  };

  return actionMap[action];
};

/**
 * Main connection menu
 */
const mainMenu = async () => {
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const col1Width = Math.floor(innerWidth / 2);
  const col2Width = innerWidth - col1Width;
  
  // Connection menu box
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PLATFORM', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  
  // Menu row helper (2 columns)
  const menuRow = (left, right) => {
    const leftText = '  ' + left;
    const rightText = right ? '  ' + right : '';
    const leftLen = leftText.replace(/\x1b\[[0-9;]*m/g, '').length;
    const rightLen = rightText.replace(/\x1b\[[0-9;]*m/g, '').length;
    const leftPad = col1Width - leftLen;
    const rightPad = col2Width - rightLen;
    console.log(chalk.cyan('║') + leftText + ' '.repeat(Math.max(0, leftPad)) + rightText + ' '.repeat(Math.max(0, rightPad)) + chalk.cyan('║'));
  };
  
  menuRow(chalk.cyan('[1] ProjectX'), chalk.cyan('[2] Rithmic'));
  menuRow(chalk.cyan('[3] Tradovate'), chalk.red('[X] Exit'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan('Enter choice (1/2/3/X):'),
      validate: (input) => {
        const valid = ['1', '2', '3', 'x', 'X'];
        if (valid.includes(input)) return true;
        return 'Please enter 1, 2, 3 or X';
      }
    }
  ]);

  // Map input to action
  const actionMap = {
    '1': 'projectx',
    '2': 'rithmic',
    '3': 'tradovate',
    'x': 'exit',
    'X': 'exit'
  };

  return actionMap[action] || 'exit';
};

/**
 * Dashboard menu after login
 * @param {Object} service - Connected service
 */
const dashboardMenu = async (service) => {
  const user = service.user;
  const W = 60; // Fixed width for dashboard box
  
  // Helper to center text
  const centerLine = (text, width) => {
    const pad = Math.floor((width - text.length) / 2);
    return ' '.repeat(Math.max(0, pad)) + text + ' '.repeat(Math.max(0, width - pad - text.length));
  };
  
  // Helper to pad text left
  const padLine = (text, width) => {
    return ' ' + text + ' '.repeat(Math.max(0, width - text.length - 1));
  };
  
  // Dashboard box header
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerLine('DASHBOARD', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Connection info - show all active connections
  const allConns = connections.getAll();
  if (allConns.length > 0) {
    const connNames = allConns.map(c => c.propfirm || c.type).join(', ');
    const connText = `Connected to ${connNames}`;
    console.log(chalk.cyan('║') + chalk.green(padLine(connText, W)) + chalk.cyan('║'));
  }
  
  if (user) {
    const userText = 'Welcome, ' + user.userName.toUpperCase() + '!';
    console.log(chalk.cyan('║') + chalk.white(padLine(userText, W)) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Menu options in 2 columns
  const col1Width = Math.floor(W / 2);
  const col2Width = W - col1Width;
  
  const menuRow = (left, right) => {
    const leftPlain = left.replace(/\x1b\[[0-9;]*m/g, '');
    const rightPlain = right ? right.replace(/\x1b\[[0-9;]*m/g, '') : '';
    const leftPad = ' '.repeat(Math.max(0, col1Width - leftPlain.length - 2));
    const rightPad = ' '.repeat(Math.max(0, col2Width - rightPlain.length - 2));
    console.log(chalk.cyan('║') + '  ' + left + leftPad + '  ' + (right || '') + rightPad + chalk.cyan('║'));
  };
  
  menuRow(chalk.cyan('[1] View Accounts'), chalk.cyan('[2] View Stats'));
  menuRow(chalk.cyan('[+] Add Prop-Account'), chalk.cyan('[A] Algo-Trading'));
  menuRow(chalk.yellow('[U] Update HQX'), chalk.red('[X] Disconnect'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan('Enter choice (1/2/+/A/U/X):'),
      validate: (input) => {
        const valid = ['1', '2', '+', 'a', 'A', 'u', 'U', 'x', 'X'];
        if (valid.includes(input)) return true;
        return 'Please enter a valid option';
      }
    }
  ]);

  // Map input to action
  const actionMap = {
    '1': 'accounts',
    '2': 'stats',
    '+': 'add_prop_account',
    'a': 'algotrading',
    'A': 'algotrading',
    'u': 'update',
    'U': 'update',
    'x': 'disconnect',
    'X': 'disconnect'
  };

  return actionMap[action] || 'accounts';
};

/**
 * Handles the update process with auto-restart
 */
const handleUpdate = async () => {
  const { spawn, execSync: exec } = require('child_process');
  const pkg = require('../package.json');
  const currentVersion = pkg.version;
  const spinner = ora('Checking for updates...').start();
  
  try {
    // Check latest version on npm
    spinner.text = 'Checking npm registry...';
    let latestVersion;
    try {
      latestVersion = exec('npm view hedgequantx version', { stdio: 'pipe' }).toString().trim();
    } catch (e) {
      spinner.fail('Cannot reach npm registry');
      return;
    }
    
    if (currentVersion === latestVersion) {
      spinner.succeed('Already up to date!');
      console.log(chalk.cyan(`  Version: v${currentVersion}`));
      return;
    }
    
    // Update via npm
    spinner.text = `Updating v${currentVersion} -> v${latestVersion}...`;
    try {
      exec('npm install -g hedgequantx@latest', { stdio: 'pipe' });
    } catch (e) {
      // Try with sudo on Unix systems
      if (process.platform !== 'win32') {
        try {
          exec('sudo npm install -g hedgequantx@latest', { stdio: 'pipe' });
        } catch (e2) {
          spinner.fail('Update failed - try manually: npm install -g hedgequantx@latest');
          return;
        }
      } else {
        spinner.fail('Update failed - try manually: npm install -g hedgequantx@latest');
        return;
      }
    }
    
    spinner.succeed('CLI updated!');
    console.log();
    console.log(chalk.green(`  Version: v${currentVersion} -> v${latestVersion}`));
    console.log();
    console.log(chalk.cyan('  Restarting...'));
    console.log();
    
    // Restart CLI
    const cliPath = exec('npm root -g', { stdio: 'pipe' }).toString().trim();
    const child = spawn(process.argv[0], [path.join(cliPath, 'hedgequantx', 'bin', 'cli.js')], {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('exit', (code) => {
      process.exit(code);
    });
    
    // Stop current process loop
    return 'restart';
    
  } catch (error) {
    spinner.fail('Update failed: ' + error.message);
    console.log(chalk.yellow('  Try manually: npm install -g hedgequantx@latest'));
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
    // Refresh banner with stats
    await banner();
    
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
      
      if (choice === 'rithmic') {
        const service = await rithmicMenu();
        if (service) currentService = service;
      }
      
      if (choice === 'tradovate') {
        const service = await tradovateMenu();
        if (service) currentService = service;
      }
    } else {
      const action = await dashboardMenu(currentService);
      
      switch (action) {
        case 'accounts':
          await showAccounts(currentService);
          break;

        case 'stats':
          await showStats(currentService);
          break;
        case 'add_prop_account':
          // Show platform selection menu
          const platformChoice = await addPropAccountMenu();
          if (platformChoice === 'projectx') {
            const newService = await projectXMenu();
            if (newService) currentService = newService;
          } else if (platformChoice === 'rithmic') {
            const newService = await rithmicMenu();
            if (newService) currentService = newService;
          } else if (platformChoice === 'tradovate') {
            const newService = await tradovateMenu();
            if (newService) currentService = newService;
          }
          break;
        case 'algotrading':
          await algoTradingMenu(currentService);
          break;
        case 'update':
          const updateResult = await handleUpdate();
          if (updateResult === 'restart') return; // Stop loop, new process spawned
          break;
        case 'disconnect':
          const connCount = connections.count();
          connections.disconnectAll();
          currentService = null;
          console.log(chalk.yellow(`Disconnected ${connCount} connection${connCount > 1 ? 's' : ''}`));
          break;
        case 'exit':
          console.log(chalk.gray('Goodbye!'));
          process.exit(0);
      }
    }
  }
};

module.exports = { run, banner, loginPrompt, mainMenu, dashboardMenu };
