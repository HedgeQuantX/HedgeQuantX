import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Square, Clock, Zap, TrendingUp, TrendingDown, Minus,
  Target, BarChart3, Loader2, Wifi, Shield, DollarSign,
  AlertTriangle, Activity, User,
} from 'lucide-react';
import { WsClient, api } from '../api/client';
import { formatCurrency, formatTime } from '../utils/format';
import { getLogTag, getLogColor } from '../utils/log-types';

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
  const [summary, setSummary] = useState(null);
  const [duration, setDuration] = useState(0);

  const wsRef = useRef(null);
  const logRef = useRef(null);
  const durationRef = useRef(null);

  useEffect(() => {
    if (!algoState?.startedAt) return;
    const tick = () => setDuration(Date.now() - algoState.startedAt);
    tick();
    durationRef.current = setInterval(tick, 1000);
    return () => clearInterval(durationRef.current);
  }, [algoState?.startedAt]);

  const handleWsMessage = useCallback((data) => {
    try {
      switch (data.type) {
        case 'algo.state':   setAlgoState(data.payload || data); break;
        case 'algo.pnl':     setPnl(data.payload?.pnl ?? data.pnl); break;
        case 'algo.stats':   setStats((prev) => ({ ...prev, ...(data.payload || data) })); break;
        case 'algo.position': setPosition(data.payload?.position ?? data.position ?? 'FLAT'); break;
        case 'algo.price':
          setPrice(data.payload?.price ?? null);
          setLatency(data.payload?.latency ?? null);
          break;
        case 'algo.event': {
          const evt = data.payload || data;
          // Ensure event has at minimum a message string and timestamp
          const safeEvt = {
            ...evt,
            message: typeof evt.message === 'string' ? evt.message : (evt.message != null ? String(evt.message) : null),
            timestamp: evt.timestamp || Date.now(),
          };
          setEvents((prev) => [...prev.slice(-499), safeEvt]);
          break;
        }
        case 'algo.summary': setSummary(data.payload || data); break;
        case 'algo.stopped':
          setTimeout(() => setStopping(false), 500);
          break;
        default: break;
      }
    } catch (err) {
      console.error('[AlgoLive] WS message error:', err, data);
    }
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [events.length]);

  useEffect(() => {
    api.get('/algo/status')
      .then((data) => {
        const status = data.status || data;
        if (!status.running) { navigate('/algo'); return; }
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
        setPosition(status.position?.side ? (status.position.side === 'long' ? 'LONG' : 'SHORT') : 'FLAT');
        setLoading(false);
      })
      .catch(() => navigate('/algo'));

    const ws = new WsClient(handleWsMessage, setWsStatus);
    ws.connect();
    wsRef.current = ws;
    return () => { ws.disconnect(); if (durationRef.current) clearInterval(durationRef.current); };
  }, [handleWsMessage, navigate]);

  const handleStop = () => { setStopping(true); wsRef.current?.send('algo.stop'); api.post('/algo/stop').catch(() => {}); };

  const posIcon = () => {
    if (position === 'LONG') return <TrendingUp size={16} className="text-accent" />;
    if (position === 'SHORT') return <TrendingDown size={16} className="text-pink" />;
    return <Minus size={16} className="text-text-muted" />;
  };
  const posColor = position === 'LONG' ? 'text-accent' : position === 'SHORT' ? 'text-pink' : 'text-text-muted';

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="text-accent animate-spin" /></div>;

  // Session summary screen (like CLI renderSessionSummary)
  if (summary) {
    const sp = summary.pnl || 0;
    const rc = summary.reason === 'target' ? 'text-accent' : summary.reason === 'risk' ? 'text-pink' : 'text-warning';
    const pc = sp >= 0 ? 'text-accent' : 'text-pink';
    const wc = (summary.wins || 0) >= (summary.losses || 0) ? 'text-accent' : 'text-pink';
    return (
      <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-1">Session Summary</h1>
          <p className="text-sm text-text-muted">{algoState?.strategy || 'Algo'} — {algoState?.symbol || 'N/A'}</p>
        </div>
        <div className="bg-bg-card border border-border-default rounded-lg overflow-hidden">
          <div className="grid grid-cols-2 divide-x divide-border-default">
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Stop Reason</p>
              <p className={`text-lg font-bold font-mono-nums ${rc}`}>{(summary.reason || 'MANUAL').toUpperCase()}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Duration</p>
              <p className="text-lg font-bold font-mono-nums text-text-primary">{formatDuration(summary.duration)}</p>
            </div>
          </div>
          <div className="border-t border-border-default grid grid-cols-2 divide-x divide-border-default">
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Trades</p>
              <p className="text-lg font-bold font-mono-nums text-text-primary">{summary.trades || 0}</p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Win Rate</p>
              <p className={`text-lg font-bold font-mono-nums ${wc}`}>{summary.winRate != null ? `${summary.winRate.toFixed(1)}%` : 'N/A'}</p>
            </div>
          </div>
          <div className="border-t border-border-default grid grid-cols-2 divide-x divide-border-default">
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Wins / Losses</p>
              <p className="text-lg font-bold font-mono-nums text-text-primary">
                <span className="text-accent">{summary.wins || 0}</span>{' / '}<span className="text-pink">{summary.losses || 0}</span>
              </p>
            </div>
            <div className="p-4 text-center">
              <p className="text-xs text-text-muted mb-1">P&L</p>
              <p className={`text-lg font-bold font-mono-nums ${pc}`}>{formatCurrency(sp)}</p>
            </div>
          </div>
          {summary.target && (
            <div className="border-t border-border-default p-4 text-center">
              <p className="text-xs text-text-muted mb-1">Target</p>
              <p className="text-sm font-mono-nums text-text-primary">${summary.target}</p>
            </div>
          )}
        </div>
        <button onClick={() => navigate('/algo')} className="w-full bg-accent/10 hover:bg-accent/20 text-accent font-bold py-3 rounded-lg text-sm transition-colors border border-accent/20 cursor-pointer">
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-text-primary">{algoState?.strategy || 'Algo'} — {algoState?.symbol || 'N/A'}</h1>
            <div className="flex items-center gap-1">{posIcon()}<span className={`text-sm font-mono-nums font-medium ${posColor}`}>{position}</span></div>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
            <span className="flex items-center gap-1"><Wifi size={12} className={wsStatus === 'connected' ? 'text-accent' : 'text-pink'} />{wsStatus}</span>
            {algoState?.propfirm && <span className="flex items-center gap-1"><Shield size={12} className="text-accent" />{typeof algoState.propfirm === 'string' ? algoState.propfirm : algoState.propfirm?.name || 'N/A'}</span>}
            {price != null && <span className="flex items-center gap-1 font-mono-nums text-text-primary"><Activity size={12} className="text-accent" />{Number(price).toFixed(2)}</span>}
          </div>
        </div>
        <button onClick={handleStop} disabled={stopping} className="flex items-center justify-center gap-2 px-6 py-3 bg-pink hover:bg-pink/90 text-white font-bold rounded-lg text-sm transition-colors disabled:opacity-50 cursor-pointer">
          {stopping ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} />}
          {stopping ? 'Stopping...' : 'STOP'}
        </button>
      </div>

      {/* Live P&L */}
      <div className="bg-bg-card border border-border-default rounded-lg p-5 text-center">
        <p className="text-xs text-text-muted mb-1">Live P&L</p>
        <p className={`text-4xl sm:text-5xl font-bold font-mono-nums transition-colors ${pnl != null ? (pnlVal >= 0 ? 'text-profit' : 'text-loss') : 'text-text-dim'} ${pnl != null ? 'animate-pulse-glow' : ''}`}>
          {pnl != null ? formatCurrency(pnlVal) : 'N/A'}
        </p>
      </div>

      {/* Stats Grid — mirrors CLI layout */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <Stat icon={User} label="Account" value={algoState?.accountName || 'N/A'} truncate />
        <Stat icon={BarChart3} label="Qty" value={algoState?.contracts ?? 'N/A'} mono />
        <Stat icon={Target} label="Target" value={algoState?.dailyTarget != null ? `$${algoState.dailyTarget}` : 'N/A'} cls="text-accent" mono />
        <Stat icon={AlertTriangle} iconCls="text-pink" label="Risk" value={algoState?.maxRisk != null ? `$${algoState.maxRisk}` : 'N/A'} cls="text-pink" mono />
        <Stat label="Trades W/L" value={stats.wins != null || stats.losses != null ? `${stats.wins || 0}W / ${stats.losses || 0}L` : stats.trades != null ? stats.trades : 'N/A'} mono />
        <Stat label="Win Rate" value={winRate != null ? `${winRate}%` : 'N/A'} cls={winRate != null ? (Number(winRate) >= 50 ? 'text-accent' : 'text-pink') : 'text-text-dim'} mono />
        <Stat icon={Zap} iconCls="text-warning" label="Latency" value={(latency ?? stats.latency) != null ? `${latency ?? stats.latency}ms` : 'N/A'} cls={latencyColor(latency ?? stats.latency)} mono />
        <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">{posIcon()}<p className="text-[10px] text-text-muted mb-0.5">Position</p><p className={`text-xs font-mono-nums font-medium ${posColor}`}>{position}</p></div>
        <Stat icon={Clock} label="Duration" value={formatDuration(duration)} mono />
        <Stat icon={DollarSign} label="Connection" value="Rithmic" />
      </div>

      {/* Smart Logs */}
      <div className="bg-[#0a0a18] border border-border-default rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border-default bg-bg-card">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-text-primary">Execution Log</h3>
            <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
          </div>
          <span className="text-[10px] font-mono-nums text-text-dim">{events.length} events</span>
        </div>
        <div ref={logRef} className="p-3 space-y-0.5 max-h-[520px] overflow-y-auto font-mono text-xs leading-relaxed">
          {events.length === 0 ? (
            <p className="text-text-dim py-6 text-center">Awaiting market signals...</p>
          ) : events.map((event, i) => {
            const tag = getLogTag(event);
            return (
              <div key={event.id || i} className="flex items-start gap-2 py-0.5 hover:bg-white/[0.02] rounded px-1 transition-colors">
                <span className="font-mono-nums text-text-dim shrink-0 tabular-nums">{formatTime(event.timestamp)}</span>
                <span className={`px-1.5 py-px rounded text-[10px] shrink-0 ${tag.color}`}>{tag.label}</span>
                <span className={`break-words ${getLogColor(event.message)}`}>{event.message || 'N/A'}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, iconCls = 'text-accent', label, value, cls = 'text-text-primary', mono, truncate }) {
  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-2.5 text-center">
      {Icon && <Icon size={13} className={`${iconCls} mx-auto mb-0.5`} />}
      <p className="text-[10px] text-text-muted mb-0.5">{label}</p>
      <p className={`text-xs font-medium ${cls} ${mono ? 'font-mono-nums' : ''} ${truncate ? 'truncate' : ''}`}>{value}</p>
    </div>
  );
}
