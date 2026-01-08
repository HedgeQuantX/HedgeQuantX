/**
 * CLIProxyAPI Manager
 * 
 * Downloads, installs and manages CLIProxyAPI binary for OAuth connections
 * to paid AI plans (Claude Pro, ChatGPT Plus, Gemini, etc.)
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const { downloadFile, extractTarGz, extractZip } = require('./installer');

// CLIProxyAPI version and download URLs
const CLIPROXY_VERSION = '6.6.88';
const GITHUB_RELEASE_BASE = 'https://github.com/router-for-me/CLIProxyAPI/releases/download';

// Installation directory
const INSTALL_DIR = path.join(os.homedir(), '.hqx', 'cliproxy');
const BINARY_NAME = process.platform === 'win32' ? 'cli-proxy-api.exe' : 'cli-proxy-api';
const BINARY_PATH = path.join(INSTALL_DIR, BINARY_NAME);
const PID_FILE = path.join(INSTALL_DIR, 'cliproxy.pid');
// Use default CLIProxyAPI auth directory (where -claude-login saves tokens)
const AUTH_DIR = path.join(os.homedir(), '.cli-proxy-api');

// Default port
const DEFAULT_PORT = 8317;

// OAuth callback ports per provider (from CLIProxyAPI)
const CALLBACK_PORTS = {
  anthropic: 54545,    // Claude: /callback
  openai: 1455,        // Codex: /auth/callback
  google: 8085,        // Gemini: /oauth2callback
  qwen: null,          // Qwen uses polling, no callback
  antigravity: 51121,  // Antigravity: /oauth-callback
  iflow: 11451         // iFlow: /oauth2callback
};

// OAuth callback paths per provider
const CALLBACK_PATHS = {
  anthropic: '/callback',
  openai: '/auth/callback',
  google: '/oauth2callback',
  qwen: null,
  antigravity: '/oauth-callback',
  iflow: '/oauth2callback'
};

/** Detect if running in headless/VPS environment (no browser access) */
const isHeadless = () => {
  // SSH/Docker/CI = headless
  if (process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.SSH_CONNECTION) return true;
  if (process.env.DOCKER_CONTAINER || process.env.KUBERNETES_SERVICE_HOST) return true;
  if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI) return true;
  // Linux without display = headless
  if (process.platform === 'linux') {
    return !(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  }
  // macOS/Windows = local with GUI
  return false;
};

/** Get download URL for current platform */
const getDownloadUrl = () => {
  const platform = process.platform, arch = process.arch;
  const osMap = { darwin: 'darwin', linux: 'linux', win32: 'windows' };
  const extMap = { darwin: 'tar.gz', linux: 'tar.gz', win32: 'zip' };
  const archMap = { x64: 'amd64', amd64: 'amd64', arm64: 'arm64' };
  
  const osName = osMap[platform], ext = extMap[platform], archName = archMap[arch];
  if (!osName || !archName) return null;
  
  const filename = `CLIProxyAPI_${CLIPROXY_VERSION}_${osName}_${archName}.${ext}`;
  return { url: `${GITHUB_RELEASE_BASE}/v${CLIPROXY_VERSION}/${filename}`, filename, ext };
};

/** Check if CLIProxyAPI is installed */
const isInstalled = () => fs.existsSync(BINARY_PATH);

/** Install CLIProxyAPI */
const install = async (onProgress = null) => {
  try {
    const download = getDownloadUrl();
    if (!download) {
      return { success: false, error: 'Unsupported platform' };
    }
    
    // Create install directory
    if (!fs.existsSync(INSTALL_DIR)) {
      fs.mkdirSync(INSTALL_DIR, { recursive: true });
    }
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
    
    const archivePath = path.join(INSTALL_DIR, download.filename);
    
    // Download
    if (onProgress) onProgress('Downloading CLIProxyAPI...', 0);
    await downloadFile(download.url, archivePath, (percent) => {
      if (onProgress) onProgress('Downloading CLIProxyAPI...', percent);
    });
    
    // Extract
    if (onProgress) onProgress('Extracting...', 100);
    if (download.ext === 'tar.gz') {
      await extractTarGz(archivePath, INSTALL_DIR);
    } else {
      await extractZip(archivePath, INSTALL_DIR);
    }
    
    // Clean up archive
    if (fs.existsSync(archivePath)) {
      fs.unlinkSync(archivePath);
    }
    
    // Make executable on Unix
    if (process.platform !== 'win32' && fs.existsSync(BINARY_PATH)) {
      fs.chmodSync(BINARY_PATH, '755');
    }
    
    if (!fs.existsSync(BINARY_PATH)) {
      return { success: false, error: 'Binary not found after extraction' };
    }
    
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/** Check if CLIProxyAPI is running */
const isRunning = async () => {
  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      process.kill(pid, 0);
      return { running: true, pid };
    } catch (e) { fs.unlinkSync(PID_FILE); }
  }
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${DEFAULT_PORT}/v1/models`, (res) => {
      resolve({ running: [200, 401, 403].includes(res.statusCode), pid: null });
    });
    req.on('error', () => resolve({ running: false, pid: null }));
    req.setTimeout(2000, () => { req.destroy(); resolve({ running: false, pid: null }); });
  });
};

const CONFIG_PATH = path.join(INSTALL_DIR, 'config.yaml');

/** Create or update config file */
const ensureConfig = () => {
  fs.writeFileSync(CONFIG_PATH, `# HQX CLIProxyAPI Config
host: "127.0.0.1"
port: ${DEFAULT_PORT}
auth-dir: "${AUTH_DIR}"
debug: false
api-keys:
  - "hqx-internal-key"
`);
};

/** Start CLIProxyAPI */
const start = async () => {
  if (!isInstalled()) {
    return { success: false, error: 'CLIProxyAPI not installed', pid: null };
  }
  
  const status = await isRunning();
  if (status.running) {
    return { success: true, error: null, pid: status.pid };
  }
  
  try {
    // Ensure config and auth dir exist
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    ensureConfig();
    
    const args = ['-config', CONFIG_PATH];
    
    // Capture stderr for debugging
    const logPath = path.join(INSTALL_DIR, 'cliproxy.log');
    const logFd = fs.openSync(logPath, 'a');
    
    const child = spawn(BINARY_PATH, args, {
      detached: true,
      stdio: ['ignore', logFd, logFd],
      cwd: INSTALL_DIR
    });
    
    child.unref();
    fs.closeSync(logFd);
    
    // Save PID
    fs.writeFileSync(PID_FILE, String(child.pid));
    
    // Wait for startup
    await new Promise(r => setTimeout(r, 3000));
    
    const runStatus = await isRunning();
    if (runStatus.running) {
      return { success: true, error: null, pid: child.pid };
    } else {
      // Read log for error details
      let errorDetail = 'Failed to start CLIProxyAPI';
      if (fs.existsSync(logPath)) {
        const log = fs.readFileSync(logPath, 'utf8').slice(-500);
        if (log) errorDetail += `: ${log.split('\n').pop()}`;
      }
      return { success: false, error: errorDetail, pid: null };
    }
  } catch (error) {
    return { success: false, error: error.message, pid: null };
  }
};

/** Stop CLIProxyAPI */
const stop = async () => {
  const status = await isRunning();
  if (!status.running) {
    return { success: true, error: null };
  }
  
  try {
    if (status.pid) {
      process.kill(status.pid, 'SIGTERM');
    } else {
      // No PID - try to find and kill by port (only cli-proxy-api process)
      const { execSync } = require('child_process');
      try {
        if (process.platform === 'win32') {
          // Windows: find PID by port and kill
          const result = execSync(`netstat -ano | findstr :${DEFAULT_PORT} | findstr LISTENING`, { encoding: 'utf8' });
          const match = result.match(/LISTENING\s+(\d+)/);
          if (match) {
            const pid = parseInt(match[1]);
            if (pid !== process.pid) process.kill(pid, 'SIGTERM');
          }
        } else {
          // Unix: find PID listening on port, filter to only cli-proxy-api
          try {
            const result = execSync(`lsof -ti:${DEFAULT_PORT} -sTCP:LISTEN 2>/dev/null || true`, { encoding: 'utf8' });
            const pids = result.trim().split('\n').filter(p => p && parseInt(p) !== process.pid);
            for (const pidStr of pids) {
              const pid = parseInt(pidStr);
              if (pid && pid !== process.pid) {
                try { process.kill(pid, 'SIGTERM'); } catch (e) { /* ignore */ }
              }
            }
          } catch (e) {
            // Ignore errors
          }
        }
      } catch (e) {
        // Ignore errors - process may already be dead
      }
    }
    
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
    
    // Wait for port to be released
    await new Promise(r => setTimeout(r, 1000));
    
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/** Ensure CLIProxyAPI is installed and running */
const ensureRunning = async (onProgress = null) => {
  if (!isInstalled()) {
    if (onProgress) onProgress('Installing CLIProxyAPI...', 0);
    const installResult = await install(onProgress);
    if (!installResult.success) return installResult;
  }
  const status = await isRunning();
  if (status.running) return { success: true, error: null };
  if (onProgress) onProgress('Starting CLIProxyAPI...', 100);
  return start();
};

/** Get OAuth login URL for a provider */
const getLoginUrl = async (provider) => {
  const providerFlags = {
    anthropic: '-claude-login', openai: '-codex-login', google: '-login',
    qwen: '-qwen-login', antigravity: '-antigravity-login', iflow: '-iflow-login'
  };
  const flag = providerFlags[provider];
  if (!flag) return { success: false, url: null, childProcess: null, isHeadless: false, error: 'Provider not supported for OAuth' };
  
  const headless = isHeadless();
  const isGemini = (provider === 'google');
  
  return new Promise((resolve) => {
    // For Gemini: use 'pipe' stdin so we can send default project selection
    const child = spawn(BINARY_PATH, [flag, '-no-browser'], { 
      cwd: INSTALL_DIR,
      stdio: isGemini ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe']
    });
    let output = '', resolved = false;
    
    const checkForUrl = () => {
      if (resolved) return;
      const urlMatch = output.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        resolved = true;
        resolve({ success: true, url: urlMatch[0], childProcess: child, isHeadless: headless, isGemini, error: null });
      }
    };
    
    // For Gemini: auto-select default project when prompted
    if (isGemini && child.stdout) {
      child.stdout.on('data', (data) => {
        output += data.toString();
        checkForUrl();
        // When Gemini asks for project selection, send Enter (default) or ALL
        if (data.toString().includes('Enter project ID') && child.stdin) {
          child.stdin.write('\n'); // Select default project
        }
      });
    } else if (child.stdout) {
      child.stdout.on('data', (data) => { output += data.toString(); checkForUrl(); });
    }
    
    if (child.stderr) {
      child.stderr.on('data', (data) => { output += data.toString(); checkForUrl(); });
    }
    child.on('error', (err) => { if (!resolved) { resolved = true; resolve({ success: false, url: null, childProcess: null, isHeadless: headless, isGemini: false, error: err.message }); }});
    child.on('close', (code) => { if (!resolved) { resolved = true; resolve({ success: false, url: null, childProcess: null, isHeadless: headless, isGemini: false, error: `Process exited with code ${code}` }); }});
  });
};

/** Get callback port for a provider */
const getCallbackPort = (provider) => CALLBACK_PORTS[provider] || null;

/** Process OAuth callback URL manually (for VPS/headless) */
const processCallback = (callbackUrl, provider = 'anthropic') => {
  return new Promise((resolve) => {
    try {
      const url = new URL(callbackUrl);
      const urlPort = url.port || (url.protocol === 'https:' ? 443 : 80);
      const urlPath = url.pathname + url.search;
      const expectedPort = CALLBACK_PORTS[provider];
      
      if (!expectedPort) { resolve({ success: true, error: null }); return; } // Qwen uses polling
      
      const targetPort = parseInt(urlPort) || expectedPort;
      const req = http.get(`http://127.0.0.1:${targetPort}${urlPath}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve(res.statusCode === 200 || res.statusCode === 302 
            ? { success: true, error: null } 
            : { success: false, error: `Callback returned ${res.statusCode}: ${data}` });
        });
      });
      req.on('error', (err) => resolve({ success: false, error: `Callback error: ${err.message}` }));
      req.setTimeout(10000, () => { req.destroy(); resolve({ success: false, error: 'Callback timeout' }); });
    } catch (err) { resolve({ success: false, error: `Invalid URL: ${err.message}` }); }
  });
};

module.exports = {
  CLIPROXY_VERSION,
  INSTALL_DIR,
  BINARY_PATH,
  AUTH_DIR,
  DEFAULT_PORT,
  CALLBACK_PORTS,
  CALLBACK_PATHS,
  getDownloadUrl,
  isInstalled,
  isHeadless,
  install,
  isRunning,
  start,
  stop,
  ensureRunning,
  getLoginUrl,
  getCallbackPort,
  processCallback
};
