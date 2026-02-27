/**
 * CORS Configuration
 * Whitelisted origins for HQX Web API
 */

'use strict';

const cors = require('cors');

const ALLOWED_ORIGINS = [
  'https://hqx.hedgequantx.com',
  'https://hedgequantx.com',
  'https://www.hedgequantx.com',
  'http://localhost:5173',
  'http://localhost:3000',
];

const corsMiddleware = cors({
  origin: (origin, callback) => {
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
