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
 * Returns 98 for desktop to match the full HEDGEQUANTX logo width
 */
const getLogoWidth = () => {
  const termWidth = process.stdout.columns || 100;
  
  // Mobile: use terminal width
  if (termWidth < 60) {
    return Math.max(termWidth - 2, 40);
  }
  
  // Desktop: fixed width of 98 to match banner
  // Logo line = 86 chars (HEDGEQUANT) + 8 chars (X) + 2 borders = 96, round to 98
  return Math.min(98, termWidth - 2);
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
 * Draw box header with title (starts new box with ╔)
 */
const drawBoxHeader = (title, width) => {
  const innerWidth = width - 2;
  console.log(chalk.cyan('\u2554' + '\u2550'.repeat(innerWidth) + '\u2557'));
  console.log(chalk.cyan('\u2551') + chalk.cyan.bold(centerText(title, innerWidth)) + chalk.cyan('\u2551'));
  console.log(chalk.cyan('\u2560' + '\u2550'.repeat(innerWidth) + '\u2563'));
};

/**
 * Draw box header that continues from previous box (uses ╠ instead of ╔)
 */
const drawBoxHeaderContinue = (title, width) => {
  const innerWidth = width - 2;
  console.log(chalk.cyan('\u2560' + '\u2550'.repeat(innerWidth) + '\u2563'));
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
  console.log(chalk.gray.italic('  PROP FUTURES ALGO TRADING CLI'));
  console.log();
};

module.exports = {
  getLogoWidth,
  visibleLength,
  centerText,
  padText,
  drawBoxHeader,
  drawBoxHeaderContinue,
  drawBoxFooter,
  drawBoxRow,
  drawBoxSeparator,
  printLogo
};
