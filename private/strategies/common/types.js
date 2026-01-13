/**
 * =============================================================================
 * COMMON TYPES - Shared constants across all HQX strategies
 * =============================================================================
 * 
 * These constants are used by both Ultra Scalping and HQX-2B strategies.
 * DO NOT MODIFY - these values are validated by backtests.
 */

const OrderSide = { BID: 0, ASK: 1 };
const SignalStrength = { WEAK: 1, MODERATE: 2, STRONG: 3, VERY_STRONG: 4 };

module.exports = { OrderSide, SignalStrength };
