/**
 * Strategy Registry - Available Trading Strategies
 * 
 * All strategies are compiled to bytecode (.jsc) for protection.
 * This module provides a unified interface to load strategies.
 */

const path = require('path');

// =============================================================================
// AVAILABLE STRATEGIES
// =============================================================================

const STRATEGIES = {
  'ultra-scalping': {
    id: 'ultra-scalping',
    name: 'HQX Scalping',
    description: '6 Mathematical Models (Z-Score, VPIN, Kyle, Kalman, Vol, OFI)',
    version: '2.0',
    backtest: {
      pnl: '$2,012,373',
      winRate: '71.1%',
      trades: '146,685',
      period: 'Jan 2020 - Nov 2025'
    },
    params: {
      stopTicks: 8,
      targetTicks: 16,
      riskReward: '1:2'
    },
    loader: () => require('./ultra-scalping')
  },
  
  'hqx-2b': {
    id: 'hqx-2b',
    name: 'HQX-2B Liquidity Sweep',
    description: '2B Pattern with Liquidity Zone Sweeps (Optimized)',
    version: '1.0',
    backtest: {
      pnl: '$6,601,305',
      winRate: '82.8%',
      trades: '100,220',
      period: 'Dec 2020 - Nov 2025'
    },
    params: {
      stopTicks: 10,
      targetTicks: 40,
      riskReward: '1:4'
    },
    loader: () => require('./hqx-2b')
  }
};

// =============================================================================
// EXPORTS
// =============================================================================

/**
 * Get list of available strategies
 * @returns {Array} List of strategy info objects
 */
function getAvailableStrategies() {
  return Object.values(STRATEGIES).map(s => ({
    id: s.id,
    name: s.name,
    description: s.description,
    version: s.version,
    backtest: s.backtest,
    params: s.params
  }));
}

/**
 * Get strategy by ID
 * @param {string} strategyId - Strategy identifier
 * @returns {Object|null} Strategy info or null if not found
 */
function getStrategy(strategyId) {
  return STRATEGIES[strategyId] || null;
}

/**
 * Load strategy module by ID
 * Returns normalized module with M1 as the strategy class
 * @param {string} strategyId - Strategy identifier
 * @returns {Object} Strategy module with M1 class
 */
function loadStrategy(strategyId) {
  const strategy = STRATEGIES[strategyId];
  if (!strategy) {
    throw new Error(`Strategy not found: ${strategyId}`);
  }
  
  let module;
  try {
    module = strategy.loader();
  } catch (e) {
    // If compiled bytecode not found, try to load from private sources (dev mode)
    if (e.code === 'MODULE_NOT_FOUND') {
      try {
        const devPath = path.join(__dirname, '../../../private/strategies', 
          strategyId === 'ultra-scalping' ? 'ultra-scalping.js' : 'hqx-2b-liquidity-sweep.js'
        );
        module = require(devPath);
      } catch (devErr) {
        throw new Error(`Failed to load strategy ${strategyId}: ${e.message}`);
      }
    } else {
      throw e;
    }
  }
  
  // Normalize: always return { M1: StrategyClass }
  // Ultra Scalping exports M1, HQX-2B exports M2
  if (module.M1) {
    return module;
  } else if (module.M2) {
    return { M1: module.M2, ...module };
  } else {
    throw new Error(`Strategy ${strategyId} has no valid strategy class (M1 or M2)`);
  }
}

/**
 * Get default strategy ID
 * @returns {string} Default strategy ID
 */
function getDefaultStrategy() {
  return 'ultra-scalping';
}

module.exports = {
  STRATEGIES,
  getAvailableStrategies,
  getStrategy,
  loadStrategy,
  getDefaultStrategy
};
