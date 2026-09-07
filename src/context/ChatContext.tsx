import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Room, Message, PresenceRecord, ToolCallRecord, TypingUser } from '../types.js';
import { useAuth } from './AuthContext.js';
import { useToast } from '../components/Toast.js';
import { api, API_BASE } from '../services/api.js';

interface ChatContextType {
  rooms: Room[];
  currentRoom: Room | null;
  messages: Message[];
  onlineUsers: PresenceRecord[];
  typingUsers: TypingUser[];
  unreadMap: Record<string, number>;
  isConnected: boolean;
  isLoadingMessages: boolean;
  isAiThinking: boolean;
  selectRoom: (roomId: string) => void;
  markRoomAsRead: (roomId: string) => Promise<void>;
  sendMessage: (content: string, replyToMessage?: Message) => Promise<void>;
  setTypingStatus: (isTyping: boolean) => void;
  createRoom: (name: string, description: string, isPrivate?: boolean) => Promise<Room | null>;
  simulateCoParticipantMessage: (userId: string, content: string) => Promise<void>;
  resetDemoData: () => Promise<void>;
  retryCount: number;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, organization, token } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<PresenceRecord[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const messageFetchSequenceRef = useRef(0);
  const aiThinkingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const currentRoomIdRef = useRef<string | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseBackoffRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseRetryCountRef = useRef(0);
  const sseMountedRef = useRef(true);

  currentRoomIdRef.current = currentRoom?.id || null;

  // 1. Fetch Rooms for tenant
  const fetchRooms = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api('/api/rooms');
      if (res.ok) {
        const data: Room[] = await res.json();
        setRooms(data);
        // If no active room yet, pick the first one
        if (!currentRoomIdRef.current && data.length > 0) {
          setCurrentRoom(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load rooms:', err);
    }
  }, [token]);

  // 2. Fetch Messages for active room
  const fetchMessages = useCallback(
    async (roomId: string) => {
      if (!token) return;
      const sequence = ++messageFetchSequenceRef.current;
      setIsLoadingMessages(true);
      try {
        const res = await api(`/api/rooms/${roomId}/messages`);
        if (res.ok) {
          const data: Message[] = await res.json();
          if (sequence === messageFetchSequenceRef.current && currentRoomIdRef.current === roomId) {
            setMessages(data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch messages:', err);
      } finally {
        if (sequence === messageFetchSequenceRef.current) setIsLoadingMessages(false);
      }
    },
    [token]
  );

  // 3. Mark Room as Read
  const markRoomAsRead = useCallback(
    async (roomId: string) => {
      if (!token) return;
      try {
        await api(`/api/rooms/${roomId}/read`, { method: 'POST' });
        setUnreadMap((prev) => ({ ...prev, [roomId]: 0 }));
      } catch (err) {
        console.error('Failed to mark room as read:', err);
      }
    },
    [token]
  );

  // 4. Select Room
  const selectRoom = (roomId: string) => {
    const target = rooms.find((r) => r.id === roomId);
    if (target) {
      setCurrentRoom(target);
      // Clear unreads
      setUnreadMap((prev) => ({ ...prev, [roomId]: 0 }));
      fetchMessages(roomId);
      markRoomAsRead(roomId);

      // Notify presence of current room
      if (token) {
        api('/api/presence', {
          method: 'POST',
          body: JSON.stringify({ isOnline: true, currentRoomId: roomId }),
        }).catch(() => {});
      }
    }
  };

  const fetchPresence = useCallback(async () => {
    if (!token) return;
    try {
      const res = await api('/api/presence');
      if (res.ok) {
        const records: PresenceRecord[] = await res.json();
        setOnlineUsers(records.filter((p) => p.isOnline));
      }
    } catch {
      // Ignore network errors
    }
  }, [token]);

  // Initial rooms and presence fetch when tenant / user changes
  useEffect(() => {
    if (user && token) {
      fetchRooms();
      fetchPresence();
    } else {
      setRooms([]);
      setCurrentRoom(null);
      setMessages([]);
      setOnlineUsers([]);
      setTypingUsers([]);
      setUnreadMap({});
    }
  }, [user, token, fetchRooms, fetchPresence]);

  // Periodic presence heartbeat and refresh (keeps presence active and synchronized across tabs)
  useEffect(() => {
    if (!user || !token) return;
    const interval = setInterval(() => {
      fetchPresence();
      api('/api/presence', {
        method: 'POST',
        body: JSON.stringify({ isOnline: true, currentRoomId: currentRoomIdRef.current }),
      }).catch(() => {});
    }, 20_000);

    return () => clearInterval(interval);
  }, [user, token, fetchPresence]);

  // Fetch messages when current room changes, and recover to an accessible room
  // if the active room is removed from the current user's membership.
  useEffect(() => {
    if (currentRoom?.id) {
      fetchMessages(currentRoom.id);
      setTypingUsers([]);
    } else if (rooms.length > 0 && user) {
      setCurrentRoom(rooms[0]);
    }
  }, [currentRoom?.id, fetchMessages, rooms.length, user]);

  // 4. Real-time Server-Sent Events (SSE) with exponential backoff reconnection
  const toast = useToast();

  useEffect(() => {
    sseMountedRef.current = true;
    return () => {
      sseMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token || !user) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (sseBackoffRef.current) clearTimeout(sseBackoffRef.current);
      setIsConnected(false);
      return;
    }

    const MAX_BACKOFF_MS = 30_000;
    const INITIAL_BACKOFF_MS = 1_000;

    const connect = () => {
      if (!sseMountedRef.current) return;

      const sseUrl = `${API_BASE}/api/events?token=${encodeURIComponent(token)}`;

      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!sseMountedRef.current) return;
        const wasDisconnected = sseRetryCountRef.current > 0;
        sseRetryCountRef.current = 0;
        setRetryCount(0);
        setIsConnected(true);
        if (wasDisconnected) {
          toast.success('Reconnected ✓');
        }
      };

      es.onmessage = (event) => {
        if (!sseMountedRef.current) return;
        try {
          const parsed = JSON.parse(event.data);
          const { type, payload } = parsed;

          switch (type) {
            case 'CONNECTED':
              setIsConnected(true);
              break;

            case 'NEW_MESSAGE': {
              const newMsg: Message = payload;
              if (newMsg.isAi) setIsAiThinking(false);
              if (newMsg.roomId === currentRoomIdRef.current) {
                setMessages((prev) => {
                  if (prev.some((m) => m.id === newMsg.id)) {
                    return prev.map((m) => (m.id === newMsg.id ? newMsg : m));
                  }
                  return [...prev, newMsg];
                });
                if (token && newMsg.senderId !== user.id) {
                  api(`/api/rooms/${newMsg.roomId}/read`, { method: 'POST' }).catch(() => {});
                }
              } else {
                setUnreadMap((prev) => ({
                  ...prev,
                  [newMsg.roomId]: (prev[newMsg.roomId] || 0) + 1,
                }));
              }
              setRooms((prev) =>
                prev.map((r) =>
                  r.id === newMsg.roomId
                    ? {
                        ...r,
                        lastMessage: newMsg.isAi
                          ? `Gemini: ${newMsg.content.slice(0, 40)}...`
                          : `${newMsg.senderName}: ${newMsg.content.slice(0, 40)}...`,
                        lastMessageTimestamp: newMsg.timestamp,
                      }
                    : r
                )
              );
              break;
            }

            case 'MESSAGES_READ': {
              const { roomId, userId, userName, readAt, messageIds, receipt } = payload;
              if (roomId === currentRoomIdRef.current) {
                const newReceipt = receipt || { userId, userName, readAt };
                setMessages((prev) =>
                  prev.map((msg) => {
                    if (messageIds && Array.isArray(messageIds) && messageIds.includes(msg.id)) {
                      const existingReadBy = msg.readBy || [];
                      if (!existingReadBy.some((r) => r.userId === userId)) {
                        return { ...msg, readBy: [...existingReadBy, newReceipt] };
                      }
                    }
                    return msg;
                  })
                );
              }
              break;
            }

            case 'STREAM_CHUNK': {
              const { messageId, roomId, chunk, isComplete, toolCalls } = payload;
              if (roomId === currentRoomIdRef.current) {
                setMessages((prev) => {
                  const exists = prev.some((m) => m.id === messageId);
                  if (!exists) {
                    const newAiMsg: Message = {
                      id: messageId,
                      roomId,
                      orgSlug: user.orgSlug,
                      senderId: 'gemini-ai',
                      senderName: 'Gemini AI',
                      isAi: true,
                      content: chunk,
                      timestamp: new Date().toISOString(),
                      isStreaming: !isComplete,
                      toolCalls: toolCalls || [],
                    };
                    return [...prev, newAiMsg];
                  }
                  return prev.map((m) => {
                    if (m.id === messageId) {
                      return {
                        ...m,
                        content: m.content + chunk,
                        isStreaming: !isComplete,
                        toolCalls: toolCalls || m.toolCalls,
                      };
                    }
                    return m;
                  });
                });
              }
              break;
            }

            case 'TYPING_UPDATE': {
              const { roomId, typingUsers } = payload;
              if (roomId === currentRoomIdRef.current) {
                setTypingUsers(typingUsers.filter((u: TypingUser) => u.userId !== user.id));
              }
              break;
            }

            case 'PRESENCE_SYNC': {
              const records: PresenceRecord[] = payload;
              setOnlineUsers(records.filter((p) => p.isOnline));
              break;
            }

            case 'PRESENCE_UPDATE': {
              const record: PresenceRecord = payload;
              setOnlineUsers((prev) => {
                const filtered = prev.filter((p) => p.userId !== record.userId);
                return record.isOnline ? [...filtered, record] : filtered;
              });
              break;
            }

            case 'ROOM_CREATED': {
              const newRoom: Room = payload;
              setRooms((prev) => {
                if (prev.some((r) => r.id === newRoom.id)) return prev;
                return [...prev, newRoom];
              });
              break;
            }

            case 'MEMBER_ADDED': {
              const { roomId, userId } = payload;
              setRooms((prev) => prev.map((room) => room.id === roomId && !room.memberIds.includes(userId)
                ? { ...room, memberIds: [...room.memberIds, userId] }
                : room));
              setCurrentRoom((prev) => prev && prev.id === roomId && !prev.memberIds.includes(userId)
                ? { ...prev, memberIds: [...prev.memberIds, userId] }
                : prev);
              break;
            }

            case 'MEMBER_REMOVED': {
              const { roomId, userId } = payload;
              if (userId === user.id) {
                // The server sends this event to the removed member as a final
                // notification. Drop the room immediately so no stale messages
                // remain visible while React selects another accessible room.
                setRooms((prev) => prev.filter((room) => room.id !== roomId));
                if (currentRoomIdRef.current === roomId) {
                  setCurrentRoom(null);
                  setMessages([]);
                }
              } else {
                setRooms((prev) => prev.map((room) => room.id === roomId
                  ? { ...room, memberIds: room.memberIds.filter((id) => id !== userId) }
                  : room));
                setCurrentRoom((prev) => prev && prev.id === roomId
                  ? { ...prev, memberIds: prev.memberIds.filter((id) => id !== userId) }
                  : prev);
              }
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.error('Failed to parse SSE event:', err);
        }
      };

      es.onerror = () => {
        if (!sseMountedRef.current) return;
        es.close();
        setIsConnected(false);

        sseRetryCountRef.current += 1;
        setRetryCount(sseRetryCountRef.current);

        const backoffMs = Math.min(
          INITIAL_BACKOFF_MS * Math.pow(2, sseRetryCountRef.current - 1),
          MAX_BACKOFF_MS
        );

        if (sseRetryCountRef.current === 1) {
          toast.warning(`Connection lost. Reconnecting in ${Math.round(backoffMs / 1000)}s...`);
        }

        sseBackoffRef.current = setTimeout(() => {
          if (sseMountedRef.current) connect();
        }, backoffMs);
      };
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (sseBackoffRef.current) {
        clearTimeout(sseBackoffRef.current);
        sseBackoffRef.current = null;
      }
    };
  }, [token, user]);

  // 5. Send Message
  const sendMessage = async (content: string, replyToMessage?: Message) => {
    if (!token || !currentRoom || !content.trim()) return;

    const clientMessageId = `client-msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      const res = await api(`/api/rooms/${currentRoom.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: content.trim(),
          clientMessageId,
          replyToId: replyToMessage?.id,
          replyToSnippet: replyToMessage
            ? `${replyToMessage.senderName}: ${replyToMessage.content.slice(0, 80)}`
            : undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      const sentMsg: Message = await res.json();
      setMessages((prev) => {
        if (prev.some((m) => m.id === sentMsg.id)) return prev;
        return [...prev, sentMsg];
      });

      // ponytail: backend startswith semantics; codegen would share this — deferred
      const mentionsAi = /@(?:gemini|ai)\b|^\/(?:gemini|ai|ask)/i.test(content);
      if (mentionsAi) {
        setIsAiThinking(true);
        if (aiThinkingTimeoutRef.current) clearTimeout(aiThinkingTimeoutRef.current);
        aiThinkingTimeoutRef.current = setTimeout(() => {
          setIsAiThinking(false);
        }, 18000);
      }

      // Active fallback poll if mentioning Gemini to ensure immediate visibility
      if (mentionsAi) {
        const targetRoomId = currentRoom.id;
        let attempts = 0;
        const pollTimer = setInterval(async () => {
          attempts += 1;
          if (attempts > 12 || currentRoomIdRef.current !== targetRoomId) {
            clearInterval(pollTimer);
            return;
          }
          try {
            const pollRes = await api(`/api/rooms/${targetRoomId}/messages`);
            if (pollRes.ok) {
              const msgs: Message[] = await pollRes.json();
              setMessages(msgs);
              const aiMsg = msgs.find((m) => m.isAi && !m.isStreaming);
              if (aiMsg && attempts >= 3) {
                clearInterval(pollTimer);
              }
            }
          } catch {
            // Ignore temporary polling errors
          }
        }, 1200);
      }
    } catch (err) {
      console.error('Send message error:', err);
      toast.error('Failed to send message. Please try again.');
    }
  };

  // 6. Set Typing status with debouncing
  const setTypingStatus = (isTyping: boolean) => {
    if (!token || !currentRoom) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    api(`/api/rooms/${currentRoom.id}/typing`, {
      method: 'POST',
      body: JSON.stringify({ isTyping }),
    }).catch(() => {});

    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        api(`/api/rooms/${currentRoom.id}/typing`, {
          method: 'POST',
          body: JSON.stringify({ isTyping: false }),
        }).catch(() => {});
      }, 3000);
    }
  };

  // 7. Create Room
  const createRoom = async (name: string, description: string, isPrivate = false): Promise<Room | null> => {
    if (!token) return null;
    try {
      const res = await api('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ name, description, isPrivate }),
      });
      if (res.ok) {
        const createdRoom: Room = await res.json();
        setRooms((prev) => [...prev, createdRoom]);
        setCurrentRoom(createdRoom);
        setMessages([]);
        fetchMessages(createdRoom.id);
        markRoomAsRead(createdRoom.id);
        return createdRoom;
      }
      return null;
    } catch (err) {
      console.error('Failed to create room:', err);
      return null;
    }
  };

  // 8. Multi-User Simulator (simulates Sarah, Mike, Lisa, etc. sending in the current room)
  const simulateCoParticipantMessage = async (coUserId: string, content: string) => {
    if (!currentRoom) return;
    try {
      // 1. Broadcast typing active
      await api(`/api/rooms/${currentRoom.id}/typing`, {
        method: 'POST',
        token: coUserId,
        body: JSON.stringify({ isTyping: true }),
      }).catch(() => {});

      // 2. Realistic pause while typing
      await new Promise((resolve) => setTimeout(resolve, 1400));

      // 3. Clear typing and send message
      await api(`/api/rooms/${currentRoom.id}/typing`, {
        method: 'POST',
        token: coUserId,
        body: JSON.stringify({ isTyping: false }),
      }).catch(() => {});

      await api(`/api/rooms/${currentRoom.id}/messages`, {
        method: 'POST',
        token: coUserId,
        body: JSON.stringify({ content }),
      });
    } catch (err) {
      console.error('Co-participant simulation failed:', err);
    }
  };

  // 9. Reset Demo Data
  const resetDemoData = async () => {
    if (!token) return;
    try {
      await api('/api/admin/reset-demo', { method: 'POST' });
      await fetchRooms();
      if (currentRoom) {
        await fetchMessages(currentRoom.id);
      }
    } catch (err) {
      console.error('Reset demo error:', err);
    }
  };

  return (
    <ChatContext.Provider
      value={{
        rooms,
        currentRoom,
        messages,
        onlineUsers,
        typingUsers,
        unreadMap,
        isConnected,
        isLoadingMessages,
        isAiThinking,
        retryCount,
        selectRoom,
        markRoomAsRead,
        sendMessage,
        setTypingStatus,
        createRoom,
        simulateCoParticipantMessage,
        resetDemoData,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
