/**
 * Connection Menus - PropFirm platform selection and login
 * Handles ProjectX, Rithmic, and Tradovate connections
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');

const { ProjectXService, connections } = require('../services');
const { RithmicService } = require('../services/rithmic');
const { TradovateService } = require('../services/tradovate');
const { getPropFirmsByPlatform } = require('../config');
const { getDevice, getLogoWidth, centerText } = require('../ui');
const { validateUsername, validatePassword } = require('../security');

/**
 * Login prompt with validation
 * @param {string} propfirmName - PropFirm display name
 * @returns {Promise<{username: string, password: string}>}
 */
const loginPrompt = async (propfirmName) => {
  const device = getDevice();
  console.log();
  console.log(chalk.cyan(`Connecting to ${propfirmName}...`));
  console.log();

  const credentials = await inquirer.prompt([
    {
      type: 'input',
      name: 'username',
      message: chalk.white.bold('Username:'),
      validate: (input) => {
        try {
          validateUsername(input);
          return true;
        } catch (e) {
          return e.message;
        }
      }
    },
    {
      type: 'password',
      name: 'password',
      message: chalk.white.bold('Password:'),
      mask: '*',
      validate: (input) => {
        try {
          validatePassword(input);
          return true;
        } catch (e) {
          return e.message;
        }
      }
    }
  ]);

  return credentials;
};

/**
 * ProjectX platform connection menu
 */
const projectXMenu = async () => {
  const propfirms = getPropFirmsByPlatform('ProjectX');
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const numCols = 3;
  const colWidth = Math.floor(innerWidth / numCols);
  
  // Build numbered list
  const numbered = propfirms.map((pf, i) => ({
    num: i + 1,
    key: pf.key,
    name: pf.displayName
  }));
  
  // PropFirm selection box
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  
  // Display in 3 columns with fixed width alignment
  const rows = Math.ceil(numbered.length / numCols);
  const maxNum = numbered.length;
  const numWidth = maxNum >= 10 ? 4 : 3; // [XX] or [X]
  
  for (let row = 0; row < rows; row++) {
    let line = '';
    for (let col = 0; col < numCols; col++) {
      const idx = row + col * rows;
      if (idx < numbered.length) {
        const item = numbered[idx];
        const numStr = item.num.toString().padStart(2, ' ');
        const coloredText = chalk.cyan(`[${numStr}]`) + ' ' + chalk.white(item.name);
        const textLen = 4 + 1 + item.name.length; // [XX] + space + name
        const padding = colWidth - textLen - 2;
        line += '  ' + coloredText + ' '.repeat(Math.max(0, padding));
      } else {
        line += ' '.repeat(colWidth);
      }
    }
    // Adjust for exact width
    const lineLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    const adjust = innerWidth - lineLen;
    console.log(chalk.cyan('║') + line + ' '.repeat(Math.max(0, adjust)) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  const backText = '  ' + chalk.red('[X] Back');
  const backLen = '[X] Back'.length + 2;
  console.log(chalk.cyan('║') + backText + ' '.repeat(innerWidth - backLen) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  const validInputs = numbered.map(n => n.num.toString());
  validInputs.push('x', 'X');
  
  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan(`Enter choice (1-${numbered.length}/X):`),
      validate: (input) => {
        if (validInputs.includes(input)) return true;
        return `Please enter 1-${numbered.length} or X`;
      }
    }
  ]);

  if (action.toLowerCase() === 'x') return null;
  
  const selectedIdx = parseInt(action) - 1;
  const selectedPropfirm = numbered[selectedIdx];

  const credentials = await loginPrompt(selectedPropfirm.name);
  const spinner = ora('Authenticating...').start();

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
 * Rithmic platform connection menu
 */
const rithmicMenu = async () => {
  const propfirms = getPropFirmsByPlatform('Rithmic');
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const numCols = 3;
  const colWidth = Math.floor(innerWidth / numCols);
  
  // Build numbered list
  const numbered = propfirms.map((pf, i) => ({
    num: i + 1,
    key: pf.key,
    name: pf.displayName,
    systemName: pf.rithmicSystem
  }));
  
  // PropFirm selection box
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM (RITHMIC)', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  
  // Display in 3 columns with fixed width alignment
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
        const padding = colWidth - textLen - 2;
        line += '  ' + coloredText + ' '.repeat(Math.max(0, padding));
      } else {
        line += ' '.repeat(colWidth);
      }
    }
    const lineLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    const adjust = innerWidth - lineLen;
    console.log(chalk.cyan('║') + line + ' '.repeat(Math.max(0, adjust)) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  const backText = '  ' + chalk.red('[X] Back');
  const backLen = '[X] Back'.length + 2;
  console.log(chalk.cyan('║') + backText + ' '.repeat(innerWidth - backLen) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  const validInputs = numbered.map(n => n.num.toString());
  validInputs.push('x', 'X');
  
  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan(`Enter choice (1-${numbered.length}/X):`),
      validate: (input) => {
        if (validInputs.includes(input)) return true;
        return `Please enter 1-${numbered.length} or X`;
      }
    }
  ]);

  if (action.toLowerCase() === 'x') return null;
  
  const selectedIdx = parseInt(action) - 1;
  const selectedPropfirm = numbered[selectedIdx];

  const credentials = await loginPrompt(selectedPropfirm.name);
  const spinner = ora('Connecting to Rithmic...').start();

  try {
    const service = new RithmicService(selectedPropfirm.key);
    const result = await service.login(credentials.username, credentials.password);

    if (result.success) {
      spinner.text = 'Fetching accounts...';
      const accResult = await service.getTradingAccounts();
      
      connections.add('rithmic', service, service.propfirm.name);
      spinner.succeed(`Connected to ${service.propfirm.name} (${accResult.accounts?.length || 0} accounts)`);
      
      // Small pause to see the success message
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
 * Tradovate platform connection menu
 */
const tradovateMenu = async () => {
  const propfirms = getPropFirmsByPlatform('Tradovate');
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  
  // Build numbered list
  const numbered = propfirms.map((pf, i) => ({
    num: i + 1,
    key: pf.key,
    name: pf.displayName
  }));
  
  // PropFirm selection box
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('SELECT PROPFIRM (TRADOVATE)', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  
  // Display propfirms
  for (const item of numbered) {
    const numStr = item.num.toString().padStart(2, ' ');
    const text = '  ' + chalk.cyan(`[${numStr}]`) + ' ' + chalk.white(item.name);
    const textLen = 4 + 1 + item.name.length + 2;
    console.log(chalk.cyan('║') + text + ' '.repeat(innerWidth - textLen) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('║') + ' '.repeat(innerWidth) + chalk.cyan('║'));
  const backText = '  ' + chalk.red('[X] Back');
  const backLen = '[X] Back'.length + 2;
  console.log(chalk.cyan('║') + backText + ' '.repeat(innerWidth - backLen) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  const validInputs = numbered.map(n => n.num.toString());
  validInputs.push('x', 'X');
  
  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan(`Enter choice (1-${numbered.length}/X):`),
      validate: (input) => {
        if (validInputs.includes(input)) return true;
        return `Please enter 1-${numbered.length} or X`;
      }
    }
  ]);

  if (action.toLowerCase() === 'x') return null;
  
  const selectedIdx = parseInt(action) - 1;
  const selectedPropfirm = numbered[selectedIdx];

  const credentials = await loginPrompt(selectedPropfirm.name);
  const spinner = ora('Connecting to Tradovate...').start();

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
 * Add Prop Account menu (select platform)
 */
const addPropAccountMenu = async () => {
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  const col1Width = Math.floor(innerWidth / 2);
  const col2Width = innerWidth - col1Width;
  
  console.log();
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  console.log(chalk.cyan('║') + chalk.white.bold(centerText('ADD PROP ACCOUNT', innerWidth)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  
  const menuRow = (left, right) => {
    const leftText = '  ' + left;
    const rightText = right ? '  ' + right : '';
    const leftLen = leftText.replace(/\x1b\[[0-9;]*m/g, '').length;
    const rightLen = rightText.replace(/\x1b\[[0-9;]*m/g, '').length;
    const leftPad = col1Width - leftLen;
    const rightPad = col2Width - rightLen;
    console.log(chalk.cyan('║') + leftText + ' '.repeat(Math.max(0, leftPad)) + rightText + ' '.repeat(Math.max(0, rightPad)) + chalk.cyan('║'));
  };
  
  menuRow(chalk.cyan('[1] ProjectX'), chalk.cyan('[2] Rithmic'));
  menuRow(chalk.cyan('[3] Tradovate'), chalk.red('[X] Back'));
  
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  console.log();

  const { action } = await inquirer.prompt([
    {
      type: 'input',
      name: 'action',
      message: chalk.cyan('Enter choice (1/2/3/X):'),
      validate: (input) => {
        const valid = ['1', '2', '3', 'x', 'X'];
        if (valid.includes(input)) return true;
        return 'Please enter 1, 2, 3 or X';
      }
    }
  ]);

  const actionMap = {
    '1': 'projectx',
    '2': 'rithmic',
    '3': 'tradovate',
    'x': null,
    'X': null
  };

  return actionMap[action];
};

module.exports = {
  loginPrompt,
  projectXMenu,
  rithmicMenu,
  tradovateMenu,
  addPropAccountMenu
};
