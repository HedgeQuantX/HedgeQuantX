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
  createBoxMenu
};
