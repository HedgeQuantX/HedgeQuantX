/**
 * AI Agent Menu
 * Configure AI provider connection
 */

const chalk = require('chalk');
const ora = require('ora');

const { getLogoWidth, drawBoxHeader, drawBoxHeaderContinue, drawBoxFooter, displayBanner } = require('../ui');
const { prompts } = require('../utils');
const aiService = require('../services/ai');
const { getCategories, getProvidersByCategory } = require('../services/ai/providers');
const tokenScanner = require('../services/ai/token-scanner');

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
  drawBoxHeaderContinue('AI AGENT', boxWidth);
  
  // Show current status
  const connection = aiService.getConnection();
  
  if (connection) {
    console.log(makeLine(chalk.green('STATUS: ● CONNECTED'), 'left'));
    console.log(makeLine(chalk.white(`PROVIDER: ${connection.provider.name}`), 'left'));
    console.log(makeLine(chalk.white(`MODEL: ${connection.model}`), 'left'));
  } else {
    console.log(makeLine(chalk.gray('STATUS: ○ NOT CONNECTED'), 'left'));
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Menu options
  const options = [];
  
  if (!connection) {
    options.push({ label: chalk.green('[1] CONNECT PROVIDER'), value: 'connect' });
  } else {
    options.push({ label: chalk.cyan('[1] CHANGE PROVIDER'), value: 'connect' });
    options.push({ label: chalk.yellow('[2] CHANGE MODEL'), value: 'model' });
    options.push({ label: chalk.red('[3] DISCONNECT'), value: 'disconnect' });
  }
  options.push({ label: chalk.gray('[<] BACK'), value: 'back' });
  
  for (const opt of options) {
    console.log(makeLine(opt.label, 'left'));
  }
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT:'));
  
  switch (choice?.toLowerCase()) {
    case '1':
      return await showExistingTokens();
    case '2':
      if (connection) {
        return await selectModel(connection.provider);
      }
      return;
    case '3':
      if (connection) {
        aiService.disconnect();
        console.log(chalk.yellow('\n  AI AGENT DISCONNECTED'));
        await prompts.waitForEnter();
      }
      return;
    case '<':
    case 'b':
      return;
    default:
      return;
  }
};

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
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('SCANNING FOR EXISTING SESSIONS...', boxWidth);
  console.log(makeLine(''));
  console.log(makeLine(chalk.gray('CHECKING VS CODE, CURSOR, CLAUDE CLI, OPENCODE...')));
  console.log(makeLine(''));
  drawBoxFooter(boxWidth);
  
  // Scan for tokens
  const tokens = tokenScanner.scanAllSources();
  
  if (tokens.length === 0) {
    // No tokens found, go directly to category selection
    return await selectCategory();
  }
  
  // Show found tokens
  console.clear();
  displayBanner();
  drawBoxHeader('EXISTING SESSIONS FOUND', boxWidth);
  
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
    // Validate the token
    const credentials = { apiKey: selectedToken.token };
    const validation = await aiService.validateConnection(selectedToken.provider, 'api_key', credentials);
    
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
    
    // Save connection
    const model = provider.defaultModel;
    await aiService.connect(selectedToken.provider, 'api_key', credentials, model);
    
    spinner.succeed(`CONNECTED TO ${provider.name}`);
    console.log(chalk.gray(`  SOURCE: ${selectedToken.source}`));
    console.log(chalk.gray(`  MODEL: ${model}`));
    
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
  drawBoxHeader('SELECT PROVIDER TYPE', boxWidth);
  
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
  drawBoxHeader(category.name, boxWidth);
  
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
  drawBoxHeader(provider.name, boxWidth);
  
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
 * Setup connection with credentials
 */
const setupConnection = async (provider, option) => {
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
    drawBoxHeader(`CONNECT TO ${provider.name}`, boxWidth);
    
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
  
  // Save connection
  try {
    const model = credentials.model || provider.defaultModel;
    await aiService.connect(provider.id, option.id, credentials, model);
    spinner.succeed(`CONNECTED TO ${provider.name}`);
    
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
 * Select/change model for current provider
 */
const selectModel = async (provider) => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  console.clear();
  displayBanner();
  drawBoxHeader('SELECT MODEL', boxWidth);
  
  const models = provider.models || [];
  
  if (models.length === 0) {
    console.log(makeLine(chalk.gray('NO PREDEFINED MODELS. ENTER MODEL NAME MANUALLY.')));
    console.log(makeLine(''));
    console.log(makeLine(chalk.gray('[<] BACK')));
    drawBoxFooter(boxWidth);
    
    const model = await prompts.textInput('ENTER MODEL NAME (OR < TO GO BACK):');
    if (!model || model === '<') {
      return await aiAgentMenu();
    }
    const settings = aiService.getAISettings();
    settings.model = model;
    aiService.saveAISettings(settings);
    console.log(chalk.green(`\n  MODEL CHANGED TO: ${model}`));
    await prompts.waitForEnter();
    return await aiAgentMenu();
  }
  
  models.forEach((model, index) => {
    // Truncate long model names
    const displayModel = model.length > W - 10 ? model.substring(0, W - 13) + '...' : model;
    console.log(makeLine(chalk.cyan(`[${index + 1}] ${displayModel}`)));
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
    return await aiAgentMenu();
  }
  
  const selectedModel = models[index];
  const settings = aiService.getAISettings();
  settings.model = selectedModel;
  aiService.saveAISettings(settings);
  
  console.log(chalk.green(`\n  MODEL CHANGED TO: ${selectedModel}`));
  await prompts.waitForEnter();
  return await aiAgentMenu();
};

module.exports = { aiAgentMenu };
