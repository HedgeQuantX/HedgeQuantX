/**
 * Auth Routes
 *
 * POST /api/auth/login   - Login to Rithmic via propfirm
 * POST /api/auth/logout  - Logout and destroy session
 * GET  /api/auth/session  - Get current session info
 */

'use strict';

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { RithmicService } = require('../../../src/services/rithmic');
const { sessionManager } = require('../services/session-manager');
const { requireAuth, signToken } = require('../middleware/auth');

const router = Router();

// Strict rate limit on login: 5 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Try again later.' },
});

/**
 * POST /api/auth/login
 * Body: { propfirm, username, password }
 */
router.post('/login', loginLimiter, async (req, res) => {
  const { propfirm, username, password } = req.body;

  // Type validation
  if (typeof propfirm !== 'string' || typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid field types' });
  }

  // Length validation
  if (propfirm.length > 64 || username.length > 128 || password.length > 256) {
    return res.status(400).json({ success: false, error: 'Field exceeds maximum length' });
  }

  if (!propfirm.trim() || !username.trim() || !password.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: propfirm, username, password',
    });
  }

  try {
    const service = new RithmicService(propfirm.trim());
    const result = await service.login(username.trim(), password);

    if (!result.success) {
      console.error('[Auth] Rithmic login rejected:', result.error || 'unknown reason');
      try { await service.disconnect(); } catch (_) {}
      return res.status(401).json({
        success: false,
        error: result.error || 'Login failed. Check your credentials.',
      });
    }

    const sessionId = sessionManager.create(service, {
      propfirm: propfirm.trim(),
      username: username.trim(),
      accounts: result.accounts || [],
    });

    const session = sessionManager.get(sessionId);
    if (session) {
      session.accounts = result.accounts || [];
    }

    const token = signToken(sessionId, propfirm.trim(), username.trim());

    res.json({
      success: true,
      token,
      user: result.user || { userName: username.trim() },
      accounts: result.accounts || [],
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message, err.stack?.split('\n').slice(0, 3).join(' '));
    res.status(500).json({ success: false, error: 'Connection to trading server failed. Try again.' });
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
    res.status(500).json({ success: false, error: 'Internal server error' });
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
