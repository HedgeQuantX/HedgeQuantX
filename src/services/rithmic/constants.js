/**
 * Rithmic Constants
 */

// Endpoints
const RITHMIC_ENDPOINTS = {
  TEST: 'wss://rituz00100.rithmic.com:443',
  PAPER: 'wss://ritpa11120.11.rithmic.com:443',
  LIVE: 'wss://ritpz01000.01.rithmic.com:443',
  // Production gateways for prop firms (discovered via RequestRithmicSystemGatewayInfo)
  CHICAGO: 'wss://rprotocol.rithmic.com:443',        // Chicago Area (primary for US)
  EUROPE: 'wss://rprotocol-ie.rithmic.com:443',      // Europe (Ireland)
  FRANKFURT: 'wss://rprotocol-de.rithmic.com:443',   // Frankfurt
  SINGAPORE: 'wss://rprotocol-sg.rithmic.com:443',   // Singapore
  SYDNEY: 'wss://rprotocol-au.rithmic.com:443',      // Sydney
  TOKYO: 'wss://rprotocol-jp.rithmic.com:443',       // Tokyo
  HONG_KONG: 'wss://rprotocol-hk.rithmic.com:443',   // Hong Kong
  SEOUL: 'wss://rprotocol-kr.rithmic.com:443',       // Seoul
  MUMBAI: 'wss://rprotocol-in.rithmic.com:443',      // Mumbai
  SAO_PAULO: 'wss://rprotocol-br.rithmic.com:443',   // Sao Paulo
  CAPE_TOWN: 'wss://rprotocol-za.rithmic.com:443',   // Cape Town
};

// System names for PropFirms
const RITHMIC_SYSTEMS = {
  TEST: 'Rithmic Test',
  PAPER: 'Rithmic Paper Trading',
  APEX: 'Apex',
  TOPSTEP: 'TopstepTrader',
  MES_CAPITAL: 'MES Capital',
  BULENOX: 'Bulenox',
  TRADEFUNDRR: 'TradeFundrr',
  THE_TRADING_PIT: 'TheTradingPit',
  FUNDED_FUTURES_NETWORK: 'FundedFuturesNetwork',
  PROPSHOP_TRADER: 'PropShopTrader',
  FOUR_PROP_TRADER: '4PropTrader',
  DAY_TRADERS: 'DayTraders.com',
  TEN_X_FUTURES: '10XFutures',
  LUCID_TRADING: 'LucidTrading',
  THRIVE_TRADING: 'ThriveTrading',
  LEGENDS_TRADING: 'LegendsTrading',
  EARN_2_TRADE: 'Earn2Trade',
};

// Infrastructure types
const INFRA_TYPE = {
  TICKER_PLANT: 1,
  ORDER_PLANT: 2,
  HISTORY_PLANT: 3,
  PNL_PLANT: 4,
  REPOSITORY_PLANT: 5,
};

// Request template IDs
const REQ = {
  LOGIN: 10,
  LOGOUT: 12,
  SYSTEM_INFO: 16,
  HEARTBEAT: 18,
  MARKET_DATA: 100,
  PRODUCT_CODES: 111,
  FRONT_MONTH_CONTRACT: 113,
  TICK_BAR_REPLAY: 200,    // History plant - request bar data
  LOGIN_INFO: 300,
  ACCOUNT_LIST: 302,
  ACCOUNT_RMS: 304,
  PRODUCT_RMS: 306,
  ORDER_UPDATES: 308,
  TRADE_ROUTES: 310,
  NEW_ORDER: 312,
  MODIFY_ORDER: 314,
  CANCEL_ORDER: 316,
  SHOW_ORDER_HISTORY_DATES: 318,
  SHOW_ORDERS: 320,
  SHOW_ORDER_HISTORY: 324,
  BRACKET_ORDER: 330,
  CANCEL_ALL_ORDERS: 346,
  EXIT_POSITION: 3504,
  PNL_POSITION_UPDATES: 400,
  PNL_POSITION_SNAPSHOT: 402,
};

// Response template IDs
const RES = {
  LOGIN: 11,
  LOGOUT: 13,
  SYSTEM_INFO: 17,
  HEARTBEAT: 19,
  MARKET_DATA: 101,
  PRODUCT_CODES: 112,
  FRONT_MONTH_CONTRACT: 114,
  TICK_BAR_REPLAY: 201,    // History plant - bar data response
  LOGIN_INFO: 301,
  ACCOUNT_LIST: 303,
  ACCOUNT_RMS: 305,
  PRODUCT_RMS: 307,
  ORDER_UPDATES: 309,
  TRADE_ROUTES: 311,
  NEW_ORDER: 313,
  MODIFY_ORDER: 315,
  CANCEL_ORDER: 317,
  SHOW_ORDER_HISTORY_DATES: 319,
  SHOW_ORDERS: 321,
  SHOW_ORDER_HISTORY: 325,
  BRACKET_ORDER: 331,
  CANCEL_ALL_ORDERS: 347,
  EXIT_POSITION: 3505,
  PNL_POSITION_UPDATES: 401,
  PNL_POSITION_SNAPSHOT: 403,
};

// Streaming template IDs
const STREAM = {
  LAST_TRADE: 150,
  BBO: 151,
  TRADE_ROUTE_UPDATE: 350,
  ORDER_NOTIFICATION: 351,
  EXCHANGE_NOTIFICATION: 352,
  BRACKET_UPDATE: 353,
  INSTRUMENT_PNL_UPDATE: 450,
  ACCOUNT_PNL_UPDATE: 451,
};

// Proto files to load
const PROTO_FILES = [
  'base.proto',
  'request_heartbeat.proto',
  'response_heartbeat.proto',
  'request_rithmic_system_info.proto',
  'response_rithmic_system_info.proto',
  'request_login.proto',
  'response_login.proto',
  'request_logout.proto',
  'response_logout.proto',
  'request_login_info.proto',
  'response_login_info.proto',
  'request_account_list.proto',
  'response_account_list.proto',
  'request_tick_bar_replay.proto',
  'response_tick_bar_replay.proto',
  'request_trade_routes.proto',
  'response_trade_routes.proto',
  'request_subscribe_for_order_updates.proto',
  'response_subscribe_for_order_updates.proto',
  'request_new_order.proto',
  'response_new_order.proto',
  'request_cancel_all_orders.proto',
  'rithmic_order_notification.proto',
  'exchange_order_notification.proto',
  'request_show_orders.proto',
  'response_show_orders.proto',
  'request_show_order_history.proto',
  'response_show_order_history.proto',
  'request_show_order_history_dates.proto',
  'response_show_order_history_dates.proto',
  'request_show_order_history_summary.proto',
  'response_show_order_history_summary.proto',
  'request_market_data_update.proto',
  'response_market_data_update.proto',
  'last_trade.proto',
  'best_bid_offer.proto',
  'request_pnl_position_snapshot.proto',
  'response_pnl_position_snapshot.proto',
  'request_pnl_position_updates.proto',
  'response_pnl_position_updates.proto',
  'account_pnl_position_update.proto',
  'instrument_pnl_position_update.proto',
  'request_product_codes.proto',
  'response_product_codes.proto',
  'request_front_month_contract.proto',
  'response_front_month_contract.proto',
  'request_account_rms_info.proto',
  'response_account_rms_info.proto',
];

// NO STATIC DATA - All contract/symbol info comes from Rithmic API
// P&L comes from PNL_PLANT API - no local calculation

module.exports = {
  RITHMIC_ENDPOINTS,
  RITHMIC_SYSTEMS,
  INFRA_TYPE,
  REQ,
  RES,
  STREAM,
  PROTO_FILES,
};
