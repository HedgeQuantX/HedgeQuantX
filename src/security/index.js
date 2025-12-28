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
  maskSensitive
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
  validateObject
} = require('./validation');

const {
  RateLimiter,
  rateLimiters,
  getLimiter,
  withRateLimit
} = require('./rateLimit');

module.exports = {
  // Encryption
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  generateToken,
  maskSensitive,
  
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
  rateLimiters,
  getLimiter,
  withRateLimit
};
