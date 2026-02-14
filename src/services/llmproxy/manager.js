/**
 * LLM Proxy Manager
 * 
 * Manages LiteLLM proxy server installation, configuration and lifecycle.
 * Uses Python virtual environment for isolation.
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

// Configuration
const LLMPROXY_DIR = path.join(os.homedir(), '.hqx', 'llmproxy');
const VENV_DIR = path.join(LLMPROXY_DIR, 'venv');
const ENV_FILE = path.join(LLMPROXY_DIR, '.env');
const PID_FILE = path.join(LLMPROXY_DIR, 'llmproxy.pid');
const LOG_FILE = path.join(LLMPROXY_DIR, 'llmproxy.log');
const DEFAULT_PORT = 8318;

/**
 * LLM Proxy Manager Class
 */
class LLMProxyManager {
  constructor() {
    this.port = DEFAULT_PORT;
    this.process = null;
  }

  /**
   * Get Python executable path in venv
   */
  getPythonPath() {
    const isWindows = process.platform === 'win32';
    return isWindows
      ? path.join(VENV_DIR, 'Scripts', 'python.exe')
      : path.join(VENV_DIR, 'bin', 'python');
  }

  /**
   * Get pip executable path in venv
   */
  getPipPath() {
    const isWindows = process.platform === 'win32';
    return isWindows
      ? path.join(VENV_DIR, 'Scripts', 'pip.exe')
      : path.join(VENV_DIR, 'bin', 'pip');
  }

  /**
   * Check if LLM Proxy is installed
   */
  isInstalled() {
    try {
      const pythonPath = this.getPythonPath();
      if (!fs.existsSync(pythonPath)) return false;
      
      // Check if litellm is installed
      execSync(`"${pythonPath}" -c "import litellm"`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Install LLM Proxy (Python venv + LiteLLM)
   */
  async install(onProgress = () => {}) {
    try {
      // Create directory
      if (!fs.existsSync(LLMPROXY_DIR)) {
        fs.mkdirSync(LLMPROXY_DIR, { recursive: true });
      }
      
      onProgress('Creating Python virtual environment', 10);
      
      // Check for Python
      let pythonCmd = 'python3';
      try {
        execSync('python3 --version', { stdio: 'ignore' });
      } catch {
        try {
          execSync('python --version', { stdio: 'ignore' });
          pythonCmd = 'python';
        } catch {
          return { success: false, error: 'Python not found. Install Python 3.8+' };
        }
      }
      
      // Create venv
      if (!fs.existsSync(VENV_DIR)) {
        execSync(`${pythonCmd} -m venv "${VENV_DIR}"`, { stdio: 'ignore' });
      }
      
      onProgress('Installing LiteLLM', 40);
      
      // Install litellm
      const pipPath = this.getPipPath();
      execSync(`"${pipPath}" install --upgrade pip`, { stdio: 'ignore' });
      execSync(`"${pipPath}" install litellm[proxy]`, { stdio: 'ignore', timeout: 300000 });
      
      onProgress('Installation complete', 100);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if LLM Proxy is running
   */
  async isRunning() {
    try {
      // Check PID file
      if (fs.existsSync(PID_FILE)) {
        const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
        try {
          process.kill(pid, 0); // Check if process exists
          // Verify it's responding
          const health = await this.healthCheck();
          if (health.success) {
            return { running: true, port: this.port, pid };
          }
        } catch {
          // PID exists but process doesn't - clean up
          fs.unlinkSync(PID_FILE);
        }
      }
      return { running: false };
    } catch {
      return { running: false };
    }
  }

  /**
   * Health check - ping the proxy
   */
  healthCheck() {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: this.port,
        path: '/health',
        method: 'GET',
        timeout: 5000
      }, (res) => {
        resolve({ success: res.statusCode === 200 });
      });
      req.on('error', () => resolve({ success: false }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false }); });
      req.end();
    });
  }

  /**
   * Load environment variables from .env file
   */
  loadEnvFile() {
    if (!fs.existsSync(ENV_FILE)) return {};
    const content = fs.readFileSync(ENV_FILE, 'utf8');
    const env = {};
    for (const line of content.split('\n')) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim();
      }
    }
    return env;
  }

  /**
   * Save environment variable to .env file
   */
  saveEnvVar(key, value) {
    const env = this.loadEnvFile();
    env[key] = value;
    const content = Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    fs.writeFileSync(ENV_FILE, content);
  }

  /**
   * Start LLM Proxy server
   */
  async start() {
    try {
      // Check if already running
      const status = await this.isRunning();
      if (status.running) {
        return { success: true, message: 'Already running' };
      }

      if (!this.isInstalled()) {
        return { success: false, error: 'LLM Proxy not installed. Run install() first.' };
      }

      const pythonPath = this.getPythonPath();
      const env = { ...process.env, ...this.loadEnvFile() };
      
      // Start LiteLLM proxy
      const proc = spawn(pythonPath, [
        '-m', 'litellm',
        '--port', String(this.port),
        '--host', '127.0.0.1'
      ], {
        cwd: LLMPROXY_DIR,
        env,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      // Write logs
      const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
      proc.stdout.pipe(logStream);
      proc.stderr.pipe(logStream);

      // Save PID
      fs.writeFileSync(PID_FILE, String(proc.pid));
      proc.unref();
      
      // Wait for startup
      await new Promise(r => setTimeout(r, 3000));
      
      // Verify running
      const health = await this.healthCheck();
      if (!health.success) {
        return { success: false, error: 'Proxy started but not responding' };
      }

      return { success: true, port: this.port, pid: proc.pid };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop LLM Proxy server
   */
  async stop() {
    try {
      if (fs.existsSync(PID_FILE)) {
        const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim());
        try {
          process.kill(pid, 'SIGTERM');
          await new Promise(r => setTimeout(r, 1000));
          try { process.kill(pid, 'SIGKILL'); } catch {}
        } catch {}
        fs.unlinkSync(PID_FILE);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Set API key for a provider
   */
  async setApiKey(providerId, apiKey) {
    try {
      const envKey = this.getEnvKeyName(providerId);
      this.saveEnvVar(envKey, apiKey);
      
      // Restart proxy if running to pick up new key
      const status = await this.isRunning();
      if (status.running) {
        await this.stop();
        await this.start();
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get API key for a provider
   */
  getApiKey(providerId) {
    const envKey = this.getEnvKeyName(providerId);
    const env = this.loadEnvFile();
    return env[envKey] || null;
  }

  /**
   * Get environment variable name for provider API key
   */
  getEnvKeyName(providerId) {
    const mapping = {
      minimax: 'MINIMAX_API_KEY',
      deepseek: 'DEEPSEEK_API_KEY',
      groq: 'GROQ_API_KEY',
      mistral: 'MISTRAL_API_KEY',
      xai: 'XAI_API_KEY',
      perplexity: 'PERPLEXITYAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
      together: 'TOGETHERAI_API_KEY',
      fireworks: 'FIREWORKS_AI_API_KEY',
      cohere: 'COHERE_API_KEY',
      ai21: 'AI21_API_KEY',
      replicate: 'REPLICATE_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      google: 'GEMINI_API_KEY',
    };
    return mapping[providerId] || `${providerId.toUpperCase()}_API_KEY`;
  }

  /**
   * Test connection to a provider
   */
  async testConnection(providerId, modelId) {
    try {
      const start = Date.now();
      const result = await this.chatCompletion(providerId, modelId, [
        { role: 'user', content: 'Say "OK" in one word.' }
      ], { max_tokens: 5 });
      
      if (result.success) {
        return { success: true, latency: Date.now() - start };
      }
      return { success: false, error: result.error };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Make chat completion request via LLM Proxy
   */
  async chatCompletion(providerId, modelId, messages, options = {}) {
    return new Promise((resolve) => {
      const modelPrefix = this.getModelPrefix(providerId);
      const fullModelId = modelId.includes('/') ? modelId : `${modelPrefix}${modelId}`;
      
      const body = JSON.stringify({
        model: fullModelId,
        messages,
        ...options
      });

      const req = http.request({
        hostname: 'localhost',
        port: this.port,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 60000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ success: true, response: parsed });
            } else {
              resolve({ success: false, error: parsed.error?.message || `HTTP ${res.statusCode}` });
            }
          } catch {
            resolve({ success: false, error: 'Invalid response' });
          }
        });
      });

      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
      req.write(body);
      req.end();
    });
  }

  /**
   * Get LiteLLM model prefix for provider
   */
  getModelPrefix(providerId) {
    const prefixes = {
      minimax: 'minimax/',
      deepseek: 'deepseek/',
      groq: 'groq/',
      mistral: 'mistral/',
      xai: 'xai/',
      perplexity: 'perplexity/',
      openrouter: 'openrouter/',
      together: 'together_ai/',
      fireworks: 'fireworks_ai/',
      cohere: 'cohere/',
      anthropic: 'anthropic/',
      openai: 'openai/',
      google: 'gemini/',
    };
    return prefixes[providerId] || `${providerId}/`;
  }

  /**
   * Get base URL for LLM Proxy
   */
  getBaseUrl() {
    return `http://localhost:${this.port}`;
  }
}

module.exports = { LLMProxyManager };
