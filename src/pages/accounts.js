/**
 * Accounts page
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('../services');
const { ACCOUNT_STATUS, ACCOUNT_TYPE } = require('../config');
const { getLogoWidth, getColWidths, drawBoxHeader, drawBoxFooter, draw2ColHeader, visibleLength } = require('../ui');
const { prompts } = require('../utils');

/**
 * Show all accounts
 */
const showAccounts = async (service) => {
  const boxWidth = getLogoWidth();
  const { col1, col2 } = getColWidths(boxWidth);

  const fmtRow = (label, value, colW) => {
    const labelStr = ' ' + label.padEnd(12);
    const valueVisible = visibleLength(value || '');
    const padding = Math.max(0, colW - labelStr.length - valueVisible);
    return chalk.white(labelStr) + value + ' '.repeat(padding);
  };

  let allAccounts = [];
  let spinner;

  try {
    // Single spinner for loading (appears below the dashboard header)
    spinner = ora({ text: 'LOADING ACCOUNTS...', color: 'yellow' }).start();
    
    const allConns = connections.count() > 0 ? connections.getAll() : (service ? [{ service, propfirm: service.propfirm?.name || 'UNKNOWN', type: 'single' }] : []);
    
    if (allConns.length === 0) {
      spinner.fail('NO CONNECTIONS FOUND');
      await prompts.waitForEnter();
      return;
    }

    // Fetch accounts from each connection
    for (const conn of allConns) {
      const propfirmName = conn.propfirm || conn.type || 'UNKNOWN';
      
      try {
        const result = await conn.service.getTradingAccounts();
        if (result.success && result.accounts && result.accounts.length > 0) {
          result.accounts.forEach(account => {
            allAccounts.push({ 
              ...account, 
              propfirm: propfirmName, 
              service: conn.service 
            });
          });
        }
      } catch (e) {
        // Silent fail
      }
    }

    if (allAccounts.length === 0) {
      spinner.fail('NO ACCOUNTS FOUND');
      await prompts.waitForEnter();
      return;
    }

    // Fetch additional data for each account
    for (const account of allAccounts) {
      try {
        if (account.service && typeof account.service.getAccountBalance === 'function') {
          const balanceResult = await account.service.getAccountBalance(account.accountId);
          if (balanceResult.success) {
            account.balance = balanceResult.balance;
            account.profitAndLoss = balanceResult.profitAndLoss;
          }
        }
      } catch (e) {}
    }
    
    spinner.succeed('ACCOUNTS LOADED');
    console.log();

    // Display accounts
    drawBoxHeader('TRADING ACCOUNTS', boxWidth);

    for (let i = 0; i < allAccounts.length; i += 2) {
      const acc1 = allAccounts[i];
      const acc2 = allAccounts[i + 1];

      const name1 = String(acc1.accountName || acc1.rithmicAccountId || acc1.accountId || `Account #${i + 1}`);
      const name2 = acc2 ? String(acc2.accountName || acc2.rithmicAccountId || acc2.accountId || `Account #${i + 2}`) : '';

      draw2ColHeader(name1.substring(0, col1 - 4), name2 ? name2.substring(0, col2 - 4) : '', boxWidth);

      // PropFirm
      const pf1 = chalk.magenta(acc1.propfirm || 'UNKNOWN');
      const pf2 = acc2 ? chalk.magenta(acc2.propfirm || 'UNKNOWN') : '';
      console.log(chalk.cyan('║') + fmtRow('PROPFIRM:', pf1, col1) + chalk.cyan('│') + (acc2 ? fmtRow('PROPFIRM:', pf2, col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // Balance
      const bal1 = acc1.balance;
      const bal2 = acc2 ? acc2.balance : null;
      const balStr1 = bal1 !== null && bal1 !== undefined ? '$' + Number(bal1).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const balStr2 = bal2 !== null && bal2 !== undefined ? '$' + Number(bal2).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const balColor1 = bal1 === null || bal1 === undefined ? chalk.gray : (bal1 >= 0 ? chalk.green : chalk.red);
      const balColor2 = bal2 === null || bal2 === undefined ? chalk.gray : (bal2 >= 0 ? chalk.green : chalk.red);
      console.log(chalk.cyan('║') + fmtRow('BALANCE:', balColor1(balStr1), col1) + chalk.cyan('│') + (acc2 ? fmtRow('BALANCE:', balColor2(balStr2), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // P&L
      const pnl1 = acc1.profitAndLoss;
      const pnl2 = acc2 ? acc2.profitAndLoss : null;
      const pnlStr1 = pnl1 !== null && pnl1 !== undefined ? (pnl1 >= 0 ? '+' : '') + '$' + Number(pnl1).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const pnlStr2 = pnl2 !== null && pnl2 !== undefined ? (pnl2 >= 0 ? '+' : '') + '$' + Number(pnl2).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const pnlColor1 = pnl1 === null || pnl1 === undefined ? chalk.gray : (pnl1 >= 0 ? chalk.green : chalk.red);
      const pnlColor2 = pnl2 === null || pnl2 === undefined ? chalk.gray : (pnl2 >= 0 ? chalk.green : chalk.red);
      console.log(chalk.cyan('║') + fmtRow('P&L:', pnlColor1(pnlStr1), col1) + chalk.cyan('│') + (acc2 ? fmtRow('P&L:', pnlColor2(pnlStr2), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // Status
      const status1 = ACCOUNT_STATUS[acc1.status] || { text: 'UNKNOWN', color: 'gray' };
      const status2 = acc2 ? (ACCOUNT_STATUS[acc2.status] || { text: 'UNKNOWN', color: 'gray' }) : null;
      console.log(chalk.cyan('║') + fmtRow('STATUS:', chalk[status1.color](status1.text), col1) + chalk.cyan('│') + (acc2 ? fmtRow('STATUS:', chalk[status2.color](status2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // Type
      const type1 = ACCOUNT_TYPE[acc1.type] || { text: 'UNKNOWN', color: 'white' };
      const type2 = acc2 ? (ACCOUNT_TYPE[acc2.type] || { text: 'UNKNOWN', color: 'white' }) : null;
      console.log(chalk.cyan('║') + fmtRow('TYPE:', chalk[type1.color](type1.text), col1) + chalk.cyan('│') + (acc2 ? fmtRow('TYPE:', chalk[type2.color](type2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      if (i + 2 < allAccounts.length) {
        console.log(chalk.cyan('╠') + chalk.cyan('═'.repeat(col1)) + chalk.cyan('╪') + chalk.cyan('═'.repeat(col2)) + chalk.cyan('╣'));
      }
    }

    drawBoxFooter(boxWidth);
    console.log();

  } catch (error) {
    if (spinner) spinner.fail('Error loading accounts: ' + error.message);
  }

  await prompts.waitForEnter();
};

module.exports = { showAccounts };
