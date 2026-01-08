/**
 * Custom Strategy - AI-powered modular strategy builder
 * Each strategy is a folder with modular components
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ora = require('ora');

const { getLogoWidth, centerText, displayBanner } = require('../../ui');
const { prompts } = require('../../utils');
const { getActiveProvider } = require('../ai-agents');
const cliproxy = require('../../services/cliproxy');

// Base strategies directory
const STRATEGIES_DIR = path.join(os.homedir(), '.hqx', 'strategies');

/** Ensure strategies directory exists */
const ensureStrategiesDir = () => {
  if (!fs.existsSync(STRATEGIES_DIR)) fs.mkdirSync(STRATEGIES_DIR, { recursive: true });
};

/** Load all saved strategies (folders) */
const loadStrategies = () => {
  ensureStrategiesDir();
  try {
    const items = fs.readdirSync(STRATEGIES_DIR, { withFileTypes: true });
    return items.filter(i => i.isDirectory()).map(dir => {
      const configPath = path.join(STRATEGIES_DIR, dir.name, 'config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return { folder: dir.name, path: path.join(STRATEGIES_DIR, dir.name), ...config };
      }
      return { folder: dir.name, path: path.join(STRATEGIES_DIR, dir.name), name: dir.name };
    });
  } catch (e) { return []; }
};

/** Create strategy folder structure */
const createStrategyFolder = (name) => {
  ensureStrategiesDir();
  const folderName = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  const strategyPath = path.join(STRATEGIES_DIR, folderName);
  
  if (fs.existsSync(strategyPath)) {
    return { success: false, error: 'Strategy folder already exists', path: null };
  }
  
  fs.mkdirSync(strategyPath, { recursive: true });
  return { success: true, path: strategyPath, folder: folderName };
};

/** Save strategy module */
const saveModule = (strategyPath, moduleName, content) => {
  const filePath = path.join(strategyPath, moduleName);
  fs.writeFileSync(filePath, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  return filePath;
};

/** Delete strategy folder */
const deleteStrategy = (strategyPath) => {
  if (fs.existsSync(strategyPath)) {
    fs.rmSync(strategyPath, { recursive: true, force: true });
    return true;
  }
  return false;
};

/** Custom Strategy Menu */
const customStrategyMenu = async (service) => {
  while (true) {
    console.clear();
    displayBanner();
    
    const boxWidth = getLogoWidth();
    const W = boxWidth - 2;
    const aiProvider = getActiveProvider();
    const strategies = loadStrategies();
    
    console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
    console.log(chalk.cyan('║') + chalk.green.bold(centerText('CUSTOM STRATEGY BUILDER', W)) + chalk.cyan('║'));
    console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
    
    // AI Status
    if (aiProvider) {
      const status = `AI: ${aiProvider.name} (${aiProvider.modelName || 'default'})`;
      console.log(chalk.cyan('║') + chalk.green(centerText('● ' + status, W)) + chalk.cyan('║'));
    } else {
      console.log(chalk.cyan('║') + chalk.red(centerText('○ NO AI AGENT CONNECTED', W)) + chalk.cyan('║'));
    }
    
    console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
    
    // Options
    const col1 = '[1] CREATE NEW';
    const col2 = `[2] MY STRATEGIES (${strategies.length})`;
    const colWidth = Math.floor(W / 2);
    const pad1 = Math.floor((colWidth - col1.length) / 2);
    const pad2 = Math.floor((W - colWidth - col2.length) / 2);
    console.log(chalk.cyan('║') + 
      ' '.repeat(pad1) + chalk.yellow(col1) + ' '.repeat(colWidth - col1.length - pad1) +
      ' '.repeat(pad2) + chalk.cyan(col2) + ' '.repeat(W - colWidth - col2.length - pad2) +
      chalk.cyan('║'));
    
    console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
    console.log(chalk.cyan('║') + chalk.red(centerText('[B] BACK', W)) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
    
    const input = await prompts.textInput(chalk.cyan('SELECT (1/2/B): '));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') return;
    
    if (choice === '1') {
      if (!aiProvider) {
        console.log(chalk.red('\n  Connect an AI Agent first (AI Agents menu)'));
        await prompts.waitForEnter();
        continue;
      }
      await createStrategyWizard(aiProvider);
    } else if (choice === '2') {
      await myStrategiesMenu(strategies, service);
    }
  }
};

/** AI Wizard to create modular strategy */
const createStrategyWizard = async (aiProvider) => {
  console.clear();
  displayBanner();
  
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.green.bold(centerText('CREATE STRATEGY WITH AI', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
  console.log();
  
  // Step 1: Strategy name
  console.log(chalk.yellow('  STEP 1: Name your strategy'));
  const name = await prompts.textInput(chalk.cyan('  Strategy name: '));
  if (!name || !name.trim()) {
    console.log(chalk.red('  Cancelled'));
    await prompts.waitForEnter();
    return;
  }
  
  // Create folder
  const folder = createStrategyFolder(name.trim());
  if (!folder.success) {
    console.log(chalk.red(`  Error: ${folder.error}`));
    await prompts.waitForEnter();
    return;
  }
  
  console.log(chalk.green(`  ✓ Created: ${folder.path}`));
  console.log();
  
  // Step 2: Chat with AI to build strategy
  console.log(chalk.yellow('  STEP 2: Describe your strategy to the AI'));
  console.log(chalk.gray('  Type your strategy idea in plain English.'));
  console.log(chalk.gray('  The AI will help you build each module.'));
  console.log(chalk.gray('  Type "done" when finished, "cancel" to abort.'));
  console.log();
  
  const systemPrompt = `You are an expert algo trading strategy builder for futures (ES, NQ, MES, MNQ, etc).
Help the user create a modular trading strategy. Build these components:

1. ENTRY CONDITIONS - When to open a position (long/short signals)
2. EXIT CONDITIONS - Take profit, stop loss, trailing stops
3. RISK MANAGEMENT - Position sizing, max loss, max positions
4. FILTERS - Market conditions when NOT to trade

Ask clarifying questions. Be concise. When ready, output each module.

For each module, output JavaScript code in this format:
\`\`\`javascript:entry.js
module.exports = {
  checkLongEntry: (data) => { /* return true/false */ },
  checkShortEntry: (data) => { /* return true/false */ }
};
\`\`\`

The 'data' object contains: { price, bid, ask, volume, atr, ema20, ema50, rsi, macd, vwap, high, low, open, close }`;

  const messages = [{ role: 'system', content: systemPrompt }];
  const modules = {};
  
  console.log(chalk.green('  AI: ') + 'What kind of trading strategy do you want to create?');
  console.log(chalk.gray('      Example: "A mean reversion strategy that buys when RSI < 30"'));
  console.log();
  
  while (true) {
    const userInput = await prompts.textInput(chalk.yellow('  You: '));
    
    if (!userInput) continue;
    
    if (userInput.toLowerCase() === 'cancel') {
      deleteStrategy(folder.path);
      console.log(chalk.gray('\n  Strategy cancelled and folder deleted.'));
      await prompts.waitForEnter();
      return;
    }
    
    if (userInput.toLowerCase() === 'done') {
      // Save config
      saveModule(folder.path, 'config.json', {
        name: name.trim(),
        description: modules.description || '',
        createdAt: new Date().toISOString(),
        modules: Object.keys(modules).filter(k => k !== 'description')
      });
      
      console.log(chalk.green('\n  ✓ Strategy saved!'));
      console.log(chalk.cyan(`  Location: ${folder.path}`));
      console.log(chalk.gray('  Modules created:'));
      for (const m of Object.keys(modules)) {
        if (m !== 'description') console.log(chalk.gray(`    - ${m}`));
      }
      await prompts.waitForEnter();
      return;
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
      
      // Extract and save code modules
      const codeBlocks = response.matchAll(/```javascript:(\w+\.js)\n([\s\S]*?)```/g);
      for (const match of codeBlocks) {
        const [, filename, code] = match;
        saveModule(folder.path, filename, code.trim());
        modules[filename] = true;
        console.log(chalk.green(`  ✓ Saved module: ${filename}`));
      }
      
      // Extract description if present
      const descMatch = response.match(/description[:\s]*["']?([^"'\n]+)/i);
      if (descMatch) modules.description = descMatch[1];
      
      // Print AI response (without code blocks for cleaner output)
      const cleanResponse = response.replace(/```[\s\S]*?```/g, '[code saved]');
      console.log(chalk.green('  AI: ') + formatResponse(cleanResponse));
      console.log();
      
    } catch (e) {
      spinner.fail(`Error: ${e.message}`);
      messages.pop();
    }
  }
};

/** Get default model */
const getDefaultModel = (providerId) => {
  const defaults = {
    anthropic: 'claude-sonnet-4-20250514',
    google: 'gemini-2.5-pro',
    openai: 'gpt-4o'
  };
  return defaults[providerId] || 'claude-sonnet-4-20250514';
};

/** Format response for terminal */
const formatResponse = (text) => {
  const lines = text.split('\n');
  return lines.map((l, i) => i === 0 ? l : '      ' + l).join('\n');
};

/** My Strategies Menu */
const myStrategiesMenu = async (strategies, service) => {
  while (true) {
    console.clear();
    displayBanner();
    
    const boxWidth = getLogoWidth();
    const W = boxWidth - 2;
    
    console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
    console.log(chalk.cyan('║') + chalk.yellow.bold(centerText('MY STRATEGIES', W)) + chalk.cyan('║'));
    console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
    
    if (strategies.length === 0) {
      console.log(chalk.cyan('║') + chalk.gray(centerText('No strategies yet', W)) + chalk.cyan('║'));
    } else {
      for (let i = 0; i < strategies.length; i++) {
        const s = strategies[i];
        const num = `[${i + 1}]`.padEnd(4);
        const sname = (s.name || s.folder).substring(0, 30).padEnd(32);
        const modules = s.modules ? `${s.modules.length} modules` : '';
        const line = `${num} ${sname} ${chalk.gray(modules)}`;
        console.log(chalk.cyan('║') + '  ' + chalk.white(num) + chalk.cyan(sname) + chalk.gray(modules.padEnd(W - 38)) + chalk.cyan('║'));
      }
    }
    
    console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
    console.log(chalk.cyan('║') + chalk.red(centerText('[B] BACK', W)) + chalk.cyan('║'));
    console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
    
    if (strategies.length === 0) {
      await prompts.waitForEnter();
      return;
    }
    
    const input = await prompts.textInput(chalk.cyan(`SELECT (1-${strategies.length}/B): `));
    const choice = (input || '').toLowerCase().trim();
    
    if (choice === 'b' || choice === '') return;
    
    const num = parseInt(choice);
    if (!isNaN(num) && num >= 1 && num <= strategies.length) {
      await strategyDetailMenu(strategies[num - 1], service);
      strategies.length = 0;
      strategies.push(...loadStrategies());
    }
  }
};

/** Strategy Detail Menu */
const strategyDetailMenu = async (strategy, service) => {
  console.clear();
  displayBanner();
  
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  console.log(chalk.cyan('╔' + '═'.repeat(W) + '╗'));
  console.log(chalk.cyan('║') + chalk.green.bold(centerText((strategy.name || strategy.folder).toUpperCase(), W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Show modules
  const files = fs.readdirSync(strategy.path);
  console.log(chalk.cyan('║') + chalk.gray(centerText(`Path: ${strategy.path}`, W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.white(centerText('MODULES:', W)) + chalk.cyan('║'));
  
  for (const f of files) {
    const icon = f.endsWith('.js') ? '📄' : f.endsWith('.json') ? '⚙️' : '📁';
    console.log(chalk.cyan('║') + centerText(`${icon} ${f}`, W) + chalk.cyan('║'));
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Options: Run, Edit with AI, Delete
  const opts = ['[1] RUN', '[2] EDIT WITH AI', '[3] DELETE'];
  const optLine = opts.join('     ');
  console.log(chalk.cyan('║') + centerText(
    chalk.green(opts[0]) + '     ' + chalk.yellow(opts[1]) + '     ' + chalk.red(opts[2]), W
  ) + chalk.cyan('║'));
  
  console.log(chalk.cyan('╠' + '─'.repeat(W) + '╣'));
  console.log(chalk.cyan('║') + chalk.red(centerText('[B] BACK', W)) + chalk.cyan('║'));
  console.log(chalk.cyan('╚' + '═'.repeat(W) + '╝'));
  
  const input = await prompts.textInput(chalk.cyan('SELECT (1/2/3/B): '));
  const choice = (input || '').toLowerCase().trim();
  
  if (choice === '1') {
    console.log(chalk.yellow('\n  Running custom strategy...'));
    console.log(chalk.gray('  This will use your connected accounts and market data.'));
    console.log(chalk.gray('  (Full execution coming soon)'));
    await prompts.waitForEnter();
  } else if (choice === '2') {
    console.log(chalk.yellow('\n  Edit with AI coming soon...'));
    await prompts.waitForEnter();
  } else if (choice === '3') {
    const confirm = await prompts.confirmPrompt(`Delete "${strategy.name || strategy.folder}"?`, false);
    if (confirm) {
      deleteStrategy(strategy.path);
      console.log(chalk.green('\n  ✓ Strategy deleted'));
      await prompts.waitForEnter();
    }
  }
};

module.exports = { customStrategyMenu, loadStrategies, createStrategyFolder, saveModule };
