/**
 * Connection Menus - Direct Rithmic Connection
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('../services');
const { RithmicService } = require('../services/rithmic');
const { PROPFIRM_CHOICES } = require('../config');
const { getLogoWidth, centerText, prepareStdin, displayBanner, clearScreen } = require('../ui');
const { validateUsername, validatePassword } = require('../security');
const { prompts } = require('../utils');

/**
 * Login prompt
 */
const loginPrompt = async (propfirmName) => {
  prepareStdin();
  console.log();
  console.log(chalk.cyan(`CONNECTING TO ${propfirmName.toUpperCase()}...`));
  console.log();

  const username = await prompts.textInput('USERNAME:', '', (input) => {
    try { validateUsername(input); return undefined; } catch (e) { return e.message.toUpperCase(); }
  });
  if (!username) return null;
  
  const pwd = await prompts.passwordInput('PASSWORD:', (input) => {
    try { validatePassword(input); return undefined; } catch (e) { return e.message.toUpperCase(); }
  });
  if (!pwd) return null;

  return { username, password: pwd };
};

/**
 * Rithmic menu - Main connection menu
 */
const rithmicMenu = async () => {
  clearScreen();
  displayBanner();
  
  const propfirms = PROPFIRM_CHOICES;
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const numCols = 3;
  const colWidth = Math.floor(innerWidth / numCols);
  
  const numbered = propfirms.map((pf, i) => ({ num: i + 1, key: pf.value, name: pf.name }));
  
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  
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
        line += '  ' + coloredText + ' '.repeat(Math.max(0, colWidth - textLen - 2));
      } else {
        line += ' '.repeat(colWidth);
      }
    }
    const lineLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    console.log(chalk.cyan('║') + line + ' '.repeat(Math.max(0, innerWidth - lineLen)) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '─'.repeat(innerWidth) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText('[X] EXIT', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));

  const input = await prompts.textInput(chalk.cyan('SELECT NUMBER (OR X):'));
  if (!input || input.toLowerCase() === 'x') return null;
  
  const action = parseInt(input);
  if (isNaN(action) || action < 1 || action > numbered.length) return null;
  
  const selectedPropfirm = numbered[action - 1];
  const credentials = await loginPrompt(selectedPropfirm.name);
  if (!credentials) return null;

  const spinner = ora({ text: 'CONNECTING TO RITHMIC...', color: 'yellow' }).start();

  try {
    // Direct connection to Rithmic (no daemon)
    const service = new RithmicService(selectedPropfirm.key);
    const result = await service.login(credentials.username, credentials.password);

    if (result.success) {
      connections.add('rithmic', service, selectedPropfirm.name);
      spinner.succeed(`CONNECTED TO ${selectedPropfirm.name.toUpperCase()} (${result.accounts?.length || 0} ACCOUNTS)`);
      await new Promise(r => setTimeout(r, 1500));
      return service;
    } else {
      // Detailed error messages for common Rithmic issues
      const err = (result.error || '').toLowerCase();
      let msg = (result.error || 'AUTHENTICATION FAILED').toUpperCase();
      let help = '';
      
      if (err.includes('permission denied')) {
        msg = 'PERMISSION DENIED';
        help = 'Session active elsewhere. Wait 5 min or close R|Trader/other apps.';
      } else if (err.includes('timeout')) {
        msg = 'CONNECTION TIMEOUT';
        help = 'Rithmic server not responding. Check internet connection.';
      } else if (err.includes('invalid') && err.includes('system')) {
        msg = 'INVALID SYSTEM';
        help = 'Wrong propfirm. Verify your account type.';
      } else if (err.includes('password') || err.includes('credential')) {
        msg = 'INVALID CREDENTIALS';
        help = 'Check username and password.';
      }
      
      spinner.fail(msg);
      if (help) console.log(chalk.yellow(`  → ${help}`));
      await new Promise(r => setTimeout(r, 3000));
      return null;
    }
  } catch (error) {
    // Handle network/connection exceptions
    const err = (error.message || '').toLowerCase();
    let msg = `CONNECTION ERROR: ${error.message.toUpperCase()}`;
    let help = '';
    
    if (err.includes('enotfound') || err.includes('getaddrinfo')) {
      msg = 'DNS ERROR - SERVER NOT FOUND';
      help = 'No internet or Rithmic server down.';
    } else if (err.includes('econnrefused')) {
      msg = 'CONNECTION REFUSED';
      help = 'Rithmic server rejected. Try again later.';
    } else if (err.includes('timeout') || err.includes('etimedout')) {
      msg = 'CONNECTION TIMEOUT';
      help = 'Server not responding. Check firewall.';
    }
    
    spinner.fail(msg);
    if (help) console.log(chalk.yellow(`  → ${help}`));
    await new Promise(r => setTimeout(r, 3000));
    return null;
  }
};

/**
 * Show propfirm selection menu and return selected propfirm
 * @returns {Promise<{key: string, name: string}|null>}
 */
const showPropfirmSelection = async () => {
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const numCols = 3;
  
  const propfirms = PROPFIRM_CHOICES;
  const numbered = propfirms.map((pf, i) => ({ num: i + 1, key: pf.value, name: pf.name }));
  const maxNameLen = Math.max(...numbered.map(n => n.name.length));
  const itemWidth = 4 + 1 + maxNameLen;
  const gap = 3;
  
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  
  const rows = Math.ceil(numbered.length / numCols);
  for (let row = 0; row < rows; row++) {
    let lineParts = [];
    for (let col = 0; col < numCols; col++) {
      const idx = row + col * rows;
      if (idx < numbered.length) {
        const item = numbered[idx];
        const numStr = item.num.toString().padStart(2, ' ');
        const namePadded = item.name.padEnd(maxNameLen);
        lineParts.push({ num: `[${numStr}]`, name: namePadded });
      } else {
        lineParts.push(null);
      }
    }
    
    let content = '';
    for (let i = 0; i < lineParts.length; i++) {
      if (lineParts[i]) {
        content += chalk.cyan(lineParts[i].num) + ' ' + chalk.white(lineParts[i].name);
      } else {
        content += ' '.repeat(itemWidth);
      }
      if (i < lineParts.length - 1) content += ' '.repeat(gap);
    }
    
    const contentLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const leftPad = Math.floor((innerWidth - contentLen) / 2);
    const rightPad = innerWidth - contentLen - leftPad;
    console.log(chalk.cyan('║') + ' '.repeat(leftPad) + content + ' '.repeat(rightPad) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '─'.repeat(innerWidth) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText('[X] EXIT', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  
  const input = await prompts.textInput(chalk.cyan('SELECT (1-' + numbered.length + '/X): '));
  
  if (!input || input.toLowerCase() === 'x') return null;
  
  const action = parseInt(input);
  if (isNaN(action) || action < 1 || action > numbered.length) return null;
  
  return numbered[action - 1];
};

module.exports = { loginPrompt, rithmicMenu, showPropfirmSelection };
