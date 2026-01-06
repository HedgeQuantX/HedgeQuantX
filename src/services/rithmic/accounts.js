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
 * Fetch account RMS info (status, limits) from ORDER_PLANT
 * @param {RithmicService} service - The Rithmic service instance
 * @param {string} accountId - The account ID to fetch RMS info for
 */
const fetchAccountRmsInfo = async (service, accountId) => {
  if (!service.orderConn || !service.loginInfo) {
    debug('fetchAccountRmsInfo: no connection or loginInfo');
    return null;
  }

  // Initialize map if needed
  if (!service.accountRmsInfo) service.accountRmsInfo = new Map();

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      debug('fetchAccountRmsInfo: timeout for', accountId);
      resolve(service.accountRmsInfo.get(accountId) || null);
    }, 3000);

    const onRmsInfo = (rmsInfo) => {
      if (rmsInfo.accountId === accountId) {
        debug('fetchAccountRmsInfo: received for', accountId);
        clearTimeout(timeout);
        service.removeListener('accountRmsInfoReceived', onRmsInfo);
        resolve(rmsInfo);
      }
    };
    service.on('accountRmsInfoReceived', onRmsInfo);

    try {
      debug('fetchAccountRmsInfo: sending RequestAccountRmsInfo for', accountId);
      service.orderConn.send('RequestAccountRmsInfo', {
        templateId: REQ.ACCOUNT_RMS,
        userMsg: ['HQX'],
        fcmId: service.loginInfo.fcmId,
        ibId: service.loginInfo.ibId,
        userType: 3, // USER_TYPE_TRADER
      });
    } catch (e) {
      debug('fetchAccountRmsInfo: error', e.message);
      clearTimeout(timeout);
      service.removeListener('accountRmsInfoReceived', onRmsInfo);
      resolve(null);
    }
  });
};

/**
 * Fetch RMS info for all accounts
 * @param {RithmicService} service - The Rithmic service instance
 */
const fetchAllAccountsRmsInfo = async (service) => {
  if (!service.orderConn || !service.loginInfo || service.accounts.length === 0) {
    return;
  }

  debug('fetchAllAccountsRmsInfo: fetching for', service.accounts.length, 'accounts');
  
  // Initialize map if needed
  if (!service.accountRmsInfo) service.accountRmsInfo = new Map();

  return new Promise((resolve) => {
    let receivedCount = 0;
    const expectedCount = service.accounts.length;
    
    const timeout = setTimeout(() => {
      debug('fetchAllAccountsRmsInfo: timeout, received', receivedCount, 'of', expectedCount);
      service.removeListener('accountRmsInfoReceived', onRmsInfo);
      resolve();
    }, 5000);

    const onRmsInfo = (rmsInfo) => {
      receivedCount++;
      debug('fetchAllAccountsRmsInfo: received', receivedCount, 'of', expectedCount);
      if (receivedCount >= expectedCount) {
        clearTimeout(timeout);
        service.removeListener('accountRmsInfoReceived', onRmsInfo);
        resolve();
      }
    };
    service.on('accountRmsInfoReceived', onRmsInfo);

    try {
      // Request RMS info - one request returns all accounts
      debug('fetchAllAccountsRmsInfo: sending RequestAccountRmsInfo');
      service.orderConn.send('RequestAccountRmsInfo', {
        templateId: REQ.ACCOUNT_RMS,
        userMsg: ['HQX'],
        fcmId: service.loginInfo.fcmId,
        ibId: service.loginInfo.ibId,
        userType: 3, // USER_TYPE_TRADER
      });
    } catch (e) {
      debug('fetchAllAccountsRmsInfo: error', e.message);
      clearTimeout(timeout);
      service.removeListener('accountRmsInfoReceived', onRmsInfo);
      resolve();
    }
  });
};

/**
 * Fetch accounts from ORDER_PLANT
 * @param {RithmicService} service - The Rithmic service instance
 */
const fetchAccounts = async (service) => {
  if (!service.orderConn || !service.loginInfo) {
    debug('fetchAccounts: no connection or loginInfo');
    return [];
  }

  return new Promise((resolve) => {
    const accounts = [];
    
    const timeout = setTimeout(() => {
      debug('fetchAccounts: timeout, found', accounts.length, 'accounts');
      service.accounts = accounts;
      resolve(accounts);
    }, 5000);

    // Listen for ALL accounts (not just once)
    const onAccount = (account) => {
      debug('fetchAccounts: received account', account.accountId);
      accounts.push(account);
    };
    service.on('accountReceived', onAccount);

    service.once('accountListComplete', () => {
      debug('fetchAccounts: complete, found', accounts.length, 'accounts');
      clearTimeout(timeout);
      service.removeListener('accountReceived', onAccount);
      service.accounts = accounts;
      resolve(accounts);
    });

    try {
      debug('fetchAccounts: sending RequestAccountList');
      service.orderConn.send('RequestAccountList', {
        templateId: REQ.ACCOUNT_LIST,
        userMsg: ['HQX'],
        fcmId: service.loginInfo.fcmId,
        ibId: service.loginInfo.ibId,
        userType: 3, // USER_TYPE_TRADER - required by Rithmic API
      });
    } catch (e) {
      debug('fetchAccounts: error', e.message);
      clearTimeout(timeout);
      service.removeListener('accountReceived', onAccount);
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

  // Fetch RMS info (status, limits) for all accounts
  if (service.orderConn && service.accounts.length > 0) {
    debug('Fetching account RMS info...');
    await fetchAllAccountsRmsInfo(service);
  }

  let tradingAccounts = service.accounts.map((acc) => {
    // Get P&L data from accountPnL map (populated by PNL_PLANT messages)
    const pnlData = service.accountPnL.get(acc.accountId) || {};
    debug(`Account ${acc.accountId} pnlData:`, JSON.stringify(pnlData));
    debug(`  accountPnL map size:`, service.accountPnL.size);
    
    // Get RMS info (status) from accountRmsInfo map
    const rmsInfo = service.accountRmsInfo?.get(acc.accountId) || {};
    debug(`Account ${acc.accountId} rmsInfo:`, JSON.stringify(rmsInfo));
    
    // REAL DATA FROM RITHMIC ONLY - NO DEFAULTS
    // Use !== undefined to handle 0 values correctly
    const accountBalance = pnlData.accountBalance !== undefined ? parseFloat(pnlData.accountBalance) : null;
    const openPnL = pnlData.openPositionPnl !== undefined ? parseFloat(pnlData.openPositionPnl) : null;
    const closedPnL = pnlData.closedPositionPnl !== undefined ? parseFloat(pnlData.closedPositionPnl) : null;
    const dayPnL = pnlData.dayPnl !== undefined ? parseFloat(pnlData.dayPnl) : null;

    // Calculate P&L: prefer dayPnl, fallback to open+closed
    let profitAndLoss = null;
    if (dayPnL !== null) {
      profitAndLoss = dayPnL;
    } else if (openPnL !== null || closedPnL !== null) {
      profitAndLoss = (openPnL || 0) + (closedPnL || 0);
    }

    return {
      accountId: hashAccountId(acc.accountId),
      rithmicAccountId: acc.accountId,
      accountName: acc.accountId,  // Never expose real name - only account ID
      name: acc.accountId,         // Never expose real name - only account ID
      balance: accountBalance,
      profitAndLoss: profitAndLoss,
      openPnL: openPnL,
      todayPnL: closedPnL,
      // Status/Type: Rithmic API doesn't provide user-friendly values
      // "admin only" and "Max Loss" are RMS internal values, not account status
      // Set to null to show "--" in UI (per RULES.md - no fake data)
      status: null,
      type: null,
      // Keep RMS data for reference
      rmsStatus: rmsInfo.status || null,
      rmsAlgorithm: rmsInfo.algorithm || null,
      lossLimit: rmsInfo.lossLimit || null,
      minAccountBalance: rmsInfo.minAccountBalance || null,
      buyLimit: rmsInfo.buyLimit || null,
      sellLimit: rmsInfo.sellLimit || null,
      platform: 'Rithmic',
      propfirm: service.propfirm.name,
    };
  });

  // No fallback - only real accounts from Rithmic

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
  fetchAccountRmsInfo,
  fetchAllAccountsRmsInfo,
  getTradingAccounts,
  requestPnLSnapshot,
  subscribePnLUpdates,
  getPositions
};
