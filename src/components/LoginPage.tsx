import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import {
  Sparkles,
  Building2,
  Lock,
  Mail,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const success = await login(email, password);
    if (!success) {
      setError('Invalid credentials. Please select one of the pre-configured test users below.');
    }
  };

  const handleSelectTestUser = (testEmail: string) => {
    setEmail(testEmail);
    login(testEmail, 'password123');
  };

  const testAccounts = [
    {
      org: 'Northside Health',
      slug: 'northside-health',
      name: 'Sarah Chen',
      role: 'Admin / Risk Lead',
      email: 'sarah@northside-health.test',
      badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    },
    {
      org: 'Northside Health',
      slug: 'northside-health',
      name: 'Dr. Marcus Vance',
      role: 'Internal Medicine',
      email: 'marcus@northside-health.test',
      badgeColor: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    },
    {
      org: 'Valley Primary Care',
      slug: 'valley-primary-care',
      name: 'Dr. Elena Sorensen',
      role: 'Admin / Medical Director',
      email: 'elena@valley-primary-care.test',
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      org: 'Valley Primary Care',
      slug: 'valley-primary-care',
      name: 'David Park',
      role: 'Risk Lead',
      email: 'david@valley-primary-care.test',
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    },
    {
      org: 'Metro Cardiology',
      slug: 'metro-cardiology',
      name: 'Dr. Marcus Brody',
      role: 'Cardiologist',
      email: 'marcus@metro-cardiology.test',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    },
  ];

  return (
    <div className="min-h-screen bg-[#0F0F11] flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-zinc-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-600/20 mb-3 font-bold text-lg">
          TC
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">TeamChat AI</h1>
        <p className="mt-1 text-xs text-zinc-400">
          Multi-Tenant Collaborative Intelligence Platform
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-[#18181B] py-8 px-6 sm:px-8 rounded-2xl border border-white/5 shadow-2xl space-y-6">
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {error && (
              <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300">
                {error}
              </div>
            )}

            <div>
              <label className="block text-zinc-300 font-medium mb-1">Email address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. sarah@northside-health.test"
                  className="w-full bg-[#0F0F11] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-zinc-300 font-medium mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0F0F11] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all"
            >
              <span>{isLoading ? 'Authenticating...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Test Accounts Grid */}
          <div className="pt-4 border-t border-white/5">
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>1-Click Test Evaluation Logins:</span>
            </div>

            <div className="space-y-2">
              {testAccounts.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => handleSelectTestUser(acc.email)}
                  className="w-full text-left p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <div className="font-semibold text-xs text-white flex items-center gap-2">
                      <span>{acc.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded border ${acc.badgeColor}`}>
                        {acc.org}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      {acc.role} · {acc.email}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-indigo-400 shrink-0 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
