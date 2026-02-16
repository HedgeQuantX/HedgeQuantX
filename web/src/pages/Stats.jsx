/**
 * Stats Page — Full performance analytics
 *
 * Sections:
 * 1. Overview cards (balance, P&L, win rate, profit factor)
 * 2. Equity curve (SVG line chart)
 * 3. HQX Score radar (spider chart + breakdown)
 * 4. Performance metrics grid
 * 5. P&L Calendar heatmap
 * 6. Recent trades table
 *
 * ALL DATA FROM RITHMIC API — NO MOCK DATA — NO N/A
 */

import { useState, useEffect, useMemo } from 'react';
import {
  DollarSign, TrendingUp, Target, BarChart3,
  Loader2, Calendar as CalendarIcon, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { api } from '../api/client';
import StatCard from '../components/StatCard';
import TradeTable from '../components/TradeTable';
import HQXScore from '../components/HQXScore';
import { formatCurrency, formatBalance, formatPercent, formatNumber, pnlColor } from '../utils/format';

// ---------------------------------------------------------------------------
// Equity Curve — lightweight SVG
// ---------------------------------------------------------------------------
function EquityCurve({ data }) {
  if (!data || data.length < 2) {
    return (
      <div className="bg-bg-card border border-border-default rounded-lg p-5">
        <h3 className="text-sm font-medium text-text-primary mb-3">Equity Curve</h3>
        <div className="h-[200px] flex items-center justify-center">
          <p className="text-text-dim text-xs">Not enough data to display</p>
        </div>
      </div>
    );
  }

  const W = 600, H = 200, PX = 40, PY = 20;
  const values = data.map((d) => d.equity);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const range = maxV - minV || 1;

  const toX = (i) => PX + ((W - 2 * PX) * i) / (data.length - 1);
  const toY = (v) => PY + (H - 2 * PY) * (1 - (v - minV) / range);

  const linePts = data.map((d, i) => `${toX(i)},${toY(d.equity)}`).join(' ');
  const areaPts = `${toX(0)},${H - PY} ${linePts} ${toX(data.length - 1)},${H - PY}`;
  const lastVal = values[values.length - 1];
  const firstVal = values[0];
  const isPositive = lastVal >= firstVal;
  const lineColor = isPositive ? '#00e5ff' : '#d4006a';

  // Y-axis labels (4 ticks)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    value: minV + range * pct,
    y: toY(minV + range * pct),
  }));

  // X-axis labels — sample ~5 dates
  const step = Math.max(1, Math.floor(data.length / 5));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-5">
      <h3 className="text-sm font-medium text-text-primary mb-3">Equity Curve</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={PX} y1={t.y} x2={W - PX} y2={t.y} stroke="#1a1a35" strokeWidth="0.5" />
            <text x={PX - 4} y={t.y + 3} textAnchor="end" fill="#555" fontSize="8" fontFamily="JetBrains Mono, monospace">
              {t.value >= 1000 ? `${(t.value / 1000).toFixed(0)}k` : t.value.toFixed(0)}
            </text>
          </g>
        ))}
        {/* Area fill */}
        <polygon points={areaPts} fill={`${lineColor}10`} />
        {/* Line */}
        <polyline points={linePts} fill="none" stroke={lineColor} strokeWidth="1.5" strokeLinejoin="round" />
        {/* Endpoint dot */}
        <circle cx={toX(data.length - 1)} cy={toY(lastVal)} r="3" fill={lineColor} />
        {/* X labels */}
        {xLabels.map((d, i) => {
          const idx = data.indexOf(d);
          return (
            <text key={i} x={toX(idx)} y={H - 4} textAnchor="middle" fill="#555" fontSize="7" fontFamily="JetBrains Mono, monospace">
              {d.date}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// P&L Calendar Heatmap
// ---------------------------------------------------------------------------
function PnLCalendar({ data }) {
  const [monthOffset, setMonthOffset] = useState(0);

  const now = new Date();
  const viewDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Build a map of date → pnl
  const pnlMap = useMemo(() => {
    const map = {};
    for (const d of (data || [])) { map[d.date] = d; }
    return map;
  }, [data]);

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ day: d, ...pnlMap[dateStr] });
  }

  function cellColor(pnl) {
    if (pnl == null || pnl === 0) return 'bg-[#1a1a35]/50';
    if (pnl > 0) return pnl > 200 ? 'bg-[#00e5ff]/30' : 'bg-[#00e5ff]/15';
    return pnl < -200 ? 'bg-[#d4006a]/30' : 'bg-[#d4006a]/15';
  }

  function cellText(pnl) {
    if (pnl == null || pnl === 0) return '';
    return pnl > 0 ? `+${pnl.toFixed(0)}` : pnl.toFixed(0);
  }

  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
          <CalendarIcon size={14} className="text-accent" />
          P&L Calendar
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonthOffset((p) => p - 1)} className="text-text-muted hover:text-accent cursor-pointer p-1">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs text-text-muted font-medium min-w-[120px] text-center">{monthName}</span>
          <button onClick={() => setMonthOffset((p) => Math.min(p + 1, 0))} disabled={monthOffset >= 0} className="text-text-muted hover:text-accent cursor-pointer p-1 disabled:opacity-30">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-[9px] text-text-dim text-center">{d}</div>
        ))}
      </div>

      {/* Calendar cells */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => (
          <div
            key={i}
            className={`aspect-square rounded flex flex-col items-center justify-center ${cell ? cellColor(cell.pnl) : ''}`}
            title={cell?.pnl != null ? `${cell.day}: $${cell.pnl.toFixed(2)} (${cell.trades} trades)` : ''}
          >
            {cell && (
              <>
                <span className="text-[9px] text-text-dim leading-none">{cell.day}</span>
                {cell.pnl != null && cell.pnl !== 0 && (
                  <span className={`text-[8px] font-mono-nums leading-none mt-0.5 ${cell.pnl > 0 ? 'text-accent' : 'text-pink'}`}>
                    {cellText(cell.pnl)}
                  </span>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Stats Page
// ---------------------------------------------------------------------------
export default function Stats() {
  const [stats, setStats] = useState(null);
  const [trades, setTrades] = useState([]);
  const [equity, setEquity] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const results = await Promise.allSettled([
        api.get('/stats/overview'),
        api.get('/stats/trades'),
        api.get('/stats/equity'),
        api.get('/stats/calendar'),
      ]);
      if (!mounted) return;
      if (results[0].status === 'fulfilled') setStats(results[0].value);
      if (results[1].status === 'fulfilled') setTrades(results[1].value.trades || results[1].value || []);
      if (results[2].status === 'fulfilled') setEquity(results[2].value.data || []);
      if (results[3].status === 'fulfilled') setCalendar(results[3].value.data || []);
      setLoading(false);
    }
    load();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-3">
        <Loader2 size={24} className="text-accent animate-spin" />
        <p className="text-sm text-text-muted">Loading stats...</p>
      </div>
    );
  }

  const s = stats || {};
  const wr = s.winRate != null ? Number(s.winRate) : 0;
  const pf = s.profitFactor != null ? Number(s.profitFactor) : 0;
  const hasTrades = (s.totalTrades ?? 0) > 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Statistics</h1>
        <p className="text-sm text-text-muted mt-0.5">Performance analytics & metrics</p>
      </div>

      {/* Overview Cards — NO N/A */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Balance"
          value={formatBalance(s.totalBalance ?? 0)}
          icon={DollarSign}
          color="text-text-primary"
          mono
        />
        <StatCard
          label="Total P&L"
          value={formatCurrency(s.totalPnl ?? 0)}
          icon={TrendingUp}
          color={(s.totalPnl ?? 0) >= 0 ? 'text-profit' : 'text-loss'}
          mono
        />
        <StatCard
          label="Win Rate"
          value={formatPercent(wr)}
          icon={Target}
          color="text-accent"
          mono
        />
        <StatCard
          label="Profit Factor"
          value={!isNaN(pf) && pf > 0 ? formatNumber(pf) : '0.00'}
          icon={BarChart3}
          color="text-accent"
          mono
        />
      </div>

      {/* Equity Curve */}
      <EquityCurve data={equity} />

      {/* HQX Score Radar + Performance Metrics — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-5">
        <HQXScore score={hasTrades ? s.hqxScore : null} grade={hasTrades ? s.hqxGrade : null} breakdown={hasTrades ? s.hqxBreakdown : null} />

        {/* Performance Metrics */}
        <div className="bg-bg-card border border-border-default rounded-lg p-5">
          <h3 className="text-sm font-medium text-text-primary mb-4">Performance Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MetricCell label="Sharpe" value={formatNumber(s.sharpe ?? 0)} />
            <MetricCell label="Sortino" value={formatNumber(s.sortino ?? 0)} />
            <MetricCell label="Max Drawdown" value={s.maxDrawdown ? `${formatNumber(s.maxDrawdown)}%` : '0.00%'} cls="text-pink" />
            <MetricCell label="Calmar" value={formatNumber(s.calmar ?? 0)} />
            <MetricCell label="Expectancy" value={formatCurrency(s.expectancy ?? 0)} cls={pnlColor(s.expectancy)} />
            <MetricCell label="Total Trades" value={s.totalTrades ?? 0} />
            <MetricCell label="Avg Win" value={formatCurrency(s.avgWin ?? 0)} cls="text-accent" />
            <MetricCell label="Avg Loss" value={formatCurrency(-(s.avgLoss ?? 0))} cls="text-pink" />
            <MetricCell label="Best Trade" value={formatCurrency(s.bestTrade ?? 0)} cls="text-accent" />
            <MetricCell label="Worst Trade" value={formatCurrency(s.worstTrade ?? 0)} cls="text-pink" />
            <MetricCell label="Win Streak" value={s.hqxBreakdown?.[2]?.score != null ? `${Math.round(s.hqxBreakdown[2].score)}` : '0'} />
            <MetricCell label="Loss Streak" value={s.hqxBreakdown?.[3]?.score != null ? `${Math.round(100 - s.hqxBreakdown[3].score)}` : '0'} cls="text-pink" />
          </div>
        </div>
      </div>

      {/* P&L Calendar */}
      <PnLCalendar data={calendar} />

      {/* Recent Trades */}
      <TradeTable trades={trades} title={`Recent Trades${trades.length > 0 ? ` (${trades.length})` : ''}`} />
    </div>
  );
}

function MetricCell({ label, value, cls = 'text-text-primary' }) {
  return (
    <div>
      <p className="text-[10px] text-text-muted mb-0.5">{label}</p>
      <p className={`text-sm font-mono-nums font-medium ${cls}`}>{value}</p>
    </div>
  );
}
