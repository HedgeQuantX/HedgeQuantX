import { API_URL, WS_URL } from '../utils/constants';

const REQUEST_TIMEOUT_MS = 30000; // 30s timeout (Rithmic contract fetch can take ~15s)

function getToken() {
  return localStorage.getItem('hqx_token');
}

function setToken(token) {
  localStorage.setItem('hqx_token', token);
}

function clearToken() {
  localStorage.removeItem('hqx_token');
}

function getEncryptedCredentials() {
  return localStorage.getItem('hqx_enc_creds');
}

function setEncryptedCredentials(creds) {
  if (creds) {
    localStorage.setItem('hqx_enc_creds', creds);
  }
}

function clearEncryptedCredentials() {
  localStorage.removeItem('hqx_enc_creds');
}

// Reconnect lock to prevent multiple simultaneous reconnect attempts
let reconnectPromise = null;

/**
 * Attempt transparent reconnection to Rithmic when backend session is lost.
 * Uses encrypted credentials stored during login.
 * Returns true if reconnection succeeded, false otherwise.
 * Deduplicates concurrent calls (only one reconnect at a time).
 */
async function attemptReconnect() {
  // Deduplicate: if a reconnect is already in progress, wait for it
  if (reconnectPromise) {
    return reconnectPromise;
  }

  reconnectPromise = (async () => {
    const encCreds = getEncryptedCredentials();
    const token = getToken();
    if (!encCreds || !token) return false;

    try {
      const response = await fetch(`${API_URL}/auth/reconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ encryptedCredentials: encCreds }),
      });

      if (!response.ok) return false;

      const data = await response.json();
      return data.success === true;
    } catch {
      return false;
    }
  })();

  try {
    return await reconnectPromise;
  } finally {
    reconnectPromise = null;
  }
}

async function request(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  // Abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });

    // 401 on authenticated requests = session expired → try reconnect first
    // Skip reconnect for /auth/login and /auth/reconnect (would cause infinite loop)
    if (response.status === 401 && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/reconnect')) {
      const encCreds = getEncryptedCredentials();
      const currentToken = getToken();

      if (encCreds && currentToken) {
        // Try transparent reconnection
        const reconnected = await attemptReconnect();
        if (reconnected) {
          // Retry the original request with same token (session restored)
          clearTimeout(timeoutId);
          return request(endpoint, options);
        }
      }

      // Reconnect failed or no credentials — throw so caller can handle
      // AuthContext.catch() will call auth.logout() to clear state
      throw new Error('Session expired');
    }

    if (!response.ok) {
      const ct = response.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Handle empty responses (204 No Content)
    if (response.status === 204) return {};

    const ct = response.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      return response.json();
    }
    return {};
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get: (endpoint) => request(endpoint, { method: 'GET' }),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

export const auth = {
  login: async (propfirm, username, password) => {
    const data = await api.post('/auth/login', { propfirm, username, password });
    if (data.token) {
      setToken(data.token);
    }
    // Store encrypted credentials for session persistence
    if (data.encryptedCredentials) {
      setEncryptedCredentials(data.encryptedCredentials);
    }
    return data;
  },
  logout: () => {
    clearToken();
    clearEncryptedCredentials();
  },
  reconnect: attemptReconnect,
  getToken,
  getEncryptedCredentials,
  isAuthenticated: () => !!getToken(),
};

export class WsClient {
  constructor(onMessage, onStatusChange) {
    this.ws = null;
    this.onMessage = onMessage;
    this.onStatusChange = onStatusChange;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.isIntentionallyClosed = false;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.isIntentionallyClosed = false;

    try {
      // Connect without token in URL — send as first message (more secure)
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        // Authenticate via first message instead of URL query param
        const token = getToken();
        if (token) {
          this.ws.send(JSON.stringify({ type: 'auth', token }));
        }
        this.reconnectAttempts = 0;
        this.onStatusChange?.('connected');
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.onMessage?.(data);
        } catch {
          // ignore non-JSON messages
        }
      };

      this.ws.onclose = () => {
        this.onStatusChange?.('disconnected');
        if (!this.isIntentionallyClosed) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WS] Connection error:', err);
        this.onStatusChange?.('error');
      };
    } catch {
      this.onStatusChange?.('error');
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.onStatusChange?.('failed'); // Signal permanent failure to UI
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  /** Manual reconnect (used by UI "Reconnect" button after max attempts) */
  reconnect() {
    this.reconnectAttempts = 0;
    this.connect();
  }

  send(type, payload = {}) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, ...payload }));
      return true;
    }
    return false; // Let caller know message was not sent
  }

  disconnect() {
    this.isIntentionallyClosed = true;
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
