/**
 * Rithmic Protobuf Handler
 * Handles encoding/decoding of Rithmic protobuf messages
 */

const protobuf = require('protobufjs');
const path = require('path');
const { PROTO_FILES } = require('./constants');

// PnL field IDs (Rithmic uses very large field IDs)
const PNL_FIELDS = {
  TEMPLATE_ID: 154467,
  IS_SNAPSHOT: 110121,
  FCM_ID: 154013,
  IB_ID: 154014,
  ACCOUNT_ID: 154008,
  ACCOUNT_BALANCE: 156970,
  CASH_ON_HAND: 156971,
  MARGIN_BALANCE: 156977,
  MIN_ACCOUNT_BALANCE: 156968,
  OPEN_POSITION_PNL: 156961,
  CLOSED_POSITION_PNL: 156963,
  DAY_PNL: 157956,
  DAY_OPEN_PNL: 157954,
  DAY_CLOSED_PNL: 157955,
  AVAILABLE_BUYING_POWER: 157015,
  SSBOE: 150100,
  USECS: 150101,
};

/**
 * Read a varint from buffer
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
 */
function readLengthDelimited(buffer, offset) {
  const [length, newOffset] = readVarint(buffer, offset);
  const value = buffer.slice(newOffset, newOffset + length).toString('utf8');
  return [value, newOffset + length];
}

/**
 * Skip a field based on wire type
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

/**
 * Manually decode AccountPnL from raw bytes
 */
function decodeAccountPnL(buffer) {
  const result = {};
  let offset = 0;

  while (offset < buffer.length) {
    try {
      const [tag, tagOffset] = readVarint(buffer, offset);
      const wireType = tag & 0x7;
      const fieldNumber = tag >>> 3;
      offset = tagOffset;

      switch (fieldNumber) {
        case PNL_FIELDS.TEMPLATE_ID:
          [result.templateId, offset] = readVarint(buffer, offset);
          break;
        case PNL_FIELDS.IS_SNAPSHOT:
          const [isSnap, snapOffset] = readVarint(buffer, offset);
          result.isSnapshot = isSnap !== 0;
          offset = snapOffset;
          break;
        case PNL_FIELDS.FCM_ID:
          [result.fcmId, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.IB_ID:
          [result.ibId, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.ACCOUNT_ID:
          [result.accountId, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.ACCOUNT_BALANCE:
          [result.accountBalance, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.CASH_ON_HAND:
          [result.cashOnHand, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.MARGIN_BALANCE:
          [result.marginBalance, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.MIN_ACCOUNT_BALANCE:
          [result.minAccountBalance, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.OPEN_POSITION_PNL:
          [result.openPositionPnl, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.CLOSED_POSITION_PNL:
          [result.closedPositionPnl, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.DAY_PNL:
          [result.dayPnl, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.DAY_OPEN_PNL:
          [result.dayOpenPnl, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.DAY_CLOSED_PNL:
          [result.dayClosedPnl, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.AVAILABLE_BUYING_POWER:
          [result.availableBuyingPower, offset] = readLengthDelimited(buffer, offset);
          break;
        case PNL_FIELDS.SSBOE:
          [result.ssboe, offset] = readVarint(buffer, offset);
          break;
        case PNL_FIELDS.USECS:
          [result.usecs, offset] = readVarint(buffer, offset);
          break;
        default:
          offset = skipField(buffer, offset, wireType);
      }
    } catch (error) {
      break;
    }
  }

  return result;
}

/**
 * Protobuf Handler class
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
   * Encode a message to Buffer
   */
  encode(typeName, data) {
    if (!this.root) throw new Error('Proto not loaded');

    const Type = this.root.lookupType(typeName);
    const msg = Type.create(data);
    return Buffer.from(Type.encode(msg).finish());
  }

  /**
   * Decode a Buffer to object
   */
  decode(typeName, buffer) {
    if (!this.root) throw new Error('Proto not loaded');

    const Type = this.root.lookupType(typeName);
    return Type.decode(buffer);
  }

  /**
   * Get template ID from buffer (manual decode for large field IDs)
   */
  getTemplateId(buffer) {
    const TEMPLATE_ID_FIELD = 154467;

    let offset = 0;
    while (offset < buffer.length) {
      try {
        const [tag, newOffset] = readVarint(buffer, offset);
        const fieldNumber = tag >>> 3;
        const wireType = tag & 0x7;
        offset = newOffset;

        if (fieldNumber === TEMPLATE_ID_FIELD && wireType === 0) {
          const [templateId] = readVarint(buffer, offset);
          return templateId;
        }

        offset = skipField(buffer, offset, wireType);
      } catch (e) {
        break;
      }
    }

    // Fallback
    if (this.root) {
      try {
        const Base = this.root.lookupType('Base');
        const base = Base.decode(buffer);
        return base.templateId;
      } catch (e) {
        return -1;
      }
    }
    return -1;
  }
}

// Singleton
const proto = new ProtobufHandler();

module.exports = {
  proto,
  decodeAccountPnL,
  readVarint,
  readLengthDelimited,
  skipField,
};
