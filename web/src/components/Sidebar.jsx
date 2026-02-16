import {
  LayoutDashboard,
  Bot,
  BarChart3,
} from 'lucide-react';

const navItems = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { id: 'algo', icon: Bot, label: 'Algo Trading' },
  { id: 'stats', icon: BarChart3, label: 'Stats' },
];

export default function Sidebar({ activeTab, onTabChange }) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-16 lg:w-52 border-r border-border-default bg-bg-card p-3 gap-1 shrink-0">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all cursor-pointer ${
              activeTab === item.id
                ? 'bg-accent/10 text-accent border border-accent/20'
                : 'text-text-muted hover:text-text-primary hover:bg-bg-card-hover border border-transparent'
            }`}
          >
            <item.icon size={18} />
            <span className="hidden lg:block">{item.label}</span>
          </button>
        ))}
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-card border-t border-border-default flex items-center justify-around px-2 py-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer ${
              activeTab === item.id ? 'text-accent' : 'text-text-muted'
            }`}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
