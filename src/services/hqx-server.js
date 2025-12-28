/**
 * HQX Server Service
 * Secure WebSocket connection to HQX Algo Server
 * All algo logic runs server-side - CLI only receives signals
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const https = require('https');

// HQX Server Configuration
const HQX_CONFIG = {
  apiUrl: 'https://api.hedgequantx.com',
  wsUrl: 'wss://ws.hedgequantx.com',
  version: 'v1'
};

class HQXServerService {
  constructor() {
    this.ws = null;
    this.token = null;
    this.apiKey = null;
    this.sessionId = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.listeners = new Map();
    this.heartbeatInterval = null;
    this.messageQueue = [];
  }

  /**
   * Generate device fingerprint for security
   */
  _generateDeviceId() {
    const os = require('os');
    const data = `${os.hostname()}-${os.platform()}-${os.arch()}-${os.cpus()[0]?.model || 'unknown'}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  /**
   * HTTPS request helper
   */
  _request(endpoint, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${HQX_CONFIG.apiUrl}/${HQX_CONFIG.version}${endpoint}`);
      
      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Device-Id': this._generateDeviceId()
        }
      };

      if (this.token) {
        options.headers['Authorization'] = `Bearer ${this.token}`;
      }
      if (this.apiKey) {
        options.headers['X-API-Key'] = this.apiKey;
      }

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            resolve({ statusCode: res.statusCode, data: json });
          } catch (e) {
            resolve({ statusCode: res.statusCode, data: body });
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  /**
   * Authenticate with HQX Server
   */
  async authenticate(apiKey) {
    try {
      const response = await this._request('/auth/token', 'POST', {
        apiKey: apiKey,
        deviceId: this._generateDeviceId(),
        timestamp: Date.now()
      });

      if (response.statusCode === 200 && response.data.success) {
        this.token = response.data.token;
        this.apiKey = apiKey;
        this.sessionId = response.data.sessionId;
        return { success: true, sessionId: this.sessionId };
      } else {
        return { 
          success: false, 
          error: response.data.error || 'Authentication failed' 
        };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Connect to WebSocket server
   */
  async connect() {
    return new Promise((resolve, reject) => {
      if (!this.token) {
        reject(new Error('Not authenticated'));
        return;
      }

      const wsUrl = `${HQX_CONFIG.wsUrl}?token=${this.token}&session=${this.sessionId}`;
      
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'X-Device-Id': this._generateDeviceId(),
          'X-API-Key': this.apiKey
        }
      });

      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        this._startHeartbeat();
        this._flushMessageQueue();
        this._emit('connected', { sessionId: this.sessionId });
        resolve({ success: true });
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this._handleMessage(message);
        } catch (e) {
          // Invalid message format
        }
      });

      this.ws.on('close', (code, reason) => {
        this.connected = false;
        this._stopHeartbeat();
        this._emit('disconnected', { code, reason: reason.toString() });
        this._attemptReconnect();
      });

      this.ws.on('error', (error) => {
        this._emit('error', { message: error.message });
        if (!this.connected) {
          reject(error);
        }
      });

      // Timeout for connection
      setTimeout(() => {
        if (!this.connected) {
          this.ws.terminate();
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  /**
   * Handle incoming messages
   */
  _handleMessage(message) {
    switch (message.type) {
      case 'signal':
        this._emit('signal', message.data);
        break;
      case 'trade':
        this._emit('trade', message.data);
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
        // Heartbeat response
        break;
      default:
        this._emit('message', message);
    }
  }

  /**
   * Send message to server
   */
  send(type, data) {
    const message = {
      type,
      data,
      timestamp: Date.now(),
      sessionId: this.sessionId
    };

    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      this.messageQueue.push(message);
    }
  }

  /**
   * Start algo trading session
   */
  startAlgo(config) {
    this.send('start_algo', {
      accountId: config.accountId,
      contractId: config.contractId,
      symbol: config.symbol,
      contracts: config.contracts,
      dailyTarget: config.dailyTarget,
      maxRisk: config.maxRisk,
      propfirm: config.propfirm,
      propfirmToken: config.propfirmToken
    });
  }

  /**
   * Stop algo trading session
   */
  stopAlgo() {
    this.send('stop_algo', {});
  }

  /**
   * Event listeners
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  _emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          // Callback error
        }
      });
    }
  }

  /**
   * Heartbeat to keep connection alive
   */
  _startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.connected) {
        this.send('ping', { timestamp: Date.now() });
      }
    }, 30000);
  }

  _stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Flush queued messages after reconnect
   */
  _flushMessageQueue() {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(message));
      }
    }
  }

  /**
   * Attempt to reconnect
   */
  _attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      
      setTimeout(() => {
        this.connect().catch(() => {
          // Reconnect failed
        });
      }, delay);
    }
  }

  /**
   * Disconnect from server
   */
  disconnect() {
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.token = null;
    this.sessionId = null;
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

module.exports = { HQXServerService, HQX_CONFIG };
