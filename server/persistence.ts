import fs from 'node:fs';
import path from 'node:path';
import { ItemType } from '../src/game/blocks';
import { SerializedInventory } from '../src/game/inventory';
import type { WorldChest } from '../src/game/chests';
import type { InteractiveObjectState } from '../src/game/worldObjects';

export interface SavedWorldData {
  id: string;
  name: string;
  seed: number;
  createdAt: number;
  activeTimeElapsedSec: number;
  blockModifications: Array<{
    x: number;
    y: number;
    tile: number;
    previousTile?: number;
    playerId?: string;
    timestamp?: number;
  }>;
  killedWildlifeIds: string[];
  drops: Array<{
    id: number;
    type: ItemType;
    count: number;
    x: number;
    y: number;
    ownerPlayerId?: string;
    ownerPickupUntil?: number;
  }>;
  chests?: WorldChest[];
  worldObjects?: InteractiveObjectState[];
  protectors?: Array<{
    id: string;
    x: number;
    y: number;
    ownerPlayerId: string;
    ownerDisplayName: string;
    createdAt: number;
  }>;
  firstChestPlacedPlayers?: string[];
  spawnedPlayerPositions?: Array<{ playerId: string; x: number; y: number }>;
  nextDropId: number;
  lastSavedAt: number;
}

export interface SavedPlayerData {
  playerId: string;
  x: number;
  y: number;
  spawnX?: number;
  spawnY?: number;
  facingRight: boolean;
  health: number;
  maxHealth: number;
  food: number;
  stamina: number;
  isAlive: boolean;
  inventory: SerializedInventory;
  processedChestRequestIds?: string[];
  processedObjectRequestIds?: string[];
  lastSavedAt: number;
}

/** Defaults to the historical location so existing saves remain in place. Set
 * PIXEL_FRONTIER_DATA_DIR to a mounted persistent directory when deploying. */
export function getPersistenceDataDir(): string {
  const configured = process.env.PIXEL_FRONTIER_DATA_DIR?.trim();
  return path.resolve(configured || path.join(process.cwd(), 'data', 'multiplayer'));
}

const BASE_DATA_DIR = getPersistenceDataDir();

function sanitizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 64) || 'default';
}

export function safeWriteJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');

  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err?.code === 'EPERM') {
      // Windows may reject replacing an existing file. Copy the old snapshot
      // first, then restore it if installing the new snapshot fails.
      const backupPath = `${filePath}.bak.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
      const hadExisting = fs.existsSync(filePath);
      let backedUp = false;
      try {
        if (hadExisting) {
          fs.copyFileSync(filePath, backupPath);
          backedUp = true;
          fs.unlinkSync(filePath);
        }
        fs.renameSync(tempPath, filePath);
        if (hadExisting) {
          try { fs.unlinkSync(backupPath); } catch { /* retain recoverable backup */ }
        }
        return;
      } catch (retryError) {
        if (backedUp && !fs.existsSync(filePath) && fs.existsSync(backupPath)) {
          try {
            fs.copyFileSync(backupPath, filePath);
            fs.unlinkSync(backupPath);
          } catch { /* backup remains recoverable */ }
        }
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
        throw retryError;
      }
    }

    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {}
    throw error;
  }
}

function readJsonWithBackup(filePath: string): unknown | null {
  const candidates = [filePath];
  const dir = path.dirname(filePath);
  const prefix = `${path.basename(filePath)}.bak.`;
  if (fs.existsSync(dir)) {
    candidates.push(...fs.readdirSync(dir).filter((name) => name.startsWith(prefix))
      .map((name) => path.join(dir, name)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs));
  }
  for (const candidate of candidates) {
    try { return JSON.parse(fs.readFileSync(candidate, 'utf8')); } catch { /* try prior snapshot */ }
  }
  return null;
}

export function saveWorldData(worldKey: string, data: SavedWorldData): void {
  try {
    const key = sanitizeKey(worldKey);
    const worldDir = path.join(BASE_DATA_DIR, key);
    const worldFile = path.join(worldDir, 'world.json');
    safeWriteJson(worldFile, data);
  } catch (err) {
    console.error(`[Persistence] Failed to save world ${worldKey}:`, err);
  }
}

export function loadWorldData(worldKey: string): SavedWorldData | null {
  try {
    const key = sanitizeKey(worldKey);
    const worldFile = path.join(BASE_DATA_DIR, key, 'world.json');
    const parsed = readJsonWithBackup(worldFile);
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as Record<string, unknown>).seed !== 'number') return null;
    return parsed as SavedWorldData;
  } catch (err) {
    console.error(`[Persistence] Failed to load world ${worldKey}:`, err);
    return null;
  }
}

export function savePlayerData(worldKey: string, playerId: string, data: SavedPlayerData): void {
  try {
    const wKey = sanitizeKey(worldKey);
    const pKey = sanitizeKey(playerId);
    const playerFile = path.join(BASE_DATA_DIR, wKey, 'players', `${pKey}.json`);
    safeWriteJson(playerFile, data);
  } catch (err) {
    console.error(`[Persistence] Failed to save player ${playerId} in ${worldKey}:`, err);
  }
}

export function loadPlayerData(worldKey: string, playerId: string): SavedPlayerData | null {
  try {
    const wKey = sanitizeKey(worldKey);
    const pKey = sanitizeKey(playerId);
    const playerFile = path.join(BASE_DATA_DIR, wKey, 'players', `${pKey}.json`);
    const parsed = readJsonWithBackup(playerFile);
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as Record<string, unknown>).playerId !== 'string') return null;
    return parsed as SavedPlayerData;
  } catch (err) {
    console.error(`[Persistence] Failed to load player ${playerId} in ${worldKey}:`, err);
    return null;
  }
}

export function getAllSavedPlayers(worldKey: string): Array<{ playerId: string; x: number; y: number; spawnX?: number; spawnY?: number }> {
  try {
    const wKey = sanitizeKey(worldKey);
    const playersDir = path.join(BASE_DATA_DIR, wKey, 'players');
    if (!fs.existsSync(playersDir)) return [];
    const files = fs.readdirSync(playersDir).filter((file) => file.endsWith('.json'));
    const results: Array<{ playerId: string; x: number; y: number; spawnX?: number; spawnY?: number }> = [];
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(playersDir, f), 'utf8');
        const p = JSON.parse(raw);
        if (p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.playerId === 'string') {
          results.push({ playerId: p.playerId, x: p.x, y: p.y, spawnX: p.spawnX, spawnY: p.spawnY });
        }
      } catch {}
    }
    return results;
  } catch (err) {
    console.error(`[Persistence] Failed to read saved players in ${worldKey}:`, err);
    return [];
  }
}
