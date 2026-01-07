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
 * Display HQX Banner (without closing border by default)
 * @param {boolean} closed - If true, add bottom border
 */
const displayBanner = (closed = false) => {
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
  const tagline = isMobile ? `HQX v${version}` : `Prop Futures Algo Trading  v${version}`;
  console.log(chalk.cyan('║') + chalk.white(centerText(tagline, innerWidth)) + chalk.cyan('║'));
  
  // Close the box if requested
  if (closed) {
    console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  }
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
  displayBanner
};
