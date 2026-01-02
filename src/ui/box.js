/**
 * ASCII Box Drawing Utilities
 */

const chalk = require('chalk');
const figlet = require('figlet');

// Cache logo width
let logoWidth = null;

/**
 * Get logo width for consistent box sizing
 * Adapts to terminal width for mobile devices
 */
const getLogoWidth = () => {
  const termWidth = process.stdout.columns || 80;
  
  // Mobile: use terminal width
  if (termWidth < 60) {
    return Math.max(termWidth - 2, 40);
  }
  
  // Desktop: use logo width
  if (!logoWidth) {
    const logoText = figlet.textSync('HEDGEQUANTX', { font: 'ANSI Shadow' });
    const lines = logoText.split('\n').filter(line => line.trim().length > 0);
    logoWidth = Math.max(...lines.map(line => line.length)) + 4;
  }
  return Math.min(logoWidth, termWidth - 2);
};

/**
 * Get visible length of text (excluding ANSI codes)
 */
const visibleLength = (text) => {
  return (text || '').replace(/\x1b\[[0-9;]*m/g, '').length;
};

/**
 * Center text in a given width
 */
const centerText = (text, width) => {
  const len = visibleLength(text);
  if (len >= width) return text;
  const padding = width - len;
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
};

/**
 * Pad text to exact width
 */
const padText = (text, width) => {
  const len = visibleLength(text);
  if (len >= width) return text;
  return (text || '') + ' '.repeat(width - len);
};

/**
 * Draw box header with title
 */
const drawBoxHeader = (title, width) => {
  const innerWidth = width - 2;
  console.log(chalk.cyan('\u2554' + '\u2550'.repeat(innerWidth) + '\u2557'));
  console.log(chalk.cyan('\u2551') + chalk.cyan.bold(centerText(title, innerWidth)) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2560' + '\u2550'.repeat(innerWidth) + '\u2563'));
};

/**
 * Draw box footer
 */
const drawBoxFooter = (width) => {
  const innerWidth = width - 2;
  console.log(chalk.cyan('\u255A' + '\u2550'.repeat(innerWidth) + '\u255D'));
};

/**
 * Draw a single row inside a box
 */
const drawBoxRow = (content, width) => {
  const innerWidth = width - 2;
  console.log(chalk.cyan('\u2551') + padText(content, innerWidth) + chalk.cyan('\u2551'));
};

/**
 * Draw separator line inside a box
 */
const drawBoxSeparator = (width) => {
  const innerWidth = width - 2;
  console.log(chalk.cyan('\u2560' + '\u2500'.repeat(innerWidth) + '\u2563'));
};

/**
 * Print centered logo
 */
const printLogo = () => {
  const logoText = figlet.textSync('HEDGEQUANTX', { font: 'ANSI Shadow' });
  console.log(chalk.cyan(logoText));
  console.log(chalk.gray.italic('  Prop Futures Algo Trading CLI'));
  console.log();
};

module.exports = {
  getLogoWidth,
  visibleLength,
  centerText,
  padText,
  drawBoxHeader,
  drawBoxFooter,
  drawBoxRow,
  drawBoxSeparator,
  printLogo
};
