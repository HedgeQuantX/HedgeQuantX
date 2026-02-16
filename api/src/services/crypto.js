/**
 * Credentials Encryption Service
 *
 * Encrypts/decrypts trading credentials using AES-256-GCM.
 * Used to persist session across server restarts and page refreshes.
 *
 * The encrypted blob is stored client-side (localStorage) and sent back
 * to the server for reconnection. The password is NEVER in plaintext
 * on the client.
 *
 * Key derivation: PBKDF2 from HQX_JWT_SECRET + static salt
 */

'use strict';

const crypto = require('crypto');

const JWT_SECRET = process.env.HQX_JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: HQX_JWT_SECRET is required for credential encryption');
}

// Derive a 256-bit key from JWT_SECRET using PBKDF2
const SALT = Buffer.from('hqx-credential-encryption-salt-v1', 'utf8');
const ENCRYPTION_KEY = crypto.pbkdf2Sync(JWT_SECRET, SALT, 100000, 32, 'sha256');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt credentials object → base64 string
 * @param {Object} credentials - { propfirm, username, password }
 * @returns {string} Base64-encoded encrypted blob (iv + authTag + ciphertext)
 */
function encryptCredentials(credentials) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + authTag (16) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString('base64');
}

/**
 * Decrypt base64 string → credentials object
 * @param {string} encryptedBase64 - Base64-encoded encrypted blob
 * @returns {Object|null} { propfirm, username, password } or null if invalid
 */
function decryptCredentials(encryptedBase64) {
  try {
    const packed = Buffer.from(encryptedBase64, 'base64');

    if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      return null;
    }

    const iv = packed.subarray(0, IV_LENGTH);
    const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    const credentials = JSON.parse(decrypted.toString('utf8'));

    // Validate shape
    if (!credentials.propfirm || !credentials.username || !credentials.password) {
      return null;
    }

    return credentials;
  } catch {
    return null;
  }
}

module.exports = { encryptCredentials, decryptCredentials };
