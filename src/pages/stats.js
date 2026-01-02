/**
 * Stats Page
 */

const chalk = require('chalk');
const ora = require('ora');
const asciichart = require('asciichart');

const { connections } = require('../services');
const { getLogoWidth, visibleLength, drawBoxHeader, drawBoxFooter, getColWidths, draw2ColHeader, draw2ColSeparator, fmtRow } = require('../ui');
const { prompts } = require('../utils');

/**
 * Show Stats Page
 */
const showStats = async (service) => {
  let spinner;
  
  try {
    // Single spinner for loading
    spinner = ora({ text: 'Loading stats...', color: 'yellow' }).start();
    
    const allConns = connections.count() > 0 
      ? connections.getAll() 
      : (service ? [{ service, propfirm: service.propfirm?.name || 'Unknown', type: 'single' }] : []);
    
    if (allConns.length === 0) {
      spinner.fail('No connections found');
      await prompts.waitForEnter();
      return;
    }

    // Fetch accounts from each connection
    let allAccountsData = [];
    
    for (const conn of allConns) {
      const propfirmName = conn.propfirm || conn.type || 'Unknown';
      
      try {
        const result = await conn.service.getTradingAccounts();
        if (result.success && result.accounts && result.accounts.length > 0) {
          result.accounts.forEach(account => {
            allAccountsData.push({
              ...account,
              propfirm: propfirmName,
              service: conn.service
            });
          });
        }
      } catch (e) {}
    }
    
    if (allAccountsData.length === 0) {
      spinner.fail('No accounts found');
      await prompts.waitForEnter();
      return;
    }

    // Remove duplicates by accountId
    const seen = new Set();
    allAccountsData = allAccountsData.filter(acc => {
      const id = String(acc.accountId);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Filter only active accounts (status === 0)
    const activeAccounts = allAccountsData.filter(acc => acc.status === 0);
    
    if (activeAccounts.length === 0) {
      spinner.fail('No active accounts found');
      await prompts.waitForEnter();
      return;
    }

    // Collect stats for each account
    let totalBalance = 0;
    let totalPnL = 0;
    let totalStartingBalance = 0;
    let allTrades = [];
    let totalOpenPositions = 0;
    let totalOpenOrders = 0;
    let hasBalanceData = false;
    let hasPnLData = false;

    for (let i = 0; i < activeAccounts.length; i++) {
      const account = activeAccounts[i];
      const svc = account.service;
      
      try {
        // Balance
        if (account.balance !== null && account.balance !== undefined) {
          totalBalance += account.balance;
          hasBalanceData = true;
        }
        
        // P&L
        if (account.profitAndLoss !== null && account.profitAndLoss !== undefined) {
          totalPnL += account.profitAndLoss;
          hasPnLData = true;
        }
        
        // Starting balance
        if (account.balance !== null && account.balance !== undefined) {
          const pnl = account.profitAndLoss || 0;
          totalStartingBalance += (account.balance - pnl);
        }
        
        // Positions
        try {
          const posResult = await svc.getPositions(account.accountId);
          if (posResult.success && posResult.positions) {
            totalOpenPositions += posResult.positions.length;
          }
        } catch (e) {}
        
        // Orders
        try {
          const ordResult = await svc.getOrders(account.accountId);
          if (ordResult.success && ordResult.orders) {
            totalOpenOrders += ordResult.orders.filter(o => o.status === 1).length;
          }
        } catch (e) {}
        
        // Lifetime stats
        if (typeof svc.getLifetimeStats === 'function') {
          try {
            const lifetimeResult = await svc.getLifetimeStats(account.accountId);
            if (lifetimeResult.success && lifetimeResult.stats) {
              account.lifetimeStats = lifetimeResult.stats;
            }
          } catch (e) {}
        }
        
        // Trade history
        if (typeof svc.getTradeHistory === 'function') {
          try {
            const tradesResult = await svc.getTradeHistory(account.accountId, 30);
            if (tradesResult.success && tradesResult.trades && tradesResult.trades.length > 0) {
              allTrades = allTrades.concat(tradesResult.trades.map(t => ({
                ...t,
                accountName: account.accountName,
                propfirm: account.propfirm
              })));
            }
          } catch (e) {}
        }
      } catch (e) {}
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

    spinner.succeed('All stats loaded');
    console.log();
    
    // Display
    const boxWidth = getLogoWidth();
    const { col1, col2 } = getColWidths(boxWidth);
    
    // Use 0 if null
    if (!hasBalanceData) totalBalance = 0;
    if (!hasPnLData) totalPnL = 0;
    
    // Calculated metrics
    const winRate = stats.totalTrades > 0 ? ((stats.winningTrades / stats.totalTrades) * 100).toFixed(1) : '0.0';
    const avgWin = stats.winningTrades > 0 ? (stats.totalWinAmount / stats.winningTrades).toFixed(2) : '0.00';
    const avgLoss = stats.losingTrades > 0 ? (stats.totalLossAmount / stats.losingTrades).toFixed(2) : '0.00';
    const profitFactor = stats.totalLossAmount > 0 ? (stats.totalWinAmount / stats.totalLossAmount).toFixed(2) : (stats.totalWinAmount > 0 ? '∞' : '0.00');
    const netPnL = stats.totalWinAmount - stats.totalLossAmount;
    const returnPercent = totalStartingBalance > 0 ? ((totalPnL / totalStartingBalance) * 100).toFixed(2) : '0.00';
    const longWinRate = stats.longTrades > 0 ? ((stats.longWins / stats.longTrades) * 100).toFixed(1) : '0.0';
    const shortWinRate = stats.shortTrades > 0 ? ((stats.shortWins / stats.shortTrades) * 100).toFixed(1) : '0.0';
    
    // Advanced quantitative metrics
    const tradePnLs = allTrades.map(t => t.profitAndLoss || t.pnl || 0);
    const avgReturn = tradePnLs.length > 0 ? tradePnLs.reduce((a, b) => a + b, 0) / tradePnLs.length : 0;
    
    // Standard deviation
    const variance = tradePnLs.length > 0 
      ? tradePnLs.reduce((sum, pnl) => sum + Math.pow(pnl - avgReturn, 2), 0) / tradePnLs.length 
      : 0;
    const stdDev = Math.sqrt(variance);
    
    // Downside deviation
    const downsideReturns = tradePnLs.filter(pnl => pnl < 0);
    const downsideVariance = downsideReturns.length > 0 
      ? downsideReturns.reduce((sum, pnl) => sum + Math.pow(pnl, 2), 0) / downsideReturns.length 
      : 0;
    const downsideDev = Math.sqrt(downsideVariance);
    
    // Ratios
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev).toFixed(2) : '0.00';
    const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev).toFixed(2) : '0.00';
    
    // Max Drawdown
    let maxDrawdown = 0;
    let peak = totalStartingBalance || 100000;
    let equity = peak;
    tradePnLs.forEach(pnl => {
      equity += pnl;
      if (equity > peak) peak = equity;
      const drawdown = peak > 0 ? (peak - equity) / peak * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    });
    
    const expectancy = stats.totalTrades > 0 ? netPnL / stats.totalTrades : 0;
    const riskRewardRatio = parseFloat(avgLoss) > 0 ? (parseFloat(avgWin) / parseFloat(avgLoss)).toFixed(2) : '0.00';
    const calmarRatio = maxDrawdown > 0 ? (parseFloat(returnPercent) / maxDrawdown).toFixed(2) : '0.00';
    
    const totalBalanceColor = totalBalance >= 0 ? chalk.green : chalk.red;
    const pnlColor = totalPnL >= 0 ? chalk.green : chalk.red;
    
    // Main Summary
    drawBoxHeader('HQX STATS', boxWidth);
    draw2ColHeader('ACCOUNT OVERVIEW', 'TRADING PERFORMANCE', boxWidth);
    
    console.log(chalk.cyan('\u2551') + fmtRow('Connections:', chalk.cyan(String(connections.count() || 1)), col1) + chalk.cyan('\u2502') + fmtRow('Total Trades:', chalk.white(String(stats.totalTrades)), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Total Accounts:', chalk.cyan(String(activeAccounts.length)), col1) + chalk.cyan('\u2502') + fmtRow('Winning Trades:', chalk.green(String(stats.winningTrades)), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Total Balance:', totalBalanceColor('$' + totalBalance.toLocaleString(undefined, {minimumFractionDigits: 2})), col1) + chalk.cyan('\u2502') + fmtRow('Losing Trades:', chalk.red(String(stats.losingTrades)), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Starting Balance:', chalk.white('$' + totalStartingBalance.toLocaleString(undefined, {minimumFractionDigits: 2})), col1) + chalk.cyan('\u2502') + fmtRow('Win Rate:', parseFloat(winRate) >= 50 ? chalk.green(winRate + '%') : chalk.yellow(winRate + '%'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Total P&L:', pnlColor((totalPnL >= 0 ? '+' : '') + '$' + totalPnL.toLocaleString(undefined, {minimumFractionDigits: 2}) + ' (' + returnPercent + '%)'), col1) + chalk.cyan('\u2502') + fmtRow('Long Trades:', chalk.white(stats.longTrades + ' (' + longWinRate + '%)'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Open Positions:', chalk.white(String(totalOpenPositions)), col1) + chalk.cyan('\u2502') + fmtRow('Short Trades:', chalk.white(stats.shortTrades + ' (' + shortWinRate + '%)'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Open Orders:', chalk.white(String(totalOpenOrders)), col1) + chalk.cyan('\u2502') + fmtRow('Volume:', chalk.white(stats.totalVolume + ' contracts'), col2) + chalk.cyan('\u2551'));
    
    // P&L Metrics
    draw2ColSeparator(boxWidth);
    draw2ColHeader('P&L METRICS', 'RISK METRICS', boxWidth);
    
    const pfColor = parseFloat(profitFactor) >= 1.5 ? chalk.green(profitFactor) : parseFloat(profitFactor) >= 1 ? chalk.yellow(profitFactor) : chalk.red(profitFactor);
    
    console.log(chalk.cyan('\u2551') + fmtRow('Net P&L:', netPnL >= 0 ? chalk.green('$' + netPnL.toFixed(2)) : chalk.red('$' + netPnL.toFixed(2)), col1) + chalk.cyan('\u2502') + fmtRow('Profit Factor:', pfColor, col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Gross Profit:', chalk.green('$' + stats.totalWinAmount.toFixed(2)), col1) + chalk.cyan('\u2502') + fmtRow('Max Consec. Wins:', chalk.green(String(stats.maxConsecutiveWins)), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Gross Loss:', chalk.red('-$' + stats.totalLossAmount.toFixed(2)), col1) + chalk.cyan('\u2502') + fmtRow('Max Consec. Loss:', chalk.red(String(stats.maxConsecutiveLosses)), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Avg Win:', chalk.green('$' + avgWin), col1) + chalk.cyan('\u2502') + fmtRow('Best Trade:', chalk.green('$' + stats.bestTrade.toFixed(2)), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Avg Loss:', chalk.red('-$' + avgLoss), col1) + chalk.cyan('\u2502') + fmtRow('Worst Trade:', chalk.red('$' + stats.worstTrade.toFixed(2)), col2) + chalk.cyan('\u2551'));
    
    // Quantitative Metrics
    draw2ColSeparator(boxWidth);
    draw2ColHeader('QUANTITATIVE METRICS', 'ADVANCED RATIOS', boxWidth);
    
    const sharpeColor = parseFloat(sharpeRatio) >= 1 ? chalk.green : parseFloat(sharpeRatio) >= 0.5 ? chalk.yellow : chalk.red;
    const sortinoColor = parseFloat(sortinoRatio) >= 1.5 ? chalk.green : parseFloat(sortinoRatio) >= 0.5 ? chalk.yellow : chalk.red;
    const ddColor = maxDrawdown <= 5 ? chalk.green : maxDrawdown <= 15 ? chalk.yellow : chalk.red;
    const rrColor = parseFloat(riskRewardRatio) >= 2 ? chalk.green : parseFloat(riskRewardRatio) >= 1 ? chalk.yellow : chalk.red;
    
    console.log(chalk.cyan('\u2551') + fmtRow('Sharpe Ratio:', sharpeColor(sharpeRatio), col1) + chalk.cyan('\u2502') + fmtRow('Risk/Reward:', rrColor(riskRewardRatio), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Sortino Ratio:', sortinoColor(sortinoRatio), col1) + chalk.cyan('\u2502') + fmtRow('Calmar Ratio:', chalk.white(calmarRatio), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Max Drawdown:', ddColor(maxDrawdown.toFixed(2) + '%'), col1) + chalk.cyan('\u2502') + fmtRow('Expectancy:', expectancy >= 0 ? chalk.green('$' + expectancy.toFixed(2)) : chalk.red('$' + expectancy.toFixed(2)), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Std Deviation:', chalk.white('$' + stdDev.toFixed(2)), col1) + chalk.cyan('\u2502') + fmtRow('Avg Trade:', avgReturn >= 0 ? chalk.green('$' + avgReturn.toFixed(2)) : chalk.red('$' + avgReturn.toFixed(2)), col2) + chalk.cyan('\u2551'));
    
    drawBoxFooter(boxWidth);
    
    // Equity Curve
    console.log();
    drawBoxHeader('EQUITY CURVE', boxWidth);
    
    const chartInnerWidth = boxWidth - 2;
    
    if (allTrades.length > 0) {
      const yAxisWidth = 10;
      const chartAreaWidth = chartInnerWidth - yAxisWidth - 4;
      
      let equityData = [totalStartingBalance || 100000];
      let eqVal = equityData[0];
      allTrades.forEach(trade => {
        eqVal += (trade.profitAndLoss || trade.pnl || 0);
        equityData.push(eqVal);
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
    
    // Trades History
    console.log();
    drawBoxHeader('TRADES HISTORY', boxWidth);
    
    const innerWidth = boxWidth - 2;
    
    if (allTrades.length > 0) {
      const colTime = 12;
      const colSymbol = 10;
      const colEntry = 10;
      const colExit = 10;
      const colEntryP = 10;
      const colExitP = 10;
      const colPnL = 10;
      const colDir = 6;
      const colID = innerWidth - colTime - colSymbol - colEntry - colExit - colEntryP - colExitP - colPnL - colDir - 9;
      
      const header = 
        chalk.white(' Time'.padEnd(colTime)) + chalk.gray('|') +
        chalk.white('Symbol'.padEnd(colSymbol)) + chalk.gray('|') +
        chalk.white('Entry'.padEnd(colEntry)) + chalk.gray('|') +
        chalk.white('Exit'.padEnd(colExit)) + chalk.gray('|') +
        chalk.white('Entry $'.padEnd(colEntryP)) + chalk.gray('|') +
        chalk.white('Exit $'.padEnd(colExitP)) + chalk.gray('|') +
        chalk.white('P&L'.padEnd(colPnL)) + chalk.gray('|') +
        chalk.white('Dir'.padEnd(colDir)) + chalk.gray('|') +
        chalk.white('ID'.padEnd(colID));
      
      console.log(chalk.cyan('\u2551') + header + chalk.cyan('\u2551'));
      console.log(chalk.cyan('\u2551') + chalk.gray('\u2500'.repeat(innerWidth)) + chalk.cyan('\u2551'));
      
      const recentTrades = allTrades.slice(-10).reverse();
      
      for (const trade of recentTrades) {
        // Use API fields directly: creationTimestamp, contractId, price, profitAndLoss, side
        const timestamp = trade.creationTimestamp || trade.timestamp || trade.exitTime;
        const time = timestamp ? new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '--:--';
        const symbol = (trade.contractId || trade.contractName || trade.symbol || 'N/A').substring(0, colSymbol - 1);
        const entryTime = trade.entryTime ? new Date(trade.entryTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : time;
        const exitTime = trade.exitTime ? new Date(trade.exitTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : time;
        const price = trade.price || trade.entryPrice || trade.exitPrice || 0;
        const entryPrice = trade.entryPrice ? trade.entryPrice.toFixed(2) : (price ? price.toFixed(2) : 'N/A');
        const exitPrice = trade.exitPrice ? trade.exitPrice.toFixed(2) : (price ? price.toFixed(2) : 'N/A');
        const pnl = trade.profitAndLoss || trade.pnl || 0;
        const pnlStr = pnl >= 0 ? chalk.green('+$' + pnl.toFixed(0)) : chalk.red('-$' + Math.abs(pnl).toFixed(0));
        const direction = trade.side === 0 ? chalk.green('LONG') : trade.side === 1 ? chalk.red('SHORT') : chalk.gray('N/A');
        const tradeId = String(trade.id || trade.tradeId || 'N/A').substring(0, colID - 1);
        
        const row = 
          (' ' + time).padEnd(colTime) + chalk.gray('|') +
          symbol.padEnd(colSymbol) + chalk.gray('|') +
          entryTime.padEnd(colEntry) + chalk.gray('|') +
          exitTime.padEnd(colExit) + chalk.gray('|') +
          entryPrice.padEnd(colEntryP) + chalk.gray('|') +
          exitPrice.padEnd(colExitP) + chalk.gray('|') +
          pnlStr.padEnd(colPnL + 10) + chalk.gray('|') +
          direction.padEnd(colDir + 10) + chalk.gray('|') +
          tradeId.padEnd(colID);
        
        const visLen = row.replace(/\x1b\[[0-9;]*m/g, '').length;
        const padding = innerWidth - visLen;
        
        console.log(chalk.cyan('\u2551') + row + ' '.repeat(Math.max(0, padding)) + chalk.cyan('\u2551'));
      }
      
      if (allTrades.length > 10) {
        const moreMsg = `  ... and ${allTrades.length - 10} more trades`;
        console.log(chalk.cyan('\u2551') + chalk.gray(moreMsg) + ' '.repeat(innerWidth - moreMsg.length) + chalk.cyan('\u2551'));
      }
    } else {
      const msg = '  No trade history available';
      console.log(chalk.cyan('\u2551') + chalk.gray(msg) + ' '.repeat(innerWidth - msg.length) + chalk.cyan('\u2551'));
    }
    
    drawBoxFooter(boxWidth);
    
    // HQX Score
    console.log();
    drawBoxHeader('HQX SCORE', boxWidth);
    
    const winRateScore = Math.min(100, parseFloat(winRate) * 1.5);
    const profitFactorScore = profitFactor === '∞' ? 100 : Math.min(100, parseFloat(profitFactor) * 40);
    const consistencyScore = stats.maxConsecutiveLosses > 0 ? Math.max(0, 100 - (stats.maxConsecutiveLosses * 15)) : 100;
    const riskScore = stats.worstTrade !== 0 && totalStartingBalance > 0 
      ? Math.max(0, 100 - (Math.abs(stats.worstTrade) / totalStartingBalance * 1000)) 
      : 50;
    const volumeScore = Math.min(100, stats.totalTrades * 2);
    const returnScore = Math.min(100, Math.max(0, parseFloat(returnPercent) * 10 + 50));
    
    const hqxScore = Math.round((winRateScore + profitFactorScore + consistencyScore + riskScore + volumeScore + returnScore) / 6);
    const scoreColor = hqxScore >= 70 ? chalk.green : hqxScore >= 50 ? chalk.yellow : chalk.red;
    const scoreGrade = hqxScore >= 90 ? 'S' : hqxScore >= 80 ? 'A' : hqxScore >= 70 ? 'B' : hqxScore >= 60 ? 'C' : hqxScore >= 50 ? 'D' : 'F';
    
    const makeBar = (score, width = 20) => {
      const filled = Math.round((score / 100) * width);
      const empty = width - filled;
      const color = score >= 70 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
      return color('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    };
    
    const metricsDisplay = [
      { name: 'Win Rate', score: winRateScore },
      { name: 'Profit Factor', score: profitFactorScore },
      { name: 'Consistency', score: consistencyScore },
      { name: 'Risk Management', score: riskScore },
      { name: 'Volume', score: volumeScore },
      { name: 'Returns', score: returnScore }
    ];
    
    const barWidth = 30;
    const labelWidth = 18;
    
    const overallLine = `  OVERALL SCORE: ${scoreColor(String(hqxScore))} / 100  [Grade: ${scoreColor(scoreGrade)}]`;
    const overallVisLen = overallLine.replace(/\x1b\[[0-9;]*m/g, '').length;
    console.log(chalk.cyan('\u2551') + overallLine + ' '.repeat(innerWidth - overallVisLen) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + chalk.gray('─'.repeat(innerWidth)) + chalk.cyan('\u2551'));
    
    for (const metric of metricsDisplay) {
      const label = ('  ' + metric.name + ':').padEnd(labelWidth);
      const bar = makeBar(metric.score, barWidth);
      const pct = (metric.score.toFixed(0) + '%').padStart(5);
      const line = label + bar + ' ' + pct;
      const visLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
      console.log(chalk.cyan('\u2551') + chalk.white(label) + bar + ' ' + chalk.white(pct) + ' '.repeat(innerWidth - visLen) + chalk.cyan('\u2551'));
    }
    
    drawBoxFooter(boxWidth);
    console.log();
    
  } catch (error) {
    if (spinner) spinner.fail('Error: ' + error.message);
  }
  
  await prompts.waitForEnter();
};

module.exports = { showStats };
