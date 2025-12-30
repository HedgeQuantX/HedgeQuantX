/**
 * Algo Trading - Main Menu
 */

const chalk = require('chalk');
const { getSeparator } = require('../../ui');
const { logger, prompts } = require('../../utils');

const log = logger.scope('AlgoMenu');

const { oneAccountMenu } = require('./one-account');
const { copyTradingMenu } = require('./copy-trading');

/**
 * Algo Trading Menu
 */
const algoTradingMenu = async (service) => {
  log.info('Algo Trading menu opened');
  
  console.log();
  console.log(chalk.gray(getSeparator()));
  console.log(chalk.magenta.bold('  Algo-Trading'));
  console.log(chalk.gray(getSeparator()));
  console.log();

  const action = await prompts.selectOption('Select Mode:', [
    { value: 'one_account', label: 'One Account' },
    { value: 'copy_trading', label: 'Copy Trading' },
    { value: 'back', label: '< Back' }
  ]);

  if (!action || action === 'back') {
    log.debug('User went back');
    return 'back';
  }

  log.debug('Algo mode selected', { action });

  switch (action) {
    case 'one_account':
      log.info('Starting One Account mode');
      await oneAccountMenu(service);
      break;
    case 'copy_trading':
      log.info('Starting Copy Trading mode');
      await copyTradingMenu();
      break;
  }
  
  return action;
};

module.exports = { algoTradingMenu };
