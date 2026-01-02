/**
 * @fileoverview Input validation and sanitization utilities
 * @module security/validation
 */

const { VALIDATION, SECURITY } = require('../config/settings');

/**
 * Validation error class with field information
 */
class ValidationError extends Error {
  /**
   * @param {string} message - Error message
   * @param {string} [field] - Field that failed validation
   */
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validates a string against constraints
 * @param {*} value - Value to validate
 * @param {Object} opts - Validation options
 * @returns {string} Validated and trimmed string
 * @throws {ValidationError}
 * @private
 */
const validateString = (value, { field, min, max, pattern, patternMsg }) => {
  if (!value || typeof value !== 'string') {
    throw new ValidationError(`${field} is required`, field);
  }
  
  const trimmed = value.trim();
  
  if (trimmed.length < min) {
    throw new ValidationError(`${field} must be at least ${min} characters`, field);
  }
  
  if (trimmed.length > max) {
    throw new ValidationError(`${field} must be less than ${max} characters`, field);
  }
  
  if (pattern && !pattern.test(trimmed)) {
    throw new ValidationError(patternMsg || `${field} contains invalid characters`, field);
  }
  
  return trimmed;
};

/**
 * Validates username format
 * @param {string} username - Username to validate
 * @returns {string} Validated username
 * @throws {ValidationError}
 */
const validateUsername = (username) => validateString(username, {
  field: 'Username',
  min: VALIDATION.USERNAME_MIN,
  max: VALIDATION.USERNAME_MAX,
  pattern: VALIDATION.USERNAME_PATTERN,
  patternMsg: 'Username contains invalid characters (allowed: letters, numbers, . _ @ -)',
});

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @param {Object} [options] - Override default requirements
 * @returns {boolean} True if valid
 * @throws {ValidationError}
 */
const validatePassword = (password, options = {}) => {
  const {
    minLength = SECURITY.PASSWORD_MIN_LENGTH,
    requireUppercase = SECURITY.PASSWORD_REQUIRE_UPPERCASE,
    requireNumber = SECURITY.PASSWORD_REQUIRE_NUMBER,
    requireSpecial = SECURITY.PASSWORD_REQUIRE_SPECIAL,
  } = options;
  
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password is required', 'password');
  }
  
  if (password.length < minLength) {
    throw new ValidationError(`Password must be at least ${minLength} characters`, 'password');
  }
  
  if (password.length > SECURITY.PASSWORD_MAX_LENGTH) {
    throw new ValidationError(`Password must be less than ${SECURITY.PASSWORD_MAX_LENGTH} characters`, 'password');
  }
  
  if (requireUppercase && !/[A-Z]/.test(password)) {
    throw new ValidationError('Password must contain at least one uppercase letter', 'password');
  }
  
  if (requireNumber && !/\d/.test(password)) {
    throw new ValidationError('Password must contain at least one number', 'password');
  }
  
  if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    throw new ValidationError('Password must contain a special character', 'password');
  }
  
  return true;
};

/**
 * Validates API key format
 * @param {string} apiKey - API key to validate
 * @returns {string} Validated API key
 * @throws {ValidationError}
 */
const validateApiKey = (apiKey) => validateString(apiKey, {
  field: 'API key',
  min: VALIDATION.API_KEY_MIN,
  max: VALIDATION.API_KEY_MAX,
  pattern: VALIDATION.API_KEY_PATTERN,
});

/**
 * Validates account ID
 * @param {number|string} accountId - Account ID to validate
 * @returns {number} Validated account ID as integer
 * @throws {ValidationError}
 */
const validateAccountId = (accountId) => {
  const id = parseInt(accountId, 10);
  
  if (isNaN(id) || id <= 0) {
    throw new ValidationError('Invalid account ID', 'accountId');
  }
  
  if (id > VALIDATION.ACCOUNT_ID_MAX) {
    throw new ValidationError('Account ID is too large', 'accountId');
  }
  
  return id;
};

/**
 * Validates order quantity
 * @param {number|string} quantity - Quantity to validate
 * @param {Object} [options] - Validation options
 * @returns {number} Validated quantity as integer
 * @throws {ValidationError}
 */
const validateQuantity = (quantity, options = {}) => {
  const { min = VALIDATION.QUANTITY_MIN, max = VALIDATION.QUANTITY_MAX } = options;
  const qty = parseInt(quantity, 10);
  
  if (isNaN(qty)) {
    throw new ValidationError('Quantity must be a number', 'quantity');
  }
  
  if (qty < min) {
    throw new ValidationError(`Quantity must be at least ${min}`, 'quantity');
  }
  
  if (qty > max) {
    throw new ValidationError(`Quantity must be at most ${max}`, 'quantity');
  }
  
  return qty;
};

/**
 * Validates price
 * @param {number|string} price - Price to validate
 * @returns {number} Validated price as float
 * @throws {ValidationError}
 */
const validatePrice = (price) => {
  const p = parseFloat(price);
  
  if (isNaN(p)) {
    throw new ValidationError('Price must be a number', 'price');
  }
  
  if (p < VALIDATION.PRICE_MIN) {
    throw new ValidationError('Price cannot be negative', 'price');
  }
  
  if (p > VALIDATION.PRICE_MAX) {
    throw new ValidationError('Price is too large', 'price');
  }
  
  return p;
};

/**
 * Validates symbol format
 * @param {string} symbol - Symbol to validate
 * @returns {string} Validated symbol (uppercase, trimmed)
 * @throws {ValidationError}
 */
const validateSymbol = (symbol) => {
  const validated = validateString(symbol, {
    field: 'Symbol',
    min: VALIDATION.SYMBOL_MIN,
    max: VALIDATION.SYMBOL_MAX,
  });
  
  const upper = validated.toUpperCase();
  
  if (!VALIDATION.SYMBOL_PATTERN.test(upper)) {
    throw new ValidationError('Symbol contains invalid characters', 'symbol');
  }
  
  return upper;
};

/**
 * Sanitizes a string by removing dangerous characters
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeString = (input) => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '')                    // Remove HTML brackets
    .replace(/[\x00-\x1F\x7F]/g, '')          // Remove control characters
    .slice(0, VALIDATION.STRING_MAX_LENGTH);  // Limit length
};

/**
 * Validates and sanitizes all fields in an object
 * @param {Object} data - Data object to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} Validated data
 * @throws {ValidationError}
 */
const validateObject = (data, schema) => {
  const result = {};
  
  for (const [field, config] of Object.entries(schema)) {
    const value = data[field];
    
    if (typeof config === 'function') {
      result[field] = config(value);
    } else if (config.required && (value === undefined || value === null)) {
      throw new ValidationError(`${field} is required`, field);
    } else if (value !== undefined && value !== null && config.validate) {
      result[field] = config.validate(value);
    } else if (value !== undefined && value !== null) {
      result[field] = value;
    }
  }
  
  return result;
};

module.exports = {
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
};
