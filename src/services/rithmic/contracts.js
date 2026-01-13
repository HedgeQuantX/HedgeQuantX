/**
 * @fileoverview Rithmic contract methods
 * @module services/rithmic/contracts
 * 
 * NO FAKE DATA - Only real values from Rithmic API
 */

const { decodeFrontMonthContract } = require('./protobuf');
const { TIMEOUTS, CACHE } = require('../../config/settings');
const { logger } = require('../../utils/logger');

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

  return new Promise((resolve) => {
    const contracts = new Map();
    const productsToCheck = new Map();

    // Handler for ProductCodes responses
    const productHandler = (msg) => {
      if (msg.templateId !== 112) return;
      
      const decoded = decodeProductCodes(msg.data);
      if (!decoded.productCode || !decoded.exchange) return;
      
      const validExchanges = ['CME', 'CBOT', 'NYMEX', 'COMEX', 'NYBOT', 'CFE'];
      if (!validExchanges.includes(decoded.exchange)) return;
      
      const name = (decoded.productName || '').toLowerCase();
      if (name.includes('option') || name.includes('swap') || name.includes('spread')) return;
      
      const key = `${decoded.productCode}:${decoded.exchange}`;
      if (!productsToCheck.has(key)) {
        productsToCheck.set(key, {
          productCode: decoded.productCode,
          productName: decoded.productName || decoded.productCode,
          exchange: decoded.exchange,
        });
      }
    };

    // Handler for FrontMonth responses
    const frontMonthHandler = (msg) => {
      if (msg.templateId !== 114) return;
      
      const decoded = decodeFrontMonthContract(msg.data);
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
    service.tickerConn.send('RequestProductCodes', {
      templateId: 111,
      userMsg: ['get-products'],
    });

    // After timeout, request front months
    setTimeout(() => {
      service.tickerConn.removeListener('message', productHandler);
      log.debug('Collected products', { count: productsToCheck.size });

      for (const product of productsToCheck.values()) {
        service.tickerConn.send('RequestFrontMonthContract', {
          templateId: 113,
          userMsg: [product.productCode],
          symbol: product.productCode,
          exchange: product.exchange,
        });
      }

      // Collect results after timeout
      setTimeout(() => {
        service.tickerConn.removeListener('message', frontMonthHandler);

        const results = [];
        for (const [baseSymbol, contract] of contracts) {
          const productKey = `${baseSymbol}:${contract.exchange}`;
          const product = productsToCheck.get(productKey);

          // 100% API data - no static symbol info
          results.push({
            symbol: contract.symbol,
            baseSymbol,
            name: product?.productName || baseSymbol,
            exchange: contract.exchange,
          });
        }

        // Sort alphabetically by base symbol
        results.sort((a, b) => a.baseSymbol.localeCompare(b.baseSymbol));

        log.debug('Got contracts from API', { count: results.length });
        resolve(results);
      }, TIMEOUTS.RITHMIC_PRODUCTS);
    }, TIMEOUTS.RITHMIC_CONTRACTS);
  });
};

/**
 * Decode ProductCodes response
 * @param {Buffer} buffer - Protobuf buffer (with 4-byte length prefix)
 * @returns {Object} Decoded product data
 */
const decodeProductCodes = (buffer) => {
  // Skip 4-byte length prefix
  const data = buffer.length > 4 ? buffer.slice(4) : buffer;
  
  const result = {};
  let offset = 0;

  const readVarint = (buf, off) => {
    let value = 0;
    let shift = 0;
    while (off < buf.length) {
      const byte = buf[off++];
      value |= (byte & 0x7F) << shift;
      if (!(byte & 0x80)) break;
      shift += 7;
    }
    return [value, off];
  };

  const readString = (buf, off) => {
    const [len, newOff] = readVarint(buf, off);
    return [buf.slice(newOff, newOff + len).toString('utf8'), newOff + len];
  };

  while (offset < data.length) {
    try {
      const [tag, tagOff] = readVarint(data, offset);
      const wireType = tag & 0x7;
      const fieldNumber = tag >>> 3;
      offset = tagOff;

      if (wireType === 0) {
        const [, newOff] = readVarint(data, offset);
        offset = newOff;
      } else if (wireType === 2) {
        const [val, newOff] = readString(data, offset);
        offset = newOff;
        if (fieldNumber === 110101) result.exchange = val;
        if (fieldNumber === 100749) result.productCode = val;
        if (fieldNumber === 100003) result.productName = val;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return result;
};

module.exports = {
  getContracts,
  searchContracts,
  fetchAllFrontMonths,
  decodeProductCodes,
};
