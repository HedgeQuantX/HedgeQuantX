/**
 * AI Agent Menu
 * Configure AI provider connection
 */

const chalk = require('chalk');
const ora = require('ora');

const { getLogoWidth, drawBoxHeader, drawBoxFooter } = require('../ui');
const { prompts } = require('../utils');
const aiService = require('../services/ai');
const { getCategories, getProvidersByCategory } = require('../services/ai/providers');

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
  drawBoxHeader('AI AGENT', boxWidth);
  
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
      return await selectCategory();
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
 * Select provider category
 */
const selectCategory = async () => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  console.clear();
  drawBoxHeader('SELECT PROVIDER TYPE', boxWidth);
  
  const categories = getCategories();
  
  categories.forEach((cat, index) => {
    const color = cat.id === 'unified' ? chalk.green : 
                  cat.id === 'local' ? chalk.yellow : chalk.cyan;
    console.log(makeLine(color(`[${index + 1}] ${cat.name}`)));
    console.log(makeLine(chalk.gray('    ' + cat.description)));
    console.log(makeLine(''));
  });
  
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
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  console.clear();
  
  const categories = getCategories();
  const category = categories.find(c => c.id === categoryId);
  drawBoxHeader(category.name, boxWidth);
  
  const providers = getProvidersByCategory(categoryId);
  
  if (providers.length === 0) {
    console.log(makeLine(chalk.gray('No providers in this category')));
    drawBoxFooter(boxWidth);
    await prompts.waitForEnter();
    return await selectCategory();
  }
  
  // Display providers
  providers.forEach((provider, index) => {
    const isRecommended = provider.id === 'openrouter';
    const color = isRecommended ? chalk.green : chalk.cyan;
    console.log(makeLine(color(`[${index + 1}] ${provider.name}`)));
    console.log(makeLine(chalk.gray('    ' + provider.description)));
    if (provider.models && provider.models.length > 0) {
      const modelList = provider.models.slice(0, 3).join(', ');
      console.log(makeLine(chalk.gray('    Models: ' + modelList + (provider.models.length > 3 ? '...' : ''))));
    }
    console.log(makeLine(''));
  });
  
  console.log(makeLine(chalk.gray('[<] BACK')));
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT PROVIDER:'));
  
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
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  // If only one option, skip selection
  if (provider.options.length === 1) {
    return await setupConnection(provider, provider.options[0]);
  }
  
  console.clear();
  drawBoxHeader(provider.name, boxWidth);
  
  console.log(makeLine(chalk.white('SELECT CONNECTION METHOD:')));
  console.log(makeLine(''));
  
  provider.options.forEach((option, index) => {
    console.log(makeLine(chalk.cyan(`[${index + 1}] ${option.label}`)));
    option.description.forEach(desc => {
      console.log(makeLine(chalk.gray('    ' + desc)));
    });
    console.log(makeLine(''));
  });
  
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
  
  console.clear();
  drawBoxHeader(`CONNECT TO ${provider.name}`, boxWidth);
  
  // Show instructions
  if (option.url) {
    console.log(makeLine(chalk.white('GET YOUR CREDENTIALS:')));
    console.log(makeLine(chalk.cyan(option.url)));
    console.log(makeLine(''));
  }
  
  drawBoxFooter(boxWidth);
  console.log();
  
  // Collect credentials based on fields
  const credentials = {};
  
  for (const field of option.fields) {
    let value;
    
    switch (field) {
      case 'apiKey':
        value = await prompts.passwordInput('ENTER API KEY:');
        if (!value) return await selectProviderOption(provider);
        credentials.apiKey = value;
        break;
        
      case 'sessionKey':
        value = await prompts.passwordInput('ENTER SESSION KEY:');
        if (!value) return await selectProviderOption(provider);
        credentials.sessionKey = value;
        break;
        
      case 'accessToken':
        value = await prompts.passwordInput('ENTER ACCESS TOKEN:');
        if (!value) return await selectProviderOption(provider);
        credentials.accessToken = value;
        break;
        
      case 'endpoint':
        const defaultEndpoint = option.defaultEndpoint || '';
        value = await prompts.textInput(`ENDPOINT [${defaultEndpoint || 'required'}]:`);
        credentials.endpoint = value || defaultEndpoint;
        if (!credentials.endpoint) return await selectProviderOption(provider);
        break;
        
      case 'model':
        value = await prompts.textInput('MODEL NAME:');
        if (!value) return await selectProviderOption(provider);
        credentials.model = value;
        break;
    }
  }
  
  // Validate connection
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
  drawBoxHeader('SELECT MODEL', boxWidth);
  
  const models = provider.models || [];
  
  if (models.length === 0) {
    console.log(makeLine(chalk.gray('No predefined models. Enter model name manually.')));
    drawBoxFooter(boxWidth);
    
    const model = await prompts.textInput('ENTER MODEL NAME:');
    if (model) {
      const settings = aiService.getAISettings();
      settings.model = model;
      aiService.saveAISettings(settings);
      console.log(chalk.green(`\n  MODEL CHANGED TO: ${model}`));
    }
    await prompts.waitForEnter();
    return await aiAgentMenu();
  }
  
  models.forEach((model, index) => {
    console.log(makeLine(chalk.cyan(`[${index + 1}] ${model}`)));
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
