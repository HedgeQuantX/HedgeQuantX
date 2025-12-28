/**
 * @fileoverview Pages module exports
 * @module pages
 */

const { showStats } = require('./stats');
const { showAccounts } = require('./accounts');
const { showPositions } = require('./positions');
const { showOrders } = require('./orders');
const { showUserInfo } = require('./user');

module.exports = {
  showStats,
  showAccounts,
  showPositions,
  showOrders,
  showUserInfo
};
