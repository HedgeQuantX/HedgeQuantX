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

// Popular Futures Symbols
const FUTURES_SYMBOLS = [
  { name: 'NQ - E-mini NASDAQ-100', value: 'NQ', searchText: 'NQ' },
  { name: 'MNQ - Micro E-mini NASDAQ-100', value: 'MNQ', searchText: 'MNQ' },
  { name: 'ES - E-mini S&P 500', value: 'ES', searchText: 'ES' },
  { name: 'MES - Micro E-mini S&P 500', value: 'MES', searchText: 'MES' },
  { name: 'YM - E-mini Dow Jones', value: 'YM', searchText: 'YM' },
  { name: 'MYM - Micro E-mini Dow Jones', value: 'MYM', searchText: 'MYM' },
  { name: 'RTY - E-mini Russell 2000', value: 'RTY', searchText: 'RTY' },
  { name: 'M2K - Micro E-mini Russell 2000', value: 'M2K', searchText: 'M2K' },
  { name: 'CL - Crude Oil', value: 'CL', searchText: 'CL' },
  { name: 'MCL - Micro Crude Oil', value: 'MCL', searchText: 'MCL' },
  { name: 'GC - Gold', value: 'GC', searchText: 'GC' },
  { name: 'MGC - Micro Gold', value: 'MGC', searchText: 'MGC' }
];

module.exports = {
  ACCOUNT_STATUS,
  ACCOUNT_TYPE,
  ORDER_STATUS,
  ORDER_TYPE,
  ORDER_SIDE,
  FUTURES_SYMBOLS
};
