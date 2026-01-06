/**
 * Connection Menus - Rithmic Only
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('../services');
const { RithmicService } = require('../services/rithmic');
const { PROPFIRM_CHOICES } = require('../config');
const { getLogoWidth, centerText, prepareStdin } = require('../ui');
const { validateUsername, validatePassword } = require('../security');
const { prompts } = require('../utils');

/**
 * Login prompt
 */
const loginPrompt = async (propfirmName) => {
  prepareStdin();
  console.log();
  console.log(chalk.cyan(`Connecting to ${propfirmName}...`));
  console.log();

  const username = await prompts.textInput('Username:', '', (input) => {
    try { validateUsername(input); return undefined; } catch (e) { return e.message; }
  });
  if (!username) return null;
  
  const pwd = await prompts.passwordInput('Password:', (input) => {
    try { validatePassword(input); return undefined; } catch (e) { return e.message; }
  });
  if (!pwd) return null;

  return { username, password: pwd };
};

/**
 * Rithmic menu - Main connection menu
 */
const rithmicMenu = async () => {
  const propfirms = PROPFIRM_CHOICES;
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const numCols = 3;
  const colWidth = Math.floor(innerWidth / numCols);
  
  const numbered = propfirms.map((pf, i) => ({ num: i + 1, key: pf.value, name: pf.name }));
  
  console.log();
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
  
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + '  ' + chalk.red('[X] Back') + ' '.repeat(innerWidth - 10) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));

  const input = await prompts.textInput(chalk.cyan('Select number (or X):'));
  if (!input || input.toLowerCase() === 'x') return null;
  
  const action = parseInt(input);
  if (isNaN(action) || action < 1 || action > numbered.length) return null;
  
  const selectedPropfirm = numbered[action - 1];
  const credentials = await loginPrompt(selectedPropfirm.name);
  if (!credentials) return null;

  const spinner = ora({ text: 'Connecting to Rithmic...', color: 'yellow' }).start();

  try {
    const service = new RithmicService(selectedPropfirm.key);
    const result = await service.login(credentials.username, credentials.password);

    if (result.success) {
      spinner.text = 'Fetching accounts...';
      const accResult = await service.getTradingAccounts();
      connections.add('rithmic', service, service.propfirm.name);
      spinner.succeed(`Connected to ${service.propfirm.name} (${accResult.accounts?.length || 0} accounts)`);
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

module.exports = { loginPrompt, rithmicMenu };
