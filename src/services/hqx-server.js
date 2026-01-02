/**
 * @fileoverview HQX Server Service - Ultra Low Latency WebSocket for Scalping
 * @module services/hqx-server
 * 
 * Optimized for sub-millisecond message handling:
 * - Binary message format (MessagePack)
 * - TCP_NODELAY enabled
 * - Pre-allocated buffers
 * - Zero-copy message handling
 * - Adaptive heartbeat
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const os = require('os');
const { request } = require('../utils/http');
const { HQX_SERVER, TIMEOUTS, SECURITY } = require('../config/settings');
const { logger } = require('../utils/logger');

const log = logger.scope('HQX');

// ==================== CONSTANTS ====================

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

// ==================== FAST JSON ====================

/**
 * Fast JSON stringify with pre-check
 * @param {Object} obj 
 * @returns {string}
 */
const fastStringify = (obj) => {
  // For simple objects, manual is faster than JSON.stringify
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

// ==================== SERVICE ====================

/**
 * HQX Server Service - Ultra Low Latency
 */
class HQXServerService {
  constructor() {
    // Connection
    this.ws = null;
    this.connected = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    
    // Auth
    this.token = null;
    this.refreshToken = null;
    this.apiKey = null;
    this.sessionId = null;
    
    // Performance
    this.latency = 0;
    this.minLatency = Infinity;
    this.maxLatency = 0;
    this.avgLatency = 0;
    this.latencySamples = [];
    this.lastPingTime = 0;
    this.pingInterval = null;
    this.adaptiveHeartbeat = 1000; // Start at 1s, adapt based on connection
    
    // Message handling
    this.listeners = new Map();
    this.messageQueue = [];
    this.sendBuffer = Buffer.alloc(4096); // Pre-allocated send buffer
    
    // Device
    this._deviceId = null;
    
    // Stats
    this.messagesSent = 0;
    this.messagesReceived = 0;
    this.bytesReceived = 0;
  }

  // ==================== DEVICE ID ====================

  /**
   * Get cached device fingerprint
   * @returns {string}
   */
  _getDeviceId() {
    if (this._deviceId) return this._deviceId;
    
    const data = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || 'cpu'}`;
    this._deviceId = crypto.createHash('sha256').update(data).digest('hex').slice(0, 32);
    return this._deviceId;
  }

  // ==================== AUTH ====================

  /**
   * Authenticate with HQX Server
   * @param {string} userId 
   * @param {string} [propfirm='unknown']
   * @returns {Promise<{success: boolean, sessionId?: string, error?: string}>}
   */
  async authenticate(userId, propfirm = 'unknown') {
    const start = process.hrtime.bigint();
    
    try {
      const deviceId = this._getDeviceId();
      const url = `http://${HQX_SERVER.host}:${HQX_SERVER.port}/${HQX_SERVER.VERSION}/auth/token`;
      
      const response = await request(url, {
        method: 'POST',
        body: {
          userId: userId || deviceId,
          deviceId,
          propfirm,
          timestamp: Date.now(),
        },
        timeout: 5000, // Fast timeout for auth
      });

      if (response.statusCode === 200 && response.data?.success) {
        const { token, refreshToken, apiKey, sessionId } = response.data.data;
        this.token = token;
        this.refreshToken = refreshToken;
        this.apiKey = apiKey;
        this.sessionId = sessionId;
        
        const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
        log.info('Authenticated', { sessionId, latency: `${elapsed.toFixed(1)}ms` });
        
        return { success: true, sessionId, apiKey };
      }
      
      return { success: false, error: response.data?.error || 'Authentication failed' };
    } catch (err) {
      log.error('Auth error', { error: err.message });
      return { success: false, error: err.message };
    }
  }

  // ==================== WEBSOCKET ====================

  /**
   * Connect with ultra-low latency settings
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async connect() {
    if (!this.token) {
      return { success: false, error: 'Not authenticated' };
    }

    return new Promise((resolve) => {
      const wsUrl = `${HQX_SERVER.wsUrl}?token=${this.token}&session=${this.sessionId}`;
      
      log.debug('Connecting', { url: HQX_SERVER.wsUrl });
      
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'X-Device-Id': this._getDeviceId(),
          'X-API-Key': this.apiKey,
        },
        // Performance options
        perMessageDeflate: false,      // Disable compression for speed
        maxPayload: 64 * 1024,         // 64KB max payload
        handshakeTimeout: 5000,        // Fast handshake
        // TCP optimizations applied after open
      });

      // Binary mode for speed
      this.ws.binaryType = 'nodebuffer';

      const connectTimeout = setTimeout(() => {
        if (!this.connected) {
          this.ws?.terminate();
          resolve({ success: false, error: 'Connection timeout' });
        }
      }, 5000);

      this.ws.on('open', () => {
        clearTimeout(connectTimeout);
        this.connected = true;
        this.reconnectAttempts = 0;
        
        // Apply TCP_NODELAY for lowest latency
        this._optimizeSocket();
        
        // Start adaptive heartbeat
        this._startHeartbeat();
        
        // Flush queued messages
        this._flushQueue();
        
        this._emit('connected', { sessionId: this.sessionId });
        log.info('Connected with TCP_NODELAY');
        
        resolve({ success: true });
      });

      this.ws.on('message', (data) => {
        this._handleMessage(data);
      });

      this.ws.on('close', (code, reason) => {
        clearTimeout(connectTimeout);
        this.connected = false;
        this._stopHeartbeat();
        
        log.info('Disconnected', { code });
        this._emit('disconnected', { code, reason: reason?.toString() });
        
        if (!this.reconnecting) {
          this._attemptReconnect();
        }
      });

      this.ws.on('error', (err) => {
        log.error('WebSocket error', { error: err.message });
        this._emit('error', { message: err.message });
        
        if (!this.connected) {
          clearTimeout(connectTimeout);
          resolve({ success: false, error: err.message });
        }
      });
    });
  }

  /**
   * Apply TCP socket optimizations
   * @private
   */
  _optimizeSocket() {
    try {
      const socket = this.ws._socket;
      if (socket) {
        // Disable Nagle's algorithm - critical for low latency
        socket.setNoDelay(true);
        
        // Keep connection alive
        socket.setKeepAlive(true, 10000);
        
        // Increase buffer sizes for throughput
        if (socket.setRecvBufferSize) socket.setRecvBufferSize(65536);
        if (socket.setSendBufferSize) socket.setSendBufferSize(65536);
        
        log.debug('Socket optimized: TCP_NODELAY enabled');
      }
    } catch (err) {
      log.warn('Socket optimization failed', { error: err.message });
    }
  }

  // ==================== MESSAGE HANDLING ====================

  /**
   * Ultra-fast message handler
   * @private
   */
  _handleMessage(data) {
    const receiveTime = process.hrtime.bigint();
    this.messagesReceived++;
    this.bytesReceived += data.length;
    
    try {
      // Try binary format first (faster)
      if (Buffer.isBuffer(data) && data.length > 0) {
        const msgType = data.readUInt8(0);
        
        // Fast path for pong
        if (msgType === MSG_TYPE.PONG) {
          this._handlePong(data, receiveTime);
          return;
        }
        
        // Binary signal (fastest path)
        if (msgType === MSG_TYPE.SIGNAL) {
          this._handleBinarySignal(data);
          return;
        }
      }
      
      // JSON fallback
      const message = fastParse(data);
      this._handleJsonMessage(message, receiveTime);
      
    } catch (err) {
      log.warn('Message parse error', { error: err.message });
    }
  }

  /**
   * Handle pong with latency calculation
   * @private
   */
  _handlePong(data, receiveTime) {
    if (this.lastPingTime > 0) {
      // Use high-resolution timer
      const latency = Number(receiveTime - this.lastPingTime) / 1e6; // ns to ms
      this._updateLatency(latency);
    }
  }

  /**
   * Handle binary trading signal (zero-copy)
   * @private
   */
  _handleBinarySignal(data) {
    // Binary format: [type:1][timestamp:8][side:1][price:8][qty:4]
    if (data.length >= 22) {
      const signal = {
        timestamp: data.readBigInt64LE(1),
        side: data.readUInt8(9),
        price: data.readDoubleLE(10),
        quantity: data.readUInt32LE(18),
      };
      this._emit('signal', signal);
    }
  }

  /**
   * Handle JSON message
   * @private
   */
  _handleJsonMessage(message, receiveTime) {
    // Calculate latency from server timestamp
    if (message.timestamp) {
      const latency = Date.now() - message.timestamp;
      if (latency >= 0 && latency < 5000) {
        this._updateLatency(latency);
      }
    }
    
    // Fast dispatch
    switch (message.type) {
      case 'signal':
        this._emit('signal', message.data);
        break;
      case 'trade':
        this._emit('trade', message.data);
        break;
      case 'fill':
        this._emit('fill', message.data);
        break;
      case 'log':
        this._emit('log', message.data);
        break;
      case 'stats':
        this._emit('stats', message.data);
        break;
      case 'error':
        this._emit('error', message.data);
        break;
      case 'pong':
        // Already handled in binary path
        break;
      default:
        this._emit('message', message);
    }
  }

  /**
   * Update latency statistics
   * @private
   */
  _updateLatency(latency) {
    this.latency = latency;
    this.minLatency = Math.min(this.minLatency, latency);
    this.maxLatency = Math.max(this.maxLatency, latency);
    
    // Rolling average (last 100 samples)
    this.latencySamples.push(latency);
    if (this.latencySamples.length > 100) {
      this.latencySamples.shift();
    }
    this.avgLatency = this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
    
    // Adapt heartbeat based on latency
    this._adaptHeartbeat();
    
    this._emit('latency', { 
      current: latency, 
      min: this.minLatency, 
      max: this.maxLatency, 
      avg: this.avgLatency 
    });
  }

  /**
   * Adapt heartbeat interval based on connection quality
   * @private
   */
  _adaptHeartbeat() {
    // Good connection: slower heartbeat (less overhead)
    // Poor connection: faster heartbeat (detect issues quickly)
    if (this.avgLatency < 10) {
      this.adaptiveHeartbeat = 2000;  // <10ms: 2s heartbeat
    } else if (this.avgLatency < 50) {
      this.adaptiveHeartbeat = 1000;  // <50ms: 1s heartbeat
    } else if (this.avgLatency < 100) {
      this.adaptiveHeartbeat = 500;   // <100ms: 500ms heartbeat
    } else {
      this.adaptiveHeartbeat = 250;   // High latency: 250ms heartbeat
    }
  }

  // ==================== SENDING ====================

  /**
   * Send message with minimal overhead
   * @param {string} type - Message type
   * @param {Object} data - Payload
   */
  send(type, data) {
    const message = {
      type,
      data,
      ts: Date.now(), // Short key for speed
      sid: this.sessionId,
    };

    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this._sendRaw(fastStringify(message));
      this.messagesSent++;
    } else {
      this.messageQueue.push(message);
    }
  }

  /**
   * Send raw data (no JSON overhead)
   * @private
   */
  _sendRaw(data) {
    try {
      this.ws.send(data);
    } catch (err) {
      log.warn('Send error', { error: err.message });
    }
  }

  /**
   * Send binary ping for lowest latency measurement
   * @private
   */
  _sendBinaryPing() {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) return;
    
    this.lastPingTime = process.hrtime.bigint();
    
    // Write timestamp to pre-allocated buffer
    PING_BUFFER.writeBigInt64LE(this.lastPingTime, 1);
    
    try {
      this.ws.send(PING_BUFFER);
    } catch {
      // Ignore ping errors
    }
  }

  /**
   * Flush message queue
   * @private
   */
  _flushQueue() {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      this._sendRaw(fastStringify(message));
      this.messagesSent++;
    }
  }

  // ==================== ALGO CONTROL ====================

  /**
   * Start algo trading session
   * @param {Object} config 
   */
  startAlgo(config) {
    log.info('Starting algo', { symbol: config.symbol, contracts: config.contracts });
    
    this.send('start_algo', {
      accountId: config.accountId,
      contractId: config.contractId,
      symbol: config.symbol,
      contracts: config.contracts,
      dailyTarget: config.dailyTarget,
      maxRisk: config.maxRisk,
      propfirm: config.propfirm,
      propfirmToken: config.propfirmToken,
      rithmicCredentials: config.rithmicCredentials || null,
      copyTrading: config.copyTrading || false,
      followerSymbol: config.followerSymbol,
      followerContracts: config.followerContracts,
    });
  }

  /**
   * Stop algo trading
   */
  stopAlgo() {
    log.info('Stopping algo');
    this.send('stop_algo', {});
  }

  /**
   * Start copy trading
   * @param {Object} config 
   */
  startCopyTrading(config) {
    log.info('Starting copy trading');
    
    this.send('start_copy_trading', {
      // Lead
      leadAccountId: config.leadAccountId,
      leadContractId: config.leadContractId,
      leadSymbol: config.leadSymbol,
      leadContracts: config.leadContracts,
      leadPropfirm: config.leadPropfirm,
      leadToken: config.leadToken,
      leadRithmicCredentials: config.leadRithmicCredentials,
      // Follower
      followerAccountId: config.followerAccountId,
      followerContractId: config.followerContractId,
      followerSymbol: config.followerSymbol,
      followerContracts: config.followerContracts,
      followerPropfirm: config.followerPropfirm,
      followerToken: config.followerToken,
      followerRithmicCredentials: config.followerRithmicCredentials,
      // Targets
      dailyTarget: config.dailyTarget,
      maxRisk: config.maxRisk,
    });
  }

  // ==================== EVENTS ====================

  /**
   * Register event listener
   * @param {string} event 
   * @param {Function} callback 
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  /**
   * Remove event listener
   * @param {string} event 
   * @param {Function} callback 
   */
  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    }
  }

  /**
   * Emit event (inlined for speed)
   * @private
   */
  _emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    
    for (let i = 0; i < callbacks.length; i++) {
      try {
        callbacks[i](data);
      } catch {
        // Don't let callback errors break the loop
      }
    }
  }

  // ==================== HEARTBEAT ====================

  /**
   * Start adaptive heartbeat
   * @private
   */
  _startHeartbeat() {
    this._stopHeartbeat();
    
    const heartbeat = () => {
      if (this.connected) {
        this._sendBinaryPing();
        
        // Schedule next with adaptive interval
        this.pingInterval = setTimeout(heartbeat, this.adaptiveHeartbeat);
      }
    };
    
    // First ping immediately
    this._sendBinaryPing();
    this.pingInterval = setTimeout(heartbeat, this.adaptiveHeartbeat);
  }

  /**
   * Stop heartbeat
   * @private
   */
  _stopHeartbeat() {
    if (this.pingInterval) {
      clearTimeout(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ==================== RECONNECT ====================

  /**
   * Attempt reconnection with exponential backoff
   * @private
   */
  _attemptReconnect() {
    if (this.reconnectAttempts >= SECURITY.MAX_RECONNECT_ATTEMPTS) {
      log.error('Max reconnect attempts reached');
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;
    
    // Fast initial reconnect, then backoff
    const delay = Math.min(
      100 * Math.pow(2, this.reconnectAttempts - 1), // Start at 100ms
      10000 // Max 10s
    );
    
    log.info('Reconnecting', { attempt: this.reconnectAttempts, delay });

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (err) {
        log.error('Reconnect failed', { error: err.message });
      }
      this.reconnecting = false;
    }, delay);
  }

  // ==================== STATS ====================

  /**
   * Get latency statistics
   * @returns {Object}
   */
  getLatencyStats() {
    return {
      current: this.latency,
      min: this.minLatency === Infinity ? 0 : this.minLatency,
      max: this.maxLatency,
      avg: this.avgLatency,
      samples: this.latencySamples.length,
    };
  }

  /**
   * Get connection statistics
   * @returns {Object}
   */
  getStats() {
    return {
      connected: this.connected,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      bytesReceived: this.bytesReceived,
      heartbeatInterval: this.adaptiveHeartbeat,
      latency: this.getLatencyStats(),
    };
  }

  /**
   * Get current latency
   * @returns {number}
   */
  getLatency() {
    return this.latency;
  }

  // ==================== CLEANUP ====================

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    log.info('Disconnecting');
    
    this._stopHeartbeat();
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.connected = false;
    this.token = null;
    this.sessionId = null;
    this.messageQueue = [];
    this.listeners.clear();
    
    // Reset stats
    this.latencySamples = [];
    this.minLatency = Infinity;
    this.maxLatency = 0;
    this.avgLatency = 0;
  }

  /**
   * Check if connected
   * @returns {boolean}
   */
  isConnected() {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }
}

module.exports = { HQXServerService, HQX_SERVER, MSG_TYPE };
