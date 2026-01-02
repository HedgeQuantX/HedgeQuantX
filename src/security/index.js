/**
 * @fileoverview Security module exports
 * @module security
 */

const {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  generateToken,
  maskSensitive,
  secureWipe,
  clearCache,
} = require('./encryption');

const {
  ValidationError,
  validateUsername,
  validatePassword,
  validateApiKey,
  validateAccountId,
  validateQuantity,
  validatePrice,
  validateSymbol,
  sanitizeString,
  validateObject,
} = require('./validation');

const {
  RateLimiter,
  getLimiter,
  withRateLimit,
  resetAll,
} = require('./rateLimit');

module.exports = {
  // Encryption
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  generateToken,
  maskSensitive,
  secureWipe,
  clearCache,

  // Validation
  ValidationError,
  validateUsername,
  validatePassword,
  validateApiKey,
  validateAccountId,
  validateQuantity,
  validatePrice,
  validateSymbol,
  sanitizeString,
  validateObject,

  // Rate Limiting
  RateLimiter,
  getLimiter,
  withRateLimit,
  resetAll,
};
