/**
 * CLIProxy Service
 * 
 * Provides OAuth connections to paid AI plans (Claude Pro, ChatGPT Plus, etc.)
 * via the embedded CLIProxyAPI binary.
 */

const http = require('http');
const manager = require('./manager');

// Re-export manager functions
const {
  CLIPROXY_VERSION,
  INSTALL_DIR,
  AUTH_DIR,
  DEFAULT_PORT,
  isInstalled,
  install,
  isRunning,
  start,
  stop,
  ensureRunning,
  getLoginUrl
} = manager;

// Internal API key (must match config.yaml)
const API_KEY = 'hqx-internal-key';

/**
 * Make HTTP request to local CLIProxyAPI
 * @param {string} path - API path
 * @param {string} method - HTTP method
 * @param {Object} body - Request body (optional)
 * @param {number} timeout - Timeout in ms (default 60000 per RULES.md #15)
 * @returns {Promise<Object>} { success, data, error }
 */
const fetchLocal = (path, method = 'GET', body = null, timeout = 60000) => {
  return new Promise((resolve) => {
    const options = {
      hostname: '127.0.0.1',
      port: DEFAULT_PORT,
      path,
      method,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      timeout
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ success: true, data: parsed, error: null });
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
        resolve({ success: false, error: 'CLIProxyAPI not running', data: null });
      } else {
        resolve({ success: false, error: error.message, data: null });
      }
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout', data: null });
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
};

/**
 * Fetch available models from CLIProxyAPI
 * @returns {Promise<Object>} { success, models, error }
 */
const fetchModels = async () => {
  const result = await fetchLocal('/v1/models');
  
  if (!result.success) {
    return { success: false, models: [], error: result.error };
  }
  
  const data = result.data;
  if (!data || !data.data || !Array.isArray(data.data)) {
    return { success: false, models: [], error: 'Invalid response format' };
  }
  
  const models = data.data
    .filter(m => m.id)
    .map(m => ({ id: m.id, name: m.id }));
  
  if (models.length === 0) {
    return { success: false, models: [], error: 'No models available' };
  }
  
  return { success: true, models, error: null };
};

/**
 * Get provider-specific models
 * @param {string} providerId - Provider ID
 * @returns {Promise<Object>} { success, models, error }
 */
const fetchProviderModels = async (providerId) => {
  const result = await fetchModels();
  if (!result.success) return result;
  
  // Filter by provider prefix
  const prefixMap = {
    anthropic: 'claude',
    openai: 'gpt',
    google: 'gemini',
    qwen: 'qwen'
  };
  
  const prefix = prefixMap[providerId];
  if (!prefix) return result;
  
  const filtered = result.models.filter(m => 
    m.id.toLowerCase().includes(prefix)
  );
  
  return { 
    success: true, 
    models: filtered.length > 0 ? filtered : result.models, 
    error: null 
  };
};

/**
 * Chat completion request
 * @param {string} model - Model ID
 * @param {Array} messages - Chat messages
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} { success, response, error }
 */
const chatCompletion = async (model, messages, options = {}) => {
  const body = {
    model,
    messages,
    stream: false,
    ...options
  };
  
  const result = await fetchLocal('/v1/chat/completions', 'POST', body);
  
  if (!result.success) {
    return { success: false, response: null, error: result.error };
  }
  
  return { success: true, response: result.data, error: null };
};

module.exports = {
  // Manager
  CLIPROXY_VERSION,
  INSTALL_DIR,
  AUTH_DIR,
  DEFAULT_PORT,
  isInstalled,
  install,
  isRunning,
  start,
  stop,
  ensureRunning,
  getLoginUrl,
  
  // API
  fetchLocal,
  fetchModels,
  fetchProviderModels,
  chatCompletion
};
