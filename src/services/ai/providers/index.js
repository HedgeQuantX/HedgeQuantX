/**
 * AI Providers Configuration
 * Each provider has connection options (API Key, Plans, etc.)
 */

const PROVIDERS = {
  // ========== UNIFIED PROVIDERS (RECOMMENDED) ==========
  openrouter: {
    id: 'openrouter',
    name: 'OPENROUTER (RECOMMENDED)',
    description: '1 API key for 100+ models',
    category: 'unified',
    models: [
      'anthropic/claude-sonnet-4',
      'anthropic/claude-3-opus',
      'openai/gpt-4o',
      'openai/gpt-4-turbo',
      'google/gemini-pro-1.5',
      'meta-llama/llama-3-70b',
      'mistralai/mistral-large',
      'deepseek/deepseek-chat'
    ],
    defaultModel: 'anthropic/claude-sonnet-4',
    options: [
      {
        id: 'api_key',
        label: 'API KEY',
        description: [
          'Get key at openrouter.ai/keys',
          'Access to Claude, GPT-4, Gemini, Llama & more',
          'Pay-per-use, no subscriptions'
        ],
        fields: ['apiKey'],
        url: 'https://openrouter.ai/keys'
      }
    ],
    endpoint: 'https://openrouter.ai/api/v1'
  },

  // ========== DIRECT PROVIDERS ==========
  anthropic: {
    id: 'anthropic',
    name: 'CLAUDE (ANTHROPIC)',
    description: 'Direct connection to Claude',
    category: 'direct',
    models: ['claude-sonnet-4-5-20250929', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    defaultModel: 'claude-sonnet-4-5-20250929',
    options: [
      {
        id: 'api_key',
        label: 'API KEY (PAY-PER-USE)',
        description: [
          'Get key at console.anthropic.com',
          '~$0.10 per trading session'
        ],
        fields: ['apiKey'],
        url: 'https://console.anthropic.com'
      },
      {
        id: 'max_plan',
        label: 'MAX PLAN ($100/MONTH)',
        description: [
          'Subscribe at claude.ai',
          'Unlimited usage'
        ],
        fields: ['sessionKey'],
        url: 'https://claude.ai'
      }
    ],
    endpoint: 'https://api.anthropic.com/v1'
  },
  
  openai: {
    id: 'openai',
    name: 'OPENAI (GPT-4)',
    description: 'Direct connection to GPT-4',
    category: 'direct',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini', 'gpt-3.5-turbo'],
    defaultModel: 'gpt-4o',
    options: [
      {
        id: 'api_key',
        label: 'API KEY (PAY-PER-USE)',
        description: [
          'Get key at platform.openai.com',
          '~$0.15 per trading session'
        ],
        fields: ['apiKey'],
        url: 'https://platform.openai.com/api-keys'
      },
      {
        id: 'plus_plan',
        label: 'PLUS PLAN ($20/MONTH)',
        description: [
          'Subscribe at chat.openai.com',
          'GPT-4 access included'
        ],
        fields: ['accessToken'],
        url: 'https://chat.openai.com'
      }
    ],
    endpoint: 'https://api.openai.com/v1'
  },
  
  gemini: {
    id: 'gemini',
    name: 'GEMINI (GOOGLE)',
    description: 'Direct connection to Gemini',
    category: 'direct',
    models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
    defaultModel: 'gemini-1.5-flash',
    options: [
      {
        id: 'api_key',
        label: 'API KEY (FREE TIER)',
        description: [
          'Get key at aistudio.google.com',
          'Free tier: 60 requests/min'
        ],
        fields: ['apiKey'],
        url: 'https://aistudio.google.com/apikey'
      }
    ],
    endpoint: 'https://generativelanguage.googleapis.com/v1'
  },
  
  deepseek: {
    id: 'deepseek',
    name: 'DEEPSEEK',
    description: 'Very cheap & capable',
    category: 'direct',
    models: ['deepseek-chat', 'deepseek-coder'],
    defaultModel: 'deepseek-chat',
    options: [
      {
        id: 'api_key',
        label: 'API KEY (VERY CHEAP)',
        description: [
          'Get key at platform.deepseek.com',
          '~$0.02 per trading session'
        ],
        fields: ['apiKey'],
        url: 'https://platform.deepseek.com'
      }
    ],
    endpoint: 'https://api.deepseek.com/v1'
  },
  
  groq: {
    id: 'groq',
    name: 'GROQ',
    description: 'Ultra fast inference',
    category: 'direct',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768'],
    defaultModel: 'llama-3.3-70b-versatile',
    options: [
      {
        id: 'api_key',
        label: 'API KEY (FREE TIER)',
        description: [
          'Get key at console.groq.com',
          'Generous free tier',
          'Ultra low latency'
        ],
        fields: ['apiKey'],
        url: 'https://console.groq.com/keys'
      }
    ],
    endpoint: 'https://api.groq.com/openai/v1'
  },

  xai: {
    id: 'xai',
    name: 'GROK (XAI)',
    description: 'Elon Musk\'s Grok AI',
    category: 'direct',
    models: ['grok-beta', 'grok-2'],
    defaultModel: 'grok-beta',
    options: [
      {
        id: 'api_key',
        label: 'API KEY',
        description: [
          'Get key at console.x.ai',
          'Grok models from xAI'
        ],
        fields: ['apiKey'],
        url: 'https://console.x.ai'
      }
    ],
    endpoint: 'https://api.x.ai/v1'
  },

  mistral: {
    id: 'mistral',
    name: 'MISTRAL',
    description: 'European AI leader',
    category: 'direct',
    models: ['mistral-large-latest', 'mistral-medium', 'mistral-small'],
    defaultModel: 'mistral-large-latest',
    options: [
      {
        id: 'api_key',
        label: 'API KEY',
        description: [
          'Get key at console.mistral.ai',
          'Fast European models'
        ],
        fields: ['apiKey'],
        url: 'https://console.mistral.ai'
      }
    ],
    endpoint: 'https://api.mistral.ai/v1'
  },

  perplexity: {
    id: 'perplexity',
    name: 'PERPLEXITY',
    description: 'Real-time web search AI',
    category: 'direct',
    models: ['llama-3.1-sonar-large-128k-online', 'llama-3.1-sonar-small-128k-online', 'llama-3.1-sonar-huge-128k-online'],
    defaultModel: 'llama-3.1-sonar-large-128k-online',
    options: [
      {
        id: 'api_key',
        label: 'API KEY',
        description: [
          'Get key at perplexity.ai/settings/api',
          'Real-time market news & data',
          'Web search integrated'
        ],
        fields: ['apiKey'],
        url: 'https://www.perplexity.ai/settings/api'
      }
    ],
    endpoint: 'https://api.perplexity.ai'
  },

  together: {
    id: 'together',
    name: 'TOGETHER AI',
    description: 'Open source models, fast & cheap',
    category: 'direct',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo', 'mistralai/Mixtral-8x22B-Instruct-v0.1', 'Qwen/Qwen2.5-72B-Instruct-Turbo'],
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    options: [
      {
        id: 'api_key',
        label: 'API KEY',
        description: [
          'Get key at api.together.xyz',
          '100+ open source models',
          'Fast inference, good pricing'
        ],
        fields: ['apiKey'],
        url: 'https://api.together.xyz/settings/api-keys'
      }
    ],
    endpoint: 'https://api.together.xyz/v1'
  },


  qwen: {
    id: 'qwen',
    name: 'QWEN (ALIBABA)',
    description: 'Alibaba\'s top AI model',
    category: 'direct',
    models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
    defaultModel: 'qwen-plus',
    options: [
      {
        id: 'api_key',
        label: 'API KEY (DASHSCOPE)',
        description: [
          'Get key at dashscope.aliyun.com',
          'Qwen2.5 models',
          'Very competitive pricing'
        ],
        fields: ['apiKey'],
        url: 'https://dashscope.console.aliyun.com/apiKey'
      }
    ],
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  },

  moonshot: {
    id: 'moonshot',
    name: 'MOONSHOT (KIMI)',
    description: '200K context window',
    category: 'direct',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    defaultModel: 'moonshot-v1-32k',
    options: [
      {
        id: 'api_key',
        label: 'API KEY',
        description: [
          'Get key at platform.moonshot.cn',
          'Up to 200K context',
          'Good for long documents'
        ],
        fields: ['apiKey'],
        url: 'https://platform.moonshot.cn/console/api-keys'
      }
    ],
    endpoint: 'https://api.moonshot.cn/v1'
  },

  yi: {
    id: 'yi',
    name: '01.AI (YI)',
    description: 'Yi models by Kai-Fu Lee',
    category: 'direct',
    models: ['yi-large', 'yi-medium', 'yi-spark'],
    defaultModel: 'yi-large',
    options: [
      {
        id: 'api_key',
        label: 'API KEY',
        description: [
          'Get key at platform.01.ai',
          'Yi-Large: GPT-4 level',
          'Affordable pricing'
        ],
        fields: ['apiKey'],
        url: 'https://platform.01.ai'
      }
    ],
    endpoint: 'https://api.01.ai/v1'
  },

  zhipu: {
    id: 'zhipu',
    name: 'ZHIPU AI (GLM)',
    description: 'ChatGLM models',
    category: 'direct',
    models: ['glm-4-plus', 'glm-4', 'glm-4-flash'],
    defaultModel: 'glm-4',
    options: [
      {
        id: 'api_key',
        label: 'API KEY',
        description: [
          'Get key at open.bigmodel.cn',
          'ChatGLM-4 models',
          'Strong multilingual'
        ],
        fields: ['apiKey'],
        url: 'https://open.bigmodel.cn/usercenter/apikeys'
      }
    ],
    endpoint: 'https://open.bigmodel.cn/api/paas/v4'
  },

  baichuan: {
    id: 'baichuan',
    name: 'BAICHUAN',
    description: 'Chinese language specialist',
    category: 'direct',
    models: ['Baichuan4', 'Baichuan3-Turbo', 'Baichuan2-Turbo'],
    defaultModel: 'Baichuan4',
    options: [
      {
        id: 'api_key',
        label: 'API KEY',
        description: [
          'Get key at platform.baichuan-ai.com',
          'Best for Chinese content',
          'Competitive pricing'
        ],
        fields: ['apiKey'],
        url: 'https://platform.baichuan-ai.com/console/apikey'
      }
    ],
    endpoint: 'https://api.baichuan-ai.com/v1'
  },

  // ========== LOCAL / FREE ==========
  ollama: {
    id: 'ollama',
    name: 'OLLAMA (LOCAL - FREE)',
    description: '100% free, runs locally',
    category: 'local',
    models: ['llama3', 'llama3.1', 'mistral', 'codellama', 'phi3', 'gemma2'],
    defaultModel: 'llama3.1',
    options: [
      {
        id: 'local',
        label: 'LOCAL INSTALLATION (FREE)',
        description: [
          'Download at ollama.ai',
          '100% free, no API key needed',
          'Run: ollama pull llama3.1'
        ],
        fields: ['endpoint'],
        url: 'https://ollama.ai',
        defaultEndpoint: 'http://localhost:11434'
      }
    ]
  },

  lmstudio: {
    id: 'lmstudio',
    name: 'LM STUDIO (LOCAL - FREE)',
    description: 'Local with GUI',
    category: 'local',
    models: [],
    defaultModel: '',
    options: [
      {
        id: 'local',
        label: 'LOCAL SERVER (FREE)',
        description: [
          'Download at lmstudio.ai',
          'GUI for local models',
          'OpenAI-compatible API'
        ],
        fields: ['endpoint'],
        url: 'https://lmstudio.ai',
        defaultEndpoint: 'http://localhost:1234/v1'
      }
    ]
  },
  
  // ========== CUSTOM ==========
  custom: {
    id: 'custom',
    name: 'CUSTOM ENDPOINT',
    description: 'Any OpenAI-compatible API',
    category: 'custom',
    models: [],
    defaultModel: '',
    options: [
      {
        id: 'custom',
        label: 'CUSTOM OPENAI-COMPATIBLE API',
        description: [
          'Self-hosted models',
          'vLLM, TGI, etc.',
          'Any OpenAI-compatible endpoint'
        ],
        fields: ['endpoint', 'apiKey', 'model']
      }
    ]
  }
};

/**
 * Get all providers
 */
const getProviders = () => Object.values(PROVIDERS);

/**
 * Get providers by category
 */
const getProvidersByCategory = (category) => {
  return Object.values(PROVIDERS).filter(p => p.category === category);
};

/**
 * Get provider by ID
 */
const getProvider = (id) => PROVIDERS[id] || null;

/**
 * Get provider options
 */
const getProviderOptions = (id) => {
  const provider = PROVIDERS[id];
  return provider ? provider.options : [];
};

/**
 * Get categories
 */
const getCategories = () => [
  { id: 'unified', name: 'UNIFIED (RECOMMENDED)', description: '1 API key for multiple models' },
  { id: 'direct', name: 'DIRECT PROVIDERS', description: 'Connect directly to each provider' },
  { id: 'local', name: 'LOCAL (FREE)', description: 'Run models on your machine' },
  { id: 'custom', name: 'CUSTOM', description: 'Self-hosted solutions' }
];

module.exports = {
  PROVIDERS,
  getProviders,
  getProvidersByCategory,
  getProvider,
  getProviderOptions,
  getCategories
};
