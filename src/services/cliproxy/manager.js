/**
 * CLIProxyAPI Manager
 * 
 * Downloads, installs and manages CLIProxyAPI binary for OAuth connections
 * to paid AI plans (Claude Pro, ChatGPT Plus, Gemini, etc.)
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { createGunzip } = require('zlib');
const tar = require('tar');

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
 * Download file from URL
 * @param {string} url - URL to download
 * @param {string} destPath - Destination path
 * @param {Function} onProgress - Progress callback (percent)
 * @returns {Promise<boolean>}
 */
const downloadFile = (url, destPath, onProgress = null) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    const request = (url.startsWith('https') ? https : http).get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath, onProgress)
          .then(resolve)
          .catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (onProgress && totalSize) {
          onProgress(Math.round((downloadedSize / totalSize) * 100));
        }
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        resolve(true);
      });
    });
    
    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
    
    request.setTimeout(120000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
};

/**
 * Extract tar.gz file
 * @param {string} archivePath - Path to archive
 * @param {string} destDir - Destination directory
 * @returns {Promise<boolean>}
 */
const extractTarGz = (archivePath, destDir) => {
  return new Promise((resolve, reject) => {
    fs.createReadStream(archivePath)
      .pipe(createGunzip())
      .pipe(tar.extract({ cwd: destDir }))
      .on('finish', () => resolve(true))
      .on('error', reject);
  });
};

/**
 * Extract zip file (Windows)
 * @param {string} archivePath - Path to archive
 * @param {string} destDir - Destination directory
 * @returns {Promise<boolean>}
 */
const extractZip = async (archivePath, destDir) => {
  const { execSync } = require('child_process');
  
  if (process.platform === 'win32') {
    // Use PowerShell on Windows
    execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, {
      stdio: 'ignore'
    });
  } else {
    // Use unzip on Unix
    execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { stdio: 'ignore' });
  }
  
  return true;
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
  
  // Also check by trying to connect
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${DEFAULT_PORT}/v1/models`, (res) => {
      resolve({ running: res.statusCode === 200, pid: null });
    });
    req.on('error', () => resolve({ running: false, pid: null }));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve({ running: false, pid: null });
    });
  });
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
    const args = [
      '--port', String(DEFAULT_PORT),
      '--auth-dir', AUTH_DIR
    ];
    
    const child = spawn(BINARY_PATH, args, {
      detached: true,
      stdio: 'ignore',
      cwd: INSTALL_DIR
    });
    
    child.unref();
    
    // Save PID
    fs.writeFileSync(PID_FILE, String(child.pid));
    
    // Wait for startup
    await new Promise(r => setTimeout(r, 2000));
    
    const runStatus = await isRunning();
    if (runStatus.running) {
      return { success: true, error: null, pid: child.pid };
    } else {
      return { success: false, error: 'Failed to start CLIProxyAPI', pid: null };
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
 * @returns {Promise<Object>} { success, url, error }
 */
const getLoginUrl = async (provider) => {
  const providerFlags = {
    anthropic: '--claude-login',
    openai: '--codex-login',
    google: '--gemini-login',
    qwen: '--qwen-login'
  };
  
  const flag = providerFlags[provider];
  if (!flag) {
    return { success: false, url: null, error: 'Provider not supported for OAuth' };
  }
  
  // For headless/VPS, use --no-browser flag
  return new Promise((resolve) => {
    const args = [flag, '--no-browser'];
    const child = spawn(BINARY_PATH, args, {
      cwd: INSTALL_DIR,
      env: { ...process.env, AUTH_DIR: AUTH_DIR }
    });
    
    let output = '';
    
    child.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      output += data.toString();
    });
    
    // Look for URL in output
    setTimeout(() => {
      const urlMatch = output.match(/https?:\/\/[^\s]+/);
      if (urlMatch) {
        resolve({ success: true, url: urlMatch[0], error: null });
      } else {
        resolve({ success: false, url: null, error: 'Could not get login URL' });
      }
    }, 3000);
  });
};

module.exports = {
  CLIPROXY_VERSION,
  INSTALL_DIR,
  BINARY_PATH,
  AUTH_DIR,
  DEFAULT_PORT,
  getDownloadUrl,
  isInstalled,
  install,
  isRunning,
  start,
  stop,
  ensureRunning,
  getLoginUrl
};
