import React, { useState } from 'react';
import { X, ShieldCheck, Truck, Users, User as UserIcon } from 'lucide-react';
import { apiFetch, setStoredToken } from '../lib/api.ts';
import { CAMEROON_CITIES, type User, type UserRole } from '../types/movecam.ts';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  initialRole?: Exclude<UserRole, 'admin'>;
  onClose: () => void;
  onSuccess: (user: User, token: string) => void;
}

const DEMO_ACCOUNTS: Array<{
  label: string;
  role: UserRole;
  email: string;
  password: string;
  hint: string;
}> = [
  {
    label: 'Customer',
    role: 'customer',
    email: 'clarisse.mbarga@movecam.cm',
    password: 'Customer123!',
    hint: 'Douala · Active & completed moves',
  },
  {
    label: 'Driver / Owner',
    role: 'driver',
    email: 'jean.tchoumi@movecam.cm',
    password: 'Driver123!',
    hint: 'Douala · 2 trucks, live GPS',
  },
  {
    label: 'Assistant',
    role: 'assistant',
    email: 'pierre.kamtchueng@movecam.cm',
    password: 'Assistant123!',
    hint: 'Douala · Schedule & jobs',
  },
  {
    label: 'Administrator',
    role: 'admin',
    email: 'admin@movecam.cm',
    password: 'MoveCam2026!',
    hint: 'Full platform console',
  },
];

export function AuthModal({
  isOpen,
  initialMode = 'login',
  initialRole = 'customer',
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [role, setRole] = useState<Exclude<UserRole, 'admin'>>(initialRole);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('+237 6');
  const [city, setCity] = useState('Douala');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [bio, setBio] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (loginEmail: string, loginPass: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });
      setStoredToken(res.token);
      onSuccess(res.user, res.token);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      await handleLogin(email, password);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          phone,
          password,
          role,
          city,
          bio,
          license_number: licenseNumber,
        }),
      });
      setStoredToken(res.token);
      onSuccess(res.user, res.token);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl my-8">
        <div className="bg-[#0B2545] text-white px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">
              {mode === 'login' ? 'Sign in to MoveCam' : 'Create MoveCam Account'}
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Book • Move • Relocate across Cameroon
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close authentication modal"
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {/* Segmented Mode Switch */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-5">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                mode === 'login'
                  ? 'bg-white text-[#0B2545] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setError(null);
              }}
              className={`py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                mode === 'register'
                  ? 'bg-white text-[#0B2545] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Account Category
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'customer' as const, label: 'Customer', Icon: UserIcon },
                      { id: 'driver' as const, label: 'Driver / Owner', Icon: Truck },
                      { id: 'assistant' as const, label: 'Assistant', Icon: Users },
                    ].map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setRole(id)}
                        className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                          role === id
                            ? 'border-[#0B2545] bg-[#0B2545]/5 text-[#0B2545]'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span className="whitespace-nowrap">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Brice Fotso"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545]/20 focus:border-[#0B2545]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Phone (Cameroon)</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+237 6XX XXX XXX"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545]/20 focus:border-[#0B2545]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Primary City</label>
                    <select
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#0B2545]/20 focus:border-[#0B2545]"
                    >
                      {CAMEROON_CITIES.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {role !== 'customer' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {role === 'driver' ? 'Driver License / ID' : 'National ID Number'}
                      </label>
                      <input
                        type="text"
                        required
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        placeholder="e.g. CM-LT-90241"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545]/20 focus:border-[#0B2545]"
                      />
                    </div>
                  )}
                </div>

                {role !== 'customer' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Experience & Service Notes
                    </label>
                    <input
                      type="text"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Years of experience, neighborhoods covered..."
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545]/20 focus:border-[#0B2545]"
                    />
                  </div>
                )}
              </>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@movecam.cm"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545]/20 focus:border-[#0B2545]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0B2545]/20 focus:border-[#0B2545]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-[#0B2545] hover:bg-[#13315C] text-yellow-300 font-semibold text-sm rounded-lg transition-colors disabled:opacity-60 whitespace-nowrap"
            >
              {loading
                ? 'Processing...'
                : mode === 'login'
                  ? 'Sign In'
                  : role === 'customer'
                    ? 'Create Customer Account'
                    : 'Submit Partner Registration'}
            </button>
          </form>

          {mode === 'login' && (
            <div className="mt-6 pt-5 border-t border-slate-200">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-2.5">
                <ShieldCheck className="w-4 h-4 text-[#0B2545]" />
                <span>Quick Role Access (Seeded Accounts)</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acct) => (
                  <button
                    key={acct.role}
                    type="button"
                    disabled={loading}
                    onClick={() => void handleLogin(acct.email, acct.password)}
                    className="text-left p-2.5 rounded-lg border border-slate-200 hover:border-[#0B2545] hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-xs font-bold text-[#0B2545]">{acct.label}</div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">{acct.hint}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
