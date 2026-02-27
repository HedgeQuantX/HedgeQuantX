import { useState, useEffect } from 'react';
import { Bot, Zap, Play, ChevronDown, Shield, Target, TrendingUp, BarChart3, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';

export default function AlgoSetup({ onNavigate }) {
  const { accounts } = useAuth();
  const [strategies, setStrategies] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [config, setConfig] = useState({
    strategyId: '', symbol: '', accountId: '', size: 1,
    dailyTarget: '', maxRisk: '',
  });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([
      api.get('/strategies'),
      api.get('/contracts'),
    ]).then(([strats, contr]) => {
      if (strats.status === 'fulfilled') setStrategies(strats.value.strategies || []);
      if (contr.status === 'fulfilled') setContracts(contr.value.contracts || []);
      setLoading(false);
    });
  }, []);

  const selectedStrat = strategies.find((s) => s.id === config.strategyId);

  const handleStart = async () => {
    if (!config.strategyId || !config.symbol || !config.accountId) {
      setError('SELECT STRATEGY, SYMBOL, AND ACCOUNT');
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const payload = {
        ...config,
        size: parseInt(config.size) || 1,
        dailyTarget: config.dailyTarget ? parseFloat(config.dailyTarget) : null,
        maxRisk: config.maxRisk ? parseFloat(config.maxRisk) : null,
      };
      const result = await api.post('/algo/start', payload);
      if (result.success) onNavigate('algo-live');
      else setError(result.error || 'FAILED TO START');
    } catch (err) {
      setError(err.message);
    }
    setStarting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <Loader2 size={16} className="text-accent animate-spin" />
        <span className="text-[9px] text-text-muted">LOADING STRATEGIES...</span>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <Bot size={14} className="text-accent" />
        <h1 className="text-sm font-bold">ALGO SETUP</h1>
        <span className="text-[9px] text-text-dim">/ CONFIGURATION</span>
      </div>

      {/* Strategy Select */}
      <div>
        <div className="section-label">SELECT STRATEGY</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {strategies.map((s) => (
            <button key={s.id} onClick={() => setConfig((c) => ({ ...c, strategyId: s.id }))}
              className={`hfx-card p-3 text-left cursor-pointer transition-all ${
                config.strategyId === s.id ? 'border-accent bg-accent-dim' : 'hfx-card-hover'
              }`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-text-primary">{s.name}</span>
                {s.winRate && <span className="mono text-[10px] text-profit font-bold">{s.winRate}</span>}
              </div>
              <div className="text-[9px] text-text-muted mb-2">{s.description}</div>
              {s.backtest && (
                <div className="flex gap-3 text-[8px]">
                  <span className="text-text-dim">P&L: <span className="text-profit mono">{s.backtest.pnl}</span></span>
                  <span className="text-text-dim">TRADES: <span className="text-text-muted mono">{s.backtest.trades}</span></span>
                  <span className="text-text-dim">R:R <span className="text-accent mono">{s.riskReward}</span></span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Config Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="section-label">INSTRUMENT</div>
          <div className="hfx-card p-3 space-y-2">
            <Field label="SYMBOL" value={config.symbol}
              onChange={(v) => setConfig((c) => ({ ...c, symbol: v }))}
              placeholder="ESH6 / NQH6 / MESH6" />
            <Field label="CONTRACTS" type="number" value={config.size}
              onChange={(v) => setConfig((c) => ({ ...c, size: v }))} />
          </div>
        </div>
        <div>
          <div className="section-label">RISK MANAGEMENT</div>
          <div className="hfx-card p-3 space-y-2">
            <Field label="DAILY TARGET ($)" value={config.dailyTarget}
              onChange={(v) => setConfig((c) => ({ ...c, dailyTarget: v }))} placeholder="500" />
            <Field label="MAX RISK ($)" value={config.maxRisk}
              onChange={(v) => setConfig((c) => ({ ...c, maxRisk: v }))} placeholder="300" />
          </div>
        </div>
      </div>

      {/* Account */}
      <div>
        <div className="section-label">ACCOUNT</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {accounts.map((a) => {
            const id = a.rithmicAccountId || a.accountId;
            const active = config.accountId === id;
            return (
              <button key={id} onClick={() => setConfig((c) => ({ ...c, accountId: id }))}
                className={`hfx-card p-2.5 text-left cursor-pointer transition-all ${
                  active ? 'border-accent bg-accent-dim' : 'hfx-card-hover'
                }`}>
                <div className="text-[10px] font-bold text-text-primary">{a.accountName || a.name || id}</div>
                <div className="mono text-[9px] text-text-muted mt-0.5">{id}</div>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-2 bg-loss-dim border border-loss/30 text-[10px] text-loss">{error}</div>
      )}

      {/* Launch */}
      <button onClick={handleStart} disabled={starting || !config.strategyId || !config.symbol || !config.accountId}
        className="btn-primary w-full py-3 flex items-center justify-center gap-2 text-xs">
        {starting ? (
          <><Loader2 size={14} className="animate-spin" /> CONNECTING TO MARKET DATA...</>
        ) : (
          <><Play size={14} /> DEPLOY STRATEGY</>
        )}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label className="text-[7px] text-text-muted font-semibold tracking-wider block mb-0.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg-input border border-border-default px-2.5 py-1.5 text-[11px] text-text-primary
          focus:border-accent focus:outline-none mono" />
    </div>
  );
}
