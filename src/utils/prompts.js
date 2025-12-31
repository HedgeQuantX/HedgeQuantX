/**
 * Centralized prompts utility
 * Uses native readline for reliable stdin handling
 */

const inquirer = require('inquirer');
const readline = require('readline');

// Shared readline instance
let rl = null;

/**
 * Get or create readline interface
 */
const getReadline = () => {
  if (!rl || rl.closed) {
    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true
    });
  }
  return rl;
};

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
 * Native readline prompt
 */
const nativePrompt = (message) => {
  return new Promise((resolve) => {
    prepareStdin();
    const r = getReadline();
    
    r.question(message + ' ', (answer) => {
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
  if (rl && !rl.closed) { rl.close(); rl = null; }
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
  if (rl && !rl.closed) { rl.close(); rl = null; }
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
  if (rl && !rl.closed) { rl.close(); rl = null; }
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
  // Close shared readline before inquirer to avoid conflicts
  if (rl && !rl.closed) {
    rl.close();
    rl = null;
  }
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
