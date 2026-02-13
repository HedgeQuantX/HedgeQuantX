/**
 * @fileoverview Daemon Constants
 * @module services/daemon/constants
 * 
 * Configuration for HQX Daemon - persistent Rithmic connection service
 */

'use strict';

const os = require('os');
const path = require('path');

/** Daemon socket path */
const SOCKET_DIR = path.join(os.homedir(), '.hedgequantx');
const SOCKET_PATH = path.join(SOCKET_DIR, 'hqx.sock');

/** Daemon PID file */
const PID_FILE = path.join(SOCKET_DIR, 'daemon.pid');

/** IPC Protocol version */
const PROTOCOL_VERSION = 1;

/** Message types for IPC communication */
const MSG_TYPE = {
  // Connection
  PING: 'ping',
  PONG: 'pong',
  HANDSHAKE: 'handshake',
  HANDSHAKE_ACK: 'handshake_ack',
  
  // Auth
  LOGIN: 'login',
  LOGIN_RESULT: 'login_result',
  LOGOUT: 'logout',
  RESTORE_SESSION: 'restore_session',
  
  // Data requests
  GET_ACCOUNTS: 'get_accounts',
  GET_POSITIONS: 'get_positions',
  GET_ORDERS: 'get_orders',
  GET_PNL: 'get_pnl',
  GET_STATUS: 'get_status',
  GET_CONTRACTS: 'get_contracts',
  SEARCH_CONTRACTS: 'search_contracts',
  
  // Data responses
  ACCOUNTS: 'accounts',
  POSITIONS: 'positions',
  ORDERS: 'orders',
  PNL: 'pnl',
  STATUS: 'status',
  CONTRACTS: 'contracts',
  
  // Trading
  PLACE_ORDER: 'place_order',
  CANCEL_ORDER: 'cancel_order',
  CANCEL_ALL: 'cancel_all',
  CLOSE_POSITION: 'close_position',
  ORDER_RESULT: 'order_result',
  
  // Market data
  SUBSCRIBE_MARKET: 'subscribe_market',
  UNSUBSCRIBE_MARKET: 'unsubscribe_market',
  MARKET_DATA: 'market_data',
  TICK: 'tick',
  
  // Algo trading
  START_ALGO: 'start_algo',
  STOP_ALGO: 'stop_algo',
  ALGO_STATUS: 'algo_status',
  ALGO_LOG: 'algo_log',
  
  // Events (daemon → TUI push)
  EVENT_ORDER_UPDATE: 'event_order_update',
  EVENT_POSITION_UPDATE: 'event_position_update',
  EVENT_PNL_UPDATE: 'event_pnl_update',
  EVENT_FILL: 'event_fill',
  EVENT_DISCONNECTED: 'event_disconnected',
  EVENT_RECONNECTED: 'event_reconnected',
  
  // Errors
  ERROR: 'error',
  
  // Daemon control
  SHUTDOWN: 'shutdown',
};

/** Timeouts */
const TIMEOUTS = {
  HANDSHAKE: 5000,
  REQUEST: 30000,
  LOGIN: 60000,
  PING_INTERVAL: 10000,
  PING_TIMEOUT: 5000,
};

module.exports = {
  SOCKET_DIR,
  SOCKET_PATH,
  PID_FILE,
  PROTOCOL_VERSION,
  MSG_TYPE,
  TIMEOUTS,
};
