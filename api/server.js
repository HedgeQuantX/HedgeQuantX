/**
 * HQX Web API Server
 * Express.js + WebSocket bridge to Rithmic trading services
 *
 * NO MOCK DATA - All data from Rithmic API via RithmicService
 */

'use strict';

require('dotenv').config();

const http = require('http');
const express = require('express');
const { corsMiddleware } = require('./src/middleware/cors');
const { setupWebSocket } = require('./src/ws/handler');
const { sessionManager } = require('./src/services/session-manager');

// Routes
const authRoutes = require('./src/routes/auth');
const accountsRoutes = require('./src/routes/accounts');
const tradingRoutes = require('./src/routes/trading');
const algoRoutes = require('./src/routes/algo');
const contractsRoutes = require('./src/routes/contracts');
const statsRoutes = require('./src/routes/stats');

const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(corsMiddleware);
app.use(express.json());

// Request logging (minimal)
app.use((req, _res, next) => {
  if (req.path !== '/api/health') {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] ${req.method} ${req.path}`);
  }
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/algo', algoRoutes);
app.use('/api/contracts', contractsRoutes);
app.use('/api/stats', statsRoutes);

// Static data endpoints
const PROPFIRMS = [
  { id: 'apex', name: 'Apex Trader Funding', icon: '\u{1F537}' },
  { id: 'bulenox_r', name: 'Bulenox', icon: '\u{1F7E1}' },
  { id: 'topstep_r', name: 'Topstep', icon: '\u{1F7E2}' },
  { id: 'earn2trade', name: 'Earn2Trade', icon: '\u{1F535}' },
  { id: 'mescapital', name: 'MES Capital', icon: '\u26A1' },
  { id: 'tradefundrr', name: 'TradeFundrr', icon: '\u{1F7E0}' },
  { id: 'thetradingpit', name: 'The Trading Pit', icon: '\u{1F3DB}' },
  { id: 'fundedfutures', name: 'Funded Futures Network', icon: '\u{1F310}' },
  { id: 'propshop', name: 'PropShop Trader', icon: '\u{1F3EA}' },
  { id: '4proptrader', name: '4PropTrader', icon: '4\uFE0F\u20E3' },
  { id: 'daytraders', name: 'DayTraders.com', icon: '\u{1F4CA}' },
  { id: '10xfutures', name: '10X Futures', icon: '\u{1F51F}' },
  { id: 'lucidtrading', name: 'Lucid Trading', icon: '\u{1F48E}' },
  { id: 'thrivetrading', name: 'Thrive Trading', icon: '\u{1F4C8}' },
  { id: 'legendstrading', name: 'Legends Trading', icon: '\u{1F3C6}' },
  { id: 'rithmic_paper', name: 'Rithmic Paper Trading', icon: '\u{1F4DD}' },
];

const STRATEGIES = [
  {
    id: 'ultra-scalping',
    name: 'HQX Scalping',
    description: '6 Mathematical Models (Z-Score, VPIN, Kyle Lambda, Kalman, Vol, OFI)',
    winRate: 71.1,
    profitFactor: 1.86,
    riskReward: '1:2',
    stopTicks: 8,
    targetTicks: 16,
  },
  {
    id: 'hqx-2b',
    name: 'HQX-2B Liquidity Sweep',
    description: '2B Pattern with Liquidity Zone Sweeps',
    winRate: 82.8,
    profitFactor: 3.2,
    riskReward: '1:4',
    stopTicks: 10,
    targetTicks: 40,
  },
];

app.get('/api/propfirms', (_req, res) => {
  res.json({ success: true, propfirms: PROPFIRMS });
});

app.get('/api/strategies', (_req, res) => {
  res.json({ success: true, strategies: STRATEGIES });
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    activeSessions: sessionManager.getActiveCount(),
    timestamp: Date.now(),
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

setupWebSocket(server);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.listen(PORT, () => {
  console.log(`\n  HQX Web API running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
  console.log(`  WebSocket: ws://localhost:${PORT}\n`);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down...');
  await sessionManager.destroyAll();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
  // Force exit after 5s
  setTimeout(() => process.exit(1), 5000);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
