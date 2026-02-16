import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginModal from './components/LoginModal';
import Dashboard from './pages/Dashboard';
import AlgoSetup from './pages/AlgoSetup';
import AlgoLive from './pages/AlgoLive';
import Stats from './pages/Stats';
import { Loader2 } from 'lucide-react';
import { LogoIcon } from './components/Logo';

const TABS = {
  dashboard: Dashboard,
  algo: AlgoSetup,
  'algo-live': AlgoLive,
  stats: Stats,
};

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showLogin, setShowLogin] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <Loader2 size={28} className="text-accent animate-spin" />
      </div>
    );
  }

  // Not logged in — show login modal over landing
  if (!isAuthenticated) {
    return (
      <>
        <LandingView onConnect={() => setShowLogin(true)} />
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </>
    );
  }

  // Logged in — single page with tabs
  const ActivePage = TABS[activeTab] || Dashboard;

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <ActivePage onNavigate={setActiveTab} />
    </Layout>
  );
}

function LandingView({ onConnect }) {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4">
      <div className="text-center animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-6">
          <LogoIcon size={48} className="text-accent" />
        </div>
        <h1 className="text-3xl font-bold text-gradient mb-2">HedgeQuant𝕏</h1>
        <p className="text-text-muted mb-8">Professional Algorithmic Trading Platform</p>

        <button
          onClick={onConnect}
          className="bg-accent hover:bg-accent/90 text-bg-primary font-bold py-3 px-10 rounded-lg text-lg transition-colors cursor-pointer"
        >
          Connect to Prop Firm
        </button>

        <div className="grid grid-cols-3 gap-6 mt-12 max-w-md mx-auto">
          <div className="text-center">
            <p className="text-2xl font-mono-nums font-bold text-accent">6</p>
            <p className="text-xs text-text-muted mt-1">Math Models</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-mono-nums font-bold text-warning">16+</p>
            <p className="text-xs text-text-muted mt-1">Prop Firms</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-mono-nums font-bold text-pink">HFT</p>
            <p className="text-xs text-text-muted mt-1">Grade Speed</p>
          </div>
        </div>
      </div>
    </div>
  );
}
