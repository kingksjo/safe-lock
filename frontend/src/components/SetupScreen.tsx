import React, { useState } from 'react';
import { Shield, KeyRound, AlertTriangle } from 'lucide-react';
import { sha256 } from '../utils/crypto';

interface SetupScreenProps {
  onSetupComplete: () => void;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onSetupComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Administrative password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Password confirmations do not match.');
      return;
    }

    setLoading(true);
    try {
      const hashed = await sha256(password);
      localStorage.setItem('admin_password_hash', hashed);
      onSetupComplete();
    } catch (err) {
      setError('Security encryption module failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6 grid-lines">
      <div className="w-full max-w-md bg-surface border border-outline-variant p-8 rounded-lg shadow-2xl relative overflow-hidden">
        {/* Decorative corner borders to emphasize the technical look */}
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-primary"></div>
        <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-primary"></div>
        <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-primary"></div>
        <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-primary"></div>

        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-primary/10 rounded-full border border-primary/20 text-primary mb-4">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-on-surface">SAFELOCK TELEMETRY</h1>
          <p className="text-xs text-on-surface-variant uppercase tracking-widest mt-1">First Launch Setup</p>
        </div>

        <div className="bg-surface-container border border-primary/10 p-4 rounded mb-6 text-xs text-on-surface-variant flex gap-3 items-start">
          <AlertTriangle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-on-surface">Security Protocol Node Initialization</span>
            <p className="mt-1 leading-normal">
              SafeLock operates completely on a secure local network. All administrative overrides are validated client-side. Configure a local administration password to authorize commands.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs uppercase font-semibold text-on-surface-variant tracking-wider mb-2">
              Setup Master Password
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-outline" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-background border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded py-2 pl-10 pr-4 text-sm text-on-surface placeholder:text-outline/40 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase font-semibold text-on-surface-variant tracking-wider mb-2">
              Confirm Master Password
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-outline" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-background border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded py-2 pl-10 pr-4 text-sm text-on-surface placeholder:text-outline/40 outline-none transition"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-lockout/15 border border-lockout/30 text-lockout text-xs rounded font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-container hover:bg-primary-container/90 text-on-primary-container font-semibold py-2 px-4 rounded text-sm transition tracking-wide uppercase disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Initializing...' : 'Authorize Dashboard Node'}
          </button>
        </form>
      </div>
    </div>
  );
};
