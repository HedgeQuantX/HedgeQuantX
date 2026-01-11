/** AI Agents Configuration Page - HQX Connector (OAuth) + API Key */

const chalk = require('chalk');
const os = require('os');
const path = require('path');
const fs = require('fs');
const ora = require('ora');

const { getLogoWidth, displayBanner } = require('../ui');
const { prompts } = require('../utils');
const { fetchModelsFromApi } = require('./ai-models');
const { drawProvidersTable, drawModelsTable, drawProviderWindow, drawConnectionTest } = require('./ai-agents-ui');
const cliproxy = require('../services/cliproxy');

/** Clear screen and show banner (always closed) */
const clearWithBanner = () => {
  console.clear();
  displayBanner();  // Banner always closed
};

// Config file path
const CONFIG_DIR = path.join(os.homedir(), '.hqx');
const CONFIG_FILE = path.join(CONFIG_DIR, 'ai-config.json');

// AI Providers list with OAuth (paid plan) and API Key support
// HQX Connector (port 8317): OAuth for Anthropic, OpenAI, Google, Qwen, iFlow
// Direct API Key: For MiniMax, DeepSeek, Mistral, xAI, OpenRouter
const AI_PROVIDERS = [
  // OAuth + API Key supported (can use paid plan OR API key)
  { id: 'anthropic', name: 'Anthropic (Claude)', color: 'magenta', supportsOAuth: true, supportsApiKey: true },
  { id: 'openai', name: 'OpenAI (GPT)', color: 'green', supportsOAuth: true, supportsApiKey: true },
  { id: 'google', name: 'Google (Gemini)', color: 'blue', supportsOAuth: true, supportsApiKey: true },
  { id: 'qwen', name: 'Qwen', color: 'cyan', supportsOAuth: true, supportsApiKey: true },
  { id: 'iflow', name: 'iFlow (DeepSeek/GLM)', color: 'yellow', supportsOAuth: true, supportsApiKey: true },
  // API Key only (no OAuth - uses LLM Proxy via LiteLLM)
  { id: 'minimax', name: 'MiniMax', color: 'magenta', supportsOAuth: false, supportsApiKey: true },
  { id: 'deepseek', name: 'DeepSeek', color: 'blue', supportsOAuth: false, supportsApiKey: true },
  { id: 'mistral', name: 'Mistral AI', color: 'yellow', supportsOAuth: false, supportsApiKey: true },
  { id: 'xai', name: 'xAI (Grok)', color: 'white', supportsOAuth: false, supportsApiKey: true },
  { id: 'openrouter', name: 'OpenRouter', color: 'gray', supportsOAuth: false, supportsApiKey: true },
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

/** Activate a provider (multiple providers can be active at the same time) */
const activateProvider = (config, providerId, data) => {
  if (!config.providers[providerId]) config.providers[providerId] = {};
  Object.assign(config.providers[providerId], data, { active: true, configuredAt: new Date().toISOString() });
};

/** Wait for child process to exit */
const waitForProcessExit = (cp, timeoutMs = 15000, intervalMs = 500) => new Promise((resolve) => {
  if (!cp) return resolve();
  let elapsed = 0;
  const check = setInterval(() => {
    elapsed += intervalMs;
    if (cp.exitCode !== null || cp.killed || elapsed >= timeoutMs) {
      clearInterval(check);
      if (elapsed >= timeoutMs) try { cp.kill(); } catch (e) {}
      resolve();
    }
  }, intervalMs);
});

/** Handle HQX Connector connection (with auto-install) */
const handleCliProxyConnection = async (provider, config, boxWidth) => {
  console.log();
  // Check/install HQX Connector
  if (!cliproxy.isInstalled()) {
    console.log(chalk.yellow('  HQX CONNECTOR NOT INSTALLED. INSTALLING...'));
    const spinner = ora({ text: 'DOWNLOADING...', color: 'yellow' }).start();
    const installResult = await cliproxy.install((msg, percent) => { spinner.text = `${msg.toUpperCase()} ${percent}%`; });
    if (!installResult.success) { spinner.fail(`INSTALL FAILED: ${installResult.error}`); await prompts.waitForEnter(); return false; }
    spinner.succeed('HQX CONNECTOR INSTALLED');
  }
  // Check/start HQX Connector
  let status = await cliproxy.isRunning();
  if (!status.running) {
    const spinner = ora({ text: 'STARTING HQX CONNECTOR...', color: 'yellow' }).start();
    const startResult = await cliproxy.start();
    if (!startResult.success) { spinner.fail(`START FAILED: ${startResult.error}`); await prompts.waitForEnter(); return false; }
    spinner.succeed('HQX CONNECTOR STARTED');
  } else {
    const cfgPath = path.join(os.homedir(), '.hqx', 'cliproxy', 'config.yaml');
    if (!fs.existsSync(cfgPath)) {
      console.log(chalk.yellow('  RESTARTING HQX CONNECTOR...'));
      await cliproxy.stop();
      const res = await cliproxy.start();
      if (!res.success) { console.log(chalk.red(`  RESTART FAILED: ${res.error}`)); await prompts.waitForEnter(); return false; }
      console.log(chalk.green('  ✓ RESTARTED'));
    } else console.log(chalk.green('  ✓ HQX CONNECTOR RUNNING'));
  }
  
  // First, check if models are already available (existing auth)
  console.log(chalk.gray(`  CHECKING EXISTING AUTHENTICATION...`));
  
  const existingModels = await cliproxy.fetchProviderModels(provider.id);
  
  
  if (existingModels.success && existingModels.models.length > 0) {
    // Models already available - skip OAuth, go directly to model selection
    console.log(chalk.green(`  ✓ ALREADY AUTHENTICATED`));
    const selectedModel = await selectModelFromList(provider, existingModels.models, boxWidth);
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
  
  // Check if provider supports OAuth
  const oauthProviders = ['anthropic', 'openai', 'google', 'qwen'];
  if (!oauthProviders.includes(provider.id)) {
    console.log(chalk.red(`  NO MODELS AVAILABLE FOR ${provider.name.toUpperCase()}`));
    console.log(chalk.gray('  THIS PROVIDER MAY REQUIRE API KEY CONNECTION.'));
    await prompts.waitForEnter();
    return false;
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
  
  // Get callback port for this provider
  const callbackPort = cliproxy.getCallbackPort(provider.id);
  const isPollingAuth = (provider.id === 'qwen'); // Qwen uses polling, not callback
  
  // Different flow for VPS/headless vs local
  if (loginResult.isHeadless) {
    console.log(chalk.magenta('  ══════════════════════════════════════════════════════════'));
    console.log(chalk.magenta('  VPS/SSH DETECTED - MANUAL CALLBACK REQUIRED'));
    console.log(chalk.magenta('  ══════════════════════════════════════════════════════════\n'));
    
    if (isPollingAuth) {
      // Qwen uses polling - just wait for user to authorize
      console.log(chalk.white('  1. OPEN THE URL ABOVE IN YOUR BROWSER'));
      console.log(chalk.white('  2. AUTHORIZE THE APPLICATION'));
      console.log(chalk.white('  3. WAIT FOR AUTHENTICATION TO COMPLETE'));
      console.log(chalk.white('  4. PRESS ENTER WHEN DONE\n'));
      await prompts.waitForEnter();
      
      const spinner = ora({ text: 'WAITING FOR AUTHENTICATION...', color: 'yellow' }).start();
      await waitForProcessExit(loginResult.childProcess, 90000, 1000);
      spinner.succeed('AUTHENTICATION COMPLETED!');
    } else {
      // Standard OAuth with callback
      console.log(chalk.white('  1. OPEN THE URL ABOVE IN YOUR LOCAL BROWSER'));
      console.log(chalk.white('  2. AUTHORIZE THE APPLICATION'));
      console.log(chalk.white('  3. YOU WILL SEE A BLANK PAGE - THIS IS NORMAL'));
      console.log(chalk.white('  4. COPY THE FULL URL FROM YOUR BROWSER ADDRESS BAR'));
      console.log(chalk.white(`     (IT STARTS WITH: http://localhost:${callbackPort}/...)`));
      console.log(chalk.white('  5. PASTE IT BELOW:\n'));
      
      const callbackUrl = await prompts.textInput(chalk.cyan('  CALLBACK URL: '));
      
      if (!callbackUrl || !callbackUrl.includes('localhost')) {
        console.log(chalk.red('\n  INVALID CALLBACK URL'));
        if (loginResult.childProcess) loginResult.childProcess.kill();
        await prompts.waitForEnter();
        return false;
      }
      
      // Process the callback - send to the login process
      const spinner = ora({ text: 'PROCESSING CALLBACK...', color: 'yellow' }).start();
      
      try {
        const callbackResult = await cliproxy.processCallback(callbackUrl.trim(), provider.id);
        
        if (!callbackResult.success) {
          spinner.fail(`CALLBACK FAILED: ${callbackResult.error}`);
          if (loginResult.childProcess) loginResult.childProcess.kill();
          await prompts.waitForEnter();
          return false;
        }
        
        spinner.text = 'EXCHANGING TOKEN...';
        await waitForProcessExit(loginResult.childProcess);
        spinner.succeed('AUTHENTICATION SUCCESSFUL!');
      } catch (err) {
        spinner.fail(`ERROR: ${err.message}`);
        if (loginResult.childProcess) loginResult.childProcess.kill();
        await prompts.waitForEnter();
        return false;
      }
    }
    
  } else {
    // Local machine - browser opens automatically, wait for user to auth
    console.log(chalk.gray('  AFTER AUTHENTICATING IN YOUR BROWSER, PRESS ENTER...'));
    await prompts.waitForEnter();
    
    const spinner = ora({ text: 'SAVING AUTHENTICATION...', color: 'yellow' }).start();
    await waitForProcessExit(loginResult.childProcess);
    spinner.succeed('AUTHENTICATION SAVED');
  }
  
  // Small delay for CLIProxy to detect new auth file
  const spinner = ora({ text: 'LOADING MODELS...', color: 'yellow' }).start();
  await new Promise(r => setTimeout(r, 2000));
  
  // Fetch models from CLIProxy API
  const modelsResult = await cliproxy.fetchProviderModels(provider.id);
  spinner.stop();
  
  if (modelsResult.success && modelsResult.models.length > 0) {
    const selectedModel = await selectModelFromList(provider, modelsResult.models, boxWidth);
    if (selectedModel) {
      activateProvider(config, provider.id, {
        connectionType: 'cliproxy',
        modelId: selectedModel.id,
        modelName: selectedModel.name
      });
      saveConfig(config);
      console.log(chalk.green(`\n  ✓ ${provider.name.toUpperCase()} CONNECTED`));
      console.log(chalk.cyan(`    MODEL: ${selectedModel.name.toUpperCase()}`));
      await prompts.waitForEnter();
      return true;
    }
    // User pressed B to go back - still save as connected but no model selected yet
    return true;
  }
  
  // No models found - show error
  console.log(chalk.red('\n  NO MODELS AVAILABLE'));
  console.log(chalk.gray('  TRY RECONNECTING OR USE API KEY'));
  await prompts.waitForEnter();
  return false;
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
  
  // Check provider capabilities
  const supportsOAuth = provider.supportsOAuth !== false;
  const supportsApiKey = provider.supportsApiKey !== false;
  
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
      if (supportsOAuth && supportsApiKey) {
        // Both supported: [1] = OAuth via CLIProxy
        await handleCliProxyConnection(provider, config, boxWidth);
      } else if (supportsApiKey) {
        // API Key only: [1] = API Key via LLM Proxy
        await handleApiKeyConnection(provider, config);
      } else if (supportsOAuth) {
        // OAuth only: [1] = OAuth via CLIProxy
        await handleCliProxyConnection(provider, config, boxWidth);
      }
      continue;
    }
    
    if (choice === '2' && supportsOAuth && supportsApiKey) {
      // Only available when both are supported: [2] = API Key
      await handleApiKeyConnection(provider, config);
      continue;
    }
  }
  
  return config;
};

/** Get active AI provider config (legacy - single provider) */
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
        modelName: pc.modelName || null,
        weight: pc.weight || 100
      };
    }
  }
  return null;
};

/** Get ALL active AI agents for multi-agent supervision */
const getActiveAgents = () => {
  const config = loadConfig();
  const agents = [];
  
  for (const provider of AI_PROVIDERS) {
    const pc = config.providers[provider.id];
    if (pc && pc.active) {
      agents.push({
        id: `agent-${provider.id}`,
        provider: provider.id,
        name: provider.name,
        connectionType: pc.connectionType,
        apiKey: pc.apiKey || null,
        modelId: pc.modelId || null,
        modelName: pc.modelName || null,
        weight: pc.weight || Math.floor(100 / AI_PROVIDERS.filter(p => config.providers[p.id]?.active).length),
        active: true
      });
    }
  }
  
  return agents;
};

/** Get supervision config for SupervisionEngine */
const getSupervisionConfig = () => {
  const agents = getActiveAgents();
  return {
    supervisionEnabled: agents.length > 0,
    agents,
    minAgents: 1,
    timeout: 30000
  };
};

/** Count active AI agents */
const getActiveAgentCount = () => getActiveAgents().length;

/** Main AI Agents menu */
const aiAgentsMenu = async () => {
  let config = loadConfig();
  const boxWidth = getLogoWidth();
  
  while (true) {
    clearWithBanner();
    const agentCount = getActiveAgentCount();
    drawProvidersTable(AI_PROVIDERS, config, boxWidth, agentCount > 0);
    console.log();
    
    const promptText = agentCount > 0 ? 'SELECT (1-8/T/B): ' : 'SELECT (1-8/B): ';
    const input = await prompts.textInput(chalk.cyan(promptText));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') break;
    
    if (choice === 't' && agentCount > 0) {
      const agents = getActiveAgents();
      await drawConnectionTest(agents, boxWidth, clearWithBanner);
      await prompts.waitForEnter();
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
  getActiveAgents,
  getSupervisionConfig,
  getActiveAgentCount,
  loadConfig,
  saveConfig,
  AI_PROVIDERS
};
