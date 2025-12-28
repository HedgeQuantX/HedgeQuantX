/**
 * @fileoverview Accounts page
 * @module pages/accounts
 */

const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');

const { connections } = require('../services');
const { ACCOUNT_STATUS, ACCOUNT_TYPE } = require('../config');
const { getLogoWidth, getColWidths, drawBoxHeader, drawBoxFooter, draw2ColHeader, visibleLength, padText } = require('../ui');

/**
 * Shows all accounts from all connections
 * @param {Object} service - Current service
 */
const showAccounts = async (service) => {
  const spinner = ora('Fetching accounts...').start();
  const boxWidth = getLogoWidth();
  const { col1, col2 } = getColWidths(boxWidth);

  // Helper for row formatting
  const fmtRow = (label, value, colW) => {
    const labelStr = ' ' + label.padEnd(12);
    const valueVisible = visibleLength(value || '');
    const totalVisible = labelStr.length + valueVisible;
    const padding = Math.max(0, colW - totalVisible);
    return chalk.white(labelStr) + value + ' '.repeat(padding);
  };

  // Get accounts from all connections
  let allAccounts = [];

  if (connections.count() > 0) {
    for (const conn of connections.getAll()) {
      try {
        const result = await conn.service.getTradingAccounts();
        if (result.success && result.accounts) {
          result.accounts.forEach(account => {
            allAccounts.push({
              ...account,
              propfirm: conn.propfirm || conn.type,
              service: conn.service
            });
          });
        }
      } catch (e) { /* ignore */ }
    }
  } else if (service) {
    const result = await service.getTradingAccounts();
    if (result.success && result.accounts) {
      allAccounts = result.accounts.map(a => ({ ...a, service, propfirm: service.propfirm.name }));
    }
  }

  if (allAccounts.length === 0) {
    spinner.fail('No accounts found');
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to continue...' }]);
    return;
  }

  spinner.succeed(`Found ${allAccounts.length} account(s)`);
  console.log();

  drawBoxHeader('TRADING ACCOUNTS', boxWidth);

  // Display accounts 2 per row
  for (let i = 0; i < allAccounts.length; i += 2) {
    const acc1 = allAccounts[i];
    const acc2 = allAccounts[i + 1];

    const name1 = acc1.accountName || acc1.name || `Account #${acc1.accountId}`;
    const name2 = acc2 ? (acc2.accountName || acc2.name || `Account #${acc2.accountId}`) : '';

    draw2ColHeader(name1.substring(0, col1 - 4), name2.substring(0, col2 - 4), boxWidth);

    // PropFirm
    const pf1 = chalk.magenta(acc1.propfirm || 'Unknown');
    const pf2 = acc2 ? chalk.magenta(acc2.propfirm || 'Unknown') : '';
    console.log(chalk.cyan('║') + fmtRow('PropFirm:', pf1, col1) + chalk.cyan('│') + (acc2 ? fmtRow('PropFirm:', pf2, col2) : ' '.repeat(col2)) + chalk.cyan('║'));

    // Balance
    const bal1 = acc1.balance || 0;
    const bal2 = acc2 ? (acc2.balance || 0) : 0;
    const balColor1 = bal1 >= 0 ? chalk.green : chalk.red;
    const balColor2 = bal2 >= 0 ? chalk.green : chalk.red;
    console.log(chalk.cyan('║') + fmtRow('Balance:', balColor1('$' + bal1.toLocaleString()), col1) + chalk.cyan('│') + (acc2 ? fmtRow('Balance:', balColor2('$' + bal2.toLocaleString()), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

    // Status
    const status1 = ACCOUNT_STATUS[acc1.status] || { text: 'Unknown', color: 'gray' };
    const status2 = acc2 ? (ACCOUNT_STATUS[acc2.status] || { text: 'Unknown', color: 'gray' }) : null;
    console.log(chalk.cyan('║') + fmtRow('Status:', chalk[status1.color](status1.text), col1) + chalk.cyan('│') + (acc2 ? fmtRow('Status:', chalk[status2.color](status2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

    // Type
    const type1 = ACCOUNT_TYPE[acc1.type] || { text: 'Unknown', color: 'white' };
    const type2 = acc2 ? (ACCOUNT_TYPE[acc2.type] || { text: 'Unknown', color: 'white' }) : null;
    console.log(chalk.cyan('║') + fmtRow('Type:', chalk[type1.color](type1.text), col1) + chalk.cyan('│') + (acc2 ? fmtRow('Type:', chalk[type2.color](type2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

    // Account ID
    console.log(chalk.cyan('║') + fmtRow('ID:', chalk.gray(acc1.accountId), col1) + chalk.cyan('│') + (acc2 ? fmtRow('ID:', chalk.gray(acc2.accountId), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

    // Separator between pairs
    if (i + 2 < allAccounts.length) {
      console.log(chalk.cyan('╠') + chalk.cyan('═'.repeat(col1)) + chalk.cyan('╪') + chalk.cyan('═'.repeat(col2)) + chalk.cyan('╣'));
    }
  }

  drawBoxFooter(boxWidth);
  console.log();

  await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to continue...' }]);
};

module.exports = { showAccounts };
