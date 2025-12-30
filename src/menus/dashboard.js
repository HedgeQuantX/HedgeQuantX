/**
 * Dashboard Menu - Main menu after login
 */

const chalk = require('chalk');
const ora = require('ora');
const { execSync, spawn } = require('child_process');

const { connections } = require('../services');
const { getLogoWidth, centerText, prepareStdin } = require('../ui');
const { getCachedStats } = require('../services/stats-cache');
const { prompts } = require('../utils');

/**
 * Dashboard menu after login
 */
const dashboardMenu = async (service) => {
  prepareStdin();
  
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content, align = 'left') => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    if (align === 'center') {
      const leftPad = Math.floor(padding / 2);
      return chalk.cyan('║') + ' '.repeat(leftPad) + content + ' '.repeat(padding - leftPad) + chalk.cyan('║');
    }
    return chalk.cyan('║') + content + ' '.repeat(Math.max(0, padding)) + chalk.cyan('║');
  };
  
  // Continue from banner (use ╠ not ╔)
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  console.log(makeLine(chalk.yellow.bold('Welcome, HQX Trader!'), 'center'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Show connected propfirms
  const allConns = connections.getAll();
  if (allConns.length > 0) {
    const propfirms = allConns.slice(0, 3).map(c => c.propfirm || c.type || 'Connected');
    const propfirmText = propfirms.map(p => chalk.green('● ') + chalk.white(p)).join('    ');
    console.log(makeLine(propfirmText, 'center'));
  }
  
  // Stats bar
  const statsInfo = getCachedStats();
  if (statsInfo) {
    console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
    
    const balStr = statsInfo.balance !== null ? `$${statsInfo.balance.toLocaleString()}` : '--';
    const balColor = statsInfo.balance !== null ? chalk.green : chalk.gray;
    
    let pnlDisplay, pnlColor;
    if (statsInfo.pnl !== null) {
      pnlColor = statsInfo.pnl >= 0 ? chalk.green : chalk.red;
      pnlDisplay = `${statsInfo.pnl >= 0 ? '+' : ''}$${Math.abs(statsInfo.pnl).toLocaleString()}`;
    } else {
      pnlColor = chalk.gray;
      pnlDisplay = '--';
    }
    
    const statsPlain = `Connections: ${statsInfo.connections}    Accounts: ${statsInfo.accounts}    Balance: ${balStr}    P&L: ${pnlDisplay}`;
    const statsLeftPad = Math.floor((W - statsPlain.length) / 2);
    const statsRightPad = W - statsPlain.length - statsLeftPad;
    
    console.log(chalk.cyan('║') + ' '.repeat(statsLeftPad) +
      chalk.white(`Connections: ${statsInfo.connections}`) + '    ' +
      chalk.white(`Accounts: ${statsInfo.accounts}`) + '    ' +
      chalk.white('Balance: ') + balColor(balStr) + '    ' +
      chalk.white('P&L: ') + pnlColor(pnlDisplay) +
      ' '.repeat(Math.max(0, statsRightPad)) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Menu in 2 columns
  const col1Width = Math.floor(W / 2);
  const menuRow = (left, right) => {
    const leftPlain = left.replace(/\x1b\[[0-9;]*m/g, '');
    const rightPlain = right.replace(/\x1b\[[0-9;]*m/g, '');
    const leftPadded = '  ' + left + ' '.repeat(Math.max(0, col1Width - leftPlain.length - 2));
    const rightPadded = right + ' '.repeat(Math.max(0, W - col1Width - rightPlain.length));
    console.log(chalk.cyan('║') + leftPadded + rightPadded + chalk.cyan('║'));
  };
  
  menuRow(chalk.cyan('[1] View Accounts'), chalk.cyan('[2] View Stats'));
  menuRow(chalk.cyan('[+] Add Prop-Account'), chalk.magenta('[A] Algo-Trading'));
  menuRow(chalk.yellow('[U] Update HQX'), chalk.red('[X] Disconnect'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
  
  // Simple input - no duplicate menu
  const input = await prompts.textInput('Select (1/2/+/A/U/X)');
  
  const actionMap = {
    '1': 'accounts',
    '2': 'stats',
    '+': 'add_prop_account',
    'a': 'algotrading',
    'u': 'update',
    'x': 'disconnect'
  };
  
  return actionMap[(input || '').toLowerCase()] || null;
};

/**
 * Handle update process
 */
const handleUpdate = async () => {
  prepareStdin();
  
  let spinner = null;
  let currentVersion = 'unknown';
  
  try {
    try {
      currentVersion = require('../../package.json').version || 'unknown';
    } catch (e) {}
    
    spinner = ora({ text: 'Checking for updates...', color: 'yellow' }).start();
    
    let latestVersion;
    try {
      latestVersion = execSync('npm view hedgequantx version 2>/dev/null', { 
        stdio: 'pipe', timeout: 15000, encoding: 'utf8'
      }).trim();
      
      if (!latestVersion || !/^\d+\.\d+\.\d+/.test(latestVersion)) {
        throw new Error('Invalid version');
      }
    } catch (e) {
      spinner.fail('Cannot reach npm registry');
      await prompts.waitForEnter();
      return;
    }
    
    if (currentVersion === latestVersion) {
      spinner.succeed(`Already up to date! (v${currentVersion})`);
      await new Promise(r => setTimeout(r, 2000));
      return;
    }
    
    spinner.text = `Updating v${currentVersion} → v${latestVersion}...`;
    
    try {
      execSync('npm install -g hedgequantx@latest 2>/dev/null', { 
        stdio: 'pipe', timeout: 120000, encoding: 'utf8'
      });
    } catch (e) {
      spinner.fail('Update failed');
      console.log(chalk.yellow('  Try: npm install -g hedgequantx@latest'));
      await prompts.waitForEnter();
      return;
    }
    
    spinner.succeed(`Updated: v${currentVersion} → v${latestVersion}`);
    console.log(chalk.cyan('  Restarting...'));
    
    await new Promise(r => setTimeout(r, 2000));
    
    try {
      const child = spawn('hedgequantx', [], { stdio: 'inherit', detached: true, shell: true });
      child.unref();
      process.exit(0);
    } catch (e) {
      console.log(chalk.yellow('  Please run: hedgequantx'));
      await prompts.waitForEnter();
    }
    
  } catch (error) {
    if (spinner) spinner.fail('Update error');
    console.log(chalk.yellow('  Try: npm install -g hedgequantx@latest'));
    await prompts.waitForEnter();
  }
};

module.exports = { dashboardMenu, handleUpdate };
