/**
 * Shared contracts configuration
 * Used by both Rithmic and ProjectX services
 */

// Current front-month contracts (update monthly as contracts expire)
const CONTRACTS = [
  // Index Futures - Most Popular
  { symbol: 'ES', name: 'E-mini S&P 500', exchange: 'CME', group: 'Index' },
  { symbol: 'NQ', name: 'E-mini NASDAQ-100', exchange: 'CME', group: 'Index' },
  { symbol: 'RTY', name: 'E-mini Russell 2000', exchange: 'CME', group: 'Index' },
  { symbol: 'YM', name: 'E-mini Dow Jones', exchange: 'CBOT', group: 'Index' },
  
  // Micro Index Futures
  { symbol: 'MES', name: 'Micro E-mini S&P 500', exchange: 'CME', group: 'Micro' },
  { symbol: 'MNQ', name: 'Micro E-mini NASDAQ-100', exchange: 'CME', group: 'Micro' },
  { symbol: 'M2K', name: 'Micro E-mini Russell 2000', exchange: 'CME', group: 'Micro' },
  { symbol: 'MYM', name: 'Micro E-mini Dow Jones', exchange: 'CBOT', group: 'Micro' },
  
  // Energy Futures
  { symbol: 'CL', name: 'Crude Oil', exchange: 'NYMEX', group: 'Energy' },
  { symbol: 'NG', name: 'Natural Gas', exchange: 'NYMEX', group: 'Energy' },
  { symbol: 'MCL', name: 'Micro Crude Oil', exchange: 'NYMEX', group: 'Energy' },
  
  // Metals Futures
  { symbol: 'GC', name: 'Gold', exchange: 'COMEX', group: 'Metals' },
  { symbol: 'SI', name: 'Silver', exchange: 'COMEX', group: 'Metals' },
  { symbol: 'HG', name: 'Copper', exchange: 'COMEX', group: 'Metals' },
  { symbol: 'MGC', name: 'Micro Gold', exchange: 'COMEX', group: 'Metals' },
  
  // Treasury Futures
  { symbol: 'ZB', name: '30-Year Treasury Bond', exchange: 'CBOT', group: 'Bonds' },
  { symbol: 'ZN', name: '10-Year Treasury Note', exchange: 'CBOT', group: 'Bonds' },
  { symbol: 'ZF', name: '5-Year Treasury Note', exchange: 'CBOT', group: 'Bonds' },
  
  // Agriculture Futures
  { symbol: 'ZC', name: 'Corn', exchange: 'CBOT', group: 'Agriculture' },
  { symbol: 'ZS', name: 'Soybeans', exchange: 'CBOT', group: 'Agriculture' },
  { symbol: 'ZW', name: 'Wheat', exchange: 'CBOT', group: 'Agriculture' },
  
  // Currency Futures
  { symbol: '6E', name: 'Euro FX', exchange: 'CME', group: 'Currency' },
  { symbol: '6B', name: 'British Pound', exchange: 'CME', group: 'Currency' },
  { symbol: '6J', name: 'Japanese Yen', exchange: 'CME', group: 'Currency' },
];

/**
 * Get current front-month code based on date
 * Futures months: F(Jan), G(Feb), H(Mar), J(Apr), K(May), M(Jun), 
 *                 N(Jul), Q(Aug), U(Sep), V(Oct), X(Nov), Z(Dec)
 */
const getMonthCode = (monthsAhead = 0) => {
  const codes = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];
  const now = new Date();
  const month = (now.getMonth() + monthsAhead) % 12;
  return codes[month];
};

/**
 * Get year code (last digit)
 */
const getYearCode = (monthsAhead = 0) => {
  const now = new Date();
  const futureDate = new Date(now.getFullYear(), now.getMonth() + monthsAhead, 1);
  return futureDate.getFullYear() % 10;
};

/**
 * Get contracts with current front-month symbols
 * @param {number} monthsAhead - How many months ahead for the contract (default 2 for front month)
 */
const getContractsWithMonthCode = (monthsAhead = 2) => {
  const monthCode = getMonthCode(monthsAhead);
  const yearCode = getYearCode(monthsAhead);
  
  return CONTRACTS.map(c => ({
    ...c,
    symbol: `${c.symbol}${monthCode}${yearCode}`,
    name: `${c.name}`,
    baseSymbol: c.symbol
  }));
};

/**
 * Get display name for a symbol
 */
const getContractDisplayName = (symbol) => {
  // Extract base symbol (remove month/year code)
  const baseSymbol = symbol.replace(/[A-Z][0-9]$/, '').replace(/[FGHJKMNQUVXZ][0-9]+$/, '');
  const contract = CONTRACTS.find(c => c.symbol === baseSymbol);
  return contract ? contract.name : symbol;
};

module.exports = {
  CONTRACTS,
  getMonthCode,
  getYearCode,
  getContractsWithMonthCode,
  getContractDisplayName
};
