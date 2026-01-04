/**
 * One Account Mode - HQX Ultra Scalping
 * 
 * FAST PATH: Rithmic direct execution (~10-50ms latency)
 * SLOW PATH: ProjectX/Tradovate HTTP REST (~50-150ms latency)
 */

const chalk = require('chalk');
const ora = require('ora');
const readline = require('readline');

const { connections } = require('../../services');
const { AlgoUI, renderSessionSummary } = require('./ui');
const { prompts } = require('../../utils');
const { checkMarketHours } = require('../../services/projectx/market');
const { FAST_SCALPING } = require('../../config/settings');
const { PositionManager } = require('../../services/position-manager');

// Strategy & Market Data (obfuscated)
const { M1 } = require('../../../dist/lib/m/s1');
const { MarketDataFeed } = require('../../../dist/lib/data');
const { algoLogger } = require('./logger');

// AI Strategy Supervisor - observes, learns, and optimizes the strategy
const aiService = require('../../services/ai');
const StrategySupervisor = require('../../services/ai/strategy-supervisor');



/**
 * One Account Menu
 */
const oneAccountMenu = async (service) => {
  // Check if market is open (skip early close check - market may still be open)
  const market = checkMarketHours();
  if (!market.isOpen && !market.message.includes('early')) {
    console.log();
    console.log(chalk.red(`  ${market.message}`));
    console.log(chalk.gray('  ALGO TRADING IS ONLY AVAILABLE WHEN MARKET IS OPEN'));
    console.log();
    await prompts.waitForEnter();
    return;
  }
  
  const spinner = ora({ text: 'FETCHING ACTIVE ACCOUNTS...', color: 'yellow' }).start();
  
  const allAccounts = await connections.getAllAccounts();
  
  if (!allAccounts?.length) {
    spinner.fail('NO ACCOUNTS FOUND');
    await prompts.waitForEnter();
    return;
  }
  
  const activeAccounts = allAccounts.filter(acc => acc.status === 0);
  
  if (!activeAccounts.length) {
    spinner.fail('NO ACTIVE ACCOUNTS');
    await prompts.waitForEnter();
    return;
  }
  
  spinner.succeed(`FOUND ${activeAccounts.length} ACTIVE ACCOUNT(S)`);
  
  // Select account - display RAW API fields
  const options = activeAccounts.map(acc => {
    // Use what API returns: accountName for ProjectX, rithmicAccountId for Rithmic
    const name = acc.accountName || acc.rithmicAccountId || acc.accountId;
    const balance = acc.balance !== null && acc.balance !== undefined 
      ? ` - $${acc.balance.toLocaleString()}` 
      : '';
    return {
      label: `${name} (${acc.propfirm || acc.platform || 'Unknown'})${balance}`,
      value: acc
    };
  });
  options.push({ label: '< BACK', value: 'back' });
  
  const selectedAccount = await prompts.selectOption('SELECT ACCOUNT:', options);
  if (!selectedAccount || selectedAccount === 'back') return;
  
  // Use the service attached to the account (from getAllAccounts), fallback to getServiceForAccount
  const accountService = selectedAccount.service || connections.getServiceForAccount(selectedAccount.accountId) || service;
  
  // Select symbol
  const contract = await selectSymbol(accountService, selectedAccount);
  if (!contract) return;
  
  // Configure algo
  const config = await configureAlgo(selectedAccount, contract);
  if (!config) return;
  
  await launchAlgo(accountService, selectedAccount, contract, config);
};

/**
 * Symbol selection - sorted with popular indices first
 */
const selectSymbol = async (service, account) => {
  const spinner = ora({ text: 'LOADING SYMBOLS...', color: 'yellow' }).start();
  
  const contractsResult = await service.getContracts();
  if (!contractsResult.success || !contractsResult.contracts?.length) {
    spinner.fail('FAILED TO LOAD CONTRACTS');
    return null;
  }
  
  let contracts = contractsResult.contracts;
  
  // Sort: Popular indices first (ES, NQ, MES, MNQ, RTY, YM, etc.)
  const popularPrefixes = ['ES', 'NQ', 'MES', 'MNQ', 'M2K', 'RTY', 'YM', 'MYM', 'NKD', 'GC', 'SI', 'CL'];
  
  contracts.sort((a, b) => {
    const nameA = a.name || '';
    const nameB = b.name || '';
    
    // Check if names start with popular prefixes
    const idxA = popularPrefixes.findIndex(p => nameA.startsWith(p));
    const idxB = popularPrefixes.findIndex(p => nameB.startsWith(p));
    
    // Both are popular - sort by popularity order
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    // Only A is popular - A first
    if (idxA !== -1) return -1;
    // Only B is popular - B first
    if (idxB !== -1) return 1;
    // Neither - alphabetical
    return nameA.localeCompare(nameB);
  });
  
  spinner.succeed(`FOUND ${contracts.length} CONTRACTS`);
  
  // Display sorted contracts from API
  const options = contracts.map(c => ({
    label: `${c.name} - ${c.description}`,
    value: c
  }));
  
  options.push({ label: chalk.gray('< BACK'), value: 'back' });
  
  const contract = await prompts.selectOption(chalk.yellow('SELECT SYMBOL:'), options);
  return contract === 'back' || contract === null ? null : contract;
};

/**
 * Configure algo
 */
const configureAlgo = async (account, contract) => {
  console.log();
  console.log(chalk.cyan('  CONFIGURE ALGO PARAMETERS'));
  console.log();
  
  const contracts = await prompts.numberInput('NUMBER OF CONTRACTS:', 1, 1, 10);
  if (contracts === null) return null;
  
  const dailyTarget = await prompts.numberInput('DAILY TARGET ($):', 1000, 1, 10000);
  if (dailyTarget === null) return null;

  const maxRisk = await prompts.numberInput('MAX RISK ($):', 500, 1, 5000);
  if (maxRisk === null) return null;
  
  const showName = await prompts.confirmPrompt('SHOW ACCOUNT NAME?', false);
  if (showName === null) return null;
  
  // Check if AI agents are available
  const aiAgents = aiService.getAgents();
  let enableAI = false;
  
  if (aiAgents.length > 0) {
    // Show available agents
    console.log();
    console.log(chalk.magenta(`  ${aiAgents.length} AI AGENT(S) AVAILABLE:`));
    aiAgents.forEach((agent, i) => {
      const modelInfo = agent.model ? chalk.gray(` (${agent.model})`) : '';
      console.log(chalk.white(`    ${i + 1}. ${agent.name}${modelInfo}`));
    });
    console.log();
    
    enableAI = await prompts.confirmPrompt('CONNECT AI AGENTS TO ALGO?', true);
    if (enableAI === null) return null;
    
    if (enableAI) {
      const mode = aiAgents.length >= 2 ? 'CONSENSUS' : 'INDIVIDUAL';
      console.log(chalk.green(`  AI MODE: ${mode} (${aiAgents.length} agent${aiAgents.length > 1 ? 's' : ''})`));
    } else {
      console.log(chalk.gray('  AI AGENTS DISABLED FOR THIS SESSION'));
    }
  }
  
  console.log();
  const confirm = await prompts.confirmPrompt('START ALGO TRADING?', true);
  if (!confirm) return null;
  
  // Show spinner while initializing
  const initSpinner = ora({ text: 'INITIALIZING ALGO TRADING...', color: 'yellow' }).start();
  await new Promise(r => setTimeout(r, 500));
  initSpinner.succeed('LAUNCHING ALGO...');
  
  return { contracts, dailyTarget, maxRisk, showName, enableAI };
};

/**
 * Check if service supports fast path (Rithmic direct)
 * @param {Object} service - Trading service
 * @returns {boolean}
 */
const isRithmicFastPath = (service) => {
  return typeof service.fastEntry === 'function' && 
         typeof service.fastExit === 'function' &&
         service.orderConn?.isConnected;
};

/**
 * Launch algo trading - HQX Ultra Scalping Strategy
 * Real-time market data + Strategy signals + Auto order execution
 * AI Supervision: All connected agents monitor and supervise trading
 * 
 * FAST PATH (Rithmic): Uses fastEntry() for ~10-50ms latency
 * SLOW PATH (ProjectX): Uses placeOrder() for ~50-150ms latency
 */
const launchAlgo = async (service, account, contract, config) => {
  const { contracts, dailyTarget, maxRisk, showName } = config;
  
  // Use RAW API fields only - NO hardcoded fallbacks
  const accountName = showName 
    ? (account.accountName || account.rithmicAccountId || account.accountId) 
    : 'HQX *****';
  const symbolName = contract.name;
  const contractId = contract.id;
  const connectionType = account.platform || 'ProjectX';
  
  // Tick size/value from API - null if not available (RULES.md compliant)
  const tickSize = contract.tickSize ?? null;
  const tickValue = contract.tickValue ?? null;
  
  // Determine execution path
  const useFastPath = isRithmicFastPath(service);
  
  const ui = new AlgoUI({ subtitle: 'HQX ULTRA SCALPING', mode: 'one-account' });
  
  const stats = {
    accountName,
    symbol: symbolName,
    qty: contracts,
    target: dailyTarget,
    risk: maxRisk,
    propfirm: account.propfirm || 'Unknown',
    platform: connectionType,
    pnl: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    latency: 0,
    connected: false,
    startTime: Date.now(),
    aiSupervision: false,
    aiMode: null,
    // Fast path stats
    fastPath: useFastPath,
    avgEntryLatency: 0,
    avgFillLatency: 0,
    entryLatencies: [],
  };
  
  let running = true;
  let stopReason = null;
  let startingPnL = null;
  let currentPosition = 0; // Current position qty (+ long, - short)
  let pendingOrder = false; // Prevent duplicate orders
  let tickCount = 0;
  let lastTradeCount = 0; // Track number of trades from API
  let lastPositionQty = 0; // Track position changes
  
  // Initialize Strategy FIRST (M1 is singleton instance)
  // Strategy needs to be initialized before PositionManager so it can access math models
  const strategy = M1;
  
  // Only initialize strategy if we have tick data from API
  if (tickSize !== null && tickValue !== null) {
    strategy.initialize(contractId, tickSize, tickValue);
  } else {
    algoLogger.warn(ui, 'WARNING', 'Tick size/value not available from API');
  }
  
  // Initialize Position Manager for fast path
  let positionManager = null;
  if (useFastPath) {
    // Pass strategy reference so PositionManager can access math models
    positionManager = new PositionManager(service, strategy);
    
    // Set contract info from API (NOT hardcoded)
    if (tickSize !== null && tickValue !== null) {
      positionManager.setContractInfo(symbolName, {
        tickSize,
        tickValue,
        contractId,
      });
    }
    
    positionManager.start();
    
    // Listen for position manager events
    positionManager.on('entryFilled', ({ orderTag, position, fillLatencyMs }) => {
      stats.entryLatencies.push(fillLatencyMs);
      stats.avgFillLatency = stats.entryLatencies.reduce((a, b) => a + b, 0) / stats.entryLatencies.length;
      algoLogger.info(ui, 'FAST FILL', `${fillLatencyMs}ms | avg=${stats.avgFillLatency.toFixed(1)}ms`);
    });
    
    positionManager.on('exitFilled', ({ orderTag, exitPrice, pnlTicks, holdDurationMs }) => {
      // Calculate PnL in dollars only if tickValue is available from API
      if (pnlTicks !== null && tickValue !== null) {
        const pnlDollars = pnlTicks * tickValue;
        if (pnlDollars >= 0) {
          stats.wins++;
          algoLogger.targetHit(ui, symbolName, exitPrice, pnlDollars);
        } else {
          stats.losses++;
          algoLogger.stopHit(ui, symbolName, exitPrice, Math.abs(pnlDollars));
        }
      } else {
        // Log with ticks only if tickValue unavailable
        if (pnlTicks !== null && pnlTicks >= 0) {
          stats.wins++;
          algoLogger.info(ui, 'TARGET', `+${pnlTicks} ticks`);
        } else if (pnlTicks !== null) {
          stats.losses++;
          algoLogger.info(ui, 'STOP', `${pnlTicks} ticks`);
        }
      }
      stats.trades++;
      currentPosition = 0;
      pendingOrder = false;
      algoLogger.info(ui, 'HOLD TIME', `${(holdDurationMs / 1000).toFixed(1)}s`);
    });
    
    positionManager.on('holdComplete', ({ orderTag, position }) => {
      algoLogger.info(ui, 'HOLD COMPLETE', `${FAST_SCALPING.MIN_HOLD_MS / 1000}s minimum reached`);
    });
    
    positionManager.on('exitOrderFired', ({ orderTag, exitReason, latencyMs }) => {
      algoLogger.info(ui, 'EXIT FIRED', `${exitReason.reason} | ${latencyMs.toFixed(1)}ms`);
    });
  }
  
  // Initialize AI Strategy Supervisor - agents observe, learn & optimize
  // Only if user enabled AI in config
  if (config.enableAI) {
    const aiAgents = aiService.getAgents();
    if (aiAgents.length > 0) {
      const supervisorResult = StrategySupervisor.initialize(strategy, aiAgents, service, account.accountId);
      stats.aiSupervision = supervisorResult.success;
      stats.aiMode = supervisorResult.mode;
    }
  }
  
  // Initialize Market Data Feed
  const marketFeed = new MarketDataFeed({ propfirm: account.propfirm });
  
  // Smart startup logs (same as HQX-TG)
  const market = checkMarketHours();
  const sessionName = market.session || 'AMERICAN';
  const etTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });
  
  algoLogger.connectingToEngine(ui, account.accountId);
  algoLogger.engineStarting(ui, connectionType, dailyTarget, maxRisk);
  algoLogger.marketOpen(ui, sessionName.toUpperCase(), etTime);
  
  // Log AI supervision status
  if (stats.aiSupervision) {
    algoLogger.info(ui, 'AI SUPERVISION', `${aiAgents.length} agent(s) - ${stats.aiMode} mode - LEARNING ACTIVE`);
  }
  
  // Log execution path
  if (useFastPath) {
    algoLogger.info(ui, 'FAST PATH', `Rithmic direct | Target <${FAST_SCALPING.LATENCY_TARGET_MS}ms | Hold ${FAST_SCALPING.MIN_HOLD_MS / 1000}s`);
  } else {
    algoLogger.info(ui, 'SLOW PATH', `HTTP REST | Bracket orders enabled`);
  }
  
  // Handle strategy signals
  strategy.on('signal', async (signal) => {
    if (!running || pendingOrder || currentPosition !== 0) return;
    
    // Fast path: check if position manager allows new entry
    if (useFastPath && positionManager && !positionManager.canEnter(symbolName)) {
      algoLogger.info(ui, 'BLOCKED', 'Existing position in symbol');
      return;
    }
    
    const { side, direction, entry, stopLoss, takeProfit, confidence } = signal;
    
    // Feed signal to AI supervisor (agents observe the signal)
    if (stats.aiSupervision) {
      StrategySupervisor.feedSignal({ direction, entry, stopLoss, takeProfit, confidence });
      
      // Check AI advice - agents may recommend caution based on learned patterns
      const advice = StrategySupervisor.shouldTrade();
      if (!advice.proceed) {
        algoLogger.info(ui, 'AI HOLD', advice.reason);
        return; // Skip - agents learned this pattern leads to losses
      }
    }
    
    // Calculate position size with kelly
    let kelly = Math.min(0.25, confidence);
    let riskAmount = Math.round(maxRisk * kelly);
    
    // AI may adjust size based on learning
    if (stats.aiSupervision) {
      const advice = StrategySupervisor.getCurrentAdvice();
      if (advice.sizeMultiplier && advice.sizeMultiplier !== 1.0) {
        kelly = kelly * advice.sizeMultiplier;
        riskAmount = Math.round(riskAmount * advice.sizeMultiplier);
        algoLogger.info(ui, 'AI ADJUST', `Size x${advice.sizeMultiplier.toFixed(2)} - ${advice.reason}`);
      }
    }
    
    const riskPct = Math.round((riskAmount / maxRisk) * 100);
    algoLogger.positionSized(ui, contracts, kelly, riskAmount, riskPct);
    
    // Place order via API
    pendingOrder = true;
    const orderSide = direction === 'long' ? 0 : 1; // 0=Buy, 1=Sell
    
    try {
      // ═══════════════════════════════════════════════════════════════
      // FAST PATH: Rithmic direct execution (~10-50ms)
      // ═══════════════════════════════════════════════════════════════
      if (useFastPath && positionManager) {
        const orderData = {
          accountId: account.accountId,
          symbol: symbolName,
          exchange: contract.exchange || 'CME',
          size: contracts,
          side: orderSide,
        };
        
        // Fire-and-forget entry (no await on fill)
        const entryResult = service.fastEntry(orderData);
        
        if (entryResult.success) {
          // Register with position manager for lifecycle tracking
          // Pass contract info from API (NOT hardcoded)
          const contractInfo = {
            tickSize,
            tickValue,
            contractId,
          };
          positionManager.registerEntry(entryResult, orderData, contractInfo);
          
          currentPosition = direction === 'long' ? contracts : -contracts;
          const sideStr = direction === 'long' ? 'BUY' : 'SELL';
          
          // Log with latency
          const latencyColor = entryResult.latencyMs < FAST_SCALPING.LATENCY_TARGET_MS 
            ? chalk.green 
            : entryResult.latencyMs < FAST_SCALPING.LATENCY_WARN_MS 
              ? chalk.yellow 
              : chalk.red;
          
          stats.avgEntryLatency = stats.entryLatencies.length > 0 
            ? (stats.avgEntryLatency * stats.entryLatencies.length + entryResult.latencyMs) / (stats.entryLatencies.length + 1)
            : entryResult.latencyMs;
          
          algoLogger.info(ui, 'FAST ENTRY', `${sideStr} ${contracts}x ${symbolName} | ${latencyColor(entryResult.latencyMs.toFixed(2) + 'ms')}`);
          algoLogger.info(ui, 'HOLD START', `Min ${FAST_SCALPING.MIN_HOLD_MS / 1000}s before exit`);
          
          // Note: NO bracket orders in fast path
          // PositionManager handles exit logic after 10s hold
          
        } else {
          algoLogger.orderRejected(ui, symbolName, entryResult.error || 'Fast entry failed');
          pendingOrder = false;
        }
        
      // ═══════════════════════════════════════════════════════════════
      // SLOW PATH: ProjectX/Tradovate HTTP REST (~50-150ms)
      // ═══════════════════════════════════════════════════════════════
      } else {
        const orderResult = await service.placeOrder({
          accountId: account.accountId,
          contractId: contractId,
          type: 2, // Market order
          side: orderSide,
          size: contracts
        });
        
        if (orderResult.success) {
          currentPosition = direction === 'long' ? contracts : -contracts;
          stats.trades++;
          const sideStr = direction === 'long' ? 'BUY' : 'SELL';
          const positionSide = direction === 'long' ? 'LONG' : 'SHORT';
          
          algoLogger.orderSubmitted(ui, symbolName, sideStr, contracts, entry);
          algoLogger.orderFilled(ui, symbolName, sideStr, contracts, entry);
          algoLogger.positionOpened(ui, symbolName, positionSide, contracts, entry);
          algoLogger.entryConfirmed(ui, sideStr, contracts, symbolName, entry);
          
          // Place bracket orders (SL/TP) - SLOW PATH ONLY
          if (stopLoss && takeProfit) {
            // Stop Loss
            await service.placeOrder({
              accountId: account.accountId,
              contractId: contractId,
              type: 4, // Stop order
              side: direction === 'long' ? 1 : 0, // Opposite side
              size: contracts,
              stopPrice: stopLoss
            });
            
            // Take Profit
            await service.placeOrder({
              accountId: account.accountId,
              contractId: contractId,
              type: 1, // Limit order
              side: direction === 'long' ? 1 : 0,
              size: contracts,
              limitPrice: takeProfit
            });
            
            algoLogger.stopsSet(ui, stopLoss, takeProfit);
          }
          pendingOrder = false;
        } else {
          algoLogger.orderRejected(ui, symbolName, orderResult.error || 'Unknown error');
          pendingOrder = false;
        }
      }
    } catch (e) {
      algoLogger.error(ui, 'ORDER ERROR', e.message);
      pendingOrder = false;
    }
  });
  
  // Handle market data ticks
  let lastHeartbeat = Date.now();
  let tps = 0;
  
  marketFeed.on('tick', (tick) => {
    tickCount++;
    tps++;
    const latencyStart = Date.now();
    
    // Debug: log first tick to see structure
    if (tickCount === 1) {
      algoLogger.info(ui, 'FIRST TICK', `price=${tick.price} bid=${tick.bid} ask=${tick.ask} vol=${tick.volume}`);
    }
    
    // Feed tick to strategy
    const tickData = {
      contractId: tick.contractId || contractId,
      price: tick.price || tick.lastPrice || tick.bid,
      bid: tick.bid,
      ask: tick.ask,
      volume: tick.volume || tick.size || 1,
      side: tick.lastTradeSide || tick.side || 'unknown',
      timestamp: tick.timestamp || Date.now()
    };
    
    // Feed tick to AI supervisor (agents observe same data as strategy)
    if (stats.aiSupervision) {
      StrategySupervisor.feedTick(tickData);
    }
    
    strategy.processTick(tickData);
    
    // Feed price to position manager for exit monitoring (fast path)
    if (useFastPath && positionManager) {
      // Update latest price for position monitoring
      service.emit('priceUpdate', {
        symbol: symbolName,
        price: tickData.price,
        timestamp: tickData.timestamp,
      });
      
      // Get momentum data from strategy if available
      const modelValues = strategy.getModelValues?.(contractId);
      if (modelValues) {
        positionManager.updateMomentum(symbolName, {
          ofi: modelValues.ofi || 0,
          zscore: modelValues.zscore || 0,
          delta: modelValues.delta || 0,
          timestamp: tickData.timestamp,
        });
      }
    }
    
    stats.latency = Date.now() - latencyStart;
    
    // Heartbeat every 30 seconds (smart log instead of tick count)
    if (Date.now() - lastHeartbeat > 30000) {
      algoLogger.heartbeat(ui, tps, stats.latency);
      lastHeartbeat = Date.now();
      tps = 0;
    }
  });
  
  marketFeed.on('connected', () => {
    stats.connected = true;
    algoLogger.dataConnected(ui, 'RTC');
    algoLogger.algoOperational(ui, connectionType);
  });
  
  marketFeed.on('error', (err) => {
    algoLogger.error(ui, 'MARKET ERROR', err.message);
  });
  
  marketFeed.on('disconnected', (err) => {
    stats.connected = false;
    algoLogger.dataDisconnected(ui, 'WEBSOCKET', err?.message);
  });
  
  // Connect to market data
  try {
    const propfirmKey = (account.propfirm || 'topstep').toLowerCase().replace(/\s+/g, '_');
    
    // CRITICAL: Get a fresh token for WebSocket connection
    // TopStep invalidates WebSocket sessions for old tokens
    algoLogger.info(ui, 'REFRESHING AUTH TOKEN...');
    const token = await service.getFreshToken?.() || service.token || service.getToken?.();
    
    if (!token) {
      algoLogger.error(ui, 'NO AUTH TOKEN', 'Please reconnect');
    } else {
      algoLogger.info(ui, 'TOKEN OK', `${token.length} chars`);
      algoLogger.info(ui, 'CONNECTING', `${propfirmKey.toUpperCase()} | ${contractId}`);
      
      await marketFeed.connect(token, propfirmKey);
      
      // Wait for connection to stabilize
      await new Promise(r => setTimeout(r, 2000));
      
      if (marketFeed.isConnected()) {
        await marketFeed.subscribe(symbolName, contractId);
        algoLogger.info(ui, 'SUBSCRIBED', `${symbolName} real-time feed active`);
      } else {
        algoLogger.error(ui, 'CONNECTION LOST', 'Before subscribe');
      }
    }
  } catch (e) {
    algoLogger.error(ui, 'CONNECTION ERROR', e.message.substring(0, 50));
  }
  
  // Poll account P&L and sync with real trades from API
  const pollPnL = async () => {
    try {
      // Get account P&L
      const accountResult = await service.getTradingAccounts();
      if (accountResult.success && accountResult.accounts) {
        const acc = accountResult.accounts.find(a => a.accountId === account.accountId);
        if (acc && acc.profitAndLoss !== undefined) {
          if (startingPnL === null) startingPnL = acc.profitAndLoss;
          stats.pnl = acc.profitAndLoss - startingPnL;
        }
      }
      
      // Check positions - detect when position closes
      const posResult = await service.getPositions(account.accountId);
      if (posResult.success && posResult.positions) {
        const pos = posResult.positions.find(p => {
          const sym = p.contractId || p.symbol || '';
          return sym.includes(contract.name) || sym.includes(contractId);
        });
        
        const newPositionQty = pos?.quantity || 0;
        
        // Position just closed - cancel remaining orders and log result
        if (lastPositionQty !== 0 && newPositionQty === 0) {
          // Cancel all open orders to prevent new positions
          try {
            await service.cancelAllOrders(account.accountId);
            algoLogger.info(ui, 'ORDERS CANCELLED', 'Position closed - brackets removed');
          } catch (e) {
            // Silent fail
          }
          
          // Get real trade data from API
          try {
            const tradesResult = await service.getTrades(account.accountId);
            if (tradesResult.success && tradesResult.trades?.length > 0) {
              // Count completed trades (those with profitAndLoss not null)
              const completedTrades = tradesResult.trades.filter(t => t.profitAndLoss !== null);
              
              // Update stats from real trades
              let wins = 0, losses = 0;
              for (const trade of completedTrades) {
                if (trade.profitAndLoss > 0) wins++;
                else if (trade.profitAndLoss < 0) losses++;
              }
              stats.trades = completedTrades.length;
              stats.wins = wins;
              stats.losses = losses;
              
              // Log the trade that just closed
              const lastTrade = completedTrades[completedTrades.length - 1];
              if (lastTrade) {
                const pnl = lastTrade.profitAndLoss || 0;
                const side = lastTrade.side === 0 ? 'LONG' : 'SHORT';
                const exitPrice = lastTrade.price || 0;
                
                if (pnl >= 0) {
                  algoLogger.targetHit(ui, symbolName, exitPrice, pnl);
                } else {
                  algoLogger.stopHit(ui, symbolName, exitPrice, Math.abs(pnl));
                }
                algoLogger.positionClosed(ui, symbolName, side, contracts, exitPrice, pnl);
                
                // Record in strategy for adaptation
                strategy.recordTradeResult(pnl);
                
                // Feed trade result to AI supervisor - THIS IS WHERE AGENTS LEARN
                if (stats.aiSupervision) {
                  StrategySupervisor.feedTradeResult({
                    side,
                    qty: contracts,
                    price: exitPrice,
                    pnl,
                    symbol: symbolName,
                    direction: side
                  });
                  
                  // Log if AI learned something
                  const status = StrategySupervisor.getStatus();
                  if (status.patternsLearned.winning + status.patternsLearned.losing > 0) {
                    algoLogger.info(ui, 'AI LEARNING', 
                      `${status.patternsLearned.winning}W/${status.patternsLearned.losing}L patterns`);
                  }
                }
              }
            }
          } catch (e) {
            // Silent fail - trades API might not be available
          }
        }
        
        lastPositionQty = newPositionQty;
        currentPosition = newPositionQty;
      }
      
      // Check target/risk
      if (stats.pnl >= dailyTarget) {
        stopReason = 'target';
        running = false;
        algoLogger.info(ui, 'DAILY TARGET REACHED', `+$${stats.pnl.toFixed(2)}`);
      } else if (stats.pnl <= -maxRisk) {
        stopReason = 'risk';
        running = false;
        algoLogger.dailyLimitWarning(ui, stats.pnl, -maxRisk);
      }
    } catch (e) {
      // Silently handle polling errors
    }
  };
  
  // Start polling and UI refresh
  const refreshInterval = setInterval(() => { if (running) ui.render(stats); }, 250);
  const pnlInterval = setInterval(() => { if (running) pollPnL(); }, 2000);
  pollPnL(); // Initial poll
  
  // Keyboard handler
  const setupKeyHandler = () => {
    if (!process.stdin.isTTY) return;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    
    const onKey = (str, key) => {
      if (key && (key.name === 'x' || key.name === 'X' || (key.ctrl && key.name === 'c'))) {
        running = false;
        stopReason = 'manual';
      }
    };
    process.stdin.on('keypress', onKey);
    return () => {
      process.stdin.removeListener('keypress', onKey);
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    };
  };
  
  const cleanupKeys = setupKeyHandler();
  
  // Wait for stop
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (!running) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });
  
  // Cleanup with timeout protection
  clearInterval(refreshInterval);
  clearInterval(pnlInterval);
  
  // Stop Position Manager (fast path)
  if (positionManager) {
    positionManager.stop();
    positionManager = null;
  }
  
  // Stop AI Supervisor and get learning summary
  if (stats.aiSupervision) {
    const aiSummary = StrategySupervisor.stop();
    stats.aiLearning = {
      optimizations: aiSummary.optimizationsApplied || 0,
      patternsLearned: (aiSummary.winningPatterns || 0) + (aiSummary.losingPatterns || 0)
    };
  }
  
  // Disconnect market feed with timeout
  try {
    await Promise.race([
      marketFeed.disconnect(),
      new Promise(r => setTimeout(r, 3000))
    ]);
  } catch {}
  
  // Cleanup keyboard handler
  try { if (cleanupKeys) cleanupKeys(); } catch {}
  
  // Cleanup UI
  try { ui.cleanup(); } catch {}
  
  // Reset stdin
  try {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.resume();
  } catch {}
  
  // Duration
  const durationMs = Date.now() - stats.startTime;
  const hours = Math.floor(durationMs / 3600000);
  const minutes = Math.floor((durationMs % 3600000) / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  stats.duration = hours > 0 
    ? `${hours}h ${minutes}m ${seconds}s`
    : minutes > 0 
      ? `${minutes}m ${seconds}s`
      : `${seconds}s`;
  
  // Summary
  renderSessionSummary(stats, stopReason);
  
  console.log('\n  RETURNING TO MENU IN 3 SECONDS...');
  await new Promise(resolve => setTimeout(resolve, 3000));
};

module.exports = { oneAccountMenu };
