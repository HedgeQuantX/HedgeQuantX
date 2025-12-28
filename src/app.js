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
const { getDevice, getSeparator, printLogo, getLogoWidth, drawBoxHeader, drawBoxFooter, centerText, createBoxMenu } = require('./ui');
const { validateUsername, validatePassword, maskSensitive } = require('./security');

// Pages
const { showStats } = require('./pages/stats');
const { showAccounts } = require('./pages/accounts');
const { algoTradingMenu } = require('./pages/algo');

// Current service reference
let currentService = null;

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
    const balVal = `$${statsInfo.balance.toLocaleString()}`;
    const pnlVal = `$${statsInfo.pnl.toLocaleString()} (${pnlSign}${statsInfo.pnlPercent}%)`;
    
    const statsLen = connStr.length + 4 + accStr.length + 4 + 8 + balVal.length + 4 + 5 + pnlVal.length;
    const statsLeftPad = Math.floor((innerWidth - statsLen) / 2);
    const statsRightPad = innerWidth - statsLen - statsLeftPad;
    
    console.log(chalk.cyan('║') + ' '.repeat(statsLeftPad) +
      chalk.white(connStr) + '    ' +
      chalk.white(accStr) + '    ' +
      chalk.white('Balance: ') + chalk.green(balVal) + '    ' +
      chalk.white('P&L: ') + pnlColor(pnlVal) + ' '.repeat(statsRightPad) + chalk.cyan('║')
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
  
  // Display in 3 columns
  const rows = Math.ceil(numbered.length / numCols);
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < numCols; col++) {
      const idx = row + col * rows;
      if (idx < numbered.length) {
        const item = numbered[idx];
        const text = `[${item.num}] ${item.name}`;
        const coloredText = chalk.cyan(`[${item.num}]`) + ' ' + chalk.white(item.name);
        const textLen = text.length;
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
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const col1Width = Math.floor(innerWidth / 2);
  const col2Width = innerWidth - col1Width;
  
  // Connection menu box
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PLATFORM', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  
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
  
  menuRow(chalk.cyan('[1] ProjectX'), chalk.gray('[2] Rithmic (Coming Soon)'));
  menuRow(chalk.gray('[3] Tradovate (Coming Soon)'), chalk.red('[X] Exit'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan('Enter choice (1/X):'),
      validate: (input) => {
        const valid = ['1', 'x', 'X'];
        if (valid.includes(input)) return true;
        return 'Please enter 1 or X';
      }
    }
  ]);

  // Map input to action
  const actionMap = {
    '1': 'projectx',
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
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  
  // Dashboard box header
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('DASHBOARD', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  
  // Connection info
  const connInfo = chalk.green('Connected to ' + service.propfirm.name);
  const connLen = ('Connected to ' + service.propfirm.name).length;
  console.log(chalk.cyan('║') + '  ' + connInfo + ' '.repeat(innerWidth - connLen - 2) + chalk.cyan('║'));
  
  if (user) {
    const userInfo = 'Welcome, ' + user.userName.toUpperCase() + '!';
    console.log(chalk.cyan('║') + '  ' + chalk.white(userInfo) + ' '.repeat(innerWidth - userInfo.length - 2) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  
  // Menu options in 2 columns
  const col1Width = Math.floor(innerWidth / 2);
  const col2Width = innerWidth - col1Width;
  
  const menuRow = (left, right) => {
    const leftText = '  ' + left;
    const rightText = right ? '  ' + right : '';
    const leftPad = col1Width - leftText.replace(/\x1b\[[0-9;]*m/g, '').length;
    const rightPad = col2Width - rightText.replace(/\x1b\[[0-9;]*m/g, '').length;
    console.log(chalk.cyan('║') + leftText + ' '.repeat(Math.max(0, leftPad)) + rightText + ' '.repeat(Math.max(0, rightPad)) + chalk.cyan('║'));
  };
  
  menuRow(chalk.cyan('[1] View Accounts'), chalk.cyan('[2] View Stats'));
  menuRow(chalk.cyan('[+] Add Prop-Account'), chalk.cyan('[A] Algo-Trading'));
  menuRow(chalk.yellow('[U] Update HQX'), chalk.red('[X] Disconnect'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
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
  const { spawn } = require('child_process');
  const pkg = require('../package.json');
  const currentVersion = pkg.version;
  const spinner = ora('Checking for updates...').start();
  
  try {
    const cliPath = path.resolve(__dirname, '..');
    
    // Get current commit
    const beforeCommit = execSync('git rev-parse --short HEAD', { cwd: cliPath, stdio: 'pipe' }).toString().trim();
    
    // Fetch to check for updates
    execSync('git fetch origin main', { cwd: cliPath, stdio: 'pipe' });
    
    // Check if behind
    const behindCount = execSync('git rev-list HEAD..origin/main --count', { cwd: cliPath, stdio: 'pipe' }).toString().trim();
    
    if (parseInt(behindCount) === 0) {
      spinner.succeed('Already up to date!');
      console.log(chalk.cyan(`  Version: v${currentVersion}`));
      console.log(chalk.gray(`  Commit: ${beforeCommit}`));
      return;
    }
    
    // Stash local changes
    spinner.text = 'Stashing local changes...';
    try {
      execSync('git stash --include-untracked', { cwd: cliPath, stdio: 'pipe' });
    } catch (e) {
      // If stash fails, reset
      execSync('git checkout -- .', { cwd: cliPath, stdio: 'pipe' });
    }
    
    // Pull latest
    spinner.text = 'Downloading updates...';
    execSync('git pull origin main', { cwd: cliPath, stdio: 'pipe' });
    const afterCommit = execSync('git rev-parse --short HEAD', { cwd: cliPath, stdio: 'pipe' }).toString().trim();
    
    // Install dependencies
    spinner.text = 'Installing dependencies...';
    try {
      execSync('npm install --silent', { cwd: cliPath, stdio: 'pipe' });
    } catch (e) { /* ignore */ }
    
    // Get new version
    delete require.cache[require.resolve('../package.json')];
    const newPkg = require('../package.json');
    const newVersion = newPkg.version;
    
    spinner.succeed('CLI updated!');
    console.log();
    console.log(chalk.green(`  Version: v${currentVersion} -> v${newVersion}`));
    console.log(chalk.gray(`  Commits: ${beforeCommit} -> ${afterCommit} (${behindCount} new)`));
    console.log();
    console.log(chalk.cyan('  Restarting...'));
    console.log();
    
    // Restart CLI
    const child = spawn(process.argv[0], [path.join(cliPath, 'bin', 'cli.js')], {
      cwd: cliPath,
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
          const newService = await projectXMenu();
          if (newService) {
            currentService = newService;
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
