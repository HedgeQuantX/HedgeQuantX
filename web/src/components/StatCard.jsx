export default function StatCard({ label, value, icon: Icon, color = 'text-accent', mono = false }) {
  return (
    <div className="bg-bg-card border border-border-default rounded-lg p-4 animate-slide-up">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-text-muted">{label}</p>
        {Icon && <Icon size={16} className={color} />}
      </div>
      <p className={`text-lg font-semibold ${color} ${mono ? 'font-mono-nums' : ''}`}>
        {value ?? '\u2014'}
      </p>
    </div>
  );
}
