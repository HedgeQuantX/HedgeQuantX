import { useState, useEffect, useRef, useCallback } from 'react';
import { Square, Activity, Zap, TrendingUp, Clock, AlertTriangle, Wifi } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { WsClient } from '../api/client';
import { formatCurrency } from '../utils/format';

const MAX_LOGS = 150;
const LOG_COLORS = {
  system: 'text-text-muted', connected: 'text-accent', ready: 'text-profit',
  signal: 'text-warning', trade: 'text-accent', fill_buy: 'text-profit',
  fill_sell: 'text-loss', fill_win: 'text-profit', fill_loss: 'text-loss',
  error: 'text-loss', risk: 'text-warning', analysis: 'text-text-secondary',
  warn: 'text-warning', smartlog: 'text-text-secondary', info: 'text-text-muted',
};

export default function AlgoLive({ onAlgoEnd, onNavigate }) {
  const { accounts } = useAuth();
  const [logs, setLogs] = useState([]);
  const [pnl, setPnl] = useState({ dayPnl: 0, openPnl: 0 });
  const [position, setPosition] = useState(null);
  const [price, setPrice] = useState(0);
  const [latency, setLatency] = useState(null);
  const [stats, setStats] = useState({ trades: 0, wins: 0, losses: 0, winRate: 0 });
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [algoState, setAlgoState] = useState(null);
  const [stopping, setStopping] = useState(false);
  const logRef = useRef(null);
  const wsRef = useRef(null);
  const autoScroll = useRef(true);

  const addLog = useCallback((entry) => {
    setLogs((prev) => {
      const next = [...prev, { ...entry, ts: entry.timestamp || Date.now() }];
      return next.length > MAX_LOGS ? next.slice(-MAX_LOGS) : next;
    });
  }, []);

  useEffect(() => {
    const ws = new WsClient((msg) => {
      switch (msg.type) {
        case 'algo.event':
          addLog(msg.payload || msg);
          break;
        case 'algo.replay':
          if (msg.events) msg.events.forEach(addLog);
          break;
        case 'algo.pnl':
          setPnl({ dayPnl: msg.pnl ?? msg.payload?.dayPnl ?? 0, openPnl: msg.payload?.openPnl ?? 0 });
          break;
        case 'algo.price':
          setPrice(msg.payload?.price || 0);
          if (msg.payload?.latency) setLatency(msg.payload.latency);
          break;
        case 'algo.position':
          setPosition(msg.payload || null);
          break;
        case 'algo.state':
          setAlgoState(msg.payload || null);
          break;
        case 'algo.stats':
          setStats((s) => ({ ...s, ...msg.payload }));
          break;
        case 'algo.stopped':
          addLog({ level: 'system', message: `ALGO STOPPED — ${msg.payload?.reason || 'MANUAL'}` });
          break;
      }
    }, setWsStatus);
    ws.connect();
    wsRef.current = ws;
    return () => ws.disconnect();
  }, [addLog]);

  useEffect(() => {
    if (autoScroll.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const handleStop = async () => {
    setStopping(true);
    try {
      await api.post('/algo/stop');
      setTimeout(() => onAlgoEnd?.(), 2000);
    } catch {}
    setStopping(false);
  };

  const strat = algoState?.strategy || '—';
  const symbol = algoState?.symbol || '—';

  return (
    <div className="h-full flex flex-col gap-2 animate-fade-in">
      {/* Header Bar */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Activity size={14} className="text-profit animate-pulse-live" />
          <span className="text-sm font-bold text-text-primary">LIVE TRADING</span>
          <span className="text-[9px] text-text-dim">{strat} / {symbol}</span>
        </div>
        <button onClick={handleStop} disabled={stopping}
          className="btn-danger flex items-center gap-1.5 py-1.5 px-4 cursor-pointer">
          <Square size={10} /> {stopping ? 'STOPPING...' : 'KILL'}
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-6 gap-1.5 shrink-0">
        <MetricCell label="P&L" value={formatCurrency(pnl.dayPnl)} color={pnl.dayPnl >= 0 ? 'text-profit' : 'text-loss'} />
        <MetricCell label="OPEN P&L" value={formatCurrency(pnl.openPnl)} color={pnl.openPnl >= 0 ? 'text-profit' : 'text-loss'} />
        <MetricCell label="POSITION" value={position?.side?.toUpperCase() || 'FLAT'}
          color={position?.side === 'long' ? 'text-profit' : position?.side === 'short' ? 'text-loss' : 'text-text-muted'} />
        <MetricCell label="LAST PRICE" value={price ? price.toFixed(2) : '—'} color="text-accent" />
        <MetricCell label="TRADES" value={`${stats.trades} (${stats.wins}W/${stats.losses}L)`} color="text-text-secondary" />
        <MetricCell label="LATENCY" value={latency != null ? `${latency}ms` : '—'}
          color={latency && latency < 100 ? 'text-profit' : latency && latency < 500 ? 'text-warning' : 'text-text-muted'} />
      </div>

      {/* Log Stream */}
      <div className="flex-1 min-h-0 hfx-card flex flex-col">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border-default">
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-semibold text-text-muted tracking-wider">EVENT STREAM</span>
            <span className={`led ${wsStatus === 'connected' ? 'led-green animate-pulse-live' : 'led-red'}`} />
          </div>
          <span className="mono text-[8px] text-text-dim">{logs.length} EVENTS</span>
        </div>
        <div ref={logRef}
          className="flex-1 overflow-auto p-2 font-mono text-[10px] leading-[1.6]"
          onScroll={(e) => {
            const el = e.target;
            autoScroll.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}>
          {logs.map((log, i) => {
            const ts = new Date(log.ts).toISOString().slice(11, 23);
            const lvl = log.level || log.kind || 'info';
            const color = LOG_COLORS[lvl] || 'text-text-muted';
            return (
              <div key={i} className="flex gap-2 hover:bg-bg-card-hover px-1">
                <span className="text-text-dim shrink-0">{ts}</span>
                <span className={`shrink-0 w-12 text-right font-semibold ${color}`}>
                  {lvl.slice(0, 6).toUpperCase()}
                </span>
                <span className={color}>{log.message}</span>
              </div>
            );
          })}
          {logs.length === 0 && (
            <div className="text-text-dim text-center pt-8 text-[9px]">
              WAITING FOR MARKET DATA...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value, color }) {
  return (
    <div className="hfx-card p-2">
      <div className="text-[7px] text-text-muted font-semibold tracking-wider mb-0.5">{label}</div>
      <div className={`mono text-[11px] font-bold ${color} leading-none truncate`}>{value}</div>
    </div>
  );
}
