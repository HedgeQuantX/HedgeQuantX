/**
 * Rithmic Connection Manager
 * Handles WebSocket connection and heartbeat
 * 
 * OPTIMIZED FOR ULTRA-LOW LATENCY:
 * - TCP_NODELAY enabled (disable Nagle's algorithm)
 * - Compression disabled
 * - Skip UTF8 validation for binary
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const { proto } = require('./protobuf');
const { REQ, RES, INFRA_TYPE } = require('./constants');

class RithmicConnection extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.config = null;
    this.state = 'DISCONNECTED';
    this.heartbeatTimer = null;
    this._socket = null; // Direct socket reference for fast access
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get connectionState() {
    return this.state;
  }

  /**
   * Connect to Rithmic server
   * OPTIMIZED: TCP_NODELAY, no compression, skip UTF8 validation
   */
  async connect(config) {
    this.config = config;
    this.state = 'CONNECTING';

    await proto.load();

    return new Promise((resolve, reject) => {
      // OPTIMIZATION: Disable compression and UTF8 validation for speed
      this.ws = new WebSocket(config.uri, { 
        rejectUnauthorized: false,
        perMessageDeflate: false,      // CRITICAL: Disable compression
        skipUTF8Validation: true,      // Skip validation for binary protobuf
        maxPayload: 64 * 1024,         // 64KB max (orders are small)
      });

      this.ws.on('open', () => {
        this.state = 'CONNECTED';
        
        // CRITICAL: Disable Nagle's algorithm for low latency
        // This sends packets immediately instead of buffering
        if (this.ws._socket) {
          this.ws._socket.setNoDelay(true);
          this._socket = this.ws._socket; // Cache for fast access
        }
        
        this.emit('connected');
        resolve(true);
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (err) => {
        this.state = 'ERROR';
        this.emit('error', err);
        reject(err);
      });

      this.ws.on('close', (code, reason) => {
        this.state = 'DISCONNECTED';
        this.stopHeartbeat();
        this.emit('disconnected', { code, reason: reason?.toString() });
      });

      // Timeout
      setTimeout(() => {
        if (this.state === 'CONNECTING') {
          reject(new Error('Connection timeout'));
        }
      }, 15000);
    });
  }

  /**
   * Disconnect
   */
  async disconnect() {
    this.stopHeartbeat();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send('RequestLogout', { templateId: REQ.LOGOUT, userMsg: ['HQX'] });
      this.ws.close(1000, 'bye');
    }
    this.ws = null;
    this.state = 'DISCONNECTED';
  }

  /**
   * Send a protobuf message
   */
  send(typeName, data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected');
    }
    const buffer = proto.encode(typeName, data);
    this.ws.send(buffer);
  }

  /**
   * Fast send - bypasses some ws overhead for hot path
   * Use for time-critical order messages
   * @param {Buffer} buffer - Pre-encoded protobuf buffer
   */
  fastSend(buffer) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
    }
  }

  /**
   * Ultra-fast send - direct socket write with WebSocket framing
   * MAXIMUM PERFORMANCE: Bypasses ws library overhead entirely
   * Only use for pre-encoded binary protobuf messages
   * 
   * @param {Buffer} payload - Pre-encoded protobuf buffer
   * @returns {boolean} true if sent successfully
   */
  ultraSend(payload) {
    // Require cached socket reference
    if (!this._socket || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      // Build WebSocket frame manually for binary message
      // This avoids all ws library overhead (callbacks, validation, etc.)
      const frame = this._buildBinaryFrame(payload);
      
      // Direct socket write - bypasses ws entirely
      this._socket.write(frame);
      return true;
    } catch (e) {
      // Fallback to standard send on error
      this.ws.send(payload);
      return true;
    }
  }

  /**
   * Build WebSocket binary frame manually
   * Format: [opcode] [length] [payload]
   * @private
   * @param {Buffer} payload 
   * @returns {Buffer}
   */
  _buildBinaryFrame(payload) {
    const len = payload.length;
    let frame;
    
    if (len < 126) {
      // 2-byte header: FIN + opcode (0x82 = final binary), length
      frame = Buffer.allocUnsafe(2 + len);
      frame[0] = 0x82; // FIN=1, opcode=2 (binary)
      frame[1] = len;  // No mask (server->client would need mask, but we're client)
      payload.copy(frame, 2);
    } else if (len < 65536) {
      // 4-byte header for medium messages
      frame = Buffer.allocUnsafe(4 + len);
      frame[0] = 0x82;
      frame[1] = 126;
      frame.writeUInt16BE(len, 2);
      payload.copy(frame, 4);
    } else {
      // 10-byte header for large messages (unlikely for orders)
      frame = Buffer.allocUnsafe(10 + len);
      frame[0] = 0x82;
      frame[1] = 127;
      frame.writeBigUInt64BE(BigInt(len), 2);
      payload.copy(frame, 10);
    }
    
    // Client frames MUST be masked per RFC 6455
    // Apply masking key
    return this._applyMask(frame, len < 126 ? 2 : (len < 65536 ? 4 : 10));
  }

  /**
   * Apply WebSocket client masking
   * @private
   * @param {Buffer} frame - Frame with unmasked payload
   * @param {number} headerLen - Length of header before payload
   * @returns {Buffer} - New frame with mask applied
   */
  _applyMask(frame, headerLen) {
    const payloadLen = frame.length - headerLen;
    
    // Generate 4-byte mask key
    const mask = Buffer.allocUnsafe(4);
    mask[0] = (Math.random() * 256) | 0;
    mask[1] = (Math.random() * 256) | 0;
    mask[2] = (Math.random() * 256) | 0;
    mask[3] = (Math.random() * 256) | 0;
    
    // Create new frame with mask bit set and mask key inserted
    const maskedFrame = Buffer.allocUnsafe(headerLen + 4 + payloadLen);
    
    // Copy header, set mask bit
    frame.copy(maskedFrame, 0, 0, headerLen);
    maskedFrame[1] |= 0x80; // Set MASK bit
    
    // Insert mask key after length
    mask.copy(maskedFrame, headerLen);
    
    // Copy and mask payload
    for (let i = 0; i < payloadLen; i++) {
      maskedFrame[headerLen + 4 + i] = frame[headerLen + i] ^ mask[i & 3];
    }
    
    return maskedFrame;
  }

  /**
   * Login to system
   */
  login(infraType = 'ORDER_PLANT') {
    if (!this.config) throw new Error('No config');

    this.send('RequestLogin', {
      templateId: REQ.LOGIN,
      templateVersion: '3.9',
      userMsg: ['HQX'],
      user: this.config.userId,
      password: this.config.password,
      appName: this.config.appName || 'HQX-CLI',
      appVersion: this.config.appVersion || '1.0.0',
      systemName: this.config.systemName,
      infraType: INFRA_TYPE[infraType],
    });
  }

  /**
   * List available systems
   */
  listSystems() {
    this.send('RequestRithmicSystemInfo', {
      templateId: REQ.SYSTEM_INFO,
      userMsg: ['HQX'],
    });
  }

  /**
   * Handle incoming message
   */
  handleMessage(data) {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const templateId = proto.getTemplateId(buffer);

    switch (templateId) {
      case RES.LOGIN:
        this.onLoginResponse(buffer);
        break;

      case RES.HEARTBEAT:
        // OK
        break;

      case RES.SYSTEM_INFO:
        this.onSystemInfo(buffer);
        break;

      default:
        // Forward to listeners
        this.emit('message', { templateId, data: buffer });
    }
  }

  onLoginResponse(data) {
    try {
      const res = proto.decode('ResponseLogin', data);

      if (res.rpCode?.[0] === '0') {
        this.state = 'LOGGED_IN';
        this.startHeartbeat(res.heartbeatInterval || 60);
        this.emit('loggedIn', {
          fcmId: res.fcmId,
          ibId: res.ibId,
          heartbeatInterval: res.heartbeatInterval,
        });
      } else {
        const errorCode = res.rpCode?.[0] || 'UNKNOWN';
        const errorMsg = res.rpCode?.[1] || 'Login failed';
        this.emit('loginFailed', { code: errorCode, message: errorMsg });
      }
    } catch (e) {
      this.emit('loginFailed', { code: 'DECODE_ERROR', message: e.message });
    }
  }

  onSystemInfo(data) {
    try {
      const res = proto.decode('ResponseRithmicSystemInfo', data);

      if (res.rpCode?.[0] === '0') {
        this.emit('systems', res.systemName || []);
      }
    } catch (e) {
      // Ignore
    }
  }

  startHeartbeat(intervalSec) {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      try {
        this.send('RequestHeartbeat', { templateId: REQ.HEARTBEAT });
      } catch (e) {
        // Ignore
      }
    }, (intervalSec - 5) * 1000);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Warmup connection for minimum latency on first order
   * Call after login but before trading starts
   * 
   * OPTIMIZATIONS:
   * - Pre-load protobuf types
   * - Keep TCP connection "hot" with small pings
   * - Configure socket for trading
   */
  async warmup() {
    if (!this._socket) return false;
    
    try {
      // Ensure TCP_NODELAY is set
      this._socket.setNoDelay(true);
      
      // Set socket keep-alive to prevent idle disconnection
      // Aggressive keep-alive: probe every 10 seconds
      this._socket.setKeepAlive(true, 10000);
      
      // Pre-allocate socket buffer space
      if (this._socket.setRecvBufferSize) {
        this._socket.setRecvBufferSize(65536); // 64KB receive buffer
      }
      if (this._socket.setSendBufferSize) {
        this._socket.setSendBufferSize(65536); // 64KB send buffer
      }
      
      // Send a heartbeat to "warm up" the connection
      this.send('RequestHeartbeat', { templateId: REQ.HEARTBEAT });
      
      this.emit('warmedUp');
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Get connection diagnostics
   * @returns {Object}
   */
  getDiagnostics() {
    const diag = {
      state: this.state,
      isConnected: this.isConnected,
      hasSocket: !!this._socket,
      socketState: null,
    };
    
    if (this._socket) {
      diag.socketState = {
        readable: this._socket.readable,
        writable: this._socket.writable,
        bytesRead: this._socket.bytesRead,
        bytesWritten: this._socket.bytesWritten,
        localAddress: this._socket.localAddress,
        localPort: this._socket.localPort,
        remoteAddress: this._socket.remoteAddress,
        remotePort: this._socket.remotePort,
      };
    }
    
    return diag;
  }
}

module.exports = { RithmicConnection };
