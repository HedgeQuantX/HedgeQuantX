/**
 * Protobuf Decoders - Decode Rithmic protobuf messages
 * @module services/rithmic/protobuf-decoders
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
  EXCHANGE: 110101,
  PRODUCT_CODE: 110102,   // Base symbol (ES, NQ, MNQ)
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

/**
 * Manually decode AccountPnL from raw bytes
 * Skips 4-byte length prefix if present
 * @param {Buffer} buffer - Raw protobuf buffer
 * @returns {Object} Decoded account PnL data
 */
function decodeAccountPnL(buffer) {
  // Skip 4-byte length prefix
  const data = buffer.length > 4 ? buffer.slice(4) : buffer;
  
  const result = {};
  let offset = 0;

  while (offset < data.length) {
    try {
      const [tag, tagOffset] = readVarint(data, offset);
      const wireType = tag & 0x7;
      const fieldNumber = tag >>> 3;
      offset = tagOffset;

      switch (fieldNumber) {
        case PNL_FIELDS.TEMPLATE_ID:
          [result.templateId, offset] = readVarint(data, offset);
          break;
        case PNL_FIELDS.IS_SNAPSHOT:
          const [isSnap, snapOffset] = readVarint(data, offset);
          result.isSnapshot = isSnap !== 0;
          offset = snapOffset;
          break;
        case PNL_FIELDS.FCM_ID:
          [result.fcmId, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.IB_ID:
          [result.ibId, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.ACCOUNT_ID:
          [result.accountId, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.ACCOUNT_BALANCE:
          [result.accountBalance, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.CASH_ON_HAND:
          [result.cashOnHand, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.MARGIN_BALANCE:
          [result.marginBalance, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.MIN_ACCOUNT_BALANCE:
          [result.minAccountBalance, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.OPEN_POSITION_PNL:
          [result.openPositionPnl, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.CLOSED_POSITION_PNL:
          [result.closedPositionPnl, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.DAY_PNL:
          [result.dayPnl, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.DAY_OPEN_PNL:
          [result.dayOpenPnl, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.DAY_CLOSED_PNL:
          [result.dayClosedPnl, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.AVAILABLE_BUYING_POWER:
          [result.availableBuyingPower, offset] = readLengthDelimited(data, offset);
          break;
        case PNL_FIELDS.SSBOE:
          [result.ssboe, offset] = readVarint(data, offset);
          break;
        case PNL_FIELDS.USECS:
          [result.usecs, offset] = readVarint(data, offset);
          break;
        default:
          offset = skipField(data, offset, wireType);
      }
    } catch (error) {
      break;
    }
  }

  return result;
}

/**
 * Manually decode InstrumentPnLPositionUpdate from raw bytes
 * Skips 4-byte length prefix if present
 * @param {Buffer} buffer - Raw protobuf buffer
 * @returns {Object} Decoded instrument PnL data
 */
function decodeInstrumentPnL(buffer) {
  // Skip 4-byte length prefix
  const data = buffer.length > 4 ? buffer.slice(4) : buffer;
  
  const result = {};
  let offset = 0;

  while (offset < data.length) {
    try {
      const [tag, tagOffset] = readVarint(data, offset);
      const wireType = tag & 0x7;
      const fieldNumber = tag >>> 3;
      offset = tagOffset;

      switch (fieldNumber) {
        case INSTRUMENT_PNL_FIELDS.TEMPLATE_ID:
          [result.templateId, offset] = readVarint(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.IS_SNAPSHOT:
          const [isSnap, snapOffset] = readVarint(data, offset);
          result.isSnapshot = isSnap !== 0;
          offset = snapOffset;
          break;
        case INSTRUMENT_PNL_FIELDS.FCM_ID:
          [result.fcmId, offset] = readLengthDelimited(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.IB_ID:
          [result.ibId, offset] = readLengthDelimited(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.ACCOUNT_ID:
          [result.accountId, offset] = readLengthDelimited(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.SYMBOL:
          [result.symbol, offset] = readLengthDelimited(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.EXCHANGE:
          [result.exchange, offset] = readLengthDelimited(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.PRODUCT_CODE:
          [result.productCode, offset] = readLengthDelimited(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.BUY_QTY:
          [result.buyQty, offset] = readVarint(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.SELL_QTY:
          [result.sellQty, offset] = readVarint(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.FILL_BUY_QTY:
          [result.fillBuyQty, offset] = readVarint(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.FILL_SELL_QTY:
          [result.fillSellQty, offset] = readVarint(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.NET_QUANTITY:
          [result.netQuantity, offset] = readVarint(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.OPEN_POSITION_QUANTITY:
          [result.openPositionQuantity, offset] = readVarint(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.AVG_OPEN_FILL_PRICE:
          // Double is 64-bit fixed
          if (wireType === 1) {
            result.avgOpenFillPrice = data.readDoubleLE(offset);
            offset += 8;
          } else {
            offset = skipField(data, offset, wireType);
          }
          break;
        case INSTRUMENT_PNL_FIELDS.OPEN_POSITION_PNL:
          [result.openPositionPnl, offset] = readLengthDelimited(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.CLOSED_POSITION_PNL:
          [result.closedPositionPnl, offset] = readLengthDelimited(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.DAY_PNL:
          [result.dayPnl, offset] = readLengthDelimited(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.DAY_OPEN_PNL:
          [result.dayOpenPnl, offset] = readLengthDelimited(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.DAY_CLOSED_PNL:
          [result.dayClosedPnl, offset] = readLengthDelimited(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.SSBOE:
          [result.ssboe, offset] = readVarint(data, offset);
          break;
        case INSTRUMENT_PNL_FIELDS.USECS:
          [result.usecs, offset] = readVarint(data, offset);
          break;
        default:
          offset = skipField(data, offset, wireType);
      }
    } catch (error) {
      break;
    }
  }

  return result;
}

/**
 * Decode ResponseProductCodes (template 112) - list of available symbols
 * @param {Buffer} buffer - Raw protobuf buffer
 * @returns {Object} Decoded product codes
 */
function decodeProductCodes(buffer) {
  const result = { rpCode: [] };
  let offset = 0;

  while (offset < buffer.length) {
    try {
      const [tag, tagOffset] = readVarint(buffer, offset);
      const wireType = tag & 0x7;
      const fieldNumber = tag >>> 3;
      offset = tagOffset;

      switch (fieldNumber) {
        case SYMBOL_FIELDS.TEMPLATE_ID:
          [result.templateId, offset] = readVarint(buffer, offset);
          break;
        case SYMBOL_FIELDS.RP_CODE:
          let rpCode;
          [rpCode, offset] = readLengthDelimited(buffer, offset);
          result.rpCode.push(rpCode);
          break;
        case SYMBOL_FIELDS.EXCHANGE:
          [result.exchange, offset] = readLengthDelimited(buffer, offset);
          break;
        case SYMBOL_FIELDS.PRODUCT_CODE:
          [result.productCode, offset] = readLengthDelimited(buffer, offset);
          break;
        case SYMBOL_FIELDS.PRODUCT_NAME:
          [result.productName, offset] = readLengthDelimited(buffer, offset);
          break;
        case SYMBOL_FIELDS.USER_MSG:
          [result.userMsg, offset] = readLengthDelimited(buffer, offset);
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
 * Decode ResponseFrontMonthContract (template 114) - current tradeable contract
 * Skips 4-byte length prefix if present
 * @param {Buffer} buffer - Raw protobuf buffer
 * @returns {Object} Decoded front month contract
 */
function decodeFrontMonthContract(buffer) {
  // Skip 4-byte length prefix
  const data = buffer.length > 4 ? buffer.slice(4) : buffer;
  
  const result = { rpCode: [] };
  let offset = 0;

  while (offset < data.length) {
    try {
      const [tag, tagOffset] = readVarint(data, offset);
      const wireType = tag & 0x7;
      const fieldNumber = tag >>> 3;
      offset = tagOffset;

      switch (fieldNumber) {
        case SYMBOL_FIELDS.TEMPLATE_ID:
          [result.templateId, offset] = readVarint(data, offset);
          break;
        case SYMBOL_FIELDS.RP_CODE:
          let rpCode;
          [rpCode, offset] = readLengthDelimited(data, offset);
          result.rpCode.push(rpCode);
          break;
        case SYMBOL_FIELDS.SYMBOL:
          [result.symbol, offset] = readLengthDelimited(data, offset);
          break;
        case SYMBOL_FIELDS.EXCHANGE:
          [result.exchange, offset] = readLengthDelimited(data, offset);
          break;
        case SYMBOL_FIELDS.TRADING_SYMBOL:
          [result.tradingSymbol, offset] = readLengthDelimited(data, offset);
          break;
        case SYMBOL_FIELDS.DESCRIPTION:
          [result.description, offset] = readLengthDelimited(data, offset);
          break;
        case SYMBOL_FIELDS.USER_MSG:
          [result.userMsg, offset] = readLengthDelimited(data, offset);
          break;
        default:
          offset = skipField(data, offset, wireType);
      }
    } catch (error) {
      break;
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
