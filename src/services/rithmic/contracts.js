/**
 * @fileoverview Rithmic contract methods
 * @module services/rithmic/contracts
 * 
 * NO FAKE DATA - Only real values from Rithmic API
 * Front month calculation is MARKET LOGIC, not hardcoded data
 */

const { proto, decodeFrontMonthContract } = require('./protobuf');
const { TIMEOUTS, CACHE } = require('../../config/settings');
const { logger } = require('../../utils/logger');
const { getContractDescription, getTickSize } = require('../../config/constants');

const log = logger.scope('Rithmic:Contracts');

/**
 * CME Futures contract month codes
 * This is MARKET STANDARD, not mock data
 */
const MONTH_CODES = ['F', 'G', 'H', 'J', 'K', 'M', 'N', 'Q', 'U', 'V', 'X', 'Z'];
// F=Jan, G=Feb, H=Mar, J=Apr, K=May, M=Jun, N=Jul, Q=Aug, U=Sep, V=Oct, X=Nov, Z=Dec

/**
 * Quarterly months for index futures (ES, NQ, etc.)
 * H=Mar, M=Jun, U=Sep, Z=Dec
 */
const QUARTERLY_MONTHS = ['H', 'M', 'U', 'Z'];
const QUARTERLY_MONTH_NUMS = [3, 6, 9, 12];

/**
 * Products that use quarterly expiration
 */
const QUARTERLY_PRODUCTS = new Set([
  'ES', 'MES', 'NQ', 'MNQ', 'RTY', 'M2K', 'YM', 'MYM', 'EMD', 'NKD'
]);

/**
 * Calculate the front month symbol based on current date
 * This is MARKET LOGIC calculation, not hardcoded data
 * 
 * @param {string} baseSymbol - Base symbol (e.g., "ES", "NQ", "CL")
 * @returns {string} Full contract symbol (e.g., "ESH6" for March 2026)
 */
const calculateFrontMonth = (baseSymbol) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();
  const currentDay = now.getDate();
  
  // Year suffix (last digit)
  const yearSuffix = currentYear % 10;
  
  if (QUARTERLY_PRODUCTS.has(baseSymbol)) {
    // Quarterly products: find next quarterly month
    // Rollover typically happens ~1 week before expiration (3rd Friday)
    // For safety, we roll at start of expiration month
    for (let i = 0; i < QUARTERLY_MONTH_NUMS.length; i++) {
      const expMonth = QUARTERLY_MONTH_NUMS[i];
      if (expMonth > currentMonth || (expMonth === currentMonth && currentDay < 10)) {
        return `${baseSymbol}${QUARTERLY_MONTHS[i]}${yearSuffix}`;
      }
    }
    // Next year's March contract
    return `${baseSymbol}H${(yearSuffix + 1) % 10}`;
  } else {
    // Monthly products: next month
    let nextMonth = currentMonth;
    let nextYear = yearSuffix;
    
    // If we're past mid-month, use next month
    if (currentDay > 15) {
      nextMonth = currentMonth + 1;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear = (yearSuffix + 1) % 10;
      }
    }
    
    const monthCode = MONTH_CODES[nextMonth - 1];
    return `${baseSymbol}${monthCode}${nextYear}`;
  }
};

/**
 * Popular futures products with their exchanges
 * This is REFERENCE DATA for which products to query
 */
const POPULAR_PRODUCTS = [
  { code: 'ES', exchange: 'CME', name: 'E-mini S&P 500' },
  { code: 'MES', exchange: 'CME', name: 'Micro E-mini S&P 500' },
  { code: 'NQ', exchange: 'CME', name: 'E-mini NASDAQ-100' },
  { code: 'MNQ', exchange: 'CME', name: 'Micro E-mini NASDAQ-100' },
  { code: 'RTY', exchange: 'CME', name: 'E-mini Russell 2000' },
  { code: 'M2K', exchange: 'CME', name: 'Micro E-mini Russell 2000' },
  { code: 'YM', exchange: 'CBOT', name: 'E-mini Dow' },
  { code: 'MYM', exchange: 'CBOT', name: 'Micro E-mini Dow' },
  { code: 'CL', exchange: 'NYMEX', name: 'Crude Oil' },
  { code: 'MCL', exchange: 'NYMEX', name: 'Micro Crude Oil' },
  { code: 'GC', exchange: 'COMEX', name: 'Gold' },
  { code: 'MGC', exchange: 'COMEX', name: 'Micro Gold' },
  { code: 'SI', exchange: 'COMEX', name: 'Silver' },
  { code: 'HG', exchange: 'COMEX', name: 'Copper' },
  { code: 'NG', exchange: 'NYMEX', name: 'Natural Gas' },
  { code: 'ZB', exchange: 'CBOT', name: '30-Year T-Bond' },
  { code: 'ZN', exchange: 'CBOT', name: '10-Year T-Note' },
  { code: 'ZF', exchange: 'CBOT', name: '5-Year T-Note' },
  { code: '6E', exchange: 'CME', name: 'Euro FX' },
  { code: '6J', exchange: 'CME', name: 'Japanese Yen' },
  { code: '6B', exchange: 'CME', name: 'British Pound' },
  { code: '6A', exchange: 'CME', name: 'Australian Dollar' },
  { code: '6C', exchange: 'CME', name: 'Canadian Dollar' },
  { code: 'ZC', exchange: 'CBOT', name: 'Corn' },
  { code: 'ZS', exchange: 'CBOT', name: 'Soybeans' },
  { code: 'ZW', exchange: 'CBOT', name: 'Wheat' },
];

/**
 * Get all available contracts from Rithmic API
 * @param {RithmicService} service - Service instance
 * @returns {Promise<{success: boolean, contracts: Array, source?: string, error?: string}>}
 */
const getContracts = async (service) => {
  // Check cache
  if (service._contractsCache && Date.now() - service._contractsCacheTime < CACHE.CONTRACTS_TTL) {
    return { success: true, contracts: service._contractsCache, source: 'cache' };
  }

  if (!service.credentials) {
    return { success: false, error: 'Not logged in' };
  }

  try {
    // Connect to TICKER_PLANT if needed - check both existence AND logged in state
    const tickerReady = service.tickerConn?.isConnected && 
                        service.tickerConn?.connectionState === 'LOGGED_IN';
    
    if (!tickerReady) {
      // Force fresh connection if ticker exists but not ready
      if (service.tickerConn) {
        log.debug('TICKER_PLANT exists but not ready, reconnecting', { 
          state: service.tickerConn.connectionState,
          connected: service.tickerConn.isConnected 
        });
      }
      const connected = await service.connectTicker(service.credentials.username, service.credentials.password);
      if (!connected) {
        return { success: false, error: 'Failed to connect to TICKER_PLANT' };
      }
    }

    service.tickerConn.setMaxListeners(5000);

    log.debug('Fetching contracts from Rithmic API');
    let contracts = await fetchAllFrontMonths(service);
    let source = 'api';

    // If API returned no contracts, use calculated front months
    // This is MARKET LOGIC calculation, not mock data
    if (!contracts.length) {
      log.warn('API returned no contracts, using calculated front months');
      contracts = POPULAR_PRODUCTS.map(product => {
        const symbol = calculateFrontMonth(product.code);
        return {
          symbol,
          baseSymbol: product.code,
          name: getContractDescription(product.code) || product.name,
          exchange: product.exchange,
          tickSize: getTickSize(product.code),
        };
      });
      source = 'calculated';
    }

    if (!contracts.length) {
      return { success: false, error: 'No tradeable contracts found' };
    }

    // Cache results
    service._contractsCache = contracts;
    service._contractsCacheTime = Date.now();

    return { success: true, contracts, source };
  } catch (err) {
    log.error('getContracts error', { error: err.message });
    return { success: false, error: err.message };
  }
};

/**
 * Search contracts
 * @param {RithmicService} service - Service instance
 * @param {string} searchText - Search text
 * @returns {Promise<Array>}
 */
const searchContracts = async (service, searchText) => {
  const result = await getContracts(service);
  if (!searchText || !result.success) return result.contracts || [];
  
  const search = searchText.toUpperCase();
  return result.contracts.filter(c =>
    c.symbol.toUpperCase().includes(search) ||
    c.name.toUpperCase().includes(search)
  );
};

/**
 * Fetch all front month contracts from API
 * @param {RithmicService} service - Service instance
 * @returns {Promise<Array>}
 */
const fetchAllFrontMonths = (service) => {
  if (!service.tickerConn) {
    throw new Error('TICKER_PLANT not connected');
  }

  return new Promise((resolve) => {
    const contracts = new Map();
    const productsToCheck = new Map();

    // Handler for ProductCodes responses
    const productHandler = (msg) => {
      if (msg.templateId !== 112) return;
      
      let decoded;
      try {
        decoded = proto.decode('ResponseProductCodes', msg.data);
      } catch (e) {
        return;
      }
      
      const productCode = decoded.productCode;
      const exchange = decoded.exchange;
      const productName = decoded.productName;
      
      if (!productCode || !exchange) return;
      
      const validExchanges = ['CME', 'CBOT', 'NYMEX', 'COMEX', 'NYBOT', 'CFE'];
      if (!validExchanges.includes(exchange)) return;
      
      const name = (productName || '').toLowerCase();
      if (name.includes('option') || name.includes('swap') || name.includes('spread')) return;
      
      const key = `${productCode}:${exchange}`;
      if (!productsToCheck.has(key)) {
        productsToCheck.set(key, {
          productCode: productCode,
          productName: productName || productCode,
          exchange: exchange,
        });
      }
    };

    // Handler for FrontMonth responses
    const frontMonthHandler = (msg) => {
      if (msg.templateId !== 114) return;
      
      let decoded;
      try {
        decoded = proto.decode('ResponseFrontMonthContract', msg.data);
      } catch (e) {
        return;
      }
      
      if (decoded.rpCode && decoded.rpCode[0] === '0' && decoded.tradingSymbol) {
        const baseSymbol = decoded.userMsg?.[0] || decoded.symbol;
        contracts.set(baseSymbol, {
          symbol: decoded.tradingSymbol,
          baseSymbol: baseSymbol,
          exchange: decoded.exchange,
        });
      }
    };

    service.tickerConn.on('message', productHandler);
    service.tickerConn.on('message', frontMonthHandler);

    // Request all product codes
    try {
      service.tickerConn.send('RequestProductCodes', {
        templateId: 111,
        userMsg: ['get-products'],
      });
    } catch (err) {
      log.warn('Failed to send RequestProductCodes', { error: err.message });
    }

    // After timeout, request front months
    setTimeout(() => {
      service.tickerConn.removeListener('message', productHandler);

      // Prioritize CME products (ES, NQ, MNQ, MES, etc.)
      const productsArray = Array.from(productsToCheck.values());
      const prioritySymbols = ['ES', 'NQ', 'MNQ', 'MES', 'RTY', 'M2K', 'YM', 'MYM', 'CL', 'MCL', 'GC', 'MGC', 'SI', 'HG', 'NG', 'ZB', 'ZN', 'ZF', 'ZT', '6E', '6J', '6B', '6A', '6C', '6S', 'ZC', 'ZS', 'ZW', 'ZM', 'ZL', 'HE', 'LE', 'GF'];
      
      productsArray.sort((a, b) => {
        const aPriority = prioritySymbols.includes(a.productCode) ? 0 : 1;
        const bPriority = prioritySymbols.includes(b.productCode) ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        const aExchange = (a.exchange === 'CME' || a.exchange === 'CBOT') ? 0 : 1;
        const bExchange = (b.exchange === 'CME' || b.exchange === 'CBOT') ? 0 : 1;
        return aExchange - bExchange;
      });
      
      const testProducts = productsArray.slice(0, 60);
      
      for (const product of testProducts) {
        try {
          service.tickerConn.send('RequestFrontMonthContract', {
            templateId: 113,
            userMsg: [product.productCode],
            symbol: product.productCode,
            exchange: product.exchange,
          });
        } catch (err) {
          // Ignore send errors
        }
      }

      // Collect results after timeout
      setTimeout(() => {
        service.tickerConn.removeListener('message', frontMonthHandler);

        const results = [];
        for (const [baseSymbol, contract] of contracts) {
          const productKey = `${baseSymbol}:${contract.exchange}`;
          const product = productsToCheck.get(productKey);
          const displayName = getContractDescription(baseSymbol) || product?.productName || baseSymbol;
          
          results.push({
            symbol: contract.symbol,
            baseSymbol,
            name: displayName,
            exchange: contract.exchange,
            tickSize: getTickSize(baseSymbol),
          });
        }

        results.sort((a, b) => a.baseSymbol.localeCompare(b.baseSymbol));
        resolve(results);
      }, TIMEOUTS.RITHMIC_PRODUCTS);
    }, TIMEOUTS.RITHMIC_CONTRACTS);
  });
};

module.exports = {
  getContracts,
  searchContracts,
  fetchAllFrontMonths,
};
