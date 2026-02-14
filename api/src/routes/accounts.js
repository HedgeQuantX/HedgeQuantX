/**
 * Accounts Routes
 *
 * GET /api/accounts           - List trading accounts with P&L
 * GET /api/accounts/:id/pnl   - Get P&L for a specific account
 */

'use strict';

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');

const router = Router();

/**
 * GET /api/accounts
 * Returns all trading accounts with balance and P&L from Rithmic API
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await req.service.getTradingAccounts();

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Failed to fetch accounts' });
    }

    // Update cached accounts in session
    req.session.accounts = result.accounts;

    res.json({ success: true, accounts: result.accounts });
  } catch (err) {
    console.error('[Accounts] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/accounts/:id/pnl
 * Returns P&L data for a specific account (from PNL_PLANT cache - no API call)
 */
router.get('/:id/pnl', requireAuth, (req, res) => {
  try {
    const accountId = req.params.id;

    // Try matching by rithmicAccountId directly
    const pnl = req.service.getAccountPnL(accountId);

    // If not found by direct ID, try looking up from accounts list
    if (pnl.pnl === null) {
      const account = req.session.accounts?.find(
        (a) => a.accountId === parseInt(accountId, 10) || a.rithmicAccountId === accountId,
      );
      if (account?.rithmicAccountId) {
        const resolved = req.service.getAccountPnL(account.rithmicAccountId);
        return res.json({ success: true, accountId, ...resolved });
      }
    }

    res.json({ success: true, accountId, ...pnl });
  } catch (err) {
    console.error('[Accounts] PnL error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
