/**
 * AI Supervision Engine - Main Entry Point
 * 
 * Orchestrates multi-agent AI supervision for trading signals.
 * Sends signals to all active agents in parallel and calculates
 * weighted consensus for final decision.
 */

const { getFullDirective } = require('./directive');
const { buildMarketContext, formatContextForPrompt } = require('./context');
const { parseAgentResponse } = require('./parser');
const { calculateConsensus, isApproved, applyOptimizations } = require('./consensus');
const { runPreflightCheck, formatPreflightResults, getPreflightSummary } = require('./health');
const cliproxy = require('../cliproxy');

/**
 * SupervisionEngine class - manages multi-agent supervision
 */
class SupervisionEngine {
  constructor(config = {}) {
    this.agents = config.agents || [];
    this.timeout = config.timeout || 30000;
    this.minAgents = config.minAgents || 1;
    this.directive = getFullDirective();
    this.activeAgents = new Map();
    this.rateLimitedAgents = new Set();
    
    // Initialize active agents
    for (const agent of this.agents) {
      if (agent.active) {
        this.activeAgents.set(agent.id, agent);
      }
    }
  }

  /**
   * Get count of active (non-rate-limited) agents
   */
  getActiveCount() {
    return this.activeAgents.size - this.rateLimitedAgents.size;
  }

  /**
   * Check if supervision is available
   */
  isAvailable() {
    return this.getActiveCount() >= this.minAgents;
  }

  /**
   * Mark agent as rate limited
   */
  markRateLimited(agentId) {
    this.rateLimitedAgents.add(agentId);
  }

  /**
   * Reset rate limited agents (call periodically)
   */
  resetRateLimits() {
    this.rateLimitedAgents.clear();
  }

  /**
   * Build prompt for AI agent
   */
  buildPrompt(context) {
    const contextStr = formatContextForPrompt(context);
    return `${this.directive}\n\n${contextStr}\n\nAnalyze this signal and respond with JSON only.`;
  }

  /**
   * Query a single agent
   */
  async queryAgent(agent, prompt) {
    const startTime = Date.now();
    
    try {
      let response;
      
      if (agent.connectionType === 'cliproxy') {
        // Use CLIProxy API
        response = await cliproxy.chat(agent.provider, agent.modelId, prompt, this.timeout);
      } else if (agent.connectionType === 'apikey' && agent.apiKey) {
        // Direct API call (implement per provider)
        response = await this.callDirectAPI(agent, prompt);
      } else {
        throw new Error('Invalid agent configuration');
      }

      const latency = Date.now() - startTime;
      
      if (!response.success) {
        // Check for rate limit
        if (response.error?.includes('rate') || response.error?.includes('limit')) {
          this.markRateLimited(agent.id);
        }
        return { success: false, error: response.error, latency };
      }

      const parsed = parseAgentResponse(response.content || response.text);
      
      return {
        success: true,
        response: parsed,
        latency,
        raw: response
      };

    } catch (error) {
      const latency = Date.now() - startTime;
      
      // Check for rate limit errors
      if (error.message?.includes('429') || error.message?.includes('rate')) {
        this.markRateLimited(agent.id);
      }
      
      return {
        success: false,
        error: error.message,
        latency
      };
    }
  }

  /**
   * Direct API call for API key connections
   */
  async callDirectAPI(agent, prompt) {
    // This would be implemented per provider
    // For now, return error to use CLIProxy instead
    return {
      success: false,
      error: 'Direct API not implemented - use CLIProxy'
    };
  }

  /**
   * Query all agents in parallel
   */
  async queryAllAgents(prompt) {
    const availableAgents = Array.from(this.activeAgents.values())
      .filter(agent => !this.rateLimitedAgents.has(agent.id));

    if (availableAgents.length === 0) {
      return [];
    }

    // Query all agents in parallel with timeout
    const queries = availableAgents.map(agent => 
      Promise.race([
        this.queryAgent(agent, prompt),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), this.timeout)
        )
      ]).then(result => ({
        agentId: agent.id,
        agentName: agent.name,
        weight: agent.weight || 100,
        ...result
      })).catch(error => ({
        agentId: agent.id,
        agentName: agent.name,
        weight: agent.weight || 100,
        success: false,
        error: error.message
      }))
    );

    return Promise.all(queries);
  }

  /**
   * Main supervision method - analyze a signal
   */
  async supervise(params) {
    const {
      symbolId,
      signal,
      recentTicks = [],
      recentSignals = [],
      recentTrades = [],
      domData = null,
      position = null,
      stats = {},
      config = {}
    } = params;

    // Check availability
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'No agents available',
        decision: 'approve',
        reason: 'No AI supervision - passing through'
      };
    }

    // Build context and prompt
    const context = buildMarketContext({
      symbolId,
      signal,
      recentTicks,
      recentSignals,
      recentTrades,
      domData,
      position,
      stats,
      config
    });

    const prompt = this.buildPrompt(context);

    // Query all agents
    const results = await this.queryAllAgents(prompt);

    // Filter successful responses
    const successfulResults = results.filter(r => r.success);

    if (successfulResults.length === 0) {
      return {
        success: false,
        error: 'All agents failed',
        decision: 'approve',
        reason: 'Agent errors - passing through',
        agentResults: results
      };
    }

    // Calculate consensus
    const consensus = calculateConsensus(
      successfulResults.map(r => ({
        agentId: r.agentId,
        response: r.response,
        weight: r.weight
      })),
      { minAgents: this.minAgents }
    );

    // Apply optimizations if approved
    const optimizedSignal = isApproved(consensus) 
      ? applyOptimizations(signal, consensus)
      : signal;

    return {
      success: true,
      decision: consensus.decision,
      confidence: consensus.confidence,
      reason: consensus.reason,
      optimizedSignal,
      consensus,
      agentResults: results,
      context
    };
  }

  /**
   * Get engine status
   */
  getStatus() {
    return {
      totalAgents: this.agents.length,
      activeAgents: this.activeAgents.size,
      rateLimitedAgents: this.rateLimitedAgents.size,
      availableAgents: this.getActiveCount(),
      isAvailable: this.isAvailable(),
      agents: Array.from(this.activeAgents.values()).map(a => ({
        id: a.id,
        name: a.name,
        provider: a.provider,
        weight: a.weight,
        rateLimited: this.rateLimitedAgents.has(a.id)
      }))
    };
  }

  /**
   * Run pre-flight check on all agents
   * Verifies CLIProxy is running and all agents respond correctly
   * @returns {Promise<Object>} Pre-flight results
   */
  async preflightCheck() {
    const agents = Array.from(this.activeAgents.values());
    return runPreflightCheck(agents);
  }
}

/**
 * Create supervision engine from config
 */
const createSupervisionEngine = (config) => {
  return new SupervisionEngine(config);
};

module.exports = {
  SupervisionEngine,
  createSupervisionEngine,
  // Re-export utilities
  buildMarketContext,
  formatContextForPrompt,
  parseAgentResponse,
  calculateConsensus,
  isApproved,
  applyOptimizations,
  // Health check
  runPreflightCheck,
  formatPreflightResults,
  getPreflightSummary
};
