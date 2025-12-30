/**
 * Centralized prompts utility using @clack/prompts
 * Replaces inquirer throughout the app
 */

const { select, text, password, confirm, isCancel } = require('@clack/prompts');
const readline = require('readline');

/**
 * Wait for Enter key
 */
const waitForEnter = (message = 'Press Enter to continue...') => new Promise(resolve => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(message, () => { rl.close(); resolve(); });
});

/**
 * Select from list
 */
const selectOption = async (message, options) => {
  const result = await select({ message, options });
  if (isCancel(result)) return null;
  return result;
};

/**
 * Text input
 */
const textInput = async (message, initialValue = '', validate = null) => {
  const opts = { message };
  if (initialValue) opts.initialValue = initialValue;
  if (validate) opts.validate = validate;
  
  const result = await text(opts);
  if (isCancel(result)) return null;
  return result;
};

/**
 * Password input
 */
const passwordInput = async (message, validate = null) => {
  const opts = { message };
  if (validate) opts.validate = validate;
  
  const result = await password(opts);
  if (isCancel(result)) return null;
  return result;
};

/**
 * Confirm yes/no
 */
const confirmPrompt = async (message, initial = true) => {
  const result = await confirm({ message, initialValue: initial });
  if (isCancel(result)) return null;
  return result;
};

/**
 * Number input with validation
 */
const numberInput = async (message, defaultVal = 1, min = 1, max = 1000) => {
  const result = await text({
    message,
    initialValue: String(defaultVal),
    validate: v => {
      const n = parseInt(v);
      if (isNaN(n)) return 'Enter a number';
      if (n < min) return `Minimum is ${min}`;
      if (n > max) return `Maximum is ${max}`;
      return undefined;
    }
  });
  if (isCancel(result)) return null;
  return parseInt(result);
};

module.exports = {
  waitForEnter,
  selectOption,
  textInput,
  passwordInput,
  confirmPrompt,
  numberInput,
  isCancel
};
