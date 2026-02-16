/**
 * Log type classification — mirrors ALL 17 CLI log types from ui.js
 * Used by AlgoLive.jsx to color-code and tag smart log entries.
 */

export const LOG_TYPES = {
  fill_buy:   { label: 'BUY',   color: 'text-accent bg-accent/10' },
  fill_sell:  { label: 'SELL',  color: 'text-pink bg-pink/10' },
  fill_win:   { label: 'WIN',   color: 'text-accent bg-accent/15 font-bold' },
  fill_loss:  { label: 'LOSS',  color: 'text-pink bg-pink/15 font-bold' },
  connected:  { label: 'CONN',  color: 'text-accent bg-accent/10' },
  ready:      { label: 'READY', color: 'text-accent bg-accent/10' },
  error:      { label: 'ERR',   color: 'text-pink bg-pink/10' },
  reject:     { label: 'REJ',   color: 'text-pink bg-pink/10' },
  info:       { label: 'INFO',  color: 'text-text-muted bg-bg-card-hover' },
  signal:     { label: 'SIG',   color: 'text-warning bg-warning/10 font-bold' },
  trade:      { label: 'TRADE', color: 'text-[#d946ef] bg-[#d946ef]/10' },
  analysis:   { label: 'ANLZ',  color: 'text-[#60a5fa] bg-[#60a5fa]/10' },
  risk:       { label: 'RISK',  color: 'text-warning bg-warning/10' },
  system:     { label: 'SYS',   color: 'text-[#60a5fa] bg-[#60a5fa]/10' },
  debug:      { label: 'DBG',   color: 'text-text-dim bg-bg-card-hover' },
  bullish:    { label: 'BULL',  color: 'text-accent bg-accent/10' },
  bearish:    { label: 'BEAR',  color: 'text-[#d946ef] bg-[#d946ef]/10' },
  warn:       { label: 'WARN',  color: 'text-warning bg-warning/10' },
};

/**
 * Get log tag based on event data — uses level/type/kind + message content fallback
 */
export function getLogTag(event) {
  const level = event.level || event.type || event.kind || '';

  if (LOG_TYPES[level]) return LOG_TYPES[level];

  if (event.kind === 'signal') return LOG_TYPES.signal;
  if (event.kind === 'trade') return LOG_TYPES.trade;
  if (event.kind === 'smartlog') {
    return LOG_TYPES[event.type] || LOG_TYPES.analysis;
  }

  const msg = event.message || '';
  if (msg.includes('WIN') || msg.includes('TARGET REACHED')) return LOG_TYPES.fill_win;
  if (msg.includes('LOSS') || msg.includes('MAX RISK')) return LOG_TYPES.fill_loss;
  if (msg.includes('Entered') && msg.includes('LONG')) return LOG_TYPES.fill_buy;
  if (msg.includes('Entered') && msg.includes('SHORT')) return LOG_TYPES.fill_sell;
  if (msg.includes('Signal:') || msg.includes('SIGNAL')) return LOG_TYPES.signal;
  if (msg.includes('Brackets') || msg.includes('SL:')) return LOG_TYPES.trade;
  if (msg.includes('error') || msg.includes('Error') || msg.includes('failed')) return LOG_TYPES.error;
  if (msg.includes('VPIN toxic') || msg.includes('NO ENTRY')) return LOG_TYPES.risk;
  if (msg.includes('PAUSED') || msg.includes('Cooldown')) return LOG_TYPES.risk;
  if (msg.includes('Target:') || msg.includes('Risk:')) return LOG_TYPES.risk;
  if (msg.includes('connected') || msg.includes('Connected')) return LOG_TYPES.connected;
  if (msg.includes('started') || msg.includes('ready')) return LOG_TYPES.ready;

  return LOG_TYPES.info;
}

/**
 * Get message color based on content (like CLI chalk coloring)
 */
export function getLogColor(msg) {
  if (!msg) return 'text-text-muted';
  if (msg.includes('WIN') || msg.includes('TARGET REACHED')) return 'text-accent';
  if (msg.includes('LOSS') || msg.includes('MAX RISK')) return 'text-pink';
  if (msg.includes('SIGNAL CONDITIONS MET') || msg.includes('SIGNAL')) return 'text-warning';
  if (msg.includes('LONG') || msg.includes('BUY')) return 'text-accent';
  if (msg.includes('SHORT') || msg.includes('SELL')) return 'text-pink';
  if (msg.includes('Entered')) return 'text-accent';
  if (msg.includes('Brackets') || msg.includes('OCO')) return 'text-warning';
  if (msg.includes('VPIN') && msg.includes('TOXIC')) return 'text-pink font-bold';
  if (msg.includes('EXTREME')) return 'text-[#d946ef] font-bold';
  if (msg.includes('PAUSED')) return 'text-pink';
  if (msg.includes('Cooldown')) return 'text-text-dim';
  if (msg.includes('error') || msg.includes('Error') || msg.includes('failed')) return 'text-pink';
  if (msg.includes('scanning') || msg.includes('quiet')) return 'text-text-dim';
  if (msg.includes('Z:') || msg.includes('OFI:') || msg.includes('VPIN:')) return 'text-text-secondary';
  return 'text-text-muted';
}
