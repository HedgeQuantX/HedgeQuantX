/**
 * Custom Strategy - AI-powered strategy builder
 * Same config flow as One Account, then AI chat to create strategy
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ora = require('ora');
const readline = require('readline');

const { getLogoWidth, centerText, displayBanner } = require('../../ui');
const { prompts } = require('../../utils');
const { connections } = require('../../services');
const { getActiveProvider } = require('../ai-agents');
const cliproxy = require('../../services/cliproxy');
const { checkMarketHours } = require('../../services/rithmic/market');

// Strategies directory
const STRATEGIES_DIR = path.join(os.homedir(), '.hqx', 'strategies');

/** Ensure strategies directory exists */
const ensureStrategiesDir = () => {
  if (!fs.existsSync(STRATEGIES_DIR)) fs.mkdirSync(STRATEGIES_DIR, { recursive: true });
};

/** Custom Strategy Menu */
const customStrategyMenu = async (service) => {
  // Check AI provider first
  const aiProvider = getActiveProvider();
  if (!aiProvider) {
    console.log(chalk.red('\n  No AI Agent connected. Go to AI Agents menu first.'));
    await prompts.waitForEnter();
    return;
  }
  
  // Check market hours
  const market = checkMarketHours();
  if (!market.isOpen && !market.message.includes('early')) {
    console.log();
    console.log(chalk.red(`  ${market.message}`));
    console.log(chalk.gray('  Custom strategy requires market to be open'));
    console.log();
    await prompts.waitForEnter();
    return;
  }
  
  // Step 1: Fetch accounts
  const spinner = ora({ text: 'Fetching active accounts...', color: 'yellow' }).start();
  const allAccounts = await connections.getAllAccounts();
  
  if (!allAccounts?.length) {
    spinner.fail('No accounts found');
    await prompts.waitForEnter();
    return;
  }
  
  const activeAccounts = allAccounts.filter(acc => acc.status === 0);
  if (!activeAccounts.length) {
    spinner.fail('No active accounts');
    await prompts.waitForEnter();
    return;
  }
  
  spinner.succeed(`Found ${activeAccounts.length} active account(s)`);
  
  // Step 2: Select account
  console.log();
  console.log(chalk.cyan.bold('  STEP 1: SELECT ACCOUNT'));
  const accountOptions = activeAccounts.map(acc => {
    const name = acc.accountName || acc.rithmicAccountId || acc.accountId;
    const balance = acc.balance !== null && acc.balance !== undefined 
      ? ` - $${acc.balance.toLocaleString()}` : '';
    return {
      label: `${name} (${acc.propfirm || acc.platform || 'Unknown'})${balance}`,
      value: acc
    };
  });
  accountOptions.push({ label: '< Back', value: 'back' });
  
  const selectedAccount = await prompts.selectOption('Select Account:', accountOptions);
  if (!selectedAccount || selectedAccount === 'back') return;
  
  const accountService = selectedAccount.service || connections.getServiceForAccount(selectedAccount.accountId) || service;
  
  // Step 3: Select symbol
  console.log();
  console.log(chalk.cyan.bold('  STEP 2: SELECT SYMBOL'));
  const contract = await selectSymbol(accountService);
  if (!contract) return;
  
  // Step 4: Configure parameters
  console.log();
  console.log(chalk.cyan.bold('  STEP 3: CONFIGURE PARAMETERS'));
  console.log();
  
  const contracts = await prompts.numberInput('Number of contracts:', 1, 1, 10);
  if (contracts === null) return;
  
  const dailyTarget = await prompts.numberInput('Daily target ($):', 200, 1, 10000);
  if (dailyTarget === null) return;
  
  const maxRisk = await prompts.numberInput('Max risk ($):', 100, 1, 5000);
  if (maxRisk === null) return;
  
  const showName = await prompts.confirmPrompt('Show account name?', false);
  if (showName === null) return;
  
  // Step 5: AI Supervision
  console.log();
  console.log(chalk.cyan.bold('  STEP 4: AI SUPERVISION'));
  const aiSupervision = await prompts.confirmPrompt('Enable AI supervision during execution?', true);
  if (aiSupervision === null) return;
  
  const config = {
    account: selectedAccount,
    contract,
    contracts,
    dailyTarget,
    maxRisk,
    showName,
    aiSupervision,
    aiProvider
  };
  
  // Step 6: AI Chat to create/configure strategy
  console.log();
  console.log(chalk.cyan.bold('  STEP 5: CREATE YOUR STRATEGY WITH AI'));
  console.log(chalk.gray('  Describe your trading strategy in plain English.'));
  console.log(chalk.gray('  The AI will help you build and validate it.'));
  console.log();
  
  await strategyChat(config, accountService);
};

/** Select symbol - same as one-account */
const selectSymbol = async (service) => {
  const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();
  
  const contractsResult = await service.getContracts();
  if (!contractsResult.success || !contractsResult.contracts?.length) {
    spinner.fail('Failed to load contracts');
    return null;
  }
  
  let contracts = contractsResult.contracts;
  
  // Sort popular indices first
  const popular = ['ES', 'NQ', 'MES', 'MNQ', 'M2K', 'RTY', 'YM', 'MYM', 'NKD', 'GC', 'SI', 'CL'];
  contracts.sort((a, b) => {
    const baseA = a.baseSymbol || a.symbol || '';
    const baseB = b.baseSymbol || b.symbol || '';
    const idxA = popular.findIndex(p => baseA === p || baseA.startsWith(p));
    const idxB = popular.findIndex(p => baseB === p || baseB.startsWith(p));
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return baseA.localeCompare(baseB);
  });
  
  spinner.succeed(`Found ${contracts.length} contracts`);
  
  const options = contracts.map(c => ({
    label: `${c.symbol} - ${c.name} (${c.exchange})`,
    value: c
  }));
  options.push({ label: chalk.gray('< Back'), value: 'back' });
  
  const selected = await prompts.selectOption(chalk.yellow('Select Symbol:'), options);
  return selected === 'back' || selected === null ? null : selected;
};

/** AI Chat for strategy creation */
const strategyChat = async (config, service) => {
  const { account, contract, contracts, dailyTarget, maxRisk, showName, aiSupervision, aiProvider } = config;
  
  const accountName = showName 
    ? (account.accountName || account.rithmicAccountId || account.accountId) 
    : 'HQX *****';
  
  console.clear();
  displayBanner();
  
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.green.bold(centerText('CUSTOM STRATEGY - AI CHAT', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + centerText(`Account: ${accountName} | Symbol: ${contract.name} | Qty: ${contracts}`, W) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + centerText(`Target: $${dailyTarget} | Risk: $${maxRisk} | AI Supervision: ${aiSupervision ? 'ON' : 'OFF'}`, W) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.gray(centerText(`AI: ${aiProvider.name} (${aiProvider.modelName || 'default'})`, W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.gray(centerText('Type your strategy. "run" to execute, "save" to save, "cancel" to abort', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
  console.log();
  
  const systemPrompt = `You are an expert algorithmic trading assistant for futures trading.

Current setup:
- Account: ${accountName}
- Symbol: ${contract.name} (${contract.symbol})
- Contracts: ${contracts}
- Daily Target: $${dailyTarget}
- Max Risk: $${maxRisk}
- AI Supervision: ${aiSupervision ? 'Enabled' : 'Disabled'}

Help the user create a trading strategy. When they describe what they want:
1. Understand their entry/exit logic
2. Validate the strategy makes sense
3. Suggest improvements if needed
4. When ready, confirm the strategy is valid

Keep responses concise (2-3 sentences max unless explaining strategy details).
When the user says "run", output: [STRATEGY_READY]
Include the strategy parameters in JSON format when ready.`;

  const messages = [{ role: 'system', content: systemPrompt }];
  let strategyReady = false;
  let strategyConfig = null;
  
  console.log(chalk.green('  AI: ') + `Hello! I'll help you create a custom strategy for ${contract.name}.`);
  console.log(chalk.green('      ') + 'What kind of trading strategy do you want to build?');
  console.log();
  
  while (true) {
    const userInput = await prompts.textInput(chalk.yellow('  You: '));
    
    if (!userInput) continue;
    
    const cmd = userInput.toLowerCase().trim();
    
    if (cmd === 'cancel' || cmd === 'exit' || cmd === 'quit') {
      console.log(chalk.gray('\n  Strategy creation cancelled.'));
      await prompts.waitForEnter();
      return;
    }
    
    if (cmd === 'save') {
      if (strategyConfig) {
        await saveStrategy(strategyConfig, config);
      } else {
        console.log(chalk.yellow('\n  No strategy to save yet. Keep describing your strategy.'));
      }
      continue;
    }
    
    if (cmd === 'run') {
      if (strategyReady && strategyConfig) {
        console.log(chalk.green('\n  Launching strategy...'));
        await launchCustomStrategy(config, strategyConfig, service);
        return;
      } else {
        console.log(chalk.yellow('\n  Strategy not ready yet. Describe your entry/exit conditions first.'));
        continue;
      }
    }
    
    messages.push({ role: 'user', content: userInput });
    
    const spinner = ora({ text: 'AI thinking...', color: 'yellow' }).start();
    
    try {
      const modelId = aiProvider.modelId || getDefaultModel(aiProvider.id);
      const result = await cliproxy.chatCompletion(modelId, messages);
      
      if (!result.success) {
        spinner.fail(`AI Error: ${result.error}`);
        messages.pop();
        continue;
      }
      
      const response = result.response?.choices?.[0]?.message?.content || '';
      messages.push({ role: 'assistant', content: response });
      
      spinner.stop();
      console.log();
      console.log(chalk.green('  AI: ') + formatResponse(response));
      console.log();
      
      // Check if strategy is ready
      if (response.includes('[STRATEGY_READY]') || response.toLowerCase().includes('strategy is ready')) {
        strategyReady = true;
        // Try to extract JSON config
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try { strategyConfig = JSON.parse(jsonMatch[0]); } catch (e) {}
        }
        if (!strategyConfig) {
          strategyConfig = { description: userInput, messages: messages.slice(1) };
        }
        console.log(chalk.cyan('  [Strategy ready! Type "run" to execute or "save" to save for later]'));
        console.log();
      }
      
    } catch (e) {
      spinner.fail(`Error: ${e.message}`);
      messages.pop();
    }
  }
};

/** Get default model for provider */
const getDefaultModel = (providerId) => {
  const defaults = { anthropic: 'claude-sonnet-4-20250514', google: 'gemini-2.5-pro', openai: 'gpt-4o' };
  return defaults[providerId] || 'claude-sonnet-4-20250514';
};

/** Format AI response */
const formatResponse = (text) => {
  const clean = text.replace(/\[STRATEGY_READY\]/g, '').trim();
  const lines = clean.split('\n');
  return lines.map((l, i) => i === 0 ? l : '      ' + l).join('\n');
};

/** Save strategy to disk */
const saveStrategy = async (strategyConfig, config) => {
  ensureStrategiesDir();
  
  const name = await prompts.textInput(chalk.cyan('  Strategy name: '));
  if (!name || !name.trim()) {
    console.log(chalk.gray('  Save cancelled.'));
    return;
  }
  
  const folderName = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
  const strategyPath = path.join(STRATEGIES_DIR, folderName);
  
  if (!fs.existsSync(strategyPath)) fs.mkdirSync(strategyPath, { recursive: true });
  
  const configFile = {
    name: name.trim(),
    symbol: config.contract.name,
    contracts: config.contracts,
    dailyTarget: config.dailyTarget,
    maxRisk: config.maxRisk,
    aiSupervision: config.aiSupervision,
    strategy: strategyConfig,
    createdAt: new Date().toISOString()
  };
  
  fs.writeFileSync(path.join(strategyPath, 'config.json'), JSON.stringify(configFile, null, 2));
  console.log(chalk.green(`\n  ✓ Strategy saved: ${strategyPath}`));
};

/** Launch custom strategy execution */
const launchCustomStrategy = async (config, strategyConfig, service) => {
  const { account, contract, contracts, dailyTarget, maxRisk, showName, aiSupervision, aiProvider } = config;
  
  console.log(chalk.yellow('\n  Custom strategy execution coming soon...'));
  console.log(chalk.gray('  Your strategy will use the HQX engine with AI supervision.'));
  console.log();
  console.log(chalk.white('  Strategy Summary:'));
  console.log(chalk.gray(`  - Symbol: ${contract.name}`));
  console.log(chalk.gray(`  - Contracts: ${contracts}`));
  console.log(chalk.gray(`  - Target: $${dailyTarget}`));
  console.log(chalk.gray(`  - Risk: $${maxRisk}`));
  console.log(chalk.gray(`  - AI Supervision: ${aiSupervision ? 'Enabled' : 'Disabled'}`));
  
  await prompts.waitForEnter();
};

/** Load saved strategies */
const loadStrategies = () => {
  ensureStrategiesDir();
  try {
    const items = fs.readdirSync(STRATEGIES_DIR, { withFileTypes: true });
    return items.filter(i => i.isDirectory()).map(dir => {
      const configPath = path.join(STRATEGIES_DIR, dir.name, 'config.json');
      if (fs.existsSync(configPath)) {
        return { folder: dir.name, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
      }
      return { folder: dir.name, name: dir.name };
    });
  } catch (e) { return []; }
};

module.exports = { customStrategyMenu, loadStrategies };
