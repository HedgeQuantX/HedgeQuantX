/**
 * Positions page
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('../services');
const { ORDER_SIDE } = require('../config');
const { getLogoWidth, drawBoxHeader, drawBoxFooter, drawBoxRow, drawBoxSeparator, displayBanner } = require('../ui');
const { prompts } = require('../utils');

/**
 * Show all open positions
 */
const showPositions = async (service) => {
  // Clear screen and show banner
  console.clear();
  displayBanner();
  
  const boxWidth = getLogoWidth();
  let spinner;

  try {
    spinner = ora({ text: 'LOADING POSITIONS...', color: 'yellow' }).start();
    
    const allConns = connections.count() > 0 
      ? connections.getAll() 
      : (service ? [{ service, propfirm: service.propfirm?.name || 'Unknown', type: 'single' }] : []);
    
    if (allConns.length === 0) {
      spinner.fail('NO CONNECTIONS FOUND');
      await prompts.waitForEnter();
      return;
    }
    spinner.succeed(`FOUND ${allConns.length} CONNECTION(S)`);

    // Step 2: Fetch accounts
    let allAccounts = [];
    
    for (const conn of allConns) {
      const propfirmName = conn.propfirm || conn.type || 'Unknown';
      spinner = ora({ text: `FETCHING ACCOUNTS FROM ${propfirmName.toUpperCase()}...`, color: 'yellow' }).start();
      
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
          spinner.succeed(`${propfirmName.toUpperCase()}: ${result.accounts.length} ACCOUNT(S)`);
        } else {
          spinner.warn(`${propfirmName.toUpperCase()}: NO ACCOUNTS`);
        }
      } catch (e) {
        spinner.fail(`${propfirmName.toUpperCase()}: FAILED`);
      }
    }

    if (allAccounts.length === 0) {
      console.log(chalk.yellow('\n  NO ACCOUNTS FOUND.'));
      await prompts.waitForEnter();
      return;
    }

    // Step 3: Fetch positions for each account
    let allPositions = [];
    
    for (const account of allAccounts) {
      const accName = String(account.accountName || account.rithmicAccountId || account.accountId || 'Unknown').substring(0, 20);
      spinner = ora({ text: `FETCHING POSITIONS FOR ${accName.toUpperCase()}...`, color: 'yellow' }).start();
      
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
          spinner.succeed(`${accName.toUpperCase()}: ${result.positions.length} POSITION(S)`);
        } else {
          spinner.succeed(`${accName.toUpperCase()}: NO POSITIONS`);
        }
      } catch (e) {
        spinner.fail(`${accName.toUpperCase()}: FAILED TO FETCH POSITIONS`);
      }
    }

    spinner = ora({ text: 'PREPARING DISPLAY...', color: 'yellow' }).start();
    spinner.succeed(`TOTAL: ${allPositions.length} POSITION(S)`);
    console.log();

    // Display
    drawBoxHeader('OPEN POSITIONS', boxWidth);

    if (allPositions.length === 0) {
      drawBoxRow(chalk.gray('  NO OPEN POSITIONS'), boxWidth);
    } else {
      const header = '  ' + 'SYMBOL'.padEnd(15) + 'SIDE'.padEnd(8) + 'SIZE'.padEnd(8) + 'ENTRY'.padEnd(12) + 'P&L'.padEnd(12) + 'ACCOUNT';
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
    if (spinner) spinner.fail('ERROR: ' + error.message.toUpperCase());
  }

  await prompts.waitForEnter();
};

module.exports = { showPositions };
