/**
 * Symbol Data for AI Supervision
 * 
 * Contains detailed information about tradeable symbols
 * including tick sizes, sessions, correlations, and characteristics.
 */

const SYMBOLS = {
  NQ: {
    id: 'NQ',
    name: 'E-mini Nasdaq 100',
    exchange: 'CME',
    tickSize: 0.25,
    tickValue: 5.00,
    pointValue: 20.00,
    margin: 15000,
    characteristics: {
      volatility: 'high',
      sector: 'technology',
      behavior: 'momentum-driven, gap-prone',
      avgRange: '150-300 points'
    },
    correlations: {
      positive: ['ES', 'YM'],
      negative: ['VIX'],
      related: ['QQQ', 'AAPL', 'MSFT', 'NVDA']
    },
    sessions: {
      most_active: ['us_open', 'us_close'],
      avoid: ['asia_lunch', 'low_volume']
    }
  },

  ES: {
    id: 'ES',
    name: 'E-mini S&P 500',
    exchange: 'CME',
    tickSize: 0.25,
    tickValue: 12.50,
    pointValue: 50.00,
    margin: 12000,
    characteristics: {
      volatility: 'medium',
      sector: 'broad_market',
      behavior: 'reference index, institutional flow',
      avgRange: '30-60 points'
    },
    correlations: {
      positive: ['NQ', 'YM', 'RTY'],
      negative: ['VIX', 'ZB'],
      related: ['SPY', 'SPX']
    },
    sessions: {
      most_active: ['us_open', 'us_close', 'london_us_overlap'],
      avoid: ['asia_session']
    }
  },

  YM: {
    id: 'YM',
    name: 'E-mini Dow',
    exchange: 'CME',
    tickSize: 1.00,
    tickValue: 5.00,
    pointValue: 5.00,
    margin: 10000,
    characteristics: {
      volatility: 'medium-low',
      sector: 'value_stocks',
      behavior: 'slower than ES/NQ, less spiky',
      avgRange: '200-400 points'
    },
    correlations: {
      positive: ['ES', 'NQ'],
      negative: ['VIX'],
      related: ['DIA', 'DJIA']
    },
    sessions: {
      most_active: ['us_open', 'us_close'],
      avoid: ['overnight']
    }
  },

  RTY: {
    id: 'RTY',
    name: 'E-mini Russell 2000',
    exchange: 'CME',
    tickSize: 0.10,
    tickValue: 5.00,
    pointValue: 50.00,
    margin: 8000,
    characteristics: {
      volatility: 'high',
      sector: 'small_caps',
      behavior: 'more volatile than ES, liquidity gaps',
      avgRange: '20-40 points'
    },
    correlations: {
      positive: ['ES', 'NQ'],
      negative: ['VIX'],
      related: ['IWM', 'RUT']
    },
    sessions: {
      most_active: ['us_open'],
      avoid: ['overnight', 'low_volume']
    }
  },

  GC: {
    id: 'GC',
    name: 'Gold Futures',
    exchange: 'COMEX',
    tickSize: 0.10,
    tickValue: 10.00,
    pointValue: 100.00,
    margin: 11000,
    characteristics: {
      volatility: 'medium',
      sector: 'precious_metals',
      behavior: 'safe haven, inverse USD, central bank sensitive',
      avgRange: '15-30 points'
    },
    correlations: {
      positive: ['SI', 'EURUSD'],
      negative: ['DXY', 'US10Y'],
      related: ['GLD', 'XAUUSD']
    },
    sessions: {
      most_active: ['london', 'us_open', 'asia_open'],
      avoid: ['us_afternoon']
    }
  },

  SI: {
    id: 'SI',
    name: 'Silver Futures',
    exchange: 'COMEX',
    tickSize: 0.005,
    tickValue: 25.00,
    pointValue: 5000.00,
    margin: 9000,
    characteristics: {
      volatility: 'high',
      sector: 'precious_metals',
      behavior: 'follows gold with more volatility, industrial demand',
      avgRange: '0.30-0.60 points'
    },
    correlations: {
      positive: ['GC'],
      negative: ['DXY'],
      related: ['SLV', 'XAGUSD']
    },
    sessions: {
      most_active: ['london', 'us_open'],
      avoid: ['asia_lunch']
    }
  },

  CL: {
    id: 'CL',
    name: 'Crude Oil Futures',
    exchange: 'NYMEX',
    tickSize: 0.01,
    tickValue: 10.00,
    pointValue: 1000.00,
    margin: 7000,
    characteristics: {
      volatility: 'high',
      sector: 'energy',
      behavior: 'news-driven, inventories, geopolitical, OPEC',
      avgRange: '1.50-3.00 points'
    },
    correlations: {
      positive: ['BZ', 'XLE'],
      negative: [],
      related: ['USO', 'WTI']
    },
    sessions: {
      most_active: ['us_open', 'inventory_report'],
      avoid: ['overnight_thin']
    }
  }
};

/**
 * Trading sessions with times (Eastern Time)
 */
const SESSIONS = {
  asia_open: { start: '18:00', end: '20:00', description: 'Asia market open' },
  asia_session: { start: '20:00', end: '03:00', description: 'Asia main session' },
  asia_lunch: { start: '00:00', end: '01:00', description: 'Asia lunch (low volume)' },
  london: { start: '03:00', end: '08:00', description: 'London session' },
  london_us_overlap: { start: '08:00', end: '11:30', description: 'London/US overlap' },
  us_open: { start: '09:30', end: '11:30', description: 'US market open (high volume)' },
  us_midday: { start: '11:30', end: '14:00', description: 'US midday (lower volume)' },
  us_afternoon: { start: '14:00', end: '15:00', description: 'US afternoon' },
  us_close: { start: '15:00', end: '16:00', description: 'US close (rebalancing)' },
  overnight: { start: '16:00', end: '18:00', description: 'Overnight transition' }
};

/**
 * Get symbol data by ID
 */
const getSymbol = (symbolId) => {
  const key = symbolId?.toUpperCase?.()?.replace(/[0-9]/g, '') || '';
  return SYMBOLS[key] || null;
};

/**
 * Get current session based on time
 */
const getCurrentSession = (date = new Date()) => {
  const et = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const time = hours * 60 + minutes;

  for (const [name, session] of Object.entries(SESSIONS)) {
    const [startH, startM] = session.start.split(':').map(Number);
    const [endH, endM] = session.end.split(':').map(Number);
    const start = startH * 60 + startM;
    const end = endH * 60 + endM;

    if (start <= end) {
      if (time >= start && time < end) return { name, ...session };
    } else {
      if (time >= start || time < end) return { name, ...session };
    }
  }
  return { name: 'unknown', description: 'Unknown session' };
};

/**
 * Check if current time is good for trading a symbol
 */
const isGoodSessionForSymbol = (symbolId, date = new Date()) => {
  const symbol = getSymbol(symbolId);
  if (!symbol) return { good: true, reason: 'Unknown symbol' };

  const session = getCurrentSession(date);
  
  if (symbol.sessions.avoid?.includes(session.name)) {
    return { good: false, reason: `${session.description} - typically low volume for ${symbolId}` };
  }
  
  if (symbol.sessions.most_active?.includes(session.name)) {
    return { good: true, reason: `${session.description} - optimal for ${symbolId}` };
  }

  return { good: true, reason: session.description };
};

module.exports = {
  SYMBOLS,
  SESSIONS,
  getSymbol,
  getCurrentSession,
  isGoodSessionForSymbol
};
