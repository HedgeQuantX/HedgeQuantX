/**
 * @fileoverview Rithmic contract methods
 * @module services/rithmic/contracts
 * 
 * NO FAKE DATA - Only real values from Rithmic API
 */

const { proto, decodeFrontMonthContract } = require('./protobuf');
const { TIMEOUTS, CACHE } = require('../../config/settings');
const { logger } = require('../../utils/logger');
const { getContractDescription, getTickSize } = require('../../config/constants');

const log = logger.scope('Rithmic:Contracts');

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
    // Connect to TICKER_PLANT if needed
    if (!service.tickerConn) {
      const connected = await service.connectTicker(service.credentials.username, service.credentials.password);
      if (!connected) {
        return { success: false, error: 'Failed to connect to TICKER_PLANT' };
      }
    }

    service.tickerConn.setMaxListeners(5000);

    log.debug('Fetching contracts from Rithmic API');
    const contracts = await fetchAllFrontMonths(service);

    if (!contracts.length) {
      return { success: false, error: 'No tradeable contracts found' };
    }

    // Cache results
    service._contractsCache = contracts;
    service._contractsCacheTime = Date.now();

    return { success: true, contracts, source: 'api' };
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
    const productHandler = (msg) => {
      msgCount++;
      if (msg.templateId !== 112) return;
      productMsgCount++;
      
      // Use official protobuf decoder instead of manual parsing
      let decoded;
      try {
        decoded = proto.decode('ResponseProductCodes', msg.data);
      } catch (e) {
        // Log first decode error
        if (sampleProducts.length === 0) {
          brokerLog('Decode error', { error: e.message });
        }
        return;
      }
      
      const productCode = decoded.productCode;
      const exchange = decoded.exchange;
      const productName = decoded.productName;
      
      // Log first 5 decoded products
      if (sampleProducts.length < 5 && productCode) {
        sampleProducts.push({ 
          code: productCode, 
          exchange: exchange,
          name: productName?.substring(0, 30)
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
      
      const decoded = decodeFrontMonthContract(msg.data);
      
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
      
      if (decoded.rpCode[0] === '0' && decoded.tradingSymbol) {
        contracts.set(decoded.userMsg, {
          symbol: decoded.tradingSymbol,
          baseSymbol: decoded.userMsg,
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
        sampleProducts: sampleProducts
      });

      if (productsToCheck.size === 0) {
        brokerLog('WARNING: No products collected - TICKER may not be responding', {});
      }

      let sentCount = 0;
      let sendErrors = [];
      // Only send for first 5 products to test
      const productsArray = Array.from(productsToCheck.values());
      const testProducts = productsArray.slice(0, 60); // Limit to 60 for testing
      
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
