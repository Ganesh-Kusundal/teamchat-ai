import React, { useState } from 'react';
import { useChat } from '../context/ChatContext.js';
import { Hash, Lock, X } from 'lucide-react';

interface NewRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewRoomModal: React.FC<NewRoomModalProps> = ({ isOpen, onClose }) => {
  const { createRoom } = useChat();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    const room = await createRoom(name.trim(), description.trim(), isPrivate);
    setIsSubmitting(false);

    if (room) {
      setName('');
      setDescription('');
      setIsPrivate(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#18181B] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Hash className="w-5 h-5 text-indigo-400" />
            <span>Create New Channel</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-zinc-300 font-medium mb-1">Channel Name</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-zinc-500 font-bold">#</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) =>
                  setName(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '-'))
                }
                placeholder="e.g. clinical-quality-review"
                className="w-full bg-[#0F0F11] border border-white/10 rounded-lg pl-7 pr-3 py-2 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-300 font-medium mb-1">Description (Optional)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this channel about?"
              className="w-full bg-[#0F0F11] border border-white/10 rounded-lg p-2.5 text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
            <input
              type="checkbox"
              id="isPrivate"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="rounded border-zinc-700 bg-[#0F0F11] text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="isPrivate" className="cursor-pointer">
              <div className="font-medium text-white flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-indigo-400" />
                <span>Private Channel</span>
              </div>
              <div className="text-[11px] text-zinc-400">
                Only invited members of your organization can join.
              </div>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium disabled:opacity-50 transition-colors shadow-sm"
            >
              {isSubmitting ? 'Creating...' : 'Create Channel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
