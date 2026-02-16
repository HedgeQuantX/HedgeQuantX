/**
 * Algo Runner — Stop & Risk Module
 *
 * Extracted from algo-runner.js to comply with 500-line max rule.
 * Contains:
 * - 5-step emergency flatten (mirrors CLI lines 594-714)
 * - P&L polling from Rithmic cache (mirrors CLI lines 461-522)
 * - Auto-stop checks (daily target / max risk)
 *
 * NO MOCK DATA - All data from Rithmic API.
 */

'use strict';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 5-step emergency flatten — mirrors CLI algo-executor lines 594-714 EXACTLY.
 * Called as: await emergencyFlatten(runner, reason)
 *
 * @param {AlgoRunner} runner - AlgoRunner instance (this)
 * @param {string} reason - Stop reason ('manual', 'target', 'risk')
 * @returns {{ success: boolean, stats: object }}
 */
async function emergencyFlatten(runner, reason = 'manual') {
  if (!runner.running) return { success: true, message: 'Algo not running' };
  runner.running = false;

  runner._log('system', 'Stopping algo — emergency flatten initiated...');
  if (runner._stopSmartLogs) { runner._stopSmartLogs(); runner._stopSmartLogs = null; }
  if (runner._pnlInterval) { clearInterval(runner._pnlInterval); runner._pnlInterval = null; }

  const accountId = runner.config?.accountId;
  const symbol = runner.config?.symbol;
  const exchange = runner.config?.exchange || 'CME';

  // STEP 1: Cancel ALL pending orders (CLI line 608-617)
  try {
    await runner.service.cancelAllOrders(accountId);
    runner._log('system', 'All pending orders cancelled');
  } catch (err) {
    runner._log('error', `Cancel orders failed: ${err.message}`);
  }

  if (runner.bracketCleanup) {
    try { await runner.bracketCleanup(); } catch (_) {}
    runner.bracketCleanup = null;
  }
  runner._activeBrackets = { slOrderId: null, tpOrderId: null, entryPrice: null };

  // Wait for cancellations (CLI line 620)
  await delay(1000);

  // STEP 2: Rithmic-native ExitPosition (CLI line 622-634)
  try {
    runner._log('system', 'Exiting position via Rithmic...');
    const exitResult = await runner.service.exitPosition(accountId, symbol, exchange);
    if (exitResult.success) runner._log('system', 'Exit position command sent');
  } catch (err) {
    runner._log('error', `ExitPosition failed: ${err.message}`);
  }

  // Wait for exit (CLI line 637)
  await delay(2000);

  // STEP 3: Verify position from Rithmic API (CLI line 639-658)
  let positionToFlatten = 0;
  try {
    const posResult = await runner.service.getPositions();
    const positions = posResult.positions || [];
    for (const pos of positions) {
      const sym = pos.symbol || '';
      if (sym.includes(symbol) || symbol.includes(sym)) {
        const qty = parseInt(pos.quantity);
        if (!isNaN(qty) && qty !== 0 && Math.abs(qty) <= 100) {
          positionToFlatten = qty;
          break;
        }
      }
    }
  } catch (_) {}

  // STEP 4: Market order flatten if still open (CLI line 660-688)
  if (positionToFlatten !== 0) {
    const side = positionToFlatten > 0 ? 'LONG' : 'SHORT';
    const sz = Math.abs(positionToFlatten);
    runner._log('system', `Flattening ${side} ${sz} @ market...`);

    try {
      const flatResult = await runner.service.placeOrder({
        accountId, symbol, exchange, type: 2,
        side: positionToFlatten > 0 ? 1 : 0,
        size: sz,
      });
      if (flatResult.success) {
        runner._log(positionToFlatten > 0 ? 'fill_sell' : 'fill_buy', 'Position flattened @ market');
      } else {
        runner._log('error', `Flatten failed: ${flatResult.error}`);
      }
    } catch (err) {
      runner._log('error', `Flatten error: ${err.message}`);
    }

    // Wait for fill (CLI line 690)
    await delay(2000);

    // STEP 5: Final verification (CLI line 692-710)
    try {
      const verifyResult = await runner.service.getPositions();
      const vPos = (verifyResult.positions || []).find((p) => {
        const sym = p.symbol || '';
        return sym.includes(symbol);
      });
      if (vPos && vPos.quantity && Math.abs(parseInt(vPos.quantity)) > 0) {
        runner._log('error', `WARNING: Position still open! Qty: ${vPos.quantity}`);
      } else {
        runner._log('system', 'Position verified flat');
      }
    } catch (_) {}
  } else {
    runner._log('system', 'No position to flatten');
  }

  // Cleanup
  runner._removePositionUpdateListener();
  runner.position = null;
  runner._currentPosition = 0;
  await runner._cleanupFeed();

  const duration = Date.now() - (runner.stats.startTime || Date.now());
  const winRate = runner.stats.trades > 0 ? ((runner.stats.wins / runner.stats.trades) * 100) : 0;
  runner._log('system', `Algo stopped — ${reason.toUpperCase()}`);

  runner.emit('summary', {
    reason, duration,
    trades: runner.stats.trades, wins: runner.stats.wins, losses: runner.stats.losses,
    winRate: Number(winRate.toFixed(1)), pnl: runner.stats.totalPnl,
    target: runner.config?.dailyTarget || null,
  });
  runner._emitStatus();
  runner.emit('stopped', { reason, stats: { ...runner.stats } });
  return { success: true, stats: runner.stats };
}

/**
 * Start P&L polling every 2s from Rithmic cache.
 * Mirrors CLI algo-executor lines 461-522.
 *
 * @param {AlgoRunner} runner - AlgoRunner instance
 */
function startPnlPolling(runner) {
  const accId = runner.config.accountId;
  const pollPnl = () => {
    if (!runner.running) return;
    try {
      const pnlData = runner.service.getAccountPnL(accId);
      if (pnlData && pnlData.pnl !== null && pnlData.pnl !== undefined && !isNaN(pnlData.pnl)) {
        if (runner._startingPnL === null) runner._startingPnL = pnlData.pnl;
        const newPnl = pnlData.pnl - runner._startingPnL;
        if (!isNaN(newPnl)) {
          runner.stats.totalPnl = newPnl;
          runner.emit('pnl', { dayPnl: newPnl, openPnl: 0, closedPnl: newPnl });
        }
      }

      // Risk checks (CLI lines 508-519)
      if (!isNaN(runner.stats.totalPnl)) {
        checkAutoStop(runner);
      }
    } catch (_) {}
  };

  runner._pnlInterval = setInterval(pollPnl, 2000);
  pollPnl(); // Initial poll
}

/**
 * Check daily target / max risk auto-stop.
 *
 * @param {AlgoRunner} runner - AlgoRunner instance
 */
function checkAutoStop(runner) {
  if (!runner.config || !runner.running) return;
  const { dailyTarget, maxRisk } = runner.config;
  const pnl = runner.stats.totalPnl;
  if (dailyTarget && pnl >= dailyTarget) {
    runner._log('fill_win', `TARGET REACHED! +$${pnl.toFixed(2)}`);
    runner.stop('target');
  } else if (maxRisk && pnl <= -maxRisk) {
    runner._log('fill_loss', `MAX RISK! -$${Math.abs(pnl).toFixed(2)}`);
    runner.stop('risk');
  }
}

module.exports = { emergencyFlatten, startPnlPolling, checkAutoStop };
