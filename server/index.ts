import { createServer } from 'node:http';
import type { Server } from 'node:http';
import express, { type Application } from 'express';
import { fileURLToPath } from 'node:url';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { normalizeWorldName, worldInputToSeed } from '../src/game/worldIdentity';
import { generateLobbyCode, isValidLobbyCode, normalizeLobbyCode } from '../src/game/lobbyCodes';
import { TileType, ProtectorZone } from '../src/game/types';
import { Inventory, InventorySlotRef } from '../src/game/inventory';

// TEMPORARY combat lifecycle diagnostics. Remove after reproducing the respawn issue.
const debugCombat = (event: string, data: Record<string, unknown>) =>
  console.info('[combat-debug][server]', event, data);

export const PROTECTOR_RADIUS_BLOCKS = 50;
export const MAX_PROTECTORS_PER_PLAYER = 10;
import {
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
  getPlayerFriendsWithStatus,
  loadFriendsStore,
} from './friends';
import {
  registerAccount as registerRobloxAccount,
  authenticateUser as authenticateRobloxUser,
  changeAccountPassword as changeRobloxPassword,
  getAccountForToken as getRobloxAccountForToken,
  savePlayerCloudProgress as saveRobloxCloudProgress,
  loadPlayerCloudProgress as loadRobloxCloudProgress,
  getAccountById as getRobloxAccountById,
  revokeSessionToken as revokeRobloxSessionToken,
  extractBearerToken as extractRobloxBearerToken,
  validateUsername as validateRobloxUsername,
} from './accounts';
import { BLOCK_CONFIGS, getBerryBushSeedDropCount, ITEM_TO_TILE, TILE_TO_ITEM, ItemType, isEdibleItem, MEAT_NUTRITION } from '../src/game/blocks';
import { CRAFTING_RECIPES } from '../src/game/recipes';
import { TerrainGenerator } from '../src/game/terrainGen';
import {
  SPECIES_HEALTH,
  SPECIES_MEAT,
  SPECIES_SKULL_DROP,
  SPECIES_WEIGHT,
  SPECIES_SIZE,
  SPECIES_SPEED,
  SPECIES_DAMAGE,
  SPECIES_ATTACK_COOLDOWN,
  CARNIVORE_SPECIES,
  LAND_HABITATS,
  AQUATIC_BIOMES,
  hash32,
  WildlifeSpecies,
  WildlifeState,
} from '../src/game/wildlife';
import { CHUNK_WIDTH, CHUNK_HEIGHT, TILE_SIZE, DAY_CYCLE_DURATION_SEC } from '../src/game/constants';
import { BiomeType } from '../src/game/biomes';
import { CHEST_SLOT_COUNT, CHEST_STACK_LIMIT, ChestEndpoint, WorldChest, makeEmptyChestSlots, makeWorldChestId, sanitizeChestSlots, transferChestItems } from '../src/game/chests';
import { PLAYER_HEIGHT, PLAYER_WIDTH } from '../src/game/constants';
import { getCropGrowthStage, InteractiveObjectState, InteractiveObjectType, OBJECT_ITEM, OBJECT_TILE, isPlayerTouchingPressurePlate, makeWorldObject, objectTypeForTile, sanitizeSignText, sanitizeWorldObject, worldObjectId } from '../src/game/worldObjects';
import {
  saveWorldData,
  loadWorldData,
  savePlayerData,
  loadPlayerData,
  getAllSavedPlayers,
  getPersistenceDataDir,
} from './persistence';
import { addLeaderboardScore, addLeaderboardScoreOnce, connectedGameplaySeconds, getLeaderboard, registerLeaderboardPlayer, rollDailyPeriod } from './leaderboards';
import { HEALTH_REGEN_AMOUNT, recordHealthDamage, regenerateHealth, resetHealthRegeneration, type HealthRegenerationState } from '../src/game/healthRegeneration';
export { HEALTH_REGEN_DELAY_MS, HEALTH_REGEN_INTERVAL_MS, HEALTH_REGEN_AMOUNT } from '../src/game/healthRegeneration';

const MAX_NAME_LENGTH = 64;
const MAX_BLOCK_COORDINATE = 10_000_000;
const INVENTORY_DROP_OWNER_PICKUP_DELAY_MS = 750;
const MAX_LOBBY_PLAYERS = 8;
const VALID_TILES = new Set<number>(Object.values(TileType).filter((value): value is number => typeof value === 'number'));
const AUTH_DATA_DIR = path.join(getPersistenceDataDir(), 'auth');
const AUTH_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const AUTH_ACCOUNT_VERSION = 1;
const GOOGLE_AUTH_STATE_TTL_MS = 1000 * 60 * 5;
const GOOGLE_AUTH_STATE_STORE = new Map<string, { redirect: string; expiresAt: number }>();

function ensureAuthStorage(): void {
  fs.mkdirSync(AUTH_DATA_DIR, { recursive: true });
}

function sanitizeEmail(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

function sanitizeDisplayName(value: string, maxLength = 16): string {
  const cleaned = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/<|>|&|\"|'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = cleaned.replace(/[^a-zA-Z0-9_\-]/g, '');
  const finalName = compact || cleaned.replace(/[^a-zA-Z0-9_\-]/g, '').trim();
  return finalName.slice(0, maxLength) || 'PixelRanger';
}

function createRandomProfileName(): string {
  const prefix = ['Pixel', 'Crystal', 'Ember', 'Moon', 'Forest', 'Star', 'Sun', 'Silver', 'Storm', 'Oak'];
  const suffix = ['Fox', 'Wolf', 'Knight', 'Rabbit', 'Rider', 'Scout', 'Nomad', 'Pioneer', 'Warden', 'Bard', 'Drifter', 'Trail'];
  const first = prefix[Math.floor(Math.random() * prefix.length)];
  const second = suffix[Math.floor(Math.random() * suffix.length)];
  return `${first}${second}`;
}

export type AuthAccount = {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  displayName: string;
  googleSub?: string;
  authProvider?: 'email' | 'google';
  createdAt: number;
  lastLoginAt: number;
  version: number;
};

const authAccounts = new Map<string, AuthAccount>();
const authSessions = new Map<string, { accountId: string; expiresAt: number }>();

function accountFilePath(accountId: string): string {
  return path.join(AUTH_DATA_DIR, `${accountId}.json`);
}

function loadAccountsFromDisk(): void {
  ensureAuthStorage();
  if (!fs.existsSync(AUTH_DATA_DIR)) return;
  for (const entry of fs.readdirSync(AUTH_DATA_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(path.join(AUTH_DATA_DIR, entry.name), 'utf8');
      const parsed = JSON.parse(raw) as Partial<AuthAccount>;
      if (!parsed || typeof parsed.id !== 'string' || typeof parsed.email !== 'string') continue;
      const passwordHash = typeof parsed.passwordHash === 'string' ? parsed.passwordHash : 'google-oauth';
      const passwordSalt = typeof parsed.passwordSalt === 'string' ? parsed.passwordSalt : randomBytes(16).toString('hex');
      const account: AuthAccount = {
        id: parsed.id,
        email: parsed.email,
        passwordHash,
        passwordSalt,
        displayName: typeof parsed.displayName === 'string' && parsed.displayName.trim() ? sanitizeDisplayName(parsed.displayName, 16) : createRandomProfileName(),
        googleSub: typeof parsed.googleSub === 'string' ? parsed.googleSub : undefined,
        authProvider: parsed.authProvider === 'google' ? 'google' : 'email',
        createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
        lastLoginAt: typeof parsed.lastLoginAt === 'number' ? parsed.lastLoginAt : Date.now(),
        version: typeof parsed.version === 'number' ? parsed.version : AUTH_ACCOUNT_VERSION,
      };
      authAccounts.set(account.id, account);
    } catch {
      // Ignore invalid account files.
    }
  }
}

function saveAccount(account: AuthAccount): void {
  ensureAuthStorage();
  const file = accountFilePath(account.id);
  fs.writeFileSync(file, JSON.stringify(account, null, 2), 'utf8');
}

export function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 120_000, 64, 'sha256').toString('hex');
}

export function createAuthSession(account: AuthAccount): string {
  const token = randomBytes(24).toString('hex');
  authSessions.set(token, { accountId: account.id, expiresAt: Date.now() + AUTH_SESSION_TTL_MS });
  return token;
}

export function getAccountForSessionToken(token: string | null | undefined): AuthAccount | null {
  if (!token) return null;
  const robloxAcct = getRobloxAccountForToken(token);
  if (robloxAcct) {
    return {
      id: robloxAcct.id,
      email: robloxAcct.email || `${robloxAcct.username}@pixel-frontier.local`,
      passwordHash: robloxAcct.passwordHash,
      passwordSalt: robloxAcct.passwordSalt,
      displayName: robloxAcct.displayName,
      createdAt: robloxAcct.createdAt,
      lastLoginAt: robloxAcct.lastLoginAt,
      version: robloxAcct.version,
    };
  }
  const session = authSessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    authSessions.delete(token);
    return null;
  }
  const account = authAccounts.get(session.accountId);
  if (!account) {
    authSessions.delete(token);
    return null;
  }
  account.lastLoginAt = Date.now();
  return account;
}

export function revokeSessionToken(token: string | null | undefined): void {
  if (token) {
    authSessions.delete(token);
    revokeRobloxSessionToken(token);
  }
}

export function getAccountByEmail(email: string): AuthAccount | null {
  const normalized = sanitizeEmail(email);
  for (const account of authAccounts.values()) {
    if (account.email === normalized) return account;
  }
  return null;
}

export function isDisplayNameTaken(displayName: string, ignoreAccountId?: string): boolean {
  const candidate = sanitizeDisplayName(displayName, 16);
  for (const account of authAccounts.values()) {
    if (account.id === ignoreAccountId) continue;
    if (account.displayName.toLowerCase() === candidate.toLowerCase()) return true;
  }
  return false;
}

export function ensureUniqueDisplayName(candidate: string, existingDisplayName?: string, ignoreAccountId?: string): string {
  const base = sanitizeDisplayName(candidate || existingDisplayName || createRandomProfileName(), 16);
  let name = base;
  let counter = 2;
  while (isDisplayNameTaken(name, ignoreAccountId)) {
    name = `${base.slice(0, Math.max(1, 16 - String(counter).length))}${counter}`;
    counter += 1;
  }
  return name;
}

export function getGoogleOAuthConfig(): { enabled: boolean; clientId: string; clientSecret: string; redirectUri: string; envHint: string } {
  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
  const redirectUri = (process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback').trim();
  const enabled = Boolean(clientId && clientSecret && redirectUri);
  return {
    enabled,
    clientId,
    clientSecret,
    redirectUri,
    envHint: 'Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI in your environment, plus VITE_GOOGLE_CLIENT_ID if you want the client UI to advertise Google auth.',
  };
}

export function getAccountByGoogleSubject(googleSub: string): AuthAccount | null {
  const normalized = String(googleSub ?? '').trim();
  if (!normalized) return null;
  for (const account of authAccounts.values()) {
    if (account.googleSub === normalized) return account;
  }
  return null;
}

export function getOrCreateGoogleAccount(input: { googleSub: string; email?: string; displayName?: string }): AuthAccount {
  const googleSub = String(input.googleSub ?? '').trim();
  if (!googleSub) throw new Error('Google subject is required.');

  const existingBySub = getAccountByGoogleSubject(googleSub);
  if (existingBySub) return existingBySub;

  const emailCandidate = sanitizeEmail(typeof input.email === 'string' ? input.email : '');
  const existingByEmail = emailCandidate ? getAccountByEmail(emailCandidate) : null;
  if (existingByEmail) {
    existingByEmail.googleSub = googleSub;
    existingByEmail.authProvider = 'google';
    existingByEmail.displayName = ensureUniqueDisplayName(existingByEmail.displayName || input.displayName || createRandomProfileName(), undefined, existingByEmail.id);
    existingByEmail.lastLoginAt = Date.now();
    saveAccount(existingByEmail);
    return existingByEmail;
  }

  const salt = randomBytes(16).toString('hex');
  const displayName = ensureUniqueDisplayName(input.displayName || createRandomProfileName(), undefined, undefined);
  const account: AuthAccount = {
    id: `acct-${randomBytes(12).toString('hex')}`,
    email: emailCandidate || `${googleSub}@google-user.local`,
    passwordHash: hashPassword(randomBytes(32).toString('hex'), salt),
    passwordSalt: salt,
    displayName,
    googleSub,
    authProvider: 'google',
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
    version: AUTH_ACCOUNT_VERSION,
  };
  authAccounts.set(account.id, account);
  saveAccount(account);
  return account;
}

export function isAllowedOrigin(origin: string): boolean {
  if (!origin || typeof origin !== 'string') return false;
  const trimmed = origin.trim();

  // Explicit env var origins (comma-separated)
  if (process.env.ALLOWED_ORIGINS) {
    const extraOrigins = process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim());
    if (extraOrigins.includes(trimmed)) return true;
  }

  // Google AI Studio preview & Cloud Run domains (including regional subdomains like .asia-southeast1.run.app)
  if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.run\.app$/i.test(trimmed)) {
    return true;
  }

  // Render production deployment domain
  if (
    trimmed === 'https://onrender.com' ||
    /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.onrender\.com$/i.test(trimmed)
  ) {
    return true;
  }

  // Local development origins
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed)) {
    return true;
  }

  return false;
}

export function setupAuthRoutes(app: Application): void {
  app.use((req, res, next) => {
    const reqPath = req.path || '';
    const isCorsRoute =
      reqPath.startsWith('/api/') ||
      reqPath === '/api' ||
      reqPath.startsWith('/friends') ||
      reqPath === '/friends';

    if (!isCorsRoute) return next();

    const origin = req.get('Origin');
    if (origin && isAllowedOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Max-Age', '600');
    }

    if (req.method === 'OPTIONS') {
      if (origin && isAllowedOrigin(origin)) {
        return res.sendStatus(204);
      }
      return res.status(403).end();
    }
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  app.get('/api/auth/google/config', (_req, res) => {
    const config = getGoogleOAuthConfig();
    res.json({ ok: true, enabled: config.enabled, clientIdConfigured: Boolean(config.clientId), redirectUri: config.redirectUri, envHint: config.envHint });
  });

  app.get('/api/auth/google/start', (req, res) => {
    const config = getGoogleOAuthConfig();
    if (!config.enabled || !config.clientId || !config.clientSecret || !config.redirectUri) {
      res.status(400).json({ ok: false, error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI before enabling Google sign-in.' });
      return;
    }
    const redirect = typeof req.query.redirect === 'string' ? req.query.redirect.trim() : '/';
    const target = redirect.startsWith('http') ? redirect : `/${redirect.replace(/^\//, '')}`;
    const state = randomBytes(16).toString('hex');
    GOOGLE_AUTH_STATE_STORE.set(state, { redirect: target, expiresAt: Date.now() + GOOGLE_AUTH_STATE_TTL_MS });
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    const config = getGoogleOAuthConfig();
    if (!config.enabled || !config.clientId || !config.clientSecret || !config.redirectUri) {
      res.status(400).send('Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI before enabling Google sign-in.');
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
    const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';
    if (!code) {
      res.status(400).send('Google OAuth callback did not include a valid authorization code.');
      return;
    }

    const savedState = state ? GOOGLE_AUTH_STATE_STORE.get(state) : undefined;
    if (!savedState || savedState.expiresAt <= Date.now()) {
      res.status(400).send('Google OAuth flow expired or is invalid. Please try again.');
      return;
    }
    GOOGLE_AUTH_STATE_STORE.delete(state);

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId,
          client_secret: config.clientSecret,
          redirect_uri: config.redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokenJson = await tokenResponse.json() as { access_token?: string; id_token?: string; error?: string; error_description?: string };
      if (!tokenResponse.ok || !tokenJson.access_token) {
        res.status(400).send(tokenJson.error_description || tokenJson.error || 'Google token exchange failed.');
        return;
      }

      const userResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const userJson = await userResponse.json() as { sub?: string; email?: string; name?: string; picture?: string };
      if (!userResponse.ok || !userJson.sub) {
        res.status(400).send('Google profile lookup failed.');
        return;
      }

      const account = getOrCreateGoogleAccount({
        googleSub: userJson.sub,
        email: userJson.email,
        displayName: userJson.name || createRandomProfileName(),
      });
      const token = createAuthSession(account);
      const redirectUrl = new URL(savedState.redirect, `${req.protocol}://${req.get('host')}`);
      redirectUrl.searchParams.set('authToken', token);
      res.redirect(redirectUrl.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Google sign-in failed.';
      res.status(500).send(message);
    }
  });

  app.post('/api/v1/auth/firebase', async (req, res) => {
    const apiKey = process.env.FIREBASE_AUTH_API_KEY;
    if (!apiKey) {
      res.status(503).json({ ok: false, error: 'Firebase sign-in is not configured on the game server yet.' });
      return;
    }
    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken : '';
    if (!idToken || idToken.length > 12000) {
      res.status(400).json({ ok: false, error: 'A valid Firebase sign-in token is required.' });
      return;
    }
    try {
      const verifyResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const verifyData = await verifyResponse.json() as {
        users?: Array<{ localId?: string; email?: string; emailVerified?: boolean; displayName?: string; providerUserInfo?: Array<{ providerId?: string }> }>;
        error?: { message?: string };
      };
      const firebaseUser = verifyData.users?.[0];
      if (!verifyResponse.ok || !firebaseUser?.localId || !firebaseUser.email) {
        res.status(401).json({ ok: false, error: 'Firebase could not verify this sign-in. Please try again.' });
        return;
      }
      const email = sanitizeEmail(firebaseUser.email);
      const provider = firebaseUser.providerUserInfo?.some((item) => item.providerId === 'google.com') ? 'google' : 'email';
      let account = [...authAccounts.values()].find((item) => item.googleSub === firebaseUser.localId) || getAccountByEmail(email);
      if (account) {
        if (account.email !== email) {
          res.status(409).json({ ok: false, error: 'This sign-in does not match the email on the existing game account.' });
          return;
        }
        account.googleSub = firebaseUser.localId;
        account.authProvider = provider;
        if (firebaseUser.displayName && (!account.displayName || account.displayName.startsWith('Pixel'))) {
          account.displayName = ensureUniqueDisplayName(firebaseUser.displayName, account.displayName, account.id);
        }
        account.lastLoginAt = Date.now();
      } else {
        const displayName = ensureUniqueDisplayName(firebaseUser.displayName || createRandomProfileName());
        account = {
          id: `acct-${randomBytes(12).toString('hex')}`,
          email,
          passwordHash: 'firebase-managed',
          passwordSalt: randomBytes(16).toString('hex'),
          displayName,
          googleSub: firebaseUser.localId,
          authProvider: provider,
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
          version: AUTH_ACCOUNT_VERSION,
        };
        authAccounts.set(account.id, account);
      }
      authAccounts.set(account.id, account);
      saveAccount(account);
      const token = createAuthSession(account);
      res.json({ ok: true, token, user: { id: account.id, email: account.email, displayName: account.displayName, createdAt: account.createdAt } });
    } catch (error) {
      console.error('[auth] Firebase verification failed:', error);
      res.status(502).json({ ok: false, error: 'Could not verify the Firebase sign-in right now.' });
    }
  });

  app.get(['/api/v1/auth/me', '/api/auth/me'], (req, res) => {
    const authHeader = req.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (req.query.token as string | undefined) || null;
    const account = getAccountForSessionToken(token);
    if (!account) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return;
    }
    const robloxAcct = getRobloxAccountById(account.id);
    res.json({
      ok: true,
      user: {
        id: account.id,
        username: robloxAcct?.username || account.displayName,
        email: account.email,
        displayName: account.displayName,
        createdAt: account.createdAt,
        stats: robloxAcct?.stats,
      },
    });
  });

  app.post(['/api/v1/auth/register', '/api/auth/register'], (req, res) => {
    const payload = req.body as Record<string, unknown>;
    const rawUsername = typeof payload.username === 'string' ? payload.username.trim() : '';
    const rawEmail = typeof payload.email === 'string' ? sanitizeEmail(payload.email) : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const displayNameInput = typeof payload.displayName === 'string' ? payload.displayName.trim() : '';

    // If username is supplied, handle Roblox registration
    if (rawUsername) {
      const reg = registerRobloxAccount({
        username: rawUsername,
        password,
        email: rawEmail || undefined,
        displayName: displayNameInput || rawUsername,
      });
      if (!reg.success || !reg.account || !reg.token) {
        const isConflict = reg.error?.includes('already taken') || reg.error?.includes('already exists');
        res.status(isConflict ? 409 : 400).json({ ok: false, error: reg.error });
        return;
      }
      res.status(201).json({
        ok: true,
        token: reg.token,
        user: {
          id: reg.account.id,
          username: reg.account.username,
          displayName: reg.account.displayName,
          email: reg.account.email,
          createdAt: reg.account.createdAt,
        },
      });
      return;
    }

    // Legacy email registration fallback
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      res.status(400).json({ ok: false, error: 'Enter a valid email address or username.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ ok: false, error: 'Password must be between 8 and 128 characters.' });
      return;
    }
    if (getAccountByEmail(rawEmail)) {
      res.status(409).json({ ok: false, error: 'An account with that email already exists.' });
      return;
    }
    const baseName = sanitizeDisplayName(displayNameInput || createRandomProfileName(), 16);
    const chosenName = isDisplayNameTaken(baseName) ? ensureUniqueDisplayName(baseName, undefined, undefined) : baseName;
    const salt = randomBytes(16).toString('hex');
    const account: AuthAccount = {
      id: `acct-${randomBytes(12).toString('hex')}`,
      email: rawEmail,
      passwordHash: hashPassword(password, salt),
      passwordSalt: salt,
      displayName: chosenName,
      authProvider: 'email',
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
      version: AUTH_ACCOUNT_VERSION,
    };
    authAccounts.set(account.id, account);
    saveAccount(account);
    const token = createAuthSession(account);
    res.status(201).json({ ok: true, token, user: { id: account.id, email: account.email, displayName: account.displayName } });
  });

  app.post(['/api/v1/auth/login', '/api/auth/login'], (req, res) => {
    const payload = req.body as Record<string, unknown>;
    const identifier = String(payload.username || payload.email || payload.identifier || '').trim();
    const password = typeof payload.password === 'string' ? payload.password : '';

    if (!identifier || !password) {
      res.status(400).json({ ok: false, error: 'Please provide both username/email and password.' });
      return;
    }

    const robloxAuth = authenticateRobloxUser(identifier, password, req.ip || '127.0.0.1');
    if (robloxAuth.success && robloxAuth.account && robloxAuth.token) {
      res.json({
        ok: true,
        token: robloxAuth.token,
        user: {
          id: robloxAuth.account.id,
          username: robloxAuth.account.username,
          displayName: robloxAuth.account.displayName,
          email: robloxAuth.account.email,
          createdAt: robloxAuth.account.createdAt,
          stats: robloxAuth.account.stats,
        },
      });
      return;
    }

    // Fallback to legacy authAccounts for email
    const email = sanitizeEmail(identifier);
    const legacyAccount = getAccountByEmail(email);
    if (!legacyAccount) {
      res.status(robloxAuth.retryAfterSec ? 429 : 401).json({ ok: false, error: robloxAuth.error || 'Invalid credentials.' });
      return;
    }
    if (legacyAccount.authProvider === 'google') {
      res.status(400).json({ ok: false, error: 'Use Google sign-in for this account.' });
      return;
    }
    const candidateHash = hashPassword(password, legacyAccount.passwordSalt);
    if (candidateHash !== legacyAccount.passwordHash) {
      res.status(401).json({ ok: false, error: 'Invalid email or password.' });
      return;
    }
    legacyAccount.lastLoginAt = Date.now();
    saveAccount(legacyAccount);
    const token = createAuthSession(legacyAccount);
    res.json({ ok: true, token, user: { id: legacyAccount.id, email: legacyAccount.email, displayName: legacyAccount.displayName } });
  });

  app.post(['/api/v1/auth/logout', '/api/auth/logout'], (req, res) => {
    const authHeader = req.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (req.query.token as string | undefined) || null;
    revokeSessionToken(token);
    res.json({ ok: true });
  });

  app.post('/api/v1/auth/change-password', (req, res) => {
    const token = extractRobloxBearerToken(req);
    const account = getAccountForSessionToken(token);
    if (!account) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return;
    }
    const payload = req.body as Record<string, unknown>;
    const currentPassword = typeof payload.currentPassword === 'string' ? payload.currentPassword : '';
    const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';

    const result = changeRobloxPassword(account.id, currentPassword, newPassword);
    if (!result.success) {
      res.status(400).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true, message: 'Password updated successfully.' });
  });

  app.post('/api/v1/player/save', (req, res) => {
    const token = extractRobloxBearerToken(req);
    const account = getAccountForSessionToken(token);
    if (!account) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return;
    }
    const expectedVersion = typeof req.body?.expectedVersion === 'number' ? req.body.expectedVersion : undefined;
    const saveResult = saveRobloxCloudProgress(account.id, req.body, expectedVersion);
    if (!saveResult.success) {
      const status = saveResult.error?.includes('Conflict') ? 409 : 400;
      res.status(status).json({ ok: false, error: saveResult.error, saveVersion: saveResult.saveVersion });
      return;
    }
    res.json({ ok: true, saveVersion: saveResult.saveVersion, savedAt: saveResult.savedAt });
  });

  app.get('/api/v1/player/load', (req, res) => {
    const token = extractRobloxBearerToken(req);
    const account = getAccountForSessionToken(token);
    if (!account) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return;
    }
    const saved = loadRobloxCloudProgress(account.id);
    res.json({ ok: true, save: saved });
  });

  app.get('/api/v1/player/profile', (req, res) => {
    const token = extractRobloxBearerToken(req);
    const account = getAccountForSessionToken(token);
    if (!account) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return;
    }
    const robloxAcct = getRobloxAccountById(account.id);
    const cloudSave = loadRobloxCloudProgress(account.id);
    res.json({
      ok: true,
      profile: {
        id: account.id,
        username: robloxAcct?.username || account.displayName,
        displayName: account.displayName,
        createdAt: account.createdAt,
        lastLoginAt: account.lastLoginAt,
        stats: robloxAcct?.stats || {
          totalPlaytimeSec: 0,
          blocksPlaced: 0,
          blocksMined: 0,
          kills: 0,
          deaths: 0,
        },
        hasCloudSave: Boolean(cloudSave),
        cloudSaveVersion: cloudSave?.saveVersion,
        cloudLastSavedAt: cloudSave?.lastSavedAt,
      },
    });
  });

  app.post('/api/account/profile', (req, res) => {
    const authHeader = req.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const account = getAccountForSessionToken(token);
    if (!account) {
      res.status(401).json({ ok: false, error: 'Authentication required.' });
      return;
    }
    const payload = req.body as Record<string, unknown>;
    const displayName = sanitizeDisplayName(typeof payload.displayName === 'string' ? payload.displayName : '', 16);
    if (!displayName || displayName.length < 3) {
      res.status(400).json({ ok: false, error: 'Name must be at least 3 characters.' });
      return;
    }
    if (isDisplayNameTaken(displayName, account.id)) {
      res.status(409).json({ ok: false, error: 'That player name is already in use.' });
      return;
    }
    account.displayName = displayName;
    saveAccount(account);
    res.json({ ok: true, user: { id: account.id, email: account.email, displayName: account.displayName } });
  });

  app.get(['/api/friends', '/friends'], (req, res) => {
    const playerId = String(req.query.playerId || '').trim();
    const displayName = String(req.query.displayName || '').trim() || undefined;
    if (!playerId) {
      res.status(400).json({ ok: false, error: 'playerId is required' });
      return;
    }
    const data = getPlayerFriendsWithStatus(playerId, displayName, getPlayerOnlineStatus);
    res.json({ ok: true, ...data });
  });

  app.get('/api/leaderboards', (req, res) => {
    const playerId = String(req.query.playerId || '').trim() || undefined;
    res.json({ ok: true, ...getLeaderboard(playerId) });
  });

  app.post(['/api/friends/request', '/friends/request'], (req, res) => {
    const payload = req.body as Record<string, unknown>;
    const fromPlayerId = String(payload.fromPlayerId || '').trim();
    const fromPlayerName = String(payload.fromPlayerName || '').trim() || fromPlayerId;
    const rawTarget = String(payload.targetPlayerId || payload.targetPlayerName || '').trim();
    const resolved = resolveTargetPlayer(rawTarget);
    const targetPlayerId = resolved ? resolved.playerId : (String(payload.targetPlayerId || '').trim() || rawTarget);
    const targetPlayerName = resolved ? resolved.displayName : (String(payload.targetPlayerName || '').trim() || rawTarget);

    if (!fromPlayerId || !targetPlayerId) {
      res.status(400).json({ ok: false, error: 'fromPlayerId and targetPlayerId are required' });
      return;
    }
    const result = sendFriendRequest(fromPlayerId, fromPlayerName, targetPlayerId, targetPlayerName);
    if (result.success) {
      notifyPlayerFriends(targetPlayerId);
      notifyPlayerFriends(fromPlayerId);
    }
    res.json({ ok: result.success, message: result.message });
  });

  app.post(['/api/friends/respond', '/friends/respond'], (req, res) => {
    const payload = req.body as Record<string, unknown>;
    const playerId = String(payload.playerId || '').trim();
    const fromPlayerId = String(payload.fromPlayerId || '').trim();
    const action = payload.action === 'reject' ? 'reject' : 'accept';

    if (!playerId || !fromPlayerId) {
      res.status(400).json({ ok: false, error: 'playerId and fromPlayerId are required' });
      return;
    }
    const result = respondFriendRequest(playerId, fromPlayerId, action);
    if (result.success) {
      notifyPlayerFriends(playerId);
      notifyPlayerFriends(fromPlayerId);
    }
    res.json({ ok: result.success, message: result.message, friend: result.friend });
  });

  app.post(['/api/friends/remove', '/friends/remove'], (req, res) => {
    const payload = req.body as Record<string, unknown>;
    const playerId = String(payload.playerId || '').trim();
    const friendPlayerId = String(payload.friendPlayerId || '').trim();

    if (!playerId || !friendPlayerId) {
      res.status(400).json({ ok: false, error: 'playerId and friendPlayerId are required' });
      return;
    }
    const success = removeFriend(playerId, friendPlayerId);
    if (success) {
      notifyPlayerFriends(playerId);
      notifyPlayerFriends(friendPlayerId);
    }
    res.json({ ok: success });
  });
}

loadAccountsFromDisk();

export function getAccountFromAuthToken(token: string | null | undefined): AuthAccount | null {
  return getAccountForSessionToken(token);
}

export function getDisplayNameForClient(client: { displayName?: string; playerId: string }, account?: AuthAccount | null): string {
  if (account?.displayName) return sanitizeDisplayName(account.displayName, 16);
  if (client.displayName) return sanitizeDisplayName(client.displayName, 16);
  return formatPlayerName(client.playerId);
}

const REQUIRED_PICKAXE: Partial<Record<TileType, { rank: number; name: string }>> = {
  [TileType.STONE]: { rank: 1, name: 'Wooden Pickaxe' },
  [TileType.COAL_ORE]: { rank: 1, name: 'Wooden Pickaxe' },
  [TileType.COPPER_ORE]: { rank: 2, name: 'Stone Pickaxe' },
  [TileType.IRON_ORE]: { rank: 3, name: 'Copper Pickaxe' },
  [TileType.GOLD_ORE]: { rank: 4, name: 'Iron Pickaxe' },
  [TileType.CRYSTAL_ORE]: { rank: 4, name: 'Iron Pickaxe' },
  [TileType.DIAMOND_ORE]: { rank: 5, name: 'Gold Pickaxe' },
  [TileType.ASTRAL_ORE]: { rank: 4, name: 'Iron Pickaxe' },
  [TileType.CELESTIAL_ORE]: { rank: 5, name: 'Gold Pickaxe' },
  [TileType.SKY_STONE]: { rank: 2, name: 'Stone Pickaxe' },
};

const PICKAXES_BY_RANK: Array<[ItemType, number]> = [
  ['wooden_pickaxe', 1],
  ['stone_pickaxe', 2],
  ['copper_pickaxe', 3],
  ['iron_pickaxe', 4],
  ['gold_pickaxe', 5],
  ['diamond_pickaxe', 6],
  ['astral_pickaxe', 7],
  ['celestial_pickaxe', 8],
];

type ServerWildlifeAnimal = {
  id: string;
  species: WildlifeSpecies;
  biome: BiomeType;
  ownerChunkX: number;
  ownerChunkY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  direction: -1 | 1;
  state: WildlifeState;
  stateTimer: number;
  animTimer: number;
  randomState: number;
  homeX: number;
  homeY: number;
  health: number;
  maxHealth: number;
  hurtTimer: number;
  attackCooldown: number;
  isAlive: boolean;
  targetPlayerId?: string;
  targetLifeId?: number;
};

type BlockModification = { x: number; y: number; tile: TileType };
type LobbyDrop = {
  id: number;
  type: ItemType;
  count: number;
  x: number;
  y: number;
  ownerPlayerId?: string;
  ownerPickupUntil?: number;
};
export type ChatMessage = {
  messageId: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
};

type Lobby = {
  id: string;
  name: string;
  seed: number;
  terrainGen: TerrainGenerator;
  players: Set<WebSocket>;
  blockModifications: Map<string, BlockModification>;
  drops: Map<number, LobbyDrop>;
  chests: Map<string, WorldChest>;
  worldObjects: Map<string, InteractiveObjectState>;
  pressurePlateOccupants: Map<string, Set<Client>>;
  nextDropId: number;
  createdAt: number;
  activeTimeElapsedSec: number;
  lastClockTickAt: number;
  lastTimeSyncAt: number;
  wildlife: Map<string, ServerWildlifeAnimal>;
  dormantWildlife: Map<string, ServerWildlifeAnimal>;
  killedWildlifeIds: Set<string>;
  lastWildlifeSpawnAt: number;
  lastWildlifeSyncAt: number;
  worldDirty: boolean;
  chatHistory: ChatMessage[];
  protectors: Map<string, ProtectorZone>;
  firstChestPlacedPlayers: Set<string>;
  spawnedPlayerPositions: Map<string, { x: number; y: number }>;
};
type Client = {
  playerId: string;
  accountId?: string;
  displayName: string;
  lobby?: Lobby;
  x: number;
  y: number;
  spawnX?: number;
  spawnY?: number;
  facingRight: boolean;
  lastMoveAt: number;
  lastSavedAt: number;
  health: number;
  maxHealth: number;
  food: number;
  stamina: number;
  isAlive: boolean;
  lifeId: number;
  lastWildlifeDamageAt?: number;
  lastDamageAt?: number;
  nextRegenAt?: number;
  regenLifeId: number;
  leaderboardTimeAt?: number;
  lastStarvationDamageAt?: number;
  lastClientDamageAt?: number;
  inventory: Inventory;
  lastAttackAt?: number;
  processedAttackIds?: Set<string>;
  lastChatMessageAt?: number;
  recentChatTimestamps?: number[];
  lastChatText?: string;
  processedDropRequestIds?: Set<string>;
  openChestId?: string;
  pendingTeleportRequests?: Map<string, { requesterSocket: WebSocket; expiresAt: number; timeoutId?: NodeJS.Timeout }>;
  processedChestRequestIds?: Set<string>;
  processedObjectRequestIds?: Set<string>;
  occupiedPressurePlateIds?: Set<string>;
  lastDropAt?: number;
  protectedAreaOwners?: Map<string, string>;
};

function getClientRegenerationState(client: Client): HealthRegenerationState {
  return { lifeId: client.regenLifeId, lastDamageAt: client.lastDamageAt, nextRegenAt: client.nextRegenAt };
}

function storeClientRegenerationState(client: Client, state: HealthRegenerationState): void {
  client.regenLifeId = state.lifeId;
  client.lastDamageAt = state.lastDamageAt;
  client.nextRegenAt = state.nextRegenAt;
}

function markClientDamaged(client: Client, now: number): void {
  const state = getClientRegenerationState(client);
  if (state.lifeId !== client.lifeId) resetHealthRegeneration(state, client.lifeId);
  recordHealthDamage(state, client.lifeId, now);
  storeClientRegenerationState(client, state);
}

const FARM_SEED_TO_CROP: Partial<Record<ItemType, 'wheat' | 'carrot' | 'berry'>> = {
  wheat_seed: 'wheat',
  carrot_seed: 'carrot',
  berry_seed: 'berry',
};

function getFarmRewards(cropType: 'wheat' | 'carrot' | 'berry', worldSeed: number, x: number, y: number): Array<[ItemType, number]> {
  const seedRoll = ((Math.imul(worldSeed ^ x, 0x9e3779b1) ^ y * 131) & 0x7fff) % 2;
  const seedCount = seedRoll + 1;
  switch (cropType) {
    case 'wheat': return [['wheat', 2], ['wheat_seed', seedCount]];
    case 'carrot': return [['carrot', 2], ['carrot_seed', seedCount]];
    case 'berry': return [['berry', 3], ['berry_seed', seedCount]];
    default: return [['wheat', 2], ['wheat_seed', 1]];
  }
}

function hasHoe(client: Client, selectedSlotIndex: number): boolean {
  const selected = client.inventory.getSlots()[selectedSlotIndex];
  return selectedSlotIndex > 0 && selectedSlotIndex < 8 &&
    client.inventory.counts.wooden_hoe > 0 && selected?.type === 'wooden_hoe';
}

export function formatPlayerName(playerId: string): string {
  if (playerId.startsWith('player-')) {
    const num = playerId.slice('player-'.length);
    if (/^\d+$/.test(num)) {
      return `Player ${num}`;
    }
  }
  return playerId;
}

const lobbies = new Map<string, Lobby>();
const clients = new Map<WebSocket, Client>();
let nextPlayerNumber = 1;
let nextLobbyNumber = 1;

export function selectQuickJoinLobby<T extends { name: string; players: { readonly size: number }; createdAt: number }>(
  availableLobbies: Iterable<T>,
  maxPlayers: number,
): T | undefined {
  const available = Array.from(availableLobbies).filter((lobby) => lobby.players.size < maxPlayers);
  const occupied = available.filter((lobby) => lobby.players.size > 0);
  return (occupied.length > 0 ? occupied : available)
    .sort((left, right) => right.players.size - left.players.size || left.createdAt - right.createdAt)[0];
}

function pickQuickJoinLobby(): string {
  const lobby = selectQuickJoinLobby(lobbies.values(), MAX_LOBBY_PLAYERS);
  if (lobby) return lobby.name;

  const usedCodes = new Set(Array.from(lobbies.keys()).map((key) => normalizeLobbyCode(key)));
  const generated = generateLobbyCode(usedCodes);
  return generated;
}

function getLobbyTime(lobby: Lobby): { time: number; day: number } {
  const totalDays = lobby.activeTimeElapsedSec / DAY_CYCLE_DURATION_SEC;
  const time = (0.15 + (totalDays % 1)) % 1;
  const day = 1 + Math.floor(0.15 + totalDays);
  return { time, day };
}

function persistClient(client: Client): void {
  if (!client.lobby) return;
  const worldKey = normalizeWorldName(client.lobby.name);
  const existingPlayer = loadPlayerData(worldKey, client.playerId);
  const position = isSavedPositionSafe(client.lobby, client.x, client.y)
    ? { x: client.x, y: client.y }
    : existingPlayer && isSavedPositionSafe(client.lobby, existingPlayer.x, existingPlayer.y)
      ? { x: existingPlayer.x, y: existingPlayer.y }
      : typeof client.spawnX === 'number' && typeof client.spawnY === 'number' && isSavedPositionSafe(client.lobby, client.spawnX, client.spawnY)
        ? { x: client.spawnX, y: client.spawnY }
        : assignFirstTimePlayerSpawn(client.lobby, client.playerId);
  savePlayerData(worldKey, client.playerId, {
    playerId: client.playerId,
    x: Math.round(position.x * 10) / 10,
    y: Math.round(position.y * 10) / 10,
    spawnX: typeof client.spawnX === 'number' ? Math.round(client.spawnX * 10) / 10 : undefined,
    spawnY: typeof client.spawnY === 'number' ? Math.round(client.spawnY * 10) / 10 : undefined,
    facingRight: client.facingRight,
    health: client.health,
    maxHealth: client.maxHealth,
    food: client.food,
    stamina: client.stamina,
    isAlive: client.isAlive,
    inventory: client.inventory.toJSON(),
    processedChestRequestIds: Array.from(client.processedChestRequestIds ?? []).slice(-512),
    processedObjectRequestIds: Array.from(client.processedObjectRequestIds ?? []).slice(-512),
    lastSavedAt: Date.now(),
  });
  client.lastSavedAt = Date.now();
}

function persistLobby(lobby: Lobby): void {
  const worldKey = normalizeWorldName(lobby.name);
  saveWorldData(worldKey, {
    id: lobby.id,
    name: lobby.name,
    seed: lobby.seed,
    createdAt: lobby.createdAt,
    activeTimeElapsedSec: lobby.activeTimeElapsedSec,
    blockModifications: Array.from(lobby.blockModifications.values()),
    killedWildlifeIds: Array.from(lobby.killedWildlifeIds),
    drops: Array.from(lobby.drops.values()),
    chests: Array.from(lobby.chests.values()),
    worldObjects: Array.from(lobby.worldObjects.values()),
    protectors: Array.from(lobby.protectors ? lobby.protectors.values() : []),
    firstChestPlacedPlayers: Array.from(lobby.firstChestPlacedPlayers ? lobby.firstChestPlacedPlayers : []),
    spawnedPlayerPositions: Array.from(lobby.spawnedPlayerPositions ? lobby.spawnedPlayerPositions.entries() : []).map(([playerId, pos]) => ({
      playerId,
      x: Math.round(pos.x * 10) / 10,
      y: Math.round(pos.y * 10) / 10,
    })),
    nextDropId: lobby.nextDropId,
    lastSavedAt: Date.now(),
  });
  lobby.worldDirty = false;
}

export function getProtectorZoneAt(lobby: Lobby, bx: number, by: number): ProtectorZone | null {
  for (const protector of lobby.protectors.values()) {
    if (Math.abs(bx - protector.x) <= PROTECTOR_RADIUS_BLOCKS && Math.abs(by - protector.y) <= PROTECTOR_RADIUS_BLOCKS) {
      return protector;
    }
  }
  return null;
}

function isSpawnSeparated(lobby: Lobby, playerId: string, x: number, y: number, includeReservations = true): boolean {
  const minimumDistance = 8 * TILE_SIZE;
  if (includeReservations) {
    for (const [reservedPlayerId, position] of lobby.spawnedPlayerPositions ?? []) {
      if (reservedPlayerId !== playerId && Math.hypot(x - position.x, y - position.y) < minimumDistance) return false;
    }
  }
  for (const socket of lobby.players) {
    const active = clients.get(socket);
    if (active && active.playerId !== playerId && Math.hypot(x - active.x, y - active.y) < minimumDistance) return false;
  }
  return true;
}

function getProtectorZonesAt(lobby: Lobby, bx: number, by: number): ProtectorZone[] {
  return Array.from(lobby.protectors.values())
    .filter((protector) => Math.abs(bx - protector.x) <= PROTECTOR_RADIUS_BLOCKS && Math.abs(by - protector.y) <= PROTECTOR_RADIUS_BLOCKS)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function getUnauthorizedProtector(lobby: Lobby, playerId: string, bx: number, by: number): ProtectorZone | null {
  // In overlapping zones, every owner must authorize edits. This prevents a
  // player's own overlapping Protector from bypassing another owner's claim.
  return getProtectorZonesAt(lobby, bx, by).find((protector) => protector.ownerPlayerId !== playerId) ?? null;
}

function updateProtectedAreaPresence(client: Client): void {
  const lobby = client.lobby;
  if (!lobby) return;
  const bx = Math.floor((client.x + PLAYER_WIDTH / 2) / TILE_SIZE);
  const by = Math.floor((client.y + PLAYER_HEIGHT / 2) / TILE_SIZE);
  const current = new Map<string, string>();
  for (const protector of getProtectorZonesAt(lobby, bx, by)) {
    current.set(protector.ownerPlayerId, protector.ownerDisplayName);
  }
  const previous = client.protectedAreaOwners ?? new Map<string, string>();
  for (const [ownerId, ownerName] of previous) {
    if (!current.has(ownerId)) sendClientNotice(client, `You exited ${ownerName}'s protected area.`);
  }
  client.protectedAreaOwners = current;
}

function sendClientNotice(client: Client, message: string): void {
  // Reuse the existing notice protocol consumed by the game UI.
  const socket = Array.from(client.lobby?.players ?? []).find((candidate) => clients.get(candidate) === client);
  if (socket) send(socket, { type: 'notice', message });
}

function getTileAt(lobby: Lobby, bx: number, by: number): TileType {
  const key = `${bx},${by}`;
  const mod = lobby.blockModifications.get(key);
  if (mod !== undefined) return mod.tile;
  const base = lobby.terrainGen.getBaseTile(bx, by);
  if (base !== TileType.AIR) return base;
  const treeTile = lobby.terrainGen.getTreeTileAt(bx, by);
  if (treeTile !== TileType.AIR) return treeTile;
  if (by === lobby.terrainGen.getSurfaceHeight(bx) - 1) {
    const foliage = lobby.terrainGen.getSurfaceFoliage(bx);
    if (foliage !== TileType.AIR) return foliage;
  }
  return lobby.terrainGen.getCaveDecorationAt(bx, by);
}

function chestIdAt(lobby: Lobby, bx: number, by: number): string {
  return makeWorldChestId(normalizeWorldName(lobby.name), lobby.seed, bx, by);
}

function isChestInRange(client: Client, chest: WorldChest): boolean {
  const px = client.x + PLAYER_WIDTH / 2;
  const py = client.y + PLAYER_HEIGHT / 2;
  return Math.hypot(chest.x * TILE_SIZE + TILE_SIZE / 2 - px, chest.y * TILE_SIZE + TILE_SIZE / 2 - py) <= 6 * TILE_SIZE;
}

function isWorldObjectInRange(client: Client, object: Pick<InteractiveObjectState, 'x' | 'y'>): boolean {
  const px = client.x + PLAYER_WIDTH / 2;
  const py = client.y + PLAYER_HEIGHT / 2;
  return Math.hypot(object.x * TILE_SIZE + TILE_SIZE / 2 - px, object.y * TILE_SIZE + TILE_SIZE / 2 - py) <= 6 * TILE_SIZE;
}

function pressurePlateContacts(client: Client, lobby: Lobby): Set<string> {
  const contacts = new Set<string>();
  const feetY = client.y + PLAYER_HEIGHT;
  const plateY = Math.round(feetY / TILE_SIZE);
  if (Math.abs(feetY - plateY * TILE_SIZE) > 3) return contacts;
  const left = Math.floor(client.x / TILE_SIZE);
  const right = Math.floor((client.x + PLAYER_WIDTH - 0.01) / TILE_SIZE);
  for (let x = left; x <= right; x++) {
    if (!isPlayerTouchingPressurePlate(client.x, client.y, PLAYER_WIDTH, PLAYER_HEIGHT, x, plateY)) continue;
    const id = worldObjectId(lobby.seed, x, plateY, 'pressure_plate');
    const object = lobby.worldObjects.get(id);
    const tile = getTileAt(lobby, x, plateY);
    if (object?.type === 'pressure_plate' && (tile === TileType.PRESSURE_PLATE || tile === TileType.PRESSURE_PLATE_PRESSED)) contacts.add(id);
  }
  return contacts;
}

function refreshPressurePlateState(lobby: Lobby, objectId: string): void {
  const object = lobby.worldObjects.get(objectId);
  if (!object || object.type !== 'pressure_plate') return;
  const pressed = (lobby.pressurePlateOccupants.get(objectId)?.size ?? 0) > 0;
  if (object.active === pressed) return;
  object.active = pressed;
  object.interactionRevision++;
  const modification: BlockModification = { x: object.x, y: object.y, tile: pressed ? TileType.PRESSURE_PLATE_PRESSED : TileType.PRESSURE_PLATE };
  lobby.blockModifications.set(`${object.x},${object.y}`, modification);
  lobby.worldDirty = true;
  persistLobby(lobby);
  for (const player of lobby.players) {
    send(player, { type: 'world_object_updated', object });
    send(player, { type: 'block_changed', ...modification });
  }
}

function updatePressurePlateOccupancy(client: Client, nextIds: Set<string>): void {
  const lobby = client.lobby;
  if (!lobby) return;
  const previousIds = client.occupiedPressurePlateIds ?? new Set<string>();
  for (const id of previousIds) {
    if (nextIds.has(id)) continue;
    const occupants = lobby.pressurePlateOccupants.get(id);
    occupants?.delete(client);
    if (!occupants?.size) lobby.pressurePlateOccupants.delete(id);
    refreshPressurePlateState(lobby, id);
  }
  for (const id of nextIds) {
    if (previousIds.has(id)) continue;
    let occupants = lobby.pressurePlateOccupants.get(id);
    if (!occupants) lobby.pressurePlateOccupants.set(id, occupants = new Set());
    occupants.add(client);
    refreshPressurePlateState(lobby, id);
  }
  client.occupiedPressurePlateIds = nextIds;
}

function removePressurePlateOccupants(lobby: Lobby, objectId: string): void {
  for (const occupant of lobby.pressurePlateOccupants.get(objectId) ?? []) occupant.occupiedPressurePlateIds?.delete(objectId);
  lobby.pressurePlateOccupants.delete(objectId);
}

function resetPressurePlatesWithoutOccupants(lobby: Lobby): void {
  for (const object of lobby.worldObjects.values()) {
    if (object.type !== 'pressure_plate') continue;
    const tile = getTileAt(lobby, object.x, object.y);
    if (object.active || tile === TileType.PRESSURE_PLATE_PRESSED) {
      object.active = false;
      object.interactionRevision++;
      lobby.blockModifications.set(`${object.x},${object.y}`, { x: object.x, y: object.y, tile: TileType.PRESSURE_PLATE });
      lobby.worldDirty = true;
    }
  }
}

function containerIdAt(lobby: Lobby, x: number, y: number, tile = getTileAt(lobby, x, y)): string {
  return tile === TileType.CHEST ? chestIdAt(lobby, x, y) : worldObjectId(lobby.seed, x, y, 'furnace');
}

function restoreWorldObjects(seed: number, mods: BlockModification[], saved: unknown): Map<string, InteractiveObjectState> {
  const restored = new Map<string, InteractiveObjectState>();
  if (Array.isArray(saved)) {
    for (const entry of saved) {
      const object = sanitizeWorldObject(entry);
      if (object && mods.some((mod) => mod.x === object.x && mod.y === object.y && objectTypeForTile(mod.tile) === object.type)) restored.set(object.id, object);
    }
  }
  // Backfill legacy placed objects with their deterministic default state.
  for (const mod of mods) {
    const type = objectTypeForTile(mod.tile);
    if (!type) continue;
    const object = makeWorldObject(seed, mod.x, mod.y, type);
    if (!restored.has(object.id)) restored.set(object.id, object);
  }
  return restored;
}

function isPositionSafe(lobby: Lobby, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 10_000_000 || Math.abs(y) > 10_000_000) return false;
  const minBx = Math.floor(x / TILE_SIZE);
  const maxBx = Math.floor((x + 13) / TILE_SIZE);
  const minBy = Math.floor(y / TILE_SIZE);
  const maxBy = Math.floor((y + 25) / TILE_SIZE);

  for (let bx = minBx; bx <= maxBx; bx++) {
    for (let by = minBy; by <= maxBy; by++) {
      const tile = getTileAt(lobby, bx, by);
      if (BLOCK_CONFIGS[tile]?.isSolid || tile === TileType.WATER) {
        return false;
      }
    }
  }
  return true;
}

function isSavedPositionSafe(lobby: Lobby, x: number, y: number): boolean {
  if (!isPositionSafe(lobby, x, y)) return false;
  const minBx = Math.floor(x / TILE_SIZE);
  const maxBx = Math.floor((x + 13) / TILE_SIZE);
  const minBy = Math.floor(y / TILE_SIZE);
  const maxBy = Math.floor((y + 25) / TILE_SIZE);
  for (let bx = minBx; bx <= maxBx; bx++) {
    for (let by = minBy; by <= maxBy; by++) {
      if (getProtectorZoneAt(lobby, bx, by)) return false;
    }
  }
  return true;
}

function findSafeSpawnPosition(lobby: Lobby, initialX: number, initialY: number): { x: number; y: number } {
  if (isPositionSafe(lobby, initialX, initialY)) {
    return { x: initialX, y: initialY };
  }
  for (let dyBlocks = -1; dyBlocks >= -12; dyBlocks--) {
    const testY = initialY + dyBlocks * TILE_SIZE;
    if (isPositionSafe(lobby, initialX, testY)) {
      return { x: initialX, y: testY };
    }
  }
  for (let dxBlocks = -6; dxBlocks <= 6; dxBlocks++) {
    for (let dyBlocks = -6; dyBlocks <= 6; dyBlocks++) {
      const testX = initialX + dxBlocks * TILE_SIZE;
      const testY = initialY + dyBlocks * TILE_SIZE;
      if (isPositionSafe(lobby, testX, testY)) {
        return { x: testX, y: testY };
      }
    }
  }
  const blockX = Math.floor((initialX + 7) / TILE_SIZE);
  const surfaceY = lobby.terrainGen.getSurfaceHeight(blockX);
  const fallbackY = (surfaceY - 2) * TILE_SIZE;
  if (isPositionSafe(lobby, initialX, fallbackY)) {
    return { x: initialX, y: fallbackY };
  }
  for (let dy = -1; dy >= -15; dy--) {
    const testY = fallbackY + dy * TILE_SIZE;
    if (isPositionSafe(lobby, initialX, testY)) {
      return { x: initialX, y: testY };
    }
  }
  for (let dx = -3; dx <= 3; dx++) {
    const testX = initialX + dx * TILE_SIZE;
    const sY = lobby.terrainGen.getSurfaceHeight(Math.floor((testX + 7) / TILE_SIZE));
    const testY = (sY - 2) * TILE_SIZE;
    if (isPositionSafe(lobby, testX, testY)) {
      return { x: testX, y: testY };
    }
  }
  if (Math.abs(initialX) < 100) {
    const spawnSurface = lobby.terrainGen.getSurfaceHeight(0);
    return { x: 0, y: (spawnSurface - 2) * TILE_SIZE };
  }
  return { x: initialX, y: fallbackY };
}

function isColumnSafeForSpawn(lobby: Lobby, bx: number): { safe: boolean; surfaceY: number } {
  const surfaceY = lobby.terrainGen.getSurfaceHeight(bx);
  if (surfaceY < 15 || surfaceY > 240) return { safe: false, surfaceY };

  const biome = lobby.terrainGen.getColumnBiome(bx);
  if (biome.id === 'OCEAN' || biome.id === 'DEEP_OCEAN' || biome.id === 'FROZEN_OCEAN' || biome.waterLevel !== undefined) {
    return { safe: false, surfaceY };
  }

  for (let dx = -3; dx <= 3; dx++) {
    const colY = lobby.terrainGen.getSurfaceHeight(bx + dx);
    if (colY !== surfaceY) return { safe: false, surfaceY };

    const groundTile = getTileAt(lobby, bx + dx, surfaceY);
    if (!BLOCK_CONFIGS[groundTile]?.isSolid || groundTile === TileType.WATER || groundTile === TileType.MAGMA || groundTile === TileType.AIR) {
      return { safe: false, surfaceY };
    }

    for (let dy = 1; dy <= 4; dy++) {
      const tileAbove = getTileAt(lobby, bx + dx, surfaceY - dy);
      if (tileAbove !== TileType.AIR) {
        return { safe: false, surfaceY };
      }
    }
  }

  if (getProtectorZoneAt(lobby, bx, surfaceY) !== null) {
    return { safe: false, surfaceY };
  }

  return { safe: true, surfaceY };
}

function getSafeLandSpawnCandidate(lobby: Lobby, bx: number): { x: number; y: number } | null {
  const surfaceY = lobby.terrainGen.getSurfaceHeight(bx);
  if (surfaceY < 15 || surfaceY > 240) return null;
  const biome = lobby.terrainGen.getColumnBiome(bx);
  if (biome.id === 'OCEAN' || biome.id === 'DEEP_OCEAN' || biome.id === 'FROZEN_OCEAN' || biome.waterLevel !== undefined) return null;
  const ground = getTileAt(lobby, bx, surfaceY);
  if (!BLOCK_CONFIGS[ground]?.isSolid || ground === TileType.WATER || ground === TileType.MAGMA || ground === TileType.AIR) return null;

  const x = bx * TILE_SIZE;
  const y = (surfaceY - 2) * TILE_SIZE;
  if (!isPositionSafe(lobby, x, y)) return null;
  const minBx = Math.floor(x / TILE_SIZE);
  const maxBx = Math.floor((x + 13) / TILE_SIZE);
  const minBy = Math.floor(y / TILE_SIZE);
  const maxBy = Math.floor((y + 25) / TILE_SIZE);
  for (let checkX = minBx; checkX <= maxBx; checkX++) {
    for (let checkY = minBy; checkY <= maxBy; checkY++) {
      if (getProtectorZoneAt(lobby, checkX, checkY)) return null;
    }
  }
  return { x, y };
}

function hasNearbyFarmableGround(lobby: Lobby, x: number, y: number): boolean {
  const centerX = x + 7;
  const centerY = y + 13;
  const playerBlockX = Math.floor(centerX / TILE_SIZE);
  const playerBlockY = Math.floor(centerY / TILE_SIZE);
  let hasDirt = false;
  let hasGrass = false;
  for (let dx = -6; dx <= 6; dx++) {
    for (let dy = -6; dy <= 6; dy++) {
      const blockX = playerBlockX + dx;
      const blockY = playerBlockY + dy;
      const distance = Math.hypot((blockX * TILE_SIZE + TILE_SIZE / 2) - centerX, (blockY * TILE_SIZE + TILE_SIZE / 2) - centerY);
      if (distance > 6 * TILE_SIZE) continue;
      const tile = getTileAt(lobby, blockX, blockY);
      if (tile === TileType.DIRT) hasDirt = true;
      if (tile === TileType.GRASS) hasGrass = true;
      if (hasDirt && hasGrass) return true;
    }
  }
  return false;
}

export function assignFirstTimePlayerSpawn(lobby: Lobby, playerId: string): { x: number; y: number } {
  if (!lobby.spawnedPlayerPositions) {
    lobby.spawnedPlayerPositions = new Map();
  }
  const previous = lobby.spawnedPlayerPositions.get(playerId);
  if (previous && isPositionSafe(lobby, previous.x, previous.y) && isSpawnSeparated(lobby, playerId, previous.x, previous.y)) return previous;

  const sectorIndex = lobby.spawnedPlayerPositions.size;
  const direction = (sectorIndex % 2 === 0) ? 1 : -1;
  const step = Math.floor(sectorIndex / 2);
  const candidateBlockX = sectorIndex === 0 ? 0 : direction * (step * 3);

  let targetBx = candidateBlockX;
  let targetSurfaceY = lobby.terrainGen.getSurfaceHeight(targetBx);
  let foundSafe = false;

  for (let delta = 0; delta <= 250; delta++) {
    for (const sign of [1, -1]) {
      const testBx = candidateBlockX + delta * sign;
      const check = isColumnSafeForSpawn(lobby, testBx);
      if (check.safe && isSpawnSeparated(lobby, playerId, testBx * TILE_SIZE, (check.surfaceY - 2) * TILE_SIZE) &&
        hasNearbyFarmableGround(lobby, testBx * TILE_SIZE, (check.surfaceY - 2) * TILE_SIZE)) {
        targetBx = testBx;
        targetSurfaceY = check.surfaceY;
        foundSafe = true;
        break;
      }
    }
    if (foundSafe) break;
  }

  if (!foundSafe) {
    // Continue the preferred flat, clear-ground search across a wider range
    // before considering a rougher but still collision-free land candidate.
    for (let delta = 251; delta <= 20_000 && !foundSafe; delta++) {
      for (const sign of [1, -1]) {
        const testBx = candidateBlockX + delta * sign;
        const check = isColumnSafeForSpawn(lobby, testBx);
        if (check.safe && isSpawnSeparated(lobby, playerId, testBx * TILE_SIZE, (check.surfaceY - 2) * TILE_SIZE) &&
          hasNearbyFarmableGround(lobby, testBx * TILE_SIZE, (check.surfaceY - 2) * TILE_SIZE)) {
          targetBx = testBx;
          targetSurfaceY = check.surfaceY;
          foundSafe = true;
          break;
        }
      }
    }
    // Flat terrain is only a preference. For seeds with no clear flat patch,
    // choose stable land after checking the actual player bounds and water.
    for (let delta = 0; delta <= 20_000 && !foundSafe; delta++) {
      for (const sign of [1, -1]) {
        const testBx = candidateBlockX + delta * sign;
        const candidate = getSafeLandSpawnCandidate(lobby, testBx);
        if (candidate && isSpawnSeparated(lobby, playerId, candidate.x, candidate.y) && hasNearbyFarmableGround(lobby, candidate.x, candidate.y)) {
          targetBx = testBx;
          targetSurfaceY = lobby.terrainGen.getSurfaceHeight(testBx);
          foundSafe = true;
          break;
        }
      }
    }
    if (!foundSafe) throw new Error(`Unable to find a safe separated spawn for ${playerId}`);
  }

  const px = targetBx * TILE_SIZE;
  const py = (targetSurfaceY - 2) * TILE_SIZE;
  const safePos = findSafeSpawnPosition(lobby, px, py);
  if (!isSpawnSeparated(lobby, playerId, safePos.x, safePos.y)) {
    throw new Error(`Safe spawn adjustment overlapped another player for ${playerId}`);
  }

  lobby.spawnedPlayerPositions.set(playerId, safePos);
  return safePos;
}

function updateServerAnimal(animal: ServerWildlifeAnimal, dt: number, terrainGen: TerrainGenerator, lobby: Lobby) {
  if (!animal.isAlive || animal.health <= 0 || !lobby.wildlife.has(animal.id)) {
    resetServerAnimalCombatState(animal);
    return;
  }
  if (animal.hurtTimer > 0) animal.hurtTimer = Math.max(0, animal.hurtTimer - dt);
  animal.attackCooldown = Math.max(0, (animal.attackCooldown ?? 0) - dt);
  animal.animTimer += dt * (animal.state === 'wander' || animal.state === 'chase' ? 7 : 2);

  if (CARNIVORE_SPECIES.has(animal.species)) {
    let target: Client | undefined;
    let targetSocket: WebSocket | undefined;
    let nearest = Infinity;
    const animalBx = Math.floor((animal.x + animal.width / 2) / TILE_SIZE);
    const animalBy = Math.floor((animal.y + animal.height / 2) / TILE_SIZE);
    const animalProtectors = getProtectorZonesAt(lobby, animalBx, animalBy);
    for (const socket of lobby.players) {
      const candidate = clients.get(socket);
      if (!candidate?.isAlive || candidate.health <= 0) continue;
      if (animalProtectors.some((protector) => protector.ownerPlayerId !== candidate.playerId)) continue;
      const dx = candidate.x + PLAYER_WIDTH / 2 - (animal.x + animal.width / 2);
      const dy = candidate.y + PLAYER_HEIGHT / 2 - (animal.y + animal.height / 2);
      const distance = Math.hypot(dx, dy);
      if (distance < nearest) {
        nearest = distance;
        target = candidate;
        targetSocket = socket;
      }
    }

    const aggroRange = animal.species === 'lion' ? 300 : animal.species === 'wolf' ? 260 : animal.species === 'bear' ? 230 : 200;
    if (target && nearest <= aggroRange) {
      const oldTargetPlayerId = animal.targetPlayerId;
      const oldTargetLifeId = animal.targetLifeId;
      const oldState = animal.state;
      if (animal.targetPlayerId !== target.playerId) {
        animal.attackCooldown = 0;
      }
      animal.targetPlayerId = target.playerId;
      animal.targetLifeId = target.lifeId;
      if (oldTargetPlayerId !== target.playerId || oldTargetLifeId !== target.lifeId) {
        debugCombat('animal.target-acquired', { playerId: target.playerId, lifeId: target.lifeId, animalId: animal.id, health: target.health, alive: target.isAlive, animalState: animal.state, previousTargetPlayerId: oldTargetPlayerId, previousTargetLifeId: oldTargetLifeId, distance: Math.round(nearest), position: { x: target.x, y: target.y } });
      }
      const animalX = animal.x + animal.width / 2;
      const animalY = animal.y + animal.height / 2;
      const playerX = target.x + PLAYER_WIDTH / 2;
      const playerY = target.y + PLAYER_HEIGHT / 2;
      const dx = playerX - animalX;
      const dy = playerY - animalY;
      animal.direction = dx >= 0 ? 1 : -1;
      animal.state = 'chase';
      animal.stateTimer = 0.3;

      // Aggro range drives pursuit only. Damage requires the server-side
      // player and animal hitboxes to touch, preventing remote hits when a
      // chased player has already moved away.
      const hitPaddingX = 14;
      const hitPaddingY = 14;
      const touchingPlayer =
        target.x < animal.x + animal.width + hitPaddingX &&
        target.x + PLAYER_WIDTH + hitPaddingX > animal.x &&
        target.y < animal.y + animal.height + hitPaddingY &&
        target.y + PLAYER_HEIGHT + hitPaddingY > animal.y;
      // A target id survives respawn. Bind each encounter to the life that
      // acquired it and re-check current target/life/range at hit time.
      const validTarget = isValidServerWildlifeTarget(animal, target, lobby.wildlife.get(animal.id));
      if (touchingPlayer && validTarget && lobby.wildlife.get(animal.id) === animal && animal.isAlive) {
        if (oldState !== 'attack') debugCombat('animal.attack-start', { playerId: target.playerId, lifeId: target.lifeId, animalId: animal.id, health: target.health, alive: target.isAlive, distance: Math.round(nearest), animalPosition: { x: animal.x, y: animal.y }, playerPosition: { x: target.x, y: target.y }, validTarget });
        animal.state = 'attack';
        if (animal.attackCooldown <= 0 && targetSocket) {
          const now = Date.now();
          if (!target.lastWildlifeDamageAt || now - target.lastWildlifeDamageAt >= 650) {
            const damage = SPECIES_DAMAGE[animal.species] ?? 16;
            target.health = Math.max(0, target.health - damage);
            target.isAlive = target.health > 0;
            debugCombat('damage.server-accepted', { playerId: target.playerId, lifeId: target.lifeId, animalId: animal.id, health: target.health, alive: target.isAlive, damage, animalPosition: { x: animal.x, y: animal.y }, playerPosition: { x: target.x, y: target.y }, touchingPlayer, validTarget });
            target.lastWildlifeDamageAt = now;
            markClientDamaged(target, now);
            animal.attackCooldown = SPECIES_ATTACK_COOLDOWN[animal.species] ?? 0.85;
            const update = {
              type: 'player_health_changed', playerId: target.playerId,
              lifeId: target.lifeId,
              displayName: target.displayName, health: target.health,
              maxHealth: target.maxHealth, isAlive: target.isAlive,
              damage, sourceX: animalX,
            };
            for (const socket of lobby.players) send(socket, update);
            if (!target.isAlive) {
              debugCombat('death.server-wildlife', { playerId: target.playerId, lifeId: target.lifeId, animalId: animal.id, health: target.health, alive: false, x: target.x, y: target.y });
              clearServerWildlifeTargeting(lobby, target.playerId);
              target.lastWildlifeDamageAt = undefined;
              updatePressurePlateOccupancy(target, new Set());
              persistClient(target);
            }
          }
          else if (!target.lastWildlifeDamageAt || now - target.lastWildlifeDamageAt < 650) {
            debugCombat('damage.server-throttled', { playerId: target.playerId, lifeId: target.lifeId, animalId: animal.id, health: target.health, alive: target.isAlive, reason: 'lastWildlifeDamageAt cooldown', elapsedMs: target.lastWildlifeDamageAt ? now - target.lastWildlifeDamageAt : null, touchingPlayer, validTarget });
          }
        }
      } else {
        if (oldState === 'attack') debugCombat('animal.attack-cancelled', { playerId: target.playerId, lifeId: target.lifeId, animalId: animal.id, health: target.health, alive: target.isAlive, reason: !touchingPlayer ? 'hitboxes-separated' : !validTarget ? 'target-invalid' : 'animal-unregistered-or-dead', distance: Math.round(nearest), playerPosition: { x: target.x, y: target.y } });
        const speed = (SPECIES_SPEED[animal.species] || 24) * 1.35;
        const nextX = animal.x + animal.direction * speed * dt;
        const tileX = Math.floor((nextX + animal.width / 2) / TILE_SIZE);
        const nextY = terrainGen.getSurfaceHeight(tileX) * TILE_SIZE - animal.height;
        if (Math.abs(nextY - animal.y) <= TILE_SIZE * 3.5) animal.y = nextY;
        animal.x = nextX;
      }
      return;
    }
  }

  if (animal.targetPlayerId) {
    debugCombat('animal.attack-cancelled', { playerId: animal.targetPlayerId, lifeId: animal.targetLifeId ?? null, animalId: animal.id, health: null, alive: null, reason: 'target-no-longer-acquired-or-out-of-range', previousState: animal.state });
    animal.targetPlayerId = undefined;
    animal.attackCooldown = 0;
  }
  if (animal.state === 'chase' || animal.state === 'attack') {
    animal.state = 'idle';
    animal.stateTimer = 1;
  }
  animal.stateTimer -= dt;
  if (animal.stateTimer <= 0) {
    if (animal.state === 'idle') {
      animal.state = 'wander';
      animal.direction = Math.random() < 0.5 ? -1 : 1;
      animal.stateTimer = 0.8 + Math.random() * 2.2;
    } else {
      animal.state = 'idle';
      animal.stateTimer = 0.7 + Math.random() * 2.5;
    }
  }
  if (animal.state !== 'wander') return;

  const minX = animal.ownerChunkX * CHUNK_WIDTH * TILE_SIZE + 1;
  const maxX = (animal.ownerChunkX + 1) * CHUNK_WIDTH * TILE_SIZE - animal.width - 1;
  const speed = SPECIES_SPEED[animal.species] || 24;
  const nextX = Math.max(minX, Math.min(maxX, animal.x + animal.direction * speed * dt));

  if (animal.species === 'fish') {
    if (nextX <= minX || nextX >= maxX) {
      animal.direction = animal.direction === 1 ? -1 : 1;
      animal.state = 'idle';
      animal.stateTimer = 0.5 + Math.random();
    } else {
      animal.x = nextX;
    }
    return;
  }

  const proposedTileX = Math.floor((nextX + animal.width / 2) / TILE_SIZE);
  const biome = terrainGen.getColumnBiome(proposedTileX).id;
  if (!LAND_HABITATS[biome]?.includes(animal.species)) {
    animal.direction = animal.direction === 1 ? -1 : 1;
    animal.state = 'idle';
    animal.stateTimer = 0.4 + Math.random() * 1.3;
    return;
  }
  const groundY = terrainGen.getSurfaceHeight(proposedTileX);
  const nextY = groundY * TILE_SIZE - animal.height;
  if (Math.abs(nextY - animal.y) > TILE_SIZE * 1.25) {
    animal.direction = animal.direction === 1 ? -1 : 1;
    animal.state = 'idle';
    animal.stateTimer = 0.4 + Math.random() * 1.3;
    return;
  }
  animal.x = nextX;
  animal.y = nextY;
}

export function clearServerWildlifeTargeting(lobby: Lobby, playerId: string): void {
  const client = Array.from(lobby.players).map((socket) => clients.get(socket)).find((entry) => entry?.playerId === playerId);
  for (const animal of [...lobby.wildlife.values(), ...lobby.dormantWildlife.values()]) {
    if (animal.targetPlayerId !== playerId) continue;
    debugCombat('wildlife.cleanup', { playerId, lifeId: animal.targetLifeId ?? client?.lifeId ?? null, animalId: animal.id, health: client?.health ?? null, alive: client?.isAlive ?? null, reason: 'clearServerWildlifeTargeting' });
    resetServerAnimalCombatState(animal);
  }
}

/** Rejects an encounter retained across player lives or animal removal. */
export function isValidServerWildlifeTarget(
  animal: ServerWildlifeAnimal,
  target: Pick<Client, 'playerId' | 'lifeId' | 'isAlive' | 'health'>,
  registeredAnimal: ServerWildlifeAnimal | undefined,
): boolean {
  return registeredAnimal === animal && animal.isAlive && animal.health > 0 &&
    target.isAlive && target.health > 0 && animal.targetPlayerId === target.playerId &&
    animal.targetLifeId === target.lifeId;
}

function resetServerAnimalCombatState(animal: ServerWildlifeAnimal): void {
  if (animal.targetPlayerId || animal.state === 'attack' || animal.state === 'chase') {
    debugCombat('animal.attack-cancelled', { playerId: animal.targetPlayerId ?? null, lifeId: animal.targetLifeId ?? null, animalId: animal.id, health: null, alive: animal.isAlive, reason: 'resetServerAnimalCombatState', previousState: animal.state });
  }
  animal.targetPlayerId = undefined;
  animal.targetLifeId = undefined;
  animal.state = 'idle';
  animal.stateTimer = 1;
  animal.attackCooldown = 0;
}

function spawnWildlifeNearPlayers(lobby: Lobby) {
  const activeChunkKeys = new Set<string>();
  for (const socket of lobby.players) {
    const client = clients.get(socket);
    if (!client) continue;
    const pcx = Math.floor(client.x / (CHUNK_WIDTH * TILE_SIZE));
    const pcy = Math.floor(client.y / (CHUNK_HEIGHT * TILE_SIZE));
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        activeChunkKeys.add(`${pcx + dx},${pcy + dy}`);
      }
    }
  }

  for (const [id, animal] of lobby.wildlife.entries()) {
    const acx = Math.floor(animal.x / (CHUNK_WIDTH * TILE_SIZE));
    const acy = Math.floor(animal.y / (CHUNK_HEIGHT * TILE_SIZE));
    let near = false;
    for (const socket of lobby.players) {
      const client = clients.get(socket);
      if (!client) continue;
      const pcx = Math.floor(client.x / (CHUNK_WIDTH * TILE_SIZE));
      const pcy = Math.floor(client.y / (CHUNK_HEIGHT * TILE_SIZE));
      if (Math.abs(pcx - acx) <= 4 && Math.abs(pcy - acy) <= 4) {
        near = true;
        break;
      }
    }
    if (!near) {
      resetServerAnimalCombatState(animal);
      lobby.dormantWildlife.set(id, animal);
      lobby.wildlife.delete(id);
    }
  }

  if (lobby.wildlife.size >= 40) return;

  for (const key of activeChunkKeys) {
    if (lobby.wildlife.size >= 40) break;
    const [cx, cy] = key.split(',').map(Number);

    for (const [did, dormant] of lobby.dormantWildlife.entries()) {
      if (dormant.ownerChunkX === cx && dormant.ownerChunkY === cy) {
        lobby.wildlife.set(did, dormant);
        lobby.dormantWildlife.delete(did);
        if (lobby.wildlife.size >= 40) break;
      }
    }
    if (lobby.wildlife.size >= 40) break;

    for (let slot = 0; slot < 3 && lobby.wildlife.size < 40; slot++) {
      const id = `land:${cx}:${cy}:${slot}`;
      if (lobby.killedWildlifeIds.has(id) || lobby.wildlife.has(id) || lobby.dormantWildlife.has(id)) continue;
      const spawnRoll = hash32(lobby.seed, cx, cy, slot, 0x2f6e2b1) % 100;
      if (spawnRoll >= 48) continue;
      const xTile = cx * CHUNK_WIDTH + (hash32(lobby.seed, cx, cy, slot, 0x6c8e9cf) % CHUNK_WIDTH);
      const surfaceY = lobby.terrainGen.getSurfaceHeight(xTile);
      if (Math.floor(surfaceY / CHUNK_HEIGHT) !== cy) continue;
      const biome = lobby.terrainGen.getColumnBiome(xTile).id;
      const choices = LAND_HABITATS[biome];
      if (!choices || choices.length === 0) continue;
      const totalWeight = choices.reduce((sum, sp) => sum + SPECIES_WEIGHT[sp], 0);
      const roll = hash32(lobby.seed, cx, cy, slot, 0xa54ff53a) % totalWeight;
      let acc = 0;
      let species = choices[0];
      for (const sp of choices) {
        acc += SPECIES_WEIGHT[sp];
        if (roll < acc) {
          species = sp;
          break;
        }
      }
      const [width, height] = SPECIES_SIZE[species];
      const seedBits = hash32(lobby.seed, cx, cy, slot, 0xbb67ae85);
      const direction: -1 | 1 = seedBits & 1 ? 1 : -1;
      const y = surfaceY * TILE_SIZE - height;
      const x = xTile * TILE_SIZE + (TILE_SIZE - width) / 2;
      const maxHp = SPECIES_HEALTH[species];
      lobby.wildlife.set(id, {
        id,
        species,
        biome,
        ownerChunkX: cx,
        ownerChunkY: cy,
        x,
        y,
        width,
        height,
        direction,
        state: 'idle',
        stateTimer: 0.5 + ((seedBits >>> 1) % 2000) / 1000,
        animTimer: 0,
        randomState: seedBits || 1,
        homeX: x,
        homeY: y,
        health: maxHp,
        maxHealth: maxHp,
        hurtTimer: 0,
        attackCooldown: 0,
        isAlive: true,
      });
    }

    const fishId = `fish:${cx}:${cy}:0`;
    if (lobby.wildlife.size < 40 && !lobby.killedWildlifeIds.has(fishId) && !lobby.wildlife.has(fishId) && !lobby.dormantWildlife.has(fishId)) {
      if (hash32(lobby.seed, cx, cy, 0, 0x510e527f) % 100 < 60) {
        const xTile = cx * CHUNK_WIDTH + 1 + (hash32(lobby.seed, cx, cy, 0, 0x9b05688c) % (CHUNK_WIDTH - 2));
        const surfaceY = lobby.terrainGen.getSurfaceHeight(xTile);
        const biome = lobby.terrainGen.getColumnBiome(xTile).id;
        const river = lobby.terrainGen.getRiverAt(xTile);
        if (AQUATIC_BIOMES.has(biome) || river) {
          const yTile = river ? river.surfaceY + 1 : surfaceY + 2;
          const [width, height] = SPECIES_SIZE.fish;
          const maxHp = SPECIES_HEALTH.fish;
          const seedBits = hash32(lobby.seed, cx, cy, 0, 0x1f83d9ab);
          lobby.wildlife.set(fishId, {
            id: fishId,
            species: 'fish',
            biome,
            ownerChunkX: cx,
            ownerChunkY: cy,
            x: xTile * TILE_SIZE + (TILE_SIZE - width) / 2,
            y: yTile * TILE_SIZE + (TILE_SIZE - height) / 2,
            width,
            height,
            direction: seedBits & 1 ? 1 : -1,
            state: 'idle',
            stateTimer: 1.0,
            animTimer: 0,
            randomState: seedBits || 1,
            homeX: xTile * TILE_SIZE,
            homeY: yTile * TILE_SIZE,
            health: maxHp,
            maxHealth: maxHp,
            hurtTimer: 0,
            attackCooldown: 0,
            isAlive: true,
          });
        }
      }
    }
  }
}

function send(socket: WebSocket, message: Record<string, unknown>) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function lobbyUpdate(lobby: Lobby) {
  const message = { type: 'lobby_update', playerCount: lobby.players.size };
  for (const player of lobby.players) send(player, message);
}

export function getPlayerOnlineStatus(targetPlayerId: string): { isOnline: boolean; lobbyName?: string } {
  for (const [sock, c] of clients.entries()) {
    if (sock.readyState === WebSocket.OPEN && c.playerId === targetPlayerId) {
      return {
        isOnline: true,
        lobbyName: c.lobby?.name,
      };
    }
  }
  return { isOnline: false };
}

export function notifyPlayerFriends(targetPlayerId: string) {
  for (const [sock, c] of clients.entries()) {
    if (sock.readyState === WebSocket.OPEN && c.playerId === targetPlayerId) {
      const data = getPlayerFriendsWithStatus(c.playerId, c.displayName, getPlayerOnlineStatus);
      send(sock, { type: 'friends_list', ...data });
      send(sock, { type: 'friends_updated' });
    }
  }
}

export function resolveTargetPlayer(targetInput: string): { playerId: string; displayName: string } | null {
  const trimmed = targetInput.trim();
  if (!trimmed) return null;
  for (const c of clients.values()) {
    if (c.playerId.toLowerCase() === trimmed.toLowerCase() || c.displayName.toLowerCase() === trimmed.toLowerCase()) {
      return { playerId: c.playerId, displayName: c.displayName };
    }
  }
  for (const acc of authAccounts.values()) {
    if (acc.id.toLowerCase() === trimmed.toLowerCase() || acc.displayName.toLowerCase() === trimmed.toLowerCase()) {
      return { playerId: acc.id, displayName: acc.displayName };
    }
  }
  const robloxTarget = getRobloxAccountById(trimmed) || getRobloxAccountForToken(trimmed);
  if (robloxTarget) {
    return { playerId: robloxTarget.id, displayName: robloxTarget.displayName };
  }
  const store = loadFriendsStore();
  if (store.has(trimmed)) {
    const entry = store.get(trimmed)!;
    return { playerId: entry.playerId, displayName: entry.displayName };
  }
  for (const entry of store.values()) {
    if (entry.displayName.trim().toLowerCase() === trimmed.toLowerCase()) {
      return { playerId: entry.playerId, displayName: entry.displayName };
    }
  }
  return null;
}

function removeClient(socket: WebSocket) {
  const client = clients.get(socket);
  if (client) updatePressurePlateOccupancy(client, new Set());
  if (client?.pendingTeleportRequests) {
    for (const [requestId, request] of client.pendingTeleportRequests) {
      if (request.timeoutId) clearTimeout(request.timeoutId);
      send(request.requesterSocket, {
        type: 'teleport_request_result', requestId, accepted: false,
        reason: 'That player is no longer available.',
      });
    }
    client.pendingTeleportRequests.clear();
  }
  if (client?.lobby) {
    clearServerWildlifeTargeting(client.lobby, client.playerId);
    for (const playerSocket of client.lobby.players) {
      const player = clients.get(playerSocket);
      if (!player?.pendingTeleportRequests) continue;
      for (const [requestId, request] of player.pendingTeleportRequests) {
        if (request.requesterSocket === socket) {
          if (request.timeoutId) clearTimeout(request.timeoutId);
          player.pendingTeleportRequests.delete(requestId);
        }
      }
    }
  }
  clients.delete(socket);
  if (client) {
    for (const s of clients.keys()) {
      if (s.readyState === WebSocket.OPEN) {
        send(s, { type: 'friends_updated' });
      }
    }
  }
  if (!client?.lobby) return;
  if (client.leaderboardTimeAt) {
    const elapsed = connectedGameplaySeconds(client.leaderboardTimeAt, Date.now());
    if (elapsed > 0) addLeaderboardScore(client.playerId, client.displayName, 'time', elapsed);
    client.leaderboardTimeAt = undefined;
  }
  const lobby = client.lobby;
  persistClient(client);
  lobby.players.delete(socket);
  for (const player of lobby.players) send(player, { type: 'player_left', playerId: client.playerId });
  persistLobby(lobby);
  if (lobby.players.size > 0) {
    lobbyUpdate(lobby);
  }
}

export function setupMultiplayerWebSocket(httpServer: Server): WebSocketServer {
  const wsServer = new WebSocketServer({ noServer: true, maxPayload: 512 * 1024 });

  const tickInterval = setInterval(() => {
    const now = Date.now();
    rollDailyPeriod(now);
    for (const client of clients.values()) {
      if (!client.lobby) continue;
      updateProtectedAreaPresence(client);
      if (client.leaderboardTimeAt && now - client.leaderboardTimeAt >= 60_000) {
        const seconds = connectedGameplaySeconds(client.leaderboardTimeAt, now);
        addLeaderboardScore(client.playerId, client.displayName, 'time', seconds, now);
        client.leaderboardTimeAt = now;
      }
      if (!client.isAlive) continue;
      const regenState = getClientRegenerationState(client);
      if (regenState.lifeId !== client.lifeId) {
        resetHealthRegeneration(regenState, client.lifeId);
        storeClientRegenerationState(client, regenState);
      }
      const regeneratedHealth = regenerateHealth(regenState, client.health, client.maxHealth, client.isAlive, client.lifeId, now);
      if (regeneratedHealth !== client.health) {
        client.health = regeneratedHealth;
        storeClientRegenerationState(client, regenState);
        persistClient(client);
        const update = { type: 'player_health_changed', playerId: client.playerId, lifeId: client.lifeId, health: client.health, maxHealth: client.maxHealth, isAlive: true, healing: HEALTH_REGEN_AMOUNT, reason: 'regeneration' };
        for (const player of client.lobby.players) send(player, update);
      }
    }
    for (const lobby of lobbies.values()) {
      if (lobby.players.size === 0) continue;

      // Update active clock time
      const dt = (now - lobby.lastClockTickAt) / 1000;
      lobby.activeTimeElapsedSec += dt;
      lobby.lastClockTickAt = now;

      // 1. Time sync every 3s
      const lobbyTime = getLobbyTime(lobby);
      if (now - lobby.lastTimeSyncAt >= 3000) {
        lobby.lastTimeSyncAt = now;
        const timeMsg = { type: 'time_sync', time: lobbyTime.time, day: lobbyTime.day };
        for (const player of lobby.players) send(player, timeMsg);
      }

      // 2. Spawn and manage wildlife area every 1s
      if (now - lobby.lastWildlifeSpawnAt >= 1000) {
        lobby.lastWildlifeSpawnAt = now;
        spawnWildlifeNearPlayers(lobby);
      }

      // 3. Update active wildlife movement
      for (const animal of lobby.wildlife.values()) {
        updateServerAnimal(animal, 0.1, lobby.terrainGen, lobby);
      }

      // 4. Broadcast wildlife sync every 100ms
      if (now - lobby.lastWildlifeSyncAt >= 100) {
        lobby.lastWildlifeSyncAt = now;
        if (lobby.wildlife.size > 0) {
          const syncMsg = {
            type: 'wildlife_sync',
            animals: Array.from(lobby.wildlife.values()).map((a) => ({
              id: a.id,
              species: a.species,
              biome: a.biome,
              ownerChunkX: a.ownerChunkX,
              ownerChunkY: a.ownerChunkY,
              x: Math.round(a.x * 10) / 10,
              y: Math.round(a.y * 10) / 10,
              direction: a.direction,
              state: a.state,
              targetPlayerId: a.targetPlayerId,
              health: a.health,
              maxHealth: a.maxHealth,
            })),
          };
          for (const player of lobby.players) send(player, syncMsg);
        }
      }
    }
  }, 100);

  // Periodic autosave every 5 seconds for lobbies and players
  const autoSaveInterval = setInterval(() => {
    for (const lobby of lobbies.values()) {
      if (lobby.players.size > 0 || lobby.worldDirty) {
        persistLobby(lobby);
      }
    }
    for (const client of clients.values()) {
      if (client.lobby) {
        persistClient(client);
      }
    }
  }, 5000);

  wsServer.on('close', () => {
    clearInterval(tickInterval);
    clearInterval(autoSaveInterval);
  });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      const cleanPath = url.pathname.replace(/\/+$/, '') || '/';
      if (cleanPath === '/ws' || cleanPath === '/') {
        wsServer.handleUpgrade(request, socket, head, (ws) => {
          wsServer.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (err) {
      console.error('Error handling WebSocket upgrade:', err);
    }
  });

  wsServer.on('connection', (socket) => {
    const seedName = createRandomProfileName();
    clients.set(socket, {
      playerId: `player-${nextPlayerNumber++}`,
      displayName: seedName,
      x: 0,
      y: 0,
      facingRight: true,
      lastMoveAt: 0,
      lastSavedAt: 0,
      health: 100,
      maxHealth: 100,
      food: 100,
      stamina: 100,
      isAlive: true,
      lifeId: 0,
      regenLifeId: 0,
      inventory: new Inventory(),
      lastAttackAt: 0,
      processedAttackIds: new Set(),
      processedDropRequestIds: new Set(),
      processedChestRequestIds: new Set(),
      occupiedPressurePlateIds: new Set(),
      lastDropAt: 0,
    });
    socket.on('message', (data, isBinary) => {
      if (isBinary) { send(socket, { type: 'error', message: 'Only JSON text messages are supported.' }); return; }
      let message: unknown;
      try { message = JSON.parse(data.toString()); }
      catch { send(socket, { type: 'error', message: 'Malformed JSON message.' }); return; }
      if (!message || typeof message !== 'object' || Array.isArray(message)) {
        send(socket, { type: 'error', message: 'Message must be a JSON object.' }); return;
      }
      let request = message as Record<string, unknown>;
      const client = clients.get(socket);

      if (request.type === 'farm_till_dirt') {
        const rejected = (reason: string) => send(socket, { type: 'farm_rejected', reason, x: request.x, y: request.y, requestId: request.requestId });
        const lobby = client?.lobby;
        if (!lobby || !client.isAlive) { rejected('Cannot till soil while dead or outside a lobby.'); return; }
        if (typeof request.selectedSlotIndex !== 'number' || !Number.isInteger(request.selectedSlotIndex) ||
            !hasHoe(client, request.selectedSlotIndex)) { rejected('Select a Wooden Hoe to till soil.'); return; }
        if (typeof request.x !== 'number' || typeof request.y !== 'number' || typeof request.requestId !== 'string' || !/^[a-zA-Z0-9:_,-]{8,128}$/.test(request.requestId)) {
          rejected('Invalid till request.'); return;
        }
        const ids = client.processedObjectRequestIds ?? (client.processedObjectRequestIds = new Set<string>());
        if (ids.has(request.requestId)) { rejected('Repeated till request.'); return; }
        const bx = Math.round(Number(request.x));
        const by = Math.round(Number(request.y));
        const key = `${bx},${by}`;
        const protector = getUnauthorizedProtector(lobby, client.playerId, bx, by);
        if (protector) {
          rejected(`Protected by ${protector.ownerDisplayName}'s Protector.`); return;
        }
        const currentTile = getTileAt(lobby, bx, by);
        if ((currentTile !== TileType.DIRT && currentTile !== TileType.GRASS) || Math.hypot((bx * TILE_SIZE + TILE_SIZE / 2) - (client.x + PLAYER_WIDTH / 2), (by * TILE_SIZE + TILE_SIZE / 2) - (client.y + PLAYER_HEIGHT / 2)) > 6 * TILE_SIZE) {
          rejected('Target soil is invalid or out of reach.'); return;
        }
        lobby.blockModifications.set(key, { x: bx, y: by, tile: TileType.TILLED_SOIL });
        lobby.worldDirty = true;
        ids.add(request.requestId);
        while (ids.size > 512) ids.delete(ids.values().next().value as string);
        persistLobby(lobby);
        persistClient(client);
        const update = { type: 'block_changed', x: bx, y: by, tile: TileType.TILLED_SOIL, playerId: client.playerId };
        for (const player of lobby.players) send(player, update);
        return;
      }

      if (request.type === 'farm_plant_seed') {
        const rejected = (reason: string) => send(socket, { type: 'farm_rejected', reason, x: request.x, y: request.y, requestId: request.requestId });
        const lobby = client?.lobby;
        if (!lobby || !client.isAlive) { rejected('Cannot plant while dead or outside a lobby.'); return; }
        const seedType = request.seedType;
        const cropType = typeof seedType === 'string' ? FARM_SEED_TO_CROP[seedType as ItemType] : undefined;
        if (!cropType || typeof request.x !== 'number' || typeof request.y !== 'number' || typeof request.requestId !== 'string' || !/^[a-zA-Z0-9:_,-]{8,128}$/.test(request.requestId)) {
          rejected('Invalid planting request.'); return;
        }
        const ids = client.processedObjectRequestIds ?? (client.processedObjectRequestIds = new Set<string>());
        if (ids.has(request.requestId)) { rejected('Repeated planting request.'); return; }
        const bx = Math.round(Number(request.x));
        const by = Math.round(Number(request.y));
        const objectId = worldObjectId(lobby.seed, bx, by, 'crop');
        const protector = getUnauthorizedProtector(lobby, client.playerId, bx, by);
        if (protector) {
          rejected(`Protected by ${protector.ownerDisplayName}'s Protector.`); return;
        }
        if (Math.hypot((bx * TILE_SIZE + TILE_SIZE / 2) - (client.x + PLAYER_WIDTH / 2), (by * TILE_SIZE + TILE_SIZE / 2) - (client.y + PLAYER_HEIGHT / 2)) > 6 * TILE_SIZE || getTileAt(lobby, bx, by) !== TileType.TILLED_SOIL || lobby.worldObjects.has(objectId)) {
          rejected('Invalid crop location or crop already exists.'); return;
        }
        if ((client.inventory.counts[seedType as ItemType] ?? 0) < 1) { rejected('You do not have the required seed.'); return; }
        client.inventory.consumeItem(seedType as ItemType, 1);
        const object: InteractiveObjectState = {
          id: objectId,
          type: 'crop',
          seed: lobby.seed,
          x: bx,
          y: by,
          cropType,
          growthStage: 0,
          plantedAt: Date.now(),
          watered: false,
          wateredAt: 0,
          interactionRevision: 1,
          lastInteractedBy: client.playerId,
        };
        lobby.worldObjects.set(objectId, object);
        ids.add(request.requestId);
        while (ids.size > 512) ids.delete(ids.values().next().value as string);
        lobby.worldDirty = true;
        persistLobby(lobby);
        persistClient(client);
        send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
        for (const player of lobby.players) send(player, { type: 'world_object_updated', object });
        return;
      }

      if (request.type === 'farm_water_crop') {
        const rejected = (reason: string) => send(socket, { type: 'farm_rejected', reason, objectId: request.objectId, requestId: request.requestId });
        const lobby = client?.lobby;
        if (!lobby || !client.isAlive) { rejected('Cannot water crops while dead or outside a lobby.'); return; }
        if (typeof request.objectId !== 'string' || typeof request.requestId !== 'string' || !/^[a-zA-Z0-9:_,-]{8,128}$/.test(request.requestId)) { rejected('Invalid watering request.'); return; }
        const ids = client.processedObjectRequestIds ?? (client.processedObjectRequestIds = new Set<string>());
        if (ids.has(request.requestId)) { rejected('Repeated watering request.'); return; }
        const object = lobby.worldObjects.get(request.objectId);
        if (!object || object.type !== 'crop' || !object.cropType) { rejected('Crop does not exist.'); return; }
        if (!isWorldObjectInRange(client, object)) { rejected('Crop is out of range.'); return; }
        const protector = getUnauthorizedProtector(lobby, client.playerId, object.x, object.y);
        if (protector) {
          rejected(`Protected by ${protector.ownerDisplayName}'s Protector.`); return;
        }
        if (object.watered) { rejected('Crop is already watered for this cycle.'); return; }
        object.watered = true;
        object.wateredAt = Date.now();
        object.interactionRevision += 1;
        ids.add(request.requestId);
        while (ids.size > 512) ids.delete(ids.values().next().value as string);
        lobby.worldDirty = true;
        persistLobby(lobby);
        for (const player of lobby.players) send(player, { type: 'world_object_updated', object });
        return;
      }

      if (request.type === 'farm_harvest_crop') {
        const rejected = (reason: string) => send(socket, { type: 'farm_rejected', reason, objectId: request.objectId, requestId: request.requestId });
        const lobby = client?.lobby;
        if (!lobby || !client.isAlive) { rejected('Cannot harvest while dead or outside a lobby.'); return; }
        if (typeof request.objectId !== 'string' || typeof request.requestId !== 'string' || !/^[a-zA-Z0-9:_,-]{8,128}$/.test(request.requestId)) { rejected('Invalid harvest request.'); return; }
        const ids = client.processedObjectRequestIds ?? (client.processedObjectRequestIds = new Set<string>());
        if (ids.has(request.requestId)) { rejected('Repeated harvest request.'); return; }
        const object = lobby.worldObjects.get(request.objectId);
        if (!object || object.type !== 'crop' || !object.cropType) { rejected('Crop does not exist.'); return; }
        if (!isWorldObjectInRange(client, object)) { rejected('Crop is out of reach.'); return; }
        const protector = getUnauthorizedProtector(lobby, client.playerId, object.x, object.y);
        if (protector) {
          rejected(`Protected by ${protector.ownerDisplayName}'s Protector.`); return;
        }
        const stage = getCropGrowthStage(object, Date.now());
        if (stage < 2) { rejected('Crop is not mature.'); return; }
        const rewards = getFarmRewards(object.cropType, lobby.seed, object.x, object.y);
        lobby.worldObjects.delete(request.objectId);
        ids.add(request.requestId);
        while (ids.size > 512) ids.delete(ids.values().next().value as string);
        lobby.worldDirty = true;
        persistLobby(lobby);
        for (const player of lobby.players) send(player, { type: 'world_object_removed', objectId: request.objectId });
        for (const [item, count] of rewards) {
          if (client.inventory.addItem(item, count)) continue;
          const dropId = lobby.nextDropId++;
          const drop: LobbyDrop = { id: dropId, type: item, count, x: object.x * TILE_SIZE + 4, y: object.y * TILE_SIZE + 4 };
          lobby.drops.set(dropId, drop);
          for (const player of lobby.players) send(player, { type: 'drop_spawned', drop });
        }
        persistClient(client);
        send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
        return;
      }

      if (request.type === 'world_object_interact' || request.type === 'world_object_sign_update') {
        const rejected = (reason: string) => send(socket, { type: 'world_object_rejected', objectId: request.objectId, requestId: request.requestId, reason });
        const lobby = client?.lobby;
        if (!lobby || !client.isAlive) { rejected('Object interaction is unavailable while dead or outside a lobby.'); return; }
        if (typeof request.objectId !== 'string' || typeof request.requestId !== 'string' ||
            !/^[a-zA-Z0-9:_,-]{8,128}$/.test(request.requestId)) { rejected('Invalid object request.'); return; }
        const ids = client.processedObjectRequestIds ?? (client.processedObjectRequestIds = new Set<string>());
        if (ids.has(request.requestId)) { rejected('Repeated object request.'); return; }
        const object = lobby.worldObjects.get(request.objectId);
        if (!object || object.id !== worldObjectId(lobby.seed, object.x, object.y, object.type) ||
            object.id !== request.objectId || objectTypeForTile(getTileAt(lobby, object.x, object.y)) !== object.type) {
          rejected('World object does not exist.'); return;
        }
        if (!isWorldObjectInRange(client, object)) { rejected('World object is out of reach.'); return; }
        const protector = getUnauthorizedProtector(lobby, client.playerId, object.x, object.y);
        if (protector) {
          rejected(`Protected by ${protector.ownerDisplayName}'s Protector.`); return;
        }
        if (request.type === 'world_object_sign_update') {
          if (object.type !== 'sign' || typeof request.text !== 'string' || request.text.length > 180 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(request.text)) {
            rejected('Sign text is invalid or exceeds 180 characters.'); return;
          }
          object.text = sanitizeSignText(request.text);
        } else if (object.type === 'door') {
          object.open = !object.open;
          lobby.blockModifications.set(`${object.x},${object.y}`, { x: object.x, y: object.y, tile: object.open ? TileType.DOOR_OPEN : TileType.DOOR });
        } else if (object.type === 'trapdoor' || object.type === 'gate') {
          object.open = !object.open;
          const tile = object.type === 'trapdoor'
            ? object.open ? TileType.TRAPDOOR_OPEN : TileType.TRAPDOOR
            : object.open ? TileType.GATE_OPEN : TileType.GATE;
          lobby.blockModifications.set(`${object.x},${object.y}`, { x: object.x, y: object.y, tile });
        } else if (object.type === 'campfire' || object.type === 'lever') {
          object.active = !object.active;
          if (object.type === 'campfire') lobby.blockModifications.set(`${object.x},${object.y}`, { x: object.x, y: object.y, tile: object.active ? TileType.CAMPFIRE : TileType.CAMPFIRE_OFF });
          if (object.type === 'lever') lobby.blockModifications.set(`${object.x},${object.y}`, { x: object.x, y: object.y, tile: object.active ? TileType.LEVER_ON : TileType.LEVER });
        } else if (object.type !== 'sign' && object.type !== 'bed') {
          rejected('This object has no direct interaction.'); return;
        }
        ids.add(request.requestId);
        while (ids.size > 512) ids.delete(ids.values().next().value as string);
        object.interactionRevision++;
        object.lastInteractedBy = client.playerId;
        lobby.worldDirty = true;
        persistLobby(lobby);
        persistClient(client);
        const state = { type: 'world_object_updated', object };
        for (const player of lobby.players) {
          send(player, state);
          const modified = lobby.blockModifications.get(`${object.x},${object.y}`);
          if (modified && ['door', 'trapdoor', 'gate', 'campfire', 'lever'].includes(object.type)) send(player, { type: 'block_changed', ...modified, playerId: client.playerId });
        }
        if (object.type === 'sign' && request.type === 'world_object_interact') send(socket, { type: 'world_object_inspected', object });
        return;
      }

      if (request.type === 'chest_close') {
        if (client) client.openChestId = undefined;
        send(socket, { type: 'chest_closed' });
        return;
      }

      if (request.type === 'chest_open') {
        if (!client?.lobby || !client.isAlive || typeof request.chestId !== 'string') {
          send(socket, { type: 'chest_rejected', reason: 'Chest cannot be opened right now.' }); return;
        }
        const chest = client.lobby.chests.get(request.chestId);
        const containerTile = chest ? getTileAt(client.lobby, chest.x, chest.y) : TileType.AIR;
        if (!chest || (containerTile !== TileType.CHEST && containerTile !== TileType.FURNACE) || request.chestId !== containerIdAt(client.lobby, chest.x, chest.y, containerTile) || !isChestInRange(client, chest)) {
          send(socket, { type: 'chest_rejected', reason: 'Container is unavailable or out of reach.' }); return;
        }
        const chestProtector = getProtectorZoneAt(client.lobby, chest.x, chest.y);
        if (chestProtector && chestProtector.ownerPlayerId !== client.playerId) {
          send(socket, { type: 'chest_rejected', reason: `Container is in ${chestProtector.ownerDisplayName}'s protected territory.` });
          return;
        }
        client.openChestId = chest.id;
        send(socket, { type: 'chest_opened', chestId: chest.id, containerType: containerTile === TileType.FURNACE ? 'Furnace' : 'Chest', x: chest.x, y: chest.y, slots: chest.slots, revision: chest.revision });
        return;
      }

      if (request.type === 'chest_transfer') {
        if (!client?.lobby || !client.isAlive) { send(socket, { type: 'chest_rejected', reason: 'Cannot transfer items right now.' }); return; }
        const chestId = request.chestId;
        const requestId = request.requestId;
        const chest = typeof chestId === 'string' ? client.lobby.chests.get(chestId) : undefined;
        const ids = client.processedChestRequestIds ?? (client.processedChestRequestIds = new Set<string>());
        if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,96}$/.test(requestId) || ids.has(requestId)) {
          send(socket, { type: 'chest_rejected', chestId, reason: 'Invalid or repeated transfer request.', slots: chest?.slots, revision: chest?.revision }); return;
        }
        const from = request.from as ChestEndpoint;
        const to = request.to as ChestEndpoint;
        const containerTile = chest ? getTileAt(client.lobby, chest.x, chest.y) : TileType.AIR;
        if (!chest || client.openChestId !== chest.id || (containerTile !== TileType.CHEST && containerTile !== TileType.FURNACE) || !isChestInRange(client, chest)) {
          client.openChestId = undefined;
          send(socket, { type: 'chest_closed', reason: 'Chest is unavailable or out of reach.' }); return;
        }
        const chestProtector = getProtectorZoneAt(client.lobby, chest.x, chest.y);
        if (chestProtector && chestProtector.ownerPlayerId !== client.playerId) {
          send(socket, { type: 'chest_rejected', chestId: chest.id, reason: `Container is in ${chestProtector.ownerDisplayName}'s protected territory.`, slots: chest.slots, revision: chest.revision });
          return;
        }
        if (!from || !to || (from.kind !== 'chest' && to.kind !== 'chest') ||
            !transferChestItems(client.inventory, chest.slots, from, to,
              request.count === undefined ? undefined : typeof request.count === 'number' ? request.count : Number.NaN)) {
          send(socket, { type: 'chest_rejected', chestId: chest.id, reason: 'Transfer could not be completed.', slots: chest.slots, revision: chest.revision }); return;
        }
        ids.add(requestId);
        while (ids.size > 512) ids.delete(ids.values().next().value as string);
        chest.revision++;
        client.lobby.worldDirty = true;
        persistLobby(client.lobby);
        persistClient(client);
        send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
        const update = { type: 'chest_updated', chestId: chest.id, requestId, x: chest.x, y: chest.y, slots: chest.slots, revision: chest.revision };
        for (const player of client.lobby.players) send(player, update);
        return;
      }

      if (request.type === 'block_break') {
        if (!client?.lobby) { send(socket, { type: 'block_rejected', reason: 'Join a lobby before changing blocks.' }); return; }
        if (!client.isAlive) { send(socket, { type: 'block_rejected', reason: 'Cannot change blocks while dead.' }); return; }
        const { x, y } = request;
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || Math.abs(x as number) > MAX_BLOCK_COORDINATE || Math.abs(y as number) > MAX_BLOCK_COORDINATE) {
          send(socket, { type: 'block_rejected', reason: 'Block coordinates are invalid.' }); return;
        }
        const bx = x as number;
        const by = y as number;
        const key = `${bx},${by}`;

        const protector = getUnauthorizedProtector(client.lobby, client.playerId, bx, by);
        if (protector) {
          send(socket, { type: 'block_rejected', reason: `Protected area: only ${protector.ownerDisplayName} can mine here.`, x: bx, y: by, currentTile: getTileAt(client.lobby, bx, by) });
          return;
        }

        let currentTile: TileType = TileType.AIR;
        const mod = client.lobby.blockModifications.get(key);
        if (mod !== undefined) {
          currentTile = mod.tile;
        } else {
          const baseTile = client.lobby.terrainGen.getBaseTile(bx, by);
          if (baseTile !== TileType.AIR) {
            currentTile = baseTile;
          } else {
            // Check tree trunks, branches, root flares, canopies & vines
            currentTile = client.lobby.terrainGen.getTreeTileAt(bx, by);
            if (currentTile === TileType.AIR) {
              const sY = client.lobby.terrainGen.getSurfaceHeight(bx);
              if (by === sY - 1) {
                currentTile = client.lobby.terrainGen.getSurfaceFoliage(bx);
              }
            }
            if (currentTile === TileType.AIR) {
              currentTile = client.lobby.terrainGen.getCaveDecorationAt(bx, by);
            }
          }
        }

        if (currentTile === TileType.AIR) {
          send(socket, { type: 'block_rejected', reason: 'Cannot mine air block.', x: bx, y: by, currentTile });
          return;
        }
        if (currentTile === TileType.BEDROCK || !BLOCK_CONFIGS[currentTile]?.isMineable) {
          send(socket, { type: 'block_rejected', reason: 'Bedrock cannot be mined.', x: bx, y: by, currentTile });
          return;
        }

        if (currentTile === TileType.PROTECTOR) {
          const protectorEntry = client.lobby.protectors.get(key);
          if (protectorEntry && protectorEntry.ownerPlayerId !== client.playerId) {
            send(socket, { type: 'block_rejected', reason: `You cannot mine ${protectorEntry.ownerDisplayName}'s Protector.`, x: bx, y: by, currentTile });
            return;
          }
          client.lobby.protectors.delete(key);
          const removal: BlockModification = { x: bx, y: by, tile: TileType.AIR };
          client.lobby.blockModifications.set(key, removal);
          if (client.inventory.canStoreItem('protector')) {
            client.inventory.addItem('protector', 1);
          } else {
            const dropId = client.lobby.nextDropId++;
            const drop: LobbyDrop = { id: dropId, type: 'protector', count: 1, x: bx * TILE_SIZE + 4, y: by * TILE_SIZE + 4 };
            client.lobby.drops.set(dropId, drop);
            for (const player of client.lobby.players) send(player, { type: 'drop_spawned', drop });
          }
          client.lobby.worldDirty = true;
          persistLobby(client.lobby);
          persistClient(client);
          for (const player of client.lobby.players) {
            send(player, { type: 'block_changed', ...removal, playerId: client.playerId });
            send(player, { type: 'protector_removed', x: bx, y: by });
          }
          send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
          return;
        }

        const requiredTool = REQUIRED_PICKAXE[currentTile];
        if (requiredTool) {
          const maxRank = PICKAXES_BY_RANK.reduce(
            (max, [item, rank]) => ((client.inventory.counts[item] ?? 0) > 0 ? Math.max(max, rank) : max),
            0
          );
          if (maxRank < requiredTool.rank) {
            send(socket, { type: 'block_rejected', reason: `Requires ${requiredTool.name}`, x: bx, y: by, currentTile });
            return;
          }
        }

        if (currentTile === TileType.CHEST || currentTile === TileType.FURNACE) {
          const containerId = containerIdAt(client.lobby, bx, by, currentTile);
          const object = client.lobby.worldObjects.get(worldObjectId(client.lobby.seed, bx, by, currentTile === TileType.CHEST ? 'chest' : 'furnace'));
          const item: ItemType = currentTile === TileType.CHEST ? 'chest' : 'furnace';
          const chestId = containerId;
          const chest = client.lobby.chests.get(chestId);
          if (!chest || !object || !isWorldObjectInRange(client, object)) {
            send(socket, { type: 'block_rejected', x: bx, y: by, currentTile, reason: 'Container is unavailable or out of reach.' });
            return;
          }
          const removal: BlockModification = { x: bx, y: by, tile: TileType.AIR };
          client.lobby.chests.delete(chestId);
          client.lobby.worldObjects.delete(object.id);
          client.lobby.blockModifications.set(key, removal);
          for (const player of client.lobby.players) {
            const playerClient = clients.get(player);
            if (playerClient?.openChestId === chestId) {
              playerClient.openChestId = undefined;
              send(player, { type: 'chest_removed', chestId });
            }
            send(player, { type: 'block_changed', ...removal, playerId: client.playerId });
            send(player, { type: 'world_object_removed', objectId: object.id });
          }
          for (const slot of chest.slots) {
            if (!slot.item || slot.count <= 0) continue;
            const dropId = client.lobby.nextDropId++;
            const drop: LobbyDrop = { id: dropId, type: slot.item, count: slot.count, x: bx * TILE_SIZE + 4, y: by * TILE_SIZE + 4 };
            client.lobby.drops.set(dropId, drop);
            for (const player of client.lobby.players) send(player, { type: 'drop_spawned', drop });
          }
          if (client.inventory.canStoreItem(item)) {
            client.inventory.addItem(item, 1);
          } else {
            const dropId = client.lobby.nextDropId++;
            const drop: LobbyDrop = { id: dropId, type: item, count: 1, x: bx * TILE_SIZE + 4, y: by * TILE_SIZE + 4 };
            client.lobby.drops.set(dropId, drop);
            for (const player of client.lobby.players) send(player, { type: 'drop_spawned', drop });
          }
          client.lobby.worldDirty = true;
          persistLobby(client.lobby);
          persistClient(client);
          send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
          return;
        }

        const brokenObjectType = objectTypeForTile(currentTile);
        if (brokenObjectType) {
          const object = client.lobby.worldObjects.get(worldObjectId(client.lobby.seed, bx, by, brokenObjectType));
          if (!object || !isWorldObjectInRange(client, object)) {
            send(socket, { type: 'block_rejected', x: bx, y: by, currentTile, reason: 'World object is unavailable or out of reach.' }); return;
          }
          if (object.type === 'pressure_plate') removePressurePlateOccupants(client.lobby, object.id);
          client.lobby.worldObjects.delete(object.id);
          for (const player of client.lobby.players) send(player, { type: 'world_object_removed', objectId: object.id });
        }

        const modification: BlockModification = { x: bx, y: by, tile: TileType.AIR };
        client.lobby.blockModifications.set(key, modification);
        client.lobby.worldDirty = true;
        persistLobby(client.lobby);
        persistClient(client);
        const update = { type: 'block_changed', ...modification, playerId: client.playerId };
        for (const player of client.lobby.players) send(player, update);

        const config = BLOCK_CONFIGS[currentTile];
        const dropItem = config?.dropItem;
        if (dropItem) {
          if (client.inventory.canStoreItem(dropItem)) {
            client.inventory.addItem(dropItem, 1);
            persistClient(client);
            send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
          } else {
            const dropId = client.lobby.nextDropId++;
            const drop: LobbyDrop = { id: dropId, type: dropItem, count: 1, x: bx * 16 + 4, y: by * 16 + 4 };
            client.lobby.drops.set(dropId, drop);
            client.lobby.worldDirty = true;
            persistLobby(client.lobby);
            const dropSpawnMsg = { type: 'drop_spawned', drop };
            for (const player of client.lobby.players) send(player, dropSpawnMsg);
          }
        }
        const bonusSeeds = currentTile === TileType.BERRY_BUSH
          ? getBerryBushSeedDropCount(client.lobby.seed, bx, by)
          : 0;
        if (bonusSeeds > 0) {
          if (client.inventory.canStoreItem('berry_seed')) {
            client.inventory.addItem('berry_seed', bonusSeeds);
            persistClient(client);
            send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
          } else {
            const dropId = client.lobby.nextDropId++;
            const drop: LobbyDrop = { id: dropId, type: 'berry_seed', count: bonusSeeds, x: bx * TILE_SIZE + 4, y: by * TILE_SIZE + 4 };
            client.lobby.drops.set(dropId, drop);
            client.lobby.worldDirty = true;
            persistLobby(client.lobby);
            const dropSpawnMsg = { type: 'drop_spawned', drop };
            for (const player of client.lobby.players) send(player, dropSpawnMsg);
          }
        }
        return;
      }

      if (request.type === 'block_place') {
        if (!client?.lobby) { send(socket, { type: 'block_rejected', reason: 'Join a lobby before changing blocks.' }); return; }
        if (!client.isAlive) { send(socket, { type: 'block_rejected', reason: 'Cannot change blocks while dead.' }); return; }
        const { x, y } = request;
        if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || Math.abs(x as number) > MAX_BLOCK_COORDINATE || Math.abs(y as number) > MAX_BLOCK_COORDINATE) {
          send(socket, { type: 'block_rejected', reason: 'Block coordinates are invalid.' }); return;
        }
        if (typeof request.tile !== 'number' || !Number.isInteger(request.tile) || !VALID_TILES.has(request.tile) || request.tile === TileType.AIR) {
          send(socket, { type: 'block_rejected', reason: 'Block tile is invalid.' }); return;
        }
        const tile = request.tile as TileType;
        const bx = x as number;
        const by = y as number;

        const protector = getUnauthorizedProtector(client.lobby, client.playerId, bx, by);
        if (protector) {
          send(socket, {
            type: 'block_rejected',
            x: bx,
            y: by,
            currentTile: getTileAt(client.lobby, bx, by),
            reason: `Area is protected by ${protector.ownerDisplayName}'s Protector.`,
            inventory: client.inventory.toJSON(),
          });
          return;
        }

        if (tile === TileType.PROTECTOR) {
          const item: ItemType = 'protector';
          const key = `${bx},${by}`;

          let playerProtectorCount = 0;
          for (const protector of client.lobby.protectors.values()) {
            if (protector.ownerPlayerId === client.playerId) {
              playerProtectorCount++;
            }
          }
          if (playerProtectorCount >= MAX_PROTECTORS_PER_PLAYER) {
            send(socket, {
              type: 'block_rejected',
              x: bx,
              y: by,
              currentTile: getTileAt(client.lobby, bx, by),
              reason: `You can only place up to ${MAX_PROTECTORS_PER_PLAYER} Protectors.`,
              inventory: client.inventory.toJSON(),
            });
            return;
          }

          const centerX = client.x + PLAYER_WIDTH / 2;
          const centerY = client.y + PLAYER_HEIGHT / 2;
          const blockCenterX = bx * TILE_SIZE + TILE_SIZE / 2;
          const blockCenterY = by * TILE_SIZE + TILE_SIZE / 2;
          const overlapsPlayer = client.x < (bx + 1) * TILE_SIZE && client.x + PLAYER_WIDTH > bx * TILE_SIZE &&
            client.y < (by + 1) * TILE_SIZE && client.y + PLAYER_HEIGHT > by * TILE_SIZE;

          if (getTileAt(client.lobby, bx, by) !== TileType.AIR || Math.hypot(blockCenterX - centerX, blockCenterY - centerY) > 6 * TILE_SIZE || overlapsPlayer ||
              (client.inventory.counts[item] ?? 0) < 1) {
            send(socket, { type: 'block_rejected', x: bx, y: by, currentTile: getTileAt(client.lobby, bx, by), reason: 'Protector placement is invalid, obstructed, or out of reach.', inventory: client.inventory.toJSON() });
            return;
          }

          if (!client.inventory.consumeItem(item, 1)) {
            send(socket, { type: 'block_rejected', x: bx, y: by, currentTile: getTileAt(client.lobby, bx, by), reason: 'Protector is not in your inventory.', inventory: client.inventory.toJSON() });
            return;
          }

          const zone: ProtectorZone = {
            id: key,
            x: bx,
            y: by,
            ownerPlayerId: client.playerId,
            ownerDisplayName: client.displayName,
            createdAt: Date.now(),
          };
          client.lobby.protectors.set(key, zone);

          const modification: BlockModification = { x: bx, y: by, tile };
          client.lobby.blockModifications.set(key, modification);
          client.lobby.worldDirty = true;
          persistLobby(client.lobby);
          persistClient(client);

          for (const player of client.lobby.players) {
            send(player, { type: 'block_changed', ...modification, playerId: client.playerId });
            send(player, { type: 'protector_created', protector: zone });
          }
          send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
          send(socket, { type: 'notice', message: 'Protector placed! 50-block safe territory established.' });
          return;
        }

        const placeObjectType = objectTypeForTile(tile);
        if (placeObjectType && OBJECT_TILE[placeObjectType] !== tile) {
          send(socket, { type: 'block_rejected', reason: 'Object state variants cannot be placed directly.' }); return;
        }
        if (tile === TileType.CHEST || tile === TileType.FURNACE) {
          const key = `${bx},${by}`;
          const centerX = client.x + PLAYER_WIDTH / 2;
          const centerY = client.y + PLAYER_HEIGHT / 2;
          const blockCenterX = bx * TILE_SIZE + TILE_SIZE / 2;
          const blockCenterY = by * TILE_SIZE + TILE_SIZE / 2;
          const overlapsPlayer = client.x < (bx + 1) * TILE_SIZE && client.x + PLAYER_WIDTH > bx * TILE_SIZE &&
            client.y < (by + 1) * TILE_SIZE && client.y + PLAYER_HEIGHT > by * TILE_SIZE;
          const item = tile === TileType.CHEST ? 'chest' : 'furnace';
          const objectType: InteractiveObjectType = tile === TileType.CHEST ? 'chest' : 'furnace';
          const id = tile === TileType.CHEST ? chestIdAt(client.lobby, bx, by) : worldObjectId(client.lobby.seed, bx, by, 'furnace');
          if (getTileAt(client.lobby, bx, by) !== TileType.AIR || client.lobby.chests.has(id) || client.lobby.worldObjects.has(id) ||
              Math.hypot(blockCenterX - centerX, blockCenterY - centerY) > 6 * TILE_SIZE || overlapsPlayer ||
              (client.inventory.counts[item] ?? 0) < 1) {
            send(socket, { type: 'block_rejected', x: bx, y: by, currentTile: getTileAt(client.lobby, bx, by), reason: `${OBJECT_ITEM[objectType]} placement is invalid or out of reach.`, inventory: client.inventory.toJSON() });
            return;
          }
          if (!client.inventory.consumeItem(item, 1)) {
            send(socket, { type: 'block_rejected', x: bx, y: by, currentTile: getTileAt(client.lobby, bx, by), reason: `${item} is not in your inventory.`, inventory: client.inventory.toJSON() });
            return;
          }
          const chest: WorldChest = { id, x: bx, y: by, slots: makeEmptyChestSlots(), revision: 0 };
          client.lobby.chests.set(chest.id, chest);
          const object = makeWorldObject(client.lobby.seed, bx, by, objectType);
          client.lobby.worldObjects.set(object.id, object);
          const modification: BlockModification = { x: bx, y: by, tile };
          client.lobby.blockModifications.set(key, modification);
          client.lobby.worldDirty = true;

          const isFirstChestForPlayer = tile === TileType.CHEST && !client.lobby.firstChestPlacedPlayers.has(client.playerId);
          if (isFirstChestForPlayer) {
            client.lobby.firstChestPlacedPlayers.add(client.playerId);
            const gaveProtector = client.inventory.addItem('protector', 1);
            if (!gaveProtector) {
              const dropId = client.lobby.nextDropId++;
              const drop: LobbyDrop = { id: dropId, type: 'protector', count: 1, x: bx * TILE_SIZE + 4, y: by * TILE_SIZE + 4 };
              client.lobby.drops.set(dropId, drop);
              for (const player of client.lobby.players) send(player, { type: 'drop_spawned', drop });
            }
            send(socket, {
              type: 'chapter_unlocked',
              chapter: 'CHAPTER 2',
              title: 'BASE',
              rewardItem: 'protector',
              message: 'First chest placed! Chapter 2: BASE unlocked. You received a Protector!',
            });
          }

          persistLobby(client.lobby);
          persistClient(client);
          for (const player of client.lobby.players) {
            send(player, { type: 'block_changed', ...modification, playerId: client.playerId });
            send(player, { type: 'chest_created', chestId: chest.id, x: bx, y: by });
            send(player, { type: 'world_object_updated', object });
          }
          send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
          return;
        }
        if (placeObjectType && placeObjectType !== 'chest' && placeObjectType !== 'furnace') {
          const item = OBJECT_ITEM[placeObjectType];
          const key = `${bx},${by}`;
          const centerX = client.x + PLAYER_WIDTH / 2;
          const centerY = client.y + PLAYER_HEIGHT / 2;
          const blockCenterX = bx * TILE_SIZE + TILE_SIZE / 2;
          const blockCenterY = by * TILE_SIZE + TILE_SIZE / 2;
          const overlapsPlayer = client.x < (bx + 1) * TILE_SIZE && client.x + PLAYER_WIDTH > bx * TILE_SIZE && client.y < (by + 1) * TILE_SIZE && client.y + PLAYER_HEIGHT > by * TILE_SIZE;
          const id = worldObjectId(client.lobby.seed, bx, by, placeObjectType);
          if (getTileAt(client.lobby, bx, by) !== TileType.AIR || client.lobby.worldObjects.has(id) || Math.abs(bx) > MAX_BLOCK_COORDINATE || Math.abs(by) > MAX_BLOCK_COORDINATE ||
              Math.hypot(blockCenterX - centerX, blockCenterY - centerY) > 6 * TILE_SIZE || overlapsPlayer || (client.inventory.counts[item] ?? 0) < 1) {
            send(socket, { type: 'block_rejected', x: bx, y: by, currentTile: getTileAt(client.lobby, bx, by), reason: 'Object placement is invalid, blocked, out of reach, or missing its item.', inventory: client.inventory.toJSON() }); return;
          }
          if (!client.inventory.consumeItem(item, 1)) { send(socket, { type: 'block_rejected', reason: 'Required object item is missing.' }); return; }
          const object = makeWorldObject(client.lobby.seed, bx, by, placeObjectType);
          client.lobby.worldObjects.set(object.id, object);
          const modification: BlockModification = { x: bx, y: by, tile };
          client.lobby.blockModifications.set(key, modification);
          client.lobby.worldDirty = true;
          persistLobby(client.lobby); persistClient(client);
          for (const player of client.lobby.players) {
            send(player, { type: 'block_changed', ...modification, playerId: client.playerId });
            send(player, { type: 'world_object_updated', object });
          }
          send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
          return;
        }
        const requiredItem = TILE_TO_ITEM[tile];
        if (!requiredItem || (client.inventory.counts[requiredItem] ?? 0) < 1) {
          send(socket, { type: 'block_rejected', reason: 'You do not have this block in your inventory.' });
          return;
        }

        client.inventory.consumeItem(requiredItem, 1);
        const modification: BlockModification = { x: bx, y: by, tile };
        client.lobby.blockModifications.set(`${bx},${by}`, modification);
        client.lobby.worldDirty = true;
        persistLobby(client.lobby);
        persistClient(client);
        const update = { type: 'block_changed', ...modification, playerId: client.playerId };
        for (const player of client.lobby.players) send(player, update);
        send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
        return;
      }

      if (request.type === 'pickup_request') {
        if (!client?.lobby) { send(socket, { type: 'pickup_rejected', reason: 'Not in a lobby' }); return; }
        if (!client.isAlive) { send(socket, { type: 'pickup_rejected', reason: 'Cannot pick up items while dead' }); return; }
        const dropId = request.dropId;
        if (typeof dropId !== 'number' || !Number.isInteger(dropId)) {
          send(socket, { type: 'pickup_rejected', reason: 'Invalid drop ID' });
          return;
        }
        const drop = client.lobby.drops.get(dropId);
        if (!drop) {
          send(socket, { type: 'pickup_rejected', dropId, reason: 'Drop does not exist or was already collected' });
          return;
        }
        if (drop.ownerPlayerId === client.playerId && (drop.ownerPickupUntil ?? 0) > Date.now()) {
          send(socket, { type: 'pickup_rejected', dropId, reason: 'Wait briefly before picking up your dropped item.' });
          return;
        }
        if (!client.inventory.canStoreItem(drop.type)) {
          send(socket, { type: 'pickup_rejected', dropId, reason: 'Inventory is full' });
          return;
        }

        // Add first, then remove synchronously. If inventory insertion fails,
        // leave the authoritative drop available for another pickup attempt.
        if (!client.inventory.addItem(drop.type, drop.count)) {
          send(socket, { type: 'pickup_rejected', dropId, reason: 'Inventory is full' });
          return;
        }
        client.lobby.drops.delete(dropId);
        client.lobby.worldDirty = true;
        persistLobby(client.lobby);
        persistClient(client);

        send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
        send(socket, { type: 'pickup_success', dropId, item: drop.type, count: drop.count });

        const dropRemovedMsg = { type: 'drop_removed', dropId };
        for (const player of client.lobby.players) send(player, dropRemovedMsg);
        return;
      }

      if (request.type === 'wildlife_attack') {
        if (!client?.lobby || !client.isAlive) {
          debugCombat('wildlife-attack.rejected', { playerId: client?.playerId ?? null, lifeId: client?.lifeId ?? null, animalId: request.animalId ?? null, health: client?.health ?? null, alive: client?.isAlive ?? false, reason: !client?.lobby ? 'no-lobby' : 'dead-player' });
          return;
        }
        if (typeof request.lifeId !== 'number' || request.lifeId !== client.lifeId) {
          debugCombat('wildlife-attack.rejected', { playerId: client.playerId, lifeId: client.lifeId, requestLifeId: request.lifeId ?? null, animalId: request.animalId ?? null, health: client.health, alive: client.isAlive, reason: 'lifeId-mismatch' });
          return;
        }
        const animalId = request.animalId;
        const damage = request.damage;
        if (typeof animalId !== 'string' || typeof damage !== 'number') return;
        const animal = client.lobby.wildlife.get(animalId);
        if (!animal || !animal.isAlive) {
          debugCombat('wildlife-attack.rejected', { playerId: client.playerId, lifeId: client.lifeId, animalId, health: client.health, alive: client.isAlive, reason: !animal ? 'animal-not-registered' : 'animal-dead' });
          // Animal already dead or removed; ignore to prevent duplicate drop
          return;
        }

        const abx = Math.floor((animal.x + animal.width / 2) / TILE_SIZE);
        const aby = Math.floor((animal.y + animal.height / 2) / TILE_SIZE);
        const animalProtector = getUnauthorizedProtector(client.lobby, client.playerId, abx, aby);
        if (animalProtector) {
          send(socket, { type: 'wildlife_rejected', reason: `Animals in ${animalProtector.ownerDisplayName}'s sanctuary are protected.` });
          return;
        }

        // Distance validation: client must be within sword reach (accounting for large animal body width)
        const dx = (client.x + 7) - (animal.x + animal.width / 2);
        const dy = (client.y + 13) - (animal.y + animal.height / 2);
        const maxReach = 95 + animal.width / 2;
        if (dx * dx + dy * dy > maxReach * maxReach) {
          debugCombat('wildlife-attack.rejected', { playerId: client.playerId, lifeId: client.lifeId, animalId, health: client.health, alive: client.isAlive, reason: 'out-of-range', distance: Math.round(Math.hypot(dx, dy)), maxReach });
          return;
        }

        const validDamage = Math.max(1, Math.min(380, Math.round(damage)));
        debugCombat('wildlife-attack.accepted', { playerId: client.playerId, lifeId: client.lifeId, animalId, health: client.health, alive: client.isAlive, damage: validDamage });
        animal.health -= validDamage;
        animal.hurtTimer = 0.22;
        const hitFromLeft = client.x < animal.x;
        animal.direction = hitFromLeft ? 1 : -1;
        animal.x += hitFromLeft ? 5 : -5;
        animal.state = 'wander';
        animal.stateTimer = 0.8;

        if (animal.health <= 0) {
          animal.health = 0;
          animal.isAlive = false;
          resetServerAnimalCombatState(animal);
          client.lobby.wildlife.delete(animal.id);
          client.lobby.dormantWildlife.delete(animal.id);
          client.lobby.killedWildlifeIds.add(animal.id);
          addLeaderboardScoreOnce(client.playerId, client.displayName, 'animals', `animal:${normalizeWorldName(client.lobby.name)}:${animal.id}`);
          client.lobby.worldDirty = true;
          persistLobby(client.lobby);

          const meat = SPECIES_MEAT[animal.species] || 'venison';
          const dropId = client.lobby.nextDropId++;
          const drop: LobbyDrop = {
            id: dropId,
            type: meat,
            count: animal.species === 'mammoth' ? 2 : 1,
            x: animal.x + (animal.width - 8) / 2,
            y: animal.y + (animal.height - 8) / 2,
          };
          client.lobby.drops.set(dropId, drop);

          const skullType = SPECIES_SKULL_DROP[animal.species];
          let skullDrop: LobbyDrop | null = null;
          let boneDrop: LobbyDrop | null = null;
          let skeletonDrop: LobbyDrop | null = null;

          if (skullType) {
            const skullDropId = client.lobby.nextDropId++;
            skullDrop = {
              id: skullDropId,
              type: skullType,
              count: 1,
              x: animal.x + (animal.width - 8) / 2 - 4,
              y: animal.y + (animal.height - 8) / 2 - 2,
            };
            client.lobby.drops.set(skullDropId, skullDrop);

            const boneDropId = client.lobby.nextDropId++;
            const boneCount = animal.species === 'mammoth' ? 4 : animal.species === 'bear' ? 2 : 1;
            boneDrop = {
              id: boneDropId,
              type: 'bone',
              count: boneCount,
              x: animal.x + (animal.width - 8) / 2 + 4,
              y: animal.y + (animal.height - 8) / 2 - 2,
            };
            client.lobby.drops.set(boneDropId, boneDrop);

            if (animal.species === 'mammoth') {
              const skeletonDropId = client.lobby.nextDropId++;
              skeletonDrop = {
                id: skeletonDropId,
                type: 'animal_skeleton',
                count: 1,
                x: animal.x + (animal.width - 8) / 2,
                y: animal.y + (animal.height - 8) / 2 - 6,
              };
              client.lobby.drops.set(skeletonDropId, skeletonDrop);
            }
          }

          persistLobby(client.lobby);

          const deathMsg = {
            type: 'wildlife_death',
            animalId: animal.id,
            species: animal.species,
            damage: validDamage,
            x: animal.x,
            y: animal.y,
          };
          const dropMsg = { type: 'drop_spawned', drop };
          for (const player of client.lobby.players) {
            send(player, deathMsg);
            send(player, dropMsg);
            if (skullDrop) {
              send(player, { type: 'drop_spawned', drop: skullDrop });
            }
            if (boneDrop) {
              send(player, { type: 'drop_spawned', drop: boneDrop });
            }
            if (skeletonDrop) {
              send(player, { type: 'drop_spawned', drop: skeletonDrop });
            }
          }
        } else {
          const hurtMsg = {
            type: 'wildlife_hurt',
            animalId: animal.id,
            health: animal.health,
            maxHealth: animal.maxHealth,
            damage: validDamage,
            x: animal.x,
            y: animal.y,
            hitFromLeft,
          };
          for (const player of client.lobby.players) {
            send(player, hurtMsg);
          }
        }
        return;
      }

      if (request.type === 'player_attack') {
        if (!client?.lobby || !client.isAlive || client.health <= 0) {
          debugCombat('player-attack.rejected', { playerId: client?.playerId ?? null, lifeId: client?.lifeId ?? null, health: client?.health ?? null, alive: client?.isAlive ?? false, reason: !client?.lobby ? 'no-lobby' : 'dead-player' });
          return;
        }
        if (typeof request.lifeId !== 'number' || request.lifeId !== client.lifeId) {
          debugCombat('player-attack.rejected', { playerId: client.playerId, lifeId: client.lifeId, requestLifeId: request.lifeId ?? null, health: client.health, alive: client.isAlive, reason: 'lifeId-mismatch', attackId: request.attackId ?? null });
          return;
        }
        const attackId = request.attackId;
        if (typeof attackId !== 'string' || !attackId.trim() || attackId.length > 64) return;

        // Prevent duplicate / replayed attack ID
        if (!client.processedAttackIds) client.processedAttackIds = new Set();
        if (client.processedAttackIds.has(attackId)) {
          debugCombat('player-attack.rejected', { playerId: client.playerId, lifeId: client.lifeId, health: client.health, alive: client.isAlive, reason: 'duplicate-attackId', attackId });
          return;
        }
        client.processedAttackIds.add(attackId);
        if (client.processedAttackIds.size > 100) {
          const first = client.processedAttackIds.values().next().value;
          if (first) client.processedAttackIds.delete(first);
        }

        // Server-side attack cooldown check (sword cooldown is 0.45s; allow 380ms for latency)
        const now = Date.now();
        if (now - (client.lastAttackAt || 0) < 380) {
          debugCombat('player-attack.rejected', { playerId: client.playerId, lifeId: client.lifeId, health: client.health, alive: client.isAlive, reason: 'attack-cooldown', attackId });
          return;
        }
        client.lastAttackAt = now;

        // Attacker must possess the starter sword
        const hasSword = (client.inventory.counts['sword'] ?? 0) >= 1 || client.inventory.getSlots().some((s) => s.type === 'sword');
        if (!hasSword) {
          debugCombat('player-attack.rejected', { playerId: client.playerId, lifeId: client.lifeId, health: client.health, alive: client.isAlive, reason: 'no-sword', attackId });
          return;
        }
        debugCombat('player-attack.accepted', { playerId: client.playerId, lifeId: client.lifeId, health: client.health, alive: client.isAlive, attackId });

        // Broadcast attack visual to other players in the lobby
        const visualMsg = {
          type: 'player_attack_visual',
          playerId: client.playerId,
          attackId,
          facing: client.facingRight,
        };
        for (const player of client.lobby.players) {
          if (player !== socket) {
            send(player, visualMsg);
          }
        }

        // Authoritative hitbox calculation based on attacker position and facing direction
        // Player size: width 14, height 26
        const swordHitbox = {
          x: client.facingRight ? client.x + 12 : client.x - 30,
          y: client.y - 8,
          width: 32,
          height: 38,
        };

        const damage = 15;
        for (const targetSocket of client.lobby.players) {
          if (targetSocket === socket) continue; // cannot damage self
          const targetClient = clients.get(targetSocket);
          if (!targetClient || !targetClient.isAlive || targetClient.health <= 0) continue;

          // Target bounding box: width 14, height 26
          const targetBox = {
            x: targetClient.x,
            y: targetClient.y,
            width: 14,
            height: 26,
          };

          // Distance range check (~3.4 tiles)
          const distance = Math.hypot((client.x + 7) - (targetClient.x + 7), (client.y + 13) - (targetClient.y + 13));
          if (distance > 55) continue;

          // AABB overlap check
          const isHit = (
            swordHitbox.x < targetBox.x + targetBox.width &&
            swordHitbox.x + swordHitbox.width > targetBox.x &&
            swordHitbox.y < targetBox.y + targetBox.height &&
            swordHitbox.y + swordHitbox.height > targetBox.y
          );

          if (isHit) {
            targetClient.health = Math.max(0, targetClient.health - damage);
            markClientDamaged(targetClient, Date.now());
            if (targetClient.health <= 0) {
              targetClient.health = 0;
              targetClient.isAlive = false;
              targetClient.lastWildlifeDamageAt = undefined;
              clearServerWildlifeTargeting(client.lobby, targetClient.playerId);
              debugCombat('death.server-pvp', { playerId: targetClient.playerId, lifeId: targetClient.lifeId, animalId: null, health: targetClient.health, alive: false, attackerId: client.playerId });
              addLeaderboardScoreOnce(client.playerId, client.displayName, 'players', `pvp:${client.playerId}:${targetClient.playerId}:${targetClient.lifeId}`);
            }
            persistClient(targetClient);

            const healthMsg = {
              type: 'player_health_changed',
              playerId: targetClient.playerId,
              lifeId: targetClient.lifeId,
              health: targetClient.health,
              maxHealth: targetClient.maxHealth,
              isAlive: targetClient.isAlive,
              damage,
              attackerId: client.playerId,
              sourceX: client.x,
              sourceY: client.y,
            };
            debugCombat('damage.server-pvp-accepted', { playerId: targetClient.playerId, lifeId: targetClient.lifeId, health: targetClient.health, alive: targetClient.isAlive, attackerId: client.playerId, damage, targetPosition: { x: targetClient.x, y: targetClient.y } });
            for (const p of client.lobby.players) {
              send(p, healthMsg);
            }
          }
        }
        return;
      }

      if (request.type === 'drop_spawn') {
        if (!client?.lobby || !client.isAlive) return;
        const { item, count, x, y } = request;
        if (typeof item !== 'string' || !(item in client.inventory.counts) || item === 'sword') return;
        if (typeof count !== 'number' || !Number.isInteger(count) || count <= 0 || count > 64) return;
        if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) return;

        const dropId = client.lobby.nextDropId++;
        const drop: LobbyDrop = { id: dropId, type: item as ItemType, count, x, y };
        client.lobby.drops.set(dropId, drop);
        client.lobby.worldDirty = true;
        persistLobby(client.lobby);

        const dropSpawnMsg = { type: 'drop_spawned', drop };
        for (const player of client.lobby.players) send(player, dropSpawnMsg);
        return;
      }

      if (request.type === 'drop_request' || request.type === 'inventory_drop') {
        if (!client?.lobby) {
          send(socket, { type: 'drop_rejected', reason: 'You must join a lobby before dropping items.' });
          return;
        }
        if (!client.isAlive) {
          send(socket, { type: 'drop_rejected', reason: 'Cannot drop items while dead.' });
          return;
        }

        // Duplicate request ID protection
        if (!client.processedDropRequestIds) client.processedDropRequestIds = new Set();
        const reqId = typeof request.requestId === 'string' ? request.requestId.trim() : '';
        if (!reqId || reqId.length > 128) {
          send(socket, { type: 'drop_rejected', reason: 'Invalid drop request ID.' });
          return;
        }
        if (client.processedDropRequestIds.has(reqId)) {
          send(socket, { type: 'drop_rejected', reason: 'Duplicate drop request.' });
          return;
        }
        client.processedDropRequestIds.add(reqId);
        if (client.processedDropRequestIds.size > 200) {
          const first = client.processedDropRequestIds.values().next().value;
          if (first) client.processedDropRequestIds.delete(first);
        }

        // Determine target item from slot or item parameter
        let targetItem: ItemType | null = null;
        const rawSlot = request.slot as Record<string, unknown> | undefined;

        if (rawSlot && typeof rawSlot === 'object') {
          const kind = rawSlot.kind;
          const index = rawSlot.index;
          if ((kind !== 'inventory' && kind !== 'hotbar') || !Number.isInteger(index)) {
            send(socket, { type: 'drop_rejected', reason: 'Invalid slot specification.' });
            return;
          }
          const slotIndex = index as number;
          if (kind === 'inventory') {
            if (slotIndex < 0 || slotIndex >= 49) {
              send(socket, { type: 'drop_rejected', reason: 'Inventory slot index out of bounds.' });
              return;
            }
            targetItem = client.inventory.getInventorySlots()[slotIndex]?.type ?? null;
          } else {
            if (slotIndex < 0 || slotIndex >= 8) {
              send(socket, { type: 'drop_rejected', reason: 'Hotbar slot index out of bounds.' });
              return;
            }
            if (slotIndex === 0) {
              send(socket, { type: 'drop_rejected', reason: 'Cannot drop the starter sword.' });
              return;
            }
            targetItem = client.inventory.getSlots()[slotIndex]?.type ?? null;
          }
        } else {
          send(socket, { type: 'drop_rejected', reason: 'A valid inventory slot is required.' });
          return;
        }

        if (!targetItem || targetItem === 'sword') {
          send(socket, { type: 'drop_rejected', reason: 'Slot is empty or contains non-droppable item.' });
          return;
        }

        if (typeof request.item === 'string' && request.item !== targetItem) {
          send(socket, { type: 'drop_rejected', reason: 'Specified item does not match slot item.' });
          return;
        }

        // Verify player actually owns the item
        const owned = client.inventory.counts[targetItem] ?? 0;
        if (owned <= 0) {
          send(socket, { type: 'drop_rejected', reason: 'You do not possess this item.' });
          return;
        }

        // Verify quantity
        let dropCount = owned;
        if (request.count !== undefined) {
          if (typeof request.count !== 'number' || !Number.isInteger(request.count) || request.count <= 0) {
            send(socket, { type: 'drop_rejected', reason: 'Drop quantity must be a positive integer.' });
            return;
          }
          if (request.count > owned) {
            send(socket, { type: 'drop_rejected', reason: 'Cannot drop more items than you possess.' });
            return;
          }
          dropCount = request.count;
        }

        // Calculate safe spawn position in front of player
        const frontOffset = client.facingRight ? 18 : -14;
        let spawnX = client.x + frontOffset;
        let spawnY = client.y + 8;

        const checkBx = Math.floor(spawnX / TILE_SIZE);
        const checkBy = Math.floor(spawnY / TILE_SIZE);
        const tileAt = getTileAt(client.lobby, checkBx, checkBy);
        if (BLOCK_CONFIGS[tileAt]?.isSolid) {
          spawnX = client.x + 7;
          spawnY = client.y + 8;
        }

        spawnX = Math.max(-MAX_BLOCK_COORDINATE, Math.min(MAX_BLOCK_COORDINATE, spawnX));
        spawnY = Math.max(-MAX_BLOCK_COORDINATE, Math.min(MAX_BLOCK_COORDINATE, spawnY));

        // Atomically consume item from authoritative inventory
        const consumed = client.inventory.consumeItem(targetItem, dropCount);
        if (!consumed) {
          send(socket, { type: 'drop_rejected', reason: 'Failed to consume item from inventory.' });
          return;
        }

        // Create authoritative world drop
        const dropId = client.lobby.nextDropId++;
        const drop: LobbyDrop = {
          id: dropId,
          type: targetItem,
          count: dropCount,
          x: Math.round(spawnX),
          y: Math.round(spawnY),
          ownerPlayerId: client.playerId,
          ownerPickupUntil: Date.now() + INVENTORY_DROP_OWNER_PICKUP_DELAY_MS,
        };
        client.lobby.drops.set(dropId, drop);
        client.lobby.worldDirty = true;
        persistLobby(client.lobby);
        persistClient(client);

        // Broadcast to same lobby
        const dropSpawnMsg = { type: 'drop_spawned', drop };
        for (const player of client.lobby.players) {
          send(player, dropSpawnMsg);
        }

        // Sync authoritative inventory and confirmation to sender
        send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
        send(socket, { type: 'drop_success', dropId, item: targetItem, count: dropCount });
        return;
      }

      if (request.type === 'craft_request') {
        if (!client?.lobby) { send(socket, { type: 'craft_rejected', reason: 'Not in a lobby' }); return; }
        if (!client.isAlive) { send(socket, { type: 'craft_rejected', reason: 'Cannot craft while dead' }); return; }
        const recipeId = request.recipeId;
        if (typeof recipeId !== 'string') { send(socket, { type: 'craft_rejected', reason: 'Invalid recipe' }); return; }

        const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
        if (!recipe) {
          send(socket, { type: 'craft_rejected', recipeId, reason: 'Unknown recipe' });
          return;
        }

        if (recipe.station === 'crafting_bench') {
          let hasBench = false;
          for (const mod of client.lobby.blockModifications.values()) {
            if (mod.tile === TileType.CRAFTING_TABLE) {
              hasBench = true;
              break;
            }
          }
          if (!hasBench) {
            send(socket, { type: 'craft_rejected', recipeId, reason: 'Crafting bench required' });
            return;
          }
        } else if (recipe.station === 'furnace') {
          let hasFurnace = false;
          for (const mod of client.lobby.blockModifications.values()) {
            if (mod.tile === TileType.FURNACE) {
              hasFurnace = true;
              break;
            }
          }
          if (!hasFurnace) {
            send(socket, { type: 'craft_rejected', recipeId, reason: 'Furnace required to smelt ores' });
            return;
          }
        }

        if (!client.inventory.hasItems(recipe.ingredients)) {
          send(socket, { type: 'craft_rejected', recipeId, reason: 'Insufficient ingredients' });
          return;
        }
        if (!client.inventory.canStoreAfterConsuming(recipe.output, recipe.ingredients)) {
          send(socket, { type: 'craft_rejected', recipeId, reason: 'Inventory full' });
          return;
        }

        const success = client.inventory.craft(recipe.ingredients, recipe.output, recipe.outputAmount);
        if (!success) {
          send(socket, { type: 'craft_rejected', recipeId, reason: 'Crafting failed' });
          return;
        }

        persistClient(client);
        send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
        send(socket, { type: 'craft_success', recipeId: recipe.id, output: recipe.output, amount: recipe.outputAmount });
        return;
      }

      if (request.type === 'eat_request') {
        if (!client?.lobby) { send(socket, { type: 'eat_rejected', reason: 'Not in a lobby' }); return; }
        if (!client.isAlive) { send(socket, { type: 'eat_rejected', reason: 'Cannot eat while dead' }); return; }
        const item = request.item;
        if (typeof item !== 'string' || !isEdibleItem(item)) {
          send(socket, { type: 'eat_rejected', reason: 'Not edible' });
          return;
        }
        if ((client.inventory.counts[item] ?? 0) < 1) {
          send(socket, { type: 'eat_rejected', item, reason: 'You do not have this food' });
          return;
        }

        client.inventory.consumeItem(item, 1);
        const nutrition = MEAT_NUTRITION[item] ?? { food: 20, health: 5 };
        const oldHealth = client.health;
        client.health = Math.min(client.maxHealth, client.health + nutrition.health);
        client.food = Math.min(100, client.food + nutrition.food);
        persistClient(client);

        send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
        send(socket, { type: 'eat_success', item, food: nutrition.food, health: client.health, maxHealth: client.maxHealth, isAlive: client.isAlive, lifeId: client.lifeId });

        if (client.health !== oldHealth) {
          const healthUpdate = {
            type: 'player_health_changed',
            playerId: client.playerId,
            lifeId: client.lifeId,
            health: client.health,
            maxHealth: client.maxHealth,
            isAlive: client.isAlive,
          };
          for (const player of client.lobby.players) send(player, healthUpdate);
        }
        return;
      }

      if (request.type === 'inventory_move_slot') {
        if (!client?.lobby) return;
        const { from, to } = request as { from: unknown; to: unknown };
        if (!from || typeof from !== 'object' || !to || typeof to !== 'object') return;
        const f = from as InventorySlotRef;
        const t = to as InventorySlotRef;
        if ((f.kind !== 'inventory' && f.kind !== 'hotbar') || (t.kind !== 'inventory' && t.kind !== 'hotbar')) return;
        if (!Number.isInteger(f.index) || !Number.isInteger(t.index)) return;

        client.inventory.moveSlot(f, t);
        persistClient(client);
        send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
        return;
      }

      if (request.type === 'developer_grant_test_kit') {
        if (!client?.lobby) return;
        const kit: Array<[ItemType, number]> = [
          ['wood', 40], ['stone', 40], ['coal', 20], ['copper', 20], ['iron', 20], ['gold', 20],
          ['crystal', 20], ['diamond', 12], ['stick', 40], ['planks', 64], ['dirt', 24],
          ['copper_bar', 16], ['iron_bar', 16], ['gold_bar', 16],
          ['crafting_table', 2], ['furnace', 2], ['door', 4], ['ladder', 8], ['bed', 2], ['campfire', 3],
          ['lever', 4], ['sign', 4], ['platform', 12], ['torch', 8], ['pressure_plate', 4], ['trapdoor', 4], ['gate', 4], ['bridge', 8], ['rope', 16], ['wool', 12],
          ['wooden_hoe', 2], ['wheat_seed', 8], ['wheat', 8], ['carrot_seed', 8], ['carrot', 8], ['berry_seed', 8], ['berry', 8],
          ['venison', 4], ['rabbit_meat', 4], ['boar_meat', 4], ['fox_meat', 4], ['bird_meat', 4], ['fish', 4],
        ];
        for (const [item, amount] of kit) {
          client.inventory.addItem(item, amount);
        }
        persistClient(client);
        send(socket, { type: 'inventory_sync', inventory: client.inventory.toJSON() });
        return;
      }

      if (request.type === 'player_move') {
        if (!client?.lobby || !client.isAlive || typeof request.x !== 'number' || typeof request.y !== 'number' ||
            !Number.isFinite(request.x) || !Number.isFinite(request.y) ||
            Math.abs(request.x) > 10_000_000 || Math.abs(request.y) > 10_000_000 ||
            typeof request.facingRight !== 'boolean') return;
        const now = Date.now();
        if (now - client.lastMoveAt < 30) return;
        if (client.x === request.x && client.y === request.y && client.facingRight === request.facingRight) return;
        if (Math.hypot(request.x - client.x, request.y - client.y) > 250) {
          debugCombat('player.position-large-change', { playerId: client.playerId, lifeId: client.lifeId, health: client.health, alive: client.isAlive, previous: { x: client.x, y: client.y }, next: { x: request.x, y: request.y }, reason: 'player_move' });
        }
        client.x = request.x;
        client.y = request.y;
        client.facingRight = request.facingRight;
        updatePressurePlateOccupancy(client, pressurePlateContacts(client, client.lobby));
        if (client.openChestId) {
          const chest = client.lobby.chests.get(client.openChestId);
          if (!chest || !isChestInRange(client, chest)) {
            client.openChestId = undefined;
            send(socket, { type: 'chest_closed', reason: 'Moved out of reach.' });
          }
        }
        if (typeof request.food === 'number' && Number.isFinite(request.food)) {
          client.food = Math.max(0, Math.min(100, Math.round(request.food)));
        }
        if (typeof request.stamina === 'number' && Number.isFinite(request.stamina)) {
          client.stamina = Math.max(0, Math.min(100, Math.round(request.stamina)));
        }
        client.lastMoveAt = now;
        if (now - client.lastSavedAt >= 2000) {
          persistClient(client);
        }
        const update = { type: 'player_moved', playerId: client.playerId, displayName: client.displayName, x: client.x, y: client.y, facingRight: client.facingRight };
        for (const player of client.lobby.players) if (player !== socket) send(player, update);
        return;
      }
      if (request.type === 'teleport_request') {
        if (!client?.lobby || !client.isAlive) {
          send(socket, { type: 'teleport_request_failed', requestId: request.requestId, reason: 'You must be alive in a lobby to request a teleport.' });
          return;
        }
        const requestId = typeof request.requestId === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(request.requestId)
          ? request.requestId
          : '';
        const targetPlayerId = typeof request.targetPlayerId === 'string' ? request.targetPlayerId : '';
        if (!requestId || !targetPlayerId || targetPlayerId === client.playerId) {
          send(socket, { type: 'teleport_request_failed', requestId, reason: 'Choose another player in this lobby.' });
          return;
        }
        const targetSocket = Array.from(client.lobby.players).find((playerSocket) => clients.get(playerSocket)?.playerId === targetPlayerId);
        const target = targetSocket ? clients.get(targetSocket) : undefined;
        if (!targetSocket || !target || !target.isAlive) {
          send(socket, { type: 'teleport_request_failed', requestId, reason: 'That player is unavailable.' });
          return;
        }
        const now = Date.now();
        const pending = target.pendingTeleportRequests ??= new Map();
        for (const [pendingId, entry] of pending) {
          if (entry.expiresAt <= now || !clients.has(entry.requesterSocket)) pending.delete(pendingId);
        }
        for (const [, entry] of pending) {
          if (entry.requesterSocket === socket) {
            send(socket, { type: 'teleport_request_failed', requestId, reason: 'Teleport request already pending for this player.' });
            return;
          }
        }
        if (pending.size > 0) {
          send(socket, { type: 'teleport_request_failed', requestId, reason: 'That player already has a teleport request.' });
          return;
        }
        const expiresAt = now + 15_000;
        const timeoutId = setTimeout(() => {
          if (target.pendingTeleportRequests?.has(requestId)) {
            target.pendingTeleportRequests.delete(requestId);
            send(socket, {
              type: 'teleport_request_result',
              requestId,
              accepted: false,
              reason: 'Teleport request expired.',
            });
            send(targetSocket, {
              type: 'teleport_request_expired',
              requestId,
            });
          }
        }, 15_000);
        timeoutId.unref();

        pending.set(requestId, { requesterSocket: socket, expiresAt, timeoutId });
        send(socket, { type: 'teleport_request_sent', requestId, targetPlayerId, targetName: target.displayName || formatPlayerName(target.playerId), expiresInMs: 15_000 });
        send(targetSocket, {
          type: 'teleport_request_received',
          requestId,
          requesterPlayerId: client.playerId,
          requesterName: client.displayName || formatPlayerName(client.playerId),
          expiresInMs: 15_000,
        });
        return;
      }
      if (request.type === 'teleport_request_response') {
        if (!client?.lobby || typeof request.requestId !== 'string' || typeof request.accept !== 'boolean') return;
        const pending = client.pendingTeleportRequests?.get(request.requestId);
        if (!pending) return;
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        client.pendingTeleportRequests?.delete(request.requestId);
        const requester = clients.get(pending.requesterSocket);
        if (pending.expiresAt <= Date.now() || !requester || requester.lobby !== client.lobby || !requester.isAlive) {
          send(pending.requesterSocket, {
            type: 'teleport_request_result', requestId: request.requestId, accepted: false,
            reason: 'Teleport request expired.',
          });
          return;
        }
        if (!request.accept || !client.isAlive) {
          send(pending.requesterSocket, {
            type: 'teleport_request_result', requestId: request.requestId, accepted: false,
            reason: request.accept ? 'That player is unavailable.' : 'Teleport request cancelled.',
          });
          return;
        }
        requester.x = client.x;
        requester.y = client.y;
        requester.lastMoveAt = Date.now();
        send(pending.requesterSocket, {
          type: 'teleport_request_result',
          requestId: request.requestId,
          accepted: true,
          x: client.x,
          y: client.y,
          targetName: client.displayName || formatPlayerName(client.playerId),
        });
        const moveUpdate = {
          type: 'player_moved',
          playerId: requester.playerId,
          displayName: requester.displayName,
          x: requester.x,
          y: requester.y,
          facingRight: requester.facingRight,
        };
        for (const player of client.lobby.players) {
          if (player !== pending.requesterSocket) send(player, moveUpdate);
        }
        return;
      }
      if (request.type === 'player_health') {
        debugCombat('player-health.rejected', { playerId: client?.playerId ?? null, lifeId: client?.lifeId ?? null, health: client?.health ?? null, alive: client?.isAlive ?? false, requestHealth: request.health ?? null, requestAlive: request.isAlive ?? null, reason: 'client-health-reports-disabled' });
        send(socket, { type: 'error', message: 'Health is managed by the server.' });
        return;
      }
      if (request.type === 'leaderboard_get') {
        const data = getLeaderboard(client?.playerId);
        send(socket, { type: 'leaderboard_data', ...data });
        return;
      }
      if (request.type === 'starvation_damage') {
        if (!client?.lobby || !client.isAlive || client.health <= 1) return;
        if (typeof request.lifeId !== 'number' || request.lifeId !== client.lifeId) {
          debugCombat('starvation-damage.rejected', { playerId: client.playerId, lifeId: client.lifeId, requestLifeId: request.lifeId ?? null, health: client.health, reason: 'lifeId-mismatch' });
          return;
        }
        const now = Date.now();
        if (client.lastStarvationDamageAt && now - client.lastStarvationDamageAt < 2800) return;
        client.lastStarvationDamageAt = now;
        markClientDamaged(client, now);
        client.health = Math.max(1, client.health - 2);
        persistClient(client);
        const update = { type: 'player_health_changed', playerId: client.playerId, lifeId: client.lifeId, health: client.health, maxHealth: client.maxHealth, isAlive: true, damage: 2, reason: 'starvation' };
        for (const player of client.lobby.players) send(player, update);
        return;
      }
      if (request.type === 'player_damage') {
        if (!client?.lobby || !client.isAlive || client.health <= 0) return;
        if (typeof request.lifeId !== 'number' || request.lifeId !== client.lifeId) return;
        if (typeof request.damage !== 'number' || !Number.isFinite(request.damage)) return;
        const now = Date.now();
        if (client.lastClientDamageAt && now - client.lastClientDamageAt < 250) return;
        client.lastClientDamageAt = now;
        const damage = Math.max(1, Math.min(50, Math.round(request.damage)));
        client.health = Math.max(0, client.health - damage);
        markClientDamaged(client, now);
        client.isAlive = client.health > 0;
        if (!client.isAlive) {
          client.lastWildlifeDamageAt = undefined;
          clearServerWildlifeTargeting(client.lobby, client.playerId);
          updatePressurePlateOccupancy(client, new Set());
        }
        persistClient(client);
        const update = { type: 'player_health_changed', playerId: client.playerId, lifeId: client.lifeId, health: client.health, maxHealth: client.maxHealth, isAlive: client.isAlive, damage };
        for (const player of client.lobby.players) send(player, update);
        return;
      }
      if (request.type === 'player_respawn') {
        if (!client?.lobby) {
          send(socket, { type: 'error', message: 'Join a lobby before respawning.' });
          return;
        }
        debugCombat('respawn.server-begin', { playerId: client.playerId, lifeId: client.lifeId, health: client.health, alive: client.isAlive, requestX: request.x ?? null, requestY: request.y ?? null, serverX: client.x, serverY: client.y });
        client.health = client.maxHealth;
        client.isAlive = true;
        client.lifeId = (client.lifeId ?? 0) + 1;
        client.lastStarvationDamageAt = undefined;
        client.lastClientDamageAt = undefined;
        client.lastWildlifeDamageAt = undefined;
        const regenState = getClientRegenerationState(client);
        resetHealthRegeneration(regenState, client.lifeId);
        storeClientRegenerationState(client, regenState);
        client.food = 100;
        client.stamina = 100;
        if (typeof request.x === 'number' && Number.isFinite(request.x) && Math.abs(request.x) <= 10_000_000) {
          client.x = request.x;
        } else if (typeof client.spawnX === 'number' && Number.isFinite(client.spawnX)) {
          client.x = client.spawnX;
        }
        if (typeof request.y === 'number' && Number.isFinite(request.y) && Math.abs(request.y) <= 10_000_000) {
          client.y = request.y;
        } else if (typeof client.spawnY === 'number' && Number.isFinite(client.spawnY)) {
          client.y = client.spawnY;
        }
        const safePos = findSafeSpawnPosition(client.lobby, client.x, client.y);
        client.x = safePos.x;
        client.y = safePos.y;
        debugCombat('respawn.server-end', { playerId: client.playerId, lifeId: client.lifeId, health: client.health, alive: client.isAlive, x: client.x, y: client.y });
        updatePressurePlateOccupancy(client, pressurePlateContacts(client, client.lobby));
        persistClient(client);
        const update = {
          type: 'player_respawned',
          playerId: client.playerId,
          lifeId: client.lifeId,
          x: client.x,
          y: client.y,
          facingRight: client.facingRight,
          health: client.health,
          maxHealth: client.maxHealth,
          isAlive: client.isAlive,
        };
        for (const player of client.lobby.players) send(player, update);
        return;
      }

      if (request.type === 'chat_message') {
        if (!client?.lobby) {
          send(socket, { type: 'chat_rejected', reason: 'You must join a lobby before sending chat messages.' });
          return;
        }

        // Validate text input
        if (typeof request.text !== 'string') {
          send(socket, { type: 'chat_rejected', reason: 'Chat message text must be a string.' });
          return;
        }

        const raw = request.text.trim();
        if (!raw) {
          send(socket, { type: 'chat_rejected', reason: 'Chat message cannot be empty.' });
          return;
        }

        if (raw.length > 200) {
          send(socket, { type: 'chat_rejected', reason: 'Chat message exceeds 200 characters limit.' });
          return;
        }

        // Clean control characters and normalize spaces
        const sanitized = raw.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!sanitized) {
          send(socket, { type: 'chat_rejected', reason: 'Chat message contains only control characters.' });
          return;
        }

        const now = Date.now();
        // Rate limiting: minimum 400ms cooldown
        if (now - (client.lastChatMessageAt || 0) < 400) {
          send(socket, { type: 'chat_rejected', reason: 'You are sending messages too quickly.' });
          return;
        }

        // Rate limiting: max 4 messages per 3000ms window
        client.recentChatTimestamps = (client.recentChatTimestamps || []).filter((t) => now - t < 3000);
        if (client.recentChatTimestamps.length >= 4) {
          send(socket, { type: 'chat_rejected', reason: 'You are sending messages too quickly.' });
          return;
        }

        // Excessive repetition check: cannot repeat identical message within 2000ms
        if (client.lastChatText === sanitized && now - (client.lastChatMessageAt || 0) < 2000) {
          send(socket, { type: 'chat_rejected', reason: 'Please avoid sending duplicate messages.' });
          return;
        }

        client.lastChatMessageAt = now;
        client.recentChatTimestamps.push(now);
        client.lastChatText = sanitized;

        const chatMsg: ChatMessage = {
          messageId: `chat_${now}_${Math.random().toString(36).slice(2, 8)}`,
          playerId: client.playerId,
          playerName: client.displayName || formatPlayerName(client.playerId),
          text: sanitized,
          timestamp: now,
        };

        const lobby = client.lobby;
        lobby.chatHistory.push(chatMsg);
        if (lobby.chatHistory.length > 50) {
          lobby.chatHistory.shift();
        }

        const broadcast = {
          type: 'chat_message',
          ...chatMsg,
        };

        for (const playerSocket of lobby.players) {
          send(playerSocket, broadcast);
        }
        return;
      }

      if (request.type === 'player_identify') {
        if (client) {
          if (typeof request.playerId === 'string' && request.playerId.trim()) {
            client.playerId = request.playerId.trim();
          }
          if (typeof request.displayName === 'string' && request.displayName.trim()) {
            client.displayName = sanitizeDisplayName(request.displayName.trim(), 16);
          }
          send(socket, {
            type: 'player_identified',
            playerId: client.playerId,
            displayName: client.displayName,
          });
          const friendsData = getPlayerFriendsWithStatus(client.playerId, client.displayName, getPlayerOnlineStatus);
          send(socket, { type: 'friends_list', ...friendsData });
        }
        return;
      }

      if (request.type === 'friends_get') {
        const pId = (typeof request.playerId === 'string' && request.playerId.trim())
          ? request.playerId.trim()
          : (client?.playerId || '');
        const dName = (typeof request.displayName === 'string' && request.displayName.trim())
          ? request.displayName.trim()
          : (client?.displayName || pId);
        if (pId) {
          if (client && !client.lobby) {
            client.playerId = pId;
            client.displayName = sanitizeDisplayName(dName, 16);
          }
          const friendsData = getPlayerFriendsWithStatus(pId, dName, getPlayerOnlineStatus);
          send(socket, { type: 'friends_list', ...friendsData });
        }
        return;
      }

      if (request.type === 'send_friend_request') {
        const rawTarget = String(request.targetPlayerId || request.targetPlayerName || '').trim();
        const resolved = resolveTargetPlayer(rawTarget);
        const targetPlayerId = resolved ? resolved.playerId : (String(request.targetPlayerId || '').trim() || rawTarget);
        const targetPlayerName = resolved ? resolved.displayName : (String(request.targetPlayerName || '').trim() || rawTarget);
        const fromPlayerId = (typeof request.fromPlayerId === 'string' && request.fromPlayerId.trim())
          ? request.fromPlayerId.trim()
          : (client?.playerId || '');
        const fromPlayerName = (typeof request.fromPlayerName === 'string' && request.fromPlayerName.trim())
          ? request.fromPlayerName.trim()
          : (client?.displayName || fromPlayerId);

        if (!targetPlayerId) {
          send(socket, { type: 'friend_request_result', success: false, message: 'Target player ID or name is required.' });
          return;
        }

        const result = sendFriendRequest(fromPlayerId, fromPlayerName, targetPlayerId, targetPlayerName);
        send(socket, { type: 'friend_request_result', success: result.success, message: result.message });

        if (fromPlayerId) {
          const senderFriends = getPlayerFriendsWithStatus(fromPlayerId, fromPlayerName, getPlayerOnlineStatus);
          send(socket, { type: 'friends_list', ...senderFriends });
        }

        if (result.success) {
          notifyPlayerFriends(targetPlayerId);
        }
        return;
      }

      if (request.type === 'respond_friend_request') {
        const fromPlayerId = String(request.fromPlayerId || '').trim();
        const action = request.action === 'reject' ? 'reject' : 'accept';
        const myPlayerId = (typeof request.playerId === 'string' && request.playerId.trim())
          ? request.playerId.trim()
          : (client?.playerId || '');

        const result = respondFriendRequest(myPlayerId, fromPlayerId, action);
        send(socket, {
          type: 'friend_respond_result',
          success: result.success,
          message: result.message,
          friend: result.friend,
        });

        notifyPlayerFriends(myPlayerId);
        notifyPlayerFriends(fromPlayerId);
        return;
      }

      if (request.type === 'remove_friend') {
        const friendPlayerId = String(request.friendPlayerId || '').trim();
        const myPlayerId = (typeof request.playerId === 'string' && request.playerId.trim())
          ? request.playerId.trim()
          : (client?.playerId || '');
        removeFriend(myPlayerId, friendPlayerId);
        notifyPlayerFriends(myPlayerId);
        notifyPlayerFriends(friendPlayerId);
        send(socket, { type: 'friend_removed', friendPlayerId });
        return;
      }

      if (request.type === 'quick_join_lobby') {
        if (client?.lobby) { send(socket, { type: 'error', message: 'This connection has already joined a lobby.' }); return; }
        request = { ...request, type: 'join_lobby', lobbyName: pickQuickJoinLobby() };
      }

      if (request.type !== 'join_lobby') { send(socket, { type: 'error', message: 'Unsupported message type.' }); return; }
      if (client?.lobby) { send(socket, { type: 'error', message: 'This connection has already joined a lobby.' }); return; }
      if (typeof request.lobbyName !== 'string' || !isValidLobbyCode(request.lobbyName)) { send(socket, { type: 'error', message: 'Lobby code must contain 1 to 50 numeric digits.' }); return; }
      const lobbyName = normalizeLobbyCode(request.lobbyName);
      if (lobbyName.length > MAX_NAME_LENGTH) { send(socket, { type: 'error', message: `Lobby names must be ${MAX_NAME_LENGTH} characters or fewer.` }); return; }
      if (/[\u0000-\u001f\u007f]/.test(lobbyName)) { send(socket, { type: 'error', message: 'Lobby name contains invalid characters.' }); return; }

      const key = normalizeWorldName(lobbyName);
      let lobby = lobbies.get(key);
      if (!lobby) {
        const saved = loadWorldData(key);
        if (saved) {
          lobby = {
            id: saved.id,
            name: saved.name,
            seed: saved.seed,
            terrainGen: new TerrainGenerator(saved.seed),
            players: new Set(),
            blockModifications: new Map(saved.blockModifications.map((m) => [`${m.x},${m.y}`, m])),
            drops: new Map(saved.drops.map((d) => [d.id, d])),
            chests: new Map((Array.isArray(saved.chests) ? saved.chests : []).flatMap((entry) => {
              const savedTile = saved.blockModifications.find((mod) => mod.x === entry.x && mod.y === entry.y)?.tile;
              if (!entry || !Number.isSafeInteger(entry.x) || !Number.isSafeInteger(entry.y) ||
                  (savedTile !== TileType.CHEST && savedTile !== TileType.FURNACE)) return [];
              const id = savedTile === TileType.CHEST ? makeWorldChestId(key, saved.seed, entry.x, entry.y) : worldObjectId(saved.seed, entry.x, entry.y, 'furnace');
              if (entry.id !== id) return [];
              return [[id, { id, x: entry.x, y: entry.y, slots: sanitizeChestSlots(entry.slots), revision: Number.isSafeInteger(entry.revision) ? Math.max(0, entry.revision) : 0 } as WorldChest] as const];
            })),
            worldObjects: restoreWorldObjects(saved.seed, saved.blockModifications, saved.worldObjects),
            pressurePlateOccupants: new Map(),
            nextDropId: saved.nextDropId || Math.max(1, ...saved.drops.map((d) => d.id + 1)),
            createdAt: saved.createdAt,
            activeTimeElapsedSec: saved.activeTimeElapsedSec || 0,
            lastClockTickAt: Date.now(),
            lastTimeSyncAt: Date.now(),
            wildlife: new Map(),
            dormantWildlife: new Map(),
            killedWildlifeIds: new Set(saved.killedWildlifeIds || []),
            lastWildlifeSpawnAt: 0,
            lastWildlifeSyncAt: 0,
            worldDirty: false,
            chatHistory: [],
            protectors: new Map(
              (Array.isArray((saved as any).protectors) ? (saved as any).protectors : []).map((p: any) => [p.id, p])
            ),
            firstChestPlacedPlayers: new Set(
              Array.isArray((saved as any).firstChestPlacedPlayers) ? (saved as any).firstChestPlacedPlayers : []
            ),
            spawnedPlayerPositions: new Map(
              (Array.isArray((saved as any).spawnedPlayerPositions) ? (saved as any).spawnedPlayerPositions : []).map((p: any) => [p.playerId, { x: p.x, y: p.y }])
            ),
          };
          const existingSaved = getAllSavedPlayers(key);
          for (const sp of existingSaved) {
            if (!lobby.spawnedPlayerPositions.has(sp.playerId)) {
              lobby.spawnedPlayerPositions.set(sp.playerId, { x: sp.x, y: sp.y });
            }
          }
          resetPressurePlatesWithoutOccupants(lobby);
          lobbies.set(key, lobby);
          if (lobby.worldDirty) persistLobby(lobby);
        } else {
          const seed = worldInputToSeed(lobbyName);
          const now = Date.now();
          lobby = {
            id: `lobby-${nextLobbyNumber++}`,
            name: lobbyName,
            seed,
            terrainGen: new TerrainGenerator(seed),
            players: new Set(),
            blockModifications: new Map(),
            drops: new Map(),
            chests: new Map(),
            worldObjects: new Map(),
            pressurePlateOccupants: new Map(),
            nextDropId: 1,
            createdAt: now,
            activeTimeElapsedSec: 0,
            lastClockTickAt: now,
            lastTimeSyncAt: now,
            wildlife: new Map(),
            dormantWildlife: new Map(),
            killedWildlifeIds: new Set(),
            lastWildlifeSpawnAt: 0,
            lastWildlifeSyncAt: 0,
            worldDirty: true,
            chatHistory: [],
            protectors: new Map(),
            firstChestPlacedPlayers: new Set(),
            spawnedPlayerPositions: new Map(),
          };
          const existingSaved = getAllSavedPlayers(key);
          for (const sp of existingSaved) {
            if (!lobby.spawnedPlayerPositions.has(sp.playerId)) {
              lobby.spawnedPlayerPositions.set(sp.playerId, { x: sp.x, y: sp.y });
            }
          }
          lobbies.set(key, lobby);
          persistLobby(lobby);
        }
      }

      if (lobby.players.size >= MAX_LOBBY_PLAYERS) {
        send(socket, { type: 'error', message: 'This lobby is full. Please join another lobby.' });
        return;
      }

      const joiningClient = clients.get(socket)!;
      const authToken = typeof request.authToken === 'string' ? request.authToken.trim() : '';
      const account = getAccountFromAuthToken(authToken);
      const proposedDisplayName = typeof request.displayName === 'string' ? sanitizeDisplayName(request.displayName, 16) : '';
      if (account) {
        joiningClient.accountId = account.id;
        joiningClient.displayName = sanitizeDisplayName(account.displayName, 16);
      } else {
        joiningClient.accountId = undefined;
        joiningClient.displayName = proposedDisplayName || joiningClient.displayName || createRandomProfileName();
      }
      joiningClient.leaderboardTimeAt = Date.now();

      let requestedPlayerId = typeof request.playerId === 'string' && /^[a-zA-Z0-9_-]{2,64}$/.test(request.playerId.trim())
        ? request.playerId.trim()
        : '';

      // Prevent account impersonation: unauthenticated client cannot claim an account ID
      if (requestedPlayerId && (requestedPlayerId.startsWith('roblox-') || requestedPlayerId.startsWith('acct-'))) {
        if (!account || (account.id !== requestedPlayerId && `acct-${account.id}` !== requestedPlayerId)) {
          requestedPlayerId = '';
        }
      }

      // Check if requestedPlayerId is already in use by any other currently active connection
      const isPlayerIdInUse = Boolean(
        requestedPlayerId &&
        Array.from(clients.entries()).some(([sock, c]) => sock !== socket && c.playerId === requestedPlayerId)
      );

      if (!requestedPlayerId || isPlayerIdInUse) {
        const canonicalId = account ? (account.id.startsWith('roblox-') || account.id.startsWith('acct-') ? account.id : `acct-${account.id}`) : `player-${nextPlayerNumber++}`;
        requestedPlayerId = canonicalId;
        while (Array.from(clients.values()).some((c) => c.playerId === requestedPlayerId)) {
          requestedPlayerId = account ? `${canonicalId}-${Math.floor(100 + Math.random() * 900)}` : `player-${nextPlayerNumber++}`;
        }
      }
      joiningClient.playerId = requestedPlayerId;
      joiningClient.lobby = lobby;
      registerLeaderboardPlayer(joiningClient.playerId, joiningClient.displayName);

      // Restore world block modifications from client/cloud backup if server storage was reset by a deployment update
      const rawBackup = request.clientBackup && typeof request.clientBackup === 'object'
        ? (request.clientBackup as Record<string, unknown>)
        : null;
      if (lobby.blockModifications.size === 0 && rawBackup && Array.isArray(rawBackup.blockModifications)) {
        for (const item of rawBackup.blockModifications.slice(0, 5000)) {
          if (!item || typeof item !== 'object') continue;
          const m = item as Record<string, unknown>;
          if (
            Number.isSafeInteger(m.x) &&
            Number.isSafeInteger(m.y) &&
            Math.abs(m.x as number) <= MAX_BLOCK_COORDINATE &&
            Math.abs(m.y as number) <= MAX_BLOCK_COORDINATE &&
            typeof m.tile === 'number' &&
            Number.isInteger(m.tile) &&
            VALID_TILES.has(m.tile as TileType)
          ) {
            const bx = m.x as number;
            const by = m.y as number;
            const tile = m.tile as TileType;
            lobby.blockModifications.set(`${bx},${by}`, { x: bx, y: by, tile });
            if (tile === TileType.CHEST || tile === TileType.FURNACE) {
              const cid = containerIdAt(lobby, bx, by, tile);
              if (!lobby.chests.has(cid)) {
                lobby.chests.set(cid, {
                  id: cid,
                  x: bx,
                  y: by,
                  containerType: tile === TileType.FURNACE ? 'Furnace' : 'Chest',
                  slots: makeEmptyChestSlots(),
                  revision: 0,
                });
              }
            }
            const objType = objectTypeForTile(tile);
            if (objType) {
              const oid = worldObjectId(lobby.seed, bx, by, objType);
              if (!lobby.worldObjects.has(oid)) {
                lobby.worldObjects.set(oid, makeWorldObject(lobby.seed, bx, by, objType));
              }
            }
          }
        }
        if (lobby.blockModifications.size > 0) {
          lobby.worldDirty = true;
          persistLobby(lobby);
        }
      }

      // Check if persistent profile exists for this player in this world
      const savedPlayer = loadPlayerData(key, requestedPlayerId);
      let restoredPlayerFromBackup = false;
      const backupPlayer = rawBackup && rawBackup.playerState && typeof rawBackup.playerState === 'object'
        ? (rawBackup.playerState as Record<string, unknown>)
        : null;
      if (savedPlayer) {
        joiningClient.health = typeof savedPlayer.health === 'number' ? Math.max(0, Math.min(savedPlayer.maxHealth || 100, savedPlayer.health)) : 100;
        joiningClient.maxHealth = savedPlayer.maxHealth || 100;
        joiningClient.isAlive = typeof savedPlayer.isAlive === 'boolean' ? (savedPlayer.isAlive && joiningClient.health > 0) : (joiningClient.health > 0);
        if (joiningClient.health <= 0) {
          joiningClient.health = 0;
          joiningClient.isAlive = false;
        }
        joiningClient.food = typeof savedPlayer.food === 'number' ? savedPlayer.food : 100;
        joiningClient.stamina = typeof savedPlayer.stamina === 'number' ? savedPlayer.stamina : 100;
        joiningClient.facingRight = savedPlayer.facingRight ?? true;
        joiningClient.inventory.loadFromJSON(savedPlayer.inventory);
        joiningClient.processedChestRequestIds = new Set(Array.isArray(savedPlayer.processedChestRequestIds)
          ? savedPlayer.processedChestRequestIds.filter((id): id is string => typeof id === 'string').slice(-512)
          : []);
        joiningClient.processedObjectRequestIds = new Set(Array.isArray(savedPlayer.processedObjectRequestIds) ? savedPlayer.processedObjectRequestIds.filter((id): id is string => typeof id === 'string').slice(-512) : []);

        const savedPosition = isSavedPositionSafe(lobby, savedPlayer.x, savedPlayer.y)
          ? { x: savedPlayer.x, y: savedPlayer.y }
          : null;
        // Spawn reservations protect first-time joins. A returning player's
        // saved position may now overlap another player's stale original
        // spawn reservation, so only active occupants should block restoring it.
        const safePos = savedPosition && isSpawnSeparated(lobby, requestedPlayerId, savedPosition.x, savedPosition.y, false)
          ? savedPosition
          : assignFirstTimePlayerSpawn(lobby, requestedPlayerId);
        lobby.spawnedPlayerPositions.set(requestedPlayerId, safePos);
        joiningClient.x = safePos.x;
        joiningClient.y = safePos.y;
        const savedSpawn = typeof savedPlayer.spawnX === 'number' && typeof savedPlayer.spawnY === 'number' &&
          isSavedPositionSafe(lobby, savedPlayer.spawnX, savedPlayer.spawnY) &&
          isSpawnSeparated(lobby, requestedPlayerId, savedPlayer.spawnX, savedPlayer.spawnY)
          ? { x: savedPlayer.spawnX, y: savedPlayer.spawnY }
          : safePos;
        joiningClient.spawnX = savedSpawn.x;
        joiningClient.spawnY = savedSpawn.y;
      } else if (backupPlayer && backupPlayer.inventory && typeof backupPlayer.inventory === 'object') {
        restoredPlayerFromBackup = true;
        joiningClient.health = typeof backupPlayer.health === 'number' && Number.isFinite(backupPlayer.health)
          ? Math.max(1, Math.min(100, Math.round(backupPlayer.health)))
          : 100;
        joiningClient.maxHealth = 100;
        joiningClient.isAlive = true;
        joiningClient.food = typeof backupPlayer.food === 'number' && Number.isFinite(backupPlayer.food)
          ? Math.max(0, Math.min(100, Math.round(backupPlayer.food)))
          : 100;
        joiningClient.stamina = typeof backupPlayer.stamina === 'number' && Number.isFinite(backupPlayer.stamina)
          ? Math.max(0, Math.min(100, Math.round(backupPlayer.stamina)))
          : 100;
        joiningClient.facingRight = typeof backupPlayer.facingRight === 'boolean' ? backupPlayer.facingRight : true;
        joiningClient.inventory.loadFromJSON(backupPlayer.inventory as any);
        let safePos: { x: number; y: number };
        if (typeof backupPlayer.x === 'number' && Number.isFinite(backupPlayer.x) && (Math.abs(backupPlayer.x) > 20 || (backupPlayer.x !== 0 && backupPlayer.y !== 0))) {
          const restoredPos = findSafeSpawnPosition(lobby, backupPlayer.x, typeof backupPlayer.y === 'number' && Number.isFinite(backupPlayer.y) ? backupPlayer.y : (lobby.terrainGen.getSurfaceHeight(Math.floor(backupPlayer.x / TILE_SIZE)) - 2) * TILE_SIZE);
          safePos = isSavedPositionSafe(lobby, restoredPos.x, restoredPos.y) && isSpawnSeparated(lobby, requestedPlayerId, restoredPos.x, restoredPos.y)
            ? restoredPos
            : assignFirstTimePlayerSpawn(lobby, requestedPlayerId);
        } else {
          safePos = assignFirstTimePlayerSpawn(lobby, requestedPlayerId);
        }
        lobby.spawnedPlayerPositions.set(requestedPlayerId, safePos);
        joiningClient.x = safePos.x;
        joiningClient.y = safePos.y;
        joiningClient.spawnX = safePos.x;
        joiningClient.spawnY = safePos.y;
        persistClient(joiningClient);
      } else {
        const safePos = assignFirstTimePlayerSpawn(lobby, requestedPlayerId);
        joiningClient.x = safePos.x;
        joiningClient.y = safePos.y;
        joiningClient.spawnX = safePos.x;
        joiningClient.spawnY = safePos.y;
        persistClient(joiningClient);
      }

      if (!savedPlayer && !restoredPlayerFromBackup) {
        const biome = lobby.terrainGen.getColumnBiome(Math.floor(joiningClient.x / TILE_SIZE));
        const spawnNotice: ChatMessage = {
          messageId: `${Date.now()}-spawn-${Math.random().toString(36).slice(2, 6)}`,
          playerId: 'server',
          playerName: 'Server',
          text: `👋 ${joiningClient.displayName} joined the server for the first time and settled in the ${biome.name} biome!`,
          timestamp: Date.now(),
        };
        lobby.chatHistory.push(spawnNotice);
        if (lobby.chatHistory.length > 50) lobby.chatHistory.shift();
        const broadcastNotice = { type: 'chat_broadcast', message: spawnNotice };
        for (const playerSocket of lobby.players) {
          send(playerSocket, broadcastNotice);
        }
      }

      lobby.players.add(socket);
      lobby.lastClockTickAt = Date.now();
      spawnWildlifeNearPlayers(lobby);
      const lobbyTime = getLobbyTime(lobby);
      const players = Array.from(lobby.players)
        .filter((player) => player !== socket)
        .map((player) => {
          const existing = clients.get(player)!;
          return {
            playerId: existing.playerId,
            displayName: existing.displayName,
            x: existing.x,
            y: existing.y,
            facingRight: existing.facingRight,
            health: existing.health,
            maxHealth: existing.maxHealth,
            isAlive: existing.isAlive,
          };
        });
      send(socket, {
        type: 'lobby_joined',
        success: true,
        lobbyId: lobby.id,
        lobbyName: lobby.name,
        worldSeed: lobby.seed,
        playerId: joiningClient.playerId,
        lifeId: joiningClient.lifeId,
        displayName: joiningClient.displayName,
        playerCount: lobby.players.size,
        health: joiningClient.health,
        maxHealth: joiningClient.maxHealth,
        isAlive: joiningClient.isAlive,
        food: joiningClient.food,
        stamina: joiningClient.stamina,
        spawnX: joiningClient.x,
        spawnY: joiningClient.y,
        isNewPlayer: !savedPlayer && !restoredPlayerFromBackup,
        worldTime: lobbyTime.time,
        dayCount: lobbyTime.day,
        inventory: joiningClient.inventory.toJSON(),
        players,
        blockModifications: Array.from(lobby.blockModifications.values()),
        drops: Array.from(lobby.drops.values()),
        chests: Array.from(lobby.chests.values()),
        worldObjects: Array.from(lobby.worldObjects.values()),
        protectors: Array.from(lobby.protectors ? lobby.protectors.values() : []),
        wildlife: Array.from(lobby.wildlife.values()).map((a) => ({
          id: a.id,
          species: a.species,
          biome: a.biome,
          ownerChunkX: a.ownerChunkX,
          ownerChunkY: a.ownerChunkY,
          x: Math.round(a.x * 10) / 10,
          y: Math.round(a.y * 10) / 10,
          direction: a.direction,
          state: a.state,
          targetPlayerId: a.targetPlayerId,
          health: a.health,
          maxHealth: a.maxHealth,
        })),
        chatHistory: lobby.chatHistory,
      });
      debugCombat('player.joined', { playerId: joiningClient.playerId, lifeId: joiningClient.lifeId, health: joiningClient.health, alive: joiningClient.isAlive, x: joiningClient.x, y: joiningClient.y, lobbyId: lobby.id });
      for (const s of clients.keys()) {
        if (s.readyState === WebSocket.OPEN && s !== socket) {
          send(s, { type: 'friends_updated' });
        }
      }
      const joined = {
        type: 'player_joined',
        playerId: joiningClient.playerId,
        displayName: joiningClient.displayName,
        x: joiningClient.x,
        y: joiningClient.y,
        facingRight: joiningClient.facingRight,
        health: joiningClient.health,
        maxHealth: joiningClient.maxHealth,
        isAlive: joiningClient.isAlive,
      };
      for (const player of lobby.players) if (player !== socket) send(player, joined);
      lobbyUpdate(lobby);
    });
    socket.on('close', () => removeClient(socket));
    socket.on('error', () => removeClient(socket));
  });

  const saveAll = () => {
    for (const client of clients.values()) {
      persistClient(client);
    }
    for (const lobby of lobbies.values()) {
      persistLobby(lobby);
    }
  };
  process.on('SIGINT', saveAll);
  process.on('SIGTERM', saveAll);

  return wsServer;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || '0.0.0.0';
  const standaloneHttpServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Pixel Frontier multiplayer lobby server\n');
  });
  const wsServer = setupMultiplayerWebSocket(standaloneHttpServer);
  standaloneHttpServer.listen(port, host, () => console.log(`Pixel Frontier lobby server listening on ws://${host}:${port}`));

  const shutdown = () => {
    for (const socket of wsServer.clients) socket.close(1001, 'Server shutting down');
    wsServer.close();
    standaloneHttpServer.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
