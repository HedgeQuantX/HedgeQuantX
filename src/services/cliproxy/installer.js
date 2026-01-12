/**
 * CLIProxyAPI Installer
 * 
 * Handles downloading and extracting CLIProxyAPI binary
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const { createGunzip } = require('zlib');
const tar = require('tar');

/**
 * Download file from URL with redirect support
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
    execSync(`powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`, {
      stdio: 'ignore'
    });
  } else {
    execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { stdio: 'ignore' });
  }
  
  return true;
};

module.exports = {
  downloadFile,
  extractTarGz,
  extractZip
};
