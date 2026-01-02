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
];

// Symbol Categories - Order matters for display (indices first)
const SYMBOL_CATEGORIES = {
  INDICES: {
    name: 'Indices',
    order: 1,
    symbols: {
      // E-mini Indices
      'ES': { name: 'E-mini S&P 500', tickSize: 0.25, tickValue: 12.50 },
      'NQ': { name: 'E-mini Nasdaq-100', tickSize: 0.25, tickValue: 5.00 },
      'YM': { name: 'E-mini Dow Jones', tickSize: 1.00, tickValue: 5.00 },
      'RTY': { name: 'E-mini Russell 2000', tickSize: 0.10, tickValue: 5.00 },
      'EMD': { name: 'E-mini S&P MidCap 400', tickSize: 0.10, tickValue: 10.00 },
      // Micro Indices
      'MES': { name: 'Micro E-mini S&P 500', tickSize: 0.25, tickValue: 1.25 },
      'MNQ': { name: 'Micro E-mini Nasdaq-100', tickSize: 0.25, tickValue: 0.50 },
      'MYM': { name: 'Micro E-mini Dow Jones', tickSize: 1.00, tickValue: 0.50 },
      'M2K': { name: 'Micro E-mini Russell 2000', tickSize: 0.10, tickValue: 0.50 },
      // International Indices
      'NKD': { name: 'Nikkei 225 (USD)', tickSize: 5.00, tickValue: 25.00 },
    }
  },
  ENERGY: {
    name: 'Energy',
    order: 2,
    symbols: {
      'CL': { name: 'Crude Oil WTI', tickSize: 0.01, tickValue: 10.00 },
      'MCL': { name: 'Micro Crude Oil WTI', tickSize: 0.01, tickValue: 1.00 },
      'BZ': { name: 'Brent Crude Oil', tickSize: 0.01, tickValue: 10.00 },
      'NG': { name: 'Natural Gas', tickSize: 0.001, tickValue: 10.00 },
      'HO': { name: 'Heating Oil', tickSize: 0.0001, tickValue: 4.20 },
      'RB': { name: 'RBOB Gasoline', tickSize: 0.0001, tickValue: 4.20 },
    }
  },
  METALS: {
    name: 'Metals',
    order: 3,
    symbols: {
      'GC': { name: 'Gold', tickSize: 0.10, tickValue: 10.00 },
      'MGC': { name: 'Micro Gold', tickSize: 0.10, tickValue: 1.00 },
      '1OZ': { name: '1 Ounce Gold', tickSize: 0.25, tickValue: 0.25 },
      'SI': { name: 'Silver', tickSize: 0.005, tickValue: 25.00 },
      'SIL': { name: 'Silver 1000oz', tickSize: 0.005, tickValue: 5.00 },
      'HG': { name: 'Copper', tickSize: 0.0005, tickValue: 12.50 },
      'MHG': { name: 'Micro Copper', tickSize: 0.0005, tickValue: 1.25 },
      'PL': { name: 'Platinum', tickSize: 0.10, tickValue: 5.00 },
      'PA': { name: 'Palladium', tickSize: 0.10, tickValue: 10.00 },
    }
  },
  CURRENCIES: {
    name: 'Currencies (FX)',
    order: 4,
    symbols: {
      '6E': { name: 'Euro FX', tickSize: 0.00005, tickValue: 6.25 },
      'M6E': { name: 'Micro Euro FX', tickSize: 0.0001, tickValue: 1.25 },
      '6B': { name: 'British Pound', tickSize: 0.0001, tickValue: 6.25 },
      'M6B': { name: 'Micro British Pound', tickSize: 0.0001, tickValue: 0.625 },
      '6J': { name: 'Japanese Yen', tickSize: 0.0000005, tickValue: 6.25 },
      '6A': { name: 'Australian Dollar', tickSize: 0.0001, tickValue: 10.00 },
      'M6A': { name: 'Micro Australian Dollar', tickSize: 0.0001, tickValue: 1.00 },
      '6C': { name: 'Canadian Dollar', tickSize: 0.00005, tickValue: 5.00 },
      '6S': { name: 'Swiss Franc', tickSize: 0.0001, tickValue: 12.50 },
      '6N': { name: 'New Zealand Dollar', tickSize: 0.0001, tickValue: 10.00 },
      '6M': { name: 'Mexican Peso', tickSize: 0.00001, tickValue: 5.00 },
      'E7': { name: 'E-mini Euro FX', tickSize: 0.0001, tickValue: 6.25 },
      'RF': { name: 'Euro FX/Swiss Franc', tickSize: 0.0001, tickValue: 12.50 },
      'RP': { name: 'Euro FX/British Pound', tickSize: 0.00005, tickValue: 6.25 },
      'RY': { name: 'Euro FX/Japanese Yen', tickSize: 0.01, tickValue: 6.25 },
      'SEK': { name: 'Swedish Krona', tickSize: 0.00001, tickValue: 12.50 },
    }
  },
  CRYPTO: {
    name: 'Crypto',
    order: 5,
    symbols: {
      'BTC': { name: 'Bitcoin', tickSize: 5.00, tickValue: 25.00 },
      'MBT': { name: 'Micro Bitcoin', tickSize: 5.00, tickValue: 0.50 },
      'ETH': { name: 'Ether', tickSize: 0.25, tickValue: 12.50 },
      'MET': { name: 'Micro Ether', tickSize: 0.05, tickValue: 0.25 },
    }
  },
  RATES: {
    name: 'Interest Rates',
    order: 6,
    symbols: {
      'ZB': { name: '30-Year T-Bond', tickSize: 0.03125, tickValue: 31.25 },
      'ZN': { name: '10-Year T-Note', tickSize: 0.015625, tickValue: 15.625 },
      'ZF': { name: '5-Year T-Note', tickSize: 0.0078125, tickValue: 7.8125 },
      'ZT': { name: '2-Year T-Note', tickSize: 0.0078125, tickValue: 15.625 },
      'TN': { name: 'Ultra 10-Year T-Note', tickSize: 0.015625, tickValue: 15.625 },
      'ZQ': { name: '30-Day Fed Funds', tickSize: 0.0025, tickValue: 10.4167 },
    }
  },
  AGRICULTURE: {
    name: 'Agriculture',
    order: 7,
    symbols: {
      'ZC': { name: 'Corn', tickSize: 0.25, tickValue: 12.50 },
      'ZS': { name: 'Soybeans', tickSize: 0.25, tickValue: 12.50 },
      'ZW': { name: 'Wheat', tickSize: 0.25, tickValue: 12.50 },
      'ZL': { name: 'Soybean Oil', tickSize: 0.01, tickValue: 6.00 },
      'ZM': { name: 'Soybean Meal', tickSize: 0.10, tickValue: 10.00 },
      'ZO': { name: 'Oats', tickSize: 0.25, tickValue: 12.50 },
    }
  },
  MEATS: {
    name: 'Meats',
    order: 8,
    symbols: {
      'LE': { name: 'Live Cattle', tickSize: 0.025, tickValue: 10.00 },
      'HE': { name: 'Lean Hogs', tickSize: 0.025, tickValue: 10.00 },
      'GF': { name: 'Feeder Cattle', tickSize: 0.025, tickValue: 12.50 },
    }
  },
};

/**
 * Get symbol info (category, name, tick info)
 */
function getSymbolInfo(baseSymbol) {
  for (const [catKey, category] of Object.entries(SYMBOL_CATEGORIES)) {
    if (category.symbols[baseSymbol]) {
      return {
        category: catKey,
        categoryName: category.name,
        categoryOrder: category.order,
        ...category.symbols[baseSymbol]
      };
    }
  }
  // Unknown symbol
  return {
    category: 'OTHER',
    categoryName: 'Other',
    categoryOrder: 99,
    name: baseSymbol,
    tickSize: null,
    tickValue: null
  };
}

/**
 * Get all categories in display order
 */
function getCategoryOrder() {
  return Object.entries(SYMBOL_CATEGORIES)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, val]) => ({ key, name: val.name, order: val.order }));
}

module.exports = {
  RITHMIC_ENDPOINTS,
  RITHMIC_SYSTEMS,
  INFRA_TYPE,
  REQ,
  RES,
  STREAM,
  PROTO_FILES,
  SYMBOL_CATEGORIES,
  getSymbolInfo,
  getCategoryOrder,
};
