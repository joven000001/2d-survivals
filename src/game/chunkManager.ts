import {
  CHUNK_GEN_TIME_BUDGET_MS,
  CHUNK_HEIGHT,
  CHUNK_PIXEL_HEIGHT,
  CHUNK_PIXEL_WIDTH,
  CHUNK_WIDTH,
  LOAD_RADIUS_X,
  LOAD_RADIUS_Y,
  TILE_DEFS,
  TILE_SIZE,
  SURFACE_BASE_Y,
  UNLOAD_RADIUS_X,
  UNLOAD_RADIUS_Y,
} from './constants';
import { TerrainGenerator, TreeData } from './terrainGen';
import { Chunk, TileType } from './types';
import { WorldModifications } from './worldModifications';
import { CRAFTABLE_STRUCTURE_TILES, getBlockSprite, getBlockVisualVariant } from './blockArt';

const FOLIAGE_SURFACE_TILES = new Set<TileType>([TileType.GRASS, TileType.SAND, TileType.SNOW, TileType.DRY_GRASS, TileType.FLOWER_GRASS, TileType.MUD, TileType.OASIS_GRASS, TileType.MUSHROOM_GRASS, TileType.SKY_GRASS]);
const DECORATIVE_FOLIAGE_TILES = new Set<TileType>([TileType.BAMBOO, TileType.CORAL, TileType.GLOWING_CRYSTAL, TileType.GLOWING_MUSHROOM, TileType.VINE, TileType.ACACIA_LEAVES, TileType.CHERRY_LEAVES, TileType.PALM_LEAVES, TileType.STAR_FLOWER, TileType.SKY_VINE, TileType.CELESTIAL_LEAVES]);
const VARIANT_TRUNK_TILES = new Set<TileType>([TileType.WOOD, TileType.BIRCH_WOOD, TileType.ACACIA_WOOD, TileType.CHERRY_WOOD, TileType.PALM_WOOD, TileType.CELESTIAL_WOOD]);
const LEAF_TILES = new Set<TileType>([
  TileType.LEAVES,
  TileType.BIRCH_LEAVES,
  TileType.ACACIA_LEAVES,
  TileType.CHERRY_LEAVES,
  TileType.PALM_LEAVES,
  TileType.CELESTIAL_LEAVES,
]);

// Cache 16x16 contextual wood & leaf tiles by (tile, variant, neighborBitmask)
// so chunk baking draws a single cached sprite instead of 30+ fillRect calls per block.
const contextualTreeSpriteCache = new Map<number, HTMLCanvasElement>();

interface QueuedChunk {
  cx: number;
  cy: number;
  priority: number; // 0 = player chunk, 1 = adjacent, 2 = outer
  pinned?: boolean;
}

interface ChunkBuildTask {
  key: string;
  iterator: Generator<void, Chunk, void>;
}

export class ChunkManager {
  public terrainGen: TerrainGenerator;
  public modifications: WorldModifications;
  public loadedChunks: Map<string, Chunk> = new Map();
  public currentChunkX: number = 0;
  public currentChunkY: number = 0;

  // Priority generation queue
  private queue: QueuedChunk[] = [];
  private queuedKeys: Set<string> = new Set();
  private pinnedChunkKeys: Set<string> = new Set();
  private buildTasks: Map<string, ChunkBuildTask> = new Map();

  constructor(seed: number, persistLocally = true) {
    this.terrainGen = new TerrainGenerator(seed);
    this.modifications = new WorldModifications(persistLocally);
    this.modifications.loadFromLocalStorage(seed);
  }

  public get seed(): number {
    return this.terrainGen.seed;
  }

  public get queuedCount(): number {
    return this.queue.length;
  }

  public static getChunkKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  // Seed the normal streaming queue around spawn. Collision reads remain deterministic
  // while the first cached chunks are generated within the regular frame budget.
  public preloadImmediateArea(playerBlockX: number, playerBlockY: number) {
    const pcx = Math.floor(playerBlockX / CHUNK_WIDTH);
    const pcy = Math.floor(playerBlockY / CHUNK_HEIGHT);
    this.currentChunkX = pcx;
    this.currentChunkY = pcy;

    this.updatePlayerPosition(playerBlockX, playerBlockY);
  }

  private lastCheckedCX: number = -999999;
  private lastCheckedCY: number = -999999;

  // Update streaming positions & maintain strict queue
  public updatePlayerPosition(playerBlockX: number, playerBlockY: number) {
    const pcx = Math.floor(playerBlockX / CHUNK_WIDTH);
    const pcy = Math.floor(playerBlockY / CHUNK_HEIGHT);

    this.currentChunkX = pcx;
    this.currentChunkY = pcy;

    // Fast-path: if player is still in the same chunk and queue is empty, skip redundant scanning
    if (pcx === this.lastCheckedCX && pcy === this.lastCheckedCY && this.queue.length === 0) {
      return;
    }
    this.lastCheckedCX = pcx;
    this.lastCheckedCY = pcy;

    // 1. Enqueue missing chunks within LOAD_RADIUS (5x5 grid)
    for (let dx = -LOAD_RADIUS_X; dx <= LOAD_RADIUS_X; dx++) {
      for (let dy = -LOAD_RADIUS_Y; dy <= LOAD_RADIUS_Y; dy++) {
        const cx = pcx + dx;
        const cy = pcy + dy;
        const key = ChunkManager.getChunkKey(cx, cy);

        if (!this.loadedChunks.has(key) && !this.queuedKeys.has(key)) {
          const priority = Math.abs(dx) + Math.abs(dy);
          this.queue.push({ cx, cy, priority });
          this.queuedKeys.add(key);
        }
      }
    }

    if (this.queue.length > 1) {
      this.queue.sort((a, b) => a.priority - b.priority);
    }

    // 2. Unload chunks outside UNLOAD_RADIUS (strict pruning)
    for (const [key, chunk] of this.loadedChunks.entries()) {
      if (
        (Math.abs(chunk.cx - pcx) > UNLOAD_RADIUS_X ||
        Math.abs(chunk.cy - pcy) > UNLOAD_RADIUS_Y) &&
        !this.pinnedChunkKeys.has(key)
      ) {
        if (chunk.canvas) {
          chunk.canvas.width = 0;
          chunk.canvas.height = 0;
          chunk.canvas = null;
        }
        this.loadedChunks.delete(key);
      }
    }

    // Prune stale queue items and their partial, unpublished work.
    if (this.queue.length > 0) {
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const item = this.queue[i];
        if (
          ((Math.abs(item.cx - pcx) > UNLOAD_RADIUS_X ||
          Math.abs(item.cy - pcy) > UNLOAD_RADIUS_Y) && !item.pinned)
        ) {
          this.queuedKeys.delete(ChunkManager.getChunkKey(item.cx, item.cy));
          this.buildTasks.delete(ChunkManager.getChunkKey(item.cx, item.cy));
          this.queue.splice(i, 1);
        }
      }
    }
  }

  // Process queued chunks with strict time budget per frame (e.g. 2.5ms)
  public processQueue(timeBudgetMs: number = CHUNK_GEN_TIME_BUDGET_MS): number {
    if (this.queue.length === 0) return 0;

    const startTime = performance.now();
    // Reserve a small margin for finishing the current bounded stage and queue
    // bookkeeping so the caller's per-frame budget is not exceeded in practice.
    const workBudgetMs = Math.max(0, timeBudgetMs - 1.0);

    while (this.queue.length > 0) {
      const item = this.queue[0];
      const key = ChunkManager.getChunkKey(item.cx, item.cy);
      if (
        item.pinned || (Math.abs(item.cx - this.currentChunkX) <= UNLOAD_RADIUS_X &&
        Math.abs(item.cy - this.currentChunkY) <= UNLOAD_RADIUS_Y)
      ) {
        if (!this.loadedChunks.has(key)) {
          let task = this.buildTasks.get(key);
          if (!task) {
            task = { key, iterator: this.generateChunkSteps(item.cx, item.cy) };
            this.buildTasks.set(key, task);
          }
          const result = task.iterator.next();
          if (result.done) {
            this.loadedChunks.set(key, result.value);
            this.buildTasks.delete(key);
            this.queue.shift();
            this.queuedKeys.delete(key);
          }
        } else {
          this.queue.shift();
          this.queuedKeys.delete(key);
        }
      } else {
        this.queue.shift();
        this.queuedKeys.delete(key);
        this.buildTasks.delete(key);
      }

      if (performance.now() - startTime >= workBudgetMs) {
        break;
      }
    }

    return performance.now() - startTime;
  }

  // Pin and queue a destination chunk without bypassing the normal frame budget.
  public requestChunk(cx: number, cy: number) {
    const key = ChunkManager.getChunkKey(cx, cy);
    this.pinnedChunkKeys.add(key);
    if (!this.loadedChunks.has(key) && !this.queuedKeys.has(key)) {
      this.queue.unshift({ cx, cy, priority: -1, pinned: true });
      this.queuedKeys.add(key);
    }
  }

  public releaseChunk(cx: number, cy: number) {
    const key = ChunkManager.getChunkKey(cx, cy);
    this.pinnedChunkKeys.delete(key);
    const queued = this.queue.findIndex((item) => item.cx === cx && item.cy === cy && item.pinned);
    if (queued >= 0) {
      this.queue.splice(queued, 1);
      this.queuedKeys.delete(key);
      this.buildTasks.delete(key);
    }
  }

  // Highly optimized chunk generation
  public generateChunk(cx: number, cy: number): Chunk {
    const steps = this.generateChunkSteps(cx, cy);
    let result = steps.next();
    while (!result.done) result = steps.next();
    return result.value;
  }

  // Each iterator step is bounded to one terrain row, tree anchor, decoration
  // sample row, modification pass, scan row, or cached-canvas row.
  private *generateChunkSteps(cx: number, cy: number): Generator<void, Chunk, void> {
    const worldX = cx * CHUNK_WIDTH;
    const worldY = cy * CHUNK_HEIGHT;

    const colSurfaceY = new Int32Array(CHUNK_WIDTH);
    const colDirtDepth = new Int32Array(CHUNK_WIDTH);
    const columnBiomes: ReturnType<TerrainGenerator['getColumnBiome']>[] = new Array(CHUNK_WIDTH);
    const biomes: string[] = new Array(CHUNK_WIDTH);
    let minSurface = 999999;
    let maxSurface = -999999;

    for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
      const sh = this.terrainGen.getSurfaceHeight(worldX + lx);
      colSurfaceY[lx] = sh;
      colDirtDepth[lx] = this.terrainGen.getDirtDepth(worldX + lx);
      columnBiomes[lx] = this.terrainGen.getColumnBiome(worldX + lx);
      biomes[lx] = (worldY > SURFACE_BASE_Y + 36
        ? this.terrainGen.getBiomeAt(worldX + lx, worldY + Math.floor(CHUNK_HEIGHT / 2))
        : this.terrainGen.getColumnBiome(worldX + lx)).id;
      if (sh < minSurface) minSurface = sh;
      if (sh > maxSurface) maxSurface = sh;
      if ((lx & 7) === 7) yield;
    }

    // Sky chunk optimization (leave 40 blocks above minSurface so tall trees/crowns never clip)
    const isSkyZone = worldY + CHUNK_HEIGHT < minSurface - 40;
    const tiles = new Uint8Array(CHUNK_WIDTH * CHUNK_HEIGHT);
    let hasNonAir = false;

    if (!isSkyZone) {
      // 1. Populate base terrain
      for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
        const by = worldY + ly;
        const rowOffset = ly * CHUNK_WIDTH;

        for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
          const bx = worldX + lx;
          const sY = colSurfaceY[lx];
          const dirtDepth = colDirtDepth[lx];

          const tile = this.terrainGen.getBaseTileFast(bx, by, sY, dirtDepth, columnBiomes[lx]);
          tiles[rowOffset + lx] = tile;
          if (tile !== TileType.AIR) {
            hasNonAir = true;
          }
          // Ores add a cached per-column seam lookup to solid terrain tiles;
          // yield in smaller groups so this stage stays close to the frame budget.
          if ((lx & 3) === 3) yield;
        }
      }

      // 2. Populate Trees overlapping this chunk (scan ±9 blocks for wide spreading boughs)
      for (let tx = worldX - 9; tx <= worldX + CHUNK_WIDTH + 9; tx++) {
        const tree = this.terrainGen.getTreeAt(tx);
        if (tree) {
          this.applyTreeToChunk(tree, cx, cy, worldX, worldY, tiles);
          hasNonAir = true;
        }
        if ((tx & 3) === 0) yield;
      }

      // 3. Populate surface wildflowers & tall grass
      for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
        const bx = worldX + lx;
        const sh = colSurfaceY[lx];
        const aboveSurfaceY = sh - 1;

        if (aboveSurfaceY >= worldY && aboveSurfaceY < worldY + CHUNK_HEIGHT) {
          const ly = aboveSurfaceY - worldY;
          const idx = ly * CHUNK_WIDTH + lx;

          if (tiles[idx] === TileType.AIR || tiles[idx] === TileType.WATER) {
            const belowTile = ly + 1 < CHUNK_HEIGHT ? tiles[(ly + 1) * CHUNK_WIDTH + lx] : this.terrainGen.getColumnBiome(bx).surfaceBlock;
            if (FOLIAGE_SURFACE_TILES.has(belowTile)) {
              const foliage = this.terrainGen.getSurfaceFoliage(bx);
              if (foliage !== TileType.AIR) {
                tiles[idx] = foliage;
                hasNonAir = true;
              }
            }
          }
        }
        if ((lx & 7) === 7) yield;
      }

      // Sparse cave plants/crystals are deterministic and sampled at a coarse grid,
      // so this work is bounded to the chunk currently entering the normal queue.
      for (let ly = 0; ly < CHUNK_HEIGHT; ly += 12) {
        const by = worldY + ly;
        for (let lx = 1; lx < CHUNK_WIDTH - 1; lx += 8) {
          const bx = worldX + lx;
          const idx = ly * CHUNK_WIDTH + lx;
          if (tiles[idx] !== TileType.AIR) continue;
          const decoration = this.terrainGen.getCaveDecorationAt(bx, by);
          if (decoration !== TileType.AIR) {
            tiles[idx] = decoration;
            hasNonAir = true;
          }
        }
        yield;
      }
    } else {
      // In the sky: generate sky islands, celestial ores, star flowers, celestial trees, and hanging sky vines
      if (worldY <= 5 && worldY + CHUNK_HEIGHT >= -170) {
        for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
          const by = worldY + ly;
          const rowOffset = ly * CHUNK_WIDTH;
          for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
            const bx = worldX + lx;
            const skyTile = this.terrainGen.getSkyTile(bx, by);
            if (skyTile !== TileType.AIR) {
              tiles[rowOffset + lx] = skyTile;
              hasNonAir = true;
            }
          }
          if ((ly & 7) === 7) yield;
        }
      }
    }

    // 4. Apply persistent player modifications to this chunk
    this.modifications.applyToChunk(cx, cy, tiles);
    yield;

    // Cache waterfall and animated tile geometry after saved edits have been applied, so player
    // changes always win and rendering never has to rediscover the terrain.
    const waterfallTiles = this.collectWaterfallTiles(worldX, worldY, tiles);
    const {
      waterSurfaceTiles,
      animatedFoliageTiles,
      animatedLightTiles,
      canopyEdgeTiles,
      craftableStructureTiles,
    } = this.collectAnimatedChunkTiles(tiles);

    // Re-verify if any non-air tiles exist after modifications
    hasNonAir = false;
    for (let ly = 0; ly < CHUNK_HEIGHT; ly++) {
      const start = ly * CHUNK_WIDTH;
      for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
        if (tiles[start + lx] !== TileType.AIR) {
          hasNonAir = true;
          break;
        }
      }
      if (hasNonAir) break;
      yield;
    }

    let canvas: HTMLCanvasElement | null = null;
    if (hasNonAir && typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = CHUNK_PIXEL_WIDTH;
      canvas.height = CHUNK_PIXEL_HEIGHT;
      const ctx = canvas.getContext('2d', { alpha: true });
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        for (let row = 0; row < CHUNK_HEIGHT; row++) {
          for (let startX = 0; startX < CHUNK_WIDTH; startX += 8) {
            this.renderTileRange(tiles, ctx, row, startX, Math.min(startX + 8, CHUNK_WIDTH), worldX, worldY);
            yield;
          }
        }
      }
    }

    return {
      cx,
      cy,
      worldX,
      worldY,
      tiles,
      waterSurfaceTiles,
      waterfallTiles,
      animatedFoliageTiles,
      animatedLightTiles,
      canopyEdgeTiles,
      craftableStructureTiles,
      biomes,
      isAllAir: !hasNonAir,
      canvas,
      lastAccessed: performance.now(),
    };
  }

  // Set block (mined or placed) with surgical cache invalidation
  public setBlock(blockX: number, blockY: number, newTile: TileType) {
    this.modifications.setBlock(blockX, blockY, newTile);

    const cx = Math.floor(blockX / CHUNK_WIDTH);
    const cy = Math.floor(blockY / CHUNK_HEIGHT);
    const key = ChunkManager.getChunkKey(cx, cy);

    let chunk = this.loadedChunks.get(key);
    if (!chunk) {
      // Chunk not loaded yet: generate it
      chunk = this.generateChunk(cx, cy);
      this.loadedChunks.set(key, chunk);
      return;
    }

    const lx = ((blockX % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH;
    const ly = ((blockY % CHUNK_HEIGHT) + CHUNK_HEIGHT) % CHUNK_HEIGHT;

    chunk.tiles[ly * CHUNK_WIDTH + lx] = newTile;
    if (newTile !== TileType.AIR) {
      chunk.isAllAir = false;
    }

    // Rebuild only this chunk's canvas
    this.rebuildChunkCanvas(chunk);
  }

  /** Apply authoritative multiplayer edits in memory and rebuild affected loaded chunks once. */
  public applyBlockUpdates(updates: ReadonlyArray<{ x: number; y: number; tile: TileType }>) {
    const changedChunks = new Set<string>();
    for (const { x, y, tile } of updates) {
      this.modifications.setBlock(x, y, tile);
      const cx = Math.floor(x / CHUNK_WIDTH);
      const cy = Math.floor(y / CHUNK_HEIGHT);
      const key = ChunkManager.getChunkKey(cx, cy);
      const chunk = this.loadedChunks.get(key);
      if (!chunk) continue;
      const lx = ((x % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH;
      const ly = ((y % CHUNK_HEIGHT) + CHUNK_HEIGHT) % CHUNK_HEIGHT;
      chunk.tiles[ly * CHUNK_WIDTH + lx] = tile;
      if (tile !== TileType.AIR) chunk.isAllAir = false;
      changedChunks.add(key);
    }
    for (const key of changedChunks) {
      const chunk = this.loadedChunks.get(key);
      if (chunk) this.rebuildChunkCanvas(chunk);
    }
  }

  // Re-renders only the changed chunk's offscreen texture
  public rebuildChunkCanvas(chunk: Chunk) {
    let hasNonAir = false;
    for (let i = 0; i < chunk.tiles.length; i++) {
      if (chunk.tiles[i] !== TileType.AIR) {
        hasNonAir = true;
        break;
      }
    }
    const {
      waterSurfaceTiles,
      animatedFoliageTiles,
      animatedLightTiles,
      canopyEdgeTiles,
      craftableStructureTiles,
    } = this.collectAnimatedChunkTiles(chunk.tiles);
    chunk.waterSurfaceTiles = waterSurfaceTiles;
    chunk.animatedFoliageTiles = animatedFoliageTiles;
    chunk.animatedLightTiles = animatedLightTiles;
    chunk.canopyEdgeTiles = canopyEdgeTiles;
    chunk.craftableStructureTiles = craftableStructureTiles;
    chunk.waterfallTiles = this.collectWaterfallTiles(chunk.worldX, chunk.worldY, chunk.tiles);

    chunk.isAllAir = !hasNonAir;

    if (chunk.isAllAir) {
      if (chunk.canvas) {
        chunk.canvas.width = 0;
        chunk.canvas.height = 0;
        chunk.canvas = null;
      }
      return;
    }

    if (!chunk.canvas && typeof document !== 'undefined') {
      chunk.canvas = document.createElement('canvas');
      chunk.canvas.width = CHUNK_PIXEL_WIDTH;
      chunk.canvas.height = CHUNK_PIXEL_HEIGHT;
    }

    if (chunk.canvas) {
      this.renderTilesToCanvas(chunk.tiles, chunk.canvas, chunk.worldX, chunk.worldY);
    }
  }

  /** Collect animated foliage, light-emitting, water-surface, canopy-edge, and oversized craftable structure tile indices in one pass. */
  private collectAnimatedChunkTiles(tiles: Uint8Array): {
    waterSurfaceTiles: number[];
    animatedFoliageTiles: number[];
    animatedLightTiles: number[];
    canopyEdgeTiles: number[];
    craftableStructureTiles: number[];
  } {
    const waterSurfaceTiles: number[] = [];
    const animatedFoliageTiles: number[] = [];
    const animatedLightTiles: number[] = [];
    const canopyEdgeTiles: number[] = [];
    const craftableStructureTiles: number[] = [];

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i] as TileType;
      if (t === TileType.AIR) continue;

      if (CRAFTABLE_STRUCTURE_TILES.has(t)) {
        craftableStructureTiles.push(i);
      }

      const above = i >= CHUNK_WIDTH ? (tiles[i - CHUNK_WIDTH] as TileType) : TileType.AIR;

      if (t === TileType.WATER && above === TileType.AIR) {
        waterSurfaceTiles.push(i);
      } else if (
        t === TileType.TALL_GRASS ||
        t === TileType.DRY_GRASS ||
        t === TileType.FLOWER ||
        t === TileType.VINE ||
        t === TileType.BERRY_BUSH ||
        t === TileType.STAR_FLOWER ||
        t === TileType.SKY_VINE
      ) {
        animatedFoliageTiles.push(i);
      } else if (
        (t === TileType.GRASS || t === TileType.FLOWER_GRASS || t === TileType.OASIS_GRASS || t === TileType.SKY_GRASS) &&
        above === TileType.AIR &&
        (i & 1) === 0
      ) {
        animatedFoliageTiles.push(i);
      } else if (
        t === TileType.TORCH ||
        t === TileType.CAMPFIRE ||
        t === TileType.FURNACE ||
        t === TileType.GLOWING_CRYSTAL ||
        t === TileType.GLOWING_MUSHROOM ||
        t === TileType.CRYSTAL_ORE ||
        t === TileType.DIAMOND_ORE ||
        t === TileType.MAGMA ||
        t === TileType.ASTRAL_ORE ||
        t === TileType.CELESTIAL_ORE
      ) {
        animatedLightTiles.push(i);
      } else if (
        t === TileType.LEAVES ||
        t === TileType.BIRCH_LEAVES ||
        t === TileType.ACACIA_LEAVES ||
        t === TileType.CHERRY_LEAVES ||
        t === TileType.PALM_LEAVES ||
        t === TileType.CELESTIAL_LEAVES
      ) {
        const lx = i % CHUNK_WIDTH;
        const ly = (i / CHUNK_WIDTH) | 0;
        if (((lx + ly) & 1) === 0) {
          const below = i + CHUNK_WIDTH < tiles.length ? (tiles[i + CHUNK_WIDTH] as TileType) : TileType.AIR;
          const left = lx > 0 ? (tiles[i - 1] as TileType) : TileType.AIR;
          const right = lx + 1 < CHUNK_WIDTH ? (tiles[i + 1] as TileType) : TileType.AIR;
          if (above === TileType.AIR || below === TileType.AIR || left === TileType.AIR || right === TileType.AIR) {
            canopyEdgeTiles.push(i);
          }
        }
      }
    }

    return {
      waterSurfaceTiles,
      animatedFoliageTiles,
      animatedLightTiles,
      canopyEdgeTiles,
      craftableStructureTiles,
    };
  }

  /** Resolve cached fall columns into this chunk's local tile indices. */
  private collectWaterfallTiles(worldX: number, worldY: number, tiles: Uint8Array): number[] {
    const waterfallTiles: number[] = [];
    for (let lx = 0; lx < CHUNK_WIDTH; lx++) {
      const fall = this.terrainGen.getWaterfallAt(worldX + lx);
      if (!fall) continue;
      const firstY = Math.max(worldY, fall.topY);
      const lastY = Math.min(worldY + CHUNK_HEIGHT - 1, fall.bottomY);
      for (let y = firstY; y <= lastY; y++) {
        const index = (y - worldY) * CHUNK_WIDTH + lx;
        if (tiles[index] === TileType.WATER) waterfallTiles.push(index);
      }
    }
    return waterfallTiles;
  }

  private renderTilesToCanvas(tiles: Uint8Array, canvas: HTMLCanvasElement, worldX = 0, worldY = 0) {
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, CHUNK_PIXEL_WIDTH, CHUNK_PIXEL_HEIGHT);
    ctx.imageSmoothingEnabled = false;

    for (let ly = 0; ly < CHUNK_HEIGHT; ly++) this.renderTileRow(tiles, ctx, ly, worldX, worldY);
  }

  private renderTileRow(tiles: Uint8Array, ctx: CanvasRenderingContext2D, ly: number, worldX: number, worldY: number) {
    this.renderTileRange(tiles, ctx, ly, 0, CHUNK_WIDTH, worldX, worldY);
  }

  private renderTileRange(tiles: Uint8Array, ctx: CanvasRenderingContext2D, ly: number, startX: number, endX: number, worldX: number, worldY: number) {
      const rowOffset = ly * CHUNK_WIDTH;
      const py = ly * TILE_SIZE;

      for (let lx = startX; lx < endX; lx++) {
        const tile = tiles[rowOffset + lx] as TileType;
        if (
          tile === TileType.AIR ||
          tile === TileType.TALL_GRASS ||
          tile === TileType.DRY_GRASS ||
          tile === TileType.FLOWER ||
          tile === TileType.VINE ||
          CRAFTABLE_STRUCTURE_TILES.has(tile)
        ) {
          continue;
        }

        const px = lx * TILE_SIZE;
        const def = TILE_DEFS[tile];
        const bx = worldX + lx;
        const by = worldY + ly;
        const variant = getBlockVisualVariant(this.seed, bx, by);

        if (VARIANT_TRUNK_TILES.has(tile)) {
          this.renderContextualWoodTile(ctx, tiles, lx, ly, px, py, tile, bx, by, variant);
          continue;
        }
        if (LEAF_TILES.has(tile)) {
          this.renderContextualLeafTile(ctx, tiles, lx, ly, px, py, tile, bx, by, variant);
          continue;
        }

        const sprite = getBlockSprite(tile, variant);
        if (sprite) {
          ctx.drawImage(sprite, px, py);
          continue;
        }

        switch (tile) {
          case TileType.GRASS: {
            ctx.fillStyle = '#854d0e';
            ctx.fillRect(px, py + 4, TILE_SIZE, TILE_SIZE - 4);

            // Uneven little grass fringe breaks up the straight, box-like seam
            // without changing the tile silhouette or its collision geometry.
            ctx.fillStyle = def.darkColor;
            ctx.fillRect(px, py + 3, TILE_SIZE, 2);
            ctx.fillStyle = def.color;
            ctx.fillRect(px, py + 2, TILE_SIZE, 2);
            ctx.fillRect(px + (lx * 7 % 5), py + 1, 4, 2);
            ctx.fillRect(px + 8 + (lx * 3 % 4), py, 3, 3);
            ctx.fillRect(px + 13, py + 1, 2, 2);

            ctx.fillStyle = def.darkColor;
            ctx.fillRect(px + 2, py + 4, 3, 2);
            ctx.fillRect(px + 9, py + 4, 4, 3);
            ctx.fillRect(px + 14, py + 4, 2, 1);

            ctx.fillStyle = def.lightColor;
            ctx.fillRect(px + 1, py, 6, 1);
            ctx.fillRect(px + 10, py, 4, 1);
            break;
          }

          case TileType.DIRT: {
            ctx.fillStyle = def.color;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            ctx.fillStyle = def.darkColor;
            ctx.fillRect(px + 2, py + 3, 3, 2);
            ctx.fillRect(px + 9, py + 10, 4, 3);
            ctx.fillRect(px + 12, py + 2, 2, 2);

            ctx.fillStyle = def.lightColor;
            ctx.fillRect(px + 3, py + 4, 1, 1);
            ctx.fillRect(px + 10, py + 11, 1, 1);
            ctx.fillRect(px + 5, py + 12, 2, 2);
            break;
          }

          case TileType.TILLED_SOIL: {
            ctx.fillStyle = '#704526';
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            ctx.fillStyle = '#402719';
            for (let row = 0; row < 3; row++) {
              const y = py + 3 + row * 5;
              ctx.fillRect(px + 1, y, TILE_SIZE - 2, 2);
              ctx.fillRect(px + 2, y + 2, TILE_SIZE - 4, 1);
            }

            ctx.fillStyle = '#a66b3d';
            for (let row = 0; row < 3; row++) {
              const y = py + 1 + row * 5;
              ctx.fillRect(px + 2, y, TILE_SIZE - 4, 1);
              ctx.fillRect(px + 4 + (row % 2) * 3, y + 1, TILE_SIZE - 9, 1);
            }

            ctx.fillStyle = '#d19a61';
            ctx.fillRect(px + 3, py + 4, 2, 1);
            ctx.fillRect(px + 10, py + 9, 3, 1);
            ctx.fillRect(px + 5, py + 14, 4, 1);
            break;
          }

          case TileType.BERRY_BUSH: {
            ctx.fillStyle = '#694324';
            ctx.fillRect(px + 7, py + 8, 3, 8);
            ctx.fillStyle = '#24552a';
            ctx.fillRect(px + 2, py + 7, 12, 7);
            ctx.fillRect(px + 4, py + 4, 8, 7);
            ctx.fillRect(px + 6, py + 2, 5, 5);
            ctx.fillStyle = '#4d9139';
            ctx.fillRect(px + 3, py + 7, 5, 4);
            ctx.fillRect(px + 8, py + 5, 5, 5);
            ctx.fillRect(px + 5, py + 11, 7, 3);
            ctx.fillStyle = '#d83b63';
            ctx.fillRect(px + 4, py + 8, 2, 2);
            ctx.fillRect(px + 10, py + 6, 2, 2);
            ctx.fillRect(px + 8, py + 11, 2, 2);
            ctx.fillStyle = '#f58aa0';
            ctx.fillRect(px + 4, py + 8, 1, 1);
            ctx.fillRect(px + 10, py + 6, 1, 1);
            break;
          }

          case TileType.STONE: {
            ctx.fillStyle = def.color;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            ctx.fillStyle = def.darkColor;
            ctx.fillRect(px, py + 7, 7, 1);
            ctx.fillRect(px + 6, py + 8, 1, 4);
            ctx.fillRect(px + 9, py + 2, 5, 1);
            ctx.fillRect(px + 11, py + 13, 4, 1);

            ctx.fillStyle = def.lightColor;
            ctx.fillRect(px + 1, py + 1, 4, 1);
            ctx.fillRect(px + 1, py + 2, 1, 3);
            ctx.fillRect(px + 8, py + 8, 3, 1);
            break;
          }

          case TileType.WOOD: {
            ctx.fillStyle = def.color;
            ctx.fillRect(px + 3, py, TILE_SIZE - 6, TILE_SIZE);

            ctx.fillStyle = def.darkColor;
            ctx.fillRect(px + 4, py + 2, 2, 5);
            ctx.fillRect(px + 8, py + 8, 2, 6);

            ctx.fillStyle = def.lightColor;
            ctx.fillRect(px + 10, py + 1, 1, 10);
            break;
          }

          case TileType.LEAVES: {
            ctx.fillStyle = def.color;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

            ctx.fillStyle = def.darkColor;
            ctx.fillRect(px, py + 11, TILE_SIZE, 5);
            ctx.fillRect(px + 10, py + 5, 5, 6);

            ctx.fillStyle = def.lightColor;
            ctx.fillRect(px + 2, py + 2, 6, 5);
            ctx.fillRect(px + 9, py + 1, 4, 3);
            break;
          }

          case TileType.SAND:
          case TileType.SANDSTONE:
          case TileType.SNOW:
          case TileType.SNOWY_DIRT:
          case TileType.BIRCH_WOOD:
          case TileType.BIRCH_LEAVES: {
            ctx.fillStyle = def.color;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = def.darkColor;
            if (tile === TileType.BIRCH_WOOD) {
              ctx.fillRect(px + 3, py, 2, TILE_SIZE);
              ctx.fillRect(px + 10, py + 5, 3, 1);
              ctx.fillRect(px + 5, py + 11, 3, 1);
            } else if (tile === TileType.SNOW) {
              ctx.fillRect(px, py + 13, TILE_SIZE, 3);
              ctx.fillStyle = def.lightColor;
              ctx.fillRect(px, py, TILE_SIZE, 2);
              ctx.fillRect(px + 2, py + 3, 4, 1);
              ctx.fillRect(px + 11, py + 6, 3, 1);
            } else {
              ctx.fillRect(px + 2, py + 4, 3, 2);
              ctx.fillRect(px + 10, py + 10, 4, 2);
              ctx.fillStyle = def.lightColor;
              ctx.fillRect(px + 2, py + 2, 5, 1);
              ctx.fillRect(px + 11, py + 7, 3, 1);
            }
            break;
          }
          case TileType.COAL_ORE:
          case TileType.COPPER_ORE:
          case TileType.IRON_ORE:
          case TileType.GOLD_ORE:
          case TileType.CRYSTAL_ORE:
          case TileType.DIAMOND_ORE: {
            ctx.fillStyle = def.color;
            ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
            // Scattered host-rock flecks keep the ore embedded in the stone.
            ctx.fillStyle = def.darkColor;
            ctx.fillRect(px + 2, py + 3, 4, 2);
            ctx.fillRect(px + 10, py + 11, 4, 2);
            ctx.fillRect(px + 7, py + 1, 2, 2);
            ctx.fillStyle = def.lightColor;
            if (tile === TileType.COAL_ORE) {
              ctx.fillRect(px + 3, py + 5, 4, 3);
              ctx.fillRect(px + 10, py + 9, 3, 3);
              ctx.fillStyle = '#858d91';
              ctx.fillRect(px + 4, py + 5, 2, 1);
              ctx.fillRect(px + 11, py + 9, 1, 1);
            } else if (tile === TileType.COPPER_ORE) {
              ctx.fillRect(px + 3, py + 4, 4, 3);
              ctx.fillRect(px + 9, py + 10, 4, 3);
              ctx.fillStyle = '#f0b17b';
              ctx.fillRect(px + 4, py + 4, 2, 1);
              ctx.fillRect(px + 10, py + 10, 2, 1);
            } else if (tile === TileType.IRON_ORE) {
              ctx.fillRect(px + 3, py + 5, 3, 3);
              ctx.fillRect(px + 10, py + 9, 4, 3);
              ctx.fillStyle = '#e2c9a8';
              ctx.fillRect(px + 4, py + 5, 1, 1);
              ctx.fillRect(px + 11, py + 9, 2, 1);
            } else if (tile === TileType.GOLD_ORE) {
              ctx.fillRect(px + 3, py + 4, 3, 3);
              ctx.fillRect(px + 10, py + 10, 4, 3);
              ctx.fillStyle = '#ffe18a';
              ctx.fillRect(px + 4, py + 4, 1, 1);
              ctx.fillRect(px + 11, py + 10, 2, 1);
            } else if (tile === TileType.CRYSTAL_ORE) {
              ctx.fillRect(px + 3, py + 8, 3, 5);
              ctx.fillRect(px + 9, py + 3, 4, 5);
              ctx.fillStyle = '#e1d4ff';
              ctx.fillRect(px + 4, py + 8, 1, 3);
              ctx.fillRect(px + 10, py + 3, 2, 3);
            } else {
              ctx.fillRect(px + 3, py + 8, 4, 4);
              ctx.fillRect(px + 10, py + 3, 4, 4);
              ctx.fillStyle = '#d4fff8';
              ctx.fillRect(px + 4, py + 8, 2, 2);
              ctx.fillRect(px + 11, py + 3, 2, 2);
            }
            break;
          }
          default: {
            if (tile === TileType.CACTUS) {
              // Narrow outlined stem and alternating arms read as a cactus rather
              // than a solid green tile, while collision remains unchanged.
              ctx.fillStyle = '#10472e';
              ctx.fillRect(px + 4, py + 1, 8, 15);
              ctx.fillRect(px + 1, py + 5, 5, 3);
              ctx.fillRect(px + 1, py + 5, 3, 6);
              ctx.fillRect(px + 10, py + 8, 5, 3);
              ctx.fillRect(px + 12, py + 5, 3, 6);
              ctx.fillStyle = def.color;
              ctx.fillRect(px + 5, py + 2, 6, 13);
              ctx.fillRect(px + 2, py + 6, 3, 2);
              ctx.fillRect(px + 2, py + 7, 2, 3);
              ctx.fillRect(px + 11, py + 9, 3, 2);
              ctx.fillRect(px + 13, py + 6, 2, 4);
              ctx.fillStyle = def.lightColor;
              ctx.fillRect(px + 6, py + 3, 1, 8);
              ctx.fillRect(px + 3, py + 6, 1, 1);
              break;
            }
            if (tile === TileType.WATER) {
              const above = ly > 0 ? tiles[(ly - 1) * CHUNK_WIDTH + lx] : TileType.AIR;
              ctx.fillStyle = above === TileType.AIR ? def.lightColor : def.color;
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = def.darkColor;
              ctx.fillRect(px, py + 11, TILE_SIZE, 5);
              if (above === TileType.AIR) {
                ctx.fillStyle = '#d8f6ff';
                ctx.fillRect(px + 2, py + 1, 5, 1);
                ctx.fillRect(px + 10, py + 2, 4, 1);
              }
            } else if (tile === TileType.FLOWER_GRASS || tile === TileType.MUSHROOM_GRASS) {
              ctx.fillStyle = '#694b36';
              ctx.fillRect(px, py + 4, TILE_SIZE, TILE_SIZE - 4);
              ctx.fillStyle = def.color;
              ctx.fillRect(px, py, TILE_SIZE, 4);
              ctx.fillStyle = def.lightColor;
              ctx.fillRect(px + 2, py, 3, 2);
              ctx.fillRect(px + 10, py + 2, 4, 2);
            } else if (DECORATIVE_FOLIAGE_TILES.has(tile)) {
              if (tile === TileType.GLOWING_CRYSTAL || tile === TileType.GLOWING_MUSHROOM) {
                ctx.fillStyle = 'rgba(90,245,239,.18)';
                ctx.fillRect(px + 1, py + 2, 14, 14);
                ctx.fillStyle = def.darkColor;
                ctx.fillRect(px + 4, py + 5, 8, 10);
                ctx.fillRect(px + 6, py + 2, 4, 4);
                ctx.fillStyle = def.color;
                ctx.fillRect(px + 5, py + 6, 6, 8);
                ctx.fillRect(px + 7, py + 3, 2, 4);
                ctx.fillStyle = 'rgba(235,255,255,.92)';
                ctx.fillRect(px + 6, py + 6, 2, 5);
                ctx.fillRect(px + 9, py + 9, 1, 3);
              } else {
                ctx.fillStyle = def.darkColor;
                ctx.fillRect(px + 2, py + 4, 12, 11);
                ctx.fillStyle = def.color;
                ctx.fillRect(px + 3, py + 3, 10, 10);
                ctx.fillStyle = def.lightColor;
                ctx.fillRect(px + 4, py + 4, 4, 3);
                ctx.fillRect(px + 9, py + 7, 2, 2);
              }
            } else if (tile === TileType.CRAFTING_TABLE) {
              ctx.fillStyle = '#78350f';
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = '#b45309';
              ctx.fillRect(px + 1, py + 1, 14, 5);
              ctx.fillStyle = '#451a03';
              ctx.fillRect(px + 1, py + 6, 14, 1);
              ctx.fillRect(px + 4, py + 7, 8, 9);
              ctx.fillStyle = '#f59e0b';
              ctx.fillRect(px + 6, py + 9, 4, 4);
              ctx.fillStyle = '#fef08a';
              ctx.fillRect(px + 7, py + 10, 2, 2);
            } else if (tile === TileType.CHEST) {
              ctx.fillStyle = '#713f12';
              ctx.fillRect(px + 1, py + 3, 14, 12);
              ctx.fillStyle = '#b7791f';
              ctx.fillRect(px + 2, py + 2, 12, 4);
              ctx.fillStyle = '#fbbf24';
              ctx.fillRect(px + 3, py + 5, 10, 2);
              ctx.fillRect(px + 7, py + 7, 2, 4);
              ctx.fillStyle = '#451a03';
              ctx.fillRect(px + 2, py + 12, 12, 2);
            } else if (tile === TileType.PLANKS) {
              ctx.fillStyle = def.color;
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = def.darkColor;
              ctx.fillRect(px, py + 5, TILE_SIZE, 1);
              ctx.fillRect(px, py + 11, TILE_SIZE, 1);
              ctx.fillRect(px + 7, py, 1, 5);
              ctx.fillRect(px + 12, py + 6, 1, 5);
              ctx.fillRect(px + 5, py + 12, 1, 4);
            } else if (tile === TileType.FURNACE) {
              ctx.fillStyle = '#64748b';
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = '#1e293b';
              ctx.fillRect(px + 3, py + 5, 10, 8);
              ctx.fillStyle = '#f97316';
              ctx.fillRect(px + 5, py + 7, 6, 4);
              ctx.fillStyle = '#fef08a';
              ctx.fillRect(px + 7, py + 8, 2, 2);
            } else if (tile === TileType.TORCH) {
              ctx.fillStyle = '#78350f';
              ctx.fillRect(px + 7, py + 6, 2, 10);
              ctx.fillStyle = '#f59e0b';
              ctx.fillRect(px + 6, py + 2, 4, 5);
              ctx.fillStyle = '#fef08a';
              ctx.fillRect(px + 7, py + 3, 2, 3);
              ctx.fillStyle = 'rgba(251,191,36,0.16)';
              ctx.beginPath(); ctx.arc(px + 8, py + 5, 8, 0, Math.PI * 2); ctx.fill();
            } else if (tile === TileType.DOOR || tile === TileType.DOOR_OPEN) {
              ctx.fillStyle = '#593718'; ctx.fillRect(px + 2, py, 12, 16);
              ctx.fillStyle = '#a16207'; ctx.fillRect(tile === TileType.DOOR ? px + 3 : px + 10, py + 1, 10, 14);
              ctx.fillStyle = '#facc15'; ctx.fillRect(tile === TileType.DOOR ? px + 10 : px + 4, py + 7, 2, 2);
            } else if (tile === TileType.LADDER) {
              ctx.fillStyle = '#854d0e'; ctx.fillRect(px + 3, py, 2, 16); ctx.fillRect(px + 11, py, 2, 16);
              ctx.fillStyle = '#e8b66d'; for (let rung = 2; rung < 16; rung += 4) ctx.fillRect(px + 4, py + rung, 8, 1);
            } else if (tile === TileType.BED) {
              ctx.fillStyle = '#7c4526'; ctx.fillRect(px + 1, py + 10, 14, 4);
              ctx.fillStyle = '#ef6b86'; ctx.fillRect(px + 2, py + 6, 12, 5);
              ctx.fillStyle = '#f5f5f4'; ctx.fillRect(px + 3, py + 5, 5, 3);
            } else if (tile === TileType.CAMPFIRE || tile === TileType.CAMPFIRE_OFF) {
              ctx.fillStyle = '#854d0e'; ctx.fillRect(px + 2, py + 11, 12, 3); ctx.fillRect(px + 4, py + 9, 8, 2);
              if (tile === TileType.CAMPFIRE) { ctx.fillStyle = '#f97316'; ctx.fillRect(px + 5, py + 5, 6, 5); ctx.fillStyle = '#fef08a'; ctx.fillRect(px + 7, py + 3, 3, 5); ctx.fillStyle = 'rgba(249,115,22,.15)'; ctx.beginPath(); ctx.arc(px + 8, py + 7, 9, 0, Math.PI * 2); ctx.fill(); }
            } else if (tile === TileType.LEVER || tile === TileType.LEVER_ON) {
              ctx.fillStyle = '#57534e'; ctx.fillRect(px + 3, py + 10, 10, 4);
              ctx.strokeStyle = tile === TileType.LEVER_ON ? '#facc15' : '#d6d3d1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px + 8, py + 11); ctx.lineTo(px + (tile === TileType.LEVER_ON ? 11 : 5), py + 4); ctx.stroke();
            } else if (tile === TileType.SIGN) {
              ctx.fillStyle = '#854d0e'; ctx.fillRect(px + 7, py + 7, 2, 9); ctx.fillStyle = '#d6975a'; ctx.fillRect(px + 1, py + 2, 14, 7); ctx.fillStyle = '#7c4526'; ctx.fillRect(px + 3, py + 4, 10, 1);
            } else if (tile === TileType.PLATFORM) {
              ctx.fillStyle = '#7c4526'; ctx.fillRect(px, py + 11, 16, 5); ctx.fillStyle = '#d6975a'; ctx.fillRect(px, py + 10, 16, 2);
            } else if (tile === TileType.PRESSURE_PLATE || tile === TileType.PRESSURE_PLATE_PRESSED) {
              ctx.fillStyle = tile === TileType.PRESSURE_PLATE_PRESSED ? '#475569' : '#64748b';
              ctx.fillRect(px + 2, py + (tile === TileType.PRESSURE_PLATE_PRESSED ? 2 : 0), 12, 3);
              ctx.fillStyle = '#cbd5e1'; ctx.fillRect(px + 4, py, 8, 1);
            } else if (tile === TileType.TRAPDOOR || tile === TileType.TRAPDOOR_OPEN) {
              ctx.fillStyle = '#713f12';
              if (tile === TileType.TRAPDOOR) {
                ctx.fillRect(px, py + 2, 16, 12); ctx.fillStyle = '#ca8a04'; ctx.fillRect(px + 2, py + 4, 12, 8);
              } else {
                ctx.fillRect(px + 2, py, 3, 16); ctx.fillStyle = '#ca8a04'; ctx.fillRect(px + 3, py + 2, 2, 12);
              }
            } else if (tile === TileType.GATE || tile === TileType.GATE_OPEN) {
              ctx.fillStyle = '#451a03'; ctx.fillRect(px + 1, py, 3, 16); ctx.fillRect(px + 12, py, 3, 16);
              ctx.fillStyle = '#a16207';
              if (tile === TileType.GATE) {
                ctx.fillRect(px + 4, py + 3, 8, 2); ctx.fillRect(px + 4, py + 7, 8, 2); ctx.fillRect(px + 4, py + 11, 8, 2);
              } else {
                ctx.fillRect(px + 4, py + 3, 3, 2); ctx.fillRect(px + 4, py + 7, 3, 2); ctx.fillRect(px + 4, py + 11, 3, 2);
              }
            } else if (tile === TileType.BRIDGE) {
              ctx.fillStyle = '#7c4526'; ctx.fillRect(px, py + 4, 16, 12);
              ctx.fillStyle = '#d6975a'; ctx.fillRect(px, py + 3, 16, 3); ctx.fillRect(px + 4, py + 7, 1, 8); ctx.fillRect(px + 11, py + 7, 1, 8);
            } else if (tile === TileType.ROPE) {
              ctx.fillStyle = '#854d0e'; ctx.fillRect(px + 7, py, 2, 16);
              ctx.fillStyle = '#f5d08a'; ctx.fillRect(px + 6, py + 3, 1, 2); ctx.fillRect(px + 9, py + 9, 1, 2);
            } else if (tile === TileType.ACACIA_WOOD || tile === TileType.CHERRY_WOOD || tile === TileType.PALM_WOOD) {
              ctx.fillStyle = def.color;
              ctx.fillRect(px + 4, py, 8, TILE_SIZE);
              ctx.fillStyle = def.darkColor;
              ctx.fillRect(px + 6, py, 2, TILE_SIZE);
              ctx.fillRect(px + 10, py + 6, 2, 1);
            } else {
              ctx.fillStyle = def.color;
              ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
              ctx.fillStyle = def.darkColor;
              ctx.fillRect(px + 2, py + 4, 4, 2);
              ctx.fillRect(px + 10, py + 10, 4, 2);
              ctx.fillStyle = def.lightColor;
              ctx.fillRect(px + 3, py + 2, 3, 1);
            }
            break;
          }
        }
      }
  }

  private prerenderChunkCanvas(tiles: Uint8Array): HTMLCanvasElement {
    const offscreen = document.createElement('canvas');
    offscreen.width = CHUNK_PIXEL_WIDTH;
    offscreen.height = CHUNK_PIXEL_HEIGHT;
    this.renderTilesToCanvas(tiles, offscreen);
    return offscreen;
  }

  private renderContextualWoodTile(
    targetCtx: CanvasRenderingContext2D,
    tiles: Uint8Array,
    lx: number,
    ly: number,
    targetPx: number,
    targetPy: number,
    tile: TileType,
    bx: number,
    by: number,
    variant: number
  ) {
    const above = ly > 0 ? (tiles[(ly - 1) * CHUNK_WIDTH + lx] as TileType) : TileType.AIR;
    const below = ly + 1 < CHUNK_HEIGHT ? (tiles[(ly + 1) * CHUNK_WIDTH + lx] as TileType) : TileType.DIRT;
    const left = lx > 0 ? (tiles[ly * CHUNK_WIDTH + lx - 1] as TileType) : TileType.AIR;
    const right = lx + 1 < CHUNK_WIDTH ? (tiles[ly * CHUNK_WIDTH + lx + 1] as TileType) : TileType.AIR;

    const upWood = VARIANT_TRUNK_TILES.has(above);
    const downWood = VARIANT_TRUNK_TILES.has(below);
    const leftWood = VARIANT_TRUNK_TILES.has(left);
    const rightWood = VARIANT_TRUNK_TILES.has(right);
    const upLeaf = LEAF_TILES.has(above);
    const downGround = TILE_DEFS[below]?.isSolid ?? false;
    const hasKnot = ((bx + by * 3) & 3) === 0;

    const mask =
      (upWood ? 1 : 0) |
      (downWood ? 2 : 0) |
      (leftWood ? 4 : 0) |
      (rightWood ? 8 : 0) |
      (upLeaf ? 16 : 0) |
      (downGround ? 32 : 0) |
      (hasKnot ? 64 : 0);
    const cacheKey = (1 << 20) | ((tile & 0xff) << 10) | ((variant & 3) << 8) | mask;
    const cached = contextualTreeSpriteCache.get(cacheKey);
    if (cached) {
      targetCtx.drawImage(cached, targetPx, targetPy);
      return;
    }

    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = TILE_SIZE;
    spriteCanvas.height = TILE_SIZE;
    const ctx = spriteCanvas.getContext('2d');
    if (!ctx) return;
    const px = 0;
    const py = 0;
    const def = TILE_DEFS[tile];

    const isBirch = tile === TileType.BIRCH_WOOD;
    const isCherry = tile === TileType.CHERRY_WOOD;
    const isPalm = tile === TileType.PALM_WOOD;
    const isOak = tile === TileType.WOOD;
    const outlineColor = isBirch ? '#57534e' : isCherry ? '#3b2322' : '#2e1102';
    const highlightColor = isBirch ? '#f5f5e8' : isCherry ? '#b77d76' : isOak ? '#b45d26' : def.lightColor;

    // Case 1: Root Buttress Spur sitting on solid ground beside the main trunk
    if (!upWood && downGround && (leftWood || rightWood)) {
      if (rightWood && !leftWood) {
        // Left-side root buttress sloping down from right trunk into soil
        ctx.fillStyle = outlineColor;
        ctx.fillRect(px + 9, py + 4, 7, 12);
        ctx.fillRect(px + 5, py + 8, 11, 8);
        ctx.fillRect(px + 2, py + 12, 14, 4);
        ctx.fillStyle = def.color;
        ctx.fillRect(px + 10, py + 5, 6, 11);
        ctx.fillRect(px + 6, py + 9, 10, 7);
        ctx.fillRect(px + 3, py + 13, 13, 3);
        ctx.fillStyle = highlightColor;
        ctx.fillRect(px + 10, py + 5, 3, 4);
        ctx.fillRect(px + 6, py + 9, 4, 3);
        ctx.fillRect(px + 3, py + 13, 4, 2);
        ctx.fillStyle = def.darkColor;
        ctx.fillRect(px + 9, py + 14, 7, 2);
        if (isOak) {
          ctx.fillStyle = '#15803d';
          ctx.fillRect(px + 6, py + 8, 3, 2);
          ctx.fillRect(px + 3, py + 12, 3, 1);
        }
        contextualTreeSpriteCache.set(cacheKey, spriteCanvas);
        targetCtx.drawImage(spriteCanvas, targetPx, targetPy);
        return;
      }
      if (leftWood && !rightWood) {
        // Right-side root buttress sloping down from left trunk into soil
        ctx.fillStyle = outlineColor;
        ctx.fillRect(px, py + 4, 7, 12);
        ctx.fillRect(px, py + 8, 11, 8);
        ctx.fillRect(px, py + 12, 14, 4);
        ctx.fillStyle = def.color;
        ctx.fillRect(px, py + 5, 6, 11);
        ctx.fillRect(px, py + 9, 10, 7);
        ctx.fillRect(px, py + 13, 13, 3);
        ctx.fillStyle = highlightColor;
        ctx.fillRect(px + 1, py + 5, 3, 3);
        ctx.fillRect(px + 4, py + 9, 4, 2);
        ctx.fillStyle = def.darkColor;
        ctx.fillRect(px, py + 13, 11, 3);
        if (isOak) {
          ctx.fillStyle = '#15803d';
          ctx.fillRect(px + 6, py + 8, 3, 2);
          ctx.fillRect(px + 9, py + 12, 3, 1);
        }
        contextualTreeSpriteCache.set(cacheKey, spriteCanvas);
        targetCtx.drawImage(spriteCanvas, targetPx, targetPy);
        return;
      }
    }

    // Case 2: Lateral Horizontal/Angled Tree Bough (not part of vertical trunk column)
    if (!upWood && !downWood && (leftWood || rightWood)) {
      const xStart = leftWood ? px : px + 2;
      const xEnd = rightWood ? px + 16 : px + 14;
      const w = xEnd - xStart;
      ctx.fillStyle = outlineColor;
      ctx.fillRect(xStart, py + 4, w, 9);
      ctx.fillStyle = def.color;
      ctx.fillRect(xStart, py + 5, w, 7);
      ctx.fillStyle = highlightColor;
      ctx.fillRect(xStart + 1, py + 5, Math.max(2, w - 2), 2);
      ctx.fillStyle = def.darkColor;
      ctx.fillRect(xStart, py + 10, w, 2);
      // Bark grain along the bough
      ctx.fillRect(xStart + 3, py + 7, Math.max(2, w - 6), 1);
      contextualTreeSpriteCache.set(cacheKey, spriteCanvas);
      targetCtx.drawImage(spriteCanvas, targetPx, targetPy);
      return;
    }

    // Case 3: Vertical Trunk (with optional branch collars, root flares, and canopy shadows)
    ctx.fillStyle = outlineColor;
    ctx.fillRect(px + 2, py, 12, 16);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 3, py, 10, 16);
    // Sunlit left-center bark ridge
    ctx.fillStyle = highlightColor;
    ctx.fillRect(px + 4, py, 3, 16);
    // Shaded right-side bark strip
    ctx.fillStyle = def.darkColor;
    ctx.fillRect(px + 11, py, 2, 16);

    const v = variant & 3;
    if (isBirch) {
      ctx.fillStyle = '#f5f5e8';
      ctx.fillRect(px + 4, py, 4, 16);
      ctx.fillStyle = '#e7e5d5';
      ctx.fillRect(px + 8, py, 3, 16);
      ctx.fillStyle = '#292524';
      ctx.fillRect(px + 3, py + 2 + v, 4, 1);
      ctx.fillRect(px + 9, py + 7 + (v % 3), 4, 1);
      ctx.fillStyle = '#78716c';
      ctx.fillRect(px + 5, py + 12 - (v & 1), 3, 1);
    } else if (isPalm) {
      for (let ry = 3; ry < 16; ry += 5) {
        ctx.fillStyle = def.darkColor;
        ctx.fillRect(px + 2, py + ry, 12, 1);
        ctx.fillStyle = def.lightColor;
        ctx.fillRect(px + 3, py + ry + 1, 8, 1);
      }
    } else if (isCherry) {
      ctx.fillStyle = '#9e625c';
      ctx.fillRect(px + 4, py + 3 + v * 2, 4, 1);
      ctx.fillRect(px + 8, py + 10 - v, 4, 1);
      ctx.fillStyle = def.darkColor;
      ctx.fillRect(px + 7 + (v & 1), py, 1, 16);
    } else {
      // Rugged Oak & Woodland bark fissures and knots
      ctx.fillStyle = def.darkColor;
      ctx.fillRect(px + 6 + (v & 1), py, 1, 8 + v);
      ctx.fillRect(px + 8 - (v & 1), py + 6 + v, 1, 10 - v);
      ctx.fillStyle = def.lightColor;
      ctx.fillRect(px + 6, py + 2 + v * 2, 2, 4);

      // Deterministic wood knot / burl swirl on selected trunk segments
      if (hasKnot) {
        const ky = py + 5 + (v % 4);
        ctx.fillStyle = outlineColor;
        ctx.fillRect(px + 7, ky, 4, 4);
        ctx.fillStyle = def.color;
        ctx.fillRect(px + 8, ky + 1, 2, 2);
        ctx.fillStyle = highlightColor;
        ctx.fillRect(px + 8, ky + 1, 1, 1);
      }
    }

    // Seamless Branch Collars when a bough extends left or right from this trunk tile
    if (leftWood) {
      ctx.fillStyle = outlineColor;
      ctx.fillRect(px, py + 3, 3, 10);
      ctx.fillStyle = def.color;
      ctx.fillRect(px, py + 4, 3, 8);
      ctx.fillStyle = highlightColor;
      ctx.fillRect(px, py + 4, 3, 2);
      ctx.fillStyle = def.darkColor;
      ctx.fillRect(px, py + 10, 3, 2);
    }
    if (rightWood) {
      ctx.fillStyle = outlineColor;
      ctx.fillRect(px + 13, py + 3, 3, 10);
      ctx.fillStyle = def.color;
      ctx.fillRect(px + 13, py + 4, 3, 8);
      ctx.fillStyle = highlightColor;
      ctx.fillRect(px + 13, py + 4, 3, 2);
      ctx.fillStyle = def.darkColor;
      ctx.fillRect(px + 13, py + 10, 3, 2);
    }

    // Natural Root Flare where trunk meets solid ground
    if (downGround && !downWood) {
      ctx.fillStyle = outlineColor;
      ctx.fillRect(px + 1, py + 10, 14, 6);
      ctx.fillRect(px, py + 13, 16, 3);
      ctx.fillStyle = def.color;
      ctx.fillRect(px + 2, py + 11, 12, 5);
      ctx.fillRect(px + 1, py + 13, 14, 3);
      ctx.fillStyle = highlightColor;
      ctx.fillRect(px + 2, py + 11, 3, 4);
      ctx.fillRect(px + 1, py + 13, 2, 2);
      ctx.fillStyle = def.darkColor;
      ctx.fillRect(px + 7, py + 12, 1, 4);
      ctx.fillRect(px + 11, py + 11, 3, 5);
      if (isOak) {
        // Woodland moss clinging to the base of oak roots
        ctx.fillStyle = '#15803d';
        ctx.fillRect(px + 2, py + 14, 4, 2);
        ctx.fillRect(px + 10, py + 14, 4, 2);
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(px + 3, py + 14, 2, 1);
      }
    }

    // Under-canopy cast shadow when leaves sit directly on top of this trunk segment
    if (upLeaf) {
      ctx.fillStyle = 'rgba(8, 28, 14, 0.55)';
      ctx.fillRect(px + 2, py, 12, 3);
      ctx.fillRect(px + 3, py + 3, 10, 1);
    }

    contextualTreeSpriteCache.set(cacheKey, spriteCanvas);
    targetCtx.drawImage(spriteCanvas, targetPx, targetPy);
  }

  private renderContextualLeafTile(
    targetCtx: CanvasRenderingContext2D,
    tiles: Uint8Array,
    lx: number,
    ly: number,
    targetPx: number,
    targetPy: number,
    tile: TileType,
    bx: number,
    by: number,
    variant: number
  ) {
    const above = ly > 0 ? (tiles[(ly - 1) * CHUNK_WIDTH + lx] as TileType) : TileType.AIR;
    const below = ly + 1 < CHUNK_HEIGHT ? (tiles[(ly + 1) * CHUNK_WIDTH + lx] as TileType) : TileType.AIR;
    const left = lx > 0 ? (tiles[ly * CHUNK_WIDTH + lx - 1] as TileType) : TileType.AIR;
    const right = lx + 1 < CHUNK_WIDTH ? (tiles[ly * CHUNK_WIDTH + lx + 1] as TileType) : TileType.AIR;

    const upLeaf = LEAF_TILES.has(above);
    const downLeaf = LEAF_TILES.has(below);
    const leftLeaf = LEAF_TILES.has(left);
    const rightLeaf = LEAF_TILES.has(right);
    const hasAcorn = ((bx + by) & 3) === 0;

    const mask =
      (upLeaf ? 1 : 0) |
      (downLeaf ? 2 : 0) |
      (leftLeaf ? 4 : 0) |
      (rightLeaf ? 8 : 0) |
      (hasAcorn ? 16 : 0);
    const cacheKey = (2 << 20) | ((tile & 0xff) << 10) | ((variant & 3) << 8) | mask;
    const cached = contextualTreeSpriteCache.get(cacheKey);
    if (cached) {
      targetCtx.drawImage(cached, targetPx, targetPy);
      return;
    }

    const spriteCanvas = document.createElement('canvas');
    spriteCanvas.width = TILE_SIZE;
    spriteCanvas.height = TILE_SIZE;
    const ctx = spriteCanvas.getContext('2d');
    if (!ctx) return;
    const px = 0;
    const py = 0;
    const def = TILE_DEFS[tile];

    const v = variant & 3;
    const s1 = v & 1;
    const s2 = (v >> 1) & 1;

    const isOak = tile === TileType.LEAVES;
    const isBirch = tile === TileType.BIRCH_LEAVES;
    const isCherry = tile === TileType.CHERRY_LEAVES;
    const isAcacia = tile === TileType.ACACIA_LEAVES;

    const deepShadow = isCherry
      ? '#831843'
      : isBirch
        ? '#263e0a'
        : isAcacia
          ? '#2d3a14'
          : '#0a3619';
    const sunTipColor = isCherry
      ? '#fff1f2'
      : isBirch
        ? '#ecfccb'
        : isAcacia
          ? '#d9f99d'
          : '#86efac';

    // Inset outer edges by 1-2px so exposed canopy silhouettes look scalloped & rounded
    // while interior shared edges bridge 100% seamlessly with zero gaps!
    const x0 = leftLeaf ? 0 : 1;
    const x1 = rightLeaf ? 16 : 15;
    const y0 = upLeaf ? 0 : 1;
    const y1 = downLeaf ? 16 : 15;

    // 1. Base shaded foliage mass (with rounded outer corners when exposed to air)
    ctx.fillStyle = def.darkColor;
    ctx.fillRect(px + x0 + 1, py + y0, x1 - x0 - 2, y1 - y0);
    ctx.fillRect(px + x0, py + y0 + 1, x1 - x0, y1 - y0 - 2);
    // Fill interior corners completely when adjacent to leaves on either side
    if (upLeaf || leftLeaf) ctx.fillRect(px + x0, py + y0, 2, 2);
    if (upLeaf || rightLeaf) ctx.fillRect(px + x1 - 2, py + y0, 2, 2);
    if (downLeaf || leftLeaf) ctx.fillRect(px + x0, py + y1 - 2, 2, 2);
    if (downLeaf || rightLeaf) ctx.fillRect(px + x1 - 2, py + y1 - 2, 2, 2);

    // Protruding organic leaf scallops along exposed outer edges so edges aren't straight lines
    if (!upLeaf) {
      ctx.fillStyle = def.color;
      ctx.fillRect(px + 3 + s1, py, 4, 2);
      ctx.fillRect(px + 9 + s2, py, 4, 2);
    }
    if (!downLeaf) {
      ctx.fillStyle = deepShadow;
      ctx.fillRect(px + 2 + s2, py + 14, 4, 2);
      ctx.fillRect(px + 9 + s1, py + 14, 4, 2);
    }
    if (!leftLeaf) {
      ctx.fillStyle = def.color;
      ctx.fillRect(px, py + 3 + s1, 2, 4);
      ctx.fillRect(px, py + 9 + s2, 2, 4);
    }
    if (!rightLeaf) {
      ctx.fillStyle = def.darkColor;
      ctx.fillRect(px + 14, py + 3 + s2, 2, 4);
      ctx.fillRect(px + 14, py + 9 + s1, 2, 4);
    }

    // 2. Three overlapping rounded leaf bushels inside the tile
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 1, py + 1, 8, 7);
    ctx.fillRect(px + 6, py + 2 + s1, 8, 7);
    ctx.fillRect(px + 2 + s2, py + 7, 10, 6);

    // 3. Deep bushel underside shadows for 3D leaf cluster relief
    ctx.fillStyle = deepShadow;
    ctx.fillRect(px + 2, py + 7, 5, 2);
    ctx.fillRect(px + 8, py + 8 + s1, 5, 2);
    ctx.fillRect(px + 3, py + 13, 9, 2);

    // 4. Mid-light leaf cluster highlights
    ctx.fillStyle = def.lightColor;
    ctx.fillRect(px + 2, py + 2 + s1, 5, 3);
    ctx.fillRect(px + 3, py + 5 + s1, 3, 1);
    ctx.fillRect(px + 8 + s2, py + 3, 4, 3);
    ctx.fillRect(px + 4, py + 8 + s2, 5, 2);

    // 5. Volumetric Sunlit Top Crown Rim when exposed to the sky above
    if (!upLeaf) {
      ctx.fillStyle = def.lightColor;
      ctx.fillRect(px + 2, py + 1, 6, 3);
      ctx.fillRect(px + 8, py + 1 + s1, 5, 3);
      ctx.fillStyle = sunTipColor;
      ctx.fillRect(px + 3 + s1, py + 1, 3, 2);
      ctx.fillRect(px + 9 + s2, py + 1, 3, 1);
    }

    // 6. Deep Shaded Under-Bough Fringe when exposed to air below
    if (!downLeaf) {
      ctx.fillStyle = deepShadow;
      ctx.fillRect(px + 2, py + 12, 12, 3);
      ctx.fillStyle = def.darkColor;
      ctx.fillRect(px + 3 + s1, py + 11, 4, 2);
      ctx.fillRect(px + 9, py + 11 + s2, 4, 2);
    }

    // 7. Species-specific botanical details (Oak acorns & sun flecks, Sakura blossoms, Birch shimmer)
    if (isOak) {
      ctx.fillStyle = sunTipColor;
      ctx.fillRect(px + 3 + s1, py + 2, 2, 1);
      if (v === 1 && hasAcorn) {
        // Tiny pixel oak acorn hanging under a leaf cluster
        ctx.fillStyle = '#451a03';
        ctx.fillRect(px + 10, py + 9, 3, 1);
        ctx.fillStyle = '#b45309';
        ctx.fillRect(px + 10, py + 10, 3, 2);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(px + 11, py + 10, 1, 1);
      }
    } else if (isCherry) {
      // Crisp 5-pixel Sakura blossoms scattered across the pink canopy
      ctx.fillStyle = '#fff1f2';
      ctx.fillRect(px + 3 + s1, py + 2, 3, 3);
      ctx.fillStyle = '#e11d48';
      ctx.fillRect(px + 4 + s1, py + 3, 1, 1);
      if ((v & 1) === 0) {
        ctx.fillStyle = '#fff1f2';
        ctx.fillRect(px + 9, py + 8 + s2, 3, 3);
        ctx.fillStyle = '#e11d48';
        ctx.fillRect(px + 10, py + 9 + s2, 1, 1);
      }
    } else if (isBirch) {
      ctx.fillStyle = '#ecfccb';
      ctx.fillRect(px + 3, py + 2 + s1, 2, 2);
      ctx.fillRect(px + 10, py + 4 + s2, 2, 1);
    }

    contextualTreeSpriteCache.set(cacheKey, spriteCanvas);
    targetCtx.drawImage(spriteCanvas, targetPx, targetPy);
  }

  private applyTreeToChunk(
    tree: TreeData,
    _cx: number,
    _cy: number,
    chunkWorldX: number,
    chunkWorldY: number,
    tiles: Uint8Array
  ) {
    const { rootX, rootY, blocks } = tree;

    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const bx = rootX + b.dx;
      const by = rootY + b.dy;
      if (
        bx < chunkWorldX ||
        bx >= chunkWorldX + CHUNK_WIDTH ||
        by < chunkWorldY ||
        by >= chunkWorldY + CHUNK_HEIGHT
      ) {
        continue;
      }

      const lx = bx - chunkWorldX;
      const ly = by - chunkWorldY;
      const idx = ly * CHUNK_WIDTH + lx;
      const current = tiles[idx] as TileType;

      if (b.layer === 3) {
        // Trunk, branch, or root flare overwrites air, leaves, or vines (never solid terrain)
        if (current === TileType.AIR || LEAF_TILES.has(current) || current === TileType.VINE) {
          tiles[idx] = b.tile;
        }
      } else if (b.layer === 2) {
        // Canopy leaf or mushroom cap overwrites air or vines (never wood or solid terrain)
        if (current === TileType.AIR || current === TileType.VINE) {
          tiles[idx] = b.tile;
        }
      } else if (b.layer === 1) {
        // Hanging vines only occupy open air
        if (current === TileType.AIR) {
          tiles[idx] = b.tile;
        }
      }
    }
  }

  // Fast block collision getter with persistent modifications check
  public getTile(blockX: number, blockY: number): TileType {
    const mod = this.modifications.getBlock(blockX, blockY);
    if (mod !== undefined) {
      return mod;
    }

    const cx = Math.floor(blockX / CHUNK_WIDTH);
    const cy = Math.floor(blockY / CHUNK_HEIGHT);
    const key = ChunkManager.getChunkKey(cx, cy);

    const chunk = this.loadedChunks.get(key);
    if (chunk) {
      if (chunk.isAllAir) return TileType.AIR;
      const lx = ((blockX % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH;
      const ly = ((blockY % CHUNK_HEIGHT) + CHUNK_HEIGHT) % CHUNK_HEIGHT;
      return chunk.tiles[ly * CHUNK_WIDTH + lx] as TileType;
    }

    return this.terrainGen.getBaseTile(blockX, blockY);
  }
}
