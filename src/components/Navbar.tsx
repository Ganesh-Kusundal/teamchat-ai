import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import { useChat } from '../context/ChatContext.js';
import {
  Building2,
  Users,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  ChevronDown,
  LogOut,
  Sliders,
  CheckCircle2,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface NavbarProps {
  onOpenInspector: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenInspector }) => {
  const {
    user,
    organization,
    allOrganizations,
    orgUsers,
    switchUser,
    switchOrganization,
    logout,
  } = useAuth();
  const { isConnected, resetDemoData } = useChat();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showOrgMenu, setShowOrgMenu] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleReset = async () => {
    if (confirm('Reset all demo messages, presence, and team memory to clean seed state?')) {
      setIsResetting(true);
      await resetDemoData();
      setIsResetting(false);
    }
  };

  return (
    <header className="h-16 bg-[#121316]/95 backdrop-blur-md border-b border-white/10 flex items-center justify-between px-4 sm:px-6 select-none z-20">
      {/* Brand & Multi-Tenant Context */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-tr from-indigo-600 to-indigo-500 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-sm border border-white/10">
            TC
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm leading-none text-white tracking-tight">TeamChat AI</span>
              <span className="text-[10px] text-indigo-400 font-mono tracking-wider">
                {organization?.slug ? `${organization.slug}.cloud` : 'v2026.1'}
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 font-normal mt-0.5">Collaborative Clinical & Risk Intelligence</p>
          </div>
        </div>

        <div className="h-4 w-px bg-white/10 mx-1 hidden md:block" />

        {/* Tenant Organization Selector */}
        <div className="relative hidden sm:block">
          <button
            id="org-switcher-button"
            onClick={() => {
              setShowOrgMenu(!showOrgMenu);
              setShowUserMenu(false);
            }}
            aria-label="Switch organization"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-200 transition-all text-xs font-medium cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="max-w-[140px] truncate">{organization?.name || 'Organization'}</span>
            <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 flex items-center gap-1 font-mono">
              <ShieldCheck className="w-2.5 h-2.5" />
              Isolated
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {showOrgMenu && (
            <div className="absolute top-full mt-1.5 left-0 w-72 bg-[#141518] border border-white/10 rounded-xl shadow-2xl p-2 z-30">
              <div className="text-[10px] font-bold text-zinc-400 px-2 py-1 uppercase tracking-wider">
                Switch Organization (Tenant Isolation)
              </div>
              <div className="space-y-1 mt-1">
                {allOrganizations.map((org) => (
                  <button
                    key={org.slug}
                    onClick={() => {
                      switchOrganization(org.slug);
                      setShowOrgMenu(false);
                    }}
                    className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-colors cursor-pointer ${
                      org.slug === organization?.slug
                        ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25'
                        : 'hover:bg-white/5 text-zinc-300'
                    }`}
                  >
                    <div>
                      <div className="font-medium text-white">{org.name}</div>
                      <div className="text-[10px] text-zinc-400 font-mono">
                        Slug: {org.slug} {org.baseRate ? `· Base: $${org.baseRate.toLocaleString()}` : ''}
                      </div>
                    </div>
                    {org.slug === organization?.slug && (
                      <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Action Tools & User Profile */}
      <div className="flex items-center gap-2.5">
        {/* Real-time SSE Connection Pill */}
        <div
          title={isConnected ? 'Connected to Real-Time SSE Event Stream' : 'Reconnecting to SSE...'}
          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            isConnected
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
          }`}
        >
          {isConnected ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Real-Time SSE</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3 text-amber-400" />
              <span>Connecting...</span>
            </>
          )}
        </div>

        {/* Tenant & Clinical Risk Inspector Button */}
        <button
          id="btn-open-inspector"
          onClick={onOpenInspector}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-200 hover:text-white border border-white/10 text-xs font-medium transition-all"
        >
          <Sliders className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden sm:inline">Tenant & Risk Tools</span>
        </button>

        {/* Reset Demo Data Button */}
        <button
          id="btn-reset-demo"
          onClick={handleReset}
          disabled={isResetting}
          title="Reset messages and memory to fresh seed state"
          className="p-1.5 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin text-indigo-400' : ''}`} />
        </button>

        {/* User Switcher Dropdown */}
        <div className="relative">
          <button
            id="user-profile-button"
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowOrgMenu(false);
            }}
            className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/5 transition-all text-left"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-xs text-white border border-white/10">
              {user?.avatar || user?.name?.slice(0, 2).toUpperCase() || 'U'}
            </div>
            <div className="hidden sm:block">
              <div className="text-xs font-medium text-white leading-tight flex items-center gap-1">
                <span>{user?.name}</span>
                <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1 rounded">
                  {user?.role}
                </span>
              </div>
              <div className="text-[10px] text-zinc-400 truncate max-w-[120px]">
                {user?.title || user?.email}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {showUserMenu && (
            <div className="absolute top-full mt-1.5 right-0 w-72 bg-[#18181B] border border-white/10 rounded-xl shadow-2xl p-2 z-30">
              <div className="p-2 border-b border-white/5">
                <div className="font-semibold text-white text-xs">{user?.name}</div>
                <div className="text-zinc-400 text-[11px]">{user?.email}</div>
                <div className="text-[11px] text-indigo-400 mt-0.5">{user?.title}</div>
              </div>

              {/* Quick Switch User within same Organization */}
              <div className="py-2 border-b border-white/5">
                <div className="text-[10px] font-bold text-zinc-500 px-2 uppercase tracking-widest">
                  Switch Active Teammate ({organization?.name})
                </div>
                <div className="space-y-1 mt-1">
                  {orgUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        switchUser(u);
                        setShowUserMenu(false);
                      }}
                      className={`w-full text-left p-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        u.id === user?.id
                          ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                          : 'hover:bg-white/5 text-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-white/10 text-[10px] flex items-center justify-center font-bold text-white">
                          {u.name.slice(0, 2)}
                        </span>
                        <div>
                          <div className="font-medium text-white">{u.name}</div>
                          <div className="text-[10px] text-zinc-400">{u.title}</div>
                        </div>
                      </div>
                      {u.id === user?.id && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-1">
                <button
                  id="btn-logout"
                  onClick={() => {
                    logout();
                    setShowUserMenu(false);
                  }}
                  className="w-full p-1.5 rounded-lg text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
