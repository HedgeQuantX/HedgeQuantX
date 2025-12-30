/**
 * Centralized prompts utility - lightweight, no external UI
 * Uses readline for simple input, keeps our custom box design
 */

const readline = require('readline');

/**
 * Create readline interface
 */
const createRL = () => readline.createInterface({ 
  input: process.stdin, 
  output: process.stdout 
});

/**
 * Wait for Enter key
 */
const waitForEnter = (message = 'Press Enter to continue...') => new Promise(resolve => {
  const rl = createRL();
  rl.question(message, () => { rl.close(); resolve(); });
});

/**
 * Simple text input
 */
const textInput = (message, defaultVal = '') => new Promise(resolve => {
  const rl = createRL();
  const prompt = defaultVal ? `${message} (${defaultVal}): ` : `${message}: `;
  rl.question(prompt, (answer) => {
    rl.close();
    resolve(answer.trim() || defaultVal);
  });
});

/**
 * Password input (hidden)
 */
const passwordInput = (message) => new Promise(resolve => {
  const rl = createRL();
  process.stdout.write(`${message}: `);
  
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  
  let password = '';
  const onData = (char) => {
    char = char.toString();
    
    if (char === '\n' || char === '\r') {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener('data', onData);
      console.log();
      rl.close();
      resolve(password);
    } else if (char === '\u0003') { // Ctrl+C
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
      process.stdin.removeListener('data', onData);
      rl.close();
      resolve(null);
    } else if (char === '\u007F' || char === '\b') { // Backspace
      if (password.length > 0) {
        password = password.slice(0, -1);
        process.stdout.write('\b \b');
      }
    } else {
      password += char;
      process.stdout.write('*');
    }
  };
  
  process.stdin.on('data', onData);
  process.stdin.resume();
});

/**
 * Select from options using arrow keys
 */
const selectOption = (message, options) => new Promise(resolve => {
  if (!process.stdin.isTTY) {
    // Fallback for non-TTY
    const rl = createRL();
    console.log(message);
    options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt.label}`));
    rl.question('Enter number: ', (answer) => {
      rl.close();
      const idx = parseInt(answer) - 1;
      resolve(options[idx]?.value || null);
    });
    return;
  }
  
  let selectedIndex = 0;
  const maxIndex = options.length - 1;
  
  const render = () => {
    // Move cursor up and clear lines
    if (selectedIndex > 0 || options.length > 1) {
      process.stdout.write(`\x1B[${options.length}A`);
    }
    
    options.forEach((opt, i) => {
      const prefix = i === selectedIndex ? '› ' : '  ';
      const style = i === selectedIndex ? '\x1B[36m' : '\x1B[90m'; // cyan : gray
      process.stdout.write(`\x1B[2K${style}${prefix}${opt.label}\x1B[0m\n`);
    });
  };
  
  // Initial render
  console.log(`\x1B[36m${message}\x1B[0m`);
  options.forEach((opt, i) => {
    const prefix = i === selectedIndex ? '› ' : '  ';
    const style = i === selectedIndex ? '\x1B[36m' : '\x1B[90m';
    console.log(`${style}${prefix}${opt.label}\x1B[0m`);
  });
  
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  
  const onKeypress = (str, key) => {
    if (key.name === 'up' || key.name === 'k') {
      selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : maxIndex;
      render();
    } else if (key.name === 'down' || key.name === 'j') {
      selectedIndex = selectedIndex < maxIndex ? selectedIndex + 1 : 0;
      render();
    } else if (key.name === 'return') {
      cleanup();
      resolve(options[selectedIndex].value);
    } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
      cleanup();
      resolve(null);
    } else if (str >= '1' && str <= '9') {
      const idx = parseInt(str) - 1;
      if (idx <= maxIndex) {
        cleanup();
        resolve(options[idx].value);
      }
    }
  };
  
  const cleanup = () => {
    process.stdin.removeListener('keypress', onKeypress);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    // Clear the menu display
    process.stdout.write(`\x1B[${options.length + 1}A`);
    for (let i = 0; i <= options.length; i++) {
      process.stdout.write('\x1B[2K\n');
    }
    process.stdout.write(`\x1B[${options.length + 1}A`);
  };
  
  process.stdin.on('keypress', onKeypress);
});

/**
 * Confirm yes/no
 */
const confirmPrompt = (message, defaultVal = true) => new Promise(resolve => {
  const rl = createRL();
  const hint = defaultVal ? '(Y/n)' : '(y/N)';
  rl.question(`${message} ${hint}: `, (answer) => {
    rl.close();
    const a = answer.toLowerCase().trim();
    if (a === '') resolve(defaultVal);
    else if (a === 'y' || a === 'yes') resolve(true);
    else if (a === 'n' || a === 'no') resolve(false);
    else resolve(defaultVal);
  });
});

/**
 * Number input
 */
const numberInput = (message, defaultVal = 1, min = 1, max = 1000) => new Promise(resolve => {
  const rl = createRL();
  rl.question(`${message} (${defaultVal}): `, (answer) => {
    rl.close();
    const n = parseInt(answer) || defaultVal;
    if (n < min) resolve(min);
    else if (n > max) resolve(max);
    else resolve(n);
  });
});

module.exports = {
  waitForEnter,
  selectOption,
  textInput,
  passwordInput,
  confirmPrompt,
  numberInput
};
