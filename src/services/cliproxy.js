/**
 * CLIProxy Service
 * 
 * Connects to CLIProxyAPI (localhost:8317) for AI provider access
 * via paid plans (Claude Pro, ChatGPT Plus, etc.)
 * 
 * Docs: https://help.router-for.me
 */

const http = require('http');

// CLIProxy default endpoint
const CLIPROXY_BASE = 'http://localhost:8317';

/**
 * Make HTTP request to CLIProxy
 * @param {string} path - API path
 * @param {string} method - HTTP method
 * @param {Object} headers - Request headers
 * @param {number} timeout - Timeout in ms (default 60000 per RULES.md #15)
 * @returns {Promise<Object>} { success, data, error }
 */
const fetchCliProxy = (path, method = 'GET', headers = {}, timeout = 60000) => {
  return new Promise((resolve) => {
    const url = new URL(path, CLIPROXY_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port || 8317,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: JSON.parse(data) });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}`, data: null });
          }
        } catch (error) {
          resolve({ success: false, error: 'Invalid JSON response', data: null });
        }
      });
    });

    req.on('error', (error) => {
      if (error.code === 'ECONNREFUSED') {
        resolve({ success: false, error: 'CLIProxy not running', data: null });
      } else {
        resolve({ success: false, error: error.message, data: null });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout', data: null });
    });

    req.end();
  });
};

/**
 * Check if CLIProxy is running
 * @returns {Promise<Object>} { running, error }
 */
const isCliProxyRunning = async () => {
  const result = await fetchCliProxy('/v1/models', 'GET', {}, 5000);
  return { 
    running: result.success, 
    error: result.success ? null : result.error 
  };
};

/**
 * Fetch available models from CLIProxy
 * @returns {Promise<Object>} { success, models, error }
 */
const fetchModelsFromCliProxy = async () => {
  const result = await fetchCliProxy('/v1/models');
  
  if (!result.success) {
    return { success: false, models: [], error: result.error };
  }
  
  // Parse OpenAI-compatible format: { data: [{ id, ... }] }
  const data = result.data;
  if (!data || !data.data || !Array.isArray(data.data)) {
    return { success: false, models: [], error: 'Invalid response format' };
  }
  
  const models = data.data
    .filter(m => m.id)
    .map(m => ({
      id: m.id,
      name: m.id
    }));
  
  if (models.length === 0) {
    return { success: false, models: [], error: 'No models available' };
  }
  
  return { success: true, models, error: null };
};

/**
 * Get OAuth URL for a provider
 * @param {string} providerId - Provider ID (anthropic, openai, google, etc.)
 * @returns {Promise<Object>} { success, url, state, error }
 */
const getOAuthUrl = async (providerId) => {
  // Map HQX provider IDs to CLIProxy endpoints
  const oauthEndpoints = {
    anthropic: '/v0/management/anthropic-auth-url',
    openai: '/v0/management/codex-auth-url',
    google: '/v0/management/gemini-cli-auth-url',
    // Others may not have OAuth support in CLIProxy
  };
  
  const endpoint = oauthEndpoints[providerId];
  if (!endpoint) {
    return { success: false, url: null, state: null, error: 'OAuth not supported for this provider' };
  }
  
  const result = await fetchCliProxy(endpoint);
  
  if (!result.success) {
    return { success: false, url: null, state: null, error: result.error };
  }
  
  const data = result.data;
  if (!data || !data.url) {
    return { success: false, url: null, state: null, error: 'Invalid OAuth response' };
  }
  
  return { 
    success: true, 
    url: data.url, 
    state: data.state || null,
    error: null 
  };
};

/**
 * Check OAuth status
 * @param {string} state - OAuth state from getOAuthUrl
 * @returns {Promise<Object>} { success, status, error }
 */
const checkOAuthStatus = async (state) => {
  const result = await fetchCliProxy(`/v0/management/get-auth-status?state=${encodeURIComponent(state)}`);
  
  if (!result.success) {
    return { success: false, status: null, error: result.error };
  }
  
  const data = result.data;
  // status can be: "wait", "ok", "error"
  return { 
    success: true, 
    status: data.status || 'unknown',
    error: data.error || null
  };
};

/**
 * Get CLIProxy auth files (connected accounts)
 * @returns {Promise<Object>} { success, files, error }
 */
const getAuthFiles = async () => {
  const result = await fetchCliProxy('/v0/management/auth-files');
  
  if (!result.success) {
    return { success: false, files: [], error: result.error };
  }
  
  return { 
    success: true, 
    files: result.data?.files || [],
    error: null 
  };
};

module.exports = {
  CLIPROXY_BASE,
  isCliProxyRunning,
  fetchModelsFromCliProxy,
  getOAuthUrl,
  checkOAuthStatus,
  getAuthFiles,
  fetchCliProxy
};
