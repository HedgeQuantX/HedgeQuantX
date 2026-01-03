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
 * Contains full memory of strategy behavior over weeks/months
 */
const loadLearningData = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    if (fs.existsSync(LEARNING_FILE)) {
      const data = JSON.parse(fs.readFileSync(LEARNING_FILE, 'utf8'));
      
      // Clean old sessions (keep only last 1 month / 31 days)
      const oneMonthAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);
      const sessions = (data.sessions || []).filter(s => 
        new Date(s.date).getTime() > oneMonthAgo
      );
      
      return {
        // Pattern memory
        winningPatterns: data.winningPatterns || [],
        losingPatterns: data.losingPatterns || [],
        
        // Optimization history
        optimizations: data.optimizations || [],
        
        // Symbol-specific data (NQ, ES, etc.)
        symbols: data.symbols || {},
        
        // Full session history (last 30 days)
        sessions: sessions,
        
        // Hourly performance analysis
        hourlyStats: data.hourlyStats || {},
        
        // Day of week analysis
        dayOfWeekStats: data.dayOfWeekStats || {},
        
        // Strategy behavior profile
        strategyProfile: data.strategyProfile || {
          bestHours: [],
          worstHours: [],
          avgWinStreak: 0,
          avgLossStreak: 0,
          preferredConditions: null
        },
        
        // Lifetime stats
        totalSessions: data.totalSessions || 0,
        totalTrades: data.totalTrades || 0,
        totalWins: data.totalWins || 0,
        totalLosses: data.totalLosses || 0,
        lifetimePnL: data.lifetimePnL || 0,
        
        lastUpdated: data.lastUpdated || null,
        firstSession: data.firstSession || null
      };
    }
  } catch (e) {
    // Silent fail - start fresh
  }
  
  return {
    winningPatterns: [],
    losingPatterns: [],
    optimizations: [],
    symbols: {},
    sessions: [],
    hourlyStats: {},
    dayOfWeekStats: {},
    strategyProfile: {
      bestHours: [],
      worstHours: [],
      avgWinStreak: 0,
      avgLossStreak: 0,
      preferredConditions: null
    },
    totalSessions: 0,
    totalTrades: 0,
    totalWins: 0,
    totalLosses: 0,
    lifetimePnL: 0,
    lastUpdated: null,
    firstSession: null
  };
};

/**
 * Get or create symbol data structure
 */
const getSymbolData = (symbolName) => {
  const data = loadLearningData();
  if (!data.symbols[symbolName]) {
    return {
      name: symbolName,
      levels: [],           // Key price levels
      sessions: [],         // Trading sessions history
      patterns: [],         // Symbol-specific patterns
      stats: {
        trades: 0,
        wins: 0,
        losses: 0,
        pnl: 0
      }
    };
  }
  return data.symbols[symbolName];
};

/**
 * Record a key price level for a symbol
 * Called when trades happen at significant levels
 */
const recordPriceLevel = (symbolName, price, type, outcome) => {
  // type: 'support', 'resistance', 'breakout', 'rejection'
  // outcome: 'win', 'loss', 'neutral'
  
  const level = {
    price: Math.round(price * 4) / 4, // Round to nearest 0.25
    type,
    outcome,
    timestamp: Date.now(),
    date: new Date().toISOString().split('T')[0],
    hour: new Date().getHours()
  };
  
  if (!supervisorState.currentSymbol) {
    supervisorState.currentSymbol = symbolName;
  }
  
  if (!supervisorState.symbolLevels) {
    supervisorState.symbolLevels = [];
  }
  
  // Check if level already exists (within 2 ticks)
  const tickSize = symbolName.includes('NQ') ? 0.25 : 0.25;
  const existing = supervisorState.symbolLevels.find(l => 
    Math.abs(l.price - level.price) <= tickSize * 2
  );
  
  if (existing) {
    // Update existing level
    existing.touches = (existing.touches || 1) + 1;
    existing.lastTouch = Date.now();
    existing.outcomes = existing.outcomes || [];
    existing.outcomes.push(outcome);
  } else {
    // New level
    level.touches = 1;
    level.outcomes = [outcome];
    supervisorState.symbolLevels.push(level);
  }
};

/**
 * Analyze current price against known levels
 * Returns nearby important levels
 */
const analyzeNearbyLevels = (symbolName, currentPrice) => {
  const data = loadLearningData();
  const symbolData = data.symbols[symbolName];
  
  if (!symbolData || !symbolData.levels || symbolData.levels.length === 0) {
    return { nearbyLevels: [], message: 'No historical levels' };
  }
  
  const tickSize = symbolName.includes('NQ') ? 0.25 : 0.25;
  const range = tickSize * 20; // Look within 20 ticks
  
  const nearbyLevels = symbolData.levels
    .filter(l => Math.abs(l.price - currentPrice) <= range)
    .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))
    .slice(0, 5) // Top 5 nearest levels
    .map(l => {
      const winRate = l.outcomes ? 
        l.outcomes.filter(o => o === 'win').length / l.outcomes.length : 0;
      return {
        price: l.price,
        distance: Math.round((l.price - currentPrice) / tickSize),
        type: l.type,
        touches: l.touches || 1,
        winRate: Math.round(winRate * 100),
        direction: l.price > currentPrice ? 'above' : 'below'
      };
    });
  
  return {
    nearbyLevels,
    message: nearbyLevels.length > 0 ? 
      `${nearbyLevels.length} known levels nearby` : 
      'No known levels nearby'
  };
};

/**
 * Save learning data to disk
 * Full memory of strategy behavior over 1 month
 */
const saveLearningData = () => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    // Load existing data first
    const existing = loadLearningData();
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay(); // 0=Sunday, 1=Monday, etc.
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    
    // Merge symbol data
    const symbols = { ...existing.symbols };
    if (supervisorState.currentSymbol) {
      const sym = supervisorState.currentSymbol;
      if (!symbols[sym]) {
        symbols[sym] = {
          name: sym,
          levels: [],
          sessions: [],
          stats: { trades: 0, wins: 0, losses: 0, pnl: 0 },
          hourlyStats: {},
          dayOfWeekStats: {}
        };
      }
      
      // Merge levels - keep last 50 most important
      const existingLevels = symbols[sym].levels || [];
      const newLevels = supervisorState.symbolLevels || [];
      symbols[sym].levels = mergeLevels(existingLevels, newLevels, 50);
      
      // Add current session summary
      symbols[sym].sessions.push({
        date: now.toISOString(),
        hour: currentHour,
        dayOfWeek: dayNames[currentDay],
        trades: supervisorState.performance.trades,
        wins: supervisorState.performance.wins,
        losses: supervisorState.performance.losses,
        pnl: supervisorState.performance.totalPnL,
        levelsWorked: newLevels.length,
        maxWinStreak: supervisorState.performance.maxWinStreak,
        maxLossStreak: supervisorState.performance.maxLossStreak
      });
      
      // Keep only last 31 days of sessions per symbol
      const oneMonthAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);
      symbols[sym].sessions = symbols[sym].sessions.filter(s => 
        new Date(s.date).getTime() > oneMonthAgo
      );
      
      // Update symbol stats
      symbols[sym].stats.trades += supervisorState.performance.trades;
      symbols[sym].stats.wins += supervisorState.performance.wins;
      symbols[sym].stats.losses += supervisorState.performance.losses;
      symbols[sym].stats.pnl += supervisorState.performance.totalPnL;
    }
    
    // Update hourly stats (which hours perform best)
    const hourlyStats = { ...existing.hourlyStats };
    const hourKey = String(currentHour);
    if (!hourlyStats[hourKey]) {
      hourlyStats[hourKey] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
    }
    hourlyStats[hourKey].trades += supervisorState.performance.trades;
    hourlyStats[hourKey].wins += supervisorState.performance.wins;
    hourlyStats[hourKey].losses += supervisorState.performance.losses;
    hourlyStats[hourKey].pnl += supervisorState.performance.totalPnL;
    
    // Update day of week stats
    const dayOfWeekStats = { ...existing.dayOfWeekStats };
    const dayKey = dayNames[currentDay];
    if (!dayOfWeekStats[dayKey]) {
      dayOfWeekStats[dayKey] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
    }
    dayOfWeekStats[dayKey].trades += supervisorState.performance.trades;
    dayOfWeekStats[dayKey].wins += supervisorState.performance.wins;
    dayOfWeekStats[dayKey].losses += supervisorState.performance.losses;
    dayOfWeekStats[dayKey].pnl += supervisorState.performance.totalPnL;
    
    // Build strategy profile from data
    const strategyProfile = buildStrategyProfile(hourlyStats, dayOfWeekStats, existing.sessions);
    
    // Current session record
    const currentSession = {
      date: now.toISOString(),
      symbol: supervisorState.currentSymbol,
      hour: currentHour,
      dayOfWeek: dayNames[currentDay],
      trades: supervisorState.performance.trades,
      wins: supervisorState.performance.wins,
      losses: supervisorState.performance.losses,
      pnl: supervisorState.performance.totalPnL,
      maxWinStreak: supervisorState.performance.maxWinStreak,
      maxLossStreak: supervisorState.performance.maxLossStreak,
      optimizationsApplied: supervisorState.optimizations.length,
      levelsLearned: (supervisorState.symbolLevels || []).length
    };
    
    // Merge sessions (keep 1 month)
    const oneMonthAgo = Date.now() - (31 * 24 * 60 * 60 * 1000);
    const sessions = [...existing.sessions, currentSession].filter(s => 
      new Date(s.date).getTime() > oneMonthAgo
    );
    
    // Build data to save
    const dataToSave = {
      // Patterns - keep last 100 of each type
      winningPatterns: mergePatterns(existing.winningPatterns, supervisorState.winningPatterns, 100),
      losingPatterns: mergePatterns(existing.losingPatterns, supervisorState.losingPatterns, 100),
      
      // Optimizations history - keep last 50
      optimizations: [...existing.optimizations, ...supervisorState.optimizations].slice(-50),
      
      // Symbol-specific data
      symbols,
      
      // Full session history (1 month)
      sessions,
      
      // Performance by hour and day
      hourlyStats,
      dayOfWeekStats,
      
      // Strategy behavior profile
      strategyProfile,
      
      // Lifetime stats
      totalSessions: existing.totalSessions + 1,
      totalTrades: existing.totalTrades + supervisorState.performance.trades,
      totalWins: existing.totalWins + supervisorState.performance.wins,
      totalLosses: existing.totalLosses + supervisorState.performance.losses,
      lifetimePnL: existing.lifetimePnL + supervisorState.performance.totalPnL,
      
      // Metadata
      firstSession: existing.firstSession || now.toISOString(),
      lastUpdated: now.toISOString()
    };
    
    fs.writeFileSync(LEARNING_FILE, JSON.stringify(dataToSave, null, 2));
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Build strategy profile from historical data
 * Identifies best/worst hours, days, and patterns
 */
const buildStrategyProfile = (hourlyStats, dayOfWeekStats, sessions) => {
  // Find best and worst hours
  const hours = Object.entries(hourlyStats)
    .map(([hour, stats]) => ({
      hour: parseInt(hour),
      winRate: stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0,
      pnl: stats.pnl,
      trades: stats.trades
    }))
    .filter(h => h.trades >= 3) // Need at least 3 trades to be significant
    .sort((a, b) => b.winRate - a.winRate);
  
  const bestHours = hours.slice(0, 3).map(h => h.hour);
  const worstHours = hours.slice(-3).map(h => h.hour);
  
  // Find best and worst days
  const days = Object.entries(dayOfWeekStats)
    .map(([day, stats]) => ({
      day,
      winRate: stats.trades > 0 ? (stats.wins / stats.trades) * 100 : 0,
      pnl: stats.pnl,
      trades: stats.trades
    }))
    .filter(d => d.trades >= 3)
    .sort((a, b) => b.winRate - a.winRate);
  
  const bestDays = days.slice(0, 2).map(d => d.day);
  const worstDays = days.slice(-2).map(d => d.day);
  
  // Calculate average streaks from sessions
  let totalWinStreaks = 0, totalLossStreaks = 0, streakCount = 0;
  for (const session of sessions) {
    if (session.maxWinStreak) totalWinStreaks += session.maxWinStreak;
    if (session.maxLossStreak) totalLossStreaks += session.maxLossStreak;
    streakCount++;
  }
  
  return {
    bestHours,
    worstHours,
    bestDays,
    worstDays,
    avgWinStreak: streakCount > 0 ? Math.round(totalWinStreaks / streakCount * 10) / 10 : 0,
    avgLossStreak: streakCount > 0 ? Math.round(totalLossStreaks / streakCount * 10) / 10 : 0,
    totalSessionsAnalyzed: sessions.length
  };
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

/**
 * Merge price levels, prioritizing most touched and most recent
 */
const mergeLevels = (existing, current, maxCount) => {
  const merged = [...existing];
  
  for (const level of current) {
    const tickSize = 0.25;
    const existingIdx = merged.findIndex(l => 
      Math.abs(l.price - level.price) <= tickSize * 2
    );
    
    if (existingIdx >= 0) {
      // Update existing level
      merged[existingIdx].touches = (merged[existingIdx].touches || 1) + (level.touches || 1);
      merged[existingIdx].lastTouch = Math.max(merged[existingIdx].lastTouch || 0, level.lastTouch || level.timestamp || 0);
      merged[existingIdx].outcomes = [...(merged[existingIdx].outcomes || []), ...(level.outcomes || [])].slice(-20);
    } else {
      merged.push(level);
    }
  }
  
  // Sort by importance (touches * recency)
  const now = Date.now();
  merged.sort((a, b) => {
    const scoreA = (a.touches || 1) * (1 / (1 + (now - (a.lastTouch || a.timestamp || 0)) / 86400000));
    const scoreB = (b.touches || 1) * (1 / (1 + (now - (b.lastTouch || b.timestamp || 0)) / 86400000));
    return scoreB - scoreA;
  });
  
  return merged.slice(0, maxCount);
};

/**
 * DEPRECATED - moved inline
 */
const mergePatternsDEP = (existing, current, maxCount) => {
  const merged = [...existing, ...current];
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
  
  // Current symbol being traded
  currentSymbol: null,
  
  // Real-time data (synced with strategy)
  ticks: [],
  signals: [],
  trades: [],
  
  // Symbol-specific levels learned this session
  symbolLevels: [],
  
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
  behaviorStartTime: null,
  
  // Lifetime stats loaded from previous sessions
  lifetimeStats: null,
  
  // Previous sessions memory (loaded on init)
  previousSessions: [],
  
  // Hourly performance tracking
  hourlyPerformance: {}
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
 * 
 * Captures CONTEXT that API doesn't provide:
 * - Market conditions before entry (volatility, trend, volume)
 * - Price action patterns
 * - Time-based context (hour, day, session)
 * - AI state at time of trade
 * - Price levels interaction
 */
const feedTradeResult = (trade) => {
  if (!supervisorState.active) return;
  
  const now = Date.now();
  const currentHour = new Date().getHours();
  const currentDay = new Date().getDay();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  // Get ticks before trade for context analysis
  const ticksBefore = supervisorState.ticks.slice(-100);
  const signalUsed = supervisorState.signals[supervisorState.signals.length - 1] || null;
  
  // ========== CAPTURE MARKET CONTEXT (NOT IN API) ==========
  const marketContext = {
    // Price action analysis
    priceAction: analyzePriceAction(ticksBefore),
    
    // Volatility at entry
    volatility: calculateVolatility(ticksBefore),
    
    // Volume profile
    volumeProfile: analyzeVolume(ticksBefore),
    
    // Trend strength (using last 50 vs last 20 ticks)
    trendStrength: calculateTrendStrength(ticksBefore),
    
    // Price range in last N ticks
    recentRange: calculateRecentRange(ticksBefore, 50),
    
    // Speed of price movement
    priceVelocity: calculatePriceVelocity(ticksBefore, 20)
  };
  
  // ========== CAPTURE TIME CONTEXT (NOT IN API) ==========
  const timeContext = {
    hour: currentHour,
    dayOfWeek: dayNames[currentDay],
    dayNumber: currentDay,
    // Trading session (US market hours)
    session: getMarketSession(currentHour),
    // Minutes since session open
    minutesSinceOpen: getMinutesSinceOpen(currentHour),
    timestamp: now
  };
  
  // ========== CAPTURE AI STATE (NOT IN API) ==========
  const aiContext = {
    action: supervisorState.currentAdvice.action,
    sizeMultiplier: supervisorState.currentAdvice.sizeMultiplier,
    reason: supervisorState.currentAdvice.reason,
    currentWinStreak: supervisorState.performance.winStreak,
    currentLossStreak: supervisorState.performance.lossStreak,
    sessionPnL: supervisorState.performance.totalPnL,
    sessionTrades: supervisorState.performance.trades
  };
  
  // ========== CAPTURE PRICE LEVEL INTERACTION ==========
  const entryPrice = trade.price || signalUsed?.entry;
  const levelContext = entryPrice ? analyzePriceLevelInteraction(entryPrice, ticksBefore) : null;
  
  // Build enriched trade data
  const tradeData = {
    ...trade,
    timestamp: now,
    
    // Signal that generated this trade
    signalUsed: signalUsed ? {
      confidence: signalUsed.confidence,
      entry: signalUsed.entry,
      stopLoss: signalUsed.stopLoss,
      takeProfit: signalUsed.takeProfit,
      direction: signalUsed.direction
    } : null,
    
    // Context NOT available in API
    marketContext,
    timeContext,
    aiContext,
    levelContext,
    
    // Store symbol for level learning
    symbol: trade.symbol || supervisorState.currentSymbol
  };
  
  supervisorState.trades.push(tradeData);
  
  // Update performance metrics
  const perf = supervisorState.performance;
  perf.trades++;
  perf.totalPnL += trade.pnl || 0;
  
  // Determine outcome
  const outcome = trade.pnl > 0 ? 'win' : trade.pnl < 0 ? 'loss' : 'breakeven';
  
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
  
  // Record price level with outcome (for future reference)
  if (entryPrice && tradeData.symbol) {
    const levelType = determineLevelType(entryPrice, ticksBefore);
    recordPriceLevel(tradeData.symbol, entryPrice, levelType, outcome);
  }
  
  // Update hourly performance tracking
  const hourKey = String(currentHour);
  if (!supervisorState.hourlyPerformance[hourKey]) {
    supervisorState.hourlyPerformance[hourKey] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
  }
  supervisorState.hourlyPerformance[hourKey].trades++;
  if (trade.pnl > 0) supervisorState.hourlyPerformance[hourKey].wins++;
  if (trade.pnl < 0) supervisorState.hourlyPerformance[hourKey].losses++;
  supervisorState.hourlyPerformance[hourKey].pnl += trade.pnl || 0;
  
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
 * Calculate trend strength from ticks
 * Compares short-term vs medium-term trend
 */
const calculateTrendStrength = (ticks) => {
  if (!ticks || ticks.length < 20) return { strength: 0, direction: 'unknown' };
  
  const prices = ticks.map(t => t.price).filter(Boolean);
  if (prices.length < 20) return { strength: 0, direction: 'unknown' };
  
  // Short-term trend (last 20)
  const shortTerm = prices.slice(-20);
  const shortChange = shortTerm[shortTerm.length - 1] - shortTerm[0];
  
  // Medium-term trend (last 50 or all)
  const mediumTerm = prices.slice(-50);
  const mediumChange = mediumTerm[mediumTerm.length - 1] - mediumTerm[0];
  
  // Strength = how aligned are short and medium trends
  const aligned = (shortChange > 0 && mediumChange > 0) || (shortChange < 0 && mediumChange < 0);
  const avgRange = Math.abs(Math.max(...prices) - Math.min(...prices)) || 1;
  
  return {
    strength: aligned ? Math.min(1, (Math.abs(shortChange) + Math.abs(mediumChange)) / avgRange) : 0,
    direction: mediumChange > 0 ? 'bullish' : mediumChange < 0 ? 'bearish' : 'neutral',
    shortTermDirection: shortChange > 0 ? 'up' : shortChange < 0 ? 'down' : 'flat',
    aligned
  };
};

/**
 * Calculate recent price range
 */
const calculateRecentRange = (ticks, count) => {
  if (!ticks || ticks.length === 0) return { high: 0, low: 0, range: 0 };
  
  const prices = ticks.slice(-count).map(t => t.price).filter(Boolean);
  if (prices.length === 0) return { high: 0, low: 0, range: 0 };
  
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  
  return { high, low, range: high - low };
};

/**
 * Calculate price velocity (speed of movement)
 */
const calculatePriceVelocity = (ticks, count) => {
  if (!ticks || ticks.length < 2) return { velocity: 0, acceleration: 0 };
  
  const recentTicks = ticks.slice(-count);
  if (recentTicks.length < 2) return { velocity: 0, acceleration: 0 };
  
  const prices = recentTicks.map(t => t.price).filter(Boolean);
  if (prices.length < 2) return { velocity: 0, acceleration: 0 };
  
  // Velocity = price change per tick
  const totalChange = prices[prices.length - 1] - prices[0];
  const velocity = totalChange / prices.length;
  
  // Acceleration = change in velocity
  const midPoint = Math.floor(prices.length / 2);
  const firstHalfVelocity = (prices[midPoint] - prices[0]) / midPoint;
  const secondHalfVelocity = (prices[prices.length - 1] - prices[midPoint]) / (prices.length - midPoint);
  const acceleration = secondHalfVelocity - firstHalfVelocity;
  
  return { velocity, acceleration };
};

/**
 * Get current market session
 */
const getMarketSession = (hour) => {
  // US Eastern Time sessions (adjust if needed)
  if (hour >= 9 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 14) return 'midday';
  if (hour >= 14 && hour < 16) return 'afternoon';
  if (hour >= 16 && hour < 18) return 'close';
  if (hour >= 18 || hour < 9) return 'overnight';
  return 'unknown';
};

/**
 * Get minutes since market open (9:30 AM ET)
 */
const getMinutesSinceOpen = (hour) => {
  const marketOpenHour = 9;
  const marketOpenMinute = 30;
  const now = new Date();
  const currentMinutes = hour * 60 + now.getMinutes();
  const openMinutes = marketOpenHour * 60 + marketOpenMinute;
  return Math.max(0, currentMinutes - openMinutes);
};

/**
 * Analyze price level interaction
 * Determines if entry was near support/resistance
 */
const analyzePriceLevelInteraction = (entryPrice, ticks) => {
  if (!ticks || ticks.length < 20) return null;
  
  const prices = ticks.map(t => t.price).filter(Boolean);
  if (prices.length < 20) return null;
  
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const range = high - low || 1;
  
  // Position within range (0 = at low, 1 = at high)
  const positionInRange = (entryPrice - low) / range;
  
  // Distance to recent high/low
  const distanceToHigh = high - entryPrice;
  const distanceToLow = entryPrice - low;
  
  // Determine level type
  let levelType = 'middle';
  if (positionInRange > 0.8) levelType = 'near_high';
  else if (positionInRange < 0.2) levelType = 'near_low';
  else if (positionInRange > 0.6) levelType = 'upper_middle';
  else if (positionInRange < 0.4) levelType = 'lower_middle';
  
  return {
    positionInRange: Math.round(positionInRange * 100) / 100,
    distanceToHigh,
    distanceToLow,
    recentHigh: high,
    recentLow: low,
    levelType
  };
};

/**
 * Determine what type of level this price represents
 */
const determineLevelType = (price, ticks) => {
  if (!ticks || ticks.length < 10) return 'unknown';
  
  const prices = ticks.map(t => t.price).filter(Boolean);
  if (prices.length < 10) return 'unknown';
  
  const high = Math.max(...prices);
  const low = Math.min(...prices);
  const range = high - low || 1;
  const tickSize = 0.25;
  
  // Check if near recent high (potential resistance)
  if (Math.abs(price - high) <= tickSize * 4) return 'resistance';
  
  // Check if near recent low (potential support)
  if (Math.abs(price - low) <= tickSize * 4) return 'support';
  
  // Check for breakout (above recent high)
  if (price > high) return 'breakout_high';
  
  // Check for breakdown (below recent low)
  if (price < low) return 'breakout_low';
  
  return 'middle';
};

/**
 * Learn from a completed trade
 * Extracts patterns from winning and losing trades
 * 
 * Stores ENRICHED context that API doesn't provide:
 * - Market conditions (volatility, trend, velocity)
 * - Time context (hour, session, day)
 * - AI state (what action was recommended)
 * - Price level interaction
 */
const learnFromTrade = (trade, result) => {
  // Build comprehensive pattern from trade context
  const pattern = {
    timestamp: trade.timestamp,
    result,
    pnl: trade.pnl,
    direction: trade.direction || trade.side,
    symbol: trade.symbol,
    
    // ========== MARKET CONTEXT (from feedTradeResult) ==========
    marketContext: trade.marketContext || {
      priceAction: { trend: 'unknown', strength: 0 },
      volatility: 0,
      volumeProfile: { trend: 'unknown' },
      trendStrength: { strength: 0, direction: 'unknown' },
      priceVelocity: { velocity: 0, acceleration: 0 }
    },
    
    // ========== TIME CONTEXT ==========
    timeContext: trade.timeContext || {
      hour: new Date().getHours(),
      dayOfWeek: 'unknown',
      session: 'unknown'
    },
    
    // ========== AI STATE AT TRADE ==========
    aiContext: trade.aiContext || {
      action: 'NORMAL',
      sizeMultiplier: 1.0
    },
    
    // ========== PRICE LEVEL ==========
    levelContext: trade.levelContext || null,
    
    // ========== SIGNAL CHARACTERISTICS ==========
    signal: trade.signalUsed ? {
      confidence: trade.signalUsed.confidence,
      entry: trade.signalUsed.entry,
      stopLoss: trade.signalUsed.stopLoss,
      takeProfit: trade.signalUsed.takeProfit,
      direction: trade.signalUsed.direction
    } : null,
    
    // ========== DERIVED METRICS ==========
    derived: {
      // Was this trade during a "good" hour (based on historical data)?
      hourlyWinRate: getHourlyWinRate(trade.timeContext?.hour),
      // Was AI cautious or aggressive?
      aiWasCautious: trade.aiContext?.action === 'CAUTIOUS' || trade.aiContext?.action === 'PAUSE',
      // Was entry near key level?
      nearKeyLevel: trade.levelContext?.levelType === 'support' || trade.levelContext?.levelType === 'resistance',
      // High volatility trade?
      highVolatility: (trade.marketContext?.volatility || 0) > 0.002,
      // Strong trend alignment?
      trendAligned: trade.marketContext?.trendStrength?.aligned || false
    }
  };
  
  if (result === 'win') {
    supervisorState.winningPatterns.push(pattern);
    // Keep last 100 winning patterns (increased for better learning)
    if (supervisorState.winningPatterns.length > 100) {
      supervisorState.winningPatterns = supervisorState.winningPatterns.slice(-100);
    }
  } else {
    supervisorState.losingPatterns.push(pattern);
    // Keep last 100 losing patterns
    if (supervisorState.losingPatterns.length > 100) {
      supervisorState.losingPatterns = supervisorState.losingPatterns.slice(-100);
    }
  }
};

/**
 * Get historical win rate for a specific hour
 * Returns null if not enough data
 */
const getHourlyWinRate = (hour) => {
  if (hour === null || hour === undefined) return null;
  
  // Check session data first
  const hourKey = String(hour);
  const sessionHourly = supervisorState.hourlyPerformance[hourKey];
  if (sessionHourly && sessionHourly.trades >= 3) {
    return sessionHourly.wins / sessionHourly.trades;
  }
  
  // Check historical data
  const saved = loadLearningData();
  const historicalHourly = saved.hourlyStats?.[hourKey];
  if (historicalHourly && historicalHourly.trades >= 5) {
    return historicalHourly.wins / historicalHourly.trades;
  }
  
  return null;
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
 * 
 * Uses BOTH session data AND historical data for decisions
 */
const analyzeAndOptimize = async () => {
  if (!supervisorState.active || supervisorState.agents.length === 0) return;
  
  const perf = supervisorState.performance;
  
  // Skip if not enough data
  if (perf.trades < 3) return;
  
  // Load historical data for context
  const historicalData = loadLearningData();
  const strategyProfile = historicalData.strategyProfile || {};
  
  // Get current time context
  const currentHour = new Date().getHours();
  const currentDay = new Date().getDay();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  
  // ========== HISTORICAL INSIGHTS ==========
  const historicalInsights = {
    // Is current hour historically good or bad?
    currentHourStats: historicalData.hourlyStats?.[String(currentHour)] || null,
    isGoodHour: (strategyProfile.bestHours || []).includes(currentHour),
    isBadHour: (strategyProfile.worstHours || []).includes(currentHour),
    
    // Is current day historically good or bad?
    currentDayStats: historicalData.dayOfWeekStats?.[dayNames[currentDay]] || null,
    isGoodDay: (strategyProfile.bestDays || []).includes(dayNames[currentDay]),
    isBadDay: (strategyProfile.worstDays || []).includes(dayNames[currentDay]),
    
    // Historical averages to compare against
    avgWinStreak: strategyProfile.avgWinStreak || 0,
    avgLossStreak: strategyProfile.avgLossStreak || 0,
    
    // Lifetime context
    lifetimeWinRate: historicalData.totalTrades > 0 
      ? historicalData.totalWins / historicalData.totalTrades 
      : null,
    lifetimeSessions: historicalData.totalSessions || 0
  };
  
  // ========== PATTERN ANALYSIS ==========
  const patternAnalysis = {
    // Analyze what conditions led to wins vs losses
    winningConditions: analyzeWinningConditions(),
    losingConditions: analyzeLosingConditions(),
    
    // Best/worst time patterns from this session
    sessionHourlyPerformance: supervisorState.hourlyPerformance,
    
    // Price level effectiveness
    levelEffectiveness: analyzeLevelEffectiveness()
  };
  
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
    
    // Recent trades with FULL context
    recentTrades: supervisorState.trades.slice(-10).map(t => ({
      side: t.direction || t.side,
      qty: t.qty,
      price: t.price,
      pnl: t.pnl,
      // Include context that API doesn't have
      hour: t.timeContext?.hour,
      session: t.timeContext?.session,
      volatility: t.marketContext?.volatility,
      trendDirection: t.marketContext?.trendStrength?.direction,
      aiAction: t.aiContext?.action,
      nearLevel: t.levelContext?.levelType
    })),
    
    // Pattern summaries
    winningPatternCount: supervisorState.winningPatterns.length,
    losingPatternCount: supervisorState.losingPatterns.length,
    
    // Common characteristics of losing trades
    losingTradeAnalysis: analyzeLosingPatterns(),
    
    // ========== NEW: Historical context for AI ==========
    historicalInsights,
    patternAnalysis,
    
    // Current time context
    currentHour,
    currentSession: getMarketSession(currentHour),
    currentDay: dayNames[currentDay]
  };
  
  // Get suggestions from agents and apply
  await processAgentSuggestions(performanceData);
};

/**
 * Analyze conditions that led to winning trades
 */
const analyzeWinningConditions = () => {
  const patterns = supervisorState.winningPatterns;
  if (patterns.length < 3) return null;
  
  // Aggregate conditions
  const conditions = {
    // Market context
    avgVolatility: 0,
    trendDirections: { bullish: 0, bearish: 0, neutral: 0 },
    trendAligned: 0,
    
    // Time context
    hours: {},
    sessions: {},
    
    // AI context
    aiActions: { AGGRESSIVE: 0, NORMAL: 0, CAUTIOUS: 0, PAUSE: 0 },
    
    // Level context
    nearKeyLevel: 0,
    levelTypes: {}
  };
  
  for (const p of patterns) {
    // Market
    conditions.avgVolatility += p.marketContext?.volatility || 0;
    const trend = p.marketContext?.trendStrength?.direction || 'unknown';
    if (conditions.trendDirections[trend] !== undefined) conditions.trendDirections[trend]++;
    if (p.derived?.trendAligned) conditions.trendAligned++;
    
    // Time
    const hour = p.timeContext?.hour;
    if (hour !== undefined) conditions.hours[hour] = (conditions.hours[hour] || 0) + 1;
    const session = p.timeContext?.session;
    if (session) conditions.sessions[session] = (conditions.sessions[session] || 0) + 1;
    
    // AI
    const action = p.aiContext?.action || 'NORMAL';
    if (conditions.aiActions[action] !== undefined) conditions.aiActions[action]++;
    
    // Levels
    if (p.derived?.nearKeyLevel) conditions.nearKeyLevel++;
    const levelType = p.levelContext?.levelType;
    if (levelType) conditions.levelTypes[levelType] = (conditions.levelTypes[levelType] || 0) + 1;
  }
  
  conditions.avgVolatility /= patterns.length;
  conditions.trendAlignedPct = (conditions.trendAligned / patterns.length) * 100;
  conditions.nearKeyLevelPct = (conditions.nearKeyLevel / patterns.length) * 100;
  conditions.count = patterns.length;
  
  // Find best hour
  const bestHour = Object.entries(conditions.hours).sort((a, b) => b[1] - a[1])[0];
  conditions.bestHour = bestHour ? parseInt(bestHour[0]) : null;
  
  // Find best session
  const bestSession = Object.entries(conditions.sessions).sort((a, b) => b[1] - a[1])[0];
  conditions.bestSession = bestSession ? bestSession[0] : null;
  
  return conditions;
};

/**
 * Analyze conditions that led to losing trades
 */
const analyzeLosingConditions = () => {
  const patterns = supervisorState.losingPatterns;
  if (patterns.length < 3) return null;
  
  const conditions = {
    avgVolatility: 0,
    trendDirections: { bullish: 0, bearish: 0, neutral: 0 },
    trendAligned: 0,
    hours: {},
    sessions: {},
    aiActions: { AGGRESSIVE: 0, NORMAL: 0, CAUTIOUS: 0, PAUSE: 0 },
    nearKeyLevel: 0,
    levelTypes: {},
    highVolatility: 0
  };
  
  for (const p of patterns) {
    conditions.avgVolatility += p.marketContext?.volatility || 0;
    const trend = p.marketContext?.trendStrength?.direction || 'unknown';
    if (conditions.trendDirections[trend] !== undefined) conditions.trendDirections[trend]++;
    if (p.derived?.trendAligned) conditions.trendAligned++;
    if (p.derived?.highVolatility) conditions.highVolatility++;
    
    const hour = p.timeContext?.hour;
    if (hour !== undefined) conditions.hours[hour] = (conditions.hours[hour] || 0) + 1;
    const session = p.timeContext?.session;
    if (session) conditions.sessions[session] = (conditions.sessions[session] || 0) + 1;
    
    const action = p.aiContext?.action || 'NORMAL';
    if (conditions.aiActions[action] !== undefined) conditions.aiActions[action]++;
    
    if (p.derived?.nearKeyLevel) conditions.nearKeyLevel++;
    const levelType = p.levelContext?.levelType;
    if (levelType) conditions.levelTypes[levelType] = (conditions.levelTypes[levelType] || 0) + 1;
  }
  
  conditions.avgVolatility /= patterns.length;
  conditions.trendAlignedPct = (conditions.trendAligned / patterns.length) * 100;
  conditions.nearKeyLevelPct = (conditions.nearKeyLevel / patterns.length) * 100;
  conditions.highVolatilityPct = (conditions.highVolatility / patterns.length) * 100;
  conditions.count = patterns.length;
  
  // Find worst hour
  const worstHour = Object.entries(conditions.hours).sort((a, b) => b[1] - a[1])[0];
  conditions.worstHour = worstHour ? parseInt(worstHour[0]) : null;
  
  // Find worst session
  const worstSession = Object.entries(conditions.sessions).sort((a, b) => b[1] - a[1])[0];
  conditions.worstSession = worstSession ? worstSession[0] : null;
  
  return conditions;
};

/**
 * Analyze effectiveness of trading at key price levels
 */
const analyzeLevelEffectiveness = () => {
  const allPatterns = [...supervisorState.winningPatterns, ...supervisorState.losingPatterns];
  if (allPatterns.length < 5) return null;
  
  const levelStats = {};
  
  for (const p of allPatterns) {
    const levelType = p.levelContext?.levelType || 'unknown';
    if (!levelStats[levelType]) {
      levelStats[levelType] = { wins: 0, losses: 0, total: 0 };
    }
    levelStats[levelType].total++;
    if (p.result === 'win') levelStats[levelType].wins++;
    else levelStats[levelType].losses++;
  }
  
  // Calculate win rate per level type
  for (const type of Object.keys(levelStats)) {
    const stats = levelStats[type];
    stats.winRate = stats.total > 0 ? (stats.wins / stats.total) * 100 : 0;
  }
  
  return levelStats;
};

/**
 * Process agent suggestions and apply optimizations
 */
const processAgentSuggestions = async (performanceData) => {
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
 * Provides RICH context including historical data
 */
const getOptimizationFromAgent = async (agent, performanceData) => {
  const systemPrompt = `You are an AI supervisor for HQX Ultra Scalping, a professional futures trading strategy.

The strategy uses:
- Order flow analysis (delta, absorption, imbalance)
- Statistical models (z-score, standard deviation)
- Dynamic risk management (Kelly criterion)

You have access to:
1. CURRENT SESSION data (trades, P&L, streaks)
2. HISTORICAL data (which hours/days perform best, pattern analysis)
3. MARKET CONTEXT (volatility, trend, price levels)

ANALYZE ALL data and provide SPECIFIC, ACTIONABLE recommendations.

IMPORTANT: Your recommendations affect REAL MONEY. Be conservative when uncertain.

Respond in JSON:
{
  "assessment": "brief assessment of current conditions",
  "action": "AGGRESSIVE|NORMAL|CAUTIOUS|PAUSE",
  "sizeMultiplier": 0.5-1.5,
  "optimizations": [
    {"param": "name", "direction": "increase|decrease", "amount": "10%", "reason": "why based on data"}
  ],
  "learnings": "what patterns we identified from the data",
  "timeAdvice": "should we trade now based on historical hour/day performance?",
  "riskAdvice": "specific risk management suggestion",
  "confidence": 0-100
}`;

  // Build historical context string
  const hist = performanceData.historicalInsights || {};
  const hourStats = hist.currentHourStats;
  const dayStats = hist.currentDayStats;
  
  let historicalContext = '';
  if (hist.lifetimeSessions > 0) {
    historicalContext = `
HISTORICAL DATA (${hist.lifetimeSessions} sessions):
- Lifetime Win Rate: ${hist.lifetimeWinRate ? (hist.lifetimeWinRate * 100).toFixed(1) + '%' : 'N/A'}
- Current Hour (${performanceData.currentHour}:00): ${hist.isGoodHour ? 'HISTORICALLY GOOD' : hist.isBadHour ? 'HISTORICALLY BAD' : 'NEUTRAL'}
  ${hourStats ? `(${hourStats.trades} trades, ${hourStats.wins}W/${hourStats.losses}L, $${hourStats.pnl?.toFixed(2) || 0})` : ''}
- Current Day (${performanceData.currentDay}): ${hist.isGoodDay ? 'HISTORICALLY GOOD' : hist.isBadDay ? 'HISTORICALLY BAD' : 'NEUTRAL'}
  ${dayStats ? `(${dayStats.trades} trades, ${dayStats.wins}W/${dayStats.losses}L, $${dayStats.pnl?.toFixed(2) || 0})` : ''}
- Avg Win Streak: ${hist.avgWinStreak?.toFixed(1) || 'N/A'}, Avg Loss Streak: ${hist.avgLossStreak?.toFixed(1) || 'N/A'}`;
  }
  
  // Build pattern analysis string
  const patterns = performanceData.patternAnalysis || {};
  let patternContext = '';
  
  if (patterns.winningConditions) {
    const wc = patterns.winningConditions;
    patternContext += `
WINNING TRADE PATTERNS (${wc.count} trades):
- Best Hour: ${wc.bestHour !== null ? wc.bestHour + ':00' : 'N/A'}
- Best Session: ${wc.bestSession || 'N/A'}
- Avg Volatility: ${(wc.avgVolatility * 100).toFixed(3)}%
- Trend Aligned: ${wc.trendAlignedPct?.toFixed(0) || 0}%
- Near Key Level: ${wc.nearKeyLevelPct?.toFixed(0) || 0}%`;
  }
  
  if (patterns.losingConditions) {
    const lc = patterns.losingConditions;
    patternContext += `

LOSING TRADE PATTERNS (${lc.count} trades):
- Worst Hour: ${lc.worstHour !== null ? lc.worstHour + ':00' : 'N/A'}
- Worst Session: ${lc.worstSession || 'N/A'}
- Avg Volatility: ${(lc.avgVolatility * 100).toFixed(3)}%
- High Volatility: ${lc.highVolatilityPct?.toFixed(0) || 0}%
- Trend Aligned: ${lc.trendAlignedPct?.toFixed(0) || 0}%`;
  }
  
  if (patterns.levelEffectiveness) {
    const le = patterns.levelEffectiveness;
    const levelSummary = Object.entries(le)
      .filter(([k, v]) => v.total >= 2)
      .map(([k, v]) => `${k}: ${v.winRate.toFixed(0)}% (${v.total} trades)`)
      .join(', ');
    if (levelSummary) {
      patternContext += `

LEVEL EFFECTIVENESS: ${levelSummary}`;
    }
  }

  const prompt = `STRATEGY PERFORMANCE ANALYSIS

SESSION STATS:
- Trades: ${performanceData.trades} (${performanceData.wins}W / ${performanceData.losses}L)
- Win Rate: ${(performanceData.winRate * 100).toFixed(1)}%
- P&L: $${performanceData.pnl.toFixed(2)}
- Max Drawdown: $${performanceData.maxDrawdown.toFixed(2)}
- Current Streak: ${performanceData.winStreak > 0 ? performanceData.winStreak + ' wins' : performanceData.lossStreak + ' losses'}
- Current Session: ${performanceData.currentSession} (${performanceData.currentHour}:00)
${historicalContext}
${patternContext}

RECENT TRADES (with context):
${performanceData.recentTrades.map(t => 
  `${t.side} @ ${t.price} → $${t.pnl?.toFixed(2)} | ${t.session || 'N/A'} | vol:${t.volatility ? (t.volatility * 100).toFixed(2) + '%' : 'N/A'} | trend:${t.trendDirection || 'N/A'} | level:${t.nearLevel || 'N/A'}`
).join('\n')}

Based on ALL this data:
1. What patterns do you see in winning vs losing trades?
2. Should we trade now (considering hour/day history)?
3. What SPECIFIC optimizations would improve performance?`;

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
