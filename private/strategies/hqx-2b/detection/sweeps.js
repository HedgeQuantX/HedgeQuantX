/**
 * =============================================================================
 * HQX-2B - Sweep Detection
 * =============================================================================
 * Detects liquidity sweeps (price penetrates zone then reclaims)
 * 
 * DO NOT MODIFY - validated by backtest
 */

const { SweepType, ZoneType } = require('../config');

/**
 * Sweep Event class
 */
class SweepEvent {
  constructor(sweepType, zone, entryBarIndex, extremeBarIndex, extremePrice) {
    this.sweepType = sweepType;
    this.zone = zone;
    this.entryBarIndex = entryBarIndex;
    this.extremeBarIndex = extremeBarIndex;
    this.extremePrice = extremePrice;
    this.exitBarIndex = null;
    this.isValid = false;
    this.qualityScore = 0;
    this.penetrationTicks = 0;
    this.durationBars = 0;
    this.volumeRatio = 1.0;
  }
}

/**
 * Get volume ratio relative to median
 * @param {Object[]} bars - Bar history
 * @param {number} index - Current index
 * @param {number} lookback - Lookback period
 * @returns {number} Volume ratio
 */
function getVolumeRatio(bars, index, lookback) {
  const start = Math.max(0, index - lookback);
  const recentBars = bars.slice(start, index);
  if (recentBars.length === 0) return 1.0;

  const volumes = recentBars.map(b => b.volume).sort((a, b) => a - b);
  const medianIdx = Math.floor(volumes.length / 2);
  const medianVolume = volumes[medianIdx] || 1;

  return bars[index].volume / medianVolume;
}

/**
 * Score a sweep based on quality factors
 * @param {Object} sweep - Sweep event
 * @param {number} bodyRatio - Candle body ratio
 * @returns {number} Quality score (0-1)
 */
function scoreSweep(sweep, bodyRatio) {
  let score = 0;

  // Penetration score (optimal around 4 ticks)
  const optimalPen = 4;
  const penDiff = Math.abs(sweep.penetrationTicks - optimalPen);
  score += Math.max(0, 0.3 - penDiff * 0.03);

  // Duration score (faster is better, max 5 bars)
  score += Math.max(0, 0.25 - sweep.durationBars * 0.05);

  // Volume score
  score += Math.min(0.25, sweep.volumeRatio * 0.1);

  // Body ratio score
  score += Math.min(0.2, bodyRatio * 0.4);

  return Math.min(1.0, score);
}

/**
 * Detect sweep of liquidity zones
 * @param {Object[]} zones - Liquidity zones
 * @param {Object[]} bars - Bar history
 * @param {number} currentIndex - Current bar index
 * @param {Object} sweepConfig - Sweep config
 * @param {Object} zoneConfig - Zone config
 * @param {number} tickSize - Tick size
 * @returns {Object|null} Sweep event or null
 */
function detectSweep(zones, bars, currentIndex, sweepConfig, zoneConfig, tickSize) {
  const currentBar = bars[currentIndex];
  const currentPrice = currentBar.close;
  const cfg = sweepConfig;

  for (const zone of zones) {
    // Check cooldown (zone can be reused after cooldownBars)
    if (zone.lastUsedBarIndex >= 0 && 
        (currentIndex - zone.lastUsedBarIndex) < zoneConfig.cooldownBars) {
      continue;
    }

    // Check zone distance
    const zoneLevel = zone.getLevel();
    const distanceTicks = Math.abs(currentPrice - zoneLevel) / tickSize;
    if (distanceTicks > zoneConfig.maxZoneDistanceTicks) continue;

    // Look for sweep in recent bars
    const lookbackStart = Math.max(0, currentIndex - cfg.maxDurationBars * 2);

    for (let i = lookbackStart; i < currentIndex; i++) {
      const bar = bars[i];

      // Check for HIGH SWEEP (price went above resistance then came back)
      if (zone.type === ZoneType.RESISTANCE) {
        const penetration = (bar.high - zone.priceHigh) / tickSize;

        if (penetration >= cfg.minPenetrationTicks && penetration <= cfg.maxPenetrationTicks) {
          // Found penetration, check if price reclaimed below zone
          if (currentPrice < zone.priceHigh) {
            // Check rejection candle quality
            const barRange = bar.high - bar.low;
            const bodySize = Math.abs(bar.close - bar.open);
            const bodyRatio = barRange > 0 ? bodySize / barRange : 0;

            if (bodyRatio >= cfg.minBodyRatio) {
              // Calculate volume ratio
              const volumeRatio = getVolumeRatio(bars, i, 20);

              if (volumeRatio >= cfg.minVolumeRatio) {
                const sweep = new SweepEvent(
                  SweepType.HIGH_SWEEP,
                  zone,
                  i,
                  i,
                  bar.high
                );
                sweep.exitBarIndex = currentIndex;
                sweep.penetrationTicks = penetration;
                sweep.durationBars = currentIndex - i;
                sweep.volumeRatio = volumeRatio;
                sweep.qualityScore = scoreSweep(sweep, bodyRatio);
                sweep.isValid = sweep.qualityScore >= cfg.minQualityScore;

                if (sweep.isValid) {
                  return sweep;
                }
              }
            }
          }
        }
      }

      // Check for LOW SWEEP (price went below support then came back)
      if (zone.type === ZoneType.SUPPORT) {
        const penetration = (zone.priceLow - bar.low) / tickSize;

        if (penetration >= cfg.minPenetrationTicks && penetration <= cfg.maxPenetrationTicks) {
          // Found penetration, check if price reclaimed above zone
          if (currentPrice > zone.priceLow) {
            // Check rejection candle quality
            const barRange = bar.high - bar.low;
            const bodySize = Math.abs(bar.close - bar.open);
            const bodyRatio = barRange > 0 ? bodySize / barRange : 0;

            if (bodyRatio >= cfg.minBodyRatio) {
              // Calculate volume ratio
              const volumeRatio = getVolumeRatio(bars, i, 20);

              if (volumeRatio >= cfg.minVolumeRatio) {
                const sweep = new SweepEvent(
                  SweepType.LOW_SWEEP,
                  zone,
                  i,
                  i,
                  bar.low
                );
                sweep.exitBarIndex = currentIndex;
                sweep.penetrationTicks = penetration;
                sweep.durationBars = currentIndex - i;
                sweep.volumeRatio = volumeRatio;
                sweep.qualityScore = scoreSweep(sweep, bodyRatio);
                sweep.isValid = sweep.qualityScore >= cfg.minQualityScore;

                if (sweep.isValid) {
                  return sweep;
                }
              }
            }
          }
        }
      }
    }
  }

  return null;
}

module.exports = { SweepEvent, detectSweep, getVolumeRatio, scoreSweep };
