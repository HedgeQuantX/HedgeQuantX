/**
 * Auth Routes
 *
 * POST /api/auth/login   - Login to Rithmic via propfirm
 * POST /api/auth/logout  - Logout and destroy session
 * GET  /api/auth/session  - Get current session info
 */

'use strict';

const { Router } = require('express');
const { RithmicService } = require('../../../src/services/rithmic');
const { sessionManager } = require('../services/session-manager');
const { requireAuth, signToken } = require('../middleware/auth');

const router = Router();

/**
 * POST /api/auth/login
 * Body: { propfirm, username, password }
 */
router.post('/login', async (req, res) => {
  const { propfirm, username, password } = req.body;

  if (!propfirm || !username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: propfirm, username, password',
    });
  }

  try {
    // Create a new RithmicService instance for this user
    const service = new RithmicService(propfirm);

    const result = await service.login(username, password);

    if (!result.success) {
      // Cleanup on failure
      try { await service.disconnect(); } catch (_) {}
      return res.status(401).json({
        success: false,
        error: result.error || 'Login failed',
      });
    }

    // Store session
    const sessionId = sessionManager.create(service, {
      propfirm,
      username,
      accounts: result.accounts || [],
    });

    // Update session accounts reference
    const session = sessionManager.get(sessionId);
    if (session) {
      session.accounts = result.accounts || [];
    }

    // Sign JWT
    const token = signToken(sessionId, propfirm, username);

    res.json({
      success: true,
      token,
      user: result.user || { userName: username },
      accounts: result.accounts || [],
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ success: false, error: 'Login failed: ' + err.message });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await sessionManager.destroy(req.sessionId);
    res.json({ success: true });
  } catch (err) {
    console.error('[Auth] Logout error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/session
 * Returns current session info (no sensitive data)
 */
router.get('/session', requireAuth, (req, res) => {
  const session = req.session;
  res.json({
    success: true,
    session: {
      propfirm: session.propfirm,
      username: session.username,
      accounts: session.accounts,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      algoRunning: session.algoRunner?.running || false,
    },
  });
});

module.exports = router;
