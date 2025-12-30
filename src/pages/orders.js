/**
 * @fileoverview Orders page
 * @module pages/orders
 */

const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');

const { connections } = require('../services');
const { ORDER_STATUS, ORDER_TYPE, ORDER_SIDE } = require('../config');
const { getLogoWidth, drawBoxHeader, drawBoxFooter, drawBoxRow, drawBoxSeparator, visibleLength, padText } = require('../ui');

/**
 * Shows all orders from all connections
 * @param {Object} service - Current service
 */
const showOrders = async (service) => {
  const spinner = ora({ text: 'Fetching orders...', color: 'yellow' }).start();
  const boxWidth = getLogoWidth();

  // Get all accounts first
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

  // Get orders for each account
  let allOrders = [];
  
  for (const account of allAccounts) {
    try {
      const result = await account.service.getOrders(account.accountId);
      if (result.success && result.orders && result.orders.length > 0) {
        result.orders.forEach(order => {
          allOrders.push({
            ...order,
            accountName: account.accountName || account.name,
            propfirm: account.propfirm
          });
        });
      }
    } catch (e) { /* ignore */ }
  }

  spinner.succeed(`Found ${allOrders.length} order(s)`);
  console.log();

  drawBoxHeader('ORDERS', boxWidth);

  if (allOrders.length === 0) {
    drawBoxRow(chalk.gray('  No orders found'), boxWidth);
  } else {
    // Header row
    const header = '  ' +
      'Symbol'.padEnd(12) +
      'Side'.padEnd(6) +
      'Type'.padEnd(8) +
      'Qty'.padEnd(6) +
      'Price'.padEnd(10) +
      'Status'.padEnd(12) +
      'Account';
    drawBoxRow(chalk.white.bold(header), boxWidth);
    drawBoxSeparator(boxWidth);

    // Order rows
    for (const order of allOrders) {
      const symbol = (order.contractId || order.symbol || 'Unknown').substring(0, 11);
      const sideInfo = ORDER_SIDE[order.side] || { text: '?', color: 'white' };
      const type = ORDER_TYPE[order.type] || 'Unknown';
      const qty = order.size || order.quantity || 0;
      const price = order.limitPrice || order.price || 0;
      const statusInfo = ORDER_STATUS[order.status] || { text: 'Unknown', color: 'gray', icon: '[?]' };
      const account = (order.accountName || 'Unknown').substring(0, 12);

      const row = '  ' +
        chalk.white(symbol.padEnd(12)) +
        chalk[sideInfo.color](sideInfo.text.substring(0, 4).padEnd(6)) +
        chalk.white(type.substring(0, 7).padEnd(8)) +
        chalk.white(qty.toString().padEnd(6)) +
        chalk.white((price > 0 ? price.toFixed(2) : 'MKT').padEnd(10)) +
        chalk[statusInfo.color]((statusInfo.icon + ' ' + statusInfo.text).substring(0, 11).padEnd(12)) +
        chalk.gray(account);

      drawBoxRow(row, boxWidth);
    }
  }

  drawBoxFooter(boxWidth);
  console.log();

  await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to continue...' }]);
};

module.exports = { showOrders };
