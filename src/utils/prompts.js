/**
 * Centralized prompts utility
 * Uses native readline for reliable stdin handling
 */

const inquirer = require('inquirer');
const readline = require('readline');

/**
 * Ensure stdin is ready
 */
const prepareStdin = () => {
  try {
    if (process.stdin.isPaused()) process.stdin.resume();
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      process.stdin.setRawMode(false);
    }
  } catch (e) {}
};

/**
 * Native readline prompt - more reliable than inquirer for simple input
 */
const nativePrompt = (message) => {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    rl.question(message + ' ', (answer) => {
      rl.close();
      resolve(answer || '');
    });
  });
};

/**
 * Wait for Enter
 */
const waitForEnter = async (message = 'Press Enter to continue...') => {
  await nativePrompt(message);
};

/**
 * Text input
 */
const textInput = async (message, defaultVal = '') => {
  const value = await nativePrompt(message);
  return value || defaultVal;
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
 * Confirm - arrow keys selection
 */
const confirmPrompt = async (message, defaultVal = true) => {
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
    loop: false
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
