/**
 * Contracts Routes
 *
 * GET /api/contracts          - Get cached/fetched contracts list
 * GET /api/contracts/search   - Search contracts by query string
 */

'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');

const router = Router();

/**
 * GET /api/contracts
 * Returns available futures contracts from Rithmic API (cached)
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await req.service.getContracts();

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }

    res.json({
      success: true,
      contracts: result.contracts,
      source: result.source,
    });
  } catch (err) {
    console.error('[Contracts] Error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch contracts' });
  }
});

/**
 * GET /api/contracts/search?q=NQ
 * Searches contracts by symbol or name
 */
router.get('/search', requireAuth, async (req, res) => {
  const query = String(req.query.q || '').trim();

  if (!query || query.length < 1) {
    return res.status(400).json({ success: false, error: 'Search query required (?q=...)' });
  }
  if (query.length > 20) {
    return res.status(400).json({ success: false, error: 'Search query too long (max 20 chars)' });
  }

  try {
    const contracts = await req.service.searchContracts(query);
    res.json({ success: true, contracts: contracts || [] });
  } catch (err) {
    console.error('[Contracts] Search error:', err.message);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

module.exports = router;
