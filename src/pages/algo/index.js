/**
 * Algo Trading - Main Menu with AI Supervision
 */

const chalk = require('chalk');
const ora = require('ora');
const { getLogoWidth, drawBoxHeaderContinue, drawBoxFooter, displayBanner } = require('../../ui');
const { logger, prompts } = require('../../utils');
const aiService = require('../../services/ai');
const AISupervisor = require('../../services/ai/supervisor');

const log = logger.scope('AlgoMenu');

const { oneAccountMenu } = require('./one-account');
const { copyTradingMenu } = require('./copy-trading');

/**
 * Algo Trading Menu with AI status
 */
const algoTradingMenu = async (service) => {
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
  
  log.info('Algo Trading menu opened');
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('ALGO TRADING', boxWidth);
  
  // Get AI status
  const aiAgents = aiService.getAgents();
  const aiConnected = aiAgents.length > 0;
  const activeAgent = aiService.getActiveAgent();
  const supervisionStatus = AISupervisor.getAllStatus();
  
  // Show AI supervision status
  if (aiConnected && activeAgent) {
    console.log(makeLine(chalk.green(`AI SUPERVISION: ACTIVE`), 'center'));
    console.log(makeLine(chalk.magenta(`AGENT: ${activeAgent.name}`), 'center'));
    
    if (supervisionStatus.length > 0) {
      const supervisor = supervisionStatus[0];
      const duration = Math.floor(supervisor.duration / 1000);
      console.log(makeLine(chalk.gray(`SESSION: ${duration}s | DECISIONS: ${supervisor.metrics.totalDecisions}`), 'center'));
      
      if (supervisor.lastDecision) {
        console.log(makeLine(chalk.yellow(`LAST: ${supervisor.lastDecision.reason.substring(0, 50)}...`), 'center'));
      }
    }
  } else {
    console.log(makeLine(chalk.gray('AI SUPERVISION: INACTIVE'), 'center'));
  }
  
  console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
  
  // Menu options
  const options = [];
  
  if (aiConnected && activeAgent) {
    options.push({ label: chalk.cyan('[1] HQX ULTRA SCALPING (AI SUPERVISED)'), value: 'ai_supervised' });
    options.push({ label: chalk.white('[2] HQX ULTRA SCALPING (MANUAL MODE)'), value: 'one_account' });
    options.push({ label: chalk.magenta('[3] AI SUPERVISION DASHBOARD'), value: 'ai_dashboard' });
  } else {
    options.push({ label: chalk.cyan('[1] HQX ULTRA SCALPING (MANUAL MODE)'), value: 'one_account' });
    options.push({ label: chalk.gray('[2] HQX ULTRA SCALPING (AI SUPERVISED) - NO AI AGENT'), value: 'no_agent' });
  }
  
  options.push({ label: chalk.white('[C] COPY TRADING'), value: 'copy_trading' });
  options.push({ label: chalk.gray('[<] BACK'), value: 'back' });
  
  for (const opt of options) {
    console.log(makeLine(opt.label));
  }
  
  drawBoxFooter(boxWidth);
  
  const choice = await prompts.textInput(chalk.cyan('SELECT:'));
  
  switch (choice?.toLowerCase()) {
    case '1':
      if (aiConnected && activeAgent) {
        return await startAISupervised(service, activeAgent);
      } else {
        await oneAccountMenu(service);
      }
      break;
      
    case '2':
      if (aiConnected && activeAgent) {
        await oneAccountMenu(service);
      } else {
        console.log(chalk.yellow('\n  NO AI AGENT CONNECTED'));
        console.log(chalk.gray('  Connect an AI agent first from [I] AI AGENTS menu'));
        await prompts.waitForEnter();
      }
      break;
      
    case '3':
      if (aiConnected && activeAgent) {
        await showAIDashboard(activeAgent);
      }
      break;
      
    case 'c':
      await copyTradingMenu();
      break;
      
    case '<':
    case 'b':
      return 'back';
      
    default:
      // Handle direct number input
      const num = parseInt(choice);
      if (num === 1) {
        if (aiConnected && activeAgent) {
          return await startAISupervised(service, activeAgent);
        } else {
          await oneAccountMenu(service);
        }
      } else if (num === 2) {
        if (aiConnected && activeAgent) {
          await oneAccountMenu(service);
        } else {
          console.log(chalk.yellow('\n  NO AI AGENT CONNECTED'));
          await prompts.waitForEnter();
        }
      } else if (num === 3 && aiConnected && activeAgent) {
        await showAIDashboard(activeAgent);
      }
      break;
  }
  
  return algoTradingMenu(service);
};

/**
 * Start AI supervised trading
 */
const startAISupervised = async (service, agent) => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  console.clear();
  displayBanner();
  drawBoxHeaderContinue('AI SUPERVISED TRADING', boxWidth);
  
  console.log(makeLine(chalk.magenta(`AGENT: ${agent.name}`)));
  console.log(makeLine(chalk.green('STATUS: STARTING SUPERVISION...')));
  
  drawBoxFooter(boxWidth);
  
  // Start AI supervision
  const success = AISupervisor.start(agent.id, { /* algo target */ });
  
  if (success) {
    const spinner = ora({ text: 'INITIALIZING AI SUPERVISION...', color: 'cyan' }).start();
    
    // Simulate initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    spinner.succeed('AI SUPERVISION ACTIVE');
    console.log(chalk.green('\n  ✓ Agent is now monitoring HQX Ultra Scalping'));
    console.log(chalk.gray('  ✓ AI will optimize parameters and manage risk'));
    console.log(chalk.gray('  ✓ Supervision continues until agent is disconnected'));
    
    await prompts.waitForEnter();
    
    // Launch algo trading with AI supervision active
    return await oneAccountMenu(service);
    
  } else {
    console.log(chalk.red('\n  ✗ Failed to start AI supervision'));
    await prompts.waitForEnter();
  }
};

/**
 * Show AI Dashboard
 */
const showAIDashboard = async (agent) => {
  const boxWidth = getLogoWidth();
  const W = boxWidth - 2;
  
  const makeLine = (content) => {
    const plainLen = content.replace(/\x1b\[[0-9;]*m/g, '').length;
    const padding = W - plainLen;
    return chalk.cyan('║') + ' ' + content + ' '.repeat(Math.max(0, padding - 1)) + chalk.cyan('║');
  };
  
  const supervisionStatus = AISupervisor.getStatus(agent.id);
  
  while (true) {
    console.clear();
    displayBanner();
    drawBoxHeaderContinue('AI SUPERVISION DASHBOARD', boxWidth);
    
    console.log(makeLine(chalk.magenta(`AGENT: ${agent.name}`)));
    console.log(makeLine(chalk.green(`STATUS: ${supervisionStatus.active ? 'ACTIVE' : 'INACTIVE'}`)));
    
    if (supervisionStatus.active) {
      const duration = Math.floor(supervisionStatus.duration / 1000);
      console.log(makeLine(chalk.gray(`SESSION: ${duration}s`)));
      console.log(makeLine(chalk.gray(`DECISIONS: ${supervisionStatus.decisions}`)));
      console.log(makeLine(chalk.yellow(`INTERVENTIONS: ${supervisionStatus.interventions}`)));
      console.log(makeLine(chalk.cyan(`OPTIMIZATIONS: ${supervisionStatus.optimizations}`)));
      
      console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
      
      if (supervisionStatus.lastDecision) {
        const decision = supervisionStatus.lastDecision;
        console.log(makeLine(chalk.white('LAST DECISION:')));
        console.log(makeLine(chalk.gray(`  Type: ${decision.type}`)));
        console.log(makeLine(chalk.gray(`  Reason: ${decision.reason}`)));
        console.log(makeLine(chalk.gray(`  Confidence: ${decision.confidence}%`)));
      } else {
        console.log(makeLine(chalk.gray('No decisions yet...')));
      }
    }
    
    console.log(chalk.cyan('╠' + '═'.repeat(W) + '╣'));
    console.log(makeLine(chalk.gray('[<] BACK')));
    
    drawBoxFooter(boxWidth);
    
    const choice = await prompts.textInput(chalk.cyan('PRESS < TO GO BACK:'));
    
    if (choice === '<' || choice?.toLowerCase() === 'b') {
      break;
    }
    
    // Refresh data
    const freshStatus = AISupervisor.getStatus(agent.id);
    Object.assign(supervisionStatus, freshStatus);
  }
};

module.exports = { algoTradingMenu };