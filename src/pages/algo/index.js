/**
 * Algo Trading - Main Menu
 * Lightweight entry point
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const { getSeparator } = require('../../ui');
const { logger } = require('../../utils');

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

  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: chalk.white.bold('Select Mode:'),
      choices: [
        { name: chalk.cyan('One Account'), value: 'one_account' },
        { name: chalk.green('Copy Trading'), value: 'copy_trading' },
        new inquirer.Separator(),
        { name: chalk.yellow('< Back'), value: 'back' }
      ],
      pageSize: 10,
      loop: false
    }
  ]);

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
    case 'back':
      log.debug('User went back');
      break;
  }
  
  return action;
};

module.exports = { algoTradingMenu };
