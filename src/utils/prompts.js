/**
 * @fileoverview Centralized prompts utility
 * @module utils/prompts
 * 
 * Uses native readline for reliable stdin handling
 * Yellow spinner shows activity while waiting for user input
 */

const inquirer = require('inquirer');
const readline = require('readline');
const chalk = require('chalk');

// Spinner characters for yellow waiting indicator
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerInterval = null;
let spinnerFrame = 0;

/**
 * Start yellow spinner to show we're waiting for user input
 */
const startSpinner = () => {
  if (spinnerInterval) return;
  spinnerFrame = 0;
  spinnerInterval = setInterval(() => {
    spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
    process.stdout.write(`\r${chalk.yellow(SPINNER_FRAMES[spinnerFrame])} `);
  }, 80);
};

/**
 * Stop spinner and clear line
 */
const stopSpinner = () => {
  if (spinnerInterval) {
    clearInterval(spinnerInterval);
    spinnerInterval = null;
    process.stdout.write('\r  \r'); // Clear spinner
  }
};

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
 * Native readline prompt
 * @param {string} message - Prompt message
 * @returns {Promise<string>}
 */
const nativePrompt = (message) => {
  return new Promise((resolve) => {
    try {
      prepareStdin();
      closeReadline();

      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
      });

      let answered = false;

      rl.question(`${message} `, (answer) => {
        answered = true;
        closeReadline();
        resolve(answer || '');
      });

      rl.on('close', () => {
        if (!answered) {
          rl = null;
          resolve('');
        }
      });
    } catch {
      resolve('');
    }
  });
};

/**
 * Wait for Enter key + yellow spinner
 * @param {string} [message='Press Enter to continue...'] - Message to display
 * @returns {Promise<void>}
 */
const waitForEnter = async (message = 'Press Enter to continue...') => {
  await nativePrompt(`${chalk.yellow('⠋')} ${message}`);
};

/**
 * Text input + yellow spinner
 * @param {string} message - Prompt message
 * @param {string} [defaultVal=''] - Default value
 * @returns {Promise<string>}
 */
const textInput = async (message, defaultVal = '') => {
  const value = await nativePrompt(`${chalk.yellow('⠋')} ${message}`);
  return value || defaultVal;
};

/**
 * Password input (masked) + yellow spinner
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
 * Confirm prompt with arrow keys + yellow spinner
 * @param {string} message - Prompt message
 * @param {boolean} [defaultVal=true] - Default value
 * @returns {Promise<boolean>}
 */
const confirmPrompt = async (message, defaultVal = true) => {
  closeReadline();
  prepareStdin();

  const choices = defaultVal
    ? [{ name: 'Yes', value: true }, { name: 'No', value: false }]
    : [{ name: 'No', value: false }, { name: 'Yes', value: true }];

  const { value } = await inquirer.prompt([{
    type: 'list',
    name: 'value',
    message: `${chalk.yellow('⠋')} ${message}`,
    choices,
    prefix: '',
    loop: false,
  }]);

  return value;
};

/**
 * Number input with validation + yellow spinner
 * @param {string} message - Prompt message
 * @param {number} [defaultVal=1] - Default value
 * @param {number} [min=1] - Minimum value
 * @param {number} [max=1000] - Maximum value
 * @returns {Promise<number>}
 */
const numberInput = async (message, defaultVal = 1, min = 1, max = 1000) => {
  closeReadline();
  prepareStdin();

  const { value } = await inquirer.prompt([{
    type: 'input',
    name: 'value',
    message: `${chalk.yellow('⠋')} ${message}`,
    default: String(defaultVal),
    prefix: '',
    validate: (v) => {
      const n = parseInt(v, 10);
      if (isNaN(n)) return 'Enter a number';
      if (n < min) return `Min: ${min}`;
      if (n > max) return `Max: ${max}`;
      return true;
    },
  }]);

  return parseInt(value, 10) || defaultVal;
};

/**
 * Select from options with arrow keys + yellow spinner
 * @param {string} message - Prompt message
 * @param {Array<{label: string, value: any, disabled?: boolean}>} options - Options
 * @returns {Promise<any>}
 */
const selectOption = async (message, options) => {
  closeReadline();
  prepareStdin();

  const choices = options.map(opt => {
    if (opt.disabled) {
      return new inquirer.Separator(opt.label);
    }
    return { name: opt.label, value: opt.value };
  });

  const { value } = await inquirer.prompt([{
    type: 'list',
    name: 'value',
    message: `${chalk.yellow('⠋')} ${message}`,
    choices,
    prefix: '',
    loop: false,
    pageSize: 20,
  }]);

  return value;
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
