import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Bot,
  BarChart3,
  ClipboardList,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/algo', icon: Bot, label: 'Algo Trading' },
  { to: '/stats', icon: BarChart3, label: 'Stats' },
  { to: '/positions', icon: ClipboardList, label: 'Positions' },
];

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
          isActive
            ? 'bg-accent/10 text-accent border border-accent/20'
            : 'text-text-muted hover:text-text-primary hover:bg-bg-card-hover border border-transparent'
        }`
      }
    >
      <Icon size={18} />
      <span className="hidden lg:block">{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-16 lg:w-52 border-r border-border-default bg-bg-card p-3 gap-1 shrink-0">
        {navItems.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </aside>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-bg-card border-t border-border-default flex items-center justify-around px-2 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                isActive ? 'text-accent' : 'text-text-muted'
              }`
            }
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
