/**
 * Orders page
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('../services');
const { ORDER_STATUS, ORDER_TYPE, ORDER_SIDE } = require('../config');
const { getLogoWidth, drawBoxHeader, drawBoxFooter, drawBoxRow, drawBoxSeparator, displayBanner, clearScreen } = require('../ui');
const { prompts } = require('../utils');

/**
 * Show all orders
 */
const showOrders = async (service) => {
  // Clear screen and show banner
  clearScreen();
  displayBanner();
  
  const boxWidth = getLogoWidth();
  let spinner;

  try {
    spinner = ora({ text: 'LOADING ORDERS...', color: 'yellow' }).start();
    
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

    // Step 3: Fetch orders for each account
    let allOrders = [];
    
    for (const account of allAccounts) {
      const accName = String(account.accountName || account.rithmicAccountId || account.accountId || 'Unknown').substring(0, 20);
      spinner = ora({ text: `FETCHING ORDERS FOR ${accName.toUpperCase()}...`, color: 'yellow' }).start();
      
      try {
        const result = await account.service.getOrders(account.accountId);
        if (result.success && result.orders && result.orders.length > 0) {
          result.orders.forEach(order => {
            allOrders.push({ 
              ...order, 
              accountName: account.accountName || account.rithmicAccountId || account.accountId, 
              propfirm: account.propfirm 
            });
          });
          spinner.succeed(`${accName.toUpperCase()}: ${result.orders.length} ORDER(S)`);
        } else {
          spinner.succeed(`${accName.toUpperCase()}: NO ORDERS`);
        }
      } catch (e) {
        spinner.fail(`${accName.toUpperCase()}: FAILED TO FETCH ORDERS`);
      }
    }

    spinner = ora({ text: 'PREPARING DISPLAY...', color: 'yellow' }).start();
    spinner.succeed(`TOTAL: ${allOrders.length} ORDER(S)`);
    console.log();

    // Display
    drawBoxHeader('ORDERS', boxWidth);

    if (allOrders.length === 0) {
      drawBoxRow(chalk.gray('  NO ORDERS FOUND'), boxWidth);
    } else {
      const header = '  ' + 'SYMBOL'.padEnd(12) + 'SIDE'.padEnd(6) + 'TYPE'.padEnd(8) + 'QTY'.padEnd(6) + 'PRICE'.padEnd(10) + 'STATUS'.padEnd(12) + 'ACCOUNT';
      drawBoxRow(chalk.white.bold(header), boxWidth);
      drawBoxSeparator(boxWidth);

      for (const order of allOrders) {
        const symbol = String(order.contractId || order.symbol || 'Unknown').substring(0, 11);
        const sideInfo = ORDER_SIDE[order.side] || { text: '?', color: 'white' };
        const type = ORDER_TYPE[order.type] || 'Unknown';
        const qty = order.size || order.quantity || 0;
        const price = order.limitPrice || order.price || 0;
        const statusInfo = ORDER_STATUS[order.status] || { text: 'Unknown', color: 'gray', icon: '[?]' };
        const account = String(order.accountName || 'Unknown').substring(0, 12);

        const row = '  ' +
          chalk.white(symbol.padEnd(12)) +
          chalk[sideInfo.color](sideInfo.text.substring(0, 4).padEnd(6)) +
          chalk.white(String(type).substring(0, 7).padEnd(8)) +
          chalk.white(String(qty).padEnd(6)) +
          chalk.white((price > 0 ? price.toFixed(2) : 'MKT').padEnd(10)) +
          chalk[statusInfo.color]((statusInfo.icon + ' ' + statusInfo.text).substring(0, 11).padEnd(12)) +
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

module.exports = { showOrders };
