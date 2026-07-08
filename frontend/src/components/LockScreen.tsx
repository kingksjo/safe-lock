import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { sha256 } from '../utils/crypto';

interface LockScreenProps {
  onUnlock: () => void;
}

export const LockScreen: React.FC<LockScreenProps> = ({ onUnlock }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setVerifying(true);

    try {
      const inputHash = await sha256(password);
      const storedHash = localStorage.getItem('admin_password_hash');

      if (inputHash === storedHash) {
        setPassword('');
        onUnlock();
      } else {
        setError('Authentication failed. Invalid master password.');
      }
    } catch {
      setError('Cryptography encryption module mismatch. Retry.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-6 grid-lines select-none">
      <div className="w-full max-w-sm bg-surface border border-outline-variant p-8 rounded-lg shadow-2xl relative overflow-hidden">
        {/* Technical Corner Borders */}
        <div className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-primary"></div>
        <div className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-primary"></div>
        <div className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-primary"></div>
        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-primary"></div>

        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-lockout/10 rounded-full border border-lockout/20 text-lockout mb-4 animate-pulse">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface">Telemetry Terminal Locked</h2>
          <span className="text-[9px] text-outline font-mono uppercase tracking-widest mt-1">SafeLock Security Node</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[10px] uppercase font-bold text-outline tracking-wider mb-2">
              Enter Administrative Key
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Master Passcode"
                className="w-full bg-background border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded py-2 pl-3 pr-10 text-xs text-on-surface placeholder:text-outline/30 outline-none transition font-mono tracking-widest"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-outline hover:text-primary transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-lockout/15 border border-lockout/30 text-lockout text-[11px] rounded font-semibold font-mono text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={verifying}
            className="w-full bg-primary-container hover:bg-primary-container/90 text-on-primary-container font-semibold py-2 px-4 rounded text-xs transition tracking-wider uppercase disabled:opacity-50"
          >
            {verifying ? 'Authenticating...' : 'Unlock Telemetry'}
          </button>
        </form>

        <div className="mt-8 border-t border-outline-variant/30 pt-4 flex justify-between text-[9px] text-outline font-mono">
          <span>Status: Protected</span>
          <span>Crypto: SHA-256</span>
        </div>
      </div>
    </div>
  );
};
