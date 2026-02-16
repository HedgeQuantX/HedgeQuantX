import { useState, useEffect } from 'react';
import {
  ChevronRight, ChevronLeft, Rocket, Loader2, AlertCircle,
  Target, TrendingUp, Gauge, Wallet, DollarSign, Shield, Clock,
  BarChart3, Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

const STEPS = ['Account', 'Symbol', 'Strategy', 'Configure', 'Launch'];

const POPULAR_SYMBOLS = ['ES', 'NQ', 'MES', 'MNQ', 'YM', 'RTY', 'CL', 'GC'];

// Contract descriptions — market standard names (same as CLI src/config/constants.js)
const DESCRIPTIONS = {
  ES: 'E-mini S&P 500', MES: 'Micro E-mini S&P 500',
  NQ: 'E-mini Nasdaq 100', MNQ: 'Micro E-mini Nasdaq',
  RTY: 'E-mini Russell 2000', M2K: 'Micro E-mini Russell',
  YM: 'E-mini Dow $5', MYM: 'Micro E-mini Dow',
  EMD: 'E-mini S&P MidCap', NKD: 'Nikkei 225',
  GC: 'Gold (100oz)', MGC: 'Micro Gold (10oz)',
  SI: 'Silver (5000oz)', SIL: 'Micro Silver',
  HG: 'Copper', MHG: 'Micro Copper', PL: 'Platinum', PA: 'Palladium',
  CL: 'Crude Oil WTI', MCL: 'Micro Crude Oil', NG: 'Natural Gas',
  BZ: 'Brent Crude', RB: 'RBOB Gasoline', HO: 'Heating Oil',
  '6E': 'Euro FX', M6E: 'Micro Euro', '6B': 'British Pound', M6B: 'Micro GBP',
  '6A': 'Australian $', M6A: 'Micro AUD', '6J': 'Japanese Yen',
  '6C': 'Canadian $', '6S': 'Swiss Franc', '6N': 'New Zealand $',
  BTC: 'Bitcoin', MBT: 'Micro Bitcoin', ETH: 'Ether', MET: 'Micro Ether',
  ZB: '30Y T-Bond', ZN: '10Y T-Note', ZF: '5Y T-Note', ZT: '2Y T-Note',
  ZC: 'Corn', ZS: 'Soybeans', ZW: 'Wheat', ZM: 'Soybean Meal',
  ZL: 'Soybean Oil', ZO: 'Oats',
  LE: 'Live Cattle', HE: 'Lean Hogs', GF: 'Feeder Cattle',
};

function getDesc(c) {
  return c.name || DESCRIPTIONS[c.baseSymbol] || c.baseSymbol;
}

export default function AlgoSetup({ onNavigate }) {
  const { accounts, propfirm } = useAuth();

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
        const normalized = list.map((c) =>
          typeof c === 'string'
            ? { symbol: c, baseSymbol: c.replace(/[A-Z]\d+$/, ''), exchange: 'CME' }
            : { symbol: c.symbol || c.name || c, baseSymbol: c.baseSymbol || (c.symbol || '').replace(/[A-Z]\d+$/, ''), exchange: c.exchange || 'CME', name: c.name || null }
        );
        if (mounted) setContracts(normalized);
      })
      .catch(() => { if (mounted) setContracts([]); });
    return () => { mounted = false; };
  }, [selectedAccount]);

  // Fetch strategies when contract selected
  useEffect(() => {
    if (!selectedContract) return;
    let mounted = true;
    api.get(`/strategies?symbol=${selectedContract.symbol}`)
      .then((data) => { if (mounted) setStrategies(data.strategies || data || []); })
      .catch(() => { if (mounted) setStrategies([]); });
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
        accountName: selectedAccount.name || null,
        propfirm: propfirm || null,
      });
      if (res.success && res.status?.running) {
        if (onNavigate) onNavigate('algo-live');
      } else {
        setError(res.error || 'Algo did not start. Check strategy availability.');
      }
    } catch (err) {
      setError(err.message === 'Session expired' ? 'Session expired. Please disconnect and login again.' : err.message);
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
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
              i === step ? 'bg-accent text-bg-primary' : i < step ? 'bg-accent/20 text-accent' : 'bg-bg-card border border-border-default text-text-dim'
            }`}>
              {i + 1}
            </div>
            <span className={`text-xs hidden sm:block ${i === step ? 'text-text-primary font-medium' : 'text-text-dim'}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <ChevronRight size={14} className="text-text-dim" />}
          </div>
        ))}
      </div>

      {/* ================================================================ */}
      {/* Step 0: Select Account                                          */}
      {/* ================================================================ */}
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
                const sel = (selectedAccount?.rithmicAccountId || selectedAccount?.accountId) === (acc.rithmicAccountId || acc.accountId);
                return (
                  <button key={accKey} onClick={() => setSelectedAccount(acc)}
                    className={`bg-bg-card border rounded-lg p-4 text-left transition-all cursor-pointer ${sel ? 'border-accent bg-accent/5' : 'border-border-default hover:border-accent/30'}`}>
                    <div className="flex items-center gap-3">
                      <Wallet size={18} className="text-accent" />
                      <div>
                        <p className="text-sm font-medium text-text-primary">{acc.name || '...'}</p>
                        <p className="text-xs text-text-muted font-mono-nums">${Number(acc.balance || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Step 1: Select Symbol — with descriptions                       */}
      {/* ================================================================ */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-sm text-text-muted">Select a symbol</h2>
          {contracts.length === 0 ? (
            <div className="bg-bg-card border border-border-default rounded-lg p-6 flex flex-col items-center justify-center gap-2">
              <Loader2 size={20} className="text-accent animate-spin" />
              <p className="text-text-muted text-sm">Loading symbols...</p>
            </div>
          ) : (
            <>
              {popularContracts.length > 0 && (
                <div>
                  <p className="text-xs text-text-dim mb-2">Popular</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {popularContracts.map((c) => (
                      <button key={c.symbol} onClick={() => setSelectedContract(c)}
                        className={`bg-bg-card border rounded-lg p-3 text-left transition-all cursor-pointer flex items-center gap-3 ${
                          selectedContract?.symbol === c.symbol ? 'border-accent bg-accent/5' : 'border-border-default hover:border-accent/30'
                        }`}>
                        <span className="text-sm font-mono-nums font-semibold text-accent w-[70px] shrink-0">{c.symbol}</span>
                        <span className="text-xs text-text-muted truncate">{getDesc(c)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {otherContracts.length > 0 && (
                <div>
                  <p className="text-xs text-text-dim mb-2">All Symbols</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {otherContracts.map((c) => (
                      <button key={c.symbol} onClick={() => setSelectedContract(c)}
                        className={`bg-bg-card border rounded-lg px-3 py-2 text-left transition-all cursor-pointer flex items-center gap-2 ${
                          selectedContract?.symbol === c.symbol ? 'border-accent bg-accent/5' : 'border-border-default hover:border-accent/30'
                        }`}>
                        <span className="text-xs font-mono-nums font-semibold text-text-primary w-[60px] shrink-0">{c.symbol}</span>
                        <span className="text-[11px] text-text-dim truncate">{getDesc(c)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Step 2: Select Strategy — full backtest details                  */}
      {/* ================================================================ */}
      {step === 2 && (
        <div className="space-y-3">
          <h2 className="text-sm text-text-muted">Select a strategy</h2>
          {strategies.length === 0 ? (
            <div className="bg-bg-card border border-border-default rounded-lg p-6 flex flex-col items-center justify-center gap-2">
              <Loader2 size={20} className="text-accent animate-spin" />
              <p className="text-text-muted text-sm">Loading strategies...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {strategies.map((strat) => {
                const sel = selectedStrategy?.id === strat.id;
                const bt = strat.backtest || {};
                return (
                  <button key={strat.id} onClick={() => setSelectedStrategy(strat)}
                    className={`w-full bg-bg-card border rounded-lg p-5 text-left transition-all cursor-pointer ${
                      sel ? 'border-accent bg-accent/5' : 'border-border-default hover:border-accent/30'
                    }`}>
                    {/* Header: name + description */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{strat.name || '...'}</p>
                        {strat.description && (
                          <p className="text-[11px] text-text-dim mt-0.5">{strat.description}</p>
                        )}
                      </div>
                      {sel && <div className="w-2 h-2 rounded-full bg-accent shrink-0 mt-1" />}
                    </div>

                    {/* Main stats row */}
                    <div className="grid grid-cols-4 gap-3 mb-3">
                      <StratStat icon={Target} label="Win Rate" value={strat.winRate || bt.winRate || '—'} cls="text-accent" />
                      <StratStat icon={BarChart3} label="Trades" value={bt.trades || '—'} />
                      <StratStat icon={Gauge} label="R:R" value={strat.riskReward || '—'} cls="text-warning" />
                      <StratStat icon={DollarSign} label="Backtest P&L" value={bt.pnl || '—'} cls="text-accent" />
                    </div>

                    {/* Secondary stats row */}
                    <div className="grid grid-cols-4 gap-3 pt-2 border-t border-border-subtle">
                      <StratStat icon={Shield} label="Stop" value={strat.stopTicks ? `${strat.stopTicks} ticks` : '—'} cls="text-pink" />
                      <StratStat icon={Zap} label="Target" value={strat.targetTicks ? `${strat.targetTicks} ticks` : '—'} cls="text-accent" />
                      <StratStat icon={TrendingUp} label="Profit Factor" value={bt.profitFactor || '—'} />
                      <StratStat icon={Clock} label="Period" value={bt.period || '—'} small />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/* Step 3: Configure                                               */}
      {/* ================================================================ */}
      {step === 3 && (
        <div className="space-y-5">
          <h2 className="text-sm text-text-muted">Configure parameters</h2>
          <div className="bg-bg-card border border-border-default rounded-lg p-5 space-y-5">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm text-text-primary">Contracts</label>
                <span className="text-sm font-mono-nums text-accent font-semibold">{config.contracts}</span>
              </div>
              <input type="range" min="1" max="10" value={config.contracts}
                onChange={(e) => setConfig({ ...config, contracts: Number(e.target.value) })}
                className="w-full accent-accent" />
              <div className="flex justify-between text-xs text-text-dim mt-1">
                <span>1</span><span>10</span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-text-primary mb-1.5">Daily Target ($)</label>
              <input type="number" value={config.dailyTarget}
                onChange={(e) => setConfig({ ...config, dailyTarget: Number(e.target.value) })}
                className="w-full bg-bg-primary border border-border-default rounded-lg px-4 py-2.5 text-sm font-mono-nums text-text-primary focus:outline-none focus:border-accent/50 transition-colors" />
            </div>
            <div>
              <label className="block text-sm text-text-primary mb-1.5">Max Risk ($)</label>
              <input type="number" value={config.maxRisk}
                onChange={(e) => setConfig({ ...config, maxRisk: Number(e.target.value) })}
                className="w-full bg-bg-primary border border-border-default rounded-lg px-4 py-2.5 text-sm font-mono-nums text-text-primary focus:outline-none focus:border-accent/50 transition-colors" />
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Step 4: Review & Launch                                         */}
      {/* ================================================================ */}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-sm text-text-muted">Review & Launch</h2>
          <div className="bg-bg-card border border-border-default rounded-lg p-5 space-y-3">
            <ReviewRow label="Account" value={selectedAccount?.name || '...'} />
            <ReviewRow label="Symbol" value={`${selectedContract?.symbol || '...'} — ${getDesc(selectedContract || {})}`} mono />
            <ReviewRow label="Strategy" value={selectedStrategy?.name || '...'} />
            <div className="border-t border-border-default my-2" />
            <ReviewRow label="Contracts" value={config.contracts} mono />
            <ReviewRow label="Daily Target" value={`$${config.dailyTarget}`} cls="text-accent" mono />
            <ReviewRow label="Max Risk" value={`$${config.maxRisk}`} cls="text-pink" mono />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-pink text-xs bg-pink-dim rounded-lg px-3 py-2">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}

          <button onClick={handleLaunch} disabled={loading}
            className="w-full bg-accent hover:bg-accent/90 text-bg-primary font-bold py-4 rounded-lg text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 cursor-pointer">
            {loading ? (
              <><Loader2 size={22} className="animate-spin" />Launching...</>
            ) : (
              <><Rocket size={22} />LAUNCH</>
            )}
          </button>
        </div>
      )}

      {/* Navigation */}
      {step < 4 && (
        <div className="flex items-center justify-between">
          <button onClick={() => setStep(step - 1)} disabled={step === 0}
            className="flex items-center gap-1 px-4 py-2 text-sm text-text-muted hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer">
            <ChevronLeft size={16} />Back
          </button>
          <button onClick={() => setStep(step + 1)} disabled={!canProceed()}
            className="flex items-center gap-1 px-5 py-2 bg-accent/10 text-accent text-sm font-medium rounded-lg border border-accent/20 hover:bg-accent/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer">
            Next<ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

/* Strategy stat cell — reusable */
function StratStat({ icon: Icon, label, value, cls = 'text-text-primary', small }) {
  return (
    <div className="text-center">
      <Icon size={12} className="text-accent mx-auto mb-0.5" />
      <p className="text-[9px] text-text-dim leading-none mb-0.5">{label}</p>
      <p className={`${small ? 'text-[10px]' : 'text-xs'} font-mono-nums font-medium ${cls} leading-tight`}>{value}</p>
    </div>
  );
}

/* Review row — launch step */
function ReviewRow({ label, value, cls = 'text-text-primary', mono }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-text-muted">{label}</span>
      <span className={`${cls} font-medium ${mono ? 'font-mono-nums' : ''}`}>{value}</span>
    </div>
  );
}
