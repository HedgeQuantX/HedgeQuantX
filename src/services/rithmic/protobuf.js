/**
 * Rithmic Protobuf Handler
 * Main interface for encoding/decoding Rithmic protobuf messages
 * @module services/rithmic/protobuf
 */

const protobuf = require('protobufjs');
const path = require('path');
const { PROTO_FILES } = require('./constants');
const { readVarint, readLengthDelimited, skipField } = require('./protobuf-utils');
const {
  decodeAccountPnL,
  decodeInstrumentPnL,
  decodeProductCodes,
  decodeFrontMonthContract,
} = require('./protobuf-decoders');

/**
 * Protobuf Handler class
 * Handles loading proto files and encoding/decoding messages
 */
class ProtobufHandler {
  constructor() {
    this.root = null;
    this.loaded = false;
    this.protoPath = path.join(__dirname, 'proto');
  }

  /**
   * Load all proto files
   */
  async load() {
    if (this.loaded) return;

    this.root = new protobuf.Root();

    for (const file of PROTO_FILES) {
      try {
        await this.root.load(path.join(this.protoPath, file));
      } catch (e) {
        // Some files may not exist, that's ok
      }
    }

    this.loaded = true;
  }

  /**
   * Encode a message to Buffer with 4-byte length prefix
   * @param {string} typeName - Protobuf type name
   * @param {Object} data - Data to encode
   * @returns {Buffer} Encoded buffer with length prefix
   */
  encode(typeName, data) {
    if (!this.root) throw new Error('Proto not loaded');

    const Type = this.root.lookupType(typeName);
    const msg = Type.create(data);
    const serialized = Buffer.from(Type.encode(msg).finish());
    
    // Add 4-byte length prefix (big-endian, signed)
    const lengthPrefix = Buffer.alloc(4);
    lengthPrefix.writeInt32BE(serialized.length, 0);
    
    return Buffer.concat([lengthPrefix, serialized]);
  }

  /**
   * Decode a Buffer to object (skip 4-byte length prefix)
   * @param {string} typeName - Protobuf type name
   * @param {Buffer} buffer - Buffer to decode
   * @returns {Object} Decoded message
   */
  decode(typeName, buffer) {
    if (!this.root) throw new Error('Proto not loaded');

    // Skip 4-byte length prefix if present
    const data = buffer.length > 4 ? buffer.slice(4) : buffer;
    
    const Type = this.root.lookupType(typeName);
    return Type.decode(data);
  }

  /**
   * Get template ID from buffer (manual decode for large field IDs)
   * Skips 4-byte length prefix if present
   * @param {Buffer} buffer - Buffer to parse
   * @returns {number} Template ID or -1 if not found
   */
  getTemplateId(buffer) {
    const TEMPLATE_ID_FIELD = 154467;

    // Skip 4-byte length prefix
    const data = buffer.length > 4 ? buffer.slice(4) : buffer;
    
    let offset = 0;
    while (offset < data.length) {
      try {
        const [tag, newOffset] = readVarint(data, offset);
        const fieldNumber = tag >>> 3;
        const wireType = tag & 0x7;
        offset = newOffset;

        if (fieldNumber === TEMPLATE_ID_FIELD && wireType === 0) {
          const [templateId] = readVarint(data, offset);
          return templateId;
        }

        offset = skipField(data, offset, wireType);
      } catch (e) {
        break;
      }
    }

    // Fallback
    if (this.root) {
      try {
        const Base = this.root.lookupType('Base');
        const base = Base.decode(data);
        return base.templateId;
      } catch (e) {
        return -1;
      }
    }
    return -1;
  }
}

// Singleton instance
const proto = new ProtobufHandler();

module.exports = {
  proto,
  decodeAccountPnL,
  decodeInstrumentPnL,
  decodeProductCodes,
  decodeFrontMonthContract,
  readVarint,
  readLengthDelimited,
  skipField,
};
