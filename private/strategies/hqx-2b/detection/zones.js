/**
 * =============================================================================
 * HQX-2B - Liquidity Zone Detection
 * =============================================================================
 * Clusters swing points into tradeable liquidity zones
 * 
 * DO NOT MODIFY - validated by backtest
 */

const { v4: uuidv4 } = require('uuid');
const { ZoneType } = require('../config');

/**
 * Liquidity Zone class
 */
class LiquidityZone {
  constructor(type, priceHigh, priceLow, createdAt, barIndex) {
    this.id = uuidv4();
    this.type = type; // 'resistance' or 'support'
    this.priceHigh = priceHigh;
    this.priceLow = priceLow;
    this.createdAt = createdAt;
    this.barIndex = barIndex;
    this.touches = 1;
    this.swept = false;
    this.sweptAt = null;
    this.lastUsedBarIndex = -999;
    this.qualityScore = 0.5;
  }

  containsPrice(price, toleranceTicks, tickSize) {
    const tolerance = toleranceTicks * tickSize;
    return price >= (this.priceLow - tolerance) && price <= (this.priceHigh + tolerance);
  }

  getLevel() {
    return (this.priceHigh + this.priceLow) / 2;
  }
}

/**
 * Update liquidity zones from swing points
 * @param {Object[]} swings - Swing points
 * @param {Object[]} existingZones - Existing zones
 * @param {number} currentIndex - Current bar index
 * @param {Object} config - Zone config
 * @param {number} tickSize - Tick size
 * @returns {Object[]} Updated zones array
 */
function updateZones(swings, existingZones, currentIndex, config, tickSize) {
  const { clusterToleranceTicks, maxZoneAgeBars } = config;
  const zones = [...existingZones];
  const tolerance = clusterToleranceTicks * tickSize;

  // Remove old zones
  for (let i = zones.length - 1; i >= 0; i--) {
    if (currentIndex - zones[i].barIndex > maxZoneAgeBars) {
      zones.splice(i, 1);
    }
  }

  // Cluster swings into zones
  for (const swing of swings) {
    // Check if swing already belongs to a zone
    let foundZone = null;
    for (const zone of zones) {
      if (zone.containsPrice(swing.price, clusterToleranceTicks, tickSize)) {
        foundZone = zone;
        break;
      }
    }

    if (foundZone) {
      // Update existing zone
      foundZone.touches++;
      if (swing.price > foundZone.priceHigh) foundZone.priceHigh = swing.price;
      if (swing.price < foundZone.priceLow) foundZone.priceLow = swing.price;
      foundZone.qualityScore = Math.min(1.0, 0.3 + foundZone.touches * 0.15);
    } else {
      // Create new zone
      const zoneType = swing.type === 'high' ? ZoneType.RESISTANCE : ZoneType.SUPPORT;
      const newZone = new LiquidityZone(
        zoneType,
        swing.price + tolerance / 2,
        swing.price - tolerance / 2,
        swing.timestamp,
        swing.barIndex
      );
      newZone.qualityScore = 0.3 + swing.strength * 0.1;
      zones.push(newZone);
    }
  }

  return zones;
}

module.exports = { LiquidityZone, updateZones };
