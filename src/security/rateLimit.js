/**
 * @fileoverview Rate limiting utilities for API protection
 * @module security/rateLimit
 */

/**
 * Rate limiter class for controlling request frequency
 */
class RateLimiter {
  /**
   * Creates a new rate limiter
   * @param {Object} options - Rate limiter options
   * @param {number} [options.maxRequests=60] - Maximum requests per window
   * @param {number} [options.windowMs=60000] - Time window in milliseconds
   * @param {number} [options.minInterval=100] - Minimum interval between requests in ms
   */
  constructor(options = {}) {
    this.maxRequests = options.maxRequests || 60;
    this.windowMs = options.windowMs || 60000;
    this.minInterval = options.minInterval || 100;
    this.requests = [];
    this.lastRequest = 0;
  }

  /**
   * Cleans up old requests outside the current window
   * @private
   */
  _cleanup() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    this.requests = this.requests.filter(time => time > windowStart);
  }

  /**
   * Checks if a request is allowed
   * @returns {boolean} True if request is allowed
   */
  canRequest() {
    this._cleanup();
    const now = Date.now();
    
    // Check minimum interval
    if (now - this.lastRequest < this.minInterval) {
      return false;
    }
    
    // Check max requests in window
    return this.requests.length < this.maxRequests;
  }

  /**
   * Records a request
   */
  recordRequest() {
    const now = Date.now();
    this.requests.push(now);
    this.lastRequest = now;
  }

  /**
   * Gets remaining requests in current window
   * @returns {number} Remaining requests
   */
  getRemainingRequests() {
    this._cleanup();
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  /**
   * Gets time until rate limit resets
   * @returns {number} Milliseconds until reset
   */
  getResetTime() {
    if (this.requests.length === 0) return 0;
    const oldestRequest = Math.min(...this.requests);
    return Math.max(0, (oldestRequest + this.windowMs) - Date.now());
  }

  /**
   * Waits until a request is allowed
   * @returns {Promise<void>} Resolves when request is allowed
   */
  async waitForSlot() {
    while (!this.canRequest()) {
      const waitTime = Math.max(this.minInterval, this.getResetTime());
      await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 1000)));
    }
  }

  /**
   * Executes a function with rate limiting
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>} Result of the function
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
    this.requests = [];
    this.lastRequest = 0;
  }
}

/**
 * Creates rate limiters for different API endpoints
 */
const rateLimiters = {
  // General API calls - 60 per minute
  api: new RateLimiter({ maxRequests: 60, windowMs: 60000, minInterval: 100 }),
  
  // Login attempts - 5 per minute (stricter for security)
  login: new RateLimiter({ maxRequests: 5, windowMs: 60000, minInterval: 2000 }),
  
  // Order placement - 30 per minute
  orders: new RateLimiter({ maxRequests: 30, windowMs: 60000, minInterval: 200 }),
  
  // Data fetching - 120 per minute
  data: new RateLimiter({ maxRequests: 120, windowMs: 60000, minInterval: 50 })
};

/**
 * Gets a rate limiter by name
 * @param {string} name - Rate limiter name
 * @returns {RateLimiter} Rate limiter instance
 */
const getLimiter = (name) => {
  return rateLimiters[name] || rateLimiters.api;
};

/**
 * Wraps an async function with rate limiting
 * @param {Function} fn - Function to wrap
 * @param {string} [limiterName='api'] - Rate limiter to use
 * @returns {Function} Rate-limited function
 */
const withRateLimit = (fn, limiterName = 'api') => {
  const limiter = getLimiter(limiterName);
  return async (...args) => {
    return limiter.execute(() => fn(...args));
  };
};

module.exports = {
  RateLimiter,
  rateLimiters,
  getLimiter,
  withRateLimit
};
