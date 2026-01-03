/**
 * AI Client - Makes real API calls to AI providers
 * 
 * STRICT RULE: No mock responses. Real API calls only.
 * If API fails → return null, not fake data.
 */

const https = require('https');
const http = require('http');
const { getProvider } = require('./providers');

/**
 * Make HTTP request to AI provider
 * @param {string} url - Full URL
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response data
 */
const makeRequest = (url, options) => {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    
    const req = protocol.request(url, {
      method: options.method || 'POST',
      headers: options.headers || {},
      timeout: options.timeout || 30000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data.substring(0, 100)}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
};

/**
 * Call OpenAI-compatible API
 * Works with: OpenAI, Groq, Together, DeepSeek, Mistral, xAI, etc.
 * @param {Object} agent - Agent configuration
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - System prompt
 * @returns {Promise<string|null>} Response text or null on error
 */
const callOpenAICompatible = async (agent, prompt, systemPrompt) => {
  const provider = getProvider(agent.providerId);
  if (!provider) return null;
  
  const endpoint = agent.credentials?.endpoint || provider.endpoint;
  const apiKey = agent.credentials?.apiKey;
  const model = agent.model || provider.defaultModel;
  
  if (!apiKey && provider.category !== 'local') {
    return null;
  }
  
  const url = `${endpoint}/chat/completions`;
  
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  // OpenRouter requires additional headers
  if (agent.providerId === 'openrouter') {
    headers['HTTP-Referer'] = 'https://hedgequantx.com';
    headers['X-Title'] = 'HQX-CLI';
  }
  
  const body = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 500
  };
  
  try {
    const response = await makeRequest(url, { headers, body, timeout: 30000 });
    return response.choices?.[0]?.message?.content || null;
  } catch (error) {
    return null;
  }
};

/**
 * Get valid OAuth token (refresh if needed)
 * @param {Object} credentials - Agent credentials with oauth data
 * @returns {Promise<string|null>} Valid access token or null
 */
const getValidOAuthToken = async (credentials) => {
  if (!credentials?.oauth) return null;
  
  const oauthAnthropic = require('./oauth-anthropic');
  const validToken = await oauthAnthropic.getValidToken(credentials.oauth);
  
  if (!validToken) return null;
  
  // If token was refreshed, we should update storage (handled by caller)
  if (validToken.refreshed) {
    credentials.oauth.access = validToken.access;
    credentials.oauth.refresh = validToken.refresh;
    credentials.oauth.expires = validToken.expires;
  }
  
  return validToken.access;
};

/**
 * Call Anthropic Claude API
 * Supports both API key and OAuth authentication
 * @param {Object} agent - Agent configuration
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - System prompt
 * @returns {Promise<string|null>} Response text or null on error
 */
const callAnthropic = async (agent, prompt, systemPrompt) => {
  const provider = getProvider('anthropic');
  if (!provider) return null;
  
  const model = agent.model || provider.defaultModel;
  const url = `${provider.endpoint}/messages`;
  
  // Determine authentication method
  const isOAuth = agent.credentials?.oauth?.refresh;
  let headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01'
  };
  
  if (isOAuth) {
    // OAuth Bearer token authentication
    const accessToken = await getValidOAuthToken(agent.credentials);
    if (!accessToken) return null;
    
    headers['Authorization'] = `Bearer ${accessToken}`;
    headers['anthropic-beta'] = 'oauth-2025-04-20,interleaved-thinking-2025-05-14';
  } else {
    // Standard API key authentication
    const apiKey = agent.credentials?.apiKey;
    if (!apiKey) return null;
    
    headers['x-api-key'] = apiKey;
  }
  
  const body = {
    model,
    max_tokens: 500,
    system: systemPrompt,
    messages: [
      { role: 'user', content: prompt }
    ]
  };
  
  try {
    const response = await makeRequest(url, { headers, body, timeout: 30000 });
    return response.content?.[0]?.text || null;
  } catch (error) {
    return null;
  }
};

/**
 * Call Google Gemini API
 * @param {Object} agent - Agent configuration
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - System prompt
 * @returns {Promise<string|null>} Response text or null on error
 */
const callGemini = async (agent, prompt, systemPrompt) => {
  const provider = getProvider('gemini');
  if (!provider) return null;
  
  const apiKey = agent.credentials?.apiKey;
  const model = agent.model || provider.defaultModel;
  
  if (!apiKey) return null;
  
  const url = `${provider.endpoint}/models/${model}:generateContent?key=${apiKey}`;
  
  const headers = {
    'Content-Type': 'application/json'
  };
  
  const body = {
    contents: [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\n${prompt}` }] }
    ],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 500
    }
  };
  
  try {
    const response = await makeRequest(url, { headers, body, timeout: 30000 });
    return response.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (error) {
    return null;
  }
};

/**
 * Call AI provider based on agent configuration
 * @param {Object} agent - Agent with providerId and credentials
 * @param {string} prompt - User prompt
 * @param {string} systemPrompt - System prompt
 * @returns {Promise<string|null>} AI response or null on error
 */
const callAI = async (agent, prompt, systemPrompt = '') => {
  if (!agent || !agent.providerId) return null;
  
  switch (agent.providerId) {
    case 'anthropic':
      return callAnthropic(agent, prompt, systemPrompt);
    
    case 'gemini':
      return callGemini(agent, prompt, systemPrompt);
    
    // All OpenAI-compatible APIs
    case 'openai':
    case 'openrouter':
    case 'deepseek':
    case 'groq':
    case 'xai':
    case 'mistral':
    case 'perplexity':
    case 'together':
    case 'qwen':
    case 'moonshot':
    case 'yi':
    case 'zhipu':
    case 'baichuan':
    case 'ollama':
    case 'lmstudio':
    case 'custom':
      return callOpenAICompatible(agent, prompt, systemPrompt);
    
    default:
      return null;
  }
};

/**
 * Analyze trading data with AI
 * @param {Object} agent - AI agent
 * @param {Object} data - Trading data from APIs
 * @returns {Promise<Object|null>} Analysis result or null
 */
const analyzeTrading = async (agent, data) => {
  if (!agent || !data) return null;
  
  const systemPrompt = `You are a professional trading analyst for prop firm futures trading.
Analyze the provided real-time trading data and provide actionable insights.
Be concise. Focus on risk management and optimization.
Respond in JSON format with: { "action": "HOLD|REDUCE_SIZE|PAUSE|CONTINUE", "confidence": 0-100, "reason": "brief reason" }`;
  
  const prompt = `Current trading session data:
- Account Balance: ${data.account?.balance ?? 'N/A'}
- Today P&L: ${data.account?.profitAndLoss ?? 'N/A'}
- Open Positions: ${data.positions?.length ?? 0}
- Open Orders: ${data.orders?.length ?? 0}
- Today Trades: ${data.trades?.length ?? 0}

${data.positions?.length > 0 ? `Positions: ${JSON.stringify(data.positions.map(p => ({
  symbol: p.symbol || p.contractId,
  qty: p.quantity,
  pnl: p.profitAndLoss
})))}` : ''}

Analyze and provide recommendation.`;

  try {
    const response = await callAI(agent, prompt, systemPrompt);
    if (!response) return null;
    
    // Try to parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Fetch available models from Anthropic API (API Key auth)
 * @param {string} apiKey - API key
 * @returns {Promise<Array|null>} Array of model IDs or null on error
 * 
 * Data source: https://api.anthropic.com/v1/models (GET)
 */
const fetchAnthropicModels = async (apiKey) => {
  if (!apiKey) return null;
  
  const url = 'https://api.anthropic.com/v1/models';
  
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };
  
  try {
    const response = await makeRequest(url, { method: 'GET', headers, timeout: 10000 });
    if (response.data && Array.isArray(response.data)) {
      return response.data.map(m => m.id).filter(Boolean);
    }
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Fetch available models from Anthropic API (OAuth auth)
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<Array|null>} Array of model IDs or null on error
 * 
 * Data source: https://api.anthropic.com/v1/models (GET with Bearer token)
 */
const fetchAnthropicModelsOAuth = async (accessToken) => {
  if (!accessToken) return null;
  
  const url = 'https://api.anthropic.com/v1/models';
  
  const headers = {
    'Authorization': `Bearer ${accessToken}`,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'oauth-2025-04-20'
  };
  
  try {
    const response = await makeRequest(url, { method: 'GET', headers, timeout: 10000 });
    if (response.data && Array.isArray(response.data)) {
      const models = response.data.map(m => m.id).filter(Boolean);
      if (models.length > 0) return models;
    }
    return null;
  } catch (error) {
    // OAuth token may not support /models endpoint
    return null;
  }
};

/**
 * Fetch available models from OpenAI-compatible API
 * @param {string} endpoint - API endpoint
 * @param {string} apiKey - API key
 * @returns {Promise<Array|null>} Array of model IDs or null on error
 * 
 * Data source: {endpoint}/models (GET)
 */
const fetchOpenAIModels = async (endpoint, apiKey) => {
  if (!endpoint) return null;
  
  const url = `${endpoint}/models`;
  
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  try {
    const response = await makeRequest(url, { method: 'GET', headers, timeout: 10000 });
    if (response.data && Array.isArray(response.data)) {
      return response.data.map(m => m.id).filter(Boolean);
    }
    return null;
  } catch (error) {
    return null;
  }
};

module.exports = {
  callAI,
  analyzeTrading,
  callOpenAICompatible,
  callAnthropic,
  callGemini,
  fetchAnthropicModels,
  fetchAnthropicModelsOAuth,
  fetchOpenAIModels,
  getValidOAuthToken
};
