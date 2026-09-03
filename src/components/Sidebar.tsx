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
    <aside className="w-72 bg-[#18181B] border-r border-white/5 flex flex-col h-full shrink-0 select-none">
      {/* Rooms Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
          <span>Rooms</span>
          <span className="text-[10px] bg-white/5 text-zinc-400 px-1.5 py-0.5 rounded font-mono">
            {rooms.length}
          </span>
        </div>
        <button
          id="btn-add-room"
          onClick={onOpenNewRoom}
          title="Create a new chat room"
          className="text-zinc-500 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
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
              className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between group cursor-pointer transition-all ${
                isActive
                  ? 'bg-indigo-500/10 text-indigo-300 font-medium border border-indigo-500/20'
                  : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                {room.isPrivate ? (
                  <Lock className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-zinc-600'}`} />
                ) : (
                  <Hash className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-indigo-400 font-bold' : 'text-zinc-600'}`} />
                )}
                <span className="truncate">{room.name}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {unreadCount > 0 && !isActive && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500 text-white animate-pulse">
                    {unreadCount}
                  </span>
                )}
                {isActive && <span className="w-2 h-2 rounded-full bg-indigo-400" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Online Team Members (Presence Engine) */}
      <div className="p-4 border-t border-white/5 bg-[#18181B]">
        <div className="flex items-center justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3">
          <span>Presence ({onlineUsers.length || orgUsers.length})</span>
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
            Live
          </span>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto">
          {/* Gemini AI Presence Item */}
          <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[11px] shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-400 animate-pulse border border-[#18181B]" />
              </div>
              <div>
                <div className="text-xs font-medium text-white flex items-center gap-1.5">
                  <span>Gemini AI</span>
                  <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-1 py-0.2 rounded font-mono">
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
                    <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-semibold text-zinc-200">
                      {u.name.slice(0, 2)}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#18181B] ${
                        isOnline
                          ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]'
                          : 'bg-zinc-600'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-zinc-200 truncate flex items-center gap-1">
                      <span>{u.name}</span>
                      {isMe && <span className="text-[9px] text-zinc-500 font-normal">(you)</span>}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate">{u.title}</div>
                  </div>
                </div>

                {/* Instant Simulator Button: send as this coworker */}
                {!isMe && (
                  <button
                    onClick={() => onSimulateMessage(u.id, u.name)}
                    title={`Simulate message from ${u.name}`}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-indigo-500/20 text-indigo-300 transition-all text-[10px] flex items-center gap-1"
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
      <div className="p-3 border-t border-white/5 bg-[#18181B] flex items-center gap-2 text-[11px] text-zinc-400">
        <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="truncate">
          Tenant: <strong className="text-zinc-200 font-mono">{organization?.slug}</strong>
        </span>
      </div>
    </aside>
  );
};
