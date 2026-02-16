/**
 * Algo Smart Logs
 *
 * SmartLogsEngine integration for AlgoRunner.
 * Produces real-time quant analysis logs every 1 second (mirrors CLI algo-executor).
 * Strips chalk ANSI codes for web display and sends raw metrics for frontend coloring.
 *
 * NO MOCK DATA - All metrics from real strategy state via getAnalysisState().
 */

'use strict';

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\u001b\[[0-9;]*m/g;

let SmartLogsEngine;
try {
  ({ SmartLogsEngine } = require('../../../src/lib/smart-logs-engine'));
} catch (_) {
  SmartLogsEngine = null;
}

/**
 * Create and start a smart logs interval on an AlgoRunner instance.
 *
 * @param {Object} runner - AlgoRunner instance (must have .strategy, .config, .position, ._lastPrice, etc.)
 * @returns {Function|null} cleanup - Call to stop the interval, or null if engine unavailable
 */
function startSmartLogs(runner) {
  if (!SmartLogsEngine || !runner.strategy) return null;

  const symbolCode = runner.config.symbol.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '').toUpperCase();
  const engine = new SmartLogsEngine(runner.config.strategyId, symbolCode);

  let lastSecond = 0;
  let lastTickCount = 0;
  let staleCount = 0;
  const interval = setInterval(() => {
    if (!runner.running) return;
    const now = Math.floor(Date.now() / 1000);
    if (now === lastSecond) return;
    lastSecond = now;

    // Suppress duplicate logs when ticks are stale (feed disconnected or frozen)
    if (runner._tickCount === lastTickCount) {
      staleCount++;
      if (staleCount > 3) return; // Only allow 3 stale logs, then suppress
    } else {
      staleCount = 0;
      lastTickCount = runner._tickCount;
    }

    const contractId = runner.config.symbol;
    const state = runner.strategy.getAnalysisState?.(contractId, runner._lastPrice);

    const logState = {
      bars: state?.barsProcessed || 0,
      swings: state?.swingsDetected || 0,
      zones: state?.activeZones || 0,
      trend: runner._currentBias === 'LONG' ? 'bullish' : runner._currentBias === 'SHORT' ? 'bearish' : 'neutral',
      position: runner.position ? (runner.position.side === 'long' ? 1 : -1) : 0,
      price: runner._lastPrice || 0,
      delta: runner._runningDelta,
      buyPct: runner._runningBuyPct,
      tickCount: runner._tickCount,
      zScore: state?.zScore || 0,
      vpin: state?.vpin || 0,
      ofi: state?.ofi || 0,
    };

    const log = engine.getLog(logState);
    if (log) {
      runner.emit('smartlog', {
        type: log.type || 'analysis',
        message: log.message.replace(ANSI_REGEX, ''),
        timestamp: Date.now(),
        metrics: {
          price: runner._lastPrice,
          zScore: state?.zScore || 0,
          vpin: state?.vpin || 0,
          ofi: state?.ofi || 0,
          delta: runner._runningDelta,
          buyPct: runner._runningBuyPct,
          position: runner.position ? runner.position.side : null,
          tickCount: runner._tickCount,
        },
      });
    }
  }, 1000);

  return () => clearInterval(interval);
}

module.exports = { startSmartLogs };
