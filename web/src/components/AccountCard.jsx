import { Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { formatBalance, formatCurrency, pnlColor } from '../utils/format';

export default function AccountCard({ account }) {
  const pnl = account.pnl || 0;
  const balance = account.balance || account.cashOnHand || 0;
  const name = account.accountName || account.name || account.accountId || '—';

  return (
    <div className="hfx-card hfx-card-hover p-3 animate-slide-up">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Wallet size={11} className="text-accent" />
          <span className="text-[10px] font-bold text-text-primary">{name}</span>
        </div>
        <span className="led led-green" />
      </div>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[8px] text-text-muted mb-0.5">BALANCE</div>
          <div className="mono text-sm font-bold text-text-primary">{formatBalance(balance)}</div>
        </div>
        <div className="text-right">
          <div className="text-[8px] text-text-muted mb-0.5">DAY P&L</div>
          <div className={`mono text-sm font-bold ${pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
            {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
          </div>
        </div>
      </div>
    </div>
  );
}
