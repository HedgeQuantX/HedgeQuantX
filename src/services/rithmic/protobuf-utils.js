/**
 * Protobuf Utilities - Low-level protobuf parsing functions
 * @module services/rithmic/protobuf-utils
 */

// Constants for safe integer handling
const MAX_SAFE_QUANTITY = 10000; // Max reasonable position/order quantity
const MAX_UINT64 = BigInt('18446744073709551616'); // 2^64
const MAX_INT64 = BigInt('9223372036854775807');   // 2^63 - 1

/**
 * Read a varint from buffer
 * @param {Buffer} buffer - Input buffer
 * @param {number} offset - Start offset
 * @returns {[number, number]} [value, newOffset]
 */
function readVarint(buffer, offset) {
  let result = BigInt(0);
  let shift = BigInt(0);
  let pos = offset;

  while (pos < buffer.length) {
    const byte = buffer[pos++];
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      // Handle potential unsigned 64-bit to signed conversion
      // Rithmic sends negative numbers as unsigned (e.g., -1 as 18446744073709551615)
      if (result > MAX_INT64) {
        // Convert unsigned to signed: subtract 2^64
        const signedValue = result - MAX_UINT64;
        return [Number(signedValue), pos];
      }
      return [Number(result), pos];
    }
    shift += BigInt(7);
    if (shift > BigInt(63)) {
      throw new Error('Varint too large');
    }
  }
  throw new Error('Incomplete varint');
}

/**
 * Validate and sanitize a quantity value (positions, order sizes)
 * Prevents overflow values and ensures reasonable bounds
 * @param {number|string|BigInt} value - Raw quantity value
 * @returns {number} Sanitized quantity (0 if invalid)
 */
function sanitizeQuantity(value) {
  if (value === null || value === undefined) return 0;
  
  let num;
  if (typeof value === 'bigint') {
    // Handle BigInt overflow (negative values sent as unsigned)
    if (value > MAX_INT64) {
      num = Number(value - MAX_UINT64);
    } else {
      num = Number(value);
    }
  } else if (typeof value === 'string') {
    num = parseInt(value, 10);
  } else {
    num = Number(value);
  }
  
  // Validate the number
  if (!Number.isFinite(num) || Number.isNaN(num)) return 0;
  
  // Check for overflow values (like 18446744073709552000)
  if (Math.abs(num) > MAX_SAFE_QUANTITY) {
    // This is likely an overflow - return 0 to be safe
    return 0;
  }
  
  return num;
}

/**
 * Read a length-delimited field (string/bytes)
 * @param {Buffer} buffer - Input buffer
 * @param {number} offset - Start offset
 * @returns {[string, number]} [value, newOffset]
 */
function readLengthDelimited(buffer, offset) {
  const [length, newOffset] = readVarint(buffer, offset);
  const value = buffer.slice(newOffset, newOffset + length).toString('utf8');
  return [value, newOffset + length];
}

/**
 * Skip a field based on wire type
 * @param {Buffer} buffer - Input buffer
 * @param {number} offset - Start offset
 * @param {number} wireType - Protobuf wire type
 * @returns {number} New offset
 */
function skipField(buffer, offset, wireType) {
  switch (wireType) {
    case 0: // Varint
      const [, newOffset] = readVarint(buffer, offset);
      return newOffset;
    case 1: // 64-bit (fixed64, sfixed64, double)
      return offset + 8;
    case 2: // Length-delimited (string, bytes, embedded messages, packed repeated)
      const [length, lenOffset] = readVarint(buffer, offset);
      return lenOffset + length;
    case 3: // Start group (deprecated)
    case 4: // End group (deprecated)
      // Groups are deprecated, skip to end of buffer
      return buffer.length;
    case 5: // 32-bit (fixed32, sfixed32, float)
      return offset + 4;
    case 6: // Reserved (unused)
    case 7: // Reserved (unused) - indicates corrupted data
      // Skip to end to prevent infinite loops on corrupted data
      return buffer.length;
    default:
      // Unknown wire type - skip to end
      return buffer.length;
  }
}

module.exports = {
  readVarint,
  readLengthDelimited,
  skipField,
  sanitizeQuantity,
  MAX_SAFE_QUANTITY,
};
