import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { useChat } from '../context/ChatContext.js';
import { useAuth } from '../context/AuthContext.js';
import { Message, ToolCallRecord, TypingUser } from '../types.js';
import {
  Hash,
  Send,
  Sparkles,
  Bot,
  Terminal,
  ChevronDown,
  ChevronRight,
  Reply,
  X,
  Users,
  AlertCircle,
  HelpCircle,
  Wand2,
  Check,
  CheckCheck,
  Activity,
  Loader2,
} from 'lucide-react';

const AI_THINKING_STEPS = [
  'Parsing clinical query & patient identifiers...',
  'Checking active encounter documentation & lab records...',
  'Evaluating CMS-HCC V28 risk adjustment guidelines...',
  'Verifying hierarchy rules & unrecaptured care gaps...',
  'Formulating cross-member clinical recommendations...',
];

interface AiThinkingProgressProps {
  toolCalls?: ToolCallRecord[];
}

export const AiThinkingProgress: React.FC<AiThinkingProgressProps> = ({ toolCalls = [] }) => {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % AI_THINKING_STEPS.length);
    }, 1600);
    return () => clearInterval(timer);
  }, []);

  const runningTool = toolCalls.find((t) => t.status === 'running');

  return (
    <div className="py-2.5 px-3.5 rounded-xl bg-[#141519] border border-indigo-500/30 shadow-lg shadow-indigo-950/40 space-y-2.5 my-1">
      {/* Header & Status */}
      <div className="flex items-center justify-between text-xs flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center w-5 h-5 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-300" />
          </div>
          <span className="font-medium bg-gradient-to-r from-indigo-200 via-purple-200 to-pink-200 bg-clip-text text-transparent">
            {runningTool
              ? `Executing ${runningTool.toolName.replace(/_/g, ' ')}...`
              : 'Gemini AI is analyzing clinical data...'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-950/70 border border-indigo-500/25 text-[10px] text-indigo-300 font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping inline-block" />
          <span>Processing</span>
        </div>
      </div>

      {/* Futuristic Indeterminate Progress Bar */}
      <div className="relative w-full h-1.5 bg-white/5 rounded-full overflow-hidden border border-white/10">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 rounded-full animate-progress-indeterminate shadow-sm shadow-indigo-500/50" />
      </div>

      {/* Dynamic Subtext Step */}
      <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-0.5">
        <span className="flex items-center gap-1.5 text-zinc-300 italic">
          <Activity className="w-3 h-3 text-cyan-400 shrink-0 animate-pulse" />
          <span className="transition-all duration-300">
            {runningTool
              ? `Querying ${runningTool.toolName} with parameters...`
              : AI_THINKING_STEPS[stepIndex]}
          </span>
        </span>
        <span className="text-[10px] text-zinc-500 font-mono hidden sm:inline-block">
          CMS-HCC V28 Engine
        </span>
      </div>
    </div>
  );
};

interface ReadStatusIndicatorProps {
  message: Message;
  currentUserId?: string;
  roomMemberIds?: string[];
}

const ReadStatusIndicator: React.FC<ReadStatusIndicatorProps> = ({
  message,
  currentUserId,
  roomMemberIds = [],
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isMe = message.senderId === currentUserId;
  const readers = (message.readBy || []).filter((r) => r.userId !== message.senderId);
  const otherMembersCount = Math.max(
    1,
    roomMemberIds.filter((id) => id !== message.senderId).length
  );
  const isAllSeen = readers.length > 0 && readers.length >= otherMembersCount;

  if (message.isAi) return null;

  if (readers.length === 0) {
    if (!isMe) return null;
    return (
      <span
        title="Sent • Delivered to room"
        className="inline-flex items-center gap-1 text-[11px] text-zinc-500 select-none ml-auto opacity-70"
      >
        <Check className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-[10px] text-zinc-500 font-mono">Sent</span>
      </span>
    );
  }

  // Format summary label
  const firstReaderName = readers[0].userName.split(' ')[0];
  const summaryLabel =
    isAllSeen && readers.length > 1
      ? `Read by all (${readers.length})`
      : readers.length === 1
      ? `Read by ${firstReaderName}`
      : `Read by ${firstReaderName} +${readers.length - 1}`;

  return (
    <div className="relative inline-flex items-center ml-auto">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip((prev) => !prev)}
        aria-label="View read receipts"
        className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-all border ${
          isMe
            ? isAllSeen
              ? 'text-cyan-300 bg-cyan-950/60 border-cyan-800/40 hover:bg-cyan-900/60 hover:border-cyan-700/60'
              : 'text-indigo-300 bg-indigo-950/60 border-indigo-800/40 hover:bg-indigo-900/60 hover:border-indigo-700/60'
            : 'text-zinc-400 bg-white/5 border-white/10 hover:bg-white/10 hover:text-zinc-300'
        }`}
      >
        <CheckCheck
          className={`w-3.5 h-3.5 shrink-0 ${
            isMe
              ? isAllSeen
                ? 'text-cyan-400'
                : 'text-indigo-400'
              : 'text-zinc-400'
          }`}
        />
        <span className="font-medium tracking-tight whitespace-nowrap">{summaryLabel}</span>
      </button>

      {/* Floating Read Receipts Tooltip */}
      {showTooltip && (
        <div className="absolute right-0 bottom-full mb-1.5 z-30 w-52 p-2.5 rounded-xl bg-[#1C1C20] border border-white/15 shadow-2xl backdrop-blur text-left pointer-events-none">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-white/10 text-[11px] font-semibold text-zinc-200">
            <span>Read Receipts</span>
            <span className="text-[10px] text-zinc-400 font-mono">
              {readers.length}/{otherMembersCount} seen
            </span>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto">
            {readers.map((r) => (
              <div key={r.userId} className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-zinc-200 truncate mr-2">{r.userName}</span>
                <span className="text-[10px] text-zinc-500 font-mono shrink-0">
                  {new Date(r.readAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Generate consistent vibrant avatar colors matching the theme mockup
export const getAvatarColor = (id?: string) => {
  if (!id) return 'bg-indigo-500';
  if (id.includes('sarah')) return 'bg-indigo-500';
  if (id.includes('mike')) return 'bg-purple-500';
  if (id.includes('lisa')) return 'bg-pink-500';
  if (id.includes('elena') || id.includes('marcus')) return 'bg-emerald-600';
  return 'bg-indigo-600';
};

interface TypingIndicatorProps {
  typingUsers: TypingUser[];
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ typingUsers }) => {
  if (!typingUsers || typingUsers.length === 0) return null;

  const formatTypingText = () => {
    if (typingUsers.length === 1) {
      return (
        <span>
          <strong className="font-semibold text-zinc-200">{typingUsers[0].userName}</strong> is typing...
        </span>
      );
    }
    if (typingUsers.length === 2) {
      return (
        <span>
          <strong className="font-semibold text-zinc-200">{typingUsers[0].userName}</strong> and{' '}
          <strong className="font-semibold text-zinc-200">{typingUsers[1].userName}</strong> are typing...
        </span>
      );
    }
    return (
      <span>
        <strong className="font-semibold text-zinc-200">{typingUsers[0].userName}</strong>,{' '}
        <strong className="font-semibold text-zinc-200">{typingUsers[1].userName}</strong>, and{' '}
        {typingUsers.length - 2} other{typingUsers.length - 2 > 1 ? 's' : ''} are typing...
      </span>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.96 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="flex items-center gap-2.5 py-1.5 px-3.5 rounded-full bg-[#18181C]/90 border border-white/10 shadow-lg backdrop-blur-sm max-w-fit"
        id="typing-indicator"
      >
        {/* Avatars Stack */}
        <div className="flex -space-x-1.5 overflow-hidden shrink-0">
          {typingUsers.slice(0, 3).map((u) => (
            <div
              key={u.userId}
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-1 ring-[#0F0F11] ${getAvatarColor(
                u.userId
              )}`}
              title={u.userName}
            >
              {u.userName.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>

        {/* Triple animated wave dots */}
        <div className="flex items-center gap-1">
          <span
            className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
            style={{ animationDuration: '0.9s', animationDelay: '0ms' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
            style={{ animationDuration: '0.9s', animationDelay: '150ms' }}
          />
          <span
            className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
            style={{ animationDuration: '0.9s', animationDelay: '300ms' }}
          />
        </div>

        {/* Dynamic Text */}
        <div className="text-xs text-zinc-300 tracking-tight">
          {formatTypingText()}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

interface ChatAreaProps {
  onOpenInspector: () => void;
  onOpenRoomMembers?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({ onOpenInspector, onOpenRoomMembers }) => {
  const {
    currentRoom,
    messages,
    sendMessage,
    typingUsers,
    setTypingStatus,
    isLoadingMessages,
    isAiThinking,
  } = useChat();
  const { user } = useAuth();

  const [inputContent, setInputContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom on new message, stream chunk, or AI thinking state
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers, isAiThinking]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputContent.trim()) return;

    const content = inputContent;
    setInputContent('');
    const replyTarget = replyingTo || undefined;
    setReplyingTo(null);

    await sendMessage(content, replyTarget);
    setTypingStatus(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else {
      setTypingStatus(true);
    }
  };

  const insertMention = (tag: string) => {
    setInputContent((prev) => {
      const space = prev.length > 0 && !prev.endsWith(' ') ? ' ' : '';
      return `${prev}${space}${tag} `;
    });
    textareaRef.current?.focus();
  };

  const toggleToolExpand = (toolId: string) => {
    setExpandedTools((prev) => ({
      ...prev,
      [toolId]: !prev[toolId],
    }));
  };

  if (!currentRoom) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0F0F11] text-zinc-400 p-8">
        <Users className="w-12 h-12 text-zinc-600 mb-3" />
        <h3 className="text-base font-semibold text-zinc-300">Select or create a room</h3>
        <p className="text-xs text-zinc-500 mt-1">Choose a channel from the left sidebar to begin collaborating.</p>
      </div>
    );
  }

  return (
    <main className="flex-1 flex flex-col h-full bg-[#0F0F11] relative min-w-0 overflow-hidden">
      {/* Room Header */}
      <header className="h-16 border-b border-white/5 px-6 sm:px-8 flex items-center justify-between bg-[#0F0F11]/90 backdrop-blur shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg font-semibold text-white tracking-tight truncate">
              #{currentRoom.name}
            </h2>
            {currentRoom.isPrivate && (
              <span className="text-[10px] bg-white/5 text-zinc-400 px-1.5 py-0.5 rounded font-mono">
                Private
              </span>
            )}
            <button
              onClick={onOpenRoomMembers}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white border border-white/5 text-xs transition-colors"
              title="View & manage room members"
            >
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span className="font-mono text-[11px]">{currentRoom.memberIds?.length || 1}</span>
            </button>
          </div>

          {currentRoom.description && (
            <>
              <div className="h-4 w-px bg-white/10 hidden sm:block" />
              <p className="text-xs text-zinc-500 truncate hidden sm:block max-w-md">
                {currentRoom.description}
              </p>
            </>
          )}
        </div>

        {/* Quick Hint / Invocation Banner */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => insertMention('@Gemini')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 text-xs font-medium transition-all"
            title="Invoke Gemini AI directly into this team conversation"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>@Gemini</span>
          </button>
        </div>
      </header>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-6">
        {isLoadingMessages && messages.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-xs text-zinc-500">
            Loading room messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/5 text-indigo-400 mx-auto flex items-center justify-center mb-3 border border-white/5">
              <Hash className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white">Welcome to #{currentRoom.name}!</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto mt-1">
              This room is isolated to your organization. Start chatting or mention{' '}
              <span className="text-indigo-300 font-medium">@Gemini</span> to collaborate with AI.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.senderId === user?.id;
            const isAi = msg.isAi;

            return (
              <div
                key={msg.id}
                id={`message-${msg.id}`}
                className={`group flex gap-4 transition-colors ${
                  isAi
                    ? 'bg-gradient-to-r from-indigo-950/20 via-indigo-950/10 to-transparent p-4 rounded-xl border border-indigo-500/25 shadow-lg shadow-indigo-950/20'
                    : 'p-1.5 rounded-lg hover:bg-white/[0.02]'
                }`}
              >
                {/* Avatar */}
                <div className="shrink-0 mt-0.5">
                  {isAi ? (
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-600 flex-shrink-0 flex items-center justify-center text-white shadow-md border border-indigo-400/20">
                      <Bot className="w-5 h-5" />
                    </div>
                  ) : (
                    <div
                      className={`w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold text-white shadow-sm border border-white/5 ${getAvatarColor(
                        msg.senderId
                      )}`}
                    >
                      {msg.senderName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Message Body */}
                <div className="flex-1 min-w-0">
                  {/* Sender & Timestamp & Read Status */}
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span
                      className={`text-sm font-semibold tracking-tight ${
                        isAi ? 'text-white flex items-center gap-1.5' : 'text-zinc-100'
                      }`}
                    >
                      {isAi ? 'Gemini AI' : msg.senderName}
                    </span>

                    {isAi && (
                      <span className="text-[9px] text-indigo-300 font-medium px-1.5 py-0.2 rounded bg-indigo-500/15 border border-indigo-500/20 tracking-wider font-mono">
                        CO-PILOT
                      </span>
                    )}

                    {msg.senderRole && !isAi && (
                      <span className="text-[10px] text-zinc-400 font-mono">
                        {msg.senderRole}
                      </span>
                    )}

                    <span className="text-[10px] text-zinc-400 font-mono">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    {/* Read Status Indicator */}
                    <ReadStatusIndicator
                      message={msg}
                      currentUserId={user?.id}
                      roomMemberIds={currentRoom?.memberIds}
                    />

                    {/* Quick Reply Button */}
                    {!isAi && (
                      <button
                        onClick={() => setReplyingTo(msg)}
                        aria-label="Reply to message"
                        title="Reply to message"
                        className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-indigo-300 hover:bg-white/5 rounded transition-all cursor-pointer"
                      >
                        <Reply className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Reply Reference Snippet */}
                  {msg.replyToSnippet && (
                    <div className="mb-2 pl-2 border-l-2 border-indigo-500/40 text-[11px] text-zinc-400 italic bg-white/5 py-0.5 rounded-r">
                      ↳ {msg.replyToSnippet}
                    </div>
                  )}

                  {/* Tool Invocations Drawer (If Gemini called tools) */}
                  {isAi && msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mb-3 space-y-1.5">
                      {msg.toolCalls.map((tc: ToolCallRecord) => {
                        const isExpanded = Boolean(expandedTools[tc.id]);
                        return (
                          <div
                            key={tc.id}
                            className="rounded-lg border border-white/5 bg-[#18181B] overflow-hidden text-xs"
                          >
                            <button
                              onClick={() => toggleToolExpand(tc.id)}
                              className="w-full px-2.5 py-1.5 flex items-center justify-between text-left hover:bg-white/5 transition-colors"
                            >
                              <div className="flex items-center gap-2 text-indigo-300 font-mono text-[11px]">
                                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                                <span>Invoked tool: {tc.toolName}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20 font-mono">
                                  {tc.status}
                                </span>
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                                )}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="p-2.5 border-t border-white/5 bg-[#0F0F11] font-mono text-[11px] text-zinc-300 space-y-2">
                                <div>
                                  <span className="text-zinc-500 block mb-0.5">Parameters:</span>
                                  <pre className="bg-[#18181B] p-2 rounded overflow-x-auto text-[10px] text-indigo-200 border border-white/5">
                                    {JSON.stringify(tc.args, null, 2)}
                                  </pre>
                                </div>
                                {tc.result && (
                                  <div>
                                    <span className="text-zinc-500 block mb-0.5">Output Data:</span>
                                    <pre className="bg-[#18181B] p-2 rounded overflow-x-auto text-[10px] text-emerald-300 max-h-40 border border-white/5">
                                      {JSON.stringify(tc.result, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Message Content */}
                  {isAi ? (
                    <div className="text-sm text-zinc-200 leading-relaxed space-y-3 prose prose-invert prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-headings:text-white prose-ul:my-1 prose-table:my-2">
                      {msg.isStreaming && (!msg.content || !msg.content.trim()) ? (
                        <AiThinkingProgress toolCalls={msg.toolCalls} />
                      ) : (
                        <>
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                          {msg.isStreaming && (
                            <span className="inline-block w-2 h-3 ml-1 bg-indigo-400 animate-pulse align-middle" />
                          )}
                        </>
                      )}

                      {/* Grounding Provenance Footer */}
                      {msg.toolCalls && msg.toolCalls.length > 0 && !msg.isStreaming && (
                        <div className="mt-3 pt-2.5 border-t border-white/5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 not-prose">
                          <span className="flex items-center gap-1 text-indigo-300 font-medium">
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                            Grounded in:
                          </span>
                          {msg.toolCalls.map((tc: ToolCallRecord) => (
                            <span
                              key={tc.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-zinc-300 font-mono"
                            >
                              • {tc.toolName.replace(/_/g, ' ')}
                            </span>
                          ))}
                          <span className="text-[9px] text-zinc-500 font-mono ml-auto">
                            teamchat-seed-2026.1
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-300 whitespace-pre-wrap break-words leading-relaxed">
                      {msg.content}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Optimistic AI Thinking Card (displayed instantly when user triggers @Gemini before server stream starts) */}
        {isAiThinking && !messages.some((m) => m.isAi && m.isStreaming) && (
          <div
            id="optimistic-ai-thinking"
            className="group flex gap-4 transition-all bg-gradient-to-r from-indigo-950/20 via-indigo-950/10 to-transparent p-4 rounded-xl border border-indigo-500/25 shadow-lg shadow-indigo-950/20 animate-pulse-glow"
          >
            <div className="shrink-0 mt-0.5">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-600 to-blue-600 flex-shrink-0 flex items-center justify-center text-white shadow-md border border-indigo-400/20">
                <Bot className="w-5 h-5" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-sm font-semibold tracking-tight text-white flex items-center gap-1.5">
                  Gemini AI
                </span>
                <span className="text-[9px] text-indigo-300 font-medium px-1.5 py-0.2 rounded bg-indigo-500/15 border border-indigo-500/20 tracking-wider font-mono">
                  CO-PILOT
                </span>
                <span className="text-[10px] text-zinc-400 font-mono">
                  Just now
                </span>
              </div>
              <AiThinkingProgress />
            </div>
          </div>
        )}

        {/* Real-time Typing Indicator in message stream */}
        {typingUsers.length > 0 && (
          <div className="pt-2">
            <TypingIndicator typingUsers={typingUsers} />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Live Typing Banner */}
      {typingUsers.length > 0 && (
        <div className="px-8 py-1.5 bg-[#0F0F11] text-[10px] text-zinc-500 italic flex items-center gap-2 shrink-0">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce delay-100" />
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce delay-200" />
          </div>
          <span>
            {typingUsers.map((u) => u.userName).join(', ')}{' '}
            {typingUsers.length === 1 ? 'is typing...' : 'are typing...'}
          </span>
        </div>
      )}

      {/* Composer Area */}
      <div className="p-6 bg-gradient-to-t from-[#0F0F11] via-[#0F0F11] to-transparent shrink-0">
        {/* Reply Preview Bar */}
        {replyingTo && (
          <div className="mb-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between text-xs text-zinc-300">
            <div className="flex items-center gap-2 truncate">
              <Reply className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-medium text-white">Replying to {replyingTo.senderName}:</span>
              <span className="text-zinc-400 truncate">{replyingTo.content}</span>
            </div>
            <button
              onClick={() => setReplyingTo(null)}
              className="p-1 text-zinc-400 hover:text-white rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Suggested Prompts Pill Row */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 text-[11px] no-scrollbar">
          <span className="text-zinc-500 shrink-0 flex items-center gap-1">
            <Wand2 className="w-3 h-3 text-indigo-400" /> Suggestions:
          </span>
          <button
            onClick={() => setInputContent('@Gemini lookup I50.32')}
            className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white shrink-0 transition-colors border border-white/5"
          >
            @Gemini lookup I50.32
          </button>
          <button
            onClick={() => setInputContent('@Gemini calculate RAF for E11.22 and N18.4')}
            className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white shrink-0 transition-colors border border-white/5"
          >
            @Gemini calculate RAF E11.22 + N18.4
          </button>
          <button
            onClick={() => setInputContent('@Gemini evaluate patient PT-4001')}
            className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white shrink-0 transition-colors border border-white/5"
          >
            @Gemini evaluate PT-4001
          </button>
          <button
            onClick={() => setInputContent('@Gemini what is our Q1 recapture target?')}
            className="px-2.5 py-1 rounded-md bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white shrink-0 transition-colors border border-white/5"
          >
            @Gemini recall Q1 target
          </button>
        </div>

        {/* Text Area & Action Buttons */}
        <form
          onSubmit={handleSend}
          className="bg-[#141518] border border-white/10 rounded-xl p-3 flex flex-col shadow-2xl focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all"
        >
          <textarea
            ref={textareaRef}
            id="chat-message-input"
            aria-label="Message composer"
            rows={2}
            value={inputContent}
            onChange={(e) => setInputContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Type a message or mention @Gemini to collaborate with AI...`}
            className="bg-transparent border-none resize-none text-sm focus:outline-none text-zinc-100 placeholder:text-zinc-500 h-12 leading-relaxed"
          />

          <div className="flex justify-between items-center mt-2 border-t border-white/10 pt-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => insertMention('@Gemini')}
                className="px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-indigo-400" />
                <span>@Gemini</span>
              </button>
              <span className="text-[10px] text-zinc-500 hidden md:inline font-mono">
                Press Enter to send · Shift+Enter for new line
              </span>
            </div>

            <button
              type="submit"
              id="btn-send-message"
              disabled={!inputContent.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-40 disabled:hover:bg-indigo-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
      </div>
    </main>
  );
};
