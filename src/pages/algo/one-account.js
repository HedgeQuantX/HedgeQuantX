/**
 * One Account Mode - Trading with Strategy Selection
 * Supports multi-agent AI supervision
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('../../services');
const { prompts } = require('../../utils');
const { checkMarketHours } = require('../../services/rithmic/market');
const { executeAlgo } = require('./algo-executor');
const { getActiveAgentCount, getSupervisionConfig, getActiveAgents } = require('../ai-agents');
const { runPreflightCheck, formatPreflightResults, getPreflightSummary } = require('../../services/ai-supervision');
const { getAvailableStrategies } = require('../../lib/m');
const { getLastOneAccountConfig, saveOneAccountConfig } = require('../../services/algo-config');



/**
 * One Account Menu
 */
const oneAccountMenu = async (service) => {
  // Check if market is open (skip early close check - market may still be open)
  const market = checkMarketHours();
  if (!market.isOpen && !market.message.includes('early')) {
    console.log();
    console.log(chalk.red(`  ${market.message}`));
    console.log(chalk.gray('  Algo trading is only available when market is open'));
    console.log();
    await prompts.waitForEnter();
    return;
  }
  
  const spinner = ora({ text: 'Fetching active accounts...', color: 'yellow' }).start();
  
  const allAccounts = await connections.getAllAccounts();
  
  if (!allAccounts?.length) {
    spinner.fail('No accounts found');
    await prompts.waitForEnter();
    return;
  }
  
  // Filter active accounts: status === 'active' (Rithmic) OR status === 0 OR no status
  const activeAccounts = allAccounts.filter(acc => 
    acc.status === 0 || acc.status === 'active' || acc.status === undefined || acc.status === null
  );
  
  if (!activeAccounts.length) {
    spinner.fail('No active accounts');
    await prompts.waitForEnter();
    return;
  }
  
  spinner.succeed(`Found ${activeAccounts.length} active account(s)`);
  
  // Check for saved config
  const lastConfig = getLastOneAccountConfig();
  let selectedAccount = null;
  let contract = null;
  let strategy = null;
  let config = null;
  let accountService = null;
  
  if (lastConfig) {
    // Try to find matching account and offer to reuse config
    const matchingAccount = activeAccounts.find(acc => 
      acc.accountId === lastConfig.accountId || 
      acc.rithmicAccountId === lastConfig.accountId ||
      acc.accountName === lastConfig.accountName
    );
    
    if (matchingAccount) {
      console.log();
      console.log(chalk.cyan('  Last configuration found:'));
      console.log(chalk.gray(`    Account: ${lastConfig.accountName} (${lastConfig.propfirm})`));
      console.log(chalk.gray(`    Symbol: ${lastConfig.baseSymbol || lastConfig.symbol} (${lastConfig.symbol})`));
      console.log(chalk.gray(`    Strategy: ${lastConfig.strategyName}`));
      console.log(chalk.gray(`    Contracts: ${lastConfig.contracts} | Target: $${lastConfig.dailyTarget} | Risk: $${lastConfig.maxRisk}`));
      console.log();
      
      const reuseConfig = await prompts.confirmPrompt('Use last configuration?', true);
      
      if (reuseConfig) {
        selectedAccount = matchingAccount;
        accountService = selectedAccount.service || connections.getServiceForAccount(selectedAccount.accountId) || service;
        
        // Load contracts to find the saved symbol (match by baseSymbol first, then exact symbol)
        const contractsResult = await accountService.getContracts();
        if (contractsResult.success) {
          // Try baseSymbol match first (more stable across contract rolls)
          contract = contractsResult.contracts.find(c => c.baseSymbol === lastConfig.baseSymbol);
          // Fall back to exact symbol match
          if (!contract) {
            contract = contractsResult.contracts.find(c => c.symbol === lastConfig.symbol);
          }
        }
        
        // Find strategy
        const strategies = getAvailableStrategies();
        strategy = strategies.find(s => s.id === lastConfig.strategyId);
        
        // Restore config
        if (contract && strategy) {
          config = {
            contracts: lastConfig.contracts,
            dailyTarget: lastConfig.dailyTarget,
            maxRisk: lastConfig.maxRisk,
            showName: lastConfig.showName
          };
          console.log(chalk.green('  ✓ Configuration loaded'));
        } else {
          console.log(chalk.yellow('  Symbol or strategy no longer available, please reconfigure'));
          selectedAccount = null;
        }
      }
    }
  }
  
  // If no saved config used, go through normal selection
  if (!selectedAccount) {
    // Select account - display RAW API fields
    const options = activeAccounts.map(acc => {
      // Use what API returns: rithmicAccountId or accountName for Rithmic
      const name = acc.accountName || acc.rithmicAccountId || acc.accountId;
      const balance = acc.balance !== null && acc.balance !== undefined 
        ? ` - $${acc.balance.toLocaleString()}` 
        : '';
      return {
        label: `${name} (${acc.propfirm || acc.platform || 'Unknown'})${balance}`,
        value: acc
      };
    });
    options.push({ label: '< Back', value: 'back' });
    
    selectedAccount = await prompts.selectOption('Select Account:', options);
    if (!selectedAccount || selectedAccount === 'back') return;
    
    // Use the service attached to the account (from getAllAccounts), fallback to getServiceForAccount
    accountService = selectedAccount.service || connections.getServiceForAccount(selectedAccount.accountId) || service;
    
    // Select symbol
    contract = await selectSymbol(accountService, selectedAccount);
    if (!contract) return;
    
    // Select strategy
    strategy = await selectStrategy();
    if (!strategy) return;
    
    // Configure algo
    config = await configureAlgo(selectedAccount, contract, strategy);
    if (!config) return;
    
    // Save config for next time (include baseSymbol for stable matching across contract rolls)
    saveOneAccountConfig({
      accountId: selectedAccount.accountId || selectedAccount.rithmicAccountId,
      accountName: selectedAccount.accountName || selectedAccount.rithmicAccountId || selectedAccount.accountId,
      propfirm: selectedAccount.propfirm || selectedAccount.platform || 'Unknown',
      symbol: contract.symbol,
      baseSymbol: contract.baseSymbol,
      strategyId: strategy.id,
      strategyName: strategy.name,
      contracts: config.contracts,
      dailyTarget: config.dailyTarget,
      maxRisk: config.maxRisk,
      showName: config.showName
    });
  }
  
  // Check for AI Supervision BEFORE asking to start
  const agentCount = getActiveAgentCount();
  let supervisionConfig = null;
  let aiEnabled = false;
  
  if (agentCount > 0) {
    console.log();
    console.log(chalk.cyan(`  ${agentCount} AI Agent(s) available for supervision`));
    const enableAI = await prompts.confirmPrompt('Enable AI Supervision?', true);
    
    if (enableAI) {
      // Run pre-flight check - ALL agents must pass
      console.log();
      console.log(chalk.yellow('  Running AI pre-flight check...'));
      console.log();
      
      const agents = getActiveAgents();
      const preflightResults = await runPreflightCheck(agents);
      
      // Display results
      const lines = formatPreflightResults(preflightResults, 60);
      for (const line of lines) {
        console.log(line);
      }
      
      const summary = getPreflightSummary(preflightResults);
      console.log();
      console.log(`  ${summary.text}`);
      console.log();
      
      if (!preflightResults.success) {
        console.log(chalk.red('  Cannot start algo - fix agent connections first.'));
        await prompts.waitForEnter();
        return;
      }
      
      supervisionConfig = getSupervisionConfig();
      aiEnabled = true;
      console.log(chalk.green(`  ✓ AI Supervision ready with ${agentCount} agent(s)`));
    }
  }
  
  // Final confirmation to start
  const startPrompt = aiEnabled ? 'Start algo with AI supervision?' : 'Start algo trading?';
  const proceed = await prompts.confirmPrompt(startPrompt, true);
  if (!proceed) return;
  
  await executeAlgo({
    service: accountService,
    account: selectedAccount,
    contract,
    config,
    strategy,
    options: { supervisionConfig }
  });
};

/**
 * Symbol selection - sorted with popular indices first
 */
const selectSymbol = async (service, account) => {
  const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();
  
  const contractsResult = await service.getContracts();
  if (!contractsResult.success || !contractsResult.contracts?.length) {
    spinner.fail('Failed to load contracts');
    return null;
  }
  
  let contracts = contractsResult.contracts;
  
  // Sort: Popular indices first (ES, NQ, MES, MNQ, RTY, YM, etc.)
  const popularPrefixes = ['ES', 'NQ', 'MES', 'MNQ', 'M2K', 'RTY', 'YM', 'MYM', 'NKD', 'GC', 'SI', 'CL'];
  
  contracts.sort((a, b) => {
    const baseA = a.baseSymbol || a.symbol || '';
    const baseB = b.baseSymbol || b.symbol || '';
    
    // Check if baseSymbol matches popular prefixes
    const idxA = popularPrefixes.findIndex(p => baseA === p || baseA.startsWith(p));
    const idxB = popularPrefixes.findIndex(p => baseB === p || baseB.startsWith(p));
    
    // Both are popular - sort by popularity order
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    // Only A is popular - A first
    if (idxA !== -1) return -1;
    // Only B is popular - B first
    if (idxB !== -1) return 1;
    // Neither - alphabetical by baseSymbol
    return baseA.localeCompare(baseB);
  });
  
  spinner.succeed(`Found ${contracts.length} contracts`);
  
  // Display sorted contracts from API: symbol - name (exchange)
  const options = contracts.map(c => ({
    label: `${c.symbol} - ${c.name} (${c.exchange})`,
    value: c
  }));
  
  options.push({ label: chalk.gray('< Back'), value: 'back' });
  
  const contract = await prompts.selectOption(chalk.yellow('Select Symbol:'), options);
  return contract === 'back' || contract === null ? null : contract;
};

/**
 * Select trading strategy
 */
const selectStrategy = async () => {
  console.log();
  console.log(chalk.cyan('  Select Strategy'));
  console.log();
  
  const strategies = getAvailableStrategies();
  
  const options = strategies.map(s => ({
    label: `${s.name} (${s.backtest.winRate} WR, R:R ${s.params.riskReward})`,
    value: s
  }));
  options.push({ label: chalk.gray('< Back'), value: 'back' });
  
  // Show strategy details
  for (const s of strategies) {
    console.log(chalk.white(`  ${s.name}`));
    console.log(chalk.gray(`    Backtest: ${s.backtest.pnl} | ${s.backtest.winRate} WR | ${s.backtest.trades} trades`));
    console.log(chalk.gray(`    Stop: ${s.params.stopTicks} ticks | Target: ${s.params.targetTicks} ticks | R:R ${s.params.riskReward}`));
    console.log();
  }
  
  const selected = await prompts.selectOption(chalk.yellow('Select Strategy:'), options);
  return selected === 'back' || selected === null ? null : selected;
};

/**
 * Configure algo
 */
const configureAlgo = async (account, contract, strategy) => {
  console.log();
  console.log(chalk.cyan('  Configure Algo Parameters'));
  console.log(chalk.gray(`  Strategy: ${strategy.name}`));
  console.log();
  
  const contracts = await prompts.numberInput('Number of contracts:', 1, 1, 10);
  if (contracts === null) return null;
  
  const dailyTarget = await prompts.numberInput('Daily target ($):', 1000, 1, 10000);
  if (dailyTarget === null) return null;
  
  const maxRisk = await prompts.numberInput('Max risk ($):', 500, 1, 5000);
  if (maxRisk === null) return null;
  
  const showName = await prompts.confirmPrompt('Show account name?', false);
  if (showName === null) return null;
  
  return { contracts, dailyTarget, maxRisk, showName };
};

module.exports = { oneAccountMenu };
