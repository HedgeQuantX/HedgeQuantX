import { useState, useEffect, useRef } from 'react';
import { Loader2, ChevronLeft, Zap, Shield, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { LogoIcon } from './Logo';
import { PROPFIRMS } from '../utils/constants';

const ICON_MAP = {
  Mountain: Zap, Shield, TrendingUp: Zap, GraduationCap: Shield,
  Zap, DollarSign: Zap, Target: Zap, Globe2: Zap, Store: Zap,
  BarChart3: Zap, ArrowUpRight: Zap, Rocket: Zap, Gem: Zap,
  Sprout: Zap, Crown: Zap, FileText: Shield, Star: Zap, Award: Zap,
  ShieldCheck: Shield, Timer: Zap,
};

export default function LoginModal({ onClose }) {
  const { login, loginLoading, error, setError } = useAuth();
  const [firms, setFirms] = useState(PROPFIRMS);
  const [selected, setSelected] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const passRef = useRef(null);

  useEffect(() => {
    api.get('/propfirms').then((d) => {
      if (d.propfirms?.length) setFirms(d.propfirms);
    }).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selected || !username.trim() || !password) return;
    setError(null);
    const ok = await login(selected.id, username.trim(), password);
    if (ok) onClose();
  };

  return (
    <div className="fixed inset-0 bg-bg-overlay flex items-center justify-center z-50 animate-fade-in">
      <div className="hfx-card w-[380px] max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="p-4 border-b border-border-default flex items-center gap-3">
          {selected && (
            <button onClick={() => { setSelected(null); setError(null); }}
              className="text-text-muted hover:text-text-primary cursor-pointer">
              <ChevronLeft size={16} />
            </button>
          )}
          <LogoIcon size={20} className="text-accent" />
          <span className="text-[10px] font-bold tracking-[0.2em] text-accent flex-1">
            {selected ? 'CONNECT' : 'SELECT GATEWAY'}
          </span>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary text-xs cursor-pointer">ESC</button>
        </div>

        {!selected ? (
          /* Firm Grid */
          <div className="p-3 grid grid-cols-2 gap-1.5 max-h-[60vh] overflow-auto">
            {firms.map((f) => (
              <button key={f.id} onClick={() => setSelected(f)}
                className="hfx-card hfx-card-hover p-2.5 flex items-center gap-2 cursor-pointer text-left transition-all">
                <span className="text-sm">{f.icon}</span>
                <span className="text-[10px] font-semibold text-text-secondary leading-tight">{f.name}</span>
              </button>
            ))}
          </div>
        ) : (
          /* Login Form */
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div className="flex items-center gap-2 p-2 bg-accent-dim border border-border-accent">
              <Zap size={12} className="text-accent" />
              <span className="text-[10px] font-bold text-accent">{selected.name}</span>
            </div>

            {error && (
              <div className="p-2 bg-loss-dim border border-loss/30 text-[10px] text-loss font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="text-[8px] text-text-muted font-semibold tracking-wider block mb-1">USERNAME</label>
              <input type="text" value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && passRef.current?.focus()}
                className="w-full bg-bg-input border border-border-default px-3 py-2 text-xs text-text-primary
                  focus:border-accent focus:outline-none transition-colors"
                placeholder="your@email.com" autoFocus />
            </div>

            <div>
              <label className="text-[8px] text-text-muted font-semibold tracking-wider block mb-1">PASSWORD</label>
              <input type="password" ref={passRef} value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-bg-input border border-border-default px-3 py-2 text-xs text-text-primary
                  focus:border-accent focus:outline-none transition-colors"
                placeholder="••••••••" />
            </div>

            <button type="submit" disabled={loginLoading || !username.trim() || !password}
              className="btn-primary w-full flex items-center justify-center gap-2 py-2.5">
              {loginLoading ? (
                <><Loader2 size={12} className="animate-spin" /> CONNECTING...</>
              ) : (
                <><Lock size={10} /> AUTHENTICATE</>
              )}
            </button>

            <div className="flex items-center gap-1.5 justify-center pt-1">
              <Shield size={8} className="text-text-dim" />
              <span className="text-[8px] text-text-dim">AES-256-GCM ENCRYPTED</span>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
