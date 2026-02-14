/**
 * WebSocket Handler
 *
 * Streams real-time data to authenticated clients:
 *   tick, pnl, position, signal, trade, log, status
 *
 * Client connects with JWT token as query param: ws://host:3001?token=xxx
 *
 * NO MOCK DATA - All data from Rithmic API via AlgoRunner / RithmicService.
 */

'use strict';

const { WebSocketServer } = require('ws');
const { verifyToken } = require('../middleware/auth');
const { sessionManager } = require('../services/session-manager');
const { AlgoRunner } = require('../services/algo-runner');
// CORS origin check handled by HTTP middleware, WS uses JWT auth only

/**
 * Send JSON to a WebSocket client (safe)
 */
function wsSend(ws, data) {
  if (ws.readyState === 1) { // OPEN
    try {
      ws.send(JSON.stringify(data));
    } catch (_) {}
  }
}

/**
 * Set up the WebSocket server on the HTTP server
 */
function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/' });

  wss.on('connection', (ws, req) => {
    // Extract token from query string
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      wsSend(ws, { type: 'error', message: 'Missing token' });
      ws.close(4001, 'Missing token');
      return;
    }

    // Verify JWT
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

    // Touch session
    session.lastActivity = Date.now();

    const sessionId = payload.sessionId;
    console.log(`[WS] Client connected (session ${sessionId.slice(0, 8)})`);

    wsSend(ws, { type: 'connected', sessionId: sessionId.slice(0, 8) });

    // -----------------------------------------------------------------------
    // Attach AlgoRunner event forwarding if algo is running
    // -----------------------------------------------------------------------
    let boundListeners = [];

    const attachAlgoListeners = (runner) => {
      if (!runner) return;

      const events = ['tick', 'pnl', 'position', 'signal', 'trade', 'log', 'status'];
      for (const event of events) {
        const fn = (data) => wsSend(ws, { type: event, ...data });
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

    // Attach to existing runner if any
    if (session.algoRunner) {
      attachAlgoListeners(session.algoRunner);
    }

    // -----------------------------------------------------------------------
    // P&L streaming from PNL_PLANT (independent of algo)
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
    }, 2000); // Every 2 seconds

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
          // Subscribe to market data via algo runner or standalone feed
          wsSend(ws, { type: 'log', level: 'info', message: `Subscribe: ${msg.symbol}:${msg.exchange || 'CME'}`, timestamp: Date.now() });
          break;
        }

        case 'algo.start': {
          const config = msg.config || msg;
          detachAlgoListeners();

          // Stop existing
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
          });

          if (!result.success) {
            wsSend(ws, { type: 'error', message: result.error });
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
          wsSend(ws, { type: 'error', message: `Unknown message type: ${msg.type}` });
      }
    });

    // -----------------------------------------------------------------------
    // Cleanup on disconnect
    // -----------------------------------------------------------------------
    ws.on('close', () => {
      console.log(`[WS] Client disconnected (session ${sessionId.slice(0, 8)})`);
      clearInterval(pnlInterval);
      detachAlgoListeners();
    });

    ws.on('error', (err) => {
      console.error(`[WS] Error (session ${sessionId.slice(0, 8)}):`, err.message);
      clearInterval(pnlInterval);
      detachAlgoListeners();
    });
  });

  console.log('[WS] WebSocket server initialized');
  return wss;
}

module.exports = { setupWebSocket };
