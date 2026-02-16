/**
 * Algo Routes
 *
 * POST /api/algo/start    - Start algo trading
 * POST /api/algo/stop     - Stop algo trading
 * GET  /api/algo/status   - Get algo status
 */

'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { AlgoRunner } = require('../services/algo-runner');

const router = Router();

/**
 * POST /api/algo/start
 * Body: { strategyId, symbol, exchange, accountId, size, dailyTarget, maxRisk }
 */
router.post('/start', requireAuth, async (req, res) => {
  const { strategyId, symbol, exchange, accountId, size, dailyTarget, maxRisk } = req.body;

  if (!strategyId || !symbol || !accountId) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: strategyId, symbol, accountId',
    });
  }

  try {
    // Stop existing runner if any
    if (req.session.algoRunner && req.session.algoRunner.running) {
      await req.session.algoRunner.stop();
    }

    // Resolve account name and propfirm from the service
    const accounts = req.service.accounts || [];
    const matchedAccount = accounts.find((a) =>
      (a.rithmicAccountId || a.accountId) === accountId ||
      a.accountId === accountId ||
      a.name === accountId
    );
    const accountName = matchedAccount?.name || accountId;
    const propfirm = req.service.propfirm || req.service.platformName || null;

    // Create new algo runner
    const runner = new AlgoRunner(req.service);
    req.session.algoRunner = runner;

    const result = await runner.start({
      strategyId,
      symbol,
      exchange: exchange || 'CME',
      accountId,
      size: size || 1,
      dailyTarget: dailyTarget || null,
      maxRisk: maxRisk || null,
      accountName,
      propfirm,
    });

    if (!result.success) {
      req.session.algoRunner = null;
      return res.status(400).json(result);
    }

    res.json({ success: true, status: runner.getStatus() });
  } catch (err) {
    console.error('[Algo] Start error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to start algo' });
  }
});

/**
 * POST /api/algo/stop
 */
router.post('/stop', requireAuth, async (req, res) => {
  try {
    const runner = req.session.algoRunner;
    if (!runner || !runner.running) {
      return res.json({ success: true, message: 'No algo running' });
    }

    const result = await runner.stop();
    res.json(result);
  } catch (err) {
    console.error('[Algo] Stop error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to stop algo' });
  }
});

/**
 * GET /api/algo/status
 */
router.get('/status', requireAuth, (req, res) => {
  const runner = req.session.algoRunner;
  if (!runner) {
    return res.json({
      success: true,
      status: { running: false, config: null, position: null, stats: null, connected: false },
    });
  }

  res.json({ success: true, status: runner.getStatus() });
});

module.exports = router;
