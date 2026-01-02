/**
 * Tradovate Constants
 */

// Base URLs
const TRADOVATE_URLS = {
  // Live Trading
  LIVE_API: 'https://live.tradovateapi.com/v1',
  LIVE_MD_WS: 'wss://md.tradovateapi.com/v1/websocket',
  LIVE_TRADING_WS: 'wss://live.tradovateapi.com/v1/websocket',

  // Demo/Simulation Trading
  DEMO_API: 'https://demo.tradovateapi.com/v1',
  DEMO_MD_WS: 'wss://md-demo.tradovateapi.com/v1/websocket',
  DEMO_TRADING_WS: 'wss://demo.tradovateapi.com/v1/websocket',
};

// API Paths
const API_PATHS = {
  // Authentication
  AUTH_TOKEN_REQUEST: '/auth/accesstokenrequest',
  AUTH_RENEW_TOKEN: '/auth/renewaccesstoken',
  AUTH_ME: '/auth/me',

  // Account
  ACCOUNT_LIST: '/account/list',
  ACCOUNT_FIND: '/account/find',
  ACCOUNT_ITEM: '/account/item',

  // Cash Balance
  CASH_BALANCE_LIST: '/cashBalance/list',
  CASH_BALANCE_SNAPSHOT: '/cashBalance/getcashbalancesnapshot',

  // Contract
  CONTRACT_FIND: '/contract/find',
  CONTRACT_ITEM: '/contract/item',
  CONTRACT_SUGGEST: '/contract/suggest',

  // Product
  PRODUCT_LIST: '/product/list',
  PRODUCT_FIND: '/product/find',

  // Order
  ORDER_LIST: '/order/list',
  ORDER_PLACE: '/order/placeorder',
  ORDER_MODIFY: '/order/modifyorder',
  ORDER_CANCEL: '/order/cancelorder',
  ORDER_LIQUIDATE_POSITION: '/order/liquidateposition',

  // Position
  POSITION_LIST: '/position/list',
  POSITION_DEPS: '/position/deps',

  // Fill
  FILL_LIST: '/fill/list',
  FILL_DEPS: '/fill/deps',
};

// WebSocket Events
const WS_EVENTS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
  QUOTE: 'md/quote',
  DOM: 'md/dom',
  ORDER: 'order',
  FILL: 'fill',
  POSITION: 'position',
  ACCOUNT: 'account',
  CASH_BALANCE: 'cashBalance',
  HEARTBEAT: 'heartbeat',
};

// Token config
const TOKEN_CONFIG = {
  EXPIRATION_MINUTES: 90,
  RENEW_BEFORE_MINUTES: 15,
};

/**
 * Get base URL for Tradovate API
 */
function getBaseUrl(isDemo = true) {
  return isDemo ? TRADOVATE_URLS.DEMO_API : TRADOVATE_URLS.LIVE_API;
}

/**
 * Get WebSocket URL for trading
 */
function getTradingWebSocketUrl(isDemo = true) {
  return isDemo ? TRADOVATE_URLS.DEMO_TRADING_WS : TRADOVATE_URLS.LIVE_TRADING_WS;
}

/**
 * Get WebSocket URL for market data
 */
function getMdWebSocketUrl(isDemo = true) {
  return isDemo ? TRADOVATE_URLS.DEMO_MD_WS : TRADOVATE_URLS.LIVE_MD_WS;
}

module.exports = {
  TRADOVATE_URLS,
  API_PATHS,
  WS_EVENTS,
  TOKEN_CONFIG,
  getBaseUrl,
  getTradingWebSocketUrl,
  getMdWebSocketUrl,
};
