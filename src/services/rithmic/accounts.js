/**
 * Rithmic Accounts Module
 * Account fetching, PnL, and positions
 * 
 * P&L Data Sources:
 * - accountBalance: from PNL_PLANT API
 * - openPositionPnl: unrealized P&L from API
 * - closedPositionPnl: realized P&L from API
 * - dayPnl: total day P&L from API
 */

const { REQ } = require('./constants');

// Debug mode
const DEBUG = process.env.HQX_DEBUG === '1';
const debug = (...args) => DEBUG && console.log('[Rithmic]', ...args);

/**
 * Hash account ID to numeric (for compatibility)
 */
const hashAccountId = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
};

/**
 * Fetch accounts from ORDER_PLANT
 * @param {RithmicService} service - The Rithmic service instance
 */
const fetchAccounts = async (service) => {
  if (!service.orderConn || !service.loginInfo) {
    return [];
  }

  return new Promise((resolve) => {
    const accounts = [];
    
    const timeout = setTimeout(() => {
      service.accounts = accounts;
      resolve(accounts);
    }, 2000);

    service.once('accountReceived', (account) => {
      accounts.push(account);
    });

    service.once('accountListComplete', () => {
      clearTimeout(timeout);
      service.accounts = accounts;
      resolve(accounts);
    });

    try {
      service.orderConn.send('RequestAccountList', {
        templateId: REQ.ACCOUNT_LIST,
        userMsg: ['HQX'],
        fcmId: service.loginInfo.fcmId,
        ibId: service.loginInfo.ibId,
      });
    } catch (e) {
      clearTimeout(timeout);
      resolve([]);
    }
  });
};

/**
 * Get trading accounts with P&L data from API
 * @param {RithmicService} service - The Rithmic service instance
 */
const getTradingAccounts = async (service) => {
  debug('getTradingAccounts called');
  
  // Fetch accounts if not already loaded
  if (service.accounts.length === 0 && service.orderConn && service.loginInfo) {
    try {
      await fetchAccounts(service);
      debug('Accounts fetched:', service.accounts.length);
    } catch (e) {
      debug('Failed to fetch accounts:', e.message);
    }
  }

  // Request fresh P&L data if PnL connection exists
  if (service.pnlConn && service.accounts.length > 0) {
    debug('Requesting P&L snapshot...');
    await requestPnLSnapshot(service);
  }

  let tradingAccounts = service.accounts.map((acc) => {
    // Get P&L data from accountPnL map (populated by PNL_PLANT messages)
    const pnlData = service.accountPnL.get(acc.accountId) || {};
    debug(`Account ${acc.accountId} pnlData:`, JSON.stringify(pnlData));
    debug(`  accountPnL map size:`, service.accountPnL.size);
    
    // Use API values if available
    const accountBalance = parseFloat(pnlData.accountBalance || 0);
    const openPnL = parseFloat(pnlData.openPositionPnl || 0);
    const closedPnL = parseFloat(pnlData.closedPositionPnl || 0);
    const dayPnL = parseFloat(pnlData.dayPnl || 0);
    
    // Balance: use API value if > 0, otherwise default
    // Most prop firms don't report balance via PnL stream, so we use default
    const startingBalance = service.propfirm.defaultBalance;
    const balance = accountBalance > 0 ? accountBalance : startingBalance;
    
    // P&L: prefer dayPnl from API, otherwise calculate from open+closed
    let profitAndLoss = 0;
    if (dayPnL !== 0) {
      profitAndLoss = dayPnL;
    } else if (openPnL !== 0 || closedPnL !== 0) {
      profitAndLoss = openPnL + closedPnL;
    }
    // Don't calculate P&L from balance difference - that's estimation

    debug(`  balance: ${balance}, startingBalance: ${startingBalance}, P&L: ${profitAndLoss}`);

    return {
      accountId: hashAccountId(acc.accountId),
      rithmicAccountId: acc.accountId,
      accountName: acc.accountName || acc.accountId,
      name: acc.accountName || acc.accountId,
      balance: balance,
      startingBalance: startingBalance,
      profitAndLoss: profitAndLoss,
      openPnL: openPnL,
      todayPnL: closedPnL,
      status: 0,
      platform: 'Rithmic',
      propfirm: service.propfirm.name,
    };
  });

  // Fallback if no accounts
  if (tradingAccounts.length === 0 && service.user) {
    const userName = service.user.userName || 'Unknown';
    tradingAccounts = [{
      accountId: hashAccountId(userName),
      rithmicAccountId: userName,
      accountName: userName,
      name: userName,
      balance: service.propfirm.defaultBalance,
      startingBalance: service.propfirm.defaultBalance,
      profitAndLoss: 0,
      openPnL: 0,
      todayPnL: 0,
      status: 0,
      platform: 'Rithmic',
      propfirm: service.propfirm.name,
    }];
  }

  return { success: true, accounts: tradingAccounts };
};

/**
 * Request PnL snapshot for accounts
 * @param {RithmicService} service - The Rithmic service instance
 */
const requestPnLSnapshot = async (service) => {
  if (!service.pnlConn || !service.loginInfo) {
    debug('Cannot request P&L - no pnlConn or loginInfo');
    return;
  }

  debug('Requesting P&L for', service.accounts.length, 'accounts');
  
  for (const acc of service.accounts) {
    service.pnlConn.send('RequestPnLPositionSnapshot', {
      templateId: REQ.PNL_POSITION_SNAPSHOT,
      userMsg: ['HQX'],
      fcmId: acc.fcmId || service.loginInfo.fcmId,
      ibId: acc.ibId || service.loginInfo.ibId,
      accountId: acc.accountId,
    });
  }

  // Wait for responses
  await new Promise(resolve => setTimeout(resolve, 2000));
  debug('P&L snapshot complete, accountPnL size:', service.accountPnL.size);
};

/**
 * Subscribe to PnL updates
 * @param {RithmicService} service - The Rithmic service instance
 */
const subscribePnLUpdates = (service) => {
  if (!service.pnlConn || !service.loginInfo) return;

  for (const acc of service.accounts) {
    service.pnlConn.send('RequestPnLPositionUpdates', {
      templateId: REQ.PNL_POSITION_UPDATES,
      userMsg: ['HQX'],
      request: 1,
      fcmId: acc.fcmId || service.loginInfo.fcmId,
      ibId: acc.ibId || service.loginInfo.ibId,
      accountId: acc.accountId,
    });
  }
};

/**
 * Get positions
 * @param {RithmicService} service - The Rithmic service instance
 */
const getPositions = async (service) => {
  // Connect to PnL if needed
  if (!service.pnlConn && service.credentials) {
    await service.connectPnL(service.credentials.username, service.credentials.password);
    await requestPnLSnapshot(service);
  }
  
  const positions = Array.from(service.positions.values()).map(pos => ({
    symbol: pos.symbol,
    exchange: pos.exchange,
    quantity: pos.quantity,
    averagePrice: pos.averagePrice,
    unrealizedPnl: pos.openPnl,
    realizedPnl: pos.closedPnl,
    side: pos.quantity > 0 ? 'LONG' : 'SHORT',
  }));
  
  return { success: true, positions };
};

module.exports = {
  hashAccountId,
  fetchAccounts,
  getTradingAccounts,
  requestPnLSnapshot,
  subscribePnLUpdates,
  getPositions
};
