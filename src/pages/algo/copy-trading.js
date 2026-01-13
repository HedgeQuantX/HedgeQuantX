/**
 * Copy Trading Mode - HQX Ultra Scalping
 * Same as One Account but copies trades to multiple followers
 * Supports multi-agent AI supervision
 */

const chalk = require('chalk');
const ora = require('ora');

const { connections } = require('../../services');
const { prompts } = require('../../utils');
const { checkMarketHours } = require('../../services/rithmic/market');
const { getActiveAgentCount, getSupervisionConfig, getActiveAgents } = require('../ai-agents');
const { launchCopyTrading } = require('./copy-executor');
const { runPreflightCheck, formatPreflightResults, getPreflightSummary } = require('../../services/ai-supervision');
const { getAvailableStrategies } = require('../../lib/m');
const { getLastCopyTradingConfig, saveCopyTradingConfig } = require('../../services/algo-config');

/**
 * Copy Trading Menu
 */
const copyTradingMenu = async () => {
  // Check if market is open
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
  
  if (activeAccounts.length < 2) {
    spinner.fail(`Need at least 2 active accounts (found: ${activeAccounts.length})`);
    console.log(chalk.gray('  Connect to another PropFirm first'));
    await prompts.waitForEnter();
    return;
  }
  
  spinner.succeed(`Found ${activeAccounts.length} active accounts`);
  
  // Check for saved config
  const lastConfig = getLastCopyTradingConfig();
  
  if (lastConfig) {
    // Try to find matching accounts
    const matchingLead = activeAccounts.find(acc => 
      acc.accountId === lastConfig.leadAccountId || 
      acc.accountName === lastConfig.leadAccountName
    );
    
    if (matchingLead && lastConfig.followerAccountIds?.length > 0) {
      const matchingFollowers = lastConfig.followerAccountIds
        .map(id => activeAccounts.find(acc => acc.accountId === id || acc.accountName === id))
        .filter(Boolean);
      
      if (matchingFollowers.length > 0) {
        console.log();
        console.log(chalk.cyan('  Last configuration found:'));
        console.log(chalk.gray(`    Lead: ${lastConfig.leadAccountName} (${lastConfig.leadPropfirm})`));
        console.log(chalk.gray(`    Followers: ${matchingFollowers.length} account(s)`));
        console.log(chalk.gray(`    Symbol: ${lastConfig.symbol}`));
        console.log(chalk.gray(`    Strategy: ${lastConfig.strategyName}`));
        console.log(chalk.gray(`    Lead contracts: ${lastConfig.leadContracts} | Follower: ${lastConfig.followerContracts}`));
        console.log(chalk.gray(`    Target: $${lastConfig.dailyTarget} | Risk: $${lastConfig.maxRisk}`));
        console.log();
        
        const reuseConfig = await prompts.confirmPrompt('Use last configuration?', true);
        
        if (reuseConfig) {
          // Load contracts to find symbol
          const leadService = matchingLead.service || connections.getServiceForAccount(matchingLead.accountId);
          const contractsResult = await leadService.getContracts();
          const contract = contractsResult.success 
            ? contractsResult.contracts.find(c => c.symbol === lastConfig.symbol)
            : null;
          
          // Find strategy
          const strategies = getAvailableStrategies();
          const strategy = strategies.find(s => s.id === lastConfig.strategyId);
          
          if (contract && strategy) {
            console.log(chalk.green('  ✓ Configuration loaded'));
            
            // Check for AI Supervision
            const agentCount = getActiveAgentCount();
            let supervisionConfig = null;
            
            if (agentCount > 0) {
              console.log();
              console.log(chalk.cyan(`  ${agentCount} AI Agent(s) available for supervision`));
              const enableAI = await prompts.confirmPrompt('Enable AI Supervision?', true);
              
              if (enableAI) {
                const agents = getActiveAgents();
                const preflightResults = await runPreflightCheck(agents);
                const lines = formatPreflightResults(preflightResults, 60);
                for (const line of lines) console.log(line);
                const summary = getPreflightSummary(preflightResults);
                console.log();
                console.log(`  ${summary.text}`);
                
                if (!preflightResults.success) {
                  console.log(chalk.red('  Cannot start algo - fix agent connections first.'));
                  await prompts.waitForEnter();
                  return;
                }
                supervisionConfig = getSupervisionConfig();
              }
            }
            
            const confirm = await prompts.confirmPrompt('Start Copy Trading?', true);
            if (!confirm) return;
            
            await launchCopyTrading({
              lead: { account: matchingLead, contracts: lastConfig.leadContracts },
              followers: matchingFollowers.map(f => ({ account: f, contracts: lastConfig.followerContracts })),
              contract,
              strategy,
              dailyTarget: lastConfig.dailyTarget,
              maxRisk: lastConfig.maxRisk,
              showNames: lastConfig.showNames,
              supervisionConfig
            });
            return;
          } else {
            console.log(chalk.yellow('  Symbol or strategy no longer available, please reconfigure'));
          }
        }
      }
    }
  }
  
  // Step 1: Select LEAD Account
  console.log();
  console.log(chalk.cyan.bold('  STEP 1: SELECT LEAD ACCOUNT'));
  const leadOptions = activeAccounts.map(acc => {
    const name = acc.accountName || acc.rithmicAccountId || acc.accountId;
    const balance = acc.balance !== null && acc.balance !== undefined 
      ? ` - $${acc.balance.toLocaleString()}` 
      : '';
    return {
      label: `${name} (${acc.propfirm || acc.platform || 'Unknown'})${balance}`,
      value: acc
    };
  });
  leadOptions.push({ label: '< Back', value: 'back' });
  
  const leadAccount = await prompts.selectOption('Lead Account:', leadOptions);
  if (!leadAccount || leadAccount === 'back') return;
  
  // Step 2: Select FOLLOWER Account(s)
  console.log();
  console.log(chalk.yellow.bold('  STEP 2: SELECT FOLLOWER ACCOUNT(S)'));
  console.log(chalk.gray('  (Select accounts to copy trades to)'));
  
  const followers = [];
  const availableFollowers = activeAccounts.filter(a => a.accountId !== leadAccount.accountId);
  
  while (availableFollowers.length > 0) {
    const remaining = availableFollowers.filter(a => !followers.find(f => f.accountId === a.accountId));
    if (remaining.length === 0) break;
    
    const followerOptions = remaining.map(acc => {
      const name = acc.accountName || acc.rithmicAccountId || acc.accountId;
      const balance = acc.balance !== null && acc.balance !== undefined 
        ? ` - $${acc.balance.toLocaleString()}` 
        : '';
      return {
        label: `${name} (${acc.propfirm || acc.platform || 'Unknown'})${balance}`,
        value: acc
      };
    });
    
    if (followers.length > 0) {
      followerOptions.push({ label: chalk.green('✓ Done selecting followers'), value: 'done' });
    }
    followerOptions.push({ label: '< Back', value: 'back' });
    
    const msg = followers.length === 0 ? 'Select Follower:' : `Add another follower (${followers.length} selected):`;
    const selected = await prompts.selectOption(msg, followerOptions);
    
    if (!selected || selected === 'back') {
      if (followers.length === 0) return;
      break;
    }
    if (selected === 'done') break;
    
    followers.push(selected);
    console.log(chalk.green(`  ✓ Added: ${selected.accountName || selected.accountId}`));
  }
  
  if (followers.length === 0) {
    console.log(chalk.red('  No followers selected'));
    await prompts.waitForEnter();
    return;
  }
  
  // Step 3: Select Symbol
  console.log();
  console.log(chalk.magenta.bold('  STEP 3: SELECT SYMBOL'));
  const leadService = leadAccount.service || connections.getServiceForAccount(leadAccount.accountId);
  const contract = await selectSymbol(leadService);
  if (!contract) return;
  
  // Step 3b: Select Strategy
  const strategy = await selectStrategy();
  if (!strategy) return;
  
  // Step 4: Configure Parameters
  console.log();
  console.log(chalk.cyan.bold('  STEP 4: CONFIGURE PARAMETERS'));
  console.log();
  
  const leadContracts = await prompts.numberInput('Lead contracts:', 1, 1, 10);
  if (leadContracts === null) return;
  
  const followerContracts = await prompts.numberInput('Follower contracts (each):', leadContracts, 1, 10);
  if (followerContracts === null) return;
  
  const dailyTarget = await prompts.numberInput('Daily target ($):', 400, 1, 10000);
  if (dailyTarget === null) return;
  
  const maxRisk = await prompts.numberInput('Max risk ($):', 200, 1, 5000);
  if (maxRisk === null) return;
  
  const showNames = await prompts.confirmPrompt('Show account names?', false);
  if (showNames === null) return;
  
  // Check for AI Supervision
  const agentCount = getActiveAgentCount();
  let supervisionConfig = null;
  
  if (agentCount > 0) {
    console.log();
    console.log(chalk.cyan(`  ${agentCount} AI Agent(s) available for supervision`));
    const enableAI = await prompts.confirmPrompt('Enable AI Supervision?', true);
    
    if (enableAI) {
      // Run pre-flight check - ALL agents must pass
      console.log();
      console.log(chalk.yellow('  Running AI pre-algo check...'));
      console.log();
      
      const agents = getActiveAgents();
      const preflightResults = await runPreflightCheck(agents);
      
      // Display results
      const lines = formatPreflightResults(preflightResults, 60);
      for (const line of lines) console.log(line);
      
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
    }
  }
  
  // Summary
  console.log();
  console.log(chalk.white.bold('  SUMMARY:'));
  console.log(chalk.cyan(`  Strategy: ${strategy.name}`));
  console.log(chalk.cyan(`  Symbol: ${contract.name}`));
  console.log(chalk.cyan(`  Lead: ${leadAccount.propfirm} x${leadContracts}`));
  console.log(chalk.yellow(`  Followers (${followers.length}):`));
  for (const f of followers) {
    console.log(chalk.yellow(`    - ${f.propfirm} x${followerContracts}`));
  }
  console.log(chalk.cyan(`  Target: $${dailyTarget} | Risk: $${maxRisk}`));
  if (supervisionConfig) console.log(chalk.green(`  AI Supervision: ${agentCount} agent(s)`));
  console.log();
  
  const confirm = await prompts.confirmPrompt('Start Copy Trading?', true);
  if (!confirm) return;
  
  // Save config for next time
  saveCopyTradingConfig({
    leadAccountId: leadAccount.accountId || leadAccount.rithmicAccountId,
    leadAccountName: leadAccount.accountName || leadAccount.rithmicAccountId || leadAccount.accountId,
    leadPropfirm: leadAccount.propfirm || leadAccount.platform || 'Unknown',
    followerAccountIds: followers.map(f => f.accountId || f.rithmicAccountId),
    symbol: contract.symbol,
    strategyId: strategy.id,
    strategyName: strategy.name,
    leadContracts,
    followerContracts,
    dailyTarget,
    maxRisk,
    showNames
  });
  
  await launchCopyTrading({
    lead: { account: leadAccount, contracts: leadContracts },
    followers: followers.map(f => ({ account: f, contracts: followerContracts })),
    contract,
    strategy,
    dailyTarget,
    maxRisk,
    showNames,
    supervisionConfig
  });
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
 * Symbol selection - sorted with popular indices first
 */
const selectSymbol = async (service) => {
  const spinner = ora({ text: 'Loading symbols...', color: 'yellow' }).start();
  
  const contractsResult = await service.getContracts();
  if (!contractsResult.success || !contractsResult.contracts?.length) {
    spinner.fail('Failed to load contracts');
    return null;
  }
  
  let contracts = contractsResult.contracts;
  
  // Sort: Popular indices first
  const popularPrefixes = ['ES', 'NQ', 'MES', 'MNQ', 'M2K', 'RTY', 'YM', 'MYM', 'NKD', 'GC', 'SI', 'CL'];
  
  contracts.sort((a, b) => {
    const baseA = a.baseSymbol || a.symbol || '';
    const baseB = b.baseSymbol || b.symbol || '';
    const idxA = popularPrefixes.findIndex(p => baseA === p || baseA.startsWith(p));
    const idxB = popularPrefixes.findIndex(p => baseB === p || baseB.startsWith(p));
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

module.exports = { copyTradingMenu };
