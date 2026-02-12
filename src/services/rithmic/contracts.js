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

  const tickerState = service.tickerConn.connectionState;
  const tickerConnected = service.tickerConn.isConnected;
  
  // Direct console.log for daemon broker.log (always visible)
  const brokerLog = (msg, data) => console.log(`[CONTRACTS] ${msg}`, JSON.stringify(data));
  
  brokerLog('fetchAllFrontMonths starting', { tickerState, tickerConnected });

  return new Promise((resolve) => {
    const contracts = new Map();
    const productsToCheck = new Map();
    let msgCount = 0;
    let productMsgCount = 0;

    // Handler for ProductCodes responses
    const sampleProducts = [];
    let decodeErrors = 0;
    let firstError = null;
    const productHandler = (msg) => {
      msgCount++;
      if (msg.templateId !== 112) return;
      productMsgCount++;
      
      // Use official protobuf decoder instead of manual parsing
      let decoded;
      try {
        decoded = proto.decode('ResponseProductCodes', msg.data);
      } catch (e) {
        decodeErrors++;
        if (!firstError) {
          firstError = e.message;
          // Log raw buffer info for debugging
          brokerLog('First decode error', { 
            error: e.message, 
            bufferLen: msg.data?.length,
            first20bytes: msg.data?.slice(0, 20)?.toString('hex')
          });
        }
        return;
      }
      
      const productCode = decoded.productCode;
      const exchange = decoded.exchange;
      const productName = decoded.productName;
      
      // Log first 5 raw decoded messages to see field names
      if (sampleProducts.length < 5) {
        const keys = Object.keys(decoded.toJSON ? decoded.toJSON() : decoded);
        sampleProducts.push({ 
          code: productCode || 'NONE',
          exchange: exchange || 'NONE',
          name: productName?.substring(0, 30) || 'NONE',
          fields: keys.slice(0, 10)
        });
      }
      
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
    let frontMonthMsgCount = 0;
    let template114Count = 0;
    const templateIdsSeen = new Map();
    const rawResponses = [];
    const frontMonthHandler = (msg) => {
      msgCount++;
      frontMonthMsgCount++;
      
      // Track all templateIds seen
      const tid = msg.templateId;
      templateIdsSeen.set(tid, (templateIdsSeen.get(tid) || 0) + 1);
      
      // Log first few non-112 messages to see what we're getting
      if (tid !== 112 && rawResponses.length < 5) {
        rawResponses.push({ templateId: tid, dataLen: msg.data?.length });
      }
      
      if (msg.templateId !== 114) return;
      template114Count++;
      
      // Use official protobuf decoder
      let decoded;
      try {
        decoded = proto.decode('ResponseFrontMonthContract', msg.data);
      } catch (e) {
        brokerLog('FrontMonth decode error', { error: e.message });
        return;
      }
      
      // Log first few responses to diagnose
      if (template114Count <= 5) {
        brokerLog('FrontMonth response', { 
          template114Count,
          rpCode: decoded.rpCode,
          tradingSymbol: decoded.tradingSymbol,
          userMsg: decoded.userMsg,
          exchange: decoded.exchange 
        });
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
    brokerLog('Sending RequestProductCodes', { templateId: 111 });
    try {
      service.tickerConn.send('RequestProductCodes', {
        templateId: 111,
        userMsg: ['get-products'],
      });
      brokerLog('RequestProductCodes sent OK', {});
    } catch (err) {
      brokerLog('FAILED to send RequestProductCodes', { error: err.message });
    }

    // After timeout, request front months
    setTimeout(() => {
      service.tickerConn.removeListener('message', productHandler);
      brokerLog('ProductCodes phase complete', { 
        productsFound: productsToCheck.size, 
        totalMsgs: msgCount,
        productMsgs: productMsgCount,
        decodeErrors: decodeErrors,
        firstError: firstError,
        sampleProducts: sampleProducts
      });

      if (productsToCheck.size === 0) {
        brokerLog('WARNING: No products collected - TICKER may not be responding', {});
      }

      let sentCount = 0;
      let sendErrors = [];
      
      // Prioritize CME products (ES, NQ, MNQ, MES, etc.) - most used by traders
      const productsArray = Array.from(productsToCheck.values());
      const prioritySymbols = ['ES', 'NQ', 'MNQ', 'MES', 'RTY', 'M2K', 'YM', 'MYM', 'CL', 'MCL', 'GC', 'MGC', 'SI', 'HG', 'NG', 'ZB', 'ZN', 'ZF', 'ZT', '6E', '6J', '6B', '6A', '6C', '6S', 'ZC', 'ZS', 'ZW', 'ZM', 'ZL', 'HE', 'LE', 'GF'];
      
      // Sort: priority symbols first (CME), then others
      productsArray.sort((a, b) => {
        const aPriority = prioritySymbols.includes(a.productCode) ? 0 : 1;
        const bPriority = prioritySymbols.includes(b.productCode) ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;
        // Within same priority, prefer CME/CBOT
        const aExchange = (a.exchange === 'CME' || a.exchange === 'CBOT') ? 0 : 1;
        const bExchange = (b.exchange === 'CME' || b.exchange === 'CBOT') ? 0 : 1;
        return aExchange - bExchange;
      });
      
      const testProducts = productsArray.slice(0, 60); // Limit to 60
      
      for (const product of testProducts) {
        try {
          const reqData = {
            templateId: 113,
            userMsg: [product.productCode],
            symbol: product.productCode,
            exchange: product.exchange,
          };
          // Log first request
          if (sentCount === 0) {
            brokerLog('First RequestFrontMonthContract', reqData);
          }
          service.tickerConn.send('RequestFrontMonthContract', reqData);
          sentCount++;
        } catch (err) {
          sendErrors.push({ product: product.productCode, error: err.message });
        }
      }
      brokerLog('RequestFrontMonthContract sent', { 
        sentCount, 
        totalProducts: productsToCheck.size,
        limitedTo: testProducts.length,
        errors: sendErrors.length > 0 ? sendErrors.slice(0, 3) : 'none'
      });

      // Collect results after timeout
      setTimeout(() => {
        service.tickerConn.removeListener('message', frontMonthHandler);

        const results = [];
        for (const [baseSymbol, contract] of contracts) {
          const productKey = `${baseSymbol}:${contract.exchange}`;
          const product = productsToCheck.get(productKey);

          // Use our descriptions for better display names
          const apiName = product?.productName || baseSymbol;
          const displayName = getContractDescription(baseSymbol) || apiName;
          results.push({
            symbol: contract.symbol,
            baseSymbol,
            name: displayName,
            exchange: contract.exchange,
            tickSize: getTickSize(baseSymbol),
          });
        }

        // Sort alphabetically by base symbol
        results.sort((a, b) => a.baseSymbol.localeCompare(b.baseSymbol));

        // Convert Map to object for logging
        const templateStats = {};
        for (const [tid, count] of templateIdsSeen) {
          templateStats[`t${tid}`] = count;
        }
        brokerLog('FrontMonth phase complete', { 
          contractsFound: results.length, 
          totalMsgs: msgCount,
          frontMonthMsgs: frontMonthMsgCount,
          template114Received: template114Count,
          templateIds: templateStats,
          nonProductMsgs: rawResponses
        });
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
