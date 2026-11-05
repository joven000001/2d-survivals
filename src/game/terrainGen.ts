import { BEDROCK_Y, SURFACE_BASE_Y, TILE_DEFS } from './constants';
import { SimplexNoise } from './noise';
import { TileType } from './types';
import { BIOMES, BiomeDefinition, BiomeType, TreeType } from './biomes';

export interface TreeBlockOffset {
  dx: number;
  dy: number; // offset from rootY (negative = above surface)
  tile: TileType;
  /** 3 = trunk/branch/root wood, 2 = leaf/cap, 1 = hanging vine */
  layer: 1 | 2 | 3;
}

export interface TreeData {
  rootX: number;
  rootY: number; // surface Y
  height: number;
  canopyRadius: number;
  type: TreeType;
  variant: number;
  archetype: number;
  leanDirection: -1 | 0 | 1;
  blocks: ReadonlyArray<TreeBlockOffset>;
}

export interface RiverColumn {
  /** Top row of the stream; generated in world coordinates for chunk continuity. */
  surfaceY: number;
  /** Water depth below the visible surface, in blocks. */
  depth: number;
  /** World X direction the reach flows toward its lower endpoint. */
  flowDirection: -1 | 1;
}

export interface WaterfallColumn {
  /** First water tile at the lip of the fall. */
  topY: number;
  /** Last water tile before the lower river pool. */
  bottomY: number;
}

interface LakeColumn {
  waterTop: number;
  waterBottom: number;
  inPool: boolean;
  centerX: number;
  centerY: number;
  radiusX: number;
  outletDirection: -1 | 1;
}

interface EntranceColumn {
  surfaceY: number;
  centerX: number;
  depth: number;
  wobble: number;
}

interface OreTier {
  tile: TileType;
  depthMin: number;
  depthMax: number;
  attemptsPerCell: number;
  anchorDenominator: number;
  radiusXMin: number;
  radiusXRange: number;
  radiusYMin: number;
  radiusYRange: number;
  salt: number;
}

interface OreVein {
  tile: TileType;
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  salt: number;
  depthMin: number;
  depthMax: number;
}

const DENSE_WOODLANDS = new Set<BiomeType>([
  'FOREST','BIRCH_FOREST','AUTUMN_FOREST','CHERRY_BLOSSOM_FOREST','DARK_FOREST',
  'MISTY_FOREST','ENCHANTED_FOREST','SNOWY_TAIGA','BAMBOO_FOREST',
]);

const ORE_TIERS: OreTier[] = [
  // Very common shallow-to-deep ores (Coal & Copper)
  { tile: TileType.COAL_ORE, depthMin: 5, depthMax: 140, attemptsPerCell: 5, anchorDenominator: 1, radiusXMin: 2, radiusXRange: 4, radiusYMin: 2, radiusYRange: 2, salt: 0x243f6a88 },
  { tile: TileType.COPPER_ORE, depthMin: 6, depthMax: 118, attemptsPerCell: 4, anchorDenominator: 1, radiusXMin: 2, radiusXRange: 4, radiusYMin: 2, radiusYRange: 2, salt: 0x85a308d3 },
  // Common mid-depth ore (Iron)
  { tile: TileType.IRON_ORE, depthMin: 14, depthMax: 150, attemptsPerCell: 3, anchorDenominator: 1, radiusXMin: 2, radiusXRange: 3, radiusYMin: 1, radiusYRange: 3, salt: 0x13198a2e },
  // Uncommon / moderate ore (Gold)
  { tile: TileType.GOLD_ORE, depthMin: 30, depthMax: 165, attemptsPerCell: 2, anchorDenominator: 2, radiusXMin: 2, radiusXRange: 3, radiusYMin: 1, radiusYRange: 2, salt: 0x03707344 },
  // Rare deep ores (Crystal & Diamond - boosted slightly so deep miners reliably find veins)
  { tile: TileType.CRYSTAL_ORE, depthMin: 44, depthMax: 174, attemptsPerCell: 2, anchorDenominator: 3, radiusXMin: 2, radiusXRange: 2, radiusYMin: 1, radiusYRange: 2, salt: 0xa4093822 },
  { tile: TileType.DIAMOND_ORE, depthMin: 52, depthMax: 184, attemptsPerCell: 2, anchorDenominator: 4, radiusXMin: 2, radiusXRange: 2, radiusYMin: 1, radiusYRange: 2, salt: 0x299f31d0 },
];

export class TerrainGenerator {
  public seed: number;
  private terrainNoise: SimplexNoise;
  private caveNoise1: SimplexNoise;
  private caveNoise2: SimplexNoise;
  private treeNoise: SimplexNoise;
  private temperatureNoise: SimplexNoise;
  private humidityNoise: SimplexNoise;
  private elevationNoise: SimplexNoise;
  private lakeNoise: SimplexNoise;
  private entranceNoise: SimplexNoise;
  private oreNoise: SimplexNoise;
  private biomeCacheKeys: Int32Array = new Int32Array(2048).fill(-99999999);
  private biomeCache: BiomeDefinition[] = new Array(2048);

  // Ultra-fast direct-mapped caches for column queries (eliminates recalculations)
  private surfaceCache: Int32Array = new Int32Array(2048);
  private surfaceCacheKeys: Int32Array = new Int32Array(2048).fill(-99999999);

  private dirtCache: Int32Array = new Int32Array(2048);
  private dirtCacheKeys: Int32Array = new Int32Array(2048).fill(-99999999);

  // River lookups are deterministic and cached by world column. The broad source
  // cells keep reaches rare and long; adjacent chunks resolve the same reach.
  private riverCacheKeys: Int32Array = new Int32Array(2048).fill(-99999999);
  private riverCache: Array<RiverColumn | null> = new Array(2048).fill(null);
  private waterfallCacheKeys: Int32Array = new Int32Array(2048).fill(-99999999);
  private waterfallCache: Array<WaterfallColumn | null> = new Array(2048).fill(null);
  private lakeCacheKeys: Int32Array = new Int32Array(2048).fill(-99999999);
  private lakeCache: Array<LakeColumn | null> = new Array(2048).fill(null);
  private entranceCacheKeys: Int32Array = new Int32Array(2048).fill(-99999999);
  private entranceCache: Array<EntranceColumn | null> = new Array(2048).fill(null);
  private oreColumnCacheKeys: Int32Array = new Int32Array(2048).fill(-99999999);
  private oreColumnCache: Array<OreVein[]> = new Array(2048);
  private treeCacheKeys: Int32Array = new Int32Array(2048).fill(-99999999);
  private treeCache: Array<TreeData | null> = new Array(2048).fill(null);

  constructor(seed: number) {
    this.seed = seed;
    this.terrainNoise = new SimplexNoise(seed);
    this.caveNoise1 = new SimplexNoise(seed + 101);
    this.caveNoise2 = new SimplexNoise(seed + 202);
    this.treeNoise = new SimplexNoise(seed + 303);
    this.temperatureNoise = new SimplexNoise(seed + 404);
    this.humidityNoise = new SimplexNoise(seed + 505);
    this.elevationNoise = new SimplexNoise(seed + 606);
    this.lakeNoise = new SimplexNoise(seed + 707);
    this.entranceNoise = new SimplexNoise(seed + 808);
    this.oreNoise = new SimplexNoise(seed + 909);
  }

  private featureHash(cell: number, salt: number): number {
    let h = Math.imul((this.seed ^ salt) + Math.imul(cell, 0x45d9f3b), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (h ^ (h >>> 16)) >>> 0;
  }

  private getOreVeinsForBand(x: number, band: number): OreVein[] {
    const cacheKey = Math.imul(x, 37) ^ Math.imul(band, 0x9e3779b1);
    const cacheIndex = (cacheKey & 2047) >>> 0;
    if (this.oreColumnCacheKeys[cacheIndex] === cacheKey) return this.oreColumnCache[cacheIndex];
    const cellSize = 24;
    const bandHeight = 140;
    const firstCell = Math.floor(x / cellSize) - 1;
    const lastCell = Math.floor(x / cellSize) + 1;
    const veins: OreVein[] = [];
    for (const tier of ORE_TIERS) {
      const bandMin = band === 0 ? tier.depthMin : band * bandHeight - 4;
      const bandMax = band === 0 ? Math.min(tier.depthMax, bandHeight + 6) : Math.min(2996, (band + 1) * bandHeight + 4);
      if (bandMax <= bandMin) continue;
      for (let cell = firstCell; cell <= lastCell; cell++) {
        for (let attempt = 0; attempt < tier.attemptsPerCell; attempt++) {
          const attemptSalt = (tier.salt + Math.imul(attempt + 1, 0x9e3779b1) + Math.imul(band, 0x85ebca6b)) >>> 0;
          const roll = this.featureHash(cell, attemptSalt);
          if (roll % tier.anchorDenominator !== 0) continue;
          const centerX = cell * cellSize + this.featureHash(cell, attemptSalt ^ 0x9e3779b9) % cellSize;
          const radiusX = tier.radiusXMin + this.featureHash(cell, attemptSalt ^ 0x7f4a7c15) % tier.radiusXRange;
          if (Math.abs(x - centerX) > radiusX + 1) continue;
          const radiusY = tier.radiusYMin + this.featureHash(cell, attemptSalt ^ 0x94d049bb) % tier.radiusYRange;
          const centerSurface = this.getSurfaceHeight(centerX);
          const requestedDepth = bandMin + this.featureHash(cell, attemptSalt ^ 0xed5ad4bb) % (bandMax - bandMin + 1);
          const maxDepthAtColumn = Math.min(3000 - radiusY - 3, BEDROCK_Y - centerSurface - radiusY - 4);
          const depth = Math.min(requestedDepth, maxDepthAtColumn);
          if (depth < tier.depthMin) continue;
          veins.push({
            tile: tier.tile,
            centerX,
            centerY: centerSurface + depth,
            radiusX,
            radiusY,
            salt: attemptSalt ^ this.featureHash(cell, attemptSalt ^ 0x2ffd72db) % 997,
            depthMin: tier.depthMin,
            depthMax: 2996,
          });
        }
      }
    }
    this.oreColumnCacheKeys[cacheIndex] = cacheKey;
    this.oreColumnCache[cacheIndex] = veins;
    return veins;
  }

  /** Return the deterministic vein tile at an underground coordinate, if any. */
  public getOreAt(x: number, y: number, surfaceY: number): TileType | null {
    const localDepth = y - surfaceY;
    if (localDepth < 5 || localDepth >= 2997) return null;
    const band = Math.floor(localDepth / 140);
    let bestTile: TileType | null = null;
    let bestDistance = Infinity;
    for (const vein of this.getOreVeinsForBand(x, band)) {
      if (localDepth < vein.depthMin || localDepth > vein.depthMax) continue;
      const nx = (x - vein.centerX) / vein.radiusX;
      const ny = (y - vein.centerY) / vein.radiusY;
      const distance = nx * nx + ny * ny;
      if (distance > 1.3) continue;
      const roughEdge = this.oreNoise.noise2D(x * 0.29 + (vein.salt % 997), y * 0.31 - (vein.salt % 991));
      const limit = 1.05 + roughEdge * 0.22;
      if (distance <= limit && distance < bestDistance) {
        bestDistance = distance;
        bestTile = vein.tile;
      }
    }
    return bestTile;
  }

  private applyOreToSolid(x: number, y: number, surfaceY: number, baseTile: TileType): TileType {
    if (y <= surfaceY + 4 || y >= surfaceY + 2997 || y >= BEDROCK_Y - 3 || baseTile === TileType.MAGMA || baseTile === TileType.OBSIDIAN || baseTile === TileType.BEDROCK || !TILE_DEFS[baseTile]?.isSolid) return baseTile;
    return this.getOreAt(x, y, surfaceY) ?? baseTile;
  }

  /** Seeded irregular underground pools, cached once per world column. */
  private getLakeColumn(x: number, surfaceY: number): LakeColumn | null {
    const cacheIndex = x & 2047;
    if (this.lakeCacheKeys[cacheIndex] === x) return this.lakeCache[cacheIndex];
    const cellSize = 640;
    let best: LakeColumn | null = null;
    for (let cell = Math.floor(x / cellSize) - 1; cell <= Math.floor(x / cellSize) + 1; cell++) {
      const hash = (salt: number) => this.featureHash(cell, salt);
      // Roughly one pool anchor per 12 cells. Caves remain far more common.
      if (hash(0x3c6ef372) % 12 !== 0) continue;
      const centerX = cell * cellSize + hash(0xa54ff53a) % cellSize;
      const radiusX = 16 + hash(0x510e527f) % 19;
      const reach = radiusX + 23;
      if (Math.abs(x - centerX) > reach) continue;
      const radiusY = 3 + hash(0x9b05688c) % 6;
      const centerSurface = this.getSurfaceHeight(centerX);
      const proposedY = centerSurface + 38 + hash(0x1f83d9ab) % 112;
      const centerY = Math.min(BEDROCK_Y - radiusY - 5, proposedY);
      const dx = (x - centerX) / radiusX;
      const edgeNoise = this.lakeNoise.noise2D(x * 0.055, centerY * 0.075 + cell * 3);
      const halfHeight = radiusY * Math.sqrt(Math.max(0, 1 - dx * dx)) * (0.76 + (edgeNoise + 1) * 0.12);
      const outletDirection: -1 | 1 = (hash(0x5be0cd19) & 1) === 0 ? -1 : 1;
      const waterTop = Math.ceil(centerY - halfHeight);
      const waterBottom = Math.floor(centerY + halfHeight);
      const outletStart = centerX + outletDirection * (radiusX - 1);
      const outletEnd = centerX + outletDirection * (radiusX + 22);
      const inPool = Math.abs(dx) <= 1 && waterBottom > waterTop && waterTop > surfaceY + 28;
      const inOutlet = (x - outletStart) * outletDirection >= 0 && (outletEnd - x) * outletDirection >= 0;
      if ((!inPool && !inOutlet) || centerY + radiusY < surfaceY + 28) continue;
      const candidate: LakeColumn = { waterTop, waterBottom, inPool, centerX, centerY, radiusX, outletDirection };
      if (!best || Math.abs(x - centerX) < Math.abs(x - best.centerX)) best = candidate;
    }
    this.lakeCacheKeys[cacheIndex] = x;
    this.lakeCache[cacheIndex] = best;
    return best;
  }

  private getEntranceColumn(x: number): EntranceColumn | null {
    const cacheIndex = x & 2047;
    if (this.entranceCacheKeys[cacheIndex] === x) return this.entranceCache[cacheIndex];
    const cellSize = 4096;
    let result: EntranceColumn | null = null;
    for (let cell = Math.floor(x / cellSize) - 1; cell <= Math.floor(x / cellSize) + 1; cell++) {
      const hash = (salt: number) => this.featureHash(cell, salt);
      // About one candidate per 65k horizontal blocks; reject water/coastal ground and steep caps.
      if (hash(0x6a09e667) % 16 !== 0) continue;
      const centerX = cell * cellSize + hash(0xbb67ae85) % cellSize;
      if (Math.abs(x - centerX) > 2) continue;
      const surfaceY = this.getSurfaceHeight(centerX);
      const biome = this.getColumnBiome(centerX);
      if (biome.waterLevel !== undefined || Math.abs(this.getSurfaceHeight(centerX - 4) - surfaceY) > 5 ||
          Math.abs(this.getSurfaceHeight(centerX + 4) - surfaceY) > 5) continue;
      const depth = 22 + hash(0x3c6ef372) % 13;
      result = { surfaceY, centerX, depth, wobble: this.entranceNoise.noise1D(centerX * 0.01 + this.seed) * 1.2 };
      break;
    }
    this.entranceCacheKeys[cacheIndex] = x;
    this.entranceCache[cacheIndex] = result;
    return result;
  }

  private isEntranceAt(x: number, y: number, surfaceY: number): boolean {
    const entrance = this.getEntranceColumn(x);
    if (!entrance || Math.abs(entrance.surfaceY - surfaceY) > 2) return false;
    const depth = y - entrance.surfaceY;
    if (depth < -2 || depth > entrance.depth) return false;
    const width = depth < 3 ? 1.1 : depth < 10 ? 1.7 : 1.2;
    const center = entrance.centerX + this.entranceNoise.noise1D(depth * 0.11 + entrance.centerX * 0.003) * 1.1 + entrance.wobble;
    return Math.abs(x - center) <= width;
  }

  public isCaveEntranceAt(x: number, y: number, surfaceY: number): boolean {
    return this.isEntranceAt(x, y, surfaceY);
  }

  public isUndergroundLakeWaterAt(x: number, y: number, surfaceY: number): boolean {
    const lake = this.getLakeColumn(x, surfaceY);
    return !!lake && lake.inPool && y > surfaceY + 28 && y >= lake.waterTop && y <= lake.waterBottom;
  }

  public getBiomeAt(x: number, y: number): BiomeDefinition {
    const temperature = (this.temperatureNoise.noise2D(x * 0.00042, y * 0.00042) + 1) / 2;
    const humidity = (this.humidityNoise.noise2D(x * 0.00048, y * 0.00048) + 1) / 2;
    const elevation = (this.elevationNoise.noise2D(x * 0.00038, y * 0.00038) + 1) / 2;
    // Independent broad climate bands create natural, seeded, irregular biome regions.
    // Keep this a pure lookup: chunks call it while generating; rendering never scans the world.
    const region = (this.elevationNoise.noise2D(x * 0.00012 + 91, y * 0.00012 - 37) + 1) * 0.5;
    const variant = (this.humidityNoise.noise2D(x * 0.00022 - 133, y * 0.00022 + 53) + 1) * 0.5;
    const rare = (this.temperatureNoise.noise2D(x * .0003 + 291, y * .0003 - 711) + 1) * .5;
    // Ocean basins use a very broad, one-dimensional macro field so their
    // shorelines span many chunks while remaining uncommon across a seed.
    const oceanBasin = (this.elevationNoise.noise1D(x * 0.00002 + 771) + 1) * 0.5;
    let id: BiomeType;
    if (y > SURFACE_BASE_Y + 36 && region > 0.36) {
      if (temperature < 0.33 && rare > .74) id = 'ICE_CAVERNS';
      else if (humidity > 0.67 && temperature > 0.56 && rare > .72) id = 'UNDERGROUND_JUNGLE';
      else if (humidity > 0.68 && rare > .75) id = 'MUSHROOM_CAVERNS';
      else if (y > 158 && variant < .4 && rare > .78) id = 'CRYSTAL_CAVERNS';
      else if (variant > .68 && rare > .73) id = 'GLOW_CAVERNS';
      else id = 'DEEP_CAVERNS';
    } else if (oceanBasin > .994) {
      if (temperature < .34) id = 'FROZEN_OCEAN';
      else if (oceanBasin > .998) id = 'DEEP_OCEAN';
      else id = 'OCEAN';
    } else if (oceanBasin > .955) {
      id = temperature < .34 ? 'FROZEN_OCEAN' : temperature > .62 && humidity > .56 ? 'CORAL_COAST' : 'BEACH';
    } else if (elevation < 0.29) {
      id = temperature < .34 ? 'GLACIER' : temperature > .62 && humidity > .62 ? 'TROPICAL_ISLAND' : 'BEACH';
    } else if (elevation > 0.68) {
      if (temperature < .32) id = variant > .55 ? 'ICE_MOUNTAINS' : 'GLACIER';
      else if (temperature > .74 && variant > .73 && rare > .76) id = 'VOLCANIC_MOUNTAINS';
      else if (variant > .72) id = 'ROCKY_HIGHLANDS';
      else if (temperature > .74 && variant > .72 && rare > .78) id = 'VOLCANIC';
      else id = 'MOUNTAINS';
    } else if (temperature > 0.64 && humidity < 0.43) {
      if (variant > .75 && rare > .77) id = 'LAVA_FIELDS';
      else if (variant > .74 && rare > .76) id = 'ASHLANDS';
      else if (variant > .72 && rare > .74) id = 'BADLANDS';
      else if (variant > .7 && rare > .72) id = 'CANYON';
      else if (variant > .66 && rare > .7) id = 'OASIS_DESERT';
      else if (variant > .63) id = 'SAVANNA';
      else if (variant < .3 && rare > .74) id = 'SALT_FLATS';
      else id = 'DESERT';
    } else if (temperature < 0.36) {
      if (variant < .34 && rare > .74) id = 'GLACIER';
      else if (variant < .4 && rare > .72) id = 'TUNDRA';
      else if (variant < .55) id = 'SNOWY_TAIGA';
      else if (variant > .72 && rare > .76) id = 'ICE_MOUNTAINS';
      else id = 'SNOWY_PLAINS';
    } else if (temperature > .55 && humidity > .55) {
      if (variant < .35 && rare > .75) id = 'RAINFOREST';
      else if (variant > .73 && rare > .77) id = 'TROPICAL_ISLAND';
      else if (variant > .7 && rare > .75) id = 'MANGROVE_SWAMP';
      else if (variant > .68 && rare > .72) id = 'SWAMP';
      else if (variant > .61) id = 'BAMBOO_FOREST';
      else id = 'JUNGLE';
    } else if (humidity > .52 && temperature < .63) {
      if (variant < .54) id = 'FOREST';
      else if (variant < .63) id = 'BIRCH_FOREST';
      else if (variant < .68) id = 'REDWOOD_FOREST';
      else if (variant < .7) id = 'DARK_FOREST';
      else if (variant < .72) id = 'ANCIENT_FOREST';
      else if (variant < .735) id = 'CHERRY_BLOSSOM_FOREST';
      else if (variant < .75) id = 'MISTY_FOREST';
      else id = 'FOREST';
    } else if (variant > .74) id = 'FLOWER_MEADOW';
    else if (variant > .67) id = 'PLAINS';
    else if (temperature > .56 && humidity < .5 && variant > .6) id = 'SAVANNA';
    else id = 'PLAINS';
    // Low-frequency ecological pockets keep rare biomes discoverable in each seed
    // without introducing per-block decoration noise or generating distant chunks.
    if (id === 'PLAINS' || id === 'FOREST' || id === 'BIRCH_FOREST') {
      if (rare > .78) id = 'CRYSTAL_FOREST';
      else if (rare > .775) id = 'ENCHANTED_FOREST';
      else if (rare > .765) id = 'GIANT_MUSHROOM_FIELDS';
      else if (rare > .75) id = 'MUSHROOM_FOREST';
      else if (rare > .735) id = 'AUTUMN_FOREST';
      else if (id === 'PLAINS' && rare > .72) id = 'FLOWER_MEADOW';
      else if (rare > .74 && temperature > .42) id = 'RAINFOREST';
    }
    return BIOMES[id];
  }

  public getColumnBiome(x: number): BiomeDefinition {
    const idx = (x & 2047 + 2048) & 2047;
    if (this.biomeCacheKeys[idx] === x) return this.biomeCache[idx];
    const biome = this.getBiomeAt(x, SURFACE_BASE_Y);
    this.biomeCacheKeys[idx] = x;
    this.biomeCache[idx] = biome;
    return biome;
  }

  // Pure deterministic surface height at any world block X (with $O(1)$ direct-mapped cache)
  public getSurfaceHeight(x: number): number {
    const idx = (x & 2047 + 2048) & 2047;
    if (this.surfaceCacheKeys[idx] === x) {
      return this.surfaceCache[idx];
    }

    const biome = this.getColumnBiome(x);
    const modifier = biome.terrainHeightModifier;
    const macroHills = this.terrainNoise.fbm1D(x * 0.008, 2, 0.5, 2.0) * 18 * modifier;
    const localSlopes = this.terrainNoise.fbm1D(x * 0.035, 2, 0.4, 2.0) * 7 * modifier;
    const microVariation = this.terrainNoise.noise1D(x * 0.12) * 2;
    const coastalLift = biome.terrainStyle === 'coastal' ? 9 : biome.waterLevel !== undefined ? 6 : 0;
    const profile = biome.terrainStyle === 'flat' ? 0.58 : biome.terrainStyle === 'mountain' || biome.terrainStyle === 'canyon' ? 1.38 : 1;
    const canyonCut = biome.terrainStyle === 'canyon' ? -Math.max(0, 0.58 - Math.abs(this.terrainNoise.noise1D(x * 0.006))) * 72 : 0;
    const h = Math.round(SURFACE_BASE_Y + coastalLift + (macroHills + localSlopes + microVariation * modifier) * profile + canyonCut);

    this.surfaceCacheKeys[idx] = x;
    this.surfaceCache[idx] = h;
    return h;
  }

  // Pure deterministic dirt depth below surface at column X
  public getDirtDepth(x: number): number {
    const idx = (x & 2047 + 2048) & 2047;
    if (this.dirtCacheKeys[idx] === x) {
      return this.dirtCache[idx];
    }

    const d = 5 + Math.floor(Math.abs(this.terrainNoise.noise1D(x * 0.08 + 50)) * 4);
    this.dirtCacheKeys[idx] = x;
    this.dirtCache[idx] = d;
    return d;
  }

  /**
   * Return the stream cross-section at a world column, if one passes here.
   * Reaches are seeded in 8192-block cells (256 chunks), run for 2200-7200
   * blocks, and choose their downstream direction from endpoint elevation.
   * The gently perturbed grade follows terrain while keeping the channel
   * connected and reproducible when chunks unload and stream back in.
   */
  public getRiverAt(x: number): RiverColumn | null {
    const cacheIndex = (x & 2047) >>> 0;
    if (this.riverCacheKeys[cacheIndex] === x) return this.riverCache[cacheIndex];

    const cellSize = 8192;
    const cell = Math.floor(x / cellSize);
    let result: RiverColumn | null = null;

    // A reach can begin in the preceding source cell and continue across any
    // number of chunk boundaries. It cannot extend beyond the next source cell.
    for (let sourceCell = cell - 1; sourceCell <= cell; sourceCell++) {
      const hash = (salt: number) => {
        let h = Math.imul((this.seed ^ salt) + Math.imul(sourceCell, 0x45d9f3b), 0x45d9f3b);
        h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
        h ^= h >>> 16;
        return h >>> 0;
      };

      // About one reach per twenty source cells: uncommon across the world.
      if (hash(0x6d2b79f5) % 20 !== 0) continue;
      const start = sourceCell * cellSize + (hash(0x1b873593) % cellSize);
      const length = 2200 + (hash(0x85ebca6b) % 5001);
      const end = start + length;
      if (x < start || x > end) continue;

      const startHeight = this.getSurfaceHeight(start);
      const endHeight = this.getSurfaceHeight(end);
      const flowsRight = startHeight < endHeight || (startHeight === endHeight && (hash(0xc2b2ae35) & 1) === 0);
      const upstreamY = flowsRight ? startHeight : endHeight;
      const downstreamY = flowsRight ? endHeight : startHeight;
      const progress = flowsRight ? x - start : end - x;
      const progress01 = progress / length;

      // Match the reach's endpoint elevations and add a broad, low-amplitude
      // meander. Clamp to the terrain edge so water never floats over land.
      const meander = this.terrainNoise.noise1D(x * 0.0018 + sourceCell * 17) * 1.35 +
        this.terrainNoise.noise1D(x * 0.00042 + sourceCell * 31) * 1.1;
      const gradeY = upstreamY + (downstreamY - upstreamY) * progress01 + progress01 * 1.5 + meander;
      const localSurface = this.getSurfaceHeight(x);
      // Keep the waterline tucked against the natural surface. The graded
      // profile can cut a shallow notch through a rise, but cannot leave a
      // suspended ribbon above the land.
      const surfaceY = Math.max(localSurface - 2, Math.min(localSurface - 1, Math.round(gradeY)));
      const edgeTaper = Math.min(1, progress / 14, (length - progress) / 14);
      const naturalWidth = 2 + Math.floor((this.terrainNoise.noise1D(x * 0.008 + sourceCell * 73) + 1) * 2.5);
      const depth = Math.max(1, Math.round(naturalWidth * edgeTaper));
      result = { surfaceY, depth, flowDirection: flowsRight ? 1 : -1 };

      // Source cells are sparse; at most one reach should cover a column. Keep
      // the first deterministic match if rare seeded reaches happen to overlap.
      break;
    }

    this.riverCacheKeys[cacheIndex] = x;
    this.riverCache[cacheIndex] = result;
    return result;
  }

  /** Return a cached vertical fall where an existing river crosses a sharp drop. */
  public getWaterfallAt(x: number): WaterfallColumn | null {
    const cacheIndex = (x & 2047) >>> 0;
    if (this.waterfallCacheKeys[cacheIndex] === x) return this.waterfallCache[cacheIndex];

    const lowerRiver = this.getRiverAt(x);
    let result: WaterfallColumn | null = null;
    if (lowerRiver) {
      const upstreamX = x - lowerRiver.flowDirection;
      const upperRiver = this.getRiverAt(upstreamX);
      if (upperRiver && upperRiver.flowDirection === lowerRiver.flowDirection) {
        const cliffDrop = lowerRiver.surfaceY - upperRiver.surfaceY;
        const terrainDrop = this.getSurfaceHeight(x) - this.getSurfaceHeight(upstreamX);
        // A four-block drop in one column is a real ledge in this terrain scale;
        // requiring both river and ground elevation changes keeps flat streams dry.
        if (cliffDrop >= 4 && cliffDrop <= 10 && terrainDrop >= 4) {
          result = {
            topY: upperRiver.surfaceY,
            bottomY: lowerRiver.surfaceY + lowerRiver.depth - 1,
          };
        }
      }
    }

    this.waterfallCacheKeys[cacheIndex] = x;
    this.waterfallCache[cacheIndex] = result;
    return result;
  }

  // Check if a tree is rooted at column X
  public getTreeAt(x: number): TreeData | null {
    const cacheIndex = (x & 2047) >>> 0;
    if (this.treeCacheKeys[cacheIndex] === x) {
      return this.treeCache[cacheIndex];
    }

    const biome = this.getColumnBiome(x);
    const cellWidth =
      biome.treeType === 'jungle' ||
      biome.treeType === 'redwood' ||
      biome.treeType === 'ancient' ||
      DENSE_WOODLANDS.has(biome.id)
        ? 6
        : biome.treeType === 'none'
          ? 9
          : 8;
    const cell = Math.floor(x / cellWidth);
    const cellHash = this.featureHash(cell, 0x517cc1b7);
    // Keep a 1-block margin inside each cell so neighboring trees never fuse trunks
    const innerSpan = Math.max(1, cellWidth - 2);
    const cellOffset = 1 + (cellHash % innerSpan);
    const treeX = cell * cellWidth + cellOffset;

    if (x !== treeX) {
      this.treeCacheKeys[cacheIndex] = x;
      this.treeCache[cacheIndex] = null;
      return null;
    }

    const roll = Math.abs(this.treeNoise.noise1D(treeX * 0.35));
    if (biome.treeType === 'none' || roll < 1 - biome.treeDensity) {
      this.treeCacheKeys[cacheIndex] = x;
      this.treeCache[cacheIndex] = null;
      return null;
    }

    // Do not root trees inside rivers or cave entrances
    if (this.getRiverAt(treeX)) {
      this.treeCacheKeys[cacheIndex] = x;
      this.treeCache[cacheIndex] = null;
      return null;
    }

    const sY = this.getSurfaceHeight(treeX);
    if (this.isEntranceAt(treeX, sY, sY)) {
      this.treeCacheKeys[cacheIndex] = x;
      this.treeCache[cacheIndex] = null;
      return null;
    }

    const leftY = this.getSurfaceHeight(treeX - 1);
    const rightY = this.getSurfaceHeight(treeX + 1);
    const rootSlopeLimit = DENSE_WOODLANDS.has(biome.id) ? 2 : 1;
    if (Math.abs(leftY - sY) > rootSlopeLimit || Math.abs(rightY - sY) > rootSlopeLimit) {
      this.treeCacheKeys[cacheIndex] = x;
      this.treeCache[cacheIndex] = null;
      return null;
    }

    const variant = this.featureHash(treeX, 0x85ebca6b);
    const v1 = (variant & 0xff) / 255;
    const v2 = ((variant >>> 8) & 0xff) / 255;
    const shape = (this.treeNoise.noise1D(treeX * 0.19 + 1441) + 1) * 0.5;
    const mixedShape = shape * 0.55 + v1 * 0.45;

    const ancient = biome.treeType === 'ancient';
    const redwood = biome.treeType === 'redwood';
    const jungle = biome.treeType === 'jungle';
    const sizeBand = ancient
      ? mixedShape > 0.72
        ? 3
        : 2
      : redwood || jungle
        ? mixedShape > 0.78
          ? 3
          : mixedShape > 0.46
            ? 2
            : 1
        : mixedShape > 0.82
          ? 3
          : mixedShape > 0.54
            ? 2
            : mixedShape > 0.26
              ? 1
              : 0;

    const height = ancient
      ? 21 + Math.floor(v2 * 10)
      : redwood
        ? 15 + sizeBand * 3 + Math.floor(v2 * 5)
        : jungle
          ? 11 + sizeBand * 3 + Math.floor(v2 * 4)
          : biome.treeType === 'mushroom'
            ? 6 + Math.floor(v2 * 5)
            : biome.treeType === 'birch'
              ? 7 + sizeBand * 2 + Math.floor(v2 * 3)
              : 6 + sizeBand * 2 + Math.floor(v2 * 3);

    const canopyRadius =
      (redwood || ancient ? 4 : jungle ? 3 : 2) +
      (sizeBand >= 2 ? 2 : sizeBand === 1 ? 1 : 0) +
      (v1 > 0.76 ? 1 : 0);

    const archetype = variant % 6;
    const leanRoll = (variant >>> 16) % 5;
    const leanDirection: -1 | 0 | 1 = leanRoll === 0 ? -1 : leanRoll === 1 ? 1 : 0;

    const blocks = this.buildTreeBlocks(
      treeX,
      sY,
      leftY,
      rightY,
      height,
      canopyRadius,
      biome.treeType,
      variant,
      archetype,
      leanDirection
    );

    const treeData: TreeData = {
      rootX: treeX,
      rootY: sY,
      height,
      canopyRadius,
      type: biome.treeType,
      variant,
      archetype,
      leanDirection,
      blocks,
    };

    this.treeCacheKeys[cacheIndex] = x;
    this.treeCache[cacheIndex] = treeData;
    return treeData;
  }

  /** Fast deterministic lookup of any generated tree block (trunk, root, branch, leaf, or vine) at world (bx, by). */
  public getTreeTileAt(bx: number, by: number): TileType {
    let bestTile: TileType = TileType.AIR;
    let bestLayer = 0;
    for (let tx = bx - 9; tx <= bx + 9; tx++) {
      const tree = this.getTreeAt(tx);
      if (!tree) continue;
      const dx = bx - tree.rootX;
      const dy = by - tree.rootY;
      if (dy > 2 || dy < -tree.height - tree.canopyRadius - 5) continue;
      for (let i = 0; i < tree.blocks.length; i++) {
        const b = tree.blocks[i];
        if (b.dx === dx && b.dy === dy && b.layer > bestLayer) {
          bestLayer = b.layer;
          bestTile = b.tile;
          if (bestLayer === 3) return bestTile;
        }
      }
    }
    return bestTile;
  }

  private buildTreeBlocks(
    rootX: number,
    rootY: number,
    leftSurfaceY: number,
    rightSurfaceY: number,
    height: number,
    canopyRadius: number,
    type: TreeType,
    variant: number,
    archetype: number,
    leanDir: -1 | 0 | 1
  ): ReadonlyArray<TreeBlockOffset> {
    const map = new Map<number, TreeBlockOffset>();
    const setBlock = (dx: number, dy: number, tile: TileType, layer: 1 | 2 | 3) => {
      if (dx < -9 || dx > 9 || dy > 2 || dy < -44) return;
      const key = ((dx + 32) << 8) | (dy + 64);
      const existing = map.get(key);
      if (!existing || layer > existing.layer) {
        map.set(key, { dx, dy, tile, layer });
      }
    };

    const cellRand = (dx: number, dy: number, salt: number): number => {
      let h = Math.imul(variant ^ salt, 0x9e3779b1) ^ Math.imul(dx + 19, 0x85ebca6b) ^ Math.imul(dy + 47, 0xc2b2ae35);
      h = Math.imul(h ^ (h >>> 15), 0x27d4eb2d);
      return ((h ^ (h >>> 15)) >>> 0) / 0xffffffff;
    };

    const trunkTile: TileType =
      type === 'birch'
        ? TileType.BIRCH_WOOD
        : type === 'acacia'
          ? TileType.ACACIA_WOOD
          : type === 'cherry'
            ? TileType.CHERRY_WOOD
            : type === 'palm'
              ? TileType.PALM_WOOD
              : type === 'celestial'
                ? TileType.CELESTIAL_WOOD
                : TileType.WOOD;

    const leafTile: TileType =
      type === 'birch'
        ? TileType.BIRCH_LEAVES
        : type === 'acacia'
          ? TileType.ACACIA_LEAVES
          : type === 'cherry'
            ? TileType.CHERRY_LEAVES
            : type === 'palm'
              ? TileType.PALM_LEAVES
              : type === 'mushroom'
                ? TileType.GLOWING_MUSHROOM
                : type === 'celestial'
                  ? TileType.CELESTIAL_LEAVES
                  : TileType.LEAVES;

    // Helper: add an organic scalloped foliage cloud centered at (cx, cy) with radii (rx, ry)
    const addFoliageLobe = (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      salt: number,
      hangFringeChance = 0.35
    ) => {
      const minX = Math.floor(cx - rx - 1);
      const maxX = Math.ceil(cx + rx + 1);
      const minY = Math.floor(cy - ry - 1);
      const maxY = Math.ceil(cy + ry + 1);
      for (let dy = minY; dy <= maxY; dy++) {
        for (let dx = minX; dx <= maxX; dx++) {
          const nx = (dx - cx) / Math.max(1, rx);
          const ny = (dy - cy) / Math.max(1, ry);
          // Slightly flatter bottom and domed top for natural tree crowns
          const verticalBias = ny > 0 ? ny * 1.18 : ny * 0.92;
          const distSq = nx * nx + verticalBias * verticalBias;
          const wobble = (cellRand(dx, dy, salt) - 0.5) * 0.34;
          if (distSq <= 1.02 + wobble) {
            setBlock(dx, dy, leafTile, 2);
            // Soft hanging outer leaf tufts under the bough rim
            if (
              ny >= 0.35 &&
              Math.abs(nx) >= 0.42 &&
              cellRand(dx, dy + 1, salt ^ 0x3b) < hangFringeChance
            ) {
              setBlock(dx, dy + 1, leafTile, 2);
            }
          }
        }
      }
    };

    // Helper: add root flares at the base of the trunk if ground supports them
    const addRootFlares = (leftChance: number, rightChance: number, tallButtress = false) => {
      if (leftSurfaceY >= rootY && cellRand(-1, -1, 0x101) < leftChance) {
        setBlock(-1, -1, trunkTile, 3);
        if (tallButtress && cellRand(-1, -2, 0x102) < 0.65) {
          setBlock(-1, -2, trunkTile, 3);
        }
      }
      if (rightSurfaceY >= rootY && cellRand(1, -1, 0x103) < rightChance) {
        setBlock(1, -1, trunkTile, 3);
        if (tallButtress && cellRand(1, -2, 0x104) < 0.65) {
          setBlock(1, -2, trunkTile, 3);
        }
      }
    };

    const primarySide: -1 | 1 = (variant & 1) === 0 ? -1 : 1;
    const secondarySide: -1 | 1 = primarySide === -1 ? 1 : -1;

    if (type === 'oak' || type === 'dark') {
      const isDark = type === 'dark';
      // Grounded root flare so oaks feel anchored into the earth rather than sticks
      addRootFlares(
        height >= 7 || isDark ? 0.78 : 0.42,
        height >= 7 || isDark ? 0.78 : 0.42,
        height >= 10 || isDark
      );

      if (archetype === 0) {
        // Archetype 0: Classic Spreading Multi-Bough Oak
        let trunkX = 0;
        const bendHeight = Math.floor(height * 0.55);
        for (let ty = 1; ty <= height; ty++) {
          if (ty === bendHeight && leanDir !== 0 && height >= 8) {
            setBlock(trunkX, -ty, trunkTile, 3);
            trunkX += leanDir;
          }
          setBlock(trunkX, -ty, trunkTile, 3);
        }
        const topY = -height;
        // Left & right upper boughs
        const leftReach = 1 + ((variant >>> 4) % 2);
        const rightReach = 1 + ((variant >>> 6) % 2);
        const leftBranchY = topY + 2 + ((variant >>> 8) & 1);
        const rightBranchY = topY + 1 + ((variant >>> 9) & 1);
        for (let b = 1; b <= leftReach; b++) {
          setBlock(trunkX - b, leftBranchY - (b > 1 ? 1 : 0), trunkTile, 3);
        }
        for (let b = 1; b <= rightReach; b++) {
          setBlock(trunkX + b, rightBranchY - (b > 1 ? 1 : 0), trunkTile, 3);
        }

        // Overlapping asymmetrical canopy domes
        addFoliageLobe(trunkX, topY - 1, canopyRadius + 0.4, 2.3, 0x11, 0.35);
        addFoliageLobe(trunkX - leftReach, leftBranchY - 1, Math.max(2, canopyRadius - 0.5), 1.8, 0x22, 0.45);
        addFoliageLobe(trunkX + rightReach, rightBranchY - 1, Math.max(2, canopyRadius - 0.4), 1.8, 0x33, 0.45);
      } else if (archetype === 1) {
        // Archetype 1: Grand Multi-Tiered Oak with a lower lateral limb & sub-canopy
        for (let ty = 1; ty <= height; ty++) {
          setBlock(0, -ty, trunkTile, 3);
          if (isDark && ty <= Math.floor(height * 0.6)) {
            setBlock(primarySide, -ty, trunkTile, 3);
          }
        }
        const lowBranchY = -Math.max(4, Math.floor(height * 0.52));
        const lowReach = 2 + ((variant >>> 5) % 2);
        for (let b = 1; b <= lowReach; b++) {
          setBlock(primarySide * b, lowBranchY - (b === lowReach ? 1 : 0), trunkTile, 3);
        }
        addFoliageLobe(primarySide * lowReach, lowBranchY - 1, 2.1, 1.5, 0x44, 0.5);

        const midBranchY = -Math.max(5, Math.floor(height * 0.74));
        const midReach = 1 + ((variant >>> 7) % 2);
        for (let b = 1; b <= midReach; b++) {
          setBlock(secondarySide * b, midBranchY, trunkTile, 3);
        }
        addFoliageLobe(secondarySide * (midReach + 0.4), midBranchY - 1, 2.3, 1.7, 0x55, 0.4);

        // Main crown
        addFoliageLobe(0, -height - 1, canopyRadius + 0.5, 2.4, 0x66, 0.38);
        addFoliageLobe(primarySide * 1.2, -height, canopyRadius - 0.3, 1.9, 0x77, 0.38);
      } else if (archetype === 2) {
        // Archetype 2: Picturesque Wind-Curved Oak
        const curveDir: -1 | 1 = leanDir !== 0 ? leanDir : primarySide;
        let cx = 0;
        const step1 = Math.max(3, Math.floor(height * 0.38));
        const step2 = Math.max(5, Math.floor(height * 0.72));
        for (let ty = 1; ty <= height; ty++) {
          if (ty === step1 || (ty === step2 && height >= 8)) {
            setBlock(cx, -ty, trunkTile, 3);
            cx += curveDir;
          }
          setBlock(cx, -ty, trunkTile, 3);
        }
        // Counter-branch reaching back
        const backY = -step2 + 1;
        setBlock(cx - curveDir, backY, trunkTile, 3);
        setBlock(cx - curveDir * 2, backY - 1, trunkTile, 3);
        // Forward sweeping bough
        setBlock(cx + curveDir, -height + 1, trunkTile, 3);
        setBlock(cx + curveDir * 2, -height, trunkTile, 3);

        addFoliageLobe(cx + curveDir * 0.8, -height - 1, canopyRadius + 0.5, 2.2, 0x88, 0.45);
        addFoliageLobe(cx - curveDir * 1.8, backY - 1, Math.max(2, canopyRadius - 0.5), 1.6, 0x99, 0.45);
        addFoliageLobe(cx + curveDir * 2.2, -height + 0.5, Math.max(2, canopyRadius - 0.4), 1.7, 0xaa, 0.5);
      } else if (archetype === 3) {
        // Archetype 3: Twin-Forked Crown Oak (Y-shaped trunk splitting into two distinct crowns)
        const forkY = Math.max(3, Math.floor(height * 0.46));
        for (let ty = 1; ty <= forkY; ty++) {
          setBlock(0, -ty, trunkTile, 3);
        }
        let leftX = 0;
        let rightX = 0;
        const leftTop = height - ((variant >>> 3) & 1);
        const rightTop = height - (((variant >>> 4) & 1) ^ 1);
        for (let ty = forkY + 1; ty <= Math.max(leftTop, rightTop); ty++) {
          if (ty <= leftTop) {
            if (ty === forkY + 1 || (ty === forkY + 3 && leftX > -2)) leftX--;
            setBlock(leftX, -ty, trunkTile, 3);
          }
          if (ty <= rightTop) {
            if (ty === forkY + 1 || (ty === forkY + 3 && rightX < 2)) rightX++;
            setBlock(rightX, -ty, trunkTile, 3);
          }
        }
        const subRadius = Math.max(2, canopyRadius - 0.3);
        addFoliageLobe(leftX - 0.4, -leftTop - 0.6, subRadius, 2.0, 0xbb, 0.42);
        addFoliageLobe(rightX + 0.4, -rightTop - 0.6, subRadius, 2.0, 0xcc, 0.42);
        addFoliageLobe((leftX + rightX) * 0.5, -Math.max(leftTop, rightTop) - 1.2, subRadius - 0.2, 1.8, 0xdd, 0.25);
      } else if (archetype === 4) {
        // Archetype 4: Tall Meadow Dome Oak (3 stacked billowing foliage tiers)
        const tallH = height + 1;
        for (let ty = 1; ty <= tallH; ty++) {
          setBlock(0, -ty, trunkTile, 3);
        }
        setBlock(-1, -tallH + 3, trunkTile, 3);
        setBlock(1, -tallH + 2, trunkTile, 3);
        addFoliageLobe(0, -tallH + 1.5, canopyRadius + 0.6, 1.7, 0xee, 0.48);
        addFoliageLobe(primarySide * 0.5, -tallH - 0.5, canopyRadius, 2.0, 0xff, 0.3);
        addFoliageLobe(0, -tallH - 2.2, Math.max(1.8, canopyRadius - 1.0), 1.5, 0x1a, 0.15);
      } else {
        // Archetype 5: Ancient Gnarled Umbrella Oak
        for (let ty = 1; ty <= height; ty++) {
          setBlock(0, -ty, trunkTile, 3);
          if (ty <= Math.floor(height * 0.45)) {
            setBlock(primarySide, -ty, trunkTile, 3);
          }
        }
        for (const side of [-1, 1] as const) {
          const bY = -height + (side === primarySide ? 1 : 2);
          setBlock(side, bY, trunkTile, 3);
          setBlock(side * 2, bY, trunkTile, 3);
          setBlock(side * 3, bY - 1, trunkTile, 3);
          addFoliageLobe(side * 2.5, bY - 1.2, Math.max(2.2, canopyRadius - 0.2), 1.8, side === -1 ? 0x2b : 0x3c, 0.52);
        }
        addFoliageLobe(0, -height - 1.3, canopyRadius + 0.8, 2.2, 0x4d, 0.4);
      }
    } else if (type === 'birch') {
      // Graceful white-barked birch trees: slender, airy, layered oval/spire crowns
      const birchMode = variant % 3;
      addRootFlares(0.35, 0.35, false);
      if (birchMode === 0) {
        // Slender Spire Birch with alternating airy leaf tiers
        for (let ty = 1; ty <= height; ty++) {
          setBlock(0, -ty, trunkTile, 3);
        }
        setBlock(primarySide, -height + 3, trunkTile, 3);
        setBlock(secondarySide, -height + 2, trunkTile, 3);
        addFoliageLobe(0, -height + 1.5, canopyRadius, 1.8, 0x51, 0.35);
        addFoliageLobe(primarySide * 0.4, -height - 0.5, Math.max(1.8, canopyRadius - 0.4), 2.0, 0x52, 0.25);
        addFoliageLobe(0, -height - 2.3, Math.max(1.2, canopyRadius - 1.2), 1.5, 0x53, 0.1);
        setBlock(0, -height - 3, leafTile, 2);
      } else if (birchMode === 1) {
        // Gently Leaning Silver Birch
        const dir: -1 | 1 = leanDir !== 0 ? leanDir : primarySide;
        let cx = 0;
        const bendY = Math.floor(height * 0.52);
        for (let ty = 1; ty <= height; ty++) {
          if (ty === bendY) {
            setBlock(cx, -ty, trunkTile, 3);
            cx += dir;
          }
          setBlock(cx, -ty, trunkTile, 3);
        }
        setBlock(cx - dir, -bendY - 1, trunkTile, 3);
        addFoliageLobe(cx - dir * 0.8, -bendY - 1.5, 1.9, 1.5, 0x54, 0.35);
        addFoliageLobe(cx, -height - 0.5, canopyRadius, 2.3, 0x55, 0.35);
        setBlock(cx, -height - 3, leafTile, 2);
      } else {
        // Twin-Stemmed Birch Cluster
        const partnerDir: -1 | 1 = primarySide;
        const partnerHeight = Math.max(5, height - 2);
        for (let ty = 1; ty <= height; ty++) {
          setBlock(0, -ty, trunkTile, 3);
        }
        let px = partnerDir;
        for (let ty = 1; ty <= partnerHeight; ty++) {
          if (ty === Math.floor(partnerHeight * 0.45)) px = partnerDir * 2;
          setBlock(px, -ty, trunkTile, 3);
        }
        addFoliageLobe(-partnerDir * 0.3, -height - 0.5, Math.max(2, canopyRadius - 0.4), 2.2, 0x56, 0.3);
        addFoliageLobe(px + partnerDir * 0.3, -partnerHeight - 0.4, Math.max(1.8, canopyRadius - 0.6), 1.9, 0x57, 0.35);
      }
    } else if (type === 'redwood') {
      // Tiered Conifer / Spruce / Redwood with distinct evergreen branch whorls & spire top
      addRootFlares(0.85, 0.85, true);
      for (let ty = 1; ty <= height; ty++) {
        setBlock(0, -ty, trunkTile, 3);
      }
      const crownStart = Math.max(4, Math.floor(height * 0.32));
      const crownSpan = height - crownStart + 3;
      const maxWhorlRadius = Math.min(6, canopyRadius + 1);

      for (let step = 0; step <= crownSpan; step++) {
        const dy = -(crownStart + step);
        const progress = step / Math.max(1, crownSpan);
        // Sawtooth whorl wave creates stepped pine/redwood branch tiers
        const tierWave = (step % 3 === 0) ? 1.0 : (step % 3 === 1) ? 0.72 : 0.48;
        const rawRadius = (1 - progress * 0.82) * maxWhorlRadius * tierWave;
        const rowRadius = step >= crownSpan - 1 ? 0 : Math.max(1, Math.round(rawRadius));

        // Internal wooden branch stubs on wide whorl rows
        if (step % 3 === 0 && rowRadius >= 3 && dy > -height) {
          setBlock(-1, dy, trunkTile, 3);
          setBlock(1, dy, trunkTile, 3);
          if (rowRadius >= 5) {
            setBlock(-2, dy, trunkTile, 3);
            setBlock(2, dy, trunkTile, 3);
          }
        }

        for (let dx = -rowRadius; dx <= rowRadius; dx++) {
          // Slight asymmetry on outer tips
          if (Math.abs(dx) === rowRadius && rowRadius >= 3 && cellRand(dx, dy, 0x61) < 0.22) {
            continue;
          }
          setBlock(dx, dy, leafTile, 2);
          // Drooping snow/pine needle tips at the outer edge of each whorl tier
          if (step % 3 === 0 && Math.abs(dx) === rowRadius && rowRadius >= 2 && cellRand(dx, dy, 0x62) < 0.55) {
            setBlock(dx, dy + 1, leafTile, 2);
          }
        }
      }
      // Tall pointed conifer spire tip
      setBlock(0, -height - 2, leafTile, 2);
      setBlock(0, -height - 3, leafTile, 2);
    } else if (type === 'cherry') {
      // Picturesque Japanese Sakura / Cherry Blossom with curving dark boughs & hanging blossom clouds
      addRootFlares(0.75, 0.75, false);
      const curveDir: -1 | 1 = leanDir !== 0 ? leanDir : primarySide;
      let cx = 0;
      const bend1 = Math.max(2, Math.floor(height * 0.4));
      for (let ty = 1; ty <= height; ty++) {
        if (ty === bend1) {
          setBlock(cx, -ty, trunkTile, 3);
          cx += curveDir;
        }
        setBlock(cx, -ty, trunkTile, 3);
      }
      // Wide sweeping sakura limbs on both sides
      const leftSpan = 2 + ((variant >>> 4) % 2);
      const rightSpan = 2 + ((variant >>> 6) % 2);
      const limbY = -height + 2;
      for (let b = 1; b <= leftSpan; b++) {
        setBlock(cx - b, limbY - (b >= 2 ? 1 : 0), trunkTile, 3);
      }
      for (let b = 1; b <= rightSpan; b++) {
        setBlock(cx + b, limbY - (b >= 2 ? 1 : 0), trunkTile, 3);
      }

      // Billowing layered blossom clouds with rich hanging petal tendrils
      addFoliageLobe(cx, -height - 1, canopyRadius + 0.8, 2.0, 0x71, 0.65);
      addFoliageLobe(cx - leftSpan - 0.3, limbY - 1, Math.max(2.2, canopyRadius - 0.2), 1.6, 0x72, 0.75);
      addFoliageLobe(cx + rightSpan + 0.3, limbY - 1, Math.max(2.2, canopyRadius - 0.2), 1.6, 0x73, 0.75);
    } else if (type === 'acacia') {
      // Iconic Diagonal Savanna Acacia with 2–3 flat-topped parasol canopy shelves
      addRootFlares(0.5, 0.5, false);
      const dir: -1 | 1 = leanDir !== 0 ? leanDir : primarySide;
      let cx = 0;
      for (let ty = 1; ty <= height; ty++) {
        if (ty > 2 && ty % 2 === 1 && Math.abs(cx) < 3) {
          setBlock(cx, -ty, trunkTile, 3);
          cx += dir;
        }
        setBlock(cx, -ty, trunkTile, 3);
      }
      // Secondary fork going opposite way
      const forkStart = Math.max(3, Math.floor(height * 0.55));
      let fx = cx - dir;
      const forkTop = height - 2;
      for (let ty = forkStart; ty <= forkTop; ty++) {
        if (ty > forkStart && ty % 2 === 0) fx -= dir;
        setBlock(fx, -ty, trunkTile, 3);
      }

      const addParasolPad = (padX: number, padY: number, padRadius: number, salt: number) => {
        for (let dx = -padRadius; dx <= padRadius; dx++) {
          if (Math.abs(dx) === padRadius && cellRand(dx, padY, salt) < 0.25) continue;
          setBlock(padX + dx, padY, leafTile, 2);
        }
        const topRadius = Math.max(1, padRadius - 1);
        for (let dx = -topRadius; dx <= topRadius; dx++) {
          setBlock(padX + dx, padY - 1, leafTile, 2);
        }
      };

      addParasolPad(cx + dir, -height, canopyRadius + 1, 0x81);
      addParasolPad(fx - dir, -forkTop, Math.max(2, canopyRadius), 0x82);
    } else if (type === 'palm') {
      // Gracefully Curved Oasis/Tropical Palm with arching, drooping palm fronds
      const dir: -1 | 1 = leanDir !== 0 ? leanDir : primarySide;
      let cx = 0;
      for (let ty = 1; ty <= height; ty++) {
        const progress = ty / height;
        const targetX = Math.round(Math.pow(progress, 1.45) * 2) * dir;
        if (targetX !== cx) {
          setBlock(cx, -ty, trunkTile, 3);
          cx = targetX;
        }
        setBlock(cx, -ty, trunkTile, 3);
      }
      const crownY = -height;
      const frondReach = Math.max(3, canopyRadius + 1);
      // Center crown tuft
      setBlock(cx, crownY - 1, leafTile, 2);
      setBlock(cx, crownY - 2, leafTile, 2);
      setBlock(cx - 1, crownY - 1, leafTile, 2);
      setBlock(cx + 1, crownY - 1, leafTile, 2);

      // Left & right arching fronds (lower arch + upper arch)
      for (const side of [-1, 1] as const) {
        for (let r = 1; r <= frondReach; r++) {
          const drop = r <= 2 ? 0 : r === 3 ? 1 : 2;
          setBlock(cx + side * r, crownY + drop - 1, leafTile, 2);
          if (r <= frondReach - 1) {
            const upperRise = r === 1 ? -2 : r === 2 ? -2 : -1;
            setBlock(cx + side * r, crownY + upperRise, leafTile, 2);
          }
        }
      }
    } else if (type === 'jungle' || type === 'ancient' || type === 'mangrove') {
      // Towering Jungle / Ancient / Mangrove trees with buttress/prop roots, side bough platforms & hanging vines
      const isMangrove = type === 'mangrove';
      const isAncient = type === 'ancient';

      if (isMangrove) {
        // Arched mangrove prop roots reaching out into swamp mud/water
        for (const side of [-1, 1] as const) {
          setBlock(side, -2, trunkTile, 3);
          setBlock(side, -1, trunkTile, 3);
          setBlock(side * 2, -1, trunkTile, 3);
          setBlock(side * 2, 0, trunkTile, 3);
        }
      } else {
        addRootFlares(0.92, 0.92, true);
      }

      for (let ty = 1; ty <= height; ty++) {
        setBlock(0, -ty, trunkTile, 3);
        if (isAncient && ty <= Math.floor(height * 0.7)) {
          setBlock(primarySide, -ty, trunkTile, 3);
        }
      }

      // Staggered horizontal boughs with sub-canopies along the tall trunk
      const boughCount = isAncient ? 3 : height >= 12 ? 2 : 1;
      for (let bIdx = 0; bIdx < boughCount; bIdx++) {
        const bSide: -1 | 1 = bIdx % 2 === 0 ? primarySide : secondarySide;
        const frac = 0.45 + bIdx * 0.2;
        const bY = -Math.max(4, Math.floor(height * frac));
        const reach = (isAncient ? 3 : 2) + ((variant >>> (bIdx * 2)) & 1);
        for (let r = 1; r <= reach; r++) {
          setBlock(bSide * r, bY - (r === reach ? 1 : 0), trunkTile, 3);
        }
        addFoliageLobe(bSide * (reach + 0.5), bY - 1, isAncient ? 2.8 : 2.2, 1.5, 0x90 + bIdx, 0.45);
      }

      // Main emergent upper canopy
      for (const side of [-1, 1] as const) {
        setBlock(side, -height + 1, trunkTile, 3);
        setBlock(side * 2, -height, trunkTile, 3);
      }
      addFoliageLobe(0, -height - 1, canopyRadius + 0.8, 2.2, 0x9a, 0.45);
      addFoliageLobe(-2, -height, Math.max(2, canopyRadius - 0.5), 1.7, 0x9b, 0.5);
      addFoliageLobe(2, -height, Math.max(2, canopyRadius - 0.5), 1.7, 0x9c, 0.5);

      // Hanging vines along outer canopy blocks
      const currentBlocks = Array.from(map.values());
      for (const b of currentBlocks) {
        if (b.tile === leafTile && Math.abs(b.dx) >= 2 && cellRand(b.dx, b.dy, 0x9d) < 0.34) {
          const vineLen = 2 + Math.floor(cellRand(b.dx, b.dy, 0x9e) * (isMangrove ? 5 : 4));
          for (let v = 1; v <= vineLen; v++) {
            if (b.dy + v >= -1) break;
            setBlock(b.dx, b.dy + v, TileType.VINE, 1);
          }
        }
      }
    } else if (type === 'mushroom') {
      // Giant Bioluminescent Mushroom: flat toadstool, tall bell cap, or curved fairy cap
      const mushStyle = variant % 3;
      let cx = 0;
      for (let ty = 1; ty <= height; ty++) {
        if (mushStyle === 2 && ty === Math.floor(height * 0.6)) {
          setBlock(cx, -ty, trunkTile, 3);
          cx += primarySide;
        }
        setBlock(cx, -ty, trunkTile, 3);
      }
      const capY = -height;
      if (mushStyle === 0) {
        // Wide flat umbrella cap with drooping rim
        for (let dx = -canopyRadius - 1; dx <= canopyRadius + 1; dx++) {
          setBlock(cx + dx, capY, leafTile, 2);
          if (Math.abs(dx) <= canopyRadius) {
            setBlock(cx + dx, capY - 1, leafTile, 2);
          }
          if (Math.abs(dx) === canopyRadius + 1) {
            setBlock(cx + dx, capY + 1, leafTile, 2);
          }
        }
      } else {
        // Domed bell cap
        addFoliageLobe(cx, capY - 0.5, canopyRadius + 0.3, 2.1, 0xa1, 0.3);
      }
    } else {
      // Fallback organic tree
      for (let ty = 1; ty <= height; ty++) {
        setBlock(0, -ty, trunkTile, 3);
      }
      addFoliageLobe(0, -height - 0.5, canopyRadius + 0.4, 2.1, 0xb1, 0.35);
    }

    return Array.from(map.values());
  }

  public getSkyTile(x: number, y: number): TileType {
    // Sky islands appear when climbing high into the sky (around 70+ blocks high: y <= 2 down to y = -170)
    if (y > 2 || y < -170) return TileType.AIR;

    const sectorWidth = 56;
    const baseSectorX = Math.floor(x / sectorWidth);

    let foliageTile: TileType = TileType.AIR;

    for (let sOffset = -1; sOffset <= 1; sOffset++) {
      const sX = baseSectorX + sOffset;
      for (let layer = 0; layer <= 2; layer++) {
        // Deterministic hash for island generation in this sector and layer
        let h = (Math.imul(sX ^ (this.seed + layer * 7919), 0x9e3779b1) ^ Math.imul(layer + 17, 0x85ebca6b)) >>> 0;
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        h = (h ^ (h >>> 16)) >>> 0;

        // Density of sky islands: ~80% layer 0 (low/first), ~72% layer 1 (mid), ~65% layer 2 (high)
        const chance = layer === 0 ? 80 : layer === 1 ? 72 : 65;
        if ((h % 100) >= chance) continue;

        const offsetX = 10 + ((h >>> 8) % 36);
        const centerX = sX * sectorWidth + offsetX;

        let baseY = -12;
        if (layer === 1) baseY = -52;
        else if (layer === 2) baseY = -96;

        const yJitter = ((h >>> 15) % 15) - 7;
        const centerY = baseY + yJitter;

        const radiusX = 14 + ((h >>> 20) % 16); // 14 to 29 blocks wide in each direction
        const depth = 8 + ((h >>> 25) % 8);     // 8 to 15 blocks deep

        const dxNorm = Math.abs(x - centerX) / radiusX;
        if (dxNorm >= 1.0) continue;

        const topCurve = 1.0 - dxNorm * dxNorm;
        const islandTopY = centerY - Math.round(topCurve * 2.6 + Math.sin(x * 0.4 + centerX) * 1.0);
        const islandBottomY = centerY + Math.round(depth * Math.pow(topCurve, 0.65) + Math.cos(x * 0.5 + centerX) * 1.2);

        // Solid mass check
        if (y >= islandTopY && y <= islandBottomY) {
          if (y === islandTopY) {
            return TileType.SKY_GRASS;
          }
          if (y <= islandTopY + 2) {
            return TileType.SKY_DIRT;
          }
          // Inside Sky Stone core: check for astral and celestial ores
          const nAstral = this.oreNoise.noise2D(x * 0.21 + 511, y * 0.21 - 219);
          if (nAstral > 0.58) {
            return TileType.ASTRAL_ORE;
          }
          const nCelestial = this.oreNoise.noise2D(x * 0.25 - 773, y * 0.25 + 409);
          if (nCelestial > 0.66) {
            return TileType.CELESTIAL_ORE;
          }
          return TileType.SKY_STONE;
        }

        // Hanging sky vines under the island
        if (y > islandBottomY) {
          const vineHash = (Math.imul(x ^ 0x5a1f, centerX ^ 0x9e37) >>> 0);
          if (vineHash % 100 < 35) {
            const maxLen = 2 + (vineHash % 4);
            if (y <= islandBottomY + maxLen) {
              foliageTile = TileType.SKY_VINE;
            }
          }
        }

        // Above the island top surface: plants and trees
        if (y < islandTopY) {
          const hasTree = ((h >>> 4) % 100) < 80;
          const treeOffset = (((h >>> 12) % 9) - 4);
          const treeX = centerX + treeOffset;

          if (hasTree && Math.abs(x - treeX) <= 4) {
            const dxTree = Math.abs(treeX - centerX) / radiusX;
            const treeBaseY = centerY - Math.round((1.0 - dxTree * dxTree) * 2.6 + Math.sin(treeX * 0.4 + centerX) * 1.0);
            const treeHeight = 6;
            const crownCenterY = treeBaseY - treeHeight;

            // Celestial tree trunk
            if (x === treeX && y < treeBaseY && y >= treeBaseY - treeHeight) {
              return TileType.CELESTIAL_WOOD;
            }

            // Celestial canopy
            const cdx = x - treeX;
            const cdy = y - crownCenterY;
            if (cdx * cdx + cdy * cdy <= 3.3 * 3.3) {
              foliageTile = TileType.CELESTIAL_LEAVES;
            } else if (Math.abs(cdx) >= 2 && cdy === 1) {
              foliageTile = TileType.SKY_VINE;
            }
          }

          // Star Flowers on sky grass
          if (y === islandTopY - 1) {
            const plantHash = (Math.imul(x ^ 0x7b23, centerX ^ 0x45d9) >>> 0);
            if (plantHash % 100 < 25 && (!hasTree || Math.abs(x - treeX) > 1)) {
              foliageTile = TileType.STAR_FLOWER;
            }
          }
        }
      }
    }

    return foliageTile;
  }

  // Fast single-block tile determination using precomputed column surfaceY and dirtDepth
  public getBaseTileFast(x: number, y: number, sY: number, dirtDepth: number, biome: BiomeDefinition = this.getColumnBiome(x)): TileType {
    if (y >= BEDROCK_Y || y - sY >= 3000) return TileType.BEDROCK;
    const waterfall = this.getWaterfallAt(x);
    if (waterfall && y >= waterfall.topY && y <= waterfall.bottomY) return TileType.WATER;
    const river = this.getRiverAt(x);
    if (river && y >= river.surfaceY && y <= river.surfaceY + river.depth) {
      return y === river.surfaceY + river.depth ? TileType.SAND : TileType.WATER;
    }
    // A cave mouth is part of the generated terrain, including the surface cap.
    if (this.isEntranceAt(x, y, sY)) return TileType.AIR;
    if (this.isUndergroundLakeWaterAt(x, y, sY)) return TileType.WATER;
    if (y < sY) {
      const lavaPool = (biome.id === 'VOLCANIC' || biome.id === 'VOLCANIC_MOUNTAINS' || biome.id === 'LAVA_FIELDS') &&
        y === sY - 1 && this.terrainNoise.noise1D(x * .075 + 1801) > .63;
      if (lavaPool) return TileType.MAGMA;
      const oceanWater = biome.waterLevel !== undefined && y >= biome.waterLevel;
      const mildLake = biome.id !== 'DESERT' && biome.id !== 'SAVANNA' && biome.id !== 'BADLANDS' && biome.id !== 'SALT_FLATS' &&
        sY > SURFACE_BASE_Y + 5 && y >= SURFACE_BASE_Y + 3 && Math.abs(this.terrainNoise.noise1D(x * 0.014 + 209)) > 0.78;
      const oasisPool = biome.id === 'OASIS_DESERT' && y >= SURFACE_BASE_Y - 2 && this.terrainNoise.noise1D(x * 0.09 + 909) > 0.05;
      if (oceanWater || mildLake || oasisPool) return TileType.WATER;
      const skyTile = this.getSkyTile(x, y);
      if (skyTile !== TileType.AIR) return skyTile;
      return TileType.AIR;
    }
    if (y === sY) {
      if ((biome.category === 'VOLCANIC' && Math.abs(this.terrainNoise.noise1D(x * .075 + 1801)) > .73)) return TileType.OBSIDIAN;
      return (biome.terrainStyle === 'mountain' && sY < SURFACE_BASE_Y - 10) ? TileType.STONE : biome.surfaceBlock;
    }

    if (y < sY + dirtDepth) {
      const base = this.isCave(x, y, sY) ? this.getCaveWaterTile(x, y, sY) : biome.undergroundBlock;
      return this.applyOreToSolid(x, y, sY, base);
    }

    if (y < sY + dirtDepth + 3) {
      if (this.isCave(x, y, sY)) return this.applyOreToSolid(x, y, sY, this.getCaveWaterTile(x, y, sY));
      const blend = this.terrainNoise.noise2D(x * 0.2, y * 0.2);
      return this.applyOreToSolid(x, y, sY, blend > 0.0 ? biome.undergroundBlock : biome.deepBlock);
    }

    const base = this.isCave(x, y, sY) ? this.getCaveWaterTile(x, y, sY) : biome.deepBlock;
    return this.applyOreToSolid(x, y, sY, base);
  }

  // Fallback single-block getter for physics query
  public getBaseTile(x: number, y: number): TileType {
    if (y >= BEDROCK_Y) return TileType.BEDROCK;
    const sY = this.getSurfaceHeight(x);
    if (y - sY >= 3000) return TileType.BEDROCK;
    if (y < sY) {
      const skyTile = this.getSkyTile(x, y);
      if (skyTile !== TileType.AIR) return skyTile;
      return TileType.AIR;
    }
    if (y === sY) return this.getBaseTileFast(x, y, sY, 0, this.getColumnBiome(x));
    const dirtDepth = this.getDirtDepth(x);
    return this.getBaseTileFast(x, y, sY, dirtDepth);
  }

  // Seeded cave mask: domain-warped passages, branching seams, and sparse chambers.
  public isCave(x: number, y: number, surfaceY: number): boolean {
    if (this.isEntranceAt(x, y, surfaceY)) return true;
    if (y <= surfaceY + 7 || y >= surfaceY + 2997 || y >= BEDROCK_Y - 3) {
      return false;
    }

    const lake = this.getLakeColumn(x, surfaceY);
    if (lake && Math.abs(x - (lake.centerX + lake.outletDirection * (lake.radiusX + 10))) < 13) {
      const along = Math.abs(x - lake.centerX) - lake.radiusX;
      const outletY = lake.centerY + this.entranceNoise.noise1D(x * 0.12 + lake.centerX) * 1.5;
      if (along >= -2 && along <= 23 && Math.abs(y - outletY) <= 1) return true;
    }

    // Low-frequency warping makes tunnels meander and merge instead of repeating circles.
    const warpX = this.caveNoise2.noise2D(x * 0.009, y * 0.013) * 8;
    const warpY = this.caveNoise1.noise2D(x * 0.011 + 37, y * 0.016 - 19) * 5;
    const wx = x + warpX;
    const wy = y + warpY;
    const n1 = this.caveNoise1.fbm2D(wx * 0.027, wy * 0.034, 2, 0.5, 2.0);
    const n2 = this.caveNoise2.fbm2D((wx + 50) * 0.031, (wy + 50) * 0.039, 2, 0.5, 2.0);
    // A second, weaker ridge opens occasional side branches off the main corridors.
    const branch = Math.abs(this.caveNoise2.noise2D(wx * 0.018 + 119, wy * 0.023 - 43)) < 0.037 &&
      this.caveNoise1.noise2D(wx * 0.025 - 71, wy * 0.031 + 17) > -0.08;
    if ((Math.abs(n1) < 0.068 && Math.abs(n2) < 0.15) || branch) return true;

    // Broad, irregular chambers are intentionally sparse and mostly deeper down.
    if (y - surfaceY > 48) {
      const chamber = this.caveNoise1.noise2D(wx * 0.012 + 203, wy * 0.016 + 61);
      const breakup = this.caveNoise2.noise2D(wx * 0.034 - 89, wy * 0.041 + 131);
      if (chamber > 0.58 && breakup > -0.16) return true;
    }

    return false;
  }

  private getCaveWaterTile(x: number, y: number, surfaceY: number): TileType {
    // Still water is a seeded cave-table band; no fluid simulation or frame updates.
    const waterTable = surfaceY + 54 + this.terrainNoise.noise1D(x * 0.013 + 411) * 5;
    return y >= waterTable && Math.abs(this.caveNoise2.noise2D(x * .035, y * .04)) > .22 ? TileType.WATER : TileType.AIR;
  }

  public getSurfaceFoliage(x: number): TileType {
    const biome = this.getColumnBiome(x);
    const roll = Math.abs(this.treeNoise.noise1D(x * 1.1 + 77));
    if (biome.treeType === 'acacia' && roll > .9) return TileType.DRY_GRASS;
    if (biome.id === 'OASIS_DESERT') return roll > .985 ? TileType.CACTUS : roll > .93 ? TileType.OASIS_GRASS : TileType.AIR;
    if (biome.id === 'DESERT') return roll > 0.985 ? TileType.CACTUS : TileType.AIR;
    if (biome.id === 'SAVANNA') return roll > .94 ? TileType.CACTUS : roll > .84 ? TileType.DRY_GRASS : TileType.AIR;
    if (biome.id === 'BAMBOO_FOREST') return roll > .65 ? TileType.BAMBOO : TileType.AIR;
    if (biome.id === 'CORAL_COAST' || biome.id === 'TROPICAL_ISLAND' || biome.id === 'DEEP_OCEAN') return roll > .9 ? TileType.CORAL : TileType.AIR;
    if (biome.id === 'ENCHANTED_FOREST' || biome.id === 'CRYSTAL_FOREST') return roll > .83 ? TileType.GLOWING_CRYSTAL : TileType.AIR;
    if (biome.id === 'VOLCANIC' || biome.id === 'VOLCANIC_MOUNTAINS' || biome.id === 'LAVA_FIELDS') return roll > .985 ? TileType.MAGMA : TileType.AIR;
    if (biome.id === 'ASHLANDS' && roll > .91) return TileType.BASALT;
    if (biome.underground && roll > .72) return biome.id === 'MUSHROOM_CAVERNS' ? TileType.GLOWING_MUSHROOM : TileType.GLOWING_CRYSTAL;
    if (biome.id === 'GIANT_MUSHROOM_FIELDS' || biome.id === 'MUSHROOM_FOREST') return roll > .65 ? TileType.GLOWING_MUSHROOM : TileType.AIR;
    const bushRoll = Math.abs(this.treeNoise.noise1D(x * 0.73 + 487));
    if (bushRoll > 0.63) return TileType.BERRY_BUSH;
    if (roll > 1 - biome.vegetationDensity * 0.5) {
      return biome.treeType === 'cherry' ? TileType.FLOWER : TileType.FLOWER;
    } else if (roll > 1 - biome.vegetationDensity) {
      return TileType.TALL_GRASS;
    }
    return TileType.AIR;
  }

  // Sparse seeded cave accents are sampled only while a chunk is being generated.
  public getCaveDecorationAt(x: number, y: number): TileType {
    if (y <= SURFACE_BASE_Y + 28 || y >= BEDROCK_Y - 3) return TileType.AIR;
    const biome = this.getBiomeAt(x, y);
    if (!biome.underground) return TileType.AIR;
    const roll = Math.abs(this.treeNoise.noise2D(x * 0.17, y * 0.19));
    if (roll < 0.91) return TileType.AIR;
    if (biome.id === 'MUSHROOM_CAVERNS') return TileType.GLOWING_MUSHROOM;
    if (biome.id === 'UNDERGROUND_JUNGLE') return roll > .98 ? TileType.VINE : TileType.BAMBOO;
    if (biome.id === 'ICE_CAVERNS') return roll > .97 ? TileType.ICE : TileType.PACKED_ICE;
    return TileType.GLOWING_CRYSTAL;
  }
}
