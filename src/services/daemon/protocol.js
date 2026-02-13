/**
 * @fileoverview IPC Protocol for Daemon-TUI Communication
 * @module services/daemon/protocol
 * 
 * Binary protocol for efficient, low-latency communication:
 * - Header: 4 bytes (message length)
 * - Body: JSON encoded message
 * 
 * Message format:
 * {
 *   id: string,      // Unique message ID for request/response matching
 *   type: string,    // MSG_TYPE constant
 *   data: any,       // Payload
 *   ts: number,      // Timestamp
 * }
 */

'use strict';

const crypto = require('crypto');
const { PROTOCOL_VERSION, MSG_TYPE } = require('./constants');

/**
 * Generate unique message ID
 * @returns {string} 16-char hex ID
 */
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Create a protocol message
 * @param {string} type - Message type from MSG_TYPE
 * @param {any} data - Message payload
 * @param {string} [replyTo] - ID of message this is replying to
 * @returns {Object} Protocol message
 */
function createMessage(type, data = null, replyTo = null) {
  const msg = {
    v: PROTOCOL_VERSION,
    id: generateId(),
    type,
    data,
    ts: Date.now(),
  };
  
  if (replyTo) {
    msg.replyTo = replyTo;
  }
  
  return msg;
}

/**
 * Encode message to buffer for transmission
 * @param {Object} message - Protocol message
 * @returns {Buffer} Encoded buffer with length header
 */
function encode(message) {
  const json = JSON.stringify(message);
  const body = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32BE(body.length, 0);
  return Buffer.concat([header, body]);
}

/**
 * Message parser for streaming data
 * Handles partial messages and buffering
 */
class MessageParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.expectedLength = 0;
  }
  
  /**
   * Feed data to parser
   * @param {Buffer} data - Incoming data
   * @returns {Array<Object>} Array of complete messages
   */
  feed(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    const messages = [];
    
    while (this.buffer.length >= 4) {
      // Read header if we don't have expected length
      if (this.expectedLength === 0) {
        this.expectedLength = this.buffer.readUInt32BE(0);
      }
      
      // Check if we have complete message
      if (this.buffer.length < 4 + this.expectedLength) {
        break;
      }
      
      // Extract message body
      const body = this.buffer.slice(4, 4 + this.expectedLength);
      this.buffer = this.buffer.slice(4 + this.expectedLength);
      this.expectedLength = 0;
      
      try {
        const message = JSON.parse(body.toString('utf8'));
        messages.push(message);
      } catch (err) {
        // Invalid JSON, skip
        console.error('Invalid message:', err.message);
      }
    }
    
    return messages;
  }
  
  /**
   * Reset parser state
   */
  reset() {
    this.buffer = Buffer.alloc(0);
    this.expectedLength = 0;
  }
}

/**
 * Request/response handler with timeout support
 */
class RequestHandler {
  constructor() {
    /** @type {Map<string, {resolve: Function, reject: Function, timeout: NodeJS.Timeout}>} */
    this.pending = new Map();
  }
  
  /**
   * Create a pending request
   * @param {string} id - Message ID
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<any>} Response promise
   */
  createRequest(id, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Request timeout'));
      }, timeoutMs);
      
      this.pending.set(id, { resolve, reject, timeout });
    });
  }
  
  /**
   * Resolve a pending request
   * @param {string} id - Message ID (or replyTo)
   * @param {any} data - Response data
   * @returns {boolean} True if request was found and resolved
   */
  resolve(id, data) {
    const req = this.pending.get(id);
    if (!req) return false;
    
    clearTimeout(req.timeout);
    this.pending.delete(id);
    req.resolve(data);
    return true;
  }
  
  /**
   * Reject a pending request
   * @param {string} id - Message ID
   * @param {Error|string} error - Error
   */
  reject(id, error) {
    const req = this.pending.get(id);
    if (!req) return;
    
    clearTimeout(req.timeout);
    this.pending.delete(id);
    req.reject(error instanceof Error ? error : new Error(error));
  }
  
  /**
   * Clear all pending requests
   */
  clear() {
    for (const [id, req] of this.pending) {
      clearTimeout(req.timeout);
      req.reject(new Error('Connection closed'));
    }
    this.pending.clear();
  }
}

module.exports = {
  generateId,
  createMessage,
  encode,
  MessageParser,
  RequestHandler,
};
