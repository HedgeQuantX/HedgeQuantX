import { useState, useEffect } from 'react';
import { BarChart3, Loader2, TrendingUp, Shield, Target, Zap, Award } from 'lucide-react';
import { api } from '../api/client';
import { formatCurrency, formatPercent } from '../utils/format';
import HQXScore from '../components/HQXScore';
import TradeTable from '../components/TradeTable';

export default function Stats() {
  const [data, setData] = useState(null);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      api.get('/stats/overview'),
      api.get('/stats/trades?limit=30'),
    ]).then(([overview, tradeData]) => {
      if (!mounted) return;
      if (overview.status === 'fulfilled') setData(overview.value);
      if (tradeData.status === 'fulfilled') setTrades(tradeData.value.trades || []);
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <Loader2 size={16} className="text-accent animate-spin" />
        <span className="text-[9px] text-text-muted">COMPUTING METRICS...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <BarChart3 size={14} className="text-accent" />
        <h1 className="text-sm font-bold">PERFORMANCE</h1>
        <span className="text-[9px] text-text-dim">/ ANALYTICS</span>
      </div>

      {/* HQX Score + Key Metrics */}
      <div className="grid grid-cols-12 gap-2">
        {/* HQX Score */}
        <div className="col-span-4 hfx-card p-4 flex flex-col items-center justify-center">
          {data?.hqxScore != null ? (
            <HQXScore score={data.hqxScore} grade={data.hqxGrade} breakdown={data.hqxBreakdown} />
          ) : (
            <div className="text-center">
              <div className="text-3xl font-bold text-text-dim mono">—</div>
              <div className="text-[8px] text-text-dim mt-1">NO DATA</div>
            </div>
          )}
        </div>

        {/* Metrics Grid */}
        <div className="col-span-8 grid grid-cols-3 gap-1.5">
          <Metric icon={TrendingUp} label="TOTAL P&L" value={formatCurrency(data?.totalPnl ?? 0)}
            color={(data?.totalPnl ?? 0) >= 0 ? 'text-profit' : 'text-loss'} />
          <Metric icon={Target} label="WIN RATE" value={data?.winRate ? formatPercent(data.winRate) : '—'}
            color="text-accent" />
          <Metric icon={Shield} label="PROFIT FACTOR" value={data?.profitFactor?.toFixed(2) ?? '—'}
            color="text-accent" />
          <Metric icon={Zap} label="SHARPE" value={data?.sharpe ?? '—'} color="text-warning" />
          <Metric icon={Zap} label="SORTINO" value={data?.sortino ?? '—'} color="text-warning" />
          <Metric icon={Shield} label="MAX DRAWDOWN"
            value={data?.maxDrawdown ? `${data.maxDrawdown.toFixed(1)}%` : '—'} color="text-loss" />
          <Metric icon={Award} label="EXPECTANCY" value={data?.expectancy ? formatCurrency(data.expectancy) : '—'}
            color="text-accent" />
          <Metric icon={TrendingUp} label="AVG WIN" value={data?.avgWin ? formatCurrency(data.avgWin) : '—'}
            color="text-profit" />
          <Metric icon={TrendingUp} label="AVG LOSS" value={data?.avgLoss ? formatCurrency(data.avgLoss) : '—'}
            color="text-loss" />
        </div>
      </div>

      {/* Trade Table */}
      <TradeTable trades={trades} title="TRADE HISTORY (30 DAYS)" />
    </div>
  );
}

function Metric({ icon: Icon, label, value, color }) {
  return (
    <div className="hfx-card p-2.5">
      <div className="flex items-center gap-1 mb-1">
        <Icon size={9} className="text-text-dim" />
        <span className="text-[7px] text-text-muted font-semibold tracking-wider">{label}</span>
      </div>
      <div className={`mono text-sm font-bold ${color} leading-none`}>{value}</div>
    </div>
  );
}
