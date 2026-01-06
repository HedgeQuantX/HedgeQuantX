/**
 * @fileoverview Stats display/rendering functions - Rithmic Only
 * @module pages/stats/display
 * 
 * STRICT RULE: Display ONLY values from API - NO estimation/simulation
 */

const chalk = require('chalk');
const { getLogoWidth, drawBoxHeader, drawBoxFooter, getColWidths, draw2ColHeader, draw2ColSeparator, fmtRow } = require('../../ui');

/**
 * Render account overview and trading performance section
 */
const renderOverview = (data) => {
  const { connectionTypes, activeAccounts, totalBalance, totalPnL, totalStartingBalance, 
          totalOpenPositions, totalOpenOrders, stats, metrics, 
          hasBalanceData, hasPnLData, hasTradeData, connections } = data;
  
  const boxWidth = getLogoWidth();
  const { col1, col2 } = getColWidths(boxWidth);
  
  // Connection type string (Rithmic only)
  const connTypeStr = connectionTypes.rithmic > 0 ? `Rithmic(${connectionTypes.rithmic})` : '';
  
  // Format balance/P&L
  const balanceStr = hasBalanceData ? '$' + totalBalance.toLocaleString(undefined, {minimumFractionDigits: 2}) : 'N/A';
  const pnlStr = hasPnLData 
    ? (totalPnL >= 0 ? '+' : '') + '$' + totalPnL.toLocaleString(undefined, {minimumFractionDigits: 2}) + (metrics.returnPercent !== 'N/A' ? ' (' + metrics.returnPercent + '%)' : '')
    : 'N/A';
  const startBalStr = totalStartingBalance > 0 ? '$' + totalStartingBalance.toLocaleString(undefined, {minimumFractionDigits: 2}) : 'N/A';
  
  // Colors
  const totalBalanceColor = hasBalanceData ? (totalBalance >= 0 ? chalk.green : chalk.red) : chalk.gray;
  const pnlColor = hasPnLData ? (totalPnL >= 0 ? chalk.green : chalk.red) : chalk.gray;
  
  drawBoxHeader('HQX STATS', boxWidth);
  draw2ColHeader('ACCOUNT OVERVIEW', 'TRADING PERFORMANCE', boxWidth);
  
  console.log(chalk.cyan('\u2551') + fmtRow('Total Accounts:', chalk.cyan(String(activeAccounts.length)), col1) + chalk.cyan('\u2502') + fmtRow('Total Trades:', hasTradeData || stats.totalTrades > 0 ? chalk.white(String(stats.totalTrades)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Total Balance:', totalBalanceColor(balanceStr), col1) + chalk.cyan('\u2502') + fmtRow('Winning Trades:', hasTradeData || stats.winningTrades > 0 ? chalk.green(String(stats.winningTrades)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Starting Balance:', chalk.white(startBalStr), col1) + chalk.cyan('\u2502') + fmtRow('Losing Trades:', hasTradeData || stats.losingTrades > 0 ? chalk.red(String(stats.losingTrades)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Total P&L:', pnlColor(pnlStr), col1) + chalk.cyan('\u2502') + fmtRow('Win Rate:', metrics.winRate !== 'N/A' ? (parseFloat(metrics.winRate) >= 50 ? chalk.green(metrics.winRate + '%') : chalk.yellow(metrics.winRate + '%')) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('', '', col1) + chalk.cyan('\u2502') + fmtRow('Long Trades:', hasTradeData ? chalk.white(stats.longTrades + (metrics.longWinRate !== 'N/A' ? ' (' + metrics.longWinRate + '%)' : '')) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('', '', col1) + chalk.cyan('\u2502') + fmtRow('Short Trades:', hasTradeData ? chalk.white(stats.shortTrades + (metrics.shortWinRate !== 'N/A' ? ' (' + metrics.shortWinRate + '%)' : '')) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('', '', col1) + chalk.cyan('\u2502') + fmtRow('Volume:', hasTradeData ? chalk.white(stats.totalVolume + ' contracts') : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
};

/**
 * Render P&L metrics section
 */
const renderPnLMetrics = (data) => {
  const { stats, metrics, hasTradeData } = data;
  const boxWidth = getLogoWidth();
  const { col1, col2 } = getColWidths(boxWidth);
  
  draw2ColSeparator(boxWidth);
  draw2ColHeader('P&L METRICS', 'RISK METRICS', boxWidth);
  
  const pfColor = metrics.profitFactor === '∞' ? chalk.green(metrics.profitFactor) 
    : metrics.profitFactor === 'N/A' ? chalk.gray(metrics.profitFactor)
    : parseFloat(metrics.profitFactor) >= 1.5 ? chalk.green(metrics.profitFactor) 
    : parseFloat(metrics.profitFactor) >= 1 ? chalk.yellow(metrics.profitFactor) 
    : chalk.red(metrics.profitFactor);
  
  const worstTradeStr = stats.worstTrade < 0 ? '-$' + Math.abs(stats.worstTrade).toFixed(2) : '$' + stats.worstTrade.toFixed(2);
  const netPnLStr = hasTradeData ? (metrics.netPnL >= 0 ? chalk.green('$' + metrics.netPnL.toFixed(2)) : chalk.red('-$' + Math.abs(metrics.netPnL).toFixed(2))) : chalk.gray('N/A');
  
  console.log(chalk.cyan('\u2551') + fmtRow('Net P&L:', netPnLStr, col1) + chalk.cyan('\u2502') + fmtRow('Profit Factor:', pfColor, col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Gross Profit:', hasTradeData ? chalk.green('$' + stats.totalWinAmount.toFixed(2)) : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Max Consec. Wins:', hasTradeData ? chalk.green(String(stats.maxConsecutiveWins)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Gross Loss:', hasTradeData ? chalk.red('-$' + stats.totalLossAmount.toFixed(2)) : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Max Consec. Loss:', hasTradeData ? (stats.maxConsecutiveLosses > 0 ? chalk.red(String(stats.maxConsecutiveLosses)) : chalk.green('0')) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Avg Win:', hasTradeData ? chalk.green('$' + metrics.avgWin) : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Best Trade:', hasTradeData ? chalk.green('$' + stats.bestTrade.toFixed(2)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Avg Loss:', hasTradeData ? (stats.losingTrades > 0 ? chalk.red('-$' + metrics.avgLoss) : chalk.green('$0.00')) : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Worst Trade:', hasTradeData ? (stats.worstTrade < 0 ? chalk.red(worstTradeStr) : chalk.green(worstTradeStr)) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
};

/**
 * Render quantitative metrics section
 */
const renderQuantMetrics = (data) => {
  const { quantMetrics, metrics, hasTradeData } = data;
  const boxWidth = getLogoWidth();
  const { col1, col2 } = getColWidths(boxWidth);
  
  draw2ColSeparator(boxWidth);
  draw2ColHeader('QUANTITATIVE METRICS', 'ADVANCED RATIOS', boxWidth);
  
  const calmarRatio = quantMetrics.maxDrawdown > 0 && quantMetrics.returnPercent !== 'N/A' 
    ? (parseFloat(quantMetrics.returnPercent) / quantMetrics.maxDrawdown).toFixed(2) : 'N/A';
  
  const sharpeColor = quantMetrics.sharpeRatio === 'N/A' ? chalk.gray : parseFloat(quantMetrics.sharpeRatio) >= 1 ? chalk.green : parseFloat(quantMetrics.sharpeRatio) >= 0.5 ? chalk.yellow : chalk.red;
  const sortinoColor = quantMetrics.sortinoRatio === 'N/A' ? chalk.gray : parseFloat(quantMetrics.sortinoRatio) >= 1.5 ? chalk.green : parseFloat(quantMetrics.sortinoRatio) >= 0.5 ? chalk.yellow : chalk.red;
  const ddColor = quantMetrics.maxDrawdown === 0 ? chalk.gray : quantMetrics.maxDrawdown <= 5 ? chalk.green : quantMetrics.maxDrawdown <= 15 ? chalk.yellow : chalk.red;
  const rrColor = metrics.riskRewardRatio === 'N/A' ? chalk.gray : parseFloat(metrics.riskRewardRatio) >= 2 ? chalk.green : parseFloat(metrics.riskRewardRatio) >= 1 ? chalk.yellow : chalk.red;
  
  console.log(chalk.cyan('\u2551') + fmtRow('Sharpe Ratio:', sharpeColor(quantMetrics.sharpeRatio), col1) + chalk.cyan('\u2502') + fmtRow('Risk/Reward:', rrColor(metrics.riskRewardRatio), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Sortino Ratio:', sortinoColor(quantMetrics.sortinoRatio), col1) + chalk.cyan('\u2502') + fmtRow('Calmar Ratio:', calmarRatio === 'N/A' ? chalk.gray(calmarRatio) : chalk.white(calmarRatio), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Max Drawdown:', hasTradeData && quantMetrics.maxDrawdown > 0 ? ddColor(quantMetrics.maxDrawdown.toFixed(2) + '%') : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Expectancy:', hasTradeData ? (metrics.expectancy >= 0 ? chalk.green('$' + metrics.expectancy.toFixed(2)) : chalk.red('$' + metrics.expectancy.toFixed(2))) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + fmtRow('Std Deviation:', hasTradeData ? chalk.white('$' + quantMetrics.stdDev.toFixed(2)) : chalk.gray('N/A'), col1) + chalk.cyan('\u2502') + fmtRow('Avg Trade:', hasTradeData ? (quantMetrics.avgReturn >= 0 ? chalk.green('$' + quantMetrics.avgReturn.toFixed(2)) : chalk.red('$' + quantMetrics.avgReturn.toFixed(2))) : chalk.gray('N/A'), col2) + chalk.cyan('\u2551'));
  
  drawBoxFooter(boxWidth);
};

/**
 * Render trades history section (round-trips)
 */
const renderTradesHistory = (data) => {
  const { allTrades } = data;
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  
  console.log();
  drawBoxHeader('TRADES HISTORY (Round-Trips)', boxWidth);
  
  const extractSymbol = (contractId) => {
    if (!contractId) return 'N/A';
    if (contractId.length <= 8) return contractId;
    return contractId.substring(0, 8);
  };
  
  if (allTrades.length > 0) {
    const colSymbol = 9;
    const colSide = 6;
    const colQty = 4;
    const colEntry = 11;
    const colExit = 11;
    const colPnl = 10;
    const separators = 18;
    const fixedWidth = colSymbol + colSide + colQty + colEntry + colExit + colPnl + separators;
    const colDate = Math.max(10, innerWidth - fixedWidth);
    
    const header = ` ${'Symbol'.padEnd(colSymbol)}| ${'Side'.padEnd(colSide)}| ${'Qty'.padEnd(colQty)}| ${'Entry'.padEnd(colEntry)}| ${'Exit'.padEnd(colExit)}| ${'P&L'.padEnd(colPnl)}| ${'Date'.padEnd(colDate - 2)}`;
    console.log(chalk.cyan('\u2551') + chalk.white(header) + chalk.cyan('\u2551'));
    console.log(chalk.cyan('\u2551') + chalk.gray('\u2500'.repeat(innerWidth)) + chalk.cyan('\u2551'));
    
    // Show most recent trades first (already sorted by exitTime desc)
    const recentTrades = allTrades.slice(0, 10);
    
    for (const trade of recentTrades) {
      const symbol = extractSymbol(trade.symbol);
      // Round-trip: side=1 means Long (BUY then SELL), side=2 means Short (SELL then BUY)
      const side = trade.side === 1 ? 'LONG' : trade.side === 2 ? 'SHORT' : 'N/A';
      const qty = String(trade.quantity || 1);
      const entry = (trade.entryPrice || 0).toFixed(2);
      const exit = (trade.exitPrice || 0).toFixed(2);
      const pnl = trade.pnl || trade.profitAndLoss || 0;
      const pnlText = pnl >= 0 ? `+$${pnl.toFixed(0)}` : `-$${Math.abs(pnl).toFixed(0)}`;
      
      // Format date from exitDate (YYYYMMDD) or exitTime
      let dateStr = '--/--';
      if (trade.exitDate) {
        const d = trade.exitDate;
        dateStr = `${d.slice(4,6)}/${d.slice(6,8)}`;
      } else if (trade.exitTime) {
        const dt = new Date(trade.exitTime);
        dateStr = `${(dt.getMonth()+1).toString().padStart(2,'0')}/${dt.getDate().toString().padStart(2,'0')}`;
      }
      
      const symbolStr = symbol.padEnd(colSymbol);
      const sideStr = side.padEnd(colSide);
      const qtyStr = qty.padEnd(colQty);
      const entryStr = entry.padEnd(colEntry);
      const exitStr = exit.padEnd(colExit);
      const pnlStr = pnlText.padEnd(colPnl);
      const dateStrPad = dateStr.padEnd(colDate - 2);
      
      const pnlColored = pnl >= 0 ? chalk.green(pnlStr) : chalk.red(pnlStr);
      const sideColored = trade.side === 1 ? chalk.green(sideStr) : chalk.red(sideStr);
      
      const row = ` ${symbolStr}| ${sideColored}| ${qtyStr}| ${entryStr}| ${exitStr}| ${pnlColored}| ${dateStrPad}`;
      console.log(chalk.cyan('\u2551') + row + chalk.cyan('\u2551'));
    }
    
    if (allTrades.length > 10) {
      const moreMsg = `  ... and ${allTrades.length - 10} more round-trips`;
      console.log(chalk.cyan('\u2551') + moreMsg.padEnd(innerWidth) + chalk.cyan('\u2551'));
    }
  } else {
    const msg = '  No round-trip trades found';
    console.log(chalk.cyan('\u2551') + chalk.gray(msg.padEnd(innerWidth)) + chalk.cyan('\u2551'));
  }
  
  drawBoxFooter(boxWidth);
};

/**
 * Render HQX score section
 */
const renderHQXScore = (data) => {
  const { hqxScoreData, hasTradeData, stats } = data;
  
  if (!hasTradeData && stats.totalTrades === 0) return;
  
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  
  console.log();
  drawBoxHeader('HQX SCORE', boxWidth);
  
  const scoreColor = hqxScoreData.hqxScore >= 70 ? chalk.green : hqxScoreData.hqxScore >= 50 ? chalk.yellow : chalk.red;
  
  const makeBar = (score, width = 30) => {
    const filled = Math.round((score / 100) * width);
    const empty = width - filled;
    const color = score >= 70 ? chalk.green : score >= 50 ? chalk.yellow : chalk.red;
    return color('\u2588'.repeat(filled)) + chalk.gray('\u2591'.repeat(empty));
  };
  
  const labelWidth = 18;
  
  const overallLine = `  OVERALL SCORE: ${scoreColor(String(hqxScoreData.hqxScore))} / 100  [Grade: ${scoreColor(hqxScoreData.scoreGrade)}]`;
  const overallVisLen = overallLine.replace(/\x1b\[[0-9;]*m/g, '').length;
  console.log(chalk.cyan('\u2551') + overallLine + ' '.repeat(innerWidth - overallVisLen) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2551') + chalk.gray('\u2500'.repeat(innerWidth)) + chalk.cyan('\u2551'));
  
  for (const metric of hqxScoreData.breakdown) {
    const label = ('  ' + metric.name + ':').padEnd(labelWidth);
    const bar = makeBar(metric.score);
    const pct = (metric.score.toFixed(0) + '%').padStart(5);
    const line = label + bar + ' ' + pct;
    const visLen = line.replace(/\x1b\[[0-9;]*m/g, '').length;
    console.log(chalk.cyan('\u2551') + chalk.white(label) + bar + ' ' + chalk.white(pct) + ' '.repeat(innerWidth - visLen) + chalk.cyan('\u2551'));
  }
  
  drawBoxFooter(boxWidth);
};

/**
 * Render data source notice
 */
const renderNotice = () => {
  // No notice needed - all data comes from Rithmic API
};

module.exports = {
  renderOverview,
  renderPnLMetrics,
  renderQuantMetrics,
  renderTradesHistory,
  renderHQXScore,
  renderNotice,
};
