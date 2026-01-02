/**
 * =============================================================================
 * HQX Algo Trading System - Smart Algo Logger
 * =============================================================================
 * Provides rich, detailed logs for the algo UI
 * Copied from HQX-TG algo-logger.ts - All 47 log types
 */

'use strict';

/**
 * Smart Algo Logger - All 47 log types from HQX-TG
 */
const algoLogger = {
  // === MARKET DATA LOGS ===
  quote(ui, symbol, bid, ask, spread) {
    ui.addLog('info', `QUOTE ${symbol} - bid: ${bid.toFixed(2)} | ask: ${ask.toFixed(2)} | spread: ${spread.toFixed(2)}`);
  },

  tape(ui, symbol, buyVol, sellVol, delta) {
    const sign = delta > 0 ? '+' : '';
    ui.addLog('info', `TAPE ${symbol} - buy: ${buyVol} | sell: ${sellVol} | delta: ${sign}${delta}`);
  },

  dom(ui, symbol, bidDepth, askDepth, imbalance) {
    const direction = imbalance > 0 ? '▲' : imbalance < 0 ? '▼' : '=';
    ui.addLog('info', `DOM ${symbol} - bidDepth: ${bidDepth} | askDepth: ${askDepth} | imbalance: ${direction}${Math.abs(imbalance).toFixed(1)}%`);
  },

  volumeSpike(ui, symbol, volume, avgVolume, ratio) {
    ui.addLog('analysis', `VOLUME SPIKE ${symbol} - vol: ${volume} | avg: ${avgVolume.toFixed(0)} | ratio: ${ratio.toFixed(1)}x`);
  },

  // === ANALYSIS LOGS ===
  orderFlow(ui, symbol, score, direction) {
    const arrow = direction === 'LONG' ? '▲' : direction === 'SHORT' ? '▼' : '=';
    ui.addLog('analysis', `ORDER FLOW ${symbol} - score: ${score.toFixed(0)} | direction: ${arrow} ${direction}`);
  },

  absorption(ui, symbol, level, side, strength) {
    ui.addLog('analysis', `ABSORPTION ${side} - price: ${level.toFixed(2)} | strength: ${strength.toFixed(0)}%`);
  },

  sweep(ui, symbol, side, levels, volume) {
    ui.addLog('analysis', `SWEEP ${side} - levels: ${levels} | volume: ${volume}`);
  },

  iceberg(ui, symbol, price, hiddenSize) {
    ui.addLog('analysis', `ICEBERG DETECTED - price: ${price.toFixed(2)} | hidden: ${hiddenSize}`);
  },

  deltaDivergence(ui, symbol, priceDir, deltaDir) {
    ui.addLog('analysis', `DELTA DIVERGENCE - price: ${priceDir} | delta: ${deltaDir}`);
  },

  vpoc(ui, symbol, poc, valueHigh, valueLow) {
    ui.addLog('analysis', `VPOC ${symbol} - poc: ${poc.toFixed(2)} | VAH: ${valueHigh.toFixed(2)} | VAL: ${valueLow.toFixed(2)}`);
  },

  regime(ui, symbol, regime, confidence) {
    ui.addLog('analysis', `REGIME ${symbol} - ${regime} | confidence: ${confidence.toFixed(0)}%`);
  },

  volatility(ui, symbol, atr, regime) {
    ui.addLog('analysis', `VOLATILITY ${symbol} - ATR: ${atr.toFixed(2)} | regime: ${regime}`);
  },

  // === SIGNAL LOGS ===
  signalGenerated(ui, symbol, direction, confidence, strategy) {
    const arrow = direction === 'LONG' ? '▲' : '▼';
    ui.addLog('signal', `SIGNAL ${arrow} ${direction} - ${symbol} | conf: ${confidence.toFixed(0)}% | strategy: ${strategy}`);
  },

  signalRejected(ui, symbol, reason) {
    ui.addLog('warning', `SIGNAL REJECTED - ${symbol} | reason: ${reason}`);
  },

  signalExpired(ui, symbol) {
    ui.addLog('info', `SIGNAL EXPIRED - ${symbol}`);
  },

  // === TRADE LOGS ===
  orderSubmitted(ui, symbol, side, size, price) {
    ui.addLog('trade', `ORDER SUBMITTED - ${side} ${size} ${symbol} @ ${price.toFixed(2)}`);
  },

  orderFilled(ui, symbol, side, size, price) {
    ui.addLog('trade', `ORDER FILLED - ${side} ${size} ${symbol} @ ${price.toFixed(2)}`);
  },

  orderRejected(ui, symbol, reason) {
    ui.addLog('error', `ORDER REJECTED - ${symbol} | ${reason}`);
  },

  orderCancelled(ui, symbol, orderId) {
    ui.addLog('warning', `ORDER CANCELLED - ${symbol} | id: ${orderId}`);
  },

  positionOpened(ui, symbol, side, size, entry) {
    const arrow = side === 'LONG' ? '▲' : '▼';
    ui.addLog('trade', `POSITION OPENED ${arrow} - ${side} ${size} ${symbol} @ ${entry.toFixed(2)}`);
  },

  positionClosed(ui, symbol, side, size, exit, pnl) {
    const pnlStr = pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`;
    const type = pnl >= 0 ? 'trade' : 'warning';
    ui.addLog(type, `POSITION CLOSED - ${side} ${size} ${symbol} @ ${exit.toFixed(2)} | PnL: ${pnlStr}`);
  },

  stopHit(ui, symbol, price, loss) {
    ui.addLog('warning', `STOP LOSS HIT - ${symbol} @ ${price.toFixed(2)} | loss: -$${Math.abs(loss).toFixed(2)}`);
  },

  targetHit(ui, symbol, price, profit) {
    ui.addLog('trade', `TARGET HIT - ${symbol} @ ${price.toFixed(2)} | profit: +$${profit.toFixed(2)}`);
  },

  trailingStopMoved(ui, symbol, oldStop, newStop) {
    ui.addLog('info', `TRAILING STOP MOVED - ${symbol} | ${oldStop.toFixed(2)} → ${newStop.toFixed(2)}`);
  },

  fillSync(ui, side, size, price, orderId) {
    ui.addLog('trade', `FILL (SYNC) - ${side} ${size} @ ${price.toFixed(2)} (order #${orderId})`);
  },

  entryConfirmed(ui, side, size, symbol, price) {
    ui.addLog('info', `ENTRY CONFIRMED - ${side} ${size}x ${symbol} @ ${price.toFixed(2)}`);
  },

  stopsSet(ui, sl, tp) {
    ui.addLog('info', `STOPS SET - SL: ${sl.toFixed(2)} | TP: ${tp.toFixed(2)}`);
  },

  // === RISK LOGS ===
  riskCheck(ui, passed, reason) {
    const type = passed ? 'info' : 'warning';
    ui.addLog(type, `RISK CHECK ${passed ? 'PASSED' : 'BLOCKED'} - ${reason}`);
  },

  dailyLimitWarning(ui, current, limit) {
    ui.addLog('warning', `DAILY LIMIT WARNING - PnL: $${current.toFixed(2)} / limit: $${limit.toFixed(2)}`);
  },

  maxDrawdownWarning(ui, current, max) {
    ui.addLog('warning', `DRAWDOWN WARNING - current: ${current.toFixed(1)}% / max: ${max.toFixed(1)}%`);
  },

  positionSized(ui, contracts, kelly, riskAmount, riskPct) {
    ui.addLog('info', `POSITION SIZE - ${contracts} contracts | kelly: ${kelly.toFixed(2)} | risk: $${riskAmount} (${riskPct}% of max)`);
  },

  bracketSet(ui, stopTicks, targetTicks, rr) {
    ui.addLog('info', `BRACKET SET - SL: ${stopTicks}t | TP: ${targetTicks}t | R:R: ${rr.toFixed(1)}`);
  },

  // === STRATEGY LOGS ===
  strategySelected(ui, strategy, session, regime) {
    ui.addLog('info', `STRATEGY SELECTED - ${strategy} | session: ${session} | regime: ${regime}`);
  },

  strategySwitch(ui, from, to, reason) {
    ui.addLog('info', `STRATEGY SWITCH - ${from} → ${to} | ${reason}`);
  },

  // === SESSION LOGS ===
  sessionStart(ui, session) {
    ui.addLog('info', `SESSION START - ${session}`);
  },

  sessionEnd(ui, session) {
    ui.addLog('info', `SESSION END - ${session}`);
  },

  marketOpen(ui, session, etTime) {
    ui.addLog('info', `MARKET OPEN - ${session} SESSION | ET: ${etTime} ET`);
  },

  marketClosed(ui) {
    ui.addLog('warning', `MARKET CLOSED - Trading paused`);
  },

  // === SYSTEM LOGS ===
  connectingToEngine(ui, accountId) {
    ui.addLog('info', `CONNECTING TO ALGO ENGINE... - Account: ${accountId}`);
  },

  engineStarting(ui, platform, dailyTarget, dailyRisk) {
    ui.addLog('info', `ALGO ENGINE STARTING... - Platform: ${platform} | Daily Target: $${dailyTarget} | Daily Risk: $${dailyRisk}`);
  },

  engineStarted(ui, platform, status) {
    ui.addLog('info', `ALGO ENGINE STARTED - Status: ${status}`);
  },

  engineStopped(ui, reason) {
    ui.addLog('info', `ENGINE STOPPED - ${reason || 'All positions flat'}`);
  },

  algoOperational(ui, platform) {
    ui.addLog('info', `ALGO FULLY OPERATIONAL - Connected to ${platform} - Scanning for alpha...`);
  },

  dataConnected(ui, source) {
    ui.addLog('info', `WEBSOCKET CONNECTED - Real-time updates enabled`);
  },

  dataDisconnected(ui, source, reason) {
    ui.addLog('warning', `WEBSOCKET DISCONNECTED - Attempting to reconnect...`);
  },

  heartbeat(ui, tps, latency) {
    ui.addLog('info', `HEARTBEAT - tps: ${tps} | latency: ${latency}ms`);
  },

  latencyReport(ui, latency) {
    ui.addLog('analysis', `LATENCY - ${latency}ms order-to-fill`);
  },

  // === GENERIC ===
  info(ui, message, details) {
    ui.addLog('info', details ? `${message} - ${details}` : message);
  },

  warning(ui, message, details) {
    ui.addLog('warning', details ? `${message} - ${details}` : message);
  },

  error(ui, message, details) {
    ui.addLog('error', details ? `${message} - ${details}` : message);
  },

  signal(ui, message, details) {
    ui.addLog('signal', details ? `${message} - ${details}` : message);
  },

  trade(ui, message, details) {
    ui.addLog('trade', details ? `${message} - ${details}` : message);
  },

  analysis(ui, message, details) {
    ui.addLog('analysis', details ? `${message} - ${details}` : message);
  },
};

module.exports = { algoLogger };
