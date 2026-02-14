import { useState, useEffect } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { api } from '../api/client';
import { formatCurrency, formatNumber, pnlColor } from '../utils/format';

export default function Positions() {
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const results = await Promise.allSettled([
        api.get('/trading/positions'),
        api.get('/trading/orders'),
      ]);
      if (results[0].status === 'fulfilled') {
        setPositions(results[0].value.positions || results[0].value || []);
      }
      if (results[1].status === 'fulfilled') {
        setOrders(results[1].value.orders || results[1].value || []);
      }
    } catch {
      // data unavailable
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-text-primary">Positions & Orders</h1>
          <p className="text-sm text-text-muted mt-0.5">Active positions and pending orders</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-text-muted hover:text-accent border border-border-default rounded-lg hover:border-accent/30 transition-colors cursor-pointer"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Open Positions */}
      <div className="bg-bg-card border border-border-default rounded-lg p-4 overflow-x-auto">
        <h3 className="text-sm font-medium text-text-primary mb-3">
          Open Positions {positions.length > 0 && `(${positions.length})`}
        </h3>
        {positions.length === 0 ? (
          <p className="text-text-muted text-xs">No open positions</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted border-b border-border-default">
                <th className="text-left py-2 px-2 font-medium">Symbol</th>
                <th className="text-left py-2 px-2 font-medium">Side</th>
                <th className="text-right py-2 px-2 font-medium">Size</th>
                <th className="text-right py-2 px-2 font-medium">Entry</th>
                <th className="text-right py-2 px-2 font-medium">P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos, i) => (
                <tr
                  key={pos.id || i}
                  className="border-b border-border-subtle hover:bg-bg-card-hover transition-colors"
                >
                  <td className="py-2 px-2 font-mono-nums font-medium text-text-primary">
                    {pos.symbol || 'N/A'}
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        pos.side?.toUpperCase() === 'LONG' || pos.side?.toUpperCase() === 'BUY'
                          ? 'bg-accent-dim text-accent'
                          : 'bg-pink-dim text-pink'
                      }`}
                    >
                      {pos.side || 'N/A'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono-nums">
                    {pos.size ?? pos.qty ?? 'N/A'}
                  </td>
                  <td className="py-2 px-2 text-right font-mono-nums">
                    {formatNumber(pos.entry)}
                  </td>
                  <td className={`py-2 px-2 text-right font-mono-nums font-medium ${pnlColor(pos.pnl)}`}>
                    {formatCurrency(pos.pnl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Active Orders */}
      <div className="bg-bg-card border border-border-default rounded-lg p-4 overflow-x-auto">
        <h3 className="text-sm font-medium text-text-primary mb-3">
          Active Orders {orders.length > 0 && `(${orders.length})`}
        </h3>
        {orders.length === 0 ? (
          <p className="text-text-muted text-xs">No active orders</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text-muted border-b border-border-default">
                <th className="text-left py-2 px-2 font-medium">Symbol</th>
                <th className="text-left py-2 px-2 font-medium">Side</th>
                <th className="text-left py-2 px-2 font-medium">Type</th>
                <th className="text-right py-2 px-2 font-medium">Qty</th>
                <th className="text-right py-2 px-2 font-medium">Price</th>
                <th className="text-right py-2 px-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, i) => (
                <tr
                  key={order.id || i}
                  className="border-b border-border-subtle hover:bg-bg-card-hover transition-colors"
                >
                  <td className="py-2 px-2 font-mono-nums font-medium text-text-primary">
                    {order.symbol || 'N/A'}
                  </td>
                  <td className="py-2 px-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        order.side?.toUpperCase() === 'BUY'
                          ? 'bg-accent-dim text-accent'
                          : 'bg-pink-dim text-pink'
                      }`}
                    >
                      {order.side || 'N/A'}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-text-muted uppercase">
                    {order.type || 'N/A'}
                  </td>
                  <td className="py-2 px-2 text-right font-mono-nums">
                    {order.qty ?? 'N/A'}
                  </td>
                  <td className="py-2 px-2 text-right font-mono-nums">
                    {formatNumber(order.price)}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        order.status?.toLowerCase() === 'filled'
                          ? 'bg-accent-dim text-accent'
                          : order.status?.toLowerCase() === 'cancelled' || order.status?.toLowerCase() === 'rejected'
                          ? 'bg-pink-dim text-pink'
                          : 'bg-warning-dim text-warning'
                      }`}
                    >
                      {order.status || 'N/A'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
