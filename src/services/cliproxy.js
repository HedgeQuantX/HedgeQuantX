/**
 * CLIProxy Service
 * 
 * Connects to CLIProxyAPI for AI provider access
 * via paid plans (Claude Pro, ChatGPT Plus, etc.)
 * 
 * Supports both local (localhost:8317) and remote connections.
 * Docs: https://help.router-for.me
 */

const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');

// Config file path (same as ai-agents)
const CONFIG_DIR = path.join(os.homedir(), '.hqx');
const CONFIG_FILE = path.join(CONFIG_DIR, 'ai-config.json');

// Default CLIProxy endpoint
const DEFAULT_CLIPROXY_URL = 'http://localhost:8317';

/**
 * Get CLIProxy URL from config or default
 * @returns {string} CLIProxy base URL
 */
const getCliProxyUrl = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (config.cliproxyUrl && config.cliproxyUrl.trim()) {
        return config.cliproxyUrl.trim();
      }
    }
  } catch (error) { /* ignore */ }
  return DEFAULT_CLIPROXY_URL;
};

/**
 * Set CLIProxy URL in config
 * @param {string} url - CLIProxy URL
 * @returns {boolean} Success status
 */
const setCliProxyUrl = (url) => {
  try {
    let config = { providers: {} };
    if (fs.existsSync(CONFIG_FILE)) {
      config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    config.cliproxyUrl = url;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Make HTTP request to CLIProxy
 * @param {string} path - API path
 * @param {string} method - HTTP method
 * @param {Object} headers - Request headers
 * @param {number} timeout - Timeout in ms (default 60000 per RULES.md #15)
 * @param {string} baseUrl - Optional base URL override
 * @returns {Promise<Object>} { success, data, error }
 */
const fetchCliProxy = (path, method = 'GET', headers = {}, timeout = 60000, baseUrl = null) => {
  return new Promise((resolve) => {
    const base = baseUrl || getCliProxyUrl();
    const url = new URL(path, base);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 8317),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout,
      rejectUnauthorized: false // Allow self-signed certs for remote
    };

    const req = httpModule.request(options, (res) => {
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
        resolve({ success: false, error: 'CLIProxy not reachable', data: null });
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
 * Check if CLIProxy is running/reachable
 * @param {string} url - Optional URL to test (uses config if not provided)
 * @returns {Promise<Object>} { running, error, url }
 */
const isCliProxyRunning = async (url = null) => {
  const testUrl = url || getCliProxyUrl();
  const result = await fetchCliProxy('/v1/models', 'GET', {}, 5000, testUrl);
  return { 
    running: result.success, 
    error: result.success ? null : result.error,
    url: testUrl
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
  DEFAULT_CLIPROXY_URL,
  getCliProxyUrl,
  setCliProxyUrl,
  isCliProxyRunning,
  fetchModelsFromCliProxy,
  getOAuthUrl,
  checkOAuthStatus,
  getAuthFiles,
  fetchCliProxy
};
