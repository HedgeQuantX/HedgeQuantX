import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Square, Activity, Clock, Zap, TrendingUp, TrendingDown, Minus,
  Target, BarChart3, Loader2, Wifi,
} from 'lucide-react';
import { WsClient, api } from '../api/client';
import PriceChart from '../components/PriceChart';
import ExecutionLog from '../components/ExecutionLog';
import { formatCurrency, formatPercent, formatTime } from '../utils/format';

export default function AlgoLive({ onNavigate }) {
  const navigate = useCallback(
    (path) => onNavigate?.(path === '/algo' ? 'algo' : 'dashboard'),
    [onNavigate],
  );

  const [algoState, setAlgoState] = useState(null);
  const [pnl, setPnl] = useState(null);
  const [stats, setStats] = useState({});
  const [position, setPosition] = useState('FLAT');
  const [events, setEvents] = useState([]);
  const [prices, setPrices] = useState([]);
  const [wsStatus, setWsStatus] = useState('disconnected');
  const [stopping, setStopping] = useState(false);
  const [loading, setLoading] = useState(true);

  const wsRef = useRef(null);

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
      case 'algo.event':
        setEvents((prev) => [...prev.slice(-199), data.payload || data]);
        break;
      case 'algo.price':
        setPrices((prev) => {
          const next = [...prev, {
            time: formatTime(data.payload?.timestamp || Date.now()),
            price: data.payload?.price ?? data.price,
          }];
          return next.slice(-100);
        });
        break;
      case 'algo.stopped':
        navigate('/algo');
        break;
      default:
        break;
    }
  }, [navigate]);

  useEffect(() => {
    // Check if algo is running
    api.get('/algo/status')
      .then((data) => {
        if (!data.running) {
          navigate('/algo');
          return;
        }
        setAlgoState(data);
        setPnl(data.pnl ?? null);
        setStats(data.stats || {});
        setPosition(data.position || 'FLAT');
        setLoading(false);
      })
      .catch(() => {
        navigate('/algo');
      });

    // Connect WebSocket
    const ws = new WsClient(handleWsMessage, setWsStatus);
    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.disconnect();
    };
  }, [handleWsMessage, navigate]);

  const handleStop = () => {
    setStopping(true);
    wsRef.current?.send('algo.stop');
    // Also try REST fallback
    api.post('/algo/stop').catch(() => {});
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

  const pnlVal = Number(pnl);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
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
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Wifi size={12} className={wsStatus === 'connected' ? 'text-accent' : 'text-pink'} />
              {wsStatus}
            </span>
            {algoState?.startedAt && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                Started {formatTime(algoState.startedAt)}
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

      {/* Live P&L */}
      <div className="bg-bg-card border border-border-default rounded-lg p-6 text-center">
        <p className="text-xs text-text-muted mb-1">Live P&L</p>
        <p
          className={`text-4xl sm:text-5xl font-bold font-mono-nums transition-colors ${
            pnl != null ? (pnlVal >= 0 ? 'text-profit' : 'text-loss') : 'text-text-dim'
          } ${pnl != null ? 'animate-pulse-glow' : ''}`}
        >
          {pnl != null ? formatCurrency(pnlVal) : 'N/A'}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-bg-card border border-border-default rounded-lg p-3 text-center">
          <p className="text-xs text-text-muted mb-1">Trades</p>
          <p className="text-sm font-mono-nums font-medium text-text-primary">
            {stats.wins != null && stats.losses != null
              ? `${stats.wins}W / ${stats.losses}L`
              : stats.trades ?? 'N/A'
            }
          </p>
        </div>
        <div className="bg-bg-card border border-border-default rounded-lg p-3 text-center">
          <Target size={14} className="text-accent mx-auto mb-1" />
          <p className="text-xs text-text-muted mb-1">Win Rate</p>
          <p className="text-sm font-mono-nums font-medium text-text-primary">
            {stats.winRate != null ? formatPercent(stats.winRate) : 'N/A'}
          </p>
        </div>
        <div className="bg-bg-card border border-border-default rounded-lg p-3 text-center">
          <Zap size={14} className="text-warning mx-auto mb-1" />
          <p className="text-xs text-text-muted mb-1">Latency</p>
          <p className="text-sm font-mono-nums font-medium text-text-primary">
            {stats.latency != null ? `${stats.latency}ms` : 'N/A'}
          </p>
        </div>
        <div className="bg-bg-card border border-border-default rounded-lg p-3 text-center">
          {positionIcon()}
          <p className="text-xs text-text-muted mb-1">Position</p>
          <p className={`text-sm font-mono-nums font-medium ${positionColor()}`}>
            {position}
          </p>
        </div>
        <div className="bg-bg-card border border-border-default rounded-lg p-3 text-center">
          <Clock size={14} className="text-accent mx-auto mb-1" />
          <p className="text-xs text-text-muted mb-1">Duration</p>
          <p className="text-sm font-mono-nums font-medium text-text-primary">
            {stats.duration ?? 'N/A'}
          </p>
        </div>
        <div className="bg-bg-card border border-border-default rounded-lg p-3 text-center">
          <BarChart3 size={14} className="text-accent mx-auto mb-1" />
          <p className="text-xs text-text-muted mb-1">Contracts</p>
          <p className="text-sm font-mono-nums font-medium text-text-primary">
            {stats.contracts ?? algoState?.contracts ?? 'N/A'}
          </p>
        </div>
      </div>

      {/* Chart + Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-medium text-text-primary mb-2">Price</h3>
          <PriceChart data={prices} />
        </div>
        <ExecutionLog events={events} />
      </div>
    </div>
  );
}
