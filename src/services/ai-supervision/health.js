/**
 * AI Supervision Health Check
 * 
 * Verifies that AI agents are properly connected and responding
 * before allowing algo trading with AI supervision.
 * 
 * Two verification points:
 * 1. [T] TEST in AI Agents menu - manual verification
 * 2. Pre-check before algo launch - automatic verification
 */

const cliproxy = require('../cliproxy');

/** Test prompt to verify agent understands directive format */
const TEST_PROMPT = `You are being tested. Respond ONLY with this exact JSON, nothing else:
{"decision":"approve","confidence":100,"reason":"test-ok"}`;

/** Timeout for agent response (increased for slower providers like Gemini) */
const AGENT_TIMEOUT = 15000;

/**
 * Check if CLIProxy is running and responding
 * @returns {Promise<Object>} { success, latency, error }
 */
const checkCliproxyRunning = async () => {
  const startTime = Date.now();
  
  try {
    const status = await cliproxy.isRunning();
    const latency = Date.now() - startTime;
    
    if (status.running) {
      return { success: true, latency, error: null };
    }
    
    return { success: false, latency, error: 'CLIProxy not running' };
  } catch (error) {
    return { success: false, latency: Date.now() - startTime, error: error.message };
  }
};

/**
 * Test a single agent connection and response format
 * @param {Object} agent - Agent config { id, provider, modelId, connectionType, ... }
 * @returns {Promise<Object>} { success, latency, formatValid, error }
 */
const testAgentConnection = async (agent) => {
  const startTime = Date.now();
  
  try {
    // Only test CLIProxy connections for now
    if (agent.connectionType !== 'cliproxy') {
      // For API key connections, we would need different logic
      // For now, mark as needing CLIProxy
      return {
        success: false,
        latency: 0,
        formatValid: false,
        error: 'Only CLIProxy connections supported for pre-check'
      };
    }
    
    // Send test prompt with short timeout
    const result = await cliproxy.chat(agent.provider, agent.modelId, TEST_PROMPT, AGENT_TIMEOUT);
    const latency = Date.now() - startTime;
    
    if (!result.success) {
      return {
        success: false,
        latency,
        formatValid: false,
        error: result.error || 'No response from agent'
      };
    }
    
    // Validate response format
    const formatResult = validateResponseFormat(result.content);
    
    return {
      success: formatResult.valid,
      latency,
      formatValid: formatResult.valid,
      error: formatResult.valid ? null : formatResult.error,
      response: result.content
    };
    
  } catch (error) {
    return {
      success: false,
      latency: Date.now() - startTime,
      formatValid: false,
      error: error.message || 'Connection failed'
    };
  }
};

/**
 * Validate that response matches expected JSON format
 * @param {string} content - Response content from agent
 * @returns {Object} { valid, error }
 */
const validateResponseFormat = (content) => {
  if (!content) {
    return { valid: false, error: 'Empty response' };
  }
  
  try {
    // Try to extract JSON from response
    let json;
    
    // Direct parse
    try {
      json = JSON.parse(content.trim());
    } catch (e) {
      // Try to find JSON in response
      const match = content.match(/\{[\s\S]*\}/);
      if (match) {
        json = JSON.parse(match[0]);
      } else {
        return { valid: false, error: 'No JSON in response' };
      }
    }
    
    // Check required fields
    if (!json.decision) {
      return { valid: false, error: 'Missing "decision" field' };
    }
    
    if (json.confidence === undefined) {
      return { valid: false, error: 'Missing "confidence" field' };
    }
    
    if (!json.reason) {
      return { valid: false, error: 'Missing "reason" field' };
    }
    
    // Validate decision value
    const validDecisions = ['approve', 'reject', 'modify'];
    if (!validDecisions.includes(json.decision)) {
      return { valid: false, error: `Invalid decision: ${json.decision}` };
    }
    
    // Validate confidence is number 0-100
    const conf = Number(json.confidence);
    if (isNaN(conf) || conf < 0 || conf > 100) {
      return { valid: false, error: `Invalid confidence: ${json.confidence}` };
    }
    
    return { valid: true, error: null };
    
  } catch (error) {
    return { valid: false, error: `Parse error: ${error.message}` };
  }
};

/**
 * Run pre-flight check on all agents
 * @param {Array} agents - Array of agent configs
 * @returns {Promise<Object>} { success, cliproxy, agents, summary }
 */
const runPreflightCheck = async (agents) => {
  const results = {
    success: false,
    cliproxy: null,
    agents: [],
    summary: { total: 0, passed: 0, failed: 0 }
  };
  
  // Step 1: Check CLIProxy
  results.cliproxy = await checkCliproxyRunning();
  
  if (!results.cliproxy.success) {
    results.summary.total = agents.length;
    results.summary.failed = agents.length;
    return results;
  }
  
  // Step 2: Test each agent
  results.summary.total = agents.length;
  
  for (const agent of agents) {
    const agentResult = await testAgentConnection(agent);
    
    results.agents.push({
      id: agent.id,
      name: agent.name,
      provider: agent.provider,
      modelId: agent.modelId,
      ...agentResult
    });
    
    if (agentResult.success) {
      results.summary.passed++;
    } else {
      results.summary.failed++;
    }
  }
  
  // Success only if ALL agents pass
  results.success = results.summary.failed === 0 && results.summary.passed > 0;
  
  return results;
};

/**
 * Format pre-flight results for console display
 * @param {Object} results - Results from runPreflightCheck
 * @param {number} boxWidth - Width for formatting
 * @returns {Array<string>} Lines to display
 */
const formatPreflightResults = (results, boxWidth) => {
  const chalk = require('chalk');
  const lines = [];
  const W = boxWidth - 4; // Account for borders and padding
  
  // Helper to create dotted line with proper alignment
  const dottedLine = (label, value, labelPad = 3) => {
    const valueLen = value.replace(/\x1b\[[0-9;]*m/g, '').length; // Strip ANSI
    const labelLen = label.length;
    const dotsLen = W - labelPad - labelLen - valueLen - 1;
    return ' '.repeat(labelPad) + chalk.white(label) + chalk.gray('.'.repeat(Math.max(3, dotsLen))) + value;
  };
  
  // CLIProxy status
  if (results.cliproxy.success) {
    lines.push(dottedLine('CLIProxy Status', chalk.green('✓ RUNNING')));
  } else {
    lines.push(dottedLine('CLIProxy Status', chalk.red('✗ NOT RUNNING')));
    lines.push(chalk.red(`   Error: ${results.cliproxy.error}`));
    return lines;
  }
  
  lines.push('');
  lines.push(chalk.white(`   Testing ${results.summary.total} agent(s):`));
  lines.push('');
  
  // Each agent
  for (let i = 0; i < results.agents.length; i++) {
    const agent = results.agents[i];
    const num = `[${i + 1}/${results.summary.total}]`;
    
    lines.push(chalk.cyan(`   ${num} ${agent.name} (${agent.modelId || agent.provider})`));
    
    if (agent.success) {
      const latencyStr = `✓ OK ${agent.latency}ms`;
      lines.push(dottedLine('Connection', chalk.green(latencyStr), 9));
      lines.push(dottedLine('Format', chalk.green('✓ VALID'), 9));
    } else {
      lines.push(dottedLine('Connection', chalk.red('✗ FAILED'), 9));
      lines.push(chalk.red(`         Error: ${agent.error}`));
    }
    
    lines.push('');
  }
  
  return lines;
};

/**
 * Get summary line for pre-flight results
 * @param {Object} results - Results from runPreflightCheck
 * @returns {Object} { text, success }
 */
const getPreflightSummary = (results) => {
  const chalk = require('chalk');
  
  if (!results.cliproxy.success) {
    return {
      text: chalk.red('✗ CLIProxy not running - cannot verify agents'),
      success: false
    };
  }
  
  if (results.success) {
    return {
      text: chalk.green(`✓ ALL SYSTEMS GO - ${results.summary.passed}/${results.summary.total} agents ready`),
      success: true
    };
  }
  
  return {
    text: chalk.red(`✗ FAILED - ${results.summary.passed}/${results.summary.total} agents passed (all must pass)`),
    success: false
  };
};

module.exports = {
  checkCliproxyRunning,
  testAgentConnection,
  validateResponseFormat,
  runPreflightCheck,
  formatPreflightResults,
  getPreflightSummary,
  TEST_PROMPT,
  AGENT_TIMEOUT
};
