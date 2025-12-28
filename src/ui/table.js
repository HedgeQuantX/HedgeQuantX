/**
 * Table Drawing Utilities (2-column layout)
 */

const chalk = require('chalk');
const { getLogoWidth, visibleLength, centerText, padText } = require('./box');

/**
 * Calculate column widths for 2-column layout
 */
const getColWidths = (boxWidth) => {
  const innerWidth = boxWidth - 2;
  const col1 = Math.floor((innerWidth - 1) / 2);
  const col2 = innerWidth - 1 - col1;
  return { col1, col2, innerWidth };
};

/**
 * Draw 2-column header with titles
 */
const draw2ColHeader = (title1, title2, boxWidth) => {
  const { col1, col2 } = getColWidths(boxWidth);
  const h1 = centerText(title1, col1);
  const h2 = centerText(title2, col2);
  console.log(chalk.cyan('\u2551') + chalk.cyan.bold(h1) + chalk.cyan('\u2502') + chalk.cyan.bold(h2) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2560') + chalk.cyan('\u2500'.repeat(col1)) + chalk.cyan('\u253C') + chalk.cyan('\u2500'.repeat(col2)) + chalk.cyan('\u2563'));
};

/**
 * Draw 2-column data row with label:value pairs
 */
const draw2ColRow = (label1, value1, label2, value2, boxWidth) => {
  const { col1, col2 } = getColWidths(boxWidth);
  const labelWidth = 18;
  
  let c1Content = ' ' + (label1 || '').padEnd(labelWidth) + (value1 || '');
  c1Content = padText(c1Content, col1);
  
  let c2Content = ' ' + (label2 || '').padEnd(labelWidth) + (value2 || '');
  c2Content = padText(c2Content, col2);
  
  console.log(chalk.cyan('\u2551') + c1Content + chalk.cyan('\u2502') + c2Content + chalk.cyan('\u2551'));
};

/**
 * Draw 2-column row with raw content
 */
const draw2ColRowRaw = (content1, content2, boxWidth) => {
  const { col1, col2 } = getColWidths(boxWidth);
  const c1 = padText(content1 || '', col1);
  const c2 = padText(content2 || '', col2);
  console.log(chalk.cyan('\u2551') + c1 + chalk.cyan('\u2502') + c2 + chalk.cyan('\u2551'));
};

/**
 * Draw separator between 2-column sections
 */
const draw2ColSeparator = (boxWidth) => {
  const { col1, col2 } = getColWidths(boxWidth);
  console.log(chalk.cyan('\u2560') + chalk.cyan('\u2550'.repeat(col1)) + chalk.cyan('\u256A') + chalk.cyan('\u2550'.repeat(col2)) + chalk.cyan('\u2563'));
};

/**
 * Format a row with label and value, padded to column width
 */
const fmtRow = (label, value, colWidth) => {
  const labelStr = ' ' + label.padEnd(18);
  const valueVisible = (value || '').toString().replace(/\x1b\[[0-9;]*m/g, '');
  const totalVisible = labelStr.length + valueVisible.length;
  const padding = Math.max(0, colWidth - totalVisible);
  return chalk.white(labelStr) + value + ' '.repeat(padding);
};

module.exports = {
  getColWidths,
  draw2ColHeader,
  draw2ColRow,
  draw2ColRowRaw,
  draw2ColSeparator,
  fmtRow
};
