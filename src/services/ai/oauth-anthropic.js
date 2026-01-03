/**
 * Anthropic OAuth Authentication
 * 
 * Implements OAuth 2.0 with PKCE for Anthropic Claude Pro/Max plans.
 * Based on the public OAuth flow used by OpenCode.
 * 
 * Data source: Anthropic OAuth API (https://console.anthropic.com/v1/oauth/token)
 */

const crypto = require('crypto');
const https = require('https');

// Public OAuth Client ID (same as OpenCode - registered with Anthropic)
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const REDIRECT_URI = 'https://console.anthropic.com/oauth/code/callback';

/**
 * Generate PKCE code verifier and challenge
 * @returns {Object} { verifier: string, challenge: string }
 */
const generatePKCE = () => {
  // Generate a random 32-byte code verifier (base64url encoded)
  const verifier = crypto.randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  // Generate SHA256 hash of verifier, then base64url encode it
  const challenge = crypto.createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return { verifier, challenge };
};

/**
 * Generate OAuth authorization URL
 * @param {'max' | 'console'} mode - 'max' for Claude Pro/Max, 'console' for API key creation
 * @returns {Object} { url: string, verifier: string }
 */
const authorize = (mode = 'max') => {
  const pkce = generatePKCE();
  
  const baseUrl = mode === 'max' 
    ? 'https://claude.ai/oauth/authorize'
    : 'https://console.anthropic.com/oauth/authorize';
  
  const url = new URL(baseUrl);
  url.searchParams.set('code', 'true');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', 'org:create_api_key user:profile user:inference');
  url.searchParams.set('code_challenge', pkce.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', pkce.verifier);
  
  return {
    url: url.toString(),
    verifier: pkce.verifier
  };
};

/**
 * Make HTTPS request
 * @param {string} url - Full URL
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response JSON
 */
const makeRequest = (url, options) => {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'POST',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(json.error?.message || `HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Invalid JSON response: ${data.substring(0, 200)}`));
        }
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
};

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from callback (format: code#state)
 * @param {string} verifier - PKCE code verifier
 * @returns {Promise<Object>} { type: 'success', access: string, refresh: string, expires: number } or { type: 'failed' }
 * 
 * Data source: https://console.anthropic.com/v1/oauth/token (POST)
 */
const exchange = async (code, verifier) => {
  try {
    // Code format from callback: "authorization_code#state"
    const splits = code.split('#');
    const authCode = splits[0];
    const state = splits[1] || '';
    
    const response = await makeRequest('https://console.anthropic.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        code: authCode,
        state: state,
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier
      }
    });
    
    return {
      type: 'success',
      access: response.access_token,
      refresh: response.refresh_token,
      expires: Date.now() + (response.expires_in * 1000)
    };
  } catch (error) {
    return {
      type: 'failed',
      error: error.message
    };
  }
};

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - The refresh token
 * @returns {Promise<Object>} { type: 'success', access: string, refresh: string, expires: number } or { type: 'failed' }
 * 
 * Data source: https://console.anthropic.com/v1/oauth/token (POST)
 */
const refreshToken = async (refreshToken) => {
  try {
    const response = await makeRequest('https://console.anthropic.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID
      }
    });
    
    return {
      type: 'success',
      access: response.access_token,
      refresh: response.refresh_token,
      expires: Date.now() + (response.expires_in * 1000)
    };
  } catch (error) {
    return {
      type: 'failed',
      error: error.message
    };
  }
};

/**
 * Create an API key using OAuth token (for console mode)
 * @param {string} accessToken - The access token
 * @returns {Promise<Object>} { type: 'success', key: string } or { type: 'failed' }
 * 
 * Data source: https://api.anthropic.com/api/oauth/claude_cli/create_api_key (POST)
 */
const createApiKey = async (accessToken) => {
  try {
    const response = await makeRequest('https://api.anthropic.com/api/oauth/claude_cli/create_api_key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    return {
      type: 'success',
      key: response.raw_key
    };
  } catch (error) {
    return {
      type: 'failed',
      error: error.message
    };
  }
};

/**
 * Get valid access token (refresh if expired)
 * @param {Object} oauthData - OAuth data { access, refresh, expires }
 * @returns {Promise<Object>} { access: string, refresh: string, expires: number, refreshed: boolean }
 */
const getValidToken = async (oauthData) => {
  if (!oauthData || !oauthData.refresh) {
    return null;
  }
  
  // Check if token is expired or will expire in the next 5 minutes
  const expirationBuffer = 5 * 60 * 1000; // 5 minutes
  if (oauthData.expires && oauthData.expires > Date.now() + expirationBuffer) {
    return {
      ...oauthData,
      refreshed: false
    };
  }
  
  // Token expired or about to expire, refresh it
  const result = await refreshToken(oauthData.refresh);
  if (result.type === 'success') {
    return {
      access: result.access,
      refresh: result.refresh,
      expires: result.expires,
      refreshed: true
    };
  }
  
  return null;
};

/**
 * Check if credentials are OAuth tokens
 * @param {Object} credentials - Agent credentials
 * @returns {boolean}
 */
const isOAuthCredentials = (credentials) => {
  return credentials && credentials.oauth && credentials.oauth.refresh;
};

module.exports = {
  CLIENT_ID,
  REDIRECT_URI,
  generatePKCE,
  authorize,
  exchange,
  refreshToken,
  createApiKey,
  getValidToken,
  isOAuthCredentials
};
