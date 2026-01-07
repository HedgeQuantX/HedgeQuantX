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
const AUTH_DIR = path.join(INSTALL_DIR, 'auths');

// Default port
const DEFAULT_PORT = 8317;
const CALLBACK_PORT = 54545;

/**
 * Detect if running in headless/VPS environment (no display)
 * @returns {boolean}
 */
const isHeadless = () => {
  // Check for common display environment variables
  if (process.env.DISPLAY) return false;
  if (process.env.WAYLAND_DISPLAY) return false;
  
  // Check if running via SSH
  if (process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.SSH_CONNECTION) return true;
  
  // Check platform-specific indicators
  if (process.platform === 'linux') {
    // No DISPLAY usually means headless on Linux
    return true;
  }
  
  // macOS/Windows usually have a display
  return false;
};

/**
 * Get download URL for current platform
 * @returns {Object} { url, filename } or null if unsupported
 */
const getDownloadUrl = () => {
  const platform = process.platform;
  const arch = process.arch;
  
  let osName, archName, ext;
  
  if (platform === 'darwin') {
    osName = 'darwin';
    ext = 'tar.gz';
  } else if (platform === 'linux') {
    osName = 'linux';
    ext = 'tar.gz';
  } else if (platform === 'win32') {
    osName = 'windows';
    ext = 'zip';
  } else {
    return null;
  }
  
  if (arch === 'x64' || arch === 'amd64') {
    archName = 'amd64';
  } else if (arch === 'arm64') {
    archName = 'arm64';
  } else {
    return null;
  }
  
  const filename = `CLIProxyAPI_${CLIPROXY_VERSION}_${osName}_${archName}.${ext}`;
  const url = `${GITHUB_RELEASE_BASE}/v${CLIPROXY_VERSION}/${filename}`;
  
  return { url, filename, ext };
};

/**
 * Check if CLIProxyAPI is installed
 * @returns {boolean}
 */
const isInstalled = () => {
  return fs.existsSync(BINARY_PATH);
};


/**
 * Install CLIProxyAPI
 * @param {Function} onProgress - Progress callback (message, percent)
 * @returns {Promise<Object>} { success, error }
 */
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

/**
 * Check if CLIProxyAPI is running
 * @returns {Promise<Object>} { running, pid }
 */
const isRunning = async () => {
  // Check PID file
  if (fs.existsSync(PID_FILE)) {
    try {
      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      // Check if process exists
      process.kill(pid, 0);
      return { running: true, pid };
    } catch (e) {
      // Process doesn't exist, clean up PID file
      fs.unlinkSync(PID_FILE);
    }
  }
  
  // Also check by trying to connect (accept 200, 401, 403 as "running")
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${DEFAULT_PORT}/v1/models`, (res) => {
      const running = res.statusCode === 200 || res.statusCode === 401 || res.statusCode === 403;
      resolve({ running, pid: null });
    });
    req.on('error', () => resolve({ running: false, pid: null }));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ running: false, pid: null });
    });
  });
};

// Config file path
const CONFIG_PATH = path.join(INSTALL_DIR, 'config.yaml');

/**
 * Create config file if not exists
 */
const ensureConfig = () => {
  if (fs.existsSync(CONFIG_PATH)) return;
  
  const config = `# HQX CLIProxyAPI Config
host: "127.0.0.1"
port: ${DEFAULT_PORT}
auth-dir: "${AUTH_DIR}"
debug: false
api-keys:
  - "hqx-internal-key"
`;
  fs.writeFileSync(CONFIG_PATH, config);
};

/**
 * Start CLIProxyAPI
 * @returns {Promise<Object>} { success, error, pid }
 */
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

/**
 * Stop CLIProxyAPI
 * @returns {Promise<Object>} { success, error }
 */
const stop = async () => {
  const status = await isRunning();
  if (!status.running) {
    return { success: true, error: null };
  }
  
  try {
    if (status.pid) {
      process.kill(status.pid, 'SIGTERM');
    }
    
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
    
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

/**
 * Ensure CLIProxyAPI is installed and running
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<Object>} { success, error }
 */
const ensureRunning = async (onProgress = null) => {
  // Check if installed
  if (!isInstalled()) {
    if (onProgress) onProgress('Installing CLIProxyAPI...', 0);
    const installResult = await install(onProgress);
    if (!installResult.success) {
      return installResult;
    }
  }
  
  // Check if running
  const status = await isRunning();
  if (status.running) {
    return { success: true, error: null };
  }
  
  // Start
  if (onProgress) onProgress('Starting CLIProxyAPI...', 100);
  return start();
};

/**
 * Get OAuth login URL for a provider
 * @param {string} provider - Provider ID (anthropic, openai, google, etc.)
 * @returns {Promise<Object>} { success, url, childProcess, isHeadless, error }
 */
const getLoginUrl = async (provider) => {
  const providerFlags = {
    anthropic: '-claude-login',
    openai: '-codex-login',
    google: '-gemini-login',
    qwen: '-qwen-login'
  };
  
  const flag = providerFlags[provider];
  if (!flag) {
    return { success: false, url: null, childProcess: null, isHeadless: false, error: 'Provider not supported for OAuth' };
  }
  
  const headless = isHeadless();
  
  // For headless/VPS, use -no-browser flag
  return new Promise((resolve) => {
    const args = [flag, '-no-browser'];
    const child = spawn(BINARY_PATH, args, {
      cwd: INSTALL_DIR
    });
    
    let output = '';
    let resolved = false;
    
    const checkForUrl = () => {
      if (resolved) return;
      const urlMatch = output.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        resolved = true;
        // Return child process so caller can wait for auth completion
        resolve({ success: true, url: urlMatch[0], childProcess: child, isHeadless: headless, error: null });
      }
    };
    
    child.stdout.on('data', (data) => {
      output += data.toString();
      checkForUrl();
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
      checkForUrl();
    });
    
    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, url: null, childProcess: null, isHeadless: headless, error: err.message });
      }
    });
    
    child.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, url: null, childProcess: null, isHeadless: headless, error: `Process exited with code ${code}` });
      }
    });
  });
};

/**
 * Process OAuth callback URL manually (for VPS/headless)
 * The callback URL looks like: http://localhost:54545/callback?code=xxx&state=yyy
 * We need to forward this to the waiting CLIProxyAPI process
 * @param {string} callbackUrl - The callback URL from the browser
 * @returns {Promise<Object>} { success, error }
 */
const processCallback = (callbackUrl) => {
  return new Promise((resolve) => {
    try {
      // Parse the callback URL
      const url = new URL(callbackUrl);
      const params = url.searchParams;
      
      // Extract query string to forward
      const queryString = url.search;
      
      // Make request to local callback endpoint
      const callbackPath = `/callback${queryString}`;
      
      const req = http.get(`http://127.0.0.1:${CALLBACK_PORT}${callbackPath}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200 || res.statusCode === 302) {
            resolve({ success: true, error: null });
          } else {
            resolve({ success: false, error: `Callback returned ${res.statusCode}: ${data}` });
          }
        });
      });
      
      req.on('error', (err) => {
        resolve({ success: false, error: `Callback error: ${err.message}` });
      });
      
      req.setTimeout(10000, () => {
        req.destroy();
        resolve({ success: false, error: 'Callback timeout' });
      });
    } catch (err) {
      resolve({ success: false, error: `Invalid URL: ${err.message}` });
    }
  });
};

module.exports = {
  CLIPROXY_VERSION,
  INSTALL_DIR,
  BINARY_PATH,
  AUTH_DIR,
  DEFAULT_PORT,
  CALLBACK_PORT,
  getDownloadUrl,
  isInstalled,
  isHeadless,
  install,
  isRunning,
  start,
  stop,
  ensureRunning,
  getLoginUrl,
  processCallback
};
