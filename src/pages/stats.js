/**
 * Stats Page
 */

const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const asciichart = require('asciichart');

const { connections } = require('../services');
const { ACCOUNT_STATUS, ACCOUNT_TYPE } = require('../config');
const {
  getLogoWidth,
  visibleLength,
  drawBoxHeader,
  drawBoxFooter,
  getColWidths,
  draw2ColHeader,
  draw2ColSeparator,
  fmtRow
} = require('../ui');

/**
 * Show Stats Page
 */
const showStats = async (service) => {
  const spinner = ora('Fetching stats for all accounts...').start();
  
  let allAccountsData = [];
  
  // Get accounts from all connections
  if (connections.count() > 0) {
    for (const conn of connections.getAll()) {
      try {
        const result = await conn.service.getTradingAccounts();
        if (result.success && result.accounts) {
          result.accounts.forEach(account => {
            allAccountsData.push({
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
      allAccountsData = result.accounts.map(a => ({ ...a, service }));
    }
  }
  
  if (allAccountsData.length === 0) {
    spinner.fail('No accounts found');
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  // Filter only active accounts (status === 0)
  const activeAccounts = allAccountsData.filter(acc => acc.status === 0);
  
  if (activeAccounts.length === 0) {
    spinner.fail('No active accounts found');
    await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
    return;
  }

  // Collect stats
  let totalBalance = 0;
  let totalStartingBalance = 0;
  let totalPnL = 0;
  let allTrades = [];
  let totalOpenPositions = 0;
  let totalOpenOrders = 0;
  let allDailyStats = [];

  spinner.text = 'Fetching detailed stats...';

  for (const account of activeAccounts) {
    const svc = account.service;
    const currentBalance = account.balance || 0;
    totalBalance += currentBalance;
    
    // Estimate starting balance
    let startingBalance = account.startingBalance || account.initialBalance || 0;
    if (!startingBalance) {
      const name = (account.accountName || '').toUpperCase();
      if (name.includes('150K') || name.includes('150')) startingBalance = 150000;
      else if (name.includes('100K') || name.includes('100')) startingBalance = 100000;
      else if (name.includes('50K') || name.includes('50')) startingBalance = 50000;
      else if (currentBalance >= 140000) startingBalance = 150000;
      else if (currentBalance >= 90000) startingBalance = 100000;
      else if (currentBalance >= 45000) startingBalance = 50000;
      else startingBalance = currentBalance;
    }
    
    totalStartingBalance += startingBalance;
    account.startingBalance = startingBalance;
    
    if (account.profitAndLoss !== undefined) {
      totalPnL += account.profitAndLoss;
    }
    
    // Positions & Orders
    const posResult = await svc.getPositions(account.accountId);
    if (posResult.success) totalOpenPositions += posResult.positions.length;
    
    const ordResult = await svc.getOrders(account.accountId);
    if (ordResult.success) totalOpenOrders += ordResult.orders.filter(o => o.status === 1).length;
    
    // Lifetime stats
    const lifetimeResult = await svc.getLifetimeStats(account.accountId);
    if (lifetimeResult.success && lifetimeResult.stats) {
      account.lifetimeStats = lifetimeResult.stats;
    }
    
    // Daily stats
    const dailyResult = await svc.getDailyStats(account.accountId);
    if (dailyResult.success && dailyResult.stats) {
      account.dailyStats = dailyResult.stats;
      allDailyStats = allDailyStats.concat(dailyResult.stats);
    }
    
    // Trade history
    const tradesResult = await svc.getTradeHistory(account.accountId, 30);
    if (tradesResult.success && tradesResult.trades.length > 0) {
      allTrades = allTrades.concat(tradesResult.trades.map(t => ({
        ...t,
        accountName: account.accountName,
        propfirm: account.propfirm
      })));
    }
  }

  if (totalPnL === 0 && totalStartingBalance > 0) {
    totalPnL = totalBalance - totalStartingBalance;
  }

  // Aggregate stats
  let stats = {
    totalTrades: 0, winningTrades: 0, losingTrades: 0,
    totalWinAmount: 0, totalLossAmount: 0,
    bestTrade: 0, worstTrade: 0, totalVolume: 0,
    maxConsecutiveWins: 0, maxConsecutiveLosses: 0,
    longTrades: 0, shortTrades: 0, longWins: 0, shortWins: 0
  };
  
  for (const account of activeAccounts) {
    if (account.lifetimeStats) {
      const s = account.lifetimeStats;
      stats.totalTrades += s.totalTrades || 0;
      stats.winningTrades += s.winningTrades || 0;
      stats.losingTrades += s.losingTrades || 0;
      stats.totalWinAmount += s.totalWinAmount || 0;
      stats.totalLossAmount += s.totalLossAmount || 0;
      stats.bestTrade = Math.max(stats.bestTrade, s.bestTrade || 0);
      stats.worstTrade = Math.min(stats.worstTrade, s.worstTrade || 0);
      stats.totalVolume += s.totalVolume || 0;
      stats.maxConsecutiveWins = Math.max(stats.maxConsecutiveWins, s.maxConsecutiveWins || 0);
      stats.maxConsecutiveLosses = Math.max(stats.maxConsecutiveLosses, s.maxConsecutiveLosses || 0);
      stats.longTrades += s.longTrades || 0;
      stats.shortTrades += s.shortTrades || 0;
    }
  }
  
  // If no stats from API, calculate from trades
  if (stats.totalTrades === 0 && allTrades.length > 0) {
    stats.totalTrades = allTrades.length;
    let consecutiveWins = 0, consecutiveLosses = 0;
    
    for (const trade of allTrades) {
      const pnl = trade.profitAndLoss || trade.pnl || 0;
      const size = trade.size || trade.quantity || 1;
      const side = trade.side;
      
      stats.totalVolume += Math.abs(size);
      
      if (side === 0) {
        stats.longTrades++;
        if (pnl > 0) stats.longWins++;
      } else if (side === 1) {
        stats.shortTrades++;
        if (pnl > 0) stats.shortWins++;
      }
      
      if (pnl > 0) {
        stats.winningTrades++;
        stats.totalWinAmount += pnl;
        consecutiveWins++;
        consecutiveLosses = 0;
        if (consecutiveWins > stats.maxConsecutiveWins) stats.maxConsecutiveWins = consecutiveWins;
        if (pnl > stats.bestTrade) stats.bestTrade = pnl;
      } else if (pnl < 0) {
        stats.losingTrades++;
        stats.totalLossAmount += Math.abs(pnl);
        consecutiveLosses++;
        consecutiveWins = 0;
        if (consecutiveLosses > stats.maxConsecutiveLosses) stats.maxConsecutiveLosses = consecutiveLosses;
        if (pnl < stats.worstTrade) stats.worstTrade = pnl;
      }
    }
  }

  spinner.succeed('Stats loaded');
  console.log();
  
  // Display
  const boxWidth = getLogoWidth();
  const { col1, col2 } = getColWidths(boxWidth);
  
  // Calculated metrics
  const winRate = stats.totalTrades > 0 ? ((stats.winningTrades / stats.totalTrades) * 100).toFixed(1) : '0.0';
  const avgWin = stats.winningTrades > 0 ? (stats.totalWinAmount / stats.winningTrades).toFixed(2) : '0.00';
  const avgLoss = stats.losingTrades > 0 ? (stats.totalLossAmount / stats.losingTrades).toFixed(2) : '0.00';
  const profitFactor = stats.totalLossAmount > 0 ? (stats.totalWinAmount / stats.totalLossAmount).toFixed(2) : '0.00';
  const netPnL = stats.totalWinAmount - stats.totalLossAmount;
  const returnPercent = totalStartingBalance > 0 ? ((totalPnL / totalStartingBalance) * 100).toFixed(2) : '0.00';
  const longWinRate = stats.longTrades > 0 ? ((stats.longWins / stats.longTrades) * 100).toFixed(1) : '0.0';
  const shortWinRate = stats.shortTrades > 0 ? ((stats.shortWins / stats.shortTrades) * 100).toFixed(1) : '0.0';
  
  const totalBalanceColor = totalBalance >= 0 ? chalk.green : chalk.red;
  const pnlColor = totalPnL >= 0 ? chalk.green : chalk.red;
  
  // Main Summary
  drawBoxHeader('HQX STATS', boxWidth);
  draw2ColHeader('ACCOUNT OVERVIEW', 'TRADING PERFORMANCE', boxWidth);
  
  console.log(chalk.cyan('\u2551') + fmtRow('Connections:', chalk.cyan(connections.count().toString() || '1'), col1) + chalk.cyan('\u2502') + fmtRow('Total Trades:', chalk.white(stats.totalTrades.toString()), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Total Accounts:', chalk.cyan(activeAccounts.length.toString()), col1) + chalk.cyan('\u2502') + fmtRow('Winning Trades:', chalk.green(stats.winningTrades.toString()), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Total Balance:', totalBalanceColor('$' + totalBalance.toLocaleString()), col1) + chalk.cyan('\u2502') + fmtRow('Losing Trades:', chalk.red(stats.losingTrades.toString()), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Starting Balance:', chalk.white('$' + totalStartingBalance.toLocaleString()), col1) + chalk.cyan('\u2502') + fmtRow('Win Rate:', parseFloat(winRate) >= 50 ? chalk.green(winRate + '%') : chalk.yellow(winRate + '%'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Total P&L:', pnlColor('$' + totalPnL.toLocaleString() + ' (' + returnPercent + '%)'), col1) + chalk.cyan('\u2502') + fmtRow('Long Trades:', chalk.white(stats.longTrades + ' (' + longWinRate + '%)'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Open Positions:', chalk.white(totalOpenPositions.toString()), col1) + chalk.cyan('\u2502') + fmtRow('Short Trades:', chalk.white(stats.shortTrades + ' (' + shortWinRate + '%)'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Open Orders:', chalk.white(totalOpenOrders.toString()), col1) + chalk.cyan('\u2502') + fmtRow('Volume:', chalk.white(stats.totalVolume + ' contracts'), col2) + chalk.cyan('\u2551'));
  
  // P&L Metrics
  draw2ColSeparator(boxWidth);
  draw2ColHeader('P&L METRICS', 'RISK METRICS', boxWidth);
  
  const pfColor = parseFloat(profitFactor) >= 1.5 ? chalk.green(profitFactor) : parseFloat(profitFactor) >= 1 ? chalk.yellow(profitFactor) : chalk.red(profitFactor);
  
  console.log(chalk.cyan('\u2551') + fmtRow('Net P&L:', netPnL >= 0 ? chalk.green('$' + netPnL.toFixed(2)) : chalk.red('$' + netPnL.toFixed(2)), col1) + chalk.cyan('\u2502') + fmtRow('Profit Factor:', pfColor, col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Gross Profit:', chalk.green('$' + stats.totalWinAmount.toFixed(2)), col1) + chalk.cyan('\u2502') + fmtRow('Max Consec. Wins:', chalk.green(stats.maxConsecutiveWins.toString()), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Gross Loss:', chalk.red('-$' + stats.totalLossAmount.toFixed(2)), col1) + chalk.cyan('\u2502') + fmtRow('Max Consec. Loss:', chalk.red(stats.maxConsecutiveLosses.toString()), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Avg Win:', chalk.green('$' + avgWin), col1) + chalk.cyan('\u2502') + fmtRow('Best Trade:', chalk.green('$' + stats.bestTrade.toFixed(2)), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Avg Loss:', chalk.red('-$' + avgLoss), col1) + chalk.cyan('\u2502') + fmtRow('Worst Trade:', chalk.red('$' + stats.worstTrade.toFixed(2)), col2) + chalk.cyan('\u2551'));
  
  drawBoxFooter(boxWidth);
  
  // Equity Curve
  console.log();
  drawBoxHeader('EQUITY CURVE', boxWidth);
  
  const chartInnerWidth = boxWidth - 2;
  
  if (allTrades.length > 0) {
    const yAxisWidth = 10;
    const chartAreaWidth = chartInnerWidth - yAxisWidth - 4;
    
    let equityData = [totalStartingBalance];
    let equity = totalStartingBalance;
    allTrades.forEach(trade => {
      equity += (trade.profitAndLoss || trade.pnl || 0);
      equityData.push(equity);
    });
    
    const maxDataPoints = chartAreaWidth - 5;
    if (equityData.length > maxDataPoints) {
      const step = Math.ceil(equityData.length / maxDataPoints);
      equityData = equityData.filter((_, i) => i % step === 0);
    }
    
    const chartConfig = {
      height: 10,
      colors: [equityData[equityData.length - 1] < equityData[0] ? asciichart.red : asciichart.green],
      format: (x) => ('$' + (x / 1000).toFixed(0) + 'K').padStart(yAxisWidth)
    };
    
    const chart = asciichart.plot(equityData, chartConfig);
    chart.split('\n').forEach(line => {
      let chartLine = '  ' + line;
      const len = chartLine.replace(/\x1b\[[0-9;]*m/g, '').length;
      if (len < chartInnerWidth) chartLine += ' '.repeat(chartInnerWidth - len);
      console.log(chalk.cyan('\u2551') + chartLine + chalk.cyan('\u2551'));
    });
  } else {
    const msg = '  No trade data available';
    console.log(chalk.cyan('\u2551') + chalk.gray(msg) + ' '.repeat(chartInnerWidth - msg.length) + chalk.cyan('\u2551'));
  }
  
  drawBoxFooter(boxWidth);
  console.log();
  
  await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
};

module.exports = { showStats };
