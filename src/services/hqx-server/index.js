/**
 * @fileoverview HQX Server Service - Ultra Low Latency WebSocket
 * @module services/hqx-server
 * 
 * STRICT RULE: No mock data, real API only
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const os = require('os');
const { request } = require('../../utils/http');
const { HQX_SERVER, SECURITY } = require('../../config/settings');
const { logger } = require('../../utils/logger');
const { MSG_TYPE, PING_BUFFER, fastStringify, fastParse } = require('./constants');
const { LatencyTracker } = require('./latency');

const log = logger.scope('HQX');

/**
 * HQX Server Service - Ultra Low Latency
 */
class HQXServerService {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    
    this.token = null;
    this.refreshToken = null;
    this.apiKey = null;
    this.sessionId = null;
    
    this.latencyTracker = new LatencyTracker();
    this.lastPingTime = 0;
    this.pingInterval = null;
    
    this.listeners = new Map();
    this.messageQueue = [];
    this._deviceId = null;
    
    this.messagesSent = 0;
    this.messagesReceived = 0;
    this.bytesReceived = 0;
  }

  // ==================== DEVICE ID ====================

  _getDeviceId() {
    if (this._deviceId) return this._deviceId;
    const data = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || 'cpu'}`;
    this._deviceId = crypto.createHash('sha256').update(data).digest('hex').slice(0, 32);
    return this._deviceId;
  }

  // ==================== AUTH ====================

  async authenticate(userId, propfirm = 'unknown') {
    const start = process.hrtime.bigint();
    
    try {
      const deviceId = this._getDeviceId();
      const url = `http://${HQX_SERVER.host}:${HQX_SERVER.port}/${HQX_SERVER.VERSION}/auth/token`;
      
      const response = await request(url, {
        method: 'POST',
        body: { userId: userId || deviceId, deviceId, propfirm, timestamp: Date.now() },
        timeout: 5000,
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

  async connect() {
    if (!this.token) return { success: false, error: 'Not authenticated' };

    return new Promise((resolve) => {
      const wsUrl = `${HQX_SERVER.wsUrl}?token=${this.token}&session=${this.sessionId}`;
      
      this.ws = new WebSocket(wsUrl, {
        headers: { 'X-Device-Id': this._getDeviceId(), 'X-API-Key': this.apiKey },
        perMessageDeflate: false,
        maxPayload: 64 * 1024,
        handshakeTimeout: 5000,
      });

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
        this._optimizeSocket();
        this._startHeartbeat();
        this._flushQueue();
        this._emit('connected', { sessionId: this.sessionId });
        log.info('Connected with TCP_NODELAY');
        resolve({ success: true });
      });

      this.ws.on('message', (data) => this._handleMessage(data));

      this.ws.on('close', (code, reason) => {
        clearTimeout(connectTimeout);
        this.connected = false;
        this._stopHeartbeat();
        log.info('Disconnected', { code });
        this._emit('disconnected', { code, reason: reason?.toString() });
        if (!this.reconnecting) this._attemptReconnect();
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

  _optimizeSocket() {
    try {
      const socket = this.ws._socket;
      if (socket) {
        socket.setNoDelay(true);
        socket.setKeepAlive(true, 10000);
      }
    } catch (err) {
      log.warn('Socket optimization failed', { error: err.message });
    }
  }

  // ==================== MESSAGE HANDLING ====================

  _handleMessage(data) {
    const receiveTime = process.hrtime.bigint();
    this.messagesReceived++;
    this.bytesReceived += data.length;
    
    try {
      if (Buffer.isBuffer(data) && data.length > 0) {
        const msgType = data.readUInt8(0);
        
        if (msgType === MSG_TYPE.PONG) {
          this._handlePong(receiveTime);
          return;
        }
        
        if (msgType === MSG_TYPE.SIGNAL) {
          this._handleBinarySignal(data);
          return;
        }
      }
      
      const message = fastParse(data);
      this._handleJsonMessage(message);
    } catch (err) {
      log.warn('Message parse error', { error: err.message });
    }
  }

  _handlePong(receiveTime) {
    if (this.lastPingTime > 0) {
      const latency = Number(receiveTime - this.lastPingTime) / 1e6;
      this.latencyTracker.update(latency);
      this._emit('latency', this.latencyTracker.getStats());
    }
  }

  _handleBinarySignal(data) {
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

  _handleJsonMessage(message) {
    if (message.timestamp) {
      const latency = Date.now() - message.timestamp;
      if (latency >= 0 && latency < 5000) {
        this.latencyTracker.update(latency);
      }
    }
    
    switch (message.type) {
      case 'signal': this._emit('signal', message.data); break;
      case 'trade': this._emit('trade', message.data); break;
      case 'fill': this._emit('fill', message.data); break;
      case 'log': this._emit('log', message.data); break;
      case 'stats': this._emit('stats', message.data); break;
      case 'error': this._emit('error', message.data); break;
      default: this._emit('message', message);
    }
  }

  // ==================== SENDING ====================

  send(type, data) {
    const message = { type, data, ts: Date.now(), sid: this.sessionId };

    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      try { this.ws.send(fastStringify(message)); } catch {}
      this.messagesSent++;
    } else {
      this.messageQueue.push(message);
    }
  }

  _sendBinaryPing() {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) return;
    this.lastPingTime = process.hrtime.bigint();
    PING_BUFFER.writeBigInt64LE(this.lastPingTime, 1);
    try { this.ws.send(PING_BUFFER); } catch {}
  }

  _flushQueue() {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      try { this.ws.send(fastStringify(message)); } catch {}
      this.messagesSent++;
    }
  }

  // ==================== ALGO CONTROL ====================

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

  stopAlgo() {
    log.info('Stopping algo');
    this.send('stop_algo', {});
  }

  startCopyTrading(config) {
    log.info('Starting copy trading');
    this.send('start_copy_trading', {
      leadAccountId: config.leadAccountId,
      leadContractId: config.leadContractId,
      leadSymbol: config.leadSymbol,
      leadContracts: config.leadContracts,
      leadPropfirm: config.leadPropfirm,
      leadToken: config.leadToken,
      leadRithmicCredentials: config.leadRithmicCredentials,
      followerAccountId: config.followerAccountId,
      followerContractId: config.followerContractId,
      followerSymbol: config.followerSymbol,
      followerContracts: config.followerContracts,
      followerPropfirm: config.followerPropfirm,
      followerToken: config.followerToken,
      followerRithmicCredentials: config.followerRithmicCredentials,
      dailyTarget: config.dailyTarget,
      maxRisk: config.maxRisk,
    });
  }

  // ==================== EVENTS ====================

  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) callbacks.splice(index, 1);
    }
  }

  _emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    for (let i = 0; i < callbacks.length; i++) {
      try { callbacks[i](data); } catch {}
    }
  }

  // ==================== HEARTBEAT ====================

  _startHeartbeat() {
    this._stopHeartbeat();
    const heartbeat = () => {
      if (this.connected) {
        this._sendBinaryPing();
        this.pingInterval = setTimeout(heartbeat, this.latencyTracker.adaptiveHeartbeat);
      }
    };
    this._sendBinaryPing();
    this.pingInterval = setTimeout(heartbeat, this.latencyTracker.adaptiveHeartbeat);
  }

  _stopHeartbeat() {
    if (this.pingInterval) {
      clearTimeout(this.pingInterval);
      this.pingInterval = null;
    }
  }

  // ==================== RECONNECT ====================

  _attemptReconnect() {
    if (this.reconnectAttempts >= SECURITY.MAX_RECONNECT_ATTEMPTS) {
      log.error('Max reconnect attempts reached');
      return;
    }

    this.reconnecting = true;
    this.reconnectAttempts++;
    const delay = Math.min(100 * Math.pow(2, this.reconnectAttempts - 1), 10000);
    
    log.info('Reconnecting', { attempt: this.reconnectAttempts, delay });

    setTimeout(async () => {
      try { await this.connect(); } catch {}
      this.reconnecting = false;
    }, delay);
  }

  // ==================== STATS & CLEANUP ====================

  getLatencyStats() { return this.latencyTracker.getStats(); }
  getLatency() { return this.latencyTracker.latency; }
  isConnected() { return this.connected && this.ws?.readyState === WebSocket.OPEN; }

  getStats() {
    return {
      connected: this.connected,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      bytesReceived: this.bytesReceived,
      heartbeatInterval: this.latencyTracker.adaptiveHeartbeat,
      latency: this.getLatencyStats(),
    };
  }

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
    this.latencyTracker.reset();
  }
}

module.exports = { HQXServerService, HQX_SERVER, MSG_TYPE };
