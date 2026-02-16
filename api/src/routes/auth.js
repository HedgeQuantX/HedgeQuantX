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
const { requireAuth, signToken, verifyToken } = require('../middleware/auth');
const { encryptCredentials, decryptCredentials } = require('../services/crypto');

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

    // Encrypt credentials for session persistence across refreshes/restarts
    const encCreds = encryptCredentials({
      propfirm: propfirm.trim(),
      username: username.trim(),
      password,
    });

    res.json({
      success: true,
      token,
      user: result.user || { userName: username.trim() },
      accounts: result.accounts || [],
      encryptedCredentials: encCreds,
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message, err.stack?.split('\n').slice(0, 3).join(' '));
    res.status(500).json({ success: false, error: 'Connection to trading server failed. Try again.' });
  }
});

/**
 * POST /api/auth/reconnect
 * Body: { encryptedCredentials }
 * Header: Authorization: Bearer <token>
 *
 * Re-establishes Rithmic connection when the backend session was lost
 * (server restart, TTL expiry) but the JWT and encrypted credentials
 * are still valid on the client side.
 */
router.post('/reconnect', loginLimiter, async (req, res) => {
  const { encryptedCredentials } = req.body;

  // Validate input
  if (typeof encryptedCredentials !== 'string' || encryptedCredentials.length > 2048) {
    return res.status(400).json({ success: false, error: 'Invalid request' });
  }

  // Verify the JWT (don't use requireAuth — session doesn't exist yet)
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing authorization' });
  }

  const payload = verifyToken(header.slice(7));
  if (!payload) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  // Check if session already exists (maybe another tab reconnected)
  const existingSession = sessionManager.get(payload.sessionId);
  if (existingSession) {
    existingSession.lastActivity = Date.now();
    return res.json({
      success: true,
      user: { userName: existingSession.username },
      accounts: existingSession.accounts,
    });
  }

  // Decrypt credentials
  const credentials = decryptCredentials(encryptedCredentials);
  if (!credentials) {
    return res.status(401).json({ success: false, error: 'Invalid credentials blob' });
  }

  // Verify credentials match the JWT claims (prevent token swap attacks)
  if (credentials.propfirm !== payload.propfirm || credentials.username !== payload.username) {
    return res.status(401).json({ success: false, error: 'Credentials mismatch' });
  }

  try {
    console.log(`[Auth] Reconnecting ${credentials.propfirm}/${credentials.username}...`);
    const service = new RithmicService(credentials.propfirm);
    const result = await service.login(credentials.username, credentials.password);

    if (!result.success) {
      console.error('[Auth] Reconnect login rejected:', result.error || 'unknown');
      try { await service.disconnect(); } catch (_) {}
      return res.status(401).json({
        success: false,
        error: 'Reconnection failed. Please login again.',
      });
    }

    // Create session with the SAME sessionId from the JWT
    // so the existing token remains valid
    const now = Date.now();
    sessionManager.sessions.set(payload.sessionId, {
      service,
      propfirm: credentials.propfirm,
      username: credentials.username,
      accounts: result.accounts || [],
      createdAt: now,
      lastActivity: now,
      algoRunner: null,
    });

    console.log(`[Auth] Reconnected ${payload.sessionId.slice(0, 8)} (${credentials.propfirm}/${credentials.username}) | active: ${sessionManager.sessions.size}`);

    res.json({
      success: true,
      user: result.user || { userName: credentials.username },
      accounts: result.accounts || [],
    });
  } catch (err) {
    console.error('[Auth] Reconnect error:', err.message);
    res.status(500).json({ success: false, error: 'Reconnection to trading server failed. Please login again.' });
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
