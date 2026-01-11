/**
 * AI Supervision Health Check
 * 
 * Verifies that AI agents are properly connected and responding
 * before allowing algo trading with AI supervision.
 * 
 * Supports both connection types:
 * - HQX Connector (OAuth) for Anthropic, OpenAI, Google, Qwen, iFlow
 * - Direct API Key for MiniMax, DeepSeek, Mistral, xAI, OpenRouter
 */

const cliproxy = require('../cliproxy');
const https = require('https');

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
    
    return { success: false, latency, error: 'HQX Connector not running' };
  } catch (error) {
    return { success: false, latency: Date.now() - startTime, error: error.message };
  }
};

/**
 * API endpoints for direct API key providers
 */
const API_CHAT_ENDPOINTS = {
  minimax: 'https://api.minimaxi.chat/v1/chat/completions',
  deepseek: 'https://api.deepseek.com/v1/chat/completions',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
  xai: 'https://api.x.ai/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
};

/**
 * Test connection via direct API key
 * @param {Object} agent - Agent config
 * @returns {Promise<Object>} { success, latency, formatValid, error }
 */
const testApiKeyConnection = async (agent) => {
  const startTime = Date.now();
  const endpoint = API_CHAT_ENDPOINTS[agent.provider];
  
  if (!endpoint || !agent.apiKey) {
    return { success: false, latency: 0, formatValid: false, error: 'Missing endpoint or API key' };
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AGENT_TIMEOUT);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${agent.apiKey}`
      },
      body: JSON.stringify({
        model: agent.modelId,
        messages: [{ role: 'user', content: TEST_PROMPT }],
        max_tokens: 100,
        stream: false
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;
    
    const data = await response.json();
    
    if (response.ok) {
      const content = data.choices?.[0]?.message?.content || '';
      const formatResult = validateResponseFormat(content);
      return {
        success: formatResult.valid,
        latency,
        formatValid: formatResult.valid,
        error: formatResult.valid ? null : formatResult.error,
        response: content
      };
    } else {
      return { success: false, latency, formatValid: false, 
        error: data.error?.message || `HTTP ${response.status}` };
    }
  } catch (e) {
    const latency = Date.now() - startTime;
    if (e.name === 'AbortError') {
      return { success: false, latency: AGENT_TIMEOUT, formatValid: false, error: 'Timeout' };
    }
    return { success: false, latency, formatValid: false, error: e.message };
  }
};

/**
 * Test a single agent connection and response format
 * @param {Object} agent - Agent config { id, provider, modelId, connectionType, apiKey, ... }
 * @returns {Promise<Object>} { success, latency, formatValid, error }
 */
const testAgentConnection = async (agent) => {
  const startTime = Date.now();
  
  try {
    // Route based on connection type
    if (agent.connectionType === 'apikey') {
      return await testApiKeyConnection(agent);
    }
    
    // CLIProxy connection
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
 * @returns {Promise<Object>} { success, cliproxy, needsCliproxy, agents, summary }
 */
const runPreflightCheck = async (agents) => {
  const results = {
    success: false,
    cliproxy: null,
    needsCliproxy: false,
    agents: [],
    summary: { total: 0, passed: 0, failed: 0 }
  };
  
  // Check if any agent needs CLIProxy (non-apikey connection)
  results.needsCliproxy = agents.some(a => a.connectionType !== 'apikey');
  
  // Step 1: Check CLIProxy only if needed
  if (results.needsCliproxy) {
    results.cliproxy = await checkCliproxyRunning();
    if (!results.cliproxy.success) {
      // Mark only CLIProxy agents as failed, still test API Key agents
      results.summary.total = agents.length;
    }
  } else {
    // No CLIProxy needed, mark as success
    results.cliproxy = { success: true, latency: 0, error: null, notNeeded: true };
  }
  
  // Step 2: Test each agent
  results.summary.total = agents.length;
  
  for (const agent of agents) {
    // Skip CLIProxy agents if CLIProxy is not running
    if (agent.connectionType !== 'apikey' && !results.cliproxy.success) {
      results.agents.push({
        id: agent.id,
        name: agent.name,
        provider: agent.provider,
        modelId: agent.modelId,
        connectionType: agent.connectionType,
        success: false,
        latency: 0,
        formatValid: false,
        error: 'HQX Connector not running'
      });
      results.summary.failed++;
      continue;
    }
    
    const agentResult = await testAgentConnection(agent);
    
    results.agents.push({
      id: agent.id,
      name: agent.name,
      provider: agent.provider,
      modelId: agent.modelId,
      connectionType: agent.connectionType,
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
  
  // CLIProxy status (only show if needed)
  if (results.needsCliproxy) {
    if (results.cliproxy.success) {
      lines.push(dottedLine('HQX Connector', chalk.green('✓ RUNNING')));
    } else {
      lines.push(dottedLine('HQX Connector', chalk.red('✗ NOT RUNNING')));
    }
  }
  
  lines.push('');
  lines.push(chalk.white(`   Testing ${results.summary.total} agent(s):`));
  lines.push('');
  
  // Each agent
  for (let i = 0; i < results.agents.length; i++) {
    const agent = results.agents[i];
    const num = `[${i + 1}/${results.summary.total}]`;
    const connType = agent.connectionType === 'apikey' ? 'API Key' : 'OAuth';
    
    lines.push(chalk.cyan(`   ${num} ${agent.name} (${agent.modelId || agent.provider}) [${connType}]`));
    
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
  
  // Only show CLIProxy error if it was needed and failed
  if (results.needsCliproxy && !results.cliproxy.success) {
    return {
      text: chalk.red('✗ HQX Connector not running - some agents cannot be verified'),
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
