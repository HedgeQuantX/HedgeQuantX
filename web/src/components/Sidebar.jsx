import { LayoutDashboard, Bot, BarChart3 } from 'lucide-react';

const TABS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'DASH' },
  { id: 'algo', icon: Bot, label: 'ALGO' },
  { id: 'stats', icon: BarChart3, label: 'STATS' },
];

export default function Sidebar({ activeTab, onTabChange }) {
  return (
    <div className="w-12 bg-bg-secondary border-r border-border-default flex flex-col items-center pt-2 gap-1 shrink-0">
      {TABS.map(({ id, icon: Icon, label }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={`
              relative w-10 h-10 flex flex-col items-center justify-center gap-0.5
              cursor-pointer transition-all duration-150
              ${active
                ? 'text-accent bg-accent-dim'
                : 'text-text-muted hover:text-text-secondary hover:bg-bg-card'
              }
            `}
          >
            {active && (
              <div className="absolute left-0 top-1 bottom-1 w-[2px] bg-accent" />
            )}
            <Icon size={14} strokeWidth={active ? 2.2 : 1.5} />
            <span className="text-[7px] font-semibold tracking-wider">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
