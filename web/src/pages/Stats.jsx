import { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp, Target, BarChart3,
  Loader2,
} from 'lucide-react';
import { api } from '../api/client';
import StatCard from '../components/StatCard';
import TradeTable from '../components/TradeTable';
import HQXScore from '../components/HQXScore';
import { formatCurrency, formatBalance, formatPercent, formatNumber } from '../utils/format';

export default function Stats() {
  const [stats, setStats] = useState(null);
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const results = await Promise.allSettled([
        api.get('/stats/overview'),
        api.get('/stats/trades'),
      ]);
      if (!mounted) return;
      if (results[0].status === 'fulfilled') setStats(results[0].value);
      if (results[1].status === 'fulfilled') setTrades(results[1].value.trades || results[1].value || []);
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

      {/* HQX Score */}
      <HQXScore score={stats?.hqxScore} grade={stats?.hqxGrade} />

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
