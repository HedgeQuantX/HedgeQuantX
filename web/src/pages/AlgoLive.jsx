import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Square, Clock, Zap, TrendingUp, TrendingDown, Minus,
  Target, BarChart3, Loader2, Wifi, Shield, DollarSign,
  AlertTriangle, Activity, User,
} from 'lucide-react';
import { WsClient, api } from '../api/client';
import { formatCurrency, formatTime } from '../utils/format';

// ---------------------------------------------------------------------------
// Log type classification — mirrors ALL 17 CLI log types
// ---------------------------------------------------------------------------
const LOG_TYPES = {
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
function getLogTag(event) {
  const level = event.level || event.type || event.kind || '';

  // Direct match on level (from AlgoRunner._log)
  if (LOG_TYPES[level]) return LOG_TYPES[level];

  // Kind-based (from WS handler transform)
  if (event.kind === 'signal') return LOG_TYPES.signal;
  if (event.kind === 'trade') return LOG_TYPES.trade;
  if (event.kind === 'smartlog') {
    // SmartLog type maps to CLI log types
    const stype = event.type || 'analysis';
    return LOG_TYPES[stype] || LOG_TYPES.analysis;
  }

  // Message content fallback
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
function getLogColor(msg) {
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
  // Smart log quant values
  if (msg.includes('Z:') || msg.includes('OFI:') || msg.includes('VPIN:')) return 'text-text-secondary';
  return 'text-text-muted';
}

/**
 * Format duration from ms to Hh Mm Ss
 */
function formatDuration(ms) {
  if (!ms || ms < 0) return '0s';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/**
 * Latency color (like CLI: green < 100ms, yellow < 300ms, red >= 300ms)
 */
function latencyColor(ms) {
  if (ms == null) return 'text-text-dim';
  if (ms < 100) return 'text-accent';
  if (ms < 300) return 'text-warning';
  return 'text-pink';
}

export default function AlgoLive({ onNavigate }) {
  const navigate = useCallback(
    (path) => onNavigate?.(path === '/algo' ? 'algo' : 'dashboard'),
    [onNavigate],
  );

  const [algoState, setAlgoState] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [stats, setStats] = useState({});
  const [position, setPosition] = useState('FLAT');
  const [price, setPrice] = useState(null);
  const [latency, setLatency] = useState(null);
  const [events, setEvents] = useState([]);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [stopping, setStopping] = useState(false);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null); // Session summary on stop
  const [duration, setDuration] = useState(0);

  const wsRef = useRef(null);
  const logRef = useRef(null);
  const durationRef = useRef(null);

  // Live duration counter
  useEffect(() => {
    if (!algoState?.startedAt) return;
    const tick = () => setDuration(Date.now() - algoState.startedAt);
    tick();
    durationRef.current = setInterval(tick, 1000);
    return () => clearInterval(durationRef.current);
  }, [algoState?.startedAt]);

  const handleWsMessage = useCallback((data) => {
    switch (data.type) {
      case 'algo.state':
        setAlgoState(data.payload || data);
        break;
      case 'algo.pnl':
        setPnl(data.payload?.pnl ?? data.pnl);
        break;
      case 'algo.stats':
        setStats((prev) => ({ ...prev, ...(data.payload || data) }));
        break;
      case 'algo.position':
        setPosition(data.payload?.position ?? data.position ?? 'FLAT');
        break;
      case 'algo.price':
        setPrice(data.payload?.price ?? null);
        setLatency(data.payload?.latency ?? null);
        break;
      case 'algo.event':
        setEvents((prev) => [...prev.slice(-499), data.payload || data]);
        break;
      case 'algo.summary':
        setSummary(data.payload || data);
        break;
      case 'algo.stopped':
        // Don't navigate away — show summary if available, else navigate
        if (!summary) {
          // Give 500ms for summary to arrive first
          setTimeout(() => {
            setStopping(false);
          }, 500);
        }
        break;
      default:
        break;
    }
  }, [summary]);

  // Auto-scroll smart logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events.length]);

  useEffect(() => {
    api.get('/algo/status')
      .then((data) => {
        const status = data.status || data;
        if (!status.running) {
          navigate('/algo');
          return;
        }
        setAlgoState({
          ...status,
          strategy: status.config?.strategyId || null,
          symbol: status.config?.symbol || null,
          startedAt: status.stats?.startTime || null,
          contracts: status.config?.size || null,
          dailyTarget: status.config?.dailyTarget || null,
          maxRisk: status.config?.maxRisk || null,
          accountName: status.config?.accountName || null,
          propfirm: status.config?.propfirm || null,
        });
        setPnl(status.stats?.totalPnl ?? null);
        setStats(status.stats || {});
        if (status.position?.side) {
          setPosition(status.position.side === 'long' ? 'LONG' : 'SHORT');
        } else {
          setPosition('FLAT');
        }
        setLoading(false);
      })
      .catch(() => {
        navigate('/algo');
      });

    const ws = new WsClient(handleWsMessage, setWsStatus);
    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.disconnect();
      if (durationRef.current) clearInterval(durationRef.current);
    };
  }, [handleWsMessage, navigate]);

  const handleStop = () => {
    setStopping(true);
    wsRef.current?.send('algo.stop');
    api.post('/algo/stop').catch(() => {});
  };

  const handleBackToSetup = () => {
    navigate('/algo');
  };

  const positionIcon = () => {
    switch (position) {
      case 'LONG': return <TrendingUp size={16} className="text-accent" />;
      case 'SHORT': return <TrendingDown size={16} className="text-pink" />;
      default: return <Minus size={16} className="text-text-muted" />;
    }
  };

  const positionColor = () => {
    switch (position) {
      case 'LONG': return 'text-accent';
      case 'SHORT': return 'text-pink';
      default: return 'text-text-muted';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="text-accent animate-spin" />
      </div>
    );
  }

  // Session summary screen (like CLI renderSessionSummary)
  if (summary) {
    const sumPnl = summary.pnl || 0;
    const reasonColor = summary.reason === 'target' ? 'text-accent' : summary.reason === 'risk' ? 'text-pink' : 'text-warning';
    const pnlColor = sumPnl >= 0 ? 'text-accent' : 'text-pink';
    const wrColor = (summary.wins || 0) >= (summary.losses || 0) ? 'text-accent' : 'text-pink';
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-1">Session Summary</h1>
          <p className="text-sm text-text-muted">{algoState?.strategy || 'Algo'} — {algoState?.symbol || 'N/A'}</p>
        </div>

        <div className="bg-bg-card border border-border-default rounded-lg overflow-hidden">
          {/* Summary grid — mirrors CLI 2-column layout */}
          <div className="grid grid-cols-2 divide-x divide-border-default">
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Stop Reason</p>
              <p className={`text-lg font-bold font-mono-nums ${reasonColor}`}>
                {(summary.reason || 'MANUAL').toUpperCase()}
              </p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Duration</p>
              <p className="text-lg font-bold font-mono-nums text-text-primary">
                {formatDuration(summary.duration)}
              </p>
            </div>
          </div>
          <div className="border-t border-border-default grid grid-cols-2 divide-x divide-border-default">
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Trades</p>
              <p className="text-lg font-bold font-mono-nums text-text-primary">
                {summary.trades || 0}
              </p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Win Rate</p>
              <p className={`text-lg font-bold font-mono-nums ${wrColor}`}>
                {summary.winRate != null ? `${summary.winRate.toFixed(1)}%` : 'N/A'}
              </p>
            </div>
          </div>
          <div className="border-t border-border-default grid grid-cols-2 divide-x divide-border-default">
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Wins / Losses</p>
              <p className="text-lg font-bold font-mono-nums text-text-primary">
                <span className="text-accent">{summary.wins || 0}</span>
                {' / '}
                <span className="text-pink">{summary.losses || 0}</span>
              </p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">P&L</p>
              <p className={`text-lg font-bold font-mono-nums ${pnlColor}`}>
                {formatCurrency(sumPnl)}
              </p>
            </div>
          </div>
          {summary.target && (
            <div className="border-t border-border-default p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Target</p>
              <p className="text-sm font-mono-nums text-text-primary">${summary.target}</p>
            </div>
          )}
        </div>

        <button
          onClick={handleBackToSetup}
          className="w-full bg-accent/10 hover:bg-accent/20 text-accent font-bold py-3 rounded-lg text-sm transition-colors border border-accent/20 cursor-pointer"
        >
          Back to Algo Setup
        </button>
      </div>
    );
  }

  const pnlVal = Number(pnl);
  const winRate = stats.trades > 0
    ? ((stats.wins || 0) / stats.trades * 100).toFixed(1)
    : stats.winRate != null ? Number(stats.winRate).toFixed(1) : null;

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header — Strategy name, symbol, position, WS status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-text-primary">
              {algoState?.strategy || 'Algo'} — {algoState?.symbol || 'N/A'}
            </h1>
            <div className="flex items-center gap-1">
              {positionIcon()}
              <span className={`text-sm font-mono-nums font-medium ${positionColor()}`}>
                {position}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
            <span className="flex items-center gap-1">
              <Wifi size={12} className={wsStatus === 'connected' ? 'text-accent' : 'text-pink'} />
              {wsStatus}
            </span>
            {algoState?.propfirm && (
              <span className="flex items-center gap-1">
                <Shield size={12} className="text-accent" />
                {algoState.propfirm}
              </span>
            )}
            {price != null && (
              <span className="flex items-center gap-1 font-mono-nums text-text-primary">
                <Activity size={12} className="text-accent" />
                {Number(price).toFixed(2)}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={handleStop}
          disabled={stopping}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-pink hover:bg-pink/90 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50 cursor-pointer"
        >
          {stopping ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Square size={18} />
          )}
          {stopping ? 'Stopping...' : 'STOP'}
        </button>
      </div>

      {/* Live P&L — large centered number */}
      <div className="bg-bg-card border border-border-default rounded-lg p-5 text-center">
        <p className="text-xs text-text-muted mb-1">Live P&L</p>
        <p
          className={`text-4xl sm:text-5xl font-bold font-mono-nums transition-colors ${
            pnl != null ? (pnlVal >= 0 ? 'text-profit' : 'text-loss') : 'text-text-dim'
          } ${pnl != null ? 'animate-pulse-glow' : ''}`}
        >
          {pnl != null ? formatCurrency(pnlVal) : 'N/A'}
        </p>
      </div>

      {/* Stats Grid — mirrors CLI 2-column layout exactly */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {/* Account */}
        <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">
          <User size={13} className="text-accent mx-auto mb-0.5" />
          <p className="text-[10px] text-text-muted mb-0.5">Account</p>
          <p className="text-xs font-medium text-text-primary truncate">
            {algoState?.accountName || 'N/A'}
          </p>
        </div>

        {/* Qty */}
        <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">
          <BarChart3 size={13} className="text-accent mx-auto mb-0.5" />
          <p className="text-[10px] text-text-muted mb-0.5">Qty</p>
          <p className="text-xs font-mono-nums font-medium text-text-primary">
            {algoState?.contracts ?? algoState?.config?.size ?? 'N/A'}
          </p>
        </div>

        {/* Target */}
        <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">
          <Target size={13} className="text-accent mx-auto mb-0.5" />
          <p className="text-[10px] text-text-muted mb-0.5">Target</p>
          <p className="text-xs font-mono-nums font-medium text-accent">
            {algoState?.dailyTarget != null ? `$${algoState.dailyTarget}` : 'N/A'}
          </p>
        </div>

        {/* Risk */}
        <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">
          <AlertTriangle size={13} className="text-pink mx-auto mb-0.5" />
          <p className="text-[10px] text-text-muted mb-0.5">Risk</p>
          <p className="text-xs font-mono-nums font-medium text-pink">
            {algoState?.maxRisk != null ? `$${algoState.maxRisk}` : 'N/A'}
          </p>
        </div>

        {/* Trades W/L */}
        <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-text-muted mb-0.5">Trades W/L</p>
          <p className="text-xs font-mono-nums font-medium text-text-primary">
            {stats.wins != null || stats.losses != null
              ? `${stats.wins || 0}W / ${stats.losses || 0}L`
              : stats.trades != null ? stats.trades : 'N/A'
            }
          </p>
        </div>

        {/* Win Rate */}
        <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">
          <p className="text-[10px] text-text-muted mb-0.5">Win Rate</p>
          <p className={`text-xs font-mono-nums font-medium ${
            winRate != null ? (Number(winRate) >= 50 ? 'text-accent' : 'text-pink') : 'text-text-dim'
          }`}>
            {winRate != null ? `${winRate}%` : 'N/A'}
          </p>
        </div>

        {/* Latency */}
        <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">
          <Zap size={13} className="text-warning mx-auto mb-0.5" />
          <p className="text-[10px] text-text-muted mb-0.5">Latency</p>
          <p className={`text-xs font-mono-nums font-medium ${latencyColor(latency ?? stats.latency)}`}>
            {(latency ?? stats.latency) != null ? `${latency ?? stats.latency}ms` : 'N/A'}
          </p>
        </div>

        {/* Position */}
        <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">
          {positionIcon()}
          <p className="text-[10px] text-text-muted mb-0.5">Position</p>
          <p className={`text-xs font-mono-nums font-medium ${positionColor()}`}>
            {position}
          </p>
        </div>

        {/* Duration */}
        <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">
          <Clock size={13} className="text-accent mx-auto mb-0.5" />
          <p className="text-[10px] text-text-muted mb-0.5">Duration</p>
          <p className="text-xs font-mono-nums font-medium text-text-primary">
            {formatDuration(duration)}
          </p>
        </div>

        {/* Connection */}
        <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">
          <DollarSign size={13} className="text-accent mx-auto mb-0.5" />
          <p className="text-[10px] text-text-muted mb-0.5">Connection</p>
          <p className="text-xs font-medium text-text-primary">Rithmic</p>
        </div>
      </div>

      {/* Smart Logs — terminal style, full width */}
      <div className="bg-[#0a0a18] border border-border-default rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-default bg-bg-card">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-text-primary">Execution Log</h3>
            <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono-nums text-text-dim">
              {events.length} events
            </span>
            <span className="text-[10px] text-text-dim">
              [STOP] to stop
            </span>
          </div>
        </div>
        <div
          ref={logRef}
          className="p-3 space-y-0.5 max-h-[520px] overflow-y-auto font-mono text-xs leading-relaxed"
        >
          {events.length === 0 ? (
            <p className="text-text-dim py-6 text-center">
              Awaiting market signals...
            </p>
          ) : (
            events.map((event, i) => {
              const tag = getLogTag(event);
              return (
                <div
                  key={event.id || i}
                  className="flex items-start gap-2 py-0.5 hover:bg-white/[0.02] rounded px-1 transition-colors"
                >
                  <span className="font-mono-nums text-text-dim shrink-0 tabular-nums">
                    {formatTime(event.timestamp)}
                  </span>
                  <span
                    className={`px-1.5 py-px rounded text-[10px] shrink-0 ${tag.color}`}
                  >
                    {tag.label}
                  </span>
                  <span className={`break-words ${getLogColor(event.message)}`}>
                    {event.message || 'N/A'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
