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
    // Ensure stdin is flowing
    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }
    
    // Reset stdin to proper state for inquirer
    if (process.stdin.isTTY) {
      // Disable raw mode if it was left on
      if (process.stdin.isRaw) {
        process.stdin.setRawMode(false);
      }
    }
    
    // Clear any buffered input by removing old listeners temporarily
    const oldListeners = process.stdin.listeners('data');
    process.stdin.removeAllListeners('data');
    
    // Restore listeners after a tick
    setImmediate(() => {
      oldListeners.forEach(listener => {
        if (!process.stdin.listeners('data').includes(listener)) {
          process.stdin.on('data', listener);
        }
      });
    });
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
