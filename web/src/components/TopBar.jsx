import { useState, useEffect } from 'react';
import { LogOut, Wifi, WifiOff, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { LogoIcon } from './Logo';

export default function TopBar({ wsStatus }) {
  const { user, propfirm, accounts, logout } = useAuth();
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(d.toISOString().slice(11, 19) + ' UTC');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const totalPnl = accounts.reduce((sum, a) => sum + (a.pnl || 0), 0);
  const isLive = wsStatus === 'connected';

  return (
    <div className="h-9 bg-bg-secondary border-b border-border-default flex items-center px-3 gap-3 shrink-0 select-none">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <LogoIcon size={18} className="text-accent" />
        <span className="text-[10px] font-bold tracking-[0.25em] text-accent">HQX</span>
      </div>

      <div className="w-px h-4 bg-border-default" />

      {/* Connection */}
      <div className="flex items-center gap-1.5">
        <span className={`led ${isLive ? 'led-green animate-pulse-live' : 'led-red'}`} />
        <span className="text-[9px] text-text-muted">{isLive ? 'LIVE' : 'OFFLINE'}</span>
      </div>

      {/* Propfirm */}
      {propfirm && (
        <>
          <div className="w-px h-4 bg-border-default" />
          <div className="flex items-center gap-1.5">
            <Zap size={10} className="text-warning" />
            <span className="text-[9px] text-text-secondary font-semibold">{propfirm}</span>
          </div>
        </>
      )}

      <div className="flex-1" />

      {/* P&L */}
      <div className="flex items-center gap-1.5 px-2 py-0.5 bg-bg-primary border border-border-default">
        <span className="text-[8px] text-text-muted">P&L</span>
        <span className={`mono text-[11px] font-bold ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
          {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
        </span>
      </div>

      {/* Clock */}
      <div className="mono text-[10px] text-text-muted">{clock}</div>

      <div className="w-px h-4 bg-border-default" />

      {/* User */}
      <span className="text-[9px] text-text-muted">{user?.username || user?.userName || '—'}</span>

      <button
        onClick={logout}
        className="p-1 text-text-muted hover:text-loss transition-colors cursor-pointer"
        title="Logout"
      >
        <LogOut size={12} />
      </button>
    </div>
  );
}
