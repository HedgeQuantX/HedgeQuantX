/**
 * Algo Trading - Main Menu
 */

const chalk = require('chalk');
const { getLogoWidth, centerText, displayBanner } = require('../../ui');
const { logger, prompts } = require('../../utils');

const log = logger.scope('AlgoMenu');

const { oneAccountMenu } = require('./one-account');
const { copyTradingMenu } = require('./copy-trading');

/**
 * Algo Trading Menu
 */
const algoTradingMenu = async (service) => {
  log.info('Algo Trading menu opened');
  
  try {
    // Clear screen and show banner
    console.clear();
    displayBanner();
    
    const boxWidth = getLogoWidth();
    const W = boxWidth - 2;
    
    // Draw menu rectangle
    console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
    console.log(chalk.cyan('║') + chalk.magenta.bold(centerText('ALGO-TRADING', W)) + chalk.cyan('║'));
    console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
    
    // 3 columns layout
    const col1 = '[1] ONE ACCOUNT';
    const col2 = '[2] COPY TRADING';
    const col3 = '[3] CUSTOM STRATEGY';
    const colWidth = Math.floor(W / 3);
    const lastColWidth = W - 2 * colWidth;
    
    const pad1 = Math.floor((colWidth - col1.length) / 2);
    const pad2 = Math.floor((colWidth - col2.length) / 2);
    const pad3 = Math.floor((lastColWidth - col3.length) / 2);
    
    const col1Str = ' '.repeat(pad1) + chalk.cyan(col1) + ' '.repeat(colWidth - col1.length - pad1);
    const col2Str = ' '.repeat(pad2) + chalk.yellow(col2) + ' '.repeat(colWidth - col2.length - pad2);
    const col3Str = ' '.repeat(pad3) + chalk.green(col3) + ' '.repeat(lastColWidth - col3.length - pad3);
    
    console.log(chalk.cyan('║') + col1Str + col2Str + col3Str + chalk.cyan('║'));
    
    console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
    console.log(chalk.cyan('║') + chalk.red(centerText('[B] BACK', W)) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));

    const input = await prompts.textInput(chalk.cyan('SELECT (1/2/3/B): '));
    const choice = (input || '').toLowerCase().trim();

    log.debug('Algo mode selected', { choice });

    if (choice === 'b' || choice === '') {
      return 'back';
    }

    switch (choice) {
      case '1':
        log.info('Starting One Account mode');
        await oneAccountMenu(service);
        break;
      case '2':
        log.info('Starting Copy Trading mode');
        await copyTradingMenu();
        break;
      case '3':
        log.info('Starting Custom Strategy mode');
        await customStrategyMenu(service);
        break;
      default:
        console.log(chalk.red('  INVALID OPTION'));
        await new Promise(r => setTimeout(r, 1000));
    }
    
    return choice;
  } catch (err) {
    log.error('Algo menu error:', err.message);
    console.log(chalk.red(`  ERROR: ${err.message.toUpperCase()}`));
    await prompts.waitForEnter();
    return 'back';
  }
};

/**
 * Custom Strategy Menu - AI-powered strategy creation
 */
const customStrategyMenu = async (service) => {
  console.clear();
  displayBanner();
  
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.green.bold(centerText('CUSTOM STRATEGY', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + centerText('Create your own trading strategy with AI assistance', W) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.gray(centerText('Coming soon...', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText('[B] BACK', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
  
  await prompts.waitForEnter();
};

module.exports = { algoTradingMenu };
