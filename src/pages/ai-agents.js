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

const { getLogoWidth } = require('../ui');
const { prompts } = require('../utils');
const { fetchModelsFromApi } = require('./ai-models');
const { drawProvidersTable, drawModelsTable, drawProviderWindow } = require('./ai-agents-ui');
const cliproxy = require('../services/cliproxy');

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

/** Load AI config from file */
const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (error) { /* ignore */ }
  return { providers: {} };
};

/** Save AI config to file */
const saveConfig = (config) => {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    return false;
  }
};

/** Select a model from a pre-fetched list */
const selectModelFromList = async (provider, models, boxWidth) => {
  while (true) {
    console.clear();
    drawModelsTable(provider, models, boxWidth);
    
    const input = await prompts.textInput(chalk.cyan('Select model: '));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') return null;
    
    const num = parseInt(choice);
    if (!isNaN(num) && num >= 1 && num <= models.length) return models[num - 1];
    
    console.log(chalk.red('  Invalid option.'));
    await new Promise(r => setTimeout(r, 1000));
  }
};

/** Select a model for a provider (fetches from API) */
const selectModel = async (provider, apiKey) => {
  const boxWidth = getLogoWidth();
  const spinner = ora({ text: 'Fetching models from API...', color: 'yellow' }).start();
  const result = await fetchModelsFromApi(provider.id, apiKey);
  
  if (!result.success || result.models.length === 0) {
    spinner.fail(result.error || 'No models available');
    await prompts.waitForEnter();
    return null;
  }
  
  spinner.succeed(`Found ${result.models.length} models`);
  return selectModelFromList(provider, result.models, boxWidth);
};

/** Deactivate all providers and activate one */
const activateProvider = (config, providerId, data) => {
  Object.keys(config.providers).forEach(id => {
    if (config.providers[id]) config.providers[id].active = false;
  });
  if (!config.providers[providerId]) config.providers[providerId] = {};
  Object.assign(config.providers[providerId], data, { active: true, configuredAt: new Date().toISOString() });
};

/** Handle CLIProxy connection (with auto-install) */
const handleCliProxyConnection = async (provider, config, boxWidth) => {
  console.log();
  
  // Check if CLIProxyAPI is installed
  if (!cliproxy.isInstalled()) {
    console.log(chalk.yellow('  CLIProxyAPI not installed. Installing...'));
    const spinner = ora({ text: 'Downloading CLIProxyAPI...', color: 'yellow' }).start();
    
    const installResult = await cliproxy.install((msg, percent) => {
      spinner.text = `${msg} ${percent}%`;
    });
    
    if (!installResult.success) {
      spinner.fail(`Installation failed: ${installResult.error}`);
      await prompts.waitForEnter();
      return false;
    }
    spinner.succeed('CLIProxyAPI installed');
  }
  
  // Check if running, start if not
  let status = await cliproxy.isRunning();
  if (!status.running) {
    const spinner = ora({ text: 'Starting CLIProxyAPI...', color: 'yellow' }).start();
    const startResult = await cliproxy.start();
    
    if (!startResult.success) {
      spinner.fail(`Failed to start: ${startResult.error}`);
      await prompts.waitForEnter();
      return false;
    }
    spinner.succeed('CLIProxyAPI started');
  } else {
    console.log(chalk.green('  ✓ CLIProxyAPI is running'));
  }
  
  // Check if provider supports OAuth
  const oauthProviders = ['anthropic', 'openai', 'google', 'qwen'];
  if (!oauthProviders.includes(provider.id)) {
    // Try to fetch models directly
    console.log(chalk.gray(`  Checking available models for ${provider.name}...`));
    const modelsResult = await cliproxy.fetchProviderModels(provider.id);
    
    if (!modelsResult.success || modelsResult.models.length === 0) {
      console.log(chalk.red(`  No models available for ${provider.name}`));
      console.log(chalk.gray('  This provider may require API key connection.'));
      await prompts.waitForEnter();
      return false;
    }
    
    const selectedModel = await selectModelFromList(provider, modelsResult.models, boxWidth);
    if (!selectedModel) return false;
    
    activateProvider(config, provider.id, {
      connectionType: 'cliproxy',
      modelId: selectedModel.id,
      modelName: selectedModel.name
    });
    
    if (saveConfig(config)) {
      console.log(chalk.green(`\n  ✓ ${provider.name} connected via CLIProxy.`));
      console.log(chalk.cyan(`    Model: ${selectedModel.name}`));
    }
    await prompts.waitForEnter();
    return true;
  }
  
  // OAuth flow - get login URL
  console.log(chalk.cyan(`\n  Starting OAuth login for ${provider.name}...`));
  const loginResult = await cliproxy.getLoginUrl(provider.id);
  
  if (!loginResult.success) {
    console.log(chalk.red(`  OAuth error: ${loginResult.error}`));
    await prompts.waitForEnter();
    return false;
  }
  
  console.log(chalk.cyan('\n  Open this URL in your browser to authenticate:\n'));
  console.log(chalk.yellow(`  ${loginResult.url}\n`));
  console.log(chalk.gray('  After authenticating, press Enter to continue...'));
  
  await prompts.waitForEnter();
  
  // Try to fetch models after auth
  const modelsResult = await cliproxy.fetchProviderModels(provider.id);
  
  if (modelsResult.success && modelsResult.models.length > 0) {
    const selectedModel = await selectModelFromList(provider, modelsResult.models, boxWidth);
    if (selectedModel) {
      activateProvider(config, provider.id, {
        connectionType: 'cliproxy',
        modelId: selectedModel.id,
        modelName: selectedModel.name
      });
      if (saveConfig(config)) {
        console.log(chalk.green(`\n  ✓ ${provider.name} connected via Paid Plan.`));
        console.log(chalk.cyan(`    Model: ${selectedModel.name}`));
      }
    }
  } else {
    // No models but auth might have worked
    activateProvider(config, provider.id, {
      connectionType: 'cliproxy',
      modelId: null,
      modelName: 'Auto'
    });
    if (saveConfig(config)) {
      console.log(chalk.green(`\n  ✓ ${provider.name} connected via Paid Plan.`));
    }
  }
  
  await prompts.waitForEnter();
  return true;
};

/** Handle API Key connection */
const handleApiKeyConnection = async (provider, config) => {
  console.clear();
  console.log(chalk.yellow(`\n  Enter your ${provider.name} API key:`));
  console.log(chalk.gray('  (Press Enter to cancel)\n'));
  
  const apiKey = await prompts.textInput(chalk.cyan('  API Key: '), true);
  
  if (!apiKey || apiKey.trim() === '') {
    console.log(chalk.gray('  Cancelled.'));
    await prompts.waitForEnter();
    return false;
  }
  
  if (apiKey.length < 20) {
    console.log(chalk.red('  Invalid API key format (too short).'));
    await prompts.waitForEnter();
    return false;
  }
  
  const selectedModel = await selectModel(provider, apiKey.trim());
  if (!selectedModel) return false;
  
  activateProvider(config, provider.id, {
    connectionType: 'apikey',
    apiKey: apiKey.trim(),
    modelId: selectedModel.id,
    modelName: selectedModel.name
  });
  
  if (saveConfig(config)) {
    console.log(chalk.green(`\n  ✓ ${provider.name} connected via API Key.`));
    console.log(chalk.cyan(`    Model: ${selectedModel.name}`));
  } else {
    console.log(chalk.red('\n  Failed to save config.'));
  }
  await prompts.waitForEnter();
  return true;
};

/** Handle provider configuration */
const handleProviderConfig = async (provider, config) => {
  const boxWidth = getLogoWidth();
  
  while (true) {
    console.clear();
    drawProviderWindow(provider, config, boxWidth);
    
    const input = await prompts.textInput(chalk.cyan('Select option: '));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') break;
    
    if (choice === 'd' && config.providers[provider.id]) {
      config.providers[provider.id].active = false;
      saveConfig(config);
      console.log(chalk.yellow(`\n  ${provider.name} disconnected.`));
      await prompts.waitForEnter();
      continue;
    }
    
    if (choice === '1') {
      await handleCliProxyConnection(provider, config, boxWidth);
      continue;
    }
    
    if (choice === '2') {
      await handleApiKeyConnection(provider, config);
      continue;
    }
  }
  
  return config;
};

/** Get active AI provider config */
const getActiveProvider = () => {
  const config = loadConfig();
  for (const provider of AI_PROVIDERS) {
    const pc = config.providers[provider.id];
    if (pc && pc.active) {
      return {
        id: provider.id,
        name: provider.name,
        connectionType: pc.connectionType,
        apiKey: pc.apiKey || null,
        modelId: pc.modelId || null,
        modelName: pc.modelName || null
      };
    }
  }
  return null;
};

/** Count active AI agents */
const getActiveAgentCount = () => getActiveProvider() ? 1 : 0;

/** Show CLIProxy status */
const showCliProxyStatus = async () => {
  console.clear();
  console.log(chalk.yellow('\n  CLIProxyAPI Status\n'));
  
  const installed = cliproxy.isInstalled();
  console.log(chalk.gray('  Installed: ') + (installed ? chalk.green('Yes') : chalk.red('No')));
  
  if (installed) {
    const status = await cliproxy.isRunning();
    console.log(chalk.gray('  Running: ') + (status.running ? chalk.green('Yes') : chalk.red('No')));
    console.log(chalk.gray('  Version: ') + chalk.cyan(cliproxy.CLIPROXY_VERSION));
    console.log(chalk.gray('  Port: ') + chalk.cyan(cliproxy.DEFAULT_PORT));
    console.log(chalk.gray('  Install dir: ') + chalk.cyan(cliproxy.INSTALL_DIR));
  }
  
  console.log();
  await prompts.waitForEnter();
};

/** Main AI Agents menu */
const aiAgentsMenu = async () => {
  let config = loadConfig();
  const boxWidth = getLogoWidth();
  
  while (true) {
    console.clear();
    const status = await cliproxy.isRunning();
    const statusText = status.running ? `localhost:${cliproxy.DEFAULT_PORT}` : 'Not running';
    drawProvidersTable(AI_PROVIDERS, config, boxWidth, statusText);
    
    const input = await prompts.textInput(chalk.cyan('Select (1-8/S/B): '));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') break;
    
    if (choice === 's') {
      await showCliProxyStatus();
      continue;
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
