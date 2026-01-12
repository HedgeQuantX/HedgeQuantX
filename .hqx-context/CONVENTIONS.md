# HQX-CLI Code Conventions

> Guidelines for consistent code across the project

## File Structure

```javascript
/**
 * @fileoverview Brief description
 * @module module-name
 */

const dependency = require('dependency');
const { local } = require('../local');

// Constants at top
const CONSTANT = 'value';

// Main exports
const myFunction = async () => {
  // ...
};

module.exports = { myFunction };
```

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `ai-agent.js` |
| Functions | camelCase | `getActiveAgent()` |
| Classes | PascalCase | `AISupervisor` |
| Constants | UPPER_SNAKE | `MAX_RETRIES` |
| Private | underscore prefix | `_internalMethod()` |

## Error Handling

```javascript
// Always use try-catch for async operations
try {
  const result = await apiCall();
  return { success: true, data: result };
} catch (error) {
  log.error('Operation failed:', error.message);
  return { success: false, error: error.message };
}
```

## Logging

```javascript
const { logger } = require('../utils');
const log = logger.scope('ModuleName');

log.info('Operation started');
log.warn('Warning message');
log.error('Error occurred:', error);
log.debug('Debug info'); // Only in HQX_DEBUG=1
```

## UI Components

### Box Drawing
```javascript
const { getLogoWidth, drawBoxHeaderContinue, drawBoxFooter } = require('../ui');

const boxWidth = getLogoWidth();
const W = boxWidth - 2;

const makeLine = (content, align = 'left') => {
  const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
  const padding = W - plainLen;
  if (align === 'center') {
    const leftPad = Math.floor(padding / 2);
    return chalk.cyan('║') + ' '.repeat(leftPad) + content + ' '.repeat(padding - leftPad) + chalk.cyan('║');
  }
  return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
};
```

### Menu Pattern
```javascript
const menuFunction = async (service) => {
  prepareStdin(); // Always prepare stdin first
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('MENU TITLE', boxWidth);
  
  // Menu content...
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT:'));
  
  switch (choice?.toLowerCase()) {
    case '1':
      // Handle option
      break;
    case '<':
    case 'b':
      return 'back';
  }
};
```

## Service Pattern

```javascript
class ServiceName {
  constructor() {
    this.connected = false;
    this.ws = null;
  }
  
  async connect(credentials) {
    // Validate input
    // Connect to API
    // Return { success, error?, data? }
  }
  
  async disconnect() {
    // Clean up resources
  }
  
  isConnected() {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton export
module.exports = new ServiceName();
```

## Prompts

```javascript
const { prompts } = require('../utils');

// Text input
const value = await prompts.textInput('Enter value:');

// Password (masked)
const password = await prompts.passwordInput('Password:');

// Confirmation
const confirmed = await prompts.confirmPrompt('Are you sure?', true);

// Selection
const choice = await prompts.selectOption('Choose:', [
  { label: 'Option 1', value: 'opt1' },
  { label: 'Option 2', value: 'opt2' },
]);

// Wait for enter
await prompts.waitForEnter();
```

## Validation

```javascript
const { validateUsername, validatePassword, ValidationError } = require('../security/validation');

try {
  const username = validateUsername(input);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(`Invalid ${error.field}: ${error.message}`);
  }
}
```

## Encryption

```javascript
const { encrypt, decrypt, maskSensitive } = require('../security/encryption');

// Encrypt sensitive data
const encrypted = encrypt(JSON.stringify(data));

// Decrypt
const decrypted = JSON.parse(decrypt(encrypted));

// Mask for display
console.log(maskSensitive(apiKey)); // "sk-a****xyz"
```

## Configuration

```javascript
const { TIMEOUTS, SECURITY, VALIDATION } = require('../config/settings');

// Use constants instead of magic numbers
setTimeout(callback, TIMEOUTS.API_REQUEST);
```

## Testing Commands

```bash
# Quick component test
node -e "const x = require('./src/module'); console.log(x);"

# Test CLI startup (3s timeout)
timeout 3 node bin/cli.js

# Test with debug
HQX_DEBUG=1 node bin/cli.js
```

## Git Commit Messages

```
type: short description

- Detail 1
- Detail 2

Types: feat, fix, refactor, docs, test, chore
```

Examples:
- `feat: add multi-agent AI consensus system`
- `fix: resolve dashboard loading freeze`
- `refactor: consolidate encryption utilities`

## Publishing

```bash
# Update version
npm version patch|minor|major

# Publish
npm publish --access public

# Or all in one
git add . && git commit -m "message" && git push && npm publish
```
