/**
 * @fileoverview Stats equity curve chart
 * @module pages/stats/chart
 * 
 * STRICT RULE: Display ONLY values from API - NO estimation/simulation
 */

const chalk = require('chalk');
const asciichart = require('asciichart');
const { getLogoWidth, drawBoxHeader, drawBoxFooter } = require('../../ui');

/**
 * Render equity curve chart
 * @param {Object} data - Chart data
 * @param {Array} data.allTrades - All trades from API
 * @param {number} data.totalStartingBalance - Starting balance
 * @param {Object} data.connectionTypes - Connection type counts
 */
const renderEquityCurve = (data) => {
  const { allTrades, totalStartingBalance, connectionTypes } = data;
  const boxWidth = getLogoWidth();
  const chartInnerWidth = boxWidth - 2;
  
  console.log();
  drawBoxHeader('EQUITY CURVE', boxWidth);
  
  if (allTrades.length > 0) {
    const yAxisWidth = 10;
    const chartAreaWidth = chartInnerWidth - yAxisWidth - 4;
    
    // Build equity curve from trades P&L (100% API data)
    let equityData = [totalStartingBalance || 100000];
    let eqVal = equityData[0];
    allTrades.forEach(trade => {
      eqVal += (trade.profitAndLoss || trade.pnl || 0);
      equityData.push(eqVal);
    });
    
    // Downsample if too many data points
    const maxDataPoints = chartAreaWidth - 5;
    if (equityData.length > maxDataPoints) {
      const step = Math.ceil(equityData.length / maxDataPoints);
      equityData = equityData.filter((_, i) => i % step === 0);
    }
    
    // Chart configuration
    const chartConfig = {
      height: 10,
      colors: [equityData[equityData.length - 1] < equityData[0] ? asciichart.red : asciichart.green],
      format: (x) => ('$' + (x / 1000).toFixed(0) + 'K').padStart(yAxisWidth)
    };
    
    // Render chart
    const chart = asciichart.plot(equityData, chartConfig);
    chart.split('\n').forEach(line => {
      let chartLine = '  ' + line;
      const len = chartLine.replace(/\x1b\[[0-9;]*m/g, '').length;
      if (len < chartInnerWidth) chartLine += ' '.repeat(chartInnerWidth - len);
      console.log(chalk.cyan('\u2551') + chartLine + chalk.cyan('\u2551'));
    });
  } else {
    // No trade data message
    const msg = connectionTypes.rithmic > 0 
      ? '  No trade history (Rithmic does not provide trade history API)'
      : '  No trade data available';
    console.log(chalk.cyan('\u2551') + chalk.gray(msg) + ' '.repeat(Math.max(0, chartInnerWidth - msg.length)) + chalk.cyan('\u2551'));
  }
  
  drawBoxFooter(boxWidth);
};

module.exports = {
  renderEquityCurve,
};
