'use strict';
// Load obfuscated (prod) or private sources (dev)
try {
  module.exports = require('../../../dist/lib/m/ultra-scalping.js');
} catch (e) {
  module.exports = require('../../../private/strategies/ultra-scalping');
}
