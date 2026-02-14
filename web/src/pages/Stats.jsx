import { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, Target, BarChart3,
  Activity, ArrowDownRight, Loader2,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { api } from '../api/client';
import StatCard from '../components/StatCard';
import TradeTable from '../components/TradeTable';
import HQXScore from '../components/HQXScore';
import { formatCurrency, formatBalance, formatPercent, formatNumber } from '../utils/format';

function EquityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-border-default rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm font-mono-nums text-accent font-semibold">
        {formatBalance(payload[0].value)}
      </p>
    </div>
  );
}

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [equity, setEquity] = useState([]);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const results = await Promise.allSettled([
        api.get('/stats/overview'),
        api.get('/stats/equity'),
        api.get('/stats/trades'),
      ]);
      if (!mounted) return;
      if (results[0].status === 'fulfilled') setStats(results[0].value);
      if (results[1].status === 'fulfilled') setEquity(results[1].value.data || results[1].value || []);
      if (results[2].status === 'fulfilled') setTrades(results[2].value.trades || results[2].value || []);
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Statistics</h1>
        <p className="text-sm text-text-muted mt-0.5">Performance analytics & metrics</p>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Balance"
          value={stats?.totalBalance != null ? formatBalance(stats.totalBalance) : 'N/A'}
          icon={DollarSign}
          color="text-text-primary"
          mono
        />
        <StatCard
          label="Total P&L"
          value={stats?.totalPnl != null ? formatCurrency(stats.totalPnl) : 'N/A'}
          icon={TrendingUp}
          color={stats?.totalPnl >= 0 ? 'text-profit' : 'text-loss'}
          mono
        />
        <StatCard
          label="Win Rate"
          value={stats?.winRate != null ? formatPercent(stats.winRate) : 'N/A'}
          icon={Target}
          color="text-accent"
          mono
        />
        <StatCard
          label="Profit Factor"
          value={stats?.profitFactor != null ? formatNumber(stats.profitFactor) : 'N/A'}
          icon={BarChart3}
          color="text-accent"
          mono
        />
      </div>

      {/* Equity Curve + HQX Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-bg-card border border-border-default rounded-lg p-4">
          <h3 className="text-sm font-medium text-text-primary mb-3">Equity Curve</h3>
          {equity.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={equity}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00e5ff" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#00e5ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a35" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#8888aa', fontSize: 10 }}
                  axisLine={{ stroke: '#1a1a35' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#8888aa', fontSize: 10 }}
                  axisLine={{ stroke: '#1a1a35' }}
                  tickLine={false}
                  width={70}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<EquityTooltip />} />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#00e5ff"
                  strokeWidth={2}
                  fill="url(#eqGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64">
              <p className="text-text-muted text-sm">No equity data available</p>
            </div>
          )}
        </div>

        <HQXScore score={stats?.hqxScore} grade={stats?.hqxGrade} />
      </div>

      {/* Performance Metrics */}
      <div>
        <h3 className="text-sm font-medium text-text-muted mb-3">Performance Metrics</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-bg-card border border-border-default rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">Sharpe</p>
            <p className="text-sm font-mono-nums font-medium text-text-primary">
              {stats?.sharpe != null ? formatNumber(stats.sharpe) : 'N/A'}
            </p>
          </div>
          <div className="bg-bg-card border border-border-default rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">Sortino</p>
            <p className="text-sm font-mono-nums font-medium text-text-primary">
              {stats?.sortino != null ? formatNumber(stats.sortino) : 'N/A'}
            </p>
          </div>
          <div className="bg-bg-card border border-border-default rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">Max Drawdown</p>
            <p className="text-sm font-mono-nums font-medium text-pink">
              {stats?.maxDrawdown != null ? formatCurrency(stats.maxDrawdown) : 'N/A'}
            </p>
          </div>
          <div className="bg-bg-card border border-border-default rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">Calmar</p>
            <p className="text-sm font-mono-nums font-medium text-text-primary">
              {stats?.calmar != null ? formatNumber(stats.calmar) : 'N/A'}
            </p>
          </div>
          <div className="bg-bg-card border border-border-default rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">Expectancy</p>
            <p className="text-sm font-mono-nums font-medium text-text-primary">
              {stats?.expectancy != null ? formatCurrency(stats.expectancy) : 'N/A'}
            </p>
          </div>
          <div className="bg-bg-card border border-border-default rounded-lg p-3">
            <p className="text-xs text-text-muted mb-1">Total Trades</p>
            <p className="text-sm font-mono-nums font-medium text-text-primary">
              {stats?.totalTrades ?? 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Recent Trades */}
      <TradeTable trades={trades} title="Recent Trades" />
    </div>
  );
}
