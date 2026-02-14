import { LogOut, Wifi, WifiOff, Server } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatBalance } from '../utils/format';
import { PROPFIRMS } from '../utils/constants';

export default function TopBar() {
  const { propfirm, accounts, logout } = useAuth();

  const firmInfo = PROPFIRMS.find((f) => f.id === propfirm);
  const totalBalance = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
  const isConnected = accounts.length > 0;

  return (
    <header className="h-14 border-b border-border-default bg-bg-card flex items-center justify-between px-4 lg:px-6 shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
            <span className="text-accent font-bold text-sm font-mono-nums">HQX</span>
          </div>
          <span className="hidden sm:block text-sm font-semibold text-gradient">
            HedgeQuantX
          </span>
        </div>

        {firmInfo && (
          <div className="hidden md:flex items-center gap-2 ml-4 px-3 py-1 rounded-full bg-accent-dim border border-accent/20">
            <Server size={12} className="text-accent" />
            <span className="text-xs text-accent font-medium">{firmInfo.name}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {isConnected && (
          <>
            <div className="hidden sm:flex items-center gap-2">
              <Wifi size={14} className="text-accent" />
              <span className="text-xs text-text-muted">
                {accounts.length} account{accounts.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="text-sm font-mono-nums font-semibold text-text-primary">
              {formatBalance(totalBalance)}
            </div>
          </>
        )}

        {!isConnected && (
          <div className="flex items-center gap-2">
            <WifiOff size={14} className="text-text-dim" />
            <span className="text-xs text-text-muted">No accounts</span>
          </div>
        )}

        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-pink border border-border-default rounded-lg hover:border-pink/30 transition-colors cursor-pointer"
        >
          <LogOut size={14} />
          <span className="hidden sm:block">Disconnect</span>
        </button>
      </div>
    </header>
  );
}
