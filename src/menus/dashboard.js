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
    
    // AI status
    const aiConnection = aiService.getConnection();
    const aiStatus = aiConnection 
      ? aiConnection.provider.name.split(' ')[0]  // Just "CLAUDE" or "OPENAI"
      : null;
    
    // Build plain text for length calculation (unicode ✔ and ○ are 1 char width each)
    // Format: "✔ CONNECTIONS: X    ✔ ACCOUNTS: X    ✔ BALANCE: $X    ○ AI: NONE"
    const plainText = `* CONNECTIONS: ${statsInfo.connections}    * ACCOUNTS: ${statsInfo.accounts}    * BALANCE: ${balStr}    * AI: ${aiStatus || 'NONE'}`;
    const statsLen = plainText.length;
    const statsLeftPad = Math.max(0, Math.floor((W - statsLen) / 2));
    const statsRightPad = Math.max(0, W - statsLen - statsLeftPad);
    
    // Build with unicode icons and colors
    const checkIcon = chalk.yellow('✔ ');
    const aiIcon = aiStatus ? chalk.magenta('✔ ') : chalk.gray('○ ');
    const aiText = aiStatus ? chalk.magenta(aiStatus) : chalk.gray('NONE');
    
    console.log(chalk.cyan('║') + ' '.repeat(statsLeftPad) +
      checkIcon + chalk.white(`CONNECTIONS: ${statsInfo.connections}`) + '    ' +
      checkIcon + chalk.white(`ACCOUNTS: ${statsInfo.accounts}`) + '    ' +
      checkIcon + chalk.white('BALANCE: ') + balColor(balStr) + '    ' +
      aiIcon + chalk.white('AI: ') + aiText +
      ' '.repeat(statsRightPad) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Menu in 3 columns
  const colWidth = Math.floor(W / 3);
  
  const menuRow3 = (col1, col2, col3) => {
    const c1Plain = col1.replace(/\x1b\[[0-9;]*m/g, '');
    const c2Plain = col2.replace(/\x1b\[[0-9;]*m/g, '');
    const c3Plain = col3.replace(/\x1b\[[0-9;]*m/g, '');
    
    const c1Padded = '  ' + col1 + ' '.repeat(Math.max(0, colWidth - c1Plain.length - 2));
    const c2Padded = col2 + ' '.repeat(Math.max(0, colWidth - c2Plain.length));
    const c3Padded = col3 + ' '.repeat(Math.max(0, W - colWidth * 2 - c3Plain.length));
    
    console.log(chalk.cyan('║') + c1Padded + c2Padded + c3Padded + chalk.cyan('║'));
  };
  
  const centerLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    const leftPad = Math.floor(padding / 2);
    console.log(chalk.cyan('║') + ' '.repeat(leftPad) + content + ' '.repeat(padding - leftPad) + chalk.cyan('║'));
  };
  
  menuRow3(chalk.cyan('[1] VIEW ACCOUNTS'), chalk.cyan('[2] VIEW STATS'), chalk.cyan('[+] ADD ACCOUNT'));
  menuRow3(chalk.magenta('[A] ALGO TRADING'), chalk.magenta('[I] AI AGENT'), chalk.yellow('[U] UPDATE HQX'));
  
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
