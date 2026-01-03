/**
 * AI Supervisor
 * Manages AI supervision of algo trading
 * 
 * STRICT RULE: NO MOCK DATA, NO SIMULATION, NO ESTIMATION
 * All data comes from real APIs (ProjectX, Rithmic, Tradovate)
 */

const { connections } = require('../session');
const { analyzeTrading } = require('./client');

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
    
    // Find majority action
    let majorityAction = null;
    let maxVotes = 0;
    for (const [action, count] of Object.entries(votes)) {
      if (count > maxVotes) {
        maxVotes = count;
        majorityAction = action;
      }
    }
    
    // Calculate average confidence
    const avgConfidence = validConfidenceCount > 0 
      ? Math.round(totalConfidence / validConfidenceCount) 
      : null;
    
    // Store consensus result
    const consensus = {
      timestamp: Date.now(),
      action: majorityAction,
      confidence: avgConfidence,
      votes,
      agentCount: decisions.length,
      agreement: maxVotes / decisions.length
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
}

module.exports = AISupervisor;
