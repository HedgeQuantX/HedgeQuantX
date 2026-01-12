/**
 * LLM API Proxy Service
 * 
 * Uses LiteLLM (Python) to provide a unified OpenAI-compatible proxy
 * for 50+ LLM providers via API keys.
 * 
 * Port: 8318 (different from CLIProxyAPI which uses 8317)
 * 
 * Supported providers (API Key only):
 * - MiniMax, DeepSeek, Groq, Mistral, xAI, Perplexity, OpenRouter
 * - And 50+ more via LiteLLM
 */

const { LLMProxyManager } = require('./manager');

// Singleton instance
let proxyManager = null;

/**
 * Get or create proxy manager instance
 * @returns {LLMProxyManager}
 */
const getManager = () => {
  if (!proxyManager) {
    proxyManager = new LLMProxyManager();
  }
  return proxyManager;
};

/**
 * Check if LLM Proxy is installed (Python venv + LiteLLM)
 * @returns {boolean}
 */
const isInstalled = () => {
  return getManager().isInstalled();
};

/**
 * Install LLM Proxy (creates Python venv, installs LiteLLM)
 * @param {Function} onProgress - Progress callback (message, percent)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const install = async (onProgress = () => {}) => {
  return getManager().install(onProgress);
};

/**
 * Check if LLM Proxy is running
 * @returns {Promise<{running: boolean, port?: number}>}
 */
const isRunning = async () => {
  return getManager().isRunning();
};

/**
 * Start LLM Proxy server
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const start = async () => {
  return getManager().start();
};

/**
 * Stop LLM Proxy server
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const stop = async () => {
  return getManager().stop();
};

/**
 * Set API key for a provider
 * @param {string} providerId - Provider ID (e.g., 'minimax', 'deepseek')
 * @param {string} apiKey - API key
 * @returns {Promise<{success: boolean, error?: string}>}
 */
const setApiKey = async (providerId, apiKey) => {
  return getManager().setApiKey(providerId, apiKey);
};

/**
 * Get API key for a provider
 * @param {string} providerId - Provider ID
 * @returns {string|null}
 */
const getApiKey = (providerId) => {
  return getManager().getApiKey(providerId);
};

/**
 * Test connection to a provider
 * @param {string} providerId - Provider ID
 * @param {string} modelId - Model ID to test
 * @returns {Promise<{success: boolean, latency?: number, error?: string}>}
 */
const testConnection = async (providerId, modelId) => {
  return getManager().testConnection(providerId, modelId);
};

/**
 * Make a chat completion request via LLM Proxy
 * @param {string} providerId - Provider ID
 * @param {string} modelId - Model ID
 * @param {Array} messages - Chat messages
 * @param {Object} options - Additional options (temperature, max_tokens, etc.)
 * @returns {Promise<{success: boolean, response?: Object, error?: string}>}
 */
const chatCompletion = async (providerId, modelId, messages, options = {}) => {
  return getManager().chatCompletion(providerId, modelId, messages, options);
};

/**
 * Get LLM Proxy base URL
 * @returns {string}
 */
const getBaseUrl = () => {
  return getManager().getBaseUrl();
};

/**
 * Get port
 * @returns {number}
 */
const getPort = () => {
  return getManager().port;
};

/**
 * Provider mapping for LiteLLM model prefixes
 */
const PROVIDER_PREFIXES = {
  minimax: 'minimax/',
  deepseek: 'deepseek/',
  groq: 'groq/',
  mistral: 'mistral/',
  xai: 'xai/',
  perplexity: 'perplexity/',
  openrouter: 'openrouter/',
  together: 'together_ai/',
  anyscale: 'anyscale/',
  fireworks: 'fireworks_ai/',
  cohere: 'cohere/',
  ai21: 'ai21/',
  nlp_cloud: 'nlp_cloud/',
  replicate: 'replicate/',
  bedrock: 'bedrock/',
  sagemaker: 'sagemaker/',
  vertex: 'vertex_ai/',
  palm: 'palm/',
  azure: 'azure/',
};

module.exports = {
  isInstalled,
  install,
  isRunning,
  start,
  stop,
  setApiKey,
  getApiKey,
  testConnection,
  chatCompletion,
  getBaseUrl,
  getPort,
  PROVIDER_PREFIXES,
};
