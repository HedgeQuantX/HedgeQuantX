/**
 * Accounts page
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('../services');
const { ACCOUNT_STATUS, ACCOUNT_TYPE } = require('../config');
const { getLogoWidth, getColWidths, drawBoxHeader, drawBoxFooter, draw2ColHeader, visibleLength, displayBanner } = require('../ui');
const { prompts } = require('../utils');

/**
 * Show all accounts
 */
const showAccounts = async (service) => {
  // Clear screen and show banner
  console.clear();
  displayBanner();
  
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
    spinner = ora({ text: 'LOADING ACCOUNTS...', color: 'yellow' }).start();
    
    const allConns = connections.count() > 0 ? connections.getAll() : (service ? [{ service, propfirm: service.propfirm?.name || 'Unknown', type: 'single' }] : []);
    
    if (allConns.length === 0) {
      spinner.fail('NO CONNECTIONS FOUND');
      await prompts.waitForEnter();
      return;
    }

    // Fetch accounts from each connection
    for (const conn of allConns) {
      const propfirmName = conn.propfirm || conn.type || 'Unknown';
      
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
    
    spinner.stop();
    
    // Clear and show banner again before displaying accounts
    console.clear();
    displayBanner();

    // Display accounts
    drawBoxHeader('TRADING ACCOUNTS', boxWidth);

    for (let i = 0; i < allAccounts.length; i += 2) {
      const acc1 = allAccounts[i];
      const acc2 = allAccounts[i + 1];

      const name1 = String(acc1.accountName || acc1.rithmicAccountId || acc1.accountId || `Account #${i + 1}`);
      const name2 = acc2 ? String(acc2.accountName || acc2.rithmicAccountId || acc2.accountId || `Account #${i + 2}`) : '';

      // For single account, use full width; for pairs, use 2-column layout
      const sep = acc2 ? '│' : '║';
      const rightCol = acc2 ? col2 : col2;
      
      // Header row with account name(s)
      const h1 = centerText(name1.substring(0, col1 - 4), col1);
      const h2 = acc2 ? centerText(name2.substring(0, col2 - 4), col2) : ' '.repeat(col2);
      console.log(chalk.cyan('║') + chalk.cyan.bold(h1) + chalk.cyan(sep) + chalk.cyan.bold(h2) + chalk.cyan('║'));
      console.log(chalk.cyan('╠') + chalk.cyan('─'.repeat(col1)) + chalk.cyan(acc2 ? '┼' : '┼') + chalk.cyan('─'.repeat(col2)) + chalk.cyan('╣'));

      // PropFirm
      const pf1 = chalk.magenta(acc1.propfirm || 'Unknown');
      const pf2 = acc2 ? chalk.magenta(acc2.propfirm || 'Unknown') : '';
      console.log(chalk.cyan('║') + fmtRow('PropFirm:', pf1, col1) + chalk.cyan(sep) + (acc2 ? fmtRow('PropFirm:', pf2, col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // Balance
      const bal1 = acc1.balance;
      const bal2 = acc2 ? acc2.balance : null;
      const balStr1 = bal1 !== null && bal1 !== undefined ? '$' + Number(bal1).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const balStr2 = bal2 !== null && bal2 !== undefined ? '$' + Number(bal2).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const balColor1 = bal1 === null || bal1 === undefined ? chalk.gray : (bal1 >= 0 ? chalk.green : chalk.red);
      const balColor2 = bal2 === null || bal2 === undefined ? chalk.gray : (bal2 >= 0 ? chalk.green : chalk.red);
      console.log(chalk.cyan('║') + fmtRow('Balance:', balColor1(balStr1), col1) + chalk.cyan(sep) + (acc2 ? fmtRow('Balance:', balColor2(balStr2), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // P&L
      const pnl1 = acc1.profitAndLoss;
      const pnl2 = acc2 ? acc2.profitAndLoss : null;
      const pnlStr1 = pnl1 !== null && pnl1 !== undefined ? (pnl1 >= 0 ? '+' : '') + '$' + Number(pnl1).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const pnlStr2 = pnl2 !== null && pnl2 !== undefined ? (pnl2 >= 0 ? '+' : '') + '$' + Number(pnl2).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const pnlColor1 = pnl1 === null || pnl1 === undefined ? chalk.gray : (pnl1 >= 0 ? chalk.green : chalk.red);
      const pnlColor2 = pnl2 === null || pnl2 === undefined ? chalk.gray : (pnl2 >= 0 ? chalk.green : chalk.red);
      console.log(chalk.cyan('║') + fmtRow('P&L:', pnlColor1(pnlStr1), col1) + chalk.cyan(sep) + (acc2 ? fmtRow('P&L:', pnlColor2(pnlStr2), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // Status - numeric 0 = Active for Rithmic
      const getStatusDisplay = (status) => {
        if (status === null || status === undefined) return { text: '--', color: 'gray' };
        if (status === 0) return { text: 'Active', color: 'green' };
        if (typeof status === 'number') {
          return ACCOUNT_STATUS[status] || { text: `Status ${status}`, color: 'yellow' };
        }
        if (typeof status === 'string') {
          const lowerStatus = status.toLowerCase();
          if (lowerStatus.includes('active') || lowerStatus.includes('open')) return { text: status, color: 'green' };
          if (lowerStatus.includes('disabled') || lowerStatus.includes('closed')) return { text: status, color: 'red' };
          if (lowerStatus.includes('halt')) return { text: status, color: 'red' };
          return { text: status, color: 'yellow' };
        }
        return { text: '--', color: 'gray' };
      };
      const status1 = getStatusDisplay(acc1.status);
      const status2 = acc2 ? getStatusDisplay(acc2.status) : null;
      console.log(chalk.cyan('║') + fmtRow('Status:', chalk[status1.color](status1.text), col1) + chalk.cyan(sep) + (acc2 ? fmtRow('Status:', chalk[status2.color](status2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // Type - from accountType or algorithm field
      const getTypeDisplay = (acc) => {
        const value = acc.algorithm || acc.accountType || acc.type;
        if (value === null || value === undefined) return { text: 'Live', color: 'green' }; // Default for Rithmic
        if (typeof value === 'string') {
          const lowerValue = value.toLowerCase();
          if (lowerValue.includes('eval')) return { text: value, color: 'yellow' };
          if (lowerValue.includes('live') || lowerValue.includes('funded')) return { text: value, color: 'green' };
          if (lowerValue.includes('sim') || lowerValue.includes('demo')) return { text: value, color: 'gray' };
          if (lowerValue.includes('express')) return { text: value, color: 'magenta' };
          return { text: value, color: 'cyan' };
        }
        if (typeof value === 'number') {
          return ACCOUNT_TYPE[value] || { text: `Type ${value}`, color: 'white' };
        }
        return { text: 'Live', color: 'green' };
      };
      const type1 = getTypeDisplay(acc1);
      const type2 = acc2 ? getTypeDisplay(acc2) : null;
      console.log(chalk.cyan('║') + fmtRow('Type:', chalk[type1.color](type1.text), col1) + chalk.cyan(sep) + (acc2 ? fmtRow('Type:', chalk[type2.color](type2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      if (i + 2 < allAccounts.length) {
        console.log(chalk.cyan('╠') + chalk.cyan('═'.repeat(col1)) + chalk.cyan('╪') + chalk.cyan('═'.repeat(col2)) + chalk.cyan('╣'));
      }
    }

    drawBoxFooter(boxWidth);
    console.log();

  } catch (error) {
    if (spinner) spinner.fail('ERROR LOADING ACCOUNTS: ' + error.message.toUpperCase());
  }

  await prompts.waitForEnter();
};

module.exports = { showAccounts };
