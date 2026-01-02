/**
 * Tradovate Market Hours
 * CME Futures trading hours
 */

/**
 * Check if currently in DST
 */
const isDST = (date) => {
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  return date.getTimezoneOffset() < stdOffset;
};

/**
 * Check market hours (CME Futures)
 */
const checkMarketHours = () => {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();

  const ctOffset = isDST(now) ? 5 : 6;
  const ctHour = (utcHour - ctOffset + 24) % 24;
  const ctDay = utcHour < ctOffset ? (utcDay + 6) % 7 : utcDay;

  if (ctDay === 6) {
    return { isOpen: false, message: 'Market closed (Saturday)' };
  }

  if (ctDay === 0 && ctHour < 17) {
    return { isOpen: false, message: 'Market opens Sunday 5:00 PM CT' };
  }

  if (ctDay === 5 && ctHour >= 16) {
    return { isOpen: false, message: 'Market closed (Friday after 4PM CT)' };
  }

  if (ctHour === 16 && ctDay >= 1 && ctDay <= 4) {
    return { isOpen: false, message: 'Daily maintenance (4:00-5:00 PM CT)' };
  }

  return { isOpen: true, message: 'Market is open' };
};

module.exports = { checkMarketHours, isDST };
