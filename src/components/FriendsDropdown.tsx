import React, { useState } from 'react';
import { Users, ChevronDown, Check, X, Play, UserPlus, Trash2, Loader2, Send } from 'lucide-react';

export interface FriendItem {
  playerId: string;
  displayName: string;
  addedAt: number;
  isOnline: boolean;
  lobbyName?: string;
}

export interface FriendRequestItem {
  fromPlayerId: string;
  fromPlayerName: string;
  targetPlayerId: string;
  targetPlayerName: string;
  timestamp: number;
}

interface FriendsDropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  friends: FriendItem[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests?: FriendRequestItem[];
  onAcceptRequest: (fromPlayerId: string) => void;
  onRejectRequest: (fromPlayerId: string) => void;
  onJoinFriend: (lobbyName: string) => void;
  onRemoveFriend?: (friendPlayerId: string) => void;
  onSendRequest?: (targetPlayerIdOrName: string) => void;
  loading?: boolean;
  notice?: string | null;
}

export const FriendsDropdown: React.FC<FriendsDropdownProps> = ({
  isOpen,
  onToggle,
  friends,
  incomingRequests,
  outgoingRequests = [],
  onAcceptRequest,
  onRejectRequest,
  onJoinFriend,
  onRemoveFriend,
  onSendRequest,
  loading = false,
  notice = null,
}) => {
  const [manualInput, setManualInput] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);

  const onlineFriends = friends.filter((f) => f.isOnline);
  const offlineFriends = friends.filter((f) => !f.isOnline);

  const handleSendManual = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualInput.trim();
    if (!trimmed || !onSendRequest) return;
    onSendRequest(trimmed);
    setManualInput('');
    setShowAddInput(false);
  };

  return (
    <div className="w-full mt-2 select-none" data-testid="friends-dropdown-root">
      {/* Dropdown Toggle Button */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-[#ebd7ae]/40 bg-[#122030]/85 px-2.5 py-1.5 text-left transition hover:bg-[#1a2d42] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff0bd] cursor-pointer"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-5 w-5 items-center justify-center rounded border border-emerald-400/40 bg-emerald-950/60 text-emerald-400">
            <Users className="h-3 w-3" />
          </div>
          <span className="font-pixel text-[10px] tracking-wider text-[#fff0bd]">
            FRIENDS
          </span>
          <span className="text-[9px] font-mono text-emerald-400">
            ({onlineFriends.length}/{friends.length})
          </span>
          {incomingRequests.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 font-bold font-pixel text-[8px] leading-none animate-pulse">
              {incomingRequests.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {loading && <Loader2 className="w-3 h-3 text-emerald-400 animate-spin" />}
          <ChevronDown
            className={`h-3.5 w-3.5 text-[#ebd7ae] transition-transform duration-200 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Expanded Dropdown Content */}
      {isOpen && (
        <div className="mt-1.5 rounded-lg border border-[#ebd7ae]/30 bg-[#0e1726]/95 p-2 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Notification / Toast inside menu */}
          {notice && (
            <div className="mb-2 px-2 py-1 rounded bg-amber-500/20 border border-amber-400/40 text-[9px] font-mono text-amber-200">
              {notice}
            </div>
          )}

          {/* Friends List Header */}
          <div className="flex items-center justify-between pb-1 border-b border-white/10 mb-1.5">
            <span className="text-[9px] font-pixel tracking-wider text-slate-400 uppercase">
              Friends List ({friends.length})
            </span>
          </div>

          {/* Scrollable Friends List */}
          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 scrollbar-thin scrollbar-thumb-slate-700">
            {friends.length === 0 ? (
              <div className="text-[9px] text-slate-400 italic text-center py-2">
                No friends yet.<br />Right-click a player's name in chat to add them!
              </div>
            ) : (
              <>
                {/* Online friends first */}
                {onlineFriends.map((friend) => (
                  <div
                    key={friend.playerId}
                    className="flex items-center justify-between gap-1.5 p-1 rounded bg-slate-900/50 hover:bg-slate-800/60 transition group"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {/* Green dot for online */}
                      <span
                        className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399] shrink-0"
                        title="Online"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-[10px] text-slate-100 truncate max-w-[110px]">
                          {friend.displayName}
                        </div>
                        <div className="text-[8px] text-emerald-400 font-mono leading-none truncate max-w-[110px]">
                          {friend.lobbyName ? `Lobby ${friend.lobbyName}` : 'Online'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Join button if online in a lobby */}
                      {friend.lobbyName && (
                        <button
                          type="button"
                          onClick={() => onJoinFriend(friend.lobbyName!)}
                          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-pixel text-[8px] font-bold tracking-wider transition cursor-pointer shadow-sm"
                          title={`Join ${friend.displayName}'s game (Lobby ${friend.lobbyName})`}
                        >
                          <Play className="w-2 h-2 fill-current" />
                          <span>JOIN</span>
                        </button>
                      )}
                      {onRemoveFriend && (
                        <button
                          type="button"
                          onClick={() => onRemoveFriend(friend.playerId)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-red-400 rounded transition cursor-pointer"
                          title="Remove friend"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Offline friends */}
                {offlineFriends.map((friend) => (
                  <div
                    key={friend.playerId}
                    className="flex items-center justify-between gap-1.5 p-1 rounded bg-slate-900/30 hover:bg-slate-800/40 transition group opacity-75"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      {/* Gray dot for offline */}
                      <span
                        className="w-2 h-2 rounded-full bg-slate-500 shrink-0"
                        title="Offline"
                      />
                      <div className="min-w-0">
                        <div className="font-medium text-[10px] text-slate-300 truncate max-w-[120px]">
                          {friend.displayName}
                        </div>
                        <div className="text-[8px] text-slate-400 font-mono leading-none">
                          Offline
                        </div>
                      </div>
                    </div>

                    {onRemoveFriend && (
                      <button
                        type="button"
                        onClick={() => onRemoveFriend(friend.playerId)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-red-400 rounded transition cursor-pointer shrink-0"
                        title="Remove friend"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Divider */}
          <div className="my-2 border-t border-white/10" />

          {/* Bottom Part: Friend Requests */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-pixel tracking-wider text-amber-300 uppercase">
                Friend Requests ({incomingRequests.length})
              </span>
            </div>

            {incomingRequests.length === 0 ? (
              <div className="text-[8px] text-slate-400 italic py-1">
                No pending requests
              </div>
            ) : (
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                {incomingRequests.map((req) => (
                  <div
                    key={`${req.fromPlayerId}_${req.timestamp}`}
                    className="flex items-center justify-between gap-1 p-1 rounded bg-amber-950/30 border border-amber-500/20"
                  >
                    <span className="font-semibold text-[10px] text-amber-200 truncate max-w-[90px]">
                      {req.fromPlayerName}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onAcceptRequest(req.fromPlayerId)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-pixel text-[8px] font-bold transition cursor-pointer active:scale-95"
                        title="Accept friend request"
                      >
                        <Check className="w-2.5 h-2.5" />
                        <span>ACCEPT</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRejectRequest(req.fromPlayerId)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-800/80 hover:bg-red-700 text-red-100 font-pixel text-[8px] transition cursor-pointer active:scale-95"
                        title="Reject friend request"
                      >
                        <X className="w-2.5 h-2.5" />
                        <span>REJECT</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom Dropdown Section: Enter player name and send friend request */}
          {onSendRequest && (
            <div className="mt-2.5 pt-2 border-t border-white/10" data-testid="bottom-add-friend-section">
              <button
                type="button"
                onClick={() => setShowAddInput((prev) => !prev)}
                className="flex w-full items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg bg-slate-900/70 hover:bg-slate-800/90 border border-emerald-500/25 hover:border-emerald-400/40 text-left transition cursor-pointer active:scale-[0.99] shadow-sm"
                aria-expanded={showAddInput}
                aria-label="Toggle send friend request input"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <UserPlus className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="font-pixel text-[9px] tracking-wider text-[#fff0bd] truncate">
                    SEND FRIEND REQUEST
                  </span>
                </div>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-amber-300 transition-transform duration-200 shrink-0 ${
                    showAddInput ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* When the drop down arrow at the bottom is pressed, enter player name and send request */}
              {showAddInput && (
                <form
                  onSubmit={handleSendManual}
                  className="mt-2 p-2 rounded-lg bg-slate-950/90 border border-emerald-500/35 shadow-inner animate-in fade-in slide-in-from-top-1 duration-150"
                >
                  <div className="text-[8px] font-pixel text-slate-300 uppercase tracking-wider mb-1">
                    ENTER PLAYER NAME
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={manualInput}
                      onChange={(e) => setManualInput(e.target.value)}
                      placeholder="Type player name…"
                      maxLength={32}
                      autoFocus
                      className="flex-1 min-w-0 bg-slate-900/90 border border-white/20 rounded px-2 py-1 text-[11px] text-slate-100 font-mono outline-none focus:border-emerald-400 transition"
                      data-testid="bottom-add-friend-input"
                    />
                    <button
                      type="submit"
                      disabled={!manualInput.trim()}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-pixel text-[9px] font-bold tracking-wider transition cursor-pointer disabled:cursor-not-allowed active:scale-95 shadow shrink-0"
                      data-testid="bottom-add-friend-submit"
                    >
                      <Send className="w-3 h-3" />
                      <span>SEND</span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
