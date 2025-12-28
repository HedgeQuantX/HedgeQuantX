/**
 * @fileoverview User info page
 * @module pages/user
 */

const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');

const { connections } = require('../services');
const { getLogoWidth, getColWidths, drawBoxHeader, drawBoxFooter, draw2ColHeader, visibleLength, padText } = require('../ui');

/**
 * Shows user information
 * @param {Object} service - Current service
 */
const showUserInfo = async (service) => {
  const spinner = ora('Fetching user info...').start();
  const boxWidth = getLogoWidth();
  const { col1, col2 } = getColWidths(boxWidth);

  // Helper for row formatting
  const fmtRow = (label, value, colW) => {
    const labelStr = ' ' + label.padEnd(14);
    const valueVisible = visibleLength(value || '');
    const totalVisible = labelStr.length + valueVisible;
    const padding = Math.max(0, colW - totalVisible);
    return chalk.white(labelStr) + value + ' '.repeat(padding);
  };

  // Get user info
  let userInfo = null;
  let accountCount = 0;

  if (service && service.user) {
    userInfo = service.user;
  } else if (service) {
    const result = await service.getUser();
    if (result.success) {
      userInfo = result.user;
    }
  }

  // Get account count
  if (connections.count() > 0) {
    const accounts = await connections.getAllAccounts();
    accountCount = accounts.length;
  } else if (service) {
    const result = await service.getTradingAccounts();
    if (result.success) {
      accountCount = result.accounts.length;
    }
  }

  spinner.succeed('User info loaded');
  console.log();

  drawBoxHeader('USER INFO', boxWidth);

  if (!userInfo) {
    console.log(chalk.cyan('║') + padText(chalk.gray('  No user info available'), boxWidth - 2) + chalk.cyan('║'));
  } else {
    draw2ColHeader('PROFILE', 'CONNECTIONS', boxWidth);

    // Username
    const username = userInfo.userName || userInfo.username || 'Unknown';
    const connCount = connections.count() || 1;
    console.log(chalk.cyan('║') + fmtRow('Username:', chalk.cyan(username.toUpperCase()), col1) + chalk.cyan('│') + fmtRow('Connections:', chalk.cyan(connCount.toString()), col2) + chalk.cyan('║'));

    // Email
    const email = userInfo.email || 'N/A';
    console.log(chalk.cyan('║') + fmtRow('Email:', chalk.white(email), col1) + chalk.cyan('│') + fmtRow('Accounts:', chalk.cyan(accountCount.toString()), col2) + chalk.cyan('║'));

    // User ID
    const userId = userInfo.userId || userInfo.id || 'N/A';
    const platform = service.propfirm?.name || 'ProjectX';
    console.log(chalk.cyan('║') + fmtRow('User ID:', chalk.gray(userId.toString()), col1) + chalk.cyan('│') + fmtRow('Platform:', chalk.magenta(platform), col2) + chalk.cyan('║'));

    // First/Last Name
    const firstName = userInfo.firstName || '';
    const lastName = userInfo.lastName || '';
    const fullName = (firstName + ' ' + lastName).trim() || 'N/A';
    console.log(chalk.cyan('║') + fmtRow('Name:', chalk.white(fullName), col1) + chalk.cyan('│') + padText('', col2) + chalk.cyan('║'));
  }

  drawBoxFooter(boxWidth);
  console.log();

  await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to continue...' }]);
};

module.exports = { showUserInfo };
