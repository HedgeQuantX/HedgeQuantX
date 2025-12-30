/**
 * HQX Logger - Centralized logging for debugging
 * 
 * Usage:
 *   HQX_DEBUG=1 hedgequantx   - Enable all debug logs
 *   HQX_LOG_FILE=1 hedgequantx - Also write to ~/.hedgequantx/debug.log
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Log levels
const LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4
};

// Colors for console output
const COLORS = {
  ERROR: '\x1b[31m',   // Red
  WARN: '\x1b[33m',    // Yellow
  INFO: '\x1b[36m',    // Cyan
  DEBUG: '\x1b[90m',   // Gray
  TRACE: '\x1b[90m',   // Gray
  RESET: '\x1b[0m'
};

class Logger {
  constructor() {
    this.enabled = process.env.HQX_DEBUG === '1';
    this.level = LEVELS.DEBUG;
    this.logFile = path.join(os.homedir(), '.hedgequantx', 'debug.log');
    
    // Always write to file when debug is enabled
    if (this.enabled) {
      const dir = path.dirname(this.logFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      // Clear log file on start
      fs.writeFileSync(this.logFile, `=== HQX Debug Log Started ${new Date().toISOString()} ===\n`);
      fs.appendFileSync(this.logFile, `Platform: ${process.platform}, Node: ${process.version}\n`);
      fs.appendFileSync(this.logFile, `CWD: ${process.cwd()}\n\n`);
    }
  }

  _format(level, module, message, data) {
    const timestamp = new Date().toISOString().substr(11, 12); // HH:MM:SS.mmm
    const dataStr = data !== undefined ? ' ' + JSON.stringify(data) : '';
    return `[${timestamp}] [${level}] [${module}]${dataStr ? ' ' + message + dataStr : ' ' + message}`;
  }

  _log(level, levelName, module, message, data) {
    if (!this.enabled || level > this.level) return;

    const formatted = this._format(levelName, module, message, data);
    const color = COLORS[levelName] || COLORS.RESET;
    
    // Always write to file first (survives crashes)
    try {
      fs.appendFileSync(this.logFile, formatted + '\n');
    } catch (e) {
      // Ignore file write errors
    }
    
    // Console output (stderr to not interfere with CLI UI)
    console.error(`${color}${formatted}${COLORS.RESET}`);
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

  // Create a scoped logger for a specific module
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

// Singleton instance
const logger = new Logger();

module.exports = { logger, LEVELS };
