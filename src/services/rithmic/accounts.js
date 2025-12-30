/**
 * Rithmic Accounts Module
 * Account fetching, PnL, and positions
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
 * Get trading accounts formatted like ProjectX
 * @param {RithmicService} service - The Rithmic service instance
 */
const getTradingAccounts = async (service) => {
  if (service.accounts.length === 0 && service.orderConn && service.loginInfo) {
    try {
      await fetchAccounts(service);
    } catch (e) {
      // Ignore fetch errors
    }
  }

  let tradingAccounts = service.accounts.map((acc) => {
    const pnl = service.accountPnL.get(acc.accountId) || {};
    const balance = parseFloat(pnl.accountBalance || pnl.marginBalance || pnl.cashOnHand || 0) || service.propfirm.defaultBalance;
    const startingBalance = service.propfirm.defaultBalance;
    const profitAndLoss = balance - startingBalance;

    return {
      accountId: hashAccountId(acc.accountId),
      rithmicAccountId: acc.accountId,
      accountName: acc.accountName || acc.accountId,
      name: acc.accountName || acc.accountId,
      balance: balance,
      startingBalance: startingBalance,
      profitAndLoss: profitAndLoss,
      status: 0,
      platform: 'Rithmic',
      propfirm: service.propfirm.name,
    };
  });

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

  await new Promise(resolve => setTimeout(resolve, 2000));
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
