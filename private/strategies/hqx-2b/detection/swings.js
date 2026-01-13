/**
 * =============================================================================
 * HQX-2B - Swing Point Detection
 * =============================================================================
 * Detects swing highs and lows for liquidity zone identification
 * 
 * DO NOT MODIFY - validated by backtest
 */

/**
 * Swing Point class
 */
class SwingPoint {
  constructor(type, price, barIndex, timestamp, strength = 1) {
    this.type = type; // 'high' or 'low'
    this.price = price;
    this.barIndex = barIndex;
    this.timestamp = timestamp;
    this.strength = strength;
  }
}

/**
 * Detect swing points in bar history
 * @param {Object[]} bars - Bar history
 * @param {number} currentIndex - Current bar index
 * @param {Object[]} existingSwings - Existing swing points
 * @param {Object} config - Swing config { lookbackBars, minStrength }
 * @param {number} maxAge - Max age in bars
 * @returns {Object[]} Updated swing points array
 */
function detectSwings(bars, currentIndex, existingSwings, config, maxAge) {
  const { lookbackBars, minStrength } = config;
  const swings = [...existingSwings];

  if (currentIndex < lookbackBars * 2) return swings;

  const pivotIndex = currentIndex - lookbackBars;
  const pivotBar = bars[pivotIndex];

  // Check for swing high
  let isSwingHigh = true;
  let highStrength = 0;
  for (let i = pivotIndex - lookbackBars; i <= pivotIndex + lookbackBars; i++) {
    if (i === pivotIndex || i < 0 || i >= bars.length) continue;
    if (bars[i].high >= pivotBar.high) {
      isSwingHigh = false;
      break;
    }
    highStrength++;
  }

  if (isSwingHigh && highStrength >= minStrength) {
    const existing = swings.find(s => s.barIndex === pivotIndex && s.type === 'high');
    if (!existing) {
      swings.push(new SwingPoint('high', pivotBar.high, pivotIndex, pivotBar.timestamp, highStrength));
    }
  }

  // Check for swing low
  let isSwingLow = true;
  let lowStrength = 0;
  for (let i = pivotIndex - lookbackBars; i <= pivotIndex + lookbackBars; i++) {
    if (i === pivotIndex || i < 0 || i >= bars.length) continue;
    if (bars[i].low <= pivotBar.low) {
      isSwingLow = false;
      break;
    }
    lowStrength++;
  }

  if (isSwingLow && lowStrength >= minStrength) {
    const existing = swings.find(s => s.barIndex === pivotIndex && s.type === 'low');
    if (!existing) {
      swings.push(new SwingPoint('low', pivotBar.low, pivotIndex, pivotBar.timestamp, lowStrength));
    }
  }

  // Keep only recent swings
  while (swings.length > 0 && swings[0].barIndex < currentIndex - maxAge) {
    swings.shift();
  }

  return swings;
}

module.exports = { SwingPoint, detectSwings };
