/**
 * WebSocket Handler
 *
 * Streams real-time data to authenticated clients.
 * Auth: JWT via query param (?token=xxx) or first message ({ type: 'auth', token: 'xxx' })
 *
 * Event mapping mirrors CLI algo-executor → ui.addLog() pipeline.
 * All 17+ CLI log types forwarded to frontend.
 *
 * NO MOCK DATA - All data from Rithmic API via AlgoRunner / RithmicService.
 */

'use strict';

const { WebSocketServer } = require('ws');
const { verifyToken } = require('../middleware/auth');
const { sessionManager } = require('../services/session-manager');
const { AlgoRunner } = require('../services/algo-runner');
const { ALLOWED_ORIGINS } = require('../middleware/cors');

/**
 * Send JSON to a WebSocket client (safe)
 */
function wsSend(ws, data) {
  if (ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(data));
    } catch (_) {}
  }
}

/**
 * Validate algo config input (same checks as REST route)
 */
function validateAlgoConfig(config) {
  if (!config) return 'Missing config';
  if (!config.strategyId || typeof config.strategyId !== 'string') return 'Invalid strategyId';
  if (!config.symbol || typeof config.symbol !== 'string' || config.symbol.length > 20) return 'Invalid symbol';
  if (!config.accountId) return 'Missing accountId';
  const size = config.size || 1;
  if (typeof size !== 'number' || size < 1 || size > 100 || !Number.isInteger(size)) return 'Invalid size';
  return null;
}

/**
 * Set up the WebSocket server on the HTTP server
 */
function setupWebSocket(server) {
  const wss = new WebSocketServer({
    server,
    path: '/',
    maxPayload: 4096, // 4KB max message size
    verifyClient: (info) => {
      const origin = info.origin || info.req.headers.origin;
      if (!origin) return true; // Allow non-browser clients (curl, mobile apps)
      return ALLOWED_ORIGINS.includes(origin);
    },
  });

  wss.on('connection', (ws, req) => {
    // Extract token from query string
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    // If token provided in URL, authenticate immediately
    if (token) {
      authenticateAndSetup(ws, token);
    } else {
      // Wait for auth message as first message
      ws.once('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(raw.toString());
        } catch (_) {
          wsSend(ws, { type: 'error', message: 'Invalid JSON' });
          ws.close(4001, 'Invalid auth message');
          return;
        }
        if (msg.type === 'auth' && msg.token) {
          authenticateAndSetup(ws, msg.token);
        } else {
          wsSend(ws, { type: 'error', message: 'First message must be auth' });
          ws.close(4001, 'Missing auth');
        }
      });

      // Auto-close if no auth within 5 seconds
      const authTimeout = setTimeout(() => {
        if (ws.readyState === 1) {
          wsSend(ws, { type: 'error', message: 'Auth timeout' });
          ws.close(4001, 'Auth timeout');
        }
      }, 5000);
      ws._authTimeout = authTimeout;
    }
  });

  function authenticateAndSetup(ws, token) {
    if (ws._authTimeout) clearTimeout(ws._authTimeout);

    const payload = verifyToken(token);
    if (!payload) {
      wsSend(ws, { type: 'error', message: 'Invalid token' });
      ws.close(4002, 'Invalid token');
      return;
    }

    const session = sessionManager.get(payload.sessionId);
    if (!session) {
      wsSend(ws, { type: 'error', message: 'Session expired' });
      ws.close(4003, 'Session expired');
      return;
    }

    session.lastActivity = Date.now();
    const sessionId = payload.sessionId;
    const logId = sessionId.slice(0, 8);

    console.log(`[WS] Client connected (session ${logId})`);
    wsSend(ws, { type: 'connected', sessionId: logId });

    // -----------------------------------------------------------------------
    // AlgoRunner event forwarding
    // -----------------------------------------------------------------------
    let boundListeners = [];

    const attachAlgoListeners = (runner) => {
      if (!runner) return;

      // Map AlgoRunner events → frontend-expected event types
      // Mirrors ALL CLI log types: system, connected, ready, signal, trade,
      // fill_buy, fill_sell, fill_win, fill_loss, error, risk, analysis, etc.
      const eventMap = {
        tick: (data) => ({ type: 'algo.price', payload: data }),
        pnl: (data) => ({ type: 'algo.pnl', pnl: data.dayPnl, payload: data }),
        position: (data) => ({
          type: 'algo.position',
          position: data.side ? (data.side === 'long' ? 'LONG' : data.side === 'short' ? 'SHORT' : 'FLAT') : 'FLAT',
          payload: data,
        }),
        signal: (data) => ({
          type: 'algo.event', payload: {
            ...data, kind: 'signal', timestamp: Date.now(),
            message: `Signal: ${(data.direction || '').toUpperCase()} @ ${data.entry || 'MKT'} | SL=${data.sl || 'N/A'} | TP=${data.tp || 'N/A'} | conf=${data.confidence != null ? (data.confidence * 100).toFixed(0) + '%' : 'N/A'}`,
          },
        }),
        trade: (data) => ({
          type: 'algo.event', payload: {
            ...data, kind: 'trade', timestamp: Date.now(),
            message: data.message || `${data.isWin ? 'WIN' : 'LOSS'} ${(data.direction || '').toUpperCase()} ${data.entry || ''} → ${data.exit || ''} | ${data.pnl != null ? (data.pnl >= 0 ? '+' : '') + '$' + data.pnl.toFixed(2) : ''}`,
          },
        }),
        log: (data) => ({ type: 'algo.event', payload: data }),
        smartlog: (data) => ({ type: 'algo.event', payload: { ...data, kind: 'smartlog' } }),
        statsUpdate: (data) => ({ type: 'algo.stats', payload: data }),
        summary: (data) => ({ type: 'algo.summary', payload: data }),
        status: (data) => ({
          type: 'algo.state',
          payload: {
            ...data,
            strategy: runner.config?.strategyId,
            symbol: runner.config?.symbol,
            startedAt: runner.stats?.startTime,
            contracts: runner.config?.size,
            dailyTarget: runner.config?.dailyTarget,
            maxRisk: runner.config?.maxRisk,
            accountName: runner.config?.accountName,
            propfirm: runner.config?.propfirm,
          },
        }),
        stopped: (data) => ({ type: 'algo.stopped', payload: data || {} }),
      };

      for (const [event, transform] of Object.entries(eventMap)) {
        const fn = (data) => wsSend(ws, transform(data));
        runner.on(event, fn);
        boundListeners.push({ runner, event, fn });
      }
    };

    const detachAlgoListeners = () => {
      for (const { runner, event, fn } of boundListeners) {
        runner.removeListener(event, fn);
      }
      boundListeners = [];
    };

    if (session.algoRunner) {
      attachAlgoListeners(session.algoRunner);

      // Replay buffered logs so WS clients connecting after algo start see history
      const buffer = session.algoRunner._logBuffer;
      if (buffer && buffer.length > 0) {
        for (const entry of buffer) {
          wsSend(ws, { type: 'algo.event', payload: entry });
        }
      }
    }

    // -----------------------------------------------------------------------
    // P&L streaming (every 2s from Rithmic PNL_PLANT cache)
    // -----------------------------------------------------------------------
    const pnlInterval = setInterval(() => {
      if (ws.readyState !== 1) return;
      const currentSession = sessionManager.get(sessionId);
      if (!currentSession) return;

      const service = currentSession.service;
      for (const acc of service.accounts) {
        const pnl = service.getAccountPnL(acc.accountId);
        if (pnl.pnl !== null) {
          wsSend(ws, {
            type: 'pnl',
            accountId: acc.accountId,
            dayPnl: pnl.pnl,
            openPnl: pnl.openPnl,
            closedPnl: pnl.closedPnl,
            balance: pnl.balance,
          });
        }
      }
    }, 2000);

    // -----------------------------------------------------------------------
    // Real-time position & order streaming via Rithmic events
    // -----------------------------------------------------------------------
    const positionUpdateHandler = () => {
      if (ws.readyState !== 1) return;
      const currentSession = sessionManager.get(sessionId);
      if (!currentSession) return;
      const svc = currentSession.service;

      // Build positions with real P&L from both positions map AND PNL_PLANT cache
      const posArr = Array.from(svc.positions.values())
        .filter((p) => p.quantity !== 0)
        .map((p) => {
          // Position-level openPnl from Rithmic position updates
          let posOpenPnl = p.openPnl || 0;

          // If position-level P&L is 0, fall back to account-level PNL_PLANT cache
          if (posOpenPnl === 0 && p.accountId) {
            const accPnl = svc.getAccountPnL(p.accountId);
            posOpenPnl = accPnl.openPnl || 0;
          }

          // Entry price: prefer position's averagePrice, fallback to algo runner's tracked entry
          let entry = p.averagePrice || 0;
          if (entry === 0 && currentSession.algoRunner?.position?.entryPrice) {
            entry = currentSession.algoRunner.position.entryPrice;
          }

          return {
            symbol: p.symbol || p.contractId || '',
            side: p.quantity > 0 ? 'LONG' : p.quantity < 0 ? 'SHORT' : 'FLAT',
            size: Math.abs(p.quantity || 0),
            entry,
            pnl: posOpenPnl,
          };
        });

      wsSend(ws, { type: 'positions', positions: posArr });
    };

    const orderNotificationHandler = () => {
      if (ws.readyState !== 1) return;
      const currentSession = sessionManager.get(sessionId);
      if (!currentSession) return;
      // Fetch fresh orders on any order notification
      currentSession.service.getOrders().then((result) => {
        if (result.success) {
          wsSend(ws, {
            type: 'orders',
            orders: (result.orders || []).map((o) => ({
              id: o.orderId || o.id || null,
              symbol: o.symbol || '',
              side: o.side === 0 ? 'BUY' : 'SELL',
              type: o.orderType || o.type || '',
              qty: o.quantity || o.qty || 0,
              price: o.price || o.limitPrice || o.stopPrice || 0,
            })),
          });
        }
      }).catch(() => {});
    };

    if (typeof session.service.on === 'function') {
      session.service.on('positionUpdate', positionUpdateHandler);
      session.service.on('orderNotification', orderNotificationHandler);
    }

    // -----------------------------------------------------------------------
    // Handle messages FROM client
    // -----------------------------------------------------------------------
    ws.on('message', async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (_) {
        wsSend(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }

      const currentSession = sessionManager.get(sessionId);
      if (!currentSession) {
        wsSend(ws, { type: 'error', message: 'Session expired' });
        ws.close(4003, 'Session expired');
        return;
      }

      currentSession.lastActivity = Date.now();

      switch (msg.type) {
        case 'subscribe': {
          wsSend(ws, {
            type: 'log', level: 'info',
            message: `Subscribe: ${msg.symbol}:${msg.exchange || 'CME'}`,
            timestamp: Date.now(),
          });
          break;
        }

        case 'algo.start': {
          const config = msg.config || msg;
          const validationError = validateAlgoConfig(config);
          if (validationError) {
            wsSend(ws, { type: 'error', message: validationError });
            break;
          }

          detachAlgoListeners();

          if (currentSession.algoRunner && currentSession.algoRunner.running) {
            await currentSession.algoRunner.stop();
          }

          const runner = new AlgoRunner(currentSession.service);
          currentSession.algoRunner = runner;
          attachAlgoListeners(runner);

          const result = await runner.start({
            strategyId: config.strategyId,
            symbol: config.symbol,
            exchange: config.exchange || 'CME',
            accountId: config.accountId,
            size: config.size || 1,
            dailyTarget: config.dailyTarget || null,
            maxRisk: config.maxRisk || null,
            accountName: config.accountName || null,
            propfirm: config.propfirm || null,
          });

          if (!result.success) {
            wsSend(ws, { type: 'error', message: result.error || 'Algo start failed' });
            currentSession.algoRunner = null;
            detachAlgoListeners();
          }
          break;
        }

        case 'algo.stop': {
          if (currentSession.algoRunner && currentSession.algoRunner.running) {
            await currentSession.algoRunner.stop();
          }
          detachAlgoListeners();
          break;
        }

        case 'ping': {
          wsSend(ws, { type: 'pong', timestamp: Date.now() });
          break;
        }

        default:
          // Don't echo unknown message types (info leak)
          wsSend(ws, { type: 'error', message: 'Unknown message type' });
      }
    });

    // -----------------------------------------------------------------------
    // Cleanup on disconnect
    // -----------------------------------------------------------------------
    ws.on('close', () => {
      console.log(`[WS] Client disconnected (session ${logId})`);
      clearInterval(pnlInterval);
      detachAlgoListeners();
      if (typeof session.service.removeListener === 'function') {
        session.service.removeListener('positionUpdate', positionUpdateHandler);
        session.service.removeListener('orderNotification', orderNotificationHandler);
      }
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error (session ${logId}):`, err.message);
      clearInterval(pnlInterval);
      detachAlgoListeners();
      if (typeof session.service.removeListener === 'function') {
        session.service.removeListener('positionUpdate', positionUpdateHandler);
        session.service.removeListener('orderNotification', orderNotificationHandler);
      }
    });
  }

  console.log('[WS] WebSocket server initialized');
  return wss;
}

module.exports = { setupWebSocket };
