/**
 * Rithmic Trades Module
 * Convert individual fills to round-trip trades with P&L
 * 
 * NO MOCK DATA - Only real fills from Rithmic API
 */

// Tick values for common futures contracts
const TICK_VALUES = {
  // E-mini contracts
  'ES': { tickSize: 0.25, tickValue: 12.50 },
  'NQ': { tickSize: 0.25, tickValue: 5.00 },
  'YM': { tickSize: 1.00, tickValue: 5.00 },
  'RTY': { tickSize: 0.10, tickValue: 5.00 },
  // Micro contracts
  'MES': { tickSize: 0.25, tickValue: 1.25 },
  'MNQ': { tickSize: 0.25, tickValue: 0.50 },
  'MYM': { tickSize: 1.00, tickValue: 0.50 },
  'M2K': { tickSize: 0.10, tickValue: 0.50 },
  // Commodities
  'CL': { tickSize: 0.01, tickValue: 10.00 },
  'GC': { tickSize: 0.10, tickValue: 10.00 },
  'SI': { tickSize: 0.005, tickValue: 25.00 },
  'NG': { tickSize: 0.001, tickValue: 10.00 },
  // Bonds
  'ZB': { tickSize: 0.03125, tickValue: 31.25 },
  'ZN': { tickSize: 0.015625, tickValue: 15.625 },
  'ZF': { tickSize: 0.0078125, tickValue: 7.8125 },
  // Default
  'DEFAULT': { tickSize: 0.25, tickValue: 1.25 },
};

/**
 * Get base symbol from contract (e.g., "MNQH6" -> "MNQ")
 * @param {string} symbol - Full contract symbol
 * @returns {string} Base symbol
 */
const getBaseSymbol = (symbol) => {
  if (!symbol) return 'DEFAULT';
  // Remove month/year suffix (e.g., H6, M5, Z4)
  const match = symbol.match(/^([A-Z0-9]+?)([FGHJKMNQUVXZ]\d{1,2})?$/i);
  return match ? match[1].toUpperCase() : symbol.toUpperCase();
};

/**
 * Get tick value for a symbol
 * @param {string} symbol - Contract symbol
 * @returns {Object} { tickSize, tickValue }
 */
const getTickInfo = (symbol) => {
  const base = getBaseSymbol(symbol);
  return TICK_VALUES[base] || TICK_VALUES['DEFAULT'];
};

/**
 * Calculate P&L for a round-trip trade
 * @param {number} entryPrice - Entry price
 * @param {number} exitPrice - Exit price
 * @param {number} quantity - Number of contracts
 * @param {number} side - 1=Long (BUY first), 2=Short (SELL first)
 * @param {string} symbol - Contract symbol
 * @returns {number} P&L in dollars
 */
const calculatePnL = (entryPrice, exitPrice, quantity, side, symbol) => {
  const { tickSize, tickValue } = getTickInfo(symbol);
  const priceDiff = side === 1 ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
  const ticks = priceDiff / tickSize;
  return ticks * tickValue * quantity;
};

/**
 * Convert fills to round-trip trades using FIFO matching
 * @param {Array} fills - Array of fill objects from Rithmic API
 * @returns {Array} Array of round-trip trade objects
 */
const fillsToRoundTrips = (fills) => {
  if (!fills || fills.length === 0) return [];

  // Group fills by account and symbol
  const groups = new Map();
  
  for (const fill of fills) {
    const key = `${fill.accountId}:${fill.symbol}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push({
      ...fill,
      size: fill.fillSize || fill.quantity || 1,
      price: fill.fillPrice || fill.price || 0,
      side: fill.side || fill.transactionType, // 1=BUY, 2=SELL
      timestamp: fill.timestamp || parseDateTime(fill.fillDate, fill.fillTime),
    });
  }

  const roundTrips = [];

  // Process each symbol group
  for (const [key, symbolFills] of groups) {
    // Sort by timestamp ascending (oldest first for FIFO)
    symbolFills.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Position tracking: positive = long, negative = short
    let position = 0;
    let openTrades = []; // Stack of open fills for matching

    for (const fill of symbolFills) {
      const fillSide = fill.side; // 1=BUY, 2=SELL
      const fillQty = fill.size;
      const fillPrice = fill.price;

      if (fillSide === 1) {
        // BUY
        if (position >= 0) {
          // Opening or adding to long position
          openTrades.push({ ...fill, remainingQty: fillQty });
          position += fillQty;
        } else {
          // Closing short position (BUY to cover)
          let qtyToClose = fillQty;
          
          while (qtyToClose > 0 && openTrades.length > 0) {
            const openTrade = openTrades[0];
            const closeQty = Math.min(qtyToClose, openTrade.remainingQty);
            
            // Create round-trip (short trade)
            const pnl = calculatePnL(openTrade.price, fillPrice, closeQty, 2, fill.symbol);
            roundTrips.push({
              id: `${openTrade.id || openTrade.fillId}-${fill.id || fill.fillId}`,
              accountId: fill.accountId,
              symbol: fill.symbol,
              exchange: fill.exchange,
              side: 2, // Short
              quantity: closeQty,
              entryPrice: openTrade.price,
              exitPrice: fillPrice,
              entryTime: openTrade.timestamp,
              exitTime: fill.timestamp,
              entryDate: openTrade.fillDate,
              exitDate: fill.fillDate,
              pnl: pnl,
              profitAndLoss: pnl,
            });

            openTrade.remainingQty -= closeQty;
            qtyToClose -= closeQty;
            position += closeQty;

            if (openTrade.remainingQty === 0) {
              openTrades.shift();
            }
          }

          // If still have qty, it's opening a new long
          if (qtyToClose > 0) {
            openTrades.push({ ...fill, remainingQty: qtyToClose });
            position += qtyToClose;
          }
        }
      } else if (fillSide === 2) {
        // SELL
        if (position <= 0) {
          // Opening or adding to short position
          openTrades.push({ ...fill, remainingQty: fillQty });
          position -= fillQty;
        } else {
          // Closing long position (SELL to close)
          let qtyToClose = fillQty;
          
          while (qtyToClose > 0 && openTrades.length > 0) {
            const openTrade = openTrades[0];
            const closeQty = Math.min(qtyToClose, openTrade.remainingQty);
            
            // Create round-trip (long trade)
            const pnl = calculatePnL(openTrade.price, fillPrice, closeQty, 1, fill.symbol);
            roundTrips.push({
              id: `${openTrade.id || openTrade.fillId}-${fill.id || fill.fillId}`,
              accountId: fill.accountId,
              symbol: fill.symbol,
              exchange: fill.exchange,
              side: 1, // Long
              quantity: closeQty,
              entryPrice: openTrade.price,
              exitPrice: fillPrice,
              entryTime: openTrade.timestamp,
              exitTime: fill.timestamp,
              entryDate: openTrade.fillDate,
              exitDate: fill.fillDate,
              pnl: pnl,
              profitAndLoss: pnl,
            });

            openTrade.remainingQty -= closeQty;
            qtyToClose -= closeQty;
            position -= closeQty;

            if (openTrade.remainingQty === 0) {
              openTrades.shift();
            }
          }

          // If still have qty, it's opening a new short
          if (qtyToClose > 0) {
            openTrades.push({ ...fill, remainingQty: qtyToClose });
            position -= qtyToClose;
          }
        }
      }
    }
  }

  // Sort round-trips by exit time descending (newest first)
  roundTrips.sort((a, b) => (b.exitTime || 0) - (a.exitTime || 0));

  return roundTrips;
};

/**
 * Parse Rithmic date/time to timestamp
 * @param {string} dateStr - Date in YYYYMMDD format
 * @param {string} timeStr - Time in HH:MM:SS format
 * @returns {number} Unix timestamp in milliseconds
 */
const parseDateTime = (dateStr, timeStr) => {
  if (!dateStr) return Date.now();
  try {
    const year = dateStr.slice(0, 4);
    const month = dateStr.slice(4, 6);
    const day = dateStr.slice(6, 8);
    const time = timeStr || '00:00:00';
    return new Date(`${year}-${month}-${day}T${time}Z`).getTime();
  } catch (e) {
    return Date.now();
  }
};

/**
 * Calculate summary statistics from round-trips
 * @param {Array} roundTrips - Array of round-trip trades
 * @returns {Object} Summary statistics
 */
const calculateTradeStats = (roundTrips) => {
  if (!roundTrips || roundTrips.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      breakEvenTrades: 0,
      totalPnL: 0,
      totalProfit: 0,
      totalLoss: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      largestWin: 0,
      largestLoss: 0,
      profitFactor: 0,
      longTrades: 0,
      shortTrades: 0,
      longWins: 0,
      shortWins: 0,
      totalVolume: 0,
    };
  }

  let stats = {
    totalTrades: roundTrips.length,
    winningTrades: 0,
    losingTrades: 0,
    breakEvenTrades: 0,
    totalPnL: 0,
    totalProfit: 0,
    totalLoss: 0,
    largestWin: 0,
    largestLoss: 0,
    longTrades: 0,
    shortTrades: 0,
    longWins: 0,
    shortWins: 0,
    totalVolume: 0,
  };

  for (const trade of roundTrips) {
    const pnl = trade.pnl || 0;
    stats.totalPnL += pnl;
    stats.totalVolume += trade.quantity || 1;

    if (trade.side === 1) {
      stats.longTrades++;
      if (pnl > 0) stats.longWins++;
    } else {
      stats.shortTrades++;
      if (pnl > 0) stats.shortWins++;
    }

    if (pnl > 0) {
      stats.winningTrades++;
      stats.totalProfit += pnl;
      if (pnl > stats.largestWin) stats.largestWin = pnl;
    } else if (pnl < 0) {
      stats.losingTrades++;
      stats.totalLoss += Math.abs(pnl);
      if (pnl < stats.largestLoss) stats.largestLoss = pnl;
    } else {
      stats.breakEvenTrades++;
    }
  }

  // Calculate derived metrics
  stats.winRate = stats.totalTrades > 0 
    ? (stats.winningTrades / stats.totalTrades) * 100 
    : 0;
  stats.avgWin = stats.winningTrades > 0 
    ? stats.totalProfit / stats.winningTrades 
    : 0;
  stats.avgLoss = stats.losingTrades > 0 
    ? stats.totalLoss / stats.losingTrades 
    : 0;
  stats.profitFactor = stats.totalLoss > 0 
    ? stats.totalProfit / stats.totalLoss 
    : (stats.totalProfit > 0 ? Infinity : 0);

  return stats;
};

module.exports = {
  fillsToRoundTrips,
  calculateTradeStats,
  calculatePnL,
  getTickInfo,
  getBaseSymbol,
  parseDateTime,
  TICK_VALUES,
};
