/**
 * AI Supervisor
 * Manages AI supervision of algo trading
 * 
 * STRICT RULE: NO MOCK DATA, NO SIMULATION, NO ESTIMATION
 * All data comes from real APIs (ProjectX, Rithmic, Tradovate)
 */

const { connections } = require('../session');
const { analyzeTrading, analyzePerformance, getMarketAdvice } = require('./client');

let aiService = null;

// Lazy load to avoid circular dependency
const getAIService = () => {
  if (!aiService) {
    aiService = require('./index');
  }
  return aiService;
};

// In-memory supervision sessions
const supervisionSessions = new Map();

// Consensus supervision interval
let consensusInterval = null;

/**
 * AI Supervisor Class
 * Uses REAL data from connected trading APIs
 */
class AISupervisor {
  /**
   * Start supervision for an agent
   */
  static start(agentId, service, accountId) {
    if (supervisionSessions.has(agentId)) {
      return { success: false, error: 'Supervision already active' };
    }
    
    const agentInfo = getAIService().getAgent(agentId);
    if (!agentInfo) {
      return { success: false, error: 'Agent not found' };
    }
    
    if (!service || !accountId) {
      return { success: false, error: 'Service and accountId required' };
    }
    
    const session = {
      agentId,
      agent: agentInfo,
      service,
      accountId,
      startTime: Date.now(),
      lastCheck: Date.now(),
      lastData: null,
      decisions: [],
      metrics: {
        totalDecisions: 0,
        interventions: 0,
        optimizations: 0,
        riskWarnings: 0
      },
      interval: null
    };
    
    const currentSessionCount = supervisionSessions.size;
    
    if (currentSessionCount === 0) {
      // First agent - start individual supervision
      session.interval = setInterval(() => {
        this.supervise(agentId);
      }, 10000); // Every 10 seconds
      
      supervisionSessions.set(agentId, session);
      
      return { 
        success: true, 
        message: `AI supervision started: ${agentInfo.name}`,
        mode: 'single'
      };
      
    } else {
      // Additional agent - switch to consensus mode
      this.switchToConsensusMode();
      session.interval = null;
      supervisionSessions.set(agentId, session);
      
      return { 
        success: true, 
        message: `Added ${agentInfo.name} to supervision`,
        mode: 'consensus',
        totalAgents: currentSessionCount + 1
      };
    }
  }

  /**
   * Switch to consensus mode when multiple agents
   */
  static switchToConsensusMode() {
    // Clear all individual intervals
    for (const [agentId, session] of supervisionSessions.entries()) {
      if (session.interval) {
        clearInterval(session.interval);
        session.interval = null;
      }
    }
    
    // Start single consensus loop
    if (!consensusInterval) {
      consensusInterval = setInterval(() => {
        this.superviseConsensus();
      }, 10000);
    }
  }

  /**
   * Stop supervision for an agent
   */
  static stop(agentId) {
    const session = supervisionSessions.get(agentId);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }
    
    if (session.interval) {
      clearInterval(session.interval);
    }
    
    const duration = Date.now() - session.startTime;
    supervisionSessions.delete(agentId);
    
    // Check if we need to switch back to single agent mode
    const remainingSessions = supervisionSessions.size;
    if (remainingSessions === 1 && consensusInterval) {
      clearInterval(consensusInterval);
      consensusInterval = null;
      
      const remainingSession = supervisionSessions.values().next().value;
      if (remainingSession && !remainingSession.interval) {
        const remainingAgentId = remainingSession.agentId;
        remainingSession.interval = setInterval(() => {
          this.supervise(remainingAgentId);
        }, 10000);
      }
    } else if (remainingSessions === 0 && consensusInterval) {
      clearInterval(consensusInterval);
      consensusInterval = null;
    }
    
    return { 
      success: true, 
      duration: Math.round(duration / 1000),
      metrics: session.metrics
    };
  }
  
  /**
   * Main supervision loop - single agent
   * Fetches REAL data from APIs and analyzes with AI
   * 
   * Data source: Trading APIs (ProjectX, Rithmic, Tradovate)
   * AI source: Configured AI provider (real API call)
   */
  static async supervise(agentId) {
    const session = supervisionSessions.get(agentId);
    if (!session) return;
    
    try {
      session.lastCheck = Date.now();
      
      // Get REAL data from API
      const data = await this.fetchRealData(session.service, session.accountId);
      if (!data) return;
      
      session.lastData = data;
      session.metrics.lastFetch = Date.now();
      
      // Call AI for analysis (real API call, returns null if fails)
      const aiDecision = await analyzeTrading(session.agent, data);
      
      if (aiDecision) {
        // Store decision with timestamp
        const decision = {
          timestamp: Date.now(),
          action: aiDecision.action || null,
          confidence: aiDecision.confidence || null,
          reason: aiDecision.reason || null,
          dataSnapshot: {
            balance: data.account?.balance ?? null,
            pnl: data.account?.profitAndLoss ?? null,
            positions: data.positions?.length ?? 0,
            orders: data.orders?.length ?? 0
          }
        };
        
        session.decisions.push(decision);
        session.metrics.totalDecisions++;
        
        // Track decision types
        if (aiDecision.action === 'REDUCE_SIZE' || aiDecision.action === 'PAUSE') {
          session.metrics.interventions++;
        } else if (aiDecision.action === 'CONTINUE') {
          session.metrics.optimizations++;
        }
        
        // Check for risk warnings
        if (aiDecision.confidence !== null && aiDecision.confidence < 50) {
          session.metrics.riskWarnings++;
        }
        
        // Keep only last 100 decisions to prevent memory bloat
        if (session.decisions.length > 100) {
          session.decisions = session.decisions.slice(-100);
        }
      }
      
    } catch (error) {
      // Silent fail - don't spam logs
    }
  }

  /**
   * Multi-agent consensus supervision loop
   * Each agent analyzes data independently, then consensus is calculated
   * 
   * Data source: Trading APIs (ProjectX, Rithmic, Tradovate)
   * AI source: Each agent's configured AI provider (real API calls)
   */
  static async superviseConsensus() {
    const allSessions = Array.from(supervisionSessions.entries());
    if (allSessions.length === 0) return;
    
    try {
      const decisions = [];
      
      // Fetch data and get AI analysis for each session
      for (const [agentId, session] of allSessions) {
        const data = await this.fetchRealData(session.service, session.accountId);
        if (!data) continue;
        
        session.lastData = data;
        session.lastCheck = Date.now();
        session.metrics.lastFetch = Date.now();
        
        // Call AI for analysis (real API call)
        const aiDecision = await analyzeTrading(session.agent, data);
        
        if (aiDecision) {
          const decision = {
            timestamp: Date.now(),
            agentId,
            agentName: session.agent.name,
            action: aiDecision.action || null,
            confidence: aiDecision.confidence || null,
            reason: aiDecision.reason || null,
            dataSnapshot: {
              balance: data.account?.balance ?? null,
              pnl: data.account?.profitAndLoss ?? null,
              positions: data.positions?.length ?? 0,
              orders: data.orders?.length ?? 0
            }
          };
          
          session.decisions.push(decision);
          session.metrics.totalDecisions++;
          decisions.push(decision);
          
          // Track decision types
          if (aiDecision.action === 'REDUCE_SIZE' || aiDecision.action === 'PAUSE') {
            session.metrics.interventions++;
          } else if (aiDecision.action === 'CONTINUE') {
            session.metrics.optimizations++;
          }
          
          if (aiDecision.confidence !== null && aiDecision.confidence < 50) {
            session.metrics.riskWarnings++;
          }
          
          // Keep only last 100 decisions
          if (session.decisions.length > 100) {
            session.decisions = session.decisions.slice(-100);
          }
        }
      }
      
      // Calculate consensus if multiple decisions
      if (decisions.length > 1) {
        this.calculateConsensus(decisions);
      }
      
    } catch (error) {
      // Silent fail
    }
  }
  
  /**
   * Calculate consensus from multiple agent decisions
   * RULE: ALL agents must agree (100% unanimity) before taking action
   * 
   * @param {Array} decisions - Array of agent decisions
   * @returns {Object|null} Consensus result
   */
  static calculateConsensus(decisions) {
    if (!decisions || decisions.length === 0) return null;
    
    // Count votes for each action
    const votes = {};
    let totalConfidence = 0;
    let validConfidenceCount = 0;
    
    for (const decision of decisions) {
      if (decision.action) {
        votes[decision.action] = (votes[decision.action] || 0) + 1;
      }
      if (decision.confidence !== null) {
        totalConfidence += decision.confidence;
        validConfidenceCount++;
      }
    }
    
    // Check for UNANIMITY - ALL agents must agree
    let unanimousAction = null;
    let isUnanimous = false;
    
    for (const [action, count] of Object.entries(votes)) {
      if (count === decisions.length) {
        // All agents voted for this action
        unanimousAction = action;
        isUnanimous = true;
        break;
      }
    }
    
    // Calculate average confidence
    const avgConfidence = validConfidenceCount > 0 
      ? Math.round(totalConfidence / validConfidenceCount) 
      : null;
    
    // Store consensus result
    // If not unanimous, action is HOLD (no action taken)
    const consensus = {
      timestamp: Date.now(),
      action: isUnanimous ? unanimousAction : 'HOLD',
      confidence: isUnanimous ? avgConfidence : null,
      votes,
      agentCount: decisions.length,
      isUnanimous,
      agreement: isUnanimous ? 1.0 : 0
    };
    
    // Store consensus in first session for retrieval
    const firstSession = supervisionSessions.values().next().value;
    if (firstSession) {
      firstSession.lastConsensus = consensus;
    }
    
    return consensus;
  }

  /**
   * Fetch REAL data from trading API
   * NO MOCK, NO SIMULATION
   */
  static async fetchRealData(service, accountId) {
    if (!service || !accountId) return null;
    
    const data = {
      timestamp: Date.now(),
      account: null,
      positions: [],
      orders: [],
      trades: []
    };
    
    try {
      // Get account with P&L
      const accountResult = await service.getTradingAccounts();
      if (accountResult.success && accountResult.accounts) {
        data.account = accountResult.accounts.find(a => 
          a.accountId === accountId || 
          a.rithmicAccountId === accountId ||
          String(a.accountId) === String(accountId)
        );
      }
      
      // Get open positions
      const posResult = await service.getPositions(accountId);
      if (posResult.success && posResult.positions) {
        data.positions = posResult.positions;
      }
      
      // Get open orders
      const orderResult = await service.getOrders(accountId);
      if (orderResult.success && orderResult.orders) {
        data.orders = orderResult.orders;
      }
      
      // Get today's trades (if available)
      if (typeof service.getTrades === 'function') {
        const tradesResult = await service.getTrades(accountId);
        if (tradesResult.success && tradesResult.trades) {
          data.trades = tradesResult.trades;
        }
      }
      
    } catch (error) {
      return null;
    }
    
    return data;
  }

  /**
   * Get supervision status for an agent
   */
  static getStatus(agentId) {
    const session = supervisionSessions.get(agentId);
    if (!session) {
      return { active: false };
    }
    
    const duration = Date.now() - session.startTime;
    return {
      active: true,
      agentId: session.agentId,
      agentName: session.agent.name,
      accountId: session.accountId,
      duration,
      lastCheck: session.lastCheck,
      lastData: session.lastData,
      metrics: session.metrics,
      decisionsCount: session.decisions.length
    };
  }
  
  /**
   * Get all active supervision sessions
   */
  static getAllStatus() {
    const sessions = [];
    const isConsensusMode = supervisionSessions.size > 1 && consensusInterval !== null;
    
    for (const [agentId, session] of supervisionSessions.entries()) {
      sessions.push({
        active: true,
        agentId,
        agentName: session.agent.name,
        accountId: session.accountId,
        duration: Date.now() - session.startTime,
        lastCheck: session.lastCheck,
        metrics: session.metrics,
        mode: isConsensusMode ? 'consensus' : 'single'
      });
    }
    
    return sessions;
  }
  
  /**
   * Get aggregated data from all supervised accounts
   * Returns REAL data only
   */
  static getAggregatedData() {
    const result = {
      totalAccounts: 0,
      totalBalance: 0,
      totalPnL: 0,
      totalPositions: 0,
      totalOrders: 0,
      totalTrades: 0,
      accounts: []
    };
    
    for (const [agentId, session] of supervisionSessions.entries()) {
      if (session.lastData) {
        const data = session.lastData;
        
        if (data.account) {
          result.totalAccounts++;
          result.totalBalance += data.account.balance || 0;
          result.totalPnL += data.account.profitAndLoss || 0;
          result.accounts.push({
            accountId: data.account.accountId,
            accountName: data.account.accountName,
            balance: data.account.balance,
            pnl: data.account.profitAndLoss,
            platform: data.account.platform
          });
        }
        
        result.totalPositions += data.positions?.length || 0;
        result.totalOrders += data.orders?.length || 0;
        result.totalTrades += data.trades?.length || 0;
      }
    }
    
    return result;
  }
  
  /**
   * Get latest AI decision for an agent
   * @param {string} agentId - Agent ID
   * @returns {Object|null} Latest decision or null
   */
  static getLatestDecision(agentId) {
    const session = supervisionSessions.get(agentId);
    if (!session || session.decisions.length === 0) {
      return null;
    }
    return session.decisions[session.decisions.length - 1];
  }
  
  /**
   * Get all decisions for an agent
   * @param {string} agentId - Agent ID
   * @param {number} limit - Max decisions to return (default 10)
   * @returns {Array} Array of decisions
   */
  static getDecisions(agentId, limit = 10) {
    const session = supervisionSessions.get(agentId);
    if (!session) {
      return [];
    }
    return session.decisions.slice(-limit);
  }
  
  /**
   * Get latest consensus (multi-agent mode only)
   * @returns {Object|null} Latest consensus or null
   */
  static getConsensus() {
    if (supervisionSessions.size <= 1) {
      return null;
    }
    const firstSession = supervisionSessions.values().next().value;
    return firstSession?.lastConsensus || null;
  }
  
  /**
   * Stop all supervision sessions
   */
  static stopAll() {
    const results = [];
    const agentIds = Array.from(supervisionSessions.keys());
    
    for (const agentId of agentIds) {
      const result = this.stop(agentId);
      results.push({ agentId, ...result });
    }
    
    return results;
  }
  
  /**
   * Check if any supervision is active
   */
  static isActive() {
    return supervisionSessions.size > 0;
  }
  
  /**
   * Get session count
   */
  static getSessionCount() {
    return supervisionSessions.size;
  }
  
  /**
   * Feed market tick to all agents (sync with strategy)
   * Agents receive the same data as the strategy in real-time
   * 
   * @param {Object} tick - Market tick data { price, bid, ask, volume, timestamp }
   */
  static feedTick(tick) {
    if (supervisionSessions.size === 0) return;
    
    // Store latest tick in all sessions
    for (const [agentId, session] of supervisionSessions.entries()) {
      if (!session.marketData) {
        session.marketData = { ticks: [], lastTick: null };
      }
      session.marketData.lastTick = tick;
      session.marketData.ticks.push(tick);
      
      // Keep only last 1000 ticks to prevent memory bloat
      if (session.marketData.ticks.length > 1000) {
        session.marketData.ticks = session.marketData.ticks.slice(-1000);
      }
    }
  }
  
  /**
   * Feed strategy signal to all agents (sync with strategy)
   * Agents see every signal the strategy generates
   * 
   * @param {Object} signal - Strategy signal { direction, entry, stopLoss, takeProfit, confidence }
   */
  static feedSignal(signal) {
    if (supervisionSessions.size === 0) return;
    
    const signalData = {
      timestamp: Date.now(),
      direction: signal.direction,
      entry: signal.entry,
      stopLoss: signal.stopLoss,
      takeProfit: signal.takeProfit,
      confidence: signal.confidence
    };
    
    // Store signal in all sessions
    for (const [agentId, session] of supervisionSessions.entries()) {
      if (!session.signals) {
        session.signals = [];
      }
      session.signals.push(signalData);
      
      // Keep only last 100 signals
      if (session.signals.length > 100) {
        session.signals = session.signals.slice(-100);
      }
    }
  }
  
  /**
   * Feed trade execution to all agents (sync with strategy)
   * Agents see every trade executed
   * 
   * @param {Object} trade - Trade data { side, qty, price, pnl, symbol }
   */
  static feedTrade(trade) {
    if (supervisionSessions.size === 0) return;
    
    const tradeData = {
      timestamp: Date.now(),
      side: trade.side,
      qty: trade.qty,
      price: trade.price,
      pnl: trade.pnl,
      symbol: trade.symbol
    };
    
    // Store trade in all sessions
    for (const [agentId, session] of supervisionSessions.entries()) {
      if (!session.trades) {
        session.trades = [];
      }
      session.trades.push(tradeData);
    }
  }
  
  /**
   * Update current position for all agents
   * 
   * @param {Object} position - Position data { qty, side, entryPrice, pnl }
   */
  static updatePosition(position) {
    if (supervisionSessions.size === 0) return;
    
    for (const [agentId, session] of supervisionSessions.entries()) {
      session.currentPosition = {
        timestamp: Date.now(),
        qty: position.qty,
        side: position.side,
        entryPrice: position.entryPrice,
        pnl: position.pnl
      };
    }
  }
  
  /**
   * Update P&L for all agents
   * 
   * @param {number} pnl - Current session P&L
   * @param {number} balance - Account balance
   */
  static updatePnL(pnl, balance) {
    if (supervisionSessions.size === 0) return;
    
    for (const [agentId, session] of supervisionSessions.entries()) {
      session.currentPnL = pnl;
      session.currentBalance = balance;
    }
  }
  
  /**
   * Check if agents recommend intervention (PAUSE, REDUCE_SIZE, etc.)
   * In CONSENSUS mode, ALL agents must agree to continue trading
   * 
   * @returns {Object} { shouldContinue: boolean, action: string, reason: string }
   */
  static checkIntervention() {
    if (supervisionSessions.size === 0) {
      return { shouldContinue: true, action: 'CONTINUE', reason: 'No AI supervision active' };
    }
    
    // Get last consensus or individual decision
    const consensus = this.getConsensus();
    
    if (consensus && consensus.isUnanimous) {
      if (consensus.action === 'PAUSE' || consensus.action === 'STOP') {
        return { shouldContinue: false, action: consensus.action, reason: 'AI agents recommend pause' };
      }
      if (consensus.action === 'REDUCE_SIZE') {
        return { shouldContinue: true, action: 'REDUCE_SIZE', reason: 'AI agents recommend reducing size' };
      }
    } else if (consensus && !consensus.isUnanimous) {
      // Agents disagree - be conservative, don't take new trades
      return { shouldContinue: false, action: 'HOLD', reason: 'AI agents disagree - waiting for consensus' };
    }
    
    return { shouldContinue: true, action: 'CONTINUE', reason: 'AI supervision active' };
  }
  
  /**
   * Get real-time sync status for display
   * Shows what data the agents are receiving
   * 
   * @returns {Object} Sync status
   */
  static getSyncStatus() {
    if (supervisionSessions.size === 0) {
      return { synced: false, agents: 0 };
    }
    
    const firstSession = supervisionSessions.values().next().value;
    
    return {
      synced: true,
      agents: supervisionSessions.size,
      lastTick: firstSession?.marketData?.lastTick?.timestamp || null,
      tickCount: firstSession?.marketData?.ticks?.length || 0,
      signalCount: firstSession?.signals?.length || 0,
      tradeCount: firstSession?.trades?.length || 0,
      currentPnL: firstSession?.currentPnL || 0,
      currentPosition: firstSession?.currentPosition || null
    };
  }
  
  /**
   * Request strategy optimization from all agents
   * Agents analyze performance data and suggest improvements
   * In CONSENSUS mode, only unanimous suggestions are applied
   * 
   * @param {Object} performanceData - Strategy performance data
   * @returns {Promise<Object|null>} Optimization suggestions (consensus)
   */
  static async requestOptimization(performanceData) {
    if (supervisionSessions.size === 0) return null;
    
    const allSessions = Array.from(supervisionSessions.values());
    const suggestions = [];
    
    // Get optimization suggestions from each agent
    for (const session of allSessions) {
      try {
        const suggestion = await analyzePerformance(session.agent, performanceData);
        if (suggestion) {
          suggestions.push({
            agentId: session.agentId,
            agentName: session.agent.name,
            ...suggestion
          });
        }
      } catch (e) {
        // Silent fail for individual agent
      }
    }
    
    if (suggestions.length === 0) return null;
    
    // If single agent, return its suggestion
    if (suggestions.length === 1) {
      return {
        mode: 'INDIVIDUAL',
        ...suggestions[0]
      };
    }
    
    // CONSENSUS MODE: Find common optimizations
    const consensusOptimizations = [];
    const allOptimizations = suggestions.flatMap(s => s.optimizations || []);
    
    // Group by parameter name
    const paramGroups = {};
    for (const opt of allOptimizations) {
      if (!opt.param) continue;
      if (!paramGroups[opt.param]) {
        paramGroups[opt.param] = [];
      }
      paramGroups[opt.param].push(opt);
    }
    
    // Find unanimous suggestions (all agents agree on direction)
    for (const [param, opts] of Object.entries(paramGroups)) {
      if (opts.length === suggestions.length) {
        // All agents suggested this param - check if they agree on direction
        const directions = opts.map(o => {
          const current = parseFloat(o.current) || 0;
          const suggested = parseFloat(o.suggested) || 0;
          return suggested > current ? 'increase' : suggested < current ? 'decrease' : 'same';
        });
        
        const allSame = directions.every(d => d === directions[0]);
        if (allSame && directions[0] !== 'same') {
          // Unanimous - use average of suggested values
          const avgSuggested = opts.reduce((sum, o) => sum + (parseFloat(o.suggested) || 0), 0) / opts.length;
          consensusOptimizations.push({
            param,
            current: opts[0].current,
            suggested: avgSuggested.toFixed(2),
            reason: `Unanimous (${suggestions.length} agents agree)`,
            direction: directions[0]
          });
        }
      }
    }
    
    // Calculate average confidence
    const avgConfidence = Math.round(
      suggestions.reduce((sum, s) => sum + (s.confidence || 0), 0) / suggestions.length
    );
    
    // Determine consensus market condition
    const conditions = suggestions.map(s => s.marketCondition).filter(Boolean);
    const conditionCounts = {};
    for (const c of conditions) {
      conditionCounts[c] = (conditionCounts[c] || 0) + 1;
    }
    const consensusCondition = Object.entries(conditionCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
    
    return {
      mode: 'CONSENSUS',
      agentCount: suggestions.length,
      isUnanimous: consensusOptimizations.length > 0,
      optimizations: consensusOptimizations,
      marketCondition: consensusCondition,
      confidence: avgConfidence,
      individualSuggestions: suggestions
    };
  }
  
  /**
   * Get real-time market advice from all agents
   * Used for dynamic position sizing and risk adjustment
   * 
   * @param {Object} marketData - Current market data
   * @returns {Promise<Object|null>} Market advice (consensus)
   */
  static async getMarketAdvice(marketData) {
    if (supervisionSessions.size === 0) return null;
    
    const allSessions = Array.from(supervisionSessions.values());
    const advices = [];
    
    // Get advice from each agent
    for (const session of allSessions) {
      try {
        const advice = await getMarketAdvice(session.agent, marketData);
        if (advice) {
          advices.push({
            agentId: session.agentId,
            agentName: session.agent.name,
            ...advice
          });
        }
      } catch (e) {
        // Silent fail
      }
    }
    
    if (advices.length === 0) return null;
    
    // Single agent
    if (advices.length === 1) {
      return {
        mode: 'INDIVIDUAL',
        ...advices[0]
      };
    }
    
    // CONSENSUS: All agents must agree on action
    const actions = advices.map(a => a.action);
    const allSameAction = actions.every(a => a === actions[0]);
    
    if (allSameAction) {
      // Unanimous action - average the size multiplier
      const avgMultiplier = advices.reduce((sum, a) => sum + (a.sizeMultiplier || 1), 0) / advices.length;
      const avgConfidence = Math.round(advices.reduce((sum, a) => sum + (a.confidence || 0), 0) / advices.length);
      
      return {
        mode: 'CONSENSUS',
        isUnanimous: true,
        action: actions[0],
        sizeMultiplier: Math.round(avgMultiplier * 100) / 100,
        confidence: avgConfidence,
        reason: `${advices.length} agents unanimous`,
        agentCount: advices.length
      };
    } else {
      // Agents disagree - be conservative
      return {
        mode: 'CONSENSUS',
        isUnanimous: false,
        action: 'CAUTIOUS',
        sizeMultiplier: 0.5,
        confidence: 0,
        reason: 'Agents disagree - reducing exposure',
        agentCount: advices.length,
        votes: actions.reduce((acc, a) => { acc[a] = (acc[a] || 0) + 1; return acc; }, {})
      };
    }
  }
  
  /**
   * Apply optimization to strategy
   * Called when agents have consensus on improvements
   * 
   * @param {Object} strategy - Strategy instance (M1)
   * @param {Object} optimization - Optimization to apply
   * @returns {boolean} Success
   */
  static applyOptimization(strategy, optimization) {
    if (!strategy || !optimization) return false;
    
    try {
      // Check if strategy has optimization method
      if (typeof strategy.applyOptimization === 'function') {
        strategy.applyOptimization(optimization);
        return true;
      }
      
      // Fallback: try to set individual parameters
      if (typeof strategy.setParameter === 'function' && optimization.param) {
        strategy.setParameter(optimization.param, optimization.suggested);
        return true;
      }
      
      return false;
    } catch (e) {
      return false;
    }
  }
}

module.exports = AISupervisor;
