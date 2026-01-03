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
const aiService = require('../services/ai');


/**
 * Dashboard menu after login
 */
const dashboardMenu = async (service) => {
  prepareStdin();
  
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  // Check AI connection status
  const aiConnected = aiService.isConnected();
  
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
  console.log(makeLine(chalk.yellow.bold('WELCOME, HQX TRADER!'), 'center'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Show connected propfirms
  const allConns = connections.getAll();
  if (allConns.length > 0) {
    const propfirms = allConns.slice(0, 3).map(c => (c.propfirm || c.type || 'CONNECTED').toUpperCase());
    const propfirmText = propfirms.map(p => chalk.green('● ') + chalk.white(p)).join('    ');
    console.log(makeLine(propfirmText, 'center'));
  }
  
  // Stats bar with icons
  const statsInfo = getCachedStats();
  if (statsInfo) {
    console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
    
const balStr = statsInfo.balance !== null ? `$${statsInfo.balance.toLocaleString()}` : '--';
    const balColor = statsInfo.balance !== null ? chalk.green : chalk.gray;
    
    // Build plain text for length calculation
    // Format: "✔ CONNECTIONS: X    ✔ ACCOUNTS: X    ✔ BALANCE: $X    ✔ AI: CONNECTED"
    const aiText = aiConnected ? 'CONNECTED' : 'NONE';
    const plainText = `* CONNECTIONS: ${statsInfo.connections}    * ACCOUNTS: ${statsInfo.accounts}    * BALANCE: ${balStr}    * AI: ${aiText}`;
    const statsLen = plainText.length;
    const statsLeftPad = Math.max(0, Math.floor((W - statsLen) / 2));
    const statsRightPad = Math.max(0, W - statsLen - statsLeftPad);
    
    // Build with unicode icons and colors
    const checkIcon = chalk.yellow('✔ ');
    const aiIcon = aiConnected ? chalk.magenta('✔ ') : chalk.gray('○ ');
    const aiTextColored = aiConnected ? chalk.magenta('CONNECTED') : chalk.gray('NONE');
    
    console.log(chalk.cyan('║') + ' '.repeat(statsLeftPad) +
      checkIcon + chalk.white(`CONNECTIONS: ${statsInfo.connections}`) + '    ' +
      checkIcon + chalk.white(`ACCOUNTS: ${statsInfo.accounts}`) + '    ' +
      checkIcon + chalk.white('BALANCE: ') + balColor(balStr) + '    ' +
      aiIcon + chalk.white('AI: ') + aiTextColored +
      ' '.repeat(statsRightPad) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Menu in 3 columns - fixed width columns for perfect alignment
  const colWidth = Math.floor(W / 3);
  
  const menuRow3 = (col1, col2, col3) => {
    const c1Plain = col1.replace(/\x1b\[[0-9;]*m/g, '');
    const c2Plain = col2.replace(/\x1b\[[0-9;]*m/g, '');
    const c3Plain = col3.replace(/\x1b\[[0-9;]*m/g, '');
    
    // Center each item within its fixed-width column
    const pad1Left = Math.floor((colWidth - c1Plain.length) / 2);
    const pad1Right = colWidth - c1Plain.length - pad1Left;
    
    const pad2Left = Math.floor((colWidth - c2Plain.length) / 2);
    const pad2Right = colWidth - c2Plain.length - pad2Left;
    
    // Third column gets remaining width
    const col3Width = W - (colWidth * 2);
    const pad3Left = Math.floor((col3Width - c3Plain.length) / 2);
    const pad3Right = col3Width - c3Plain.length - pad3Left;
    
    const line = 
      ' '.repeat(pad1Left) + col1 + ' '.repeat(pad1Right) +
      ' '.repeat(pad2Left) + col2 + ' '.repeat(pad2Right) +
      ' '.repeat(pad3Left) + col3 + ' '.repeat(pad3Right);
    
    console.log(chalk.cyan('║') + line + chalk.cyan('║'));
  };
  
  const centerLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    const leftPad = Math.floor(padding / 2);
    console.log(chalk.cyan('║') + ' '.repeat(leftPad) + content + ' '.repeat(padding - leftPad) + chalk.cyan('║'));
  };
  
  // Fixed-width menu items for perfect alignment
  const menuItem = (key, label, color) => {
    const text = `[${key}] ${label.padEnd(14)}`;
    return color(text);
  };
  
  menuRow3(menuItem('1', 'VIEW ACCOUNTS', chalk.cyan), menuItem('2', 'VIEW STATS', chalk.cyan), menuItem('+', 'ADD ACCOUNT', chalk.cyan));
  menuRow3(menuItem('A', 'ALGO TRADING', chalk.magenta), menuItem('I', 'AI AGENT', chalk.magenta), menuItem('U', 'UPDATE HQX', chalk.yellow));
  
  // Separator and disconnect button centered
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  centerLine(chalk.red('[X] DISCONNECT'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
  
  // Simple input - no duplicate menu
  const input = await prompts.textInput(chalk.cyan('SELECT (1/2/+/A/I/U/X)'));
  
  const actionMap = {
    '1': 'accounts',
    '2': 'stats',
    '+': 'add_prop_account',
    'a': 'algotrading',
    'i': 'ai_agent',
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
    
    console.log(chalk.cyan(`\n  CURRENT VERSION: v${currentVersion}`));
    spinner = ora({ text: 'CHECKING FOR UPDATES...', color: 'yellow' }).start();
    
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
      spinner.fail('CANNOT REACH NPM REGISTRY');
      console.log(chalk.gray(`  ERROR: ${e.message}`));
      console.log(chalk.yellow('  TRY MANUALLY: npm install -g hedgequantx@latest'));
      await prompts.waitForEnter();
      return;
    }
    
    spinner.succeed(`LATEST VERSION: v${latestVersion}`);
    
    if (currentVersion === latestVersion) {
      console.log(chalk.green('  ALREADY UP TO DATE!'));
      await prompts.waitForEnter();
      return;
    }
    
    console.log(chalk.yellow(`  UPDATE AVAILABLE: v${currentVersion} → v${latestVersion}`));
    spinner = ora({ text: 'INSTALLING UPDATE...', color: 'yellow' }).start();
    
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
      spinner.fail('UPDATE FAILED - PERMISSION DENIED?');
      console.log(chalk.gray(`  ERROR: ${e.message}`));
      console.log(chalk.yellow('  TRY MANUALLY WITH SUDO:'));
      console.log(chalk.white('  sudo npm install -g hedgequantx@latest'));
      await prompts.waitForEnter();
      return;
    }
    
    spinner.succeed(`UPDATED TO v${latestVersion}!`);
    console.log(chalk.cyan('  RESTARTING HQX...'));
    
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
      console.log(chalk.yellow('\n  PLEASE RESTART HQX MANUALLY:'));
      console.log(chalk.white('  hqx'));
      await prompts.waitForEnter();
    }
    
  } catch (error) {
    if (spinner) spinner.fail('UPDATE ERROR');
    console.log(chalk.gray(`  ERROR: ${error.message}`));
    console.log(chalk.yellow('  TRY MANUALLY: npm install -g hedgequantx@latest'));
    await prompts.waitForEnter();
  }
};

module.exports = { dashboardMenu, handleUpdate };
