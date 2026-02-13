/**
 * @fileoverview HQX Daemon Server - Persistent Rithmic Connection
 * @module services/daemon/server
 * 
 * The daemon maintains persistent connections to Rithmic API:
 * - ORDER_PLANT: Order placement & management
 * - PNL_PLANT: Real-time P&L updates
 * - TICKER_PLANT: Market data (when algo trading)
 * 
 * TUI clients connect via Unix socket and send commands.
 * Daemon survives TUI restarts/updates.
 * 
 * NO MOCK DATA - All data from real Rithmic API
 */

'use strict';

const net = require('net');
const fs = require('fs');
const EventEmitter = require('events');
const { SOCKET_DIR, SOCKET_PATH, PID_FILE, MSG_TYPE } = require('./constants');
const { createMessage, encode, MessageParser } = require('./protocol');
const { createHandlers, setupRithmicEvents } = require('./handlers');
const { logger } = require('../../utils/logger');

const log = logger.scope('Daemon');

/**
 * HQX Daemon Server
 * Maintains persistent Rithmic connections
 */
class DaemonServer extends EventEmitter {
  constructor() {
    super();
    
    /** @type {net.Server|null} */
    this.server = null;
    
    /** @type {Set<net.Socket>} Connected TUI clients */
    this.clients = new Set();
    
    /** @type {Map<net.Socket, MessageParser>} Client parsers */
    this.parsers = new Map();
    
    /** @type {Object|null} RithmicService instance */
    this.rithmic = null;
    
    /** @type {Object|null} Current propfirm info */
    this.propfirm = null;
    
    /** @type {boolean} */
    this.isRunning = false;
    
    /** @type {Map<string, Object>} Active algo sessions */
    this.algoSessions = new Map();
    
    /** @type {Object} Message handlers */
    this.handlers = createHandlers(this);
  }
  
  /**
   * Start the daemon server
   * @returns {Promise<boolean>}
   */
  async start() {
    if (this.isRunning) {
      log.warn('Daemon already running');
      return true;
    }
    
    // Ensure socket directory exists
    if (!fs.existsSync(SOCKET_DIR)) {
      fs.mkdirSync(SOCKET_DIR, { recursive: true, mode: 0o700 });
    }
    
    // Remove stale socket file
    if (fs.existsSync(SOCKET_PATH)) {
      try {
        fs.unlinkSync(SOCKET_PATH);
      } catch (err) {
        log.error('Failed to remove stale socket', { error: err.message });
        return false;
      }
    }
    
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => this._handleClient(socket));
      
      this.server.on('error', (err) => {
        log.error('Server error', { error: err.message });
        if (err.code === 'EADDRINUSE') {
          log.error('Socket in use - another daemon may be running');
        }
        resolve(false);
      });
      
      this.server.listen(SOCKET_PATH, () => {
        fs.chmodSync(SOCKET_PATH, 0o600);
        fs.writeFileSync(PID_FILE, process.pid.toString());
        
        this.isRunning = true;
        log.info('Daemon started', { socket: SOCKET_PATH, pid: process.pid });
        resolve(true);
      });
    });
  }
  
  /**
   * Handle new client connection
   * @param {net.Socket} socket
   */
  _handleClient(socket) {
    log.debug('Client connected');
    
    const parser = new MessageParser();
    this.clients.add(socket);
    this.parsers.set(socket, parser);
    
    socket.on('data', (data) => {
      const messages = parser.feed(data);
      for (const msg of messages) {
        this._handleMessage(socket, msg);
      }
    });
    
    socket.on('close', () => {
      log.debug('Client disconnected');
      this.clients.delete(socket);
      this.parsers.delete(socket);
    });
    
    socket.on('error', (err) => {
      log.warn('Client socket error', { error: err.message });
      this.clients.delete(socket);
      this.parsers.delete(socket);
    });
  }
  
  /**
   * Handle incoming message from client
   * @param {net.Socket} socket
   * @param {Object} msg
   */
  async _handleMessage(socket, msg) {
    const { id, type, data } = msg;
    const h = this.handlers;
    
    try {
      switch (type) {
        case MSG_TYPE.PING:
          this._send(socket, createMessage(MSG_TYPE.PONG, null, id));
          break;
          
        case MSG_TYPE.HANDSHAKE:
          this._send(socket, createMessage(MSG_TYPE.HANDSHAKE_ACK, {
            version: require('../../../package.json').version,
            connected: !!this.rithmic,
            propfirm: this.propfirm?.name || null,
          }, id));
          break;
          
        case MSG_TYPE.GET_STATUS:
          this._send(socket, createMessage(MSG_TYPE.STATUS, {
            connected: !!this.rithmic,
            propfirm: this.propfirm,
            accounts: this.rithmic?.accounts?.length || 0,
            algos: this.algoSessions.size,
          }, id));
          break;
          
        case MSG_TYPE.LOGIN:
          await h.handleLogin(socket, id, data);
          break;
          
        case MSG_TYPE.RESTORE_SESSION:
          await h.handleRestoreSession(socket, id);
          break;
          
        case MSG_TYPE.LOGOUT:
          await h.handleLogout(socket, id);
          break;
          
        case MSG_TYPE.GET_ACCOUNTS:
          await h.handleGetAccounts(socket, id);
          break;
          
        case MSG_TYPE.GET_POSITIONS:
          await h.handleGetPositions(socket, id);
          break;
          
        case MSG_TYPE.GET_ORDERS:
          await h.handleGetOrders(socket, id);
          break;
          
        case MSG_TYPE.GET_PNL:
          await h.handleGetPnL(socket, id, data);
          break;
          
        case MSG_TYPE.PLACE_ORDER:
          await h.handlePlaceOrder(socket, id, data);
          break;
          
        case MSG_TYPE.CANCEL_ORDER:
          await h.handleCancelOrder(socket, id, data);
          break;
          
        case MSG_TYPE.CANCEL_ALL:
          await h.handleCancelAll(socket, id, data);
          break;
          
        case MSG_TYPE.CLOSE_POSITION:
          await h.handleClosePosition(socket, id, data);
          break;
          
        case MSG_TYPE.GET_CONTRACTS:
          await h.handleGetContracts(socket, id);
          break;
          
        case MSG_TYPE.SEARCH_CONTRACTS:
          await h.handleSearchContracts(socket, id, data);
          break;
          
        case MSG_TYPE.SUBSCRIBE_MARKET:
          await h.handleSubscribeMarket(socket, id, data);
          break;
          
        case MSG_TYPE.UNSUBSCRIBE_MARKET:
          await h.handleUnsubscribeMarket(socket, id, data);
          break;
          
        case MSG_TYPE.START_ALGO:
          await h.handleStartAlgo(socket, id, data);
          break;
          
        case MSG_TYPE.STOP_ALGO:
          await h.handleStopAlgo(socket, id, data);
          break;
          
        case MSG_TYPE.SHUTDOWN:
          log.info('Shutdown requested by client');
          this._send(socket, createMessage(MSG_TYPE.STATUS, { shutdown: true }, id));
          setTimeout(() => this.stop(), 100);
          break;
          
        default:
          this._send(socket, createMessage(MSG_TYPE.ERROR, {
            message: `Unknown message type: ${type}`,
          }, id));
      }
    } catch (err) {
      log.error('Message handler error', { type, error: err.message });
      this._send(socket, createMessage(MSG_TYPE.ERROR, {
        message: err.message,
      }, id));
    }
  }
  
  /**
   * Setup Rithmic event forwarding (delegated)
   */
  _setupRithmicEvents() {
    setupRithmicEvents(this);
  }
  
  /**
   * Send message to specific client
   * @param {net.Socket} socket
   * @param {Object} msg
   */
  _send(socket, msg) {
    if (socket.writable) {
      socket.write(encode(msg));
    }
  }
  
  /**
   * Broadcast message to all connected clients
   * @param {Object} msg
   */
  _broadcast(msg) {
    const data = encode(msg);
    for (const socket of this.clients) {
      if (socket.writable) {
        socket.write(data);
      }
    }
  }
  
  /**
   * Stop the daemon server
   */
  async stop() {
    log.info('Stopping daemon...');
    
    // Stop all algo sessions
    for (const [id, session] of this.algoSessions) {
      try {
        session.stop();
      } catch (_) {}
    }
    this.algoSessions.clear();
    
    // Disconnect Rithmic
    if (this.rithmic) {
      try {
        await this.rithmic.disconnect();
      } catch (_) {}
      this.rithmic = null;
    }
    
    // Close all client connections
    for (const socket of this.clients) {
      socket.destroy();
    }
    this.clients.clear();
    
    // Close server
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    
    // Remove socket file
    if (fs.existsSync(SOCKET_PATH)) {
      fs.unlinkSync(SOCKET_PATH);
    }
    
    // Remove PID file
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE);
    }
    
    this.isRunning = false;
    log.info('Daemon stopped');
    
    process.exit(0);
  }
}

module.exports = { DaemonServer };
