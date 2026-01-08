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

      draw2ColHeader(name1.substring(0, col1 - 4), name2 ? name2.substring(0, col2 - 4) : '', boxWidth);

      // PropFirm
      const pf1 = chalk.magenta(acc1.propfirm || 'Unknown');
      const pf2 = acc2 ? chalk.magenta(acc2.propfirm || 'Unknown') : '';
      console.log(chalk.cyan('║') + fmtRow('PropFirm:', pf1, col1) + chalk.cyan('│') + (acc2 ? fmtRow('PropFirm:', pf2, col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // Balance
      const bal1 = acc1.balance;
      const bal2 = acc2 ? acc2.balance : null;
      const balStr1 = bal1 !== null && bal1 !== undefined ? '$' + Number(bal1).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const balStr2 = bal2 !== null && bal2 !== undefined ? '$' + Number(bal2).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const balColor1 = bal1 === null || bal1 === undefined ? chalk.gray : (bal1 >= 0 ? chalk.green : chalk.red);
      const balColor2 = bal2 === null || bal2 === undefined ? chalk.gray : (bal2 >= 0 ? chalk.green : chalk.red);
      console.log(chalk.cyan('║') + fmtRow('Balance:', balColor1(balStr1), col1) + chalk.cyan('│') + (acc2 ? fmtRow('Balance:', balColor2(balStr2), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // P&L
      const pnl1 = acc1.profitAndLoss;
      const pnl2 = acc2 ? acc2.profitAndLoss : null;
      const pnlStr1 = pnl1 !== null && pnl1 !== undefined ? (pnl1 >= 0 ? '+' : '') + '$' + Number(pnl1).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const pnlStr2 = pnl2 !== null && pnl2 !== undefined ? (pnl2 >= 0 ? '+' : '') + '$' + Number(pnl2).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) : '--';
      const pnlColor1 = pnl1 === null || pnl1 === undefined ? chalk.gray : (pnl1 >= 0 ? chalk.green : chalk.red);
      const pnlColor2 = pnl2 === null || pnl2 === undefined ? chalk.gray : (pnl2 >= 0 ? chalk.green : chalk.red);
      console.log(chalk.cyan('║') + fmtRow('P&L:', pnlColor1(pnlStr1), col1) + chalk.cyan('│') + (acc2 ? fmtRow('P&L:', pnlColor2(pnlStr2), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // Status - handle both string from API and numeric lookup
      const getStatusDisplay = (status) => {
        if (!status && status !== 0) return { text: '--', color: 'gray' };
        if (typeof status === 'string') {
          // Direct string from Rithmic API (e.g., "Active", "Disabled")
          const lowerStatus = status.toLowerCase();
          if (lowerStatus.includes('active') || lowerStatus.includes('open')) return { text: status, color: 'green' };
          if (lowerStatus.includes('disabled') || lowerStatus.includes('closed')) return { text: status, color: 'red' };
          if (lowerStatus.includes('halt')) return { text: status, color: 'red' };
          return { text: status, color: 'yellow' };
        }
        return ACCOUNT_STATUS[status] || { text: 'Unknown', color: 'gray' };
      };
      const status1 = getStatusDisplay(acc1.status);
      const status2 = acc2 ? getStatusDisplay(acc2.status) : null;
      console.log(chalk.cyan('║') + fmtRow('Status:', chalk[status1.color](status1.text), col1) + chalk.cyan('│') + (acc2 ? fmtRow('Status:', chalk[status2.color](status2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

      // Type/Algorithm - handle both string from API and numeric lookup
      const getTypeDisplay = (type, algorithm) => {
        // Prefer algorithm from RMS info if available
        const value = algorithm || type;
        if (!value && value !== 0) return { text: '--', color: 'gray' };
        if (typeof value === 'string') {
          // Direct string from Rithmic API
          const lowerValue = value.toLowerCase();
          if (lowerValue.includes('eval')) return { text: value, color: 'yellow' };
          if (lowerValue.includes('live') || lowerValue.includes('funded')) return { text: value, color: 'green' };
          if (lowerValue.includes('sim') || lowerValue.includes('demo')) return { text: value, color: 'gray' };
          if (lowerValue.includes('express')) return { text: value, color: 'magenta' };
          return { text: value, color: 'cyan' };
        }
        return ACCOUNT_TYPE[value] || { text: 'Unknown', color: 'white' };
      };
      const type1 = getTypeDisplay(acc1.type, acc1.algorithm);
      const type2 = acc2 ? getTypeDisplay(acc2.type, acc2.algorithm) : null;
      console.log(chalk.cyan('║') + fmtRow('Type:', chalk[type1.color](type1.text), col1) + chalk.cyan('│') + (acc2 ? fmtRow('Type:', chalk[type2.color](type2.text), col2) : ' '.repeat(col2)) + chalk.cyan('║'));

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
