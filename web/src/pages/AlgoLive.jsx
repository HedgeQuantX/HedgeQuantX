import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Square, Clock, Zap, TrendingUp, TrendingDown, Minus, Copy, Check,
  Target, BarChart3, Loader2, Wifi, Shield, DollarSign,
  AlertTriangle, Activity, User,
} from 'lucide-react';
import { WsClient, api } from '../api/client';
import { formatCurrency, formatTime, pnlColor } from '../utils/format';
import { getLogTag, getLogColor } from '../utils/log-types';

// Tick-size-aware price formatting per instrument
const TICK_DECIMALS = {
  ES: 2, MES: 2, NQ: 2, MNQ: 2, YM: 0, MYM: 0,
  RTY: 2, M2K: 2, CL: 2, GC: 2, SI: 3, NG: 3,
  ZB: 5, ZN: 6, ZF: 7,
};

function formatPrice(price, symbol) {
  if (price == null || isNaN(price)) return '0.00';
  const base = (symbol || '').replace(/[FGHJKMNQUVXZ]\d{1,2}$/i, '').toUpperCase();
  const decimals = TICK_DECIMALS[base] ?? 2;
  return Number(price).toFixed(decimals);
}

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

export default function AlgoLive({ onNavigate, onAlgoEnd }) {
  const navigate = useCallback(
    (path) => {
      if (path === '/algo') {
        // Algo not running / stopped → signal parent to switch back to AlgoSetup
        onAlgoEnd?.();
      } else {
        onNavigate?.(path === '/algo' ? 'algo' : 'dashboard');
      }
    },
    [onNavigate, onAlgoEnd],
  );

  const [algoState, setAlgoState] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [openPnl, setOpenPnl] = useState(null);
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
  const [copied, setCopied] = useState(false);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);

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
        case 'algo.pnl':
          setPnl(data.payload?.dayPnl ?? data.payload?.pnl ?? data.pnl ?? data.dayPnl ?? 0);
          setOpenPnl(data.payload?.openPnl ?? data.openPnl ?? 0);
          break;
        case 'pnl':
          setPnl(data.dayPnl ?? data.pnl ?? 0);
          setOpenPnl(data.openPnl ?? 0);
          break;
        case 'algo.stats':   setStats((prev) => ({ ...prev, ...(data.payload || data) })); break;
        case 'algo.position': setPosition(data.payload?.position ?? data.position ?? 'FLAT'); break;
        case 'algo.price':
          setPrice(data.payload?.price ?? null);
          setLatency(data.payload?.latency ?? null);
          break;
        case 'algo.replay': {
          // Server sends full log buffer on WS connect — REPLACE events, don't append
          const replayEvents = (data.events || [])
            .filter((e) => e.level !== 'debug' && e.kind !== 'debug' && !(typeof e.message === 'string' && e.message.startsWith('[DBG]')))
            .map((e) => ({
              ...e,
              message: typeof e.message === 'string' ? e.message : (e.message != null ? String(e.message) : ''),
              timestamp: e.timestamp || Date.now(),
            }));
          setEvents(replayEvents);
          break;
        }
        case 'algo.event': {
          const evt = data.payload || data;
          // Filter out debug/DBG logs from frontend display
          if (evt.level === 'debug' || evt.kind === 'debug') break;
          if (typeof evt.message === 'string' && evt.message.startsWith('[DBG]')) break;
          const safeEvt = {
            ...evt,
            message: typeof evt.message === 'string' ? evt.message : (evt.message != null ? String(evt.message) : ''),
            timestamp: evt.timestamp || Date.now(),
          };
          setEvents((prev) => [...prev.slice(-499), safeEvt]);
          break;
        }
        case 'algo.summary': setSummary(data.payload || data); break;
        case 'algo.stopped':
          setTimeout(() => setStopping(false), 500);
          break;
        // Real-time positions & orders via WebSocket (replaces HTTP polling)
        case 'positions':
          setPositions(data.positions || []);
          break;
        case 'orders':
          setOrders(data.orders || []);
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

  // Positions & orders now streamed via WebSocket (type: 'positions' / 'orders')
  // No HTTP polling needed — real-time updates from Rithmic positionUpdate events

  const handleStop = () => { setStopping(true); wsRef.current?.send('algo.stop'); api.post('/algo/stop').catch(() => {}); };

  const handleCopyLogs = () => {
    const text = events.map((e) => {
      const t = formatTime(e.timestamp);
      const tag = getLogTag(e).label;
      return `${t} [${tag}] ${e.message || ''}`;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const posIcon = () => {
    if (position === 'LONG') return <TrendingUp size={16} className="text-accent" />;
    if (position === 'SHORT') return <TrendingDown size={16} className="text-pink" />;
    return <Minus size={16} className="text-text-muted" />;
  };
  const posColor = position === 'LONG' ? 'text-accent' : position === 'SHORT' ? 'text-pink' : 'text-text-muted';

  if (loading) return <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-3"><Loader2 size={24} className="text-accent animate-spin" /><p className="text-sm text-text-muted">Loading algo live...</p></div>;

  // Session summary screen
  if (summary) return <SummaryScreen summary={summary} algoState={algoState} navigate={navigate} />;

  const sym = algoState?.symbol || '';
  const openPnlVal = Number(openPnl) || 0;
  const pnlVal = Number(pnl) || 0;
  const winRate = stats.trades > 0
    ? ((stats.wins || 0) / stats.trades * 100).toFixed(1)
    : stats.winRate != null ? Number(stats.winRate).toFixed(1) : '0.0';

  return (
    <div className="flex flex-col h-full animate-fade-in" style={{ minHeight: 0 }}>
      {/* Header — fixed height, never scrolls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0 mb-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl text-text-primary">{algoState?.strategy || 'Algo'} — {sym || '...'}</h1>
            <div className="flex items-center gap-1">{posIcon()}<span className={`text-sm font-mono-nums ${posColor}`}>{position}</span></div>
          </div>
          <div className="flex items-center gap-3 text-xs text-text-muted flex-wrap">
            <span className="flex items-center gap-1"><Wifi size={12} className={wsStatus === 'connected' ? 'text-accent' : 'text-pink'} />{wsStatus}</span>
            {algoState?.propfirm && <span className="flex items-center gap-1"><Shield size={12} className="text-accent" />{typeof algoState.propfirm === 'string' ? algoState.propfirm : algoState.propfirm?.name || ''}</span>}
            {price != null && <span className="flex items-center gap-1 font-mono-nums text-text-primary"><Activity size={12} className="text-accent" />{formatPrice(price, sym)}</span>}
          </div>
        </div>
        <button onClick={handleStop} disabled={stopping} className="flex items-center justify-center gap-2 px-6 py-3 bg-pink hover:bg-pink/90 text-white rounded-lg text-sm transition-colors disabled:opacity-50 cursor-pointer shrink-0">
          {stopping ? <Loader2 size={18} className="animate-spin" /> : <Square size={18} />}
          {stopping ? 'Stopping...' : 'STOP'}
        </button>
      </div>

      {/* === TWO COLUMNS: Metrics LEFT | Logs RIGHT — fills remaining height === */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-3 flex-1 min-h-0">

        {/* LEFT COLUMN — Metrics (scrollable if needed on small screens) */}
        <div className="space-y-3 overflow-y-auto min-h-0">
          {/* Live P&L — unrealized (openPnl) as main number, session P&L secondary */}
          <div className="bg-bg-card border border-border-default rounded-lg p-5 text-center">
            <p className="text-xs text-text-muted mb-1">Live P&L</p>
            <p className={`text-4xl font-mono-nums transition-colors ${openPnlVal >= 0 ? 'text-profit' : 'text-loss'} animate-pulse-glow`}>
              {formatCurrency(openPnlVal)}
            </p>
          </div>

          {/* Stats Grid — uniform cards: icon + label + value — NO N/A */}
          <div className="grid grid-cols-2 gap-2">
            <Stat icon={User} label="Account" value={algoState?.accountName || '...'} truncate />
            <Stat icon={BarChart3} label="Qty" value={algoState?.contracts ?? 1} mono />
            <Stat icon={Target} label="Target" value={`$${algoState?.dailyTarget || 0}`} cls="text-accent" mono />
            <Stat icon={AlertTriangle} iconCls="text-pink" label="Risk" value={`$${algoState?.maxRisk || 0}`} cls="text-pink" mono />
            <Stat icon={Activity} label="Trades W/L" value={`${stats.wins || 0}W / ${stats.losses || 0}L`} mono />
            <Stat icon={Target} iconCls="text-warning" label="Win Rate" value={`${winRate}%`} cls={Number(winRate) >= 50 ? 'text-accent' : 'text-pink'} mono />
            <Stat icon={Zap} iconCls="text-warning" label="Latency" value={`${latency ?? stats.latency ?? 0}ms`} cls={latencyColor(latency ?? stats.latency)} mono />
            <Stat icon={position === 'LONG' ? TrendingUp : position === 'SHORT' ? TrendingDown : Minus} iconCls={posColor} label="Position" value={position} cls={posColor} mono />
            <Stat icon={Clock} label="Duration" value={formatDuration(duration)} mono />
            <Stat icon={DollarSign} label="Connection" value="Rithmic" />
          </div>

          {/* Open Positions */}
          <div className="bg-bg-card border border-border-default rounded-lg p-3">
            <h3 className="text-[10px] text-text-muted mb-2">
              Open Positions {positions.length > 0 && `(${positions.length})`}
            </h3>
            {positions.length === 0 ? (
              <p className="text-text-dim text-[10px]">No open positions</p>
            ) : (
              <div className="space-y-1.5">
                {positions.map((pos, i) => (
                  <div key={pos.id || i} className="flex items-center justify-between text-[11px] py-1 border-b border-border-subtle last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-nums text-text-primary">{pos.symbol || sym}</span>
                      <span className={`px-1 py-px rounded text-[9px] ${pos.side?.toUpperCase() === 'LONG' || pos.side?.toUpperCase() === 'BUY' ? 'bg-accent-dim text-accent' : 'bg-pink-dim text-pink'}`}>
                        {pos.side || 'FLAT'}
                      </span>
                      <span className="font-mono-nums text-text-muted">{pos.size ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-nums text-text-muted">{formatPrice(pos.entry, pos.symbol || sym)}</span>
                      <span className={`font-mono-nums ${pnlColor(pos.pnl)}`}>{formatCurrency(pos.pnl ?? 0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active Orders */}
          {orders.length > 0 && (
            <div className="bg-bg-card border border-border-default rounded-lg p-3">
              <h3 className="text-[10px] text-text-muted mb-2">
                Active Orders ({orders.length})
              </h3>
              <div className="space-y-1.5">
                {orders.map((order, i) => (
                  <div key={order.id || i} className="flex items-center justify-between text-[11px] py-1 border-b border-border-subtle last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-nums text-text-primary">{order.symbol || sym}</span>
                      <span className={`px-1 py-px rounded text-[9px] ${order.side?.toUpperCase() === 'BUY' ? 'bg-accent-dim text-accent' : 'bg-pink-dim text-pink'}`}>
                        {order.side || 'MKT'}
                      </span>
                      <span className="text-text-muted">{order.type || 'LMT'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono-nums text-text-muted">{order.qty ?? 0}</span>
                      <span className="font-mono-nums text-text-primary">{formatPrice(order.price, order.symbol || sym)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — Execution Logs: fixed container, scrolls internally */}
        <div className="bg-[#0a0a18] border border-border-default rounded-lg overflow-hidden flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-border-default bg-bg-card shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm text-text-primary">Execution Log</h3>
              <span className="inline-block w-2 h-2 rounded-full bg-accent animate-pulse" />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono-nums text-text-dim">{events.length} events</span>
              <button
                onClick={handleCopyLogs}
                className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent transition-colors cursor-pointer"
                title="Copy all logs"
              >
                {copied ? <Check size={12} className="text-accent" /> : <Copy size={12} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <div ref={logRef} className="p-2 overflow-y-auto font-mono text-[11px] leading-[1.7] flex-1 min-h-0">
            {events.length === 0 ? (
              <p className="text-text-dim py-6 text-center">Awaiting market signals...</p>
            ) : events.map((event, i) => {
              const tag = getLogTag(event);
              return (
                <div key={event.id || i} className="flex items-baseline gap-0 hover:bg-white/[0.02] rounded px-1">
                  <span className="font-mono-nums text-text-dim shrink-0 w-[62px]">{formatTime(event.timestamp)}</span>
                  <span className={`inline-block w-[52px] shrink-0 text-center px-1 py-px rounded text-[10px] ${tag.color}`}>{tag.label}</span>
                  <span className={`ml-2 break-words min-w-0 ${getLogColor(event.message)}`}>{event.message || ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, iconCls = 'text-accent', label, value, cls = 'text-text-primary', mono, truncate }) {
  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-3 flex flex-col items-center justify-center h-[72px]">
      <Icon size={14} className={`${iconCls} mb-1`} />
      <p className="text-[10px] text-text-muted leading-none mb-1">{label}</p>
      <p className={`text-xs leading-none ${cls} ${mono ? 'font-mono-nums' : ''} ${truncate ? 'truncate max-w-full' : ''}`}>{value}</p>
    </div>
  );
}

function SummaryScreen({ summary, algoState, navigate }) {
  const sp = summary.pnl || 0;
  const rc = summary.reason === 'target' ? 'text-accent' : summary.reason === 'risk' ? 'text-pink' : 'text-warning';
  const pc = sp >= 0 ? 'text-accent' : 'text-pink';
  const wc = (summary.wins || 0) >= (summary.losses || 0) ? 'text-accent' : 'text-pink';
  return (
    <div className="space-y-6 animate-fade-in max-w-2xl mx-auto">
      <div className="text-center">
        <h1 className="text-2xl text-text-primary mb-1">Session Summary</h1>
        <p className="text-sm text-text-muted">{algoState?.strategy || 'Algo'} — {algoState?.symbol || '...'}</p>
      </div>
      <div className="bg-bg-card border border-border-default rounded-lg overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-border-default">
          <div className="p-4 text-center">
            <p className="text-xs text-text-muted mb-1">Stop Reason</p>
            <p className={`text-lg font-mono-nums ${rc}`}>{(summary.reason || 'MANUAL').toUpperCase()}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-text-muted mb-1">Duration</p>
            <p className="text-lg font-mono-nums text-text-primary">{formatDuration(summary.duration)}</p>
          </div>
        </div>
        <div className="border-t border-border-default grid grid-cols-2 divide-x divide-border-default">
          <div className="p-4 text-center">
            <p className="text-xs text-text-muted mb-1">Trades</p>
            <p className="text-lg font-mono-nums text-text-primary">{summary.trades || 0}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-text-muted mb-1">Win Rate</p>
            <p className={`text-lg font-mono-nums ${wc}`}>{`${(summary.winRate ?? 0).toFixed(1)}%`}</p>
          </div>
        </div>
        <div className="border-t border-border-default grid grid-cols-2 divide-x divide-border-default">
          <div className="p-4 text-center">
            <p className="text-xs text-text-muted mb-1">Wins / Losses</p>
            <p className="text-lg font-mono-nums text-text-primary">
              <span className="text-accent">{summary.wins || 0}</span>{' / '}<span className="text-pink">{summary.losses || 0}</span>
            </p>
          </div>
          <div className="p-4 text-center">
            <p className="text-xs text-text-muted mb-1">P&L</p>
            <p className={`text-lg font-mono-nums ${pc}`}>{formatCurrency(sp)}</p>
          </div>
        </div>
        {summary.target && (
          <div className="border-t border-border-default p-4 text-center">
            <p className="text-xs text-text-muted mb-1">Target</p>
            <p className="text-sm font-mono-nums text-text-primary">${summary.target}</p>
          </div>
        )}
      </div>
      <button onClick={() => navigate('/algo')} className="w-full bg-accent/10 hover:bg-accent/20 text-accent py-3 rounded-lg text-sm transition-colors border border-accent/20 cursor-pointer">
        Back to Algo Setup
      </button>
    </div>
  );
}
