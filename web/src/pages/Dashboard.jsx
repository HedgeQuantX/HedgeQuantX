import { useState, useEffect } from 'react';
import { TrendingUp, Target, Activity, ArrowUpRight, Loader2, Cpu, Wifi, Clock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import AccountCard from '../components/AccountCard';
import StatCard from '../components/StatCard';
import { formatCurrency, formatPercent } from '../utils/format';

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
        if (mounted && statsData.status === 'fulfilled') setStats(statsData.value);
      } catch {}
      finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; };
  }, [fetchAccounts]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Loader2 size={20} className="text-accent animate-spin" />
        <span className="text-[9px] text-text-muted">INITIALIZING DASHBOARD...</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu size={14} className="text-accent" />
          <h1 className="text-sm font-bold text-text-primary">DASHBOARD</h1>
          <span className="text-[9px] text-text-dim">/ OVERVIEW</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="led led-green animate-pulse-live" />
            <span className="text-[8px] text-text-muted">{accounts.length} ACCOUNTS</span>
          </div>
        </div>
      </div>

      {/* Quick Metrics */}
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="DAY P&L" value={formatCurrency(stats?.totalPnl ?? 0)}
          icon={TrendingUp} color={(stats?.totalPnl ?? 0) >= 0 ? 'text-profit' : 'text-loss'} />
        <StatCard label="WIN RATE" value={stats?.winRate != null ? formatPercent(stats.winRate) : '—'}
          icon={Target} color="text-accent" />
        <StatCard label="TRADES TODAY" value={stats?.tradesToday ?? 0}
          icon={Activity} color="text-text-primary" />
        <StatCard label="BEST / WORST"
          value={`${formatCurrency(stats?.bestTrade ?? 0)} / ${formatCurrency(stats?.worstTrade ?? 0)}`}
          icon={ArrowUpRight} color="text-warning" />
      </div>

      {/* Accounts */}
      <div>
        <div className="section-label">TRADING ACCOUNTS</div>
        {accounts.length === 0 ? (
          <div className="hfx-card p-6 text-center">
            <span className="text-[9px] text-text-dim">NO ACCOUNTS — CONNECT A PROP FIRM</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {accounts.map((a) => <AccountCard key={a.id || a.name} account={a} />)}
          </div>
        )}
      </div>

      {/* System Status */}
      <div>
        <div className="section-label">SYSTEM STATUS</div>
        <div className="hfx-card p-3 grid grid-cols-4 gap-4">
          {[
            { label: 'RITHMIC', status: 'CONNECTED', led: 'led-green' },
            { label: 'ORDER PLANT', status: 'ACTIVE', led: 'led-green' },
            { label: 'PNL PLANT', status: 'STREAMING', led: 'led-green' },
            { label: 'TICKER PLANT', status: 'STANDBY', led: 'led-yellow' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className={`led ${s.led}`} />
              <div>
                <div className="text-[9px] font-bold text-text-secondary">{s.label}</div>
                <div className="text-[8px] text-text-muted">{s.status}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
