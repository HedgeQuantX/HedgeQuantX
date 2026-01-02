/**
 * Stats Cache - Shared stats storage to avoid circular dependencies
 */

let cachedStats = null;

const setCachedStats = (stats) => {
  cachedStats = stats;
};

const getCachedStats = () => {
  return cachedStats;
};

const clearCachedStats = () => {
  cachedStats = null;
};

module.exports = {
  setCachedStats,
  getCachedStats,
  clearCachedStats
};
