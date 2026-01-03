/**
 * AI Agent Menu
 * Configure multiple AI provider connections
 */

const chalk = require('chalk');
const ora = require('ora');

const { getLogoWidth, drawBoxHeader, drawBoxHeaderContinue, drawBoxFooter, displayBanner } = require('../ui');
const { prompts } = require('../utils');
const aiService = require('../services/ai');
const { getCategories, getProvidersByCategory } = require('../services/ai/providers');
const tokenScanner = require('../services/ai/token-scanner');
const oauthAnthropic = require('../services/ai/oauth-anthropic');

/**
 * Main AI Agent menu
 */
const aiAgentMenu = async () => {
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
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('AI AGENTS', boxWidth);
  
  // Get all connected agents
  const agents = aiService.getAgents();
  const agentCount = agents.length;
  
  if (agentCount === 0) {
    console.log(makeLine(chalk.gray('STATUS: NO AGENTS CONNECTED'), 'left'));
  } else {
    console.log(makeLine(chalk.green(`STATUS: ${agentCount} AGENT${agentCount > 1 ? 'S' : ''} CONNECTED`), 'left'));
    console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
    
    // List all agents
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      // Show ACTIVE marker (if single agent, it's always active)
      const isActive = agent.isActive || agents.length === 1;
      const activeMarker = isActive ? chalk.green(' [ACTIVE]') : '';
      const providerColor = agent.providerId === 'anthropic' ? chalk.magenta :
                           agent.providerId === 'openai' ? chalk.green :
                           agent.providerId === 'openrouter' ? chalk.yellow : chalk.cyan;
      
      console.log(makeLine(
        chalk.white(`[${i + 1}] `) + 
        providerColor(agent.name) + 
        activeMarker + 
        chalk.gray(` - ${agent.model}`)
      ));
    }
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Menu in 2 columns
  const colWidth = Math.floor(W / 2);
  
  const menuRow2 = (col1, col2 = '') => {
    const c1Plain = col1.replace(/\x1b\[[0-9;]*m/g, '');
    const c2Plain = col2.replace(/\x1b\[[0-9;]*m/g, '');
    
    const pad1Left = Math.floor((colWidth - c1Plain.length) / 2);
    const pad1Right = colWidth - c1Plain.length - pad1Left;
    
    const col2Width = W - colWidth;
    const pad2Left = Math.floor((col2Width - c2Plain.length) / 2);
    const pad2Right = col2Width - c2Plain.length - pad2Left;
    
    const line = 
      ' '.repeat(pad1Left) + col1 + ' '.repeat(pad1Right) +
      ' '.repeat(pad2Left) + col2 + ' '.repeat(pad2Right);
    
    console.log(chalk.cyan('║') + line + chalk.cyan('║'));
  };
  
  const menuItem = (key, label, color) => {
    const text = `[${key}] ${label.padEnd(14)}`;
    return color(text);
  };
  
  // Menu options in 2 columns
  if (agentCount > 0) {
    if (agentCount > 1) {
      menuRow2(menuItem('+', 'ADD AGENT', chalk.green), menuItem('S', 'SET ACTIVE', chalk.cyan));
      menuRow2(menuItem('M', 'CHANGE MODEL', chalk.yellow), menuItem('R', 'REMOVE AGENT', chalk.red));
      menuRow2(menuItem('X', 'REMOVE ALL', chalk.red), menuItem('<', 'BACK', chalk.gray));
    } else {
      menuRow2(menuItem('+', 'ADD AGENT', chalk.green), menuItem('M', 'CHANGE MODEL', chalk.yellow));
      menuRow2(menuItem('R', 'REMOVE AGENT', chalk.red), menuItem('<', 'BACK', chalk.gray));
    }
  } else {
    menuRow2(menuItem('+', 'ADD AGENT', chalk.green), menuItem('<', 'BACK', chalk.gray));
  }
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT:'));
  const input = (choice || '').toLowerCase();
  
  // Handle number input (select agent for details)
  const num = parseInt(choice);
  if (!isNaN(num) && num >= 1 && num <= agentCount) {
    return await showAgentDetails(agents[num - 1]);
  }
  
  switch (input) {
    case '+':
      return await showExistingTokens();
    case 's':
      if (agentCount > 1) {
        return await selectActiveAgent();
      }
      return await aiAgentMenu();
    case 'm':
      if (agentCount > 0) {
        return await selectAgentForModelChange();
      }
      return await aiAgentMenu();
    case 'r':
      if (agentCount > 0) {
        return await selectAgentToRemove();
      }
      return await aiAgentMenu();
    case 'x':
      if (agentCount > 1) {
        aiService.disconnectAll();
        console.log(chalk.yellow('\n  ALL AGENTS REMOVED'));
        await prompts.waitForEnter();
      }
      return await aiAgentMenu();
    case '<':
    case 'b':
      return;
    default:
      return await aiAgentMenu();
  }
};

/**
 * Show agent details
 */
const showAgentDetails = async (agent) => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('AGENT DETAILS', boxWidth);
  
  const providerColor = agent.providerId === 'anthropic' ? chalk.magenta :
                       agent.providerId === 'openai' ? chalk.green :
                       agent.providerId === 'openrouter' ? chalk.yellow : chalk.cyan;
  
  console.log(makeLine(chalk.white('NAME: ') + providerColor(agent.name)));
  console.log(makeLine(chalk.white('PROVIDER: ') + chalk.gray(agent.provider?.name || agent.providerId)));
  console.log(makeLine(chalk.white('MODEL: ') + chalk.gray(agent.model)));
  console.log(makeLine(chalk.white('STATUS: ') + (agent.isActive ? chalk.green('ACTIVE') : chalk.gray('STANDBY'))));
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  if (!agent.isActive) {
    console.log(makeLine(chalk.cyan('[A] SET AS ACTIVE')));
  }
  console.log(makeLine(chalk.yellow('[M] CHANGE MODEL')));
  console.log(makeLine(chalk.red('[R] REMOVE')));
  console.log(makeLine(chalk.gray('[<] BACK')));
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT:'));
  
  switch ((choice || '').toLowerCase()) {
    case 'a':
      if (!agent.isActive) {
        aiService.setActiveAgent(agent.id);
        console.log(chalk.green(`\n  ${agent.name} IS NOW ACTIVE`));
        await prompts.waitForEnter();
      }
      return await aiAgentMenu();
    case 'm':
      return await selectModel(agent);
    case 'r':
      aiService.removeAgent(agent.id);
      console.log(chalk.yellow(`\n  ${agent.name} REMOVED`));
      await prompts.waitForEnter();
      return await aiAgentMenu();
    case '<':
    case 'b':
      return await aiAgentMenu();
    default:
      return await aiAgentMenu();
  }
};

/**
 * Select active agent
 */
const selectActiveAgent = async () => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('SET ACTIVE AGENT', boxWidth);
  
  const agents = aiService.getAgents();
  
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const activeMarker = agent.isActive ? chalk.yellow(' (CURRENT)') : '';
    const providerColor = agent.providerId === 'anthropic' ? chalk.magenta :
                         agent.providerId === 'openai' ? chalk.green : chalk.cyan;
    
    console.log(makeLine(
      chalk.white(`[${i + 1}] `) + providerColor(agent.name) + activeMarker
    ));
  }
  
  console.log(makeLine(''));
  console.log(makeLine(chalk.gray('[<] BACK')));
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT AGENT:'));
  
  if (choice === '<' || choice?.toLowerCase() === 'b') {
    return await aiAgentMenu();
  }
  
  const index = parseInt(choice) - 1;
  if (isNaN(index) || index < 0 || index >= agents.length) {
    return await aiAgentMenu();
  }
  
  aiService.setActiveAgent(agents[index].id);
  console.log(chalk.green(`\n  ${agents[index].name} IS NOW ACTIVE`));
  await prompts.waitForEnter();
  return await aiAgentMenu();
};

/**
 * Select agent to change model
 */
const selectAgentForModelChange = async () => {
  const agents = aiService.getAgents();
  
  if (agents.length === 1) {
    return await selectModel(agents[0]);
  }
  
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('SELECT AGENT TO CHANGE MODEL', boxWidth);
  
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    console.log(makeLine(
      chalk.white(`[${i + 1}] `) + chalk.cyan(agent.name) + chalk.gray(` - ${agent.model}`)
    ));
  }
  
  console.log(makeLine(''));
  console.log(makeLine(chalk.gray('[<] BACK')));
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT AGENT:'));
  
  if (choice === '<' || choice?.toLowerCase() === 'b') {
    return await aiAgentMenu();
  }
  
  const index = parseInt(choice) - 1;
  if (isNaN(index) || index < 0 || index >= agents.length) {
    return await aiAgentMenu();
  }
  
  return await selectModel(agents[index]);
};

/**
 * Select agent to remove
 */
const selectAgentToRemove = async () => {
  const agents = aiService.getAgents();
  
  if (agents.length === 1) {
    aiService.removeAgent(agents[0].id);
    console.log(chalk.yellow(`\n  ${agents[0].name} REMOVED`));
    await prompts.waitForEnter();
    return await aiAgentMenu();
  }
  
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('SELECT AGENT TO REMOVE', boxWidth);
  
  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    console.log(makeLine(
      chalk.white(`[${i + 1}] `) + chalk.red(agent.name)
    ));
  }
  
  console.log(makeLine(''));
  console.log(makeLine(chalk.gray('[<] BACK')));
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT AGENT TO REMOVE:'));
  
  if (choice === '<' || choice?.toLowerCase() === 'b') {
    return await aiAgentMenu();
  }
  
  const index = parseInt(choice) - 1;
  if (isNaN(index) || index < 0 || index >= agents.length) {
    return await aiAgentMenu();
  }
  
  aiService.removeAgent(agents[index].id);
  console.log(chalk.yellow(`\n  ${agents[index].name} REMOVED`));
  await prompts.waitForEnter();
  return await aiAgentMenu();
};

// Cache for scanned tokens (avoid multiple Keychain prompts)
let cachedTokens = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute cache

/**
 * Show existing tokens found on the system
 */
const showExistingTokens = async () => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  // Check cache first
  const now = Date.now();
  let tokens;
  
  if (cachedTokens && (now - cacheTimestamp) < CACHE_TTL) {
    tokens = cachedTokens;
  } else {
    console.clear();
    displayBanner();
    drawBoxHeaderContinue('SCANNING FOR EXISTING SESSIONS...', boxWidth);
    console.log(makeLine(''));
    console.log(makeLine(chalk.gray('CHECKING VS CODE, CURSOR, CLAUDE CLI, OPENCODE...')));
    console.log(makeLine(''));
    drawBoxFooter(boxWidth);
    
    // Scan for tokens and cache
    tokens = tokenScanner.scanAllSources();
    cachedTokens = tokens;
    cacheTimestamp = now;
  }
  
  if (tokens.length === 0) {
    // No tokens found, go directly to category selection
    return await selectCategory();
  }
  
  // Show found tokens
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('EXISTING SESSIONS FOUND', boxWidth);
  
  console.log(makeLine(chalk.green(`FOUND ${tokens.length} EXISTING SESSION(S)`)));
  console.log(makeLine(''));
  
  const formatted = tokenScanner.formatResults(tokens);
  
  for (const t of formatted) {
    const providerColor = t.provider.includes('CLAUDE') ? chalk.magenta : 
                          t.provider.includes('OPENAI') ? chalk.green :
                          t.provider.includes('OPENROUTER') ? chalk.yellow : chalk.cyan;
    
    console.log(makeLine(
      chalk.white(`[${t.index}] `) + 
      providerColor(t.provider) + 
      chalk.gray(` (${t.type})`)
    ));
    console.log(makeLine(
      chalk.gray(`    ${t.icon} ${t.source} - ${t.lastUsed}`)
    ));
    console.log(makeLine(
      chalk.gray(`    TOKEN: ${t.tokenPreview}`)
    ));
    console.log(makeLine(''));
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  console.log(makeLine(chalk.cyan('[N] CONNECT NEW PROVIDER')));
  console.log(makeLine(chalk.gray('[<] BACK')));
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT (1-' + tokens.length + '/N/<):'));
  
  if (choice === '<' || choice?.toLowerCase() === 'b') {
    return await aiAgentMenu();
  }
  
  if (choice?.toLowerCase() === 'n') {
    return await selectCategory();
  }
  
  const index = parseInt(choice) - 1;
  if (isNaN(index) || index < 0 || index >= tokens.length) {
    return await showExistingTokens();
  }
  
  // Use selected token
  const selectedToken = tokens[index];
  
  const spinner = ora({ text: 'VALIDATING TOKEN...', color: 'cyan' }).start();
  
  try {
    // Validate the token - include metadata from scanner
    const credentials = { 
      apiKey: selectedToken.token,
      sessionKey: selectedToken.token,
      accessToken: selectedToken.token,
      fromKeychain: selectedToken.sourceId === 'secureStorage' || selectedToken.sourceId === 'keychain',
      subscriptionType: selectedToken.subscriptionType,
      refreshToken: selectedToken.refreshToken,
      expiresAt: selectedToken.expiresAt
    };
    const validation = await aiService.validateConnection(selectedToken.provider, selectedToken.type, credentials);
    
    if (!validation.valid) {
      spinner.fail(`TOKEN INVALID OR EXPIRED: ${validation.error}`);
      await prompts.waitForEnter();
      return await showExistingTokens();
    }
    
    // Get provider info
    const { getProvider } = require('../services/ai/providers');
    const provider = getProvider(selectedToken.provider);
    
    if (!provider) {
      spinner.fail('PROVIDER NOT SUPPORTED');
      await prompts.waitForEnter();
      return await showExistingTokens();
    }
    
    spinner.text = 'FETCHING AVAILABLE MODELS...';
    
    // Fetch models from API with the token
    const { fetchAnthropicModels, fetchOpenAIModels } = require('../services/ai/client');
    
    let models = null;
    if (selectedToken.provider === 'anthropic') {
      models = await fetchAnthropicModels(credentials.apiKey);
    } else {
      models = await fetchOpenAIModels(provider.endpoint, credentials.apiKey);
    }
    
    if (!models || models.length === 0) {
      spinner.fail('COULD NOT FETCH MODELS FROM API');
      await prompts.waitForEnter();
      return await showExistingTokens();
    }
    
    spinner.succeed(`FOUND ${models.length} MODELS`);
    
    // Let user select model
    const selectedModel = await selectModelFromList(models, provider.name);
    if (!selectedModel) {
      return await showExistingTokens();
    }
    
    // Add agent with selected model
    const agentName = `${provider.name} (${selectedToken.source})`;
    await aiService.addAgent(selectedToken.provider, 'api_key', credentials, selectedModel, agentName);
    
    console.log(chalk.green(`\n  AGENT ADDED: ${provider.name}`));
    console.log(chalk.gray(`  SOURCE: ${selectedToken.source}`));
    console.log(chalk.gray(`  MODEL: ${selectedModel}`));
    
    await prompts.waitForEnter();
    return await aiAgentMenu();
    
  } catch (error) {
    spinner.fail(`CONNECTION FAILED: ${error.message}`);
    await prompts.waitForEnter();
    return await showExistingTokens();
  }
};

/**
 * Select provider category
 */
const selectCategory = async () => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  const col1Width = Math.floor(W / 2);
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  const make2ColRow = (left, right) => {
    const leftPlain = left.replace(/\x1b\[[0-9;]*m/g, '').length;
    const rightPlain = right.replace(/\x1b\[[0-9;]*m/g, '').length;
    const leftPadded = ' ' + left + ' '.repeat(Math.max(0, col1Width - leftPlain - 1));
    const rightPadded = right + ' '.repeat(Math.max(0, W - col1Width - rightPlain));
    return chalk.cyan('║') + leftPadded + rightPadded + chalk.cyan('║');
  };
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('SELECT PROVIDER TYPE', boxWidth);
  
  const categories = getCategories();
  
  // Display in 2 columns
  console.log(make2ColRow(
    chalk.green('[1] UNIFIED (RECOMMENDED)'),
    chalk.cyan('[2] DIRECT PROVIDERS')
  ));
  console.log(make2ColRow(
    chalk.gray('    1 API = 100+ models'),
    chalk.gray('    Connect to each provider')
  ));
  console.log(makeLine(''));
  console.log(make2ColRow(
    chalk.yellow('[3] LOCAL (FREE)'),
    chalk.gray('[4] CUSTOM')
  ));
  console.log(make2ColRow(
    chalk.gray('    Run on your machine'),
    chalk.gray('    Self-hosted solutions')
  ));
  console.log(makeLine(''));
  console.log(makeLine(chalk.gray('[<] BACK')));
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT (1-4):'));
  
  if (choice === '<' || choice?.toLowerCase() === 'b') {
    return await aiAgentMenu();
  }
  
  const index = parseInt(choice) - 1;
  if (isNaN(index) || index < 0 || index >= categories.length) {
    return await aiAgentMenu();
  }
  
  const selectedCategory = categories[index];
  return await selectProvider(selectedCategory.id);
};

/**
 * Select AI provider from category
 */
const selectProvider = async (categoryId) => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  const col1Width = Math.floor(W / 2);
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  const make2ColRow = (left, right) => {
    const leftPlain = left.replace(/\x1b\[[0-9;]*m/g, '').length;
    const rightPlain = right.replace(/\x1b\[[0-9;]*m/g, '').length;
    const leftPadded = ' ' + left + ' '.repeat(Math.max(0, col1Width - leftPlain - 1));
    const rightPadded = right + ' '.repeat(Math.max(0, W - col1Width - rightPlain));
    return chalk.cyan('║') + leftPadded + rightPadded + chalk.cyan('║');
  };
  
  console.clear();
  displayBanner();
  
  const categories = getCategories();
  const category = categories.find(c => c.id === categoryId);
  drawBoxHeaderContinue(category.name, boxWidth);
  
  const providers = getProvidersByCategory(categoryId);
  
  if (providers.length === 0) {
    console.log(makeLine(chalk.gray('NO PROVIDERS IN THIS CATEGORY')));
    drawBoxFooter(boxWidth);
    await prompts.waitForEnter();
    return await selectCategory();
  }
  
  // Display providers in 2 columns
  for (let i = 0; i < providers.length; i += 2) {
    const left = providers[i];
    const right = providers[i + 1];
    
    // Provider names
    const leftName = `[${i + 1}] ${left.name}`;
    const rightName = right ? `[${i + 2}] ${right.name}` : '';
    
    console.log(make2ColRow(
      chalk.cyan(leftName.length > col1Width - 3 ? leftName.substring(0, col1Width - 6) + '...' : leftName),
      right ? chalk.cyan(rightName.length > col1Width - 3 ? rightName.substring(0, col1Width - 6) + '...' : rightName) : ''
    ));
    
    // Descriptions (truncated)
    const leftDesc = '    ' + left.description;
    const rightDesc = right ? '    ' + right.description : '';
    
    console.log(make2ColRow(
      chalk.gray(leftDesc.length > col1Width - 3 ? leftDesc.substring(0, col1Width - 6) + '...' : leftDesc),
      chalk.gray(rightDesc.length > col1Width - 3 ? rightDesc.substring(0, col1Width - 6) + '...' : rightDesc)
    ));
    
    console.log(makeLine(''));
  }
  
  console.log(makeLine(chalk.gray('[<] BACK')));
  
  drawBoxFooter(boxWidth);
  
  const maxNum = providers.length;
  const choice = await prompts.textInput(chalk.cyan(`SELECT (1-${maxNum}):`));
  
  if (choice === '<' || choice?.toLowerCase() === 'b') {
    return await selectCategory();
  }
  
  const index = parseInt(choice) - 1;
  if (isNaN(index) || index < 0 || index >= providers.length) {
    return await selectCategory();
  }
  
  const selectedProvider = providers[index];
  return await selectProviderOption(selectedProvider);
};

/**
 * Select connection option for provider
 */
const selectProviderOption = async (provider) => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  const col1Width = Math.floor(W / 2);
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  const make2ColRow = (left, right) => {
    const leftPlain = left.replace(/\x1b\[[0-9;]*m/g, '').length;
    const rightPlain = right.replace(/\x1b\[[0-9;]*m/g, '').length;
    const leftPadded = ' ' + left + ' '.repeat(Math.max(0, col1Width - leftPlain - 1));
    const rightPadded = right + ' '.repeat(Math.max(0, W - col1Width - rightPlain));
    return chalk.cyan('║') + leftPadded + rightPadded + chalk.cyan('║');
  };
  
  // If only one option, skip selection
  if (provider.options.length === 1) {
    return await setupConnection(provider, provider.options[0]);
  }
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue(provider.name, boxWidth);
  
  console.log(makeLine(chalk.white('SELECT CONNECTION METHOD:')));
  console.log(makeLine(''));
  
  // Display options in 2 columns
  for (let i = 0; i < provider.options.length; i += 2) {
    const left = provider.options[i];
    const right = provider.options[i + 1];
    
    // Option labels
    console.log(make2ColRow(
      chalk.cyan(`[${i + 1}] ${left.label}`),
      right ? chalk.cyan(`[${i + 2}] ${right.label}`) : ''
    ));
    
    // First description line
    const leftDesc1 = left.description[0] ? '    ' + left.description[0] : '';
    const rightDesc1 = right?.description[0] ? '    ' + right.description[0] : '';
    console.log(make2ColRow(
      chalk.gray(leftDesc1.length > col1Width - 2 ? leftDesc1.substring(0, col1Width - 5) + '...' : leftDesc1),
      chalk.gray(rightDesc1.length > col1Width - 2 ? rightDesc1.substring(0, col1Width - 5) + '...' : rightDesc1)
    ));
    
    // Second description line if exists
    const leftDesc2 = left.description[1] ? '    ' + left.description[1] : '';
    const rightDesc2 = right?.description[1] ? '    ' + right.description[1] : '';
    if (leftDesc2 || rightDesc2) {
      console.log(make2ColRow(
        chalk.gray(leftDesc2.length > col1Width - 2 ? leftDesc2.substring(0, col1Width - 5) + '...' : leftDesc2),
        chalk.gray(rightDesc2.length > col1Width - 2 ? rightDesc2.substring(0, col1Width - 5) + '...' : rightDesc2)
      ));
    }
    
    console.log(makeLine(''));
  }
  
  console.log(makeLine(chalk.gray('[<] BACK')));
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT:'));
  
  if (choice === '<' || choice?.toLowerCase() === 'b') {
    return await selectProvider(provider.category);
  }
  
  const index = parseInt(choice) - 1;
  if (isNaN(index) || index < 0 || index >= provider.options.length) {
    return await selectProvider(provider.category);
  }
  
  const selectedOption = provider.options[index];
  return await setupConnection(provider, selectedOption);
};

/**
 * Open URL in default browser
 */
const openBrowser = (url) => {
  const { exec } = require('child_process');
  const platform = process.platform;
  
  let cmd;
  if (platform === 'darwin') cmd = `open "${url}"`;
  else if (platform === 'win32') cmd = `start "" "${url}"`;
  else cmd = `xdg-open "${url}"`;
  
  exec(cmd, (err) => {
    if (err) console.log(chalk.gray('  Could not open browser automatically'));
  });
};

/**
 * Get instructions for each credential type
 */
const getCredentialInstructions = (provider, option, field) => {
  const instructions = {
    apiKey: {
      title: 'API KEY REQUIRED',
      steps: [
        '1. CLICK THE LINK BELOW TO OPEN IN BROWSER',
        '2. SIGN IN OR CREATE AN ACCOUNT',
        '3. GENERATE A NEW API KEY',
        '4. COPY AND PASTE IT HERE'
      ]
    },
    sessionKey: {
      title: 'SESSION KEY REQUIRED (SUBSCRIPTION PLAN)',
      steps: [
        '1. OPEN THE LINK BELOW IN YOUR BROWSER',
        '2. SIGN IN WITH YOUR SUBSCRIPTION ACCOUNT',
        '3. OPEN DEVELOPER TOOLS (F12 OR CMD+OPT+I)',
        '4. GO TO APPLICATION > COOKIES',
        '5. FIND "sessionKey" OR SIMILAR TOKEN',
        '6. COPY THE VALUE AND PASTE IT HERE'
      ]
    },
    accessToken: {
      title: 'ACCESS TOKEN REQUIRED (SUBSCRIPTION PLAN)',
      steps: [
        '1. OPEN THE LINK BELOW IN YOUR BROWSER',
        '2. SIGN IN WITH YOUR SUBSCRIPTION ACCOUNT',
        '3. OPEN DEVELOPER TOOLS (F12 OR CMD+OPT+I)',
        '4. GO TO APPLICATION > COOKIES OR LOCAL STORAGE',
        '5. FIND "accessToken" OR "token"',
        '6. COPY THE VALUE AND PASTE IT HERE'
      ]
    },
    endpoint: {
      title: 'ENDPOINT URL',
      steps: [
        '1. ENTER THE API ENDPOINT URL',
        '2. USUALLY http://localhost:PORT FOR LOCAL'
      ]
    },
    model: {
      title: 'MODEL NAME',
      steps: [
        '1. ENTER THE MODEL NAME TO USE',
        '2. CHECK PROVIDER DOCS FOR AVAILABLE MODELS'
      ]
    }
  };
  
  return instructions[field] || { title: field.toUpperCase(), steps: [] };
};

/**
 * Setup OAuth connection for Anthropic Claude Pro/Max
 */
const setupOAuthConnection = async (provider) => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('CLAUDE PRO/MAX LOGIN', boxWidth);
  
  console.log(makeLine(chalk.yellow('OAUTH AUTHENTICATION')));
  console.log(makeLine(''));
  console.log(makeLine(chalk.white('1. A BROWSER WINDOW WILL OPEN')));
  console.log(makeLine(chalk.white('2. LOGIN WITH YOUR CLAUDE ACCOUNT')));
  console.log(makeLine(chalk.white('3. COPY THE AUTHORIZATION CODE')));
  console.log(makeLine(chalk.white('4. PASTE IT HERE')));
  console.log(makeLine(''));
  console.log(makeLine(chalk.gray('OPENING BROWSER IN 3 SECONDS...')));
  
  drawBoxFooter(boxWidth);
  
  // Generate OAuth URL
  const { url, verifier } = oauthAnthropic.authorize('max');
  
  // Wait a moment then open browser
  await new Promise(resolve => setTimeout(resolve, 3000));
  openBrowser(url);
  
  // Redraw with code input
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('CLAUDE PRO/MAX LOGIN', boxWidth);
  
  console.log(makeLine(chalk.green('BROWSER OPENED')));
  console.log(makeLine(''));
  console.log(makeLine(chalk.white('AFTER LOGGING IN, YOU WILL SEE A CODE')));
  console.log(makeLine(chalk.white('COPY THE ENTIRE CODE AND PASTE IT BELOW')));
  console.log(makeLine(''));
  console.log(makeLine(chalk.gray('THE CODE LOOKS LIKE: abc123...#xyz789...')));
  console.log(makeLine(''));
  console.log(makeLine(chalk.gray('TYPE < TO CANCEL')));
  
  drawBoxFooter(boxWidth);
  console.log();
  
  const code = await prompts.textInput(chalk.cyan('PASTE AUTHORIZATION CODE:'));
  
  if (!code || code === '<') {
    return await selectProviderOption(provider);
  }
  
  // Exchange code for tokens
  const spinner = ora({ text: 'EXCHANGING CODE FOR TOKENS...', color: 'cyan' }).start();
  
  const result = await oauthAnthropic.exchange(code.trim(), verifier);
  
  if (result.type === 'failed') {
    spinner.fail(`AUTHENTICATION FAILED: ${result.error || 'Invalid code'}`);
    await prompts.waitForEnter();
    return await selectProviderOption(provider);
  }
  
  spinner.text = 'FETCHING AVAILABLE MODELS...';
  
  // Store OAuth credentials
  const credentials = {
    oauth: {
      access: result.access,
      refresh: result.refresh,
      expires: result.expires
    }
  };
  
  // Fetch models using OAuth token
  const { fetchAnthropicModelsOAuth } = require('../services/ai/client');
  const models = await fetchAnthropicModelsOAuth(result.access);
  
  if (!models || models.length === 0) {
    // Use default models if API doesn't return list
    spinner.warn('COULD NOT FETCH MODEL LIST, USING DEFAULTS');
  } else {
    spinner.succeed(`FOUND ${models.length} MODELS`);
  }
  
  // Let user select model
  const availableModels = models && models.length > 0 ? models : [
    'claude-sonnet-4-20250514',
    'claude-sonnet-4-5-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229'
  ];
  
  const selectedModel = await selectModelFromList(availableModels, 'CLAUDE PRO/MAX');
  if (!selectedModel) {
    return await selectProviderOption(provider);
  }
  
  // Add agent with OAuth credentials
  try {
    await aiService.addAgent('anthropic', 'oauth_max', credentials, selectedModel, 'Claude Pro/Max');
    
    console.log(chalk.green('\n  CONNECTED TO CLAUDE PRO/MAX'));
    console.log(chalk.gray(`  MODEL: ${selectedModel}`));
    console.log(chalk.gray('  UNLIMITED USAGE WITH YOUR SUBSCRIPTION'));
  } catch (error) {
    console.log(chalk.red(`\n  FAILED TO SAVE: ${error.message}`));
  }
  
  await prompts.waitForEnter();
  return await aiAgentMenu();
};

/**
 * Setup connection with credentials
 */
const setupConnection = async (provider, option) => {
  // Handle OAuth flow separately
  if (option.authType === 'oauth') {
    return await setupOAuthConnection(provider);
  }
  
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  // Collect credentials based on fields
  const credentials = {};
  
  for (const field of option.fields) {
    // Show instructions for this field
    console.clear();
    displayBanner();
    drawBoxHeaderContinue(`CONNECT TO ${provider.name}`, boxWidth);
    
    const instructions = getCredentialInstructions(provider, option, field);
    
    console.log(makeLine(chalk.yellow(instructions.title)));
    console.log(makeLine(''));
    
    // Show steps
    for (const step of instructions.steps) {
      console.log(makeLine(chalk.white(step)));
    }
    
    console.log(makeLine(''));
    
    // Show URL and open browser
    if (option.url && (field === 'apiKey' || field === 'sessionKey' || field === 'accessToken')) {
      console.log(makeLine(chalk.cyan('LINK: ') + chalk.green(option.url)));
      console.log(makeLine(''));
      console.log(makeLine(chalk.gray('OPENING BROWSER...')));
      openBrowser(option.url);
    }
    
    // Show default for endpoint
    if (field === 'endpoint' && option.defaultEndpoint) {
      console.log(makeLine(chalk.gray(`DEFAULT: ${option.defaultEndpoint}`)));
    }
    
    console.log(makeLine(''));
    console.log(makeLine(chalk.gray('TYPE < TO GO BACK')));
    
    drawBoxFooter(boxWidth);
    console.log();
    
    let value;
    
    switch (field) {
      case 'apiKey':
        value = await prompts.textInput(chalk.cyan('PASTE API KEY:'));
        if (!value || value === '<') return await selectProviderOption(provider);
        credentials.apiKey = value.trim();
        break;
        
      case 'sessionKey':
        value = await prompts.textInput(chalk.cyan('PASTE SESSION KEY:'));
        if (!value || value === '<') return await selectProviderOption(provider);
        credentials.sessionKey = value.trim();
        break;
        
      case 'accessToken':
        value = await prompts.textInput(chalk.cyan('PASTE ACCESS TOKEN:'));
        if (!value || value === '<') return await selectProviderOption(provider);
        credentials.accessToken = value.trim();
        break;
        
      case 'endpoint':
        const defaultEndpoint = option.defaultEndpoint || '';
        value = await prompts.textInput(chalk.cyan(`ENDPOINT [${defaultEndpoint || 'required'}]:`));
        if (value === '<') return await selectProviderOption(provider);
        credentials.endpoint = (value || defaultEndpoint).trim();
        if (!credentials.endpoint) return await selectProviderOption(provider);
        break;
        
      case 'model':
        value = await prompts.textInput(chalk.cyan('MODEL NAME:'));
        if (!value || value === '<') return await selectProviderOption(provider);
        credentials.model = value.trim();
        break;
    }
  }
  
  // Validate connection
  console.log();
  const spinner = ora({ text: 'VALIDATING CONNECTION...', color: 'cyan' }).start();
  
  const validation = await aiService.validateConnection(provider.id, option.id, credentials);
  
  if (!validation.valid) {
    spinner.fail(`CONNECTION FAILED: ${validation.error}`);
    await prompts.waitForEnter();
    return await selectProviderOption(provider);
  }
  
  // Add as new agent
  try {
    const model = credentials.model || provider.defaultModel;
    await aiService.addAgent(provider.id, option.id, credentials, model, provider.name);
    spinner.succeed(`AGENT ADDED: ${provider.name}`);
    
    // Show available models for local providers
    if (validation.models && validation.models.length > 0) {
      console.log(chalk.gray(`  AVAILABLE MODELS: ${validation.models.slice(0, 5).join(', ')}`));
    }
    
    console.log(chalk.gray(`  USING MODEL: ${model}`));
  } catch (error) {
    spinner.fail(`FAILED TO SAVE: ${error.message}`);
  }
  
  await prompts.waitForEnter();
  return await aiAgentMenu();
};

/**
 * Select model from a list (used when adding new agent)
 * @param {Array} models - Array of model IDs from API
 * @param {string} providerName - Provider name for display
 * @returns {string|null} Selected model ID or null if cancelled
 * 
 * Data source: models array comes from provider API (/v1/models)
 */
const selectModelFromList = async (models, providerName) => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue(`SELECT MODEL - ${providerName}`, boxWidth);
  
  if (!models || models.length === 0) {
    console.log(makeLine(chalk.red('NO MODELS AVAILABLE')));
    console.log(makeLine(chalk.gray('[<] BACK')));
    drawBoxFooter(boxWidth);
    await prompts.waitForEnter();
    return null;
  }
  
  // Sort models (newest first)
  const sortedModels = [...models].sort((a, b) => b.localeCompare(a));
  
  // Display models from API
  sortedModels.forEach((model, index) => {
    const displayModel = model.length > W - 10 ? model.substring(0, W - 13) + '...' : model;
    console.log(makeLine(chalk.cyan(`[${index + 1}] ${displayModel}`)));
  });
  
  console.log(makeLine(''));
  console.log(makeLine(chalk.gray('[<] BACK')));
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT MODEL:'));
  
  if (choice === '<' || choice?.toLowerCase() === 'b') {
    return null;
  }
  
  const index = parseInt(choice) - 1;
  if (isNaN(index) || index < 0 || index >= sortedModels.length) {
    return await selectModelFromList(models, providerName);
  }
  
  return sortedModels[index];
};

/**
 * Select/change model for an agent
 * Fetches available models from the provider's API
 */
const selectModel = async (agent) => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue(`SELECT MODEL - ${agent.name}`, boxWidth);
  
  console.log(makeLine(chalk.gray('FETCHING AVAILABLE MODELS FROM API...')));
  drawBoxFooter(boxWidth);
  
  // Fetch models from real API
  const { fetchAnthropicModels, fetchOpenAIModels } = require('../services/ai/client');
  
  let models = null;
  const agentCredentials = aiService.getAgentCredentials(agent.id);
  
  if (agent.providerId === 'anthropic') {
    models = await fetchAnthropicModels(agentCredentials?.apiKey);
  } else {
    // OpenAI-compatible providers
    const endpoint = agentCredentials?.endpoint || agent.provider?.endpoint;
    models = await fetchOpenAIModels(endpoint, agentCredentials?.apiKey);
  }
  
  // Redraw with results
  console.clear();
  displayBanner();
  drawBoxHeaderContinue(`SELECT MODEL - ${agent.name}`, boxWidth);
  
  if (!models || models.length === 0) {
    console.log(makeLine(chalk.red('COULD NOT FETCH MODELS FROM API')));
    console.log(makeLine(chalk.gray('Check your API key or network connection.')));
    console.log(makeLine(''));
    console.log(makeLine(chalk.gray('[<] BACK')));
    drawBoxFooter(boxWidth);
    
    await prompts.waitForEnter();
    return await aiAgentMenu();
  }
  
  // Sort models (newest first typically)
  models.sort((a, b) => b.localeCompare(a));
  
  // Display models from API
  models.forEach((model, index) => {
    const displayModel = model.length > W - 10 ? model.substring(0, W - 13) + '...' : model;
    const currentMarker = model === agent.model ? chalk.yellow(' (CURRENT)') : '';
    console.log(makeLine(chalk.cyan(`[${index + 1}] ${displayModel}`) + currentMarker));
  });
  
  console.log(makeLine(''));
  console.log(makeLine(chalk.gray('[<] BACK')));
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT MODEL:'));
  
  if (choice === '<' || choice?.toLowerCase() === 'b') {
    return await aiAgentMenu();
  }
  
  const index = parseInt(choice) - 1;
  if (isNaN(index) || index < 0 || index >= models.length) {
    return await selectModel(agent);
  }
  
  const selectedModel = models[index];
  aiService.updateAgent(agent.id, { model: selectedModel });
  
  console.log(chalk.green(`\n  MODEL CHANGED TO: ${selectedModel}`));
  await prompts.waitForEnter();
  return await aiAgentMenu();
};

module.exports = { aiAgentMenu };
