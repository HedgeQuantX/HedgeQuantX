/**
 * Centralized prompts utility
 * Uses inquirer for reliable stdin handling
 */

const inquirer = require('inquirer');

/**
 * Ensure stdin is ready
 */
const prepareStdin = () => {
  try {
    if (process.stdin.isPaused()) process.stdin.resume();
    if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false);
  } catch (e) {}
};

/**
 * Wait for Enter
 */
const waitForEnter = async (message = 'Press Enter to continue...') => {
  prepareStdin();
  await inquirer.prompt([{ type: 'input', name: '_', message, prefix: '' }]);
};

/**
 * Text input
 */
const textInput = async (message, defaultVal = '') => {
  prepareStdin();
  const { value } = await inquirer.prompt([{
    type: 'input',
    name: 'value',
    message,
    default: defaultVal,
    prefix: ''
  }]);
  return value;
};

/**
 * Password input
 */
const passwordInput = async (message) => {
  prepareStdin();
  const { value } = await inquirer.prompt([{
    type: 'password',
    name: 'value',
    message,
    mask: '*',
    prefix: ''
  }]);
  return value;
};

/**
 * Confirm Y/n
 */
const confirmPrompt = async (message, defaultVal = true) => {
  prepareStdin();
  const { value } = await inquirer.prompt([{
    type: 'confirm',
    name: 'value',
    message,
    default: defaultVal,
    prefix: ''
  }]);
  return value;
};

/**
 * Number input
 */
const numberInput = async (message, defaultVal = 1, min = 1, max = 1000) => {
  prepareStdin();
  const { value } = await inquirer.prompt([{
    type: 'input',
    name: 'value',
    message,
    default: String(defaultVal),
    prefix: '',
    validate: (v) => {
      const n = parseInt(v);
      if (isNaN(n)) return 'Enter a number';
      if (n < min) return `Min: ${min}`;
      if (n > max) return `Max: ${max}`;
      return true;
    }
  }]);
  return parseInt(value) || defaultVal;
};

/**
 * Select - arrow keys navigation
 */
const selectOption = async (message, options) => {
  prepareStdin();
  
  const choices = options.map(opt => ({
    name: opt.label,
    value: opt.value
  }));
  
  const { value } = await inquirer.prompt([{
    type: 'list',
    name: 'value',
    message,
    choices,
    prefix: '',
    loop: false,
    pageSize: 15
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
  selectOption
};
