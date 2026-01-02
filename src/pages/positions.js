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
  const boxWidth = getLogoWidth();
  let spinner;

  try {
    // Step 1: Get connections
    spinner = ora({ text: 'LOADING CONNECTIONS...', color: 'yellow' }).start();
    
    const allConns = connections.count() > 0 
      ? connections.getAll() 
      : (service ? [{ service, propfirm: service.propfirm?.name || 'Unknown', type: 'single' }] : []);
    
    if (allConns.length === 0) {
      spinner.fail('NO CONNECTIONS FOUND');
      await prompts.waitForEnter();
      return;
    }
    spinner.succeed(`Found ${allConns.length} connection(s)`);

    // Step 2: Fetch accounts
    let allAccounts = [];
    
    for (const conn of allConns) {
      const propfirmName = conn.propfirm || conn.type || 'Unknown';
      spinner = ora({ text: `Fetching accounts from ${propfirmName}...`, color: 'yellow' }).start();
      
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
          spinner.succeed(`${propfirmName}: ${result.accounts.length} account(s)`);
        } else {
          spinner.warn(`${propfirmName}: No accounts`);
        }
      } catch (e) {
        spinner.fail(`${propfirmName}: Failed`);
      }
    }

    if (allAccounts.length === 0) {
      console.log(chalk.yellow('\n  No accounts found.'));
      await prompts.waitForEnter();
      return;
    }

    // Step 3: Fetch positions for each account
    let allPositions = [];
    
    for (const account of allAccounts) {
      const accName = String(account.accountName || account.rithmicAccountId || account.accountId || 'Unknown').substring(0, 20);
      spinner = ora({ text: `Fetching positions for ${accName}...`, color: 'yellow' }).start();
      
      try {
        const result = await account.service.getPositions(account.accountId);
        if (result.success && result.positions && result.positions.length > 0) {
          result.positions.forEach(pos => {
            allPositions.push({ 
              ...pos, 
              accountName: account.accountName || account.rithmicAccountId || account.accountId, 
              propfirm: account.propfirm 
            });
          });
          spinner.succeed(`${accName}: ${result.positions.length} position(s)`);
        } else {
          spinner.succeed(`${accName}: No positions`);
        }
      } catch (e) {
        spinner.fail(`${accName}: Failed to fetch positions`);
      }
    }

    spinner = ora({ text: 'PREPARING DISPLAY...', color: 'yellow' }).start();
    spinner.succeed(`Total: ${allPositions.length} position(s)`);
    console.log();

    // Display
    drawBoxHeader('OPEN POSITIONS', boxWidth);

    if (allPositions.length === 0) {
      drawBoxRow(chalk.gray('  No open positions'), boxWidth);
    } else {
      const header = '  ' + 'Symbol'.padEnd(15) + 'Side'.padEnd(8) + 'Size'.padEnd(8) + 'Entry'.padEnd(12) + 'P&L'.padEnd(12) + 'Account';
      drawBoxRow(chalk.white.bold(header), boxWidth);
      drawBoxSeparator(boxWidth);

      for (const pos of allPositions) {
        const symbol = String(pos.contractId || pos.symbol || 'Unknown').substring(0, 14);
        const sideInfo = ORDER_SIDE[pos.side] || { text: 'Unknown', color: 'white' };
        const size = Math.abs(pos.size || pos.quantity || 0);
        const entry = pos.averagePrice || pos.entryPrice || 0;
        const pnl = pos.profitAndLoss || pos.unrealizedPnl || 0;
        const account = String(pos.accountName || 'Unknown').substring(0, 15);

        const pnlColor = pnl >= 0 ? chalk.green : chalk.red;
        const pnlStr = (pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2);

        const row = '  ' +
          chalk.white(symbol.padEnd(15)) +
          chalk[sideInfo.color](sideInfo.text.padEnd(8)) +
          chalk.white(String(size).padEnd(8)) +
          chalk.white(entry.toFixed(2).padEnd(12)) +
          pnlColor(pnlStr.padEnd(12)) +
          chalk.gray(account);

        drawBoxRow(row, boxWidth);
      }
    }

    drawBoxFooter(boxWidth);
    console.log();

  } catch (error) {
    if (spinner) spinner.fail('Error: ' + error.message);
  }

  await prompts.waitForEnter();
};

module.exports = { showPositions };
