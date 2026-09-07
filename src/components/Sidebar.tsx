import React from 'react';
import { useChat } from '../context/ChatContext.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Hash,
  Lock,
  Plus,
  Circle,
  MessageSquarePlus,
  Shield,
  Bot,
} from 'lucide-react';

interface SidebarProps {
  onOpenNewRoom: () => void;
  onSimulateMessage: (userId: string, userName: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenNewRoom, onSimulateMessage }) => {
  const { rooms, currentRoom, selectRoom, unreadMap, onlineUsers } = useChat();
  const { organization, orgUsers, user } = useAuth();

  return (
    <aside className="w-72 bg-[#121316] border-r border-white/10 flex flex-col h-full shrink-0 select-none">
      {/* Rooms Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
          <span>Rooms</span>
          <span className="text-[10px] bg-white/5 text-zinc-300 px-1.5 py-0.5 rounded font-mono border border-white/5">
            {rooms.length}
          </span>
        </div>
        <button
          id="btn-add-room"
          onClick={onOpenNewRoom}
          aria-label="Create new chat room"
          title="Create a new chat room"
          className="text-zinc-400 hover:text-white p-1 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Rooms List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {rooms.map((room) => {
          const isActive = currentRoom?.id === room.id;
          const unreadCount = unreadMap[room.id] || 0;

          return (
            <button
              key={room.id}
              id={`room-item-${room.name}`}
              onClick={() => selectRoom(room.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between group cursor-pointer transition-all ${
                isActive
                  ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {room.isPrivate ? (
                  <Lock className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
                ) : (
                  <Hash className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`} />
                )}
                <span className="truncate">{room.name}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {unreadCount > 0 && !isActive && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500 text-white animate-pulse">
                    {unreadCount}
                  </span>
                )}
                {isActive && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Online Team Members (Presence Engine) */}
      <div className="p-4 border-t border-white/10 bg-[#101114]">
        {(() => {
          const onlineCount = orgUsers.filter(
            (u) => onlineUsers.some((p) => p.userId === u.id && p.isOnline) || u.id === user?.id
          ).length;
          return (
            <div className="flex items-center justify-between text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2.5">
              <span>Presence ({onlineCount})</span>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                Live
              </span>
            </div>
          );
        })()}

        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
          {/* Gemini AI Presence Item */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-indigo-950/20 border border-indigo-500/20">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white text-[11px] shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-400 animate-pulse border border-[#121316]" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                  <span>Gemini AI</span>
                  <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 py-0.2 rounded font-mono font-normal">
                    Co-pilot
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400">@mention in room</div>
              </div>
            </div>
          </div>

          {/* Org Users Presence Items */}
          {orgUsers.map((u) => {
            const isMe = u.id === user?.id;
            const isOnline = onlineUsers.some((p) => p.userId === u.id && p.isOnline) || isMe;

            return (
              <div
                key={u.id}
                className="flex items-center justify-between p-1.5 rounded-lg hover:bg-white/5 group transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-semibold text-zinc-200 border border-white/5">
                      {u.name.slice(0, 2)}
                    </div>
                    {isOnline ? (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-[#121316] shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                    ) : (
                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-zinc-600 border border-[#121316]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-200 truncate flex items-center gap-1">
                      <span className="truncate">{u.name}</span>
                      {isMe && <span className="text-[9px] text-zinc-400 font-normal">(you)</span>}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate font-mono">{u.title}</div>
                  </div>
                </div>

                {/* Instant Simulator Button */}
                {!isMe && (
                  <button
                    onClick={() => onSimulateMessage(u.id, u.name)}
                    aria-label={`Simulate message from ${u.name}`}
                    title={`Simulate message from ${u.name}`}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-indigo-500/20 text-indigo-300 transition-all text-[10px] flex items-center gap-1 cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Tenant Partition Badge */}
      <div className="p-3 border-t border-white/10 bg-[#101114] flex items-center gap-2 text-[11px] text-zinc-400">
        <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="truncate">
          Tenant: <strong className="text-zinc-200 font-mono">{organization?.slug}</strong>
        </span>
      </div>
    </aside>
  );
};
