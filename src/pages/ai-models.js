/**
 * AI Models Configuration
 * 
 * Lists available models for each AI provider.
 * These are technical configuration values, not trading data.
 */

// Models by provider ID
const PROVIDER_MODELS = {
  anthropic: [
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', tier: 'flagship' },
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', tier: 'balanced' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude Sonnet 3.5', tier: 'balanced' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude Haiku 3.5', tier: 'fast' },
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', tier: 'flagship' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', tier: 'fast' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', tier: 'balanced' },
    { id: 'o1', name: 'o1', tier: 'reasoning' },
    { id: 'o1-mini', name: 'o1-mini', tier: 'reasoning' },
    { id: 'o3-mini', name: 'o3-mini', tier: 'reasoning' },
  ],
  google: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', tier: 'flagship' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', tier: 'balanced' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', tier: 'fast' },
    { id: 'gemini-1.0-pro', name: 'Gemini 1.0 Pro', tier: 'legacy' },
  ],
  mistral: [
    { id: 'mistral-large-latest', name: 'Mistral Large', tier: 'flagship' },
    { id: 'mistral-medium-latest', name: 'Mistral Medium', tier: 'balanced' },
    { id: 'mistral-small-latest', name: 'Mistral Small', tier: 'fast' },
    { id: 'codestral-latest', name: 'Codestral', tier: 'code' },
  ],
  groq: [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', tier: 'flagship' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', tier: 'fast' },
    { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', tier: 'balanced' },
    { id: 'gemma2-9b-it', name: 'Gemma 2 9B', tier: 'fast' },
  ],
  xai: [
    { id: 'grok-2', name: 'Grok 2', tier: 'flagship' },
    { id: 'grok-2-mini', name: 'Grok 2 Mini', tier: 'fast' },
    { id: 'grok-beta', name: 'Grok Beta', tier: 'beta' },
  ],
  perplexity: [
    { id: 'sonar-pro', name: 'Sonar Pro', tier: 'flagship' },
    { id: 'sonar', name: 'Sonar', tier: 'balanced' },
    { id: 'sonar-reasoning', name: 'Sonar Reasoning', tier: 'reasoning' },
  ],
  openrouter: [
    { id: 'anthropic/claude-opus-4', name: 'Claude Opus 4', tier: 'flagship' },
    { id: 'openai/gpt-4o', name: 'GPT-4o', tier: 'flagship' },
    { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', tier: 'flagship' },
    { id: 'meta-llama/llama-3.3-70b', name: 'Llama 3.3 70B', tier: 'open' },
  ],
};

/**
 * Get models for a provider
 * @param {string} providerId - Provider ID
 * @returns {Array} List of models
 */
const getModelsForProvider = (providerId) => {
  return PROVIDER_MODELS[providerId] || [];
};

/**
 * Get model by ID
 * @param {string} providerId - Provider ID
 * @param {string} modelId - Model ID
 * @returns {Object|null} Model object or null
 */
const getModelById = (providerId, modelId) => {
  const models = PROVIDER_MODELS[providerId] || [];
  return models.find(m => m.id === modelId) || null;
};

module.exports = {
  PROVIDER_MODELS,
  getModelsForProvider,
  getModelById
};
