/**
 * Algo Trading - Main Menu
 */

const chalk = require('chalk');
const { getLogoWidth, centerText, displayBanner } = require('../../ui');
const { logger, prompts } = require('../../utils');
const { getActiveProvider } = require('../ai-agents');

const log = logger.scope('AlgoMenu');

const { oneAccountMenu } = require('./one-account');
const { copyTradingMenu } = require('./copy-trading');
const { customStrategyMenu } = require('./custom-strategy');

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
    
    // Check if AI agent is connected
    const aiProvider = getActiveProvider();
    const hasAI = !!aiProvider;
    
    // Draw menu rectangle
    console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
    console.log(chalk.cyan('║') + chalk.magenta.bold(centerText('ALGO-TRADING', W)) + chalk.cyan('║'));
    console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
    
    // 2 or 3 columns layout based on AI availability
    const col1 = '[1] ONE ACCOUNT';
    const col2 = '[2] COPY TRADING';
    const col3 = hasAI ? '[3] CUSTOM STRATEGY' : '';
    
    if (hasAI) {
      // 3 columns
      const colWidth = Math.floor(W / 3);
      const lastColWidth = W - 2 * colWidth;
      
      const pad1 = Math.floor((colWidth - col1.length) / 2);
      const pad2 = Math.floor((colWidth - col2.length) / 2);
      const pad3 = Math.floor((lastColWidth - col3.length) / 2);
      
      const col1Str = ' '.repeat(pad1) + chalk.cyan(col1) + ' '.repeat(colWidth - col1.length - pad1);
      const col2Str = ' '.repeat(pad2) + chalk.yellow(col2) + ' '.repeat(colWidth - col2.length - pad2);
      const col3Str = ' '.repeat(pad3) + chalk.green(col3) + ' '.repeat(lastColWidth - col3.length - pad3);
      
      console.log(chalk.cyan('║') + col1Str + col2Str + col3Str + chalk.cyan('║'));
    } else {
      // 2 columns only (no AI connected)
      const colWidth = Math.floor(W / 2);
      const pad1 = Math.floor((colWidth - col1.length) / 2);
      const pad2 = Math.floor((W - colWidth - col2.length) / 2);
      
      const col1Str = ' '.repeat(pad1) + chalk.cyan(col1) + ' '.repeat(colWidth - col1.length - pad1);
      const col2Str = ' '.repeat(pad2) + chalk.yellow(col2) + ' '.repeat(W - colWidth - col2.length - pad2);
      
      console.log(chalk.cyan('║') + col1Str + col2Str + chalk.cyan('║'));
    }
    
    console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
    console.log(chalk.cyan('║') + chalk.red(centerText('[B] BACK', W)) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));

    const promptText = hasAI ? 'SELECT (1/2/3/B): ' : 'SELECT (1/2/B): ';
    const input = await prompts.textInput(chalk.cyan(promptText));
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
        if (hasAI) {
          log.info('Starting Custom Strategy mode');
          await customStrategyMenu(service);
        } else {
          console.log(chalk.red('  INVALID OPTION'));
          await new Promise(r => setTimeout(r, 1000));
        }
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

module.exports = { algoTradingMenu };
