/**
 * JWT Authentication Middleware
 *
 * Verifies Bearer token and attaches session to req.
 */

'use strict';

const jwt = require('jsonwebtoken');
const { sessionManager } = require('../services/session-manager');

const JWT_SECRET = process.env.HQX_JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: HQX_JWT_SECRET environment variable is required. Set it in your .env file.');
}

/**
 * Express middleware - verifies JWT and attaches session to req
 */
const requireAuth = (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const session = sessionManager.get(payload.sessionId);

    if (!session) {
      return res.status(401).json({ success: false, error: 'Session expired or invalid' });
    }

    // Touch session to extend TTL
    session.lastActivity = Date.now();

    req.sessionId = payload.sessionId;
    req.session = session;
    req.service = session.service;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired' });
    }
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

/**
 * Sign a JWT for a session
 */
const signToken = (sessionId, propfirm, username) => {
  return jwt.sign(
    { sessionId, propfirm, username },
    JWT_SECRET,
    { expiresIn: '8h' },
  );
};

/**
 * Verify a token and return payload (used by WebSocket handler)
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_) {
    return null;
  }
};

module.exports = { requireAuth, signToken, verifyToken, JWT_SECRET };
