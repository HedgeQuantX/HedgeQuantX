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
  GC: 'Gold', MGC: 'Micro Gold', '1OZ': 'Micro Gold (1oz)',
  SI: 'Silver', SIL: 'Micro Silver', HG: 'Copper', MHG: 'Micro Copper',
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

module.exports = {
  ACCOUNT_STATUS,
  ACCOUNT_TYPE,
  ORDER_STATUS,
  ORDER_TYPE,
  ORDER_SIDE,
  CONTRACT_DESCRIPTIONS,
  getContractDescription,
};
