/**
 * Algo Trading - Shared UI Components
 * Lightweight UI renderer for algo trading modes
 */

const chalk = require('chalk');

// Box drawing characters
const BOX = {
  TOP: '\u2554', BOT: '\u255A', V: '\u2551', H: '\u2550',
  TR: '\u2557', BR: '\u255D', ML: '\u2560', MR: '\u2563',
  TM: '\u2564', BM: '\u2567', MM: '\u256A', VS: '\u2502'
};

// Spinner characters
const SPINNER = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];

// Log type colors
const LOG_COLORS = {
  info: chalk.cyan,
  success: chalk.green,
  signal: chalk.yellow.bold,
  trade: chalk.green.bold,
  loss: chalk.magenta.bold,
  error: chalk.red,
  warning: chalk.yellow
};

// Log type icons (fixed 10 chars for alignment)
const LOG_ICONS = {
  signal: '[SIGNAL]  ',
  trade: '[TRADE]   ',
  order: '[ORDER]   ',
  position: '[POSITION]',
  error: '[ERROR]   ',
  warning: '[WARNING] ',
  success: '[OK]      ',
  analysis: '[ANALYSIS]',
  info: '[INFO]    '
};

/**
 * Strip ANSI codes from string
 */
const stripAnsi = (str) => str.replace(/\x1B\[[0-9;]*m/g, '');

/**
 * Center text in width
 */
const center = (text, width) => {
  const pad = Math.floor((width - text.length) / 2);
  return ' '.repeat(pad) + text + ' '.repeat(width - pad - text.length);
};

/**
 * Fit text to exact width (truncate or pad)
 */
const fitToWidth = (text, width) => {
  const plain = stripAnsi(text);
  if (plain.length > width) {
    let count = 0, cut = 0;
    for (let i = 0; i < text.length && count < width - 3; i++) {
      if (text[i] === '\x1B') { while (i < text.length && text[i] !== 'm') i++; }
      else { count++; cut = i + 1; }
    }
    return text.substring(0, cut) + '...';
  }
  return text + ' '.repeat(width - plain.length);
};

/**
 * Build a labeled cell for grid
 */
const buildCell = (label, value, color, width) => {
  const text = ` ${label}: ${color(value)}`;
  const plain = ` ${label}: ${value}`;
  return { text, plain, padded: text + ' '.repeat(Math.max(0, width - plain.length)) };
};

/**
 * Create AlgoUI renderer
 */
class AlgoUI {
  constructor(config) {
    this.config = config;
    this.W = 96; // Fixed width
    this.logs = [];
    this.maxLogs = 50;
    this.spinnerFrame = 0;
    this.firstDraw = true;
    this.isDrawing = false;
    this.buffer = '';
  }

  addLog(type, message) {
    const timestamp = new Date().toLocaleTimeString();
    this.logs.push({ timestamp, type, message });
    if (this.logs.length > this.maxLogs) this.logs.shift();
  }

  _line(text) {
    this.buffer += text + '\x1B[K\n';
  }

  _drawHeader() {
    const { W } = this;
    const version = require('../../../package.json').version;
    
    // Top border
    this._line(chalk.cyan(BOX.TOP + BOX.H.repeat(W) + BOX.TR));
    
    // Logo (compact)
    this._line(chalk.cyan(BOX.V) + chalk.cyan(' ██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗') + chalk.yellow('██╗  ██╗') + ' ' + chalk.cyan(BOX.V));
    this._line(chalk.cyan(BOX.V) + chalk.cyan(' ██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝') + chalk.yellow('╚██╗██╔╝') + ' ' + chalk.cyan(BOX.V));
    this._line(chalk.cyan(BOX.V) + chalk.cyan(' ███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ') + chalk.yellow(' ╚███╔╝ ') + ' ' + chalk.cyan(BOX.V));
    this._line(chalk.cyan(BOX.V) + chalk.cyan(' ██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ') + chalk.yellow(' ██╔██╗ ') + ' ' + chalk.cyan(BOX.V));
    this._line(chalk.cyan(BOX.V) + chalk.cyan(' ██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ') + chalk.yellow('██╔╝ ██╗') + ' ' + chalk.cyan(BOX.V));
    this._line(chalk.cyan(BOX.V) + chalk.cyan(' ╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ') + chalk.yellow('╚═╝  ╚═╝') + ' ' + chalk.cyan(BOX.V));
    
    // Separator + title
    this._line(chalk.cyan(BOX.ML + BOX.H.repeat(W) + BOX.MR));
    this._line(chalk.cyan(BOX.V) + chalk.white(center(`Prop Futures Algo Trading  v${version}`, W)) + chalk.cyan(BOX.V));
    this._line(chalk.cyan(BOX.ML + BOX.H.repeat(W) + BOX.MR));
    this._line(chalk.cyan(BOX.V) + chalk.yellow(center(this.config.subtitle || 'HQX Ultra-Scalping', W)) + chalk.cyan(BOX.V));
  }

  _drawStats(stats) {
    const { W } = this;
    const colL = 48, colR = 47;
    const pad = (len) => ' '.repeat(Math.max(0, len));
    
    const pnlColor = stats.pnl >= 0 ? chalk.green : chalk.red;
    const pnlStr = (stats.pnl >= 0 ? '+$' : '-$') + Math.abs(stats.pnl).toFixed(2);
    const latencyColor = stats.latency < 100 ? chalk.green : (stats.latency < 300 ? chalk.yellow : chalk.red);
    const serverColor = stats.connected ? chalk.green : chalk.red;
    
    // Grid borders
    const GT = BOX.ML + BOX.H.repeat(colL) + BOX.TM + BOX.H.repeat(colR) + BOX.MR;
    const GM = BOX.ML + BOX.H.repeat(colL) + BOX.MM + BOX.H.repeat(colR) + BOX.MR;
    const GB = BOX.ML + BOX.H.repeat(colL) + BOX.BM + BOX.H.repeat(colR) + BOX.MR;
    
    // Row builders
    const row = (c1, c2) => {
      this._line(chalk.cyan(BOX.V) + c1 + chalk.cyan(BOX.VS) + c2 + chalk.cyan(BOX.V));
    };
    
    this._line(chalk.cyan(GT));
    
    // Row 1: Account | Symbol (truncate long values)
    const accName = (stats.accountName || 'N/A').substring(0, 35);
    const symName = (stats.symbol || 'N/A').substring(0, 25);
    const qtyStr = stats.contracts || '1/1';
    
    const r1c1 = buildCell('Account', accName, chalk.cyan, colL);
    const r1c2t = ` Symbol: ${chalk.yellow(symName)}  Qty: ${chalk.cyan(qtyStr)}`;
    const r1c2p = ` Symbol: ${symName}  Qty: ${qtyStr}`;
    row(r1c1.padded, r1c2t + pad(Math.max(0, colR - r1c2p.length)));
    
    this._line(chalk.cyan(GM));
    
    // Row 2: Target | Risk
    const r2c1 = buildCell('Target', '$' + (stats.target || 0).toFixed(2), chalk.green, colL);
    const r2c2 = buildCell('Risk', '$' + (stats.risk || 0).toFixed(2), chalk.red, colR);
    row(r2c1.padded, r2c2.padded);
    
    this._line(chalk.cyan(GM));
    
    // Row 3: P&L | Server
    const r3c1 = buildCell('P&L', pnlStr, pnlColor, colL);
    const r3c2 = buildCell('Server', stats.connected ? 'ON' : 'OFF', serverColor, colR);
    row(r3c1.padded, r3c2.padded);
    
    this._line(chalk.cyan(GM));
    
    // Row 4: Trades | Latency
    const r4c1t = ` Trades: ${chalk.cyan(stats.trades || 0)}  W/L: ${chalk.green(stats.wins || 0)}/${chalk.red(stats.losses || 0)}`;
    const r4c1p = ` Trades: ${stats.trades || 0}  W/L: ${stats.wins || 0}/${stats.losses || 0}`;
    const r4c2 = buildCell('Latency', `${stats.latency || 0}ms`, latencyColor, colR);
    row(r4c1t + pad(colL - r4c1p.length), r4c2.padded);
    
    this._line(chalk.cyan(GB));
  }

  _drawLogs() {
    const { W, logs, maxLogs } = this;
    
    // Activity header
    this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER.length;
    const spinner = SPINNER[this.spinnerFrame];
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const left = ` Activity Log ${chalk.yellow(spinner)}`;
    const right = 'Press X to stop ';
    const mid = `- ${dateStr} -`;
    const space = W - stripAnsi(left).length - right.length;
    const midPad = Math.floor((space - mid.length) / 2);
    
    this._line(chalk.cyan(BOX.V) + chalk.white(left) + ' '.repeat(midPad) + chalk.cyan(mid) + ' '.repeat(space - midPad - mid.length) + chalk.yellow(right) + chalk.cyan(BOX.V));
    this._line(chalk.cyan(BOX.ML + BOX.H.repeat(W) + BOX.MR));
    
    // Logs: newest at top, oldest at bottom
    // Take the last maxLogs entries and reverse for display
    const visible = logs.slice(-maxLogs).reverse();
    
    if (visible.length === 0) {
      this._line(chalk.cyan(BOX.V) + chalk.gray(fitToWidth(' Waiting for activity...', W)) + chalk.cyan(BOX.V));
      for (let i = 0; i < maxLogs - 1; i++) {
        this._line(chalk.cyan(BOX.V) + ' '.repeat(W) + chalk.cyan(BOX.V));
      }
    } else {
      // Draw logs (newest first at top)
      visible.forEach(log => {
        const color = LOG_COLORS[log.type] || chalk.white;
        const icon = LOG_ICONS[log.type] || LOG_ICONS.info;
        const line = ` [${log.timestamp}] ${icon} ${log.message}`;
        this._line(chalk.cyan(BOX.V) + color(fitToWidth(line, W)) + chalk.cyan(BOX.V));
      });
      // Pad remaining lines at bottom
      for (let i = visible.length; i < maxLogs; i++) {
        this._line(chalk.cyan(BOX.V) + ' '.repeat(W) + chalk.cyan(BOX.V));
      }
    }
    
    // Bottom border
    this._line(chalk.cyan(BOX.BOT + BOX.H.repeat(W) + BOX.BR));
  }

  render(stats) {
    if (this.isDrawing) return;
    this.isDrawing = true;
    
    this.buffer = '';
    
    if (this.firstDraw) {
      this.buffer += '\x1B[?1049h\x1B[?25l\x1B[2J';
      this.firstDraw = false;
    }
    
    this.buffer += '\x1B[H';
    this._line('');
    this._drawHeader();
    this._drawStats(stats);
    this._drawLogs();
    
    process.stdout.write(this.buffer);
    this.isDrawing = false;
  }

  cleanup() {
    process.stdout.write('\x1B[?1049l\x1B[?25h');
  }
}

/**
 * Check market hours
 */
const checkMarketStatus = () => {
  const now = new Date();
  const utcDay = now.getUTCDay();
  const utcHour = now.getUTCHours();
  const isDST = now.getTimezoneOffset() < Math.max(
    new Date(now.getFullYear(), 0, 1).getTimezoneOffset(),
    new Date(now.getFullYear(), 6, 1).getTimezoneOffset()
  );
  const ctOffset = isDST ? 5 : 6;
  const ctHour = (utcHour - ctOffset + 24) % 24;
  const ctDay = utcHour < ctOffset ? (utcDay + 6) % 7 : utcDay;

  if (ctDay === 6) return { isOpen: false, message: 'Market closed (Saturday)' };
  if (ctDay === 0 && ctHour < 17) return { isOpen: false, message: 'Market opens Sunday 5:00 PM CT' };
  if (ctDay === 5 && ctHour >= 16) return { isOpen: false, message: 'Market closed (Friday after 4PM CT)' };
  if (ctHour === 16 && ctDay >= 1 && ctDay <= 4) return { isOpen: false, message: 'Daily maintenance' };
  return { isOpen: true, message: 'Market OPEN' };
};

module.exports = { AlgoUI, checkMarketStatus, LOG_COLORS, LOG_ICONS, stripAnsi, center, fitToWidth };
