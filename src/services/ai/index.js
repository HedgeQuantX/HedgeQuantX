/**
 * AI Service Manager
 * Manages AI provider connections and settings
 */

const { getProviders, getProvider } = require('./providers');
const { settings } = require('../../config');

// In-memory cache of current connection
let currentConnection = null;

/**
 * Get AI settings from storage
 */
const getAISettings = () => {
  try {
    return settings.get('ai') || {};
  } catch {
    return {};
  }
};

/**
 * Save AI settings to storage
 */
const saveAISettings = (aiSettings) => {
  try {
    settings.set('ai', aiSettings);
  } catch (e) {
    // Silent fail
  }
};

/**
 * Check if AI is connected
 */
const isConnected = () => {
  const aiSettings = getAISettings();
  return !!(aiSettings.provider && aiSettings.credentials);
};

/**
 * Get current connection info
 */
const getConnection = () => {
  const aiSettings = getAISettings();
  if (!aiSettings.provider) return null;
  
  const provider = getProvider(aiSettings.provider);
  if (!provider) return null;
  
  return {
    provider: provider,
    option: aiSettings.option,
    model: aiSettings.model || provider.defaultModel,
    connected: true
  };
};

/**
 * Connect to a provider
 */
const connect = async (providerId, optionId, credentials, model = null) => {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error('Invalid provider');
  }
  
  const option = provider.options.find(o => o.id === optionId);
  if (!option) {
    throw new Error('Invalid option');
  }
  
  // Save to settings
  const aiSettings = {
    provider: providerId,
    option: optionId,
    credentials: credentials,
    model: model || provider.defaultModel
  };
  
  saveAISettings(aiSettings);
  currentConnection = getConnection();
  
  return currentConnection;
};

/**
 * Disconnect from AI
 */
const disconnect = () => {
  saveAISettings({});
  currentConnection = null;
};

/**
 * Get credentials (for API calls)
 */
const getCredentials = () => {
  const aiSettings = getAISettings();
  return aiSettings.credentials || null;
};

/**
 * Validate API key with provider
 */
const validateConnection = async (providerId, optionId, credentials) => {
  const provider = getProvider(providerId);
  if (!provider) return { valid: false, error: 'Invalid provider' };
  
  try {
    switch (providerId) {
      case 'anthropic':
        return await validateAnthropic(credentials);
      case 'openai':
        return await validateOpenAI(credentials);
      case 'gemini':
        return await validateGemini(credentials);
      case 'deepseek':
        return await validateDeepSeek(credentials);
      case 'groq':
        return await validateGroq(credentials);
      case 'ollama':
        return await validateOllama(credentials);
      case 'lmstudio':
        return await validateLMStudio(credentials);
      case 'custom':
        return await validateCustom(credentials);
      // OpenAI-compatible providers (use same validation)
      case 'openrouter':
        return await validateOpenRouter(credentials);
      case 'xai':
      case 'mistral':
      case 'perplexity':
      case 'together':
      case 'qwen':
      case 'moonshot':
      case 'yi':
      case 'zhipu':
      case 'baichuan':
        return await validateOpenAICompatible(provider, credentials);
      default:
        return { valid: false, error: 'Unknown provider' };
    }
  } catch (error) {
    return { valid: false, error: error.message };
  }
};

// Validation functions for each provider
const validateAnthropic = async (credentials) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': credentials.apiKey || credentials.sessionKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });
    
    if (response.ok) {
      return { valid: true };
    }
    
    const error = await response.json();
    return { valid: false, error: error.error?.message || 'Invalid API key' };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

const validateOpenAI = async (credentials) => {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${credentials.apiKey || credentials.accessToken}`
      }
    });
    
    if (response.ok) {
      return { valid: true };
    }
    
    return { valid: false, error: 'Invalid API key' };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

const validateGemini = async (credentials) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${credentials.apiKey}`
    );
    
    if (response.ok) {
      return { valid: true };
    }
    
    return { valid: false, error: 'Invalid API key' };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

const validateDeepSeek = async (credentials) => {
  try {
    const response = await fetch('https://api.deepseek.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`
      }
    });
    
    if (response.ok) {
      return { valid: true };
    }
    
    return { valid: false, error: 'Invalid API key' };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

const validateGroq = async (credentials) => {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`
      }
    });
    
    if (response.ok) {
      return { valid: true };
    }
    
    return { valid: false, error: 'Invalid API key' };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

const validateOllama = async (credentials) => {
  try {
    const endpoint = credentials.endpoint || 'http://localhost:11434';
    const response = await fetch(`${endpoint}/api/tags`);
    
    if (response.ok) {
      const data = await response.json();
      return { 
        valid: true, 
        models: data.models?.map(m => m.name) || [] 
      };
    }
    
    return { valid: false, error: 'Cannot connect to Ollama' };
  } catch (e) {
    return { valid: false, error: 'Ollama not running. Start with: ollama serve' };
  }
};

const validateCustom = async (credentials) => {
  try {
    const response = await fetch(`${credentials.endpoint}/models`, {
      headers: credentials.apiKey ? {
        'Authorization': `Bearer ${credentials.apiKey}`
      } : {}
    });
    
    if (response.ok) {
      return { valid: true };
    }
    
    return { valid: false, error: 'Cannot connect to endpoint' };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

const validateOpenRouter = async (credentials) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`
      }
    });
    
    if (response.ok) {
      return { valid: true };
    }
    
    return { valid: false, error: 'Invalid API key' };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

const validateLMStudio = async (credentials) => {
  try {
    const endpoint = credentials.endpoint || 'http://localhost:1234/v1';
    const response = await fetch(`${endpoint}/models`);
    
    if (response.ok) {
      const data = await response.json();
      return { 
        valid: true, 
        models: data.data?.map(m => m.id) || [] 
      };
    }
    
    return { valid: false, error: 'Cannot connect to LM Studio' };
  } catch (e) {
    return { valid: false, error: 'LM Studio not running. Start local server first.' };
  }
};

const validateOpenAICompatible = async (provider, credentials) => {
  try {
    const endpoint = provider.endpoint;
    const response = await fetch(`${endpoint}/models`, {
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      return { valid: true };
    }
    
    // Some providers don't have /models endpoint, try a simple chat
    const chatResponse = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.defaultModel,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      })
    });
    
    if (chatResponse.ok) {
      return { valid: true };
    }
    
    return { valid: false, error: 'Invalid API key or endpoint' };
  } catch (e) {
    return { valid: false, error: e.message };
  }
};

module.exports = {
  getProviders,
  getProvider,
  isConnected,
  getConnection,
  connect,
  disconnect,
  getCredentials,
  validateConnection,
  getAISettings,
  saveAISettings
};
