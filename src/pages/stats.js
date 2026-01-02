/**
 * Stats Page
 * 
 * STRICT RULE: Display ONLY values returned by API
 * - ProjectX: Uses /api/Trade/search, /Position, /TradingAccount APIs
 * - Rithmic: Uses PNL_PLANT for balance/P&L, ORDER_PLANT for accounts
 * - NO estimation, NO simulation, NO mock data
 */

const chalk = require('chalk');
const ora = require('ora');
const asciichart = require('asciichart');

const { connections } = require('../services');
const { getLogoWidth, visibleLength, drawBoxHeader, drawBoxFooter, getColWidths, draw2ColHeader, draw2ColSeparator, fmtRow } = require('../ui');
const { prompts } = require('../utils');

/**
 * Show Stats Page
 * Aggregates data from all connections (ProjectX, Rithmic, Tradovate)
 */
const showStats = async (service) => {
  let spinner;
  
  try {
    spinner = ora({ text: 'LOADING STATS...', color: 'yellow' }).start();
    
    // Get all connections
    const allConns = connections.count() > 0 
      ? connections.getAll() 
      : (service ? [{ service, propfirm: service.propfirm?.name || 'Unknown', type: 'single' }] : []);
    
    if (allConns.length === 0) {
      spinner.fail('NO CONNECTIONS FOUND');
      await prompts.waitForEnter();
      return;
    }

    // Track connection types for display
    const connectionTypes = {
      projectx: 0,
      rithmic: 0,
      tradovate: 0
    };

    // Fetch accounts from each connection with type detection
    let allAccountsData = [];
    
    for (const conn of allConns) {
      const connType = conn.type || 'projectx';
      const propfirmName = conn.propfirm || conn.type || 'Unknown';
      
      // Count connection types
      if (connType === 'projectx') connectionTypes.projectx++;
      else if (connType === 'rithmic') connectionTypes.rithmic++;
      else if (connType === 'tradovate') connectionTypes.tradovate++;
      
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
    
    if (allAccountsData.length === 0) {
      spinner.fail('NO ACCOUNTS FOUND');
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
      spinner.fail('NO ACTIVE ACCOUNTS FOUND');
      await prompts.waitForEnter();
      return;
    }

    // ========== AGGREGATE DATA FROM APIs ==========
    // All values come from APIs - NO local calculation for P&L
    
    let totalBalance = 0;
    let totalPnL = 0;
    let totalStartingBalance = 0;
    let allTrades = [];
    let totalOpenPositions = 0;
    let totalOpenOrders = 0;
    
    // Track data availability (null means no data from API)
    let hasBalanceData = false;
    let hasPnLData = false;
    let hasTradeData = false;

    for (let i = 0; i < activeAccounts.length; i++) {
      const account = activeAccounts[i];
      const svc = account.service;
      const connType = account.connectionType || 'projectx';
      
      try {
        // ===== BALANCE (from API) =====
        if (account.balance !== null && account.balance !== undefined) {
          totalBalance += account.balance;
          hasBalanceData = true;
        }
        
        // ===== P&L (from API - NEVER calculated locally) =====
        // ProjectX: profitAndLoss comes from /Position API (unrealized) + /Trade API (realized)
        // Rithmic: profitAndLoss comes from PNL_PLANT (dayPnl or openPnl + closedPnl)
        if (account.profitAndLoss !== null && account.profitAndLoss !== undefined) {
          totalPnL += account.profitAndLoss;
          hasPnLData = true;
        }
        
        // ===== STARTING BALANCE =====
        // Derived: startingBalance from API or calculated as balance - P&L
        if (account.startingBalance !== null && account.startingBalance !== undefined) {
          totalStartingBalance += account.startingBalance;
        } else if (account.balance !== null && account.balance !== undefined) {
          const pnl = account.profitAndLoss || 0;
          totalStartingBalance += (account.balance - pnl);
        }
        
        // ===== POSITIONS (from API) =====
        try {
          const posResult = await svc.getPositions(account.accountId);
          if (posResult.success && posResult.positions) {
            totalOpenPositions += posResult.positions.length;
          }
        } catch (e) {}
        
        // ===== ORDERS (from API) =====
        try {
          const ordResult = await svc.getOrders(account.accountId);
          if (ordResult.success && ordResult.orders) {
            totalOpenOrders += ordResult.orders.filter(o => o.status === 1 || o.status === 'Working').length;
          }
        } catch (e) {}
        
        // ===== LIFETIME STATS (from API - ProjectX only) =====
        // Rithmic doesn't have getLifetimeStats - returns null
        if (typeof svc.getLifetimeStats === 'function') {
          try {
            const lifetimeResult = await svc.getLifetimeStats(account.accountId);
            if (lifetimeResult.success && lifetimeResult.stats) {
              account.lifetimeStats = lifetimeResult.stats;
            }
          } catch (e) {}
        }
        
        // ===== TRADE HISTORY (from API - ProjectX only) =====
        // Rithmic doesn't have getTradeHistory - returns empty array
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

    // ========== AGGREGATE STATS FROM TRADE HISTORY (API DATA) ==========
    // Calculate stats from COMPLETED trades only (those with P&L != 0)
    // This matches what we display in TRADES HISTORY
    
    let stats = {
      totalTrades: 0, winningTrades: 0, losingTrades: 0,
      totalWinAmount: 0, totalLossAmount: 0,
      bestTrade: 0, worstTrade: 0, totalVolume: 0,
      maxConsecutiveWins: 0, maxConsecutiveLosses: 0,
      longTrades: 0, shortTrades: 0, longWins: 0, shortWins: 0
    };
    
    // Filter to completed trades only (P&L != 0, not null)
    const completedTrades = allTrades.filter(t => {
      const pnl = t.profitAndLoss || t.pnl;
      return pnl !== null && pnl !== undefined && pnl !== 0;
    });
    
    // Calculate stats from completed trades only
    // Include fees in P&L calculations to match TopStep
    if (completedTrades.length > 0) {
      stats.totalTrades = completedTrades.length;
      let consecutiveWins = 0, consecutiveLosses = 0;
      
      // Sort by time for consecutive win/loss calculation
      const sortedTrades = [...completedTrades].sort((a, b) => {
        const timeA = new Date(a.creationTimestamp || a.timestamp || 0).getTime();
        const timeB = new Date(b.creationTimestamp || b.timestamp || 0).getTime();
        return timeA - timeB;
      });
      
      for (const trade of sortedTrades) {
        const grossPnl = trade.profitAndLoss || trade.pnl || 0;
        const fees = Math.abs(trade.fees || trade.commission || 0);
        const netPnl = grossPnl - fees; // Net P&L after fees (like TopStep)
        const size = trade.size || trade.quantity || 1;
        const exitSide = trade.side; // 0=BUY exit (was SHORT), 1=SELL exit (was LONG)
        
        stats.totalVolume += Math.abs(size);
        
        // Determine original trade direction from exit side
        // Exit side 0 = BUY to close = was SHORT
        // Exit side 1 = SELL to close = was LONG
        if (exitSide === 1) {
          stats.longTrades++;
          if (netPnl > 0) stats.longWins++;
        } else if (exitSide === 0) {
          stats.shortTrades++;
          if (netPnl > 0) stats.shortWins++;
        }
        
        if (netPnl > 0) {
          stats.winningTrades++;
          stats.totalWinAmount += netPnl;
          consecutiveWins++;
          consecutiveLosses = 0;
          if (consecutiveWins > stats.maxConsecutiveWins) stats.maxConsecutiveWins = consecutiveWins;
          if (netPnl > stats.bestTrade) stats.bestTrade = netPnl;
        } else if (netPnl < 0) {
          stats.losingTrades++;
          stats.totalLossAmount += Math.abs(netPnl);
          consecutiveLosses++;
          consecutiveWins = 0;
          if (consecutiveLosses > stats.maxConsecutiveLosses) stats.maxConsecutiveLosses = consecutiveLosses;
          if (netPnl < stats.worstTrade) stats.worstTrade = netPnl;
        }
      }
    }

    spinner.succeed('STATS LOADED');
    console.log();
    
    // ========== DISPLAY ==========
    const boxWidth = getLogoWidth();
    const { col1, col2 } = getColWidths(boxWidth);
    
    // Calculate metrics (using API data only)
    const winRate = stats.totalTrades > 0 ? ((stats.winningTrades / stats.totalTrades) * 100).toFixed(1) : 'N/A';
    const avgWin = stats.winningTrades > 0 ? (stats.totalWinAmount / stats.winningTrades).toFixed(2) : '0.00';
    const avgLoss = stats.losingTrades > 0 ? (stats.totalLossAmount / stats.losingTrades).toFixed(2) : '0.00';
    const profitFactor = stats.totalLossAmount > 0 
      ? (stats.totalWinAmount / stats.totalLossAmount).toFixed(2) 
      : (stats.totalWinAmount > 0 ? '∞' : 'N/A');
    const netPnL = stats.totalWinAmount - stats.totalLossAmount;
    const returnPercent = totalStartingBalance > 0 ? ((totalPnL / totalStartingBalance) * 100).toFixed(2) : 'N/A';
    const longWinRate = stats.longTrades > 0 ? ((stats.longWins / stats.longTrades) * 100).toFixed(1) : 'N/A';
    const shortWinRate = stats.shortTrades > 0 ? ((stats.shortWins / stats.shortTrades) * 100).toFixed(1) : 'N/A';
    
    // Quantitative metrics (calculated from completed trades only, with fees)
    const tradePnLs = completedTrades.map(t => {
      const grossPnl = t.profitAndLoss || t.pnl || 0;
      const fees = Math.abs(t.fees || t.commission || 0);
      return grossPnl - fees; // Net P&L
    });
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
    const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev).toFixed(2) : 'N/A';
    const sortinoRatio = downsideDev > 0 ? (avgReturn / downsideDev).toFixed(2) : 'N/A';
    
    // Max Drawdown
    let maxDrawdown = 0;
    let peak = totalStartingBalance || 0;
    let equity = peak;
    if (peak > 0 && tradePnLs.length > 0) {
      tradePnLs.forEach(pnl => {
        equity += pnl;
        if (equity > peak) peak = equity;
        const drawdown = peak > 0 ? (peak - equity) / peak * 100 : 0;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      });
    }
    
    const expectancy = stats.totalTrades > 0 ? netPnL / stats.totalTrades : 0;
    const riskRewardRatio = parseFloat(avgLoss) > 0 ? (parseFloat(avgWin) / parseFloat(avgLoss)).toFixed(2) : 'N/A';
    const calmarRatio = maxDrawdown > 0 && returnPercent !== 'N/A' ? (parseFloat(returnPercent) / maxDrawdown).toFixed(2) : 'N/A';
    
    // Colors
    const totalBalanceColor = hasBalanceData ? (totalBalance >= 0 ? chalk.green : chalk.red) : chalk.gray;
    const pnlColor = hasPnLData ? (totalPnL >= 0 ? chalk.green : chalk.red) : chalk.gray;
    
    // Connection type string
    const connTypeStr = [];
    if (connectionTypes.projectx > 0) connTypeStr.push(`ProjectX(${connectionTypes.projectx})`);
    if (connectionTypes.rithmic > 0) connTypeStr.push(`Rithmic(${connectionTypes.rithmic})`);
    if (connectionTypes.tradovate > 0) connTypeStr.push(`Tradovate(${connectionTypes.tradovate})`);
    
    // ========== MAIN SUMMARY ==========
    drawBoxHeader('HQX STATS', boxWidth);
    draw2ColHeader('ACCOUNT OVERVIEW', 'TRADING PERFORMANCE', boxWidth);
    
    // Format balance/P&L - show "N/A" if no data from API
    const balanceStr = hasBalanceData ? '$' + totalBalance.toLocaleString(undefined, {minimumFractionDigits: 2}) : 'N/A';
    const pnlStr = hasPnLData 
      ? (totalPnL >= 0 ? '+' : '') + '$' + totalPnL.toLocaleString(undefined, {minimumFractionDigits: 2}) + (returnPercent !== 'N/A' ? ' (' + returnPercent + '%)' : '')
      : 'N/A';
    const startBalStr = totalStartingBalance > 0 ? '$' + totalStartingBalance.toLocaleString(undefined, {minimumFractionDigits: 2}) : 'N/A';
    
    console.log(chalk.cyan('\u2551') + fmtRow('Connections:', chalk.cyan(connTypeStr.join(', ') || String(connections.count() || 1)), col1) + chalk.cyan('\u2502') + fmtRow('Total Trades:', hasTradeData || stats.totalTrades > 0 ? chalk.white(String(stats.totalTrades)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Total Accounts:', chalk.cyan(String(activeAccounts.length)), col1) + chalk.cyan('\u2502') + fmtRow('Winning Trades:', hasTradeData || stats.winningTrades > 0 ? chalk.green(String(stats.winningTrades)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Total Balance:', totalBalanceColor(balanceStr), col1) + chalk.cyan('\u2502') + fmtRow('Losing Trades:', hasTradeData || stats.losingTrades > 0 ? chalk.red(String(stats.losingTrades)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Starting Balance:', chalk.white(startBalStr), col1) + chalk.cyan('\u2502') + fmtRow('Win Rate:', winRate !== 'N/A' ? (parseFloat(winRate) >= 50 ? chalk.green(winRate + '%') : chalk.yellow(winRate + '%')) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Total P&L:', pnlColor(pnlStr), col1) + chalk.cyan('\u2502') + fmtRow('Long Trades:', hasTradeData ? chalk.white(stats.longTrades + (longWinRate !== 'N/A' ? ' (' + longWinRate + '%)' : '')) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Open Positions:', chalk.white(String(totalOpenPositions)), col1) + chalk.cyan('\u2502') + fmtRow('Short Trades:', hasTradeData ? chalk.white(stats.shortTrades + (shortWinRate !== 'N/A' ? ' (' + shortWinRate + '%)' : '')) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Open Orders:', chalk.white(String(totalOpenOrders)), col1) + chalk.cyan('\u2502') + fmtRow('Volume:', hasTradeData ? chalk.white(stats.totalVolume + ' contracts') : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    
    // ========== P&L METRICS ==========
    draw2ColSeparator(boxWidth);
    draw2ColHeader('P&L METRICS', 'RISK METRICS', boxWidth);
    
    // Profit Factor coloring
    const pfColor = profitFactor === '∞' ? chalk.green(profitFactor) 
      : profitFactor === 'N/A' ? chalk.gray(profitFactor)
      : parseFloat(profitFactor) >= 1.5 ? chalk.green(profitFactor) 
      : parseFloat(profitFactor) >= 1 ? chalk.yellow(profitFactor) 
      : chalk.red(profitFactor);
    
    // Worst trade display
    const worstTradeStr = stats.worstTrade < 0 ? '-$' + Math.abs(stats.worstTrade).toFixed(2) : '$' + stats.worstTrade.toFixed(2);
    
    const netPnLStr = hasTradeData ? (netPnL >= 0 ? chalk.green('$' + netPnL.toFixed(2)) : chalk.red('-$' + Math.abs(netPnL).toFixed(2))) : chalk.gray('N/A');
    
    console.log(chalk.cyan('\u2551') + fmtRow('Net P&L:', netPnLStr, col1) + chalk.cyan('\u2502') + fmtRow('Profit Factor:', pfColor, col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Gross Profit:', hasTradeData ? chalk.green('$' + stats.totalWinAmount.toFixed(2)) : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Max Consec. Wins:', hasTradeData ? chalk.green(String(stats.maxConsecutiveWins)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Gross Loss:', hasTradeData ? chalk.red('-$' + stats.totalLossAmount.toFixed(2)) : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Max Consec. Loss:', hasTradeData ? (stats.maxConsecutiveLosses > 0 ? chalk.red(String(stats.maxConsecutiveLosses)) : chalk.green('0')) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Avg Win:', hasTradeData ? chalk.green('$' + avgWin) : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Best Trade:', hasTradeData ? chalk.green('$' + stats.bestTrade.toFixed(2)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Avg Loss:', hasTradeData ? (stats.losingTrades > 0 ? chalk.red('-$' + avgLoss) : chalk.green('$0.00')) : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Worst Trade:', hasTradeData ? (stats.worstTrade < 0 ? chalk.red(worstTradeStr) : chalk.green(worstTradeStr)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    
    // ========== QUANTITATIVE METRICS ==========
    draw2ColSeparator(boxWidth);
    draw2ColHeader('QUANTITATIVE METRICS', 'ADVANCED RATIOS', boxWidth);
    
    const sharpeColor = sharpeRatio === 'N/A' ? chalk.gray : parseFloat(sharpeRatio) >= 1 ? chalk.green : parseFloat(sharpeRatio) >= 0.5 ? chalk.yellow : chalk.red;
    const sortinoColor = sortinoRatio === 'N/A' ? chalk.gray : parseFloat(sortinoRatio) >= 1.5 ? chalk.green : parseFloat(sortinoRatio) >= 0.5 ? chalk.yellow : chalk.red;
    const ddColor = maxDrawdown === 0 ? chalk.gray : maxDrawdown <= 5 ? chalk.green : maxDrawdown <= 15 ? chalk.yellow : chalk.red;
    const rrColor = riskRewardRatio === 'N/A' ? chalk.gray : parseFloat(riskRewardRatio) >= 2 ? chalk.green : parseFloat(riskRewardRatio) >= 1 ? chalk.yellow : chalk.red;
    
    console.log(chalk.cyan('\u2551') + fmtRow('Sharpe Ratio:', sharpeColor(sharpeRatio), col1) + chalk.cyan('\u2502') + fmtRow('Risk/Reward:', rrColor(riskRewardRatio), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Sortino Ratio:', sortinoColor(sortinoRatio), col1) + chalk.cyan('\u2502') + fmtRow('Calmar Ratio:', calmarRatio === 'N/A' ? chalk.gray(calmarRatio) : chalk.white(calmarRatio), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Max Drawdown:', hasTradeData && maxDrawdown > 0 ? ddColor(maxDrawdown.toFixed(2) + '%') : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Expectancy:', hasTradeData ? (expectancy >= 0 ? chalk.green('$' + expectancy.toFixed(2)) : chalk.red('$' + expectancy.toFixed(2))) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + fmtRow('Std Deviation:', hasTradeData ? chalk.white('$' + stdDev.toFixed(2)) : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Avg Trade:', hasTradeData ? (avgReturn >= 0 ? chalk.green('$' + avgReturn.toFixed(2)) : chalk.red('$' + avgReturn.toFixed(2))) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
    
    drawBoxFooter(boxWidth);
    
    // ========== EQUITY CURVE ==========
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
      const msg = connectionTypes.rithmic > 0 
        ? '  No trade history (Rithmic does not provide trade history API)'
        : '  No trade data available';
      console.log(chalk.cyan('\u2551') + chalk.gray(msg) + ' '.repeat(Math.max(0, chartInnerWidth - msg.length)) + chalk.cyan('\u2551'));
    }
    
    drawBoxFooter(boxWidth);
    
    // ========== TRADES HISTORY ==========
    console.log();
    drawBoxHeader('TRADES HISTORY', boxWidth);
    
    const innerWidth = boxWidth - 2;
    
    // Helper to extract symbol from contractId (e.g., "CON.F.US.EP.H25" -> "ES H25")
    const extractSymbol = (contractId) => {
      if (!contractId) return 'N/A';
      // ProjectX format: CON.F.US.{SYMBOL}.{MONTH}
      const parts = contractId.split('.');
      if (parts.length >= 5) {
        const sym = parts[3];
        const month = parts[4];
        const symbolMap = { 'EP': 'ES', 'ENQ': 'NQ', 'MES': 'MES', 'MNQ': 'MNQ', 'YM': 'YM', 'NKD': 'NKD', 'RTY': 'RTY' };
        return (symbolMap[sym] || sym) + ' ' + month;
      }
      // Rithmic format: already clean symbol
      if (contractId.length <= 10) return contractId;
      return contractId.substring(0, 10);
    };
    
    if (allTrades.length > 0) {
      // Column widths - total must equal innerWidth
      // Format: " Time    | Symbol   | Side | P&L      | Fees   | Net      | Account... "
      const colTime = 9;
      const colSymbol = 10;
      const colSide = 6;
      const colPnl = 10;
      const colFees = 8;
      const colNet = 10;
      // Each column has "| " after it (2 chars), plus leading space (1 char)
      const fixedCols = colTime + colSymbol + colSide + colPnl + colFees + colNet;
      const separatorChars = 6 * 2; // 6 "| " separators
      const leadingSpace = 1;
      const colAccount = innerWidth - fixedCols - separatorChars - leadingSpace;
      
      // Header - build with exact spacing
      const headerParts = [
        ' ' + 'Time'.padEnd(colTime),
        'Symbol'.padEnd(colSymbol),
        'Side'.padEnd(colSide),
        'P&L'.padEnd(colPnl),
        'Fees'.padEnd(colFees),
        'Net'.padEnd(colNet),
        'Account'.padEnd(colAccount)
      ];
      const header = headerParts.join('| ');
      console.log(chalk.cyan('\u2551') + chalk.white(header) + chalk.cyan('\u2551'));
      console.log(chalk.cyan('\u255F') + chalk.cyan('\u2500'.repeat(innerWidth)) + chalk.cyan('\u2562'));
      
      // Show only COMPLETED trades (with P&L), sorted by time (most recent first)
      // Filter out entry fills (P&L = 0 or null) - only show exit fills with real P&L
      const completedTrades = allTrades.filter(t => {
        const pnl = t.profitAndLoss || t.pnl;
        return pnl !== null && pnl !== undefined && pnl !== 0;
      });
      
      const sortedTrades = [...completedTrades].sort((a, b) => {
        const timeA = new Date(a.creationTimestamp || a.timestamp || 0).getTime();
        const timeB = new Date(b.creationTimestamp || b.timestamp || 0).getTime();
        return timeB - timeA;
      });
      
      for (const trade of sortedTrades) {
        const timestamp = trade.creationTimestamp || trade.timestamp;
        const time = timestamp ? new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) : '--:--';
        const symbol = extractSymbol(trade.contractId || trade.symbol);
        const pnl = trade.profitAndLoss || trade.pnl || 0;
        const fees = trade.fees || trade.commission || 0;
        const netPnl = pnl - Math.abs(fees);
        
        // Format values
        const pnlText = pnl >= 0 ? `+$${pnl.toFixed(0)}` : `-$${Math.abs(pnl).toFixed(0)}`;
        const feesText = fees !== 0 ? `-$${Math.abs(fees).toFixed(2)}` : '$0';
        const netText = netPnl >= 0 ? `+$${netPnl.toFixed(0)}` : `-$${Math.abs(netPnl).toFixed(0)}`;
        
        // For completed trades, show the original direction (opposite of exit side)
        const exitSide = trade.side; // 0=BUY exit means was SHORT, 1=SELL exit means was LONG
        const tradeSide = exitSide === 0 ? 'SHORT' : 'LONG';
        const accountName = (trade.accountName || 'N/A').substring(0, colAccount - 3);
        
        // Build row with exact widths
        const timeStr = time.padEnd(colTime);
        const symbolStr = symbol.padEnd(colSymbol);
        const sideStr = tradeSide.padEnd(colSide);
        const pnlStr = pnlText.padEnd(colPnl);
        const feesStr = feesText.padEnd(colFees);
        const netStr = netText.padEnd(colNet);
        const accountStr = accountName.padEnd(colAccount);
        
        // Colored versions
        const pnlColored = pnl >= 0 ? chalk.green(pnlStr) : chalk.red(pnlStr);
        const feesColored = chalk.yellow(feesStr);
        const netColored = netPnl >= 0 ? chalk.green(netStr) : chalk.red(netStr);
        const sideColored = tradeSide === 'LONG' ? chalk.green(sideStr) : chalk.red(sideStr);
        
        // Build row with same format as header
        const rowParts = [
          ' ' + timeStr,
          symbolStr,
          sideColored,
          pnlColored,
          feesColored,
          netColored,
          accountStr
        ];
        const row = rowParts.join('| ');
        console.log(chalk.cyan('\u2551') + row + chalk.cyan('\u2551'));
      }
      
      if (sortedTrades.length === 0) {
        const msg = '  No completed trades yet';
        console.log(chalk.cyan('\u2551') + chalk.gray(msg.padEnd(innerWidth)) + chalk.cyan('\u2551'));
      }
    } else {
      const msg = connectionTypes.rithmic > 0 
        ? '  No trade history (Rithmic API limitation)'
        : '  No trade history available';
      console.log(chalk.cyan('\u2551') + chalk.gray(msg.padEnd(innerWidth)) + chalk.cyan('\u2551'));
    }
    
    drawBoxFooter(boxWidth);
    
    // ========== HQX SCORE ==========
    // Only show if we have trade data to score
    if (hasTradeData || stats.totalTrades > 0) {
      console.log();
      drawBoxHeader('HQX SCORE', boxWidth);
      
      const winRateNum = winRate !== 'N/A' ? parseFloat(winRate) : 0;
      const winRateScore = Math.min(100, winRateNum * 1.5);
      const profitFactorScore = profitFactor === '∞' ? 100 : profitFactor === 'N/A' ? 0 : Math.min(100, parseFloat(profitFactor) * 40);
      const consistencyScore = stats.maxConsecutiveLosses > 0 ? Math.max(0, 100 - (stats.maxConsecutiveLosses * 15)) : 100;
      const riskScore = stats.worstTrade !== 0 && totalStartingBalance > 0 
        ? Math.max(0, 100 - (Math.abs(stats.worstTrade) / totalStartingBalance * 1000)) 
        : 50;
      const volumeScore = Math.min(100, stats.totalTrades * 2);
      const returnNum = returnPercent !== 'N/A' ? parseFloat(returnPercent) : 0;
      const returnScore = Math.min(100, Math.max(0, returnNum * 10 + 50));
      
      const hqxScore = Math.round((winRateScore + profitFactorScore + consistencyScore + riskScore + volumeScore + returnScore) / 6);
      const scoreColor = hqxScore >= 70 ? chalk.green : hqxScore >= 50 ? chalk.yellow : chalk.red;
      const scoreGrade = hqxScore >= 90 ? 'S' : hqxScore >= 80 ? 'A' : hqxScore >= 70 ? 'B' : hqxScore >= 60 ? 'C' : hqxScore >= 50 ? 'D' : 'F';
      
      const makeBar = (score, width = 20) => {
        const filled = Math.round((score / 100) * width);
        const empty = width - filled;
        const color = score >= 70 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
        return color('\u2588'.repeat(filled)) + chalk.gray('\u2591'.repeat(empty));
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
      console.log(chalk.cyan('\u2551') + chalk.gray('\u2500'.repeat(innerWidth)) + chalk.cyan('\u2551'));
      
      for (const metric of metricsDisplay) {
        const label = ('  ' + metric.name + ':').padEnd(labelWidth);
        const bar = makeBar(metric.score, barWidth);
        const pct = (metric.score.toFixed(0) + '%').padStart(5);
        const line = label + bar + ' ' + pct;
        const visLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
        console.log(chalk.cyan('\u2551') + chalk.white(label) + bar + ' ' + chalk.white(pct) + ' '.repeat(innerWidth - visLen) + chalk.cyan('\u2551'));
      }
      
      drawBoxFooter(boxWidth);
    }
    
    console.log();
    
    // Show data source notice
    if (connectionTypes.rithmic > 0 && connectionTypes.projectx === 0) {
      console.log(chalk.gray('  Note: Rithmic API provides balance/P&L only. Trade history not available.'));
    } else if (connectionTypes.rithmic > 0 && connectionTypes.projectx > 0) {
      console.log(chalk.gray('  Note: Trade history shown from ProjectX accounts only.'));
    }
    
  } catch (error) {
    if (spinner) spinner.fail('Error: ' + error.message);
  }
  
  await prompts.waitForEnter();
};

module.exports = { showStats };
