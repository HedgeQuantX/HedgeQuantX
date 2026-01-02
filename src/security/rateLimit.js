/**
 * @fileoverview Rate limiting utilities for API protection
 * @module security/rateLimit
 */

const { RATE_LIMITS } = require('../config/settings');

/**
 * High-performance rate limiter using sliding window
 */
class RateLimiter {
  /**
   * @param {Object} options - Rate limiter options
   * @param {number} [options.maxRequests=60] - Maximum requests per window
   * @param {number} [options.windowMs=60000] - Time window in milliseconds
   * @param {number} [options.minInterval=100] - Minimum interval between requests
   */
  constructor({ maxRequests = 60, windowMs = 60000, minInterval = 100 } = {}) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.minInterval = minInterval;
    this.timestamps = [];
    this.lastRequest = 0;
  }

  /**
   * Removes expired timestamps from the window
   * @private
   */
  _prune() {
    const cutoff = Date.now() - this.windowMs;
    // Binary search would be overkill for typical request counts
    while (this.timestamps.length && this.timestamps[0] <= cutoff) {
      this.timestamps.shift();
    }
  }

  /**
   * Checks if a request is allowed without recording it
   * @returns {boolean}
   */
  canRequest() {
    this._prune();
    const now = Date.now();
    
    if (now - this.lastRequest < this.minInterval) {
      return false;
    }
    
    return this.timestamps.length < this.maxRequests;
  }

  /**
   * Records a request timestamp
   */
  recordRequest() {
    const now = Date.now();
    this.timestamps.push(now);
    this.lastRequest = now;
  }

  /**
   * Gets remaining requests in current window
   * @returns {number}
   */
  get remaining() {
    this._prune();
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }

  /**
   * Gets milliseconds until next slot is available
   * @returns {number}
   */
  get resetIn() {
    if (!this.timestamps.length) return 0;
    this._prune();
    if (this.timestamps.length < this.maxRequests) return 0;
    return Math.max(0, this.timestamps[0] + this.windowMs - Date.now());
  }

  /**
   * Waits until a request slot is available
   * @returns {Promise<void>}
   */
  async waitForSlot() {
    while (!this.canRequest()) {
      const waitTime = Math.max(
        this.minInterval - (Date.now() - this.lastRequest),
        Math.min(this.resetIn, 1000)
      );
      await new Promise(r => setTimeout(r, Math.max(1, waitTime)));
    }
  }

  /**
   * Executes a function with rate limiting
   * @template T
   * @param {() => Promise<T>} fn - Function to execute
   * @returns {Promise<T>}
   */
  async execute(fn) {
    await this.waitForSlot();
    this.recordRequest();
    return fn();
  }

  /**
   * Resets the rate limiter
   */
  reset() {
    this.timestamps = [];
    this.lastRequest = 0;
  }
}

/** @type {Map<string, RateLimiter>} */
const limiters = new Map([
  ['api', new RateLimiter(RATE_LIMITS.API)],
  ['login', new RateLimiter(RATE_LIMITS.LOGIN)],
  ['orders', new RateLimiter(RATE_LIMITS.ORDERS)],
  ['data', new RateLimiter(RATE_LIMITS.DATA)],
]);

/**
 * Gets a rate limiter by name
 * @param {string} name - Rate limiter name
 * @returns {RateLimiter}
 */
const getLimiter = (name) => limiters.get(name) || limiters.get('api');

/**
 * Wraps an async function with rate limiting
 * @template T
 * @param {(...args: any[]) => Promise<T>} fn - Function to wrap
 * @param {string} [limiterName='api'] - Rate limiter to use
 * @returns {(...args: any[]) => Promise<T>}
 */
const withRateLimit = (fn, limiterName = 'api') => {
  const limiter = getLimiter(limiterName);
  return (...args) => limiter.execute(() => fn(...args));
};

/**
 * Resets all rate limiters
 */
const resetAll = () => {
  for (const limiter of limiters.values()) {
    limiter.reset();
  }
};

module.exports = {
  RateLimiter,
  getLimiter,
  withRateLimit,
  resetAll,
};
