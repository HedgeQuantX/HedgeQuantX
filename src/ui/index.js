/**
 * UI Module Exports
 */

const chalk = require('chalk');
const { detectDevice, getDevice, getSeparator } = require('./device');
const {
  getLogoWidth,
  visibleLength,
  centerText,
  padText,
  drawBoxHeader,
  drawBoxFooter,
  drawBoxRow,
  drawBoxSeparator,
  printLogo
} = require('./box');
const {
  getColWidths,
  draw2ColHeader,
  draw2ColRow,
  draw2ColRowRaw,
  draw2ColSeparator,
  fmtRow
} = require('./table');
const { createBoxMenu } = require('./menu');

/**
 * Display HQX Banner - ALWAYS closed with bottom border
 */
const displayBanner = () => {
  const termWidth = process.stdout.columns || 100;
  const isMobile = termWidth < 60;
  const boxWidth = isMobile ? Math.max(termWidth - 2, 40) : Math.max(getLogoWidth(), 98);
  const innerWidth = boxWidth - 2;
  
  let version = '1.0.0';
  try { version = require('../../package.json').version; } catch (e) {}
  
  console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
  
  if (isMobile) {
    const logoHQ = ['██╗  ██╗ ██████╗ ','██║  ██║██╔═══██╗','███████║██║   ██║','██╔══██║██║▄▄ ██║','██║  ██║╚██████╔╝','╚═╝  ╚═╝ ╚══▀▀═╝ '];
    const logoX = ['██╗  ██╗','╚██╗██╔╝',' ╚███╔╝ ',' ██╔██╗ ','██╔╝ ██╗','╚═╝  ╚═╝'];
    logoHQ.forEach((line, i) => {
      const fullLine = chalk.cyan(line) + chalk.yellow(logoX[i]);
      const totalLen = line.length + logoX[i].length;
      const padding = innerWidth - totalLen;
      const leftPad = Math.floor(padding / 2);
      console.log(chalk.cyan('║') + ' '.repeat(leftPad) + fullLine + ' '.repeat(padding - leftPad) + chalk.cyan('║'));
    });
  } else {
    const logo = [
      '██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗',
      '██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝',
      '███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ',
      '██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ',
      '██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ',
      '╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   '
    ];
    const logoX = ['██╗  ██╗','╚██╗██╔╝',' ╚███╔╝ ',' ██╔██╗ ','██╔╝ ██╗','╚═╝  ╚═╝'];
    logo.forEach((line, i) => {
      const fullLine = chalk.cyan(line) + chalk.yellow(logoX[i]);
      const totalLen = line.length + logoX[i].length;
      const padding = innerWidth - totalLen;
      const leftPad = Math.floor(padding / 2);
      console.log(chalk.cyan('║') + ' '.repeat(leftPad) + fullLine + ' '.repeat(padding - leftPad) + chalk.cyan('║'));
    });
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
  const tagline = isMobile ? `HQX V${version}` : `PROP FUTURES ALGO TRADING  V${version}`;
  console.log(chalk.cyan('║') + chalk.yellow(centerText(tagline, innerWidth)) + chalk.cyan('║'));
  
  // ALWAYS close the banner
  console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
};

/**
 * Clear screen without using alternate screen buffer
 * Uses ANSI escape codes directly to avoid terminal state issues
 */
const clearScreen = () => {
  // ESC[2J = clear entire screen, ESC[H = move cursor to home
  process.stdout.write('\x1B[2J\x1B[H');
};

/**
 * Ensure stdin is ready for inquirer prompts
 * This fixes input leaking to bash after session restore or algo trading
 */
const prepareStdin = () => {
  try {
    // Ensure stdin is flowing
    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }
    
    // Reset stdin to proper state for inquirer
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
  } catch (e) {
    // Ignore errors
  }
};

module.exports = {
  // Device
  detectDevice,
  getDevice,
  getSeparator,
  // Box
  getLogoWidth,
  visibleLength,
  centerText,
  padText,
  drawBoxHeader,
  drawBoxFooter,
  drawBoxRow,
  drawBoxSeparator,
  printLogo,
  // Table
  getColWidths,
  draw2ColHeader,
  draw2ColRow,
  draw2ColRowRaw,
  draw2ColSeparator,
  fmtRow,
  // Menu
  createBoxMenu,
  // Stdin
  prepareStdin,
  // Banner
  displayBanner,
  // Screen
  clearScreen
};
