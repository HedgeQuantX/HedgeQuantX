/**
 * Custom Box Menu with keyboard navigation
 */

const chalk = require('chalk');
const readline = require('readline');
const { getLogoWidth, centerText } = require('./box');

/**
 * Creates a custom menu inside a box
 * @param {string} title - Menu title
 * @param {Array} items - Menu items [{label, value, color, disabled, separator}]
 * @param {Object} options - Options {headerLines: [], footerText: ''}
 * @returns {Promise<string>} Selected value
 */
const createBoxMenu = async (title, items, options = {}) => {
  const boxWidth = getLogoWidth();
  const innerWidth = boxWidth - 2;
  
  let selectedIndex = 0;
  
  // Find first non-separator, non-disabled item
  while (selectedIndex < items.length && (items[selectedIndex].separator || items[selectedIndex].disabled)) {
    selectedIndex++;
  }
  
  const renderMenu = () => {
    // Clear screen and move cursor to top
    process.stdout.write('\x1b[2J\x1b[H');
    
    const version = require('../../package.json').version;
    
    // Full ASCII logo
    const logo = [
      '██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗██╗  ██╗',
      '██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝╚██╗██╔╝',
      '███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║    ╚███╔╝ ',
      '██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║    ██╔██╗ ',
      '██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ██╔╝ ██╗',
      '╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝'
    ];
    
    console.log(chalk.cyan('╔' + '═'.repeat(innerWidth) + '╗'));
    
    logo.forEach(line => {
      const padded = centerText(line, innerWidth);
      console.log(chalk.cyan('║') + chalk.cyan(padded) + chalk.cyan('║'));
    });
    
    console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
    console.log(chalk.cyan('║') + chalk.white(centerText(`Prop Futures Algo Trading  v${version}`, innerWidth)) + chalk.cyan('║'));
    
    // Stats bar if provided
    if (options.statsLine) {
      console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
      const statsLen = options.statsLine.replace(/\x1b\[[0-9;]*m/g, '').length;
      const statsPad = innerWidth - statsLen;
      const leftPad = Math.floor(statsPad / 2);
      const rightPad = statsPad - leftPad;
      console.log(chalk.cyan('║') + ' '.repeat(leftPad) + options.statsLine + ' '.repeat(rightPad) + chalk.cyan('║'));
    }
    
    console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
    console.log(chalk.cyan('║') + chalk.white.bold(centerText(title, innerWidth)) + chalk.cyan('║'));
    console.log(chalk.cyan('╠' + '═'.repeat(innerWidth) + '╣'));
    
    // Header lines (connection info, etc.)
    if (options.headerLines && options.headerLines.length > 0) {
      options.headerLines.forEach(line => {
        const text = '  ' + line;
        console.log(chalk.cyan('║') + text.padEnd(innerWidth) + chalk.cyan('║'));
      });
      console.log(chalk.cyan('╠' + '─'.repeat(innerWidth) + '╣'));
    }
    
    // Menu items
    items.forEach((item, index) => {
      if (item.separator) {
        console.log(chalk.cyan('║') + chalk.gray('  ' + '─'.repeat(innerWidth - 4) + '  ') + chalk.cyan('║'));
      } else {
        const isSelected = index === selectedIndex;
        const prefix = isSelected ? chalk.white('▸ ') : '  ';
        const color = item.disabled ? chalk.gray : (item.color || chalk.cyan);
        const label = item.label + (item.disabled ? ' (Coming Soon)' : '');
        const text = prefix + color(label);
        const visLen = text.replace(/\x1b\[[0-9;]*m/g, '').length;
        const padding = innerWidth - visLen;
        
        if (isSelected && !item.disabled) {
          console.log(chalk.cyan('║') + chalk.bgGray.white(text + ' '.repeat(padding)) + chalk.cyan('║'));
        } else {
          console.log(chalk.cyan('║') + text + ' '.repeat(padding) + chalk.cyan('║'));
        }
      }
    });
    
    // Footer
    console.log(chalk.cyan('╠' + '─'.repeat(innerWidth) + '╣'));
    const footerText = options.footerText || 'Use ↑↓ arrows to navigate, Enter to select';
    console.log(chalk.cyan('║') + chalk.gray(centerText(footerText, innerWidth)) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + '═'.repeat(innerWidth) + '╝'));
  };
  
  return new Promise((resolve) => {
    renderMenu();
    
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    
    const onKeyPress = (str, key) => {
      if (key.name === 'up') {
        // Move up, skip separators and disabled
        let newIndex = selectedIndex - 1;
        while (newIndex >= 0 && (items[newIndex].separator || items[newIndex].disabled)) {
          newIndex--;
        }
        if (newIndex >= 0) {
          selectedIndex = newIndex;
          renderMenu();
        }
      } else if (key.name === 'down') {
        // Move down, skip separators and disabled
        let newIndex = selectedIndex + 1;
        while (newIndex < items.length && (items[newIndex].separator || items[newIndex].disabled)) {
          newIndex++;
        }
        if (newIndex < items.length) {
          selectedIndex = newIndex;
          renderMenu();
        }
      } else if (key.name === 'return') {
        // Select current item
        cleanup();
        resolve(items[selectedIndex].value);
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        process.exit(0);
      }
    };
    
    const cleanup = () => {
      process.stdin.removeListener('keypress', onKeyPress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    };
    
    process.stdin.on('keypress', onKeyPress);
  });
};

module.exports = { createBoxMenu };
