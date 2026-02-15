import { useState, useEffect, useRef } from 'react';
import {
  TrendingUp, Mountain, GraduationCap, Zap, Shield, Star, Target, Award,
  Rocket, DollarSign, ArrowUpRight, Timer, Crown, BarChart3, ShieldCheck,
  Settings, Loader2, AlertCircle, ChevronLeft, Lock, User, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PROPFIRMS } from '../utils/constants';
import { LogoIcon } from './Logo';

const iconMap = {
  TrendingUp, Mountain, GraduationCap, Zap, Shield, Star, Target, Award,
  Rocket, DollarSign, ArrowUpRight, Timer, Crown, BarChart3, ShieldCheck, Settings,
};

export default function LoginModal({ onClose }) {
  const { login, error, setError } = useAuth();

  const [step, setStep] = useState(1);
  const [selectedFirm, setSelectedFirm] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const modalRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

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
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        className="bg-bg-card border border-border-default rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border-default">
          <div className="flex items-center gap-3">
            <LogoIcon size={28} className="text-accent" />
            <h2 id="login-modal-title" className="text-sm font-semibold text-text-primary">
              {step === 1 ? 'Select Prop Firm' : `Connect to ${selectedFirm?.name}`}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-card-hover transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Step 1: Prop Firm Grid */}
          {step === 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {PROPFIRMS.map((firm) => {
                const Icon = iconMap[firm.icon] || Settings;
                return (
                  <button
                    key={firm.id}
                    onClick={() => handleSelectFirm(firm)}
                    className="bg-bg-primary border border-border-default rounded-lg p-4 flex flex-col items-center gap-2 hover:border-accent/40 hover:bg-bg-card-hover transition-all cursor-pointer group"
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
          )}

          {/* Step 2: Credentials */}
          {step === 2 && selectedFirm && (
            <div className="max-w-sm mx-auto">
              <button
                onClick={() => { setStep(1); setError(null); }}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-accent transition-colors mb-4 cursor-pointer"
              >
                <ChevronLeft size={14} />
                Back
              </button>

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
          )}
        </div>
      </div>
    </div>
  );
}
