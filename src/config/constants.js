/**
 * Application Constants
 */

// Account Status Codes (ProjectX UserAPI)
const ACCOUNT_STATUS = {
  0: { text: 'ACTIVE', color: 'green' },
  1: { text: 'END OF DAY', color: 'cyan' },
  2: { text: 'HALTED', color: 'red' },
  3: { text: 'PAUSED', color: 'yellow' },
  4: { text: 'HOLIDAY', color: 'blue' },
  5: { text: 'EXPIRED', color: 'gray' },
  6: { text: 'TERMINATED', color: 'red' },
  7: { text: 'CANCELLED', color: 'red' },
  8: { text: 'FAILED', color: 'red' },
  9: { text: 'PASSED', color: 'green' }
};

// Account Types (ProjectX UserAPI)
const ACCOUNT_TYPE = {
  0: { text: 'PRACTICE', color: 'blue' },
  1: { text: 'EVALUATION', color: 'yellow' },
  2: { text: 'LIVE', color: 'green' },
  3: { text: 'EXPRESS', color: 'magenta' },
  4: { text: 'SIM', color: 'gray' }
};

// Order Status
const ORDER_STATUS = {
  0: { text: 'PENDING', color: 'yellow', icon: '[~]' },
  1: { text: 'WORKING', color: 'cyan', icon: '[>]' },
  2: { text: 'FILLED', color: 'green', icon: '[OK]' },
  3: { text: 'CANCELLED', color: 'gray', icon: '[X]' },
  4: { text: 'REJECTED', color: 'red', icon: '[!]' },
  5: { text: 'EXPIRED', color: 'gray', icon: '[-]' }
};

// Order Types
const ORDER_TYPE = {
  1: 'MARKET',
  2: 'LIMIT',
  3: 'STOP',
  4: 'STOP LIMIT'
};

// Order Side
const ORDER_SIDE = {
  0: { text: 'BUY', color: 'green' },
  1: { text: 'SELL', color: 'red' }
};

// NO STATIC CONTRACT DATA - All symbols/contracts come from API
// - ProjectX: GET /api/Contract/available
// - Rithmic: TICKER_PLANT RequestProductCodes + RequestFrontMonthContract

module.exports = {
  ACCOUNT_STATUS,
  ACCOUNT_TYPE,
  ORDER_STATUS,
  ORDER_TYPE,
  ORDER_SIDE
};
