/**
 * AI Agents UI Components
 * 
 * UI drawing functions for the AI Agents configuration page.
 */

const chalk = require('chalk');
const { centerText, visibleLength } = require('../ui');
const cliproxy = require('../services/cliproxy');

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
 * Draw providers table with vertically aligned columns
 * @param {Array} providers - List of AI providers
 * @param {Object} config - Current config
 * @param {number} boxWidth - Box width
 */
const drawProvidersTable = (providers, config, boxWidth) => {
  const W = boxWidth - 2;
  const colWidth = Math.floor(W / 2);
  
  // Get connected providers (have auth files)
  const connected = cliproxy.getConnectedProviders();
  
  // New rectangle (banner is always closed)
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.yellow.bold(centerText('AI AGENTS CONFIGURATION', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  const rows = Math.ceil(providers.length / 2);
  
  // Find max name length across ALL providers for consistent alignment
  const maxNameLen = Math.max(...providers.map(p => p.name.length));
  
  // Fixed format: "● [N] NAME" where ● is yellow if connected (has auth file)
  // Total content width = 2 (● ) + 3 ([N]) + 1 (space) + maxNameLen
  const contentWidth = 2 + 3 + 1 + maxNameLen;
  const leftPad = Math.floor((colWidth - contentWidth) / 2);
  const rightPad = Math.floor(((W - colWidth) - contentWidth) / 2);
  
  for (let row = 0; row < rows; row++) {
    const leftP = providers[row];
    const rightP = providers[row + rows];
    
    // Left column
    let leftCol = '';
    if (leftP) {
      const num = row + 1;
      // Show yellow dot if provider has auth file (connected via OAuth)
      const isConnected = connected[leftP.id] || config.providers[leftP.id]?.active;
      const status = isConnected ? chalk.yellow('● ') : '  ';
      const name = leftP.provider ? leftP.provider.name : leftP.name;
      const namePadded = name.toUpperCase().padEnd(maxNameLen);
      const content = status + chalk.cyan(`[${num}]`) + ' ' + chalk[leftP.color](namePadded);
      const contentLen = 2 + 3 + 1 + maxNameLen;
      const padR = colWidth - leftPad - contentLen;
      leftCol = ' '.repeat(leftPad) + content + ' '.repeat(Math.max(0, padR));
    } else {
      leftCol = ' '.repeat(colWidth);
    }
    
    // Right column
    let rightCol = '';
    const rightColWidth = W - colWidth;
    if (rightP) {
      const num = row + rows + 1;
      // Show yellow dot if provider has auth file (connected via OAuth)
      const isConnected = connected[rightP.id] || config.providers[rightP.id]?.active;
      const status = isConnected ? chalk.yellow('● ') : '  ';
      const name = rightP.provider ? rightP.provider.name : rightP.name;
      const namePadded = name.toUpperCase().padEnd(maxNameLen);
      const content = status + chalk.cyan(`[${num}]`) + ' ' + chalk[rightP.color](namePadded);
      const contentLen = 2 + 3 + 1 + maxNameLen;
      const padR2 = rightColWidth - rightPad - contentLen;
      rightCol = ' '.repeat(rightPad) + content + ' '.repeat(Math.max(0, padR2));
    } else {
      rightCol = ' '.repeat(rightColWidth);
    }
    
    console.log(chalk.cyan('║') + leftCol + rightCol + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText('[B] BACK TO MENU', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
};

/**
 * Draw models table with 2-column layout
 * @param {Object} provider - Provider object
 * @param {Array} models - List of models
 * @param {number} boxWidth - Box width
 */
const drawModelsTable = (provider, models, boxWidth) => {
  const W = boxWidth - 2;
  const colWidth = Math.floor(W / 2);
  
  // New rectangle
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk[provider.color].bold(centerText(`${provider.name.toUpperCase()} - SELECT MODEL`, W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Calculate rows (2 columns)
  const rows = Math.ceil(models.length / 2);
  
  // Find max model name length for alignment
  const maxNameLen = Math.min(
    Math.max(...models.map(m => m.name.length)),
    colWidth - 8 // [XX] + space + padding
  );
  
  for (let row = 0; row < rows; row++) {
    const leftIdx = row;
    const rightIdx = row + rows;
    const leftModel = models[leftIdx];
    const rightModel = models[rightIdx];
    
    // Left column
    let leftCol = '';
    if (leftModel) {
      const num = String(leftIdx + 1).padStart(2);
      const name = leftModel.name.length > maxNameLen 
        ? leftModel.name.substring(0, maxNameLen - 2) + '..'
        : leftModel.name.padEnd(maxNameLen);
      leftCol = `  ${chalk.cyan(`[${num}]`)} ${chalk.white(name)}`;
      const leftLen = 2 + 4 + 1 + maxNameLen; // padding + [XX] + space + name
      leftCol += ' '.repeat(Math.max(0, colWidth - leftLen));
    } else {
      leftCol = ' '.repeat(colWidth);
    }
    
    // Right column
    let rightCol = '';
    const rightColWidth = W - colWidth;
    if (rightModel) {
      const num = String(rightIdx + 1).padStart(2);
      const name = rightModel.name.length > maxNameLen
        ? rightModel.name.substring(0, maxNameLen - 2) + '..'
        : rightModel.name.padEnd(maxNameLen);
      rightCol = `  ${chalk.cyan(`[${num}]`)} ${chalk.white(name)}`;
      const rightLen = 2 + 4 + 1 + maxNameLen;
      rightCol += ' '.repeat(Math.max(0, rightColWidth - rightLen));
    } else {
      rightCol = ' '.repeat(rightColWidth);
    }
    
    console.log(chalk.cyan('║') + leftCol + rightCol + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText('[B] BACK', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
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
  
  // Options in 2 columns (centered)
  const opt1 = '[1] CONNECT VIA PAID PLAN';
  const opt2 = '[2] CONNECT VIA API KEY';
  
  const left1 = chalk.green(opt1);
  const right1 = chalk.yellow(opt2);
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
