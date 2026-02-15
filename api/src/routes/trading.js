/**
 * Trading Routes
 *
 * POST   /api/trading/order      - Place an order
 * DELETE /api/trading/orders      - Cancel all orders for an account
 * GET    /api/trading/positions   - Get open positions
 * GET    /api/trading/orders      - Get active orders
 * POST   /api/trading/close       - Close a position
 */

'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');

const router = Router();

/**
 * POST /api/trading/order
 * Body: { accountId, symbol, exchange, side, type, size, price }
 *   side: 0=Buy, 1=Sell
 *   type: 1=Limit, 2=Market, 3=StopLimit, 4=StopMarket
 */
router.post('/order', requireAuth, async (req, res) => {
  const { accountId, symbol, exchange, side, type, size, price } = req.body;

  // Strict input validation for trading — invalid orders = real financial risk
  if (!accountId || !symbol || side === undefined || !type || !size) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: accountId, symbol, side, type, size',
    });
  }
  if (typeof size !== 'number' || size < 1 || size > 100 || !Number.isInteger(size)) {
    return res.status(400).json({ success: false, error: 'Invalid size (1-100 integer)' });
  }
  if (![0, 1].includes(side)) {
    return res.status(400).json({ success: false, error: 'Invalid side (0=Buy, 1=Sell)' });
  }
  if (![1, 2, 3, 4].includes(type)) {
    return res.status(400).json({ success: false, error: 'Invalid order type (1-4)' });
  }
  if (price !== undefined && price !== null && (typeof price !== 'number' || price < 0)) {
    return res.status(400).json({ success: false, error: 'Invalid price' });
  }
  if (typeof symbol !== 'string' || symbol.length > 20) {
    return res.status(400).json({ success: false, error: 'Invalid symbol' });
  }

  try {
    const result = await req.service.placeOrder({
      accountId,
      symbol,
      exchange: exchange || 'CME',
      side,
      type,
      size,
      price: price || 0,
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error || 'Order rejected' });
    }

    res.json({
      success: true,
      orderId: result.orderId,
      status: result.status,
      fillPrice: result.fillPrice,
      filledQty: result.filledQty,
      orderTag: result.orderTag,
    });
  } catch (err) {
    console.error('[Trading] Order error:', err.message);
    res.status(500).json({ success: false, error: 'Order execution failed' });
  }
});

/**
 * DELETE /api/trading/orders
 * Query: ?accountId=xxx
 * Cancels all working orders for the specified account
 */
router.delete('/orders', requireAuth, async (req, res) => {
  const accountId = req.query.accountId || req.body.accountId;

  if (!accountId) {
    return res.status(400).json({ success: false, error: 'Missing accountId' });
  }

  try {
    const result = await req.service.cancelAllOrders(accountId);
    res.json(result);
  } catch (err) {
    console.error('[Trading] Cancel error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to cancel orders' });
  }
});

/**
 * GET /api/trading/positions
 * Returns open positions from PNL_PLANT
 */
router.get('/positions', requireAuth, async (req, res) => {
  try {
    const result = await req.service.getPositions();
    res.json(result);
  } catch (err) {
    console.error('[Trading] Positions error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch positions' });
  }
});

/**
 * GET /api/trading/orders
 * Returns active/working orders
 */
router.get('/orders', requireAuth, async (req, res) => {
  try {
    const result = await req.service.getOrders();
    res.json(result);
  } catch (err) {
    console.error('[Trading] Get orders error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch orders' });
  }
});

/**
 * POST /api/trading/close
 * Body: { accountId, symbol }
 * Flattens an open position with a market order
 */
router.post('/close', requireAuth, async (req, res) => {
  const { accountId, symbol } = req.body;

  if (!accountId || !symbol) {
    return res.status(400).json({ success: false, error: 'Missing accountId or symbol' });
  }

  try {
    const result = await req.service.closePosition(accountId, symbol);
    res.json(result);
  } catch (err) {
    console.error('[Trading] Close position error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to close position' });
  }
});

module.exports = router;
