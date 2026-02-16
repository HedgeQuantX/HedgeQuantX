import { useState, useEffect } from 'react';
import { TrendingUp, Target, Activity, ArrowUpRight, Loader2, Server, Wifi } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import AccountCard from '../components/AccountCard';
import StatCard from '../components/StatCard';
import { formatCurrency, formatPercent } from '../utils/format';
import { PROPFIRMS } from '../utils/constants';

export default function Dashboard() {
  const { accounts, fetchAccounts, propfirm } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [statsData] = await Promise.allSettled([
          api.get('/stats/summary'),
          fetchAccounts(),
        ]);
        if (mounted && statsData.status === 'fulfilled') {
          setStats(statsData.value);
        }
      } catch {
        // stats unavailable
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, [fetchAccounts]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Loader2 size={24} className="text-accent animate-spin" />
        <p className="text-sm text-text-muted">Loading dashboard...</p>
      </div>
    );
  }

  const firmInfo = PROPFIRMS.find((f) => f.id === propfirm);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Dashboard</h1>
          <p className="text-sm text-text-muted mt-0.5">Account overview & performance</p>
        </div>
        {firmInfo && (
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-accent-dim border border-accent/20">
            <Server size={14} className="text-accent" />
            <span className="text-sm text-accent font-semibold">{firmInfo.name}</span>
            <Wifi size={12} className="text-accent/60" />
          </div>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total P&L"
          value={formatCurrency(stats?.totalPnl ?? 0)}
          icon={TrendingUp}
          color={(stats?.totalPnl ?? 0) >= 0 ? 'text-profit' : 'text-loss'}
          mono
        />
        <StatCard
          label="Win Rate"
          value={stats?.winRate != null ? formatPercent(stats.winRate) : '0.0%'}
          icon={Target}
          color="text-accent"
          mono
        />
        <StatCard
          label="Trades Today"
          value={stats?.tradesToday ?? 0}
          icon={Activity}
          color="text-text-primary"
          mono
        />
        <StatCard
          label="Best / Worst"
          value={`${formatCurrency(stats?.bestTrade ?? 0)} / ${formatCurrency(stats?.worstTrade ?? 0)}`}
          icon={ArrowUpRight}
          color="text-warning"
          mono
        />
      </div>

      {/* Accounts Grid */}
      <div>
        <h2 className="text-sm font-medium text-text-muted mb-3">
          Accounts {accounts.length > 0 && `(${accounts.length})`}
        </h2>
        {accounts.length === 0 ? (
          <div className="bg-bg-card border border-border-default rounded-lg p-8 text-center">
            <p className="text-text-muted text-sm">No accounts found</p>
            <p className="text-text-dim text-xs mt-1">Connect a prop firm to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {accounts.map((account) => (
              <AccountCard key={account.id || account.name} account={account} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
