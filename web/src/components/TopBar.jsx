import { LogOut, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatBalance } from '../utils/format';
import { LogoIcon } from './Logo';

export default function TopBar() {
  const { accounts, logout } = useAuth();

  const totalBalance = accounts.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);
  const isConnected = accounts.length > 0;

  return (
    <header className="h-14 border-b border-border-default bg-bg-card flex items-center justify-between px-4 lg:px-6 shrink-0">
      <div className="flex items-center gap-2">
        <LogoIcon size={28} className="text-accent" />
        <span className="hidden sm:block text-sm font-semibold text-gradient">
          HedgeQuant𝕏
        </span>
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
