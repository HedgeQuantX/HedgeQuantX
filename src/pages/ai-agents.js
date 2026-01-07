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

const { getLogoWidth, displayBanner } = require('../ui');
const { prompts } = require('../utils');
const { fetchModelsFromApi } = require('./ai-models');
const { drawProvidersTable, drawModelsTable, drawProviderWindow } = require('./ai-agents-ui');
const cliproxy = require('../services/cliproxy');

/** Clear screen and show banner */
const clearWithBanner = () => {
  console.clear();
  displayBanner();
};

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
    clearWithBanner();
    drawModelsTable(provider, models, boxWidth);
    
    const input = await prompts.textInput(chalk.cyan('SELECT MODEL: '));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') return null;
    
    const num = parseInt(choice);
    if (!isNaN(num) && num >= 1 && num <= models.length) return models[num - 1];
    
    console.log(chalk.red('  INVALID OPTION'));
    await new Promise(r => setTimeout(r, 1000));
  }
};

/** Select a model for a provider (fetches from API) */
const selectModel = async (provider, apiKey) => {
  const boxWidth = getLogoWidth();
  const spinner = ora({ text: 'FETCHING MODELS FROM API...', color: 'yellow' }).start();
  const result = await fetchModelsFromApi(provider.id, apiKey);
  
  if (!result.success || result.models.length === 0) {
    spinner.fail(result.error || 'NO MODELS AVAILABLE');
    await prompts.waitForEnter();
    return null;
  }
  
  spinner.succeed(`FOUND ${result.models.length} MODELS`);
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
    console.log(chalk.yellow('  CLIPROXYAPI NOT INSTALLED. INSTALLING...'));
    const spinner = ora({ text: 'DOWNLOADING CLIPROXYAPI...', color: 'yellow' }).start();
    
    const installResult = await cliproxy.install((msg, percent) => {
      spinner.text = `${msg.toUpperCase()} ${percent}%`;
    });
    
    if (!installResult.success) {
      spinner.fail(`INSTALLATION FAILED: ${installResult.error.toUpperCase()}`);
      await prompts.waitForEnter();
      return false;
    }
    spinner.succeed('CLIPROXYAPI INSTALLED');
  }
  
  // Check if running, start if not
  let status = await cliproxy.isRunning();
  if (!status.running) {
    const spinner = ora({ text: 'STARTING CLIPROXYAPI...', color: 'yellow' }).start();
    const startResult = await cliproxy.start();
    
    if (!startResult.success) {
      spinner.fail(`FAILED TO START: ${startResult.error.toUpperCase()}`);
      await prompts.waitForEnter();
      return false;
    }
    spinner.succeed('CLIPROXYAPI STARTED');
  } else {
    console.log(chalk.green('  ✓ CLIPROXYAPI IS RUNNING'));
  }
  
  // Check if provider supports OAuth
  const oauthProviders = ['anthropic', 'openai', 'google', 'qwen'];
  if (!oauthProviders.includes(provider.id)) {
    // Try to fetch models directly
    console.log(chalk.gray(`  CHECKING AVAILABLE MODELS FOR ${provider.name.toUpperCase()}...`));
    const modelsResult = await cliproxy.fetchProviderModels(provider.id);
    
    if (!modelsResult.success || modelsResult.models.length === 0) {
      console.log(chalk.red(`  NO MODELS AVAILABLE FOR ${provider.name.toUpperCase()}`));
      console.log(chalk.gray('  THIS PROVIDER MAY REQUIRE API KEY CONNECTION.'));
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
      console.log(chalk.green(`\n  ✓ ${provider.name.toUpperCase()} CONNECTED VIA CLIPROXY`));
      console.log(chalk.cyan(`    MODEL: ${selectedModel.name.toUpperCase()}`));
    }
    await prompts.waitForEnter();
    return true;
  }
  
  // OAuth flow - get login URL
  console.log(chalk.cyan(`\n  STARTING OAUTH LOGIN FOR ${provider.name.toUpperCase()}...`));
  const loginResult = await cliproxy.getLoginUrl(provider.id);
  
  if (!loginResult.success) {
    console.log(chalk.red(`  OAUTH ERROR: ${loginResult.error.toUpperCase()}`));
    await prompts.waitForEnter();
    return false;
  }
  
  console.log(chalk.cyan('\n  OPEN THIS URL IN YOUR BROWSER TO AUTHENTICATE:\n'));
  console.log(chalk.yellow(`  ${loginResult.url}\n`));
  
  // Different flow for VPS/headless vs local
  if (loginResult.isHeadless) {
    console.log(chalk.magenta('  ══════════════════════════════════════════════════════'));
    console.log(chalk.magenta('  VPS/SSH DETECTED - MANUAL CALLBACK REQUIRED'));
    console.log(chalk.magenta('  ══════════════════════════════════════════════════════\n'));
    console.log(chalk.white('  AFTER AUTHORIZING IN BROWSER, YOU WILL SEE A BLANK PAGE.'));
    console.log(chalk.white('  COPY THE URL FROM BROWSER ADDRESS BAR (STARTS WITH LOCALHOST)'));
    console.log(chalk.white('  AND PASTE IT BELOW:\n'));
    
    const callbackUrl = await prompts.textInput(chalk.cyan('  CALLBACK URL: '));
    
    if (!callbackUrl || !callbackUrl.includes('localhost')) {
      console.log(chalk.red('\n  INVALID CALLBACK URL'));
      if (loginResult.childProcess) loginResult.childProcess.kill();
      await prompts.waitForEnter();
      return false;
    }
    
    // Process the callback
    const spinner = ora({ text: 'PROCESSING CALLBACK...', color: 'yellow' }).start();
    const callbackResult = await cliproxy.processCallback(callbackUrl.trim());
    
    if (!callbackResult.success) {
      spinner.fail(`CALLBACK FAILED: ${callbackResult.error.toUpperCase()}`);
      if (loginResult.childProcess) loginResult.childProcess.kill();
      await prompts.waitForEnter();
      return false;
    }
    
    spinner.succeed('AUTHENTICATION SUCCESSFUL!');
    
    // Wait for CLIProxyAPI to process the token
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log(chalk.gray('  AFTER AUTHENTICATING, PRESS ENTER TO CONTINUE...'));
    await prompts.waitForEnter();
  }
  
  // Kill the login child process if still running
  if (loginResult.childProcess) {
    try { loginResult.childProcess.kill(); } catch (e) { /* ignore */ }
  }
  
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
        console.log(chalk.green(`\n  ✓ ${provider.name.toUpperCase()} CONNECTED VIA PAID PLAN`));
        console.log(chalk.cyan(`    MODEL: ${selectedModel.name.toUpperCase()}`));
      }
    }
  } else {
    // No models but auth might have worked
    activateProvider(config, provider.id, {
      connectionType: 'cliproxy',
      modelId: null,
      modelName: 'AUTO'
    });
    if (saveConfig(config)) {
      console.log(chalk.green(`\n  ✓ ${provider.name.toUpperCase()} CONNECTED VIA PAID PLAN`));
    }
  }
  
  await prompts.waitForEnter();
  return true;
};

/** Handle API Key connection */
const handleApiKeyConnection = async (provider, config) => {
  clearWithBanner();
  console.log(chalk.yellow(`\n  ENTER YOUR ${provider.name.toUpperCase()} API KEY:`));
  console.log(chalk.gray('  (PRESS ENTER TO CANCEL)\n'));
  
  const apiKey = await prompts.textInput(chalk.cyan('  API KEY: '), true);
  
  if (!apiKey || apiKey.trim() === '') {
    console.log(chalk.gray('  CANCELLED'));
    await prompts.waitForEnter();
    return false;
  }
  
  if (apiKey.length < 20) {
    console.log(chalk.red('  INVALID API KEY FORMAT (TOO SHORT)'));
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
    console.log(chalk.green(`\n  ✓ ${provider.name.toUpperCase()} CONNECTED VIA API KEY`));
    console.log(chalk.cyan(`    MODEL: ${selectedModel.name.toUpperCase()}`));
  } else {
    console.log(chalk.red('\n  FAILED TO SAVE CONFIG'));
  }
  await prompts.waitForEnter();
  return true;
};

/** Handle provider configuration */
const handleProviderConfig = async (provider, config) => {
  const boxWidth = getLogoWidth();
  
  while (true) {
    clearWithBanner();
    drawProviderWindow(provider, config, boxWidth);
    
    const input = await prompts.textInput(chalk.cyan('SELECT OPTION: '));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') break;
    
    if (choice === 'd' && config.providers[provider.id]) {
      config.providers[provider.id].active = false;
      saveConfig(config);
      console.log(chalk.yellow(`\n  ${provider.name.toUpperCase()} DISCONNECTED`));
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
  clearWithBanner();
  console.log(chalk.yellow('\n  CLIPROXYAPI STATUS\n'));
  
  const installed = cliproxy.isInstalled();
  console.log(chalk.gray('  INSTALLED: ') + (installed ? chalk.green('YES') : chalk.red('NO')));
  
  if (installed) {
    const status = await cliproxy.isRunning();
    console.log(chalk.gray('  RUNNING: ') + (status.running ? chalk.green('YES') : chalk.red('NO')));
    console.log(chalk.gray('  VERSION: ') + chalk.cyan(cliproxy.CLIPROXY_VERSION));
    console.log(chalk.gray('  PORT: ') + chalk.cyan(cliproxy.DEFAULT_PORT));
    console.log(chalk.gray('  INSTALL DIR: ') + chalk.cyan(cliproxy.INSTALL_DIR));
  }
  
  console.log();
  await prompts.waitForEnter();
};

/** Main AI Agents menu */
const aiAgentsMenu = async () => {
  let config = loadConfig();
  const boxWidth = getLogoWidth();
  
  while (true) {
    clearWithBanner();
    const status = await cliproxy.isRunning();
    const statusText = status.running ? `LOCALHOST:${cliproxy.DEFAULT_PORT}` : 'NOT RUNNING';
    drawProvidersTable(AI_PROVIDERS, config, boxWidth, statusText);
    
    const input = await prompts.textInput(chalk.cyan('SELECT (1-8/S/B): '));
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
    
    console.log(chalk.red('  INVALID OPTION'));
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
