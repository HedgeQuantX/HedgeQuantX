/**
 * AI Token Scanner - Ultra Solid Edition
 * Scans for existing AI provider tokens from various IDEs, tools, and configs
 * Supports macOS, Linux, Windows, and headless servers
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const homeDir = os.homedir();
const platform = process.platform; // 'darwin', 'linux', 'win32'

/**
 * Detect if running on a headless server (no GUI)
 */
const isHeadlessServer = () => {
  if (platform === 'win32') return false;
  
  // Check for common server indicators
  const indicators = [
    !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY,  // No display server
    process.env.SSH_CLIENT || process.env.SSH_TTY,          // SSH session
    process.env.TERM === 'dumb',                            // Dumb terminal
    fs.existsSync('/etc/ssh/sshd_config'),                  // SSH server installed
  ];
  
  // Check if running in container
  const inContainer = fs.existsSync('/.dockerenv') || 
    fs.existsSync('/run/.containerenv') ||
    (fs.existsSync('/proc/1/cgroup') && 
     fs.readFileSync('/proc/1/cgroup', 'utf8').includes('docker'));
  
  return indicators.filter(Boolean).length >= 2 || inContainer;
};

/**
 * Get app data directory based on OS
 */
const getAppDataDir = () => {
  switch (platform) {
    case 'darwin':
      return path.join(homeDir, 'Library', 'Application Support');
    case 'win32':
      return process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    case 'linux':
    default:
      return process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
  }
};

/**
 * Get all possible config directories (for thorough scanning)
 */
const getAllConfigDirs = () => {
  const dirs = [homeDir];
  
  switch (platform) {
    case 'darwin':
      dirs.push(
        path.join(homeDir, 'Library', 'Application Support'),
        path.join(homeDir, 'Library', 'Preferences'),
        path.join(homeDir, '.config')
      );
      break;
    case 'win32':
      dirs.push(
        process.env.APPDATA,
        process.env.LOCALAPPDATA,
        path.join(homeDir, '.config')
      );
      break;
    case 'linux':
    default:
      dirs.push(
        path.join(homeDir, '.config'),
        path.join(homeDir, '.local', 'share'),
        '/etc'  // System-wide configs (server)
      );
      break;
  }
  
  return dirs.filter(d => d && pathExists(d));
};

/**
 * IDE and tool configurations for token scanning
 */
const TOKEN_SOURCES = {
  // ==================== VS CODE FAMILY ====================
  vscode: {
    name: 'VS CODE',
    icon: '💻',
    paths: {
      darwin: [
        path.join(getAppDataDir(), 'Code', 'User', 'globalStorage'),
        path.join(getAppDataDir(), 'Code', 'User')
      ],
      linux: [
        path.join(homeDir, '.config', 'Code', 'User', 'globalStorage'),
        path.join(homeDir, '.config', 'Code', 'User'),
        path.join(homeDir, '.vscode')
      ],
      win32: [
        path.join(getAppDataDir(), 'Code', 'User', 'globalStorage'),
        path.join(getAppDataDir(), 'Code', 'User')
      ]
    },
    extensions: {
      claude: ['anthropic.claude-code', 'anthropic.claude'],
      continue: ['continue.continue'],
      cline: ['saoudrizwan.claude-dev'],
      openai: ['openai.openai-chatgpt']
    }
  },
  
  vscodeInsiders: {
    name: 'VS CODE INSIDERS',
    icon: '💻',
    paths: {
      darwin: [path.join(getAppDataDir(), 'Code - Insiders', 'User', 'globalStorage')],
      linux: [path.join(homeDir, '.config', 'Code - Insiders', 'User', 'globalStorage')],
      win32: [path.join(getAppDataDir(), 'Code - Insiders', 'User', 'globalStorage')]
    },
    extensions: {
      claude: ['anthropic.claude-code', 'anthropic.claude'],
      continue: ['continue.continue']
    }
  },
  
  vscodium: {
    name: 'VSCODIUM',
    icon: '💻',
    paths: {
      darwin: [path.join(getAppDataDir(), 'VSCodium', 'User', 'globalStorage')],
      linux: [path.join(homeDir, '.config', 'VSCodium', 'User', 'globalStorage')],
      win32: [path.join(getAppDataDir(), 'VSCodium', 'User', 'globalStorage')]
    },
    extensions: {
      claude: ['anthropic.claude-code'],
      continue: ['continue.continue']
    }
  },
  
  // ==================== AI-FOCUSED EDITORS ====================
  cursor: {
    name: 'CURSOR',
    icon: '🖱️',
    paths: {
      darwin: [
        path.join(getAppDataDir(), 'Cursor', 'User', 'globalStorage'),
        path.join(getAppDataDir(), 'Cursor', 'User'),
        path.join(homeDir, '.cursor')
      ],
      linux: [
        path.join(homeDir, '.config', 'Cursor', 'User', 'globalStorage'),
        path.join(homeDir, '.cursor')
      ],
      win32: [
        path.join(getAppDataDir(), 'Cursor', 'User', 'globalStorage'),
        path.join(homeDir, '.cursor')
      ]
    },
    extensions: {
      claude: ['anthropic.claude-code'],
      continue: ['continue.continue']
    },
    configFiles: ['config.json', 'settings.json', 'credentials.json']
  },
  
  windsurf: {
    name: 'WINDSURF',
    icon: '🏄',
    paths: {
      darwin: [
        path.join(getAppDataDir(), 'Windsurf', 'User', 'globalStorage'),
        path.join(getAppDataDir(), 'Windsurf', 'User')
      ],
      linux: [
        path.join(homeDir, '.config', 'Windsurf', 'User', 'globalStorage'),
        path.join(homeDir, '.windsurf')
      ],
      win32: [
        path.join(getAppDataDir(), 'Windsurf', 'User', 'globalStorage')
      ]
    },
    extensions: {
      claude: ['anthropic.claude-code']
    }
  },
  
  zed: {
    name: 'ZED',
    icon: '⚡',
    paths: {
      darwin: [
        path.join(getAppDataDir(), 'Zed'),
        path.join(homeDir, '.zed')
      ],
      linux: [
        path.join(homeDir, '.config', 'zed'),
        path.join(homeDir, '.zed')
      ],
      win32: [
        path.join(getAppDataDir(), 'Zed')
      ]
    },
    configFiles: ['settings.json', 'credentials.json', 'keychain.json']
  },
  
  // ==================== CLI TOOLS ====================
  claudeCli: {
    name: 'CLAUDE CLI',
    icon: '🤖',
    paths: {
      darwin: [
        path.join(homeDir, '.claude'),
        path.join(homeDir, '.config', 'claude'),
        path.join(getAppDataDir(), 'Claude')
      ],
      linux: [
        path.join(homeDir, '.claude'),
        path.join(homeDir, '.config', 'claude')
      ],
      win32: [
        path.join(homeDir, '.claude'),
        path.join(getAppDataDir(), 'Claude')
      ]
    },
    configFiles: ['.credentials.json', 'credentials.json', 'config.json', '.credentials', 'settings.json', 'settings.local.json', 'auth.json', 'claude.json']
  },
  
  // Claude config in home directory
  claudeHome: {
    name: 'CLAUDE CONFIG',
    icon: '🤖',
    paths: {
      darwin: [homeDir],
      linux: [homeDir],
      win32: [homeDir]
    },
    configFiles: ['.claude.json', '.clauderc', '.claude_credentials']
  },
  
  opencode: {
    name: 'OPENCODE',
    icon: '🔓',
    paths: {
      darwin: [path.join(homeDir, '.opencode')],
      linux: [path.join(homeDir, '.opencode')],
      win32: [path.join(homeDir, '.opencode')]
    },
    configFiles: ['config.json', 'credentials.json', 'settings.json', 'auth.json']
  },
  
  aider: {
    name: 'AIDER',
    icon: '🔧',
    paths: {
      darwin: [path.join(homeDir, '.aider')],
      linux: [path.join(homeDir, '.aider')],
      win32: [path.join(homeDir, '.aider')]
    },
    configFiles: ['config.yml', '.aider.conf.yml', 'credentials.json']
  },
  
  continuedev: {
    name: 'CONTINUE.DEV',
    icon: '▶️',
    paths: {
      darwin: [path.join(homeDir, '.continue')],
      linux: [path.join(homeDir, '.continue')],
      win32: [path.join(homeDir, '.continue')]
    },
    configFiles: ['config.json', 'config.yaml', 'credentials.json']
  },
  
  cline: {
    name: 'CLINE',
    icon: '📟',
    paths: {
      darwin: [
        path.join(getAppDataDir(), 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev'),
        path.join(homeDir, '.cline')
      ],
      linux: [
        path.join(homeDir, '.config', 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev'),
        path.join(homeDir, '.cline')
      ],
      win32: [
        path.join(getAppDataDir(), 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev')
      ]
    },
    configFiles: ['settings.json', 'config.json']
  },
  
  // ==================== ENVIRONMENT VARIABLES ====================
  envVars: {
    name: 'ENVIRONMENT',
    icon: '🌍',
    envKeys: [
      'ANTHROPIC_API_KEY',
      'CLAUDE_API_KEY',
      'OPENAI_API_KEY',
      'OPENROUTER_API_KEY',
      'GOOGLE_API_KEY',
      'GEMINI_API_KEY',
      'GROQ_API_KEY',
      'DEEPSEEK_API_KEY',
      'MISTRAL_API_KEY',
      'PERPLEXITY_API_KEY',
      'TOGETHER_API_KEY',
      'XAI_API_KEY',
      'GROK_API_KEY'
    ]
  },
  
  // ==================== SHELL CONFIGS (dotfiles) ====================
  shellConfigs: {
    name: 'SHELL CONFIG',
    icon: '🐚',
    paths: {
      darwin: [homeDir],
      linux: [homeDir],
      win32: [homeDir]
    },
    configFiles: [
      '.bashrc', '.bash_profile', '.zshrc', '.zprofile',
      '.profile', '.envrc', '.env', '.env.local',
      '.config/fish/config.fish'
    ]
  },
  
  // ==================== SERVER-SPECIFIC (Linux) ====================
  serverConfigs: {
    name: 'SERVER CONFIG',
    icon: '🖥️',
    paths: {
      linux: [
        '/etc/environment',
        '/etc/profile.d',
        path.join(homeDir, '.config'),
        '/opt'
      ]
    },
    configFiles: ['*.env', '*.conf', 'config.json', 'credentials.json']
  },
  
  // ==================== NPM/NODE CONFIGS ====================
  npmConfigs: {
    name: 'NPM CONFIG',
    icon: '📦',
    paths: {
      darwin: [path.join(homeDir, '.npm'), path.join(homeDir, '.npmrc')],
      linux: [path.join(homeDir, '.npm'), path.join(homeDir, '.npmrc')],
      win32: [path.join(homeDir, '.npm'), path.join(getAppDataDir(), 'npm')]
    },
    configFiles: ['.npmrc', 'config.json']
  },
  
  // ==================== GIT CONFIGS ====================
  gitConfigs: {
    name: 'GIT CONFIG',
    icon: '📂',
    paths: {
      darwin: [path.join(homeDir, '.config', 'git')],
      linux: [path.join(homeDir, '.config', 'git')],
      win32: [path.join(homeDir, '.config', 'git')]
    },
    configFiles: ['credentials', 'config']
  }
};

/**
 * Provider patterns to search for in config files
 */
const PROVIDER_PATTERNS = {
  anthropic: {
    name: 'CLAUDE',
    displayName: 'CLAUDE (ANTHROPIC)',
    keyPatterns: [
      /sk-ant-api\d{2}-[a-zA-Z0-9_-]{80,}/g,           // New format API key
      /sk-ant-[a-zA-Z0-9_-]{40,}/g,                     // Old format API key
    ],
    sessionPatterns: [
      /"sessionKey"\s*:\s*"([^"]+)"/gi,
      /'sessionKey'\s*:\s*'([^']+)'/gi,
      /sessionKey\s*[=:]\s*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
      /claude[_-]?session[_-]?key\s*[=:]\s*['"]?([^'"}\s]+)['"]?/gi,
      /claude[_-]?session\s*[=:]\s*['"]?([^'"}\s]+)['"]?/gi
    ],
    envKey: 'ANTHROPIC_API_KEY'
  },
  
  openai: {
    name: 'OPENAI',
    displayName: 'OPENAI (GPT)',
    keyPatterns: [
      /sk-proj-[a-zA-Z0-9_-]{100,}/g,                  // Project API key (new)
      /sk-(?!ant|or)[a-zA-Z0-9]{48,}/g,                // Standard API key (NOT anthropic/openrouter)
    ],
    sessionPatterns: [
      /openai[_-]?accessToken\s*[=:]\s*['"]?([^'"}\s]+)['"]?/gi,
      /chatgpt[_-]?session\s*[=:]\s*['"]?([^'"}\s]+)['"]?/gi
    ],
    envKey: 'OPENAI_API_KEY'
  },
  
  openrouter: {
    name: 'OPENROUTER',
    displayName: 'OPENROUTER',
    keyPatterns: [
      /sk-or-v1-[a-zA-Z0-9]{64}/g,                      // OpenRouter API key
      /sk-or-[a-zA-Z0-9_-]{40,}/g,                      // Alt format
    ],
    envKey: 'OPENROUTER_API_KEY'
  },
  
  gemini: {
    name: 'GEMINI',
    displayName: 'GEMINI (GOOGLE)',
    keyPatterns: [
      /AIza[a-zA-Z0-9_-]{35}/g,                         // Google API key
    ],
    envKey: 'GOOGLE_API_KEY'
  },
  
  groq: {
    name: 'GROQ',
    displayName: 'GROQ',
    keyPatterns: [
      /gsk_[a-zA-Z0-9]{52}/g,                           // Groq API key
    ],
    envKey: 'GROQ_API_KEY'
  },
  
  deepseek: {
    name: 'DEEPSEEK',
    displayName: 'DEEPSEEK',
    keyPatterns: [
      /sk-[a-f0-9]{32}/g,                               // DeepSeek API key
    ],
    envKey: 'DEEPSEEK_API_KEY'
  },
  
  mistral: {
    name: 'MISTRAL',
    displayName: 'MISTRAL',
    keyPatterns: [
      /mistral[_-]?[a-zA-Z0-9]{32}/gi,                  // Mistral key with prefix
    ],
    envKey: 'MISTRAL_API_KEY'
  },
  
  perplexity: {
    name: 'PERPLEXITY',
    displayName: 'PERPLEXITY',
    keyPatterns: [
      /pplx-[a-zA-Z0-9]{48}/g,                          // Perplexity API key
    ],
    envKey: 'PERPLEXITY_API_KEY'
  },
  
  together: {
    name: 'TOGETHER',
    displayName: 'TOGETHER AI',
    keyPatterns: [
      /together[_-]?[a-f0-9]{64}/gi,                    // Together API key with prefix
    ],
    envKey: 'TOGETHER_API_KEY'
  },
  
  xai: {
    name: 'XAI',
    displayName: 'GROK (XAI)',
    keyPatterns: [
      /xai-[a-zA-Z0-9_-]{40,}/g,                        // xAI key
    ],
    envKey: 'XAI_API_KEY'
  }
};

// ==================== UTILITY FUNCTIONS ====================

/**
 * Check if a path exists
 */
const pathExists = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

/**
 * Read file safely
 */
const readFileSafe = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
};

/**
 * Get file modification time
 */
const getFileModTime = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return stats.mtime;
  } catch {
    return null;
  }
};

/**
 * Try to read VS Code SQLite state database
 */
const readVSCodeStateDb = (dbPath) => {
  const results = [];
  
  try {
    // Try using sqlite3 CLI if available
    const { execSync } = require('child_process');
    
    // Check if sqlite3 is available
    try {
      execSync('which sqlite3', { stdio: 'pipe' });
    } catch {
      return results; // sqlite3 not available
    }
    
    // Query for keys that might contain tokens
    const queries = [
      "SELECT key, value FROM ItemTable WHERE key LIKE '%apiKey%' OR key LIKE '%token%' OR key LIKE '%credential%' OR key LIKE '%session%'",
      "SELECT key, value FROM ItemTable WHERE key LIKE '%anthropic%' OR key LIKE '%openai%' OR key LIKE '%claude%'"
    ];
    
    for (const query of queries) {
      try {
        const output = execSync(`sqlite3 "${dbPath}" "${query}"`, { 
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        if (output) {
          const lines = output.trim().split('\n');
          for (const line of lines) {
            const [key, value] = line.split('|');
            if (value && value.length > 20) {
              // Try to identify provider
              for (const [providerId, provider] of Object.entries(PROVIDER_PATTERNS)) {
                for (const pattern of provider.keyPatterns) {
                  pattern.lastIndex = 0;
                  if (pattern.test(value)) {
                    results.push({
                      type: 'api_key',
                      provider: providerId,
                      providerName: provider.displayName,
                      token: value,
                      keyPath: key
                    });
                  }
                }
              }
            }
          }
        }
      } catch {
        // Query failed, continue
      }
    }
  } catch {
    // SQLite read failed
  }
  
  return results;
};

/**
 * List files in directory (recursive optional)
 */
const listFiles = (dir, recursive = false, maxDepth = 3, currentDepth = 0) => {
  if (!pathExists(dir) || currentDepth > maxDepth) return [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files = [];
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      // Skip hidden system directories
      if (entry.name.startsWith('.') && entry.isDirectory() && 
          !['config', '.continue', '.claude', '.opencode', '.cursor', '.zed', '.aider'].some(n => entry.name.includes(n))) {
        continue;
      }
      
      if (entry.isFile()) {
        files.push(fullPath);
      } else if (entry.isDirectory() && recursive) {
        files = files.concat(listFiles(fullPath, recursive, maxDepth, currentDepth + 1));
      }
    }
    
    return files;
  } catch {
    return [];
  }
};

/**
 * Validate token format
 */
const validateToken = (token, providerId) => {
  if (!token || token.length < 10) return false;
  
  // Check against known patterns
  const provider = PROVIDER_PATTERNS[providerId];
  if (!provider) return true; // Accept if no pattern defined
  
  for (const pattern of provider.keyPatterns) {
    // Reset regex state
    pattern.lastIndex = 0;
    if (pattern.test(token)) return true;
  }
  
  if (provider.sessionPatterns) {
    for (const pattern of provider.sessionPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(token)) return true;
    }
  }
  
  // Generic validation for session tokens
  if (token.length > 20 && /^[a-zA-Z0-9_-]+$/.test(token)) {
    return true;
  }
  
  return false;
};

// ==================== SCANNING FUNCTIONS ====================

/**
 * Scan environment variables for API keys
 */
const scanEnvironmentVariables = () => {
  const results = [];
  
  for (const [providerId, provider] of Object.entries(PROVIDER_PATTERNS)) {
    const envKey = provider.envKey;
    if (envKey && process.env[envKey]) {
      const token = process.env[envKey];
      if (validateToken(token, providerId)) {
        results.push({
          source: 'ENVIRONMENT',
          sourceId: 'envVars',
          icon: '🌍',
          type: 'api_key',
          provider: providerId,
          providerName: provider.displayName,
          token: token,
          filePath: `$${envKey}`,
          lastUsed: new Date() // Env vars are "current"
        });
      }
    }
  }
  
  // Also check generic key names
  const genericEnvKeys = ['AI_API_KEY', 'LLM_API_KEY', 'API_KEY'];
  for (const key of genericEnvKeys) {
    if (process.env[key]) {
      // Try to identify the provider
      const token = process.env[key];
      for (const [providerId, provider] of Object.entries(PROVIDER_PATTERNS)) {
        for (const pattern of provider.keyPatterns) {
          pattern.lastIndex = 0;
          if (pattern.test(token)) {
            results.push({
              source: 'ENVIRONMENT',
              sourceId: 'envVars',
              icon: '🌍',
              type: 'api_key',
              provider: providerId,
              providerName: provider.displayName,
              token: token,
              filePath: `$${key}`,
              lastUsed: new Date()
            });
            break;
          }
        }
      }
    }
  }
  
  return results;
};

/**
 * Search for tokens in a content string
 */
const searchTokensInContent = (content, filePath = null) => {
  const results = [];
  
  for (const [providerId, provider] of Object.entries(PROVIDER_PATTERNS)) {
    // Search for API keys
    for (const pattern of provider.keyPatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const token = match[0];
        if (token.length > 10 && validateToken(token, providerId)) {
          results.push({
            type: 'api_key',
            provider: providerId,
            providerName: provider.displayName,
            token: token
          });
        }
      }
    }
    
    // Search for session tokens
    if (provider.sessionPatterns) {
      for (const pattern of provider.sessionPatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const token = match[1] || match[0];
          if (token.length > 10) {
            results.push({
              type: 'session',
              provider: providerId,
              providerName: provider.displayName,
              token: token
            });
          }
        }
      }
    }
  }
  
  return results;
};

/**
 * Parse JSON config file and extract tokens
 */
const parseJsonConfig = (content, filePath = null) => {
  const results = [];
  
  try {
    const json = JSON.parse(content);
    
    const extractFromObject = (obj, prefix = '') => {
      if (!obj || typeof obj !== 'object') return;
      
      for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        
        if (typeof value === 'string' && value.length > 10) {
          // Check if key looks like a credential key
          const isCredKey = [
            'apikey', 'api_key', 'api-key',
            'sessionkey', 'session_key', 'session-key',
            'accesstoken', 'access_token', 'access-token',
            'token', 'secret', 'credential', 'auth',
            'anthropic', 'openai', 'claude', 'gpt'
          ].some(k => lowerKey.includes(k));
          
          if (isCredKey) {
            // Identify provider from token format
            for (const [providerId, provider] of Object.entries(PROVIDER_PATTERNS)) {
              for (const pattern of provider.keyPatterns) {
                pattern.lastIndex = 0;
                if (pattern.test(value)) {
                  results.push({
                    type: 'api_key',
                    provider: providerId,
                    providerName: provider.displayName,
                    token: value,
                    keyPath: prefix + key
                  });
                  break;
                }
              }
              
              if (provider.sessionPatterns) {
                for (const pattern of provider.sessionPatterns) {
                  pattern.lastIndex = 0;
                  if (pattern.test(value) || pattern.test(`"${key}":"${value}"`)) {
                    results.push({
                      type: 'session',
                      provider: providerId,
                      providerName: provider.displayName,
                      token: value,
                      keyPath: prefix + key
                    });
                    break;
                  }
                }
              }
            }
          }
        } else if (typeof value === 'object' && value !== null) {
          extractFromObject(value, prefix + key + '.');
        }
      }
    };
    
    extractFromObject(json);
  } catch {
    // Not valid JSON, use regex search
    return searchTokensInContent(content, filePath);
  }
  
  return results;
};

/**
 * Scan a single source for tokens
 */
const scanSource = (sourceId) => {
  const source = TOKEN_SOURCES[sourceId];
  if (!source) return [];
  
  const results = [];
  const paths = source.paths?.[platform] || [];
  
  // Scan each path
  for (const basePath of paths) {
    if (!pathExists(basePath)) continue;
    
    // Scan extension directories (for VS Code-based editors)
    if (source.extensions) {
      for (const [providerHint, extIds] of Object.entries(source.extensions)) {
        const extIdList = Array.isArray(extIds) ? extIds : [extIds];
        
        for (const extId of extIdList) {
          const extPath = path.join(basePath, extId);
          if (!pathExists(extPath)) continue;
          
          // Scan all files in extension directory
          const files = listFiles(extPath, true, 2);
          for (const filePath of files) {
            const content = readFileSafe(filePath);
            if (!content) continue;
            
            const tokens = filePath.endsWith('.json') 
              ? parseJsonConfig(content, filePath)
              : searchTokensInContent(content, filePath);
            
            for (const token of tokens) {
              results.push({
                source: source.name,
                sourceId: sourceId,
                icon: source.icon || '📁',
                ...token,
                filePath: filePath,
                lastUsed: getFileModTime(filePath)
              });
            }
          }
        }
      }
    }
    
    // Scan config files
    if (source.configFiles) {
      for (const file of source.configFiles) {
        // Handle wildcards
        if (file.includes('*')) {
          const files = listFiles(basePath, false);
          const regex = new RegExp('^' + file.replace(/\*/g, '.*') + '$');
          for (const f of files) {
            if (regex.test(path.basename(f))) {
              const content = readFileSafe(f);
              if (content) {
                const tokens = f.endsWith('.json') 
                  ? parseJsonConfig(content, f)
                  : searchTokensInContent(content, f);
                
                for (const token of tokens) {
                  results.push({
                    source: source.name,
                    sourceId: sourceId,
                    icon: source.icon || '📁',
                    ...token,
                    filePath: f,
                    lastUsed: getFileModTime(f)
                  });
                }
              }
            }
          }
        } else {
          const filePath = path.join(basePath, file);
          const content = readFileSafe(filePath);
          if (content) {
            const tokens = filePath.endsWith('.json') 
              ? parseJsonConfig(content, filePath)
              : searchTokensInContent(content, filePath);
            
            for (const token of tokens) {
              results.push({
                source: source.name,
                sourceId: sourceId,
                icon: source.icon || '📁',
                ...token,
                filePath: filePath,
                lastUsed: getFileModTime(filePath)
              });
            }
          }
        }
      }
    }
  }
  
  return results;
};

/**
 * Scan all sources for tokens
 */
const scanAllSources = () => {
  const allResults = [];
  
  // First, scan environment variables (highest priority)
  allResults.push(...scanEnvironmentVariables());
  
  // Then scan all tool sources
  for (const sourceId of Object.keys(TOKEN_SOURCES)) {
    if (sourceId === 'envVars') continue; // Already scanned
    
    try {
      const results = scanSource(sourceId);
      allResults.push(...results);
    } catch (err) {
      // Silent fail for individual sources
    }
  }
  
  // Remove duplicates (same token from multiple sources)
  const uniqueTokens = new Map();
  for (const result of allResults) {
    if (result.token) {
      const key = `${result.provider}:${result.token}`;
      if (!uniqueTokens.has(key)) {
        uniqueTokens.set(key, result);
      } else {
        // Keep the more recent one
        const existing = uniqueTokens.get(key);
        if (result.lastUsed && (!existing.lastUsed || result.lastUsed > existing.lastUsed)) {
          uniqueTokens.set(key, result);
        }
      }
    }
  }
  
  // Sort by last used (most recent first)
  return Array.from(uniqueTokens.values()).sort((a, b) => {
    if (!a.lastUsed) return 1;
    if (!b.lastUsed) return -1;
    return b.lastUsed - a.lastUsed;
  });
};

/**
 * Scan for a specific provider's tokens
 */
const scanForProvider = (providerId) => {
  const allTokens = scanAllSources();
  return allTokens.filter(t => t.provider === providerId);
};

/**
 * Get human-readable time ago
 */
const timeAgo = (date) => {
  if (!date) return 'UNKNOWN';
  
  const seconds = Math.floor((new Date() - date) / 1000);
  
  if (seconds < 60) return 'JUST NOW';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} MIN AGO`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} HOURS AGO`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} DAYS AGO`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} WEEKS AGO`;
  return `${Math.floor(seconds / 2592000)} MONTHS AGO`;
};

/**
 * Format scan results for display
 */
const formatResults = (results) => {
  return results.map((r, i) => ({
    index: i + 1,
    source: r.source,
    icon: r.icon || '📁',
    provider: r.providerName || PROVIDER_PATTERNS[r.provider]?.displayName || r.provider.toUpperCase(),
    type: r.type === 'session' ? 'SESSION' : 'API KEY',
    lastUsed: timeAgo(r.lastUsed),
    tokenPreview: r.token ? `${r.token.substring(0, 10)}...${r.token.substring(r.token.length - 4)}` : 'N/A'
  }));
};

/**
 * Quick check if any tokens exist (fast scan)
 */
const hasExistingTokens = () => {
  // Quick check environment variables first
  for (const provider of Object.values(PROVIDER_PATTERNS)) {
    if (provider.envKey && process.env[provider.envKey]) {
      return true;
    }
  }
  
  // Quick check common locations
  const quickPaths = [
    path.join(homeDir, '.claude'),
    path.join(homeDir, '.opencode'),
    path.join(homeDir, '.continue')
  ];
  
  for (const p of quickPaths) {
    if (pathExists(p)) return true;
  }
  
  return false;
};

/**
 * Get system info for debugging
 */
const getSystemInfo = () => {
  return {
    platform,
    homeDir,
    appDataDir: getAppDataDir(),
    isHeadless: isHeadlessServer(),
    nodeVersion: process.version,
    arch: os.arch()
  };
};

module.exports = {
  TOKEN_SOURCES,
  PROVIDER_PATTERNS,
  scanAllSources,
  scanForProvider,
  scanSource,
  scanEnvironmentVariables,
  formatResults,
  timeAgo,
  hasExistingTokens,
  isHeadlessServer,
  getSystemInfo,
  validateToken
};
