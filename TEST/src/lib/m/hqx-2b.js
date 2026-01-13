'use strict';
// Load obfuscated (prod) or private sources (dev)
try {
  module.exports = require('../../../dist/lib/m/hqx-2b.js');
} catch (e) {
  module.exports = require('../../../private/strategies/hqx-2b-liquidity-sweep');
}
