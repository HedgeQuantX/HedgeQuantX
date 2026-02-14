import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, Mountain, GraduationCap, Zap, Shield, Star, Target, Award,
  Rocket, DollarSign, ArrowUpRight, Timer, Crown, BarChart3, ShieldCheck,
  Settings, Loader2, AlertCircle, ChevronLeft, Lock, User,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PROPFIRMS } from '../utils/constants';

const iconMap = {
  TrendingUp, Mountain, GraduationCap, Zap, Shield, Star, Target, Award,
  Rocket, DollarSign, ArrowUpRight, Timer, Crown, BarChart3, ShieldCheck, Settings,
};

export default function Login() {
  const navigate = useNavigate();
  const { login, error, setError } = useAuth();

  const [step, setStep] = useState(1);
  const [selectedFirm, setSelectedFirm] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSelectFirm = (firm) => {
    setSelectedFirm(firm);
    setError(null);
    setStep(2);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password');
      return;
    }
    setLoading(true);
    const success = await login(selectedFirm.id, username, password);
    setLoading(false);
    if (success) {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4">
      {/* Logo */}
      <div className="mb-8 text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-accent font-bold text-2xl font-mono-nums">HQX</span>
        </div>
        <h1 className="text-2xl font-bold text-gradient">HedgeQuantX</h1>
        <p className="text-sm text-text-muted mt-1">Professional Algo Trading</p>
      </div>

      {/* Step 1: Select Prop Firm */}
      {step === 1 && (
        <div className="w-full max-w-2xl animate-slide-up">
          <h2 className="text-sm font-medium text-text-muted text-center mb-4">
            Select your prop firm to connect
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {PROPFIRMS.map((firm) => {
              const Icon = iconMap[firm.icon] || Settings;
              return (
                <button
                  key={firm.id}
                  onClick={() => handleSelectFirm(firm)}
                  className="bg-bg-card border border-border-default rounded-lg p-4 flex flex-col items-center gap-2 hover:border-accent/40 hover:bg-bg-card-hover transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent-dim flex items-center justify-center group-hover:bg-accent/20 transition-colors">
                    <Icon size={20} className="text-accent" />
                  </div>
                  <span className="text-xs font-medium text-text-primary text-center leading-tight">
                    {firm.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: Credentials */}
      {step === 2 && selectedFirm && (
        <div className="w-full max-w-sm animate-slide-up">
          <button
            onClick={() => { setStep(1); setError(null); }}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors mb-4 cursor-pointer"
          >
            <ChevronLeft size={14} />
            Back to prop firm selection
          </button>

          <div className="bg-bg-card border border-border-default rounded-lg p-6">
            <div className="flex items-center gap-3 mb-6">
              {(() => {
                const Icon = iconMap[selectedFirm.icon] || Settings;
                return (
                  <div className="w-10 h-10 rounded-lg bg-accent-dim flex items-center justify-center">
                    <Icon size={20} className="text-accent" />
                  </div>
                );
              })()}
              <div>
                <p className="text-sm font-semibold text-text-primary">{selectedFirm.name}</p>
                <p className="text-xs text-text-muted">Enter your credentials</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs text-text-muted mb-1.5">Username</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="w-full bg-bg-primary border border-border-default rounded-lg px-9 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:border-accent/50 transition-colors"
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-text-muted mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full bg-bg-primary border border-border-default rounded-lg px-9 py-2.5 text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:border-accent/50 transition-colors"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-pink text-xs bg-pink-dim rounded-lg px-3 py-2">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-accent hover:bg-accent/90 text-bg-primary font-semibold py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Connecting...
                  </>
                ) : (
                  'Connect'
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
