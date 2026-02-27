import { formatCurrency, formatDate, pnlColor } from '../utils/format';

export default function TradeTable({ trades = [], title = 'RECENT TRADES' }) {
  return (
    <div className="hfx-card">
      <div className="section-label px-3 pt-2 mb-0 border-b-0">{title}</div>
      <div className="overflow-auto max-h-[300px]">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border-default text-text-muted">
              <th className="text-left px-3 py-1.5 font-semibold">SYMBOL</th>
              <th className="text-left px-2 py-1.5 font-semibold">SIDE</th>
              <th className="text-right px-2 py-1.5 font-semibold">ENTRY</th>
              <th className="text-right px-2 py-1.5 font-semibold">EXIT</th>
              <th className="text-right px-3 py-1.5 font-semibold">P&L</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-6 text-text-dim text-[9px]">NO TRADES YET</td></tr>
            ) : trades.map((t, i) => (
              <tr key={t.id || i} className="border-b border-border-default/50 hover:bg-bg-card-hover transition-colors">
                <td className="px-3 py-1.5 mono font-medium">{t.symbol || '—'}</td>
                <td className={`px-2 py-1.5 font-bold ${t.side === 'LONG' ? 'text-profit' : 'text-loss'}`}>
                  {t.side || '—'}
                </td>
                <td className="px-2 py-1.5 mono text-right text-text-secondary">{t.entry || '—'}</td>
                <td className="px-2 py-1.5 mono text-right text-text-secondary">{t.exit || '—'}</td>
                <td className={`px-3 py-1.5 mono text-right font-bold ${(t.pnl || 0) >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {t.pnl != null ? formatCurrency(t.pnl) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
