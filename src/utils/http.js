/**
 * @fileoverview Shared HTTP client for all services
 * @module utils/http
 */

const https = require('https');
const http = require('http');
const { TIMEOUTS } = require('../config/settings');
const { logger } = require('./logger');

const log = logger.scope('HTTP');

/**
 * @typedef {Object} HttpResponse
 * @property {number} statusCode - HTTP status code
 * @property {Object|string} data - Response body
 * @property {Object} headers - Response headers
 */

/**
 * @typedef {Object} HttpOptions
 * @property {string} [method='GET'] - HTTP method
 * @property {Object} [headers] - Request headers
 * @property {Object|string} [body] - Request body
 * @property {number} [timeout] - Request timeout in ms
 * @property {string} [token] - Bearer token for Authorization
 * @property {string} [apiKey] - API key header
 */

/**
 * Performs an HTTP/HTTPS request
 * @param {string} url - Full URL to request
 * @param {HttpOptions} [options={}] - Request options
 * @returns {Promise<HttpResponse>}
 */
const request = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    const {
      method = 'GET',
      headers = {},
      body = null,
      timeout = TIMEOUTS.API_REQUEST,
      token = null,
      apiKey = null,
    } = options;

    const parsedUrl = new URL(url);
    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const postData = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;

    const reqOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'HQX-CLI/2.0.0',
        ...headers,
      },
      timeout,
    };

    if (postData) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    if (token) {
      reqOptions.headers['Authorization'] = `Bearer ${token}`;
    }

    if (apiKey) {
      reqOptions.headers['X-API-Key'] = apiKey;
    }

    log.debug(`${method} ${parsedUrl.pathname}`);

    const req = client.request(reqOptions, (res) => {
      let data = '';
      
      res.on('data', chunk => { data += chunk; });
      
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = data;
        }
        
        log.debug(`Response ${res.statusCode}`, { 
          path: parsedUrl.pathname,
          status: res.statusCode 
        });
        
        resolve({
          statusCode: res.statusCode,
          data: parsed,
          headers: res.headers,
        });
      });
    });

    req.on('error', (err) => {
      log.error(`Request failed: ${err.message}`, { path: parsedUrl.pathname });
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      const err = new Error(`Request timeout after ${timeout}ms`);
      log.error(err.message, { path: parsedUrl.pathname });
      reject(err);
    });

    if (postData) {
      req.write(postData);
    }

    req.end();
  });
};

/**
 * Simplified request helper for common patterns
 * @param {string} baseUrl - Base URL (e.g., 'https://api.example.com')
 * @param {string} [basePath=''] - Base path prefix
 * @returns {Object} Request methods bound to the base URL
 */
const createClient = (baseUrl, basePath = '') => {
  const buildUrl = (path) => `${baseUrl}${basePath}${path}`;
  
  return {
    /**
     * GET request
     * @param {string} path - Request path
     * @param {HttpOptions} [options={}] - Options
     */
    get: (path, options = {}) => request(buildUrl(path), { ...options, method: 'GET' }),
    
    /**
     * POST request
     * @param {string} path - Request path
     * @param {Object} [body] - Request body
     * @param {HttpOptions} [options={}] - Options
     */
    post: (path, body, options = {}) => request(buildUrl(path), { ...options, method: 'POST', body }),
    
    /**
     * PUT request
     * @param {string} path - Request path
     * @param {Object} [body] - Request body
     * @param {HttpOptions} [options={}] - Options
     */
    put: (path, body, options = {}) => request(buildUrl(path), { ...options, method: 'PUT', body }),
    
    /**
     * DELETE request
     * @param {string} path - Request path
     * @param {HttpOptions} [options={}] - Options
     */
    delete: (path, options = {}) => request(buildUrl(path), { ...options, method: 'DELETE' }),
    
    /**
     * Sets authorization token for all subsequent requests
     * @param {string} token - Bearer token
     * @returns {Object} Client with token set
     */
    withToken: (token) => {
      const client = createClient(baseUrl, basePath);
      const wrapWithToken = (fn) => (path, bodyOrOpts, opts) => {
        const options = opts || (typeof bodyOrOpts === 'object' && !bodyOrOpts?.method ? {} : bodyOrOpts) || {};
        const body = opts ? bodyOrOpts : undefined;
        return fn(path, body, { ...options, token });
      };
      client.get = (path, opts = {}) => request(buildUrl(path), { ...opts, method: 'GET', token });
      client.post = (path, body, opts = {}) => request(buildUrl(path), { ...opts, method: 'POST', body, token });
      client.put = (path, body, opts = {}) => request(buildUrl(path), { ...opts, method: 'PUT', body, token });
      client.delete = (path, opts = {}) => request(buildUrl(path), { ...opts, method: 'DELETE', token });
      return client;
    },
  };
};

/**
 * Retries a request with exponential backoff
 * @param {() => Promise<HttpResponse>} fn - Request function
 * @param {Object} [options={}] - Retry options
 * @param {number} [options.maxRetries=3] - Maximum retry attempts
 * @param {number} [options.baseDelay=1000] - Base delay in ms
 * @param {number[]} [options.retryOn=[502, 503, 504]] - Status codes to retry on
 * @returns {Promise<HttpResponse>}
 */
const withRetry = async (fn, options = {}) => {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    retryOn = [502, 503, 504],
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      
      if (retryOn.includes(result.statusCode) && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        log.debug(`Retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      return result;
    } catch (err) {
      lastError = err;
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        log.debug(`Retrying after error in ${delay}ms`, { error: err.message });
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  throw lastError;
};

module.exports = {
  request,
  createClient,
  withRetry,
};
