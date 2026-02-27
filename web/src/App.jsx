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
  const [wsStatus, setWsStatus] = useState('disconnected');
  const checkedRef = useRef(false);

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
    } else {
      setActiveTab(tab);
    }
  }, []);

  const handleAlgoEnd = useCallback(() => setAlgoRunning(false), []);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center gap-3">
        <div className="relative">
          <LogoIcon size={28} className="text-accent animate-glow" />
        </div>
        <Loader2 size={14} className="text-accent/40 animate-spin" />
        <span className="text-[8px] text-text-dim tracking-widest">INITIALIZING TERMINAL...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <LandingView onConnect={() => setShowLogin(true)} />
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </>
    );
  }

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
    <Layout activeTab={activeTab} onTabChange={handleNavigate} wsStatus={wsStatus}>
      <ActivePage {...pageProps} />
    </Layout>
  );
}

function LandingView({ onConnect }) {
  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center scanline">
      <div className="text-center animate-fade-in space-y-5">
        <LogoIcon size={80} className="text-accent mx-auto animate-glow" />
        <div>
          <h1 className="text-lg font-bold text-white tracking-[0.35em]">HEDGEQUANTX</h1>
          <p className="text-[8px] text-text-muted tracking-[0.25em] mt-1">ALGORITHMIC FUTURES TRADING TERMINAL</p>
        </div>
        <button onClick={onConnect}
          className="btn-primary px-8 py-2 text-[10px] cursor-pointer">
          CONNECT TO GATEWAY
        </button>
        <div className="flex items-center gap-4 justify-center text-[7px] text-text-dim pt-2">
          <span>RITHMIC PROTOCOL</span>
          <span>•</span>
          <span>16 PROP FIRMS</span>
          <span>•</span>
          <span>SUB-MS EXECUTION</span>
        </div>
      </div>
    </div>
  );
}
