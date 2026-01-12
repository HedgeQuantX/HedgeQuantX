/**
 * AI Response Parser
 * 
 * Parses responses from AI agents (JSON or text)
 * and normalizes them to a standard format.
 */

/**
 * Default response when parsing fails
 */
const DEFAULT_RESPONSE = {
  decision: 'approve',
  confidence: 50,
  optimizations: null,
  reason: 'Parse failed - defaulting to approve',
  alerts: null,
  parseSuccess: false
};

/**
 * Extract JSON from a string that may contain markdown or extra text
 */
const extractJSON = (text) => {
  if (!text || typeof text !== 'string') return null;

  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch (e) { /* continue */ }

  // Try to find JSON in markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch (e) { /* continue */ }
  }

  // Try to find JSON object pattern
  const jsonMatch = text.match(/\{[\s\S]*"decision"[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]);
    } catch (e) { /* continue */ }
  }

  return null;
};

/**
 * Validate and normalize the decision field
 */
const normalizeDecision = (decision) => {
  if (!decision) return 'approve';
  
  const d = String(decision).toLowerCase().trim();
  
  if (d === 'approve' || d === 'yes' || d === 'accept' || d === 'go') return 'approve';
  if (d === 'reject' || d === 'no' || d === 'deny' || d === 'stop') return 'reject';
  if (d === 'modify' || d === 'adjust' || d === 'optimize') return 'modify';
  
  return 'approve';
};

/**
 * Validate and normalize confidence score
 */
const normalizeConfidence = (confidence) => {
  if (confidence === undefined || confidence === null) return 50;
  
  const c = Number(confidence);
  if (isNaN(c)) return 50;
  
  // Handle percentage strings like "85%"
  if (typeof confidence === 'string' && confidence.includes('%')) {
    const parsed = parseFloat(confidence);
    if (!isNaN(parsed)) return Math.min(100, Math.max(0, parsed));
  }
  
  // Normalize to 0-100 range
  if (c >= 0 && c <= 1) return Math.round(c * 100);
  return Math.min(100, Math.max(0, Math.round(c)));
};

/**
 * Validate and normalize optimizations
 */
const normalizeOptimizations = (opts, signal) => {
  if (!opts) return null;
  
  const normalized = {
    entry: null,
    stopLoss: null,
    takeProfit: null,
    size: null,
    timing: 'now'
  };

  // Entry price
  if (opts.entry !== undefined && opts.entry !== null) {
    const entry = Number(opts.entry);
    if (!isNaN(entry) && entry > 0) normalized.entry = entry;
  }

  // Stop loss
  if (opts.stopLoss !== undefined && opts.stopLoss !== null) {
    const sl = Number(opts.stopLoss);
    if (!isNaN(sl) && sl > 0) normalized.stopLoss = sl;
  }

  // Take profit
  if (opts.takeProfit !== undefined && opts.takeProfit !== null) {
    const tp = Number(opts.takeProfit);
    if (!isNaN(tp) && tp > 0) normalized.takeProfit = tp;
  }

  // Size adjustment (-0.5 to +0.5)
  if (opts.size !== undefined && opts.size !== null) {
    const size = Number(opts.size);
    if (!isNaN(size)) {
      normalized.size = Math.min(0.5, Math.max(-0.5, size));
    }
  }

  // Timing
  if (opts.timing) {
    const t = String(opts.timing).toLowerCase().trim();
    if (t === 'now' || t === 'immediate') normalized.timing = 'now';
    else if (t === 'wait' || t === 'delay') normalized.timing = 'wait';
    else if (t === 'cancel' || t === 'abort') normalized.timing = 'cancel';
    else normalized.timing = 'now';
  }

  return normalized;
};

/**
 * Normalize reason string
 */
const normalizeReason = (reason) => {
  if (!reason) return 'No reason provided';
  
  const r = String(reason).trim();
  if (r.length > 100) return r.substring(0, 97) + '...';
  return r;
};

/**
 * Normalize alerts array
 */
const normalizeAlerts = (alerts) => {
  if (!alerts) return null;
  if (!Array.isArray(alerts)) {
    if (typeof alerts === 'string') return [alerts];
    return null;
  }
  return alerts.filter(a => a && typeof a === 'string').slice(0, 5);
};

/**
 * Parse text response when JSON parsing fails
 * Attempts to extract decision from natural language
 */
const parseTextResponse = (text, signal) => {
  if (!text) return DEFAULT_RESPONSE;
  
  const lower = text.toLowerCase();
  
  // Determine decision from keywords
  let decision = 'approve';
  if (lower.includes('reject') || lower.includes('do not') || lower.includes("don't") || 
      lower.includes('avoid') || lower.includes('skip') || lower.includes('no trade')) {
    decision = 'reject';
  } else if (lower.includes('modify') || lower.includes('adjust') || lower.includes('optimize') ||
             lower.includes('tighten') || lower.includes('widen')) {
    decision = 'modify';
  }

  // Try to extract confidence
  let confidence = 60;
  const confMatch = lower.match(/confidence[:\s]*(\d+)/i) || 
                    lower.match(/(\d+)%?\s*confiden/i) ||
                    lower.match(/score[:\s]*(\d+)/i);
  if (confMatch) {
    confidence = normalizeConfidence(confMatch[1]);
  }

  // Extract reason (first sentence or up to 100 chars)
  let reason = text.split(/[.!?\n]/)[0]?.trim() || 'Parsed from text response';
  reason = normalizeReason(reason);

  return {
    decision,
    confidence,
    optimizations: decision === 'modify' ? {
      entry: signal?.entry || null,
      stopLoss: signal?.stopLoss || null,
      takeProfit: signal?.takeProfit || null,
      size: null,
      timing: 'now'
    } : null,
    reason,
    alerts: null,
    parseSuccess: false,
    parsedFromText: true
  };
};

/**
 * Main parser function - parse AI response to standard format
 */
const parseAgentResponse = (response, signal = null) => {
  // Handle empty response
  if (!response) {
    return { ...DEFAULT_RESPONSE, reason: 'Empty response from agent' };
  }

  // Handle response object with content field (common API format)
  let text = response;
  if (typeof response === 'object') {
    if (response.content) text = response.content;
    else if (response.text) text = response.text;
    else if (response.message) text = response.message;
    else text = JSON.stringify(response);
  }

  // Try to extract and parse JSON
  const json = extractJSON(text);
  
  if (json && json.decision) {
    // Successfully parsed JSON
    return {
      decision: normalizeDecision(json.decision),
      confidence: normalizeConfidence(json.confidence),
      optimizations: normalizeOptimizations(json.optimizations, signal),
      reason: normalizeReason(json.reason),
      alerts: normalizeAlerts(json.alerts),
      parseSuccess: true
    };
  }

  // Fallback to text parsing
  return parseTextResponse(text, signal);
};

/**
 * Validate a parsed response
 */
const validateResponse = (parsed) => {
  const errors = [];
  
  if (!['approve', 'reject', 'modify'].includes(parsed.decision)) {
    errors.push(`Invalid decision: ${parsed.decision}`);
  }
  
  if (parsed.confidence < 0 || parsed.confidence > 100) {
    errors.push(`Invalid confidence: ${parsed.confidence}`);
  }
  
  if (parsed.decision === 'modify' && !parsed.optimizations) {
    errors.push('Modify decision requires optimizations');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  parseAgentResponse,
  validateResponse,
  extractJSON,
  normalizeDecision,
  normalizeConfidence,
  normalizeOptimizations,
  DEFAULT_RESPONSE
};
