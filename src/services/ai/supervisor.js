/**
 * AI Supervisor
 * Manages AI supervision of algo trading
 */

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
 */
class AISupervisor {
  /**
   * Start supervision for an agent
   */
  static start(agentId, targetAlgo) {
    if (supervisionSessions.has(agentId)) {
      console.log(`Supervision already active for agent ${agentId}`);
      return false;
    }
    
    const agentInfo = getAIService().getAgent(agentId);
    if (!agentInfo) {
      console.log(`Agent ${agentId} not found`);
      return false;
    }
    
    const session = {
      agentId,
      agent: agentInfo,
      algo: targetAlgo,
      startTime: Date.now(),
      lastCheck: Date.now(),
      decisions: [],
      metrics: {
        totalDecisions: 0,
        interventions: 0,
        optimizations: 0,
        riskWarnings: 0
      },
      interval: null
    };
    
    // Check if this is the first agent or if we need consensus mode
    const currentSessionCount = supervisionSessions.size;
    
    if (currentSessionCount === 0) {
      // First agent - start individual supervision
      session.interval = setInterval(() => {
        this.supervise(agentId);
      }, 5000);
      
      supervisionSessions.set(agentId, session);
      console.log(`AI supervision started: ${agentInfo.name} monitoring HQX algo`);
      console.log(`   Mode: Single agent supervision`);
      
    } else {
      // Additional agent - switch to consensus mode
      console.log(`Adding ${agentInfo.name} to supervision`);
      console.log(`   Total agents: ${currentSessionCount + 1}`);
      
      // Stop individual loops and start consensus loop
      this.switchToConsensusMode();
      
      session.interval = null; // Will use consensus loop
      supervisionSessions.set(agentId, session);
    }
    
    return true;
  }

  /**
   * Switch to consensus mode when multiple agents
   */
  static switchToConsensusMode() {
    console.log(`\n🤝 SWITCHING TO MULTI-AGENT CONSENSUS MODE`);
    
    // Clear all individual intervals
    for (const [agentId, session] of supervisionSessions.entries()) {
      if (session.interval) {
        clearInterval(session.interval);
        session.interval = null;
      }
    }
    
    // Start single consensus loop
    if (!this.consensusInterval) {
      this.consensusInterval = setInterval(() => {
        this.superviseConsensus();
      }, 5000);
      
      console.log(`   Consensus loop started - all agents will vote on decisions`);
    }
  }

  /**
   * Start supervision for an agent
   */
  static start(agentId, targetAlgo) {
    if (supervisionSessions.has(agentId)) {
      console.log(`Supervision already active for agent ${agentId}`);
      return false;
    }
    
    const agent = getAIService().getAgent(agentId);
    if (!agent) {
      console.log(`Agent ${agentId} not found`);
      return false;
    }
    
    const session = {
      agentId,
      agent: agent,
      algo: targetAlgo,
      startTime: Date.now(),
      lastCheck: Date.now(),
      decisions: [],
      metrics: {
        totalDecisions: 0,
        interventions: 0,
        optimizations: 0,
        riskWarnings: 0
      },
      interval: null
    };
    
    // Start supervision loop (every 5 seconds)
    session.interval = setInterval(() => {
      this.supervise(agentId);
    }, 5000);
    
    supervisionSessions.set(agentId, session);
    console.log(`AI supervision started: ${agent.name} monitoring HQX algo`);
    
    return true;
  }
  
  /**
   * Stop supervision for an agent
   */
  static stop(agentId) {
    const session = supervisionSessions.get(agentId);
    if (!session) {
      return false;
    }
    
    if (session.interval) {
      clearInterval(session.interval);
    }
    
    const duration = Date.now() - session.startTime;
    supervisionSessions.delete(agentId);
    
    console.log(`AI supervision stopped for ${session.agent.name}`);
    console.log(`Session duration: ${Math.round(duration / 1000)}s`);
    console.log(`Decisions: ${session.metrics.totalDecisions}, Interventions: ${session.metrics.interventions}`);
    
    // Check if we need to switch back to single agent mode
    const remainingSessions = supervisionSessions.size;
    if (remainingSessions === 1 && consensusInterval) {
      // Last agent - switch back to single mode
      clearInterval(consensusInterval);
      consensusInterval = null;
      
      const remainingSession = supervisionSessions.values().next().value;
      if (remainingSession && !remainingSession.interval) {
        const remainingAgentId = remainingSession.agentId;
        remainingSession.interval = setInterval(() => {
          this.supervise(remainingAgentId);
        }, 5000);
        
        console.log(`Switched back to single agent supervision for ${remainingSession.agent.name}`);
      }
    } else if (remainingSessions === 0 && consensusInterval) {
      // No agents left
      clearInterval(consensusInterval);
      consensusInterval = null;
    }
    
    return true;
  }
  
  /**
   * Main supervision loop - single agent
   */
  static async supervise(agentId) {
    const session = supervisionSessions.get(agentId);
    if (!session) return;
    
    try {
      session.lastCheck = Date.now();
      
      // Get algo status
      const algoStatus = this.getAlgoStatus(session.algo);
      const marketData = this.getMarketData();
      const riskMetrics = this.getRiskMetrics(session.algo);
      
      // Make AI decision
      const decision = await this.makeAIDecision(session.agent, algoStatus, marketData, riskMetrics);
      
      if (decision) {
        session.decisions.push(decision);
        session.metrics.totalDecisions++;
        
        // Execute decision if confidence is high enough
        if (decision.confidence > 75) {
          await this.executeDecision(session, decision);
        }
      }
      
    } catch (error) {
      console.log(`Supervision error for agent ${agentId}: ${error.message}`);
    }
  }

  /**
   * Multi-agent consensus supervision loop
   */
  static async superviseConsensus() {
    const allSessions = Array.from(supervisionSessions.entries());
    if (allSessions.length === 0) return;
    
    try {
      // Get all active agents
      const allAgents = allSessions.map(([id, session]) => session.agent).filter(Boolean);
      
      if (allAgents.length === 0) return;
      
      console.log(`🤝 MULTI-AGENT CONSENSUS: ${allAgents.length} agents participating`);
      
      // Get algo status (use same algo for all agents)
      const mockAlgo = { name: 'HQX Ultra Scalping' }; // Would be real algo
      const algoStatus = this.getAlgoStatus(mockAlgo);
      const marketData = this.getMarketData();
      const riskMetrics = this.getRiskMetrics(mockAlgo);
      
      // Make consensus decision
      const consensusDecision = await this.makeConsensusDecision(allAgents, algoStatus, marketData, riskMetrics);
      
      if (consensusDecision) {
        // Update all sessions with the consensus decision
        for (const [agentId, session] of allSessions) {
          session.decisions.push({
            ...consensusDecision,
            timestamp: Date.now(),
            isConsensus: true,
            participantAgents: consensusDecision.agentNames
          });
          
          session.metrics.totalDecisions++;
          
          // Execute decision if confidence is high enough (lower threshold for consensus)
          if (consensusDecision.confidence > 70) {
            await this.executeConsensusDecision(session, consensusDecision);
          }
        }
      }
      
    } catch (error) {
      console.log(`Consensus supervision error: ${error.message}`);
    }
  }

  /**
   * Execute multi-agent consensus decision
   */
  static async executeConsensusDecision(session, decision) {
    const { agent, metrics } = session;
    
    console.log(`\n🎯 MULTI-AGENT CONSENSUS ACTION:`);
    console.log(`   Agents: ${decision.agentNames.join(', ')}`);
    console.log(`   Type: ${decision.type}`);
    console.log(`   Confidence: ${decision.confidence}%`);
    console.log(`   Reason: ${decision.reason}`);
    
    // Update metrics
    switch (decision.type) {
      case 'ADJUST_SIZE':
      case 'ADJUST_PARAMETERS':
      case 'ADJUST_STRATEGY':
        metrics.optimizations++;
        console.log(`   Action: Consensus optimization - ${decision.agentNames.length} agents agree`);
        break;
      case 'PAUSE_TRADING':
      case 'RISK_ADJUSTMENT':
        metrics.interventions++;
        console.log(`   Action: Consensus risk intervention - ${decision.agentNames.length} agents agree`);
        break;
      case 'ADJUST_FREQUENCY':
        metrics.interventions++;
        console.log(`   Action: Consensus frequency adjustment - ${decision.agentNames.length} agents agree`);
        break;
    }
    
    // In real implementation, this would actually modify the algo
    console.log(`   Status: Consensus decision executed across all agents\n`);
    
    return decision;
  }
  
  /**
   * Get algo status (placeholder for real implementation)
   */
  static getAlgoStatus(algo) {
    // This would interface with HQX Ultra Scalping
    // For now, return mock data
    return {
      active: true,
      positions: 1,
      currentPnL: 145.50,
      dayTrades: 8,
      winRate: 0.75,
      avgWin: 25.30,
      avgLoss: 8.20,
      lastTradeTime: Date.now() - 120000, // 2 minutes ago
      currentStrategy: 'momentum_scalping',
      parameters: {
        tradeSize: 2,
        stopLoss: 3,
        takeProfit: 6,
        maxPositions: 3
      }
    };
  }
  
  /**
   * Get market data (placeholder)
   */
  static getMarketData() {
    // This would get real market data
    return {
      symbol: 'ES',
      price: 4502.25,
      change: 12.50,
      volume: 1250000,
      volatility: 0.018,
      trend: 'bullish',
      momentum: 'strong',
      timeframe: '1m'
    };
  }
  
  /**
   * Get risk metrics (placeholder)
   */
  static getRiskMetrics(algo) {
    return {
      maxDrawdown: 0.025, // 2.5%
      currentDrawdown: 0.008, // 0.8%
      exposure: 0.65, // 65% of max
      dailyLoss: -45.30,
      sharpeRatio: 1.8,
      var95: 125.50 // Value at Risk
    };
  }
  
  /**
   * Make AI decision for single agent
   */
  static async makeAIDecision(agent, algoStatus, marketData, riskMetrics) {
    // Simulate AI decision making based on provider
    const decisions = [];
    
    switch (agent.providerId) {
      case 'anthropic':
        // Claude: Technical analysis expert
        if (marketData.volatility > 0.025 && algoStatus.parameters.tradeSize > 1) {
          decisions.push({
            type: 'ADJUST_SIZE',
            action: 'REDUCE',
            currentSize: algoStatus.parameters.tradeSize,
            suggestedSize: Math.max(1, Math.floor(algoStatus.parameters.tradeSize * 0.7)),
            reason: 'High volatility detected - reducing position size',
            confidence: 85,
            agentType: 'technical',
            urgency: 'medium'
          });
        }
        
        if (riskMetrics.currentDrawdown > 0.02) {
          decisions.push({
            type: 'PAUSE_TRADING',
            reason: 'Drawdown exceeding 2% - pausing to preserve capital',
            confidence: 92,
            agentType: 'technical',
            urgency: 'high'
          });
        }
        break;
        
      case 'openai':
        // OpenAI: Parameter optimization expert
        if (marketData.trend === 'bullish' && marketData.momentum === 'strong') {
          decisions.push({
            type: 'ADJUST_PARAMETERS',
            parameter: 'takeProfit',
            current: algoStatus.parameters.takeProfit,
            suggested: algoStatus.parameters.takeProfit * 1.25,
            reason: 'Strong bullish trend - increasing take profit target',
            confidence: 78,
            agentType: 'optimization',
            urgency: 'low'
          });
        }
        
        // OpenAI suggests scaling in consolidation
        if (marketData.volatility < 0.015) {
          decisions.push({
            type: 'ADJUST_STRATEGY',
            suggestedStrategy: 'scaling',
            reason: 'Low volatility - switching to scaling strategy',
            confidence: 72,
            agentType: 'optimization',
            urgency: 'medium'
          });
        }
        break;
        
      case 'deepseek':
        // DeepSeek: Trading and prop firm expert
        if (algoStatus.dayTrades > 8) {
          decisions.push({
            type: 'ADJUST_FREQUENCY',
            action: 'REDUCE',
            reason: 'Overtrading detected - reducing trade frequency',
            confidence: 88,
            agentType: 'trading',
            urgency: 'high'
          });
        }
        
        // DeepSeek focuses on prop firm rules
        if (riskMetrics.dailyLoss < -100) {
          decisions.push({
            type: 'RISK_ADJUSTMENT',
            adjustment: 'HALF_SIZE',
            reason: 'Daily loss approaching limit - halving position size',
            confidence: 95,
            agentType: 'trading',
            urgency: 'critical'
          });
        }
        break;
        
      default:
        // Generic decision for other providers
        if (marketData.volatility > 0.03) {
          decisions.push({
            type: 'ADJUST_SIZE',
            action: 'REDUCE',
            suggestedSize: Math.max(1, Math.floor(algoStatus.parameters.tradeSize * 0.6)),
            reason: 'Very high volatility - significant size reduction',
            confidence: 80,
            agentType: 'generic',
            urgency: 'medium'
          });
        }
        break;
    }
    
    return decisions.length > 0 ? decisions[0] : null;
  }

  /**
   * Make multi-agent consensus decision
   */
  static async makeConsensusDecision(allAgents, algoStatus, marketData, riskMetrics) {
    if (!allAgents || allAgents.length === 0) return null;
    
    if (allAgents.length === 1) {
      // Single agent - use normal decision
      return await this.makeAIDecision(allAgents[0], algoStatus, marketData, riskMetrics);
    }
    
    console.log(`🤝 CONSENSUS: Getting decisions from ${allAgents.length} agents...`);
    
    // Get decision from each agent
    const agentDecisions = [];
    
    for (const agent of allAgents) {
      const decision = await this.makeAIDecision(agent, algoStatus, marketData, riskMetrics);
      
      if (decision) {
        agentDecisions.push({
          agentId: agent.id,
          agentName: agent.name,
          providerId: agent.providerId,
          agentType: decision.agentType,
          ...decision
        });
        
        console.log(`   ${agent.name} (${agent.providerId}): ${decision.type} (${decision.confidence}% confidence)`);
      }
    }
    
    if (agentDecisions.length === 0) {
      console.log('   No consensus - all agents agree current parameters are optimal');
      return null;
    }
    
    // Group decisions by type
    const decisionGroups = {};
    for (const decision of agentDecisions) {
      const key = `${decision.type}_${decision.action || ''}_${decision.parameter || ''}`;
      if (!decisionGroups[key]) {
        decisionGroups[key] = [];
      }
      decisionGroups[key].push(decision);
    }
    
    // Weight agents by their expertise
    const agentWeights = {
      'anthropic': { technical: 1.2, optimization: 1.0, trading: 1.0, generic: 1.1 },
      'openai': { technical: 1.0, optimization: 1.3, trading: 0.9, generic: 1.2 },
      'deepseek': { technical: 0.9, optimization: 1.0, trading: 1.4, generic: 1.1 },
      'groq': { technical: 1.1, optimization: 1.0, trading: 1.2, generic: 1.0 },
      'gemini': { technical: 1.0, optimization: 1.1, trading: 1.0, generic: 1.2 }
    };
    
    // Calculate weighted consensus for each decision type
    const consensusResults = [];
    
    for (const [decisionKey, group] of Object.entries(decisionGroups)) {
      let totalWeight = 0;
      let weightedConfidence = 0;
      let agentNames = [];
      
      for (const decision of group) {
        const weight = agentWeights[decision.providerId]?.[decision.agentType] || 1.0;
        totalWeight += weight;
        weightedConfidence += decision.confidence * weight;
        agentNames.push(decision.agentName);
      }
      
      const consensusConfidence = weightedConfidence / totalWeight;
      
      consensusResults.push({
        type: group[0].type,
        action: group[0].action,
        parameter: group[0].parameter,
        currentSize: group[0].currentSize,
        suggestedSize: group[0].suggestedSize,
        current: group[0].current,
        suggested: group[0].suggested,
        adjustment: group[0].adjustment,
        suggestedStrategy: group[0].suggestedStrategy,
        reason: this.buildConsensusReason(group, decisionKey),
        confidence: Math.round(consensusConfidence),
        agentCount: group.length,
        agentNames: [...new Set(agentNames)], // Unique names
        agentTypes: [...new Set(group.map(d => d.agentType))],
        urgency: this.calculateUrgency(group),
        consensusStrength: totalWeight
      });
    }
    
    // Return highest confidence consensus decision
    if (consensusResults.length > 0) {
      const bestDecision = consensusResults.sort((a, b) => b.confidence - a.confidence)[0];
      
      console.log(`🎯 CONSENSUS DECISION:`);
      console.log(`   Type: ${bestDecision.type}`);
      console.log(`   Confidence: ${bestDecision.confidence}%`);
      console.log(`   Agents: ${bestDecision.agentNames.join(', ')}`);
      console.log(`   Reason: ${bestDecision.reason}`);
      
      return bestDecision;
    }
    
    return null;
  }

  /**
   * Build consensus reason
   */
  static buildConsensusReason(group, decisionKey) {
    const agentNames = group.map(d => d.agentName);
    const agentTypes = [...new Set(group.map(d => d.agentType))];
    
    let expertise = '';
    if (agentTypes.length === 1) {
      const typeMap = {
        'technical': 'technical analysis',
        'optimization': 'parameter optimization',
        'trading': 'trading strategy',
        'generic': 'general analysis'
      };
      expertise = `based on ${typeMap[agentTypes[0]]}`;
    } else {
      expertise = `based on multiple expertises (${agentTypes.join(', ')})`;
    }
    
    return `Consensus from ${agentNames.join(', ')} - ${expertise}`;
  }

  /**
   * Calculate urgency from consensus
   */
  static calculateUrgency(group) {
    const urgencyLevels = { 'low': 1, 'medium': 2, 'high': 3, 'critical': 4 };
    const maxUrgency = Math.max(...group.map(d => urgencyLevels[d.urgency] || 1));
    
    const urgencyMap = { 1: 'low', 2: 'medium', 3: 'high', 4: 'critical' };
    return urgencyMap[maxUrgency];
  }
  
  /**
   * Execute AI decision
   */
  static async executeDecision(session, decision) {
    const { agent, algo, metrics } = session;
    
    console.log(`\n🤖 ${agent.name} Decision:`);
    console.log(`   Type: ${decision.type}`);
    console.log(`   Reason: ${decision.reason}`);
    console.log(`   Confidence: ${decision.confidence}%`);
    
    // Update metrics
    switch (decision.type) {
      case 'ADJUST_SIZE':
      case 'ADJUST_PARAMETERS':
        metrics.optimizations++;
        console.log(`   Action: Optimizing algo parameters`);
        break;
      case 'PAUSE_TRADING':
      case 'REDUCE_EXPOSURE':
        metrics.interventions++;
        console.log(`   Action: Risk intervention - ${decision.reason.toLowerCase()}`);
        break;
      case 'RISK_WARNING':
        metrics.riskWarnings++;
        console.log(`   Action: Risk warning issued`);
        break;
    }
    
    // In real implementation, this would actually modify the algo
    // For now, just log the decision
    console.log(`   Status: Decision logged for manual review\n`);
    
    return decision;
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
      agentName: session.agent.name,
      duration: Math.round(duration / 1000),
      decisions: session.metrics.totalDecisions,
      interventions: session.metrics.interventions,
      optimizations: session.metrics.optimizations,
      lastDecision: session.decisions.length > 0 ? session.decisions[session.decisions.length - 1] : null
    };
  }
  
  /**
   * Get all active supervision sessions
   */
  static getAllStatus() {
    const result = [];
    const isConsensusMode = supervisionSessions.size > 1 && consensusInterval;
    
    for (const [agentId, session] of supervisionSessions.entries()) {
      result.push({
        agentId,
        agentName: session.agent.name,
        duration: Date.now() - session.startTime,
        metrics: session.metrics,
        lastDecision: session.decisions.length > 0 ? session.decisions[session.decisions.length - 1] : null,
        mode: isConsensusMode ? 'consensus' : 'single'
      });
    }
    
    return {
      sessions: result,
      mode: isConsensusMode ? 'consensus' : 'single',
      totalAgents: supervisionSessions.size
    };
  }
  
  /**
   * Stop all supervision sessions
   */
  static stopAll() {
    const agentIds = Array.from(supervisionSessions.keys());
    for (const agentId of agentIds) {
      this.stop(agentId);
    }
  }
}

module.exports = AISupervisor;