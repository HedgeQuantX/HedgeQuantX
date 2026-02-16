import { useState, useEffect } from 'react';
import {
  ChevronRight, ChevronLeft, Rocket, Loader2, AlertCircle,
  Target, TrendingUp, Gauge, Wallet,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { formatPercent } from '../utils/format';

const STEPS = ['Account', 'Symbol', 'Strategy', 'Configure', 'Launch'];

const POPULAR_SYMBOLS = ['ES', 'NQ', 'MES', 'MNQ', 'YM', 'RTY', 'CL', 'GC'];

export default function AlgoSetup({ onNavigate }) {
  const { accounts } = useAuth();

  const [step, setStep] = useState(0);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [selectedContract, setSelectedContract] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [selectedStrategy, setSelectedStrategy] = useState(null);
  const [config, setConfig] = useState({
    contracts: 1,
    dailyTarget: 500,
    maxRisk: 300,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch contracts when account selected
  useEffect(() => {
    if (!selectedAccount) return;
    let mounted = true;
    api.get('/contracts')
      .then((data) => {
        const list = data.contracts || data || [];
        // Normalize: ensure each entry is an object with symbol, baseSymbol, exchange
        const normalized = list.map((c) =>
          typeof c === 'string'
            ? { symbol: c, baseSymbol: c.replace(/[A-Z]\d+$/, ''), exchange: 'CME' }
            : { symbol: c.symbol || c.name || c, baseSymbol: c.baseSymbol || (c.symbol || '').replace(/[A-Z]\d+$/, ''), exchange: c.exchange || 'CME', name: c.name || null }
        );
        if (mounted) setContracts(normalized);
      })
      .catch(() => {
        if (mounted) setContracts([]);
      });
    return () => { mounted = false; };
  }, [selectedAccount]);

  // Fetch strategies when contract selected
  useEffect(() => {
    if (!selectedContract) return;
    let mounted = true;
    api.get(`/strategies?symbol=${selectedContract.symbol}`)
      .then((data) => {
        if (mounted) setStrategies(data.strategies || data || []);
      })
      .catch(() => {
        if (mounted) setStrategies([]);
      });
    return () => { mounted = false; };
  }, [selectedContract]);

  const popularContracts = contracts.filter((c) => POPULAR_SYMBOLS.includes(c.baseSymbol));
  const otherContracts = contracts.filter((c) => !POPULAR_SYMBOLS.includes(c.baseSymbol));

  const handleLaunch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/algo/start', {
        accountId: selectedAccount.rithmicAccountId || selectedAccount.accountId || selectedAccount.id || selectedAccount.name,
        symbol: selectedContract.symbol,
        exchange: selectedContract.exchange || 'CME',
        strategyId: selectedStrategy.id,
        size: config.contracts,
        dailyTarget: config.dailyTarget,
        maxRisk: config.maxRisk,
      });
      // Only navigate if backend confirmed algo is running
      if (res.success && res.status?.running) {
        if (onNavigate) onNavigate('algo-live');
      } else {
        setError(res.error || 'Algo did not start. Check strategy availability.');
      }
    } catch (err) {
      if (err.message === 'Session expired') {
        setError('Session expired. Please disconnect and login again.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case 0: return !!selectedAccount;
      case 1: return !!selectedContract;
      case 2: return !!selectedStrategy;
      case 3: return config.contracts > 0;
      default: return false;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-text-primary">Algo Trading</h1>
        <p className="text-sm text-text-muted mt-0.5">Configure and launch your strategy</p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                i === step
                  ? 'bg-accent text-bg-primary'
                  : i < step
                  ? 'bg-accent/20 text-accent'
                  : 'bg-bg-card border border-border-default text-text-dim'
              }`}
            >
              {i + 1}
            </div>
            <span
              className={`text-xs hidden sm:block ${
                i === step ? 'text-text-primary font-medium' : 'text-text-dim'
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <ChevronRight size={14} className="text-text-dim" />
            )}
          </div>
        ))}
      </div>

      {/* Step 0: Select Account */}
      {step === 0 && (
        <div className="space-y-3">
          <h2 className="text-sm text-text-muted">Select an account</h2>
          {accounts.length === 0 ? (
            <div className="bg-bg-card border border-border-default rounded-lg p-6 text-center">
              <p className="text-text-muted text-sm">No accounts available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {accounts.map((acc) => {
                const accKey = acc.rithmicAccountId || acc.accountId || acc.id || acc.name;
                return (
                <button
                  key={accKey}
                  onClick={() => setSelectedAccount(acc)}
                  className={`bg-bg-card border rounded-lg p-4 text-left transition-all cursor-pointer ${
                    (selectedAccount?.rithmicAccountId || selectedAccount?.accountId) === (acc.rithmicAccountId || acc.accountId)
                      ? 'border-accent bg-accent/5'
                      : 'border-border-default hover:border-accent/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Wallet size={18} className="text-accent" />
                    <div>
                      <p className="text-sm font-medium text-text-primary">{acc.name || 'N/A'}</p>
                      <p className="text-xs text-text-muted font-mono-nums">
                        ${Number(acc.balance || 0).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 1: Select Symbol */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-sm text-text-muted">Select a symbol</h2>
          {contracts.length === 0 ? (
            <div className="bg-bg-card border border-border-default rounded-lg p-6 text-center">
              <Loader2 size={20} className="text-accent animate-spin mx-auto mb-2" />
              <p className="text-text-muted text-sm">Loading symbols...</p>
            </div>
          ) : (
            <>
              {popularContracts.length > 0 && (
                <div>
                  <p className="text-xs text-text-dim mb-2">Popular</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {popularContracts.map((c) => (
                      <button
                        key={c.symbol}
                        onClick={() => setSelectedContract(c)}
                        className={`bg-bg-card border rounded-lg p-3 text-center transition-all cursor-pointer ${
                          selectedContract?.symbol === c.symbol
                            ? 'border-accent bg-accent/5'
                            : 'border-border-default hover:border-accent/30'
                        }`}
                      >
                        <span className="text-sm font-mono-nums font-semibold text-text-primary">
                          {c.symbol}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {otherContracts.length > 0 && (
                <div>
                  <p className="text-xs text-text-dim mb-2">All Symbols</p>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {otherContracts.map((c) => (
                      <button
                        key={c.symbol}
                        onClick={() => setSelectedContract(c)}
                        className={`bg-bg-card border rounded-lg p-2 text-center transition-all cursor-pointer text-xs ${
                          selectedContract?.symbol === c.symbol
                            ? 'border-accent bg-accent/5'
                            : 'border-border-default hover:border-accent/30'
                        }`}
                      >
                        <span className="font-mono-nums text-text-primary">{c.symbol}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 2: Select Strategy */}
      {step === 2 && (
        <div className="space-y-3">
          <h2 className="text-sm text-text-muted">Select a strategy</h2>
          {strategies.length === 0 ? (
            <div className="bg-bg-card border border-border-default rounded-lg p-6 text-center">
              <Loader2 size={20} className="text-accent animate-spin mx-auto mb-2" />
              <p className="text-text-muted text-sm">Loading strategies...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {strategies.map((strat) => (
                <button
                  key={strat.id}
                  onClick={() => setSelectedStrategy(strat)}
                  className={`bg-bg-card border rounded-lg p-5 text-left transition-all cursor-pointer ${
                    selectedStrategy?.id === strat.id
                      ? 'border-accent bg-accent/5'
                      : 'border-border-default hover:border-accent/30'
                  }`}
                >
                  <p className="text-sm font-semibold text-text-primary mb-3">
                    {strat.name || 'N/A'}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <Target size={14} className="text-accent mx-auto mb-1" />
                      <p className="text-xs text-text-muted">Win Rate</p>
                       <p className="text-sm font-mono-nums font-medium text-accent">
                        {strat.winRate ?? 'N/A'}
                      </p>
                    </div>
                    <div className="text-center">
                      <TrendingUp size={14} className="text-accent mx-auto mb-1" />
                      <p className="text-xs text-text-muted">P. Factor</p>
                      <p className="text-sm font-mono-nums font-medium text-text-primary">
                        {strat.profitFactor ?? 'N/A'}
                      </p>
                    </div>
                    <div className="text-center">
                      <Gauge size={14} className="text-accent mx-auto mb-1" />
                      <p className="text-xs text-text-muted">R:R</p>
                      <p className="text-sm font-mono-nums font-medium text-text-primary">
                        {strat.riskReward ?? 'N/A'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Configure */}
      {step === 3 && (
        <div className="space-y-5">
          <h2 className="text-sm text-text-muted">Configure parameters</h2>
          <div className="bg-bg-card border border-border-default rounded-lg p-5 space-y-5">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-text-primary">Contracts</label>
                <span className="text-sm font-mono-nums text-accent font-semibold">
                  {config.contracts}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={config.contracts}
                onChange={(e) => setConfig({ ...config, contracts: Number(e.target.value) })}
                className="w-full accent-accent"
              />
              <div className="flex justify-between text-xs text-text-dim mt-1">
                <span>1</span>
                <span>10</span>
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-primary mb-1.5">
                Daily Target ($)
              </label>
              <input
                type="number"
                value={config.dailyTarget}
                onChange={(e) => setConfig({ ...config, dailyTarget: Number(e.target.value) })}
                className="w-full bg-bg-primary border border-border-default rounded-lg px-4 py-2.5 text-sm font-mono-nums text-text-primary focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm text-text-primary mb-1.5">
                Max Risk ($)
              </label>
              <input
                type="number"
                value={config.maxRisk}
                onChange={(e) => setConfig({ ...config, maxRisk: Number(e.target.value) })}
                className="w-full bg-bg-primary border border-border-default rounded-lg px-4 py-2.5 text-sm font-mono-nums text-text-primary focus:outline-none focus:border-accent/50 transition-colors"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Launch */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-sm text-text-muted">Review & Launch</h2>
          <div className="bg-bg-card border border-border-default rounded-lg p-5 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Account</span>
              <span className="text-text-primary font-medium">{selectedAccount?.name || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Symbol</span>
              <span className="text-text-primary font-mono-nums font-medium">{selectedContract?.symbol || 'N/A'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Strategy</span>
              <span className="text-text-primary font-medium">{selectedStrategy?.name || 'N/A'}</span>
            </div>
            <div className="border-t border-border-default my-2" />
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Contracts</span>
              <span className="text-text-primary font-mono-nums">{config.contracts}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Daily Target</span>
              <span className="text-accent font-mono-nums">${config.dailyTarget}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-muted">Max Risk</span>
              <span className="text-pink font-mono-nums">${config.maxRisk}</span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-pink text-xs bg-pink-dim rounded-lg px-3 py-2">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleLaunch}
            disabled={loading}
            className="w-full bg-accent hover:bg-accent/90 text-bg-primary font-bold py-4 rounded-lg text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={22} className="animate-spin" />
                Launching...
              </>
            ) : (
              <>
                <Rocket size={22} />
                LAUNCH
              </>
            )}
          </button>
        </div>
      )}

      {/* Navigation */}
      {step < 4 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep(step - 1)}
            disabled={step === 0}
            className="flex items-center gap-1 px-4 py-2 text-sm text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
            Back
          </button>
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canProceed()}
            className="flex items-center gap-1 px-5 py-2 bg-accent/10 text-accent text-sm font-medium rounded-lg border border-accent/20 hover:bg-accent/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
