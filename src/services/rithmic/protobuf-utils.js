/**
 * Protobuf Utilities - Low-level protobuf parsing functions
 * @module services/rithmic/protobuf-utils
 */

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
    case 1: // 64-bit
      return offset + 8;
    case 2: // Length-delimited
      const [length, lenOffset] = readVarint(buffer, offset);
      return lenOffset + length;
    case 5: // 32-bit
      return offset + 4;
    default:
      throw new Error(`Unknown wire type: ${wireType}`);
  }
}

module.exports = {
  readVarint,
  readLengthDelimited,
  skipField,
};
