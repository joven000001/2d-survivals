import { CHUNK_HEIGHT, CHUNK_WIDTH } from './constants';
import { TileType } from './types';

export interface SavedHome {
  x: number;
  y: number;
  seed: number;
  savedAt: number;
}

export class WorldModifications {
  // Key format: "worldX,worldY" -> TileType
  private modifiedBlocks: Map<string, TileType> = new Map();
  private modifiedByChunk: Map<string, Set<string>> = new Map();
  private dirty: boolean = false;

  constructor(private readonly persistLocally = true) {}

  public static saveCurrentSeed(seed: number) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('pixel_frontier_current_seed', String(seed));
      }
    } catch {
      // Storage may be unavailable; the current session can still run normally.
    }
  }

  public static loadCurrentSeed(): number | null {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem('pixel_frontier_current_seed');
      if (raw === null) return null;
      const seed = Number(raw);
      return Number.isFinite(seed) && seed >= 0 ? seed : null;
    } catch {
      return null;
    }
  }

  public saveHome(seed: number, x: number, y: number): SavedHome | null {
    const home: SavedHome = { x, y, seed, savedAt: Date.now() };
    if (!this.persistLocally) return home;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      window.localStorage.setItem(`pixel_frontier_home_${seed}`, JSON.stringify(home));
      return home;
    } catch {
      return null;
    }
  }

  public loadHome(seed: number): SavedHome | null {
    if (!this.persistLocally) return null;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      const raw = window.localStorage.getItem(`pixel_frontier_home_${seed}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SavedHome>;
      if (parsed.seed !== seed || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
      return { x: parsed.x!, y: parsed.y!, seed, savedAt: Number.isFinite(parsed.savedAt) ? parsed.savedAt! : 0 };
    } catch {
      return null;
    }
  }

  public deleteHome(seed: number): boolean {
    if (!this.persistLocally) return true;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      window.localStorage.removeItem(`pixel_frontier_home_${seed}`);
      return true;
    } catch {
      return false;
    }
  }

  public static getKey(x: number, y: number): string {
    return `${x},${y}`;
  }

  public setBlock(x: number, y: number, tile: TileType) {
    const blockKey = WorldModifications.getKey(x, y);
    this.modifiedBlocks.set(blockKey, tile);
    const chunkKey = WorldModifications.getKey(Math.floor(x / CHUNK_WIDTH), Math.floor(y / CHUNK_HEIGHT));
    let chunkBlocks = this.modifiedByChunk.get(chunkKey);
    if (!chunkBlocks) this.modifiedByChunk.set(chunkKey, (chunkBlocks = new Set()));
    chunkBlocks.add(blockKey);
    this.dirty = true;
  }

  public getBlock(x: number, y: number): TileType | undefined {
    return this.modifiedBlocks.get(WorldModifications.getKey(x, y));
  }

  public hasBlock(x: number, y: number): boolean {
    return this.modifiedBlocks.has(WorldModifications.getKey(x, y));
  }

  public getCount(): number {
    return this.modifiedBlocks.size;
  }

  public getEntries(): Array<[string, TileType]> {
    return Array.from(this.modifiedBlocks.entries());
  }

  public mergeEntries(entries: Iterable<[string, TileType]>) {
    for (const [key, tile] of entries) {
      if (typeof key !== 'string' || typeof tile !== 'number') continue;
      const commaIdx = key.indexOf(',');
      if (commaIdx < 0) continue;
      const bx = parseInt(key.substring(0, commaIdx), 10);
      const by = parseInt(key.substring(commaIdx + 1), 10);
      if (!Number.isFinite(bx) || !Number.isFinite(by)) continue;
      this.modifiedBlocks.set(key, tile);
      const chunkKey = WorldModifications.getKey(Math.floor(bx / CHUNK_WIDTH), Math.floor(by / CHUNK_HEIGHT));
      let chunkBlocks = this.modifiedByChunk.get(chunkKey);
      if (!chunkBlocks) this.modifiedByChunk.set(chunkKey, (chunkBlocks = new Set()));
      chunkBlocks.add(key);
    }
    this.dirty = true;
  }

  // Apply all recorded modifications falling inside chunk (cx, cy)
  public applyToChunk(cx: number, cy: number, tiles: Uint8Array) {
    if (this.modifiedBlocks.size === 0) return;

    const startX = cx * CHUNK_WIDTH;
    const endX = startX + CHUNK_WIDTH;
    const startY = cy * CHUNK_HEIGHT;
    const endY = startY + CHUNK_HEIGHT;

    const chunkBlocks = this.modifiedByChunk.get(WorldModifications.getKey(cx, cy));
    if (!chunkBlocks) return;
    for (const key of chunkBlocks) {
      const tile = this.modifiedBlocks.get(key);
      if (tile === undefined) continue;
      const commaIdx = key.indexOf(',');
      const bx = parseInt(key.substring(0, commaIdx), 10);
      const by = parseInt(key.substring(commaIdx + 1), 10);

      if (bx >= startX && bx < endX && by >= startY && by < endY) {
        const lx = bx - startX;
        const ly = by - startY;
        tiles[ly * CHUNK_WIDTH + lx] = tile;
      }
    }
  }

  // Save modifications to localStorage (safe, non-blocking)
  public saveToLocalStorage(seed: number, force = false) {
    if (!this.persistLocally) return;
    if (!this.dirty && !force) return;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const data: [string, number][] = Array.from(this.modifiedBlocks.entries());
      const payload = JSON.stringify({
        seed,
        version: 1,
        timestamp: Date.now(),
        blocks: data,
      });
      window.localStorage.setItem(`pixel_frontier_mods_${seed}`, payload);
      this.dirty = false;
    } catch {
      // Storage quota or privacy mode error ignored safely
    }
  }

  // Load modifications from localStorage
  public loadFromLocalStorage(seed: number) {
    if (!this.persistLocally) return;
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(`pixel_frontier_mods_${seed}`);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.blocks)) {
        this.modifiedBlocks.clear();
        this.modifiedByChunk.clear();
        for (const [key, tile] of parsed.blocks) {
          this.modifiedBlocks.set(key, tile as TileType);
          const commaIdx = key.indexOf(',');
          const bx = parseInt(key.substring(0, commaIdx), 10);
          const by = parseInt(key.substring(commaIdx + 1), 10);
          const chunkKey = WorldModifications.getKey(Math.floor(bx / CHUNK_WIDTH), Math.floor(by / CHUNK_HEIGHT));
          let chunkBlocks = this.modifiedByChunk.get(chunkKey);
          if (!chunkBlocks) this.modifiedByChunk.set(chunkKey, (chunkBlocks = new Set()));
          chunkBlocks.add(key);
        }
        this.dirty = false;
      }
    } catch {
      // JSON parse error ignored
    }
  }

  public clear() {
    this.modifiedBlocks.clear();
    this.modifiedByChunk.clear();
    this.dirty = true;
  }
}
