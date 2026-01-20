/**
 * Rithmic Connection Manager
 * Handles WebSocket connection and heartbeat
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const os = require('os');
const { proto } = require('./protobuf');
const { REQ, RES, INFRA_TYPE } = require('./constants');

/**
 * Get MAC address from network interfaces
 */
function getMacAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (!iface.internal && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac;
      }
    }
  }
  return '00:00:00:00:00:00';
}

class RithmicConnection extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.config = null;
    this.state = 'DISCONNECTED';
    this.heartbeatTimer = null;
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get connectionState() {
    return this.state;
  }

  /**
   * Connect to Rithmic server
   */
  async connect(config) {
    this.config = config;
    this.state = 'CONNECTING';

    await proto.load();

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(config.uri, { rejectUnauthorized: false });

      this.ws.on('open', () => {
        this.state = 'CONNECTED';
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
      macAddr: [getMacAddress()],
      osVersion: os.release(),
      osPlatform: os.platform(),
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
}

module.exports = { RithmicConnection };
