/**
 * HQX-2B Liquidity Sweep - Event-Based Messages
 * Each function = one specific event type
 * Messages reflect REAL strategy state, no random spam
 */
'use strict';

const chalk = require('chalk');

module.exports = {
  // Strategy initialized
  init: (d) => chalk.cyan(`[${d.sym}]`) + ` Strategy ready | ${d.bars} bars | ${d.swings} swings | ${d.zones} zones`,

  // New 1-minute bar closed
  newBar: (d) => chalk.gray(`[${d.sym}]`) + ` Bar #${d.bars} @ ${chalk.white(d.price)}`,

  // New swing point detected
  newSwing: (d) => chalk.yellow(`[${d.sym}]`) + ` Swing #${d.swings} detected @ ${chalk.white(d.price)}`,

  // New liquidity zone created
  newZone: (d) => chalk.green(`[${d.sym}]`) + ` Zone #${d.zones} created @ ${chalk.white(d.price)} | Sweep target active`,

  // Price approaching a zone
  approachZone: (d) => chalk.bgYellow.black(' ZONE ') + ` ${chalk.yellow(`[${d.sym}]`)} ${chalk.white(d.price)} approaching ${d.zonePrice} (${d.distance}t away)`,

  // Bias flipped (bull <-> bear)
  biasFlip: (d) => {
    const arrow = d.to === 'bullish' ? chalk.green('') : chalk.red('');
    const color = d.to === 'bullish' ? chalk.green : chalk.red;
    return `[${d.sym}] ${arrow} Bias: ${d.from}${color(d.to)} | Delta: ${d.delta}`;
  },

  // Significant price movement
  priceMove: (d) => {
    const arrow = d.dir === 'up' ? chalk.green('+') : chalk.red('-');
    return chalk.gray(`[${d.sym}]`) + ` ${chalk.white(d.price)} (${arrow}${d.ticks}t)`;
  },

  // Delta/OFI shift
  deltaShift: (d) => {
    const dir = d.to > d.from ? chalk.green('') : chalk.red('');
    return chalk.gray(`[${d.sym}]`) + ` Delta shift: ${d.from}${dir}${d.to}`;
  },

  // Keep building/bull/bear/zones/neutral for QUANT compatibility (minimal versions)
  building: (d) => chalk.cyan(`[${d.sym}]`) + ` Warmup: ${d.bars} bars | ${d.swings} swings`,
  
  bull: (d) => chalk.green(`[${d.sym}]`) + ` ${d.price} | Delta: +${Math.abs(d.delta)} | Bullish`,
  
  bear: (d) => chalk.red(`[${d.sym}]`) + ` ${d.price} | Delta: ${d.delta} | Bearish`,
  
  zones: (d) => chalk.yellow(`[${d.sym}]`) + ` ${d.price} | ${d.zones} zones active`,
  
  neutral: (d) => chalk.gray(`[${d.sym}]`) + ` ${d.price} | Neutral | ${d.zones} zones`,
  
  ready: (d) => chalk.bgCyan.black(' RDY ') + ` ${chalk.cyan(`[${d.sym}]`)} ${d.price} | ${d.zones} zones | ${d.swings} swings`,
};
