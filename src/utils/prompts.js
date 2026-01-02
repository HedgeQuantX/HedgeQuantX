/**
 * @fileoverview Centralized prompts utility
 * @module utils/prompts
 * 
 * Uses native readline for reliable stdin handling
 */

const inquirer = require('inquirer');
const readline = require('readline');

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
 * Wait for Enter key
 * @param {string} [message='Press Enter to continue...'] - Message to display
 * @returns {Promise<void>}
 */
const waitForEnter = async (message = 'Press Enter to continue...') => {
  await nativePrompt(message);
};

/**
 * Text input
 * @param {string} message - Prompt message
 * @param {string} [defaultVal=''] - Default value
 * @returns {Promise<string>}
 */
const textInput = async (message, defaultVal = '') => {
  const value = await nativePrompt(message);
  return value || defaultVal;
};

/**
 * Password input (masked)
 * @param {string} message - Prompt message
 * @returns {Promise<string>}
 */
const passwordInput = async (message) => {
  closeReadline();
  prepareStdin();

  const { value } = await inquirer.prompt([{
    type: 'password',
    name: 'value',
    message,
    mask: '*',
    prefix: '',
  }]);

  return value;
};

/**
 * Confirm prompt with arrow keys
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
    message,
    choices,
    prefix: '',
    loop: false,
  }]);

  return value;
};

/**
 * Number input with validation
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
    message,
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
 * Select from options with arrow keys
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
    message,
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
