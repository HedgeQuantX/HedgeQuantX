/**
 * AI Agents UI Components
 * 
 * UI drawing functions for the AI Agents configuration page.
 */

const chalk = require('chalk');
const { centerText, visibleLength } = require('../ui');

/**
 * Draw a 2-column row with perfect alignment
 * @param {string} leftText - Left column text
 * @param {string} rightText - Right column text
 * @param {number} W - Inner width
 * @param {number} padding - Left padding for each column (default 3)
 */
const draw2ColRow = (leftText, rightText, W, padding = 3) => {
  const colWidth = Math.floor(W / 2);
  const leftLen = visibleLength(leftText);
  const rightLen = visibleLength(rightText || '');
  
  // Left column: padding + text + fill to colWidth
  const leftFill = colWidth - padding - leftLen;
  const leftCol = ' '.repeat(padding) + leftText + ' '.repeat(Math.max(0, leftFill));
  
  // Right column: padding + text + fill to remaining width
  const rightColWidth = W - colWidth;
  const rightFill = rightColWidth - padding - rightLen;
  const rightCol = ' '.repeat(padding) + (rightText || '') + ' '.repeat(Math.max(0, rightFill));
  
  console.log(chalk.cyan('║') + leftCol + rightCol + chalk.cyan('║'));
};

/**
 * Draw 2-column table with title and back option
 * @param {string} title - Table title
 * @param {Function} titleColor - Chalk color function
 * @param {Array} items - Items to display
 * @param {string} backText - Back button text
 * @param {number} W - Inner width
 */
const draw2ColTable = (title, titleColor, items, backText, W) => {
  // New rectangle (banner is always closed)
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + titleColor(centerText(title, W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  const rows = Math.ceil(items.length / 2);
  for (let row = 0; row < rows; row++) {
    const left = items[row];
    const right = items[row + rows];
    draw2ColRow(left || '', right || '', W);
  }
  
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText(backText, W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
};

/**
 * Draw centered 2-column row
 * @param {string} leftText - Left column text
 * @param {string} rightText - Right column text
 * @param {number} W - Inner width
 */
const draw2ColRowCentered = (leftText, rightText, W) => {
  const colWidth = Math.floor(W / 2);
  const leftLen = visibleLength(leftText);
  const rightLen = visibleLength(rightText || '');
  
  // Center left text in left column
  const leftPadTotal = colWidth - leftLen;
  const leftPadL = Math.floor(leftPadTotal / 2);
  const leftPadR = leftPadTotal - leftPadL;
  const leftCol = ' '.repeat(Math.max(0, leftPadL)) + leftText + ' '.repeat(Math.max(0, leftPadR));
  
  // Center right text in right column
  const rightColWidth = W - colWidth;
  const rightPadTotal = rightColWidth - rightLen;
  const rightPadL = Math.floor(rightPadTotal / 2);
  const rightPadR = rightPadTotal - rightPadL;
  const rightCol = ' '.repeat(Math.max(0, rightPadL)) + (rightText || '') + ' '.repeat(Math.max(0, rightPadR));
  
  console.log(chalk.cyan('║') + leftCol + rightCol + chalk.cyan('║'));
};

/**
 * Draw providers table
 * @param {Array} providers - List of AI providers
 * @param {Object} config - Current config
 * @param {number} boxWidth - Box width
 */
const drawProvidersTable = (providers, config, boxWidth) => {
  const W = boxWidth - 2;
  
  // New rectangle (banner is always closed)
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.yellow.bold(centerText('AI AGENTS CONFIGURATION', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  const items = providers.map((p, i) => {
    const status = config.providers[p.id]?.active ? chalk.green(' ●') : '';
    return chalk.cyan(`[${i + 1}]`) + ' ' + chalk[p.color](p.name.toUpperCase()) + status;
  });
  
  const rows = Math.ceil(items.length / 2);
  for (let row = 0; row < rows; row++) {
    const left = items[row];
    const right = items[row + rows];
    draw2ColRowCentered(left || '', right || '', W);
  }
  
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText('[B] BACK TO MENU', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
};

/**
 * Draw models table
 * @param {Object} provider - Provider object
 * @param {Array} models - List of models
 * @param {number} boxWidth - Box width
 */
const drawModelsTable = (provider, models, boxWidth) => {
  const W = boxWidth - 2;
  const items = models.map((m, i) => chalk.cyan(`[${i + 1}]`) + ' ' + chalk.white(m.name.toUpperCase()));
  draw2ColTable(`${provider.name.toUpperCase()} - MODELS`, chalk[provider.color].bold, items, '[B] BACK', W);
};

/**
 * Draw provider configuration window
 * @param {Object} provider - Provider object
 * @param {Object} config - Current config
 * @param {number} boxWidth - Box width
 */
const drawProviderWindow = (provider, config, boxWidth) => {
  const W = boxWidth - 2;
  const col1Width = Math.floor(W / 2);
  const col2Width = W - col1Width;
  const providerConfig = config.providers[provider.id] || {};
  
  // New rectangle (banner is always closed)
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk[provider.color].bold(centerText(provider.name.toUpperCase(), W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Empty line
  console.log(chalk.cyan('║') + ' '.repeat(W) + chalk.cyan('║'));
  
  // Options in 2 columns
  const opt1Title = '[1] CONNECT VIA PAID PLAN';
  const opt1Desc = 'USES CLIPROXY - NO API KEY NEEDED';
  const opt2Title = '[2] CONNECT VIA API KEY';
  const opt2Desc = 'ENTER YOUR OWN API KEY';
  
  // Row 1: Titles
  const left1 = chalk.green(opt1Title);
  const right1 = chalk.yellow(opt2Title);
  const left1Len = visibleLength(left1);
  const right1Len = visibleLength(right1);
  const left1PadTotal = col1Width - left1Len;
  const left1PadL = Math.floor(left1PadTotal / 2);
  const left1PadR = left1PadTotal - left1PadL;
  const right1PadTotal = col2Width - right1Len;
  const right1PadL = Math.floor(right1PadTotal / 2);
  const right1PadR = right1PadTotal - right1PadL;
  
  console.log(
    chalk.cyan('║') +
    ' '.repeat(left1PadL) + left1 + ' '.repeat(left1PadR) +
    ' '.repeat(right1PadL) + right1 + ' '.repeat(right1PadR) +
    chalk.cyan('║')
  );
  
  // Row 2: Descriptions
  const left2 = chalk.gray(opt1Desc);
  const right2 = chalk.gray(opt2Desc);
  const left2Len = visibleLength(left2);
  const right2Len = visibleLength(right2);
  const left2PadTotal = col1Width - left2Len;
  const left2PadL = Math.floor(left2PadTotal / 2);
  const left2PadR = left2PadTotal - left2PadL;
  const right2PadTotal = col2Width - right2Len;
  const right2PadL = Math.floor(right2PadTotal / 2);
  const right2PadR = right2PadTotal - right2PadL;
  
  console.log(
    chalk.cyan('║') +
    ' '.repeat(left2PadL) + left2 + ' '.repeat(left2PadR) +
    ' '.repeat(right2PadL) + right2 + ' '.repeat(right2PadR) +
    chalk.cyan('║')
  );
  
  // Empty line
  console.log(chalk.cyan('║') + ' '.repeat(W) + chalk.cyan('║'));
  
  // Status bar
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  
  let statusText = '';
  if (providerConfig.active) {
    const connType = providerConfig.connectionType === 'cliproxy' ? 'CLIPROXY' : 'API KEY';
    const modelName = (providerConfig.modelName || 'N/A').toUpperCase();
    statusText = chalk.green('● ACTIVE') + chalk.gray('  MODEL: ') + chalk.yellow(modelName) + chalk.gray('  VIA ') + chalk.cyan(connType);
  } else if (providerConfig.apiKey || providerConfig.connectionType) {
    statusText = chalk.yellow('● CONFIGURED') + chalk.gray(' (NOT ACTIVE)');
  } else {
    statusText = chalk.gray('○ NOT CONFIGURED');
  }
  console.log(chalk.cyan('║') + centerText(statusText, W) + chalk.cyan('║'));
  
  // Disconnect option if active
  if (providerConfig.active) {
    console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
    console.log(chalk.cyan('║') + chalk.red(centerText('[D] DISCONNECT', W)) + chalk.cyan('║'));
  }
  
  // Back
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText('[B] BACK', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
};

module.exports = {
  draw2ColRow,
  draw2ColTable,
  drawProvidersTable,
  drawModelsTable,
  drawProviderWindow
};
