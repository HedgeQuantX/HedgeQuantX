/**
 * Application Constants
 */

// Account Status Codes (ProjectX UserAPI)
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

// Account Types (ProjectX UserAPI)
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

// Popular Futures Symbols - Complete list
const FUTURES_SYMBOLS = [
  // Index Futures
  { name: 'NQ - E-mini NASDAQ-100', value: 'NQ', searchText: 'NQ', category: 'index' },
  { name: 'MNQ - Micro E-mini NASDAQ-100', value: 'MNQ', searchText: 'MNQ', category: 'index' },
  { name: 'ES - E-mini S&P 500', value: 'ES', searchText: 'ES', category: 'index' },
  { name: 'MES - Micro E-mini S&P 500', value: 'MES', searchText: 'MES', category: 'index' },
  { name: 'YM - E-mini Dow Jones', value: 'YM', searchText: 'YM', category: 'index' },
  { name: 'MYM - Micro E-mini Dow Jones', value: 'MYM', searchText: 'MYM', category: 'index' },
  { name: 'RTY - E-mini Russell 2000', value: 'RTY', searchText: 'RTY', category: 'index' },
  { name: 'M2K - Micro E-mini Russell 2000', value: 'M2K', searchText: 'M2K', category: 'index' },
  // Energy
  { name: 'CL - Crude Oil WTI', value: 'CL', searchText: 'CL', category: 'energy' },
  { name: 'MCL - Micro Crude Oil', value: 'MCL', searchText: 'MCL', category: 'energy' },
  { name: 'NG - Natural Gas', value: 'NG', searchText: 'NG', category: 'energy' },
  { name: 'QG - E-mini Natural Gas', value: 'QG', searchText: 'QG', category: 'energy' },
  // Metals
  { name: 'GC - Gold', value: 'GC', searchText: 'GC', category: 'metals' },
  { name: 'MGC - Micro Gold', value: 'MGC', searchText: 'MGC', category: 'metals' },
  { name: 'SI - Silver', value: 'SI', searchText: 'SI', category: 'metals' },
  { name: 'SIL - Micro Silver', value: 'SIL', searchText: 'SIL', category: 'metals' },
  { name: 'HG - Copper', value: 'HG', searchText: 'HG', category: 'metals' },
  { name: 'PL - Platinum', value: 'PL', searchText: 'PL', category: 'metals' },
  // Currencies
  { name: '6E - Euro FX', value: '6E', searchText: '6E', category: 'currency' },
  { name: 'M6E - Micro Euro FX', value: 'M6E', searchText: 'M6E', category: 'currency' },
  { name: '6B - British Pound', value: '6B', searchText: '6B', category: 'currency' },
  { name: '6J - Japanese Yen', value: '6J', searchText: '6J', category: 'currency' },
  { name: '6A - Australian Dollar', value: '6A', searchText: '6A', category: 'currency' },
  { name: '6C - Canadian Dollar', value: '6C', searchText: '6C', category: 'currency' },
  // Bonds
  { name: 'ZB - 30-Year T-Bond', value: 'ZB', searchText: 'ZB', category: 'bonds' },
  { name: 'ZN - 10-Year T-Note', value: 'ZN', searchText: 'ZN', category: 'bonds' },
  { name: 'ZF - 5-Year T-Note', value: 'ZF', searchText: 'ZF', category: 'bonds' },
  { name: 'ZT - 2-Year T-Note', value: 'ZT', searchText: 'ZT', category: 'bonds' },
  // Agriculture
  { name: 'ZC - Corn', value: 'ZC', searchText: 'ZC', category: 'agriculture' },
  { name: 'ZS - Soybeans', value: 'ZS', searchText: 'ZS', category: 'agriculture' },
  { name: 'ZW - Wheat', value: 'ZW', searchText: 'ZW', category: 'agriculture' }
];

module.exports = {
  ACCOUNT_STATUS,
  ACCOUNT_TYPE,
  ORDER_STATUS,
  ORDER_TYPE,
  ORDER_SIDE,
  FUTURES_SYMBOLS
};
