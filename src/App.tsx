/**
 * Pixel Frontier - Main Application Component (Infinite World, Profiling, Hotbar, Item Drops & Zoom)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  Compass,
  HelpCircle,
  Sun,
  Moon,
  Shield,
  Layers,
  Activity,
  Pickaxe,
  MapPinned,
  ChevronDown,
  Home as HomeIcon,
  Backpack,
  Hammer,
  User,
  LogIn,
  LogOut,
  UserPlus,
  X,
  Sparkles,
  Feather,
  LoaderCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { GameEngine, GameState } from './game/engine';
import { GameStats, TileType } from './game/types';
import { sound } from './game/audio';
import CombatDebugPanel from './debug/CombatDebugPanel';
// TEMPORARY combat lifecycle diagnostics. Remove after reproducing the respawn issue.
const debugCombat = (event: string, data: Record<string, unknown>) =>
  console.info('[combat-debug][client]', event, data);
import { Minimap } from './components/Minimap';
import { TouchControls } from './components/TouchControls';
import { Hotbar } from './components/Hotbar';
import { BIOME_CATEGORIES, BIOME_LIST, BiomeType } from './game/biomes';
import { getBiomeTeleportFeedback, type BiomeTeleportFeedback } from './game/teleportFeedback';
import { TILE_SIZE } from './game/constants';
import { CraftingPanel } from './components/CraftingPanel';
import { CraftingRecipe, getVisibleRecipes, isRecipeCraftable } from './game/recipes';
import { InventorySlotRef, ITEM_INFO } from './game/inventory';
import { ToolIcon } from './components/Hotbar';
import { ChatOverlay, ChatMessageItem } from './components/ChatOverlay';
import { CreativeCatalog } from './components/CreativeCatalog';
import { FriendsDropdown, FriendItem, FriendRequestItem } from './components/FriendsDropdown';
import { MenuSunsetCanvas } from './components/MenuSunsetCanvas';
import { worldInputToSeed } from './game/worldIdentity';
import { LOBBY_CODE_MAX_LENGTH, sanitizeLobbyCode, normalizeLobbyCode, isValidLobbyCode } from './game/lobbyCodes';
import { isEdibleItem, isMeatItem, ItemType, ToolKind, ToolTier } from './game/blocks';
import { MeatIcon } from './components/MeatIcon';
import { BlockIcon } from './components/BlockIcon';
import { RemotePlayerState } from './game/types';
import { ChestEndpoint, ChestSlot, WorldChest, makeEmptyChestSlots, makeWorldChestId, sanitizeChestSlots, transferChestItems } from './game/chests';
import { ChestPanel } from './components/ChestPanel';
import { SignEditor } from './components/SignEditor';
import { getCropGrowthStage, InteractiveObjectState, InteractiveObjectType, makeWorldObject, objectTypeForTile, sanitizeSignText, sanitizeWorldObject, worldObjectId } from './game/worldObjects';
import { auth, loadWorldFromCloud, saveWorldToCloud } from './firebase';
import {
  shouldShowExternalLoginOptions,
  shouldShowExternalLoginWarning,
  getProfileModalGridClass,
  getProfileGuestBadgeLabel,
  getLoginUiVisibility,
} from './game/buildMode';
import { createNamedHomeId, deleteNamedHome, loadNamedHomes, saveNamedHomes, type NamedHome } from './game/namedHomes';

const API_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/+$/, '')) || '';

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

type LobbyInfo = { lobbyId: string; lobbyName: string; worldSeed: number; playerId: string; playerCount: number };
type TeleportRequest = { requestId: string; playerName: string; playerId: string; expiresAt: number };

function parseRemotePlayer(value: unknown): RemotePlayerState | null {
  if (!value || typeof value !== 'object') return null;
  const player = value as Record<string, unknown>;
  if (typeof player.playerId !== 'string' || typeof player.x !== 'number' || !Number.isFinite(player.x) ||
      typeof player.y !== 'number' || !Number.isFinite(player.y) || typeof player.facingRight !== 'boolean') return null;
  const health = typeof player.health === 'number' && Number.isFinite(player.health) ? Math.max(0, Math.min(100, Math.round(player.health))) : 100;
  const maxHealth = typeof player.maxHealth === 'number' && Number.isFinite(player.maxHealth) ? Math.max(1, Math.round(player.maxHealth)) : 100;
  const isAlive = typeof player.isAlive === 'boolean' ? player.isAlive : health > 0;
  const displayName = typeof player.displayName === 'string' && player.displayName.trim() ? player.displayName.trim().slice(0, 16) : undefined;
  return { playerId: player.playerId, x: player.x, y: player.y, facingRight: player.facingRight, health, maxHealth, isAlive, displayName };
}

function parseBlockModification(value: unknown): { x: number; y: number; tile: TileType } | null {
  if (!value || typeof value !== 'object') return null;
  const block = value as Record<string, unknown>;
  if (!Number.isSafeInteger(block.x) || !Number.isSafeInteger(block.y) || typeof block.tile !== 'number' ||
      !Number.isInteger(block.tile) || block.tile < TileType.AIR || block.tile > TileType.CELESTIAL_LEAVES) return null;
  return { x: block.x as number, y: block.y as number, tile: block.tile as TileType };
}

const GUEST_NAME_PREFIXES = ['Pixel', 'Crystal', 'Ember', 'Moon', 'Forest', 'Star', 'Sun', 'Silver', 'Storm'];
const GUEST_NAME_SUFFIXES = ['Fox', 'Wolf', 'Knight', 'Rabbit', 'Rider', 'Scout', 'Nomad', 'Pioneer', 'Warden', 'Drifter'];

function sanitizeDisplayName(raw: string, maxLength = 16): string {
  const cleaned = String(raw ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/<|>|&|"|'|\\/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = cleaned.replace(/[^a-zA-Z0-9_\-]/g, '');
  const candidate = (compact || cleaned).slice(0, maxLength).trim();
  return candidate && candidate.length >= 3 ? candidate : 'PixelRanger';
}

function generateGuestDisplayName(): string {
  const prefix = GUEST_NAME_PREFIXES[Math.floor(Math.random() * GUEST_NAME_PREFIXES.length)];
  const suffix = GUEST_NAME_SUFFIXES[Math.floor(Math.random() * GUEST_NAME_SUFFIXES.length)];
  return sanitizeDisplayName(`${prefix}${suffix}`, 16);
}

function getStoredGuestName(): string {
  if (typeof window === 'undefined') return 'PixelRanger';
  const saved = window.localStorage.getItem('pixel_frontier_guest_name');
  if (saved && saved.trim()) {
    const sanitized = sanitizeDisplayName(saved, 16);
    if (sanitized !== 'PixelRanger' || saved.trim().length >= 3) return sanitized;
  }
  const generated = generateGuestDisplayName();
  window.localStorage.setItem('pixel_frontier_guest_name', generated);
  return generated;
}

function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('pixel_frontier_auth_token');
}

function getStoredRecentLobbies(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem('pixel_frontier_recent_lobbies');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === 'string')
      .map((value) => normalizeLobbyCode(value))
      .filter((value): value is string => Boolean(value));
  } catch {
    return [];
  }
}

function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    'ontouchstart' in window ||
    (navigator && navigator.maxTouchPoints > 0) ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches)
  );
}

export default function App() {
  const developerTestMode = new URLSearchParams(window.location.search).get('test') === '1';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [gameState, setGameState] = useState<GameState>('TITLE');
  const [menuScreen, setMenuScreen] = useState<'main' | 'single' | 'multiplayer' | 'leaderboard'>('main');
  const [leaderboardTab, setLeaderboardTab] = useState<'daily' | 'forever'>('daily');
  const [leaderboardData, setLeaderboardData] = useState<any>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  useEffect(() => {
    if (menuScreen !== 'leaderboard') return;
    let active = true;
    setLeaderboardLoading(true);
    setLeaderboardData(null);
    const configuredUrl = (import.meta.env.VITE_MULTIPLAYER_SERVER_URL as string | undefined)?.trim();
    const defaultProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const baseUrl = configuredUrl || `${defaultProtocol}//${window.location.host}/ws`;
    const authToken = getStoredAuthToken();
    const socketUrl = authToken ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}authToken=${encodeURIComponent(authToken)}` : baseUrl;
    let socket: WebSocket;
    try { socket = new WebSocket(socketUrl); }
    catch { setLeaderboardLoading(false); return; }
    const playerId = window.localStorage.getItem('pixel_frontier_multiplayer_player_id') || window.sessionStorage.getItem('pixel_frontier_multiplayer_player_id');
    const requestData = () => socket.send(JSON.stringify({ type: 'leaderboard_get' }));
    socket.addEventListener('open', () => {
      if (playerId) {
        socket.send(JSON.stringify({ type: 'player_identify', playerId }));
      } else requestData();
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === 'player_identified') requestData();
        if (message.type === 'leaderboard_data') {
          if (active) { setLeaderboardData(message); setLeaderboardLoading(false); }
          socket.close(1000, 'Leaderboard loaded');
        }
      } catch { /* Ignore unrelated or malformed server messages. */ }
    });
    socket.addEventListener('error', () => { if (active) setLeaderboardLoading(false); });
    socket.addEventListener('close', () => { if (active && !leaderboardData) setLeaderboardLoading(false); });
    return () => { active = false; socket.close(1000, 'Leaderboard request cancelled'); };
  }, [menuScreen, leaderboardTab]);

const MENU_MUSIC_STORAGE_KEY = 'pixel_frontier_menu_music';

function getStoredMenuMusicSettings(): { volume: number; muted: boolean } {
  if (typeof window === 'undefined') return { volume: 0.4, muted: false };
  try {
    const raw = window.localStorage.getItem(MENU_MUSIC_STORAGE_KEY);
    if (!raw) return { volume: 0.4, muted: false };
    const saved = JSON.parse(raw) as { volume?: unknown; muted?: unknown };
    return {
      volume: typeof saved.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.4,
      muted: saved.muted === true,
    };
  } catch {
    return { volume: 0.4, muted: false };
  }
}

function saveMenuMusicSettings(volume: number, muted: boolean) {
  try {
    window.localStorage.setItem(MENU_MUSIC_STORAGE_KEY, JSON.stringify({ volume, muted }));
  } catch {
    // Audio settings remain usable when storage is unavailable.
  }
}
  const [worldName, setWorldName] = useState(developerTestMode ? 'PIXEL_FRONTIER_RUNTIME_TEST' : '');
  const [menuError, setMenuError] = useState('');
  const [guestName, setGuestName] = useState<string>(() => getStoredGuestName());
  const [accountUser, setAccountUser] = useState<{
    id: string;
    username?: string;
    email?: string;
    displayName: string;
    createdAt?: number;
    stats?: {
      totalPlaytimeSec?: number;
      blocksPlaced?: number;
      blocksMined?: number;
      kills?: number;
      deaths?: number;
    };
  } | null>(null);
  const [googleAuthStatus, setGoogleAuthStatus] = useState<{ enabled: boolean; message: string; redirectUri?: string }>({ enabled: false, message: 'Google sign-in is not configured yet.' });
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [multiplayerLobbyCode, setMultiplayerLobbyCode] = useState('');
  const [recentLobbies, setRecentLobbies] = useState<string[]>(() => getStoredRecentLobbies());
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirmPassword, setAuthConfirmPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [showAuthPassword, setShowAuthPassword] = useState(false);
  const [showAuthConfirmPassword, setShowAuthConfirmPassword] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordChangeStatus, setPasswordChangeStatus] = useState('');
  const [passwordChangeBusy, setPasswordChangeBusy] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [cloudLastSavedAt, setCloudLastSavedAt] = useState<number | null>(null);
  const cloudSaveVersionRef = useRef<number>(0);
  const [renameDraft, setRenameDraft] = useState(guestName);
  const [renameStatus, setRenameStatus] = useState('');
  const [touchControlsMode, setTouchControlsMode] = useState<'auto' | 'on' | 'off'>(() => {
    if (typeof window === 'undefined') return 'auto';
    try {
      return (window.localStorage.getItem('pixel_frontier_touch_controls') as 'auto' | 'on' | 'off') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const [isTouchDeviceState, setIsTouchDeviceState] = useState(() => isTouchDevice());

  useEffect(() => {
    const handleResize = () => {
      setIsTouchDeviceState(isTouchDevice());
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  const showTouchControls =
    touchControlsMode === 'on' ||
    (touchControlsMode === 'auto' && (isTouchDeviceState || (typeof window !== 'undefined' && window.innerWidth <= 1024)));

  const handleToggleTouchControls = useCallback(() => {
    const next = showTouchControls ? 'off' : 'on';
    setTouchControlsMode(next);
    try {
      window.localStorage.setItem('pixel_frontier_touch_controls', next);
    } catch {}
  }, [showTouchControls]);
  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null);
  const [lobbyStatus, setLobbyStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
  const [lobbyError, setLobbyError] = useState('');
  const [inviteFeedback, setInviteFeedback] = useState('');
  const [lobbyNotice, setLobbyNotice] = useState('');
  const lobbySocketRef = useRef<WebSocket | null>(null);
  const renameRateLimitRef = useRef(0);
  const lobbyInfoRef = useRef<LobbyInfo | null>(null);
  const lobbyPlayerIdRef = useRef('');
  const lastSentPositionRef = useRef<{ x: number; y: number; facingRight: boolean } | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageItem[]>([]);
  const [chatNotice, setChatNotice] = useState('');
  const chatNoticeTimerRef = useRef<number | null>(null);

  const showChatNotice = (notice: string) => {
    setChatNotice(notice);
    if (chatNoticeTimerRef.current !== null) {
      window.clearTimeout(chatNoticeTimerRef.current);
    }
    chatNoticeTimerRef.current = window.setTimeout(() => {
      setChatNotice('');
      chatNoticeTimerRef.current = null;
    }, 4000);
  };

  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [friendsList, setFriendsList] = useState<FriendItem[]>([]);
  const [incomingFriendRequests, setIncomingFriendRequests] = useState<FriendRequestItem[]>([]);
  const [outgoingFriendRequests, setOutgoingFriendRequests] = useState<FriendRequestItem[]>([]);
  const [friendsNotice, setFriendsNotice] = useState<string | null>(null);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const friendsNoticeTimerRef = useRef<number | null>(null);

  const showFriendsNotice = (notice: string) => {
    setFriendsNotice(notice);
    if (friendsNoticeTimerRef.current !== null) {
      window.clearTimeout(friendsNoticeTimerRef.current);
    }
    friendsNoticeTimerRef.current = window.setTimeout(() => {
      setFriendsNotice(null);
      friendsNoticeTimerRef.current = null;
    }, 4000);
  };

  const getEffectivePlayerId = useCallback(() => {
    if (accountUser?.id) return accountUser.id;
    if (typeof window !== 'undefined') {
      let id = window.localStorage.getItem('pixel_frontier_multiplayer_player_id') ||
               window.sessionStorage.getItem('pixel_frontier_multiplayer_player_id');
      if (!id) {
        id = `player-${Math.floor(100000 + Math.random() * 900000)}`;
        window.localStorage.setItem('pixel_frontier_multiplayer_player_id', id);
      }
      return id;
    }
    return 'player-guest';
  }, [accountUser]);

  const fetchFriends = useCallback(async () => {
    const myId = getEffectivePlayerId();
    const myName = accountUser?.displayName || guestName || 'Player';
    try {
      setFriendsLoading(true);
      const res = await fetch(apiUrl(`/api/friends?playerId=${encodeURIComponent(myId)}&displayName=${encodeURIComponent(myName)}`));
      if (res.ok) {
        const data = await res.json();
        if (data.ok) {
          if (Array.isArray(data.friends)) setFriendsList(data.friends);
          if (Array.isArray(data.incomingRequests)) setIncomingFriendRequests(data.incomingRequests);
          if (Array.isArray(data.outgoingRequests)) setOutgoingFriendRequests(data.outgoingRequests);
        }
      }
    } catch {
      // background poll
    } finally {
      setFriendsLoading(false);
    }
  }, [getEffectivePlayerId, accountUser, guestName]);

  useEffect(() => {
    if (gameState === 'TITLE') {
      fetchFriends();
      const interval = setInterval(fetchFriends, 4000);
      return () => clearInterval(interval);
    }
  }, [gameState, fetchFriends]);

  const handleAcceptFriendRequest = async (fromPlayerId: string) => {
    const myId = getEffectivePlayerId();
    try {
      const res = await fetch(apiUrl('/api/friends/respond'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: myId, fromPlayerId, action: 'accept' }),
      });
      const data = await res.json();
      if (data.ok) {
        showFriendsNotice(data.message || 'Friend request accepted!');
        fetchFriends();
      }
    } catch {
      showFriendsNotice('Failed to accept friend request');
    }
  };

  const handleRejectFriendRequest = async (fromPlayerId: string) => {
    const myId = getEffectivePlayerId();
    try {
      const res = await fetch(apiUrl('/api/friends/respond'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: myId, fromPlayerId, action: 'reject' }),
      });
      const data = await res.json();
      if (data.ok) {
        showFriendsNotice('Friend request rejected');
        fetchFriends();
      }
    } catch {
      showFriendsNotice('Failed to reject friend request');
    }
  };

  const handleSendFriendRequest = async (targetPlayerId: string, targetPlayerName?: string) => {
    const myId = getEffectivePlayerId();
    const myName = accountUser?.displayName || guestName || 'Player';
    try {
      if (lobbySocketRef.current && lobbySocketRef.current.readyState === WebSocket.OPEN) {
        lobbySocketRef.current.send(JSON.stringify({
          type: 'send_friend_request',
          targetPlayerId,
          targetPlayerName: targetPlayerName || targetPlayerId,
          fromPlayerId: myId,
          fromPlayerName: myName,
        }));
      }
      const res = await fetch(apiUrl('/api/friends/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromPlayerId: myId,
          fromPlayerName: myName,
          targetPlayerId,
          targetPlayerName: targetPlayerName || targetPlayerId,
        }),
      });
      const data = await res.json();
      showFriendsNotice(data.message || 'Friend request sent!');
      showChatNotice(data.message || 'Friend request sent!');
      fetchFriends();
    } catch {
      showFriendsNotice('Failed to send friend request');
      showChatNotice('Failed to send friend request');
    }
  };

  const handleRemoveFriend = async (friendPlayerId: string) => {
    const myId = getEffectivePlayerId();
    try {
      await fetch(apiUrl('/api/friends/remove'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: myId, friendPlayerId }),
      });
      fetchFriends();
      showFriendsNotice('Friend removed');
    } catch {
      showFriendsNotice('Failed to remove friend');
    }
  };

  const handleJoinFriendLobby = (lobbyName: string) => {
    setMenuScreen('multiplayer');
    setMultiplayerLobbyCode(lobbyName);
    handleJoinLobby(lobbyName);
  };
  const [stats, setStats] = useState<GameStats>({
    fps: 60,
    timeOfDayFormatted: '07:30 AM',
    dayCount: 1,
    playerX: 0,
    playerY: 0,
    chunkX: 0,
    chunkY: 0,
    depthName: 'Surface',
    depthMeters: 0,
    loadedChunks: 0,
    visibleChunks: 0,
    seed: 1337,
    profiler: {
      fps: 60,
      avgFrameTime: 0,
      worstFrameTime: 0,
      renderTime: 0,
      physicsTime: 0,
      chunkMgmtTime: 0,
      chunkGenTime: 0,
      queuedChunks: 0,
      frameTime: 0,
      updateTime: 0,
    },
    hotbar: [],
    activeSlot: 0,
    zoom: 1.0,
    activeDrops: 0,
    health: 100,
    maxHealth: 100,
    food: 100,
    maxFood: 100,
    stamina: 100,
    maxStamina: 100,
    isSprinting: false,
    activeEnemies: 0,
    biomeName: 'Plains',
    hasHome: false,
    homeX: 0,
    homeY: 0,
    homeCooldownMs: 0,
    teleportStatus: '',
    moonPhaseIndex: 0,
    moonPhaseName: 'Full Moon',
    moonPhaseIcon: '🌕',
    auroraActive: true,
    skyPeriod: 'Sunset',
    activeBuffs: [],
  });

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [initialMenuMusicSettings] = useState(() => getStoredMenuMusicSettings());
  const [menuMusicMuted, setMenuMusicMuted] = useState(initialMenuMusicSettings.muted);
  const menuMusicVolumeRef = useRef(initialMenuMusicSettings.volume);
  const menuMusicMutedRef = useRef(initialMenuMusicSettings.muted);
  const menuMusicAudioRef = useRef<HTMLAudioElement | null>(null);
  const [showMinimap, setShowMinimap] = useState<boolean>(true);
  const [showDebug, setShowDebug] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [showBiomeMenu, setShowBiomeMenu] = useState<boolean>(false);
  const [showInventory, setShowInventory] = useState(false);
  const [showCreativeCatalog, setShowCreativeCatalog] = useState(false);
  const [gameMode, setGameMode] = useState<'survival' | 'creative'>('survival');
  const [mobileModalTab, setMobileModalTab] = useState<'inventory' | 'crafting' | 'catalog'>('inventory');
  const [creativeRightTab, setCreativeRightTab] = useState<'catalog' | 'crafting'>('catalog');
  const [selectedInvSlot, setSelectedInvSlot] = useState<number | null>(null);
  const [openChest, setOpenChest] = useState<WorldChest | null>(null);
  const openChestRef = useRef<WorldChest | null>(null);
  openChestRef.current = openChest;
  const [chestNotice, setChestNotice] = useState('');
  const [chestPending, setChestPending] = useState(false);
  const chestRequestCounterRef = useRef(0);
  const localChestsRef = useRef<Map<string, WorldChest>>(new Map());
  const worldObjectsRef = useRef<Map<string, InteractiveObjectState>>(new Map());
  const [activeSign, setActiveSign] = useState<InteractiveObjectState | null>(null);
  const [showChapterIntro, setShowChapterIntro] = useState(false);
  const [chapterTitle, setChapterTitle] = useState('CHAPTER 1');
  const [chapterSubtitle, setChapterSubtitle] = useState('SURVIVE');
  const [chapterIntroKey, setChapterIntroKey] = useState(0);
  const chapterIntroTimerRef = useRef<number | null>(null);
  const localChestSeedRef = useRef<number | null>(null);
  const [localChestVersion, setLocalChestVersion] = useState(0);
  const showInventoryRef = useRef(false);
  showInventoryRef.current = showInventory;
  const [showCrafting, setShowCrafting] = useState(false);
  const showCraftingRef = useRef(false);
  showCraftingRef.current = showCrafting;
  const [isCraftingBenchActive, setIsCraftingBenchActive] = useState(false);
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [testMessage, setTestMessage] = useState('');
  const [showTestControls, setShowTestControls] = useState(true);
  const [testWalkHeld, setTestWalkHeld] = useState(false);
  const [testLeftHeld, setTestLeftHeld] = useState(false);
  const [testSprintHeld, setTestSprintHeld] = useState(false);
  const [testSprintRunHeld, setTestSprintRunHeld] = useState(false);
  const [dragTarget, setDragTargetState] = useState<InventorySlotRef | null>(null);
  const dragTargetRef = useRef<InventorySlotRef | null>(null);
  const setDragTarget = useCallback((next: InventorySlotRef | null) => {
    const prev = dragTargetRef.current;
    if ((prev === null && next === null) || (prev && next && prev.kind === next.kind && prev.index === next.index)) {
      return;
    }
    dragTargetRef.current = next;
    setDragTargetState(next);
  }, []);
  const dragSourceRef = useRef<InventorySlotRef | null>(null);
  const touchDragSourceRef = useRef<{ slot: InventorySlotRef; startX: number; startY: number } | null>(null);
  const lastDragEndedAtRef = useRef<number>(0);
  const dragPreviewElRef = useRef<HTMLDivElement | null>(null);
  const dragPreviewPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [dragPreview, setDragPreview] = useState<{
    item: ItemType;
    count: number;
    name: string;
    color: string;
    toolKind?: ToolKind;
    toolTier?: ToolTier;
    x: number;
    y: number;
  } | null>(null);

  const loginUi = useMemo(() => getLoginUiVisibility(Boolean(accountUser)), [accountUser]);

  useEffect(() => {
    const menuAudioSrc = `${import.meta.env.BASE_URL}audio/pixel-frontier-menu.mp3`;
    const audio = new Audio(menuAudioSrc);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = menuMusicVolumeRef.current;
    audio.muted = menuMusicMutedRef.current;
    menuMusicAudioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      menuMusicAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = menuMusicAudioRef.current;
    if (!audio) return;
    if (gameState !== 'TITLE') {
      audio.pause();
      return;
    }

    let active = true;
    let retryAttached = false;
    const removeGestureListeners = () => {
      if (!retryAttached) return;
      document.removeEventListener('pointerdown', onFirstInteraction);
      document.removeEventListener('keydown', onFirstInteraction);
      retryAttached = false;
    };
    const onFirstInteraction = () => {
      removeGestureListeners();
      startPlayback();
    };
    const attachGestureListeners = () => {
      if (retryAttached || !active) return;
      document.addEventListener('pointerdown', onFirstInteraction, { once: true });
      document.addEventListener('keydown', onFirstInteraction, { once: true });
      retryAttached = true;
    };
    const startPlayback = () => {
      if (!active) return;
      audio.play().then(() => {
        if (!active) audio.pause();
      }).catch(() => attachGestureListeners());
    };

    startPlayback();
    return () => {
      active = false;
      removeGestureListeners();
    };
  }, [gameState]);
  const activePointerDragRef = useRef<{
    source: InventorySlotRef;
    item: ItemType;
    count: number;
    name: string;
    color: string;
    toolKind?: ToolKind;
    toolTier?: ToolTier;
    startX: number;
    startY: number;
    isDragging: boolean;
    pointerId: number;
  } | null>(null);
  const [homeCooldownNotice, setHomeCooldownNotice] = useState<string>('');
  const [namedHomes, setNamedHomes] = useState<NamedHome[]>([]);
  const [homePendingDeletion, setHomePendingDeletion] = useState<NamedHome | null>(null);
  const deletingHomeRef = useRef(false);
  const [newHomeName, setNewHomeName] = useState('');
  const [lobbyPlayers, setLobbyPlayers] = useState<RemotePlayerState[]>([]);
  const [selectedTeleportPlayer, setSelectedTeleportPlayer] = useState('');
  const [incomingTeleportRequest, setIncomingTeleportRequest] = useState<TeleportRequest | null>(null);
  const incomingTeleportRequestRef = useRef<TeleportRequest | null>(null);
  incomingTeleportRequestRef.current = incomingTeleportRequest;
  const [outgoingTeleportRequest, setOutgoingTeleportRequest] = useState<TeleportRequest | null>(null);
  const [teleportNotice, setTeleportNotice] = useState('');
  const teleportNoticeTimerRef = useRef<number | null>(null);
  const showTeleportNotice = useCallback((notice: string, durationMs = 4000) => {
    setTeleportNotice(notice);
    if (teleportNoticeTimerRef.current !== null) {
      window.clearTimeout(teleportNoticeTimerRef.current);
    }
    teleportNoticeTimerRef.current = window.setTimeout(() => {
      setTeleportNotice('');
      teleportNoticeTimerRef.current = null;
    }, durationMs);
  }, []);
  const [teleportNow, setTeleportNow] = useState(Date.now());
  const [openTeleportSection, setOpenTeleportSection] = useState<'biomes' | 'homes' | 'players' | null>('biomes');
  const [biomeTeleportFeedback, setBiomeTeleportFeedback] = useState<BiomeTeleportFeedback | null>(null);
  const biomeTeleportTargetRef = useRef<string | null>(null);
  const biomeTeleportRequestStartedRef = useRef(false);
  const [miningNotice, setMiningNotice] = useState('');
  const miningNoticeTimerRef = useRef<number | null>(null);
  const biomeMenuOpenRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const visibleInventoryRecipes = useMemo(() => {
    const inventory = engineRef.current?.inventory;
    return inventory ? getVisibleRecipes('inventory', inventory) : [];
  }, [inventoryVersion, showInventory]);

  const playerName = accountUser?.displayName ?? guestName;

  useEffect(() => {
    setNamedHomes(loadNamedHomes(stats.seed));
  }, [stats.seed]);

  useEffect(() => {
    if (!incomingTeleportRequest && !outgoingTeleportRequest) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setTeleportNow(now);
      if (incomingTeleportRequest && incomingTeleportRequest.expiresAt <= now) {
        incomingTeleportRequestRef.current = null;
        setIncomingTeleportRequest(null);
      }
      if (outgoingTeleportRequest && outgoingTeleportRequest.expiresAt <= now) {
        setOutgoingTeleportRequest(null);
        showTeleportNotice('Teleport request expired.');
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [incomingTeleportRequest, outgoingTeleportRequest, showTeleportNotice]);

  const refreshLobbyPlayers = () => {
    setLobbyPlayers(Array.from(engineRef.current?.remotePlayers.values() ?? []));
  };

  const loadAccountCloudProgress = useCallback(async () => {
    const token = getStoredAuthToken();
    if (!token) return;
    try {
      const response = await fetch('/api/v1/player/load', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = (await response.json()) as { ok?: boolean; save?: any };
      if (data.ok && data.save) {
        cloudSaveVersionRef.current = data.save.saveVersion || 0;
        setCloudLastSavedAt(data.save.lastSavedAt || null);

        // Restore saved named homes
        if (Array.isArray(data.save.namedHomes) && data.save.namedHomes.length > 0) {
          for (const home of data.save.namedHomes) {
            if (home && typeof home.seed === 'number' && typeof home.name === 'string') {
              const existing = loadNamedHomes(home.seed);
              if (!existing.some((h) => h.id === home.id)) {
                saveNamedHomes(home.seed, [...existing, home]);
              }
            }
          }
          if (engineRef.current) {
            setNamedHomes(loadNamedHomes(engineRef.current.chunkManager.seed));
          }
        }
        return data.save;
      }
    } catch {
      // Cloud load error fallback
    }
    return null;
  }, []);

  const saveAccountCloudProgress = useCallback(async () => {
    const token = getStoredAuthToken();
    if (!token) return;
    const currentEngine = engineRef.current;
    if (!currentEngine || currentEngine.state === 'TITLE') return;

    setCloudSyncStatus('saving');
    try {
      const currentSeed = currentEngine.chunkManager.seed;
      const homes = loadNamedHomes(currentSeed);
      const payload = {
        expectedVersion: cloudSaveVersionRef.current,
        playerState: {
          x: currentEngine.player.x,
          y: currentEngine.player.y,
          health: currentEngine.player.health,
          maxHealth: currentEngine.player.maxHealth,
          food: currentEngine.player.food,
          maxFood: currentEngine.player.maxFood,
          stamina: currentEngine.player.stamina,
          maxStamina: currentEngine.player.maxStamina,
          isAlive: currentEngine.player.health > 0,
          seed: currentSeed,
          facingRight: currentEngine.player.facingRight,
        },
        inventory: currentEngine.inventory.toJSON(),
        hotbar: {
          slots: currentEngine.inventory.getSlots(),
          activeSlot: currentEngine.inventory.activeSlot,
        },
        namedHomes: homes,
        stats: {
          totalPlaytimeSec: Math.floor(stats.dayCount * 240),
          blocksPlaced: 0,
          blocksMined: 0,
          kills: 0,
          deaths: 0,
        },
      };

      const response = await fetch('/api/v1/player/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = (await response.json()) as { ok?: boolean; saveVersion: number; savedAt: number };
        cloudSaveVersionRef.current = data.saveVersion;
        setCloudLastSavedAt(data.savedAt);
        setCloudSyncStatus('saved');
        setTimeout(() => setCloudSyncStatus('idle'), 3000);
      } else {
        setCloudSyncStatus('error');
        setTimeout(() => setCloudSyncStatus('idle'), 3000);
      }
    } catch {
      setCloudSyncStatus('error');
      setTimeout(() => setCloudSyncStatus('idle'), 3000);
    }
  }, [stats.dayCount]);

  const refreshAccountProfile = useCallback(async () => {
    const token = getStoredAuthToken();
    if (!token) {
      setAccountUser(null);
      return;
    }
    try {
      const response = await fetch('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        window.localStorage.removeItem('pixel_frontier_auth_token');
        setAccountUser(null);
        return;
      }
      const data = (await response.json()) as {
        user?: {
          id: string;
          username?: string;
          email?: string;
          displayName: string;
          createdAt?: number;
          stats?: any;
        };
      };
      if (data.user) {
        setAccountUser(data.user);
        if (data.user.displayName) {
          setGuestName(data.user.displayName);
        }
        void loadAccountCloudProgress();
      }
    } catch {
      setAccountUser(null);
    }
  }, [loadAccountCloudProgress]);

  useEffect(() => {
    void refreshAccountProfile();

    const loadGoogleStatus = async () => {
      try {
        const response = await fetch('/api/auth/google/config');
        if (!response.ok) {
          setGoogleAuthStatus({ enabled: false, message: 'Google sign-in is unavailable right now.' });
          return;
        }
        const data = (await response.json()) as { enabled?: boolean; redirectUri?: string; envHint?: string };
        setGoogleAuthStatus({
          enabled: Boolean(data.enabled),
          message: data.enabled ? 'Google sign-in is ready.' : (data.envHint || 'Google sign-in is not configured yet.'),
          redirectUri: data.redirectUri,
        });
      } catch {
        setGoogleAuthStatus({ enabled: false, message: 'Google sign-in is unavailable right now.' });
      }
    };
    void loadGoogleStatus();

    const authTokenFromUrl = new URLSearchParams(window.location.search).get('authToken');
    if (authTokenFromUrl) {
      window.localStorage.setItem('pixel_frontier_auth_token', authTokenFromUrl);
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('authToken');
      window.history.replaceState({}, '', nextUrl);
      void refreshAccountProfile();
    }

    setRecentLobbies(getStoredRecentLobbies());
  }, [refreshAccountProfile]);

  useEffect(() => {
    setRenameDraft(playerName);
  }, [playerName]);

  const handleGoogleSignIn = () => {
    if (!googleAuthStatus.enabled) {
      setAuthError('Google sign-in is not configured yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in your server environment.');
      setAuthDialogOpen(true);
      return;
    }
    const redirectTarget = `${window.location.origin}${window.location.pathname}`;
    window.location.assign(`/api/auth/google/start?redirect=${encodeURIComponent(redirectTarget)}`);
  };

  const handleAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');

    try {
      if (authMode === 'signup') {
        const username = authUsername.trim();
        const password = authPassword;
        const confirm = authConfirmPassword;

        if (!username || !password) {
          throw new Error('Please enter both a username and password.');
        }
        if (username.length < 3) {
          throw new Error('Username must be at least 3 characters.');
        }
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        if (password !== confirm) {
          throw new Error('Passwords do not match.');
        }

        const response = await fetch(apiUrl('/api/v1/auth/register'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username,
            password,
            displayName: username,
            email: authEmail.trim() || undefined,
          }),
        });
        const data = (await response.json()) as { ok?: boolean; token?: string; error?: string; user?: any };
        if (!response.ok || !data.ok || !data.token) {
          throw new Error(data.error || 'Unable to create account.');
        }

        window.localStorage.setItem('pixel_frontier_auth_token', data.token);
        setAccountUser(data.user ?? null);
        if (data.user?.displayName) setGuestName(data.user.displayName);
        setAuthDialogOpen(false);
        setAuthUsername('');
        setAuthEmail('');
        setAuthPassword('');
        setAuthConfirmPassword('');
        setProfileDialogOpen(true);
        void loadAccountCloudProgress();
      } else {
        const identifier = (authUsername || authEmail).trim();
        const password = authPassword;

        if (!identifier || !password) {
          throw new Error('Please enter both your username/email and password.');
        }

        const response = await fetch(apiUrl('/api/v1/auth/login'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier,
            password,
          }),
        });
        const data = (await response.json()) as { ok?: boolean; token?: string; error?: string; user?: any };
        if (!response.ok || !data.ok || !data.token) {
          throw new Error(data.error || 'Invalid username or password.');
        }

        window.localStorage.setItem('pixel_frontier_auth_token', data.token);
        setAccountUser(data.user ?? null);
        if (data.user?.displayName) setGuestName(data.user.displayName);
        setAuthDialogOpen(false);
        setAuthUsername('');
        setAuthEmail('');
        setAuthPassword('');
        setAuthConfirmPassword('');
        setProfileDialogOpen(true);
        void loadAccountCloudProgress();
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = getStoredAuthToken();
    if (!token) return;

    if (!currentPassword || !newPassword) {
      setPasswordChangeStatus('Please enter both your current and new password.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordChangeStatus('New password must be at least 6 characters.');
      return;
    }

    setPasswordChangeBusy(true);
    setPasswordChangeStatus('');
    try {
      const res = await fetch('/api/v1/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPasswordChangeStatus(data.error || 'Failed to update password.');
      } else {
        setPasswordChangeStatus('✅ Password updated successfully!');
        setCurrentPassword('');
        setNewPassword('');
        setTimeout(() => setShowPasswordChange(false), 2000);
      }
    } catch {
      setPasswordChangeStatus('Network error while updating password.');
    } finally {
      setPasswordChangeBusy(false);
    }
  };

  const handleLogOut = async () => {
    const token = getStoredAuthToken();
    setProfileDialogOpen(false);
    if (token) {
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Ignore logout failures and clear the local session anyway.
      }
    }
    window.localStorage.removeItem('pixel_frontier_auth_token');
    setAccountUser(null);
    const nextGuestName = getStoredGuestName();
    setGuestName(nextGuestName);
    setRenameDraft(nextGuestName);
    setRenameStatus('');
    cloudSaveVersionRef.current = 0;
    setCloudLastSavedAt(null);
  };

  const handleSaveProfileName = async () => {
    const nextName = sanitizeDisplayName(renameDraft, 16);
    if (!nextName || nextName.length < 3) {
      setRenameStatus('Name must be at least 3 characters.');
      return;
    }
    const now = Date.now();
    if (now - renameRateLimitRef.current < 1200) {
      setRenameStatus('Please wait a moment before changing your name again.');
      return;
    }
    renameRateLimitRef.current = now;
    setRenameStatus('');

    if (accountUser) {
      const token = getStoredAuthToken();
      if (!token) {
        setRenameStatus('Please log in again to update your profile name.');
        return;
      }
      try {
        const response = await fetch('/api/account/profile', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ displayName: nextName }),
        });
        const data = (await response.json()) as { ok?: boolean; error?: string; user?: { displayName: string } };
        if (!response.ok || !data.ok || !data.user) {
          throw new Error(data.error || 'Unable to update your profile name.');
        }
        const updated = data.user.displayName;
        setAccountUser((current) => current ? { ...current, displayName: updated } : current);
        setGuestName(updated);
        setRenameDraft(updated);
        setProfileDialogOpen(false);
        return;
      } catch (error) {
        setRenameStatus(error instanceof Error ? error.message : 'Unable to save your profile name.');
        return;
      }
    }

    const persistedName = sanitizeDisplayName(nextName, 16);
    window.localStorage.setItem('pixel_frontier_guest_name', persistedName);
    setGuestName(persistedName);
    setRenameDraft(persistedName);
    setProfileDialogOpen(false);
  };

  const saveLocalChests = () => {
    const seed = localChestSeedRef.current;
    if (seed === null) return;
    try { window.localStorage.setItem(`pixel-frontier-chests:${seed}`, JSON.stringify(Array.from(localChestsRef.current.values()))); }
    catch { setChestNotice('Could not save chest contents in this browser.'); }
  };

  const saveLocalWorldObjects = (seed: number) => {
    try { window.localStorage.setItem(`pixel-frontier-objects:${seed}`, JSON.stringify(Array.from(worldObjectsRef.current.values()))); }
    catch { setChestNotice('Could not save world object state in this browser.'); }
  };

  const closeWorldChest = () => {
    const socket = lobbySocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'chest_close' }));
    setOpenChest(null);
    setChestPending(false);
    setChestNotice('');
  };

  const openWorldChestAt = (x: number, y: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const info = lobbyInfoRef.current;
    const seed = info?.worldSeed ?? engine.chunkManager.seed;
    const worldKey = info?.lobbyName ?? `single-${seed}`;
    const tile = engine.chunkManager.getTile(x, y);
    const isFurnace = tile === TileType.FURNACE;
    const id = isFurnace ? worldObjectId(seed, x, y, 'furnace') : makeWorldChestId(worldKey, seed, x, y);
    const socket = lobbySocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'chest_open', chestId: id }));
      setChestNotice('');
      return;
    }
    const chest = localChestsRef.current.get(id);
    if (!chest) {
      setChestNotice('This chest has no local saved data.');
      return;
    }
    setOpenChest({ ...chest, containerType: isFurnace ? 'Furnace' : 'Chest', slots: sanitizeChestSlots(chest.slots) });
    setChestPending(false);
    setShowInventory(false);
    setIsCraftingBenchActive(false);
  };

  const transferWorldChestItems = (from: ChestEndpoint, to: ChestEndpoint, count?: number) => {
    const chest = openChestRef.current;
    const engine = engineRef.current;
    if (!chest || !engine || chestPending) return;
    const socket = lobbySocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      const requestId = `${Date.now().toString(36)}_${(++chestRequestCounterRef.current).toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      setChestPending(true);
      socket.send(JSON.stringify({ type: 'chest_transfer', chestId: chest.id, requestId, from, to, ...(count ? { count } : {}) }));
      return;
    }
    if (!transferChestItems(engine.inventory, chest.slots, from, to, count)) {
      setChestNotice('Transfer could not be completed.');
      return;
    }
    const updated = { ...chest, slots: [...chest.slots], revision: chest.revision + 1 };
    localChestsRef.current.set(updated.id, updated);
    setOpenChest(updated);
    saveLocalChests();
    setInventoryVersion((value) => value + 1);
  };

  const saveSignText = (text: string) => {
    if (!activeSign) return;
    const cleanText = sanitizeSignText(text);
    const socket = lobbySocketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      const requestId = `${Date.now().toString(36)}_${(++chestRequestCounterRef.current).toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      socket.send(JSON.stringify({ type: 'world_object_sign_update', objectId: activeSign.id, requestId, text: cleanText }));
    } else {
      const current = worldObjectsRef.current.get(activeSign.id) ?? activeSign;
      current.text = cleanText;
      current.interactionRevision++;
      worldObjectsRef.current.set(current.id, current);
      saveLocalWorldObjects(current.seed);
    }
    setActiveSign(null);
  };

  const triggerChapterBanner = useCallback((title: string, subtitle: string) => {
    setChapterTitle(title);
    setChapterSubtitle(subtitle);
    if (chapterIntroTimerRef.current !== null) {
      window.clearTimeout(chapterIntroTimerRef.current);
    }
    setChapterIntroKey((prev) => prev + 1);
    setShowChapterIntro(true);
    sound.playChapterIntro();
    chapterIntroTimerRef.current = window.setTimeout(() => {
      setShowChapterIntro(false);
      chapterIntroTimerRef.current = null;
    }, 5000);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const displayW = Math.floor(rect.width) || 1024;
    const displayH = Math.floor(rect.height) || 640;

    canvas.width = Math.floor(displayW * dpr);
    canvas.height = Math.floor(displayH * dpr);

    const engine = new GameEngine(canvas, developerTestMode);
    engineRef.current = engine;
    engine.getWorldObjects = () => worldObjectsRef.current.values();
    engine.onWorldBlockModified = (x, y, tile, dropItem) => {
      const socket = lobbySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        if (tile === TileType.AIR) {
          socket.send(JSON.stringify({ type: 'block_break', x, y, minedItem: dropItem }));
        } else {
          socket.send(JSON.stringify({ type: 'block_place', x, y, tile }));
        }
      } else {
        const seed = engine.chunkManager.seed;
        const objectType = objectTypeForTile(tile);
        const containerItem = dropItem === 'furnace' ? 'furnace' : 'chest';
        const id = tile === TileType.FURNACE || tile === TileType.AIR && dropItem === 'furnace'
          ? worldObjectId(seed, x, y, 'furnace')
          : makeWorldChestId(`single-${seed}`, seed, x, y);
        if (tile !== TileType.AIR && objectType) {
          const object = makeWorldObject(seed, x, y, objectType);
          worldObjectsRef.current.set(object.id, object);
          saveLocalWorldObjects(seed);
        }
        if (tile === TileType.CHEST || tile === TileType.FURNACE) {
          localChestsRef.current.set(id, { id, x, y, containerType: tile === TileType.FURNACE ? 'Furnace' : 'Chest', slots: makeEmptyChestSlots(), revision: 0 });
          localChestSeedRef.current = seed;
          saveLocalChests();
          if (tile === TileType.CHEST) {
            const placedKey = `pixel_frontier_first_chest_placed_${seed}`;
            if (!window.localStorage.getItem(placedKey)) {
              window.localStorage.setItem(placedKey, 'true');
              engine.inventory.addItem('protector', 1);
              setStats((previous) => ({ ...previous, hotbar: engine.inventory.getSlots() }));
              setInventoryVersion((version) => version + 1);
              triggerChapterBanner('CHAPTER 2', 'BASE');
              engine.onMiningNotice?.('First chest placed! Chapter 2: BASE unlocked. You received a Protector!');
            }
          }
        } else if (tile === TileType.AIR && (dropItem === 'chest' || dropItem === 'furnace')) {
          const chest = localChestsRef.current.get(id);
          for (const slot of chest?.slots ?? []) {
            if (slot.item && slot.count > 0) engine.itemDropManager.spawnDrop(slot.item, x * TILE_SIZE + 4, y * TILE_SIZE + 4, slot.count);
          }
          localChestsRef.current.delete(id);
          const objectType = containerItem === 'chest' ? 'chest' : 'furnace';
          worldObjectsRef.current.delete(worldObjectId(seed, x, y, objectType));
          saveLocalChests();
          saveLocalWorldObjects(seed);
        } else if (tile === TileType.AIR && dropItem) {
          const typeByItem: Partial<Record<ItemType, InteractiveObjectType>> = { door: 'door', ladder: 'ladder', bed: 'bed', campfire: 'campfire', lever: 'lever', sign: 'sign', platform: 'platform', torch: 'torch', pressure_plate: 'pressure_plate', trapdoor: 'trapdoor', gate: 'gate', bridge: 'bridge', rope: 'rope' };
          const type = typeByItem[dropItem];
          if (type) worldObjectsRef.current.delete(worldObjectId(seed, x, y, type));
          saveLocalWorldObjects(seed);
        }
      }
    };
    engine.onPressurePlateStateChanged = (x, y, pressed) => {
      const seed = engine.chunkManager.seed;
      const id = worldObjectId(seed, x, y, 'pressure_plate');
      const object = worldObjectsRef.current.get(id) ?? makeWorldObject(seed, x, y, 'pressure_plate');
      object.active = pressed;
      object.interactionRevision++;
      worldObjectsRef.current.set(id, object);
      saveLocalWorldObjects(seed);
      engine.showWorldObjectFeedback(x, y, pressed ? '#facc15' : '#94a3b8');
      engine.onMiningNotice?.(pressed ? 'Pressure plate pressed' : 'Pressure plate released');
    };
    engine.onChestInteract = (x, y) => openWorldChestAt(x, y);
    engine.onWorldObjectInteract = (x, y, type) => {
      if (type === 'chest' || type === 'furnace') { openWorldChestAt(x, y); return; }
      const info = lobbyInfoRef.current;
      const seed = info?.worldSeed ?? engine.chunkManager.seed;
      const id = worldObjectId(seed, x, y, type);
      const socket = lobbySocketRef.current;
      const requestId = `${Date.now().toString(36)}_${(++chestRequestCounterRef.current).toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'world_object_interact', objectId: id, requestId }));
        return;
      }
      const object = worldObjectsRef.current.get(id) ?? makeWorldObject(seed, x, y, type);
      if (type === 'door') { object.open = !object.open; engine.chunkManager.setBlock(x, y, object.open ? TileType.DOOR_OPEN : TileType.DOOR); }
      else if (type === 'trapdoor') { object.open = !object.open; engine.chunkManager.setBlock(x, y, object.open ? TileType.TRAPDOOR_OPEN : TileType.TRAPDOOR); }
      else if (type === 'gate') { object.open = !object.open; engine.chunkManager.setBlock(x, y, object.open ? TileType.GATE_OPEN : TileType.GATE); }
      else if (type === 'campfire') { object.active = !object.active; engine.chunkManager.setBlock(x, y, object.active ? TileType.CAMPFIRE : TileType.CAMPFIRE_OFF); }
      else if (type === 'lever') { object.active = !object.active; engine.chunkManager.setBlock(x, y, object.active ? TileType.LEVER_ON : TileType.LEVER); }
      else if (type === 'sign') setActiveSign(object);
      object.lastInteractedBy = 'local-player'; object.interactionRevision++;
      worldObjectsRef.current.set(id, object); saveLocalWorldObjects(seed);
      engine.showWorldObjectFeedback(x, y);
      engine.onMiningNotice?.(type === 'sign' ? 'Sign opened' : `${type.replace('_', ' ')} ${object.open ? 'opened' : object.active ? 'activated' : 'closed'}`);
    };
    engine.onPlayerRespawned = (x, y) => {
      const socket = lobbySocketRef.current;
      debugCombat('respawn.send', { playerId: engine.combatPlayerId ?? lobbyPlayerIdRef.current, lifeId: engine.combatLifeId, health: engine.player.health, alive: engine.player.health > 0, x, y, state: engine.state });
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'player_respawn', x, y }));
      }
    };
    engine.onPickupRequested = (dropId, type, count) => {
      const socket = lobbySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'pickup_request', dropId, item: type, count }));
      }
    };
    engine.onDropSpawnRequested = (type, count, x, y) => {
      const socket = lobbySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'drop_spawn', item: type, count, x, y }));
      }
    };
    engine.onTillDirtRequested = (x, y, selectedSlotIndex) => {
      const socket = lobbySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        const requestId = `till:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        socket.send(JSON.stringify({ type: 'farm_till_dirt', x, y, selectedSlotIndex, requestId }));
      }
    };
    engine.onFarmPlantRequested = (x, y, seedType) => {
      const socket = lobbySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        const requestId = `farm-plant:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        socket.send(JSON.stringify({ type: 'farm_plant_seed', x, y, seedType, requestId }));
        return;
      }
      if (engine.chunkManager.getTile(x, y) !== TileType.TILLED_SOIL ||
          [...worldObjectsRef.current.values()].some((object) => object.type === 'crop' && object.x === x && object.y === y)) {
        engine.onMiningNotice?.('Seeds need an empty tilled-soil tile.');
        return;
      }
      if (!engine.inventory.consumeItem(seedType, 1)) {
        engine.onMiningNotice?.('You do not have that seed.');
        return;
      }
      const crop = makeWorldObject(engine.chunkManager.seed, x, y, 'crop');
      crop.cropType = seedType === 'wheat_seed' ? 'wheat' : seedType === 'carrot_seed' ? 'carrot' : 'berry';
      crop.plantedAt = Date.now();
      worldObjectsRef.current.set(crop.id, crop);
      saveLocalWorldObjects(engine.chunkManager.seed);
      engine.showWorldObjectFeedback(x, y);
      engine.onMiningNotice?.('Seed planted.');
      setStats((previous) => ({ ...previous, hotbar: engine.inventory.getSlots() }));
      setInventoryVersion((version) => version + 1);
    };
    engine.onFarmHarvestRequested = (x, y) => {
      const crop = [...worldObjectsRef.current.values()].find((object) => object.type === 'crop' && object.x === x && object.y === y);
      if (!crop?.cropType) return;
      if (getCropGrowthStage(crop) < 2) {
        engine.onMiningNotice?.('Crop is still growing.');
        return;
      }
      const socket = lobbySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        const requestId = `farm-harvest:${Date.now()}:${Math.random().toString(36).slice(2)}`;
        socket.send(JSON.stringify({ type: 'farm_harvest_crop', objectId: crop.id, requestId }));
        return;
      }
      const seedType: ItemType = crop.cropType === 'wheat' ? 'wheat_seed' : crop.cropType === 'carrot' ? 'carrot_seed' : 'berry_seed';
      const seedCount = ((Math.imul(engine.chunkManager.seed ^ x, 0x9e3779b1) ^ y * 131) & 0x7fff) % 2 + 1;
      const rewards: Array<[ItemType, number]> = [
        [crop.cropType, crop.cropType === 'berry' ? 3 : 2],
        [seedType, seedCount],
      ];
      for (const [item, amount] of rewards) {
        if (!engine.inventory.addItem(item, amount)) {
          engine.itemDropManager.spawnDrop(item, x * TILE_SIZE + 4, y * TILE_SIZE + 4, amount);
        }
      }
      worldObjectsRef.current.delete(crop.id);
      saveLocalWorldObjects(engine.chunkManager.seed);
      engine.showWorldObjectFeedback(x, y, '#86efac');
      engine.onMiningNotice?.(`Harvested ${crop.cropType}. Press E to eat.`);
      setStats((previous) => ({ ...previous, hotbar: engine.inventory.getSlots() }));
      setInventoryVersion((version) => version + 1);
    };
    engine.onEatRequested = (item) => {
      const socket = lobbySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'eat_request', item }));
      }
    };
    engine.onStarvationDamageRequested = () => {
      const socket = lobbySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'starvation_damage', lifeId: engine.combatLifeId }));
      }
    };
    engine.onPlayerDamageRequested = (damage) => {
      const socket = lobbySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'player_damage', damage, lifeId: engine.combatLifeId }));
      }
    };
    engine.onGrantTestKitRequested = () => {
      const socket = lobbySocketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'developer_grant_test_kit' }));
      }
    };
    engine.onWildlifeAttackRequested = (animalId, damage) => {
      const socket = lobbySocketRef.current;
      debugCombat('wildlife-attack.send', { playerId: engine.combatPlayerId ?? lobbyPlayerIdRef.current, lifeId: engine.combatLifeId, animalId, health: engine.player.health, alive: engine.player.health > 0, damage, socketReadyState: socket?.readyState ?? null });
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'wildlife_attack', animalId, damage, lifeId: engineRef.current?.combatLifeId }));
      }
    };
    engine.onPlayerAttackRequested = (attackId) => {
      const socket = lobbySocketRef.current;
      debugCombat('player-attack.send', { playerId: engine.combatPlayerId ?? lobbyPlayerIdRef.current, lifeId: engine.combatLifeId, health: engine.player.health, alive: engine.player.health > 0, attackId, socketReadyState: socket?.readyState ?? null });
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'player_attack', attackId, lifeId: engineRef.current?.combatLifeId }));
      }
    };
    engine.onOpenCraftingBench = () => {
      setIsCraftingBenchActive(true);
      setInventoryVersion((v) => v + 1);
      setShowInventory(true);
    };
    engine.onInventoryChanged = () => {
      setInventoryVersion((v) => v + 1);
    };
    engine.onMiningNotice = (message) => {
      setMiningNotice(message);
      if (miningNoticeTimerRef.current !== null) window.clearTimeout(miningNoticeTimerRef.current);
      miningNoticeTimerRef.current = window.setTimeout(() => {
        setMiningNotice('');
        miningNoticeTimerRef.current = null;
      }, 1800);
    };
    engine.resize(displayW, displayH);

    setStats((prev) => ({
      ...prev,
      hotbar: engine.inventory.getSlots(),
      activeSlot: engine.inventory.activeSlot,
      zoom: engine.currentZoom,
    }));

    // Throttled stats updates (4x/sec)
    engine.onStatsUpdate = (newStats) => {
      const destination = biomeTeleportRequestStartedRef.current ? biomeTeleportTargetRef.current : null;
      if (destination) {
        const feedback = getBiomeTeleportFeedback(newStats.teleportStatus, destination);
        if (feedback?.kind === 'error') {
          biomeTeleportTargetRef.current = null;
          biomeTeleportRequestStartedRef.current = false;
          setBiomeTeleportFeedback(feedback);
        } else if (newStats.teleportStatus === `Arrived at ${destination}`) {
          biomeTeleportTargetRef.current = null;
          biomeTeleportRequestStartedRef.current = false;
          setBiomeTeleportFeedback(null);
        }
      }
      if (activePointerDragRef.current?.isDragging || dragSourceRef.current !== null) return;
      setStats(newStats);
    };

    engine.onStateChange = (newState) => {
      setGameState(newState);
    };

    const persistActiveSession = () => {
      const currentEngine = engineRef.current;
      if (!currentEngine || currentEngine.state === 'TITLE') return;
      const activeLobby = lobbyInfoRef.current;
      if (activeLobby) {
        try {
          const entries = currentEngine.chunkManager.modifications.getEntries();
          const blockModifications = entries.map(([key, tile]) => {
            const commaIdx = key.indexOf(',');
            return {
              x: parseInt(key.substring(0, commaIdx), 10),
              y: parseInt(key.substring(commaIdx + 1), 10),
              tile,
            };
          });
          const mpBackup = {
            lobbyName: activeLobby.lobbyName,
            worldSeed: activeLobby.worldSeed,
            updatedAt: Date.now(),
            blockModifications,
            playerState: {
              x: currentEngine.player.x,
              y: currentEngine.player.y,
              facingRight: currentEngine.player.facingRight,
              health: currentEngine.player.health,
              food: currentEngine.player.food,
              stamina: currentEngine.player.stamina,
              inventory: currentEngine.inventory.toJSON(),
            },
          };
          window.localStorage.setItem(`pixel_frontier_mp_backup_${activeLobby.lobbyName}`, JSON.stringify(mpBackup));
          if (auth.currentUser?.emailVerified) {
            void saveWorldToCloud({
              worldId: `mp_${activeLobby.lobbyName}_${activeLobby.worldSeed}`,
              worldName: activeLobby.lobbyName,
              seed: activeLobby.worldSeed,
              playerX: currentEngine.player.x,
              playerY: currentEngine.player.y,
              health: currentEngine.player.health,
              food: currentEngine.player.food,
              stamina: currentEngine.player.stamina,
              day: currentEngine.cycle.day,
              time: currentEngine.cycle.time,
              inventory: currentEngine.inventory.toJSON(),
              modifiedBlocks: entries,
            }).catch(() => {});
          }
        } catch {
          // Ignore storage quota errors
        }
      } else {
        const seed = currentEngine.chunkManager.seed;
        if (auth.currentUser?.emailVerified) {
          void saveWorldToCloud({
            worldId: `sp_${seed}`,
            worldName: `World_${seed}`,
            seed,
            playerX: currentEngine.player.x,
            playerY: currentEngine.player.y,
            health: currentEngine.player.health,
            food: currentEngine.player.food,
            stamina: currentEngine.player.stamina,
            day: currentEngine.cycle.day,
            time: currentEngine.cycle.time,
            inventory: currentEngine.inventory.toJSON(),
            modifiedBlocks: currentEngine.chunkManager.modifications.getEntries(),
          }).catch(() => {});
        }
      }
      void saveAccountCloudProgress();
    };

    engine.onAutosaveSnapshot = persistActiveSession;

    const handleBeforeUnload = () => {
      engineRef.current?.saveLocalState();
      persistActiveSession();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        engineRef.current?.saveLocalState();
        persistActiveSession();
        sound.pauseAudioContext();
        if (menuMusicAudioRef.current && !menuMusicAudioRef.current.paused) {
          menuMusicAudioRef.current.pause();
        }
      } else {
        sound.resumeAudioContext();
        if (engineRef.current?.state === 'TITLE' && !menuMusicMutedRef.current && menuMusicAudioRef.current) {
          menuMusicAudioRef.current.play().catch(() => {});
        }
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', () => {
      sound.pauseAudioContext();
    });
    window.addEventListener('focus', () => {
      sound.resumeAudioContext();
    });

    const handleResize = () => {
      if (!containerRef.current || !engineRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      if (width > 0 && height > 0) {
        engineRef.current.resize(Math.floor(width), Math.floor(height));
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.visualViewport?.addEventListener('resize', handleResize);

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
      setTimeout(handleResize, 80);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      if (e.code === 'Escape' && openChestRef.current) {
        e.preventDefault(); e.stopImmediatePropagation(); closeWorldChest(); return;
      }
      if ((e.code === 'KeyI' || e.key.toLowerCase() === 'i') && engineRef.current && !['TITLE', 'DEAD'].includes(engineRef.current.state) && !biomeMenuOpenRef.current) {
        e.preventDefault(); e.stopImmediatePropagation();
        setShowInventory((open) => {
          if (open) {
            setIsCraftingBenchActive(false);
          } else {
            setInventoryVersion((v) => v + 1);
          }
          return !open;
        });
        return;
      }
      const pendingTeleport = incomingTeleportRequestRef.current;
      if (pendingTeleport && (e.code === 'KeyY' || e.key.toLowerCase() === 'y' || e.code === 'KeyC' || e.key.toLowerCase() === 'c')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const accept = e.code === 'KeyY' || e.key.toLowerCase() === 'y';
        lobbySocketRef.current?.send(JSON.stringify({ type: 'teleport_request_response', requestId: pendingTeleport.requestId, accept }));
        incomingTeleportRequestRef.current = null;
        setIncomingTeleportRequest(null);
        showTeleportNotice(accept ? 'Teleport request accepted.' : 'Teleport request cancelled.');
        return;
      }
      if ((e.code === 'KeyQ' || e.key.toLowerCase() === 'q') && engineRef.current && !['TITLE', 'DEAD'].includes(engineRef.current.state) && !showInventoryRef.current && !showCraftingRef.current && !openChestRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const activeIdx = engineRef.current.inventory.activeSlot;
        if (activeIdx > 0) {
          const selected = engineRef.current.inventory.getSelectedSlot();
          if (selected?.type && selected.type !== 'sword' && selected.count > 0) {
            const dropCount = e.shiftKey ? selected.count : 1;
            handleDropOutsideFromSlot({ kind: 'hotbar', index: activeIdx }, selected.type, dropCount);
          }
        }
        return;
      }
      if ((e.code === 'KeyK' || e.key.toLowerCase() === 'k') && engineRef.current && !['TITLE', 'DEAD'].includes(engineRef.current.state)) {
        e.preventDefault();
        setBiomeMenuOpen(!biomeMenuOpenRef.current);
        return;
      }
      if ((e.code === 'KeyC' || e.key.toLowerCase() === 'c') && engineRef.current && !['TITLE', 'DEAD'].includes(engineRef.current.state) && !showCraftingRef.current && !openChestRef.current) {
        if (engineRef.current.isCreative) {
          e.preventDefault();
          setShowInventory((open) => {
            if (!open) {
              setInventoryVersion((v) => v + 1);
              setMobileModalTab('catalog');
              setCreativeRightTab('catalog');
            }
            return !open;
          });
          return;
        }
      }
      if ((e.code === 'KeyF' || e.key.toLowerCase() === 'f') && engineRef.current && !['TITLE', 'DEAD'].includes(engineRef.current.state) && !showInventoryRef.current && !showCraftingRef.current && !openChestRef.current) {
        if (engineRef.current.isCreative) {
          e.preventDefault();
          engineRef.current.toggleFlight();
          return;
        }
      }
      if (e.code === 'Escape' && showCreativeCatalog) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setShowCreativeCatalog(false);
        return;
      }
      if (e.code === 'Escape' && showInventoryRef.current) {
        e.preventDefault(); e.stopImmediatePropagation();
        setShowInventory(false);
        setIsCraftingBenchActive(false);
        return;
      }
      if (e.code === 'Escape' && showCraftingRef.current) {
        e.preventDefault(); e.stopImmediatePropagation(); setShowCrafting(false); return;
      }
      if (e.code === 'Escape' && biomeMenuOpenRef.current) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setBiomeMenuOpen(false);
        return;
      }
      if (e.key === 'F3') {
        e.preventDefault();
        setShowDebug((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (miningNoticeTimerRef.current !== null) window.clearTimeout(miningNoticeTimerRef.current);
      if (chapterIntroTimerRef.current !== null) window.clearTimeout(chapterIntroTimerRef.current);
      engine.destroy();
    };
  }, [developerTestMode]);

  const triggerChapterIntroIfFirstVisit = useCallback((worldKey: string, isNewSpawn = false) => {
    let alreadySeen = false;
    try {
      const parsed = JSON.parse(window.localStorage.getItem('pixel_frontier_chapter1_seen_v1') || '[]') as unknown;
      const list = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
      alreadySeen = list.includes(worldKey);
      if (!alreadySeen) {
        const nextList = [worldKey, ...list.filter((entry) => entry !== worldKey)].slice(0, 100);
        window.localStorage.setItem('pixel_frontier_chapter1_seen_v1', JSON.stringify(nextList));
      }
    } catch {
      alreadySeen = false;
    }

    if (!alreadySeen || isNewSpawn) {
      triggerChapterBanner('CHAPTER 1', 'SURVIVE');
    }
  }, [triggerChapterBanner]);

  const setBiomeMenuOpen = (open: boolean) => {
    biomeMenuOpenRef.current = open;
    engineRef.current?.setBiomeMenuOpen(open);
    setShowBiomeMenu(open);
  };

  const handleSetHome = () => {
    const engine = engineRef.current;
    const name = newHomeName.trim().slice(0, 24);
    if (!engine || !name) {
      setHomeCooldownNotice('Enter a name for this home first.');
      return;
    }
    const homeSeed = engine.chunkManager.seed;
    const existingIndex = namedHomes.findIndex((savedHome) => savedHome.name.toLowerCase() === name.toLowerCase());
    if (existingIndex < 0 && namedHomes.length >= 3) {
      setHomeCooldownNotice('You can save up to 3 named homes in this world.');
      return;
    }
    const home: NamedHome = {
      id: existingIndex < 0 ? createNamedHomeId() : namedHomes[existingIndex].id,
      name, x: engine.player.x, y: engine.player.y, seed: homeSeed,
    };
    const nextHomes = existingIndex < 0 ? [...namedHomes, home] : namedHomes.map((savedHome, index) => index === existingIndex ? home : savedHome);
    setNamedHomes(nextHomes);
    if (!saveNamedHomes(home.seed, nextHomes)) {
      setHomeCooldownNotice('Home saved for this session, but browser storage is unavailable.');
    }
    setNewHomeName('');
    setHomeCooldownNotice(`${name} saved.`);
  };

  const handleDeleteHome = () => {
    if (deletingHomeRef.current || !homePendingDeletion) return;
    deletingHomeRef.current = true;
    const remainingHomes = deleteNamedHome(homePendingDeletion.seed, homePendingDeletion.id);
    if (remainingHomes) {
      setNamedHomes(remainingHomes);
      setHomePendingDeletion(null);
      setHomeCooldownNotice('Home deleted successfully!');
    } else {
      setHomeCooldownNotice('Could not delete home. Please try again.');
      deletingHomeRef.current = false;
    }
  };

  const handleBiomeTeleport = (biome: BiomeType) => {
    const destination = BIOME_LIST.find((entry) => entry.id === biome)?.name;
    const engine = engineRef.current;
    if (!destination || !engine || biomeTeleportTargetRef.current) return;

    biomeTeleportTargetRef.current = destination;
    biomeTeleportRequestStartedRef.current = false;
    setBiomeTeleportFeedback(getBiomeTeleportFeedback(`Preparing ${destination}…`, destination));
    setBiomeMenuOpen(false);
    window.requestAnimationFrame(() => {
      if (biomeTeleportTargetRef.current !== destination) return;
      biomeTeleportRequestStartedRef.current = true;
      if (!engine.teleportToBiome(biome)) {
        biomeTeleportTargetRef.current = null;
        biomeTeleportRequestStartedRef.current = false;
        setBiomeTeleportFeedback({ kind: 'error', message: 'Teleport failed. Please try again.' });
      }
    });
  };

  const handleTeleportToHome = (home: NamedHome) => {
    if (home.seed !== engineRef.current?.chunkManager.seed) {
      setTeleportNotice('That home belongs to a different world.');
      return;
    }
    engineRef.current?.teleportToPosition(home.x, home.y, home.name);
    setBiomeMenuOpen(false);
  };

  const handleRequestPlayerTeleport = () => {
    const socket = lobbySocketRef.current;
    const target = lobbyPlayers.find((player) => player.playerId === selectedTeleportPlayer);
    if (!socket || socket.readyState !== WebSocket.OPEN || !target) return;
    const targetName = target.displayName || target.playerId;
    const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const request: TeleportRequest = {
      requestId,
      playerId: target.playerId,
      playerName: targetName,
      expiresAt: Date.now() + 15_000,
    };
    setOutgoingTeleportRequest(request);
    showTeleportNotice(`Teleport request sent to ${targetName}...`, 15000);
    socket.send(JSON.stringify({ type: 'teleport_request', requestId, targetPlayerId: target.playerId }));
  };

  const handleRespondToTeleport = (accept: boolean) => {
    const request = incomingTeleportRequest;
    if (!request) return;
    lobbySocketRef.current?.send(JSON.stringify({ type: 'teleport_request_response', requestId: request.requestId, accept }));
    incomingTeleportRequestRef.current = null;
    setIncomingTeleportRequest(null);
    showTeleportNotice(accept ? 'Teleport request accepted.' : 'Teleport request cancelled.');
  };

  const handleStartGame = () => {
    if (engineRef.current) {
      biomeTeleportTargetRef.current = null;
      biomeTeleportRequestStartedRef.current = false;
      setBiomeTeleportFeedback(null);
      const name = worldName.trim();
      if (!name) {
        setMenuError('Enter a world or lobby name to continue.');
        return;
      }
      if (developerTestMode && name !== 'PIXEL_FRONTIER_RUNTIME_TEST') {
        setMenuError('Developer test mode only runs in PIXEL_FRONTIER_RUNTIME_TEST.');
        return;
      }
      if (developerTestMode) {
        engineRef.current.setVirtualInput('left', false);
        engineRef.current.setVirtualInput('right', false);
        engineRef.current.setVirtualInput('sprint', false);
        setTestLeftHeld(false);
        setTestWalkHeld(false);
        setTestSprintHeld(false);
      }
      const seed = worldInputToSeed(name);
      localChestSeedRef.current = seed;
      try {
        const saved = JSON.parse(window.localStorage.getItem(`pixel-frontier-chests:${seed}`) || '[]') as unknown;
        const chests = new Map<string, WorldChest>();
        if (Array.isArray(saved)) for (const entry of saved) {
          if (!entry || typeof entry !== 'object') continue;
          const chest = entry as Record<string, unknown>;
          if (!Number.isSafeInteger(chest.x) || !Number.isSafeInteger(chest.y)) continue;
          const containerType = chest.containerType === 'Furnace' ? 'Furnace' : 'Chest';
          const id = containerType === 'Furnace' ? worldObjectId(seed, chest.x as number, chest.y as number, 'furnace') : makeWorldChestId(`single-${seed}`, seed, chest.x as number, chest.y as number);
          chests.set(id, { id, x: chest.x as number, y: chest.y as number, containerType, slots: sanitizeChestSlots(chest.slots), revision: Number.isSafeInteger(chest.revision) ? Number(chest.revision) : 0 });
        }
        localChestsRef.current = chests;
        const savedObjects = JSON.parse(window.localStorage.getItem(`pixel-frontier-objects:${seed}`) || '[]') as unknown;
        worldObjectsRef.current = new Map(Array.isArray(savedObjects) ? savedObjects.map(sanitizeWorldObject).filter((object): object is InteractiveObjectState => !!object).map((object) => [object.id, object]) : []);
      } catch { localChestsRef.current = new Map(); }
      const hadExistingWorldMods = Boolean(
        window.localStorage.getItem(`pixel_frontier_mods_${seed}`) ||
        window.localStorage.getItem(`pixel_frontier_player_state_${seed}`)
      );
      engineRef.current.initWorld(seed);
      engineRef.current.setCreativeMode(gameMode === 'creative');
      if (gameMode === 'creative') {
        const creativeKit: ItemType[] = [
          'celestial_pickaxe',
          'diamond_axe',
          'celestial_sword',
          'wood',
          'stone',
          'planks',
          'torch',
          'chest',
        ];
        creativeKit.forEach((item, idx) => {
          if (!engineRef.current?.inventory.getSlot(idx)?.type) {
            engineRef.current?.inventory.setItem(idx, item, 99);
          }
        });
      }
      setStats((prev) => ({
        ...prev,
        hotbar: engineRef.current ? engineRef.current.inventory.getSlots() : prev.hotbar,
        activeSlot: engineRef.current ? engineRef.current.inventory.activeSlot : prev.activeSlot,
      }));
      setInventoryVersion((v) => v + 1);
      engineRef.current.start();
      setIsMuted(sound.getMuted());
      setMenuError('');
      if (!developerTestMode) {
        triggerChapterIntroIfFirstVisit(`sp:${seed}`, !hadExistingWorldMods);
        if (auth.currentUser?.emailVerified) {
          void loadWorldFromCloud(`sp_${seed}`)
            .then((cloudSave) => {
              const eng = engineRef.current;
              if (!cloudSave || !eng || eng.chunkManager.seed !== seed || lobbyInfoRef.current) return;
              if (!hadExistingWorldMods) {
                eng.chunkManager.modifications.mergeEntries(cloudSave.modifiedBlocks);
                eng.chunkManager.modifications.saveToLocalStorage(seed, true);
                eng.inventory.loadFromJSON(cloudSave.inventory);
                eng.player.x = cloudSave.playerX;
                eng.player.y = cloudSave.playerY;
                eng.player.health = cloudSave.health;
                eng.player.food = cloudSave.food;
                eng.player.stamina = cloudSave.stamina;
                eng.setTime(cloudSave.time, cloudSave.day);
                eng.saveLocalState();
                setStats((prev) => ({
                  ...prev,
                  hotbar: eng.inventory.getSlots(),
                  activeSlot: eng.inventory.activeSlot,
                }));
                setInventoryVersion((v) => v + 1);
              }
            })
            .catch(() => {});
        }
      }
    }
  };

  const openLobbySocket = useCallback((lobbyName?: string, requestType: 'join_lobby' | 'quick_join_lobby' = 'join_lobby') => {
    const nextLobbyName = lobbyName ? normalizeLobbyCode(lobbyName) : '';
    if (requestType === 'join_lobby' && (!nextLobbyName || !isValidLobbyCode(nextLobbyName))) {
      setLobbyError(`Enter a numeric lobby code with up to ${LOBBY_CODE_MAX_LENGTH} digits.`);
      return;
    }
    if (lobbySocketRef.current) lobbySocketRef.current.close();
    setLobbyError('');
    setLobbyInfo(null);
    setLobbyStatus('connecting');
    const configuredUrl = (import.meta.env.VITE_MULTIPLAYER_SERVER_URL as string | undefined)?.trim();
    const defaultProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const defaultHost = window.location.host;
    const url = configuredUrl || `${defaultProtocol}//${defaultHost}/ws`;
    const authToken = getStoredAuthToken();
    const safeUrl = authToken ? `${url}${url.includes('?') ? '&' : '?'}authToken=${encodeURIComponent(authToken)}` : url;
    let socket: WebSocket;
    let connectionErrorMessage: string | null = null;
    try { socket = new WebSocket(safeUrl); }
    catch { setLobbyStatus('disconnected'); setLobbyError('Could not connect to the multiplayer server.'); return; }
    lobbySocketRef.current = socket;

    const persistentPlayerId = typeof window !== 'undefined'
      ? (window.localStorage.getItem('pixel_frontier_multiplayer_player_id') ||
         window.sessionStorage.getItem('pixel_frontier_multiplayer_player_id') ||
         undefined)
      : undefined;

    let clientBackup: unknown = undefined;
    if (typeof window !== 'undefined' && nextLobbyName) {
      try {
        const rawBackup = window.localStorage.getItem(`pixel_frontier_mp_backup_${nextLobbyName}`);
        if (rawBackup) clientBackup = JSON.parse(rawBackup);
      } catch {
        clientBackup = undefined;
      }
    }

    const payload = requestType === 'quick_join_lobby'
      ? { type: 'quick_join_lobby', playerId: persistentPlayerId, authToken, displayName: accountUser?.displayName ?? guestName, clientBackup }
      : { type: 'join_lobby', lobbyName: nextLobbyName, playerId: persistentPlayerId, authToken, displayName: accountUser?.displayName ?? guestName, clientBackup };

    socket.addEventListener('open', () => socket.send(JSON.stringify(payload)));
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as Record<string, unknown>;
        if (message.type === 'lobby_joined' && message.success === true) {
          const joinedLobbyCode = normalizeLobbyCode(String(message.lobbyName || ''));
          if (joinedLobbyCode) {
            setMultiplayerLobbyCode(joinedLobbyCode);
            const existing = getStoredRecentLobbies();
            const nextHistory = [joinedLobbyCode, ...existing.filter((entry) => entry !== joinedLobbyCode)].slice(0, 10);
            window.localStorage.setItem('pixel_frontier_recent_lobbies', JSON.stringify(nextHistory));
            setRecentLobbies(nextHistory);
          }
          const joinedInfo = { lobbyId: String(message.lobbyId), lobbyName: String(message.lobbyName), worldSeed: Number(message.worldSeed), playerId: String(message.playerId), playerCount: Number(message.playerCount) };
          setLobbyInfo(joinedInfo);
          lobbyInfoRef.current = joinedInfo;
          setLobbyPlayers([]);
          setIncomingTeleportRequest(null);
          setOutgoingTeleportRequest(null);
          setNamedHomes(loadNamedHomes(joinedInfo.worldSeed));
          setOpenChest(null);
          setChestPending(false);
          lobbyPlayerIdRef.current = joinedInfo.playerId;
          debugCombat('player.joined', { playerId: joinedInfo.playerId, lifeId: message.lifeId ?? null, health: message.health ?? null, alive: message.isAlive ?? null, spawn: { x: message.spawnX ?? null, y: message.spawnY ?? null }, lobbyId: message.lobbyId });

          if (Array.isArray(message.chatHistory)) {
            setChatMessages(message.chatHistory as ChatMessageItem[]);
          } else {
            setChatMessages([]);
          }
          if (typeof window !== 'undefined' && joinedInfo.playerId) {
            window.localStorage.setItem('pixel_frontier_multiplayer_player_id', joinedInfo.playerId);
            window.sessionStorage.setItem('pixel_frontier_multiplayer_player_id', joinedInfo.playerId);
          }
          const engine = engineRef.current;
          if (engine && Number.isSafeInteger(joinedInfo.worldSeed)) {
            engine.remotePlayers.clear();
            if (Array.isArray(message.players)) {
              for (const entry of message.players) {
                const remote = parseRemotePlayer(entry);
                if (remote && remote.playerId !== joinedInfo.playerId) engine.remotePlayers.set(remote.playerId, remote);
              }
            }
            setLobbyPlayers(Array.from(engine.remotePlayers.values()));
            const spawnX = typeof message.spawnX === 'number' ? message.spawnX : undefined;
            const spawnY = typeof message.spawnY === 'number' ? message.spawnY : undefined;
            engine.initWorld(joinedInfo.worldSeed, true, spawnX, spawnY);
            engine.combatPlayerId = joinedInfo.playerId;
            if (typeof message.lifeId === 'number' && Number.isSafeInteger(message.lifeId)) {
              engine.combatLifeId = message.lifeId;
            }
            if (Array.isArray(message.blockModifications)) {
              const modifications = message.blockModifications.map(parseBlockModification).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
              engine.chunkManager.applyBlockUpdates(modifications);
            }
            worldObjectsRef.current = new Map(Array.isArray(message.worldObjects)
              ? message.worldObjects.map(sanitizeWorldObject).filter((object): object is InteractiveObjectState => !!object).map((object) => [object.id, object])
              : []);
            if (typeof message.spawnX === 'number' && typeof message.spawnY === 'number') {
              engine.player.x = message.spawnX;
              engine.player.y = message.spawnY;
              engine.spawnPoint = { x: message.spawnX, y: message.spawnY };
            } else {
              const spawnBlockX = 0;
              const surfaceY = engine.chunkManager.terrainGen.getSurfaceHeight(spawnBlockX);
              engine.player.x = spawnBlockX * TILE_SIZE;
              engine.player.y = (surfaceY - 2) * TILE_SIZE;
              engine.spawnPoint = { x: engine.player.x, y: engine.player.y };
            }
            if (typeof message.health === 'number') engine.player.health = message.health;
            if (typeof message.food === 'number') engine.player.food = message.food;
            if (typeof message.stamina === 'number') engine.player.stamina = message.stamina;

            const isDead = engine.player.health <= 0 || message.isAlive === false;
            if (isDead) {
              debugCombat('player-death.join-state', { playerId: joinedInfo.playerId, lifeId: engine.combatLifeId, health: 0, alive: false, x: engine.player.x, y: engine.player.y, reason: 'server join state is dead' });
              engine.player.health = 0;
              engine.wildlifeManager.clearCombatState(lobbyPlayerIdRef.current);
              engine.state = 'DEAD';
              engine.onStateChange?.('DEAD');
            }

            const playerBlockX = Math.floor(engine.player.x / TILE_SIZE);
            const playerBlockY = Math.floor(engine.player.y / TILE_SIZE);
            engine.chunkManager.updatePlayerPosition(playerBlockX, playerBlockY);
            engine.camera.targetX = engine.player.x + engine.player.width / 2 - engine.camera.width / 2;
            engine.camera.targetY = engine.player.y + engine.player.height / 2 - engine.camera.height / 2;
            engine.camera.x = engine.camera.targetX;
            engine.camera.y = engine.camera.targetY;
            if (message.inventory) {
              engine.inventory.loadFromJSON(message.inventory as any);
              setStats((prev) => ({
                ...prev,
                hotbar: engine.inventory.getSlots(),
                activeSlot: engine.inventory.activeSlot,
              }));
              setInventoryVersion((v) => v + 1);
            }
            if (Array.isArray(message.drops)) {
              for (const drop of message.drops) {
                const pickupDelay = drop.ownerPlayerId === lobbyPlayerIdRef.current && typeof drop.ownerPickupUntil === 'number'
                  ? Math.max(0, (drop.ownerPickupUntil - Date.now()) / 1000)
                  : 0.1;
                engine.itemDropManager.addSynchronizedDrop(drop.id, drop.type, drop.x, drop.y, drop.count, pickupDelay);
              }
            }
            if (typeof message.worldTime === 'number' && typeof message.dayCount === 'number') {
              engine.setTime(message.worldTime, message.dayCount);
            }
            if (Array.isArray(message.wildlife)) {
              engine.wildlifeManager.syncServerAnimals(message.wildlife as any);
            }
            lastSentPositionRef.current = null;
            const isFirstServerVisit = message.isNewPlayer === true;
            engine.start(isDead ? 'DEAD' : 'PLAYING');
            if (!isDead) {
              triggerChapterIntroIfFirstVisit(`mp:${joinedInfo.lobbyName}:${joinedInfo.worldSeed}`, isFirstServerVisit);
            }
          }
          setLobbyStatus('connected');
        } else if (message.type === 'world_object_updated' && message.object) {
          const object = sanitizeWorldObject(message.object);
          if (object) {
            const previous = worldObjectsRef.current.get(object.id);
            worldObjectsRef.current.set(object.id, object);
            if (previous && object.interactionRevision > previous.interactionRevision) {
              const label = object.type === 'pressure_plate' ? `Pressure plate ${object.active ? 'pressed' : 'released'}`
                : object.type === 'door' || object.type === 'trapdoor' || object.type === 'gate' ? `${object.type} ${object.open ? 'opened' : 'closed'}`
                  : object.type === 'campfire' ? `Campfire ${object.active ? 'lit' : 'extinguished'}`
                    : object.type === 'lever' ? `Lever ${object.active ? 'on' : 'off'}`
                      : object.type === 'sign' ? object.text !== previous.text ? 'Sign updated' : 'Sign inspected' : `${object.type} interacted`;
              engineRef.current?.showWorldObjectFeedback(object.x, object.y);
              engineRef.current?.onMiningNotice?.(label);
            }
          }
        } else if (message.type === 'world_object_removed' && typeof message.objectId === 'string') {
          const removedObject = worldObjectsRef.current.get(message.objectId);
          worldObjectsRef.current.delete(message.objectId);
          if (removedObject?.type === 'crop') {
            engineRef.current?.showWorldObjectFeedback(removedObject.x, removedObject.y, '#86efac');
            engineRef.current?.onMiningNotice?.(`Harvested ${removedObject.cropType ?? 'crop'}. Press E to eat.`);
          }
        } else if (message.type === 'world_object_inspected' && message.object) {
          const object = sanitizeWorldObject(message.object);
          if (object?.type === 'sign') setActiveSign(object);
        } else if (message.type === 'world_object_rejected') {
          setChestNotice(typeof message.reason === 'string' ? message.reason : 'Object interaction rejected.');
        } else if (message.type === 'chest_opened' && typeof message.chestId === 'string' &&
                   Number.isSafeInteger(message.x) && Number.isSafeInteger(message.y) && Array.isArray(message.slots)) {
          setOpenChest({ id: message.chestId, x: Number(message.x), y: Number(message.y), containerType: message.containerType === 'Furnace' ? 'Furnace' : 'Chest', slots: sanitizeChestSlots(message.slots), revision: Number.isSafeInteger(message.revision) ? Number(message.revision) : 0 });
          setChestPending(false);
          setChestNotice('');
          setShowInventory(false);
          setIsCraftingBenchActive(false);
        } else if (message.type === 'chest_updated' && typeof message.chestId === 'string' && Array.isArray(message.slots)) {
          setOpenChest((current) => {
            if (!current || current.id !== message.chestId) return current;
            return { ...current, slots: sanitizeChestSlots(message.slots), revision: Number.isSafeInteger(message.revision) ? Number(message.revision) : current.revision };
          });
          setChestPending(false);
        } else if (message.type === 'chest_rejected') {
          setChestPending(false);
          setChestNotice(typeof message.reason === 'string' ? message.reason : 'Chest transfer rejected.');
          if (typeof message.chestId === 'string' && Array.isArray(message.slots)) {
            setOpenChest((current) => {
              if (!current || current.id !== message.chestId) return current;
              return { ...current, slots: sanitizeChestSlots(message.slots), revision: Number.isSafeInteger(message.revision) ? Number(message.revision) : current.revision };
            });
          }
        } else if (message.type === 'chest_closed' || message.type === 'chest_removed') {
          setOpenChest(null);
          setChestPending(false);
        } else if (message.type === 'time_sync') {
          if (typeof message.time === 'number' && typeof message.day === 'number' && engineRef.current) {
            engineRef.current.setTime(message.time, message.day);
          }
        } else if (message.type === 'wildlife_sync') {
          if (Array.isArray(message.animals) && engineRef.current) {
            for (const animal of message.animals as Array<Record<string, unknown>>) {
              const localAnimal = engineRef.current.wildlifeManager.animals.find((entry) => entry.id === animal.id);
              if (localAnimal?.targetPlayerId !== animal.targetPlayerId || localAnimal?.state !== animal.state) {
                debugCombat('animal.sync-state', { playerId: typeof animal.targetPlayerId === 'string' ? animal.targetPlayerId : engineRef.current.combatPlayerId, lifeId: engineRef.current.combatLifeId, animalId: animal.id, health: engineRef.current.player.health, alive: engineRef.current.player.health > 0, targetPlayerId: animal.targetPlayerId ?? null, animalState: animal.state, previousTargetPlayerId: localAnimal?.targetPlayerId ?? null, previousAnimalState: localAnimal?.state ?? null });
              }
            }
            engineRef.current.wildlifeManager.syncServerAnimals(message.animals as any);
          }
        } else if (message.type === 'wildlife_hurt') {
          if (engineRef.current && typeof message.animalId === 'string') {
            engineRef.current.wildlifeManager.applyServerHurt(
              message.animalId,
              Number(message.health),
              Number(message.maxHealth),
              Number(message.damage),
              Number(message.x),
              Number(message.y),
              Boolean(message.hitFromLeft)
            );
            engineRef.current.enemyManager.addDamageNumber(
              Number(message.x),
              Number(message.y) - 4,
              `${message.damage}`,
              '#fde047'
            );
            sound.playEnemyHit();
          }
        } else if (message.type === 'wildlife_death') {
          if (engineRef.current && typeof message.animalId === 'string') {
            engineRef.current.wildlifeManager.applyServerDeath(message.animalId);
            sound.playEnemyHit();
          }
        } else if (message.type === 'lobby_update') {
          setLobbyInfo((current) => current ? { ...current, playerCount: Number(message.playerCount) } : current);
        } else if (message.type === 'teleport_request_sent') {
          if (typeof message.requestId === 'string') {
            const targetName = typeof message.targetName === 'string' ? message.targetName : 'Player';
            setOutgoingTeleportRequest((current) => {
              if (!current || current.requestId !== message.requestId) return current;
              return { ...current, expiresAt: Date.now() + 15_000, playerName: targetName };
            });
            showTeleportNotice(`Teleport request sent to ${targetName}...`, 15000);
          }
        } else if (message.type === 'teleport_request_failed') {
          setOutgoingTeleportRequest(null);
          showTeleportNotice(typeof message.reason === 'string' ? message.reason : 'Teleport request could not be sent.');
        } else if (message.type === 'teleport_request_received') {
          if (typeof message.requestId === 'string' && typeof message.requesterPlayerId === 'string') {
            setIncomingTeleportRequest({
              requestId: message.requestId,
              playerId: message.requesterPlayerId,
              playerName: typeof message.requesterName === 'string' ? message.requesterName : message.requesterPlayerId,
              expiresAt: Date.now() + 15_000,
            });
          }
        } else if (message.type === 'teleport_request_expired') {
          if (typeof message.requestId === 'string') {
            setIncomingTeleportRequest((current) => current?.requestId === message.requestId ? null : current);
            setOutgoingTeleportRequest((current) => {
              if (current?.requestId === message.requestId) {
                showTeleportNotice('Teleport request expired.');
                return null;
              }
              return current;
            });
          }
        } else if (message.type === 'teleport_request_result') {
          if (typeof message.requestId === 'string') {
            setOutgoingTeleportRequest((current) => current?.requestId === message.requestId ? null : current);
            if (message.accepted === true && typeof message.x === 'number' && typeof message.y === 'number') {
              const targetName = typeof message.targetName === 'string' ? message.targetName : 'player';
              lastSentPositionRef.current = null;
              const started = engineRef.current?.teleportToPosition(message.x, message.y, targetName, true);
              showTeleportNotice(started ? `Teleporting to ${targetName}...` : `Could not teleport to ${targetName}.`);
            } else {
              showTeleportNotice(typeof message.reason === 'string' ? message.reason : 'Teleport request cancelled.');
            }
          }
        } else if (message.type === 'inventory_sync') {
          if (message.inventory && engineRef.current) {
            engineRef.current.inventory.loadFromJSON(message.inventory as any);
            setStats((prev) => ({
              ...prev,
              hotbar: engineRef.current ? engineRef.current.inventory.getSlots() : prev.hotbar,
              activeSlot: engineRef.current ? engineRef.current.inventory.activeSlot : prev.activeSlot,
            }));
            setInventoryVersion((v) => v + 1);
          }
        } else if (message.type === 'drop_spawned') {
          if (message.drop && engineRef.current) {
            const drop = message.drop as any;
            const pickupDelay = drop.ownerPlayerId === lobbyPlayerIdRef.current && typeof drop.ownerPickupUntil === 'number'
              ? Math.max(0, (drop.ownerPickupUntil - Date.now()) / 1000)
              : 0.1;
            engineRef.current.itemDropManager.addSynchronizedDrop(drop.id, drop.type, drop.x, drop.y, drop.count, pickupDelay);
          }
        } else if (message.type === 'drop_removed') {
          if (typeof message.dropId === 'number' && engineRef.current) {
            engineRef.current.itemDropManager.removeDropById(message.dropId);
          }
        } else if (message.type === 'pickup_rejected') {
          if (typeof message.dropId === 'number' && engineRef.current) {
            engineRef.current.itemDropManager.pendingPickups.delete(message.dropId);
          }
        } else if (message.type === 'drop_rejected') {
          setMiningNotice(typeof message.reason === 'string' ? message.reason : 'Drop rejected.');
        } else if (message.type === 'drop_success') {
          sound.playCraft();
        } else if (message.type === 'eat_success') {
          if (engineRef.current) {
            sound.playEat();
            if (typeof message.food === 'number') {
              engineRef.current.player.food = Math.min(engineRef.current.player.maxFood, engineRef.current.player.food + message.food);
            }
            if (typeof message.health === 'number') {
              engineRef.current.player.health = Math.max(0, Math.min(Number(message.maxHealth || 100), message.health));
            }
            if (typeof message.lifeId === 'number' && Number.isSafeInteger(message.lifeId)) {
              engineRef.current.combatLifeId = message.lifeId;
            }
          }
        } else if (message.type === 'craft_success') {
          sound.playCraft();
        } else if (message.type === 'craft_rejected') {
          setMiningNotice(typeof message.reason === 'string' ? message.reason : 'Crafting failed.');
        } else if (message.type === 'eat_rejected') {
          setMiningNotice(typeof message.reason === 'string' ? message.reason : 'Cannot eat this.');
        } else if (message.type === 'farm_rejected') {
          setMiningNotice(typeof message.reason === 'string' ? message.reason : 'Tilling failed.');
        } else if (message.type === 'block_rejected') {
          setMiningNotice(typeof message.reason === 'string' ? message.reason : 'Block action rejected.');
          if (message.inventory && engineRef.current) {
            engineRef.current.inventory.loadFromJSON(message.inventory as any);
            setStats((prev) => ({ ...prev, hotbar: engineRef.current?.inventory.getSlots() ?? prev.hotbar }));
            setInventoryVersion((value) => value + 1);
          }
          if (typeof message.x === 'number' && typeof message.y === 'number' && engineRef.current) {
            const currentTile = typeof message.currentTile === 'number' && Number.isInteger(message.currentTile)
              ? message.currentTile as TileType
              : TileType.AIR;
            const engine = engineRef.current;
            engine.chunkManager.setBlock(message.x, message.y, currentTile);
            // Mining is optimistic in the renderer; persist the authoritative
            // rollback too, so a rejected action cannot survive a reload.
            engine.chunkManager.modifications.saveToLocalStorage(engine.chunkManager.seed);
            engine.saveLocalState();
          }
        } else if (message.type === 'block_changed') {
          const modification = parseBlockModification(message);
          if (modification) engineRef.current?.chunkManager.applyBlockUpdates([modification]);
        } else if (message.type === 'player_joined' || message.type === 'player_respawned') {
          const remote = parseRemotePlayer(message);
          if (remote) debugCombat(message.type === 'player_respawned' ? 'respawn.received' : 'player-joined.received', { playerId: remote.playerId, lifeId: message.lifeId ?? null, health: remote.health, alive: remote.isAlive, x: remote.x, y: remote.y });
          if (remote) {
            if (remote.playerId === lobbyPlayerIdRef.current) {
              if (engineRef.current) {
                if (typeof message.lifeId === 'number' && Number.isSafeInteger(message.lifeId)) {
                  engineRef.current.combatLifeId = message.lifeId;
                }
                engineRef.current.player.x = remote.x;
                engineRef.current.player.y = remote.y;
                engineRef.current.player.health = remote.health;
                engineRef.current.player.food = 100;
                engineRef.current.player.stamina = 100;
                // A server-driven respawn can resume the engine without going
                // through Engine.respawn(). Clear combat/input state here too,
                // so a cooldown or held swing from the death frame can't block
                // the first attack after respawning.
                engineRef.current.player.isAttacking = false;
                engineRef.current.player.attackTimer = 0;
                engineRef.current.player.attackCooldown = 0;
                engineRef.current.blockInteraction.isLeftDown = false;
                engineRef.current.player.facingRight = remote.facingRight;
                const playerBlockX = Math.floor(engineRef.current.player.x / 16);
                const playerBlockY = Math.floor(engineRef.current.player.y / 16);
                engineRef.current.chunkManager.updatePlayerPosition(playerBlockX, playerBlockY);
                engineRef.current.camera.targetX = engineRef.current.player.x + engineRef.current.player.width / 2 - engineRef.current.camera.width / 2;
                engineRef.current.camera.targetY = engineRef.current.player.y + engineRef.current.player.height / 2 - engineRef.current.camera.height / 2;
                engineRef.current.camera.x = engineRef.current.camera.targetX;
                engineRef.current.camera.y = engineRef.current.camera.targetY;
                if (engineRef.current.state === 'DEAD') {
                  engineRef.current.state = 'PLAYING';
                  engineRef.current.onStateChange?.('PLAYING');
                }
              }
            } else {
              engineRef.current?.remotePlayers.set(remote.playerId, remote);
              refreshLobbyPlayers();
            }
          }
        } else if (message.type === 'player_attack_visual') {
          if (typeof message.playerId === 'string' && message.playerId !== lobbyPlayerIdRef.current) {
            const remote = engineRef.current?.remotePlayers.get(message.playerId);
            if (remote) {
              remote.isAttacking = true;
              remote.attackTimer = 0.22;
              if (typeof message.facing === 'boolean') {
                remote.facingRight = message.facing;
              }
              sound.playSwordSwing();
            }
          }
        } else if (message.type === 'player_moved') {
          const remote = parseRemotePlayer(message);
          if (remote && remote.playerId !== lobbyPlayerIdRef.current) {
            const existing = engineRef.current?.remotePlayers.get(remote.playerId);
            if (existing) {
              existing.x = remote.x;
              existing.y = remote.y;
              existing.facingRight = remote.facingRight;
            } else {
              engineRef.current?.remotePlayers.set(remote.playerId, remote);
              refreshLobbyPlayers();
            }
          }
        } else if (message.type === 'player_health_changed') {
          if (typeof message.playerId === 'string' && typeof message.health === 'number') {
            const newHealth = Math.max(0, Math.min(Number(message.maxHealth || 100), message.health));
            const isAlive = typeof message.isAlive === 'boolean' ? message.isAlive : newHealth > 0;
            if (message.playerId === lobbyPlayerIdRef.current) {
              if (engineRef.current) {
                // Old life notifications may arrive after a local respawn was
                // initiated. Never let them overwrite the new life state.
                if (typeof message.lifeId === 'number' && Number.isSafeInteger(message.lifeId)) {
                  if (message.lifeId < engineRef.current.combatLifeId) {
                    debugCombat('player-health.receive-rejected', { playerId: message.playerId, lifeId: message.lifeId, currentLifeId: engineRef.current.combatLifeId, health: newHealth, alive: isAlive, reason: 'older-life-notification' });
                    return;
                  }
                  engineRef.current.combatLifeId = message.lifeId;
                }
                debugCombat('player-health.received', { playerId: message.playerId, lifeId: message.lifeId ?? engineRef.current.combatLifeId, currentLifeId: engineRef.current.combatLifeId, health: newHealth, alive: isAlive, currentHealth: engineRef.current.player.health, currentAlive: engineRef.current.player.health > 0, sourceX: message.sourceX ?? null, damage: message.damage ?? null });
                const oldHealth = engineRef.current.player.health;
                engineRef.current.player.health = newHealth;
                if (newHealth < oldHealth) {
                  engineRef.current.player.invulnerableTimer = 0.7;
                  engineRef.current.player.flashTimer = 0.22;
                  sound.playPlayerHurt();
                  if (typeof message.sourceX === 'number') {
                    const hitFromLeft = (engineRef.current.player.x + engineRef.current.player.width / 2) > message.sourceX;
                    engineRef.current.player.vx = hitFromLeft ? 210 : -210;
                    engineRef.current.player.vy = -180;
                    engineRef.current.player.isGrounded = false;
                  }
                  if (typeof message.damage === 'number') {
                    engineRef.current.enemyManager.addDamageNumber(
                      engineRef.current.player.x + 7,
                      engineRef.current.player.y - 4,
                      `${message.damage}`,
                      '#ef4444'
                    );
                  }
                }
                if (!isAlive || newHealth <= 0) {
                  debugCombat('player-death.received', { playerId: message.playerId, lifeId: message.lifeId ?? engineRef.current.combatLifeId, health: 0, alive: false, reason: 'health notification', state: engineRef.current.state });
                  engineRef.current.player.health = 0;
                  engineRef.current.wildlifeManager.clearCombatState(lobbyPlayerIdRef.current);
                  if (engineRef.current.state !== 'DEAD') {
                    sound.playPlayerDeath();
                    engineRef.current.state = 'DEAD';
                    engineRef.current.onStateChange?.('DEAD');
                  }
                }
              }
            } else {
              const remote = engineRef.current?.remotePlayers.get(message.playerId);
              if (remote) {
                const oldHealth = remote.health;
                remote.health = newHealth;
                remote.isAlive = isAlive;
                if (newHealth < oldHealth) {
                  sound.playEnemyHit();
                  if (typeof message.damage === 'number' && engineRef.current?.enemyManager) {
                    engineRef.current.enemyManager.addDamageNumber(
                      remote.x + 7,
                      remote.y - 4,
                      `${message.damage}`,
                      '#f87171'
                    );
                  }
                }
              }
            }
          }
        } else if (message.type === 'chat_message') {
          const chatMsg = message as unknown as ChatMessageItem;
          if (chatMsg && typeof chatMsg.text === 'string') {
            setChatMessages((prev) => [...prev.slice(-49), chatMsg]);
          }
        } else if (message.type === 'chat_history') {
          if (Array.isArray(message.messages)) {
            setChatMessages(message.messages as ChatMessageItem[]);
          }
        } else if (message.type === 'chat_rejected') {
          showChatNotice(typeof message.reason === 'string' ? message.reason : 'Chat message rejected.');
        } else if (message.type === 'player_left' && typeof message.playerId === 'string') {
          engineRef.current?.remotePlayers.delete(message.playerId);
          refreshLobbyPlayers();
        } else if (message.type === 'chapter_unlocked') {
          const chap = typeof message.chapter === 'string' ? message.chapter : 'CHAPTER 2';
          const titl = typeof message.title === 'string' ? message.title : 'BASE';
          triggerChapterBanner(chap, titl);
          if (typeof message.message === 'string') {
            setMiningNotice(message.message);
          }
        } else if (message.type === 'friends_list') {
          if (Array.isArray(message.friends)) setFriendsList(message.friends as FriendItem[]);
          if (Array.isArray(message.incomingRequests)) setIncomingFriendRequests(message.incomingRequests as FriendRequestItem[]);
          if (Array.isArray(message.outgoingRequests)) setOutgoingFriendRequests(message.outgoingRequests as FriendRequestItem[]);
        } else if (message.type === 'friends_updated') {
          fetchFriends();
        } else if (message.type === 'friend_request_received') {
          fetchFriends();
          const req = message.request as FriendRequestItem;
          showFriendsNotice(`New friend request from ${req?.fromPlayerName || 'a player'}!`);
        } else if (message.type === 'friend_request_result') {
          showFriendsNotice(String(message.message || 'Friend request sent!'));
          fetchFriends();
        } else if (message.type === 'friend_respond_result') {
          showFriendsNotice(String(message.message || 'Friend request updated!'));
          fetchFriends();
        } else if (message.type === 'notice') {
          if (typeof message.message === 'string') {
            setMiningNotice(message.message);
          }
        } else if (message.type === 'error') {
          connectionErrorMessage = typeof message.message === 'string' ? message.message : 'The server rejected the lobby request.';
          setLobbyError(connectionErrorMessage);
          setLobbyStatus('disconnected');
          socket.close(1008, 'Lobby request rejected');
        }
      } catch { setLobbyError('Received an invalid response from the multiplayer server.'); setLobbyStatus('disconnected'); }
    });
    socket.addEventListener('error', () => {
      connectionErrorMessage = 'Could not connect to the multiplayer server.';
      setLobbyError(connectionErrorMessage);
      setLobbyStatus('disconnected');
    });
    socket.addEventListener('close', () => {
      if (lobbySocketRef.current === socket) {
        lobbySocketRef.current = null;
        lobbyPlayerIdRef.current = '';
        lobbyInfoRef.current = null;
        setOpenChest(null);
        setChestPending(false);
        setLobbyStatus((current) => current === 'idle' ? 'idle' : 'disconnected');
        setLobbyInfo(null);
        setLobbyPlayers([]);
        setIncomingTeleportRequest(null);
        setOutgoingTeleportRequest(null);
        setLobbyError(connectionErrorMessage || 'Multiplayer server connection lost.');
        setChatMessages([]);
        setChatNotice('');
        engineRef.current?.remotePlayers.clear();
        if (engineRef.current?.state !== 'TITLE') engineRef.current?.goToMainMenu();
      }
    });
  }, [accountUser, guestName]);

  const handleJoinLobby = (manualCode?: string) => {
    const nextLobbyCode = normalizeLobbyCode(manualCode ?? multiplayerLobbyCode);
    if (!nextLobbyCode || !isValidLobbyCode(nextLobbyCode)) {
      setLobbyError(`Enter a numeric lobby code with up to ${LOBBY_CODE_MAX_LENGTH} digits.`);
      return;
    }
    setMultiplayerLobbyCode(nextLobbyCode);
    openLobbySocket(nextLobbyCode, 'join_lobby');
  };

  const handleQuickJoin = () => {
    openLobbySocket(undefined, 'quick_join_lobby');
  };

  const handleInviteFriends = useCallback(async () => {
    const code = lobbyInfoRef.current?.lobbyName || multiplayerLobbyCode;
    if (!code) return;
    try {
      const url = typeof window !== 'undefined' ? new URL(window.location.href) : null;
      if (url) {
        url.searchParams.set('roomId', code);
      }
      const link = url ? url.toString() : `?roomId=${code}`;
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        setInviteFeedback('Invite link copied!');
      } else {
        setInviteFeedback(`Room: ${code}`);
      }
      window.setTimeout(() => setInviteFeedback(''), 3500);
    } catch {
      setInviteFeedback(`Room: ${code}`);
      window.setTimeout(() => setInviteFeedback(''), 3500);
    }
  }, [multiplayerLobbyCode]);

  const handleLeaveLobby = () => {
    setLobbyNotice('');
    setInviteFeedback('');
    const socket = lobbySocketRef.current;
    lobbySocketRef.current = null;
    lobbyInfoRef.current = null;
    setOpenChest(null);
    if (socket) socket.close(1000, 'Leaving lobby');
    lobbyPlayerIdRef.current = '';
    engineRef.current?.remotePlayers.clear();
    if (engineRef.current?.state !== 'TITLE') engineRef.current?.goToMainMenu();
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem('pixel_frontier_multiplayer_player_id');
    }
    setLobbyInfo(null);
    setLobbyStatus('idle');
    setLobbyError('');
    setChatMessages([]);
    setChatNotice('');
    setMenuScreen('main');
  };

  // Handle URL room invite (?roomId=...) on game boot
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const roomId = urlParams.get('roomId');
      if (roomId && isValidLobbyCode(normalizeLobbyCode(roomId))) {
        const cleanCode = normalizeLobbyCode(roomId);
        setMultiplayerLobbyCode(cleanCode);
        setLobbyNotice(`Joining invited lobby ${cleanCode}...`);
        setMenuScreen('multiplayer');
        openLobbySocket(cleanCode, 'join_lobby');
      }
    } catch {
      // safe fallback
    }
  }, [openLobbySocket]);

  const handleSendChatMessage = (text: string) => {
    const socket = lobbySocketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'chat_message', text }));
  };

  useEffect(() => () => { lobbySocketRef.current?.close(1000, 'Page closed'); }, []);

  useEffect(() => {
    if (lobbyStatus !== 'connected' || gameState !== 'PLAYING') return;
    const timer = window.setInterval(() => {
      const socket = lobbySocketRef.current;
      const player = engineRef.current?.player;
      if (!socket || socket.readyState !== WebSocket.OPEN || !player) return;
      const position = {
        x: player.x,
        y: player.y,
        facingRight: player.facingRight,
        food: Math.round(player.food),
        stamina: Math.round(player.stamina),
      };
      const previous = lastSentPositionRef.current;
      if (previous && previous.x === position.x && previous.y === position.y && previous.facingRight === position.facingRight) return;
      socket.send(JSON.stringify({ type: 'player_move', ...position }));
      lastSentPositionRef.current = { x: position.x, y: position.y, facingRight: position.facingRight };
    }, 50);
    return () => window.clearInterval(timer);
  }, [lobbyStatus, gameState]);

  const handleTogglePause = () => {
    if (engineRef.current) {
      engineRef.current.togglePause();
    }
  };

  const handleRestart = () => {
    if (engineRef.current) {
      engineRef.current.restart();
    }
  };

  const handleRespawn = () => {
    if (engineRef.current) {
      engineRef.current.respawn();
    }
  };

  const handleGoToMainMenu = () => {
    if (engineRef.current) {
      engineRef.current.goToMainMenu();
      setMenuScreen('main');
      setMenuError('');
    }
  };

  const handleExitLocalGame = () => {
    // This control is rendered only outside a lobby, so it cannot close or
    // otherwise interfere with a Multiplayer session.
    if (lobbyInfoRef.current) return;
    const engine = engineRef.current;
    if (!engine) return;
    engine.goToMainMenu();
    engine.setCreativeMode(false);
    biomeTeleportTargetRef.current = null;
    biomeTeleportRequestStartedRef.current = false;
    setBiomeTeleportFeedback(null);
    setMenuScreen('main');
    setMenuError('');
    setShowInventory(false);
    setShowCrafting(false);
    setShowCreativeCatalog(false);
    setBiomeMenuOpen(false);
    setOpenChest(null);
  };

  const handleToggleMute = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const handleSelectSlot = (index: number) => {
    if (selectedInvSlot !== null) {
      dragSourceRef.current = { kind: 'inventory', index: selectedInvSlot };
      handleSlotDrop({ kind: 'hotbar', index });
      setSelectedInvSlot(null);
      return;
    }
    if (engineRef.current) {
      engineRef.current.inventory.selectSlot(index);
      setStats((prev) => ({
        ...prev,
        activeSlot: index,
        hotbar: engineRef.current ? engineRef.current.inventory.getSlots() : prev.hotbar,
      }));
    }
  };

  const handleAssignInventoryItem = (index: number) => {
    const inventory = engineRef.current?.inventory;
    if (!inventory) return;
    let targetHotbarIndex = inventory.activeSlot;
    if (targetHotbarIndex <= 0) {
      const emptyIdx = inventory.getSlots().findIndex((s, i) => i > 0 && (!s.type || s.count <= 0));
      targetHotbarIndex = emptyIdx > 0 ? emptyIdx : 1;
    }
    if (lobbyStatus === 'connected' && lobbySocketRef.current?.readyState === WebSocket.OPEN) {
      lobbySocketRef.current.send(JSON.stringify({
        type: 'inventory_move_slot',
        from: { kind: 'inventory', index },
        to: { kind: 'hotbar', index: targetHotbarIndex },
      }));
      if (inventory.assignInventoryItemToHotbar(index, targetHotbarIndex)) {
        setStats((prev) => ({ ...prev, activeSlot: inventory.activeSlot, hotbar: inventory.getSlots() }));
        setInventoryVersion((v) => v + 1);
      }
      return;
    }
    if (!inventory.assignInventoryItemToHotbar(index, targetHotbarIndex)) return;
    setInventoryVersion((v) => v + 1);
    setStats((prev) => ({ ...prev, activeSlot: inventory.activeSlot, hotbar: inventory.getSlots() }));
  };

  const handleSlotDragStart = (slot: InventorySlotRef) => {
    dragSourceRef.current = slot;
    if (engineRef.current) {
      engineRef.current.blockInteraction.isLeftDown = false;
      engineRef.current.blockInteraction.isRightDown = false;
    }
  };

  const handleDropOutsideFromSlot = useCallback((
    source: InventorySlotRef,
    itemType: ItemType,
    dropQuantity: number
  ) => {
    if ((source.kind === 'hotbar' && source.index === 0) || itemType === 'sword') return;
    if (dropQuantity <= 0) return;

    const engine = engineRef.current;
    if (!engine) return;

    const inventory = engine.inventory;
    const owned = inventory.counts[itemType] ?? 0;
    if (owned <= 0) return;

    const actualQuantity = Math.min(owned, dropQuantity);

    if (lobbyStatus === 'connected' && lobbySocketRef.current?.readyState === WebSocket.OPEN) {
      const requestId = `drop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      lobbySocketRef.current.send(JSON.stringify({
        type: 'drop_request',
        requestId,
        slot: source,
        item: itemType,
        count: actualQuantity,
      }));
    } else {
      if (inventory.consumeItem(itemType, actualQuantity)) {
        const frontOffset = engine.player.facingRight ? 18 : -14;
        const dropX = engine.player.x + frontOffset;
        const dropY = engine.player.y + 8;
        engine.itemDropManager.spawnDrop(itemType, dropX, dropY, actualQuantity);
        sound.playCraft();
        setInventoryVersion((v) => v + 1);
        setStats((prev) => ({
          ...prev,
          hotbar: inventory.getSlots(),
          activeSlot: inventory.activeSlot,
        }));
      }
    }
  }, [lobbyStatus]);

  const handleDropOutside = useCallback(() => {
    const source = dragSourceRef.current;
    dragSourceRef.current = null;
    touchDragSourceRef.current = null;
    setDragTarget(null);
    if (!source || source.index < 0) return;
    if (source.kind === 'hotbar' && source.index === 0) return;

    const engine = engineRef.current;
    if (!engine) return;

    const inventory = engine.inventory;
    const slotItem = source.kind === 'hotbar'
      ? inventory.getSlots()[source.index]
      : inventory.getInventorySlots()[source.index];

    if (!slotItem || !slotItem.type || slotItem.count <= 0 || slotItem.type === 'sword') return;

    handleDropOutsideFromSlot(source, slotItem.type, slotItem.count);
  }, [handleDropOutsideFromSlot]);

  const handleSlotDrop = useCallback((target: InventorySlotRef) => {
    const source = dragSourceRef.current;
    dragSourceRef.current = null;
    touchDragSourceRef.current = null;
    setDragTarget(null);
    if (!source) return;
    if (target.index < 0) {
      if (source.kind === 'hotbar' && source.index === 0) return;
      const inventory = engineRef.current?.inventory;
      if (!inventory) return;
      const slotItem = source.kind === 'hotbar'
        ? inventory.getSlots()[source.index]
        : inventory.getInventorySlots()[source.index];
      if (!slotItem || !slotItem.type || slotItem.count <= 0 || slotItem.type === 'sword') return;
      handleDropOutsideFromSlot(source, slotItem.type, slotItem.count);
      return;
    }
    const inventory = engineRef.current?.inventory;
    if (!inventory) return;
    const resolvedTarget: InventorySlotRef =
      target.kind === 'hotbar' && target.index === 0
        ? {
            kind: 'hotbar',
            index: (() => {
              if (inventory.activeSlot > 0) return inventory.activeSlot;
              const emptyIdx = inventory.getSlots().findIndex((s, i) => i > 0 && (!s.type || s.count <= 0));
              return emptyIdx > 0 ? emptyIdx : 1;
            })(),
          }
        : target;

    if (lobbyStatus === 'connected' && lobbySocketRef.current?.readyState === WebSocket.OPEN) {
      lobbySocketRef.current.send(JSON.stringify({ type: 'inventory_move_slot', from: source, to: resolvedTarget }));
      if (inventory.moveSlot(source, resolvedTarget)) {
        if (resolvedTarget.kind === 'hotbar') {
          inventory.selectSlot(resolvedTarget.index);
        }
        setInventoryVersion(version => version + 1);
        setStats(prev => ({...prev, hotbar: inventory.getSlots(), activeSlot: inventory.activeSlot}));
      }
      return;
    }
    if (!inventory.moveSlot(source, resolvedTarget)) return;
    if (resolvedTarget.kind === 'hotbar') {
      inventory.selectSlot(resolvedTarget.index);
    }
    setInventoryVersion(version => version + 1);
    setStats(prev => ({...prev, hotbar: inventory.getSlots(), activeSlot: inventory.activeSlot}));
  }, [lobbyStatus, handleDropOutsideFromSlot]);

  const handleSlotPointerDown = useCallback((
    slotRef: InventorySlotRef,
    slotData: { type: string | null; count: number; name?: string; color?: string; toolKind?: ToolKind; toolTier?: ToolTier },
    e: React.PointerEvent
  ) => {
    if (e.button !== 0) return;
    if (!slotData.type || slotData.count <= 0) return;
    if (slotRef.kind === 'hotbar' && slotRef.index === 0) return;
    if (slotData.type === 'sword') return;

    if (engineRef.current) {
      engineRef.current.blockInteraction.isLeftDown = false;
      engineRef.current.blockInteraction.isRightDown = false;
    }

    activePointerDragRef.current = {
      source: slotRef,
      item: slotData.type as ItemType,
      count: slotData.count,
      name: slotData.name || '',
      color: slotData.color || '#fff',
      toolKind: slotData.toolKind,
      toolTier: slotData.toolTier,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
      pointerId: e.pointerId,
    };
    dragSourceRef.current = slotRef;
  }, []);

  useEffect(() => {
    const handleGlobalPointerMove = (e: PointerEvent) => {
      const active = activePointerDragRef.current;
      if (!active || active.pointerId !== e.pointerId) return;

      const dist = Math.hypot(e.clientX - active.startX, e.clientY - active.startY);
      if (!active.isDragging && dist >= 6) {
        active.isDragging = true;
        if (engineRef.current) {
          engineRef.current.blockInteraction.isLeftDown = false;
          engineRef.current.blockInteraction.isRightDown = false;
        }
        dragPreviewPosRef.current = { x: e.clientX, y: e.clientY };
        setDragPreview({
          item: active.item,
          count: active.count,
          name: active.name,
          color: active.color,
          toolKind: active.toolKind,
          toolTier: active.toolTier,
          x: e.clientX,
          y: e.clientY,
        });
      }

      if (active.isDragging) {
        dragPreviewPosRef.current = { x: e.clientX, y: e.clientY };
        if (dragPreviewElRef.current) {
          dragPreviewElRef.current.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
        }

        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot-kind]');
        if (el) {
          const kind = el.getAttribute('data-slot-kind') as 'inventory' | 'hotbar';
          const index = Number(el.getAttribute('data-slot-index'));
          if (Number.isInteger(index) && !(kind === 'hotbar' && index === 0)) {
            setDragTarget({ kind, index });
          } else {
            setDragTarget(null);
          }
        } else {
          setDragTarget(null);
        }
      }
    };

    const handleGlobalPointerUp = (e: PointerEvent) => {
      const active = activePointerDragRef.current;
      if (!active || active.pointerId !== e.pointerId) return;

      activePointerDragRef.current = null;
      setDragPreview(null);
      setDragTarget(null);

      if (engineRef.current) {
        engineRef.current.blockInteraction.isLeftDown = false;
        engineRef.current.blockInteraction.isRightDown = false;
      }

      if (!active.isDragging) {
        dragSourceRef.current = null;
        return;
      }

      lastDragEndedAtRef.current = Date.now();
      e.preventDefault();
      e.stopPropagation();

      const targetEl = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-slot-kind]');

      if (targetEl) {
        const targetKind = targetEl.getAttribute('data-slot-kind') as 'inventory' | 'hotbar';
        const targetIndex = Number(targetEl.getAttribute('data-slot-index'));
        if (Number.isInteger(targetIndex)) {
          if (targetKind === active.source.kind && targetIndex === active.source.index) {
            dragSourceRef.current = null;
            return;
          }
          dragSourceRef.current = active.source;
          handleSlotDrop({ kind: targetKind, index: targetIndex });
          return;
        }
      }

      // Dropped outside all slots -> World Drop!
      handleDropOutsideFromSlot(active.source, active.item, active.count);
      dragSourceRef.current = null;
    };

    const cancelActivePointerDrag = () => {
      activePointerDragRef.current = null;
      dragSourceRef.current = null;
      touchDragSourceRef.current = null;
      setDragPreview(null);
      setDragTarget(null);
    };

    const handleGlobalPointerCancel = (e: PointerEvent) => {
      const active = activePointerDragRef.current;
      if (active && active.pointerId !== e.pointerId) return;
      cancelActivePointerDrag();
    };

    const handleWindowBlur = () => cancelActivePointerDrag();

    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      const targetEl = (e.target as HTMLElement | null)?.closest('[data-slot-kind]');
      if (!targetEl) {
        e.preventDefault();
        e.stopPropagation();
        handleDropOutside();
      }
    };

    window.addEventListener('pointermove', handleGlobalPointerMove, true);
    window.addEventListener('pointerup', handleGlobalPointerUp, true);
    window.addEventListener('pointercancel', handleGlobalPointerCancel, true);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove, true);
      window.removeEventListener('pointerup', handleGlobalPointerUp, true);
      window.removeEventListener('pointercancel', handleGlobalPointerCancel, true);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [handleSlotDrop, handleDropOutsideFromSlot, handleDropOutside]);

  const handleCraft = useCallback((recipe: CraftingRecipe) => {
    if (lobbyStatus === 'connected' && lobbySocketRef.current?.readyState === WebSocket.OPEN) {
      lobbySocketRef.current.send(JSON.stringify({ type: 'craft_request', recipeId: recipe.id }));
      return;
    }
    const inventory = engineRef.current?.inventory;
    if (!inventory || !inventory.craft(recipe.ingredients, recipe.output, recipe.outputAmount)) return;
    sound.playCraft();
    if (recipe.station === 'furnace') {
      setChestNotice(`Smelted ×${recipe.outputAmount} ${ITEM_INFO[recipe.output].name}!`);
    }
    setInventoryVersion((version) => version + 1);
    setStats((prev) => ({ ...prev, hotbar: inventory.getSlots(), activeSlot: inventory.activeSlot }));
  }, [lobbyStatus]);
  const handleCloseCrafting = useCallback(() => setShowCrafting(false), []);

  const handleZoomIn = () => {
    if (engineRef.current) {
      const z = engineRef.current.zoomIn();
      setStats((prev) => ({ ...prev, zoom: z }));
    }
  };

  const handleZoomOut = () => {
    if (engineRef.current) {
      const z = engineRef.current.zoomOut();
      setStats((prev) => ({ ...prev, zoom: z }));
    }
  };

  const handleResetZoom = () => {
    if (engineRef.current) {
      const z = engineRef.current.resetZoom();
      setStats((prev) => ({ ...prev, zoom: z }));
    }
  };

  const isNight =
    stats.timeOfDayFormatted.includes('PM') &&
    (parseInt(stats.timeOfDayFormatted.slice(0, 2)) >= 7 ||
      parseInt(stats.timeOfDayFormatted.slice(0, 2)) === 12);

  return (
    <div
      ref={containerRef}
      className="game-viewport relative w-screen overflow-hidden bg-slate-950 font-sans select-none text-slate-100"
      onDragOver={(e) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        const targetSlot = (e.target as HTMLElement | null)?.closest('[data-slot-kind]');
        if (!targetSlot) {
          e.preventDefault();
          e.stopPropagation();
          handleDropOutside();
        }
      }}
    >
      {/* Primary Hardware-Accelerated Game Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block cursor-crosshair"
        onDragOver={(e) => {
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDropOutside();
        }}
      />

      {miningNotice && gameState === 'PLAYING' && (
        <div role="status" className="pointer-events-none fixed bottom-[150px] left-1/2 z-40 -translate-x-1/2 rounded-lg border border-amber-300/50 bg-slate-950/90 px-4 py-2 text-center font-mono text-sm font-bold text-amber-100 shadow-lg">
          {miningNotice}
        </div>
      )}

      {showChapterIntro && gameState === 'PLAYING' && (
        <div
          key={chapterIntroKey}
          role="status"
          aria-live="polite"
          className="animate-chapter-intro pointer-events-none fixed inset-0 z-50 flex flex-col items-center justify-center px-4 select-none"
        >
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-3 sm:gap-5">
              <span className="h-1 w-10 sm:w-20 bg-white shadow-[2px_2px_0_#000]" />
              <span className="font-pixel pixel-chapter-shadow text-base sm:text-2xl md:text-3xl tracking-[0.28em] text-white uppercase">
                {chapterTitle}
              </span>
              <span className="h-1 w-10 sm:w-20 bg-white shadow-[2px_2px_0_#000]" />
            </div>
            <div className="font-pixel pixel-survive-shadow text-4xl sm:text-6xl md:text-7xl lg:text-8xl tracking-[0.18em] text-white uppercase leading-none">
              {chapterSubtitle}
            </div>
          </div>
        </div>
      )}

      {/* IN-GAME HUD */}
      {gameState !== 'TITLE' && (
        <>
          {/* Compact adventure HUD */}
          <header className="absolute top-2 left-2 right-20 sm:top-3 sm:left-3 sm:right-24 z-20 flex justify-center pointer-events-none">
            <div className="pointer-events-auto flex max-w-full flex-wrap sm:flex-nowrap items-center justify-center gap-1.5 rounded-2xl border-2 border-[#6eaa7c]/50 bg-[#182b2b]/40 px-2 py-1.5 sm:py-2 shadow-[0_5px_0_#10201f66,0_10px_24px_#0005] backdrop-blur-sm text-slate-100">
              <div className="hud-chip">
                <b>DAY {stats.dayCount}</b>
                <span>{stats.timeOfDayFormatted}</span>
                {stats.weather && stats.weather !== 'clear' && (
                  <span
                    className="ml-0.5 inline-flex items-center gap-1 rounded bg-sky-950/75 px-1.5 py-0.5 text-[10px] font-bold text-sky-100 border border-sky-300/40 shadow-sm"
                    title={stats.weatherEffect || `${stats.weatherLabel} event active`}
                  >
                    <span>{stats.weatherIcon}</span>
                    <span>{stats.weatherLabel}</span>
                    {stats.weatherEffect && (
                      <span className="hidden sm:inline text-[9px] text-amber-200 font-mono ml-0.5">
                        ({stats.weatherEffect})
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex items-center rounded-xl bg-slate-950/30 border border-white/15 px-1"><button onClick={handleZoomOut} className="px-2 py-1 hover:text-amber-300" aria-label="Zoom out">−</button><button onClick={handleResetZoom} className="min-w-11 text-xs font-bold text-amber-200" aria-label="Reset zoom">{Math.round(stats.zoom*100)}%</button><button onClick={handleZoomIn} className="px-2 py-1 hover:text-amber-300" aria-label="Zoom in">+</button></div>
              <div className="hud-chip max-w-[140px] sm:max-w-none truncate"><span>{stats.biomeName.toLowerCase().includes('desert') ? '🏜️' : stats.biomeName.toLowerCase().includes('ocean') ? '🌊' : stats.biomeName.toLowerCase().includes('ice') || stats.biomeName.toLowerCase().includes('snow') || stats.biomeName.toLowerCase().includes('glacier') ? '❄️' : stats.biomeName.toLowerCase().includes('volcan') ? '🌋' : stats.biomeName.toLowerCase().includes('jungle') ? '🌴' : stats.biomeName.toLowerCase().includes('crystal') || stats.biomeName.toLowerCase().includes('cavern') ? '💎' : '🌳'}</span><b className="uppercase tracking-wide truncate">{stats.biomeName}</b></div>
              <div className="hud-chip text-emerald-200 hidden sm:inline-flex">● {stats.fps} FPS</div><button type="button" onClick={() => { setOpenTeleportSection('biomes'); setBiomeMenuOpen(!biomeMenuOpenRef.current); }} aria-expanded={showBiomeMenu} className="flex items-center gap-1.5 rounded-xl border border-cyan-200/50 bg-cyan-900/45 px-2.5 sm:px-3 py-1.5 sm:py-2 text-[10px] font-black tracking-widest hover:bg-cyan-800/65"><MapPinned size={14}/><span>TELEPORTER</span><ChevronDown size={13} className={`transition-transform ${showBiomeMenu ? 'rotate-180' : ''}`}/></button>
            </div>
          </header>
          <aside
            aria-label="Player status"
            className="fixed top-14 left-2 sm:top-auto sm:bottom-4 sm:left-3 z-30 flex flex-row sm:flex-col gap-1.5 sm:gap-2 pointer-events-none max-w-[calc(100vw-1rem)] overflow-x-auto [scrollbar-width:none] p-1.5 rounded-2xl bg-black/45 backdrop-blur-md border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.7),0_2px_8px_rgba(0,0,0,0.8)]"
          >
            {stats.isCreative ? (
              <div className="rounded-xl border border-purple-400/50 bg-gradient-to-r from-purple-950/95 via-slate-950/90 to-purple-950/90 px-3 py-2 flex items-center gap-2.5 text-slate-100 backdrop-blur-md shadow-[0_4px_16px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)] pointer-events-auto">
                <span className="text-base animate-pulse drop-shadow-[0_1px_4px_rgba(192,132,252,0.8)]">✨</span>
                <div>
                  <div className="text-[10px] font-pixel text-[#fff0bd] uppercase tracking-wider drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">CREATIVE MODE</div>
                  <div className="text-[9px] font-mono text-purple-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">Invulnerable • Infinite Items • Flight</div>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-rose-400/30 bg-gradient-to-r from-rose-950/90 via-slate-950/90 to-rose-950/85 px-2.5 py-1.5 flex items-center gap-2 text-slate-100 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <span className="text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">❤️</span>
                  <div className="min-w-16 sm:min-w-20">
                    <div className="text-[9px] sm:text-[10px] font-bold leading-none mb-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      HP <span className="text-rose-200 font-mono">{Math.max(0, Math.round(stats.health))}/{stats.maxHealth}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/70 border border-black/80 overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 via-rose-400 to-pink-300 transition-[width] shadow-[0_0_6px_rgba(244,63,94,0.6)]"
                        style={{ width: `${Math.max(0, Math.min(100, (stats.health / stats.maxHealth) * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-950/90 via-slate-950/90 to-cyan-950/85 px-2.5 py-1.5 flex items-center gap-2 text-slate-100 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <span className="text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">⚡</span>
                  <div className="min-w-16 sm:min-w-20">
                    <div className="text-[9px] sm:text-[10px] font-bold leading-none mb-1 flex items-center justify-between gap-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      <span>{stats.isSprinting ? 'SPRINT' : 'STAMINA'}</span>
                      <span className="text-cyan-200 font-mono">{Math.max(0, Math.round(stats.stamina))}/{stats.maxStamina}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/70 border border-black/80 overflow-hidden shadow-inner">
                      <div
                        className={`h-full transition-[width] shadow-[0_0_6px_rgba(6,182,212,0.6)] ${
                          stats.weather === 'snow' && stats.isExposedToWeather && !stats.isNearWarmth
                            ? 'bg-gradient-to-r from-sky-400 to-cyan-100 animate-pulse'
                            : 'bg-gradient-to-r from-cyan-600 via-cyan-400 to-emerald-300'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, (stats.stamina / stats.maxStamina) * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-400/30 bg-gradient-to-r from-amber-950/90 via-slate-950/90 to-amber-950/85 px-2.5 py-1.5 flex items-center gap-2 text-slate-100 backdrop-blur-md shadow-[0_4px_12px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <span className="text-xs drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">🍖</span>
                  <div className="min-w-16 sm:min-w-20">
                    <div className="text-[9px] sm:text-[10px] font-bold leading-none mb-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                      FOOD <span className="text-amber-200 font-mono">{Math.max(0, Math.round(stats.food))}/{stats.maxFood}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/70 border border-black/80 overflow-hidden shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-amber-600 via-amber-400 to-yellow-300 transition-[width] shadow-[0_0_6px_rgba(245,158,11,0.6)]"
                        style={{ width: `${Math.max(0, Math.min(100, (stats.food / stats.maxFood) * 100))}%` }}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
            {stats.activeBuffs && stats.activeBuffs.length > 0 && (
              <div className="flex flex-row sm:flex-col gap-1 pointer-events-auto">
                {stats.activeBuffs.map((buff) => (
                  <div
                    key={buff.id}
                    title={buff.description}
                    className="flex items-center gap-1.5 rounded-xl border bg-slate-950/90 px-2.5 py-1 text-slate-100 shadow-[0_4px_12px_rgba(0,0,0,0.7)] backdrop-blur-md transition-all"
                    style={{ borderColor: buff.color }}
                  >
                    <span className="text-xs">{buff.icon}</span>
                    <div className="min-w-14">
                      <div className="flex items-center justify-between gap-1 text-[9px] font-bold leading-tight">
                        <span className="truncate" style={{ color: buff.color }}>{buff.name}</span>
                        <span className="font-mono text-slate-300">{Math.ceil(buff.remainingSec)}s</span>
                      </div>
                      <div className="mt-0.5 h-1 w-full rounded-full bg-black/50 overflow-hidden">
                        <div
                          className="h-full transition-[width]"
                          style={{
                            backgroundColor: buff.color,
                            width: `${Math.max(0, Math.min(100, (buff.remainingSec / buff.durationSec) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </aside>
          {/* Performance Profiler Overlay (F3) */}
          {showDebug && (
            <div className="absolute top-16 left-4 bg-slate-950/95 border-2 border-amber-500/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md z-20 font-mono text-xs text-slate-300 w-80 pointer-events-none">
              <div className="text-amber-400 font-bold uppercase tracking-wider mb-2 flex items-center justify-between border-b border-slate-800 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-amber-400" /> Real-time Profiler
                </span>
                <span className="text-[10px] text-slate-500 font-normal">F3 to close</span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">FPS:</span>
                  <span className={`font-bold ${stats.fps >= 55 ? 'text-emerald-400' : stats.fps >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                    {stats.fps} FPS
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Average Frame Time:</span>
                  <span className={`font-bold ${stats.profiler.avgFrameTime <= 16.6 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {stats.profiler.avgFrameTime.toFixed(2)} ms
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Worst Frame Time:</span>
                  <span className={`font-bold ${stats.profiler.worstFrameTime <= 20.0 ? 'text-emerald-400' : stats.profiler.worstFrameTime <= 33.3 ? 'text-amber-400' : 'text-red-400'}`}>
                    {stats.profiler.worstFrameTime.toFixed(2)} ms
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Render Time:</span>
                  <span className="text-slate-200 font-semibold">{stats.profiler.renderTime.toFixed(2)} ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Physics Time:</span>
                  <span className="text-slate-200 font-semibold">{stats.profiler.physicsTime.toFixed(2)} ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Chunk Management:</span>
                  <span className="text-slate-200 font-semibold">{stats.profiler.chunkMgmtTime.toFixed(2)} ms</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Chunk Generation:</span>
                  <span className="text-slate-200 font-semibold">{stats.profiler.chunkGenTime.toFixed(2)} ms</span>
                </div>

                <div className="border-t border-slate-800 my-1 pt-1 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Active Enemies:</span>
                    <span className="text-rose-400 font-bold">{stats.activeEnemies} / 15</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Active Drops:</span>
                    <span className="text-emerald-400 font-bold">{stats.activeDrops}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Visible Chunks:</span>
                    <span className="text-cyan-400 font-bold">{stats.visibleChunks}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Loaded Chunks:</span>
                    <span className="text-cyan-400 font-bold">{stats.loadedChunks}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Camera Zoom:</span>
                    <span className="text-amber-300 font-bold">{Math.round(stats.zoom * 100)}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Queued Chunks:</span>
                    <span className="text-amber-300 font-semibold">{stats.profiler.queuedChunks}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Player Block:</span>
                    <span className="text-slate-200">X: {stats.playerX}, Y: {stats.playerY}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Current Chunk:</span>
                    <span className="text-slate-200">[{stats.chunkX}, {stats.chunkY}]</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Biome:</span>
                    <span className="text-emerald-300">{stats.biomeName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">World Seed:</span>
                    <span className="text-amber-400 font-semibold">{stats.seed}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {developerTestMode && gameState === 'PLAYING' && (
            <section aria-label="Developer test controls" className="absolute left-3 top-48 z-30 max-h-[55vh] w-60 overflow-auto rounded-xl border-2 border-fuchsia-400/70 bg-slate-950/95 p-3 text-xs shadow-xl">
              <button type="button" className="mb-2 w-full text-left font-bold tracking-wide text-fuchsia-200" onClick={() => setShowTestControls(open => !open)}>
                DEVELOPER TEST MODE · {showTestControls ? 'HIDE' : 'SHOW'}
              </button>
              {showTestControls && <>
                <div className="grid grid-cols-2 gap-1.5">
                  <button className="rounded bg-sky-900 px-2 py-1.5" onClick={() => { const next = !testWalkHeld; setTestWalkHeld(next); engineRef.current?.setVirtualInput('right', next); }}>{testWalkHeld ? 'Stop test walk' : 'Hold right'}</button>
                  <button className="rounded bg-sky-900 px-2 py-1.5" onClick={() => { const next = !testLeftHeld; setTestLeftHeld(next); engineRef.current?.setVirtualInput('left', next); }}>{testLeftHeld ? 'Stop left' : 'Hold left'}</button>
                  <button className="rounded bg-cyan-900 px-2 py-1.5" onClick={() => { const next = !testSprintHeld; setTestSprintHeld(next); engineRef.current?.setVirtualInput('sprint', next); }}>{testSprintHeld ? 'Stop sprint' : 'Hold sprint'}</button>
                  <button className="rounded bg-cyan-950 px-2 py-1.5" onClick={() => { const next = !testSprintRunHeld; setTestSprintRunHeld(next); engineRef.current?.setVirtualInput('left', next); engineRef.current?.setVirtualInput('sprint', next); }}>{testSprintRunHeld ? 'Stop sprint run' : 'Hold left + sprint'}</button>
                  <button className="rounded bg-rose-900 px-2 py-1.5" onClick={() => engineRef.current?.developerTestAttack()}>Attack once</button>
                  <button className="rounded bg-red-900 px-2 py-1.5" onClick={() => { engineRef.current?.developerTestDamage(25); setTestMessage('Took 25 test damage.'); }}>Take 25 dmg</button>
                  <button className="rounded bg-lime-900 px-2 py-1.5" onClick={() => { const ok = engineRef.current?.developerTestSpawnSlime(); setTestMessage(ok ? 'Hostile slime spawned.' : 'Could not spawn slime.'); }}>Spawn slime</button>
                  <button className="rounded bg-fuchsia-900 px-2 py-1.5" onClick={() => { const ok = engineRef.current?.grantDeveloperTestKit(); setInventoryVersion(v => v + 1); setTestMessage(ok ? 'Test kit added through inventory.' : 'Test kit could not be fully added.'); }}>Grant test kit</button>
                  <button className="rounded bg-fuchsia-900 px-2 py-1.5" onClick={() => setTestMessage(engineRef.current?.prepareDeveloperTestArea() ? 'Test blocks and cave prepared.' : 'Area preparation failed.')}>Build test area</button>
                  {(['rabbit', 'deer', 'boar', 'fox', 'bird', 'fish'] as const).map(species => (
                    <button key={species} className="rounded bg-emerald-900 px-2 py-1.5 capitalize" onClick={() => setTestMessage(engineRef.current?.spawnDeveloperTestAnimal(species) ? `${species} spawned.` : `${species} spawn failed; rebuild the test area.`)}>Spawn {species}</button>
                  ))}
                  <button className="rounded bg-blue-900 px-2 py-1.5" onClick={() => { engineRef.current?.triggerWeatherEvent('rain', 60); setTestMessage('Triggered Rain event (60s). Canvas tinted, speed reduced.'); }}>🌧️ Rain event</button>
                  <button className="rounded bg-cyan-900 px-2 py-1.5" onClick={() => { engineRef.current?.triggerWeatherEvent('snow', 60); setTestMessage('Triggered Snow event (60s). Canvas frosted, speed/stamina impacted.'); }}>❄️ Snow event</button>
                  <button className="col-span-2 rounded bg-slate-800 px-2 py-1 text-slate-300" onClick={() => { engineRef.current?.setWeatherOverride('clear'); setTestMessage('Cleared weather to clear sky.'); }}>☀️ Clear weather</button>
                </div>
                <p role="status" className="mt-2 min-h-4 text-[10px] text-amber-200">{testMessage || 'Fixture blocks persist only in this disposable world. Normal mode is unchanged.'}</p>
              </>}
            </section>
          )}

          {/* Bottom Center Hotbar */}
          {stats.hotbar.length > 0 && (
            <Hotbar
              slots={stats.hotbar}
              activeSlot={stats.activeSlot}
              onSelectSlot={handleSelectSlot}
              onOpenInventory={() => {
                setInventoryVersion((v) => v + 1);
                setShowInventory(true);
              }}
              onDragStart={handleSlotDragStart}
              onDragOver={setDragTarget}
              onDrop={handleSlotDrop}
              dragTarget={dragTarget}
              onSlotPointerDown={handleSlotPointerDown}
              isTouchActive={showTouchControls}
            />
          )}

          {/* Mobile Touch Controls */}
          <TouchControls
            engine={engineRef.current}
            visible={showTouchControls}
            onOpenInventory={() => {
              setInventoryVersion((v) => v + 1);
              setShowInventory(true);
            }}
            onOpenCreativeCatalog={() => {
              setInventoryVersion((v) => v + 1);
              setMobileModalTab('catalog');
              setCreativeRightTab('catalog');
              setShowInventory(true);
            }}
          />

          {/* Fullscreen, Touch Controls & Creative Quick Toggles */}
          <div className="fixed right-3 top-14 sm:top-auto sm:right-4 sm:bottom-5 md:right-4 md:bottom-5 z-30 flex items-center gap-1.5">
            {stats.isCreative && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setInventoryVersion((v) => v + 1);
                    setMobileModalTab('catalog');
                    setCreativeRightTab('catalog');
                    setShowInventory((prev) => !prev);
                  }}
                  aria-label="Open Creative Inventory"
                  title="Creative Catalog (C)"
                  className="flex h-8 items-center gap-1 rounded-lg border border-purple-400/50 bg-purple-950/90 px-2.5 font-pixel text-[10px] text-purple-200 shadow-lg hover:border-purple-300 hover:bg-purple-900/90 active:scale-95"
                >
                  <Sparkles size={13} className="text-amber-300" />
                  <span className="hidden sm:inline">CATALOG</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    engineRef.current?.toggleFlight();
                  }}
                  aria-label="Toggle Flight"
                  title="Toggle Flight (Double-tap Space)"
                  className={`flex h-8 items-center gap-1 rounded-lg border px-2.5 font-pixel text-[10px] shadow-lg transition active:scale-95 ${
                    stats.isFlying
                      ? 'border-sky-300 bg-sky-500/35 text-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.5)]'
                      : 'border-slate-700/60 bg-[#182b2b]/90 text-slate-300 hover:border-sky-400'
                  }`}
                >
                  <Feather size={13} />
                  <span>{stats.isFlying ? 'FLYING' : 'FLY'}</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleToggleTouchControls}
              aria-label={showTouchControls ? 'Hide on-screen controls' : 'Show on-screen controls'}
              title={showTouchControls ? 'Touch Controls: Active (Click to hide)' : 'Touch Controls: Hidden (Click to show)'}
              className={`grid h-8 w-8 place-items-center rounded-lg border text-xs shadow-lg transition active:scale-95 ${
                showTouchControls
                  ? 'border-emerald-300/60 bg-emerald-950/90 text-emerald-300 shadow-emerald-950/50'
                  : 'border-slate-700/60 bg-[#182b2b]/90 text-slate-400 hover:text-slate-200'
              }`}
            >
              🕹️
            </button>
            {window.self === window.top && (
              <button
                type="button"
                onClick={handleToggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                className="grid h-8 w-8 place-items-center rounded-lg border border-emerald-200/30 bg-[#182b2b]/90 text-emerald-100 shadow-lg hover:bg-[#29443d] active:scale-95"
              >
                {isFullscreen ? <Minimize2 size={15}/> : <Maximize2 size={15}/>}
              </button>
            )}
          </div>
        </>
      )}

      {/* Creative Catalog Modal */}
      {showCreativeCatalog && engineRef.current && (
        <CreativeCatalog
          engine={engineRef.current}
          onClose={() => setShowCreativeCatalog(false)}
          onInventoryChanged={() => {
            setInventoryVersion((v) => v + 1);
            setStats((prev) => ({
              ...prev,
              hotbar: engineRef.current ? engineRef.current.inventory.getSlots() : prev.hotbar,
            }));
          }}
          isFlying={stats.isFlying}
        />
      )}

      {openChest && engineRef.current && gameState !== 'TITLE' && gameState !== 'DEAD' && (
        <ChestPanel
          chestId={openChest.id}
          containerName={openChest.containerType ?? 'Chest'}
          slots={openChest.slots}
          inventory={engineRef.current.inventory}
          revision={openChest.revision}
          pending={chestPending}
          notice={chestNotice}
          onTransfer={transferWorldChestItems}
          onSmelt={handleCraft}
          onClose={closeWorldChest}
        />
      )}

      {activeSign && gameState !== 'TITLE' && gameState !== 'DEAD' && <SignEditor object={activeSign} onSave={saveSignText} onClose={() => setActiveSign(null)} />}

      {/* INVENTORY + CRAFTING SIDE-BY-SIDE OVERLAY */}
      {showInventory && gameState !== 'TITLE' && gameState !== 'DEAD' && engineRef.current && (
        <div
          className="absolute inset-0 z-40 flex flex-col items-center justify-start sm:justify-center p-2 sm:p-4 pb-28 md:pb-24 overflow-y-auto bg-[#101a1b]/80"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setShowInventory(false);
              setIsCraftingBenchActive(false);
              if (engineRef.current) {
                engineRef.current.blockInteraction.isLeftDown = false;
                engineRef.current.blockInteraction.isRightDown = false;
              }
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDropOutside();
          }}
        >
          <div
            className="flex flex-col lg:flex-row items-stretch justify-center gap-3 sm:gap-4 max-w-5xl w-full"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              if (!(e.target as HTMLElement).closest('[data-slot-kind]')) {
                e.preventDefault();
                e.stopPropagation();
                handleDropOutside();
              }
            }}
          >
            {/* MOBILE TAB BAR: INVENTORY vs CRAFTING vs CREATIVE */}
            <div className="flex lg:hidden items-center justify-center gap-2 mb-1 w-full max-w-[480px]">
              <button
                type="button"
                onClick={() => setMobileModalTab('inventory')}
                className={`flex-1 py-2 px-3 rounded-xl font-pixel text-xs font-bold transition flex items-center justify-center gap-1.5 border-2 active:scale-95 ${
                  mobileModalTab === 'inventory'
                    ? 'bg-emerald-700 border-emerald-300 text-white shadow-lg'
                    : 'bg-slate-900/80 border-slate-700 text-emerald-200/70 hover:bg-slate-800'
                }`}
              >
                <Backpack size={15} /> INVENTORY (49)
              </button>
              {stats.isCreative && (
                <button
                  type="button"
                  onClick={() => setMobileModalTab('catalog')}
                  className={`flex-1 py-2 px-3 rounded-xl font-pixel text-xs font-bold transition flex items-center justify-center gap-1.5 border-2 active:scale-95 ${
                    mobileModalTab === 'catalog'
                      ? 'bg-purple-700 border-purple-300 text-white shadow-lg'
                      : 'bg-slate-900/80 border-slate-700 text-purple-200/70 hover:bg-slate-800'
                  }`}
                >
                  <Sparkles size={15} /> CATALOG
                </button>
              )}
              <button
                type="button"
                onClick={() => setMobileModalTab('crafting')}
                className={`flex-1 py-2 px-3 rounded-xl font-pixel text-xs font-bold transition flex items-center justify-center gap-1.5 border-2 active:scale-95 ${
                  mobileModalTab === 'crafting'
                    ? 'bg-amber-600 border-amber-300 text-white shadow-lg'
                    : 'bg-slate-900/80 border-slate-700 text-amber-200/70 hover:bg-slate-800'
                }`}
              >
                <Hammer size={15} /> CRAFTING
              </button>
            </div>

            {/* LEFT: 7x7 INVENTORY */}
            <section
              role="dialog"
              aria-modal="true"
              aria-label="Inventory"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                if (!(e.target as HTMLElement).closest('[data-slot-kind]')) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDropOutside();
                }
              }}
              className={`relative flex-col w-full max-w-[480px] max-h-[88vh] overflow-y-auto scrollbar-none rounded-2xl border-[3px] border-[#78b381] bg-[#243c38] p-2.5 sm:p-5 shadow-[0_10px_0_#132522,0_20px_60px_#000a] ${
                mobileModalTab === 'inventory' ? 'flex' : 'hidden lg:flex'
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-pixel text-xs sm:text-sm text-amber-200 flex items-center gap-2">
                  <Backpack size={20} /> 7×7 INVENTORY
                </h2>
                <div className="flex items-center gap-2 sm:gap-3">
                  {stats.isCreative && (
                    <button
                      type="button"
                      onClick={() => {
                        setCreativeRightTab('catalog');
                        setMobileModalTab('catalog');
                      }}
                      className="hidden sm:inline-flex items-center gap-1 rounded bg-purple-700 hover:bg-purple-600 px-2.5 py-1 text-[10px] font-pixel text-white border border-purple-300 shadow active:scale-95"
                    >
                      <Sparkles size={12} /> CREATIVE ITEMS
                    </button>
                  )}
                  <span className="font-mono text-[10px] text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                    49 SLOTS
                  </span>
                  {/* LARGE RED INVENTORY CLOSE BUTTON */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setShowInventory(false);
                      setIsCraftingBenchActive(false);
                      if (engineRef.current) {
                        engineRef.current.blockInteraction.isLeftDown = false;
                        engineRef.current.blockInteraction.isRightDown = false;
                      }
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    aria-label="Close inventory"
                    title="Close inventory (Esc)"
                    className="z-50 relative flex items-center justify-center min-w-[44px] min-h-[44px] w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white border-2 border-red-300 shadow-xl shadow-red-950/60 hover:shadow-red-500/40 transition-transform active:scale-95 cursor-pointer focus:outline-none focus:ring-2 focus:ring-red-400"
                  >
                    <span className="leading-none select-none text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] font-pixel text-xl sm:text-2xl font-black">
                      ✕
                    </span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-1 sm:gap-1.5" aria-label="49 inventory slots">
                {(() => {
                  const inventorySlots = engineRef.current?.inventory.getInventorySlots() ?? [];
                  return Array.from({ length: 49 }, (_, index) => {
                    const slot = inventorySlots[index];
                    const isTarget = dragTarget?.kind === 'inventory' && dragTarget.index === index;
                    return (
                      <button
                        key={index}
                        type="button"
                        data-slot-kind="inventory"
                        data-slot-index={index}
                        // Use the global Pointer Events drag path so releasing over
                        // the canvas is observed consistently in Firefox and Chromium.
                        draggable={false}
                        onDragStart={(e) => {
                          if (!slot?.type) {
                            e.preventDefault();
                            return;
                          }
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('application/x-pixel-frontier-slot', `inventory:${index}`);
                          handleSlotDragStart({ kind: 'inventory', index });
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDragTarget({ kind: 'inventory', index });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleSlotDrop({ kind: 'inventory', index });
                        }}
                        onDragEnd={() => {
                          const src = dragSourceRef.current;
                          if (src && src.index >= 0) {
                            handleDropOutside();
                          }
                          dragSourceRef.current = null;
                          touchDragSourceRef.current = null;
                          setDragTarget(null);
                        }}
                        onPointerDown={(e) => {
                          if (slot?.type) {
                            handleSlotPointerDown({ kind: 'inventory', index }, slot, e);
                          }
                        }}
                        onTouchStart={(e) => {
                          if (!slot?.type) return;
                          touchDragSourceRef.current = { slot: { kind: 'inventory', index }, startX: e.touches[0].clientX, startY: e.touches[0].clientY };
                        }}
                        onTouchEnd={(e) => {
                          if (!touchDragSourceRef.current) return;
                          const touch = e.changedTouches[0];
                          const dx = Math.abs(touch.clientX - touchDragSourceRef.current.startX);
                          const dy = Math.abs(touch.clientY - touchDragSourceRef.current.startY);
                          if (dx > 12 || dy > 12) {
                            const el = document.elementFromPoint(touch.clientX, touch.clientY);
                            const targetSlotEl = el?.closest('[data-slot-kind]');
                            if (targetSlotEl) {
                              const kind = targetSlotEl.getAttribute('data-slot-kind') as 'inventory' | 'hotbar';
                              const targetIdx = Number(targetSlotEl.getAttribute('data-slot-index'));
                              if (Number.isInteger(targetIdx)) {
                                dragSourceRef.current = touchDragSourceRef.current.slot;
                                handleSlotDrop({ kind, index: targetIdx });
                              }
                            } else {
                              dragSourceRef.current = touchDragSourceRef.current.slot;
                              handleDropOutside();
                            }
                          }
                          touchDragSourceRef.current = null;
                        }}
                        onTouchCancel={() => {
                          touchDragSourceRef.current = null;
                        }}
                        onClick={() => {
                          if (Date.now() - lastDragEndedAtRef.current < 200) return;
                          if (selectedInvSlot === null) {
                            if (slot?.type) setSelectedInvSlot(index);
                          } else if (selectedInvSlot === index) {
                            if (slot?.type) handleAssignInventoryItem(index);
                            setSelectedInvSlot(null);
                          } else {
                            dragSourceRef.current = { kind: 'inventory', index: selectedInvSlot };
                            handleSlotDrop({ kind: 'inventory', index });
                            setSelectedInvSlot(null);
                          }
                        }}
                        onContextMenu={(e) => {
                          if (!slot?.type || !isEdibleItem(slot.type)) return;
                          e.preventDefault();
                          if (engineRef.current?.eatMeatItem(slot.type)) setInventoryVersion((version) => version + 1);
                        }}
                        title={
                          slot?.type
                            ? `${slot.name}${slot.toolTier ? ` · ${slot.toolTier} tier ${slot.toolKind}` : ''}: ${slot.count} · drag to move or click to assign; right-click food to eat`
                            : 'Empty slot · drop an item here'
                        }
                        className={`relative aspect-square rounded-lg border-2 border-[#668875] bg-[#142a29] p-1 shadow-inner transition hover:-translate-y-0.5 hover:border-[#b2d7a9] ${
                          isTarget ? 'ring-2 ring-cyan-300 bg-cyan-400/20 border-cyan-200' : ''
                        } ${selectedInvSlot === index ? 'ring-2 ring-amber-400 bg-amber-400/25 border-amber-300 scale-105 z-10' : ''}`}
                      >
                        {slot?.type && (
                          <>
                            {isMeatItem(slot.type) ? (
                              <span className="absolute inset-1 grid place-items-center">
                                <MeatIcon type={slot.type} />
                              </span>
                            ) : slot.toolTier && slot.toolKind ? (
                              <span className="absolute inset-1 grid place-items-center">
                                <ToolIcon kind={slot.toolKind} tier={slot.toolTier} />
                              </span>
                            ) : (
                              <BlockIcon
                                item={slot.type}
                                fallbackColor={slot.color}
                                borderColor={slot.borderColor}
                                className="absolute inset-0 m-auto h-4/5 w-4/5 rounded-md border border-white/20 shadow-[inset_2px_2px_0_#ffffff40,inset_-2px_-2px_0_#0004]"
                              />
                            )}
                            <span className="absolute bottom-0 right-1 text-[9px] font-bold text-white drop-shadow">
                              {slot.count || ''}
                            </span>
                            {isEdibleItem(slot.type) && (
                              <span className="absolute bottom-0 left-0.5 rounded bg-rose-800/90 px-0.5 text-[7px] font-black text-white">
                                EAT
                              </span>
                            )}
                          </>
                        )}
                      </button>
                    );
                  });
                })()}
              </div>

              {/* EQUIPPED HOTBAR BAR INSIDE INVENTORY WINDOW */}
              <div
                className="mt-3 rounded-xl border-2 border-amber-400/45 bg-[#152625]/95 p-2 sm:p-2.5 shadow-inner"
                onWheel={(e) => {
                  if (Math.abs(e.deltaY) < 1) return;
                  e.stopPropagation();
                  const dir = e.deltaY > 0 ? 1 : -1;
                  handleSelectSlot((stats.activeSlot + dir + 8) % 8);
                }}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="font-pixel text-[9px] sm:text-[10px] text-amber-300 tracking-wider uppercase flex items-center gap-1.5">
                    ⚡ HOTBAR — DRAG ITEMS HERE TO USE
                  </span>
                  <span className="font-mono text-[9px] text-emerald-200/80">
                    SCROLL / KEYS 1–8
                  </span>
                </div>
                <div className="grid grid-cols-8 gap-1 sm:gap-1.5" aria-label="8 equipped hotbar slots">
                  {(engineRef.current?.inventory.getSlots() ?? stats.hotbar).slice(0, 8).map((slot, idx) => {
                    const isActive = idx === stats.activeSlot;
                    const isSword = !!(slot.isWeapon || slot.toolKind === 'sword' || slot.type === 'sword' || slot.isPermanent || idx === 0);
                    const isPermanentSlot = !!(slot.isPermanent || slot.type === 'sword' || idx === 0);
                    const isEmpty = !isPermanentSlot && slot.count <= 0;
                    const isTarget = dragTarget?.kind === 'hotbar' && dragTarget.index === idx;

                    return (
                      <button
                        key={`inv-hotbar-${idx}`}
                        type="button"
                        data-slot-kind="hotbar"
                        data-slot-index={idx}
                        draggable={false}
                        onClick={() => handleSelectSlot(idx)}
                        onPointerDown={(e) => {
                          if (e.button === 0 && idx !== 0 && slot.type) {
                            handleSlotPointerDown({ kind: 'hotbar', index: idx }, slot, e);
                          }
                        }}
                        onDragStart={(e) => {
                          if (idx === 0 || !slot.type) {
                            e.preventDefault();
                            return;
                          }
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('application/x-pixel-frontier-slot', `hotbar:${idx}`);
                          handleSlotDragStart({ kind: 'hotbar', index: idx });
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDragTarget({ kind: 'hotbar', index: idx });
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleSlotDrop({ kind: 'hotbar', index: idx });
                        }}
                        onTouchStart={(e) => {
                          if (idx === 0 || !slot.type) return;
                          touchDragSourceRef.current = {
                            slot: { kind: 'hotbar', index: idx },
                            startX: e.touches[0].clientX,
                            startY: e.touches[0].clientY,
                          };
                        }}
                        onTouchEnd={(e) => {
                          if (!touchDragSourceRef.current) return;
                          const touch = e.changedTouches[0];
                          const dx = Math.abs(touch.clientX - touchDragSourceRef.current.startX);
                          const dy = Math.abs(touch.clientY - touchDragSourceRef.current.startY);
                          if (dx > 12 || dy > 12) {
                            const el = document.elementFromPoint(touch.clientX, touch.clientY);
                            const targetSlotEl = el?.closest('[data-slot-kind]');
                            if (targetSlotEl) {
                              const kind = targetSlotEl.getAttribute('data-slot-kind') as 'inventory' | 'hotbar';
                              const targetIdx = Number(targetSlotEl.getAttribute('data-slot-index'));
                              if (Number.isInteger(targetIdx)) {
                                dragSourceRef.current = touchDragSourceRef.current.slot;
                                handleSlotDrop({ kind, index: targetIdx });
                              }
                            } else {
                              dragSourceRef.current = touchDragSourceRef.current.slot;
                              handleDropOutside();
                            }
                          }
                          touchDragSourceRef.current = null;
                        }}
                        title={
                          isPermanentSlot
                            ? `Slot 1: ${slot.name || 'Sword'} (${slot.toolTier ?? 'wood'} tier equipped weapon)`
                            : slot.type
                            ? `Hotbar #${idx + 1}: ${slot.name} (×${slot.count}) · Drag to move or click to select`
                            : `Empty Hotbar Slot #${idx + 1} · Drag or click an inventory item here to equip`
                        }
                        className={`relative aspect-square rounded-lg border-2 p-1 transition flex flex-col items-center justify-between ${
                          isTarget
                            ? 'ring-2 ring-cyan-300 bg-cyan-400/25 border-cyan-200 scale-105'
                            : isActive
                            ? 'bg-slate-800/95 border-amber-400 scale-105 shadow-md shadow-amber-500/25 ring-2 ring-amber-400/35'
                            : isSword
                            ? 'bg-slate-900/90 border-amber-500/40 hover:border-amber-400'
                            : isEmpty
                            ? 'bg-slate-950/60 border-dashed border-emerald-700/60 hover:border-amber-300/70'
                            : 'bg-slate-900/90 border-[#668875] hover:border-amber-300'
                        }`}
                      >
                        <span
                          className={`self-start font-pixel text-[8px] leading-none z-10 ${
                            isActive ? 'text-amber-300' : 'text-slate-400'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        {isEmpty ? (
                          <span className="text-[11px] font-bold text-emerald-500/45 select-none">+</span>
                        ) : slot.toolKind && slot.toolTier ? (
                          <span className="grid place-items-center">
                            <ToolIcon kind={slot.toolKind} tier={slot.toolTier} />
                          </span>
                        ) : isSword ? (
                          <span className="grid place-items-center">
                            <ToolIcon kind="sword" tier={slot.toolTier ?? 'wood'} />
                          </span>
                        ) : slot.type && (slot.isMeat || isMeatItem(slot.type)) ? (
                          <span className="grid place-items-center">
                            <MeatIcon type={slot.type} />
                          </span>
                        ) : (
                          <BlockIcon
                            item={slot.type}
                            fallbackColor={slot.color}
                            borderColor={slot.borderColor}
                            className="h-4 w-4 sm:h-5 sm:w-5 rounded-xs border border-white/20 shadow"
                          />
                        )}
                        <span className="self-end text-[9px] font-bold leading-none text-emerald-300 drop-shadow">
                          {isPermanentSlot ? '∞' : slot.count > 0 ? slot.count : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* DROP / THROW OUT ZONE */}
              <div
                className="mt-2.5 flex items-center justify-between rounded-xl border-2 border-dashed border-red-500/40 bg-red-950/25 px-3 py-2 text-xs text-red-200 transition hover:bg-red-950/45 hover:border-red-400/80 cursor-pointer"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDropOutside();
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base select-none">🗑️</span>
                  <div>
                    <span className="font-pixel text-[10px] text-red-300 font-bold block">
                      DROP / THROW OUT ITEM (PRESS 'Q' IN-GAME)
                    </span>
                    <span className="font-mono text-[9px] text-red-200/75">
                      Drag here or toss outside to drop · Anyone nearby can collect it!
                    </span>
                  </div>
                </div>
                {selectedInvSlot !== null && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const invSlots = engineRef.current?.inventory.getInventorySlots();
                      const item = invSlots?.[selectedInvSlot];
                      if (item?.type) {
                        handleDropOutsideFromSlot({ kind: 'inventory', index: selectedInvSlot }, item.type, item.count);
                        setSelectedInvSlot(null);
                      }
                    }}
                    className="px-2.5 py-1 bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-pixel text-[9px] rounded-lg border border-red-300 shadow-md cursor-pointer transition active:scale-95"
                  >
                    DROP SELECTED
                  </button>
                )}
              </div>

              <div className="mt-2.5 flex justify-between items-center text-[10px] text-emerald-100/75 border-t border-emerald-900/40 pt-2 font-mono">
                <span>{selectedInvSlot !== null ? `Slot #${selectedInvSlot + 1} selected · Click any Hotbar slot (1–8) to equip` : `${stats.hotbar[stats.activeSlot]?.name || 'Empty hotbar slot'} active · Drag items to Hotbar to use`}</span>
                <span>{selectedInvSlot !== null ? <button type="button" onClick={() => setSelectedInvSlot(null)} className="text-amber-300 underline font-bold px-1">CLEAR</button> : 'I / ESC TO CLOSE'}</span>
              </div>

              {/* IN CREATIVE MODE: SCROLL DOWN FOR ALL ITEMS IN INVENTORY */}
              {stats.isCreative && (
                <div className="mt-4 pt-3 border-t-2 border-emerald-900/60 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 pb-1">
                    <span className="font-pixel text-[11px] text-amber-200 flex items-center gap-1.5">
                      <Sparkles size={14} className="text-amber-300 animate-pulse" />
                      <span>CREATIVE CATALOG</span>
                    </span>
                    <span className="text-[9px] font-mono text-purple-300 bg-purple-950/70 px-2 py-0.5 rounded border border-purple-400/40">
                      Scroll for all items
                    </span>
                  </div>
                  <CreativeCatalog
                    embedded
                    engine={engineRef.current}
                    selectedInvSlot={selectedInvSlot}
                    onInventoryChanged={() => {
                      setInventoryVersion((v) => v + 1);
                      setStats((prev) => ({
                        ...prev,
                        hotbar: engineRef.current ? engineRef.current.inventory.getSlots() : prev.hotbar,
                      }));
                    }}
                    isFlying={engineRef.current?.player.isFlying}
                  />
                </div>
              )}
            </section>

            {/* RIGHT PANEL: CRAFTING OR CREATIVE CATALOG */}
            <div className={`w-full max-w-[480px] ${mobileModalTab !== 'inventory' ? 'block' : 'hidden lg:block'}`}>
              {stats.isCreative ? (
                <div className="flex flex-col gap-2 h-full">
                  {/* Right panel toggle tabs */}
                  <div className="hidden lg:flex items-center gap-1.5 p-1 rounded-xl bg-slate-900/80 border border-slate-700/80">
                    <button
                      type="button"
                      onClick={() => setCreativeRightTab('catalog')}
                      className={`flex-1 py-1.5 px-3 rounded-lg font-pixel text-[10px] uppercase font-bold transition flex items-center justify-center gap-1.5 ${
                        creativeRightTab === 'catalog'
                          ? 'bg-purple-600 border border-purple-300 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Sparkles size={13} /> Creative Catalog
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreativeRightTab('crafting')}
                      className={`flex-1 py-1.5 px-3 rounded-lg font-pixel text-[10px] uppercase font-bold transition flex items-center justify-center gap-1.5 ${
                        creativeRightTab === 'crafting'
                          ? 'bg-amber-600 border border-amber-300 text-white shadow-md'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Hammer size={13} /> Crafting Bench
                    </button>
                  </div>

                  {(mobileModalTab === 'catalog' || (mobileModalTab !== 'crafting' && creativeRightTab === 'catalog')) ? (
                    <CreativeCatalog
                      embedded
                      engine={engineRef.current}
                      selectedInvSlot={selectedInvSlot}
                      onInventoryChanged={() => {
                        setInventoryVersion((v) => v + 1);
                        setStats((prev) => ({
                          ...prev,
                          hotbar: engineRef.current ? engineRef.current.inventory.getSlots() : prev.hotbar,
                        }));
                      }}
                      isFlying={engineRef.current?.player.isFlying}
                    />
                  ) : (
                    <CraftingPanel
                      embedded
                      inventory={engineRef.current.inventory}
                      revision={inventoryVersion}
                      onCraft={handleCraft}
                      station={isCraftingBenchActive ? 'crafting_bench' : 'inventory'}
                    />
                  )}
                </div>
              ) : (
                <CraftingPanel
                  embedded
                  inventory={engineRef.current.inventory}
                  revision={inventoryVersion}
                  onCraft={handleCraft}
                  station={isCraftingBenchActive ? 'crafting_bench' : 'inventory'}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {showCrafting && gameState !== 'TITLE' && gameState !== 'DEAD' && engineRef.current && (
        <CraftingPanel inventory={engineRef.current.inventory} revision={inventoryVersion} onCraft={handleCraft} onClose={handleCloseCrafting} />
      )}

      {lobbyInfo && gameState !== 'TITLE' && (
        <div className="fixed top-2 right-16 z-40 flex items-center gap-2 sm:top-3 sm:right-20">
          {inviteFeedback && (
            <span className="rounded-md border border-cyan-400/50 bg-slate-950/90 px-2 py-1 font-mono text-[10px] font-bold text-cyan-200 shadow-lg">
              {inviteFeedback}
            </span>
          )}
          <button
            type="button"
            onClick={handleInviteFriends}
            className="rounded-md border border-cyan-400/50 bg-cyan-950/60 px-3 py-2 text-xs font-bold text-cyan-100 shadow-lg backdrop-blur-sm hover:bg-cyan-900/80 cursor-pointer"
          >
            INVITE FRIENDS
          </button>
        </div>
      )}
      {lobbyInfo && gameState !== 'TITLE' && (
        <button type="button" onClick={handleLeaveLobby} className="fixed top-2 right-2 z-40 rounded-md border border-red-200/50 bg-red-950/40 px-3 py-2 text-xs font-bold text-red-50 shadow-lg backdrop-blur-sm hover:bg-red-900/60 sm:top-3 sm:right-3">EXIT</button>
      )}

      {!lobbyInfo && gameState !== 'TITLE' && (
        <button type="button" onClick={handleExitLocalGame} className="fixed top-2 right-2 z-40 rounded-md border border-red-200/50 bg-red-950/40 px-3 py-2 text-xs font-bold text-red-50 shadow-lg backdrop-blur-sm hover:bg-red-900/60 sm:top-3 sm:right-3">EXIT</button>
      )}

      {lobbyInfo && gameState !== 'TITLE' && (
        <ChatOverlay
          messages={chatMessages}
          currentLobbyName={lobbyInfo.lobbyName}
          currentPlayerId={lobbyInfo.playerId}
          onSendMessage={handleSendChatMessage}
          onSendFriendRequest={handleSendFriendRequest}
          chatNotice={chatNotice}
        />
      )}

      {/* TELEPORT REQUEST NOTIFICATION FOR PLAYER B */}
      {incomingTeleportRequest && gameState !== 'TITLE' && gameState !== 'DEAD' && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[70] w-[min(26rem,calc(100vw-2rem))] pointer-events-auto">
          <div
            role="alert"
            aria-live="assertive"
            aria-label="Teleport request"
            className="rounded-2xl border-2 border-cyan-400/80 bg-slate-950/95 p-4 text-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.85)] backdrop-blur-md"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/40 bg-cyan-950/80 text-cyan-300 shadow-inner">
                <MapPinned size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm leading-snug">
                  <span className="font-bold text-amber-300">{incomingTeleportRequest.playerName}</span> wants to teleport to you.
                </div>
                <div className="mt-1 font-mono text-xs font-semibold text-cyan-300">
                  Teleport request expires in {Math.max(0, Math.ceil((incomingTeleportRequest.expiresAt - teleportNow) / 1000))}s
                </div>
              </div>
            </div>
            <div className="mt-3.5 flex gap-2">
              <button
                type="button"
                onClick={() => handleRespondToTeleport(true)}
                aria-label="Accept teleport request"
                className="flex-1 min-h-[46px] rounded-xl border border-emerald-400/70 bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg transition active:scale-95 hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300 flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer"
              >
                <span className="font-mono opacity-80">[Y]</span>
                <span>Accept</span>
              </button>
              <button
                type="button"
                onClick={() => handleRespondToTeleport(false)}
                aria-label="Cancel teleport request"
                className="flex-1 min-h-[46px] rounded-xl border border-rose-400/60 bg-slate-800 px-4 py-2.5 text-xs sm:text-sm font-bold text-rose-200 shadow-lg transition active:scale-95 hover:bg-rose-900 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-300 flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer"
              >
                <span className="font-mono opacity-80">[C]</span>
                <span>Cancel</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING TELEPORT STATUS TOAST FOR PLAYER A / HUD */}
      {teleportNotice && gameState !== 'TITLE' && !incomingTeleportRequest && (
        <div role="status" className="pointer-events-none fixed top-5 left-1/2 -translate-x-1/2 z-[65] max-w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-cyan-400/70 bg-slate-950/90 px-4 py-2.5 text-center font-mono text-xs font-bold text-cyan-200 shadow-2xl backdrop-blur-md">
          {teleportNotice}
        </div>
      )}

      {/* TITLE / WORLD SELECTION */}
      {gameState === 'TITLE' && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-start sm:justify-center overflow-y-auto bg-transparent p-3 sm:p-6">
          <MenuSunsetCanvas />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,187,120,0.16),transparent_40%),linear-gradient(to_bottom,_rgba(7,12,24,0.12),_rgba(8,16,28,0.42))]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(to_top,_rgba(14,26,28,0.88),_rgba(14,26,28,0.12)_55%,transparent)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent_0%,rgba(18,31,37,0.22)_20%,rgba(17,32,35,0.78)_100%)]" />
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20 opacity-90 [clip-path:polygon(0_100%,0_52%,10%_58%,18%_48%,30%_61%,41%_50%,54%_56%,68%_44%,79%_52%,90%_46%,100%_58%,100%_100%)] bg-[#1c3436]" />
          <div className="sm:absolute sm:left-4 sm:top-4 z-40 w-full sm:max-w-[260px] max-w-xs mb-3 sm:mb-0 rounded-xl border border-[#ebd7ae]/50 bg-[#101a2c]/72 p-2.5 text-left shadow-[0_8px_20px_rgba(0,0,0,0.25)] backdrop-blur-md">
            <button type="button" onClick={() => setProfileDialogOpen(true)} className="flex w-full items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/35 px-2 py-1.5 text-left transition hover:bg-slate-800/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff0bd]">
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[#f2d08d]/60 bg-[#122030]/80 text-[#f5ce8a]">
                <User className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-pixel text-[10px] leading-tight text-[#fff0bd]">{playerName}</div>
                <div className="text-[9px] uppercase tracking-[0.12em] text-slate-300">{loginUi.guestBadgeLabel}</div>
              </div>
            </button>
            {loginUi.showExternalLoginWarning && (
              <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-[9px] font-mono leading-relaxed text-amber-100">
                ⚠ Log in to save your progress.<br />
                If you don’t log in, your progress will not be saved permanently.
              </div>
            )}

            {/* Friends Dropdown under the name area */}
            <FriendsDropdown
              isOpen={isFriendsOpen}
              onToggle={() => {
                const next = !isFriendsOpen;
                setIsFriendsOpen(next);
                if (next) fetchFriends();
              }}
              friends={friendsList}
              incomingRequests={incomingFriendRequests}
              outgoingRequests={outgoingFriendRequests}
              onAcceptRequest={handleAcceptFriendRequest}
              onRejectRequest={handleRejectFriendRequest}
              onJoinFriend={handleJoinFriendLobby}
              onRemoveFriend={handleRemoveFriend}
              onSendRequest={(target) => handleSendFriendRequest(target, target)}
              loading={friendsLoading}
              notice={friendsNotice}
            />
          </div>
          <div className={`relative my-auto w-full max-w-xl p-4 text-center sm:p-6 ${menuScreen === 'main' ? '' : 'overflow-hidden rounded-2xl border border-amber-300/30 bg-slate-950/75 shadow-2xl backdrop-blur-md'}`}>
            {menuScreen !== 'main' && (
              <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[#ffe1aa]/75 to-transparent" />
            )}
            <h1 className="mb-2 mt-4 font-pixel text-xl leading-relaxed text-[#fff0bd] drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] sm:text-3xl">2D Survival</h1>
            {menuScreen === 'main' ? <div className="mt-7 space-y-3">
              <button type="button" onClick={() => { setGameMode('survival'); if (!worldName.trim() || worldName === 'Creative World') setWorldName('Survival World'); setMenuScreen('single'); setMenuError(''); }} className="w-full rounded-md border-2 border-[#b7edb0] bg-gradient-to-b from-[#8ee58e] to-[#3bbd84] px-6 py-4 font-pixel text-xs font-bold tracking-wider text-[#102824] shadow-[0_5px_0_#175b4a,0_10px_20px_#060c18a8] transition duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_7px_0_#175b4a,0_14px_24px_#060c18b8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#fff0bd] active:translate-y-1 active:shadow-[0_2px_0_#175b4a] sm:text-sm">SINGLE PLAYER (SURVIVAL)</button>
              <button type="button" onClick={() => { setGameMode('creative'); if (!worldName.trim() || worldName === 'Survival World') setWorldName('Creative World'); setMenuScreen('single'); setMenuError(''); }} className="w-full rounded-md border-2 border-[#e9d5ff] bg-gradient-to-b from-[#c084fc] to-[#7c3aed] px-6 py-4 font-pixel text-xs font-bold tracking-wider text-white shadow-[0_5px_0_#581c87,0_10px_20px_#060c18a8] transition duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_7px_0_#581c87,0_14px_24px_#060c18b8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#fff0bd] active:translate-y-1 active:shadow-[0_2px_0_#581c87] sm:text-sm">CREATIVE MODE</button>
              <button type="button" onClick={() => { setMenuScreen('multiplayer'); setMenuError(''); }} className="w-full rounded-md border-2 border-[#ffe0a1] bg-gradient-to-b from-[#ffd27c] to-[#f28c50] px-6 py-4 font-pixel text-xs font-bold tracking-wider text-[#382329] shadow-[0_5px_0_#87443b,0_10px_20px_#060c18a8] transition duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_7px_0_#87443b,0_14px_24px_#060c18b8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#fff0bd] active:translate-y-1 active:shadow-[0_2px_0_#87443b] sm:text-sm">MULTIPLAYER</button>
              <button type="button" onClick={() => { setLeaderboardTab('daily'); setMenuScreen('leaderboard'); }} className="mt-1 self-start rounded-md border-2 border-[#ffe6a8] bg-gradient-to-b from-[#5b4938] to-[#342c2c] px-4 py-3 font-pixel text-[10px] font-bold tracking-widest text-[#fff0bd] shadow-[0_4px_0_#1d1718,0_8px_16px_#060c18a8] transition hover:-translate-y-0.5 hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff0bd] active:translate-y-1">🏆 LEADERBOARD</button>
              <div className="mt-5 rounded-xl border border-white/15 bg-black/25 px-4 py-3 text-left shadow-lg backdrop-blur-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label htmlFor="menu-music-volume" className="font-pixel text-[9px] uppercase tracking-wider text-[#fff0bd] drop-shadow-sm">MUSIC VOLUME</label>
                  <button
                    type="button"
                    onClick={() => {
                      const muted = !menuMusicMutedRef.current;
                      menuMusicMutedRef.current = muted;
                      setMenuMusicMuted(muted);
                      if (menuMusicAudioRef.current) menuMusicAudioRef.current.muted = muted;
                      saveMenuMusicSettings(menuMusicVolumeRef.current, muted);
                    }}
                    aria-label={menuMusicMuted ? 'Unmute menu music' : 'Mute menu music'}
                    title={menuMusicMuted ? 'Unmute menu music' : 'Mute menu music'}
                    className="rounded border border-slate-600/70 bg-slate-900/50 p-1.5 text-slate-100 transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff0bd]"
                  >
                    {menuMusicMuted ? <VolumeX className="h-4 w-4 text-red-300" /> : <Volume2 className="h-4 w-4 text-emerald-300" />}
                  </button>
                </div>
                <input
                  id="menu-music-volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  defaultValue={menuMusicVolumeRef.current}
                  onChange={(event) => {
                    const volume = Number(event.target.value);
                    menuMusicVolumeRef.current = volume;
                    if (menuMusicAudioRef.current) menuMusicAudioRef.current.volume = volume;
                    saveMenuMusicSettings(volume, menuMusicMutedRef.current);
                  }}
                  aria-label="Menu music volume"
                  className="h-2 w-full cursor-pointer accent-emerald-300"
                />
              </div>
            </div> : menuScreen === 'leaderboard' ? <section className="mt-6 space-y-4 text-left font-mono text-sm">
              <h2 className="text-center text-amber-300 font-pixel text-sm tracking-widest">LEADERBOARDS</h2>
              <div className="grid grid-cols-2 gap-2">
                {(['daily', 'forever'] as const).map((tab) => <button key={tab} type="button" onClick={() => setLeaderboardTab(tab)} className={`rounded-lg border-2 px-4 py-3 font-pixel text-xs tracking-widest ${leaderboardTab === tab ? 'border-amber-200 bg-amber-400 text-slate-950 shadow-[0_4px_0_#92400e]' : 'border-slate-600 bg-slate-900/80 text-slate-200'}`}>{tab.toUpperCase()}</button>)}
              </div>
              {leaderboardTab === 'daily' && leaderboardData?.dailyResetsAt && <p className="text-center text-xs text-amber-200">Resets in {(() => { const ms = Math.max(0, leaderboardData.dailyResetsAt - Date.now()); return `${Math.floor(ms / 3600000)}h ${Math.floor(ms / 60000) % 60}m`; })()}</p>}
              {leaderboardLoading && <p className="py-8 text-center text-slate-300">Loading rankings…</p>}
              {!leaderboardLoading && !leaderboardData && <p className="py-8 text-center text-rose-200">Leaderboard is unavailable. Try again shortly.</p>}
              {!leaderboardLoading && leaderboardData && <div className="grid max-h-[52vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                {([
                  ['animals', 'ANIMALS KILLED'], ['time', 'TIME PLAYED'], ['players', 'PLAYERS KILLED'],
                ] as const).map(([metric, title]) => {
                  const rows = leaderboardData[leaderboardTab]?.[metric] ?? [];
                  const own = leaderboardData[leaderboardTab === 'daily' ? 'yourDaily' : 'yourForever']?.[metric];
                  const playerId = window.localStorage.getItem('pixel_frontier_multiplayer_player_id');
                  return <div key={metric} className="rounded-xl border border-amber-200/25 bg-slate-950/75 p-3">
                    <h3 className="mb-2 text-center font-pixel text-[9px] leading-5 text-amber-200">{title}</h3>
                    <ol className="space-y-1">
                      {(leaderboardTab === 'daily' ? rows.slice(0, 10) : rows).map((row: any) => <li key={row.playerId} className={`flex justify-between gap-2 rounded px-1.5 py-1 text-xs ${row.playerId === playerId ? 'bg-emerald-400/15 text-emerald-100' : 'text-slate-200'}`}><span className="shrink-0 text-amber-300">#{row.rank}</span><span className="min-w-0 flex-1 truncate">{row.name}</span><span className="shrink-0 tabular-nums">{metric === 'time' ? `${Math.floor(row.score / 3600)}h ${Math.floor(row.score / 60) % 60}m` : row.score}</span></li>)}
                    </ol>
                    {own && own.rank > (leaderboardTab === 'daily' ? 10 : 100) && <p className="mt-2 border-t border-slate-700 pt-2 text-xs text-emerald-200">Your Rank: #{own.rank}</p>}
                  </div>;
                })}
              </div>}
              <button type="button" onClick={() => setMenuScreen('main')} className="w-full rounded-xl border border-slate-600 bg-slate-800 px-6 py-3 font-pixel text-xs tracking-wider text-slate-100">BACK</button>
            </section> : menuScreen === 'multiplayer' && lobbyInfo ? <section className="mt-6 space-y-4 text-left font-mono text-sm">
              <h2 className="text-center text-amber-300 font-pixel text-sm tracking-widest">2D SURVIVAL MULTIPLAYER</h2>
              <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-4 space-y-2 text-slate-200">
                <p>Lobby: <span className="text-emerald-300">{lobbyInfo.lobbyName}</span></p>
                <p>World Seed: <span className="text-emerald-300">{lobbyInfo.worldSeed}</span></p>
                <p>Player ID: <span className="text-emerald-300">{lobbyInfo.playerId}</span></p>
                <p>Players: <span className="text-emerald-300">{lobbyInfo.playerCount}</span></p>
                <p>Connection: <span className={lobbyStatus === 'connected' ? 'text-emerald-300' : 'text-red-300'}>{lobbyStatus === 'connected' ? 'CONNECTED' : 'DISCONNECTED'}</span></p>
              </div>
              <p className="text-xs text-slate-400">Synchronized multiplayer world, movement, wildlife, and PvP.</p>
              <button
                type="button"
                onClick={handleInviteFriends}
                className="w-full py-3 px-6 rounded-xl bg-cyan-900/70 text-cyan-100 border border-cyan-400/50 font-bold font-pixel text-xs tracking-wider hover:bg-cyan-800 transition cursor-pointer"
              >
                {inviteFeedback || 'INVITE FRIENDS / SHARE LINK'}
              </button>
              <button type="button" onClick={handleLeaveLobby} className="w-full py-3 px-6 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 font-bold font-pixel text-xs tracking-wider">LEAVE LOBBY</button>
            </section> : <form className="mt-6 space-y-4 text-left" onSubmit={(event) => { event.preventDefault(); if (menuScreen === 'single') handleStartGame(); else handleJoinLobby(); }}>
              <div className="text-center text-amber-300 font-pixel text-sm tracking-widest">{menuScreen === 'single' ? (gameMode === 'creative' ? '✨ CREATIVE WORLD' : '⚔️ SURVIVAL WORLD') : 'MULTIPLAYER'}</div>
              {menuScreen === 'single' ? (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setGameMode('survival');
                        if (!worldName.trim() || worldName === 'Creative World') setWorldName('Survival World');
                      }}
                      className={`rounded-xl border py-2.5 px-3 font-pixel text-[10px] uppercase tracking-wider transition ${
                        gameMode === 'survival'
                          ? 'border-emerald-300 bg-emerald-700/80 text-white shadow-md'
                          : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ⚔️ Survival
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGameMode('creative');
                        if (!worldName.trim() || worldName === 'Survival World') setWorldName('Creative World');
                      }}
                      className={`rounded-xl border py-2.5 px-3 font-pixel text-[10px] uppercase tracking-wider transition ${
                        gameMode === 'creative'
                          ? 'border-purple-300 bg-purple-700/80 text-white shadow-md'
                          : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ✨ Creative
                    </button>
                  </div>
                  <input autoFocus value={worldName} onChange={(event) => { setWorldName(event.target.value); setMenuError(''); setLobbyError(''); }} placeholder="Enter a world name" maxLength={64} className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white font-mono outline-none focus:border-emerald-400" />
                  {menuError && <p role="alert" className="text-sm text-red-300 font-mono">{menuError}</p>}
                </>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      autoFocus
                      value={multiplayerLobbyCode}
                      onChange={(event) => {
                        const next = sanitizeLobbyCode(event.target.value);
                        setMultiplayerLobbyCode(next);
                        setLobbyError('');
                      }}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="123456"
                      maxLength={LOBBY_CODE_MAX_LENGTH}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white font-mono text-center text-xl tracking-[0.35em] outline-none focus:border-emerald-400"
                    />
                    <button type="button" onClick={handleQuickJoin} disabled={lobbyStatus === 'connecting'} className="rounded-xl border border-sky-400/60 bg-sky-500/15 px-3 py-3 font-pixel text-[9px] uppercase tracking-[0.14em] text-sky-100 disabled:opacity-60">Quick Join</button>
                  </div>
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-400">
                    <span>Recent Servers</span>
                    {recentLobbies.length > 0 && <span>{recentLobbies.length} saved</span>}
                  </div>
                  <div className="flex min-h-[52px] flex-wrap gap-2">
                    {recentLobbies.length > 0 ? recentLobbies.map((code) => (
                      <button key={code} type="button" onClick={() => handleJoinLobby(code)} className="rounded-lg border border-slate-700 bg-slate-900/80 px-2.5 py-1.5 font-mono text-xs text-slate-100 hover:border-emerald-400 hover:text-emerald-200">{code}</button>
                    )) : <p className="text-xs text-slate-500 font-mono">No recent servers yet.</p>}
                  </div>
                  {lobbyNotice && <div role="status" className="rounded-xl border border-cyan-400/50 bg-cyan-950/70 p-3 text-center text-xs font-mono text-cyan-200 animate-pulse">{lobbyNotice}</div>}
                  {lobbyError && <p role="alert" className="text-sm text-red-300 font-mono">{lobbyError}</p>}
                  <p className="text-xs text-slate-400 font-mono">Enter a numeric lobby code or quick join a live lobby.</p>
                </>
              )}
              <button
                type="submit"
                disabled={menuScreen === 'multiplayer' && lobbyStatus === 'connecting'}
                className={`w-full py-4 px-6 rounded-xl font-bold font-pixel text-sm tracking-wider disabled:opacity-60 transition duration-200 hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0.5 ${
                  menuScreen === 'single' && gameMode === 'creative'
                    ? 'border-2 border-purple-300 bg-gradient-to-r from-purple-500 via-fuchsia-500 to-amber-400 text-white shadow-[0_5px_0_#581c87,0_10px_20px_rgba(168,85,247,0.4)]'
                    : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-[0_5px_0_#0f766e]'
                }`}
              >
                {menuScreen === 'single'
                  ? gameMode === 'creative'
                    ? '✨ PLAY CREATIVE WORLD'
                    : '⚔️ PLAY SURVIVAL'
                  : lobbyStatus === 'connecting'
                  ? 'CONNECTING…'
                  : 'JOIN'}
              </button>
              <button type="button" onClick={() => { lobbySocketRef.current?.close(); lobbySocketRef.current = null; setLobbyStatus('idle'); setMenuScreen('main'); setMenuError(''); setLobbyError(''); }} className="w-full py-3 px-6 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 font-bold font-pixel text-xs tracking-wider">BACK</button>
            </form>}
          </div>
          {profileDialogOpen && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-[#e8bd91]/60 bg-[#111b2b]/95 p-5 shadow-[0_14px_40px_rgba(0,0,0,0.6)]">
                <div className="mb-4 flex items-center justify-between border-b border-slate-700/60 pb-3">
                  <div>
                    <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-amber-300">Pixel Frontier</p>
                    <h2 className="mt-1 font-pixel text-xl text-[#fff0bd]">
                      {accountUser ? 'PLAYER PROFILE' : 'GUEST PROFILE'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileDialogOpen(false);
                      setShowPasswordChange(false);
                      setPasswordChangeStatus('');
                    }}
                    className="rounded-full border border-slate-600 bg-slate-900/60 p-2 text-slate-200 hover:bg-slate-800"
                    aria-label="Close profile dialog"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {accountUser ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs font-mono text-emerald-300">
                      <Shield className="h-4 w-4 text-emerald-400 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-bold text-emerald-200">VERIFIED CLOUD ACCOUNT</span>
                        <p className="truncate text-[10px] text-emerald-400/80">@{accountUser.username || accountUser.displayName}</p>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-300">Display Name</label>
                      <input
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        maxLength={16}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-base text-white outline-none ring-0 focus:border-emerald-400"
                      />
                      {renameStatus && <p role="alert" className="mt-1 text-xs text-red-300 font-mono">{renameStatus}</p>}
                    </div>

                    <div className="flex items-center justify-between rounded-xl border border-cyan-800/60 bg-cyan-950/30 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-cyan-400 animate-pulse" />
                        <div>
                          <span className="text-[11px] font-bold font-mono text-cyan-200">
                            {cloudSyncStatus === 'saving' ? 'Syncing to cloud…' : cloudSyncStatus === 'saved' ? 'Saved to cloud!' : 'Cloud Synced'}
                          </span>
                          <p className="text-[9px] font-mono text-cyan-400/70">
                            {cloudLastSavedAt ? `Last saved ${new Date(cloudLastSavedAt).toLocaleTimeString()}` : 'Active session'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={saveAccountCloudProgress}
                        disabled={cloudSyncStatus === 'saving'}
                        className="rounded-lg border border-cyan-500/40 bg-cyan-700/60 px-2.5 py-1 font-pixel text-[9px] tracking-wider text-cyan-100 hover:bg-cyan-600/80 active:scale-95 transition-all"
                      >
                        SYNC NOW
                      </button>
                    </div>

                    {showPasswordChange ? (
                      <form onSubmit={handleChangePassword} className="space-y-2 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
                        <p className="text-[10px] font-pixel uppercase tracking-wider text-amber-300">Change Password</p>
                        <input
                          type="password"
                          placeholder="Current password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                        />
                        <input
                          type="password"
                          placeholder="New password (min 6 chars)"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-amber-400"
                        />
                        {passwordChangeStatus && (
                          <p className={`text-[10px] font-mono ${passwordChangeStatus.includes('✅') ? 'text-emerald-400' : 'text-red-300'}`}>
                            {passwordChangeStatus}
                          </p>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button
                            type="submit"
                            disabled={passwordChangeBusy}
                            className="flex-1 rounded-lg border border-amber-400/50 bg-amber-600/80 py-1.5 font-pixel text-[9px] text-slate-950 hover:bg-amber-500 disabled:opacity-50"
                          >
                            {passwordChangeBusy ? 'Updating…' : 'Update Password'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowPasswordChange(false); setPasswordChangeStatus(''); }}
                            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-pixel text-[9px] text-slate-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowPasswordChange(true)}
                        className="w-full rounded-xl border border-slate-700/80 bg-slate-900/40 py-2 font-mono text-[10px] uppercase tracking-wider text-slate-300 hover:bg-slate-800 hover:text-white"
                      >
                        🔑 Change Password
                      </button>
                    )}

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleSaveProfileName}
                        className="rounded-xl border border-[#a9efb1] bg-gradient-to-b from-[#8ee58e] to-[#3bbd84] px-4 py-2.5 font-pixel text-[10px] uppercase tracking-[0.15em] text-[#102824] hover:brightness-105 active:scale-95 transition-all"
                      >
                        Save Name
                      </button>
                      <button
                        type="button"
                        onClick={handleLogOut}
                        className="rounded-xl border border-rose-800/80 bg-rose-950/60 px-4 py-2.5 font-pixel text-[10px] uppercase tracking-[0.15em] text-rose-200 hover:bg-rose-900/80 active:scale-95 transition-all"
                      >
                        <span className="inline-flex items-center gap-1.5 justify-center w-full">
                          <LogOut className="h-3.5 w-3.5" /> Log Out
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs font-mono text-amber-200/90">
                      💡 <strong>Playing as Guest:</strong> Your progress is stored locally in this browser. Log in or create an account to save progress permanently across devices!
                    </div>

                    <div>
                      <label className="mb-1 block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-200">Display Name</label>
                      <input
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        maxLength={16}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-base text-white outline-none ring-0 focus:border-emerald-400"
                      />
                      {renameStatus && <p role="alert" className="mt-1 text-xs text-red-300 font-mono">{renameStatus}</p>}
                    </div>

                    <div className={loginUi.profileGridClass}>
                      <button
                        type="button"
                        onClick={handleSaveProfileName}
                        className="rounded-xl border border-[#a9efb1] bg-gradient-to-b from-[#8ee58e] to-[#3bbd84] px-4 py-3 font-pixel text-[10px] uppercase tracking-[0.15em] text-[#102824] hover:brightness-105 active:scale-95"
                      >
                        Save
                      </button>
                      {loginUi.showExternalLoginOptions && (
                        <button
                          type="button"
                          onClick={() => {
                            setProfileDialogOpen(false);
                            setAuthMode('login');
                            setAuthDialogOpen(true);
                          }}
                          className="rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 font-pixel text-[10px] uppercase tracking-[0.15em] text-slate-100 hover:bg-slate-700 active:scale-95"
                        >
                          <span className="inline-flex items-center gap-1 justify-center w-full">
                            <LogIn className="h-3.5 w-3.5" /> Log In
                          </span>
                        </button>
                      )}
                    </div>

                    {loginUi.showCreateAccountButton && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfileDialogOpen(false);
                          setAuthMode('signup');
                          setAuthDialogOpen(true);
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#ffe0a1] bg-[#2d1a1b]/80 px-4 py-3 font-pixel text-[10px] uppercase tracking-[0.15em] text-[#f7d38d] hover:bg-[#3d2425] active:scale-95 transition-all"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Create Account
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {loginUi.showEmailLoginForm && authDialogOpen && (
            <div className="absolute inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl border border-[#e8bd91]/60 bg-[#111b2b]/95 p-6 shadow-[0_16px_48px_rgba(0,0,0,0.6)]">
                <div className="mb-4 flex items-center justify-between border-b border-slate-700/60 pb-3">
                  <div>
                    <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-amber-300">Pixel Frontier</p>
                    <h2 className="mt-1 font-pixel text-2xl text-[#fff0bd]">
                      {authMode === 'login' ? 'ACCOUNT LOGIN' : 'CREATE ACCOUNT'}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAuthDialogOpen(false)}
                    className="rounded-full border border-slate-600 bg-slate-900/60 p-2 text-slate-200 hover:bg-slate-800"
                    aria-label="Close auth dialog"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Tabs */}
                <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-900/80 p-1 border border-slate-800">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('login'); setAuthError(''); }}
                    className={`py-2 rounded-lg font-pixel text-[10px] uppercase tracking-wider transition-all ${
                      authMode === 'login'
                        ? 'bg-slate-700 text-amber-200 shadow-md border border-amber-300/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Log In
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthMode('signup'); setAuthError(''); }}
                    className={`py-2 rounded-lg font-pixel text-[10px] uppercase tracking-wider transition-all ${
                      authMode === 'signup'
                        ? 'bg-slate-700 text-amber-200 shadow-md border border-amber-300/40'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Create Account
                  </button>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-3.5">
                  <div>
                    <label htmlFor="auth-username" className="mb-1 block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-200">
                      {authMode === 'signup' ? 'Username (3-20 chars)' : 'Username or Email'}
                    </label>
                    <input
                      id="auth-username"
                      type="text"
                      value={authUsername}
                      onChange={(event) => setAuthUsername(event.target.value)}
                      placeholder={authMode === 'signup' ? 'e.g. StarPioneer_42' : 'Enter username or email'}
                      autoComplete="username"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-base text-white outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label htmlFor="auth-password" className="mb-1 block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-200">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="auth-password"
                        type={showAuthPassword ? 'text' : 'password'}
                        value={authPassword}
                        onChange={(event) => setAuthPassword(event.target.value)}
                        placeholder={authMode === 'signup' ? 'Minimum 6 characters' : 'Enter password'}
                        autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 pr-11 text-base text-white outline-none focus:border-emerald-400"
                      />
                      <button type="button" onClick={() => setShowAuthPassword((visible) => !visible)} aria-label={showAuthPassword ? 'Hide password' : 'Show password'} aria-pressed={showAuthPassword} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-emerald-300">
                        {showAuthPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  {authMode === 'signup' && (
                    <div>
                      <label htmlFor="auth-confirm" className="mb-1 block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-200">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <input
                          id="auth-confirm"
                          type={showAuthConfirmPassword ? 'text' : 'password'}
                          value={authConfirmPassword}
                          onChange={(event) => setAuthConfirmPassword(event.target.value)}
                          placeholder="Re-enter password"
                          autoComplete="new-password"
                          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 pr-11 text-base text-white outline-none focus:border-emerald-400"
                        />
                        <button type="button" onClick={() => setShowAuthConfirmPassword((visible) => !visible)} aria-label={showAuthConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showAuthConfirmPassword} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-emerald-300">
                          {showAuthConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {authError && (
                    <p role="alert" className="rounded-lg bg-red-950/60 border border-red-500/40 p-2.5 text-xs text-red-300 font-mono">
                      {authError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={authBusy}
                    className="w-full rounded-xl border border-[#a9efb1] bg-gradient-to-b from-[#8ee58e] to-[#3bbd84] py-3.5 font-pixel text-xs uppercase tracking-[0.2em] text-[#102824] shadow-md hover:brightness-105 active:scale-98 disabled:opacity-70 transition-all cursor-pointer font-bold"
                  >
                    {authBusy ? 'Please wait…' : authMode === 'login' ? '⚔️ Log In' : '✨ Create Account'}
                  </button>

                  <div className="flex items-center gap-3 pt-1" aria-hidden="true">
                    <span className="h-px flex-1 bg-slate-700" />
                    <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-500">or</span>
                    <span className="h-px flex-1 bg-slate-700" />
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={authBusy}
                    className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-700 bg-slate-900/90 px-4 py-2.5 font-sans text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-70 transition-colors"
                  >
                    <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full bg-white font-bold text-xs text-[#4285f4]">G</span>
                    Continue with Google
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => setAuthDialogOpen(false)}
                      className="text-xs font-mono text-slate-400 hover:text-slate-200 underline underline-offset-4"
                    >
                      Play as Guest without signing in
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DEATH SCREEN OVERLAY */}
      {gameState === 'DEAD' && (
        <div className="absolute inset-0 bg-red-950/85 backdrop-blur-md flex items-center justify-center p-4 z-40">
          <div className="max-w-md w-full bg-slate-900/95 border-2 border-red-600/80 rounded-2xl p-6 sm:p-8 shadow-2xl text-center relative overflow-hidden">
            <div className="text-4xl mb-3 select-none">💀</div>
            <h2 className="font-pixel text-2xl sm:text-3xl text-red-500 tracking-wider mb-2 drop-shadow-md">
              YOU DIED
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 font-mono mb-6">
              You fell on the frontier. Your inventory and world remain intact.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleRespawn}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold font-pixel text-xs tracking-wider transition-all shadow-lg active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                RESPAWN
              </button>

              <button
                type="button"
                onClick={handleGoToMainMenu}
                className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold font-pixel text-xs tracking-wider transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAUSE OVERLAY */}
      {gameState === 'PAUSED' && (
        <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 z-30">
          <div className="max-w-md w-full bg-slate-900/95 border-2 border-slate-700 rounded-2xl p-6 shadow-2xl text-center">
            <h2 className="font-pixel text-xl text-amber-400 mb-2">GAME PAUSED</h2>
            <p className="text-xs text-slate-400 font-mono mb-6">World modifications saved.</p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleTogglePause}
                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold font-pixel text-xs tracking-wider transition-all shadow-lg active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                RESUME
              </button>

              <button
                type="button"
                onClick={handleRestart}
                className="w-full py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-600 font-bold font-pixel text-xs tracking-wider transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                GENERATE NEW SEED (R)
              </button>

              <button
                type="button"
                onClick={handleToggleMute}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700 font-mono text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                {isMuted ? 'UNMUTE AUDIO' : 'MUTE AUDIO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BIOME TELEPORTER */}
      {showBiomeMenu && gameState !== 'TITLE' && gameState !== 'DEAD' && (
        <div className="fixed right-3 top-16 z-50 w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-cyan-200/35 bg-slate-950/70 text-slate-100 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-white/15 px-3 py-2">
            <div className="flex items-center gap-2 font-pixel text-[10px] text-cyan-200"><MapPinned size={14} /> TELEPORTER</div>
            <button type="button" onClick={() => setBiomeMenuOpen(false)} aria-label="Close teleport menu" className="rounded-md p-1 text-slate-300 hover:bg-white/10 hover:text-white"><X size={15} /></button>
          </div>
          <div className="max-h-[72vh] space-y-1 overflow-y-auto p-2">
            <section className="overflow-hidden rounded-lg border border-white/10 bg-slate-900/30">
              <button type="button" onClick={() => setOpenTeleportSection(openTeleportSection === 'biomes' ? null : 'biomes')} aria-expanded={openTeleportSection === 'biomes'} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-cyan-100 hover:bg-white/5">
                <span>BIOME <span className="ml-1 font-mono font-normal text-slate-400">· {stats.biomeName}</span></span><ChevronDown size={14} className={openTeleportSection === 'biomes' ? 'rotate-180' : ''} />
              </button>
              {openTeleportSection === 'biomes' && <div className="max-h-64 space-y-3 overflow-y-auto border-t border-white/10 p-2">
                <label htmlFor="biome-teleport-select" className="block px-1 text-[10px] font-bold uppercase tracking-wider text-cyan-200">Choose a biome</label>
                <div className="relative">
                  <select id="biome-teleport-select" aria-label="Choose a biome to teleport to" disabled={biomeTeleportFeedback?.kind === 'loading'} value={BIOME_LIST.find((biome) => biome.name === stats.biomeName)?.id ?? ''} onChange={(event) => { if (event.target.value) handleBiomeTeleport(event.target.value as BiomeType); }} className="w-full appearance-none rounded-md border border-cyan-200/25 bg-slate-950/80 px-3 py-2.5 pr-10 text-xs text-white outline-none focus:border-cyan-300/70 disabled:cursor-wait disabled:opacity-60">
                    <option value="" disabled>Select a biome</option>
                    {BIOME_CATEGORIES.map((category) => <optgroup key={category} label={category}>
                      {BIOME_LIST.filter((biome) => biome.category === category).map((biome) => <option key={biome.id} value={biome.id}>{biome.name}</option>)}
                    </optgroup>)}
                  </select>
                  <ChevronDown aria-hidden="true" size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cyan-200" />
                </div>
              </div>}
            </section>

            <section className="overflow-hidden rounded-lg border border-white/10 bg-slate-900/30">
              <button type="button" onClick={() => setOpenTeleportSection(openTeleportSection === 'homes' ? null : 'homes')} aria-expanded={openTeleportSection === 'homes'} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-amber-100 hover:bg-white/5">
                <span><HomeIcon size={13} className="mr-1 inline" /> HOMES <span className="ml-1 font-mono font-normal text-slate-400">· {namedHomes.length}/3</span></span><ChevronDown size={14} className={openTeleportSection === 'homes' ? 'rotate-180' : ''} />
              </button>
              {openTeleportSection === 'homes' && <div className="space-y-2 border-t border-white/10 p-2">
                {namedHomes.length === 0 && <p className="px-1 text-xs text-slate-400">No named homes saved in this world.</p>}
                {namedHomes.map((home) => <div key={home.id} className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-slate-950/35 px-2 py-1.5">
                  <span className="min-w-0 truncate text-xs font-semibold text-amber-100">{home.name}</span>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => handleTeleportToHome(home)} className="rounded-md border border-emerald-200/20 bg-emerald-800/60 px-2 py-1 text-[9px] font-bold hover:bg-emerald-700/80">TELEPORT</button>
                    <button type="button" onClick={() => { deletingHomeRef.current = false; setHomePendingDeletion(home); }} aria-label={`Delete home ${home.name}`} className="rounded-md border border-rose-200/20 bg-rose-900/55 px-2 py-1 text-[9px] font-bold text-rose-100 hover:bg-rose-800/80">DELETE</button>
                  </div>
                </div>)}
                <form onSubmit={(event) => { event.preventDefault(); handleSetHome(); }} className="flex gap-2">
                  <input value={newHomeName} onChange={(event) => setNewHomeName(event.target.value)} maxLength={24} placeholder="Name this place" aria-label="Name this home" className="min-w-0 flex-1 rounded-md border border-white/15 bg-slate-950/55 px-2.5 py-2 text-xs text-white outline-none placeholder:text-slate-500 focus:border-amber-300/60" />
                  <button type="submit" disabled={!newHomeName.trim() || (namedHomes.length >= 3 && !namedHomes.some((home) => home.name.toLowerCase() === newHomeName.trim().toLowerCase()))} className="shrink-0 rounded-md border border-amber-200/25 bg-amber-700/65 px-3 py-2 text-[9px] font-bold text-amber-50 hover:bg-amber-600/80 disabled:cursor-not-allowed disabled:opacity-40">SET HOME</button>
                </form>
                {homeCooldownNotice && <p role="status" className="px-1 text-[10px] text-amber-200">{homeCooldownNotice}</p>}
              </div>}
            </section>

            <section className="overflow-hidden rounded-lg border border-white/10 bg-slate-900/30">
              <button type="button" onClick={() => setOpenTeleportSection(openTeleportSection === 'players' ? null : 'players')} aria-expanded={openTeleportSection === 'players'} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-bold text-emerald-100 hover:bg-white/5">
                <span>PLAYER TELEPORTER <span className="ml-1 font-mono font-normal text-slate-400">· {lobbyPlayers.length} online</span></span><ChevronDown size={14} className={openTeleportSection === 'players' ? 'rotate-180' : ''} />
              </button>
              {openTeleportSection === 'players' && <div className="space-y-2 border-t border-white/10 p-2">
                {!lobbyInfo && <p className="px-1 text-xs text-slate-400">Join a multiplayer lobby to teleport to players.</p>}
                {lobbyInfo && <>
                  <select value={selectedTeleportPlayer} onChange={(event) => setSelectedTeleportPlayer(event.target.value)} aria-label="Choose player" className="w-full rounded-md border border-white/15 bg-slate-950/65 px-2.5 py-2 text-xs text-white outline-none focus:border-emerald-300/60">
                    <option value="">Choose a player</option>
                    {lobbyPlayers.map((player) => <option key={player.playerId} value={player.playerId}>{player.displayName || player.playerId}</option>)}
                  </select>
                  <button type="button" onClick={handleRequestPlayerTeleport} disabled={!selectedTeleportPlayer || !!outgoingTeleportRequest} className="w-full rounded-md border border-emerald-200/25 bg-emerald-800/65 px-3 py-2 text-xs font-bold text-emerald-50 hover:bg-emerald-700/80 disabled:cursor-not-allowed disabled:opacity-40">{outgoingTeleportRequest ? `REQUEST SENT · ${Math.max(0, Math.ceil((outgoingTeleportRequest.expiresAt - teleportNow) / 1000))}s` : 'REQUEST TELEPORT'}</button>
                </>}
                {teleportNotice && <p role="status" className="px-1 text-[10px] text-cyan-200">{teleportNotice}</p>}
              </div>}
            </section>
            {stats.teleportStatus && <p role="status" className="px-1 pt-1 font-mono text-[10px] text-cyan-200">{stats.teleportStatus}</p>}
          </div>
        </div>
      )}

      {homePendingDeletion && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-home-title">
          <div className="w-full max-w-sm rounded-xl border border-rose-200/30 bg-slate-950 p-5 text-slate-100 shadow-2xl">
            <h2 id="delete-home-title" className="mb-4 text-sm font-bold text-amber-100">Are you sure you want to delete home '{homePendingDeletion.name}'?</h2>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { deletingHomeRef.current = false; setHomePendingDeletion(null); }} className="rounded-md border border-white/20 bg-slate-800 px-4 py-2 text-xs font-bold hover:bg-slate-700">Cancel</button>
              <button type="button" disabled={deletingHomeRef.current} onClick={handleDeleteHome} className="rounded-md border border-rose-200/30 bg-rose-800 px-4 py-2 text-xs font-bold text-rose-50 hover:bg-rose-700 disabled:cursor-wait disabled:opacity-50">Delete Home</button>
            </div>
          </div>
        </div>
      )}

      {biomeTeleportFeedback && gameState !== 'TITLE' && (
        <div role="status" aria-live="polite" className={`fixed left-1/2 top-16 z-[60] flex w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-center text-xs font-bold shadow-2xl backdrop-blur-md sm:text-sm ${biomeTeleportFeedback.kind === 'loading' ? 'border-cyan-200/35 bg-slate-950/90 text-cyan-100' : 'border-rose-200/35 bg-slate-950/90 text-rose-100'}`}>
          {biomeTeleportFeedback.kind === 'loading' && <LoaderCircle size={16} className="shrink-0 animate-spin" aria-hidden="true" />}
          <span>{biomeTeleportFeedback.message}</span>
        </div>
      )}

      {/* HELP / INSTRUCTIONS MODAL */}
      {showHelp && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-40">
          <div className="max-w-lg w-full bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl relative">
            <h3 className="font-pixel text-base text-amber-400 mb-3 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-amber-400" /> 2D SURVIVAL GUIDE
            </h3>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed font-sans mb-6">
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                <div className="font-bold text-amber-400 mb-1">📦 Physical Item Drops & Pickup</div>
                Mining a block spawns a physical mini-block in the world that tumbles with gravity. Walk within 3.5 blocks and it magnetically glides toward you for automatic pickup into your hotbar!
              </div>

              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                <div className="font-bold text-cyan-400 mb-1">🔍 Camera Zoom (50% – 200%)</div>
                Click the <strong>[ − ] [ 100% ] [ + ]</strong> buttons in the top right or use keys <strong>+ / - / 0</strong>. The camera smoothly tracks the player and mouse targeting scales accurately at all zoom levels.
              </div>

              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                <div className="font-bold text-emerald-400 mb-1">🧱 Mining & Placing</div>
                Hold Left Click to mine blocks with visual crack stages. Right Click to place the active hotbar block within reach.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs font-semibold transition-colors cursor-pointer"
            >
              GOT IT, CLOSE
            </button>
          </div>
        </div>
      )}

      {/* FLOATING DRAG PREVIEW */}
      {dragPreview && (
        <div
          ref={dragPreviewElRef}
          className="fixed left-0 top-0 pointer-events-none z-[9999] will-change-transform flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border-2 border-amber-300 bg-slate-900/95 text-white shadow-2xl shadow-black/80 font-pixel text-xs select-none"
          style={{
            transform: `translate3d(${dragPreviewPosRef.current.x}px, ${dragPreviewPosRef.current.y}px, 0) translate(-50%, -50%)`,
          }}
        >
          {dragPreview.toolKind && dragPreview.toolTier ? (
            <ToolIcon kind={dragPreview.toolKind} tier={dragPreview.toolTier} />
          ) : isMeatItem(dragPreview.item) ? (
            <MeatIcon type={dragPreview.item} />
          ) : (
            <BlockIcon item={dragPreview.item} fallbackColor={dragPreview.color} className="h-4 w-4 rounded-xs shadow-md border" />
          )}
          <span className="text-amber-200 font-bold">{dragPreview.name}</span>
          <span className="text-emerald-400 font-mono text-xs font-bold">×{dragPreview.count}</span>
        </div>
      )}
       <CombatDebugPanel />
    </div>
  );
}
