/**
 * @fileoverview HQX Server Constants
 * @module services/hqx-server/constants
 */

/** Message types as bytes for faster switching */
const MSG_TYPE = {
  // Outgoing
  PING: 0x01,
  START_ALGO: 0x10,
  STOP_ALGO: 0x11,
  START_COPY: 0x12,
  ORDER: 0x20,
  
  // Incoming
  PONG: 0x81,
  SIGNAL: 0x90,
  TRADE: 0x91,
  FILL: 0x92,
  LOG: 0xA0,
  STATS: 0xA1,
  ERROR: 0xFF,
};

/** Pre-allocated ping buffer */
const PING_BUFFER = Buffer.alloc(9);
PING_BUFFER.writeUInt8(MSG_TYPE.PING, 0);

/**
 * Fast JSON stringify with pre-check
 * @param {Object} obj 
 * @returns {string}
 */
const fastStringify = (obj) => {
  if (obj === null) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  return JSON.stringify(obj);
};

/**
 * Fast JSON parse with type hint
 * @param {string|Buffer} data 
 * @returns {Object}
 */
const fastParse = (data) => {
  const str = typeof data === 'string' ? data : data.toString('utf8');
  return JSON.parse(str);
};

module.exports = {
  MSG_TYPE,
  PING_BUFFER,
  fastStringify,
  fastParse,
};
