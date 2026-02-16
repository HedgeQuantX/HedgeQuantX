import { formatCurrency, formatDate, formatNumber, pnlColor } from '../utils/format';

export default function TradeTable({ trades = [], title = 'Recent Trades' }) {
  if (!trades.length) {
    return (
      <div className="bg-bg-card border border-border-default rounded-lg p-4">
        <h3 className="text-sm font-medium text-text-primary mb-3">{title}</h3>
        <p className="text-text-muted text-xs">No trades to display</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-4 overflow-x-auto">
      <h3 className="text-sm font-medium text-text-primary mb-3">{title}</h3>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted border-b border-border-default">
            <th className="text-left py-2 px-2 font-medium">Symbol</th>
            <th className="text-left py-2 px-2 font-medium">Side</th>
            <th className="text-right py-2 px-2 font-medium">Qty</th>
            <th className="text-right py-2 px-2 font-medium">Entry</th>
            <th className="text-right py-2 px-2 font-medium">Exit</th>
            <th className="text-right py-2 px-2 font-medium">P&L</th>
            <th className="text-right py-2 px-2 font-medium">Date</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, i) => (
            <tr
              key={trade.id || i}
              className="border-b border-border-subtle hover:bg-bg-card-hover transition-colors"
            >
              <td className="py-2 px-2 font-mono-nums font-medium text-text-primary">
                {trade.symbol || '\u2014'}
              </td>
              <td className="py-2 px-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    !trade.side
                      ? 'bg-bg-card-hover text-text-muted'
                      : String(trade.side).toUpperCase() === 'LONG' || String(trade.side).toUpperCase() === 'BUY'
                        ? 'bg-accent-dim text-accent'
                        : 'bg-pink-dim text-pink'
                  }`}
                >
                  {trade.side || '\u2014'}
                </span>
              </td>
              <td className="py-2 px-2 text-right font-mono-nums">{trade.qty ?? 0}</td>
              <td className="py-2 px-2 text-right font-mono-nums">
                {formatNumber(trade.entry)}
              </td>
              <td className="py-2 px-2 text-right font-mono-nums">
                {formatNumber(trade.exit)}
              </td>
              <td className={`py-2 px-2 text-right font-mono-nums font-medium ${pnlColor(trade.pnl)}`}>
                {formatCurrency(trade.pnl)}
              </td>
              <td className="py-2 px-2 text-right text-text-muted">
                {formatDate(trade.date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
