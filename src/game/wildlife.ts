import { BIOME_RARITY, BiomeType } from './biomes';
import { CHUNK_HEIGHT, CHUNK_WIDTH, TILE_DEFS, TILE_SIZE } from './constants';
import { ChunkManager } from './chunkManager';
import { Camera, Chunk, Player, TileType } from './types';
import { ItemType } from './blocks';
import { ItemDropManager } from './itemDrop';
import { EnemyManager } from './enemy';
import { sound } from './audio';

// TEMPORARY combat lifecycle diagnostics. Remove after reproducing the respawn issue.
const debugCombat = (event: string, data: Record<string, unknown>) =>
  console.info('[combat-debug][wildlife]', event, data);

export type WildlifeSpecies = 'deer' | 'rabbit' | 'boar' | 'fox' | 'bird' | 'fish' | 'wolf' | 'bear' | 'lion' | 'crocodile' | 'mammoth';
export type WildlifeState = 'idle' | 'wander' | 'chase' | 'attack';

export interface WildlifeAnimal {
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
  attackCooldown?: number;
  isEnraged?: boolean;
  enragedTimer?: number;
  attackAnimTimer?: number;
  targetPlayerId?: string;
  targetX?: number;
  targetY?: number;
}

// Increased population for a lively, creature-filled world while maintaining 60 FPS
const MAX_ACTIVE_WILDLIFE = 135;
const MAX_DORMANT_WILDLIFE = 450;
const MAX_PER_SPECIES: Record<WildlifeSpecies, number> = {
  rabbit: 28, bird: 28, deer: 18, fish: 22, boar: 16, fox: 16,
  wolf: 22, crocodile: 18, lion: 18, bear: 16, mammoth: 12,
};
export const SPECIES_HEALTH: Record<WildlifeSpecies, number> = {
  deer: 25, rabbit: 12, boar: 42, fox: 20, bird: 10, fish: 10,
  wolf: 60, crocodile: 85, lion: 105, bear: 150, mammoth: 320,
};
export const SPECIES_MEAT: Record<WildlifeSpecies, ItemType> = {
  deer: 'venison', rabbit: 'rabbit_meat', boar: 'boar_meat', fox: 'fox_meat', bird: 'bird_meat', fish: 'fish',
  wolf: 'wolf_meat', bear: 'bear_meat', lion: 'lion_meat', crocodile: 'crocodile_meat', mammoth: 'mammoth_meat',
};
export const SPECIES_SKULL_DROP: Partial<Record<WildlifeSpecies, ItemType>> = {
  wolf: 'wolf_skull', bear: 'bear_skull', lion: 'lion_skull', crocodile: 'crocodile_skull', mammoth: 'mammoth_skull',
};
export const SPECIES_DAMAGE: Partial<Record<WildlifeSpecies, number>> = {
  boar: 14, wolf: 16, crocodile: 20, lion: 24, bear: 28, mammoth: 36,
};
export const SPECIES_ATTACK_COOLDOWN: Partial<Record<WildlifeSpecies, number>> = {
  boar: 1.0, wolf: 0.8, crocodile: 0.9, lion: 0.8, bear: 1.0, mammoth: 1.2,
};
export const CARNIVORE_SPECIES = new Set<WildlifeSpecies>(['wolf', 'bear', 'lion', 'crocodile', 'mammoth']);
export const COMBAT_SPECIES = new Set<WildlifeSpecies>(['wolf', 'bear', 'lion', 'crocodile', 'mammoth', 'boar']);

function resetAnimalCombatState(animal: WildlifeAnimal): void {
  animal.state = 'idle';
  animal.stateTimer = 1;
  animal.attackCooldown = 0;
  animal.attackAnimTimer = 0;
  animal.targetPlayerId = undefined;
  animal.targetX = undefined;
  animal.targetY = undefined;
}

export const SPECIES_WEIGHT: Record<WildlifeSpecies, number> = {
  rabbit: 38, bird: 38, deer: 24, fish: 24, fox: 22, boar: 20,
  wolf: 32, crocodile: 26, lion: 20, bear: 24, mammoth: 20,
};
export const SPECIES_SIZE: Record<WildlifeSpecies, [number, number]> = {
  deer: [22, 20], rabbit: [13, 12], boar: [24, 18], fox: [18, 14], bird: [13, 9], fish: [13, 8],
  wolf: [34, 24], crocodile: [56, 18], lion: [42, 30], bear: [48, 36], mammoth: [76, 56],
};
export const SPECIES_SPEED: Record<WildlifeSpecies, number> = {
  deer: 24, rabbit: 34, boar: 26, fox: 29, bird: 32, fish: 22,
  wolf: 42, crocodile: 28, lion: 40, bear: 30, mammoth: 24,
};
export const LAND_HABITATS: Partial<Record<BiomeType, WildlifeSpecies[]>> = {
  PLAINS: ['rabbit', 'bird', 'deer', 'wolf', 'lion'],
  FOREST: ['deer', 'rabbit', 'bird', 'boar', 'fox', 'wolf', 'bear'],
  BIRCH_FOREST: ['deer', 'rabbit', 'bird', 'wolf', 'bear'],
  AUTUMN_FOREST: ['deer', 'fox', 'bird', 'rabbit', 'wolf', 'bear'],
  FLOWER_MEADOW: ['deer', 'rabbit', 'bird', 'lion'],
  SNOWY_PLAINS: ['rabbit', 'fox', 'bird', 'deer', 'wolf', 'bear', 'mammoth'],
  SNOWY_TAIGA: ['rabbit', 'fox', 'deer', 'wolf', 'bear', 'mammoth'],
  TUNDRA: ['rabbit', 'fox', 'deer', 'wolf', 'bear', 'mammoth'],
  REDWOOD_FOREST: ['deer', 'fox', 'bird', 'boar', 'bear', 'wolf'],
  JUNGLE: ['boar', 'bird', 'rabbit', 'crocodile'],
  RAINFOREST: ['boar', 'bird', 'crocodile'],
  SWAMP: ['boar', 'bird', 'rabbit', 'crocodile'],
  MANGROVE_SWAMP: ['boar', 'bird', 'crocodile'],
  DARK_FOREST: ['deer', 'boar', 'bird', 'fox', 'wolf', 'bear'],
  CHERRY_BLOSSOM_FOREST: ['deer', 'bird', 'rabbit', 'wolf'],
  ENCHANTED_FOREST: ['deer', 'bird', 'rabbit', 'fox', 'wolf', 'bear'],
  ANCIENT_FOREST: ['deer', 'boar', 'bird', 'fox', 'bear', 'wolf', 'mammoth'],
  MISTY_FOREST: ['deer', 'fox', 'bird', 'boar', 'bear', 'wolf'],
  BAMBOO_FOREST: ['boar', 'bird', 'rabbit'],
  BEACH: ['bird', 'rabbit', 'crocodile'],
  TROPICAL_ISLAND: ['bird', 'rabbit', 'crocodile'],
  CORAL_COAST: ['bird', 'crocodile'],
  DESERT: ['rabbit', 'fox', 'lion'],
  SAVANNA: ['deer', 'rabbit', 'bird', 'boar', 'lion'],
  BADLANDS: ['fox', 'rabbit', 'lion', 'wolf'],
  MOUNTAINS: ['deer', 'fox', 'bird', 'rabbit', 'wolf', 'bear', 'mammoth'],
};
export const AQUATIC_BIOMES = new Set<BiomeType>(['OCEAN', 'DEEP_OCEAN', 'FROZEN_OCEAN', 'CORAL_COAST', 'TROPICAL_ISLAND']);

export function hash32(seed: number, cx: number, cy: number, slot: number, salt: number): number {
  let h = Math.imul(seed ^ salt, 0x45d9f3b);
  h = Math.imul(h ^ Math.imul(cx + 0x9e37, 0x27d4eb2d), 0x165667b1);
  h = Math.imul(h ^ Math.imul(cy + 0x85eb, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ Math.imul(slot + 0xc2b2, 0x27d4eb2d), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

export class WildlifeManager {
  public animals: WildlifeAnimal[] = [];
  public isMultiplayer = false;
  private dormant = new Map<string, WildlifeAnimal>();
  private killedAnimalIds = new Set<string>();
  private syncTimer = 0.5;
  private currentSeed: number | null = null;
  private testAnimalSerial = 0;

  /** Cancels only combat state belonging to the dead player's encounter. */
  public clearCombatState(playerId?: string): void {
    for (const animal of [...this.animals, ...this.dormant.values()]) {
      const isTargetedPlayer = playerId
        ? animal.targetPlayerId === playerId
        : animal.state === 'chase' || animal.state === 'attack' || animal.isEnraged;
      if (!isTargetedPlayer) continue;
      debugCombat('wildlife.cleanup', { playerId: playerId ?? animal.targetPlayerId ?? null, lifeId: null, animalId: animal.id, health: null, alive: null, reason: playerId ? 'matching-player-target' : 'global-no-id-cleanup', previousTargetPlayerId: animal.targetPlayerId ?? null, previousState: animal.state, attackCooldown: animal.attackCooldown ?? null });
      resetAnimalCombatState(animal);
    }
  }

  /** Adds a temporary wildlife fixture for the opt-in developer test scene. */
  public spawnTestAnimal(species: WildlifeSpecies, x: number, y: number, chunks: ChunkManager): boolean {
    const [width, height] = SPECIES_SIZE[species];
    const tileX = Math.floor((x + width / 2) / TILE_SIZE);
    const tileY = Math.floor((y + height / 2) / TILE_SIZE);
    if (species === 'fish') {
      if (this.loadedTile(chunks, tileX, tileY) !== TileType.WATER) return false;
    } else if (!this.clearAndSupported(chunks, x, y, width, height)) return false;
    const biome = chunks.terrainGen.getColumnBiome(tileX).id;
    const cx = Math.floor(tileX / CHUNK_WIDTH);
    const cy = Math.floor(tileY / CHUNK_HEIGHT);
    const seed = hash32(chunks.seed, cx, cy, this.testAnimalSerial++, 0x54455354) || 1;
    this.animals.push({
      id: `test:${chunks.seed}:${seed}`, species, biome, ownerChunkX: cx, ownerChunkY: cy,
      x, y, width, height, direction: 1, state: 'wander', stateTimer: 2, animTimer: 0,
      randomState: seed, homeX: x, homeY: y, health: SPECIES_HEALTH[species],
      maxHealth: SPECIES_HEALTH[species], hurtTimer: 0,
    });
    return true;
  }

  public spawnAnimal(species: WildlifeSpecies, x: number, y: number, chunks: ChunkManager): boolean {
    const [width, height] = SPECIES_SIZE[species];
    const tileX = Math.floor((x + width / 2) / TILE_SIZE);
    const biome = chunks.terrainGen.getColumnBiome(tileX)?.id || 'plains';
    const cx = Math.floor(tileX / CHUNK_WIDTH);
    const cy = Math.floor(y / (CHUNK_HEIGHT * TILE_SIZE));
    const seed = Math.floor(Math.random() * 1000000);
    this.animals.push({
      id: `creative:${species}:${Date.now()}:${seed}`,
      species,
      biome,
      ownerChunkX: cx,
      ownerChunkY: cy,
      x,
      y,
      width,
      height,
      direction: Math.random() < 0.5 ? -1 : 1,
      state: 'wander',
      stateTimer: 3,
      animTimer: 0,
      randomState: seed,
      homeX: x,
      homeY: y,
      health: SPECIES_HEALTH[species],
      maxHealth: SPECIES_HEALTH[species],
      hurtTimer: 0,
    });
    return true;
  }

  public clear(): void {
    this.animals.length = 0;
    this.dormant.clear();
    this.killedAnimalIds.clear();
    this.syncTimer = 0.5;
    this.currentSeed = null;
  }

  private recordAnimalDeath(id: string): void {
    this.killedAnimalIds.add(id);
    if (this.currentSeed !== null) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const arr = Array.from(this.killedAnimalIds).slice(-600);
          window.localStorage.setItem(`pixel_frontier_killed_${this.currentSeed}`, JSON.stringify(arr));
        }
      } catch {
        // Storage errors safely ignored
      }
    }
  }

  private loadKilledAnimals(seed: number): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(`pixel_frontier_killed_${seed}`);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            for (const id of arr) {
              if (typeof id === 'string') this.killedAnimalIds.add(id);
            }
          }
        }
      }
    } catch {
      // Storage errors safely ignored
    }
  }

  public update(dt: number, player: Player, chunks: ChunkManager, onPlayerDamage?: (damage: number, sourceX: number, sourceY: number) => void): void {
    if (this.currentSeed !== chunks.seed) {
      this.clear();
      this.currentSeed = chunks.seed;
      this.loadKilledAnimals(chunks.seed);
    }

    if (this.isMultiplayer) {
      const step = Math.min(dt, 0.05);
      for (const animal of this.animals) {
        if (animal.hurtTimer > 0) {
          animal.hurtTimer = Math.max(0, animal.hurtTimer - step);
        }
        animal.animTimer += step * (animal.state === 'wander' || animal.state === 'chase' ? 7 : 2);
        if (animal.targetX !== undefined && animal.targetY !== undefined) {
          const dx = animal.targetX - animal.x;
          const dy = animal.targetY - animal.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > 150 * 150) {
            animal.x = animal.targetX;
            animal.y = animal.targetY;
          } else if (distSq > 0.1) {
            const factor = Math.min(1.0, 14 * step);
            animal.x += dx * factor;
            animal.y += dy * factor;
          } else {
            animal.x = animal.targetX;
            animal.y = animal.targetY;
          }
        }
      }
      return;
    }

    this.syncTimer -= dt;
    if (this.syncTimer <= 0) {
      this.syncTimer = 0.45;
      this.syncLoadedChunks(chunks);
    }

    const step = Math.min(dt, 0.05);
    for (const animal of this.animals) this.updateAnimal(animal, step, chunks, player, onPlayerDamage);
  }

  public syncServerAnimals(serverAnimals: Array<{
    id: string;
    species: WildlifeSpecies;
    biome: BiomeType;
    ownerChunkX?: number;
    ownerChunkY?: number;
    x: number;
    y: number;
    direction: -1 | 1;
    state: WildlifeState;
    health: number;
    maxHealth: number;
    targetPlayerId?: string;
  }>): void {
    if (!this.isMultiplayer) return;
    const serverIdSet = new Set<string>();

    for (const sa of serverAnimals) {
      serverIdSet.add(sa.id);
      if (this.killedAnimalIds.has(sa.id)) continue;

      let animal = this.animals.find((a) => a.id === sa.id);
      if (!animal) {
        const [width, height] = SPECIES_SIZE[sa.species] ?? [16, 16];
        const [cx, cy] = sa.id.startsWith('land:') || sa.id.startsWith('fish:')
          ? sa.id.split(':').slice(1, 3).map(Number)
          : [sa.ownerChunkX ?? 0, sa.ownerChunkY ?? 0];
        animal = {
          id: sa.id,
          species: sa.species,
          biome: sa.biome,
          ownerChunkX: cx,
          ownerChunkY: cy,
          x: sa.x,
          y: sa.y,
          targetX: sa.x,
          targetY: sa.y,
          width,
          height,
          direction: sa.direction,
          state: sa.state,
          targetPlayerId: sa.targetPlayerId,
          stateTimer: 1.0,
          animTimer: 0,
          randomState: 1,
          homeX: sa.x,
          homeY: sa.y,
          health: sa.health,
          maxHealth: sa.maxHealth,
          hurtTimer: 0,
        };
        this.animals.push(animal);
        if (sa.targetPlayerId || sa.state === 'chase' || sa.state === 'attack') {
          debugCombat('animal.sync-state', { playerId: sa.targetPlayerId ?? null, lifeId: null, animalId: sa.id, health: sa.health, alive: sa.health > 0, targetPlayerId: sa.targetPlayerId ?? null, state: sa.state, previousState: null, reason: 'animal-added-from-server-sync' });
        }
      } else {
        const previousTargetPlayerId = animal.targetPlayerId;
        const previousState = animal.state;
        animal.targetX = sa.x;
        animal.targetY = sa.y;
        animal.direction = sa.direction;
        animal.state = sa.state;
        animal.targetPlayerId = sa.targetPlayerId;
        if (previousTargetPlayerId !== sa.targetPlayerId || previousState !== sa.state) {
          debugCombat('animal.sync-state', { playerId: sa.targetPlayerId ?? null, lifeId: null, animalId: sa.id, health: sa.health, alive: sa.health > 0, targetPlayerId: sa.targetPlayerId ?? null, previousTargetPlayerId: previousTargetPlayerId ?? null, state: sa.state, previousState });
        }
        animal.health = sa.health;
        animal.maxHealth = sa.maxHealth;
      }
    }

    for (let i = this.animals.length - 1; i >= 0; i--) {
      if (!serverIdSet.has(this.animals[i].id)) {
        this.animals.splice(i, 1);
      }
    }
  }

  public applyServerHurt(id: string, health: number, maxHealth: number, _damage: number, _x: number, _y: number, hitFromLeft: boolean): void {
    const animal = this.animals.find((a) => a.id === id);
    if (!animal) return;
    animal.health = health;
    animal.maxHealth = maxHealth;
    animal.hurtTimer = 0.22;
    animal.direction = hitFromLeft ? 1 : -1;
    animal.x += hitFromLeft ? 4 : -4;
    animal.targetX = animal.x;
  }

  public applyServerDeath(id: string): void {
    this.recordAnimalDeath(id);
    const idx = this.animals.findIndex((a) => a.id === id);
    if (idx !== -1) {
      this.animals.splice(idx, 1);
    }
    this.dormant.delete(id);
  }

  public findHitAnimal(swordHitbox: { x: number; y: number; width: number; height: number }, chunks?: ChunkManager): WildlifeAnimal | null {
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const animal = this.animals[i];
      if (animal.health <= 0) continue;
      if (animal.species === 'fish' && chunks) {
        const centerTile = this.loadedTileAtPixel(animal.x + animal.width / 2, animal.y + animal.height / 2, chunks);
        if (centerTile !== TileType.WATER) continue;
      }
      const overlaps =
        swordHitbox.x < animal.x + animal.width &&
        swordHitbox.x + swordHitbox.width > animal.x &&
        swordHitbox.y < animal.y + animal.height &&
        swordHitbox.y + swordHitbox.height > animal.y;
      if (overlaps) {
        return animal;
      }
    }
    return null;
  }

  private syncLoadedChunks(chunks: ChunkManager): void {
    const loadedKeys = new Set(chunks.loadedChunks.keys());
    for (let i = this.animals.length - 1; i >= 0; i--) {
      const animal = this.animals[i];
      const ownerKey = ChunkManager.getChunkKey(animal.ownerChunkX, animal.ownerChunkY);
      if (!loadedKeys.has(ownerKey)) {
        resetAnimalCombatState(animal);
        this.dormant.delete(animal.id);
        this.dormant.set(animal.id, animal);
        this.animals.splice(i, 1);
      }
    }
    while (this.dormant.size > MAX_DORMANT_WILDLIFE) {
      const oldest = this.dormant.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.dormant.delete(oldest);
    }

    const speciesCounts = new Map<WildlifeSpecies, number>();
    const biomeCounts = new Map<BiomeType, number>();
    for (const animal of this.animals) {
      speciesCounts.set(animal.species, (speciesCounts.get(animal.species) ?? 0) + 1);
      biomeCounts.set(animal.biome, (biomeCounts.get(animal.biome) ?? 0) + 1);
    }
    // Dormant residents keep their species/biome slots so a nearby reload can
    // restore the same animal without a temporary population spike.
    for (const animal of this.dormant.values()) {
      speciesCounts.set(animal.species, (speciesCounts.get(animal.species) ?? 0) + 1);
      biomeCounts.set(animal.biome, (biomeCounts.get(animal.biome) ?? 0) + 1);
    }

    for (const chunk of chunks.loadedChunks.values()) {
      if (this.animals.length >= MAX_ACTIVE_WILDLIFE) break;
      for (let slot = 0; slot < 5 && this.animals.length < MAX_ACTIVE_WILDLIFE; slot++) {
        const candidate = this.makeLandCandidate(chunk, slot, chunks);
        if (candidate) this.addCandidate(candidate, speciesCounts, biomeCounts, chunks);
      }
      if (this.animals.length < MAX_ACTIVE_WILDLIFE) {
        const fish = this.makeFishCandidate(chunk, chunks);
        if (fish) this.addCandidate(fish, speciesCounts, biomeCounts, chunks);
      }
    }
  }

  private addCandidate(
    candidate: WildlifeAnimal,
    speciesCounts: Map<WildlifeSpecies, number>,
    biomeCounts: Map<BiomeType, number>,
    chunks: ChunkManager
  ): void {
    if (this.killedAnimalIds.has(candidate.id)) return;
    if (this.animals.some((animal) => animal.id === candidate.id)) return;
    const sleeping = this.dormant.get(candidate.id);
    const reserved = !!sleeping;
    const activeOfSpecies = (speciesCounts.get(candidate.species) ?? 0) - (reserved ? 1 : 0);
    if (activeOfSpecies >= MAX_PER_SPECIES[candidate.species]) return;
    const rarity = BIOME_RARITY[candidate.biome];
    const biomeLimit = rarity === 'VERY_RARE' ? 4 : rarity === 'RARE' ? 6 : 10;
    const activeInBiome = (biomeCounts.get(candidate.biome) ?? 0) - (reserved ? 1 : 0);
    if (activeInBiome >= biomeLimit) return;

    if (sleeping) {
      // Restore the same individual and its last position after a nearby unload.
      const locationValid = sleeping.species === 'fish'
        ? this.loadedTileAtPixel(sleeping.x + sleeping.width / 2, sleeping.y + sleeping.height / 2, chunks) === TileType.WATER
        : this.clearAndSupported(chunks, sleeping.x, sleeping.y, sleeping.width, sleeping.height);
      if (locationValid) {
        this.animals.push(sleeping);
        this.dormant.delete(candidate.id);
        return;
      }
      this.dormant.delete(candidate.id);
      speciesCounts.set(candidate.species, activeOfSpecies);
      biomeCounts.set(candidate.biome, activeInBiome);
    }

    this.animals.push(candidate);
    speciesCounts.set(candidate.species, activeOfSpecies + 1);
    biomeCounts.set(candidate.biome, activeInBiome + 1);
  }

  private makeLandCandidate(chunk: Chunk, slot: number, chunks: ChunkManager): WildlifeAnimal | null {
    const seed = chunks.seed;
    const { cx, cy, worldX } = chunk;
    const spawnRoll = hash32(seed, cx, cy, slot, 0x2f6e2b1) % 100;
    // Increased candidate acceptance for abundant wildlife across the world
    if (spawnRoll >= 90) return null;
    const xTile = worldX + hash32(seed, cx, cy, slot, 0x6c8e9cf) % CHUNK_WIDTH;
    const surfaceY = chunks.terrainGen.getSurfaceHeight(xTile);
    if (Math.floor(surfaceY / CHUNK_HEIGHT) !== cy) return null;
    const biome = chunks.terrainGen.getColumnBiome(xTile).id;
    const choices = LAND_HABITATS[biome];
    if (!choices?.length) return null;
    const totalWeight = choices.reduce((sum, sp) => sum + SPECIES_WEIGHT[sp], 0);
    const roll = hash32(seed, cx, cy, slot, 0xa54ff53a) % totalWeight;
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
    const ground = this.loadedTile(chunks, xTile, surfaceY);
    if (ground === null || !TILE_DEFS[ground]?.isSolid) return null;
    for (let dy = 1; dy <= Math.ceil(height / TILE_SIZE); dy++) {
      if (this.loadedTile(chunks, xTile, surfaceY - dy) !== TileType.AIR) return null;
    }
    const id = `land:${cx}:${cy}:${slot}`;
    const seedBits = hash32(seed, cx, cy, slot, 0xbb67ae85);
    const direction: -1 | 1 = seedBits & 1 ? 1 : -1;
    const y = surfaceY * TILE_SIZE - height;
    const maxHp = SPECIES_HEALTH[species];
    return {
      id, species, biome, ownerChunkX: cx, ownerChunkY: cy,
      x: xTile * TILE_SIZE + (TILE_SIZE - width) / 2, y, width, height,
      direction, state: 'idle', stateTimer: 0.5 + ((seedBits >>> 1) % 2000) / 1000,
      animTimer: (seedBits % 6283) / 1000, randomState: seedBits || 1,
      homeX: xTile * TILE_SIZE + (TILE_SIZE - width) / 2, homeY: y,
      health: maxHp, maxHealth: maxHp, hurtTimer: 0,
      attackCooldown: 0,
      isEnraged: false,
    };
  }

  private makeFishCandidate(chunk: Chunk, chunks: ChunkManager): WildlifeAnimal | null {
    const { cx, cy, worldX, worldY } = chunk;
    const seed = chunks.seed;
    if (hash32(seed, cx, cy, 0, 0x510e527f) % 100 >= 60) return null;
    const xTile = worldX + 1 + hash32(seed, cx, cy, 0, 0x9b05688c) % (CHUNK_WIDTH - 2);
    // Include edge rows: the fish body can straddle a chunk boundary, and
    // loadedTile() safely resolves the adjacent chunk for the water checks.
    for (let localY = 0; localY < CHUNK_HEIGHT; localY++) {
      const yTile = worldY + localY;
      if (this.loadedTile(chunks, xTile, yTile) !== TileType.WATER ||
          this.loadedTile(chunks, xTile, yTile - 1) !== TileType.WATER ||
          this.loadedTile(chunks, xTile, yTile + 1) !== TileType.WATER) continue;
      const surfaceY = chunks.terrainGen.getSurfaceHeight(xTile);
      const biome = chunks.terrainGen.getColumnBiome(xTile).id;
      const river = chunks.terrainGen.getRiverAt(xTile);
      const onRiver = !!river && yTile >= river.surfaceY && yTile < river.surfaceY + river.depth;
      const inUndergroundLake = chunks.terrainGen.isUndergroundLakeWaterAt(xTile, yTile, surfaceY);
      if (!AQUATIC_BIOMES.has(biome) && !onRiver && !inUndergroundLake) continue;
      const species: WildlifeSpecies = 'fish';
      const [width, height] = SPECIES_SIZE.fish;
      const x = xTile * TILE_SIZE + (TILE_SIZE - width) / 2;
      const y = yTile * TILE_SIZE + (TILE_SIZE - height) / 2;
      const id = `fish:${cx}:${cy}:0`;
      const seedBits = hash32(seed, cx, cy, 0, 0x1f83d9ab);
      const maxHp = SPECIES_HEALTH.fish;
      return {
        id, species, biome, ownerChunkX: cx, ownerChunkY: cy,
        x, y, width, height, direction: seedBits & 1 ? 1 : -1,
        state: 'idle', stateTimer: 0.5 + ((seedBits >>> 1) % 2000) / 1000,
        animTimer: (seedBits % 6283) / 1000, randomState: seedBits || 1,
        homeX: x, homeY: y,
        health: maxHp, maxHealth: maxHp, hurtTimer: 0,
      };
    }
    return null;
  }

  private random(animal: WildlifeAnimal): number {
    let x = animal.randomState | 0;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    animal.randomState = x || 1;
    return (animal.randomState >>> 0) / 0x100000000;
  }

  private updateAnimal(
    animal: WildlifeAnimal,
    dt: number,
    chunks: ChunkManager,
    player?: Player,
    onPlayerDamage?: (damage: number, sourceX: number, sourceY: number) => void
  ): void {
    if (animal.health <= 0) {
      animal.state = 'idle';
      animal.attackCooldown = 0;
      animal.isEnraged = false;
      animal.enragedTimer = 0;
      animal.targetPlayerId = undefined;
      return;
    }
    if (animal.hurtTimer > 0) {
      animal.hurtTimer = Math.max(0, animal.hurtTimer - dt);
    }
    if (animal.attackCooldown !== undefined && animal.attackCooldown > 0) {
      animal.attackCooldown = Math.max(0, animal.attackCooldown - dt);
    }
    if (animal.enragedTimer !== undefined && animal.enragedTimer > 0) {
      animal.enragedTimer = Math.max(0, animal.enragedTimer - dt);
      if (animal.enragedTimer <= 0) {
        animal.isEnraged = false;
      }
    }

    // Aggressive predator & combat behavior: Wolves, Bears, Lions, Crocodiles, Mammoths, and enraged Boars
    const canFight = CARNIVORE_SPECIES.has(animal.species) || (animal.species === 'boar' && animal.isEnraged);
    if (canFight && player && player.health > 0) {
      const animalCenterX = animal.x + animal.width / 2;
      const animalCenterY = animal.y + animal.height / 2;
      const playerCenterX = player.x + player.width / 2;
      const playerCenterY = player.y + player.height / 2;
      const dx = playerCenterX - animalCenterX;
      const dy = playerCenterY - animalCenterY;
      const dist = Math.hypot(dx, dy);

      // Predators should notice the player from a visible distance, before
      // the player is already close enough to be hit.
      const baseAggro = animal.species === 'lion' ? 300 :
        animal.species === 'wolf' ? 260 :
        animal.species === 'bear' ? 230 :
        animal.species === 'crocodile' ? (player.isInWater ? 240 : 180) :
        animal.species === 'mammoth' ? 200 :
        120; // boar

      // When enraged or attacked, creature relentlessly tracks and fights back from afar!
      const aggroDist = animal.isEnraged ? 380 : baseAggro;

      if (dist < aggroDist) {
        const previousState = animal.state;
        if (previousState !== 'chase' && previousState !== 'attack') debugCombat('animal.target-acquired.local', { playerId: null, lifeId: null, animalId: animal.id, health: player.health, alive: player.health > 0, distance: Math.round(dist), animalState: previousState });
        animal.state = 'chase';
        animal.direction = dx > 0 ? 1 : -1;
        animal.animTimer += dt * (animal.isEnraged ? 14 : 10);

        // Only apply damage when the animal is physically touching the player.
        // The larger chase radius above is for pursuing, not for landing hits.
        const hitPaddingX = 14;
        const hitPaddingY = 14;
        const touchingPlayer =
          player.x < animal.x + animal.width + hitPaddingX &&
          player.x + player.width + hitPaddingX > animal.x &&
          player.y < animal.y + animal.height + hitPaddingY &&
          player.y + player.height + hitPaddingY > animal.y;
        if (touchingPlayer) {
          if (previousState !== 'attack') debugCombat('animal.attack-start.local', { playerId: null, lifeId: null, animalId: animal.id, health: player.health, alive: player.health > 0, distance: Math.round(dist), touchingPlayer });
          animal.state = 'attack';
          if ((animal.attackCooldown ?? 0) <= 0) {
            const baseDamage = SPECIES_DAMAGE[animal.species] ?? 14;
            const damage = animal.isEnraged ? Math.round(baseDamage * 1.25) : baseDamage;
            debugCombat('damage.local-request', { playerId: null, lifeId: null, animalId: animal.id, health: player.health, alive: player.health > 0, damage, playerPosition: { x: player.x, y: player.y } });
            onPlayerDamage?.(damage, animalCenterX, animalCenterY);
            animal.attackCooldown = SPECIES_ATTACK_COOLDOWN[animal.species] ?? 0.85;
            sound.playEnemyHit();
          }
        } else {
          // Pursue player across terrain with leaping up ledges
          const speedMultiplier = animal.isEnraged ? 1.55 : 1.35;
          const speed = SPECIES_SPEED[animal.species] * speedMultiplier;
          const proposedX = animal.x + animal.direction * speed * dt;
          const tileX = Math.floor((proposedX + animal.width / 2) / TILE_SIZE);
          const groundY = chunks.terrainGen.getSurfaceHeight(tileX);
          let proposedY = groundY * TILE_SIZE - animal.height;

          // Leap/climb towards player if player is elevated
          if (dy < -6 && Math.abs(dx) < 80) {
            proposedY = Math.min(proposedY, player.y + player.height - animal.height);
          }

          if (Math.abs(proposedY - animal.y) <= TILE_SIZE * 3.5 &&
              this.clearAndSupported(chunks, proposedX, proposedY, animal.width, animal.height)) {
            animal.x = proposedX;
            animal.y = proposedY;
          } else {
            animal.x = proposedX;
          }
        }
        return;
      } else if (animal.state === 'chase' || animal.state === 'attack') {
        debugCombat('animal.attack-cancelled.local', { playerId: null, lifeId: null, animalId: animal.id, health: player.health, alive: player.health > 0, reason: `outside-aggro-range:${Math.round(dist)}`, previousState: animal.state });
        animal.state = 'idle';
        animal.stateTimer = 1.0;
        animal.attackCooldown = 0;
        animal.attackAnimTimer = 0;
        animal.targetPlayerId = undefined;
      }
    }

    animal.animTimer += dt * (animal.state === 'wander' ? 7 : 2);
    animal.stateTimer -= dt;
    if (animal.stateTimer <= 0) {
      if (animal.state === 'idle') {
        animal.state = 'wander';
        animal.direction = this.random(animal) < 0.5 ? -1 : 1;
        animal.stateTimer = 0.8 + this.random(animal) * 2.2;
      } else {
        animal.state = 'idle';
        animal.stateTimer = 0.7 + this.random(animal) * 2.5;
      }
    }
    if (animal.state !== 'wander') return;

    const minX = animal.ownerChunkX * CHUNK_WIDTH * TILE_SIZE + 1;
    const maxX = (animal.ownerChunkX + 1) * CHUNK_WIDTH * TILE_SIZE - animal.width - 1;
    const nextX = Math.max(minX, Math.min(maxX, animal.x + animal.direction * SPECIES_SPEED[animal.species] * dt));
    if (animal.species === 'fish') {
      const leadingX = animal.direction > 0 ? nextX + animal.width - 1 : nextX;
      const leadingTile = this.loadedTileAtPixel(leadingX, animal.y + animal.height / 2, chunks);
      const centerTile = this.loadedTileAtPixel(nextX + animal.width / 2, animal.y + animal.height / 2, chunks);
      if (leadingTile !== TileType.WATER || centerTile !== TileType.WATER || nextX === minX || nextX === maxX) {
        animal.direction = animal.direction === 1 ? -1 : 1;
        animal.state = 'idle'; animal.stateTimer = 0.4 + this.random(animal) * 1.2;
      } else animal.x = nextX;
      return;
    }

    const proposedCenterTileX = Math.floor((nextX + animal.width / 2) / TILE_SIZE);
    const biome = chunks.terrainGen.getColumnBiome(proposedCenterTileX).id;
    if (!LAND_HABITATS[biome]?.includes(animal.species)) {
      this.turnAround(animal);
      return;
    }
    const groundY = chunks.terrainGen.getSurfaceHeight(proposedCenterTileX);
    const nextY = groundY * TILE_SIZE - animal.height;
    if (Math.abs(nextY - animal.y) > TILE_SIZE * 1.25 ||
        !this.clearAndSupported(chunks, nextX, nextY, animal.width, animal.height)) {
      this.turnAround(animal);
      return;
    }
    animal.x = nextX;
    animal.y = nextY;
  }

  public handleSwordAttack(
    swordHitbox: { x: number; y: number; width: number; height: number },
    damage: number,
    itemDropManager: ItemDropManager,
    enemyManager: EnemyManager,
    chunks: ChunkManager
  ): boolean {
    let hitAny = false;

    for (let i = this.animals.length - 1; i >= 0; i--) {
      const animal = this.animals[i];

      // Requirement 7: Fish can only be damaged while they are in water
      if (animal.species === 'fish') {
        const centerTile = this.loadedTileAtPixel(animal.x + animal.width / 2, animal.y + animal.height / 2, chunks);
        if (centerTile !== TileType.WATER) {
          continue;
        }
      }

      // AABB overlap check with sword attack hitbox
      const overlaps =
        swordHitbox.x < animal.x + animal.width &&
        swordHitbox.x + swordHitbox.width > animal.x &&
        swordHitbox.y < animal.y + animal.height &&
        swordHitbox.y + swordHitbox.height > animal.y;

      if (overlaps) {
        hitAny = true;
        animal.health -= damage;
        animal.hurtTimer = 0.22;

        // Flinch away from attack direction
        const hitFromLeft = swordHitbox.x < animal.x;
        animal.direction = hitFromLeft ? 1 : -1;
        animal.x += hitFromLeft ? 5 : -5;
        if (COMBAT_SPECIES.has(animal.species)) {
          animal.isEnraged = true;
          animal.enragedTimer = 22.0;
          animal.state = 'chase';
          animal.attackCooldown = 0.15; // ready to counter-attack immediately!
          animal.direction = hitFromLeft ? -1 : 1; // turn aggressively toward player
          // Pack alert: alert other nearby members of the pack to fight back together!
          for (const packMate of this.animals) {
            if (packMate !== animal && packMate.species === animal.species) {
              const pdx = (packMate.x + packMate.width / 2) - (animal.x + animal.width / 2);
              const pdy = (packMate.y + packMate.height / 2) - (animal.y + animal.height / 2);
              if (Math.hypot(pdx, pdy) < 220) {
                packMate.isEnraged = true;
                packMate.enragedTimer = 20.0;
                packMate.state = 'chase';
              }
            }
          }
        } else {
          animal.state = 'wander';
          animal.stateTimer = 0.8;
        }

        // Floating damage indicator & sound (leveraging existing combat feedback)
        enemyManager.addDamageNumber(animal.x + animal.width / 2, animal.y - 4, `${damage}`, '#fde047');
        sound.playEnemyHit();

        // Animal death (Guaranteed meat, bone parts, and placable skull/skeleton drops!)
        if (animal.health <= 0) {
          // Permanently record death so chunk reload never respawns it
          this.recordAnimalDeath(animal.id);
          this.animals.splice(i, 1);
          this.dormant.delete(animal.id);

          const dropX = animal.x + (animal.width - 8) / 2;
          const dropY = animal.y + (animal.height - 8) / 2;

          // 1. Meat Drop (guaranteed 100% every single kill!)
          const meatType = SPECIES_MEAT[animal.species];
          if (meatType) {
            itemDropManager.spawnDrop(
              meatType,
              dropX,
              dropY,
              animal.species === 'mammoth' ? 2 : 1
            );
          }

          // 2. Placable bone parts, animal skulls, and complete skeletal body
          const skullDrop = SPECIES_SKULL_DROP[animal.species];
          if (skullDrop) {
            itemDropManager.spawnDrop(skullDrop, dropX - 4, dropY - 2, 1);

            const boneCount = animal.species === 'mammoth' ? 4 : animal.species === 'bear' ? 2 : 1;
            itemDropManager.spawnDrop('bone', dropX + 4, dropY - 2, boneCount);

            // Giant Mammoth drops its entire placable skeletal body trophy!
            if (animal.species === 'mammoth') {
              itemDropManager.spawnDrop('animal_skeleton', dropX, dropY - 6, 1);
            }
          }
        }
      }
    }

    return hitAny;
  }

  private turnAround(animal: WildlifeAnimal): void {
    animal.direction = animal.direction === 1 ? -1 : 1;
    animal.state = 'idle';
    animal.stateTimer = 0.4 + this.random(animal) * 1.3;
  }

  private clearAndSupported(chunks: ChunkManager, x: number, y: number, width: number, height: number): boolean {
    const left = Math.floor(x / TILE_SIZE);
    const right = Math.floor((x + width - 1) / TILE_SIZE);
    const top = Math.floor(y / TILE_SIZE);
    const bottom = Math.floor((y + height - 1) / TILE_SIZE);
    for (let tx = left; tx <= right; tx++) {
      for (let ty = top; ty <= bottom; ty++) {
        const tile = this.loadedTile(chunks, tx, ty);
        if (tile === null || TILE_DEFS[tile]?.isSolid) return false;
      }
    }
    // The center foot probe keeps animals on small natural ledges without
    // rejecting a harmless one-pixel overhang at a sloped chunk seam.
    const centerX = Math.floor((x + width / 2) / TILE_SIZE);
    const footY = Math.floor((y + height + 1) / TILE_SIZE);
    const ground = this.loadedTile(chunks, centerX, footY);
    return ground !== null && !!TILE_DEFS[ground]?.isSolid;
  }

  private loadedTile(chunks: ChunkManager, x: number, y: number): TileType | null {
    const cx = Math.floor(x / CHUNK_WIDTH);
    const cy = Math.floor(y / CHUNK_HEIGHT);
    const chunk = chunks.loadedChunks.get(ChunkManager.getChunkKey(cx, cy));
    if (!chunk) return null;
    const lx = ((x % CHUNK_WIDTH) + CHUNK_WIDTH) % CHUNK_WIDTH;
    const ly = ((y % CHUNK_HEIGHT) + CHUNK_HEIGHT) % CHUNK_HEIGHT;
    return chunk.tiles[ly * CHUNK_WIDTH + lx] as TileType;
  }

  private loadedTileAtPixel(x: number, y: number, chunks: ChunkManager): TileType | null {
    // Kept separate from ChunkManager.getTile: wildlife never triggers synchronous chunk generation.
    return this.loadedTile(chunks, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));
  }

  public render(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const left = camera.x - 24, right = camera.x + camera.width + 24;
    const top = camera.y - 20, bottom = camera.y + camera.height + 20;
    for (const animal of this.animals) {
      if (animal.x + animal.width < left || animal.x > right || animal.y + animal.height < top || animal.y > bottom) continue;
      this.renderAnimal(ctx, animal);
    }
  }

  private renderAnimal(ctx: CanvasRenderingContext2D, animal: WildlifeAnimal): void {
    const x = Math.floor(animal.x), y = Math.floor(animal.y);
    const leg = animal.state === 'wander' ? Math.floor(Math.sin(animal.animTimer) * 2) : 0;
    const flip = animal.direction;
    ctx.save();
    ctx.translate(x + animal.width / 2, 0);
    ctx.scale(flip, 1);
    const ox = -Math.floor(animal.width / 2);
    ctx.fillStyle = 'rgba(5,12,15,.28)';
    ctx.fillRect(ox + 2, y + animal.height - 1, animal.width - 4, 2);

    switch (animal.species) {
      case 'deer': {
        ctx.fillStyle = '#432c24';
        ctx.fillRect(ox + 4, y + 7, 10, 7);
        ctx.fillRect(ox + 11, y + 4, 4, 7);
        ctx.fillRect(ox + 13, y + 3, 4, 4);
        ctx.fillStyle = '#a96f43';
        ctx.fillRect(ox + 5, y + 6, 9, 6);
        ctx.fillRect(ox + 12, y + 4, 4, 6);
        ctx.fillRect(ox + 14, y + 3, 3, 3);
        ctx.fillStyle = '#e8b47c';
        ctx.fillRect(ox + 7, y + 7, 3, 2);
        ctx.fillRect(ox + 15, y + 5, 2, 1);
        ctx.fillStyle = '#573729';
        ctx.fillRect(ox + 6, y + 12, 2, 4 + leg); ctx.fillRect(ox + 12, y + 12, 2, 4 - leg);
        ctx.fillStyle = '#68422f';
        ctx.fillRect(ox + 14, y + 1, 1, 3); ctx.fillRect(ox + 17, y, 1, 4);
        ctx.fillRect(ox + 13, y + 1, 3, 1); ctx.fillRect(ox + 16, y + 1, 3, 1);
        ctx.fillStyle = '#201916'; ctx.fillRect(ox + 16, y + 4, 1, 1);
        break;
      }
      case 'rabbit': {
        ctx.fillStyle = '#554d48';
        ctx.fillRect(ox + 3, y + 5, 8, 6); ctx.fillRect(ox + 8, y + 4, 4, 5);
        ctx.fillRect(ox + 9, y, 2, 6); ctx.fillRect(ox + 12, y + 1, 2, 5);
        ctx.fillStyle = '#c7b9a8';
        ctx.fillRect(ox + 4, y + 5, 7, 5); ctx.fillRect(ox + 9, y + 4, 4, 4);
        ctx.fillStyle = '#f1a8b5'; ctx.fillRect(ox + 10, y + 1, 1, 3); ctx.fillRect(ox + 13, y + 2, 1, 2);
        ctx.fillStyle = '#fff4df'; ctx.fillRect(ox + 2, y + 8, 3, 3);
        ctx.fillStyle = '#332c2b'; ctx.fillRect(ox + 12, y + 5, 1, 1);
        ctx.fillStyle = '#75675b'; ctx.fillRect(ox + 5, y + 10, 2, 2 + leg); ctx.fillRect(ox + 9, y + 10, 2, 2 - leg);
        break;
      }
      case 'boar': {
        ctx.fillStyle = '#30241f'; ctx.fillRect(ox + 2, y + 4, 14, 8); ctx.fillRect(ox + 12, y + 5, 5, 5);
        ctx.fillStyle = '#765044'; ctx.fillRect(ox + 3, y + 4, 12, 7); ctx.fillRect(ox + 13, y + 5, 4, 4);
        ctx.fillStyle = '#bd8a68'; ctx.fillRect(ox + 14, y + 7, 4, 2);
        ctx.fillStyle = '#f1d8a5'; ctx.fillRect(ox + 13, y + 9, 2, 2); ctx.fillRect(ox + 17, y + 8, 1, 2);
        ctx.fillStyle = '#3d2a24'; ctx.fillRect(ox + 5, y + 10, 3, 3 + leg); ctx.fillRect(ox + 12, y + 10, 3, 3 - leg);
        ctx.fillStyle = '#211916'; ctx.fillRect(ox + 15, y + 6, 1, 1);
        break;
      }
      case 'fox': {
        ctx.fillStyle = '#422d23'; ctx.fillRect(ox + 2, y + 6, 11, 6); ctx.fillRect(ox + 10, y + 4, 5, 6);
        ctx.fillRect(ox + 12, y + 2, 2, 4); ctx.fillRect(ox + 16, y + 3, 2, 4);
        ctx.fillStyle = '#d66b2f'; ctx.fillRect(ox + 3, y + 6, 10, 5); ctx.fillRect(ox + 11, y + 4, 4, 5);
        ctx.fillStyle = '#f0a355'; ctx.fillRect(ox + 4, y + 6, 5, 2);
        ctx.fillStyle = '#f2e5cc'; ctx.fillRect(ox + 13, y + 7, 5, 2); ctx.fillRect(ox + 12, y + 3, 2, 2);
        ctx.fillStyle = '#b94e25'; ctx.fillRect(ox, y + 5, 5, 4); ctx.fillRect(ox + 1, y + 3, 4, 3);
        ctx.fillStyle = '#f4ddbb'; ctx.fillRect(ox, y + 6, 2, 2);
        ctx.fillStyle = '#33221d'; ctx.fillRect(ox + 5, y + 10, 2, 3 + leg); ctx.fillRect(ox + 11, y + 10, 2, 3 - leg);
        ctx.fillStyle = '#1e1714'; ctx.fillRect(ox + 15, y + 5, 1, 1);
        break;
      }
      case 'bird': {
        const wing = animal.state === 'wander' ? Math.floor(Math.sin(animal.animTimer * 1.5) * 3) : 0;
        ctx.fillStyle = '#3c342c'; ctx.fillRect(ox + 3, y + 3, 7, 5); ctx.fillRect(ox + 8, y + 2, 4, 4);
        ctx.fillStyle = '#7d6650'; ctx.fillRect(ox + 4, y + 3, 6, 4); ctx.fillRect(ox + 9, y + 2, 3, 3);
        ctx.fillStyle = '#d5a65f'; ctx.fillRect(ox + 11, y + 4, 3, 1);
        ctx.fillStyle = '#57493c'; ctx.fillRect(ox + 5, y + 2 - wing, 5, 2 + wing);
        ctx.fillStyle = '#f0d7a2'; ctx.fillRect(ox + 5, y + 3 - wing, 3, 1);
        ctx.fillStyle = '#2b241e'; ctx.fillRect(ox + 11, y + 2, 1, 1);
        break;
      }
      case 'fish': {
        ctx.fillStyle = '#244b58'; ctx.fillRect(ox + 2, y + 2, 9, 5); ctx.fillRect(ox + 10, y + 3, 2, 3);
        ctx.fillStyle = '#55aeb0'; ctx.fillRect(ox + 3, y + 2, 7, 4); ctx.fillRect(ox + 10, y + 3, 2, 2);
        ctx.fillStyle = '#367d8b'; ctx.fillRect(ox, y + 1, 4, 3); ctx.fillRect(ox + 1, y + 4, 3, 3);
        ctx.fillStyle = '#b7e2d6'; ctx.fillRect(ox + 4, y + 2, 4, 1); ctx.fillRect(ox + 6, y + 6, 3, 1);
        ctx.fillStyle = '#15313b'; ctx.fillRect(ox + 10, y + 3, 1, 1);
        ctx.fillStyle = 'rgba(210,250,245,.8)'; ctx.fillRect(ox + 10, y + 1, 2, 1);
        break;
      }
      case 'wolf': {
        const isHostile = animal.state === 'chase' || animal.state === 'attack' || animal.isEnraged;
        // Tail
        ctx.fillStyle = '#334155'; ctx.fillRect(ox + 1, y + 6, 5, 6); ctx.fillRect(ox, y + 10, 4, 5);
        ctx.fillStyle = '#cbd5e1'; ctx.fillRect(ox, y + 14, 3, 3);
        // Body (scaled to 34x24)
        ctx.fillStyle = '#334155'; ctx.fillRect(ox + 5, y + 5, 16, 9);
        ctx.fillStyle = '#475569'; ctx.fillRect(ox + 6, y + 6, 14, 7);
        ctx.fillStyle = '#94a3b8'; ctx.fillRect(ox + 7, y + 10, 11, 4); // belly
        // Neck and Head
        ctx.fillStyle = '#334155'; ctx.fillRect(ox + 16, y + 3, 8, 8);
        ctx.fillRect(ox + 20, y + 7, 8, 5); // snout
        // Ears
        ctx.fillStyle = '#1e293b'; ctx.fillRect(ox + 17, y, 3, 4); ctx.fillRect(ox + 21, y, 3, 4);
        ctx.fillStyle = '#f43f5e'; ctx.fillRect(ox + 18, y + 1, 1, 3);
        // Eyes (Glows fierce red when hostile or enraged!)
        ctx.fillStyle = isHostile ? '#ef4444' : '#facc15';
        ctx.fillRect(ox + 21, y + 4, 3, 2);
        // Snout, nose and teeth
        ctx.fillStyle = '#0f172a'; ctx.fillRect(ox + 27, y + 7, 2, 2); // nose
        ctx.fillStyle = '#ffffff'; ctx.fillRect(ox + 24, y + 10, 2, 3); // sharp fangs
        // Legs
        ctx.fillStyle = '#334155';
        ctx.fillRect(ox + 6, y + 13, 3, 7 + leg); ctx.fillRect(ox + 17, y + 13, 3, 7 - leg);
        ctx.fillStyle = '#475569';
        ctx.fillRect(ox + 10, y + 13, 3, 7 - leg); ctx.fillRect(ox + 14, y + 13, 3, 7 + leg);
        break;
      }
      case 'bear': {
        // Massive bulky brown apex bear (scaled to 48x36)
        // Body outline & mass
        ctx.fillStyle = '#26150b'; ctx.fillRect(ox + 5, y + 5, 28, 18);
        ctx.fillStyle = '#3d2314'; ctx.fillRect(ox + 6, y + 6, 26, 16);
        ctx.fillStyle = '#5c3822'; ctx.fillRect(ox + 9, y + 7, 20, 11); // back fur highlight
        // Hump on shoulder
        ctx.fillStyle = '#5c3822'; ctx.fillRect(ox + 20, y + 2, 10, 7);
        // Head & round ears
        ctx.fillStyle = '#26150b'; ctx.fillRect(ox + 28, y + 6, 11, 11);
        ctx.fillStyle = '#3d2314'; ctx.fillRect(ox + 29, y + 7, 9, 9);
        ctx.fillStyle = '#1a0d07'; ctx.fillRect(ox + 29, y + 3, 4, 4); // round ear
        // Snout & jaws
        ctx.fillStyle = '#8c5a3c'; ctx.fillRect(ox + 35, y + 10, 7, 7);
        ctx.fillStyle = '#180a04'; ctx.fillRect(ox + 39, y + 10, 3, 3); // nose
        ctx.fillStyle = animal.isEnraged ? '#ef4444' : '#f97316';
        ctx.fillRect(ox + 32, y + 8, 3, 3); // eye
        ctx.fillStyle = '#ffffff'; ctx.fillRect(ox + 36, y + 15, 3, 3); ctx.fillRect(ox + 40, y + 15, 2, 3); // massive fangs
        // Heavy pillar legs and claws
        ctx.fillStyle = '#26150b';
        ctx.fillRect(ox + 8, y + 21, 6, 11 + leg); ctx.fillRect(ox + 26, y + 21, 6, 11 - leg);
        ctx.fillStyle = '#3d2314';
        ctx.fillRect(ox + 15, y + 21, 5, 11 - leg); ctx.fillRect(ox + 32, y + 21, 5, 11 + leg);
        // Claws
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 12, y + 30 + leg, 3, 2); ctx.fillRect(ox + 30, y + 30 - leg, 3, 2);
        break;
      }
      case 'lion': {
        // Magnificent predator with amber mane (scaled to 42x30)
        // Body
        ctx.fillStyle = '#b45309'; ctx.fillRect(ox + 4, y + 8, 20, 12);
        ctx.fillStyle = '#d97706'; ctx.fillRect(ox + 5, y + 9, 18, 10);
        ctx.fillStyle = '#fde68a'; ctx.fillRect(ox + 7, y + 14, 11, 4); // underbelly
        // Tail with tuft
        ctx.fillStyle = '#d97706'; ctx.fillRect(ox, y + 8, 4, 3); ctx.fillRect(ox, y + 11, 3, 6);
        ctx.fillStyle = '#78350f'; ctx.fillRect(ox, y + 16, 4, 4); // dark tuft
        // Full majestic mane (surrounding head and chest)
        ctx.fillStyle = '#451a03'; ctx.fillRect(ox + 16, y + 2, 14, 17);
        ctx.fillStyle = '#78350f'; ctx.fillRect(ox + 17, y + 3, 12, 15);
        ctx.fillStyle = '#9a3412'; ctx.fillRect(ox + 19, y + 5, 9, 11);
        // Face inside mane
        ctx.fillStyle = '#f59e0b'; ctx.fillRect(ox + 23, y + 6, 9, 9);
        ctx.fillStyle = '#fef3c7'; ctx.fillRect(ox + 27, y + 9, 6, 6); // muzzle
        ctx.fillStyle = '#000000'; ctx.fillRect(ox + 31, y + 9, 3, 3); // nose
        ctx.fillStyle = animal.isEnraged ? '#ef4444' : '#fde047'; ctx.fillRect(ox + 24, y + 6, 3, 3); // piercing eye
        ctx.fillStyle = '#000000'; ctx.fillRect(ox + 25, y + 6, 1, 3); // pupil
        ctx.fillStyle = '#ffffff'; ctx.fillRect(ox + 28, y + 13, 3, 3); // sharp canine
        // Muscular legs
        ctx.fillStyle = '#b45309';
        ctx.fillRect(ox + 7, y + 18, 4, 8 + leg); ctx.fillRect(ox + 21, y + 18, 4, 8 - leg);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(ox + 12, y + 18, 4, 8 - leg); ctx.fillRect(ox + 25, y + 18, 4, 8 + leg);
        break;
      }
      case 'crocodile': {
        // Low elongated armored reptile (scaled to 56x18)
        // Scaly tail
        ctx.fillStyle = '#14532d'; ctx.fillRect(ox, y + 5, 14, 7);
        ctx.fillStyle = '#166534'; ctx.fillRect(ox + 2, y + 3, 11, 3); // dorsal scutes
        // Main armored body
        ctx.fillStyle = '#14532d'; ctx.fillRect(ox + 11, y + 4, 22, 9);
        ctx.fillStyle = '#15803d'; ctx.fillRect(ox + 12, y + 5, 20, 7);
        ctx.fillStyle = '#84cc16'; ctx.fillRect(ox + 14, y + 10, 16, 3); // belly
        // Back ridge spikes
        ctx.fillStyle = '#052e16';
        for (let sp = 12; sp <= 32; sp += 4) {
          ctx.fillRect(ox + sp, y + 2, 3, 3);
        }
        // Head & elongated snapping jaws
        ctx.fillStyle = '#14532d'; ctx.fillRect(ox + 31, y + 5, 17, 8);
        ctx.fillStyle = '#166534'; ctx.fillRect(ox + 33, y + 6, 14, 6);
        // Raised reptilian eye
        ctx.fillStyle = animal.isEnraged ? '#ef4444' : '#facc15'; ctx.fillRect(ox + 34, y + 2, 4, 4);
        ctx.fillStyle = '#000000'; ctx.fillRect(ox + 36, y + 2, 1, 4);
        // Sharp interlocking teeth along long jaw
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 38, y + 11, 2, 3);
        ctx.fillRect(ox + 41, y + 11, 2, 3);
        ctx.fillRect(ox + 44, y + 11, 2, 3);
        ctx.fillRect(ox + 46, y + 11, 2, 3);
        // Splayed legs
        ctx.fillStyle = '#14532d';
        ctx.fillRect(ox + 12, y + 12, 5, 5 + leg); ctx.fillRect(ox + 27, y + 12, 5, 5 - leg);
        break;
      }
      case 'mammoth': {
        // Colossal Great Elephant / Woolly Mammoth (scaled to 76x56) - Gigantic titan towering over player!
        // Massive woolly body
        ctx.fillStyle = '#261205'; ctx.fillRect(ox + 6, y + 8, 48, 32);
        ctx.fillStyle = '#451a03'; ctx.fillRect(ox + 9, y + 11, 42, 27);
        ctx.fillStyle = '#592507'; ctx.fillRect(ox + 15, y + 5, 30, 11); // massive back hump
        // Shaggy hanging fur fringe
        ctx.fillStyle = '#301304';
        for (let fx = 9; fx < 48; fx += 4) {
          ctx.fillRect(ox + fx, y + 36, 3, 6 + (fx % 3));
        }
        // Tail
        ctx.fillStyle = '#301304'; ctx.fillRect(ox + 3, y + 16, 4, 14);
        ctx.fillStyle = '#1a0a02'; ctx.fillRect(ox + 2, y + 27, 5, 5);
        // Giant domed head
        ctx.fillStyle = '#261205'; ctx.fillRect(ox + 43, y + 5, 18, 24);
        ctx.fillStyle = '#451a03'; ctx.fillRect(ox + 46, y + 8, 14, 19);
        // Mammoth ear
        ctx.fillStyle = '#1f0d03'; ctx.fillRect(ox + 44, y + 12, 4, 10);
        // Deep intelligent eye
        ctx.fillStyle = animal.isEnraged ? '#ef4444' : '#fef08a'; ctx.fillRect(ox + 52, y + 13, 3, 3);
        ctx.fillStyle = '#000000'; ctx.fillRect(ox + 53, y + 13, 1, 3);
        // Huge curved ivory tusks sweeping forward and curving high upward!
        ctx.fillStyle = '#fef9c3';
        ctx.fillRect(ox + 54, y + 27, 6, 6);
        ctx.fillRect(ox + 58, y + 30, 6, 6);
        ctx.fillRect(ox + 62, y + 25, 5, 7);
        ctx.fillRect(ox + 64, y + 18, 4, 9); // curling tip
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 55, y + 28, 4, 3);
        ctx.fillRect(ox + 60, y + 28, 3, 5);
        ctx.fillRect(ox + 64, y + 17, 2, 4); // sharp tusk tip
        // Trunk hanging down and curling forward
        const trunkSway = Math.floor(Math.sin(animal.animTimer * 1.2) * 3);
        ctx.fillStyle = '#381604';
        ctx.fillRect(ox + 55, y + 22, 6, 9);
        ctx.fillRect(ox + 56 + trunkSway, y + 30, 5, 10);
        ctx.fillRect(ox + 58 + trunkSway, y + 38, 6, 5); // curled trunk tip
        // Colossal pillar legs with toenails
        ctx.fillStyle = '#261205';
        ctx.fillRect(ox + 11, y + 36, 10, 16 + leg);
        ctx.fillRect(ox + 36, y + 36, 11, 16 - leg);
        ctx.fillStyle = '#451a03';
        ctx.fillRect(ox + 22, y + 36, 9, 16 - leg);
        ctx.fillRect(ox + 46, y + 36, 9, 16 + leg);
        // Ivory toenails
        ctx.fillStyle = '#f5ede2';
        ctx.fillRect(ox + 12, y + 49 + leg, 7, 3);
        ctx.fillRect(ox + 38, y + 49 - leg, 8, 3);
        break;
      }
    }

    if (animal.state === 'attack') {
      const slashX = ox + animal.width - 2;
      const slashY = y + Math.floor(animal.height * 0.35);
      ctx.fillStyle = '#fee2e2';
      ctx.fillRect(slashX + 2, slashY - 2, 7, 2);
      ctx.fillRect(slashX + 5, slashY + 2, 8, 2);
      ctx.fillRect(slashX + 3, slashY + 6, 6, 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(slashX + 4, slashY, 6, 2);
      ctx.fillRect(slashX + 6, slashY + 4, 7, 2);
    }

    if (animal.isEnraged) {
      // Aggressive enraged combat mark above creature
      const markX = ox + Math.floor(animal.width / 2);
      const markY = y - 8;
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(markX - 3, markY, 2, 5);
      ctx.fillRect(markX + 1, markY, 2, 5);
      ctx.fillRect(markX - 1, markY - 2, 2, 2);
      ctx.fillRect(markX - 4, markY + 2, 8, 2);
    }

    if (animal.hurtTimer > 0) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.fillRect(ox, y, animal.width, animal.height);
    }

    if (animal.health < animal.maxHealth) {
      const barWidth = Math.max(12, animal.width);
      const barHeight = 2;
      const barX = ox;
      const barY = y - 4;
      const healthPercent = Math.max(0, animal.health / animal.maxHealth);

      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = '#10b981';
      ctx.fillRect(barX, barY, Math.round(barWidth * healthPercent), barHeight);
    }

    ctx.restore();
  }
}
