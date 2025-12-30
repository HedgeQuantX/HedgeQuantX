/**
 * Rithmic Accounts Module
 * Account fetching, PnL, and positions
 * 
 * STRICT RULE: Display ONLY values returned by API. No estimation, no simulation.
 */

const { REQ } = require('./constants');

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
 * Get trading accounts - ONLY returns values from API
 * No estimation, no simulation
 * 
 * @param {RithmicService} service - The Rithmic service instance
 */
const getTradingAccounts = async (service) => {
  // Fetch accounts if not already loaded
  if (service.accounts.length === 0 && service.orderConn && service.loginInfo) {
    try {
      await fetchAccounts(service);
    } catch (e) {
      // Ignore fetch errors
    }
  }

  // Request fresh P&L data from API
  if (service.pnlConn && service.accounts.length > 0) {
    await requestPnLSnapshot(service);
  }

  const tradingAccounts = service.accounts.map((acc) => {
    // Get P&L data from API (stored in accountPnL map from handlers.js)
    const pnlData = service.accountPnL.get(acc.accountId);
    
    // ONLY use values that came from API - null if not available
    let balance = null;
    let todayPnL = null;
    let openPnL = null;
    let closedPnL = null;
    
    if (pnlData) {
      // These values come directly from Rithmic API via handleAccountPnLUpdate
      balance = pnlData.accountBalance !== undefined ? pnlData.accountBalance : null;
      openPnL = pnlData.openPositionPnl !== undefined ? pnlData.openPositionPnl : null;
      closedPnL = pnlData.closedPositionPnl !== undefined ? pnlData.closedPositionPnl : null;
      todayPnL = pnlData.dayPnl !== undefined ? pnlData.dayPnl : null;
    }

    // Total P&L from API only
    let profitAndLoss = null;
    if (todayPnL !== null) {
      profitAndLoss = todayPnL;
    } else if (openPnL !== null || closedPnL !== null) {
      profitAndLoss = (openPnL || 0) + (closedPnL || 0);
    }

    return {
      accountId: hashAccountId(acc.accountId),
      rithmicAccountId: acc.accountId,
      accountName: acc.accountName || acc.accountId,
      name: acc.accountName || acc.accountId,
      // From API only - null if not available
      balance: balance,
      todayPnL: closedPnL,      // Realized P&L from API
      openPnL: openPnL,         // Unrealized P&L from API  
      profitAndLoss: profitAndLoss,
      // No estimation - these are null
      startingBalance: null,
      status: 0,
      platform: 'Rithmic',
      propfirm: service.propfirm.name,
    };
  });

  // Fallback if no accounts found
  if (tradingAccounts.length === 0 && service.user) {
    const userName = service.user.userName || 'Unknown';
    tradingAccounts.push({
      accountId: hashAccountId(userName),
      rithmicAccountId: userName,
      accountName: userName,
      name: userName,
      balance: null,
      startingBalance: null,
      todayPnL: null,
      openPnL: null,
      profitAndLoss: null,
      status: 0,
      platform: 'Rithmic',
      propfirm: service.propfirm.name,
    });
  }

  return { success: true, accounts: tradingAccounts };
};

/**
 * Request PnL snapshot for accounts
 * @param {RithmicService} service - The Rithmic service instance
 */
const requestPnLSnapshot = async (service) => {
  if (!service.pnlConn || !service.loginInfo) return;

  for (const acc of service.accounts) {
    service.pnlConn.send('RequestPnLPositionSnapshot', {
      templateId: REQ.PNL_POSITION_SNAPSHOT,
      userMsg: ['HQX'],
      fcmId: acc.fcmId || service.loginInfo.fcmId,
      ibId: acc.ibId || service.loginInfo.ibId,
      accountId: acc.accountId,
    });
  }

  // Wait for P&L data to arrive
  await new Promise(resolve => setTimeout(resolve, 1500));
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
 * Get positions - ONLY returns values from API
 * @param {RithmicService} service - The Rithmic service instance
 */
const getPositions = async (service) => {
  // Ensure PnL connection is active
  if (!service.pnlConn && service.credentials) {
    await service.connectPnL(service.credentials.username, service.credentials.password);
    await requestPnLSnapshot(service);
  }
  
  const positions = Array.from(service.positions.values()).map(pos => ({
    symbol: pos.symbol,
    exchange: pos.exchange,
    quantity: pos.quantity,
    averagePrice: pos.averagePrice,
    // From API only
    unrealizedPnl: pos.openPnl !== undefined ? pos.openPnl : null,
    realizedPnl: pos.closedPnl !== undefined ? pos.closedPnl : null,
    dayPnl: pos.dayPnl !== undefined ? pos.dayPnl : null,
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
