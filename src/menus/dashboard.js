/**
 * Dashboard Menu - Main menu after login
 * Shows connected PropFirms and navigation options
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const { execSync, spawn } = require('child_process');

const { connections } = require('../services');
const { getLogoWidth, centerText } = require('../ui');

/**
 * Dashboard menu after login
 * @param {Object} service - Connected service
 */
const dashboardMenu = async (service) => {
  const user = service.user;
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2; // Same width as logo (inner width)
  
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
  console.log(chalk.cyan('║') + chalk.yellow.bold(centerLine('Welcome, HQX Trader!', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Connection info - show all active connections in boxes (max 3 per row)
  const allConns = connections.getAll();
  if (allConns.length > 0) {
    const maxPerRow = 3;
    const boxPadding = 2; // padding inside each mini-box
    const gap = 2; // gap between boxes
    
    // Calculate box width based on number of connections (max 3)
    const numBoxes = Math.min(allConns.length, maxPerRow);
    const totalGaps = (numBoxes - 1) * gap;
    const connBoxWidth = Math.floor((W - totalGaps - 2) / numBoxes); // -2 for outer padding
    
    // Process connections in rows of 3
    for (let rowStart = 0; rowStart < allConns.length; rowStart += maxPerRow) {
      const rowConns = allConns.slice(rowStart, rowStart + maxPerRow);
      const numInRow = rowConns.length;
      const rowBoxWidth = Math.floor((W - (numInRow - 1) * gap - 2) / numInRow);
      
      // Top border of boxes
      let topLine = ' ';
      for (let i = 0; i < numInRow; i++) {
        topLine += '┌' + '─'.repeat(rowBoxWidth - 2) + '┐';
        if (i < numInRow - 1) topLine += ' '.repeat(gap);
      }
      const topPad = W - topLine.length;
      console.log(chalk.cyan('║') + chalk.green(topLine) + ' '.repeat(Math.max(0, topPad)) + chalk.cyan('║'));
      
      // Content of boxes
      let contentLine = ' ';
      for (let i = 0; i < numInRow; i++) {
        const connText = rowConns[i].propfirm || rowConns[i].type || 'Connected';
        const truncated = connText.length > rowBoxWidth - 4 ? connText.slice(0, rowBoxWidth - 7) + '...' : connText;
        const innerWidth = rowBoxWidth - 4; // -2 for borders, -2 for padding
        const textPad = Math.floor((innerWidth - truncated.length) / 2);
        const textPadRight = innerWidth - truncated.length - textPad;
        contentLine += '│ ' + ' '.repeat(textPad) + truncated + ' '.repeat(textPadRight) + ' │';
        if (i < numInRow - 1) contentLine += ' '.repeat(gap);
      }
      const contentPad = W - contentLine.length;
      console.log(chalk.cyan('║') + chalk.green(contentLine) + ' '.repeat(Math.max(0, contentPad)) + chalk.cyan('║'));
      
      // Bottom border of boxes
      let bottomLine = ' ';
      for (let i = 0; i < numInRow; i++) {
        bottomLine += '└' + '─'.repeat(rowBoxWidth - 2) + '┘';
        if (i < numInRow - 1) bottomLine += ' '.repeat(gap);
      }
      const bottomPad = W - bottomLine.length;
      console.log(chalk.cyan('║') + chalk.green(bottomLine) + ' '.repeat(Math.max(0, bottomPad)) + chalk.cyan('║'));
    }
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
  const pkg = require('../../package.json');
  const currentVersion = pkg.version;
  const spinner = ora('Checking for updates...').start();
  
  try {
    // Check latest version on npm
    spinner.text = 'Checking npm registry...';
    let latestVersion;
    try {
      latestVersion = execSync('npm view hedgequantx version', { stdio: 'pipe' }).toString().trim();
    } catch (e) {
      spinner.fail('Cannot reach npm registry');
      console.log();
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      return;
    }
    
    if (currentVersion === latestVersion) {
      spinner.succeed('Already up to date!');
      console.log();
      console.log(chalk.green(`  ✓ You have the latest version of HedgeQuantX CLI: v${currentVersion}`));
      console.log();
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      return;
    }
    
    // Update via npm
    spinner.text = `Updating v${currentVersion} -> v${latestVersion}...`;
    try {
      execSync('npm install -g hedgequantx@latest', { stdio: 'pipe' });
    } catch (e) {
      spinner.fail('Update failed - try manually: npm install -g hedgequantx@latest');
      console.log(chalk.gray(`  Error: ${e.message}`));
      console.log();
      await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
      return;
    }
    
    spinner.succeed('CLI updated!');
    console.log();
    console.log(chalk.green(`  ✓ Updated: v${currentVersion} -> v${latestVersion}`));
    console.log();
    console.log(chalk.cyan('  Restarting HedgeQuantX CLI...'));
    console.log();
    
    // Small delay so user can see the message
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Restart the CLI automatically
    const child = spawn('hedgequantx', [], {
      stdio: 'inherit',
      detached: true,
      shell: true
    });
    child.unref();
    process.exit(0);
    
  } catch (error) {
    spinner.fail('Update failed: ' + error.message);
    console.log(chalk.yellow('  Try manually: npm install -g hedgequantx@latest'));
    console.log();
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
  }
};

module.exports = {
  dashboardMenu,
  handleUpdate
};
