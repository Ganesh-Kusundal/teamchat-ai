import React, { useState } from 'react';
import { useChat } from '../context/ChatContext.js';
import { MessageSquarePlus, X, Send, Bot, Sparkles } from 'lucide-react';

interface SimulateMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: { id: string; name: string } | null;
}

export const SimulateMessageModal: React.FC<SimulateMessageModalProps> = ({
  isOpen,
  onClose,
  targetUser,
}) => {
  const { simulateCoParticipantMessage, currentRoom } = useChat();
  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);

  if (!isOpen || !targetUser || !currentRoom) return null;

  const handleSend = async (textToSend?: string) => {
    const message = textToSend || content;
    if (!message.trim()) return;

    setIsSending(true);
    await simulateCoParticipantMessage(targetUser.id, message.trim());
    setIsSending(false);
    setContent('');
    onClose();
  };

  const samplePrompts = [
    `I'm thinking we should consider Redis for caching, but what are the costs? @Gemini`,
    `@Gemini what's the difference between I50.32 and I50.9 under CMS-HCC V28?`,
    `We need to review patient PT-4001 for diabetic kidney disease recapture. @Gemini please analyze.`,
    `@Gemini what is our Q1 recapture target according to our team guidelines?`,
    `Looks good to me! Thanks for clarifying that.`,
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#18181B] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
              <MessageSquarePlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">
                Simulate Co-Worker: {targetUser.name}
              </h3>
              <p className="text-[11px] text-zinc-400">
                Send as {targetUser.name} into #{currentRoom.name} to test multi-user chat
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

        {/* Quick Sample Quotes */}
        <div>
          <label className="block text-zinc-400 text-xs mb-2 font-medium">
            Quick 1-Click Messages:
          </label>
          <div className="space-y-1.5">
            {samplePrompts.map((p, i) => (
              <button
                key={i}
                onClick={() => handleSend(p)}
                className="w-full text-left p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-xs text-zinc-300 transition-colors flex items-center justify-between group"
              >
                <span className="truncate mr-2">"{p}"</span>
                <Send className="w-3.5 h-3.5 text-zinc-500 group-hover:text-indigo-400 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        </div>

        {/* Custom Input */}
        <div className="pt-2">
          <label className="block text-zinc-400 text-xs mb-1.5 font-medium">
            Or type custom message:
          </label>
          <textarea
            rows={2}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`What would ${targetUser.name} say?`}
            className="w-full bg-[#0F0F11] border border-white/10 rounded-lg p-2.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSend()}
            disabled={isSending || !content.trim()}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <span>Send as {targetUser.name.split(' ')[0]}</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
