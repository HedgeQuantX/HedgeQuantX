/**
 * AI Models - Fetch from provider APIs
 * 
 * Models are fetched dynamically from each provider's API.
 * Exception: MiniMax (no /models API) - see RULES.md for details.
 */

const https = require('https');

/**
 * API endpoints for fetching models
 * null = provider doesn't have /models endpoint
 */
const API_ENDPOINTS = {
  anthropic: 'https://api.anthropic.com/v1/models',
  openai: 'https://api.openai.com/v1/models',
  google: 'https://generativelanguage.googleapis.com/v1beta/models',
  minimax: null, // No /models API - uses MINIMAX_MODELS (see RULES.md exception)
  mistral: 'https://api.mistral.ai/v1/models',
  groq: 'https://api.groq.com/openai/v1/models',
  xai: 'https://api.x.ai/v1/models',
  openrouter: 'https://openrouter.ai/api/v1/models',
};

/**
 * MiniMax Models - EXCEPTION to no-hardcode rule (see RULES.md)
 * 
 * MiniMax does not provide /models API endpoint.
 * Confirmed by: OpenCode, Cursor, LiteLLM - all use hardcoded models.
 * Source: https://platform.minimax.io/docs/api-reference/text-intro
 */
const MINIMAX_MODELS = [
  { id: 'MiniMax-M2.1', name: 'MiniMax-M2.1' },
];

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
    case 'deepseek':
    case 'minimax':
    case 'groq':
    case 'xai':
    case 'perplexity':
    case 'openrouter':
    case 'mistral':
      return { 'Authorization': `Bearer ${apiKey}` };
    case 'google':
      return {}; // Google uses query param
    default:
      return { 'Authorization': `Bearer ${apiKey}` };
  }
};

/**
 * Excluded patterns - models NOT suitable for algo trading
 * These are image, audio, embedding, moderation models
 */
const EXCLUDED_PATTERNS = [
  'whisper', 'tts', 'dall-e', 'embedding', 'embed', 'moderation',
  'image', 'vision', 'audio', 'speech', 'realtime', 'transcription',
  'aqa', 'gecko', 'bison', 'learnlm'
];

/**
 * Check if model should be excluded (not for algo trading)
 * @param {string} modelId - Model ID
 * @returns {boolean} True if should be excluded
 */
const shouldExcludeModel = (modelId) => {
  const id = modelId.toLowerCase();
  return EXCLUDED_PATTERNS.some(pattern => id.includes(pattern));
};

/**
 * Extract version number from model ID for sorting
 * @param {string} modelId - Model ID
 * @returns {number} Version number (higher = newer)
 */
const extractVersion = (modelId) => {
  const id = modelId.toLowerCase();
  
  // Gemini: gemini-3 > gemini-2.5 > gemini-2.0
  const geminiMatch = id.match(/gemini-(\d+\.?\d*)/);
  if (geminiMatch) return parseFloat(geminiMatch[1]) * 100;
  
  // Claude: opus-4.5 > opus-4 > sonnet-4 > haiku
  if (id.includes('opus-4.5') || id.includes('opus-4-5')) return 450;
  if (id.includes('opus-4.1') || id.includes('opus-4-1')) return 410;
  if (id.includes('opus-4')) return 400;
  if (id.includes('sonnet-4.5') || id.includes('sonnet-4-5')) return 350;
  if (id.includes('sonnet-4')) return 340;
  if (id.includes('haiku-4.5') || id.includes('haiku-4-5')) return 250;
  if (id.includes('sonnet-3.7') || id.includes('3-7-sonnet')) return 237;
  if (id.includes('sonnet-3.5') || id.includes('3-5-sonnet')) return 235;
  if (id.includes('haiku-3.5') || id.includes('3-5-haiku')) return 135;
  if (id.includes('opus')) return 300;
  if (id.includes('sonnet')) return 200;
  if (id.includes('haiku')) return 100;
  
  // GPT: gpt-4o > gpt-4-turbo > gpt-4 > gpt-3.5
  if (id.includes('gpt-4o')) return 450;
  if (id.includes('gpt-4-turbo')) return 420;
  if (id.includes('gpt-4')) return 400;
  if (id.includes('gpt-3.5')) return 350;
  if (id.includes('o1')) return 500; // o1 reasoning models
  if (id.includes('o3')) return 530; // o3 reasoning models
  
  // Mistral: large > medium > small
  if (id.includes('large')) return 300;
  if (id.includes('medium')) return 200;
  if (id.includes('small') || id.includes('tiny')) return 100;
  
  // Default
  return 50;
};

/**
 * Get model tier for display (Pro/Flash/Lite)
 * @param {string} modelId - Model ID
 * @returns {number} Tier weight (higher = more powerful)
 */
const getModelTier = (modelId) => {
  const id = modelId.toLowerCase();
  if (id.includes('pro') || id.includes('opus') || id.includes('large')) return 30;
  if (id.includes('flash') || id.includes('sonnet') || id.includes('medium')) return 20;
  if (id.includes('lite') || id.includes('haiku') || id.includes('small')) return 10;
  return 15;
};

/**
 * Parse models response based on provider - filtered for algo trading
 * @param {string} providerId - Provider ID
 * @param {Object} data - API response data
 * @returns {Array} Parsed and filtered models list
 */
const parseModelsResponse = (providerId, data) => {
  if (!data) return [];
  
  try {
    let models = [];
    
    switch (providerId) {
      case 'anthropic':
        // Anthropic returns { data: [{ id, display_name, ... }] }
        models = (data.data || [])
          .filter(m => m.id && !shouldExcludeModel(m.id))
          .map(m => ({
            id: m.id,
            name: m.display_name || m.id
          }));
        break;
      
      case 'openai':
        // OpenAI format: { data: [{ id, ... }] }
        models = (data.data || [])
          .filter(m => m.id && !shouldExcludeModel(m.id))
          .filter(m => m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3'))
          .map(m => ({
            id: m.id,
            name: m.id
          }));
        break;
      
      case 'google':
        // Google format: { models: [{ name, displayName, supportedGenerationMethods }] }
        models = (data.models || [])
          .filter(m => {
            const id = m.name?.replace('models/', '') || '';
            // Only Gemini chat models
            return id.startsWith('gemini-') && 
                   !shouldExcludeModel(id) &&
                   m.supportedGenerationMethods?.includes('generateContent');
          })
          .map(m => ({
            id: m.name?.replace('models/', '') || m.name,
            name: m.displayName || m.name
          }));
        break;
      
      case 'groq':
        // Groq format: { data: [{ id, ... }] }
        models = (data.data || [])
          .filter(m => m.id && !shouldExcludeModel(m.id))
          .map(m => ({
            id: m.id,
            name: m.id
          }));
        break;
      
      case 'deepseek':
        // DeepSeek format: { data: [{ id, ... }] } - OpenAI compatible
        models = (data.data || [])
          .filter(m => m.id && !shouldExcludeModel(m.id))
          .filter(m => m.id.includes('deepseek'))
          .map(m => ({
            id: m.id,
            name: m.id
          }));
        break;
      
      case 'minimax':
        // MiniMax format: { data: [{ id, ... }] } or { models: [...] }
        models = (data.data || data.models || [])
          .filter(m => (m.id || m.model) && !shouldExcludeModel(m.id || m.model))
          .map(m => ({
            id: m.id || m.model,
            name: m.id || m.model
          }));
        break;
      
      case 'xai':
        // xAI format: { data: [{ id, ... }] }
        models = (data.data || [])
          .filter(m => m.id && !shouldExcludeModel(m.id))
          .filter(m => m.id.includes('grok'))
          .map(m => ({
            id: m.id,
            name: m.id
          }));
        break;
      
      case 'mistral':
        // Mistral format: { data: [{ id, ... }] }
        models = (data.data || [])
          .filter(m => m.id && !shouldExcludeModel(m.id))
          .map(m => ({
            id: m.id,
            name: m.id
          }));
        break;
      
      case 'perplexity':
        // Perplexity format varies
        models = (data.models || data.data || [])
          .filter(m => (m.id || m.model) && !shouldExcludeModel(m.id || m.model))
          .map(m => ({
            id: m.id || m.model,
            name: m.id || m.model
          }));
        break;
      
      case 'openrouter':
        // OpenRouter format: { data: [{ id, name, ... }] }
        // Filter to show only main providers' chat models
        models = (data.data || [])
          .filter(m => {
            if (!m.id || shouldExcludeModel(m.id)) return false;
            // Only keep major providers for trading
            const validPrefixes = [
              'anthropic/claude', 'openai/gpt', 'openai/o1', 'openai/o3',
              'google/gemini', 'mistralai/', 'meta-llama/', 'x-ai/grok'
            ];
            return validPrefixes.some(p => m.id.startsWith(p));
          })
          .map(m => ({
            id: m.id,
            name: m.name || m.id
          }));
        break;
      
      default:
        return [];
    }
    
    // Sort by version (newest first), then by tier (most powerful first)
    return models.sort((a, b) => {
      const versionDiff = extractVersion(b.id) - extractVersion(a.id);
      if (versionDiff !== 0) return versionDiff;
      return getModelTier(b.id) - getModelTier(a.id);
    });
    
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
  // MiniMax: no /models API, use hardcoded list (see RULES.md exception)
  if (providerId === 'minimax') {
    return { success: true, models: MINIMAX_MODELS, error: null };
  }
  
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
