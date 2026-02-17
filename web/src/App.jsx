import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginModal from './components/LoginModal';
import Dashboard from './pages/Dashboard';
import AlgoSetup from './pages/AlgoSetup';
import AlgoLive from './pages/AlgoLive';
import Stats from './pages/Stats';
import { Loader2 } from 'lucide-react';
import { LogoIcon } from './components/Logo';
import { api } from './api/client';

export default function App() {
  const { isAuthenticated, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [algoRunning, setAlgoRunning] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const checkedRef = useRef(false);

  // Check algo status on mount & when authenticated (so returning to algo tab works)
  useEffect(() => {
    if (!isAuthenticated || checkedRef.current) return;
    checkedRef.current = true;
    api.get('/algo/status').then((data) => {
      const status = data.status || data;
      if (status.running) setAlgoRunning(true);
    }).catch(() => {});
  }, [isAuthenticated]);

  const handleNavigate = useCallback((tab) => {
    if (tab === 'algo-live') {
      setAlgoRunning(true);
      setActiveTab('algo');
    } else if (tab === 'algo' || tab === 'dashboard' || tab === 'stats') {
      setActiveTab(tab);
    } else {
      setActiveTab(tab);
    }
  }, []);

  // When AlgoLive navigates back to setup (algo stopped / not running)
  const handleAlgoEnd = useCallback(() => {
    setAlgoRunning(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center gap-3">
        <Loader2 size={28} className="text-accent animate-spin" />
        <p className="text-sm text-text-muted">Loading session...</p>
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

  // Determine which page to render
  let ActivePage;
  let pageProps = { onNavigate: handleNavigate };
  if (activeTab === 'algo') {
    if (algoRunning) {
      ActivePage = AlgoLive;
      pageProps.onAlgoEnd = handleAlgoEnd;
    } else {
      ActivePage = AlgoSetup;
    }
  } else if (activeTab === 'stats') {
    ActivePage = Stats;
  } else {
    ActivePage = Dashboard;
  }

  return (
    <Layout activeTab={activeTab} onTabChange={handleNavigate}>
      <ActivePage {...pageProps} />
    </Layout>
  );
}

function LandingView({ onConnect }) {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4">
      <div className="text-center animate-fade-in">
        <LogoIcon size={120} className="text-accent mx-auto mb-6" />
        <h1 className="text-5xl font-bold mb-2" style={{ fontFamily: 'Clonoid, sans-serif' }}><span className="text-accent">HQ</span><span className="text-pink">𝕏</span></h1>
        <p className="text-[10px] text-white mb-8 tracking-[0.25em]">Prop Futures Algo-Trading</p>

        <button
          onClick={onConnect}
          className="bg-accent hover:bg-accent/90 text-bg-primary font-semibold py-2 px-8 rounded-lg text-sm transition-colors cursor-pointer"
        >
          Login
        </button>
      </div>
    </div>
  );
}
