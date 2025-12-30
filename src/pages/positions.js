/**
 * Positions page
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('../services');
const { ORDER_SIDE } = require('../config');
const { getLogoWidth, drawBoxHeader, drawBoxFooter, drawBoxRow, drawBoxSeparator } = require('../ui');
const { prompts } = require('../utils');

/**
 * Show all open positions
 */
const showPositions = async (service) => {
  const spinner = ora({ text: 'Fetching positions...', color: 'yellow' }).start();
  const boxWidth = getLogoWidth();

  let allAccounts = [];
  
  if (connections.count() > 0) {
    for (const conn of connections.getAll()) {
      try {
        const result = await conn.service.getTradingAccounts();
        if (result.success && result.accounts) {
          result.accounts.forEach(account => {
            allAccounts.push({ ...account, propfirm: conn.propfirm || conn.type, service: conn.service });
          });
        }
      } catch (e) {}
    }
  } else if (service) {
    const result = await service.getTradingAccounts();
    if (result.success && result.accounts) {
      allAccounts = result.accounts.map(a => ({ ...a, service, propfirm: service.propfirm.name }));
    }
  }

  let allPositions = [];
  
  for (const account of allAccounts) {
    try {
      const result = await account.service.getPositions(account.accountId);
      if (result.success && result.positions?.length > 0) {
        result.positions.forEach(pos => {
          allPositions.push({ ...pos, accountName: account.accountName || account.name, propfirm: account.propfirm });
        });
      }
    } catch (e) {}
  }

  spinner.succeed(`Found ${allPositions.length} position(s)`);
  console.log();

  drawBoxHeader('OPEN POSITIONS', boxWidth);

  if (allPositions.length === 0) {
    drawBoxRow(chalk.gray('  No open positions'), boxWidth);
  } else {
    const header = '  ' + 'Symbol'.padEnd(15) + 'Side'.padEnd(8) + 'Size'.padEnd(8) + 'Entry'.padEnd(12) + 'P&L'.padEnd(12) + 'Account';
    drawBoxRow(chalk.white.bold(header), boxWidth);
    drawBoxSeparator(boxWidth);

    for (const pos of allPositions) {
      const symbol = (pos.contractId || pos.symbol || 'Unknown').substring(0, 14);
      const sideInfo = ORDER_SIDE[pos.side] || { text: 'Unknown', color: 'white' };
      const size = Math.abs(pos.size || pos.quantity || 0);
      const entry = pos.averagePrice || pos.entryPrice || 0;
      const pnl = pos.profitAndLoss || pos.unrealizedPnl || 0;
      const account = (pos.accountName || 'Unknown').substring(0, 15);

      const pnlColor = pnl >= 0 ? chalk.green : chalk.red;
      const pnlStr = (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2);

      const row = '  ' +
        chalk.white(symbol.padEnd(15)) +
        chalk[sideInfo.color](sideInfo.text.padEnd(8)) +
        chalk.white(size.toString().padEnd(8)) +
        chalk.white(entry.toFixed(2).padEnd(12)) +
        pnlColor(pnlStr.padEnd(12)) +
        chalk.gray(account);

      drawBoxRow(row, boxWidth);
    }
  }

  drawBoxFooter(boxWidth);
  console.log();

  await prompts.waitForEnter();
};

module.exports = { showPositions };
