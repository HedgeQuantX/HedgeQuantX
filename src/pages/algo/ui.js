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

// Log type colors - HF grade BOLD
const LOG_COLORS = {
  // Executions
  fill_buy: chalk.green.bold,
  fill_sell: chalk.red.bold,
  fill_win: chalk.green.bold,
  fill_loss: chalk.red.bold,
  // Status
  connected: chalk.green.bold,
  ready: chalk.cyan.bold,
  // Errors
  error: chalk.red.bold,
  reject: chalk.red.bold,
  // Info
  info: chalk.gray,
  system: chalk.blue.bold,
  // Trading
  signal: chalk.magenta.bold,
  trade: chalk.yellow.bold,
  success: chalk.green.bold
};

// Log type icons - UPPERCASE BOLD HF style
const LOG_ICONS = {
  fill_buy: 'BUY   ',
  fill_sell: 'SELL  ',
  fill_win: 'WIN   ',
  fill_loss: 'LOSS  ',
  connected: 'CONN  ',
  ready: 'READY ',
  error: 'ERR   ',
  reject: 'REJ   ',
  info: 'INFO  ',
  system: 'SYS   ',
  signal: 'SIGNAL',
  trade: 'TRADE ',
  success: 'OK    '
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
 * Build a labeled cell for grid - UPPERCASE BOLD style
 */
const buildCell = (label, value, color, width) => {
  const upperLabel = label.toUpperCase();
  const upperValue = String(value).toUpperCase();
  const text = ` ${chalk.bold(upperLabel)}: ${color.bold(upperValue)}`;
  const plain = ` ${upperLabel}: ${upperValue}`;
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
    this.maxLogs = 45; // Max visible logs
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
    this._line(chalk.cyan(BOX.V) + chalk.white(center(`PROP FUTURES ALGO TRADING  v${version}`, W)) + chalk.cyan(BOX.V));
    this._line(chalk.cyan(BOX.ML + BOX.H.repeat(W) + BOX.MR));
    this._line(chalk.cyan(BOX.V) + chalk.yellow.bold(center((this.config.subtitle || 'HQX ALGO TRADING').toUpperCase(), W)) + chalk.cyan(BOX.V));
  }

  _drawStats(stats) {
    const { W } = this;
    const isCopyTrading = this.config.mode === 'copy-trading';
    
    const pnl = stats.pnl !== null && stats.pnl !== undefined ? stats.pnl : null;
    const pnlColor = pnl === null ? chalk.gray : (pnl >= 0 ? chalk.green : chalk.red);
    const pnlStr = pnl === null ? '--' : ((pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toFixed(2));
    const latencyColor = stats.latency < 100 ? chalk.green : (stats.latency < 300 ? chalk.yellow : chalk.red);
    const serverColor = stats.connected ? chalk.green : chalk.red;
    
    if (isCopyTrading) {
      this._drawCopyTradingStats(stats, pnlColor, pnlStr, latencyColor, serverColor);
    } else {
      this._drawOneAccountStats(stats, pnlColor, pnlStr, latencyColor, serverColor);
    }
  }

  _drawOneAccountStats(stats, pnlColor, pnlStr, latencyColor, serverColor) {
    const { W } = this;
    const colL = 48, colR = 47;
    const pad = (len) => ' '.repeat(Math.max(0, len));
    
    const GT = BOX.ML + BOX.H.repeat(colL) + BOX.TM + BOX.H.repeat(colR) + BOX.MR;
    const GM = BOX.ML + BOX.H.repeat(colL) + BOX.MM + BOX.H.repeat(colR) + BOX.MR;
    const GB = BOX.ML + BOX.H.repeat(colL) + BOX.BM + BOX.H.repeat(colR) + BOX.MR;
    
    const row = (c1, c2) => {
      this._line(chalk.cyan(BOX.V) + c1 + chalk.cyan(BOX.VS) + c2 + chalk.cyan(BOX.V));
    };
    
    this._line(chalk.cyan(GT));
    
    // Row 1: Account | Symbol
    const accountName = String(stats.accountName || 'N/A').substring(0, 40);
    const symbol = String(stats.symbol || 'N/A').substring(0, 35);
    const r1c1 = buildCell('Account', accountName, chalk.cyan, colL);
    const r1c2 = buildCell('Symbol', symbol, chalk.yellow, colR);
    row(r1c1.padded, r1c2.padded);
    
    this._line(chalk.cyan(GM));
    
    // Row 2: Qty | P&L
    const r2c1 = buildCell('QTY', (stats.qty || '1').toString(), chalk.cyan, colL);
    const r2c2 = buildCell('P&L', pnlStr, pnlColor, colR);
    row(r2c1.padded, r2c2.padded);
    
    this._line(chalk.cyan(GM));
    
    // Row 3: Target | Risk
    const targetStr = stats.target !== null && stats.target !== undefined ? '$' + stats.target.toFixed(2) : '--';
    const riskStr = stats.risk !== null && stats.risk !== undefined ? '$' + stats.risk.toFixed(2) : '--';
    const r3c1 = buildCell('TARGET', targetStr, chalk.green, colL);
    const r3c2 = buildCell('RISK', riskStr, chalk.red, colR);
    row(r3c1.padded, r3c2.padded);
    
    this._line(chalk.cyan(GM));
    
    // Row 4: Trades | Latency (API response time) - UPPERCASE BOLD
    const r4c1t = ` ${chalk.bold('TRADES')}: ${chalk.cyan.bold(stats.trades || 0)}  ${chalk.bold('W/L')}: ${chalk.green.bold(stats.wins || 0)}/${chalk.red.bold(stats.losses || 0)}`;
    const r4c1p = ` TRADES: ${stats.trades || 0}  W/L: ${stats.wins || 0}/${stats.losses || 0}`;
    const r4c2 = buildCell('LATENCY', `${stats.latency || 0}MS`, latencyColor, colR);
    row(r4c1t + pad(colL - r4c1p.length), r4c2.padded);
    
    this._line(chalk.cyan(GM));
    
    // Row 5: Connection | Propfirm
    const connection = stats.platform || 'ProjectX';
    const r5c1 = buildCell('CONNECTION', connection, chalk.cyan, colL);
    const r5c2 = buildCell('PROPFIRM', stats.propfirm || 'N/A', chalk.cyan, colR);
    row(r5c1.padded, r5c2.padded);
    
    this._line(chalk.cyan(GB));
  }

  _drawCopyTradingStats(stats, pnlColor, pnlStr, latencyColor, serverColor) {
    const { W } = this;
    const colL = 48, colR = 47;
    const pad = (len) => ' '.repeat(Math.max(0, len));
    
    const GT = BOX.ML + BOX.H.repeat(colL) + BOX.TM + BOX.H.repeat(colR) + BOX.MR;
    const GM = BOX.ML + BOX.H.repeat(colL) + BOX.MM + BOX.H.repeat(colR) + BOX.MR;
    const GB = BOX.ML + BOX.H.repeat(colL) + BOX.BM + BOX.H.repeat(colR) + BOX.MR;
    
    const row = (c1, c2) => {
      this._line(chalk.cyan(BOX.V) + c1 + chalk.cyan(BOX.VS) + c2 + chalk.cyan(BOX.V));
    };
    
    this._line(chalk.cyan(GT));
    
    // Row 1: Lead Account | Follower Account
    const leadName = (stats.leadName || 'N/A').substring(0, 40);
    const followerName = (stats.followerName || 'N/A').substring(0, 40);
    const r1c1 = buildCell('Lead', leadName, chalk.cyan, colL);
    const r1c2 = buildCell('Follower', followerName, chalk.magenta, colR);
    row(r1c1.padded, r1c2.padded);
    
    // Full width separator
    const GF = BOX.ML + BOX.H.repeat(W) + BOX.MR;
    
    this._line(chalk.cyan(GF));
    
    // Row 2: Symbol (centered, single row)
    const symbol = (stats.symbol || stats.leadSymbol || 'N/A').substring(0, 60);
    const symbolText = `SYMBOL: ${symbol}`;
    const symbolPadded = center(symbolText, W);
    this._line(chalk.cyan(BOX.V) + chalk.yellow(symbolPadded) + chalk.cyan(BOX.V));
    
    this._line(chalk.cyan(GT));
    
    // Row 3: Lead Qty | Follower Qty
    const r3c1 = buildCell('QTY', (stats.leadQty || '1').toString(), chalk.cyan, colL);
    const r3c2 = buildCell('QTY', (stats.followerQty || '1').toString(), chalk.cyan, colR);
    row(r3c1.padded, r3c2.padded);
    
    this._line(chalk.cyan(GM));
    
    // Row 4: Target | Risk
    const r4c1 = buildCell('TARGET', '$' + (stats.target || 0).toFixed(2), chalk.green, colL);
    const r4c2 = buildCell('RISK', '$' + (stats.risk || 0).toFixed(2), chalk.red, colR);
    row(r4c1.padded, r4c2.padded);
    
    this._line(chalk.cyan(GM));
    
    // Row 5: P&L | Trades - UPPERCASE BOLD
    const r5c1 = buildCell('P&L', pnlStr, pnlColor, colL);
    const r5c2t = ` ${chalk.bold('TRADES')}: ${chalk.cyan.bold(stats.trades || 0)}  ${chalk.bold('W/L')}: ${chalk.green.bold(stats.wins || 0)}/${chalk.red.bold(stats.losses || 0)}`;
    const r5c2p = ` TRADES: ${stats.trades || 0}  W/L: ${stats.wins || 0}/${stats.losses || 0}`;
    row(r5c1.padded, r5c2t + pad(colR - r5c2p.length));
    
    this._line(chalk.cyan(GB));
  }

  _drawLogs() {
    const { W, logs, maxLogs } = this;
    
    // Activity header - HF style
    this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER.length;
    const spinner = SPINNER[this.spinnerFrame];
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour12: false });
    const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    const leftText = ` EXECUTION LOG ${spinner}`;
    const rightText = `[X] STOP `;
    
    const totalFixed = leftText.length + rightText.length;
    const centerSpace = W - totalFixed;
    const centerPadLeft = Math.floor((centerSpace - dateStr.length) / 2);
    const centerPadRight = centerSpace - dateStr.length - centerPadLeft;
    
    const left = ` ${chalk.bold('EXECUTION LOG')} ${chalk.yellow(spinner)}`;
    const center = ' '.repeat(Math.max(0, centerPadLeft)) + chalk.white.bold(dateStr.toUpperCase()) + ' '.repeat(Math.max(0, centerPadRight));
    const right = chalk.yellow.bold('[X] STOP') + ' ';
    
    this._line(chalk.cyan(BOX.V) + chalk.white(left) + center + right + chalk.cyan(BOX.V));
    this._line(chalk.cyan(BOX.ML + BOX.H.repeat(W) + BOX.MR));
    
    // Logs: newest at top
    const visible = logs.slice(-maxLogs).reverse();
    
    if (visible.length === 0) {
      this._line(chalk.cyan(BOX.V) + chalk.gray(fitToWidth(' Awaiting market signals...', W)) + chalk.cyan(BOX.V));
      for (let i = 0; i < maxLogs - 1; i++) {
        this._line(chalk.cyan(BOX.V) + ' '.repeat(W) + chalk.cyan(BOX.V));
      }
    } else {
      visible.forEach(log => {
        const color = LOG_COLORS[log.type] || chalk.gray;
        const icon = LOG_ICONS[log.type] || '';
        // HF style: TIME | TYPE | MESSAGE
        const line = ` ${chalk.gray(log.timestamp)} ${color(icon)}${log.message}`;
        this._line(chalk.cyan(BOX.V) + fitToWidth(line, W) + chalk.cyan(BOX.V));
      });
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

/**
 * Render Session Summary - Same style as dashboard
 */
const renderSessionSummary = (stats, stopReason) => {
  const W = 96; // Same width as dashboard
  const colL = Math.floor(W / 2) - 1;
  const colR = W - colL - 1;
  const version = require('../../../package.json').version;
  
  console.clear();
  console.log();
  
  // Top border
  console.log(chalk.cyan(BOX.TOP + BOX.H.repeat(W) + BOX.TR));
  
  // Logo
  console.log(chalk.cyan(BOX.V) + chalk.cyan(' ██╗  ██╗███████╗██████╗  ██████╗ ███████╗ ██████╗ ██╗   ██╗ █████╗ ███╗   ██╗████████╗') + chalk.yellow('██╗  ██╗') + ' ' + chalk.cyan(BOX.V));
  console.log(chalk.cyan(BOX.V) + chalk.cyan(' ██║  ██║██╔════╝██╔══██╗██╔════╝ ██╔════╝██╔═══██╗██║   ██║██╔══██╗████╗  ██║╚══██╔══╝') + chalk.yellow('╚██╗██╔╝') + ' ' + chalk.cyan(BOX.V));
  console.log(chalk.cyan(BOX.V) + chalk.cyan(' ███████║█████╗  ██║  ██║██║  ███╗█████╗  ██║   ██║██║   ██║███████║██╔██╗ ██║   ██║   ') + chalk.yellow(' ╚███╔╝ ') + ' ' + chalk.cyan(BOX.V));
  console.log(chalk.cyan(BOX.V) + chalk.cyan(' ██╔══██║██╔══╝  ██║  ██║██║   ██║██╔══╝  ██║▄▄ ██║██║   ██║██╔══██║██║╚██╗██║   ██║   ') + chalk.yellow(' ██╔██╗ ') + ' ' + chalk.cyan(BOX.V));
  console.log(chalk.cyan(BOX.V) + chalk.cyan(' ██║  ██║███████╗██████╔╝╚██████╔╝███████╗╚██████╔╝╚██████╔╝██║  ██║██║ ╚████║   ██║   ') + chalk.yellow('██╔╝ ██╗') + ' ' + chalk.cyan(BOX.V));
  console.log(chalk.cyan(BOX.V) + chalk.cyan(' ╚═╝  ╚═╝╚══════╝╚═════╝  ╚═════╝ ╚══════╝ ╚══▀▀═╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝   ╚═╝   ') + chalk.yellow('╚═╝  ╚═╝') + ' ' + chalk.cyan(BOX.V));
  
  // Separator + title
  console.log(chalk.cyan(BOX.ML + BOX.H.repeat(W) + BOX.MR));
  console.log(chalk.cyan(BOX.V) + chalk.white(center(`PROP FUTURES ALGO TRADING  v${version}`, W)) + chalk.cyan(BOX.V));
  console.log(chalk.cyan(BOX.ML + BOX.H.repeat(W) + BOX.MR));
  console.log(chalk.cyan(BOX.V) + chalk.yellow.bold(center('SESSION SUMMARY', W)) + chalk.cyan(BOX.V));
  
  // Grid separators
  const GT = BOX.ML + BOX.H.repeat(colL) + BOX.TM + BOX.H.repeat(colR) + BOX.MR;
  const GM = BOX.ML + BOX.H.repeat(colL) + BOX.MM + BOX.H.repeat(colR) + BOX.MR;
  
  const row = (label1, value1, color1, label2, value2, color2) => {
    const upperLabel1 = label1.toUpperCase();
    const upperLabel2 = label2.toUpperCase();
    const upperValue1 = String(value1).toUpperCase();
    const upperValue2 = String(value2).toUpperCase();
    const c1 = ` ${chalk.bold(upperLabel1)}: ${color1.bold(upperValue1)}`;
    const c2 = ` ${chalk.bold(upperLabel2)}: ${color2.bold(upperValue2)}`;
    const p1 = ` ${upperLabel1}: ${upperValue1}`;
    const p2 = ` ${upperLabel2}: ${upperValue2}`;
    const padded1 = c1 + ' '.repeat(Math.max(0, colL - p1.length));
    const padded2 = c2 + ' '.repeat(Math.max(0, colR - p2.length));
    console.log(chalk.cyan(BOX.V) + padded1 + chalk.cyan(BOX.VS) + padded2 + chalk.cyan(BOX.V));
  };
  
  console.log(chalk.cyan(GT));
  
  // Row 1: Stop Reason | Duration
  const duration = stats.duration || '--';
  const reasonColor = stopReason === 'target' ? chalk.green : stopReason === 'risk' ? chalk.red : chalk.yellow;
  row('Stop Reason', (stopReason || 'manual').toUpperCase(), reasonColor, 'Duration', duration, chalk.white);
  
  console.log(chalk.cyan(GM));
  
  // Row 2: Trades | Win Rate
  const winRate = stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(1) + '%' : '0%';
  row('Trades', String(stats.trades || 0), chalk.white, 'Win Rate', winRate, stats.wins >= stats.losses ? chalk.green : chalk.red);
  
  console.log(chalk.cyan(GM));
  
  // Row 3: Wins | Losses
  row('Wins', String(stats.wins || 0), chalk.green, 'Losses', String(stats.losses || 0), chalk.red);
  
  console.log(chalk.cyan(GM));
  
  // Row 4: P&L | Target
  const pnl = stats.pnl || 0;
  const pnlStr = `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toFixed(2)}`;
  const pnlColor = pnl >= 0 ? chalk.green : chalk.red;
  const targetStr = `$${(stats.target || 0).toFixed(2)}`;
  row('P&L', pnlStr, pnlColor, 'TARGET', targetStr, chalk.cyan);
  
  // Bottom border
  console.log(chalk.cyan(BOX.BOT + BOX.H.repeat(W) + BOX.BR));
  console.log();
};

module.exports = { AlgoUI, checkMarketStatus, renderSessionSummary, LOG_COLORS, LOG_ICONS, stripAnsi, center, fitToWidth };
