/**
 * Dashboard Menu - Main menu after login
 * Shows connected PropFirms and navigation options
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const { execSync, spawn } = require('child_process');

const { connections } = require('../services');
const { getLogoWidth, centerText, prepareStdin } = require('../ui');
const { getCachedStats } = require('../services/stats-cache');

/**
 * Dashboard menu after login
 * @param {Object} service - Connected service
 */
const dashboardMenu = async (service) => {
  // Ensure stdin is ready for prompts
  prepareStdin();
  
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2; // Inner width (without borders)
  
  // Helper to create a line that fits exactly in the box
  const makeLine = (content, align = 'left') => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    if (align === 'center') {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return chalk.cyan('║') + ' '.repeat(leftPad) + content + ' '.repeat(rightPad) + chalk.cyan('║');
    }
    return chalk.cyan('║') + content + ' '.repeat(Math.max(0, padding)) + chalk.cyan('║');
  };
  
  // Dashboard box header
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(makeLine(chalk.yellow.bold('Welcome, HQX Trader!'), 'center'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Show connected propfirms centered on one line (max 3)
  const allConns = connections.getAll();
  if (allConns.length > 0) {
    const propfirms = allConns.slice(0, 3).map(c => c.propfirm || c.type || 'Connected');
    const propfirmText = propfirms.map(p => chalk.green('● ') + chalk.white(p)).join('    ');
    console.log(makeLine(propfirmText, 'center'));
  }
  
  // Show stats bar (Connections, Accounts, Balance, P&L)
  const statsInfo = getCachedStats();
  
  if (statsInfo) {
    console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
    
    const connStr = `Connections: ${statsInfo.connections}`;
    const accStr = `Accounts: ${statsInfo.accounts}`;
    
    const balStr = statsInfo.balance !== null 
      ? `$${statsInfo.balance.toLocaleString()}` 
      : '--';
    const balColor = statsInfo.balance !== null ? chalk.green : chalk.gray;
    
    let pnlDisplay, pnlColor;
    if (statsInfo.pnl !== null) {
      const pnlSign = statsInfo.pnl >= 0 ? '+' : '';
      pnlColor = statsInfo.pnl >= 0 ? chalk.green : chalk.red;
      pnlDisplay = `${pnlSign}$${Math.abs(statsInfo.pnl).toLocaleString()}`;
    } else {
      pnlColor = chalk.gray;
      pnlDisplay = '--';
    }
    
    const statsText = connStr + '    ' + accStr + '    Balance: ' + balStr + '    P&L: ' + pnlDisplay;
    const statsPlain = `${connStr}    ${accStr}    Balance: ${balStr}    P&L: ${pnlDisplay}`;
    const statsLeftPad = Math.floor((W - statsPlain.length) / 2);
    const statsRightPad = W - statsPlain.length - statsLeftPad;
    
    console.log(chalk.cyan('║') + ' '.repeat(statsLeftPad) +
      chalk.white(connStr) + '    ' +
      chalk.white(accStr) + '    ' +
      chalk.white('Balance: ') + balColor(balStr) + '    ' +
      chalk.white('P&L: ') + pnlColor(pnlDisplay) +
      ' '.repeat(Math.max(0, statsRightPad)) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Menu options in 2 columns
  const col1Width = Math.floor(W / 2);
  
  const menuRow = (left, right) => {
    const leftPlain = left.replace(/\x1b\[[0-9;]*m/g, '');
    const rightPlain = right.replace(/\x1b\[[0-9;]*m/g, '');
    const leftPadded = '  ' + left + ' '.repeat(Math.max(0, col1Width - leftPlain.length - 2));
    const rightPadded = right + ' '.repeat(Math.max(0, W - col1Width - rightPlain.length));
    console.log(chalk.cyan('║') + leftPadded + rightPadded + chalk.cyan('║'));
  };
  
  // Display menu items in 2 columns inside the box
  menuRow(chalk.cyan('[1] View Accounts'), chalk.cyan('[2] View Stats'));
  menuRow(chalk.cyan('[+] Add Prop-Account'), chalk.magenta('[A] Algo-Trading'));
  menuRow(chalk.yellow('[U] Update HQX'), chalk.red('[X] Disconnect'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
  console.log();
  
  // Input prompt
  const { choice } = await inquirer.prompt([
    {
      type: 'input',
      name: 'choice',
      message: chalk.cyan('Select:'),
      prefix: ''
    }
  ]);
  
  // Map input to action
  const input = (choice || '').toString().toLowerCase().trim();
  const actionMap = {
    '1': 'accounts',
    '2': 'stats',
    '+': 'add_prop_account',
    'a': 'algotrading',
    'u': 'update',
    'x': 'disconnect'
  };
  
  return actionMap[input] || null;
};

/**
 * Wait for user to press Enter
 */
const waitForEnter = async () => {
  prepareStdin();
  try {
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to continue...' }]);
  } catch (e) {
    // Ignore prompt errors
  }
};

/**
 * Handles the update process with auto-restart
 * Robust version that handles all edge cases
 */
const handleUpdate = async () => {
  prepareStdin();
  
  let spinner = null;
  let currentVersion = 'unknown';
  let latestVersion = null;
  
  try {
    // Get current version safely
    try {
      const pkg = require('../../package.json');
      currentVersion = pkg.version || 'unknown';
    } catch (e) {
      currentVersion = 'unknown';
    }
    
    spinner = ora({ text: 'Checking for updates...', color: 'yellow' }).start();
    
    // Check latest version on npm with timeout
    spinner.text = 'Checking npm registry...';
    try {
      const result = execSync('npm view hedgequantx version 2>/dev/null', { 
        stdio: 'pipe',
        timeout: 15000,  // 15 second timeout
        encoding: 'utf8'
      });
      latestVersion = (result || '').toString().trim();
      
      // Validate version format (x.y.z)
      if (!latestVersion || !/^\d+\.\d+\.\d+/.test(latestVersion)) {
        throw new Error('Invalid version format received');
      }
    } catch (e) {
      spinner.fail('Cannot reach npm registry');
      console.log(chalk.gray('  Check your internet connection'));
      console.log();
      await waitForEnter();
      return;
    }
    
    // Compare versions
    if (currentVersion === latestVersion) {
      spinner.succeed(`Already up to date! (v${currentVersion})`);
      console.log();
      await new Promise(r => setTimeout(r, 2000));
      return;
    }
    
    // Show version info and update automatically
    spinner.text = `Updating v${currentVersion} → v${latestVersion}...`;
    
    try {
      execSync('npm install -g hedgequantx@latest 2>/dev/null', { 
        stdio: 'pipe',
        timeout: 120000,
        encoding: 'utf8'
      });
    } catch (e) {
      spinner.fail('Update failed');
      console.log();
      console.log(chalk.yellow('  Try manually:'));
      console.log(chalk.white('  npm install -g hedgequantx@latest'));
      console.log();
      await waitForEnter();
      return;
    }
    
    spinner.succeed(`Updated: v${currentVersion} → v${latestVersion}`);
    console.log();
    console.log(chalk.cyan('  Restarting HedgeQuantX CLI...'));
    console.log();
    
    // Auto restart after 2 seconds
    await new Promise(r => setTimeout(r, 2000));
    
    // Restart the CLI
    try {
      const child = spawn('hedgequantx', [], {
        stdio: 'inherit',
        detached: true,
        shell: true
      });
      child.unref();
      process.exit(0);
    } catch (e) {
      console.log(chalk.yellow('  Could not auto-restart. Please run: hedgequantx'));
      console.log();
      await waitForEnter();
    }
    
  } catch (error) {
    // Catch-all for any unexpected errors
    if (spinner) {
      try { spinner.fail('Update error'); } catch (e) {}
    }
    console.log();
    console.log(chalk.red('  An error occurred during update'));
    if (error && error.message) {
      console.log(chalk.gray(`  ${error.message.substring(0, 100)}`));
    }
    console.log();
    console.log(chalk.yellow('  Try manually: npm install -g hedgequantx@latest'));
    console.log();
    await waitForEnter();
  }
};

module.exports = {
  dashboardMenu,
  handleUpdate
};
