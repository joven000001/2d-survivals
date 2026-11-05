import { pbkdf2Sync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response } from 'express';
import { getPersistenceDataDir, safeWriteJson } from './persistence';
import type { ItemType } from '../src/game/blocks';
import type { SerializedInventory } from '../src/game/inventory';

export const AUTH_DATA_DIR = path.join(getPersistenceDataDir(), 'auth');
export const CLOUD_SAVES_DIR = path.join(getPersistenceDataDir(), 'cloud_saves');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const RATE_LIMIT_WINDOW_MS = 1000 * 60 * 15; // 15 mins
const MAX_FAILED_ATTEMPTS = 5;

export interface RobloxAccount {
  id: string;
  username: string; // unique, 3-20 chars, alphanumeric + underscores
  displayName: string;
  email?: string;
  passwordHash: string;
  passwordSalt: string;
  googleSub?: string;
  authProvider: 'roblox' | 'email' | 'google';
  createdAt: number;
  lastLoginAt: number;
  version: number;
  stats: {
    totalPlaytimeSec: number;
    blocksPlaced: number;
    blocksMined: number;
    kills: number;
    deaths: number;
  };
}

export interface PlayerCloudSave {
  accountId: string;
  username: string;
  saveVersion: number;
  lastSavedAt: number;
  playerState: {
    x: number;
    y: number;
    spawnX?: number;
    spawnY?: number;
    health: number;
    maxHealth: number;
    food: number;
    maxFood: number;
    stamina: number;
    maxStamina: number;
    isAlive: boolean;
    seed?: number;
    facingRight?: boolean;
  };
  inventory: SerializedInventory;
  hotbar: {
    slots: Array<{ type: ItemType; count: number; toolTier?: string; toolKind?: string } | null>;
    activeSlot: number;
  };
  namedHomes: Array<{
    id: string;
    name: string;
    x: number;
    y: number;
    seed: number;
  }>;
  stats: {
    totalPlaytimeSec: number;
    blocksPlaced: number;
    blocksMined: number;
    kills: number;
    deaths: number;
  };
  worldModifications?: Record<string, number>;
}

export interface SessionData {
  accountId: string;
  expiresAt: number;
}

// In-memory caches backed by disk persistence
const accounts = new Map<string, RobloxAccount>();
const sessions = new Map<string, SessionData>();
const failedLoginAttempts = new Map<string, { count: number; firstAttemptAt: number; lockedUntil?: number }>();

function ensureDirectories(): void {
  fs.mkdirSync(AUTH_DATA_DIR, { recursive: true });
  fs.mkdirSync(CLOUD_SAVES_DIR, { recursive: true });
}

export function sanitizeUsername(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
}

export function validateUsername(raw: unknown): { valid: boolean; username: string; error?: string } {
  if (typeof raw !== 'string') {
    return { valid: false, username: '', error: 'Username must be a string.' };
  }
  const trimmed = raw.trim();
  if (trimmed.length < 3) {
    return { valid: false, username: '', error: 'Username must be at least 3 characters long.' };
  }
  if (trimmed.length > 20) {
    return { valid: false, username: '', error: 'Username cannot exceed 20 characters.' };
  }
  if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
    return { valid: false, username: '', error: 'Username can only contain letters, numbers, and underscores.' };
  }
  return { valid: true, username: trimmed };
}

export function validatePassword(raw: unknown): { valid: boolean; error?: string } {
  if (typeof raw !== 'string') {
    return { valid: false, error: 'Password must be provided.' };
  }
  if (raw.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters long.' };
  }
  if (raw.length > 128) {
    return { valid: false, error: 'Password cannot exceed 128 characters.' };
  }
  return { valid: true };
}

export function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 120_000, 64, 'sha256').toString('hex');
}

export function accountFilePath(accountId: string): string {
  return path.join(AUTH_DATA_DIR, `${accountId}.json`);
}

export function cloudSaveFilePath(accountId: string): string {
  return path.join(CLOUD_SAVES_DIR, `${accountId}.json`);
}

export function loadAllAccountsFromDisk(): void {
  ensureDirectories();
  if (!fs.existsSync(AUTH_DATA_DIR)) return;
  for (const entry of fs.readdirSync(AUTH_DATA_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(path.join(AUTH_DATA_DIR, entry.name), 'utf8');
      const parsed = JSON.parse(raw) as Partial<RobloxAccount>;
      if (!parsed || typeof parsed.id !== 'string') continue;

      const username = parsed.username || parsed.displayName || `player_${parsed.id.slice(-6)}`;
      const account: RobloxAccount = {
        id: parsed.id,
        username,
        displayName: parsed.displayName || username,
        email: parsed.email,
        passwordHash: parsed.passwordHash || '',
        passwordSalt: parsed.passwordSalt || randomBytes(16).toString('hex'),
        googleSub: parsed.googleSub,
        authProvider: parsed.authProvider || (parsed.googleSub ? 'google' : parsed.email ? 'email' : 'roblox'),
        createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
        lastLoginAt: typeof parsed.lastLoginAt === 'number' ? parsed.lastLoginAt : Date.now(),
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        stats: {
          totalPlaytimeSec: parsed.stats?.totalPlaytimeSec || 0,
          blocksPlaced: parsed.stats?.blocksPlaced || 0,
          blocksMined: parsed.stats?.blocksMined || 0,
          kills: parsed.stats?.kills || 0,
          deaths: parsed.stats?.deaths || 0,
        },
      };
      accounts.set(account.id, account);
    } catch {
      // Ignore corrupt account files
    }
  }
}

export function saveAccountToDisk(account: RobloxAccount): void {
  ensureDirectories();
  safeWriteJson(accountFilePath(account.id), account);
}

export function getAccountById(id: string): RobloxAccount | null {
  return accounts.get(id) || null;
}

export function getAccountByUsername(username: string): RobloxAccount | null {
  const normalized = username.trim().toLowerCase();
  for (const acc of accounts.values()) {
    if (acc.username.toLowerCase() === normalized) {
      return acc;
    }
  }
  return null;
}

export function getAccountByEmail(email: string): RobloxAccount | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  for (const acc of accounts.values()) {
    if (acc.email?.toLowerCase() === normalized) {
      return acc;
    }
  }
  return null;
}

export function getAccountByIdentifier(identifier: string): RobloxAccount | null {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    return getAccountByEmail(trimmed) || getAccountByUsername(trimmed);
  }
  return getAccountByUsername(trimmed) || getAccountByEmail(trimmed);
}

export function isUsernameAvailable(username: string, excludeAccountId?: string): boolean {
  const normalized = username.trim().toLowerCase();
  for (const acc of accounts.values()) {
    if (excludeAccountId && acc.id === excludeAccountId) continue;
    if (acc.username.toLowerCase() === normalized) {
      return false;
    }
  }
  return true;
}

export function createSessionToken(account: RobloxAccount): string {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, {
    accountId: account.id,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function getAccountForToken(token: string | null | undefined): RobloxAccount | null {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  const account = accounts.get(session.accountId);
  if (!account) {
    sessions.delete(token);
    return null;
  }
  account.lastLoginAt = Date.now();
  return account;
}

export function revokeSessionToken(token: string | null | undefined): void {
  if (token) sessions.delete(token);
}

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const attempt = failedLoginAttempts.get(key);
  if (!attempt) return { allowed: true };

  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    const retryAfterSec = Math.ceil((attempt.lockedUntil - now) / 1000);
    return { allowed: false, retryAfterSec };
  }

  if (now - attempt.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    failedLoginAttempts.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordFailedLogin(key: string): void {
  const now = Date.now();
  const attempt = failedLoginAttempts.get(key);
  if (!attempt || now - attempt.firstAttemptAt > RATE_LIMIT_WINDOW_MS) {
    failedLoginAttempts.set(key, { count: 1, firstAttemptAt: now });
  } else {
    attempt.count += 1;
    if (attempt.count >= MAX_FAILED_ATTEMPTS) {
      attempt.lockedUntil = now + 1000 * 30; // 30-second lockout
    }
  }
}

export function resetFailedLogin(key: string): void {
  failedLoginAttempts.delete(key);
}

export function registerAccount(params: {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
}): { success: boolean; account?: RobloxAccount; token?: string; error?: string } {
  const valUser = validateUsername(params.username);
  if (!valUser.valid) {
    return { success: false, error: valUser.error };
  }

  const valPass = validatePassword(params.password);
  if (!valPass.valid) {
    return { success: false, error: valPass.error };
  }

  if (!isUsernameAvailable(valUser.username)) {
    return { success: false, error: 'That username is already taken. Please choose another.' };
  }

  if (params.email) {
    const existingEmail = getAccountByEmail(params.email);
    if (existingEmail) {
      return { success: false, error: 'An account with that email already exists.' };
    }
  }

  const salt = randomBytes(16).toString('hex');
  const passwordHash = hashPassword(params.password, salt);
  const now = Date.now();

  const account: RobloxAccount = {
    id: `roblox-${randomBytes(12).toString('hex')}`,
    username: valUser.username,
    displayName: params.displayName?.trim() || valUser.username,
    email: params.email?.trim() || undefined,
    passwordHash,
    passwordSalt: salt,
    authProvider: 'roblox',
    createdAt: now,
    lastLoginAt: now,
    version: 1,
    stats: {
      totalPlaytimeSec: 0,
      blocksPlaced: 0,
      blocksMined: 0,
      kills: 0,
      deaths: 0,
    },
  };

  accounts.set(account.id, account);
  saveAccountToDisk(account);
  const token = createSessionToken(account);

  return { success: true, account, token };
}

export function authenticateUser(identifier: string, password: string, clientIp = '127.0.0.1'): {
  success: boolean;
  account?: RobloxAccount;
  token?: string;
  error?: string;
  retryAfterSec?: number;
} {
  const rateLimitKey = `${clientIp}:${identifier.toLowerCase()}`;
  const rateLimitCheck = checkLoginRateLimit(rateLimitKey);
  if (!rateLimitCheck.allowed) {
    return {
      success: false,
      error: `Too many failed login attempts. Please wait ${rateLimitCheck.retryAfterSec} seconds before trying again.`,
      retryAfterSec: rateLimitCheck.retryAfterSec,
    };
  }

  const account = getAccountByIdentifier(identifier);
  if (!account) {
    recordFailedLogin(rateLimitKey);
    return { success: false, error: 'Invalid username or password.' };
  }

  const candidateHash = hashPassword(password, account.passwordSalt);
  if (candidateHash !== account.passwordHash) {
    recordFailedLogin(rateLimitKey);
    return { success: false, error: 'Invalid username or password.' };
  }

  resetFailedLogin(rateLimitKey);
  account.lastLoginAt = Date.now();
  saveAccountToDisk(account);
  const token = createSessionToken(account);

  return { success: true, account, token };
}

export function changeAccountPassword(
  accountId: string,
  currentPassword: string,
  newPassword: string
): { success: boolean; error?: string } {
  const account = getAccountById(accountId);
  if (!account) {
    return { success: false, error: 'Account not found.' };
  }

  const candidateHash = hashPassword(currentPassword, account.passwordSalt);
  if (candidateHash !== account.passwordHash) {
    return { success: false, error: 'Current password is incorrect.' };
  }

  const valNewPass = validatePassword(newPassword);
  if (!valNewPass.valid) {
    return { success: false, error: valNewPass.error };
  }

  const newSalt = randomBytes(16).toString('hex');
  account.passwordSalt = newSalt;
  account.passwordHash = hashPassword(newPassword, newSalt);
  account.version += 1;
  saveAccountToDisk(account);

  return { success: true };
}

export function savePlayerCloudProgress(
  accountId: string,
  payload: unknown,
  expectedVersion?: number
): { success: boolean; saveVersion: number; savedAt: number; error?: string } {
  ensureDirectories();
  const account = getAccountById(accountId);
  if (!account) {
    return { success: false, saveVersion: 0, savedAt: 0, error: 'Account not found.' };
  }

  const existingSave = loadPlayerCloudProgress(accountId);
  const currentVersion = existingSave?.saveVersion ?? 0;

  if (typeof expectedVersion === 'number' && expectedVersion < currentVersion) {
    return {
      success: false,
      saveVersion: currentVersion,
      savedAt: existingSave?.lastSavedAt ?? 0,
      error: 'Conflict: Newer save exists on the cloud.',
    };
  }

  if (!payload || typeof payload !== 'object') {
    return { success: false, saveVersion: currentVersion, savedAt: 0, error: 'Invalid save payload.' };
  }

  const p = payload as Record<string, any>;
  const rawState = p.playerState || {};
  const rawInv = p.inventory || {};
  const rawHotbar = p.hotbar || {};
  const rawStats = p.stats || {};
  const rawHomes = Array.isArray(p.namedHomes) ? p.namedHomes : [];

  // Strictly sanitize & validate incoming player state
  const playerState = {
    x: Number.isFinite(rawState.x) ? Math.max(-10_000_000, Math.min(10_000_000, Math.round(rawState.x * 10) / 10)) : 0,
    y: Number.isFinite(rawState.y) ? Math.max(-10_000_000, Math.min(10_000_000, Math.round(rawState.y * 10) / 10)) : 0,
    spawnX: Number.isFinite(rawState.spawnX) ? Math.round(rawState.spawnX) : undefined,
    spawnY: Number.isFinite(rawState.spawnY) ? Math.round(rawState.spawnY) : undefined,
    health: Math.max(0, Math.min(100, Number.isFinite(rawState.health) ? Math.round(rawState.health) : 100)),
    maxHealth: Math.max(1, Math.min(500, Number.isFinite(rawState.maxHealth) ? Math.round(rawState.maxHealth) : 100)),
    food: Math.max(0, Math.min(100, Number.isFinite(rawState.food) ? Math.round(rawState.food) : 100)),
    maxFood: Math.max(1, Math.min(200, Number.isFinite(rawState.maxFood) ? Math.round(rawState.maxFood) : 100)),
    stamina: Math.max(0, Math.min(100, Number.isFinite(rawState.stamina) ? Math.round(rawState.stamina) : 100)),
    maxStamina: Math.max(1, Math.min(200, Number.isFinite(rawState.maxStamina) ? Math.round(rawState.maxStamina) : 100)),
    isAlive: rawState.isAlive !== false,
    seed: Number.isFinite(rawState.seed) ? rawState.seed : undefined,
    facingRight: Boolean(rawState.facingRight ?? true),
  };

  // Inventory validation
  const inventoryCounts: Record<string, number> = {};
  if (rawInv.counts && typeof rawInv.counts === 'object') {
    for (const [k, v] of Object.entries(rawInv.counts).slice(0, 256)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        inventoryCounts[k] = Math.min(999, Math.floor(v));
      }
    }
  }

  const hotbarTypes = Array.isArray(rawInv.hotbarTypes)
    ? rawInv.hotbarTypes.slice(0, 8).map((t: unknown) => (typeof t === 'string' && t.length < 64 ? (t as ItemType) : null))
    : ['sword' as ItemType, null, null, null, null, null, null, null];

  const inventoryTypes = Array.isArray(rawInv.inventoryTypes)
    ? rawInv.inventoryTypes.slice(0, 49).map((t: unknown) => (typeof t === 'string' && t.length < 64 ? (t as ItemType) : null))
    : Array(49).fill(null);

  // Named homes validation
  const namedHomes = rawHomes.slice(0, 20).filter((h: any) =>
    h && typeof h.name === 'string' && Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.seed)
  ).map((h: any) => ({
    id: String(h.id || `home-${Math.random().toString(36).slice(2)}`).slice(0, 64),
    name: String(h.name).slice(0, 32),
    x: Math.round(h.x),
    y: Math.round(h.y),
    seed: Math.round(h.seed),
  }));

  const saveVersion = currentVersion + 1;
  const lastSavedAt = Date.now();

  const cloudSave: PlayerCloudSave = {
    accountId,
    username: account.username,
    saveVersion,
    lastSavedAt,
    playerState,
    inventory: {
      counts: inventoryCounts as any,
      hotbarTypes,
      inventoryTypes,
    },
    hotbar: {
      slots: Array.isArray(rawHotbar.slots) ? rawHotbar.slots.slice(0, 8) : [],
      activeSlot: Math.max(0, Math.min(7, Number.isInteger(rawHotbar.activeSlot) ? rawHotbar.activeSlot : 0)),
    },
    namedHomes,
    stats: {
      totalPlaytimeSec: Math.max(0, Math.floor(Number(rawStats.totalPlaytimeSec) || 0)),
      blocksPlaced: Math.max(0, Math.floor(Number(rawStats.blocksPlaced) || 0)),
      blocksMined: Math.max(0, Math.floor(Number(rawStats.blocksMined) || 0)),
      kills: Math.max(0, Math.floor(Number(rawStats.kills) || 0)),
      deaths: Math.max(0, Math.floor(Number(rawStats.deaths) || 0)),
    },
    worldModifications: p.worldModifications && typeof p.worldModifications === 'object' ? p.worldModifications : undefined,
  };

  // Also sync lifetime stats onto account object
  account.stats = {
    totalPlaytimeSec: Math.max(account.stats?.totalPlaytimeSec || 0, cloudSave.stats.totalPlaytimeSec),
    blocksPlaced: Math.max(account.stats?.blocksPlaced || 0, cloudSave.stats.blocksPlaced),
    blocksMined: Math.max(account.stats?.blocksMined || 0, cloudSave.stats.blocksMined),
    kills: Math.max(account.stats?.kills || 0, cloudSave.stats.kills),
    deaths: Math.max(account.stats?.deaths || 0, cloudSave.stats.deaths),
  };
  saveAccountToDisk(account);

  safeWriteJson(cloudSaveFilePath(accountId), cloudSave);
  return { success: true, saveVersion, savedAt: lastSavedAt };
}

export function loadPlayerCloudProgress(accountId: string): PlayerCloudSave | null {
  ensureDirectories();
  const filePath = cloudSaveFilePath(accountId);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw) as PlayerCloudSave;
    if (parsed && typeof parsed.saveVersion === 'number' && parsed.accountId === accountId) {
      return parsed;
    }
  } catch {
    // Return null if corrupt
  }
  return null;
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const queryToken = req.query.token;
  if (typeof queryToken === 'string' && queryToken.trim()) {
    return queryToken.trim();
  }
  return null;
}

// Initialise storage on module load
loadAllAccountsFromDisk();
