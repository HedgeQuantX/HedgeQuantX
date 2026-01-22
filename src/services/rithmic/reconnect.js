/**
 * Rithmic Reconnection Module
 * 
 * Rate-limited reconnection logic to avoid API quota exhaustion.
 * Rithmic limit: 2000 GetAccounts calls between system reboots.
 * 
 * Rate limiting:
 * - Minimum 1 hour between reconnection attempts
 * - Maximum 10 reconnection attempts per 24 hours
 */

'use strict';

const { logger } = require('../../utils/logger');
const log = logger.scope('Rithmic:Reconnect');

// Rate limiting constants
const RECONNECT_MIN_INTERVAL = 3600000;  // 1 hour minimum between attempts
const RECONNECT_MAX_PER_DAY = 10;        // Max 10 reconnects per 24h

/**
 * Check if reconnection is allowed (rate limiting)
 * @param {Object} state - { lastAttempt, count, resetTime }
 * @returns {{ allowed: boolean, waitMinutes?: number, reason?: string }}
 */
function canReconnect(state) {
  const now = Date.now();

  // Reset daily counter every 24h
  if (now - state.resetTime > 86400000) {
    state.count = 0;
    state.resetTime = now;
  }

  // Check minimum interval
  const timeSinceLastAttempt = now - state.lastAttempt;
  if (state.lastAttempt > 0 && timeSinceLastAttempt < RECONNECT_MIN_INTERVAL) {
    const waitMinutes = Math.ceil((RECONNECT_MIN_INTERVAL - timeSinceLastAttempt) / 60000);
    return { allowed: false, waitMinutes, reason: 'rate_limited' };
  }

  // Check daily limit
  if (state.count >= RECONNECT_MAX_PER_DAY) {
    return { allowed: false, reason: 'daily_limit', waitMinutes: 0 };
  }

  return { allowed: true };
}

/**
 * Record a reconnection attempt
 * @param {Object} state - { lastAttempt, count, resetTime }
 */
function recordAttempt(state) {
  state.lastAttempt = Date.now();
  state.count++;
}

/**
 * Create initial reconnect state
 * @returns {Object} - { lastAttempt, count, resetTime }
 */
function createReconnectState() {
  return {
    lastAttempt: 0,
    count: 0,
    resetTime: Date.now()
  };
}

/**
 * Auto-reconnect handler for RithmicService
 * @param {RithmicService} service - The service instance
 */
async function handleAutoReconnect(service) {
  if (!service.credentials) {
    log.warn('Cannot auto-reconnect: no credentials');
    return;
  }

  // Initialize reconnect state if needed
  if (!service._reconnectState) {
    service._reconnectState = createReconnectState();
  }

  // Check rate limits
  const check = canReconnect(service._reconnectState);
  if (!check.allowed) {
    if (check.reason === 'rate_limited') {
      log.warn('Reconnect rate limited', { waitMinutes: check.waitMinutes });
      service.emit('reconnectRateLimited', { waitMinutes: check.waitMinutes });
    } else {
      log.error('Daily reconnect limit reached', { limit: RECONNECT_MAX_PER_DAY });
      service.emit('reconnectBlocked', { reason: 'Daily limit reached' });
    }
    return;
  }

  // Record this attempt
  recordAttempt(service._reconnectState);

  const { username, password } = service.credentials;
  const savedAccounts = [...service.accounts]; // Save accounts before reconnect

  log.info('Auto-reconnecting...', { 
    attempt: service._reconnectState.count, 
    maxPerDay: RECONNECT_MAX_PER_DAY 
  });
  service.emit('reconnecting');

  try {
    // Login with cached accounts (NO fetchAccounts API call)
    const result = await service.login(username, password, {
      skipFetchAccounts: true,
      cachedAccounts: savedAccounts
    });

    if (result.success) {
      log.info('Auto-reconnect successful');
      service.emit('reconnected', { accounts: result.accounts });
    } else {
      log.warn('Auto-reconnect failed', { error: result.error });
      service.emit('reconnectFailed', { error: result.error });
    }
  } catch (err) {
    log.error('Auto-reconnect error', { error: err.message });
    service.emit('reconnectFailed', { error: err.message });
  }
}

module.exports = {
  RECONNECT_MIN_INTERVAL,
  RECONNECT_MAX_PER_DAY,
  canReconnect,
  recordAttempt,
  createReconnectState,
  handleAutoReconnect
};
