/**
 * CORS Configuration
 */

'use strict';

const cors = require('cors');

const ALLOWED_ORIGINS = [
  'https://hedgequantx.com',
  'https://www.hedgequantx.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (curl, server-to-server, etc.)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

module.exports = { corsMiddleware, ALLOWED_ORIGINS };
