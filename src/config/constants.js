/**
 * Application Constants - Rithmic Only
 */

// Account Status Codes
const ACCOUNT_STATUS = {
  0: { text: 'Active', color: 'green' },
  1: { text: 'End Of Day', color: 'cyan' },
  2: { text: 'Halted', color: 'red' },
  3: { text: 'Paused', color: 'yellow' },
  4: { text: 'Holiday', color: 'blue' },
  5: { text: 'Expired', color: 'gray' },
  6: { text: 'Terminated', color: 'red' },
  7: { text: 'Cancelled', color: 'red' },
  8: { text: 'Failed', color: 'red' },
  9: { text: 'Passed', color: 'green' }
};

// Account Types
const ACCOUNT_TYPE = {
  0: { text: 'Practice', color: 'blue' },
  1: { text: 'Evaluation', color: 'yellow' },
  2: { text: 'Live', color: 'green' },
  3: { text: 'Express', color: 'magenta' },
  4: { text: 'Sim', color: 'gray' }
};

// Order Status
const ORDER_STATUS = {
  0: { text: 'Pending', color: 'yellow', icon: '[~]' },
  1: { text: 'Working', color: 'cyan', icon: '[>]' },
  2: { text: 'Filled', color: 'green', icon: '[OK]' },
  3: { text: 'Cancelled', color: 'gray', icon: '[X]' },
  4: { text: 'Rejected', color: 'red', icon: '[!]' },
  5: { text: 'Expired', color: 'gray', icon: '[-]' }
};

// Order Types
const ORDER_TYPE = {
  1: 'Market',
  2: 'Limit',
  3: 'Stop',
  4: 'Stop Limit'
};

// Order Side
const ORDER_SIDE = {
  0: { text: 'Buy', color: 'green' },
  1: { text: 'Sell', color: 'red' }
};

// All symbols/contracts come from Rithmic API (TICKER_PLANT)

// Contract descriptions for display (API only returns short codes)
const CONTRACT_DESCRIPTIONS = {
  // Equity Index Futures
  ES: 'E-mini S&P 500', MES: 'Micro E-mini S&P 500',
  NQ: 'E-mini Nasdaq 100', MNQ: 'Micro E-mini Nasdaq',
  RTY: 'E-mini Russell 2000', M2K: 'Micro E-mini Russell',
  YM: 'E-mini Dow $5', MYM: 'Micro E-mini Dow',
  EMD: 'E-mini S&P MidCap', NKD: 'Nikkei 225',
  // Metals
  GC: 'Gold (100oz)', MGC: 'Micro Gold (10oz)', '1OZ': 'E-Micro Gold (1oz)',
  SI: 'Silver (5000oz)', SIL: 'Micro Silver (1000oz)', HG: 'Copper', MHG: 'Micro Copper',
  PL: 'Platinum', PA: 'Palladium',
  // Energy
  CL: 'Crude Oil WTI', MCL: 'Micro Crude Oil', NG: 'Natural Gas',
  BZ: 'Brent Crude', RB: 'RBOB Gasoline', HO: 'Heating Oil',
  // Currencies
  '6E': 'Euro FX', M6E: 'Micro Euro', '6B': 'British Pound', M6B: 'Micro GBP',
  '6A': 'Australian $', M6A: 'Micro AUD', '6J': 'Japanese Yen',
  '6C': 'Canadian $', '6S': 'Swiss Franc', '6N': 'New Zealand $',
  '6M': 'Mexican Peso', E7: 'E-mini Euro',
  // Crypto
  BTC: 'Bitcoin', MBT: 'Micro Bitcoin', ETH: 'Ether', MET: 'Micro Ether',
  // Treasuries
  ZB: '30Y T-Bond', ZN: '10Y T-Note', ZF: '5Y T-Note', ZT: '2Y T-Note',
  ZQ: '30-Day Fed Funds', TN: 'Ultra 10Y',
  // Grains
  ZC: 'Corn', ZS: 'Soybeans', ZW: 'Wheat', ZM: 'Soybean Meal',
  ZL: 'Soybean Oil', ZO: 'Oats',
  // Livestock
  LE: 'Live Cattle', HE: 'Lean Hogs', GF: 'Feeder Cattle',
};

const getContractDescription = (baseSymbol) => CONTRACT_DESCRIPTIONS[baseSymbol] || baseSymbol;

// Tick sizes for common contracts (used when API doesn't provide)
const CONTRACT_TICK_SIZES = {
  // Equity Index
  ES: 0.25, MES: 0.25, NQ: 0.25, MNQ: 0.25,
  RTY: 0.10, M2K: 0.10, YM: 1.00, MYM: 1.00,
  // Metals
  GC: 0.10, MGC: 0.10, '1OZ': 0.10, SI: 0.005, SIL: 0.001,
  HG: 0.0005, MHG: 0.0005, PL: 0.10, PA: 0.10,
  // Energy
  CL: 0.01, MCL: 0.01, NG: 0.001, BZ: 0.01,
  // Currencies
  '6E': 0.00005, M6E: 0.0001, '6B': 0.0001, '6J': 0.0000005,
  '6A': 0.0001, '6C': 0.00005, '6S': 0.0001,
  // Crypto
  BTC: 5.00, MBT: 5.00, ETH: 0.50, MET: 0.50,
  // Treasuries
  ZB: 0.03125, ZN: 0.015625, ZF: 0.0078125, ZT: 0.0078125,
  // Grains
  ZC: 0.25, ZS: 0.25, ZW: 0.25,
};

const getTickSize = (baseSymbol) => CONTRACT_TICK_SIZES[baseSymbol] || 0.25;

module.exports = {
  ACCOUNT_STATUS,
  ACCOUNT_TYPE,
  ORDER_STATUS,
  ORDER_TYPE,
  ORDER_SIDE,
  CONTRACT_DESCRIPTIONS,
  CONTRACT_TICK_SIZES,
  getContractDescription,
  getTickSize,
};
