/**
 * @fileoverview Stats Page - Rithmic Only
 * @module pages/stats
 * 
 * STRICT RULE: Display ONLY values returned by API
 * - Rithmic: Uses PNL_PLANT for balance/P&L, ORDER_PLANT for accounts
 * - NO estimation, NO simulation, NO mock data
 */

const ora = require('ora');

const { connections } = require('../../services');
const { prompts } = require('../../utils');
const { aggregateStats, calculateDerivedMetrics, calculateQuantMetrics, calculateHQXScore } = require('./metrics');
const { renderOverview, renderPnLMetrics, renderQuantMetrics, renderTradesHistory, renderHQXScore, renderNotice } = require('./display');
const { renderEquityCurve } = require('./chart');

/**
 * Fetch account data from all connections
 */
const fetchAccountsData = async (allConns) => {
  const connectionTypes = { rithmic: 0 };
  let allAccountsData = [];
  
  for (const conn of allConns) {
    const connType = conn.type || 'rithmic';
    const propfirmName = conn.propfirm || conn.type || 'Unknown';
    
    if (connType === 'rithmic') connectionTypes.rithmic++;
    
    try {
      const result = await conn.service.getTradingAccounts();
      if (result.success && result.accounts && result.accounts.length > 0) {
        result.accounts.forEach(account => {
          allAccountsData.push({
            ...account,
            propfirm: propfirmName,
            connectionType: connType,
            service: conn.service
          });
        });
      }
    } catch (e) {
      // Silently skip failed connections
    }
  }
  
  // Remove duplicates by accountId
  const seen = new Set();
  allAccountsData = allAccountsData.filter(acc => {
    const id = String(acc.accountId);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  
  return { connectionTypes, allAccountsData };
};

/**
 * Aggregate data from active accounts
 */
const aggregateAccountData = async (activeAccounts) => {
  let totalBalance = 0;
  let totalPnL = 0;
  let totalStartingBalance = 0;
  let allTrades = [];
  let totalOpenPositions = 0;
  let totalOpenOrders = 0;
  let hasBalanceData = false;
  let hasPnLData = false;
  let hasTradeData = false;

  for (let i = 0; i < activeAccounts.length; i++) {
    const account = activeAccounts[i];
    const svc = account.service;
    const connType = account.connectionType || 'rithmic';
    
    try {
      // Balance from API
      if (account.balance !== null && account.balance !== undefined) {
        totalBalance += account.balance;
        hasBalanceData = true;
      }
      
      // P&L from API (NEVER calculated locally)
      if (account.profitAndLoss !== null && account.profitAndLoss !== undefined) {
        totalPnL += account.profitAndLoss;
        hasPnLData = true;
      }
      
      // Starting balance
      if (account.startingBalance !== null && account.startingBalance !== undefined) {
        totalStartingBalance += account.startingBalance;
      } else if (account.balance !== null && account.balance !== undefined) {
        const pnl = account.profitAndLoss || 0;
        totalStartingBalance += (account.balance - pnl);
      }
      
      // Positions from API
      try {
        const posResult = await svc.getPositions(account.accountId);
        if (posResult.success && posResult.positions) {
          totalOpenPositions += posResult.positions.length;
        }
      } catch (e) {}
      
      // Orders from API
      try {
        const ordResult = await svc.getOrders(account.accountId);
        if (ordResult.success && ordResult.orders) {
          totalOpenOrders += ordResult.orders.filter(o => o.status === 1 || o.status === 'Working').length;
        }
      } catch (e) {}
      
      // Lifetime stats (Rithmic returns null)
      if (typeof svc.getLifetimeStats === 'function') {
        try {
          const lifetimeResult = await svc.getLifetimeStats(account.accountId);
          if (lifetimeResult.success && lifetimeResult.stats) {
            account.lifetimeStats = lifetimeResult.stats;
          }
        } catch (e) {}
      }
      
      // Trade history (Rithmic doesn't provide this)
      if (typeof svc.getTradeHistory === 'function') {
        try {
          const tradesResult = await svc.getTradeHistory(account.accountId, 30);
          if (tradesResult.success && tradesResult.trades && tradesResult.trades.length > 0) {
            hasTradeData = true;
            allTrades = allTrades.concat(tradesResult.trades.map(t => ({
              ...t,
              accountName: account.accountName,
              propfirm: account.propfirm,
              connectionType: connType
            })));
          }
        } catch (e) {}
      }
    } catch (e) {}
  }

  return {
    totalBalance,
    totalPnL,
    totalStartingBalance,
    allTrades,
    totalOpenPositions,
    totalOpenOrders,
    hasBalanceData,
    hasPnLData,
    hasTradeData,
  };
};

/**
 * Show Stats Page
 */
const showStats = async (service) => {
  let spinner;
  
  try {
    spinner = ora({ text: 'Loading stats...', color: 'yellow' }).start();
    
    // Get all connections
    const allConns = connections.count() > 0 
      ? connections.getAll() 
      : (service ? [{ service, propfirm: service.propfirm?.name || 'Unknown', type: 'rithmic' }] : []);
    
    if (allConns.length === 0) {
      spinner.fail('No connections found');
      await prompts.waitForEnter();
      return;
    }

    // Fetch accounts data
    const { connectionTypes, allAccountsData } = await fetchAccountsData(allConns);
    
    if (allAccountsData.length === 0) {
      spinner.fail('No accounts found');
      await prompts.waitForEnter();
      return;
    }

    // Filter active accounts (status === 0)
    const activeAccounts = allAccountsData.filter(acc => acc.status === 0);
    
    if (activeAccounts.length === 0) {
      spinner.fail('No active accounts found');
      await prompts.waitForEnter();
      return;
    }

    // Aggregate account data from APIs
    const accountData = await aggregateAccountData(activeAccounts);
    
    spinner.succeed('Stats loaded');
    console.log();
    
    // Calculate stats from API data
    const stats = aggregateStats(activeAccounts, accountData.allTrades);
    const metrics = calculateDerivedMetrics(stats, accountData.totalStartingBalance, accountData.totalPnL);
    const quantMetrics = calculateQuantMetrics(accountData.allTrades, accountData.totalStartingBalance, accountData.totalPnL);
    const hqxScoreData = calculateHQXScore(stats, metrics, accountData.totalStartingBalance);
    
    // Prepare display data
    const displayData = {
      connectionTypes,
      activeAccounts,
      connections: connections.count() || 1,
      stats,
      metrics,
      quantMetrics,
      hqxScoreData,
      allTrades: accountData.allTrades,
      ...accountData,
    };
    
    // Render all sections
    renderOverview(displayData);
    renderPnLMetrics(displayData);
    renderQuantMetrics(displayData);
    renderEquityCurve(displayData);
    renderTradesHistory(displayData);
    renderHQXScore(displayData);
    renderNotice();
    
  } catch (error) {
    if (spinner) spinner.fail('Error: ' + error.message);
  }
  
  await prompts.waitForEnter();
};

module.exports = { showStats };
