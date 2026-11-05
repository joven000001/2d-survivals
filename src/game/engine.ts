import { sound } from './audio';
import { BlockInteraction } from './blockInteraction';
import { ChunkManager } from './chunkManager';
import {
  CHUNK_GEN_TIME_BUDGET_MS,
  CHUNK_HEIGHT,
  CHUNK_WIDTH,
  DAY_CYCLE_DURATION_SEC,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TILE_SIZE,
} from './constants';
import { Inventory } from './inventory';
import { ItemDropManager } from './itemDrop';
import { isPlayerExposedToWeather, isPlayerNearHeatSource, updatePlayerPhysics } from './physics';
import { PerformanceProfiler } from './profiler';
import { getMoonPhaseIndex, getMoonPhaseInfo, getSkyPeriodLabel, getWorldWeather, isAuroraNight, WorldRenderer } from './renderer';
import { EnemyManager } from './enemy';
import { WildlifeManager, WildlifeSpecies } from './wildlife';
import { Camera, DayNightCycle, GameStats, InputState, Player, RemotePlayerState, TileType, ActiveFoodBuff, WeatherType } from './types';
import { BIOMES, BiomeType } from './biomes';
import { SavedHome, WorldModifications } from './worldModifications';
import { TILE_DEFS } from './constants';
import { getBerryBushSeedDropCount, isEdibleItem, ItemType, MEAT_BUFFS, MEAT_NUTRITION } from './blocks';
import { getSwordDamage, isSwordItem } from './toolMining';
import { InteractiveObjectState, InteractiveObjectType, isPlayerTouchingPressurePlate, objectTypeForTile, worldObjectId } from './worldObjects';
import { HEALTH_REGEN_AMOUNT, HEALTH_REGEN_DELAY_MS, HEALTH_REGEN_INTERVAL_MS } from './healthRegeneration';

// TEMPORARY combat lifecycle diagnostics. Remove after reproducing the respawn issue.
const debugCombat = (event: string, data: Record<string, unknown>) =>
  console.info('[combat-debug][engine]', event, data);

export type GameState = 'TITLE' | 'PLAYING' | 'PAUSED' | 'DEAD';

export const ZOOM_LEVELS = [0.5, 0.6, 0.75, 0.85, 1.0, 1.25, 1.5, 1.75, 2.0];

interface PendingTeleport {
  x: number;
  y: number;
  chunkX: number;
  chunkY: number;
  destination: string;
  biomeId?: BiomeType;
  underground?: boolean;
  attempts?: number;
  isPlayerTeleport?: boolean;
}

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private renderer: WorldRenderer;

  public state: GameState = 'TITLE';
  public chunkManager!: ChunkManager;
  public player!: Player;
  public camera!: Camera;
  public cycle!: DayNightCycle;
  public inventory!: Inventory;
  public blockInteraction!: BlockInteraction;
  public itemDropManager!: ItemDropManager;
  public enemyManager: EnemyManager = new EnemyManager();
  public wildlifeManager: WildlifeManager = new WildlifeManager();
  public profiler: PerformanceProfiler = new PerformanceProfiler();
  public biomeMenuOpen: boolean = false;
  public home: SavedHome | null = null;
  public dpr: number = 1;
  public readonly developerTestMode: boolean;
  public readonly remotePlayers = new Map<string, RemotePlayerState>();
  public onWorldBlockModified?: (x: number, y: number, tile: TileType, dropItem?: ItemType | null) => void;
  public onPlayerHealthChanged?: (health: number, maxHealth: number, isAlive: boolean) => void;
  public onPlayerRespawned?: (x: number, y: number) => void;
  public onPickupRequested?: (dropId: number, type: ItemType, count: number) => void;
  public onDropSpawnRequested?: (type: ItemType, count: number, x: number, y: number) => void;
  public onTillDirtRequested?: (x: number, y: number, selectedSlotIndex: number) => void;
  public onFarmPlantRequested?: (x: number, y: number, seedType: ItemType) => void;
  public onFarmHarvestRequested?: (x: number, y: number) => void;
  public getWorldObjects?: () => Iterable<InteractiveObjectState>;
  public onEatRequested?: (type: ItemType) => void;
  public onStarvationDamageRequested?: () => void;
  public onPlayerDamageRequested?: (damage: number) => void;
  public onGrantTestKitRequested?: () => void;
  public onWildlifeAttackRequested?: (animalId: string, damage: number) => void;
  public onPlayerAttackRequested?: (attackId: string) => void;
  public multiplayerSession = false;
  public spawnPoint: { x: number; y: number } | null = null;
  /** Changes whenever a death or respawn ends the current combat life. */
  public combatLifeId = 0;
  public combatPlayerId?: string;
  public touchMode: 'mine' | 'place' = 'mine';
  public onTouchModeChanged?: (mode: 'mine' | 'place') => void;
  public isCreative: boolean = false;
  private lastJumpPressTime: number = 0;

  public setCreativeMode(enabled: boolean) {
    this.isCreative = enabled;
    this.blockInteraction.isCreative = enabled;
    if (this.player) {
      this.player.isCreative = enabled;
      if (!enabled) {
        this.player.isFlying = false;
      } else {
        this.player.health = 100;
        this.player.food = 100;
        this.player.stamina = 100;
      }
    }
  }

  public toggleFlight(): boolean {
    if (!this.isCreative) return false;
    this.player.isFlying = !this.player.isFlying;
    if (this.player.isFlying) {
      this.player.vy = -180;
    }
    return Boolean(this.player.isFlying);
  }

  public spawnAnimalAtPlayer(species: WildlifeSpecies): boolean {
    const spawnX = this.player.x + (this.player.facingRight ? 36 : -36);
    const spawnY = this.player.y;
    const success = this.wildlifeManager.spawnAnimal(species, spawnX, spawnY, this.chunkManager);
    if (success) {
      this.renderer.addDustParticles(spawnX, spawnY, 8, '#c084fc');
    }
    return success;
  }

  public spawnEnemyAtPlayer(type: 'slime' = 'slime'): boolean {
    const spawnX = this.player.x + (this.player.facingRight ? 36 : -36);
    const spawnY = this.player.y;
    const slime = this.enemyManager.spawnSlime(spawnX, spawnY, true);
    if (slime) {
      this.renderer.addDustParticles(spawnX, spawnY, 8, '#4ade80');
      return true;
    }
    return false;
  }

  public setTouchMode(mode: 'mine' | 'place') {
    this.touchMode = mode;
    this.onTouchModeChanged?.(mode);
  }

  public toggleTouchMode(): 'mine' | 'place' {
    const next = this.touchMode === 'mine' ? 'place' : 'mine';
    this.setTouchMode(next);
    return next;
  }

  // Weather Event Controls
  public weatherOverride: { type: WeatherType; intensity: number; expiresAt: number } | null = null;

  public triggerWeatherEvent(type: 'rain' | 'snow', durationSec: number = 45, intensity = 0.95) {
    this.weatherOverride = {
      type,
      intensity: Math.max(0.2, Math.min(1.0, intensity)),
      expiresAt: performance.now() + durationSec * 1000,
    };
  }

  public setWeatherOverride(type: WeatherType | null, intensity = 1.0) {
    if (type === null || type === 'clear') {
      this.weatherOverride = null;
    } else {
      this.weatherOverride = {
        type,
        intensity: Math.max(0.1, Math.min(1.0, intensity)),
        expiresAt: performance.now() + 3600 * 1000,
      };
    }
  }

  public isVirtualMining = false;
  private initialPinchDist = 0;
  private lastPinchZoomTime = 0;

  private lastSyncedHealth: number = 100;
  private lastSyncedAlive: boolean = true;

  public notifyHealthChanged(force = false) {
    if (!this.player) return;
    const isAlive = this.player.health > 0;
    if (force || Math.abs(this.player.health - this.lastSyncedHealth) >= 1.0 || isAlive !== this.lastSyncedAlive) {
      this.lastSyncedHealth = this.player.health;
      this.lastSyncedAlive = isAlive;
      this.onPlayerHealthChanged?.(this.player.health, this.player.maxHealth, isAlive);
    }
  }

  // Zoom system
  public zoomIndex: number = 4; // index 4 = 1.0 (100%)
  public get currentZoom(): number {
    return ZOOM_LEVELS[this.zoomIndex];
  }

  public input: InputState = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    jumpJustPressed: false,
  };

  private animationFrameId: number | null = null;
  private lastTime: number = 0;
  private timeSec: number = 0;
  private autosaveTimer: number = 0;
  private statsTimer: number = 0;
  private currentWeatherExposure = false;
  private currentNearWarmth = false;
  private pendingTeleport: PendingTeleport | null = null;
  private teleportStatus: string = '';
  private lastHomeSetAt: number = 0;
  private magmaDamageTimer: number = 0;
  private recentDamageTimer: number = 0;
  private healthRegenerationTimer: number = 0;
  private starvationTimer: number = 0;
  private weatherAudioTimer: number = 0;
  private swimAudioTimer: number = 0;
  private sprintExhausted = false;
  private testAnimalSerial = 0;
  private testGroundY: number | null = null;
  private testPoolSurfaceY: number | null = null;

  // Callbacks
  public onStatsUpdate?: (stats: GameStats) => void;
  public onStateChange?: (state: GameState) => void;
  public onMiningNotice?: (message: string) => void;
  public onInventoryChanged?: () => void;
  public onOpenCraftingBench?: () => void;
  public onChestInteract?: (x: number, y: number) => void;
  public onWorldObjectInteract?: (x: number, y: number, type: InteractiveObjectType) => void;
  public onPressurePlateStateChanged?: (x: number, y: number, pressed: boolean) => void;
  public onAutosaveSnapshot?: () => void;
  private localPressurePlates = new Map<string, { x: number; y: number }>();

  constructor(canvas: HTMLCanvasElement, developerTestMode = false) {
    this.developerTestMode = developerTestMode;
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Could not get 2D canvas context');
    this.ctx = context;
    this.renderer = new WorldRenderer();
    this.inventory = new Inventory();
    this.blockInteraction = new BlockInteraction();
    this.itemDropManager = new ItemDropManager();

    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    this.initWorld();
    this.setupEventListeners();
    this.setupInteractionCallbacks();
  }

  /** Test-only resources are inserted through the production Inventory API. */
  public grantDeveloperTestKit(): boolean {
    if (!this.developerTestMode) return false;
    if (this.multiplayerSession) {
      this.onGrantTestKitRequested?.();
      return true;
    }
    const kit: Array<[Parameters<Inventory['addItem']>[0], number]> = [
      ['wood', 40], ['stone', 40], ['coal', 20], ['copper', 20], ['iron', 20], ['gold', 20],
      ['copper_bar', 16], ['iron_bar', 16], ['gold_bar', 16],
      ['crystal', 20], ['diamond', 12], ['stick', 40], ['planks', 64], ['dirt', 24],
      ['crafting_table', 2], ['furnace', 1], ['venison', 4], ['rabbit_meat', 4], ['boar_meat', 4],
      ['fox_meat', 4], ['bird_meat', 4], ['fish', 4],
      ['wolf_meat', 4], ['bear_meat', 4], ['lion_meat', 4], ['crocodile_meat', 4], ['mammoth_meat', 4],
      ['wolf_skull', 2], ['bear_skull', 2], ['lion_skull', 2], ['crocodile_skull', 2], ['mammoth_skull', 2], ['animal_skeleton', 2], ['bone', 16],
      ['pressure_plate', 4], ['trapdoor', 4], ['gate', 4], ['bridge', 8], ['rope', 16],
    ];
    return kit.every(([item, amount]) => this.inventory.addItem(item, amount));
  }

  /** Builds a small fixture around the player in an explicitly selected test world. */
  public prepareDeveloperTestArea(): boolean {
    if (!this.developerTestMode) return false;
    const playerBlock = Math.floor((this.player.x + this.player.width / 2) / TILE_SIZE);
    const baseX = playerBlock + 4;
    const baseSurface = this.chunkManager.terrainGen.getSurfaceHeight(baseX);
    // Flatten and clear a long protected path around the player for repeatable tests.
    const spawnSurface = this.chunkManager.terrainGen.getSurfaceHeight(playerBlock);
    this.testGroundY = spawnSurface;
    for (let x = playerBlock - 150; x < baseX; x++) {
      for (let y = spawnSurface - 1; y >= spawnSurface - 4; y--) this.chunkManager.setBlock(x, y, TileType.AIR);
      this.chunkManager.setBlock(x, spawnSurface, TileType.STONE);
    }
    const ores = [TileType.STONE, TileType.COAL_ORE, TileType.COPPER_ORE, TileType.IRON_ORE, TileType.GOLD_ORE, TileType.CRYSTAL_ORE];
    ores.forEach((tile, index) => {
      const x = baseX + index;
      for (let y = spawnSurface - 4; y <= spawnSurface + 4; y++) this.chunkManager.setBlock(x, y, TileType.AIR);
      this.chunkManager.setBlock(x, spawnSurface - 1, tile);
    });
    // A shallow, bounded cave access with a small underground water pocket.
    const caveX = baseX + 9;
    for (let x = caveX; x < caveX + 7; x++) {
      for (let y = baseSurface + 1; y <= baseSurface + 4; y++) this.chunkManager.setBlock(x, y, TileType.AIR);
      this.chunkManager.setBlock(x, baseSurface + 5, TileType.STONE);
    }
    for (let x = caveX + 2; x < caveX + 5; x++) {
      for (let y = baseSurface + 3; y <= baseSurface + 4; y++) this.chunkManager.setBlock(x, y, TileType.WATER);
    }
    // Safe surface platform and adjacent water pool for the test wildlife.
    const animalX = baseX + 18;
    for (let x = animalX; x < animalX + 10; x++) {
      const surface = this.chunkManager.terrainGen.getSurfaceHeight(x);
      this.chunkManager.setBlock(x, surface, TileType.STONE);
    }
    const poolX = animalX + 5;
    const poolSurface = this.chunkManager.terrainGen.getSurfaceHeight(poolX);
    this.testPoolSurfaceY = poolSurface;
    for (let x = poolX; x < poolX + 4; x++) {
      for (let y = poolSurface - 3; y < poolSurface; y++) this.chunkManager.setBlock(x, y, TileType.WATER);
    }
    this.player.x = playerBlock * TILE_SIZE + (TILE_SIZE - this.player.width) / 2;
    this.player.y = spawnSurface * TILE_SIZE - this.player.height;
    this.player.vx = 0;
    this.player.vy = 0;
    return true;
  }

  public spawnDeveloperTestAnimal(species: WildlifeSpecies): boolean {
    if (!this.developerTestMode) return false;
    if (this.testGroundY === null || this.testPoolSurfaceY === null) return false;
    const playerRightBlock = Math.floor((this.player.x + this.player.width) / TILE_SIZE);
    const width: Record<WildlifeSpecies, number> = { deer: 18, rabbit: 13, boar: 18, fox: 16, bird: 13, fish: 13, wolf: 22, crocodile: 34, lion: 26, bear: 32, mammoth: 48 };
    const height: Record<WildlifeSpecies, number> = { deer: 17, rabbit: 12, boar: 13, fox: 13, bird: 9, fish: 8, wolf: 16, crocodile: 14, lion: 20, bear: 24, mammoth: 38 };
    // Land fixtures spawn close enough to attack; the fish goes in the pool
    // created by prepareDeveloperTestArea.
    const animalX = playerRightBlock + 2 + this.testAnimalSerial++ * 2;
    const fishX = playerRightBlock + 32;
    const baseX = species === 'fish' ? fishX : animalX;
    const x = baseX * TILE_SIZE;
    const poolSurface = this.testPoolSurfaceY;
    const groundY = this.testGroundY;
    const y = species === 'fish' ? (poolSurface - 2) * TILE_SIZE : groundY * TILE_SIZE - height[species];
    return this.wildlifeManager.spawnTestAnimal(species, x, y, this.chunkManager);
  }

  public developerTestAttack(): boolean {
    if (!this.developerTestMode) return false;
    this.performSwordAttack();
    return true;
  }

  public developerTestDamage(amount = 25): boolean {
    if (!this.developerTestMode) return false;
    this.handlePlayerDamage(amount, this.player.x, this.player.y);
    return true;
  }

  public developerTestSpawnSlime(): boolean {
    if (!this.developerTestMode) return false;
    const slime = this.enemyManager.spawnSlime(this.player.x + 36, this.player.y);
    return !!slime;
  }

  private setupInteractionCallbacks() {
    this.blockInteraction.onToolRequirement = (message) => this.onMiningNotice?.(message);
    this.blockInteraction.onTillDirt = (bx, by) => {
      if (this.multiplayerSession) {
        this.onTillDirtRequested?.(bx, by, this.inventory.activeSlot);
        return;
      }
      const tile = this.chunkManager.getTile(bx, by);
      if (tile !== TileType.DIRT && tile !== TileType.GRASS) return;
      this.chunkManager.setBlock(bx, by, TileType.TILLED_SOIL);
      this.chunkManager.modifications.saveToLocalStorage(this.chunkManager.seed);
      this.saveLocalState();
      this.renderer.addDustParticles(bx * TILE_SIZE + 8, by * TILE_SIZE + 8, 4, '#a86f3d');
    };
    this.blockInteraction.onBlockMined = (bx, by, dropItem) => {
      const minedTile = this.chunkManager.getTile(bx, by);
      this.chunkManager.setBlock(bx, by, TileType.AIR);
      this.chunkManager.modifications.saveToLocalStorage(this.chunkManager.seed);
      this.onWorldBlockModified?.(bx, by, TileType.AIR, dropItem);
      if (dropItem) {
        if (!this.multiplayerSession) {
          // Physical Item Drop in the world in single player
          this.itemDropManager.spawnDrop(dropItem, bx * TILE_SIZE + 4, by * TILE_SIZE + 4, 1);
        }
      }
      if (!this.multiplayerSession && minedTile === TileType.BERRY_BUSH) {
        const seedCount = getBerryBushSeedDropCount(this.chunkManager.seed, bx, by);
        if (seedCount > 0) this.itemDropManager.spawnDrop('berry_seed', bx * TILE_SIZE + 4, by * TILE_SIZE + 4, seedCount);
      }
      this.saveLocalState();
      this.renderer.addDustParticles(bx * TILE_SIZE + 8, by * TILE_SIZE + 8, 4, '#854d0e');
    };

    this.blockInteraction.onBlockPlaced = (bx, by, tile) => {
      this.chunkManager.setBlock(bx, by, tile);
      this.chunkManager.modifications.saveToLocalStorage(this.chunkManager.seed);
      this.onWorldBlockModified?.(bx, by, tile);
      this.saveLocalState();
      this.renderer.addDustParticles(bx * TILE_SIZE + 8, by * TILE_SIZE + 8, 3, '#86efac');
    };
  }

  public showWorldObjectFeedback(x: number, y: number, color = '#86efac') {
    this.renderer.addDustParticles(x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2, 4, color);
  }

  private updateLocalPressurePlates() {
    if (this.multiplayerSession) return;
    const player = this.player;
    const feetY = player.y + player.height;
    const plateY = Math.round(feetY / TILE_SIZE);
    const touching = new Map<string, { x: number; y: number }>();
    if (Math.abs(feetY - plateY * TILE_SIZE) <= 3) {
      const left = Math.floor(player.x / TILE_SIZE);
      const right = Math.floor((player.x + player.width - 0.01) / TILE_SIZE);
      for (let x = left; x <= right; x++) {
        if (!isPlayerTouchingPressurePlate(player.x, player.y, player.width, player.height, x, plateY)) continue;
        const tile = this.chunkManager.getTile(x, plateY);
        if (tile !== TileType.PRESSURE_PLATE && tile !== TileType.PRESSURE_PLATE_PRESSED) continue;
        const id = worldObjectId(this.chunkManager.seed, x, plateY, 'pressure_plate');
        touching.set(id, { x, y: plateY });
      }
    }
    for (const [id, plate] of this.localPressurePlates) {
      if (touching.has(id)) continue;
      if (this.chunkManager.getTile(plate.x, plate.y) === TileType.PRESSURE_PLATE_PRESSED) {
        this.chunkManager.setBlock(plate.x, plate.y, TileType.PRESSURE_PLATE);
        this.onPressurePlateStateChanged?.(plate.x, plate.y, false);
      }
    }
    for (const [id, plate] of touching) {
      if (this.localPressurePlates.has(id)) continue;
      if (this.chunkManager.getTile(plate.x, plate.y) !== TileType.PRESSURE_PLATE_PRESSED) {
        this.chunkManager.setBlock(plate.x, plate.y, TileType.PRESSURE_PLATE_PRESSED);
      }
      this.onPressurePlateStateChanged?.(plate.x, plate.y, true);
    }
    this.localPressurePlates = touching;
  }

  public initWorld(seed: number = WorldModifications.loadCurrentSeed() ?? 932248, multiplayerSession = false, initialSpawnX?: number, initialSpawnY?: number) {
    this.multiplayerSession = multiplayerSession;
    this.localPressurePlates.clear();
    if (!multiplayerSession) WorldModifications.saveCurrentSeed(seed);
    this.chunkManager = new ChunkManager(seed, !multiplayerSession);
    this.home = this.chunkManager.modifications.loadHome(seed);
    this.lastHomeSetAt = this.home?.savedAt || 0;
    this.pendingTeleport = null;
    this.teleportStatus = '';
    this.sprintExhausted = false;
    this.itemDropManager = new ItemDropManager();
    this.itemDropManager.onLocalPickup = () => {
      this.onInventoryChanged?.();
    };
    if (multiplayerSession) {
      this.itemDropManager.onPickup = (dropId, type, count) => {
        this.onPickupRequested?.(dropId, type, count);
      };
      this.itemDropManager.onDropSpawned = (drop) => {
        this.onDropSpawnRequested?.(drop.type, drop.count, drop.x, drop.y);
      };
    }
    this.enemyManager.clear();
    this.wildlifeManager.clear();
    this.wildlifeManager.isMultiplayer = multiplayerSession;

    let spawnBlockX: number;
    let spawnSurfaceY: number;
    let spawnPixelX: number;
    let spawnPixelY: number;

    if (typeof initialSpawnX === 'number' && typeof initialSpawnY === 'number') {
      spawnPixelX = initialSpawnX;
      spawnPixelY = initialSpawnY;
      spawnBlockX = Math.floor(initialSpawnX / TILE_SIZE);
      spawnSurfaceY = Math.floor(initialSpawnY / TILE_SIZE);
      this.spawnPoint = { x: initialSpawnX, y: initialSpawnY };
    } else {
      spawnBlockX = 0;
      spawnSurfaceY = this.chunkManager.terrainGen.getSurfaceHeight(spawnBlockX);
      spawnPixelX = spawnBlockX * TILE_SIZE;
      spawnPixelY = (spawnSurfaceY - 2) * TILE_SIZE;
      this.spawnPoint = { x: spawnPixelX, y: spawnPixelY };
    }

    this.chunkManager.preloadImmediateArea(spawnBlockX, spawnSurfaceY);

    this.player = {
      x: spawnPixelX,
      y: spawnPixelY,
      vx: 0,
      vy: 0,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      isGrounded: true,
      wasGrounded: true,
      facingRight: true,
      animFrame: 0,
      animTimer: 0,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
      state: 'idle',
      health: 100,
      maxHealth: 100,
      food: 100,
      maxFood: 100,
      stamina: 100,
      maxStamina: 100,
      isSprinting: false,
      invulnerableTimer: 0,
      flashTimer: 0,
      isAttacking: false,
      attackTimer: 0,
      attackCooldown: 0,
      activeBuffs: [],
    };

    const viewportW = (this.canvas.width / this.dpr) / this.currentZoom;
    const viewportH = (this.canvas.height / this.dpr) / this.currentZoom;

    this.camera = {
      x: this.player.x - viewportW / 2,
      y: this.player.y - viewportH / 2,
      targetX: this.player.x - viewportW / 2,
      targetY: this.player.y - viewportH / 2,
      width: viewportW,
      height: viewportH,
      zoom: this.currentZoom,
    };

    const initialTime = (!this.developerTestMode && !multiplayerSession) ? 0.44 : 0.15;
    const initialLightCurve = (Math.cos((initialTime - 0.25) * Math.PI * 2) + 1) / 2;
    this.cycle = {
      time: initialTime,
      day: 1,
      speed: 1 / DAY_CYCLE_DURATION_SEC,
      sunAngle: 0,
      moonAngle: 0,
      ambientLight: 0.18 + initialLightCurve * 0.82,
      moonPhaseIndex: getMoonPhaseIndex(1),
    };

    if (!multiplayerSession && !this.developerTestMode) {
      this.inventory = new Inventory();
      this.loadLocalState(seed);
    }
  }

  public saveLocalState() {
    if (this.developerTestMode) return;
    if (!this.multiplayerSession && this.chunkManager && this.player && this.cycle) {
      this.chunkManager.modifications.saveToLocalStorage(this.chunkManager.seed);
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const payload = {
            seed: this.chunkManager.seed,
            x: Math.round(this.player.x * 10) / 10,
            y: Math.round(this.player.y * 10) / 10,
            facingRight: this.player.facingRight,
            health: Math.max(1, Math.min(100, Math.round(this.player.health))),
            food: Math.max(0, Math.min(100, Math.round(this.player.food))),
            stamina: Math.max(0, Math.min(100, Math.round(this.player.stamina))),
            day: this.cycle.day,
            time: this.cycle.time,
            inventory: this.inventory.toJSON(),
            updatedAt: Date.now(),
          };
          window.localStorage.setItem(`pixel_frontier_player_state_${this.chunkManager.seed}`, JSON.stringify(payload));
        }
      } catch {
        // Ignore storage errors
      }
    }
    this.onAutosaveSnapshot?.();
  }

  public loadLocalState(seed: number): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return false;
      const raw = window.localStorage.getItem(`pixel_frontier_player_state_${seed}`);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || parsed.seed !== seed) return false;
      if (typeof parsed.x === 'number' && Number.isFinite(parsed.x) && typeof parsed.y === 'number' && Number.isFinite(parsed.y)) {
        this.player.x = parsed.x;
        this.player.y = parsed.y;
        const pBlockX = Math.floor(this.player.x / TILE_SIZE);
        const pBlockY = Math.floor(this.player.y / TILE_SIZE);
        this.chunkManager.preloadImmediateArea(pBlockX, pBlockY);
        this.camera.targetX = this.player.x + this.player.width / 2 - this.camera.width / 2;
        this.camera.targetY = this.player.y + this.player.height / 2 - this.camera.height / 2;
        this.camera.x = this.camera.targetX;
        this.camera.y = this.camera.targetY;
      }
      if (typeof parsed.facingRight === 'boolean') this.player.facingRight = parsed.facingRight;
      if (typeof parsed.health === 'number' && Number.isFinite(parsed.health) && parsed.health > 0) {
        this.player.health = Math.max(1, Math.min(100, parsed.health));
      }
      if (typeof parsed.food === 'number' && Number.isFinite(parsed.food)) {
        this.player.food = Math.max(0, Math.min(100, parsed.food));
      }
      if (typeof parsed.stamina === 'number' && Number.isFinite(parsed.stamina)) {
        this.player.stamina = Math.max(0, Math.min(100, parsed.stamina));
      }
      if (typeof parsed.time === 'number' && Number.isFinite(parsed.time) && typeof parsed.day === 'number' && Number.isFinite(parsed.day)) {
        this.setTime(parsed.time, Math.max(1, Math.floor(parsed.day)));
      }
      if (parsed.inventory && typeof parsed.inventory === 'object') {
        this.inventory.loadFromJSON(parsed.inventory as any);
      }
      return true;
    } catch {
      return false;
    }
  }

  public setTime(time: number, day: number) {
    if (!this.cycle) return;
    this.cycle.time = time;
    this.cycle.day = day;
    this.cycle.moonPhaseIndex = getMoonPhaseIndex(day);
    const lightCurve = (Math.cos((this.cycle.time - 0.25) * Math.PI * 2) + 1) / 2;
    this.cycle.ambientLight = 0.18 + lightCurve * 0.82;
  }

  public setBiomeMenuOpen(open: boolean) {
    this.biomeMenuOpen = open;
  }

  public setHome(): { success: boolean; cooldownRemainingMs: number } {
    const now = Date.now();
    const cooldownRemainingMs = Math.max(0, 500 - (now - this.lastHomeSetAt));
    if (cooldownRemainingMs > 0) {
      this.emitStats(Math.floor(this.player.x / TILE_SIZE), Math.floor(this.player.y / TILE_SIZE));
      return { success: false, cooldownRemainingMs };
    }

    const x = this.player.x;
    const y = this.player.y;
    this.home = this.chunkManager.modifications.saveHome(this.chunkManager.seed, x, y) || {
      x, y, seed: this.chunkManager.seed, savedAt: now,
    };
    this.lastHomeSetAt = this.home.savedAt;
    this.teleportStatus = 'Home saved';
    this.emitStats(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));
    return { success: true, cooldownRemainingMs: 0 };
  }

  public deleteHome(): boolean {
    if (!this.chunkManager.modifications.deleteHome(this.chunkManager.seed)) return false;
    this.home = null;
    this.teleportStatus = '';
    this.emitStats(Math.floor(this.player.x / TILE_SIZE), Math.floor(this.player.y / TILE_SIZE));
    return true;
  }

  public teleportToBiome(biomeId: BiomeType): boolean {
    if (!BIOMES[biomeId] || this.pendingTeleport) return false;
    this.cancelPendingTeleport();
    const startX = Math.floor(this.player.x / TILE_SIZE);
    if (BIOMES[biomeId].underground) {
      const maxDistance = 40000;
      for (let distance = 0; distance <= maxDistance; distance += CHUNK_WIDTH) {
        const candidates = distance === 0 ? [startX] : [startX + distance, startX - distance];
        for (const blockX of candidates) {
          const surfaceY = this.chunkManager.terrainGen.getSurfaceHeight(blockX);
          for (let standY = Math.max(surfaceY + 32, 105); standY < 210; standY += 6) {
            const airY = standY - 1;
            if (this.chunkManager.terrainGen.getBiomeAt(blockX, airY).id !== biomeId || !this.chunkManager.terrainGen.isCave(blockX, airY, surfaceY)) continue;
            const x = blockX * TILE_SIZE + (TILE_SIZE - this.player.width) / 2;
            const y = standY * TILE_SIZE - this.player.height;
            if (!this.isSafePlayerPosition(x, y)) continue;
            const left = Math.floor(x / TILE_SIZE);
            const right = Math.floor((x + this.player.width - .01) / TILE_SIZE);
            if ([left, right].every((tx) => TILE_DEFS[this.chunkManager.getTile(tx, standY)]?.isSolid)) {
              this.requestTeleport(x, y, BIOMES[biomeId].name, biomeId, true);
              return true;
            }
          }
        }
      }
      this.teleportStatus = `Could not find a safe ${BIOMES[biomeId].name} location`;
      this.emitStats(Math.floor(this.player.x / TILE_SIZE), Math.floor(this.player.y / TILE_SIZE));
      return false;
    }
    const maxDistance = 200000;
    const step = CHUNK_WIDTH;

    for (let distance = 0; distance <= maxDistance; distance += step) {
      const candidates = distance === 0 ? [startX] : [startX + distance, startX - distance];
      for (const blockX of candidates) {
        if (this.chunkManager.terrainGen.getColumnBiome(blockX).id !== biomeId) continue;
        const surfaceY = this.chunkManager.terrainGen.getSurfaceHeight(blockX);
        const position = this.findSafeBiomePosition(blockX, surfaceY, biomeId);
        if (position) {
          this.requestTeleport(position.x, position.y, BIOMES[biomeId].name, biomeId);
          return true;
        }
      }
    }

    this.teleportStatus = `Could not find a safe ${BIOMES[biomeId].name} location`;
    this.emitStats(Math.floor(this.player.x / TILE_SIZE), Math.floor(this.player.y / TILE_SIZE));
    return false;
  }

  public teleportHome(): boolean {
    if (!this.home || this.home.seed !== this.chunkManager.seed) return false;
    this.cancelPendingTeleport();

    let position: { x: number; y: number } | null = null;
    if (this.isSafePlayerPosition(this.home.x, this.home.y)) {
      position = { x: this.home.x, y: this.home.y };
    } else {
      const homeBlockX = Math.floor(this.home.x / TILE_SIZE);
      const homeBlockY = Math.floor(this.home.y / TILE_SIZE);
      for (let radius = 1; radius <= 12 && !position; radius++) {
        const offsets: Array<[number, number]> = [];
        for (let dx = -radius; dx <= radius; dx++) {
          const dy = radius - Math.abs(dx);
          offsets.push([dx, dy]);
          if (dy !== 0) offsets.push([dx, -dy]);
        }
        for (const [dx, dy] of offsets) {
          const x = (homeBlockX + dx) * TILE_SIZE + (TILE_SIZE - this.player.width) / 2;
          const y = (homeBlockY + dy) * TILE_SIZE;
          if (this.isSafePlayerPosition(x, y)) {
            position = { x, y };
            break;
          }
        }
      }
    }

    if (!position) {
      this.teleportStatus = 'No safe position near Home';
      this.emitStats(Math.floor(this.player.x / TILE_SIZE), Math.floor(this.player.y / TILE_SIZE));
      return false;
    }

    this.requestTeleport(position.x, position.y, 'Home');
    return true;
  }

  public teleportToPosition(x: number, y: number, destination: string, isPlayerTeleport = false): boolean {
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 10_000_000 || Math.abs(y) > 10_000_000) return false;
    this.cancelPendingTeleport();
    this.requestTeleport(x, y, destination.slice(0, 32) || 'Destination', undefined, false, 0, isPlayerTeleport);
    return true;
  }

  private findSafeSurfacePosition(blockX: number, surfaceY: number, biomeId: BiomeType): { x: number; y: number } | null {
    for (let offset = 0; offset <= 12; offset++) {
      const columns = offset === 0 ? [blockX] : [blockX + offset, blockX - offset];
      for (const candidateX of columns) {
        if (this.chunkManager.terrainGen.getColumnBiome(candidateX).id !== biomeId) continue;
        const y = this.chunkManager.terrainGen.getSurfaceHeight(candidateX);
        const xPixel = candidateX * TILE_SIZE + (TILE_SIZE - this.player.width) / 2;
        const yPixel = y * TILE_SIZE - this.player.height;
        if (!this.isSafePlayerPosition(xPixel, yPixel)) continue;

        const leftTile = Math.floor(xPixel / TILE_SIZE);
        const rightTile = Math.floor((xPixel + this.player.width - 0.01) / TILE_SIZE);
        let supported = true;
        for (let tx = leftTile; tx <= rightTile; tx++) {
          if (!TILE_DEFS[this.chunkManager.getTile(tx, y)]?.isSolid) {
            supported = false;
            break;
          }
        }
        if (supported) return { x: xPixel, y: yPixel };
      }
    }
    return null;
  }

  private findSafeBiomePosition(blockX: number, surfaceY: number, biomeId: BiomeType): { x: number; y: number } | null {
    // Fully submerged ocean biomes have no dry terrain to stand on. Start
    // just above their deterministic waterline; arrival is checked again
    // against the generated chunk, and water remains passable.
    const waterLevel = BIOMES[biomeId].waterLevel;
    if (waterLevel !== undefined && surfaceY > waterLevel) {
      const x = blockX * TILE_SIZE + (TILE_SIZE - this.player.width) / 2;
      const y = waterLevel * TILE_SIZE - this.player.height;
      if (this.isSafePlayerPosition(x, y)) return { x, y };
    }
    return this.findSafeSurfacePosition(blockX, surfaceY, biomeId);
  }

  private isSafePlayerPosition(x: number, y: number): boolean {
    const left = Math.floor(x / TILE_SIZE);
    const right = Math.floor((x + this.player.width - 0.01) / TILE_SIZE);
    const top = Math.floor(y / TILE_SIZE);
    const bottom = Math.floor((y + this.player.height - 0.01) / TILE_SIZE);
    const treeOrHazardTiles = new Set<TileType>([
      TileType.WOOD, TileType.LEAVES, TileType.BIRCH_WOOD, TileType.BIRCH_LEAVES, TileType.CACTUS,
      TileType.ACACIA_WOOD, TileType.ACACIA_LEAVES, TileType.BAMBOO, TileType.CHERRY_WOOD, TileType.CHERRY_LEAVES,
      TileType.CORAL, TileType.GLOWING_CRYSTAL, TileType.GLOWING_MUSHROOM, TileType.VINE, TileType.PALM_WOOD, TileType.PALM_LEAVES,
      TileType.WATER, TileType.MAGMA,
    ]);
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        const tile = this.chunkManager.getTile(tx, ty);
        if (TILE_DEFS[tile]?.isSolid || treeOrHazardTiles.has(tile)) return false;
      }
    }
    return true;
  }

  private isSafePlayerTeleportPosition(x: number, y: number): boolean {
    const left = Math.floor(x / TILE_SIZE);
    const right = Math.floor((x + this.player.width - 0.01) / TILE_SIZE);
    const top = Math.floor(y / TILE_SIZE);
    const bottom = Math.floor((y + this.player.height - 0.01) / TILE_SIZE);
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        const tile = this.chunkManager.getTile(tx, ty);
        if (TILE_DEFS[tile]?.isSolid || tile === TileType.MAGMA) return false;
      }
    }
    return true;
  }

  private requestTeleport(x: number, y: number, destination: string, biomeId?: BiomeType, underground = false, attempts = 0, isPlayerTeleport = false) {
    const chunkX = Math.floor(x / TILE_SIZE / CHUNK_WIDTH);
    const chunkY = Math.floor(y / TILE_SIZE / CHUNK_HEIGHT);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        this.chunkManager.requestChunk(chunkX + dx, chunkY + dy);
      }
    }
    this.chunkManager.processQueue(CHUNK_GEN_TIME_BUDGET_MS);
    this.pendingTeleport = { x, y, chunkX, chunkY, destination, biomeId, underground, attempts, isPlayerTeleport };
    this.teleportStatus = `Preparing ${destination}…`;
    this.tryCompletePendingTeleport();
    this.emitStats(Math.floor(this.player.x / TILE_SIZE), Math.floor(this.player.y / TILE_SIZE));
  }

  private cancelPendingTeleport() {
    if (!this.pendingTeleport) return;
    this.chunkManager.releaseChunk(this.pendingTeleport.chunkX, this.pendingTeleport.chunkY);
    this.pendingTeleport = null;
  }

  private tryCompletePendingTeleport() {
    const pending = this.pendingTeleport;
    if (!pending || !this.chunkManager.loadedChunks.has(ChunkManager.getChunkKey(pending.chunkX, pending.chunkY))) return;

    let targetX = pending.x;
    let targetY = pending.y;

    if (pending.isPlayerTeleport) {
      const testOffsets = [
        { dx: 0, dy: 0 },
        { dx: 0, dy: -8 },
        { dx: 0, dy: -16 },
        { dx: 0, dy: -24 },
        { dx: -12, dy: 0 },
        { dx: 12, dy: 0 },
        { dx: -12, dy: -8 },
        { dx: 12, dy: -8 },
      ];
      let safeFound = false;
      for (const off of testOffsets) {
        const tx = pending.x + off.dx;
        const ty = pending.y + off.dy;
        if (this.isSafePlayerTeleportPosition(tx, ty)) {
          targetX = tx;
          targetY = ty;
          safeFound = true;
          break;
        }
      }
      if (!safeFound) {
        targetX = pending.x;
        targetY = pending.y;
      }
    } else {
      const biomeX = Math.floor((pending.x + this.player.width / 2) / TILE_SIZE);
      const biomeY = Math.floor((pending.y + this.player.height - 1) / TILE_SIZE);
      const currentBiome = pending.underground
        ? this.chunkManager.terrainGen.getBiomeAt(biomeX, biomeY).id
        : this.chunkManager.terrainGen.getColumnBiome(biomeX).id;
      const stillSafe = this.isSafePlayerPosition(pending.x, pending.y) &&
        (pending.biomeId === undefined || currentBiome === pending.biomeId);
      if (!stillSafe) {
        this.chunkManager.releaseChunk(pending.chunkX, pending.chunkY);
        this.pendingTeleport = null;
        if (pending.biomeId && !pending.underground && (pending.attempts || 0) < 8) {
          const blockX = Math.floor(pending.x / TILE_SIZE);
          const surfaceY = this.chunkManager.terrainGen.getSurfaceHeight(blockX);
          const alternate = this.findSafeBiomePosition(blockX, surfaceY, pending.biomeId);
          if (alternate && (Math.abs(alternate.x - pending.x) > TILE_SIZE || Math.abs(alternate.y - pending.y) > TILE_SIZE)) {
            this.requestTeleport(alternate.x, alternate.y, pending.destination, pending.biomeId, false, (pending.attempts || 0) + 1);
            return;
          }
        }
        this.teleportStatus = `No safe location found for ${pending.destination}`;
        this.emitStats(Math.floor(this.player.x / TILE_SIZE), Math.floor(this.player.y / TILE_SIZE));
        return;
      }
    }

    this.chunkManager.releaseChunk(pending.chunkX, pending.chunkY);
    this.pendingTeleport = null;
    this.player.x = targetX;
    this.player.y = targetY;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.coyoteTimer = 0;
    this.player.jumpBufferTimer = 0;
    this.player.isGrounded = true;
    this.player.wasGrounded = true;
    this.player.state = 'idle';
    const playerBlockX = Math.floor(this.player.x / TILE_SIZE);
    const playerBlockY = Math.floor(this.player.y / TILE_SIZE);
    this.chunkManager.updatePlayerPosition(playerBlockX, playerBlockY);
    this.chunkManager.processQueue(CHUNK_GEN_TIME_BUDGET_MS * 2);
    this.camera.targetX = this.player.x + this.player.width / 2 - this.camera.width / 2;
    this.camera.targetY = this.player.y + this.player.height / 2 - this.camera.height / 2;
    this.camera.x = this.camera.targetX;
    this.camera.y = this.camera.targetY;
    this.teleportStatus = `Arrived at ${pending.destination}`;
    this.emitStats(playerBlockX, playerBlockY);
  }

  public zoomIn(): number {
    if (this.zoomIndex < ZOOM_LEVELS.length - 1) {
      this.zoomIndex++;
      this.applyZoom();
    }
    return this.currentZoom;
  }

  public zoomOut(): number {
    if (this.zoomIndex > 0) {
      this.zoomIndex--;
      this.applyZoom();
    }
    return this.currentZoom;
  }

  public resetZoom(): number {
    this.zoomIndex = 4; // 1.0
    this.applyZoom();
    return this.currentZoom;
  }

  private applyZoom() {
    this.camera.zoom = this.currentZoom;
    const displayW = this.canvas.width / this.dpr;
    const displayH = this.canvas.height / this.dpr;
    this.camera.width = displayW / this.currentZoom;
    this.camera.height = displayH / this.currentZoom;
  }

  public start(initialState: GameState = 'PLAYING') {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.state = initialState;
    this.onStateChange?.(this.state);
    if (initialState === 'PLAYING') {
      sound.playStartGame();
    }
    this.lastTime = 0;
    this.profiler.reset();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  public pause() {
    if (this.state === 'PLAYING') {
      this.state = 'PAUSED';
      if (this.animationFrameId !== null) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.chunkManager.modifications.saveToLocalStorage(this.chunkManager.seed);
      this.onStateChange?.(this.state);
    }
  }

  public resume() {
    if (this.state === 'PAUSED') {
      this.state = 'PLAYING';
      this.onStateChange?.(this.state);
      this.lastTime = 0;
      if (this.animationFrameId === null) {
        this.animationFrameId = requestAnimationFrame(this.loop);
      }
    }
  }

  public togglePause() {
    if (this.state === 'PLAYING') {
      this.pause();
    } else if (this.state === 'PAUSED') {
      this.resume();
    }
  }

  public restart() {
    this.chunkManager.modifications.saveToLocalStorage(this.chunkManager.seed);
    const newSeed = Math.floor(Math.random() * 1000000);
    this.inventory = new Inventory();
    this.initWorld(newSeed, this.multiplayerSession);
    this.profiler.reset();
    sound.playStartGame();
    if (this.state === 'PAUSED' || this.state === 'TITLE' || this.state === 'DEAD') {
      this.state = 'PLAYING';
      this.onStateChange?.(this.state);
      this.lastTime = 0;
      if (this.animationFrameId === null) {
        this.animationFrameId = requestAnimationFrame(this.loop);
      }
    }
  }

  public respawn() {
    debugCombat('respawn.begin', { playerId: this.combatPlayerId, lifeId: this.combatLifeId, health: this.player.health, alive: this.player.health > 0, x: this.player.x, y: this.player.y, state: this.state, multiplayer: this.multiplayerSession });
    if (!this.multiplayerSession) this.combatLifeId++;
    this.wildlifeManager.clearCombatState(this.multiplayerSession ? this.combatPlayerId : undefined);
    if (this.home) {
      this.player.x = this.home.x;
      this.player.y = this.home.y;
    } else if (this.spawnPoint) {
      this.player.x = this.spawnPoint.x;
      this.player.y = this.spawnPoint.y;
    } else {
      const spawnBlockX = 0;
      const spawnSurfaceY = this.chunkManager.terrainGen.getSurfaceHeight(spawnBlockX);
      this.player.x = spawnBlockX * TILE_SIZE;
      this.player.y = (spawnSurfaceY - 2) * TILE_SIZE;
    }
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.health = 100;
    this.recentDamageTimer = HEALTH_REGEN_DELAY_MS / 1000;
    this.healthRegenerationTimer = 0;
    this.player.food = 100;
    this.player.stamina = 100;
    this.player.isSprinting = false;
    this.player.invulnerableTimer = 1.0;
    this.player.flashTimer = 0;
    this.player.isAttacking = false;
    this.player.attackTimer = 0;
    this.player.attackCooldown = 0;
    this.blockInteraction.isLeftDown = false;
    const playerBlockX = Math.floor(this.player.x / TILE_SIZE);
    const playerBlockY = Math.floor(this.player.y / TILE_SIZE);
    this.chunkManager.updatePlayerPosition(playerBlockX, playerBlockY);
    this.camera.targetX = this.player.x + this.player.width / 2 - this.camera.width / 2;
    this.camera.targetY = this.player.y + this.player.height / 2 - this.camera.height / 2;
    this.camera.x = this.camera.targetX;
    this.camera.y = this.camera.targetY;
    this.state = 'PLAYING';
    this.lastSyncedHealth = 100;
    this.lastSyncedAlive = true;
    this.onPlayerHealthChanged?.(100, 100, true);
    this.onPlayerRespawned?.(this.player.x, this.player.y);
    debugCombat('respawn.end', { playerId: this.combatPlayerId, lifeId: this.combatLifeId, health: this.player.health, alive: this.player.health > 0, x: this.player.x, y: this.player.y, state: this.state });
    this.onStateChange?.(this.state);
    sound.playStartGame();
    this.lastTime = 0;
    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  public goToMainMenu() {
    this.saveLocalState();
    this.cancelPendingTeleport();
    this.state = 'TITLE';
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.onStateChange?.(this.state);
  }

  public performSwordAttack() {
    if (this.player.attackCooldown > 0 || this.player.health <= 0) return;

    const selected = this.inventory.getSelectedSlot();
    const activeTier = selected?.toolTier ?? this.inventory.getBestOwnedToolTier('sword') ?? 'wood';

    this.player.isAttacking = true;
    this.player.attackTimer = 0.22;
    this.player.attackCooldown = 0.38; // responsive 0.38s attack cooldown
    this.blockInteraction.triggerSwing('sword', this.player.x + (this.player.facingRight ? this.player.width + 22 : -22), this.player.y + 12, activeTier);
    sound.playSwordSwing();

    // Generous hitbox in front of player (including slight overlap with player body so close-quarters enemies are always hit)
    const swordHitbox = {
      x: this.player.facingRight ? this.player.x - 4 : this.player.x + this.player.width - 42,
      y: this.player.y - 10,
      width: 46,
      height: 44,
    };

    let swordDamage = getSwordDamage(selected, this.inventory);

    // Lion Meat Buff: +60% Melee Damage & fierce strikes!
    if (this.player.activeBuffs?.some((b) => b.id === 'ferocity')) {
      swordDamage = Math.round(swordDamage * 1.6);
    }

    const enemyHit = this.enemyManager.handleSwordAttack(swordHitbox, swordDamage, this.itemDropManager);
    let wildlifeHit = false;
    if (this.multiplayerSession) {
      const hitAnimal = this.wildlifeManager.findHitAnimal(swordHitbox, this.chunkManager);
      if (hitAnimal) {
        this.onWildlifeAttackRequested?.(hitAnimal.id, swordDamage);
        wildlifeHit = true;
      }
      const attackId = `atk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.onPlayerAttackRequested?.(attackId);
    } else {
      wildlifeHit = this.wildlifeManager.handleSwordAttack(swordHitbox, swordDamage, this.itemDropManager, this.enemyManager, this.chunkManager);
    }
    if (enemyHit || wildlifeHit) {
      this.renderer.addDustParticles(
        this.player.facingRight ? this.player.x + this.player.width + 8 : this.player.x - 8,
        this.player.y + 10,
        3,
        wildlifeHit ? '#f43f5e' : '#10b981'
      );
    }
  }

  private handlePlayerDamage = (damage: number, sourceX: number, _sourceY: number) => {
    if (this.isCreative || this.player.invulnerableTimer > 0 || this.player.health <= 0) {
      debugCombat('damage.local-rejected', { playerId: this.combatPlayerId, lifeId: this.combatLifeId, animalId: undefined, health: this.player.health, alive: this.player.health > 0, reason: this.isCreative ? 'creative' : this.player.health <= 0 ? 'already-dead' : 'invulnerable', damage, sourceX });
      return;
    }

    // Bear Meat Buff: -40% damage resistance
    if (this.player.activeBuffs?.some((b) => b.id === 'fortitude')) {
      damage = Math.max(1, Math.round(damage * 0.6));
    }

    if (this.multiplayerSession) {
      this.onPlayerDamageRequested?.(damage);
      return;
    }

    this.player.health = Math.max(0, this.player.health - damage);
    debugCombat('damage.local-accepted', { playerId: this.combatPlayerId, lifeId: this.combatLifeId, health: this.player.health, alive: this.player.health > 0, damage, sourceX, x: this.player.x, y: this.player.y });
    this.recentDamageTimer = HEALTH_REGEN_DELAY_MS / 1000;
    this.healthRegenerationTimer = 0;
    this.player.invulnerableTimer = 0.7; // ~0.7s invulnerability
    this.player.flashTimer = 0.22; // red damage flash
    sound.playPlayerHurt();

    // Knockback away from damage source
    const hitFromLeft = (this.player.x + this.player.width / 2) > sourceX;
    this.player.vx = hitFromLeft ? 210 : -210;
    this.player.vy = -180;
    this.player.isGrounded = false;

    this.notifyHealthChanged(true);

    // Check death
    if (this.player.health <= 0) {
      debugCombat('death.local', { playerId: this.combatPlayerId, lifeId: this.combatLifeId, health: this.player.health, alive: false, x: this.player.x, y: this.player.y, multiplayer: this.multiplayerSession });
      if (!this.multiplayerSession) this.combatLifeId++;
      this.wildlifeManager.clearCombatState(this.multiplayerSession ? this.combatPlayerId : undefined);
      sound.playPlayerDeath();
      this.state = 'DEAD';
      this.onStateChange?.(this.state);
    }
  };

  public resize(displayWidth: number, displayHeight: number) {
    this.dpr = 1;
    this.canvas.width = Math.floor(displayWidth);
    this.canvas.height = Math.floor(displayHeight);

    this.applyZoom();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  private setupEventListeners() {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.canvas.addEventListener('mousemove', this.handleMouseMove);
    this.canvas.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.canvas.addEventListener('contextmenu', this.handleContextMenu);
    this.canvas.addEventListener('pointerdown', this.handlePointerDown, { passive: false });
    this.canvas.addEventListener('pointermove', this.handlePointerMove, { passive: false });
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    this.canvas.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    this.canvas.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    window.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.handleTouchEnd, { passive: true });
    this.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  public destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.chunkManager.modifications.saveToLocalStorage(this.chunkManager.seed);

    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);

    this.canvas.removeEventListener('mousemove', this.handleMouseMove);
    this.canvas.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.canvas.removeEventListener('contextmenu', this.handleContextMenu);
    this.canvas.removeEventListener('pointerdown', this.handlePointerDown);
    this.canvas.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    this.canvas.removeEventListener('touchstart', this.handleTouchStart);
    this.canvas.removeEventListener('touchmove', this.handleTouchMove);
    window.removeEventListener('touchend', this.handleTouchEnd);
    window.removeEventListener('touchcancel', this.handleTouchEnd);
    this.canvas.removeEventListener('wheel', this.handleWheel);
  }

  private handleMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.blockInteraction.updateMousePosition(e.clientX - rect.left, e.clientY - rect.top);
  };

  public eatMeatItem(type: ItemType): boolean {
    if (this.state !== 'PLAYING' || this.player.health <= 0) return false;
    if (this.multiplayerSession) {
      this.onEatRequested?.(type);
      return true;
    }
    const nutrition = MEAT_NUTRITION[type];
    if (!nutrition) return false;
    if (!this.inventory.consumeItem(type, 1)) return false;

    this.player.food = Math.min(this.player.maxFood, this.player.food + nutrition.food);
    const oldHealth = this.player.health;
    this.player.health = Math.min(this.player.maxHealth, this.player.health + nutrition.health);
    if (this.player.health !== oldHealth) {
      this.notifyHealthChanged(true);
    }

    sound.playEat();

    // Check for meat buff
    const buffDef = MEAT_BUFFS[type];
    if (buffDef) {
      if (!this.player.activeBuffs) this.player.activeBuffs = [];
      const existingIdx = this.player.activeBuffs.findIndex((b) => b.id === buffDef.id);
      const newBuff: ActiveFoodBuff = { ...buffDef, remainingSec: buffDef.durationSec };
      if (existingIdx !== -1) {
        this.player.activeBuffs[existingIdx] = newBuff;
      } else {
        this.player.activeBuffs.push(newBuff);
      }

      if (buffDef.id === 'titan') {
        this.player.maxHealth = 150;
        this.player.health = Math.min(150, this.player.health + 30);
      }

      this.enemyManager.addDamageNumber(
        this.player.x + this.player.width / 2,
        this.player.y - 12,
        `+${buffDef.name}!`,
        buffDef.color
      );
    }

    this.renderer.addDustParticles(
      this.player.x + this.player.width / 2,
      this.player.y + 4,
      5,
      buffDef?.color || '#4ade80'
    );
    this.emitStats(Math.floor(this.player.x / TILE_SIZE), Math.floor(this.player.y / TILE_SIZE));
    return true;
  }

  public eatCurrentItem(): boolean {
    const selected = this.inventory.getSelectedSlot();
    if (selected?.type && isEdibleItem(selected.type)) {
      return this.eatMeatItem(selected.type);
    }
    return false;
  }

  private handleMouseDown = (e: MouseEvent) => {
    if (this.state !== 'PLAYING') return;

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    this.blockInteraction.updateMousePosition(mouseX, mouseY);
    const selectedSlot = this.inventory.getSelectedSlot();
    const isHoldingSword = !!(selectedSlot && (selectedSlot.isWeapon || selectedSlot.toolKind === 'sword' || isSwordItem(selectedSlot.type)));

    if (e.button === 0) {
      if (isHoldingSword) {
        const zoom = this.camera.zoom || 1;
        const clickWorldX = this.camera.x + mouseX / zoom;
        this.player.facingRight = clickWorldX >= this.player.x + this.player.width / 2;
        this.performSwordAttack();
        this.blockInteraction.isLeftDown = true;
        return;
      }
      const target = this.blockInteraction.getTargetInfo(this.player, this.camera, this.chunkManager, this.dpr);
      const crop = [...(this.getWorldObjects?.() ?? [])].find((object) => object.type === 'crop' && object.x === target.blockX && object.y === target.blockY);
      if (target.inRange && crop) {
        this.onFarmHarvestRequested?.(target.blockX, target.blockY);
        return;
      }
      if (this.blockInteraction.useSelectedHoe(this.player, this.camera, this.chunkManager, this.inventory, this.dpr)) return;
      if (selectedSlot?.type && isEdibleItem(selectedSlot.type)) {
        this.eatMeatItem(selectedSlot.type);
        return;
      }
      this.blockInteraction.isLeftDown = true;
    } else if (e.button === 2) {
      e.preventDefault();
      // Check if clicking directly on a Crafting Table block in range:
      const target = this.blockInteraction.getTargetInfo(this.player, this.camera, this.chunkManager, this.dpr);
      const objectType = objectTypeForTile(target.tile);
      if (target.inRange && (objectType === 'chest' || objectType === 'furnace')) {
        this.onChestInteract?.(target.blockX, target.blockY);
        return;
      }
      if (target.inRange && objectType && ['door', 'bed', 'campfire', 'lever', 'sign', 'trapdoor', 'gate'].includes(objectType)) {
        this.onWorldObjectInteract?.(target.blockX, target.blockY, objectType);
        return;
      }
      if (target.inRange && target.tile === TileType.CRAFTING_TABLE) {
        this.onOpenCraftingBench?.();
        return;
      }
      if (target.inRange && target.tile === TileType.TILLED_SOIL &&
          (selectedSlot?.type === 'wheat_seed' || selectedSlot?.type === 'carrot_seed' || selectedSlot?.type === 'berry_seed')) {
        this.onFarmPlantRequested?.(target.blockX, target.blockY, selectedSlot.type);
        return;
      }
      if (selectedSlot?.type && isEdibleItem(selectedSlot.type)) {
        this.eatMeatItem(selectedSlot.type);
        return;
      }
      if (isHoldingSword) {
        const zoom = this.camera.zoom || 1;
        const clickWorldX = this.camera.x + mouseX / zoom;
        this.player.facingRight = clickWorldX >= this.player.x + this.player.width / 2;
        this.performSwordAttack();
        return;
      }
      if (selectedSlot) {
        this.blockInteraction.handleRightClick(this.player, this.camera, this.chunkManager, this.inventory, this.dpr);
      }
    }
  };

  private handlePointerDown = (event: PointerEvent) => {
    if (this.state !== 'PLAYING') return;
    if (event.pointerType === 'mouse') return;
    event.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const tapX = event.clientX - rect.left;
    const tapY = event.clientY - rect.top;
    this.blockInteraction.updateMousePosition(tapX, tapY);
    const target = this.blockInteraction.getTargetInfo(this.player, this.camera, this.chunkManager, this.dpr);
    const selectedSlot = this.inventory.getSelectedSlot();
    const isHoldingSword = !!(selectedSlot && (selectedSlot.isWeapon || selectedSlot.toolKind === 'sword' || isSwordItem(selectedSlot.type)));
    const objectType = objectTypeForTile(target.tile);

    // 1. Direct interactive object tap in range
    if (target.inRange && (objectType === 'chest' || objectType === 'furnace')) {
      this.onChestInteract?.(target.blockX, target.blockY);
      return;
    }
    if (target.inRange && objectType && ['door', 'bed', 'campfire', 'lever', 'sign', 'trapdoor', 'gate'].includes(objectType)) {
      this.onWorldObjectInteract?.(target.blockX, target.blockY, objectType);
      return;
    }
    if (target.inRange && target.tile === TileType.CRAFTING_TABLE) {
      this.onOpenCraftingBench?.();
      return;
    }
    const crop = [...(this.getWorldObjects?.() ?? [])].find((object) => object.type === 'crop' && object.x === target.blockX && object.y === target.blockY);
    if (target.inRange && crop) {
      this.onFarmHarvestRequested?.(target.blockX, target.blockY);
      return;
    }
    if (target.inRange && target.tile === TileType.TILLED_SOIL &&
        (selectedSlot?.type === 'wheat_seed' || selectedSlot?.type === 'carrot_seed' || selectedSlot?.type === 'berry_seed')) {
      this.onFarmPlantRequested?.(target.blockX, target.blockY, selectedSlot.type);
      return;
    }

    // 2. Mode-dependent action
    if (this.touchMode === 'place' && !isHoldingSword) {
      if (selectedSlot?.type && isEdibleItem(selectedSlot.type)) {
        this.eatMeatItem(selectedSlot.type);
        return;
      }
      if (selectedSlot) {
        this.blockInteraction.handleRightClick(this.player, this.camera, this.chunkManager, this.inventory, this.dpr);
      }
    } else {
      // 'mine' mode or holding a sword
      if (isHoldingSword) {
        const zoom = this.camera.zoom || 1;
        const clickWorldX = this.camera.x + tapX / zoom;
        this.player.facingRight = clickWorldX >= this.player.x + this.player.width / 2;
        this.performSwordAttack();
        this.blockInteraction.isLeftDown = true;
        return;
      }
      if (this.blockInteraction.useSelectedHoe(this.player, this.camera, this.chunkManager, this.inventory, this.dpr)) return;
      if (selectedSlot?.type && isEdibleItem(selectedSlot.type)) {
        this.eatMeatItem(selectedSlot.type);
        return;
      }
      this.blockInteraction.isLeftDown = true;
    }
  };

  private handlePointerMove = (event: PointerEvent) => {
    if (this.state !== 'PLAYING') return;
    if (event.pointerType === 'mouse') return;
    const rect = this.canvas.getBoundingClientRect();
    this.blockInteraction.updateMousePosition(event.clientX - rect.left, event.clientY - rect.top);
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') return;
    this.blockInteraction.isLeftDown = false;
  };

  private handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.initialPinchDist = Math.hypot(dx, dy);
      this.blockInteraction.isLeftDown = false;
    }
  };

  private handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && this.initialPinchDist > 0) {
      if (e.cancelable) e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const now = performance.now();
      if (now - this.lastPinchZoomTime > 120) {
        const ratio = dist / this.initialPinchDist;
        if (ratio > 1.2) {
          this.zoomIn();
          this.initialPinchDist = dist;
          this.lastPinchZoomTime = now;
        } else if (ratio < 0.82) {
          this.zoomOut();
          this.initialPinchDist = dist;
          this.lastPinchZoomTime = now;
        }
      }
    }
  };

  private handleTouchEnd = (e: TouchEvent) => {
    if (e.touches.length < 2) {
      this.initialPinchDist = 0;
    }
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.blockInteraction.isLeftDown = false;
    }
  };

  private handleContextMenu = (e: MouseEvent) => {
    e.preventDefault();
  };

  private handleWheel = (e: WheelEvent) => {
    if (this.state !== 'PLAYING') return;
    e.preventDefault();
    this.inventory.cycleSlot(e.deltaY > 0 ? 1 : -1);
  };

  private handleBlur = () => {
    this.input.left = false;
    this.input.right = false;
    this.input.up = false;
    this.input.down = false;
    this.input.jump = false;
    this.input.jumpJustPressed = false;
    this.input.sprint = false;
    this.blockInteraction.isLeftDown = false;
  };

  private handleVisibilityChange = () => {
    if (document.hidden && this.state === 'PLAYING') {
      this.pause();
    }
    this.handleBlur();
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.state !== 'PLAYING') return;
    const target = e.target;
    if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;

    // Some browser/gamepad keyboard bridges populate `key` without a physical
    // `code`; support both so all eight quick slots remain keyboard accessible.
    const digit = Number(e.key);
    if (digit >= 1 && digit <= 8 && Number.isInteger(digit)) {
      this.inventory.selectSlot(digit - 1);
      e.preventDefault();
      return;
    }

    switch (e.code) {
      case 'KeyA':
      case 'ArrowLeft':
        this.input.left = true;
        e.preventDefault();
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.input.right = true;
        e.preventDefault();
        break;
      case 'KeyW':
      case 'ArrowUp':
        this.input.up = true;
        e.preventDefault();
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.input.down = true;
        e.preventDefault();
        break;
      case 'Space':
        if (!this.input.jump) {
          this.input.jumpJustPressed = true;
          if (this.isCreative) {
            const now = performance.now();
            if (now - this.lastJumpPressTime < 280) {
              this.toggleFlight();
              this.lastJumpPressTime = 0;
            } else {
              this.lastJumpPressTime = now;
            }
          }
        }
        this.input.jump = true;
        e.preventDefault();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.input.sprint = true;
        break;
      case 'KeyF':
        if (this.isCreative) {
          this.toggleFlight();
          e.preventDefault();
        }
        break;
      case 'KeyE':
        this.eatCurrentItem();
        break;
      case 'Digit1':
      case 'Numpad1':
        this.inventory.selectSlot(0);
        e.preventDefault();
        break;
      case 'Digit2':
      case 'Numpad2':
        this.inventory.selectSlot(1);
        e.preventDefault();
        break;
      case 'Digit3':
      case 'Numpad3':
        this.inventory.selectSlot(2);
        e.preventDefault();
        break;
      case 'Digit4':
      case 'Numpad4':
        this.inventory.selectSlot(3);
        e.preventDefault();
        break;
      case 'Digit5':
      case 'Numpad5':
        this.inventory.selectSlot(4);
        e.preventDefault();
        break;
      case 'Digit6':
      case 'Numpad6':
        this.inventory.selectSlot(5);
        e.preventDefault();
        break;
      case 'Digit7':
      case 'Numpad7':
        this.inventory.selectSlot(6);
        e.preventDefault();
        break;
      case 'Digit8':
      case 'Numpad8':
        this.inventory.selectSlot(7);
        e.preventDefault();
        break;
      // Zoom keyboard shortcuts
      case 'Equal':
      case 'NumpadAdd':
        this.zoomIn();
        e.preventDefault();
        break;
      case 'Minus':
      case 'NumpadSubtract':
        this.zoomOut();
        e.preventDefault();
        break;
      case 'Digit0':
      case 'Numpad0':
        this.resetZoom();
        e.preventDefault();
        break;
      case 'KeyP':
        this.togglePause();
        e.preventDefault();
        break;
      case 'Escape':
        if (!this.biomeMenuOpen) {
          this.togglePause();
          e.preventDefault();
        }
        break;
      case 'KeyR':
        if (e.ctrlKey || e.metaKey) return;
        this.restart();
        e.preventDefault();
        break;
      case 'KeyM':
        sound.toggleMute();
        e.preventDefault();
        break;
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyA':
      case 'ArrowLeft':
        this.input.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.input.right = false;
        break;
      case 'KeyW':
      case 'ArrowUp':
        this.input.up = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.input.down = false;
        break;
      case 'Space':
        this.input.jump = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.input.sprint = false;
        break;
    }
  };

  public setVirtualInput(control: keyof InputState, value: boolean) {
    if (control === 'jump') {
      if (value && !this.input.jump) {
        this.input.jumpJustPressed = true;
      }
      this.input.jump = value;
    } else {
      (this.input as unknown as Record<string, boolean>)[control] = value;
    }
  }

  public setVirtualAnalog(analogX: number, analogY: number = 0) {
    this.input.analogX = analogX;
    this.input.analogY = analogY;
    if (analogX < -0.18) {
      this.input.left = true;
      this.input.right = false;
    } else if (analogX > 0.18) {
      this.input.right = true;
      this.input.left = false;
    } else {
      this.input.left = false;
      this.input.right = false;
    }

    if (analogY < -0.28) {
      this.input.up = true;
      this.input.down = false;
    } else if (analogY > 0.28) {
      this.input.down = true;
      this.input.up = false;
    } else {
      this.input.up = false;
      this.input.down = false;
    }
  }

  public aimAtFrontOrTarget() {
    const target = this.blockInteraction.getTargetInfo(this.player, this.camera, this.chunkManager, this.dpr);
    if (!target.inRange || target.tile === TileType.AIR) {
      const facingOffset = this.player.facingRight ? 1 : -1;
      const frontX = Math.floor((this.player.x + this.player.width / 2) / TILE_SIZE) + facingOffset;
      const frontY = Math.floor((this.player.y + this.player.height / 2) / TILE_SIZE);
      const zoom = this.camera.zoom || 1;
      const screenX = (frontX * TILE_SIZE + TILE_SIZE / 2 - this.camera.x) * zoom;
      const screenY = (frontY * TILE_SIZE + TILE_SIZE / 2 - this.camera.y) * zoom;
      this.blockInteraction.updateMousePosition(screenX, screenY);
    }
  }

  public triggerMine(active: boolean) {
    if (this.state !== 'PLAYING' || this.player.health <= 0) {
      this.isVirtualMining = false;
      this.blockInteraction.isLeftDown = false;
      return;
    }
    this.isVirtualMining = active;
    if (!active) {
      this.blockInteraction.isLeftDown = false;
      return;
    }

    const selectedSlot = this.inventory.getSelectedSlot();
    if (selectedSlot && (selectedSlot.isWeapon || selectedSlot.type === 'sword')) {
      this.performSwordAttack();
      this.blockInteraction.isLeftDown = true;
      return;
    }

    this.aimAtFrontOrTarget();
    this.blockInteraction.isLeftDown = true;
  }

  public triggerPlaceBlock(): boolean {
    if (this.state !== 'PLAYING' || this.player.health <= 0) return false;
    const selectedSlot = this.inventory.getSelectedSlot();
    if (!selectedSlot || selectedSlot.count <= 0 || selectedSlot.isWeapon || selectedSlot.type === 'sword') {
      return false;
    }
    const target = this.blockInteraction.getTargetInfo(this.player, this.camera, this.chunkManager, this.dpr);
    if (target.inRange) {
      return this.blockInteraction.handleRightClick(this.player, this.camera, this.chunkManager, this.inventory, this.dpr);
    }
    // Place facing the player if target is not currently in range
    const facingOffset = this.player.facingRight ? 1 : -1;
    const frontX = Math.floor((this.player.x + this.player.width / 2) / TILE_SIZE) + facingOffset;
    const frontY = Math.floor((this.player.y + this.player.height / 2) / TILE_SIZE);
    const zoom = this.camera.zoom || 1;
    const screenX = (frontX * TILE_SIZE + TILE_SIZE / 2 - this.camera.x) * zoom;
    const screenY = (frontY * TILE_SIZE + TILE_SIZE / 2 - this.camera.y) * zoom;
    this.blockInteraction.updateMousePosition(screenX, screenY);
    return this.blockInteraction.handleRightClick(this.player, this.camera, this.chunkManager, this.inventory, this.dpr);
  }

  public interactNearby(): boolean {
    if (this.state !== 'PLAYING' || this.player.health <= 0) return false;

    const selectedSlot = this.inventory.getSelectedSlot();
    const checkInteractAt = (bx: number, by: number): boolean => {
      const tile = this.chunkManager.getTile(bx, by);
      const objectType = objectTypeForTile(tile);
      if (objectType === 'chest' || objectType === 'furnace') {
        this.onChestInteract?.(bx, by);
        return true;
      }
      if (objectType && ['door', 'bed', 'campfire', 'lever', 'sign', 'trapdoor', 'gate'].includes(objectType)) {
        this.onWorldObjectInteract?.(bx, by, objectType);
        return true;
      }
      if (tile === TileType.CRAFTING_TABLE) {
        this.onOpenCraftingBench?.();
        return true;
      }
      const crop = [...(this.getWorldObjects?.() ?? [])].find((obj) => obj.type === 'crop' && obj.x === bx && obj.y === by);
      if (crop) {
        this.onFarmHarvestRequested?.(bx, by);
        return true;
      }
      if (tile === TileType.TILLED_SOIL && (selectedSlot?.type === 'wheat_seed' || selectedSlot?.type === 'carrot_seed' || selectedSlot?.type === 'berry_seed')) {
        this.onFarmPlantRequested?.(bx, by, selectedSlot.type);
        return true;
      }
      return false;
    };

    // First check target block under current touch/pointer if in range
    const target = this.blockInteraction.getTargetInfo(this.player, this.camera, this.chunkManager, this.dpr);
    if (target.inRange && checkInteractAt(target.blockX, target.blockY)) {
      return true;
    }

    // Next check adjacent blocks around player, prioritizing facing direction
    const playerBlockX = Math.floor((this.player.x + this.player.width / 2) / TILE_SIZE);
    const playerBlockY = Math.floor((this.player.y + this.player.height / 2) / TILE_SIZE);
    const facingDir = this.player.facingRight ? 1 : -1;

    const offsets = [
      [facingDir, 0],
      [facingDir, -1],
      [facingDir, 1],
      [0, 0],
      [0, 1],
      [0, -1],
      [-facingDir, 0],
      [facingDir * 2, 0],
    ];

    for (const [ox, oy] of offsets) {
      if (checkInteractAt(playerBlockX + ox, playerBlockY + oy)) {
        return true;
      }
    }

    // If holding food, eat it
    if (selectedSlot?.type && isEdibleItem(selectedSlot.type)) {
      return this.eatMeatItem(selectedSlot.type);
    }

    // If holding block and in range, place it
    if (selectedSlot && !selectedSlot.isWeapon && selectedSlot.type !== 'sword') {
      return this.triggerPlaceBlock();
    }

    return false;
  }

  private loop = (currentTime: number) => {
    this.animationFrameId = requestAnimationFrame(this.loop);

    const frameStart = performance.now();

    if (this.lastTime === 0) {
      this.lastTime = currentTime;
    }

    const rawDt = (currentTime - this.lastTime) / 1000;
    const dt = Math.min(rawDt, 0.08);
    this.lastTime = currentTime;
    this.timeSec += dt;

    let updateTime = 0;
    let chunkMgmtTime = 0;
    let chunkGenTime = 0;

    if (this.state === 'PLAYING') {
      const t0 = performance.now();
      const playerBlockX = Math.floor(this.player.x / TILE_SIZE);
      const playerBlockY = Math.floor(this.player.y / TILE_SIZE);
      this.chunkManager.updatePlayerPosition(playerBlockX, playerBlockY);
      chunkMgmtTime = performance.now() - t0;

      const t1 = performance.now();
      this.chunkManager.processQueue(CHUNK_GEN_TIME_BUDGET_MS);
      chunkGenTime = performance.now() - t1;
      this.tryCompletePendingTeleport();
      const currentBlockX = Math.floor(this.player.x / TILE_SIZE);
      const currentBlockY = Math.floor(this.player.y / TILE_SIZE);

      const t2 = performance.now();
      this.update(dt, currentBlockX, currentBlockY);
      updateTime = performance.now() - t2;

      this.autosaveTimer += dt;
      if (this.autosaveTimer >= 3.0) {
        this.autosaveTimer = 0;
        this.saveLocalState();
      }
    }

    const t3 = performance.now();
    this.render();
    const renderTime = performance.now() - t3;

    const frameTime = performance.now() - frameStart;

    // Record this frame into true rolling 1-second profiler
    this.profiler.recordFrame(
      currentTime,
      frameTime,
      updateTime,
      renderTime,
      chunkMgmtTime,
      chunkGenTime,
      this.chunkManager.queuedCount
    );

    this.input.jumpJustPressed = false;
  };

  private update(dt: number, playerBlockX: number, playerBlockY: number) {
    // 1. Day/Night progression & Lunar Phase cycle (moon phase cycles every 2 game days)
    const nextTime = this.cycle.time + this.cycle.speed * dt;
    if (nextTime >= 1.0 && dt > 0) {
      this.cycle.day += Math.floor(nextTime);
    }
    this.cycle.time = nextTime % 1.0;
    this.cycle.moonPhaseIndex = getMoonPhaseIndex(this.cycle.day);

    const lightCurve = (Math.cos((this.cycle.time - 0.25) * Math.PI * 2) + 1) / 2;
    this.cycle.ambientLight = 0.18 + lightCurve * 0.82;

    // 2. Weather Event Computation & Player Exposure
    if (this.weatherOverride && performance.now() > this.weatherOverride.expiresAt) {
      this.weatherOverride = null;
    }
    const surfaceColBiome = this.chunkManager.terrainGen.getColumnBiome(playerBlockX);
    const weatherInfo = this.weatherOverride
      ? {
          type: this.weatherOverride.type,
          intensity: this.weatherOverride.intensity,
          label: this.weatherOverride.type === 'rain' ? 'Rain' : this.weatherOverride.type === 'snow' ? 'Snowfall' : 'Windy',
          icon: this.weatherOverride.type === 'rain' ? '🌧️' : this.weatherOverride.type === 'snow' ? '❄️' : '💨',
        }
      : getWorldWeather(this.cycle.day, this.cycle.time, this.chunkManager.seed, surfaceColBiome.name);

    this.cycle.weather = weatherInfo.type;
    const targetIntensity = weatherInfo.intensity;
    const prevIntensity = this.cycle.weatherIntensity ?? 0;
    this.cycle.weatherIntensity = prevIntensity + (targetIntensity - prevIntensity) * Math.min(1, dt * 2.5);

    const isExposed = isPlayerExposedToWeather(this.player, this.chunkManager);
    const isNearWarmth = isPlayerNearHeatSource(this.player, this.chunkManager);
    this.currentWeatherExposure = isExposed;
    this.currentNearWarmth = isNearWarmth;

    // 3. Physics & Player Collision (Impacted by active weather & outdoor exposure)
    const collisionEvents = updatePlayerPhysics(
      this.player,
      this.chunkManager,
      this.input,
      dt,
      this.cycle.weather,
      this.cycle.weatherIntensity,
      isExposed
    );
    this.updateLocalPressurePlates();

    this.magmaDamageTimer = Math.max(0, this.magmaDamageTimer - dt);
    if (this.magmaDamageTimer === 0) {
      const left = Math.floor(this.player.x / TILE_SIZE);
      const right = Math.floor((this.player.x + this.player.width - 1) / TILE_SIZE);
      const top = Math.floor(this.player.y / TILE_SIZE);
      const bottom = Math.floor((this.player.y + this.player.height - 1) / TILE_SIZE);
      let touchingMagma = false;
      for (let ty = top; ty <= bottom && !touchingMagma; ty++) {
        for (let tx = left; tx <= right; tx++) {
          if (this.chunkManager.getTile(tx, ty) === TileType.MAGMA) {
            touchingMagma = true;
            break;
          }
        }
      }
      if (touchingMagma) {
        this.handlePlayerDamage(8, this.player.x + this.player.width / 2, this.player.y + this.player.height);
        this.magmaDamageTimer = 0.6;
      }
    }

    if (collisionEvents.justJumped) {
      sound.playJump();
      this.renderer.addDustParticles(
        this.player.x + this.player.width / 2,
        this.player.y + this.player.height,
        3,
        '#86efac'
      );
    }

    if (collisionEvents.justLanded) {
      const groundTile = this.getGroundTileUnderPlayer();
      sound.playLand(groundTile);
      this.renderer.addDustParticles(
        this.player.x + this.player.width / 2,
        this.player.y + this.player.height,
        4,
        this.getParticleColorForTile(groundTile)
      );
    }

    if (collisionEvents.footstep) {
      const groundTile = this.getGroundTileUnderPlayer();
      sound.playFootstep(groundTile);
      this.renderer.addDustParticles(
        this.player.x + (this.player.facingRight ? 2 : this.player.width - 2),
        this.player.y + this.player.height,
        1,
        this.getParticleColorForTile(groundTile)
      );
    }

    // 3. Combat & Invulnerability timers
    if (this.player.invulnerableTimer > 0) {
      this.player.invulnerableTimer = Math.max(0, this.player.invulnerableTimer - dt);
    }
    if (this.player.flashTimer > 0) {
      this.player.flashTimer = Math.max(0, this.player.flashTimer - dt);
    }
    if (this.player.attackTimer > 0) {
      this.player.attackTimer = Math.max(0, this.player.attackTimer - dt);
      if (this.player.attackTimer === 0) {
        this.player.isAttacking = false;
      }
    }
    if (this.player.attackCooldown > 0) {
      this.player.attackCooldown = Math.max(0, this.player.attackCooldown - dt);
    }

    const activeSelectedSlot = this.inventory.getSelectedSlot();
    if (
      (this.blockInteraction.isLeftDown || this.isVirtualMining) &&
      activeSelectedSlot &&
      (activeSelectedSlot.isWeapon || activeSelectedSlot.toolKind === 'sword' || isSwordItem(activeSelectedSlot.type)) &&
      this.player.attackCooldown <= 0
    ) {
      this.performSwordAttack();
    }

    // Sprinting & Stamina Management (Impacted by rain mud drag and snow cold)
    const isMovingHorizontally = (this.input.left || this.input.right) && Math.abs(this.player.vx) > 10;
    if (!this.input.sprint) this.sprintExhausted = false;
    const wantsSprint = !!this.input.sprint && !this.sprintExhausted && isMovingHorizontally && this.player.stamina > 0;
    const weatherIntensityVal = this.cycle.weatherIntensity ?? 0;
    if (wantsSprint) {
      this.player.isSprinting = true;
      let staminaDrain = 20;
      if (isExposed && this.cycle.weather === 'rain') {
        staminaDrain += 7 * weatherIntensityVal;
      } else if (isExposed && this.cycle.weather === 'snow' && !isNearWarmth) {
        staminaDrain += 10 * weatherIntensityVal;
      }
      this.player.stamina = Math.max(0, this.player.stamina - dt * staminaDrain);
      if (this.player.stamina <= 0) {
        this.sprintExhausted = true;
        this.player.isSprinting = false;
      }
    } else {
      this.player.isSprinting = false;
      let staminaRecharge = 28;
      if (isExposed && this.cycle.weather === 'snow' && !isNearWarmth) {
        staminaRecharge = 28 * Math.max(0.65, 1 - 0.35 * weatherIntensityVal);
      } else if (isExposed && this.cycle.weather === 'rain') {
        staminaRecharge = 28 * Math.max(0.82, 1 - 0.18 * weatherIntensityVal);
      }
      this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + dt * staminaRecharge);
    }

    // Food decay (100 food lasts ~6 minutes of active survival)
    this.player.food = Math.max(0, this.player.food - dt * 0.28);

    // Starvation penalty when Food reaches 0
    if (this.player.food <= 0) {
      this.starvationTimer += dt;
      if (this.starvationTimer >= 3.0) {
        this.starvationTimer = 0;
        if (this.player.health > 1) {
          this.recentDamageTimer = HEALTH_REGEN_DELAY_MS / 1000;
          this.healthRegenerationTimer = 0;
          this.player.flashTimer = 0.15;
          sound.playPlayerHurt();
          if (this.multiplayerSession) {
            this.onStarvationDamageRequested?.();
          } else {
            this.player.health = Math.max(1, this.player.health - 2);
            this.notifyHealthChanged(true);
          }
        }
      }
    } else {
      this.starvationTimer = 0;
    }

    // Gentle natural health regeneration when Food is high and not recently damaged
    if (this.recentDamageTimer > 0) {
      this.recentDamageTimer = Math.max(0, this.recentDamageTimer - dt);
    }
    if (
      !this.multiplayerSession &&
      this.state === 'PLAYING' &&
      this.player.health > 0 &&
      this.player.health < this.player.maxHealth &&
      this.recentDamageTimer <= 0
    ) {
      if (this.healthRegenerationTimer === 0) this.healthRegenerationTimer = HEALTH_REGEN_INTERVAL_MS / 1000;
      this.healthRegenerationTimer += dt;
      if (this.healthRegenerationTimer >= HEALTH_REGEN_INTERVAL_MS / 1000) {
        this.healthRegenerationTimer -= HEALTH_REGEN_INTERVAL_MS / 1000;
        this.player.health = Math.min(this.player.maxHealth, this.player.health + HEALTH_REGEN_AMOUNT);
        this.notifyHealthChanged(false);
      }
    } else {
      this.healthRegenerationTimer = 0;
    }

    // 4. Update Active Food Buffs (Durations, passive effects, and stat bonuses)
    if (this.player.activeBuffs && this.player.activeBuffs.length > 0) {
      let hasTitan = false;
      let hasFortitude = false;
      for (let bi = this.player.activeBuffs.length - 1; bi >= 0; bi--) {
        const buff = this.player.activeBuffs[bi];
        buff.remainingSec -= dt;
        if (buff.id === 'titan') hasTitan = true;
        if (buff.id === 'fortitude') hasFortitude = true;
        if (buff.remainingSec <= 0) {
          this.player.activeBuffs.splice(bi, 1);
        }
      }
      if (!hasTitan && this.player.maxHealth > 100) {
        this.player.maxHealth = 100;
        this.player.health = Math.min(100, this.player.health);
        this.notifyHealthChanged(true);
      }
      if (!this.multiplayerSession && hasFortitude && this.player.health < this.player.maxHealth) {
        this.player.health = Math.min(this.player.maxHealth, this.player.health + dt * 0.7); // Ursine Fortitude regeneration
        this.notifyHealthChanged(false);
      }
    }

    // 5. Update Enemies (Slimes, AI, and Floating Damage Text)
    this.enemyManager.update(
      dt,
      this.player,
      this.chunkManager,
      this.cycle,
      this.itemDropManager,
      this.handlePlayerDamage,
      !this.developerTestMode
    );

    // 6. Update Wildlife & Carnivores (chase and attack player if aggressive)
    this.wildlifeManager.update(dt, this.player, this.chunkManager, this.handlePlayerDamage);

    // Update remote players attack timers
    for (const remote of this.remotePlayers.values()) {
      if (remote.isAttacking && remote.attackTimer !== undefined && remote.attackTimer > 0) {
        remote.attackTimer -= dt;
        if (remote.attackTimer <= 0) {
          remote.isAttacking = false;
          remote.attackTimer = 0;
        }
      }
    }

    // 5. Physical Item Drops physics, magnetic pull, and pickup
    this.itemDropManager.update(dt, this.player, this.chunkManager, this.inventory);

    // 6. Mining progress update
    if (this.isVirtualMining && this.blockInteraction.isLeftDown) {
      this.aimAtFrontOrTarget();
    }
    this.blockInteraction.isCreative = this.isCreative;
    if (this.isCreative) {
      this.player.health = 100;
      this.player.food = 100;
      this.player.stamina = 100;
    }
    this.blockInteraction.update(dt, this.player, this.camera, this.chunkManager, this.dpr, this.inventory);

    // 7. Smooth Camera Tracking (centered on player at current zoom)
    const lookaheadX = this.player.vx * 0.25;
    this.camera.targetX = this.player.x + this.player.width / 2 - this.camera.width / 2 + lookaheadX;
    this.camera.targetY = this.player.y + this.player.height / 2 - this.camera.height / 2;

    const lerpSpeed = 7.0 * dt;
    this.camera.x += (this.camera.targetX - this.camera.x) * Math.min(1.0, lerpSpeed);
    this.camera.y += (this.camera.targetY - this.camera.y) * Math.min(1.0, lerpSpeed);

    // 8. Update Weather Particles & Ambience
    this.renderer.updateParticles(
      dt,
      this.camera,
      this.chunkManager,
      this.cycle.weather,
      this.cycle.weatherIntensity,
      this.timeSec
    );

    if (this.cycle.weather && this.cycle.weather !== 'clear' && (this.cycle.weatherIntensity ?? 0) > 0.12) {
      const surfaceTileY = this.chunkManager.terrainGen.getSurfaceHeight(playerBlockX);
      if (playerBlockY <= surfaceTileY + 8) {
        this.weatherAudioTimer -= dt;
        if (this.weatherAudioTimer <= 0) {
          this.weatherAudioTimer = this.cycle.weather === 'rain' ? 0.24 + Math.random() * 0.18 : 0.48 + Math.random() * 0.35;
          sound.playWeatherAmbience(this.cycle.weather as 'rain' | 'snow' | 'wind', this.cycle.weatherIntensity ?? 0.6);
        }
      }
    } else {
      this.weatherAudioTimer = 0;
    }

    // 9. Throttled UI stats dispatch (4x/sec)
    this.statsTimer += dt;
    if (this.statsTimer >= 0.25) {
      this.statsTimer = 0;
      this.emitStats(playerBlockX, playerBlockY);
    }
  }

  private emitStats(pBlockX: number, pBlockY: number) {
    if (!this.onStatsUpdate) return;

    const surfaceH = this.chunkManager.terrainGen.getSurfaceHeight(pBlockX);
    const depthDiff = pBlockY - surfaceH;
    const currentBiome = depthDiff > 25
      ? this.chunkManager.terrainGen.getBiomeAt(pBlockX, pBlockY)
      : this.chunkManager.terrainGen.getColumnBiome(pBlockX);

    let depthName = 'Surface';
    if (depthDiff < -3) depthName = 'Sky';
    else if (depthDiff <= 3) depthName = 'Surface Grassland';
    else if (depthDiff <= 25) depthName = 'Underground Soil';
    else if (depthDiff <= 55) depthName = 'Stone Cavern';
    else depthName = 'Deep Bedrock';

    const totalMinutes = Math.floor(((this.cycle.time * 24 + 6) % 24) * 60);
    const hours24 = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const timeStr = `${hours12.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${period}`;

    const profilerStats = this.profiler.getStats();
    const moonPhase = getMoonPhaseInfo(this.cycle.day, this.cycle.moonPhaseIndex);
    const auroraActive = isAuroraNight(this.cycle.day, this.chunkManager.seed, currentBiome.name);
    const skyPeriod = getSkyPeriodLabel(this.cycle.time);
    const weatherInfo = this.weatherOverride
      ? {
          type: this.weatherOverride.type,
          intensity: this.weatherOverride.intensity,
          label: this.weatherOverride.type === 'rain' ? 'Rain' : this.weatherOverride.type === 'snow' ? 'Snowfall' : 'Windy',
          icon: this.weatherOverride.type === 'rain' ? '🌧️' : this.weatherOverride.type === 'snow' ? '❄️' : '💨',
        }
      : getWorldWeather(this.cycle.day, this.cycle.time, this.chunkManager.seed, currentBiome.name);

    const isExposed = this.currentWeatherExposure;
    const isNearWarmth = this.currentNearWarmth;
    const activeWeather = this.cycle.weather ?? weatherInfo.type;
    const activeIntensity = this.cycle.weatherIntensity ?? weatherInfo.intensity;

    let weatherEffect: string | undefined = undefined;
    if (isExposed && activeIntensity > 0.1) {
      if (activeWeather === 'rain') {
        weatherEffect = '-16% Speed (Muddy Downpour)';
      } else if (activeWeather === 'snow') {
        weatherEffect = isNearWarmth ? '❄️ Snow (Warm near Campfire)' : '-22% Speed, Freezing Stamina Chill';
      }
    }

    this.onStatsUpdate({
      fps: profilerStats.fps,
      timeOfDayFormatted: timeStr,
      dayCount: this.cycle.day,
      playerX: pBlockX,
      playerY: pBlockY,
      chunkX: Math.floor(pBlockX / CHUNK_WIDTH),
      chunkY: Math.floor(pBlockY / CHUNK_HEIGHT),
      depthName,
      depthMeters: -depthDiff * 2,
      loadedChunks: this.chunkManager.loadedChunks.size,
      visibleChunks: this.renderer.visibleChunksCount,
      seed: this.chunkManager.seed,
      profiler: profilerStats,
      hotbar: this.inventory.getSlots(),
      activeSlot: this.inventory.activeSlot,
      zoom: this.currentZoom,
      activeDrops: this.itemDropManager.drops.length,
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      food: this.player.food,
      maxFood: this.player.maxFood,
      stamina: this.player.stamina,
      maxStamina: this.player.maxStamina,
      isSprinting: this.player.isSprinting,
      activeEnemies: this.enemyManager.enemies.length,
      biomeName: currentBiome.name,
      hasHome: !!this.home && this.home.seed === this.chunkManager.seed,
      homeX: this.home?.x ?? 0,
      homeY: this.home?.y ?? 0,
      homeCooldownMs: Math.max(0, 500 - (Date.now() - this.lastHomeSetAt)),
      teleportStatus: this.teleportStatus,
      moonPhaseIndex: moonPhase.index,
      moonPhaseName: moonPhase.shortName,
      moonPhaseIcon: moonPhase.icon,
      auroraActive,
      skyPeriod,
      weather: activeWeather,
      weatherLabel: weatherInfo.label,
      weatherIcon: weatherInfo.icon,
      weatherEffect,
      isExposedToWeather: isExposed,
      isNearWarmth,
      activeBuffs: this.player.activeBuffs ? [...this.player.activeBuffs] : [],
      isCreative: this.isCreative,
      isFlying: Boolean(this.player.isFlying),
    });
  }

  private render() {
    this.renderer.render(
      this.ctx,
      this.chunkManager,
      this.player,
      this.camera,
      this.cycle,
      this.timeSec,
      this.blockInteraction,
      this.itemDropManager,
      this.enemyManager,
      this.wildlifeManager,
      this.dpr,
      this.inventory.getSelectedSlot(),
      this.blockInteraction,
      this.remotePlayers,
      this.getWorldObjects?.()
    );
  }

  public getGroundTileUnderPlayer(): TileType {
    const centerTileX = Math.floor((this.player.x + this.player.width / 2) / TILE_SIZE);
    const footTileY = Math.floor((this.player.y + this.player.height + 2) / TILE_SIZE);
    let tile = this.chunkManager.getTile(centerTileX, footTileY);
    if (tile !== TileType.AIR && tile !== TileType.WATER) {
      return tile;
    }
    const leftTileX = Math.floor((this.player.x + 3) / TILE_SIZE);
    tile = this.chunkManager.getTile(leftTileX, footTileY);
    if (tile !== TileType.AIR && tile !== TileType.WATER) {
      return tile;
    }
    const rightTileX = Math.floor((this.player.x + this.player.width - 3) / TILE_SIZE);
    tile = this.chunkManager.getTile(rightTileX, footTileY);
    if (tile !== TileType.AIR && tile !== TileType.WATER) {
      return tile;
    }
    const insideTileY = Math.floor((this.player.y + this.player.height - 2) / TILE_SIZE);
    const insideTile = this.chunkManager.getTile(centerTileX, insideTileY);
    if (insideTile === TileType.PLATFORM || insideTile === TileType.LADDER || insideTile === TileType.BRIDGE) {
      return insideTile;
    }
    return TileType.DIRT;
  }

  public getParticleColorForTile(tile: TileType): string {
    switch (tile) {
      case TileType.SAND:
      case TileType.RED_SAND:
      case TileType.SALT:
        return '#f59e0b';
      case TileType.SNOW:
      case TileType.SNOWY_DIRT:
        return '#e0f2fe';
      case TileType.ICE:
      case TileType.PACKED_ICE:
      case TileType.BLUE_ICE:
        return '#93c5fd';
      case TileType.STONE:
      case TileType.SKY_STONE:
      case TileType.SANDSTONE:
      case TileType.BASALT:
      case TileType.BEDROCK:
      case TileType.OBSIDIAN:
        return '#94a3b8';
      case TileType.WOOD:
      case TileType.PLANKS:
      case TileType.BIRCH_WOOD:
      case TileType.ACACIA_WOOD:
      case TileType.CHERRY_WOOD:
        return '#b45309';
      case TileType.GRASS:
      case TileType.LEAVES:
      case TileType.FLOWER_GRASS:
      case TileType.OASIS_GRASS:
      case TileType.MUSHROOM_GRASS:
      case TileType.SKY_GRASS:
        return '#4ade80';
      case TileType.MUD:
        return '#582f0e';
      case TileType.ASH:
        return '#64748b';
      case TileType.GLOWING_CRYSTAL:
      case TileType.CRYSTAL_ORE:
      case TileType.DIAMOND_ORE:
        return '#38bdf8';
      case TileType.DIRT:
      default:
        return '#78350f';
    }
  }
}
