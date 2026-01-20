/**
 * @fileoverview Session Logger - Persistent logs for algo trading sessions
 * @module services/session-logger
 * 
 * Creates a log file per session with all events:
 * - Strategy signals, trades, P&L
 * - Market data (ticks, bars)
 * - Zone/Swing detection
 * - Errors and warnings
 * 
 * Log files: ~/.hedgequantx/sessions/YYYY-MM-DD_HH-MM-SS_<strategy>.log
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { SECURITY } = require('../config/settings');

class SessionLogger {
  constructor() {
    this.sessionDir = path.join(os.homedir(), SECURITY.SESSION_DIR, 'sessions');
    this.logFile = null;
    this.sessionId = null;
    this.buffer = [];
    this.flushInterval = null;
    this.metadata = {};
  }

  /**
   * Start a new session log
   * @param {Object} params - Session parameters
   * @param {string} params.strategy - Strategy ID (e.g., 'hqx-2b')
   * @param {string} params.account - Account name
   * @param {string} params.symbol - Trading symbol
   * @param {number} params.contracts - Number of contracts
   * @param {number} params.target - Daily target
   * @param {number} params.risk - Max risk
   */
  start({ strategy, account, symbol, contracts, target, risk }) {
    // Create session directory if needed
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true, mode: SECURITY.DIR_PERMISSIONS });
    }

    // Generate session ID and file name
    const now = new Date();
    this.sessionId = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `${this.sessionId}_${strategy}.log`;
    this.logFile = path.join(this.sessionDir, fileName);

    // Store metadata
    this.metadata = {
      strategy,
      account,
      symbol,
      contracts,
      target,
      risk,
      startTime: now.toISOString(),
      startTimestamp: Date.now()
    };

    // Write header
    const header = [
      '================================================================================',
      `HQX SESSION LOG - ${strategy.toUpperCase()}`,
      '================================================================================',
      `Session ID:  ${this.sessionId}`,
      `Started:     ${now.toISOString()}`,
      `Strategy:    ${strategy}`,
      `Account:     ${account}`,
      `Symbol:      ${symbol}`,
      `Contracts:   ${contracts}`,
      `Target:      $${target}`,
      `Risk:        $${risk}`,
      '================================================================================',
      '',
    ].join('\n');

    fs.writeFileSync(this.logFile, header, { mode: SECURITY.FILE_PERMISSIONS });

    // Start flush interval (every 2 seconds)
    this.flushInterval = setInterval(() => this._flush(), 2000);

    this._write('SYSTEM', 'Session started');
    return this.logFile;
  }

  /**
   * Log an event
   * @param {string} type - Event type (SYSTEM, SIGNAL, TRADE, MARKET, ZONE, SWING, ERROR, etc.)
   * @param {string} message - Log message
   * @param {Object} [data] - Optional data object
   */
  log(type, message, data = null) {
    if (!this.logFile) return;

    const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    const elapsed = this._getElapsed();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    const line = `[${timestamp}] [${elapsed}] [${type.padEnd(8)}] ${message}${dataStr}`;
    
    this.buffer.push(line);
  }

  /**
   * Log market tick
   */
  tick(price, size, bid, ask) {
    this.log('TICK', `Price: ${price} | Size: ${size} | Bid: ${bid} | Ask: ${ask}`);
  }

  /**
   * Log bar completion
   */
  bar(bar) {
    this.log('BAR', `O:${bar.open} H:${bar.high} L:${bar.low} C:${bar.close} V:${bar.volume}`);
  }

  /**
   * Log swing detection
   */
  swing(type, price, strength) {
    this.log('SWING', `${type} @ ${price} | Strength: ${strength}`);
  }

  /**
   * Log zone detection
   */
  zone(type, high, low, touches) {
    this.log('ZONE', `${type} Zone @ ${high}-${low} | Touches: ${touches}`);
  }

  /**
   * Log signal generation
   */
  signal(direction, price, confidence, reason) {
    this.log('SIGNAL', `${direction} @ ${price} | Confidence: ${(confidence * 100).toFixed(1)}% | ${reason}`);
  }

  /**
   * Log trade execution
   */
  trade(action, direction, price, qty, orderId) {
    this.log('TRADE', `${action} ${direction} x${qty} @ ${price} | OrderID: ${orderId}`);
  }

  /**
   * Log P&L update
   */
  pnl(realized, unrealized, position) {
    this.log('PNL', `Realized: $${realized.toFixed(2)} | Unrealized: $${unrealized.toFixed(2)} | Position: ${position}`);
  }

  /**
   * Log strategy state
   */
  state(zonesCount, swingsCount, barsCount, bias) {
    this.log('STATE', `Zones: ${zonesCount} | Swings: ${swingsCount} | Bars: ${barsCount} | Bias: ${bias}`);
  }

  /**
   * Log error
   */
  error(message, error) {
    this.log('ERROR', message, { error: error?.message || error });
  }

  /**
   * Log warning
   */
  warn(message) {
    this.log('WARN', message);
  }

  /**
   * Log debug info
   */
  debug(message, data) {
    this.log('DEBUG', message, data);
  }

  /**
   * End session and write summary
   */
  end(stats, stopReason = 'MANUAL') {
    if (!this.logFile) return null;

    // Flush remaining buffer
    this._flush();

    const endTime = new Date();
    const duration = this._formatDuration(Date.now() - this.metadata.startTimestamp);

    const summary = [
      '',
      '================================================================================',
      'SESSION SUMMARY',
      '================================================================================',
      `Ended:       ${endTime.toISOString()}`,
      `Duration:    ${duration}`,
      `Stop Reason: ${stopReason}`,
      '--------------------------------------------------------------------------------',
      `Trades:      ${stats.trades || 0}`,
      `Wins:        ${stats.wins || 0}`,
      `Losses:      ${stats.losses || 0}`,
      `Win Rate:    ${stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(1) : 0}%`,
      `P&L:         $${(stats.pnl || 0).toFixed(2)}`,
      `Target:      $${this.metadata.target}`,
      '================================================================================',
      '',
    ].join('\n');

    fs.appendFileSync(this.logFile, summary);

    // Stop flush interval
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    const logPath = this.logFile;
    this.logFile = null;
    this.sessionId = null;
    this.buffer = [];
    this.metadata = {};

    return logPath;
  }

  /**
   * Get elapsed time string
   * @private
   */
  _getElapsed() {
    if (!this.metadata.startTimestamp) return '00:00:00';
    const elapsed = Date.now() - this.metadata.startTimestamp;
    return this._formatDuration(elapsed);
  }

  /**
   * Format duration in HH:MM:SS
   * @private
   */
  _formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  /**
   * Write log entry immediately
   * @private
   */
  _write(type, message, data = null) {
    this.log(type, message, data);
    this._flush();
  }

  /**
   * Flush buffer to file
   * @private
   */
  _flush() {
    if (!this.logFile || this.buffer.length === 0) return;

    try {
      const content = this.buffer.join('\n') + '\n';
      fs.appendFileSync(this.logFile, content);
      this.buffer = [];
    } catch (err) {
      // Ignore write errors
    }
  }

  /**
   * Get path to sessions directory
   */
  getSessionsDir() {
    return this.sessionDir;
  }

  /**
   * List recent session logs
   * @param {number} limit - Max number of sessions to return
   */
  listSessions(limit = 10) {
    if (!fs.existsSync(this.sessionDir)) return [];

    try {
      const files = fs.readdirSync(this.sessionDir)
        .filter(f => f.endsWith('.log'))
        .sort()
        .reverse()
        .slice(0, limit);

      return files.map(f => ({
        file: f,
        path: path.join(this.sessionDir, f),
        date: f.slice(0, 10),
        time: f.slice(11, 19).replace(/-/g, ':'),
        strategy: f.slice(20, -4)
      }));
    } catch {
      return [];
    }
  }
}

// Singleton instance
const sessionLogger = new SessionLogger();

module.exports = { sessionLogger, SessionLogger };
