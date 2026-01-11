/**
 * Dashboard Menu - Main menu after login
 */

const chalk = require('chalk');
const ora = require('ora');
const { execSync, spawn } = require('child_process');

const { connections } = require('../services');
const { getLogoWidth, centerText, prepareStdin, displayBanner, clearScreen } = require('../ui');
const { getCachedStats } = require('../services/stats-cache');
const { prompts } = require('../utils');
const { getActiveAgentCount } = require('../pages/ai-agents');

/**
 * Dashboard menu after login
 */
const dashboardMenu = async (service) => {
  prepareStdin();
  
  // Stop any global spinner before clearing
  if (global.__hqxSpinner) {
    global.__hqxSpinner.stop();
    global.__hqxSpinner = null;
  }
  
  // Clear screen and show banner (always closed)
  clearScreen();
  displayBanner();
  
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
  
  // New rectangle (banner is always closed)
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(makeLine(chalk.yellow.bold('WELCOME, HQX TRADER!'), 'center'));
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
    
    // AI Agents status - get fresh count, not from cache
    const agentCount = getActiveAgentCount();
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
    { left: '[1] VIEW ACCOUNTS', right: '[2] VIEW STATS' },
    { left: '[+] ADD PROP-ACCOUNT', right: '[A] ALGO-TRADING' },
    { left: '[I] AI AGENTS', right: '[U] UPDATE HQX' },
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
  
  menuRow('[1] VIEW ACCOUNTS', '[2] VIEW STATS', chalk.cyan, chalk.cyan);
  menuRow('[+] ADD PROP-ACCOUNT', '[A] ALGO-TRADING', chalk.cyan, chalk.magenta);
  menuRow('[I] AI AGENTS', '[U] UPDATE HQX', chalk.green, chalk.yellow);
  
  // Separator and centered Disconnect button
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(makeLine(chalk.red('[X] DISCONNECT'), 'center'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
  
  // Simple input - no duplicate menu
  const input = await prompts.textInput(chalk.cyan('SELECT (1/2/+/A/I/U/X):'));
  
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
  clearScreen();
  displayBanner();
  prepareStdin();
  
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.yellow.bold(centerText('UPDATE HQX', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
  
  let spinner = null;
  let currentVersion = 'unknown';
  
  try {
    // Get current version
    try {
      currentVersion = require('../../package.json').version || 'unknown';
    } catch (e) {}
    
    console.log(chalk.cyan(`\n  CURRENT VERSION: V${currentVersion.toUpperCase()}`));
    spinner = ora({ text: 'CHECKING FOR UPDATES...', color: 'yellow' }).start();
    
    // Check latest version from npm
    let latestVersion;
    try {
      latestVersion = execSync('npm view hedgequantx version 2>/dev/null', { 
        stdio: ['pipe', 'pipe', 'pipe'], 
        timeout: 30000, 
        encoding: 'utf8'
      }).trim();
      
      if (!latestVersion || !/^\d+\.\d+\.\d+/.test(latestVersion)) {
        throw new Error('INVALID VERSION FORMAT');
      }
    } catch (e) {
      spinner.fail('CANNOT REACH NPM REGISTRY');
      console.log(chalk.yellow('\n  TRY MANUALLY: npm update -g hedgequantx'));
      await prompts.waitForEnter();
      return;
    }
    
    spinner.succeed(`LATEST VERSION: V${latestVersion.toUpperCase()}`);
    
    // Already up to date
    if (currentVersion === latestVersion) {
      console.log(chalk.green('\n  ✓ ALREADY UP TO DATE!'));
      await prompts.waitForEnter();
      return;
    }
    
    // Update available
    console.log(chalk.yellow(`\n  UPDATE AVAILABLE: V${currentVersion} → V${latestVersion}`));
    spinner = ora({ text: 'INSTALLING UPDATE...', color: 'yellow' }).start();
    
    // Try to install update
    try {
      execSync('npm update -g hedgequantx 2>/dev/null', { 
        stdio: ['pipe', 'pipe', 'pipe'], 
        timeout: 180000, 
        encoding: 'utf8'
      });
    } catch (e) {
      // Try without redirecting stderr
      try {
        execSync('npm update -g hedgequantx', { 
          stdio: ['pipe', 'pipe', 'pipe'], 
          timeout: 180000, 
          encoding: 'utf8'
        });
      } catch (e2) {
        spinner.fail('UPDATE FAILED');
        console.log(chalk.yellow('\n  TRY MANUALLY:'));
        console.log(chalk.white('  npm update -g hedgequantx'));
        console.log(chalk.gray('  OR WITH SUDO:'));
        console.log(chalk.white('  sudo npm update -g hedgequantx'));
        await prompts.waitForEnter();
        return;
      }
    }
    
    spinner.succeed(`UPDATED TO V${latestVersion}!`);
    console.log(chalk.green('\n  ✓ UPDATE SUCCESSFUL!'));
    console.log(chalk.yellow('\n  Restarting HQX...'));
    
    // Small delay then exit - the user will run hqx again
    await new Promise(r => setTimeout(r, 1500));
    process.exit(0);
    
  } catch (error) {
    if (spinner) spinner.fail('UPDATE ERROR');
    console.log(chalk.yellow('\n  TRY MANUALLY: npm update -g hedgequantx'));
    await prompts.waitForEnter();
  }
};

module.exports = { dashboardMenu, handleUpdate };
