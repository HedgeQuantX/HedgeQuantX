/**
 * AI Strategy Supervisor
 * 
 * Observes, learns from, and optimizes the HQX Ultra Scalping strategy in real-time.
 * 
 * FUNCTIONS:
 * 1. OBSERVE - Receive all market data, signals, and trades in real-time
 * 2. LEARN - Analyze winning/losing trades to identify patterns
 * 3. OPTIMIZE - Suggest and apply parameter improvements
 * 4. SUPERVISE - Monitor risk and intervene when necessary
 * 5. PERSIST - Save learned patterns and optimizations between sessions
 * 
 * In CONSENSUS mode (2+ agents), ALL agents must agree before applying changes.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { analyzePerformance, getMarketAdvice, callAI } = require('./client');

// Path for persisted learning data
const DATA_DIR = path.join(os.homedir(), '.hqx');
const LEARNING_FILE = path.join(DATA_DIR, 'ai-learning.json');

/**
 * Load persisted learning data from disk
 * Called on startup to restore previous learnings
 */
const loadLearningData = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    if (fs.existsSync(LEARNING_FILE)) {
      const data = JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf8'));
      return {
        winningPatterns: data.winningPatterns || [],
        losingPatterns: data.losingPatterns || [],
        optimizations: data.optimizations || [],
        totalSessions: data.totalSessions || 0,
        totalTrades: data.totalTrades || 0,
        totalWins: data.totalWins || 0,
        totalLosses: data.totalLosses || 0,
        lifetimePnL: data.lifetimePnL || 0,
        lastUpdated: data.lastUpdated || null
      };
    }
  } catch (e) {
    // Silent fail - start fresh
  }
  
  return {
    winningPatterns: [],
    losingPatterns: [],
    optimizations: [],
    totalSessions: 0,
    totalTrades: 0,
    totalWins: 0,
    totalLosses: 0,
    lifetimePnL: 0,
    lastUpdated: null
  };
};

/**
 * Save learning data to disk
 * Called after each trade and on session end
 */
const saveLearningData = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Load existing data first
    const existing = loadLearningData();
    
    // Merge with current session data
    const dataToSave = {
      // Patterns - keep last 100 of each type (merge and dedupe by timestamp)
      winningPatterns: mergePatterns(existing.winningPatterns, supervisorState.winningPatterns, 100),
      losingPatterns: mergePatterns(existing.losingPatterns, supervisorState.losingPatterns, 100),
      
      // Optimizations history - keep last 50
      optimizations: [...existing.optimizations, ...supervisorState.optimizations].slice(-50),
      
      // Lifetime stats
      totalSessions: existing.totalSessions + (supervisorState.active ? 0 : 1),
      totalTrades: existing.totalTrades + supervisorState.performance.trades,
      totalWins: existing.totalWins + supervisorState.performance.wins,
      totalLosses: existing.totalLosses + supervisorState.performance.losses,
      lifetimePnL: existing.lifetimePnL + supervisorState.performance.totalPnL,
      
      // Metadata
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync(LEARNING_FILE, JSON.stringify(dataToSave, null, 2));
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Merge pattern arrays, keeping most recent unique entries
 */
const mergePatterns = (existing, current, maxCount) => {
  const merged = [...existing, ...current];
  
  // Sort by timestamp descending (most recent first)
  merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  
  // Keep only maxCount most recent
  return merged.slice(0, maxCount);
};

// Singleton supervisor state
let supervisorState = {
  active: false,
  agents: [],
  strategy: null,
  service: null,
  accountId: null,
  
  // Real-time data (synced with strategy)
  ticks: [],
  signals: [],
  trades: [],
  
  // Learning data
  winningPatterns: [],
  losingPatterns: [],
  
  // Performance tracking
  performance: {
    trades: 0,
    wins: 0,
    losses: 0,
    totalPnL: 0,
    maxDrawdown: 0,
    currentDrawdown: 0,
    peakPnL: 0,
    winStreak: 0,
    lossStreak: 0,
    maxWinStreak: 0,
    maxLossStreak: 0
  },
  
  // Optimization state
  optimizations: [],
  lastOptimizationTime: 0,
  optimizationInterval: 60000, // Analyze every 60 seconds
  
  // Current recommendations
  currentAdvice: {
    action: 'NORMAL',
    sizeMultiplier: 1.0,
    reason: 'Starting'
  },
  
  // Behavior history for graph (action over time)
  // Values: 0=PAUSE, 1=CAUTIOUS, 2=NORMAL, 3=AGGRESSIVE
  behaviorHistory: [],
  behaviorStartTime: null
};

// Analysis interval
let analysisInterval = null;

/**
 * Initialize supervisor with strategy and agents
 * Loads previous learning data to continue improving
 */
const initialize = (strategy, agents, service, accountId) => {
  const now = Date.now();
  
  // Load previously learned patterns and optimizations
  const previousLearning = loadLearningData();
  
  supervisorState = {
    ...supervisorState,
    active: true,
    agents: agents || [],
    strategy,
    service,
    accountId,
    ticks: [],
    signals: [],
    trades: [],
    // Restore previous learning
    winningPatterns: previousLearning.winningPatterns || [],
    losingPatterns: previousLearning.losingPatterns || [],
    previousOptimizations: previousLearning.optimizations || [],
    lifetimeStats: {
      sessions: previousLearning.totalSessions || 0,
      trades: previousLearning.totalTrades || 0,
      wins: previousLearning.totalWins || 0,
      losses: previousLearning.totalLosses || 0,
      pnl: previousLearning.lifetimePnL || 0
    },
    performance: {
      trades: 0,
      wins: 0,
      losses: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      peakPnL: 0,
      winStreak: 0,
      lossStreak: 0,
      maxWinStreak: 0,
      maxLossStreak: 0
    },
    optimizations: [],
    lastOptimizationTime: now,
    behaviorHistory: [{ timestamp: now, value: 2, action: 'NORMAL' }], // Start with NORMAL
    behaviorStartTime: now,
    currentAdvice: { action: 'NORMAL', sizeMultiplier: 1.0, reason: 'Starting' }
  };
  
  // Start continuous analysis loop
  if (analysisInterval) clearInterval(analysisInterval);
  analysisInterval = setInterval(analyzeAndOptimize, supervisorState.optimizationInterval);
  
  // Also record behavior every 10 seconds to have smooth graph
  setInterval(() => {
    if (supervisorState.active) {
      recordBehavior(supervisorState.currentAdvice.action);
    }
  }, 10000);
  
  return {
    success: true,
    agents: agents.length,
    mode: agents.length >= 2 ? 'CONSENSUS' : 'INDIVIDUAL'
  };
};

/**
 * Stop supervisor and save learned data
 */
const stop = () => {
  if (analysisInterval) {
    clearInterval(analysisInterval);
    analysisInterval = null;
  }
  
  // Save all learned data before stopping
  const saved = saveLearningData();
  
  const summary = {
    ...supervisorState.performance,
    optimizationsApplied: supervisorState.optimizations.length,
    winningPatterns: supervisorState.winningPatterns.length,
    losingPatterns: supervisorState.losingPatterns.length,
    dataSaved: saved,
    lifetimeStats: supervisorState.lifetimeStats
  };
  
  supervisorState.active = false;
  
  return summary;
};

/**
 * Feed tick data (called on every market tick)
 */
const feedTick = (tick) => {
  if (!supervisorState.active) return;
  
  supervisorState.ticks.push({
    ...tick,
    timestamp: Date.now()
  });
  
  // Keep last 5000 ticks for pattern analysis
  if (supervisorState.ticks.length > 5000) {
    supervisorState.ticks = supervisorState.ticks.slice(-5000);
  }
};

/**
 * Feed signal data (called when strategy generates a signal)
 */
const feedSignal = (signal) => {
  if (!supervisorState.active) return;
  
  const signalData = {
    ...signal,
    timestamp: Date.now(),
    ticksContext: supervisorState.ticks.slice(-50) // Last 50 ticks before signal
  };
  
  supervisorState.signals.push(signalData);
  
  // Keep last 100 signals
  if (supervisorState.signals.length > 100) {
    supervisorState.signals = supervisorState.signals.slice(-100);
  }
};

/**
 * Feed trade result (called when a trade completes)
 * This is where LEARNING happens
 */
const feedTradeResult = (trade) => {
  if (!supervisorState.active) return;
  
  const tradeData = {
    ...trade,
    timestamp: Date.now(),
    // Capture context at time of trade
    ticksBefore: supervisorState.ticks.slice(-100),
    signalUsed: supervisorState.signals[supervisorState.signals.length - 1] || null
  };
  
  supervisorState.trades.push(tradeData);
  
  // Update performance metrics
  const perf = supervisorState.performance;
  perf.trades++;
  perf.totalPnL += trade.pnl || 0;
  
  if (trade.pnl > 0) {
    perf.wins++;
    perf.winStreak++;
    perf.lossStreak = 0;
    perf.maxWinStreak = Math.max(perf.maxWinStreak, perf.winStreak);
    
    // Learn from winning trade
    learnFromTrade(tradeData, 'win');
  } else if (trade.pnl < 0) {
    perf.losses++;
    perf.lossStreak++;
    perf.winStreak = 0;
    perf.maxLossStreak = Math.max(perf.maxLossStreak, perf.lossStreak);
    
    // Learn from losing trade
    learnFromTrade(tradeData, 'loss');
  }
  
  // Update drawdown
  if (perf.totalPnL > perf.peakPnL) {
    perf.peakPnL = perf.totalPnL;
    perf.currentDrawdown = 0;
  } else {
    perf.currentDrawdown = perf.peakPnL - perf.totalPnL;
    perf.maxDrawdown = Math.max(perf.maxDrawdown, perf.currentDrawdown);
  }
  
  // Trigger immediate analysis after losing streaks
  if (perf.lossStreak >= 3) {
    analyzeAndOptimize();
  }
};

/**
 * Learn from a completed trade
 * Extracts patterns from winning and losing trades
 */
const learnFromTrade = (trade, result) => {
  const pattern = {
    timestamp: trade.timestamp,
    result,
    pnl: trade.pnl,
    direction: trade.direction || trade.side,
    
    // Market context before trade
    priceAction: analyzePriceAction(trade.ticksBefore),
    volumeProfile: analyzeVolume(trade.ticksBefore),
    volatility: calculateVolatility(trade.ticksBefore),
    
    // Signal characteristics
    signalConfidence: trade.signalUsed?.confidence || null,
    entryPrice: trade.price || trade.signalUsed?.entry,
    stopLoss: trade.signalUsed?.stopLoss,
    takeProfit: trade.signalUsed?.takeProfit
  };
  
  if (result === 'win') {
    supervisorState.winningPatterns.push(pattern);
    // Keep last 50 winning patterns
    if (supervisorState.winningPatterns.length > 50) {
      supervisorState.winningPatterns = supervisorState.winningPatterns.slice(-50);
    }
  } else {
    supervisorState.losingPatterns.push(pattern);
    // Keep last 50 losing patterns
    if (supervisorState.losingPatterns.length > 50) {
      supervisorState.losingPatterns = supervisorState.losingPatterns.slice(-50);
    }
  }
};

/**
 * Analyze price action from ticks
 */
const analyzePriceAction = (ticks) => {
  if (!ticks || ticks.length < 2) return { trend: 'unknown', strength: 0 };
  
  const prices = ticks.map(t => t.price).filter(Boolean);
  if (prices.length < 2) return { trend: 'unknown', strength: 0 };
  
  const first = prices[0];
  const last = prices[prices.length - 1];
  const change = last - first;
  const range = Math.max(...prices) - Math.min(...prices);
  
  return {
    trend: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    strength: range > 0 ? Math.abs(change) / range : 0,
    range,
    change
  };
};

/**
 * Analyze volume from ticks
 */
const analyzeVolume = (ticks) => {
  if (!ticks || ticks.length === 0) return { total: 0, avg: 0, trend: 'unknown' };
  
  const volumes = ticks.map(t => t.volume || 0);
  const total = volumes.reduce((a, b) => a + b, 0);
  const avg = total / volumes.length;
  
  // Compare first half vs second half
  const mid = Math.floor(volumes.length / 2);
  const firstHalf = volumes.slice(0, mid).reduce((a, b) => a + b, 0);
  const secondHalf = volumes.slice(mid).reduce((a, b) => a + b, 0);
  
  return {
    total,
    avg,
    trend: secondHalf > firstHalf * 1.2 ? 'increasing' : secondHalf < firstHalf * 0.8 ? 'decreasing' : 'stable'
  };
};

/**
 * Calculate volatility from ticks
 */
const calculateVolatility = (ticks) => {
  if (!ticks || ticks.length < 2) return 0;
  
  const prices = ticks.map(t => t.price).filter(Boolean);
  if (prices.length < 2) return 0;
  
  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i-1]) / prices[i-1]);
  }
  
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
  
  return Math.sqrt(variance);
};

/**
 * Main analysis and optimization loop
 * Called periodically and after significant events
 */
const analyzeAndOptimize = async () => {
  if (!supervisorState.active || supervisorState.agents.length === 0) return;
  
  const perf = supervisorState.performance;
  
  // Skip if not enough data
  if (perf.trades < 3) return;
  
  // Prepare performance data for AI analysis
  const performanceData = {
    trades: perf.trades,
    wins: perf.wins,
    losses: perf.losses,
    winRate: perf.trades > 0 ? perf.wins / perf.trades : 0,
    pnl: perf.totalPnL,
    maxDrawdown: perf.maxDrawdown,
    currentDrawdown: perf.currentDrawdown,
    winStreak: perf.winStreak,
    lossStreak: perf.lossStreak,
    maxWinStreak: perf.maxWinStreak,
    maxLossStreak: perf.maxLossStreak,
    
    // Calculate averages
    avgWin: perf.wins > 0 ? 
      supervisorState.trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / perf.wins : 0,
    avgLoss: perf.losses > 0 ? 
      Math.abs(supervisorState.trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, 0) / perf.losses) : 0,
    
    // Recent trades for context
    recentTrades: supervisorState.trades.slice(-10).map(t => ({
      side: t.direction || t.side,
      qty: t.qty,
      price: t.price,
      pnl: t.pnl
    })),
    
    // Pattern summaries
    winningPatternCount: supervisorState.winningPatterns.length,
    losingPatternCount: supervisorState.losingPatterns.length,
    
    // Common characteristics of losing trades
    losingTradeAnalysis: analyzeLosingPatterns()
  };
  
  // Get optimization suggestions from all agents
  const suggestions = [];
  
  for (const agent of supervisorState.agents) {
    try {
      const suggestion = await getOptimizationFromAgent(agent, performanceData);
      if (suggestion) {
        suggestions.push({
          agentId: agent.id,
          agentName: agent.name,
          ...suggestion
        });
      }
    } catch (e) {
      // Silent fail for individual agent
    }
  }
  
  if (suggestions.length === 0) return;
  
  // Process suggestions based on mode
  const isConsensus = supervisorState.agents.length >= 2;
  
  if (isConsensus) {
    // CONSENSUS MODE: All agents must agree
    const consensusResult = buildConsensus(suggestions);
    
    if (consensusResult.isUnanimous && consensusResult.optimizations.length > 0) {
      // Apply unanimous optimizations
      for (const opt of consensusResult.optimizations) {
        applyOptimization(opt);
      }
    }
    
    // Update current advice based on consensus
    if (consensusResult.action) {
      supervisorState.currentAdvice = {
        action: consensusResult.action,
        sizeMultiplier: consensusResult.sizeMultiplier || 1.0,
        reason: consensusResult.reason || 'Consensus recommendation'
      };
      recordBehavior(consensusResult.action);
    }
  } else {
    // INDIVIDUAL MODE: Apply single agent's suggestions
    const suggestion = suggestions[0];
    
    if (suggestion.optimizations) {
      for (const opt of suggestion.optimizations) {
        applyOptimization(opt);
      }
    }
    
    if (suggestion.action) {
      supervisorState.currentAdvice = {
        action: suggestion.action,
        sizeMultiplier: suggestion.sizeMultiplier || 1.0,
        reason: suggestion.reason || 'Agent recommendation'
      };
      recordBehavior(suggestion.action);
    }
  }
  
  supervisorState.lastOptimizationTime = Date.now();
};

/**
 * Record behavior for graph visualization
 * Converts action to numeric value: PAUSE=0, CAUTIOUS=1, NORMAL=2, AGGRESSIVE=3
 */
const recordBehavior = (action) => {
  const actionToValue = {
    'PAUSE': 0,
    'CAUTIOUS': 1,
    'NORMAL': 2,
    'AGGRESSIVE': 3
  };
  
  const value = actionToValue[action] ?? 2; // Default to NORMAL
  const now = Date.now();
  
  supervisorState.behaviorHistory.push({
    timestamp: now,
    value,
    action
  });
  
  // Keep last 200 data points
  if (supervisorState.behaviorHistory.length > 200) {
    supervisorState.behaviorHistory = supervisorState.behaviorHistory.slice(-200);
  }
};

/**
 * Analyze patterns in losing trades
 */
const analyzeLosingPatterns = () => {
  const patterns = supervisorState.losingPatterns;
  if (patterns.length === 0) return null;
  
  // Find common characteristics
  const trends = patterns.map(p => p.priceAction?.trend).filter(Boolean);
  const volatilities = patterns.map(p => p.volatility).filter(Boolean);
  const confidences = patterns.map(p => p.signalConfidence).filter(Boolean);
  
  const trendCounts = {};
  for (const t of trends) {
    trendCounts[t] = (trendCounts[t] || 0) + 1;
  }
  
  const avgVolatility = volatilities.length > 0 ? 
    volatilities.reduce((a, b) => a + b, 0) / volatilities.length : 0;
  
  const avgConfidence = confidences.length > 0 ?
    confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
  
  return {
    commonTrend: Object.entries(trendCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown',
    avgVolatility,
    avgConfidence,
    count: patterns.length
  };
};

/**
 * Get optimization suggestion from a single agent
 */
const getOptimizationFromAgent = async (agent, performanceData) => {
  const systemPrompt = `You are an AI supervisor for HQX Ultra Scalping, a professional futures trading strategy.

The strategy uses:
- Order flow analysis (delta, absorption, imbalance)
- Statistical models (z-score, standard deviation)
- Dynamic risk management (Kelly criterion)

ANALYZE the performance data and LEARN from the losing trades.
Suggest SPECIFIC optimizations to improve win rate and reduce losses.

Respond in JSON:
{
  "assessment": "brief assessment",
  "action": "AGGRESSIVE|NORMAL|CAUTIOUS|PAUSE",
  "sizeMultiplier": 0.5-1.5,
  "optimizations": [
    {"param": "name", "direction": "increase|decrease", "amount": "10%", "reason": "why"}
  ],
  "learnings": "what we learned from losing trades",
  "confidence": 0-100
}`;

  const prompt = `STRATEGY PERFORMANCE ANALYSIS

Stats:
- Trades: ${performanceData.trades} (${performanceData.wins}W / ${performanceData.losses}L)
- Win Rate: ${(performanceData.winRate * 100).toFixed(1)}%
- P&L: $${performanceData.pnl.toFixed(2)}
- Max Drawdown: $${performanceData.maxDrawdown.toFixed(2)}
- Current Streak: ${performanceData.winStreak > 0 ? performanceData.winStreak + ' wins' : performanceData.lossStreak + ' losses'}

Losing Trade Analysis:
${performanceData.losingTradeAnalysis ? `
- Common trend at entry: ${performanceData.losingTradeAnalysis.commonTrend}
- Avg volatility: ${(performanceData.losingTradeAnalysis.avgVolatility * 100).toFixed(3)}%
- Avg signal confidence: ${(performanceData.losingTradeAnalysis.avgConfidence * 100).toFixed(1)}%
- Total losing patterns: ${performanceData.losingTradeAnalysis.count}
` : 'Not enough data'}

Recent Trades:
${performanceData.recentTrades.map(t => `${t.side} @ ${t.price} → $${t.pnl?.toFixed(2)}`).join('\n')}

What should we LEARN and OPTIMIZE?`;

  try {
    const response = await callAI(agent, prompt, systemPrompt);
    if (!response) return null;
    
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return null;
  } catch (e) {
    return null;
  }
};

/**
 * Build consensus from multiple agent suggestions
 */
const buildConsensus = (suggestions) => {
  if (suggestions.length === 0) return { isUnanimous: false };
  
  // Check action consensus
  const actions = suggestions.map(s => s.action).filter(Boolean);
  const allSameAction = actions.length === suggestions.length && 
    actions.every(a => a === actions[0]);
  
  // Check optimization consensus
  const allOptimizations = suggestions.flatMap(s => s.optimizations || []);
  const paramGroups = {};
  
  for (const opt of allOptimizations) {
    if (!opt.param) continue;
    const key = `${opt.param}_${opt.direction}`;
    if (!paramGroups[key]) {
      paramGroups[key] = { ...opt, count: 0 };
    }
    paramGroups[key].count++;
  }
  
  // Find unanimous optimizations (all agents agree)
  const unanimousOptimizations = Object.values(paramGroups)
    .filter(g => g.count === suggestions.length)
    .map(g => ({
      param: g.param,
      direction: g.direction,
      amount: g.amount,
      reason: `Unanimous (${suggestions.length} agents)`
    }));
  
  // Average size multiplier
  const multipliers = suggestions.map(s => s.sizeMultiplier || 1.0);
  const avgMultiplier = multipliers.reduce((a, b) => a + b, 0) / multipliers.length;
  
  // Average confidence
  const confidences = suggestions.map(s => s.confidence || 50);
  const avgConfidence = Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length);
  
  return {
    isUnanimous: allSameAction && unanimousOptimizations.length > 0,
    action: allSameAction ? actions[0] : 'CAUTIOUS',
    sizeMultiplier: allSameAction ? avgMultiplier : 0.5,
    optimizations: unanimousOptimizations,
    confidence: avgConfidence,
    reason: allSameAction ? 
      `${suggestions.length} agents agree` : 
      'Agents disagree - being cautious',
    votes: actions.reduce((acc, a) => { acc[a] = (acc[a] || 0) + 1; return acc; }, {})
  };
};

/**
 * Apply an optimization to the strategy
 */
const applyOptimization = (optimization) => {
  const strategy = supervisorState.strategy;
  if (!strategy) return false;
  
  // Record the optimization
  supervisorState.optimizations.push({
    timestamp: Date.now(),
    ...optimization
  });
  
  // Try to apply to strategy if it supports it
  try {
    if (typeof strategy.applyAIOptimization === 'function') {
      strategy.applyAIOptimization(optimization);
      return true;
    }
    
    if (typeof strategy.setParameter === 'function') {
      strategy.setParameter(optimization.param, optimization.direction, optimization.amount);
      return true;
    }
  } catch (e) {
    // Strategy doesn't support this optimization
  }
  
  return false;
};

/**
 * Get current advice for the strategy
 * Called before each trade decision
 */
const getCurrentAdvice = () => {
  if (!supervisorState.active) {
    return { action: 'NORMAL', sizeMultiplier: 1.0, reason: 'No supervision' };
  }
  
  return supervisorState.currentAdvice;
};

/**
 * Get supervision status
 */
const getStatus = () => {
  return {
    active: supervisorState.active,
    agents: supervisorState.agents.length,
    mode: supervisorState.agents.length >= 2 ? 'CONSENSUS' : 'INDIVIDUAL',
    performance: supervisorState.performance,
    currentAdvice: supervisorState.currentAdvice,
    optimizationsApplied: supervisorState.optimizations.length,
    patternsLearned: {
      winning: supervisorState.winningPatterns.length,
      losing: supervisorState.losingPatterns.length
    },
    lastOptimization: supervisorState.lastOptimizationTime
  };
};

/**
 * Check if should proceed with trade based on AI advice
 */
const shouldTrade = () => {
  if (!supervisorState.active) return { proceed: true, multiplier: 1.0 };
  
  const advice = supervisorState.currentAdvice;
  
  if (advice.action === 'PAUSE') {
    return { proceed: false, reason: advice.reason };
  }
  
  return {
    proceed: true,
    multiplier: advice.sizeMultiplier || 1.0,
    action: advice.action
  };
};

/**
 * Get behavior history for graph visualization
 * Returns array of numeric values (0-3) representing agent behavior over time
 * 
 * @param {number} maxPoints - Maximum data points to return
 * @returns {Object} { values: number[], labels: string[], startTime: number }
 */
const getBehaviorHistory = (maxPoints = 50) => {
  if (!supervisorState.active || supervisorState.behaviorHistory.length === 0) {
    return { values: [], labels: [], startTime: null };
  }
  
  let history = [...supervisorState.behaviorHistory];
  
  // Downsample if too many points
  if (history.length > maxPoints) {
    const step = Math.ceil(history.length / maxPoints);
    history = history.filter((_, i) => i % step === 0);
  }
  
  // If too few points, interpolate to make smooth curve
  if (history.length < 10 && history.length > 1) {
    const interpolated = [];
    for (let i = 0; i < history.length - 1; i++) {
      interpolated.push(history[i]);
      // Add intermediate points
      const curr = history[i].value;
      const next = history[i + 1].value;
      const mid = (curr + next) / 2;
      interpolated.push({ value: mid, action: 'interpolated' });
    }
    interpolated.push(history[history.length - 1]);
    history = interpolated;
  }
  
  return {
    values: history.map(h => h.value),
    actions: history.map(h => h.action),
    startTime: supervisorState.behaviorStartTime,
    duration: Date.now() - supervisorState.behaviorStartTime
  };
};

/**
 * Get learning statistics for display
 */
const getLearningStats = () => {
  return {
    patternsLearned: {
      winning: supervisorState.winningPatterns.length,
      losing: supervisorState.losingPatterns.length,
      total: supervisorState.winningPatterns.length + supervisorState.losingPatterns.length
    },
    optimizations: supervisorState.optimizations.length,
    tradesAnalyzed: supervisorState.trades.length,
    ticksProcessed: supervisorState.ticks.length,
    signalsObserved: supervisorState.signals.length
  };
};

/**
 * Get lifetime stats across all sessions
 * Shows cumulative learning progress
 */
const getLifetimeStats = () => {
  const saved = loadLearningData();
  
  return {
    totalSessions: saved.totalSessions,
    totalTrades: saved.totalTrades,
    totalWins: saved.totalWins,
    totalLosses: saved.totalLosses,
    lifetimeWinRate: saved.totalTrades > 0 ? 
      ((saved.totalWins / saved.totalTrades) * 100).toFixed(1) + '%' : 'N/A',
    lifetimePnL: saved.lifetimePnL,
    patternsLearned: {
      winning: saved.winningPatterns?.length || 0,
      losing: saved.losingPatterns?.length || 0
    },
    optimizationsApplied: saved.optimizations?.length || 0,
    lastUpdated: saved.lastUpdated
  };
};

/**
 * Clear all learned data (reset AI memory)
 */
const clearLearningData = () => {
  try {
    if (fs.existsSync(LEARNING_FILE)) {
      fs.unlinkSync(LEARNING_FILE);
    }
    return true;
  } catch (e) {
    return false;
  }
};

module.exports = {
  initialize,
  stop,
  feedTick,
  feedSignal,
  feedTradeResult,
  getCurrentAdvice,
  shouldTrade,
  getStatus,
  analyzeAndOptimize,
  getBehaviorHistory,
  getLearningStats,
  getLifetimeStats,
  clearLearningData,
  loadLearningData
};
