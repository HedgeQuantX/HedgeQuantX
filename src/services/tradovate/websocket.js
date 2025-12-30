/**
 * Tradovate WebSocket Module
 * Real-time updates via WebSocket
 */

const WebSocket = require('ws');
const { getTradingWebSocketUrl, WS_EVENTS } = require('./constants');

/**
 * Create WebSocket connection
 * @param {TradovateService} service - The Tradovate service instance
 */
const connectWebSocket = async (service) => {
  return new Promise((resolve, reject) => {
    const wsUrl = getTradingWebSocketUrl(service.isDemo);
    service.ws = new WebSocket(wsUrl);
    service.wsRequestId = 1;

    service.ws.on('open', () => {
      wsSend(service, 'authorize', '', { token: service.accessToken });
      resolve(true);
    });

    service.ws.on('message', (data) => {
      handleWsMessage(service, data);
    });

    service.ws.on('error', (err) => {
      service.emit('error', err);
      reject(err);
    });

    service.ws.on('close', () => {
      service.emit('disconnected');
    });

    setTimeout(() => reject(new Error('WebSocket timeout')), 10000);
  });
};

/**
 * Send WebSocket message
 */
const wsSend = (service, url, query = '', body = null) => {
  if (!service.ws || service.ws.readyState !== WebSocket.OPEN) return;

  const msg = body
    ? `${url}\n${service.wsRequestId++}\n${query}\n${JSON.stringify(body)}`
    : `${url}\n${service.wsRequestId++}\n${query}\n`;

  service.ws.send(msg);
};

/**
 * Handle WebSocket message
 */
const handleWsMessage = (service, data) => {
  try {
    const str = data.toString();
    
    if (str.startsWith('a')) {
      const json = JSON.parse(str.slice(1));
      if (Array.isArray(json)) {
        json.forEach(msg => processWsEvent(service, msg));
      }
    }
  } catch (e) {
    // Ignore parse errors
  }
};

/**
 * Process WebSocket event
 */
const processWsEvent = (service, msg) => {
  if (msg.e === 'props') {
    if (msg.d?.orders) service.emit(WS_EVENTS.ORDER, msg.d.orders);
    if (msg.d?.positions) service.emit(WS_EVENTS.POSITION, msg.d.positions);
    if (msg.d?.cashBalances) service.emit(WS_EVENTS.CASH_BALANCE, msg.d.cashBalances);
  }
};

/**
 * Disconnect WebSocket
 */
const disconnectWebSocket = (service) => {
  if (service.ws) {
    service.ws.close();
    service.ws = null;
  }
};

module.exports = {
  connectWebSocket,
  wsSend,
  disconnectWebSocket
};
