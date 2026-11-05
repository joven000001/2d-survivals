import fs from 'node:fs';
import path from 'node:path';
import { getPersistenceDataDir, safeWriteJson } from './persistence';

export interface FriendEntry {
  playerId: string;
  displayName: string;
  addedAt: number;
}

export interface FriendRequestEntry {
  fromPlayerId: string;
  fromPlayerName: string;
  targetPlayerId: string;
  targetPlayerName: string;
  timestamp: number;
}

export interface PlayerFriendsData {
  playerId: string;
  displayName: string;
  friends: FriendEntry[];
  incomingRequests: FriendRequestEntry[];
  outgoingRequests: FriendRequestEntry[];
}

const DATA_DIR = getPersistenceDataDir();
const FRIENDS_FILE = path.join(DATA_DIR, 'friends.json');

// In-memory cache for fast access
let memoryStore: Map<string, PlayerFriendsData> | null = null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function loadFriendsStore(): Map<string, PlayerFriendsData> {
  if (memoryStore) return memoryStore;
  ensureDataDir();
  memoryStore = new Map();
  if (fs.existsSync(FRIENDS_FILE)) {
    try {
      const raw = fs.readFileSync(FRIENDS_FILE, 'utf8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item && typeof item.playerId === 'string') {
            memoryStore.set(item.playerId, {
              playerId: item.playerId,
              displayName: item.displayName || item.playerId,
              friends: Array.isArray(item.friends) ? item.friends : [],
              incomingRequests: Array.isArray(item.incomingRequests) ? item.incomingRequests : [],
              outgoingRequests: Array.isArray(item.outgoingRequests) ? item.outgoingRequests : [],
            });
          }
        }
      }
    } catch (err) {
      console.error('[Friends] Error loading friends data:', err);
    }
  }
  return memoryStore;
}

export function saveFriendsStore(): void {
  if (!memoryStore) return;
  ensureDataDir();
  try {
    const list = Array.from(memoryStore.values());
    safeWriteJson(FRIENDS_FILE, list);
  } catch (err) {
    console.error('[Friends] Error saving friends data:', err);
  }
}

export function getOrCreatePlayerFriends(playerId: string, displayName?: string): PlayerFriendsData {
  const store = loadFriendsStore();
  let data = store.get(playerId);
  if (!data) {
    data = {
      playerId,
      displayName: displayName || playerId,
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
    };
    store.set(playerId, data);
    saveFriendsStore();
  } else if (displayName && displayName !== data.displayName) {
    data.displayName = displayName;
    saveFriendsStore();
  }
  return data;
}

export function sendFriendRequest(
  fromPlayerId: string,
  fromPlayerName: string,
  targetPlayerId: string,
  targetPlayerName: string
): { success: boolean; message: string; autoAccepted?: boolean } {
  if (!fromPlayerId || !targetPlayerId) {
    return { success: false, message: 'Invalid player IDs' };
  }
  if (fromPlayerId === targetPlayerId) {
    return { success: false, message: 'Cannot add yourself as a friend' };
  }

  const sender = getOrCreatePlayerFriends(fromPlayerId, fromPlayerName);
  const target = getOrCreatePlayerFriends(targetPlayerId, targetPlayerName);

  // Check if already friends
  if (sender.friends.some((f) => f.playerId === targetPlayerId)) {
    return { success: false, message: 'Already friends with this player' };
  }

  // Check if target already sent a request to sender (mutual match -> auto accept!)
  const existingIncoming = sender.incomingRequests.find((r) => r.fromPlayerId === targetPlayerId);
  if (existingIncoming) {
    // Mutual request -> accept!
    return respondFriendRequest(fromPlayerId, targetPlayerId, 'accept');
  }

  // Check if request already pending
  if (sender.outgoingRequests.some((r) => r.targetPlayerId === targetPlayerId)) {
    return { success: false, message: 'Friend request already sent and pending' };
  }

  const request: FriendRequestEntry = {
    fromPlayerId,
    fromPlayerName: fromPlayerName || fromPlayerId,
    targetPlayerId,
    targetPlayerName: targetPlayerName || targetPlayerId,
    timestamp: Date.now(),
  };

  sender.outgoingRequests.push(request);
  target.incomingRequests.push(request);
  saveFriendsStore();

  return { success: true, message: `Friend request sent to ${targetPlayerName || targetPlayerId}!` };
}

export function respondFriendRequest(
  playerId: string,
  fromPlayerId: string,
  action: 'accept' | 'reject'
): { success: boolean; message: string; friend?: FriendEntry } {
  const me = getOrCreatePlayerFriends(playerId);
  const sender = getOrCreatePlayerFriends(fromPlayerId);

  const reqIndex = me.incomingRequests.findIndex((r) => r.fromPlayerId === fromPlayerId);
  if (reqIndex === -1 && action === 'accept' && me.friends.some((f) => f.playerId === fromPlayerId)) {
    return { success: true, message: 'Already friends', friend: me.friends.find((f) => f.playerId === fromPlayerId) };
  }

  if (reqIndex !== -1) {
    me.incomingRequests.splice(reqIndex, 1);
  }
  // Remove outgoing request on sender's side
  const outIndex = sender.outgoingRequests.findIndex((r) => r.targetPlayerId === playerId);
  if (outIndex !== -1) {
    sender.outgoingRequests.splice(outIndex, 1);
  }

  if (action === 'accept') {
    const now = Date.now();
    const friendForMe: FriendEntry = {
      playerId: fromPlayerId,
      displayName: sender.displayName || fromPlayerId,
      addedAt: now,
    };
    const friendForSender: FriendEntry = {
      playerId,
      displayName: me.displayName || playerId,
      addedAt: now,
    };

    if (!me.friends.some((f) => f.playerId === fromPlayerId)) {
      me.friends.push(friendForMe);
    }
    if (!sender.friends.some((f) => f.playerId === playerId)) {
      sender.friends.push(friendForSender);
    }
    saveFriendsStore();
    return { success: true, message: 'Friend request accepted!', friend: friendForMe };
  }

  saveFriendsStore();
  return { success: true, message: 'Friend request rejected' };
}

export function removeFriend(playerId: string, friendPlayerId: string): boolean {
  const me = getOrCreatePlayerFriends(playerId);
  const friend = getOrCreatePlayerFriends(friendPlayerId);

  me.friends = me.friends.filter((f) => f.playerId !== friendPlayerId);
  friend.friends = friend.friends.filter((f) => f.playerId !== playerId);
  saveFriendsStore();
  return true;
}

export function getPlayerFriendsWithStatus(
  playerId: string,
  displayName: string | undefined,
  getOnlineStatus: (id: string) => { isOnline: boolean; lobbyName?: string }
): {
  friends: Array<FriendEntry & { isOnline: boolean; lobbyName?: string }>;
  incomingRequests: FriendRequestEntry[];
  outgoingRequests: FriendRequestEntry[];
} {
  const store = loadFriendsStore();
  const data = getOrCreatePlayerFriends(playerId, displayName);
  const friendsWithStatus = data.friends.map((friend) => {
    const status = getOnlineStatus(friend.playerId);
    const friendData = store.get(friend.playerId);
    return {
      ...friend,
      displayName: friendData?.displayName || friend.displayName,
      isOnline: status.isOnline,
      lobbyName: status.lobbyName,
    };
  });

  return {
    friends: friendsWithStatus,
    incomingRequests: data.incomingRequests,
    outgoingRequests: data.outgoingRequests,
  };
}
