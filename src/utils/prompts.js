/**
 * @fileoverview Centralized prompts utility with animated yellow spinner
 * @module utils/prompts
 * 
 * Custom readline-based prompts with animated spinner that runs
 * while waiting for user input. Uses inquirer only for complex
 * prompts (password, list selection).
 */

const inquirer = require('inquirer');
const readline = require('readline');
const chalk = require('chalk');

// Spinner frames for yellow waiting indicator
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** @type {readline.Interface|null} */
let rl = null;

/**
 * Ensure stdin is ready and flush any buffered input
 */
const prepareStdin = () => {
  try {
    if (process.stdin.isPaused()) process.stdin.resume();
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
    process.stdin.read();
  } catch {
    // Ignore stdin errors
  }
};

/**
 * Close existing readline if open
 * @private
 */
const closeReadline = () => {
  if (rl && !rl.closed) {
    try {
      rl.close();
    } catch {
      // Ignore close errors
    }
    rl = null;
  }
};

/**
 * Animated spinner prompt using raw readline
 * Spinner animates while waiting for user input
 * @param {string} message - Prompt message
 * @returns {Promise<string>}
 */
const animatedPrompt = (message) => {
  return new Promise((resolve) => {
    prepareStdin();
    closeReadline();

    let frameIndex = 0;
    let userInput = '';
    let cursorPos = 0;

    // Enable raw mode for character-by-character input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const render = () => {
      const spinner = chalk.yellow(SPINNER_FRAMES[frameIndex]);
      const line = `\r${spinner} ${message} ${userInput}`;
      process.stdout.write('\r\x1b[K'); // Clear line
      process.stdout.write(line);
    };

    // Animate spinner every 80ms
    const spinnerInterval = setInterval(() => {
      frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
      render();
    }, 80);

    render();

    const onData = (key) => {
      const char = key.toString();
      
      // Enter key
      if (char === '\r' || char === '\n') {
        clearInterval(spinnerInterval);
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdout.write('\n');
        resolve(userInput);
        return;
      }
      
      // Ctrl+C
      if (char === '\x03') {
        clearInterval(spinnerInterval);
        process.stdin.removeListener('data', onData);
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdout.write('\n');
        process.exit(0);
      }
      
      // Backspace
      if (char === '\x7f' || char === '\b') {
        if (userInput.length > 0) {
          userInput = userInput.slice(0, -1);
          render();
        }
        return;
      }
      
      // Regular printable character
      if (char >= ' ' && char <= '~') {
        userInput += char;
        render();
      }
    };

    process.stdin.on('data', onData);
  });
};

/**
 * Animated Y/N confirm prompt
 * Shows [Y/n] or [y/N] based on default
 * @param {string} message - Prompt message  
 * @param {boolean} defaultVal - Default value
 * @returns {Promise<boolean>}
 */
const animatedConfirm = (message, defaultVal = true) => {
  return new Promise((resolve) => {
    prepareStdin();
    closeReadline();

    let frameIndex = 0;
    const hint = defaultVal ? '[Y/n]' : '[y/N]';

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const render = () => {
      const spinner = chalk.yellow(SPINNER_FRAMES[frameIndex]);
      process.stdout.write('\r\x1b[K');
      process.stdout.write(`${spinner} ${message} ${chalk.dim(hint)} `);
    };

    const spinnerInterval = setInterval(() => {
      frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
      render();
    }, 80);

    render();

    const onData = (key) => {
      const char = key.toString().toLowerCase();
      
      // Enter = use default
      if (char === '\r' || char === '\n') {
        cleanup();
        process.stdout.write(defaultVal ? 'Yes' : 'No');
        process.stdout.write('\n');
        resolve(defaultVal);
        return;
      }
      
      // Y = yes
      if (char === 'y') {
        cleanup();
        process.stdout.write('Yes');
        process.stdout.write('\n');
        resolve(true);
        return;
      }
      
      // N = no
      if (char === 'n') {
        cleanup();
        process.stdout.write('No');
        process.stdout.write('\n');
        resolve(false);
        return;
      }
      
      // Ctrl+C
      if (char === '\x03') {
        cleanup();
        process.stdout.write('\n');
        process.exit(0);
      }
    };

    const cleanup = () => {
      clearInterval(spinnerInterval);
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    };

    process.stdin.on('data', onData);
  });
};

/**
 * Animated list selection with arrow keys
 * @param {string} message - Prompt message
 * @param {Array<{name: string, value: any}>} choices - Options
 * @returns {Promise<any>}
 */
const animatedSelect = (message, choices) => {
  return new Promise((resolve) => {
    prepareStdin();
    closeReadline();

    let frameIndex = 0;
    let selectedIndex = 0;
    const validChoices = choices.filter(c => !c.disabled);

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();

    const render = () => {
      const spinner = chalk.yellow(SPINNER_FRAMES[frameIndex]);
      // Move cursor to start and clear down
      process.stdout.write('\r\x1b[K');
      process.stdout.write(`${spinner} ${message}\n`);
      
      validChoices.forEach((choice, i) => {
        process.stdout.write('\x1b[K'); // Clear line
        if (i === selectedIndex) {
          process.stdout.write(`${chalk.cyan('❯')} ${chalk.cyan(choice.name)}\n`);
        } else {
          process.stdout.write(`  ${choice.name}\n`);
        }
      });
      
      // Move cursor back up
      process.stdout.write(`\x1b[${validChoices.length + 1}A`);
    };

    const spinnerInterval = setInterval(() => {
      frameIndex = (frameIndex + 1) % SPINNER_FRAMES.length;
      render();
    }, 80);

    render();

    let escapeSeq = '';
    
    const onData = (key) => {
      const char = key.toString();
      
      // Handle escape sequences (arrow keys)
      if (char === '\x1b') {
        escapeSeq = char;
        return;
      }
      
      if (escapeSeq === '\x1b' && char === '[') {
        escapeSeq += char;
        return;
      }
      
      if (escapeSeq === '\x1b[') {
        escapeSeq = '';
        // Up arrow
        if (char === 'A') {
          selectedIndex = Math.max(0, selectedIndex - 1);
          render();
          return;
        }
        // Down arrow
        if (char === 'B') {
          selectedIndex = Math.min(validChoices.length - 1, selectedIndex + 1);
          render();
          return;
        }
      }
      
      // Enter = select
      if (char === '\r' || char === '\n') {
        cleanup();
        // Clear the menu lines
        process.stdout.write('\r\x1b[K');
        for (let i = 0; i < validChoices.length; i++) {
          process.stdout.write('\x1b[B\x1b[K');
        }
        process.stdout.write(`\x1b[${validChoices.length}A`);
        process.stdout.write(`${chalk.yellow('⠋')} ${message} ${chalk.cyan(validChoices[selectedIndex].name)}\n`);
        resolve(validChoices[selectedIndex].value);
        return;
      }
      
      // Ctrl+C
      if (char === '\x03') {
        cleanup();
        process.stdout.write('\n');
        process.exit(0);
      }
    };

    const cleanup = () => {
      clearInterval(spinnerInterval);
      process.stdin.removeListener('data', onData);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    };

    process.stdin.on('data', onData);
  });
};

/**
 * Wait for Enter key with animated spinner
 * @param {string} [message='Press Enter to continue...'] - Message to display
 * @returns {Promise<void>}
 */
const waitForEnter = async (message = 'Press Enter to continue...') => {
  await animatedPrompt(message);
};

/**
 * Text input with animated spinner
 * @param {string} message - Prompt message
 * @param {string} [defaultVal=''] - Default value
 * @returns {Promise<string>}
 */
const textInput = async (message, defaultVal = '') => {
  const displayMsg = defaultVal ? `${message} (${defaultVal})` : message;
  const value = await animatedPrompt(displayMsg);
  return value || defaultVal;
};

/**
 * Password input (masked) - uses inquirer for masking
 * @param {string} message - Prompt message
 * @returns {Promise<string>}
 */
const passwordInput = async (message) => {
  closeReadline();
  prepareStdin();

  const { value } = await inquirer.prompt([{
    type: 'password',
    name: 'value',
    message: `${chalk.yellow('⠋')} ${message}`,
    mask: '*',
    prefix: '',
  }]);

  return value;
};

/**
 * Confirm prompt with animated spinner (Y/n)
 * @param {string} message - Prompt message
 * @param {boolean} [defaultVal=true] - Default value
 * @returns {Promise<boolean>}
 */
const confirmPrompt = async (message, defaultVal = true) => {
  return animatedConfirm(message, defaultVal);
};

/**
 * Number input with animated spinner and validation
 * @param {string} message - Prompt message
 * @param {number} [defaultVal=1] - Default value
 * @param {number} [min=1] - Minimum value
 * @param {number} [max=1000] - Maximum value
 * @returns {Promise<number>}
 */
const numberInput = async (message, defaultVal = 1, min = 1, max = 1000) => {
  const displayMsg = `${message} (${min}-${max}, default: ${defaultVal})`;
  
  while (true) {
    const value = await animatedPrompt(displayMsg);
    
    if (!value) return defaultVal;
    
    const num = parseInt(value, 10);
    if (isNaN(num)) {
      console.log(chalk.red('Please enter a valid number'));
      continue;
    }
    if (num < min || num > max) {
      console.log(chalk.red(`Please enter a number between ${min} and ${max}`));
      continue;
    }
    return num;
  }
};

/**
 * Select from options with animated spinner and arrow keys
 * @param {string} message - Prompt message
 * @param {Array<{label: string, value: any, disabled?: boolean}>} options - Options
 * @returns {Promise<any>}
 */
const selectOption = async (message, options) => {
  const choices = options.map(opt => ({
    name: opt.label,
    value: opt.value,
    disabled: opt.disabled || false,
  }));

  return animatedSelect(message, choices);
};

module.exports = {
  prepareStdin,
  waitForEnter,
  textInput,
  passwordInput,
  confirmPrompt,
  numberInput,
  selectOption,
};
