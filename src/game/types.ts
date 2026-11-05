/**
 * Pixel Frontier - Core Types (Infinite Procedural World, Profiling & Inventory)
 */

export enum TileType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  WOOD = 4,
  LEAVES = 5,
  FLOWER = 6,
  TALL_GRASS = 7,
  SAND = 8,
  SANDSTONE = 9,
  SNOW = 10,
  SNOWY_DIRT = 11,
  BIRCH_WOOD = 12,
  BIRCH_LEAVES = 13,
  CACTUS = 14,
  DRY_GRASS = 15,
  ACACIA_WOOD = 16,
  ACACIA_LEAVES = 17,
  BAMBOO = 18,
  CHERRY_WOOD = 19,
  CHERRY_LEAVES = 20,
  FLOWER_GRASS = 21,
  CORAL = 22,
  CORAL_BLOCK = 23,
  ICE = 24,
  PACKED_ICE = 25,
  BLUE_ICE = 26,
  MUD = 27,
  ASH = 28,
  BASALT = 29,
  MAGMA = 30,
  GLOWING_CRYSTAL = 31,
  GLOWING_MUSHROOM = 32,
  VINE = 33,
  OASIS_GRASS = 34,
  RED_SAND = 35,
  MUSHROOM_GRASS = 36,
  SALT = 37,
  PALM_WOOD = 38,
  PALM_LEAVES = 39,
  WATER = 40,
  OBSIDIAN = 41,
  COAL_ORE = 42,
  COPPER_ORE = 43,
  IRON_ORE = 44,
  GOLD_ORE = 45,
  CRYSTAL_ORE = 46,
  DIAMOND_ORE = 47,
  CRAFTING_TABLE = 48,
  PLANKS = 49,
  FURNACE = 50,
  TORCH = 51,
  CHEST = 52,
  DOOR = 53,
  LADDER = 54,
  BED = 55,
  CAMPFIRE = 56,
  LEVER = 57,
  SIGN = 58,
  PLATFORM = 59,
  DOOR_OPEN = 60,
  LEVER_ON = 61,
  CAMPFIRE_OFF = 62,
  PRESSURE_PLATE = 63,
  PRESSURE_PLATE_PRESSED = 64,
  TRAPDOOR = 65,
  TRAPDOOR_OPEN = 66,
  GATE = 67,
  GATE_OPEN = 68,
  BRIDGE = 69,
  ROPE = 70,
  TILLED_SOIL = 71,
  BERRY_BUSH = 72,
  BEDROCK = 73,
  BEAR_SKULL = 74,
  WOLF_SKULL = 75,
  MAMMOTH_SKULL = 76,
  LION_SKULL = 77,
  CROCODILE_SKULL = 78,
  ANIMAL_SKELETON = 79,
  PROTECTOR = 80,
  SKY_GRASS = 81,
  SKY_DIRT = 82,
  SKY_STONE = 83,
  ASTRAL_ORE = 84,
  CELESTIAL_ORE = 85,
  STAR_FLOWER = 86,
  SKY_VINE = 87,
  CELESTIAL_WOOD = 88,
  CELESTIAL_LEAVES = 89,
}

export interface ProtectorZone {
  id: string;
  x: number;
  y: number;
  ownerPlayerId: string;
  ownerDisplayName: string;
  createdAt: number;
}

export interface TileDefinition {
  id: TileType;
  name: string;
  isSolid: boolean;
  color: string;
  darkColor: string;
  lightColor: string;
}

export interface Chunk {
  cx: number;
  cy: number;
  worldX: number;
  worldY: number;
  tiles: Uint8Array;
  waterSurfaceTiles?: number[];
  waterfallTiles?: number[];
  animatedFoliageTiles?: number[];
  animatedLightTiles?: number[];
  canopyEdgeTiles?: number[];
  craftableStructureTiles?: number[];
  biomes: string[];
  isAllAir: boolean;
  canvas: HTMLCanvasElement | null;
  lastAccessed: number;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  isGrounded: boolean;
  wasGrounded: boolean;
  facingRight: boolean;
  animFrame: number;
  animTimer: number;
  coyoteTimer: number;
  jumpBufferTimer: number;
  state: 'idle' | 'walk' | 'jump' | 'fall' | 'swim';
  isInWater?: boolean;
  isSwimming?: boolean;
  health: number;
  maxHealth: number;
  food: number;
  maxFood: number;
  stamina: number;
  maxStamina: number;
  isSprinting: boolean;
  invulnerableTimer: number;
  flashTimer: number;
  isAttacking: boolean;
  attackTimer: number;
  attackCooldown: number;
  activeBuffs?: ActiveFoodBuff[];
  isFlying?: boolean;
  isCreative?: boolean;
}

export interface RemotePlayerState {
  playerId: string;
  displayName?: string;
  x: number;
  y: number;
  facingRight: boolean;
  health: number;
  maxHealth: number;
  isAlive: boolean;
  isAttacking?: boolean;
  attackTimer?: number;
  activeBuffs?: ActiveFoodBuff[];
}

export interface Camera {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  width: number;
  height: number;
  zoom: number;
}

export type WeatherType = 'clear' | 'rain' | 'snow' | 'wind';

export interface DayNightCycle {
  time: number;
  day: number;
  speed: number;
  sunAngle: number;
  moonAngle: number;
  ambientLight: number;
  moonPhaseIndex?: number;
  weather?: WeatherType;
  weatherIntensity?: number;
}

export interface Cloud {
  x: number;
  y: number;
  width: number;
  speed: number;
  opacity: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export interface InputState {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  jumpJustPressed: boolean;
  sprint?: boolean;
  analogX?: number;
  analogY?: number;
}

export interface ProfilerMetrics {
  fps?: number;
  avgFrameTime: number;
  worstFrameTime: number;
  renderTime: number;
  physicsTime: number;
  chunkMgmtTime: number;
  chunkGenTime: number;
  queuedChunks: number;
  frameTime: number; // Backwards compatible alias for avgFrameTime
  updateTime: number; // Backwards compatible alias for physicsTime
}

export interface HotbarItem {
  type: string | null;
  name: string;
  count: number;
  color: string;
  borderColor: string;
  isWeapon?: boolean;
  isPermanent?: boolean;
  toolKind?: 'pickaxe' | 'axe' | 'sword' | 'hoe';
  toolTier?: 'wood' | 'stone' | 'copper' | 'iron' | 'gold' | 'diamond' | 'astral' | 'celestial';
  isMeat?: boolean;
}

export interface ActiveFoodBuff {
  id: 'berserker' | 'swiftness' | 'fortitude' | 'agility' | 'regeneration' | 'ferocity' | 'amphibious' | 'titan';
  name: string;
  icon: string;
  description: string;
  remainingSec: number;
  durationSec: number;
  color: string;
}

export interface GameStats {
  fps: number;
  timeOfDayFormatted: string;
  dayCount: number;
  playerX: number;
  playerY: number;
  chunkX: number;
  chunkY: number;
  depthName: string;
  depthMeters: number;
  loadedChunks: number;
  visibleChunks: number;
  seed: number;
  profiler: ProfilerMetrics;
  hotbar: HotbarItem[];
  activeSlot: number;
  zoom: number;
  activeDrops: number;
  health: number;
  maxHealth: number;
  food: number;
  maxFood: number;
  stamina: number;
  maxStamina: number;
  isSprinting: boolean;
  activeEnemies: number;
  biomeName: string;
  hasHome: boolean;
  homeX: number;
  homeY: number;
  homeCooldownMs: number;
  teleportStatus: string;
  moonPhaseIndex?: number;
  moonPhaseName?: string;
  moonPhaseIcon?: string;
  auroraActive?: boolean;
  skyPeriod?: string;
  weather?: WeatherType;
  weatherLabel?: string;
  weatherIcon?: string;
  weatherEffect?: string;
  isExposedToWeather?: boolean;
  isNearWarmth?: boolean;
  activeBuffs?: ActiveFoodBuff[];
  isFlying?: boolean;
  isCreative?: boolean;
}
