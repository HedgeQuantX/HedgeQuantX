/**
 * Algo Smart Logs — Event-Driven, Not Time-Driven
 *
 * Only emits logs when something MEANINGFUL changes:
 * - Price moves to a new tick level
 * - Z-Score crosses a regime threshold (scanning/building/setup/signal)
 * - Position opens/closes
 * - Signal/trade/risk events (never suppressed)
 * - Heartbeat every 10s when market is quiet (scanning, no movement)
 *
 * NO wall of identical ANLZ logs. Professional HF-grade output.
 * NO MOCK DATA - All metrics from real strategy state.
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

// Z-Score regime thresholds
const Z_REGIMES = [
  { min: 2.0, label: 'extreme' },
  { min: 1.5, label: 'setup' },
  { min: 1.0, label: 'building' },
  { min: 0,   label: 'scanning' },
];

function getZRegime(absZ) {
  for (const r of Z_REGIMES) {
    if (absZ >= r.min) return r.label;
  }
  return 'scanning';
}

/**
 * Start event-driven smart logs on an AlgoRunner instance.
 *
 * @param {Object} runner - AlgoRunner instance
 * @returns {Function|null} cleanup function or null
 */
function startSmartLogs(runner) {
  if (!SmartLogsEngine || !runner.strategy) return null;

  const symbolCode = runner.config.symbol.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, '').toUpperCase();
  const engine = new SmartLogsEngine(runner.config.strategyId, symbolCode);

  // State tracking for change detection
  let lastPrice = 0;
  let lastZRegime = 'scanning';
  let lastPosition = 0;
  let lastLogTime = 0;
  let lastTickCount = 0;
  let staleCount = 0;

  const HEARTBEAT_MS = 10000; // 10s heartbeat when quiet
  const MIN_INTERVAL_MS = 2000; // Min 2s between ANLZ logs (prevent spam on volatile markets)

  const interval = setInterval(() => {
    if (!runner.running) return;
    const now = Date.now();

    // Stale tick detection
    if (runner._tickCount === lastTickCount) {
      staleCount++;
      if (staleCount > 5) return; // Feed dead, stop logging
    } else {
      staleCount = 0;
      lastTickCount = runner._tickCount;
    }

    const contractId = runner.config.symbol;
    const state = runner.strategy.getAnalysisState?.(contractId, runner._lastPrice);
    const price = runner._lastPrice || 0;
    const absZ = Math.abs(state?.zScore || 0);
    const currentZRegime = getZRegime(absZ);
    const currentPosition = runner.position ? (runner.position.side === 'long' ? 1 : -1) : 0;

    // Determine if something meaningful changed
    const priceChanged = price !== lastPrice;
    const regimeChanged = currentZRegime !== lastZRegime;
    const positionChanged = currentPosition !== lastPosition;
    const isHeartbeat = (now - lastLogTime) >= HEARTBEAT_MS;
    const minIntervalPassed = (now - lastLogTime) >= MIN_INTERVAL_MS;

    // Decision: should we log?
    let shouldLog = false;
    if (positionChanged) shouldLog = true;           // Always log position changes
    else if (regimeChanged && minIntervalPassed) shouldLog = true; // Z regime crossed
    else if (priceChanged && currentZRegime !== 'scanning' && minIntervalPassed) shouldLog = true; // Price moved while Z is interesting
    else if (isHeartbeat) shouldLog = true;           // Heartbeat for quiet markets

    if (!shouldLog) return;

    // Build log state for engine
    const logState = {
      bars: state?.barsProcessed || 0,
      swings: state?.swingsDetected || 0,
      zones: state?.activeZones || 0,
      trend: runner._currentBias === 'LONG' ? 'bullish' : runner._currentBias === 'SHORT' ? 'bearish' : 'neutral',
      position: currentPosition,
      price,
      delta: runner._runningDelta,
      buyPct: runner._runningBuyPct,
      tickCount: runner._tickCount,
      zScore: state?.zScore || 0,
      vpin: state?.vpin || 0,
      ofi: state?.ofi || 0,
    };

    const log = engine.getLog(logState);
    if (!log) return;

    const cleanMsg = log.message.replace(ANSI_REGEX, '');
    const logType = log.type || 'analysis';

    // Update tracking state
    lastPrice = price;
    lastZRegime = currentZRegime;
    lastPosition = currentPosition;
    lastLogTime = now;

    runner.emit('smartlog', {
      type: logType,
      message: cleanMsg,
      timestamp: now,
      metrics: {
        price,
        zScore: state?.zScore || 0,
        vpin: state?.vpin || 0,
        ofi: state?.ofi || 0,
        delta: runner._runningDelta,
        buyPct: runner._runningBuyPct,
        position: runner.position ? runner.position.side : null,
        tickCount: runner._tickCount,
      },
    });
  }, 1000);

  return () => clearInterval(interval);
}

module.exports = { startSmartLogs };
