import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X, ChevronDown, ChevronUp, UserPlus } from 'lucide-react';

export interface ChatMessageItem {
  messageId: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

interface ChatOverlayProps {
  messages: ChatMessageItem[];
  currentLobbyName: string;
  currentPlayerId: string;
  onSendMessage: (text: string) => void;
  onSendFriendRequest?: (targetPlayerId: string, targetPlayerName: string) => void;
  chatNotice?: string;
}

export const ChatOverlay: React.FC<ChatOverlayProps> = ({
  messages,
  currentLobbyName,
  currentPlayerId,
  onSendMessage,
  onSendFriendRequest,
  chatNotice,
}) => {
  const [isOpen, setIsOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  const [inputValue, setInputValue] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; playerId: string; playerName: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const prevMessagesLengthRef = useRef(messages.length);

  // Auto-scroll to bottom of messages when open
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Track unread messages when closed
  useEffect(() => {
    if (!isOpen && messages.length > prevMessagesLengthRef.current) {
      const added = messages.length - prevMessagesLengthRef.current;
      setUnreadCount((prev) => prev + added);
    }
    prevMessagesLengthRef.current = messages.length;
  }, [messages.length, isOpen]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
    };
  }, [contextMenu]);

  const handleToggle = () => {
    setIsOpen((prev) => {
      const next = !prev;
      if (next) {
        setUnreadCount(0);
      }
      return next;
    });
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      inputRef.current?.blur();
      e.stopPropagation();
    }
  };

  const formatTime = (timestamp: number) => {
    const d = new Date(timestamp);
    const hours = d.getHours().toString().padStart(2, '0');
    const mins = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${mins}`;
  };

  return (
    <div
      className="fixed top-2 left-2 sm:top-3 sm:left-3 z-40 font-mono text-xs select-none max-w-[calc(100vw-1rem)]"
      data-testid="chat-overlay"
    >
      {/* Minimized toggle button */}
      {!isOpen && (
        <button
          type="button"
          onClick={handleToggle}
          aria-label="Open chat"
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/35 hover:bg-slate-950/50 text-slate-100 border border-white/20 shadow-md backdrop-blur-sm transition-all active:scale-95 cursor-pointer"
        >
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <span className="font-pixel text-[10px] tracking-wider text-slate-300">CHAT</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-[9px] leading-none animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Expanded chat window */}
      {isOpen && (
        <div className="w-[min(20rem,calc(100vw-1.5rem))] flex flex-col bg-slate-950/40 border border-white/25 rounded-xl shadow-xl backdrop-blur-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900/45 border-b border-white/15">
            <div className="flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-pixel text-[10px] text-amber-300 tracking-wider">
                LOBBY CHAT
              </span>
              <span className="text-[10px] text-slate-500">· {currentLobbyName}</span>
            </div>
            <button
              type="button"
              onClick={handleToggle}
              aria-label="Minimize chat"
              className="text-slate-400 hover:text-white p-0.5 transition cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>

          {/* Message List */}
          <div
            className="h-36 sm:h-44 overflow-y-auto p-2.5 space-y-1.5 text-[11px] leading-relaxed scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent"
            data-testid="chat-message-list"
          >
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 italic text-[10px]">
                No messages yet. Say hello!
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.playerId === currentPlayerId;
                return (
                  <div
                    key={msg.messageId || `${msg.playerId}_${msg.timestamp}`}
                    className="break-words select-text"
                  >
                    <span className="text-[9px] text-slate-500 mr-1.5 select-none">
                      [{formatTime(msg.timestamp)}]
                    </span>
                    <span
                      className={`font-semibold mr-1.5 transition-colors ${
                        isMe
                          ? 'text-emerald-400'
                          : 'text-amber-400 hover:text-amber-300 hover:underline cursor-pointer select-none'
                      }`}
                      title={!isMe ? 'Right-click to send friend request' : undefined}
                      onClick={(e) => {
                        if (!isMe) {
                          e.stopPropagation();
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            playerId: msg.playerId,
                            playerName: msg.playerName,
                          });
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!isMe) {
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            playerId: msg.playerId,
                            playerName: msg.playerName,
                          });
                        }
                      }}
                    >
                      {msg.playerName}:
                    </span>
                    <span className="text-slate-200">{msg.text}</span>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Notice / Error */}
          {chatNotice && (
            <div className="px-2.5 py-1 bg-red-950/80 border-t border-red-800/50 text-[10px] text-red-300 font-mono">
              ⚠️ {chatNotice}
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-1.5 p-1.5 bg-slate-900/45 border-t border-white/15"
          >
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={(e) => e.stopPropagation()}
              maxLength={200}
              placeholder="Type message… (Enter)"
              className="flex-1 min-w-0 bg-slate-950/55 border border-white/20 rounded-lg px-2.5 py-1.5 text-slate-100 text-base sm:text-xs font-mono outline-none focus:border-emerald-300 transition touch-manipulation"
              data-testid="chat-input"
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              aria-label="Send message"
              className="min-w-[40px] min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-bold font-pixel text-[10px] tracking-wider transition-all flex items-center justify-center cursor-pointer disabled:cursor-not-allowed active:scale-95 touch-manipulation"
              data-testid="chat-send-button"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Right-click / Tap Name Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 rounded-xl border border-amber-300/40 bg-slate-950/95 p-1.5 text-xs text-slate-100 shadow-[0_12px_36px_rgba(0,0,0,0.85)] backdrop-blur-md"
          style={{
            left: Math.max(8, Math.min(contextMenu.x, typeof window !== 'undefined' ? window.innerWidth - 195 : contextMenu.x)),
            top: Math.max(8, Math.min(contextMenu.y, typeof window !== 'undefined' ? window.innerHeight - 95 : contextMenu.y)),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-2 py-1 border-b border-slate-800 text-[10px] font-mono text-amber-300 truncate max-w-[170px]">
            {contextMenu.playerName}
          </div>
          <button
            type="button"
            onClick={() => {
              onSendFriendRequest?.(contextMenu.playerId, contextMenu.playerName);
              setContextMenu(null);
            }}
            className="flex items-center gap-2 w-full px-2.5 py-1.5 mt-1 rounded-lg bg-emerald-950/70 hover:bg-emerald-600/40 text-emerald-300 hover:text-emerald-100 font-pixel text-[9px] tracking-wider transition cursor-pointer active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>SEND FRIEND REQUEST</span>
          </button>
        </div>
      )}
    </div>
  );
};
