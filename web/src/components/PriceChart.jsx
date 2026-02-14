import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-border-default rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-sm font-mono-nums text-accent font-semibold">
        {payload[0].value?.toFixed(2)}
      </p>
    </div>
  );
}

export default function PriceChart({ data = [], dataKey = 'price', labelKey = 'time' }) {
  if (!data.length) {
    return (
      <div className="bg-bg-card border border-border-default rounded-lg p-6 flex items-center justify-center h-64">
        <p className="text-text-muted text-sm">No chart data available</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-4">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a35" />
          <XAxis
            dataKey={labelKey}
            tick={{ fill: '#8888aa', fontSize: 10 }}
            axisLine={{ stroke: '#1a1a35' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#8888aa', fontSize: 10 }}
            axisLine={{ stroke: '#1a1a35' }}
            tickLine={false}
            domain={['auto', 'auto']}
            width={60}
            tickFormatter={(v) => v?.toFixed(1)}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke="#00e5ff"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#00e5ff', stroke: '#060610', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
