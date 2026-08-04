import React, { useState } from 'react';
import { LockKeyhole, X } from 'lucide-react';

interface PasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
  actionTitle?: string;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  actionTitle = 'Execute Administrative Override'
}) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setVerifying(true);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const data = await res.json();
        setPassword('');
        onSuccess(data.token);
        onClose();
      } else {
        setError('Verification failed. Invalid password.');
      }
    } catch {
      setError('Security node unreachable. Cannot verify credentials.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-surface border border-outline-variant rounded-lg p-6 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-surface-container rounded text-outline transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center mb-6">
          <div className="p-2 bg-primary/10 rounded-full border border-primary/20 text-primary mb-3">
            <LockKeyhole className="w-6 h-6" />
          </div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-on-surface text-center">
            Security Authorization
          </h2>
          <p className="text-[11px] text-outline uppercase tracking-widest text-center mt-1">
            {actionTitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] uppercase font-semibold text-on-surface-variant tracking-wider mb-1.5">
              Enter Administrator Password
            </label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-background border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary rounded py-1.5 px-3 text-sm text-on-surface placeholder:text-outline/40 outline-none transition"
            />
          </div>

          {error && (
            <div className="p-2 bg-lockout/15 border border-lockout/30 text-lockout text-[11px] rounded font-medium">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface-container-low hover:bg-surface-container hover:text-on-surface border border-outline-variant text-on-surface-variant font-medium py-1.5 rounded text-xs transition uppercase"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifying}
              className="flex-1 bg-primary-container hover:bg-primary-container/90 text-on-primary-container font-semibold py-1.5 rounded text-xs transition tracking-wide uppercase disabled:opacity-50"
            >
              {verifying ? 'Verifying...' : 'Authorize'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
