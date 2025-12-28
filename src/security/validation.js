/**
 * @fileoverview Input validation and sanitization utilities
 * @module security/validation
 */

/**
 * Validation error class
 */
class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Validates username format
 * @param {string} username - Username to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If invalid
 */
const validateUsername = (username) => {
  if (!username || typeof username !== 'string') {
    throw new ValidationError('Username is required', 'username');
  }
  
  const trimmed = username.trim();
  
  if (trimmed.length < 3) {
    throw new ValidationError('Username must be at least 3 characters', 'username');
  }
  
  if (trimmed.length > 50) {
    throw new ValidationError('Username must be less than 50 characters', 'username');
  }
  
  // Allow alphanumeric, dots, underscores, hyphens, and @ for emails
  if (!/^[a-zA-Z0-9._@-]+$/.test(trimmed)) {
    throw new ValidationError('Username contains invalid characters', 'username');
  }
  
  return true;
};

/**
 * Validates password strength
 * @param {string} password - Password to validate
 * @param {Object} [options] - Validation options
 * @param {number} [options.minLength=6] - Minimum length
 * @param {boolean} [options.requireSpecial=false] - Require special character
 * @returns {boolean} True if valid
 * @throws {ValidationError} If invalid
 */
const validatePassword = (password, options = {}) => {
  const { minLength = 6, requireSpecial = false } = options;
  
  if (!password || typeof password !== 'string') {
    throw new ValidationError('Password is required', 'password');
  }
  
  if (password.length < minLength) {
    throw new ValidationError(`Password must be at least ${minLength} characters`, 'password');
  }
  
  if (password.length > 128) {
    throw new ValidationError('Password must be less than 128 characters', 'password');
  }
  
  if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    throw new ValidationError('Password must contain a special character', 'password');
  }
  
  return true;
};

/**
 * Validates API key format
 * @param {string} apiKey - API key to validate
 * @returns {boolean} True if valid
 * @throws {ValidationError} If invalid
 */
const validateApiKey = (apiKey) => {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new ValidationError('API key is required', 'apiKey');
  }
  
  const trimmed = apiKey.trim();
  
  if (trimmed.length < 10) {
    throw new ValidationError('API key is too short', 'apiKey');
  }
  
  if (trimmed.length > 256) {
    throw new ValidationError('API key is too long', 'apiKey');
  }
  
  // Allow alphanumeric and common API key characters
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new ValidationError('API key contains invalid characters', 'apiKey');
  }
  
  return true;
};

/**
 * Validates account ID
 * @param {number|string} accountId - Account ID to validate
 * @returns {number} Validated account ID as integer
 * @throws {ValidationError} If invalid
 */
const validateAccountId = (accountId) => {
  const id = parseInt(accountId, 10);
  
  if (isNaN(id) || id <= 0) {
    throw new ValidationError('Invalid account ID', 'accountId');
  }
  
  if (id > Number.MAX_SAFE_INTEGER) {
    throw new ValidationError('Account ID is too large', 'accountId');
  }
  
  return id;
};

/**
 * Validates order quantity
 * @param {number|string} quantity - Quantity to validate
 * @param {Object} [options] - Validation options
 * @param {number} [options.min=1] - Minimum quantity
 * @param {number} [options.max=1000] - Maximum quantity
 * @returns {number} Validated quantity as integer
 * @throws {ValidationError} If invalid
 */
const validateQuantity = (quantity, options = {}) => {
  const { min = 1, max = 1000 } = options;
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
 * @throws {ValidationError} If invalid
 */
const validatePrice = (price) => {
  const p = parseFloat(price);
  
  if (isNaN(p)) {
    throw new ValidationError('Price must be a number', 'price');
  }
  
  if (p < 0) {
    throw new ValidationError('Price cannot be negative', 'price');
  }
  
  if (p > 1000000) {
    throw new ValidationError('Price is too large', 'price');
  }
  
  return p;
};

/**
 * Validates symbol format
 * @param {string} symbol - Symbol to validate
 * @returns {string} Validated symbol (uppercase, trimmed)
 * @throws {ValidationError} If invalid
 */
const validateSymbol = (symbol) => {
  if (!symbol || typeof symbol !== 'string') {
    throw new ValidationError('Symbol is required', 'symbol');
  }
  
  const trimmed = symbol.trim().toUpperCase();
  
  if (trimmed.length < 1 || trimmed.length > 20) {
    throw new ValidationError('Invalid symbol length', 'symbol');
  }
  
  if (!/^[A-Z0-9]+$/.test(trimmed)) {
    throw new ValidationError('Symbol contains invalid characters', 'symbol');
  }
  
  return trimmed;
};

/**
 * Sanitizes a string by removing potentially dangerous characters
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized string
 */
const sanitizeString = (input) => {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove HTML brackets
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .substring(0, 1000); // Limit length
};

/**
 * Validates and sanitizes all fields in an object
 * @param {Object} data - Data object to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} Validated data
 * @throws {ValidationError} If any field is invalid
 */
const validateObject = (data, schema) => {
  const result = {};
  
  for (const [field, validator] of Object.entries(schema)) {
    const value = data[field];
    
    if (typeof validator === 'function') {
      result[field] = validator(value);
    } else if (validator.required && (value === undefined || value === null)) {
      throw new ValidationError(`${field} is required`, field);
    } else if (value !== undefined && value !== null) {
      result[field] = validator.validate ? validator.validate(value) : value;
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
  validateObject
};
