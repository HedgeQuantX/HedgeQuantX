/**
 * Session Manager
 *
 * Manages RithmicService instances per authenticated user session.
 * Each web user gets their own RithmicService instance.
 *
 * - Map<sessionId, { service, accounts, propfirm, username, createdAt, lastActivity }>
 * - Cleans up inactive sessions after 30 minutes
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes of inactivity
const CLEANUP_INTERVAL_MS = 60 * 1000;  // Check every 60 seconds

class SessionManager {
  constructor() {
    /** @type {Map<string, Object>} */
    this.sessions = new Map();

    // Periodic cleanup
    this._cleanupInterval = setInterval(() => this._cleanup(), CLEANUP_INTERVAL_MS);
    // Allow process to exit even if interval is active
    if (this._cleanupInterval.unref) this._cleanupInterval.unref();
  }

  /**
   * Create a new session
   * @param {Object} service - RithmicService instance
   * @param {Object} opts - { propfirm, username, accounts }
   * @returns {string} sessionId
   */
  create(service, { propfirm, username, accounts }) {
    const sessionId = uuidv4();
    const now = Date.now();

    this.sessions.set(sessionId, {
      service,
      propfirm,
      username,
      accounts: accounts || [],
      createdAt: now,
      lastActivity: now,
      algoRunner: null, // set later if algo started
    });

    console.log(`[Session] Created ${sessionId.slice(0, 8)} (${propfirm}/${username}) | active: ${this.sessions.size}`);
    return sessionId;
  }

  /**
   * Get session by ID
   * @param {string} sessionId
   * @returns {Object|null}
   */
  get(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Destroy a session and disconnect its RithmicService
   * @param {string} sessionId
   */
  async destroy(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Stop algo if running
    if (session.algoRunner) {
      try { await session.algoRunner.stop(); } catch (_) {}
    }

    // Disconnect Rithmic
    try {
      await session.service.disconnect();
    } catch (err) {
      console.error(`[Session] Disconnect error for ${sessionId.slice(0, 8)}:`, err.message);
    }

    this.sessions.delete(sessionId);
    console.log(`[Session] Destroyed ${sessionId.slice(0, 8)} | active: ${this.sessions.size}`);
  }

  /**
   * Destroy all sessions (for graceful shutdown)
   */
  async destroyAll() {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      await this.destroy(id);
    }
    clearInterval(this._cleanupInterval);
  }

  /**
   * Get count of active sessions
   */
  getActiveCount() {
    return this.sessions.size;
  }

  /**
   * Internal: clean up stale sessions
   */
  async _cleanup() {
    const now = Date.now();
    const expired = [];
    for (const [id, session] of this.sessions) {
      if (now - session.lastActivity > SESSION_TTL_MS) {
        expired.push(id);
      }
    }
    for (const id of expired) {
      console.log(`[Session] Expiring inactive session ${id.slice(0, 8)}`);
      await this.destroy(id);
    }
  }
}

// Singleton
const sessionManager = new SessionManager();

module.exports = { sessionManager };
