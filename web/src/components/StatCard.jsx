export default function StatCard({ label, value, icon: Icon, color = 'text-accent', mono = true }) {
  return (
    <div className="hfx-card p-3 animate-slide-up">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[8px] font-semibold text-text-muted tracking-wider">{label}</span>
        {Icon && <Icon size={12} className="text-text-dim" />}
      </div>
      <div className={`text-base font-bold ${color} ${mono ? 'mono' : ''} leading-none`}>
        {value}
      </div>
    </div>
  );
}
