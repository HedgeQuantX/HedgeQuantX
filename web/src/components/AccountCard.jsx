import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { formatBalance, formatCurrency, pnlColor } from '../utils/format';

function statusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'funded':
      return 'bg-accent-dim text-accent border-accent/20';
    case 'eval':
    case 'evaluation':
      return 'bg-warning/20 text-warning border-warning/20';
    case 'active':
      return 'bg-accent-dim text-accent border-accent/20';
    default:
      return 'bg-bg-card-hover text-text-muted border-border-default';
  }
}

export default function AccountCard({ account }) {
  const balance = Number(account.balance);
  const rawPnl = Number(account.pnl);
  const pnl = isNaN(rawPnl) ? 0 : rawPnl;
  const isPositive = pnl >= 0;

  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-4 hover:border-accent/20 transition-all animate-slide-up">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-accent-dim flex items-center justify-center">
            <Wallet size={16} className="text-accent" />
          </div>
          <div>
            <p className="text-sm font-medium text-text-primary truncate max-w-[140px]">
              {account.name || 'N/A'}
            </p>
            <p className="text-xs text-text-muted">{account.id || ''}</p>
          </div>
        </div>
        {account.status && (
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${statusBadge(account.status)}`}
          >
            {account.status}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <p className="text-xs text-text-muted mb-0.5">Balance</p>
          <p className="text-lg font-mono-nums font-semibold text-text-primary">
            {formatBalance(balance)}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {isPositive ? (
            <TrendingUp size={14} className="text-profit" />
          ) : (
            <TrendingDown size={14} className="text-loss" />
          )}
          <span className={`text-xs text-text-muted mr-1`}>Day P&L</span>
          <span className={`text-sm font-mono-nums font-medium ${pnlColor(pnl)}`}>
            {formatCurrency(pnl)}
          </span>
        </div>
      </div>
    </div>
  );
}
