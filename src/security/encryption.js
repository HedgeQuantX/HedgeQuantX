/**
 * @fileoverview Encryption utilities for secure data storage
 * @module security/encryption
 */

const crypto = require('crypto');
const os = require('os');

// Algorithm configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;
const ITERATIONS = 100000;

/**
 * Derives a unique machine key from hardware identifiers
 * @returns {string} Machine-specific key
 * @private
 */
const getMachineKey = () => {
  const components = [
    os.hostname(),
    os.platform(),
    os.arch(),
    os.cpus()[0]?.model || 'unknown',
    os.homedir(),
    process.env.USER || process.env.USERNAME || 'user'
  ];
  return crypto.createHash('sha256').update(components.join('|')).digest('hex');
};

/**
 * Derives encryption key from password and salt using PBKDF2
 * @param {string} password - Password to derive key from
 * @param {Buffer} salt - Salt for key derivation
 * @returns {Buffer} Derived key
 * @private
 */
const deriveKey = (password, salt) => {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha512');
};

/**
 * Encrypts data using AES-256-GCM
 * @param {string} plaintext - Data to encrypt
 * @param {string} [password] - Optional password (uses machine key if not provided)
 * @returns {string} Encrypted data as hex string (salt:iv:authTag:ciphertext)
 */
const encrypt = (plaintext, password = null) => {
  if (!plaintext) return '';
  
  const secret = password || getMachineKey();
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = deriveKey(secret, salt);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: salt:iv:authTag:ciphertext (all in hex)
  return [
    salt.toString('hex'),
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted
  ].join(':');
};

/**
 * Decrypts data encrypted with AES-256-GCM
 * @param {string} encryptedData - Encrypted data as hex string
 * @param {string} [password] - Optional password (uses machine key if not provided)
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
    
    const secret = password || getMachineKey();
    const key = deriveKey(secret, salt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    // Decryption failed (wrong key, tampered data, etc.)
    return null;
  }
};

/**
 * Hashes a password using SHA-512 with salt
 * @param {string} password - Password to hash
 * @returns {string} Hashed password (salt:hash in hex)
 */
const hashPassword = (password) => {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512');
  return salt.toString('hex') + ':' + hash.toString('hex');
};

/**
 * Verifies a password against a hash
 * @param {string} password - Password to verify
 * @param {string} storedHash - Stored hash (salt:hash)
 * @returns {boolean} True if password matches
 */
const verifyPassword = (password, storedHash) => {
  try {
    const [saltHex, hashHex] = storedHash.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, 64, 'sha512');
    return hash.toString('hex') === hashHex;
  } catch {
    return false;
  }
};

/**
 * Generates a secure random token
 * @param {number} [length=32] - Token length in bytes
 * @returns {string} Random token as hex string
 */
const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Masks sensitive data for logging
 * @param {string} data - Data to mask
 * @param {number} [visibleChars=4] - Number of visible characters at start/end
 * @returns {string} Masked data
 */
const maskSensitive = (data, visibleChars = 4) => {
  if (!data || data.length <= visibleChars * 2) {
    return '****';
  }
  const start = data.substring(0, visibleChars);
  const end = data.substring(data.length - visibleChars);
  return `${start}****${end}`;
};

module.exports = {
  encrypt,
  decrypt,
  hashPassword,
  verifyPassword,
  generateToken,
  maskSensitive
};
