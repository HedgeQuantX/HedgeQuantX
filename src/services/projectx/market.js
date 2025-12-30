/**
 * ProjectX Market Hours & Holidays
 * CME Futures trading hours and US market holidays
 */

/**
 * Get nth weekday of a month
 */
const getNthWeekday = (year, month, weekday, n) => {
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(year, month, day);
    if (d.getMonth() !== month) break;
    if (d.getDay() === weekday) {
      count++;
      if (count === n) return d.toISOString().split('T')[0];
    }
  }
  return null;
};

/**
 * Get last weekday of a month
 */
const getLastWeekday = (year, month, weekday) => {
  const lastDay = new Date(year, month + 1, 0);
  for (let day = lastDay.getDate(); day >= 1; day--) {
    const d = new Date(year, month, day);
    if (d.getDay() === weekday) return d.toISOString().split('T')[0];
  }
  return null;
};

/**
 * Get Good Friday (Friday before Easter)
 */
const getGoodFriday = (year) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  
  const easter = new Date(year, month, day);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  return goodFriday.toISOString().split('T')[0];
};

/**
 * Get day after a date
 */
const getDayAfter = (dateStr) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

/**
 * Get US market holidays for the current year
 */
const getMarketHolidays = () => {
  const year = new Date().getFullYear();
  
  return [
    { date: `${year}-01-01`, name: "New Year's Day", earlyClose: false },
    { date: getNthWeekday(year, 0, 1, 3), name: 'MLK Day', earlyClose: false },
    { date: getNthWeekday(year, 1, 1, 3), name: "Presidents' Day", earlyClose: false },
    { date: getGoodFriday(year), name: 'Good Friday', earlyClose: false },
    { date: getLastWeekday(year, 4, 1), name: 'Memorial Day', earlyClose: false },
    { date: `${year}-06-19`, name: 'Juneteenth', earlyClose: false },
    { date: `${year}-07-04`, name: 'Independence Day', earlyClose: false },
    { date: `${year}-07-03`, name: 'Independence Day Eve', earlyClose: true },
    { date: getNthWeekday(year, 8, 1, 1), name: 'Labor Day', earlyClose: false },
    { date: getNthWeekday(year, 10, 4, 4), name: 'Thanksgiving', earlyClose: false },
    { date: getDayAfter(getNthWeekday(year, 10, 4, 4)), name: 'Black Friday', earlyClose: true },
    { date: `${year}-12-25`, name: 'Christmas Day', earlyClose: false },
    { date: `${year}-12-24`, name: 'Christmas Eve', earlyClose: true },
    { date: `${year}-12-31`, name: "New Year's Eve", earlyClose: true },
  ];
};

/**
 * Check if today is a market holiday
 */
const checkHoliday = () => {
  const today = new Date().toISOString().split('T')[0];
  const holidays = getMarketHolidays();
  const holiday = holidays.find(h => h.date === today);
  
  if (holiday) {
    return { isHoliday: !holiday.earlyClose, holiday };
  }
  return { isHoliday: false };
};

/**
 * Check if futures market is open based on CME hours and holidays
 */
const checkMarketHours = () => {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  
  const holidayCheck = checkHoliday();
  if (holidayCheck.isHoliday) {
    return { isOpen: false, message: `Market closed - ${holidayCheck.holiday.name}` };
  }
  if (holidayCheck.holiday && holidayCheck.holiday.earlyClose && utcHour >= 18) {
    return { isOpen: false, message: `Market closed early - ${holidayCheck.holiday.name}` };
  }
  
  if (utcDay === 6) {
    return { isOpen: false, message: 'Market closed - Weekend (Saturday)' };
  }
  
  if (utcDay === 0 && utcHour < 23) {
    return { isOpen: false, message: 'Market closed - Opens Sunday 6:00 PM ET' };
  }
  
  if (utcDay === 5 && utcHour >= 22) {
    return { isOpen: false, message: 'Market closed - Weekend' };
  }
  
  if (utcHour === 22 && utcDay !== 5) {
    return { isOpen: false, message: 'Market closed - Daily maintenance (5:00-6:00 PM ET)' };
  }
  
  return { isOpen: true, message: 'Market is open' };
};

module.exports = {
  getMarketHolidays,
  checkHoliday,
  checkMarketHours
};
