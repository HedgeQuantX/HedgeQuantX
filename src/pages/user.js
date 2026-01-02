/**
 * User info page
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('../services');
const { getLogoWidth, getColWidths, drawBoxHeader, drawBoxFooter, draw2ColHeader, visibleLength, padText } = require('../ui');
const { prompts } = require('../utils');

/**
 * Show user info
 */
const showUserInfo = async (service) => {
  const boxWidth = getLogoWidth();
  const { col1, col2 } = getColWidths(boxWidth);
  let spinner;

  const fmtRow = (label, value, colW) => {
    const labelStr = ' ' + label.padEnd(14);
    const valueVisible = visibleLength(value || '');
    const padding = Math.max(0, colW - labelStr.length - valueVisible);
    return chalk.white(labelStr) + value + ' '.repeat(padding);
  };

  try {
    // Step 1: Get user info
    spinner = ora({ text: 'Loading user info...', color: 'yellow' }).start();
    
    let userInfo = null;
    
    if (service?.user) {
      userInfo = service.user;
    } else if (service && typeof service.getUser === 'function') {
      try {
        const result = await service.getUser();
        if (result.success) userInfo = result.user;
      } catch (e) {}
    }
    
    spinner.succeed('User info loaded');

    // Step 2: Get account count
    spinner = ora({ text: 'Counting accounts...', color: 'yellow' }).start();
    
    let accountCount = 0;
    
    if (connections.count() > 0) {
      try {
        const accounts = await connections.getAllAccounts();
        accountCount = accounts.length;
      } catch (e) {}
    } else if (service && typeof service.getTradingAccounts === 'function') {
      try {
        const result = await service.getTradingAccounts();
        if (result.success) accountCount = result.accounts.length;
      } catch (e) {}
    }
    
    spinner.succeed(`Found ${accountCount} account(s)`);
    console.log();

    // Display
    drawBoxHeader('USER INFO', boxWidth);

    if (!userInfo) {
      console.log(chalk.cyan('║') + padText(chalk.gray('  No user info available'), boxWidth - 2) + chalk.cyan('║'));
    } else {
      draw2ColHeader('PROFILE', 'CONNECTIONS', boxWidth);

      const username = userInfo.userName || userInfo.username || 'Unknown';
      const connCount = connections.count() || 1;
      console.log(chalk.cyan('║') + fmtRow('Username:', chalk.cyan(username.toUpperCase()), col1) + chalk.cyan('│') + fmtRow('Connections:', chalk.cyan(String(connCount)), col2) + chalk.cyan('║'));

      const email = userInfo.email || 'N/A';
      console.log(chalk.cyan('║') + fmtRow('Email:', chalk.white(email), col1) + chalk.cyan('│') + fmtRow('Accounts:', chalk.cyan(String(accountCount)), col2) + chalk.cyan('║'));

      const userId = userInfo.userId || userInfo.id || 'N/A';
      const platform = service?.propfirm?.name || 'ProjectX';
      console.log(chalk.cyan('║') + fmtRow('User ID:', chalk.gray(String(userId)), col1) + chalk.cyan('│') + fmtRow('Platform:', chalk.magenta(platform), col2) + chalk.cyan('║'));

      const firstName = userInfo.firstName || '';
      const lastName = userInfo.lastName || '';
      const fullName = (firstName + ' ' + lastName).trim() || 'N/A';
      console.log(chalk.cyan('║') + fmtRow('Name:', chalk.white(fullName), col1) + chalk.cyan('│') + padText('', col2) + chalk.cyan('║'));
    }

    drawBoxFooter(boxWidth);
    console.log();

  } catch (error) {
    if (spinner) spinner.fail('Error: ' + error.message);
  }

  await prompts.waitForEnter();
};

module.exports = { showUserInfo };
