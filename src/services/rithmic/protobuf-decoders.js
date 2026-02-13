/**
 * Protobuf Decoders - Decode Rithmic protobuf messages
 * @module services/rithmic/protobuf-decoders
 * 
 * HFT-GRADE OPTIMIZATIONS:
 * - Lookup tables for O(1) field dispatch (replaces O(n) switch)
 * - Pre-built decoder maps at module load time
 * - Zero branch misprediction in hot path
 */

const { readVarint, readLengthDelimited, skipField } = require('./protobuf-utils');

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

// Symbol/Contract field IDs (ResponseProductCodes, ResponseFrontMonthContract)
const SYMBOL_FIELDS = {
  TEMPLATE_ID: 154467,
  RP_CODE: 132766,
  RP_CODE_2: 132764,      // Another rp_code field
  EXCHANGE: 110101,
  PRODUCT_CODE: 100749,   // Base symbol (ES, NQ, MNQ) - actual field ID from Rithmic
  PRODUCT_NAME: 110103,   // Product name
  SYMBOL: 110100,         // Full contract symbol (ESH26)
  TRADING_SYMBOL: 157095, // Trading symbol
  DESCRIPTION: 110114,    // Contract description
  USER_MSG: 132760,
};

// Instrument PnL Position Update field IDs
const INSTRUMENT_PNL_FIELDS = {
  TEMPLATE_ID: 154467,
  IS_SNAPSHOT: 110121,
  FCM_ID: 154013,
  IB_ID: 154014,
  ACCOUNT_ID: 154008,
  SYMBOL: 110100,
  EXCHANGE: 110101,
  PRODUCT_CODE: 100749,
  INSTRUMENT_TYPE: 110116,
  FILL_BUY_QTY: 154041,
  FILL_SELL_QTY: 154042,
  ORDER_BUY_QTY: 154037,
  ORDER_SELL_QTY: 154038,
  BUY_QTY: 154260,
  SELL_QTY: 154261,
  AVG_OPEN_FILL_PRICE: 154434,
  DAY_OPEN_PNL: 157954,
  DAY_CLOSED_PNL: 157955,
  DAY_PNL: 157956,
  OPEN_POSITION_PNL: 156961,
  OPEN_POSITION_QUANTITY: 156962,
  CLOSED_POSITION_PNL: 156963,
  CLOSED_POSITION_QUANTITY: 156964,
  NET_QUANTITY: 156967,
  SSBOE: 150100,
  USECS: 150101,
};

// =============================================================================
// HFT: PRE-BUILT LOOKUP TABLES FOR O(1) FIELD DISPATCH
// =============================================================================

// Decoder types: 0=skip, 1=varint, 2=string, 3=bool, 4=double
const DECODE_SKIP = 0;
const DECODE_VARINT = 1;
const DECODE_STRING = 2;
const DECODE_BOOL = 3;
const DECODE_DOUBLE = 4;

/**
 * Build lookup table from field definitions
 * @param {Object} fields - Field ID mapping
 * @param {Object} fieldTypes - Map of field name to [type, resultKey]
 * @returns {Map} Lookup table: fieldNumber -> [type, resultKey]
 */
function buildLookupTable(fields, fieldTypes) {
  const table = new Map();
  for (const [fieldName, fieldNumber] of Object.entries(fields)) {
    if (fieldTypes[fieldName]) {
      table.set(fieldNumber, fieldTypes[fieldName]);
    }
  }
  return table;
}

// PnL field types: [decoderType, resultKey]
const PNL_FIELD_TYPES = {
  TEMPLATE_ID: [DECODE_VARINT, 'templateId'],
  IS_SNAPSHOT: [DECODE_BOOL, 'isSnapshot'],
  FCM_ID: [DECODE_STRING, 'fcmId'],
  IB_ID: [DECODE_STRING, 'ibId'],
  ACCOUNT_ID: [DECODE_STRING, 'accountId'],
  ACCOUNT_BALANCE: [DECODE_STRING, 'accountBalance'],
  CASH_ON_HAND: [DECODE_STRING, 'cashOnHand'],
  MARGIN_BALANCE: [DECODE_STRING, 'marginBalance'],
  MIN_ACCOUNT_BALANCE: [DECODE_STRING, 'minAccountBalance'],
  OPEN_POSITION_PNL: [DECODE_STRING, 'openPositionPnl'],
  CLOSED_POSITION_PNL: [DECODE_STRING, 'closedPositionPnl'],
  DAY_PNL: [DECODE_STRING, 'dayPnl'],
  DAY_OPEN_PNL: [DECODE_STRING, 'dayOpenPnl'],
  DAY_CLOSED_PNL: [DECODE_STRING, 'dayClosedPnl'],
  AVAILABLE_BUYING_POWER: [DECODE_STRING, 'availableBuyingPower'],
  SSBOE: [DECODE_VARINT, 'ssboe'],
  USECS: [DECODE_VARINT, 'usecs'],
};

// Instrument PnL field types
const INSTRUMENT_PNL_FIELD_TYPES = {
  TEMPLATE_ID: [DECODE_VARINT, 'templateId'],
  IS_SNAPSHOT: [DECODE_BOOL, 'isSnapshot'],
  FCM_ID: [DECODE_STRING, 'fcmId'],
  IB_ID: [DECODE_STRING, 'ibId'],
  ACCOUNT_ID: [DECODE_STRING, 'accountId'],
  SYMBOL: [DECODE_STRING, 'symbol'],
  EXCHANGE: [DECODE_STRING, 'exchange'],
  PRODUCT_CODE: [DECODE_STRING, 'productCode'],
  BUY_QTY: [DECODE_VARINT, 'buyQty'],
  SELL_QTY: [DECODE_VARINT, 'sellQty'],
  FILL_BUY_QTY: [DECODE_VARINT, 'fillBuyQty'],
  FILL_SELL_QTY: [DECODE_VARINT, 'fillSellQty'],
  NET_QUANTITY: [DECODE_VARINT, 'netQuantity'],
  OPEN_POSITION_QUANTITY: [DECODE_VARINT, 'openPositionQuantity'],
  AVG_OPEN_FILL_PRICE: [DECODE_DOUBLE, 'avgOpenFillPrice'],
  OPEN_POSITION_PNL: [DECODE_STRING, 'openPositionPnl'],
  CLOSED_POSITION_PNL: [DECODE_STRING, 'closedPositionPnl'],
  DAY_PNL: [DECODE_STRING, 'dayPnl'],
  DAY_OPEN_PNL: [DECODE_STRING, 'dayOpenPnl'],
  DAY_CLOSED_PNL: [DECODE_STRING, 'dayClosedPnl'],
  SSBOE: [DECODE_VARINT, 'ssboe'],
  USECS: [DECODE_VARINT, 'usecs'],
};

// Symbol/Product codes field types
const SYMBOL_FIELD_TYPES = {
  TEMPLATE_ID: [DECODE_VARINT, 'templateId'],
  RP_CODE: [DECODE_STRING, 'rpCode'],  // Array field - handled specially
  EXCHANGE: [DECODE_STRING, 'exchange'],
  PRODUCT_CODE: [DECODE_STRING, 'productCode'],
  PRODUCT_NAME: [DECODE_STRING, 'productName'],
  SYMBOL: [DECODE_STRING, 'symbol'],
  TRADING_SYMBOL: [DECODE_STRING, 'tradingSymbol'],
  DESCRIPTION: [DECODE_STRING, 'description'],
  USER_MSG: [DECODE_STRING, 'userMsg'],
};

// Pre-build lookup tables at module load time (O(1) access in hot path)
const PNL_LOOKUP = buildLookupTable(PNL_FIELDS, PNL_FIELD_TYPES);
const INSTRUMENT_PNL_LOOKUP = buildLookupTable(INSTRUMENT_PNL_FIELDS, INSTRUMENT_PNL_FIELD_TYPES);
const SYMBOL_LOOKUP = buildLookupTable(SYMBOL_FIELDS, SYMBOL_FIELD_TYPES);

// =============================================================================
// HFT: GENERIC DECODER WITH LOOKUP TABLE - O(1) FIELD DISPATCH
// =============================================================================

/**
 * HFT-optimized generic decoder using lookup table
 * Replaces O(n) switch statements with O(1) Map lookup
 * @param {Buffer} data - Raw protobuf data (without length prefix)
 * @param {Map} lookup - Pre-built field lookup table
 * @param {Object} result - Pre-allocated result object (optional)
 * @returns {Object} Decoded data
 */
function decodeWithLookup(data, lookup, result = {}) {
  let offset = 0;
  const len = data.length;

  while (offset < len) {
    // Read tag (varint) - inlined for performance
    let tag = 0;
    let shift = 0;
    let byte;
    do {
      byte = data[offset++];
      tag |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);

    const wireType = tag & 0x7;
    const fieldNumber = tag >>> 3;

    // O(1) lookup instead of O(n) switch
    const fieldInfo = lookup.get(fieldNumber);
    
    if (fieldInfo) {
      const [decodeType, key] = fieldInfo;
      
      // Decode based on type (minimal branching)
      if (decodeType === DECODE_VARINT) {
        let value = 0;
        shift = 0;
        do {
          byte = data[offset++];
          value |= (byte & 0x7f) << shift;
          shift += 7;
        } while (byte & 0x80);
        result[key] = value;
      } else if (decodeType === DECODE_STRING) {
        // Read length
        let strLen = 0;
        shift = 0;
        do {
          byte = data[offset++];
          strLen |= (byte & 0x7f) << shift;
          shift += 7;
        } while (byte & 0x80);
        result[key] = data.toString('utf8', offset, offset + strLen);
        offset += strLen;
      } else if (decodeType === DECODE_BOOL) {
        let value = 0;
        shift = 0;
        do {
          byte = data[offset++];
          value |= (byte & 0x7f) << shift;
          shift += 7;
        } while (byte & 0x80);
        result[key] = value !== 0;
      } else if (decodeType === DECODE_DOUBLE) {
        if (wireType === 1) {
          result[key] = data.readDoubleLE(offset);
          offset += 8;
        } else {
          offset = skipField(data, offset, wireType);
        }
      }
    } else {
      // Unknown field - skip efficiently
      offset = skipField(data, offset, wireType);
    }
  }

  return result;
}

/**
 * Manually decode AccountPnL from raw bytes
 * HFT: Uses O(1) lookup table instead of O(n) switch
 * @param {Buffer} buffer - Raw protobuf buffer
 * @returns {Object} Decoded account PnL data
 */
function decodeAccountPnL(buffer) {
  // Skip 4-byte length prefix
  const data = buffer.length > 4 ? buffer.subarray(4) : buffer;
  return decodeWithLookup(data, PNL_LOOKUP);
}

/**
 * Manually decode InstrumentPnLPositionUpdate from raw bytes
 * HFT: Uses O(1) lookup table instead of O(n) switch
 * @param {Buffer} buffer - Raw protobuf buffer
 * @returns {Object} Decoded instrument PnL data
 */
function decodeInstrumentPnL(buffer) {
  // Skip 4-byte length prefix - use subarray (no copy) instead of slice
  const data = buffer.length > 4 ? buffer.subarray(4) : buffer;
  return decodeWithLookup(data, INSTRUMENT_PNL_LOOKUP);
}

/**
 * Decode ResponseProductCodes (template 112) - list of available symbols
 * Note: Not hot-path (initialization only), uses switch for rpCode array handling
 * @param {Buffer} buffer - Raw protobuf buffer (with 4-byte length prefix)
 * @returns {Object} Decoded product codes
 */
function decodeProductCodes(buffer) {
  // HFT: Use subarray (zero-copy) instead of slice
  const data = buffer.length > 4 ? buffer.subarray(4) : buffer;
  const result = { rpCode: [] };
  let offset = 0;
  const len = data.length;

  while (offset < len) {
    const [tag, tagOffset] = readVarint(data, offset);
    const wireType = tag & 0x7;
    const fieldNumber = tag >>> 3;
    offset = tagOffset;

    // Use lookup for most fields, special case for rpCode array
    const fieldInfo = SYMBOL_LOOKUP.get(fieldNumber);
    if (fieldInfo) {
      const [, key] = fieldInfo;
      if (key === 'rpCode') {
        // Array field - push to existing array
        let rpCode;
        [rpCode, offset] = readLengthDelimited(data, offset);
        result.rpCode.push(rpCode);
      } else {
        // Regular field
        let value;
        [value, offset] = readLengthDelimited(data, offset);
        result[key] = value;
      }
    } else if (fieldNumber === SYMBOL_FIELDS.TEMPLATE_ID) {
      [result.templateId, offset] = readVarint(data, offset);
    } else {
      offset = skipField(data, offset, wireType);
    }
  }

  return result;
}

/**
 * Decode ResponseFrontMonthContract (template 114) - current tradeable contract
 * Note: Not hot-path (initialization only), uses switch for rpCode array handling
 * @param {Buffer} buffer - Raw protobuf buffer
 * @returns {Object} Decoded front month contract
 */
function decodeFrontMonthContract(buffer) {
  // HFT: Use subarray (zero-copy) instead of slice
  const data = buffer.length > 4 ? buffer.subarray(4) : buffer;
  const result = { rpCode: [] };
  let offset = 0;
  const len = data.length;

  while (offset < len) {
    const [tag, tagOffset] = readVarint(data, offset);
    const wireType = tag & 0x7;
    const fieldNumber = tag >>> 3;
    offset = tagOffset;

    // Use lookup for most fields, special case for rpCode array
    const fieldInfo = SYMBOL_LOOKUP.get(fieldNumber);
    if (fieldInfo) {
      const [, key] = fieldInfo;
      if (key === 'rpCode') {
        // Array field - push to existing array
        let rpCode;
        [rpCode, offset] = readLengthDelimited(data, offset);
        result.rpCode.push(rpCode);
      } else {
        // Regular field
        let value;
        [value, offset] = readLengthDelimited(data, offset);
        result[key] = value;
      }
    } else if (fieldNumber === SYMBOL_FIELDS.TEMPLATE_ID) {
      [result.templateId, offset] = readVarint(data, offset);
    } else {
      offset = skipField(data, offset, wireType);
    }
  }

  return result;
}

module.exports = {
  decodeAccountPnL,
  decodeInstrumentPnL,
  decodeProductCodes,
  decodeFrontMonthContract,
  // Export field constants for reference
  PNL_FIELDS,
  SYMBOL_FIELDS,
  INSTRUMENT_PNL_FIELDS,
};
