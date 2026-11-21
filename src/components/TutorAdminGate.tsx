import React, { useState } from 'react';
import { Lock, ShieldAlert, ArrowLeft, KeyRound, Mail, Eye, EyeOff } from 'lucide-react';
import { UserProfile } from '../types';

interface TutorAdminGateProps {
  currentUser: UserProfile | null;
  onAdminLoginSuccess: (user: UserProfile) => void;
  onBackToLanding: () => void;
  onLogout: () => void;
}

export const TutorAdminGate: React.FC<TutorAdminGateProps> = ({
  currentUser,
  onAdminLoginSuccess,
  onBackToLanding,
  onLogout,
}) => {
  const [email, setEmail] = useState('amina.wambui@lughasmart.ac.ke');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a student account is currently signed in, block access
  if (currentUser && (currentUser.role !== 'tutor' || !currentUser.isAdmin)) {
    return (
      <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white border border-red-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="bg-red-600 text-white px-6 py-5">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-red-100 mb-1">
              <ShieldAlert className="w-4 h-4" />
              <span>403 Forbidden · Unauthorized Role</span>
            </div>
            <h1 className="font-display text-xl font-semibold">
              Student Accounts Cannot Access Tutor Portal
            </h1>
          </div>
          <div className="p-6 space-y-4 text-sm text-[#52525B]">
            <p>
              You are currently signed in as <strong className="text-[#18181B]">{currentUser.email}</strong> ({currentUser.role}). Sign out first to authenticate with a certified Tutor & Admin account.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onLogout}
                className="flex-1 py-2.5 bg-[#18181B] hover:bg-[#27272A] text-white font-semibold rounded-xl text-xs cursor-pointer"
              >
                Sign Out & Switch Account
              </button>
              <button
                type="button"
                onClick={onBackToLanding}
                className="px-4 py-2.5 border border-[#E5E3DC] hover:bg-[#F3F2EE] text-[#18181B] font-medium rounded-xl text-xs cursor-pointer"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password || !pin.trim()) {
      setError('Admin Email, Password, and 6-digit Security PIN are all required.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/tutor-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          pin: pin.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user) {
        setError(data.error || 'Invalid Admin Email, Password, or Security PIN.');
        return;
      }

      onAdminLoginSuccess(data.user as UserProfile);
    } catch {
      setError('Unable to reach authentication server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-[#E5E3DC] rounded-2xl shadow-sm overflow-hidden">
        <div className="bg-[#18181B] text-white px-6 py-5">
          <div className="flex items-center gap-2 text-xs font-mono text-[#34D399] uppercase tracking-wider mb-1">
            <Lock className="w-3.5 h-3.5" />
            <span>Restricted Tutor Gateway</span>
          </div>
          <h1 className="font-display text-2xl font-semibold">Tutor Sign In Required</h1>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <p className="text-[#52525B]">
            Authenticate with your authorized staff email, password, and 6-digit security PIN.
          </p>

          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 font-medium">
              {error}
            </div>
          )}

          <div>
            <label className="block font-medium text-[#3F3F46] mb-1">Staff Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="amina.wambui@lughasmart.ac.ke"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#D4D4D8] text-[#18181B]"
              />
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#3F3F46] mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter staff password"
                className="w-full px-3 pr-9 py-2.5 rounded-xl border border-[#D4D4D8] text-[#18181B]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#18181B] cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block font-medium text-[#3F3F46] mb-1">6-Digit Security PIN</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                required
                placeholder="••••••"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-[#D4D4D8] font-mono tracking-widest text-[#18181B]"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#18181B] hover:bg-[#27272A] disabled:opacity-60 text-white font-semibold rounded-xl cursor-pointer"
          >
            {loading ? 'Verifying 3-Factor Credentials...' : 'Sign In to Tutor Console'}
          </button>

          <button
            type="button"
            onClick={onBackToLanding}
            className="w-full py-2 text-[#52525B] hover:text-[#18181B] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Public Landing Page</span>
          </button>
        </form>
      </div>
    </div>
  );
};