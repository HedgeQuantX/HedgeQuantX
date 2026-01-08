/**
 * Custom Strategy - AI-powered strategy builder
 * Config flow + AI chat to create strategy, then execute with AI supervision
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ora = require('ora');

const { getLogoWidth, centerText, displayBanner } = require('../../ui');
const { prompts } = require('../../utils');
const { connections } = require('../../services');
const { getActiveProvider } = require('../ai-agents');
const cliproxy = require('../../services/cliproxy');
const { checkMarketHours } = require('../../services/rithmic/market');
const { executeAlgo } = require('./algo-executor');

const STRATEGIES_DIR = path.join(os.homedir(), '.hqx', 'strategies');

const ensureStrategiesDir = () => {
  if (!fs.existsSync(STRATEGIES_DIR)) fs.mkdirSync(STRATEGIES_DIR, { recursive: true });
};

/** Custom Strategy Menu */
const customStrategyMenu = async (service) => {
  const aiProvider = getActiveProvider();
  if (!aiProvider) {
    console.log(chalk.red('\n  No AI Agent connected. Go to AI Agents menu first.'));
    await prompts.waitForEnter();
    return;
  }
  
  const market = checkMarketHours();
  if (!market.isOpen && !market.message.includes('early')) {
    console.log(chalk.red(`\n  ${market.message}`));
    console.log(chalk.gray('  Custom strategy requires market to be open\n'));
    await prompts.waitForEnter();
    return;
  }
  
  const spinner = ora({ text: 'Fetching active accounts...', color: 'yellow' }).start();
  const allAccounts = await connections.getAllAccounts();
  
  if (!allAccounts?.length) { spinner.fail('No accounts found'); await prompts.waitForEnter(); return; }
  
  const activeAccounts = allAccounts.filter(acc => acc.status === 0);
  if (!activeAccounts.length) { spinner.fail('No active accounts'); await prompts.waitForEnter(); return; }
  
  spinner.succeed(`Found ${activeAccounts.length} active account(s)`);
  
  // Step 1: Select account
  console.log(chalk.cyan.bold('\n  STEP 1: SELECT ACCOUNT'));
  const accountOptions = activeAccounts.map(acc => {
    const name = acc.accountName || acc.rithmicAccountId || acc.accountId;
    const balance = acc.balance !== null && acc.balance !== undefined ? ` - $${acc.balance.toLocaleString()}` : '';
    return { label: `${name} (${acc.propfirm || acc.platform || 'Unknown'})${balance}`, value: acc };
  });
  accountOptions.push({ label: '< Back', value: 'back' });
  
  const selectedAccount = await prompts.selectOption('Select Account:', accountOptions);
  if (!selectedAccount || selectedAccount === 'back') return;
  
  const accountService = selectedAccount.service || connections.getServiceForAccount(selectedAccount.accountId) || service;
  
  // Step 2: Select symbol
  console.log(chalk.cyan.bold('\n  STEP 2: SELECT SYMBOL'));
  const contract = await selectSymbol(accountService);
  if (!contract) return;
  
  // Step 3: Configure parameters
  console.log(chalk.cyan.bold('\n  STEP 3: CONFIGURE PARAMETERS\n'));
  
  const contracts = await prompts.numberInput('Number of contracts:', 1, 1, 10);
  if (contracts === null) return;
  
  const dailyTarget = await prompts.numberInput('Daily target ($):', 200, 1, 10000);
  if (dailyTarget === null) return;
  
  const maxRisk = await prompts.numberInput('Max risk ($):', 100, 1, 5000);
  if (maxRisk === null) return;
  
  const showName = await prompts.confirmPrompt('Show account name?', false);
  if (showName === null) return;
  
  // Step 4: AI Supervision
  console.log(chalk.cyan.bold('\n  STEP 4: AI SUPERVISION'));
  const aiSupervision = await prompts.confirmPrompt('Enable AI supervision during execution?', true);
  if (aiSupervision === null) return;
  
  const config = { account: selectedAccount, contract, contracts, dailyTarget, maxRisk, showName, aiSupervision, aiProvider };
  
  // Step 5: AI Chat
  console.log(chalk.cyan.bold('\n  STEP 5: CREATE YOUR STRATEGY WITH AI'));
  console.log(chalk.gray('  Describe your trading strategy. AI will help build it.\n'));
  
  await strategyChat(config, accountService);
};

/** Select symbol */
const selectSymbol = async (service) => {
  const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();
  
  const result = await service.getContracts();
  if (!result.success || !result.contracts?.length) { spinner.fail('Failed to load contracts'); return null; }
  
  const popular = ['ES', 'NQ', 'MES', 'MNQ', 'M2K', 'RTY', 'YM', 'MYM', 'NKD', 'GC', 'SI', 'CL'];
  result.contracts.sort((a, b) => {
    const baseA = a.baseSymbol || a.symbol || '', baseB = b.baseSymbol || b.symbol || '';
    const idxA = popular.findIndex(p => baseA === p || baseA.startsWith(p));
    const idxB = popular.findIndex(p => baseB === p || baseB.startsWith(p));
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return baseA.localeCompare(baseB);
  });
  
  spinner.succeed(`Found ${result.contracts.length} contracts`);
  
  const options = result.contracts.map(c => ({ label: `${c.symbol} - ${c.name} (${c.exchange})`, value: c }));
  options.push({ label: chalk.gray('< Back'), value: 'back' });
  
  const selected = await prompts.selectOption(chalk.yellow('Select Symbol:'), options);
  return selected === 'back' || selected === null ? null : selected;
};

/** AI Chat for strategy creation */
const strategyChat = async (config, service) => {
  const { account, contract, contracts, dailyTarget, maxRisk, showName, aiSupervision, aiProvider } = config;
  const accountName = showName ? (account.accountName || account.rithmicAccountId || account.accountId) : 'HQX *****';
  
  console.clear();
  displayBanner();
  
  const W = getLogoWidth() - 2;
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.green.bold(centerText('CUSTOM STRATEGY - AI CHAT', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + centerText(`Account: ${accountName} | Symbol: ${contract.name} | Qty: ${contracts}`, W) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + centerText(`Target: $${dailyTarget} | Risk: $${maxRisk} | AI: ${aiSupervision ? 'ON' : 'OFF'}`, W) + chalk.cyan('║'));
  console.log(chalk.cyan('║') + chalk.gray(centerText(`Provider: ${aiProvider.name}`, W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.gray(centerText('"run" to execute, "save" to save, "cancel" to abort', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝\n'));
  
  const systemPrompt = `You are an expert algorithmic trading assistant.
Setup: ${accountName} | ${contract.name} | ${contracts} contracts | Target: $${dailyTarget} | Risk: $${maxRisk}
Help create a trading strategy. Be concise (2-3 sentences). When ready, say [STRATEGY_READY] with JSON config.`;

  const messages = [{ role: 'system', content: systemPrompt }];
  let strategyReady = false, strategyConfig = null;
  
  console.log(chalk.green('  AI: ') + `I'll help you create a custom strategy for ${contract.name}. What kind of strategy?`);
  console.log();
  
  while (true) {
    const userInput = await prompts.textInput(chalk.yellow('  You: '));
    if (!userInput) continue;
    
    const cmd = userInput.toLowerCase().trim();
    
    if (cmd === 'cancel' || cmd === 'exit' || cmd === 'quit') {
      console.log(chalk.gray('\n  Cancelled.')); await prompts.waitForEnter(); return;
    }
    
    if (cmd === 'save') {
      if (strategyConfig) await saveStrategy(strategyConfig, config);
      else console.log(chalk.yellow('\n  No strategy to save yet.'));
      continue;
    }
    
    if (cmd === 'run') {
      if (strategyReady && strategyConfig) {
        console.log(chalk.green('\n  Launching strategy...'));
        await launchCustomStrategy(config, strategyConfig, service);
        return;
      }
      console.log(chalk.yellow('\n  Strategy not ready. Describe your entry/exit conditions first.'));
      continue;
    }
    
    messages.push({ role: 'user', content: userInput });
    const spinner = ora({ text: 'AI thinking...', color: 'yellow' }).start();
    
    try {
      const modelId = aiProvider.modelId || getDefaultModel(aiProvider.id);
      const result = await cliproxy.chatCompletion(modelId, messages);
      
      if (!result.success) { spinner.fail(`AI Error: ${result.error}`); messages.pop(); continue; }
      
      const response = result.response?.choices?.[0]?.message?.content || '';
      messages.push({ role: 'assistant', content: response });
      spinner.stop();
      
      console.log('\n' + chalk.green('  AI: ') + formatResponse(response) + '\n');
      
      if (response.includes('[STRATEGY_READY]') || response.toLowerCase().includes('strategy is ready')) {
        strategyReady = true;
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) try { strategyConfig = JSON.parse(jsonMatch[0]); } catch (e) {}
        if (!strategyConfig) strategyConfig = { description: userInput, messages: messages.slice(1) };
        console.log(chalk.cyan('  [Strategy ready! "run" to execute or "save" to save]\n'));
      }
    } catch (e) { spinner.fail(`Error: ${e.message}`); messages.pop(); }
  }
};

const getDefaultModel = (id) => ({ anthropic: 'claude-sonnet-4-20250514', google: 'gemini-2.5-pro', openai: 'gpt-4o' }[id] || 'claude-sonnet-4-20250514');

const formatResponse = (text) => {
  const lines = text.replace(/\[STRATEGY_READY\]/g, '').trim().split('\n');
  return lines.map((l, i) => i === 0 ? l : '      ' + l).join('\n');
};

/** Save strategy */
const saveStrategy = async (strategyConfig, config) => {
  ensureStrategiesDir();
  const name = await prompts.textInput(chalk.cyan('  Strategy name: '));
  if (!name?.trim()) { console.log(chalk.gray('  Save cancelled.')); return; }
  
  const folderName = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
  const strategyPath = path.join(STRATEGIES_DIR, folderName);
  if (!fs.existsSync(strategyPath)) fs.mkdirSync(strategyPath, { recursive: true });
  
  const configFile = {
    name: name.trim(), symbol: config.contract.name, contracts: config.contracts,
    dailyTarget: config.dailyTarget, maxRisk: config.maxRisk, aiSupervision: config.aiSupervision,
    strategy: strategyConfig, createdAt: new Date().toISOString()
  };
  
  fs.writeFileSync(path.join(strategyPath, 'config.json'), JSON.stringify(configFile, null, 2));
  console.log(chalk.green(`\n  ✓ Saved: ${strategyPath}`));
};

/** Launch custom strategy with AI supervision */
const launchCustomStrategy = async (config, strategyConfig, service) => {
  const { account, contract, contracts, dailyTarget, maxRisk, showName, aiSupervision, aiProvider } = config;
  
  // AI supervision function
  const askAI = async (aiContext, signal, ctx) => {
    if (!aiSupervision) return { approve: true };
    
    const prompt = `Trading supervisor check:
Symbol: ${ctx.symbolName} | Position: ${ctx.currentPosition === 0 ? 'FLAT' : (ctx.currentPosition > 0 ? 'LONG' : 'SHORT')}
P&L: $${ctx.stats.pnl.toFixed(2)} | Trades: ${ctx.stats.trades} (W:${ctx.stats.wins} L:${ctx.stats.losses})
Strategy: ${JSON.stringify(strategyConfig.description || strategyConfig).substring(0, 200)}
Signal: ${signal.direction.toUpperCase()} @ ${signal.entry.toFixed(2)} (${(signal.confidence * 100).toFixed(0)}%)
Recent prices: ${aiContext.recentTicks.slice(-5).map(t => t.price?.toFixed(2)).join(', ') || 'N/A'}
Reply JSON: {"approve": true/false, "reason": "brief"}`;

    try {
      const modelId = aiProvider.modelId || getDefaultModel(aiProvider.id);
      const result = await cliproxy.chatCompletion(modelId, [
        { role: 'system', content: 'Trading supervisor. JSON only.' },
        { role: 'user', content: prompt }
      ]);
      
      if (result.success) {
        const content = result.response?.choices?.[0]?.message?.content || '';
        const match = content.match(/\{[\s\S]*\}/);
        if (match) return JSON.parse(match[0]);
      }
    } catch (e) { /* fallback */ }
    return { approve: true, reason: 'AI unavailable' };
  };
  
  await executeAlgo({
    service, account, contract,
    config: { contracts, dailyTarget, maxRisk, showName },
    options: { aiSupervision, aiProvider, askAI, subtitle: 'CUSTOM STRATEGY + AI' }
  });
};

/** Load saved strategies */
const loadStrategies = () => {
  ensureStrategiesDir();
  try {
    const items = fs.readdirSync(STRATEGIES_DIR, { withFileTypes: true });
    return items.filter(i => i.isDirectory()).map(dir => {
      const configPath = path.join(STRATEGIES_DIR, dir.name, 'config.json');
      if (fs.existsSync(configPath)) return { folder: dir.name, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
      return { folder: dir.name, name: dir.name };
    });
  } catch (e) { return []; }
};

module.exports = { customStrategyMenu, loadStrategies };
