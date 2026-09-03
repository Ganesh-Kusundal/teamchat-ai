import React, { useState } from 'react';
import { useChat } from '../context/ChatContext.js';
import { useAuth } from '../context/AuthContext.js';
import { Users, UserPlus, UserMinus, X, Shield, Lock } from 'lucide-react';

interface RoomMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const RoomMembersModal: React.FC<RoomMembersModalProps> = ({ isOpen, onClose }) => {
  const { currentRoom } = useChat();
  const { orgUsers, user, token } = useAuth();
  const [loading, setLoading] = useState(false);

  if (!isOpen || !currentRoom) return null;

  const isRoomAdmin = user?.role === 'admin' || currentRoom.createdBy === user?.id;
  const currentMemberIds = currentRoom.memberIds || [];

  const handleToggleMember = async (targetUserId: string, isCurrentlyMember: boolean) => {
    if (!token) return;
    setLoading(true);
    try {
      if (isCurrentlyMember) {
        await fetch(`/api/rooms/${currentRoom.id}/members/${targetUserId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await fetch(`/api/rooms/${currentRoom.id}/members`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId: targetUserId }),
        });
      }
    } catch (err) {
      console.error('Failed to toggle member:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#18181B] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                <span>#{currentRoom.name} Members</span>
                {currentRoom.isPrivate && <Lock className="w-3.5 h-3.5 text-indigo-400" />}
              </h3>
              <p className="text-[11px] text-zinc-400">
                {currentMemberIds.length} of {orgUsers.length} teammates have access
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {orgUsers.map((u) => {
            const isMember = currentMemberIds.includes(u.id);
            const isCreator = currentRoom.createdBy === u.id;

            return (
              <div
                key={u.id}
                className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {u.name.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate flex items-center gap-1.5">
                      <span>{u.name}</span>
                      {isCreator && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-mono">
                          Creator
                        </span>
                      )}
                      {u.role === 'admin' && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                          Admin
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-400 truncate">{u.title || u.email}</div>
                  </div>
                </div>

                {isRoomAdmin && !isCreator && (
                  <button
                    disabled={loading}
                    onClick={() => handleToggleMember(u.id, isMember)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1 transition-all ${
                      isMember
                        ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20'
                        : 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20'
                    }`}
                  >
                    {isMember ? (
                      <>
                        <UserMinus className="w-3 h-3" />
                        <span>Remove</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3 h-3" />
                        <span>Add</span>
                      </>
                    )}
                  </button>
                )}
                {!isRoomAdmin && (
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      isMember ? 'bg-emerald-500/10 text-emerald-400' : 'text-zinc-500'
                    }`}
                  >
                    {isMember ? 'Member' : 'Not Member'}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="pt-2 border-t border-white/5 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
