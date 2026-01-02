/**
 * @fileoverview Encryption utilities for secure data storage
 * @module security/encryption
 */

const crypto = require('crypto');
const os = require('os');
const { SECURITY } = require('../config/settings');

const {
  ALGORITHM,
  IV_LENGTH,
  SALT_LENGTH,
  KEY_LENGTH,
  PBKDF2_ITERATIONS,
  TOKEN_VISIBLE_CHARS,
} = SECURITY;

/** @type {Buffer|null} Cached machine key */
let cachedMachineKey = null;

/**
 * Derives a unique machine key from hardware identifiers
 * @returns {Buffer} Machine-specific key (cached)
 * @private
 */
const getMachineKey = () => {
  if (cachedMachineKey) return cachedMachineKey;
  
  const components = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || 'cpu',
    os.homedir(),
    process.env.USER || process.env.USERNAME || 'user',
  ].join('|');
  
  cachedMachineKey = crypto.createHash('sha256').update(components).digest();
  return cachedMachineKey;
};

/**
 * Derives encryption key from password and salt using PBKDF2
 * @param {Buffer|string} password - Password to derive key from
 * @param {Buffer} salt - Salt for key derivation
 * @returns {Buffer} Derived key
 * @private
 */
const deriveKey = (password, salt) => {
  const pwd = Buffer.isBuffer(password) ? password : Buffer.from(password);
  return crypto.pbkdf2Sync(pwd, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');
};

/**
 * Encrypts data using AES-256-GCM
 * @param {string} plaintext - Data to encrypt
 * @param {Buffer|string} [password] - Optional password (uses machine key if not provided)
 * @returns {string} Encrypted data as hex string (salt:iv:authTag:ciphertext)
 */
const encrypt = (plaintext, password = null) => {
  if (!plaintext) return '';
  
  const secret = password ? Buffer.from(password) : getMachineKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(secret, salt);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  
  const authTag = cipher.getAuthTag();
  
  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
};

/**
 * Decrypts data encrypted with AES-256-GCM
 * @param {string} encryptedData - Encrypted data as hex string
 * @param {Buffer|string} [password] - Optional password (uses machine key if not provided)
 * @returns {string|null} Decrypted plaintext or null if decryption fails
 */
const decrypt = (encryptedData, password = null) => {
  if (!encryptedData) return null;
  
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 4) return null;
    
    const [saltHex, ivHex, authTagHex, ciphertext] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(ciphertext, 'hex');
    
    const secret = password ? Buffer.from(password) : getMachineKey();
    const key = deriveKey(secret, salt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
};

/**
 * Hashes a password using PBKDF2-SHA512
 * @param {string} password - Password to hash
 * @returns {string} Hashed password (salt:hash in hex)
 */
const hashPassword = (password) => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, 'sha512');
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
};

/**
 * Verifies a password against a hash using constant-time comparison
 * @param {string} password - Password to verify
 * @param {string} storedHash - Stored hash (salt:hash)
 * @returns {boolean} True if password matches
 */
const verifyPassword = (password, storedHash) => {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) return false;
    
    const salt = Buffer.from(saltHex, 'hex');
    const storedHashBuffer = Buffer.from(hashHex, 'hex');
    const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 64, 'sha512');
    
    return crypto.timingSafeEqual(hash, storedHashBuffer);
  } catch {
    return false;
  }
};

/**
 * Generates a secure random token
 * @param {number} [length=32] - Token length in bytes
 * @returns {string} Random token as hex string
 */
const generateToken = (length = 32) => crypto.randomBytes(length).toString('hex');

/**
 * Masks sensitive data for logging
 * @param {string} data - Data to mask
 * @param {number} [visibleChars] - Number of visible characters at start/end
 * @returns {string} Masked data
 */
const maskSensitive = (data, visibleChars = TOKEN_VISIBLE_CHARS) => {
  if (!data || typeof data !== 'string') return '****';
  if (data.length <= visibleChars * 2) return '****';
  
  return `${data.slice(0, visibleChars)}****${data.slice(-visibleChars)}`;
};

/**
 * Securely clears sensitive data from a buffer
 * @param {Buffer} buffer - Buffer to clear
 */
const secureWipe = (buffer) => {
  if (Buffer.isBuffer(buffer)) {
    crypto.randomFillSync(buffer);
    buffer.fill(0);
  }
};

/**
 * Clears cached machine key (call on logout for extra security)
 */
const clearCache = () => {
  if (cachedMachineKey) {
    secureWipe(cachedMachineKey);
    cachedMachineKey = null;
  }
};

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  generateToken,
  maskSensitive,
  secureWipe,
  clearCache,
};
