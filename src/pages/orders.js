/**
 * Orders page
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('../services');
const { ORDER_STATUS, ORDER_TYPE, ORDER_SIDE } = require('../config');
const { getLogoWidth, drawBoxHeader, drawBoxFooter, drawBoxRow, drawBoxSeparator } = require('../ui');
const { prompts } = require('../utils');

/**
 * Show all orders
 */
const showOrders = async (service) => {
  const boxWidth = getLogoWidth();
  let spinner;

  try {
    // Step 1: Get connections
    spinner = ora({ text: 'Loading connections...', color: 'yellow' }).start();
    
    const allConns = connections.count() > 0 
      ? connections.getAll() 
      : (service ? [{ service, propfirm: service.propfirm?.name || 'Unknown', type: 'single' }] : []);
    
    if (allConns.length === 0) {
      spinner.fail('No connections found');
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

    // Step 3: Fetch orders for each account
    let allOrders = [];
    
    for (const account of allAccounts) {
      const accName = String(account.accountName || account.rithmicAccountId || account.accountId || 'Unknown').substring(0, 20);
      spinner = ora({ text: `Fetching orders for ${accName}...`, color: 'yellow' }).start();
      
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
          spinner.succeed(`${accName}: ${result.orders.length} order(s)`);
        } else {
          spinner.succeed(`${accName}: No orders`);
        }
      } catch (e) {
        spinner.fail(`${accName}: Failed to fetch orders`);
      }
    }

    spinner = ora({ text: 'Preparing display...', color: 'yellow' }).start();
    spinner.succeed(`Total: ${allOrders.length} order(s)`);
    console.log();

    // Display
    drawBoxHeader('ORDERS', boxWidth);

    if (allOrders.length === 0) {
      drawBoxRow(chalk.gray('  No orders found'), boxWidth);
    } else {
      const header = '  ' + 'Symbol'.padEnd(12) + 'Side'.padEnd(6) + 'Type'.padEnd(8) + 'Qty'.padEnd(6) + 'Price'.padEnd(10) + 'Status'.padEnd(12) + 'Account';
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
    if (spinner) spinner.fail('Error: ' + error.message);
  }

  await prompts.waitForEnter();
};

module.exports = { showOrders };
