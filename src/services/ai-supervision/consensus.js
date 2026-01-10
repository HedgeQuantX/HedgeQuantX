/**
 * Consensus Calculator for Multi-Agent Supervision
 * 
 * Calculates weighted consensus from multiple AI agent responses.
 * Each agent has a weight, and the final decision is based on
 * the weighted average of all responses.
 */

/**
 * Default consensus when no valid responses
 */
const DEFAULT_CONSENSUS = {
  decision: 'approve',
  confidence: 50,
  optimizations: null,
  reason: 'No consensus - default approve',
  alerts: [],
  agentCount: 0,
  respondedCount: 0,
  unanimous: false
};

/**
 * Calculate weighted average of a numeric field
 */
const weightedAverage = (values, weights) => {
  if (values.length === 0) return 0;
  
  let sum = 0;
  let totalWeight = 0;
  
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const weight = weights[i] || 1;
    if (val !== null && val !== undefined && !isNaN(val)) {
      sum += val * weight;
      totalWeight += weight;
    }
  }
  
  return totalWeight > 0 ? sum / totalWeight : 0;
};

/**
 * Calculate weighted mode (most common value by weight)
 */
const weightedMode = (values, weights) => {
  if (values.length === 0) return null;
  
  const weightMap = {};
  
  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    const weight = weights[i] || 1;
    if (val !== null && val !== undefined) {
      weightMap[val] = (weightMap[val] || 0) + weight;
    }
  }
  
  let maxWeight = 0;
  let mode = null;
  
  for (const [val, w] of Object.entries(weightMap)) {
    if (w > maxWeight) {
      maxWeight = w;
      mode = val;
    }
  }
  
  return mode;
};

/**
 * Merge optimizations from multiple agents
 */
const mergeOptimizations = (responses, weights) => {
  const validOpts = responses
    .map((r, i) => ({ opt: r.optimizations, weight: weights[i] }))
    .filter(o => o.opt !== null);
  
  if (validOpts.length === 0) return null;
  
  // Collect values for each field
  const entries = validOpts.filter(o => o.opt.entry !== null).map(o => ({ val: o.opt.entry, w: o.weight }));
  const stops = validOpts.filter(o => o.opt.stopLoss !== null).map(o => ({ val: o.opt.stopLoss, w: o.weight }));
  const targets = validOpts.filter(o => o.opt.takeProfit !== null).map(o => ({ val: o.opt.takeProfit, w: o.weight }));
  const sizes = validOpts.filter(o => o.opt.size !== null).map(o => ({ val: o.opt.size, w: o.weight }));
  const timings = validOpts.map(o => ({ val: o.opt.timing, w: o.weight }));

  return {
    entry: entries.length > 0 
      ? Math.round(weightedAverage(entries.map(e => e.val), entries.map(e => e.w)) * 100) / 100 
      : null,
    stopLoss: stops.length > 0 
      ? Math.round(weightedAverage(stops.map(s => s.val), stops.map(s => s.w)) * 100) / 100 
      : null,
    takeProfit: targets.length > 0 
      ? Math.round(weightedAverage(targets.map(t => t.val), targets.map(t => t.w)) * 100) / 100 
      : null,
    size: sizes.length > 0 
      ? Math.round(weightedAverage(sizes.map(s => s.val), sizes.map(s => s.w)) * 100) / 100 
      : null,
    timing: weightedMode(timings.map(t => t.val), timings.map(t => t.w)) || 'now'
  };
};

/**
 * Collect all alerts from responses
 */
const collectAlerts = (responses) => {
  const alerts = [];
  for (const r of responses) {
    if (r.alerts && Array.isArray(r.alerts)) {
      alerts.push(...r.alerts);
    }
  }
  return [...new Set(alerts)].slice(0, 10);
};

/**
 * Build reason summary from all responses
 */
const buildReasonSummary = (responses, decision) => {
  const reasons = responses
    .filter(r => r.decision === decision && r.reason)
    .map(r => r.reason)
    .slice(0, 3);
  
  if (reasons.length === 0) return `Consensus: ${decision}`;
  if (reasons.length === 1) return reasons[0];
  
  return reasons[0] + (reasons.length > 1 ? ` (+${reasons.length - 1} more)` : '');
};

/**
 * Calculate consensus from multiple agent responses
 * 
 * @param {Array} agentResponses - Array of { agentId, response, weight }
 * @param {Object} options - Consensus options
 * @returns {Object} Consensus result
 */
const calculateConsensus = (agentResponses, options = {}) => {
  const {
    minAgents = 1,
    approveThreshold = 0.5,
    rejectThreshold = 0.6,
    minConfidence = 30
  } = options;

  // Filter valid responses
  const validResponses = agentResponses.filter(ar => 
    ar && ar.response && ar.response.decision
  );

  if (validResponses.length === 0) {
    return { ...DEFAULT_CONSENSUS, reason: 'No valid agent responses' };
  }

  if (validResponses.length < minAgents) {
    return { 
      ...DEFAULT_CONSENSUS, 
      reason: `Insufficient agents (${validResponses.length}/${minAgents})`,
      agentCount: agentResponses.length,
      respondedCount: validResponses.length
    };
  }

  // Extract responses and weights
  const responses = validResponses.map(ar => ar.response);
  const weights = validResponses.map(ar => ar.weight || 100);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Calculate weighted votes for each decision
  const votes = { approve: 0, reject: 0, modify: 0 };
  for (let i = 0; i < responses.length; i++) {
    const decision = responses[i].decision;
    votes[decision] = (votes[decision] || 0) + weights[i];
  }

  // Normalize votes to percentages
  const approveRatio = votes.approve / totalWeight;
  const rejectRatio = votes.reject / totalWeight;
  const modifyRatio = votes.modify / totalWeight;

  // Determine consensus decision
  let decision;
  if (rejectRatio >= rejectThreshold) {
    decision = 'reject';
  } else if (approveRatio >= approveThreshold) {
    decision = modifyRatio > 0 ? 'modify' : 'approve';
  } else if (modifyRatio > approveRatio) {
    decision = 'modify';
  } else {
    decision = 'approve';
  }

  // Calculate weighted confidence
  const confidences = responses.map(r => r.confidence);
  const avgConfidence = Math.round(weightedAverage(confidences, weights));

  // Apply minimum confidence check
  if (avgConfidence < minConfidence && decision !== 'reject') {
    decision = 'reject';
  }

  // Check unanimity
  const decisions = responses.map(r => r.decision);
  const unanimous = new Set(decisions).size === 1;

  // Build consensus result
  const consensus = {
    decision,
    confidence: avgConfidence,
    optimizations: decision !== 'reject' ? mergeOptimizations(responses, weights) : null,
    reason: buildReasonSummary(responses, decision),
    alerts: collectAlerts(responses),
    
    // Metadata
    agentCount: agentResponses.length,
    respondedCount: validResponses.length,
    unanimous,
    
    // Vote breakdown
    votes: {
      approve: Math.round(approveRatio * 100),
      reject: Math.round(rejectRatio * 100),
      modify: Math.round(modifyRatio * 100)
    },
    
    // Individual responses for debugging
    agentDetails: validResponses.map(ar => ({
      agentId: ar.agentId,
      decision: ar.response.decision,
      confidence: ar.response.confidence,
      weight: ar.weight
    }))
  };

  return consensus;
};

/**
 * Quick check if consensus approves the signal
 */
const isApproved = (consensus) => {
  return consensus.decision === 'approve' || consensus.decision === 'modify';
};

/**
 * Apply consensus optimizations to original signal
 */
const applyOptimizations = (signal, consensus) => {
  if (!isApproved(consensus) || !consensus.optimizations) {
    return signal;
  }

  const opts = consensus.optimizations;
  const optimized = { ...signal };

  if (opts.entry !== null) optimized.entry = opts.entry;
  if (opts.stopLoss !== null) optimized.stopLoss = opts.stopLoss;
  if (opts.takeProfit !== null) optimized.takeProfit = opts.takeProfit;
  
  // Apply size adjustment
  if (opts.size !== null && signal.size) {
    optimized.size = Math.max(1, Math.round(signal.size * (1 + opts.size)));
  }

  optimized.aiOptimized = true;
  optimized.aiConfidence = consensus.confidence;
  optimized.aiTiming = opts.timing;

  return optimized;
};

module.exports = {
  calculateConsensus,
  isApproved,
  applyOptimizations,
  weightedAverage,
  weightedMode,
  mergeOptimizations,
  DEFAULT_CONSENSUS
};
