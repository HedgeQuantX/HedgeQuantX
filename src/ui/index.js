/**
 * UI Module Exports
 */

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
 * Ensure stdin is ready for inquirer prompts
 * This fixes input leaking to bash after session restore or algo trading
 */
const prepareStdin = () => {
  try {
    // Remove any raw mode that might be left from previous operations
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }
    // Remove any lingering keypress listeners
    process.stdin.removeAllListeners('keypress');
    process.stdin.removeAllListeners('data');
    // Pause stdin so inquirer can take control
    process.stdin.pause();
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
  prepareStdin
};
