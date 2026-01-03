/**
 * AI Service Manager
 * Manages multiple AI provider connections
 */

const { getProviders, getProvider } = require('./providers');
const { storage } = require('../session');
const AISupervisor = require('./supervisor');
const StrategySupervisor = require('./strategy-supervisor');

// In-memory cache of connections
let connectionsCache = null;

/**
 * Get AI settings from storage
 */
const getAISettings = () => {
  try {
    const sessions = storage.load();
    const aiSettings = sessions.find(s => s.type === 'ai') || { type: 'ai', agents: [] };
    
    // Migrate old single-agent format to multi-agent
    if (aiSettings.provider && !aiSettings.agents) {
      return {
        type: 'ai',
        agents: [{
          id: generateAgentId(),
          provider: aiSettings.provider,
          option: aiSettings.option,
          credentials: aiSettings.credentials,
          model: aiSettings.model,
          name: getProvider(aiSettings.provider)?.name || 'AI Agent',
          createdAt: Date.now()
        }],
        activeAgentId: null
      };
    }
    return aiSettings;
  } catch {
    return { type: 'ai', agents: [] };
  }
};

/**
 * Save AI settings to storage
 */
const saveAISettings = (aiSettings) => {
  try {
    const sessions = storage.load();
    const otherSessions = sessions.filter(s => s.type !== 'ai');
    
    aiSettings.type = 'ai';
    otherSessions.push(aiSettings);
    
    storage.save(otherSessions);
    connectionsCache = null; // Invalidate cache
  } catch (e) {
    // Silent fail
  }
};

/**
 * Generate unique agent ID
 */
const generateAgentId = () => {
  return 'agent_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
};

/**
 * Get all connected agents
 */
const getAgents = () => {
  const aiSettings = getAISettings();
  const agents = aiSettings.agents || [];
  
  return agents.map(agent => {
    const provider = getProvider(agent.provider);
    return {
      id: agent.id,
      name: agent.name || provider?.name || 'Unknown',
      provider: provider,
      providerId: agent.provider,
      option: agent.option,
      model: agent.model || provider?.defaultModel,
      createdAt: agent.createdAt,
      isActive: agent.id === aiSettings.activeAgentId
    };
  }).filter(a => a.provider); // Filter out invalid providers
};

/**
 * Get agent count
 */
const getAgentCount = () => {
  const aiSettings = getAISettings();
  return (aiSettings.agents || []).length;
};

/**
 * Check if any AI is connected
 */
const isConnected = () => {
  return getAgentCount() > 0;
};

/**
 * Get active agent (or first agent if none active)
 */
const getActiveAgent = () => {
  const aiSettings = getAISettings();
  const agents = aiSettings.agents || [];
  
  if (agents.length === 0) return null;
  
  // Find active agent or use first one
  const activeId = aiSettings.activeAgentId;
  const agent = activeId 
    ? agents.find(a => a.id === activeId) 
    : agents[0];
  
  if (!agent) return null;
  
  const provider = getProvider(agent.provider);
  if (!provider) return null;
  
  return {
    id: agent.id,
    name: agent.name || provider.name,
    provider: provider,
    providerId: agent.provider,
    option: agent.option,
    model: agent.model || provider.defaultModel,
    credentials: agent.credentials,
    connected: true
  };
};

/**
 * Get agent by ID
 */
const getAgent = (agentId) => {
  const aiSettings = getAISettings();
  const agents = aiSettings.agents || [];
  const agent = agents.find(a => a.id === agentId);
  
  if (!agent) return null;
  
  const provider = getProvider(agent.provider);
  if (!provider) return null;
  
  return {
    id: agent.id,
    name: agent.name || provider.name,
    provider: provider,
    providerId: agent.provider,
    option: agent.option,
    model: agent.model || provider.defaultModel,
    credentials: agent.credentials,
    connected: true
  };
};

/**
 * Get agent credentials by ID
 * @param {string} agentId - Agent ID
 * @returns {Object|null} Credentials object or null
 */
const getAgentCredentials = (agentId) => {
  const aiSettings = getAISettings();
  const agents = aiSettings.agents || [];
  const agent = agents.find(a => a.id === agentId);
  
  if (!agent) return null;
  return agent.credentials || null;
};

/**
 * Set active agent
 */
const setActiveAgent = (agentId) => {
  const aiSettings = getAISettings();
  const agents = aiSettings.agents || [];
  
  if (!agents.find(a => a.id === agentId)) {
    throw new Error('Agent not found');
  }
  
  aiSettings.activeAgentId = agentId;
  saveAISettings(aiSettings);
};

/**
 * Add a new agent (connect to provider)
 */
const addAgent = async (providerId, optionId, credentials, model = null, customName = null) => {
  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error('Invalid provider');
  }
  
  const option = provider.options.find(o => o.id === optionId);
  if (!option) {
    throw new Error('Invalid option');
  }
  
  const aiSettings = getAISettings();
  if (!aiSettings.agents) {
    aiSettings.agents = [];
  }
  
  // Create new agent
  const agentId = generateAgentId();
  const newAgent = {
    id: agentId,
    provider: providerId,
    option: optionId,
    credentials: credentials,
    model: model || provider.defaultModel,
    name: customName || provider.name,
    createdAt: Date.now()
  };
  
  aiSettings.agents.push(newAgent);
  
  // Set as active if first agent
  if (aiSettings.agents.length === 1) {
    aiSettings.activeAgentId = agentId;
  }
  
  saveAISettings(aiSettings);
  
  // Get the full agent object
  const agent = getAgent(agentId);
  
  // Notify StrategySupervisor if algo is running
  // This ensures new agents are immediately connected to live trading
  try {
    StrategySupervisor.addAgent(agent);
  } catch (e) {
    // Supervisor might not be active - that's OK
  }
  
  return agent;
};

/**
 * Remove an agent
 */
const removeAgent = (agentId) => {
  const aiSettings = getAISettings();
  const agents = aiSettings.agents || [];
  
  const index = agents.findIndex(a => a.id === agentId);
  if (index === -1) {
    throw new Error('Agent not found');
  }
  
  agents.splice(index, 1);
  aiSettings.agents = agents;
  
  // Stop AI supervision for this agent
  AISupervisor.stop(agentId);
  
  // Notify StrategySupervisor to remove agent from live trading
  try {
    StrategySupervisor.removeAgent(agentId);
  } catch (e) {
    // Supervisor might not be active - that's OK
  }
  
  // If removed agent was active, set new active
  if (aiSettings.activeAgentId === agentId) {
    aiSettings.activeAgentId = agents.length > 0 ? agents[0].id : null;
  }
  
  saveAISettings(aiSettings);
};

/**
 * Update agent settings
 */
const updateAgent = (agentId, updates) => {
  const aiSettings = getAISettings();
  const agents = aiSettings.agents || [];
  
  const agent = agents.find(a => a.id === agentId);
  if (!agent) {
    throw new Error('Agent not found');
  }
  
  // Apply updates
  if (updates.name) agent.name = updates.name;
  if (updates.model) agent.model = updates.model;
  if (updates.credentials) agent.credentials = updates.credentials;
  
  saveAISettings(aiSettings);
  return getAgent(agentId);
};

/**
 * Disconnect all agents
 */
const disconnectAll = () => {
  // Stop all AI supervision sessions
  AISupervisor.stopAll();
  
  // Refresh StrategySupervisor to clear agents
  try {
    StrategySupervisor.refreshAgents();
  } catch (e) {
    // Supervisor might not be active
  }
  
  saveAISettings({ agents: [] });
};

/**
 * Legacy: Get current connection (returns active agent)
 * @deprecated Use getActiveAgent() instead
 */
const getConnection = () => {
  return getActiveAgent();
};

/**
 * Legacy: Connect to a provider (adds new agent)
 * @deprecated Use addAgent() instead
 */
const connect = async (providerId, optionId, credentials, model = null) => {
  return addAgent(providerId, optionId, credentials, model);
};

/**
 * Legacy: Disconnect (removes all agents)
 * @deprecated Use removeAgent() or disconnectAll() instead
 */
const disconnect = () => {
  disconnectAll();
};

/**
 * Get credentials for active agent
 */
const getCredentials = () => {
  const agent = getActiveAgent();
  return agent?.credentials || null;
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
    const token = credentials.apiKey || credentials.sessionKey || credentials.accessToken;
    if (!token) return { valid: false, error: 'No API key provided' };
    
    // Validate by fetching models from API - this proves the token works
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': token,
        'anthropic-version': '2023-06-01'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.data && Array.isArray(data.data) && data.data.length > 0) {
        return { valid: true, tokenType: 'api_key' };
      }
      return { valid: false, error: 'API returned no models' };
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
  // Provider info
  getProviders,
  getProvider,
  
  // Multi-agent API
  getAgents,
  getAgentCount,
  getAgent,
  getAgentCredentials,
  getActiveAgent,
  setActiveAgent,
  addAgent,
  removeAgent,
  updateAgent,
  disconnectAll,
  
  // Legacy API (for backwards compatibility)
  isConnected,
  getConnection,
  connect,
  disconnect,
  getCredentials,
  
  // Validation
  validateConnection,
  
  // Settings
  getAISettings,
  saveAISettings
};
