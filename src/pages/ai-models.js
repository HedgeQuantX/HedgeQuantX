/**
 * AI Models - Fetch from provider APIs
 * 
 * Models are fetched dynamically from each provider's API.
 * No hardcoded model lists - data comes from real APIs only.
 */

const https = require('https');

/**
 * API endpoints for fetching models
 */
const API_ENDPOINTS = {
  anthropic: 'https://api.anthropic.com/v1/models',
  openai: 'https://api.openai.com/v1/models',
  google: 'https://generativelanguage.googleapis.com/v1/models',
  mistral: 'https://api.mistral.ai/v1/models',
  groq: 'https://api.groq.com/openai/v1/models',
  xai: 'https://api.x.ai/v1/models',
  perplexity: 'https://api.perplexity.ai/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
};

/**
 * Make HTTPS request
 * @param {string} url - API URL
 * @param {Object} headers - Request headers
 * @param {number} timeout - Timeout in ms (default 60000 per RULES.md #15)
 * @returns {Promise<Object>} Response data
 */
const fetchApi = (url, headers = {}, timeout = 60000) => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: JSON.parse(data) });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}` });
          }
        } catch (error) {
          resolve({ success: false, error: 'Invalid JSON response' });
        }
      });
    });

    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request timeout' });
    });

    req.end();
  });
};

/**
 * Get auth headers for provider
 * @param {string} providerId - Provider ID
 * @param {string} apiKey - API key
 * @returns {Object} Headers object
 */
const getAuthHeaders = (providerId, apiKey) => {
  if (!apiKey) return {};
  
  switch (providerId) {
    case 'anthropic':
      return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
    case 'openai':
    case 'groq':
    case 'xai':
    case 'perplexity':
    case 'openrouter':
      return { 'Authorization': `Bearer ${apiKey}` };
    case 'google':
      return {}; // Google uses query param
    case 'mistral':
      return { 'Authorization': `Bearer ${apiKey}` };
    default:
      return { 'Authorization': `Bearer ${apiKey}` };
  }
};

/**
 * Parse models response based on provider
 * @param {string} providerId - Provider ID
 * @param {Object} data - API response data
 * @returns {Array} Parsed models list
 */
const parseModelsResponse = (providerId, data) => {
  if (!data) return [];
  
  try {
    switch (providerId) {
      case 'anthropic':
        // Anthropic returns { data: [{ id, display_name, ... }] }
        return (data.data || []).map(m => ({
          id: m.id,
          name: m.display_name || m.id
        }));
      
      case 'openai':
      case 'groq':
      case 'xai':
        // OpenAI format: { data: [{ id, ... }] }
        return (data.data || [])
          .filter(m => m.id && !m.id.includes('whisper') && !m.id.includes('tts') && !m.id.includes('dall-e'))
          .map(m => ({
            id: m.id,
            name: m.id
          }));
      
      case 'google':
        // Google format: { models: [{ name, displayName, ... }] }
        return (data.models || []).map(m => ({
          id: m.name?.replace('models/', '') || m.name,
          name: m.displayName || m.name
        }));
      
      case 'mistral':
        // Mistral format: { data: [{ id, ... }] }
        return (data.data || []).map(m => ({
          id: m.id,
          name: m.id
        }));
      
      case 'perplexity':
        // Perplexity format varies
        return (data.models || data.data || []).map(m => ({
          id: m.id || m.model,
          name: m.id || m.model
        }));
      
      case 'openrouter':
        // OpenRouter format: { data: [{ id, name, ... }] }
        return (data.data || []).map(m => ({
          id: m.id,
          name: m.name || m.id
        }));
      
      default:
        return [];
    }
  } catch (error) {
    return [];
  }
};

/**
 * Fetch models from provider API
 * @param {string} providerId - Provider ID
 * @param {string} apiKey - API key (required for most providers)
 * @returns {Promise<Object>} { success, models, error }
 */
const fetchModelsFromApi = async (providerId, apiKey) => {
  const endpoint = API_ENDPOINTS[providerId];
  if (!endpoint) {
    return { success: false, models: [], error: 'Unknown provider' };
  }
  
  // Build URL (Google needs API key in query)
  let url = endpoint;
  if (providerId === 'google' && apiKey) {
    url += `?key=${apiKey}`;
  }
  
  const headers = getAuthHeaders(providerId, apiKey);
  const result = await fetchApi(url, headers);
  
  if (!result.success) {
    return { success: false, models: [], error: result.error };
  }
  
  const models = parseModelsResponse(providerId, result.data);
  
  if (models.length === 0) {
    return { success: false, models: [], error: 'No models returned' };
  }
  
  return { success: true, models, error: null };
};

/**
 * Get models for a provider - returns empty, use fetchModelsFromApi
 * @param {string} providerId - Provider ID
 * @returns {Array} Empty array
 */
const getModelsForProvider = (providerId) => {
  return [];
};

/**
 * Get model by ID - returns null, use API data
 * @param {string} providerId - Provider ID  
 * @param {string} modelId - Model ID
 * @returns {null} Always null
 */
const getModelById = (providerId, modelId) => {
  return null;
};

module.exports = {
  fetchModelsFromApi,
  getModelsForProvider,
  getModelById,
  API_ENDPOINTS
};
