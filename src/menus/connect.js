/**
 * Connection Menus - PropFirm platform selection and login
 */

const chalk = require('chalk');
const ora = require('ora');

const { ProjectXService, connections } = require('../services');
const { RithmicService } = require('../services/rithmic');
const { TradovateService } = require('../services/tradovate');
const { getPropFirmsByPlatform } = require('../config');
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
 * ProjectX menu
 */
const projectXMenu = async () => {
  const propfirms = getPropFirmsByPlatform('ProjectX');
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  const col1Width = Math.floor(W / 2);
  
  const numbered = propfirms.map((pf, i) => ({ num: i + 1, key: pf.key, name: pf.displayName }));
  
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM (ProjectX)', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  const menuRow = (left, right) => {
    const leftPlain = left ? left.replace(/\x1b\[[0-9;]*m/g, '') : '';
    const rightPlain = right ? right.replace(/\x1b\[[0-9;]*m/g, '') : '';
    const leftPadded = '  ' + (left || '') + ' '.repeat(Math.max(0, col1Width - leftPlain.length - 2));
    const rightPadded = (right || '') + ' '.repeat(Math.max(0, W - col1Width - rightPlain.length));
    console.log(chalk.cyan('║') + leftPadded + rightPadded + chalk.cyan('║'));
  };
  
  for (let i = 0; i < numbered.length; i += 2) {
    const left = numbered[i];
    const right = numbered[i + 1];
    const leftText = chalk.cyan(`[${left.num.toString().padStart(2, ' ')}]`) + ' ' + chalk.white(left.name);
    const rightText = right ? chalk.cyan(`[${right.num.toString().padStart(2, ' ')}]`) + ' ' + chalk.white(right.name) : '';
    menuRow(leftText, rightText);
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + '  ' + chalk.red('[X] Back') + ' '.repeat(W - 10) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));

  const input = await prompts.textInput(chalk.cyan('Select number (or X):'));
  if (!input || input.toLowerCase() === 'x') return null;
  
  const action = parseInt(input);
  if (isNaN(action) || action < 1 || action > numbered.length) return null;
  
  const selectedPropfirm = numbered[action - 1];
  const credentials = await loginPrompt(selectedPropfirm.name);
  if (!credentials) return null;

  const spinner = ora({ text: 'Authenticating...', color: 'yellow' }).start();

  try {
    const service = new ProjectXService(selectedPropfirm.key);
    const result = await service.login(credentials.username, credentials.password);

    if (result.success) {
      await service.getUser();
      connections.add('projectx', service, service.propfirm.name);
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
 * Rithmic menu
 */
const rithmicMenu = async () => {
  const propfirms = getPropFirmsByPlatform('Rithmic');
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const numCols = 3;
  const colWidth = Math.floor(innerWidth / numCols);
  
  const numbered = propfirms.map((pf, i) => ({ num: i + 1, key: pf.key, name: pf.displayName, systemName: pf.rithmicSystem }));
  
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM (RITHMIC)', innerWidth)) + chalk.cyan('║'));
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

/**
 * Tradovate menu
 */
const tradovateMenu = async () => {
  const propfirms = getPropFirmsByPlatform('Tradovate');
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  
  const numbered = propfirms.map((pf, i) => ({ num: i + 1, key: pf.key, name: pf.displayName }));
  
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM (TRADOVATE)', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  
  for (const item of numbered) {
    const numStr = item.num.toString().padStart(2, ' ');
    const text = '  ' + chalk.cyan(`[${numStr}]`) + ' ' + chalk.white(item.name);
    const textLen = 4 + 1 + item.name.length + 2;
    console.log(chalk.cyan('║') + text + ' '.repeat(innerWidth - textLen) + chalk.cyan('║'));
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

  const spinner = ora({ text: 'Connecting to Tradovate...', color: 'yellow' }).start();

  try {
    const service = new TradovateService(selectedPropfirm.key);
    const result = await service.login(credentials.username, credentials.password);

    if (result.success) {
      spinner.text = 'Fetching accounts...';
      await service.getTradingAccounts();
      connections.add('tradovate', service, service.propfirm.name);
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
 * Add Prop Account menu
 */
const addPropAccountMenu = async () => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  const col1Width = Math.floor(W / 2);
  
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('ADD PROP ACCOUNT', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  const menuRow = (left, right) => {
    const leftPlain = left.replace(/\x1b\[[0-9;]*m/g, '');
    const rightPlain = right.replace(/\x1b\[[0-9;]*m/g, '');
    const leftPadded = '  ' + left + ' '.repeat(Math.max(0, col1Width - leftPlain.length - 2));
    const rightPadded = right + ' '.repeat(Math.max(0, W - col1Width - rightPlain.length));
    console.log(chalk.cyan('║') + leftPadded + rightPadded + chalk.cyan('║'));
  };
  
  menuRow(chalk.cyan('[1] ProjectX'), chalk.cyan('[2] Rithmic'));
  menuRow(chalk.cyan('[3] Tradovate'), chalk.red('[X] Back'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));

  const input = await prompts.textInput(chalk.cyan('Select (1/2/3/X):'));
  if (!input || input.toLowerCase() === 'x') return null;
  
  const num = parseInt(input);
  if (num === 1) return 'projectx';
  if (num === 2) return 'rithmic';
  if (num === 3) return 'tradovate';
  return null;
};

module.exports = { loginPrompt, projectXMenu, rithmicMenu, tradovateMenu, addPropAccountMenu };
