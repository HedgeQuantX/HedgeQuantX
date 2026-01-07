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
  
  // New box for dashboard menu
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(makeLine(chalk.yellow.bold('Welcome, HQX Trader!'), 'center'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Show connected propfirms
  const allConns = connections.getAll();
  if (allConns.length > 0) {
    const propfirms = allConns.slice(0, 3).map(c => c.propfirm || c.type || 'Connected');
    const propfirmText = propfirms.map(p => chalk.green('● ') + chalk.white(p)).join('    ');
    console.log(makeLine(propfirmText, 'center'));
  }
  
  // Stats bar with centered columns
  const statsInfo = getCachedStats();
  if (statsInfo) {
    console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
    
    const balStr = statsInfo.balance !== null ? `$${statsInfo.balance.toLocaleString()}` : '--';
    const balColor = statsInfo.balance !== null ? chalk.green : chalk.gray;
    
    // AI Agents status
    const agentCount = statsInfo.agents || 0;
    const agentDisplay = agentCount > 0 ? 'ON' : 'OFF';
    const agentColor = agentCount > 0 ? chalk.green : chalk.red;
    
    // Fixed width columns for alignment (3 columns)
    const icon = chalk.yellow('✔ ');
    const colWidth = Math.floor(W / 3);
    
    const formatCol = (label, value, valueColor = chalk.white) => {
      const text = `✔ ${label}: ${value}`;
      const textLen = text.length;
      const padLeft = Math.floor((colWidth - textLen) / 2);
      const padRight = colWidth - textLen - padLeft;
      return ' '.repeat(Math.max(0, padLeft)) + icon + chalk.white(label + ': ') + valueColor(value) + ' '.repeat(Math.max(0, padRight));
    };
    
    const col1 = formatCol('Accounts', String(statsInfo.accounts));
    const col2 = formatCol('Balance', balStr, balColor);
    const col3 = formatCol('AI Agents', agentDisplay, agentColor);
    
    const statsLine = col1 + col2 + col3;
    const statsPlainLen = statsLine.replace(/\x1b\[[0-9;]*m/g, '').length;
    const extraPad = W - statsPlainLen;
    
    console.log(chalk.cyan('║') + statsLine + ' '.repeat(Math.max(0, extraPad)) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Menu in 2 columns - aligned
  const col1Width = Math.floor(W / 2);
  const col2Width = W - col1Width;
  
  // Find max width for alignment
  const menuItems = [
    { left: '[1] View Accounts', right: '[2] View Stats' },
    { left: '[+] Add Prop-Account', right: '[A] Algo-Trading' },
    { left: '[I] AI Agents', right: '[U] Update HQX' },
    { left: '', right: '[X] Disconnect' },
  ];
  
  const maxLeftLen = Math.max(...menuItems.map(m => m.left.length));
  const maxRightLen = Math.max(...menuItems.map(m => m.right.length));
  
  const menuRow = (left, right, leftColor, rightColor) => {
    const leftPlain = left;
    const rightPlain = right;
    
    // Pad left item to max width, then center in column
    const leftPadded = leftPlain.padEnd(maxLeftLen);
    const leftTotalPad = col1Width - maxLeftLen;
    const leftPadL = Math.floor(leftTotalPad / 2);
    const leftPadR = leftTotalPad - leftPadL;
    
    // Pad right item to max width, then center in column
    const rightPadded = rightPlain.padEnd(maxRightLen);
    const rightTotalPad = col2Width - maxRightLen;
    const rightPadL = Math.floor(rightTotalPad / 2);
    const rightPadR = rightTotalPad - rightPadL;
    
    console.log(
      chalk.cyan('║') + 
      ' '.repeat(leftPadL) + leftColor(leftPadded) + ' '.repeat(leftPadR) +
      ' '.repeat(rightPadL) + rightColor(rightPadded) + ' '.repeat(rightPadR) +
      chalk.cyan('║')
    );
  };
  
  menuRow('[1] View Accounts', '[2] View Stats', chalk.cyan, chalk.cyan);
  menuRow('[+] Add Prop-Account', '[A] Algo-Trading', chalk.cyan, chalk.magenta);
  menuRow('[I] AI Agents', '[U] Update HQX', chalk.green, chalk.yellow);
  menuRow('', '[X] Disconnect', chalk.white, chalk.red);
  
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
  
  // Simple input - no duplicate menu
  const input = await prompts.textInput(chalk.cyan('Select (1/2/+/A/I/U/X)'));
  
  const actionMap = {
    '1': 'accounts',
    '2': 'stats',
    '+': 'add_prop_account',
    'a': 'algotrading',
    'i': 'aiagents',
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
    
    console.log(chalk.cyan(`\n  Current version: v${currentVersion}`));
    spinner = ora({ text: 'Checking for updates...', color: 'yellow' }).start();
    
    let latestVersion;
    try {
      latestVersion = execSync('npm view hedgequantx version', { 
        stdio: ['pipe', 'pipe', 'pipe'], 
        timeout: 30000, 
        encoding: 'utf8'
      }).trim();
      
      if (!latestVersion || !/^\d+\.\d+\.\d+/.test(latestVersion)) {
        throw new Error('Invalid version format');
      }
    } catch (e) {
      spinner.fail('Cannot reach npm registry');
      console.log(chalk.gray(`  Error: ${e.message}`));
      console.log(chalk.yellow('  Try manually: npm install -g hedgequantx@latest'));
      await prompts.waitForEnter();
      return;
    }
    
    spinner.succeed(`Latest version: v${latestVersion}`);
    
    if (currentVersion === latestVersion) {
      console.log(chalk.green('  Already up to date!'));
      await prompts.waitForEnter();
      return;
    }
    
    console.log(chalk.yellow(`  Update available: v${currentVersion} → v${latestVersion}`));
    spinner = ora({ text: 'Installing update...', color: 'yellow' }).start();
    
    try {
      // Try with sudo first on Unix systems
      const isWindows = process.platform === 'win32';
      const cmd = isWindows 
        ? 'npm install -g hedgequantx@latest'
        : 'npm install -g hedgequantx@latest';
      
      execSync(cmd, { 
        stdio: ['pipe', 'pipe', 'pipe'], 
        timeout: 180000, 
        encoding: 'utf8'
      });
    } catch (e) {
      spinner.fail('Update failed - permission denied?');
      console.log(chalk.gray(`  Error: ${e.message}`));
      console.log(chalk.yellow('  Try manually with sudo:'));
      console.log(chalk.white('  sudo npm install -g hedgequantx@latest'));
      await prompts.waitForEnter();
      return;
    }
    
    spinner.succeed(`Updated to v${latestVersion}!`);
    console.log(chalk.cyan('  Restarting HQX...'));
    
    await new Promise(r => setTimeout(r, 1500));
    
    try {
      const child = spawn('hqx', [], { 
        stdio: 'inherit', 
        detached: true, 
        shell: true 
      });
      child.unref();
      process.exit(0);
    } catch (e) {
      console.log(chalk.yellow('\n  Please restart HQX manually:'));
      console.log(chalk.white('  hqx'));
      await prompts.waitForEnter();
    }
    
  } catch (error) {
    if (spinner) spinner.fail('Update error');
    console.log(chalk.gray(`  Error: ${error.message}`));
    console.log(chalk.yellow('  Try manually: npm install -g hedgequantx@latest'));
    await prompts.waitForEnter();
  }
};

module.exports = { dashboardMenu, handleUpdate };
