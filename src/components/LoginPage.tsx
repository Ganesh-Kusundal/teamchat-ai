import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../services/api.js';
import {
  Sparkles,
  Building2,
  Lock,
  Mail,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

interface DemoAccount { email: string; name: string; role: string; orgSlug: string; title?: string; }

const orgLabel = (orgSlug: string) =>
  orgSlug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export const LoginPage: React.FC = () => {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [testAccounts, setTestAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    api('/api/demo/accounts').then((r) => (r.ok ? r.json() : [])).then(setTestAccounts).catch(() => {});
  }, []);

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

  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>('all');

  const filteredAccounts = selectedOrgFilter === 'all'
    ? testAccounts
    : testAccounts.filter((acc) => acc.orgSlug === selectedOrgFilter);

  return (
    <div className="min-h-screen bg-[#0C0D10] relative overflow-hidden flex flex-col justify-center py-10 sm:px-6 lg:px-8 text-zinc-100">
      {/* Ambient background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-indigo-600/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-[350px] h-[250px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-xl shadow-indigo-600/25 mb-3 font-bold text-lg border border-white/10">
          TC
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
          <span>TeamChat AI</span>
          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            Enterprise
          </span>
        </h1>
        <p className="mt-1 text-xs text-zinc-400">
          Multi-Tenant Collaborative Intelligence Platform
        </p>
      </div>

      <div className="mt-7 sm:mx-auto sm:w-full sm:max-w-lg px-4 relative z-10">
        <div className="bg-[#141518]/90 backdrop-blur-xl py-7 px-6 sm:px-8 rounded-2xl border border-white/10 shadow-2xl shadow-black/50 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            {error && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="login-email" className="block text-zinc-300 font-medium mb-1">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={testAccounts[0] ? `e.g. ${testAccounts[0].email}` : 'e.g. you@example.test'}
                  className="w-full bg-[#0C0D10] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-xs transition-colors"
                />
              </div>
            </div>

            <div>
              <label htmlFor="login-password" className="block text-zinc-300 font-medium mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  id="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#0C0D10] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 text-xs transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !email.trim()}
              className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-[0.99] disabled:opacity-50 text-white font-semibold text-xs shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <span>{isLoading ? 'Authenticating...' : 'Sign In'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Test Accounts Grid */}
          <div className="pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>1-Click Test Evaluation Logins:</span>
              </div>
              <span className="text-[10px] text-zinc-500 font-mono">
                {filteredAccounts.length} personas
              </span>
            </div>

            {/* Tenant Filter Pills */}
            <div className="flex items-center gap-1.5 mb-3 overflow-x-auto pb-1 no-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedOrgFilter('all')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  selectedOrgFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
              >
                All Orgs
              </button>
              <button
                type="button"
                onClick={() => setSelectedOrgFilter('northside-health')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  selectedOrgFilter === 'northside-health'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
              >
                Northside (4)
              </button>
              <button
                type="button"
                onClick={() => setSelectedOrgFilter('valley-primary-care')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  selectedOrgFilter === 'valley-primary-care'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
              >
                Valley (3)
              </button>
              <button
                type="button"
                onClick={() => setSelectedOrgFilter('metro-cardiology')}
                className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                  selectedOrgFilter === 'metro-cardiology'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                }`}
              >
                Metro (1)
              </button>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {filteredAccounts.map((acc) => (
                <button
                  key={acc.email}
                  onClick={() => handleSelectTestUser(acc.email)}
                  className="w-full text-left p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 transition-all flex items-center justify-between group cursor-pointer"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-semibold text-xs text-white flex items-center gap-2 truncate">
                      <span className="truncate">{acc.name}</span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded border shrink-0 font-medium ${acc.orgSlug === 'valley-primary-care' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'}`}>
                        {orgLabel(acc.orgSlug)}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400 mt-0.5 truncate font-mono">
                      {acc.role} · {acc.email}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-500 group-hover:text-indigo-400 group-hover:translate-x-0.5 shrink-0 transition-all" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
