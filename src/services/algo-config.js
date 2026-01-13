/**
 * Algo Config Storage - Persist algo configuration between sessions
 * Saves to ~/.hqx/algo-config.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.hqx');
const CONFIG_FILE = path.join(CONFIG_DIR, 'algo-config.json');

/**
 * Ensure config directory exists
 */
const ensureConfigDir = () => {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
};

/**
 * Load saved config
 * @returns {Object|null} Saved config or null
 */
const loadConfig = () => {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    // Ignore errors, return null
  }
  return null;
};

/**
 * Save config
 * @param {Object} config - Config to save
 */
const saveConfig = (config) => {
  try {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (e) {
    // Ignore save errors
  }
};

/**
 * Get last config for one-account mode
 * @returns {Object|null}
 */
const getLastOneAccountConfig = () => {
  const config = loadConfig();
  return config?.oneAccount || null;
};

/**
 * Save one-account config
 * @param {Object} data - { accountId, accountName, propfirm, symbol, strategyId, contracts, dailyTarget, maxRisk, showName }
 */
const saveOneAccountConfig = (data) => {
  const config = loadConfig() || {};
  config.oneAccount = {
    ...data,
    savedAt: Date.now()
  };
  saveConfig(config);
};

/**
 * Get last config for copy-trading mode
 * @returns {Object|null}
 */
const getLastCopyTradingConfig = () => {
  const config = loadConfig();
  return config?.copyTrading || null;
};

/**
 * Save copy-trading config
 * @param {Object} data - { masterAccountId, followerAccountIds, symbol, strategyId, contracts, dailyTarget, maxRisk }
 */
const saveCopyTradingConfig = (data) => {
  const config = loadConfig() || {};
  config.copyTrading = {
    ...data,
    savedAt: Date.now()
  };
  saveConfig(config);
};

module.exports = {
  loadConfig,
  saveConfig,
  getLastOneAccountConfig,
  saveOneAccountConfig,
  getLastCopyTradingConfig,
  saveCopyTradingConfig,
};
