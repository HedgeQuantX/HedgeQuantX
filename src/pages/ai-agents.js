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
const { isCliProxyRunning, fetchModelsFromCliProxy, getOAuthUrl, checkOAuthStatus } = require('../services/cliproxy');

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

/** Handle CLIProxy connection */
const handleCliProxyConnection = async (provider, config, boxWidth) => {
  console.log();
  const spinner = ora({ text: 'Checking CLIProxy status...', color: 'yellow' }).start();
  const proxyStatus = await isCliProxyRunning();
  
  if (!proxyStatus.running) {
    spinner.fail('CLIProxy is not running');
    console.log(chalk.yellow('\n  CLIProxy must be running on localhost:8317'));
    console.log(chalk.gray('  Install: https://help.router-for.me\n'));
    await prompts.waitForEnter();
    return false;
  }
  
  spinner.succeed('CLIProxy is running');
  const oauthResult = await getOAuthUrl(provider.id);
  
  if (!oauthResult.success) {
    // OAuth not supported - try direct model fetch
    console.log(chalk.gray(`  OAuth not available for ${provider.name}, checking models...`));
    const modelsResult = await fetchModelsFromCliProxy();
    
    if (!modelsResult.success || modelsResult.models.length === 0) {
      console.log(chalk.red(`  No models available via CLIProxy for ${provider.name}`));
      console.log(chalk.gray(`  Error: ${modelsResult.error || 'Unknown'}`));
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
  
  // OAuth flow
  console.log(chalk.cyan('\n  Open this URL in your browser to authenticate:\n'));
  console.log(chalk.yellow(`  ${oauthResult.url}\n`));
  console.log(chalk.gray('  Waiting for authentication... (Press Enter to cancel)'));
  
  let authenticated = false;
  const maxWait = 120000, pollInterval = 3000;
  let waited = 0;
  
  const pollPromise = (async () => {
    while (waited < maxWait) {
      await new Promise(r => setTimeout(r, pollInterval));
      waited += pollInterval;
      if (oauthResult.state) {
        const statusResult = await checkOAuthStatus(oauthResult.state);
        if (statusResult.success && statusResult.status === 'ok') { authenticated = true; return true; }
        if (statusResult.status === 'error') {
          console.log(chalk.red(`\n  Authentication error: ${statusResult.error || 'Unknown'}`));
          return false;
        }
      }
    }
    return false;
  })();
  
  await Promise.race([pollPromise, prompts.waitForEnter()]);
  
  if (!authenticated) {
    console.log(chalk.yellow('  Authentication cancelled or timed out.'));
    await prompts.waitForEnter();
    return false;
  }
  
  console.log(chalk.green('  ✓ Authentication successful!'));
  
  const modelsResult = await fetchModelsFromCliProxy();
  if (modelsResult.success && modelsResult.models.length > 0) {
    const selectedModel = await selectModelFromList(provider, modelsResult.models, boxWidth);
    if (selectedModel) {
      activateProvider(config, provider.id, {
        connectionType: 'cliproxy',
        modelId: selectedModel.id,
        modelName: selectedModel.name
      });
      if (saveConfig(config)) {
        console.log(chalk.green(`\n  ✓ ${provider.name} connected via CLIProxy.`));
        console.log(chalk.cyan(`    Model: ${selectedModel.name}`));
      }
    }
  } else {
    activateProvider(config, provider.id, {
      connectionType: 'cliproxy',
      modelId: null,
      modelName: 'Default'
    });
    if (saveConfig(config)) console.log(chalk.green(`\n  ✓ ${provider.name} connected via CLIProxy.`));
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

/** Main AI Agents menu */
const aiAgentsMenu = async () => {
  let config = loadConfig();
  const boxWidth = getLogoWidth();
  
  while (true) {
    console.clear();
    drawProvidersTable(AI_PROVIDERS, config, boxWidth);
    
    const input = await prompts.textInput(chalk.cyan('Select provider: '));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') break;
    
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
