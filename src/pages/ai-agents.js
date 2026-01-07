/**
 * AI Agents Configuration Page
 * 
 * Allows users to configure AI providers for trading strategies.
 * Supports both CLIProxy (paid plans) and direct API keys.
 */

const chalk = require('chalk');
const os = require('os');
const path = require('path');
const fs = require('fs');

const { getLogoWidth, centerText, visibleLength } = require('../ui');
const { prompts } = require('../utils');

// Config file path
const CONFIG_DIR = path.join(os.homedir(), '.hqx');
const CONFIG_FILE = path.join(CONFIG_DIR, 'ai-config.json');

// AI Providers list
const AI_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic (Claude)', color: 'magenta' },
  { id: 'openai', name: 'OpenAI (GPT)', color: 'green' },
  { id: 'google', name: 'Google (Gemini)', color: 'blue' },
  { id: 'mistral', name: 'Mistral AI', color: 'yellow' },
  { id: 'groq', name: 'Groq', color: 'cyan' },
  { id: 'xai', name: 'xAI (Grok)', color: 'white' },
  { id: 'perplexity', name: 'Perplexity', color: 'blue' },
  { id: 'openrouter', name: 'OpenRouter', color: 'gray' },
];

/**
 * Load AI config from file
 * @returns {Object} Config object with provider settings
 */
const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    // Config file doesn't exist or is invalid
  }
  return { providers: {} };
};

/**
 * Save AI config to file
 * @param {Object} config - Config object to save
 * @returns {boolean} Success status
 */
const saveConfig = (config) => {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Mask API key for display (show first 8 and last 4 chars)
 * @param {string} key - API key
 * @returns {string} Masked key
 */
const maskKey = (key) => {
  if (!key || key.length < 16) return '****';
  return key.substring(0, 8) + '...' + key.substring(key.length - 4);
};

/**
 * Draw the main providers selection table (2 columns)
 * @param {Object} config - Current config
 * @param {number} boxWidth - Box width
 */
const drawProvidersTable = (config, boxWidth) => {
  const W = boxWidth - 2;
  const col1Width = Math.floor(W / 2);
  const col2Width = W - col1Width;
  
  // Header
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.yellow.bold(centerText('AI AGENTS CONFIGURATION', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Calculate max name length for alignment
  const maxNameLen = Math.max(...AI_PROVIDERS.map(p => p.name.length));
  
  // Provider rows (2 columns)
  const rows = Math.ceil(AI_PROVIDERS.length / 2);
  for (let row = 0; row < rows; row++) {
    const leftIdx = row;
    const rightIdx = row + rows;
    
    const leftProvider = AI_PROVIDERS[leftIdx];
    const rightProvider = AI_PROVIDERS[rightIdx];
    
    // Left column
    const leftNum = `[${leftIdx + 1}]`;
    const leftName = leftProvider.name;
    const leftConfig = config.providers[leftProvider.id] || {};
    const leftStatus = leftConfig.active ? chalk.green('●') : '';
    const leftText = chalk.cyan(leftNum) + ' ' + chalk[leftProvider.color](leftName) + ' ' + leftStatus;
    const leftLen = visibleLength(leftText);
    const leftPadTotal = col1Width - leftLen;
    const leftPadL = Math.floor(leftPadTotal / 2);
    const leftPadR = leftPadTotal - leftPadL;
    
    // Right column
    let rightText = '';
    let rightPadL = 0;
    let rightPadR = col2Width;
    if (rightProvider) {
      const rightNum = `[${rightIdx + 1}]`;
      const rightName = rightProvider.name;
      const rightConfig = config.providers[rightProvider.id] || {};
      const rightStatus = rightConfig.active ? chalk.green('●') : '';
      rightText = chalk.cyan(rightNum) + ' ' + chalk[rightProvider.color](rightName) + ' ' + rightStatus;
      const rightLen = visibleLength(rightText);
      const rightPadTotal = col2Width - rightLen;
      rightPadL = Math.floor(rightPadTotal / 2);
      rightPadR = rightPadTotal - rightPadL;
    }
    
    console.log(
      chalk.cyan('║') +
      ' '.repeat(leftPadL) + leftText + ' '.repeat(leftPadR) +
      ' '.repeat(rightPadL) + rightText + ' '.repeat(rightPadR) +
      chalk.cyan('║')
    );
  }
  
  // Footer
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText('[B] Back to Menu', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
};

/**
 * Draw provider configuration window
 * @param {Object} provider - Provider object
 * @param {Object} config - Current config
 * @param {number} boxWidth - Box width
 */
const drawProviderWindow = (provider, config, boxWidth) => {
  const W = boxWidth - 2;
  const col1Width = Math.floor(W / 2);
  const col2Width = W - col1Width;
  const providerConfig = config.providers[provider.id] || {};
  
  // Header
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk[provider.color].bold(centerText(provider.name.toUpperCase(), W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Empty line
  console.log(chalk.cyan('║') + ' '.repeat(W) + chalk.cyan('║'));
  
  // Options in 2 columns
  const opt1Title = '[1] Connect via Paid Plan';
  const opt1Desc = 'Uses CLIProxy - No API key needed';
  const opt2Title = '[2] Connect via API Key';
  const opt2Desc = 'Enter your own API key';
  
  // Row 1: Titles
  const left1 = chalk.green(opt1Title);
  const right1 = chalk.yellow(opt2Title);
  const left1Len = visibleLength(left1);
  const right1Len = visibleLength(right1);
  const left1PadTotal = col1Width - left1Len;
  const left1PadL = Math.floor(left1PadTotal / 2);
  const left1PadR = left1PadTotal - left1PadL;
  const right1PadTotal = col2Width - right1Len;
  const right1PadL = Math.floor(right1PadTotal / 2);
  const right1PadR = right1PadTotal - right1PadL;
  
  console.log(
    chalk.cyan('║') +
    ' '.repeat(left1PadL) + left1 + ' '.repeat(left1PadR) +
    ' '.repeat(right1PadL) + right1 + ' '.repeat(right1PadR) +
    chalk.cyan('║')
  );
  
  // Row 2: Descriptions
  const left2 = chalk.gray(opt1Desc);
  const right2 = chalk.gray(opt2Desc);
  const left2Len = visibleLength(left2);
  const right2Len = visibleLength(right2);
  const left2PadTotal = col1Width - left2Len;
  const left2PadL = Math.floor(left2PadTotal / 2);
  const left2PadR = left2PadTotal - left2PadL;
  const right2PadTotal = col2Width - right2Len;
  const right2PadL = Math.floor(right2PadTotal / 2);
  const right2PadR = right2PadTotal - right2PadL;
  
  console.log(
    chalk.cyan('║') +
    ' '.repeat(left2PadL) + left2 + ' '.repeat(left2PadR) +
    ' '.repeat(right2PadL) + right2 + ' '.repeat(right2PadR) +
    chalk.cyan('║')
  );
  
  // Empty line
  console.log(chalk.cyan('║') + ' '.repeat(W) + chalk.cyan('║'));
  
  // Status bar
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  
  let statusText = '';
  if (providerConfig.active) {
    const connType = providerConfig.connectionType === 'cliproxy' ? 'CLIProxy' : 'API Key';
    const keyDisplay = providerConfig.apiKey ? maskKey(providerConfig.apiKey) : 'N/A';
    statusText = chalk.green('● ACTIVE') + chalk.gray(' via ') + chalk.cyan(connType);
    if (providerConfig.connectionType === 'apikey' && providerConfig.apiKey) {
      statusText += chalk.gray('  Key: ') + chalk.cyan(keyDisplay);
    }
  } else if (providerConfig.apiKey || providerConfig.connectionType) {
    statusText = chalk.yellow('● CONFIGURED') + chalk.gray(' (not active)');
  } else {
    statusText = chalk.gray('○ NOT CONFIGURED');
  }
  console.log(chalk.cyan('║') + centerText(statusText, W) + chalk.cyan('║'));
  
  // Disconnect option if active
  if (providerConfig.active) {
    console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
    console.log(chalk.cyan('║') + chalk.red(centerText('[D] Disconnect', W)) + chalk.cyan('║'));
  }
  
  // Back
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText('[B] Back', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
};

/**
 * Handle provider configuration
 * @param {Object} provider - Provider to configure
 * @param {Object} config - Current config
 * @returns {Object} Updated config
 */
const handleProviderConfig = async (provider, config) => {
  const boxWidth = getLogoWidth();
  
  while (true) {
    console.clear();
    drawProviderWindow(provider, config, boxWidth);
    
    const input = await prompts.textInput(chalk.cyan('Select option: '));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') {
      break;
    }
    
    if (choice === 'd') {
      // Disconnect
      if (config.providers[provider.id]) {
        config.providers[provider.id].active = false;
        saveConfig(config);
        console.log(chalk.yellow(`\n  ${provider.name} disconnected.`));
        await prompts.waitForEnter();
      }
      continue;
    }
    
    if (choice === '1') {
      // CLIProxy connection
      console.log();
      console.log(chalk.cyan('  Connecting via CLIProxy...'));
      console.log(chalk.gray('  This uses your paid plan (Claude Pro, ChatGPT Plus, etc.)'));
      console.log();
      
      // Deactivate all other providers
      Object.keys(config.providers).forEach(id => {
        if (config.providers[id]) config.providers[id].active = false;
      });
      
      if (!config.providers[provider.id]) config.providers[provider.id] = {};
      config.providers[provider.id].connectionType = 'cliproxy';
      config.providers[provider.id].active = true;
      config.providers[provider.id].configuredAt = new Date().toISOString();
      
      if (saveConfig(config)) {
        console.log(chalk.green(`  ✓ ${provider.name} connected via CLIProxy.`));
      } else {
        console.log(chalk.red('  Failed to save config.'));
      }
      await prompts.waitForEnter();
      continue;
    }
    
    if (choice === '2') {
      // API Key connection
      console.log();
      console.log(chalk.yellow(`  Enter your ${provider.name} API key:`));
      console.log(chalk.gray('  (Press Enter to cancel)'));
      console.log();
      
      const apiKey = await prompts.textInput(chalk.cyan('  API Key: '), true);
      
      if (!apiKey || apiKey.trim() === '') {
        console.log(chalk.gray('  Cancelled.'));
        await prompts.waitForEnter();
        continue;
      }
      
      if (apiKey.length < 20) {
        console.log(chalk.red('  Invalid API key format (too short).'));
        await prompts.waitForEnter();
        continue;
      }
      
      // Deactivate all other providers
      Object.keys(config.providers).forEach(id => {
        if (config.providers[id]) config.providers[id].active = false;
      });
      
      if (!config.providers[provider.id]) config.providers[provider.id] = {};
      config.providers[provider.id].connectionType = 'apikey';
      config.providers[provider.id].apiKey = apiKey.trim();
      config.providers[provider.id].active = true;
      config.providers[provider.id].configuredAt = new Date().toISOString();
      
      if (saveConfig(config)) {
        console.log(chalk.green(`  ✓ ${provider.name} connected via API Key.`));
      } else {
        console.log(chalk.red('  Failed to save config.'));
      }
      await prompts.waitForEnter();
      continue;
    }
  }
  
  return config;
};

/**
 * Get active AI provider config
 * @returns {Object|null} Active provider config or null
 */
const getActiveProvider = () => {
  const config = loadConfig();
  for (const provider of AI_PROVIDERS) {
    const providerConfig = config.providers[provider.id];
    if (providerConfig && providerConfig.active) {
      return {
        id: provider.id,
        name: provider.name,
        connectionType: providerConfig.connectionType,
        apiKey: providerConfig.apiKey || null
      };
    }
  }
  return null;
};

/**
 * Count active AI agents
 * @returns {number} Number of active agents (0 or 1)
 */
const getActiveAgentCount = () => {
  const active = getActiveProvider();
  return active ? 1 : 0;
};

/**
 * Main AI Agents menu
 */
const aiAgentsMenu = async () => {
  let config = loadConfig();
  const boxWidth = getLogoWidth();
  
  while (true) {
    console.clear();
    drawProvidersTable(config, boxWidth);
    
    const input = await prompts.textInput(chalk.cyan('Select provider: '));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') {
      break;
    }
    
    const num = parseInt(choice);
    if (!isNaN(num) && num >= 1 && num <= AI_PROVIDERS.length) {
      config = await handleProviderConfig(AI_PROVIDERS[num - 1], config);
      continue;
    }
    
    console.log(chalk.red('  Invalid option.'));
    await new Promise(r => setTimeout(r, 1000));
  }
};

module.exports = {
  aiAgentsMenu,
  getActiveProvider,
  getActiveAgentCount,
  loadConfig,
  saveConfig,
  AI_PROVIDERS
};
