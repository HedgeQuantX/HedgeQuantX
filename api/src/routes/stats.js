/**
 * Stats Routes
 *
 * GET /api/stats/overview            - Overview metrics (used by Stats page)
 * GET /api/stats/summary             - Quick summary (used by Dashboard)
 * GET /api/stats/equity              - Equity curve data
 * GET /api/stats/trades              - Recent trades list
 * GET /api/stats/:accountId          - Full stats for a specific account
 * GET /api/stats/:accountId/history  - Raw trade history
 *
 * NO MOCK DATA - All data from Rithmic API via RithmicService.
 * HQX Score uses the SAME calculation as the CLI (src/pages/stats/metrics.js).
 */

'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { calculateTradeStats } = require('../../../src/services/rithmic/trades');
const {
  aggregateStats,
  calculateDerivedMetrics,
  calculateQuantMetrics,
  calculateHQXScore,
} = require('../../../src/pages/stats/metrics');

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Gather trades + stats across all accounts in the session.
 * Returns { allTrades, accounts, totalPnl, totalBalance, stats, metrics, quant, hqxScore }.
 */
async function gatherAccountStats(service, session, days = 30) {
  const accounts = session.accounts || [];
  let allTrades = [];
  let totalPnl = 0;
  let totalBalance = 0;

  for (const acc of accounts) {
    const accountId = acc.rithmicAccountId || acc.accountId || acc.id;
    if (!accountId) continue;

    // P&L from cache (no API call)
    const pnl = service.getAccountPnL(accountId);
    totalPnl += pnl?.pnl || 0;
    totalBalance += pnl?.balance || acc.balance || 0;

    // Trade history
    try {
      const histResult = await service.getTradeHistory(accountId, days);
      if (histResult.success && histResult.trades) {
        allTrades = allTrades.concat(histResult.trades);
      }
    } catch (_) {
      // Account may not have trade history
    }
  }

  // Use CLI metrics functions (same as TUI Stats page)
  const stats = aggregateStats(accounts, allTrades);
  const metrics = calculateDerivedMetrics(stats, totalBalance, totalPnl);
  const quant = calculateQuantMetrics(allTrades, totalBalance, totalPnl);
  const hqxResult = calculateHQXScore(stats, metrics, totalBalance);

  return { allTrades, accounts, totalPnl, totalBalance, stats, metrics, quant, hqxScore: hqxResult };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/stats/overview
 * Full metrics overview (Stats page)
 */
router.get('/overview', requireAuth, async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;

  try {
    const data = await gatherAccountStats(req.service, req.session, days);

    res.json({
      success: true,
      totalBalance: data.totalBalance,
      totalPnl: data.totalPnl,
      totalTrades: data.stats.totalTrades,
      winRate: parseFloat(data.metrics.winRate) || null,
      profitFactor: parseFloat(data.metrics.profitFactor) || null,
      avgWin: parseFloat(data.metrics.avgWin) || null,
      avgLoss: parseFloat(data.metrics.avgLoss) || null,
      bestTrade: data.stats.bestTrade,
      worstTrade: data.stats.worstTrade,
      expectancy: data.metrics.expectancy,
      sharpe: parseFloat(data.quant.sharpeRatio) || null,
      sortino: parseFloat(data.quant.sortinoRatio) || null,
      maxDrawdown: data.quant.maxDrawdown,
      calmar: data.quant.maxDrawdown > 0 && data.totalPnl > 0
        ? parseFloat((data.totalPnl / data.quant.maxDrawdown).toFixed(2))
        : null,
      hqxScore: data.hqxScore.hqxScore,
      hqxGrade: data.hqxScore.scoreGrade,
      hqxBreakdown: data.hqxScore.breakdown,
    });
  } catch (err) {
    console.error('[Stats] Overview error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stats/summary
 * Quick summary for Dashboard (lighter query)
 */
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const data = await gatherAccountStats(req.service, req.session, 1);

    res.json({
      success: true,
      totalPnl: data.totalPnl,
      winRate: parseFloat(data.metrics.winRate) || null,
      tradesToday: data.stats.totalTrades,
      bestTrade: data.stats.bestTrade,
      worstTrade: data.stats.worstTrade,
    });
  } catch (err) {
    console.error('[Stats] Summary error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stats/equity
 * Equity curve data points for chart
 */
router.get('/equity', requireAuth, async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;

  try {
    const data = await gatherAccountStats(req.service, req.session, days);

    // Build equity curve from trade P&L series
    let equity = data.totalBalance - data.totalPnl; // Starting balance estimate
    const curve = [];

    // Sort trades by time
    const sorted = data.allTrades
      .filter((t) => t.timestamp || t.time || t.date)
      .sort((a, b) => {
        const ta = new Date(a.timestamp || a.time || a.date).getTime();
        const tb = new Date(b.timestamp || b.time || b.date).getTime();
        return ta - tb;
      });

    for (const trade of sorted) {
      const pnl = trade.profitAndLoss || trade.pnl || 0;
      equity += pnl;
      curve.push({
        date: new Date(trade.timestamp || trade.time || trade.date).toLocaleDateString(),
        equity: Math.round(equity * 100) / 100,
        pnl,
      });
    }

    res.json({ success: true, data: curve });
  } catch (err) {
    console.error('[Stats] Equity error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stats/trades
 * Recent trades list
 */
router.get('/trades', requireAuth, async (req, res) => {
  const days = parseInt(req.query.days, 10) || 30;
  const limit = parseInt(req.query.limit, 10) || 50;

  try {
    const data = await gatherAccountStats(req.service, req.session, days);

    // Sort by most recent first
    const sorted = data.allTrades
      .sort((a, b) => {
        const ta = new Date(a.timestamp || a.time || a.date || 0).getTime();
        const tb = new Date(b.timestamp || b.time || b.date || 0).getTime();
        return tb - ta;
      })
      .slice(0, limit);

    res.json({ success: true, trades: sorted, total: data.allTrades.length });
  } catch (err) {
    console.error('[Stats] Trades error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stats/:accountId
 * Full stats for a specific account
 */
router.get('/:accountId', requireAuth, async (req, res) => {
  const { accountId } = req.params;
  const days = parseInt(req.query.days, 10) || 30;

  try {
    const historyResult = await req.service.getTradeHistory(accountId, days);

    if (!historyResult.success) {
      return res.status(500).json({ success: false, error: 'Failed to fetch trade history' });
    }

    const trades = historyResult.trades || [];
    const tradeStats = calculateTradeStats(trades);
    const pnl = req.service.getAccountPnL(accountId);

    // Use CLI HQX Score calculation
    const accounts = [{ lifetimeStats: tradeStats }];
    const stats = aggregateStats(accounts, trades);
    const metrics = calculateDerivedMetrics(stats, pnl?.balance || 0, pnl?.pnl || 0);
    const hqxResult = calculateHQXScore(stats, metrics, pnl?.balance || 0);

    res.json({
      success: true,
      accountId,
      days,
      tradeCount: trades.length,
      stats: tradeStats,
      hqxScore: hqxResult.hqxScore,
      hqxGrade: hqxResult.scoreGrade,
      hqxBreakdown: hqxResult.breakdown,
      currentPnl: pnl,
      trades: trades.slice(0, 50),
    });
  } catch (err) {
    console.error('[Stats] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stats/:accountId/history
 * Raw trade history for an account
 */
router.get('/:accountId/history', requireAuth, async (req, res) => {
  const { accountId } = req.params;
  const days = parseInt(req.query.days, 10) || 30;
  const limit = parseInt(req.query.limit, 10) || 200;

  try {
    const historyResult = await req.service.getTradeHistory(accountId, days);

    if (!historyResult.success) {
      return res.status(500).json({ success: false, error: 'Failed to fetch trade history' });
    }

    const trades = historyResult.trades || [];

    res.json({
      success: true,
      accountId,
      days,
      total: trades.length,
      trades: trades.slice(0, limit),
    });
  } catch (err) {
    console.error('[Stats] History error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
