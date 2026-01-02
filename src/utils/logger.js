/**
 * @fileoverview HQX Logger - Centralized logging for debugging
 * @module utils/logger
 * 
 * Usage:
 *   HQX_DEBUG=1 hedgequantx   - Enable all debug logs
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { SECURITY, DEBUG } = require('../config/settings');

/** Log levels */
const LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
};

/** ANSI colors */
const COLORS = {
  ERROR: '\x1b[31m',
  WARN: '\x1b[33m',
  INFO: '\x1b[36m',
  DEBUG: '\x1b[90m',
  TRACE: '\x1b[90m',
  RESET: '\x1b[0m',
};

/**
 * Logger class with file and console output
 */
class Logger {
  constructor() {
    this.consoleEnabled = DEBUG.enabled;
    this.level = LEVELS.DEBUG;
    this.logDir = path.join(os.homedir(), SECURITY.SESSION_DIR);
    this.logFile = path.join(this.logDir, DEBUG.LOG_FILE);
    this._initLogFile();
  }

  /**
   * Initialize log file
   * @private
   */
  _initLogFile() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true, mode: SECURITY.DIR_PERMISSIONS });
      }
      
      const header = [
        `=== HQX Log Started ${new Date().toISOString()} ===`,
        `Platform: ${process.platform}, Node: ${process.version}`,
        `CWD: ${process.cwd()}`,
        '',
      ].join('\n');
      
      fs.writeFileSync(this.logFile, header, { mode: SECURITY.FILE_PERMISSIONS });
    } catch {
      // Ignore init errors - logging is optional
    }
  }

  /**
   * Format log message
   * @private
   */
  _format(level, module, message, data) {
    const timestamp = new Date().toISOString().slice(11, 23);
    const dataStr = data !== undefined ? ` ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level}] [${module}] ${message}${dataStr}`;
  }

  /**
   * Write log entry
   * @private
   */
  _log(level, levelName, module, message, data) {
    if (level > this.level) return;

    const formatted = this._format(levelName, module, message, data);

    // Write to file (survives crashes)
    try {
      fs.appendFileSync(this.logFile, formatted + '\n');
    } catch {
      // Ignore file errors
    }

    // Console output only if enabled
    if (this.consoleEnabled) {
      const color = COLORS[levelName] || COLORS.RESET;
      console.error(`${color}${formatted}${COLORS.RESET}`);
    }
  }

  error(module, message, data) {
    this._log(LEVELS.ERROR, 'ERROR', module, message, data);
  }

  warn(module, message, data) {
    this._log(LEVELS.WARN, 'WARN', module, message, data);
  }

  info(module, message, data) {
    this._log(LEVELS.INFO, 'INFO', module, message, data);
  }

  debug(module, message, data) {
    this._log(LEVELS.DEBUG, 'DEBUG', module, message, data);
  }

  trace(module, message, data) {
    this._log(LEVELS.TRACE, 'TRACE', module, message, data);
  }

  /**
   * Create a scoped logger for a specific module
   * @param {string} moduleName - Module name
   * @returns {Object} Scoped logger methods
   */
  scope(moduleName) {
    return {
      error: (msg, data) => this.error(moduleName, msg, data),
      warn: (msg, data) => this.warn(moduleName, msg, data),
      info: (msg, data) => this.info(moduleName, msg, data),
      debug: (msg, data) => this.debug(moduleName, msg, data),
      trace: (msg, data) => this.trace(moduleName, msg, data),
    };
  }
}

/** Singleton instance */
const logger = new Logger();

module.exports = { logger, LEVELS };
