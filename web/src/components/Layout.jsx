import TopBar from './TopBar';
import Sidebar from './Sidebar';

export default function Layout({ activeTab, onTabChange, wsStatus, children }) {
  return (
    <div className="h-full flex flex-col scanline">
      <TopBar wsStatus={wsStatus} />
      <div className="flex flex-1 min-h-0">
        <Sidebar activeTab={activeTab} onTabChange={onTabChange} />
        <main className="flex-1 min-w-0 overflow-auto p-3 bg-bg-primary">
          {children}
        </main>
      </div>
    </div>
  );
}
