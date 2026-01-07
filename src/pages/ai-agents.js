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

const ora = require('ora');
const { getLogoWidth, centerText, visibleLength } = require('../ui');
const { prompts } = require('../utils');
const { fetchModelsFromApi } = require('./ai-models');

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
 * Mask API key for display
 * @param {string} key - API key
 * @returns {string} Masked key
 */
const maskKey = (key) => {
  if (!key || key.length < 16) return '****';
  return key.substring(0, 8) + '...' + key.substring(key.length - 4);
};

/**
 * Draw a 2-column row
 */
const draw2ColRow = (leftText, rightText, W) => {
  const col1Width = Math.floor(W / 2);
  const col2Width = W - col1Width;
  const leftLen = visibleLength(leftText);
  const leftPad = col1Width - leftLen;
  const leftPadL = Math.floor(leftPad / 2);
  const rightLen = visibleLength(rightText || '');
  const rightPad = col2Width - rightLen;
  const rightPadL = Math.floor(rightPad / 2);
  console.log(
    chalk.cyan('║') +
    ' '.repeat(leftPadL) + leftText + ' '.repeat(leftPad - leftPadL) +
    ' '.repeat(rightPadL) + (rightText || '') + ' '.repeat(rightPad - rightPadL) +
    chalk.cyan('║')
  );
};

/**
 * Draw 2-column table
 */
const draw2ColTable = (title, titleColor, items, backText, W) => {
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + titleColor(centerText(title, W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  const rows = Math.ceil(items.length / 2);
  for (let row = 0; row < rows; row++) {
    const left = items[row];
    const right = items[row + rows];
    draw2ColRow(left || '', right || '', W);
  }
  
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText(backText, W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
};

/**
 * Draw providers table
 */
const drawProvidersTable = (config, boxWidth) => {
  const W = boxWidth - 2;
  const items = AI_PROVIDERS.map((p, i) => {
    const status = config.providers[p.id]?.active ? chalk.green(' ●') : '';
    return chalk.cyan(`[${i + 1}]`) + ' ' + chalk[p.color](p.name) + status;
  });
  draw2ColTable('AI AGENTS CONFIGURATION', chalk.yellow.bold, items, '[B] Back to Menu', W);
};

/**
 * Draw models table
 */
const drawModelsTable = (provider, models, boxWidth) => {
  const W = boxWidth - 2;
  const items = models.map((m, i) => chalk.cyan(`[${i + 1}]`) + ' ' + chalk.white(m.name));
  draw2ColTable(`${provider.name.toUpperCase()} - MODELS`, chalk[provider.color].bold, items, '[B] Back', W);
};

/**
 * Select a model for a provider (fetches from API)
 * @param {Object} provider - Provider object
 * @param {string} apiKey - API key for fetching models
 * @returns {Object|null} Selected model or null if cancelled/failed
 */
const selectModel = async (provider, apiKey) => {
  const boxWidth = getLogoWidth();
  
  // Fetch models from API
  const spinner = ora({ text: 'Fetching models from API...', color: 'yellow' }).start();
  const result = await fetchModelsFromApi(provider.id, apiKey);
  
  if (!result.success || result.models.length === 0) {
    spinner.fail(result.error || 'No models available');
    await prompts.waitForEnter();
    return null;
  }
  
  spinner.succeed(`Found ${result.models.length} models`);
  const models = result.models;
  
  while (true) {
    console.clear();
    drawModelsTable(provider, models, boxWidth);
    
    const input = await prompts.textInput(chalk.cyan('Select model: '));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') {
      return null;
    }
    
    const num = parseInt(choice);
    if (!isNaN(num) && num >= 1 && num <= models.length) {
      return models[num - 1];
    }
    
    console.log(chalk.red('  Invalid option.'));
    await new Promise(r => setTimeout(r, 1000));
  }
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
    const modelName = providerConfig.modelName || 'N/A';
    statusText = chalk.green('● ACTIVE') + chalk.gray('  Model: ') + chalk.yellow(modelName) + chalk.gray('  via ') + chalk.cyan(connType);
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
      // CLIProxy connection - models will be fetched via proxy
      console.log();
      console.log(chalk.cyan('  CLIProxy uses your paid plan subscription.'));
      console.log(chalk.gray('  Model selection will be available after connecting.'));
      console.log();
      
      // Deactivate all other providers
      Object.keys(config.providers).forEach(id => {
        if (config.providers[id]) config.providers[id].active = false;
      });
      
      if (!config.providers[provider.id]) config.providers[provider.id] = {};
      config.providers[provider.id].connectionType = 'cliproxy';
      config.providers[provider.id].modelId = null;
      config.providers[provider.id].modelName = 'N/A';
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
      // API Key connection - get key first, then fetch models
      console.clear();
      console.log(chalk.yellow(`\n  Enter your ${provider.name} API key:`));
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
      
      // Fetch models from API with the provided key
      const selectedModel = await selectModel(provider, apiKey.trim());
      if (!selectedModel) continue;
      
      // Deactivate all other providers
      Object.keys(config.providers).forEach(id => {
        if (config.providers[id]) config.providers[id].active = false;
      });
      
      if (!config.providers[provider.id]) config.providers[provider.id] = {};
      config.providers[provider.id].connectionType = 'apikey';
      config.providers[provider.id].apiKey = apiKey.trim();
      config.providers[provider.id].modelId = selectedModel.id;
      config.providers[provider.id].modelName = selectedModel.name;
      config.providers[provider.id].active = true;
      config.providers[provider.id].configuredAt = new Date().toISOString();
      
      if (saveConfig(config)) {
        console.log(chalk.green(`\n  ✓ ${provider.name} connected via API Key.`));
        console.log(chalk.cyan(`    Model: ${selectedModel.name}`));
      } else {
        console.log(chalk.red('\n  Failed to save config.'));
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
        apiKey: providerConfig.apiKey || null,
        modelId: providerConfig.modelId || null,
        modelName: providerConfig.modelName || null
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
