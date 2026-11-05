import { TileDefinition, TileType } from './types';

// Chunk & Tile dimensions
export const CHUNK_WIDTH = 32; // blocks per chunk horizontally
export const CHUNK_HEIGHT = 32; // blocks per chunk vertically
export const TILE_SIZE = 16; // pixels per tile (16x16)
export const PROTECTOR_RADIUS_BLOCKS = 50; // 50-block safe territory in each direction
export const MAX_PROTECTORS_PER_PLAYER = 10; // Maximum 10 protectors allowed per player

export const CHUNK_PIXEL_WIDTH = CHUNK_WIDTH * TILE_SIZE; // 512 px
export const CHUNK_PIXEL_HEIGHT = CHUNK_HEIGHT * TILE_SIZE; // 512 px

// Chunk streaming policy:
// Active load radius: 2 chunks around player = 5 columns x 5 rows = 25 chunks target
export const LOAD_RADIUS_X = 2;
export const LOAD_RADIUS_Y = 2;

// Unload radius: chunks outside 3 chunks distance are pruned immediately
export const UNLOAD_RADIUS_X = 3;
export const UNLOAD_RADIUS_Y = 3;

// Maximum time budget (ms) allocated for chunk generation per animation frame
export const CHUNK_GEN_TIME_BUDGET_MS = 2.5;

// World & Surface baseline
export const SURFACE_BASE_Y = 64; // baseline surface elevation in blocks
export const BEDROCK_Y = SURFACE_BASE_Y + 3000; // 3000 blocks below surface before unmineable bedrock floor

// Player dimensions & physics
export const PLAYER_WIDTH = 14;
export const PLAYER_HEIGHT = 26;

export const GRAVITY = 1100; // px / sec^2
export const MOVE_SPEED = 180; // max horizontal speed px/sec
export const ACCELERATION = 1400; // px / sec^2
export const FRICTION = 1600; // px / sec^2 on ground
export const AIR_ACCELERATION = 900;
export const AIR_FRICTION = 400;
export const JUMP_VELOCITY = -410; // initial jump burst px/sec
export const JUMP_RELEASE_DAMPING = 0.5; // cuts jump height if space is released early
export const TERMINAL_VELOCITY = 750; // max fall speed px/sec

export const COYOTE_TIME = 0.12; // grace period after falling off ledge
export const JUMP_BUFFER = 0.12; // register jump slightly before landing

// Day/Night cycle
export const DAY_CYCLE_DURATION_SEC = 180;

// Tile Definitions
export const TILE_DEFS: Record<TileType, TileDefinition> = {
  [TileType.AIR]: {
    id: TileType.AIR,
    name: 'Air',
    isSolid: false,
    color: 'transparent',
    darkColor: 'transparent',
    lightColor: 'transparent',
  },
  [TileType.GRASS]: {
    id: TileType.GRASS,
    name: 'Grass',
    isSolid: true,
    color: '#4ade80',
    darkColor: '#16a34a',
    lightColor: '#86efac',
  },
  [TileType.DIRT]: {
    id: TileType.DIRT,
    name: 'Dirt',
    isSolid: true,
    color: '#854d0e',
    darkColor: '#713f12',
    lightColor: '#a16207',
  },
  [TileType.STONE]: {
    id: TileType.STONE,
    name: 'Stone',
    isSolid: true,
    color: '#64748b',
    darkColor: '#475569',
    lightColor: '#94a3b8',
  },
  [TileType.WOOD]: {
    id: TileType.WOOD,
    name: 'Wood Trunk',
    isSolid: false,
    color: '#78350f',
    darkColor: '#451a03',
    lightColor: '#92400e',
  },
  [TileType.LEAVES]: {
    id: TileType.LEAVES,
    name: 'Leaves',
    isSolid: false,
    color: '#15803d',
    darkColor: '#166534',
    lightColor: '#22c55e',
  },
  [TileType.FLOWER]: {
    id: TileType.FLOWER,
    name: 'Wildflower',
    isSolid: false,
    color: '#f43f5e',
    darkColor: '#e11d48',
    lightColor: '#fb7185',
  },
  [TileType.TALL_GRASS]: {
    id: TileType.TALL_GRASS,
    name: 'Tall Grass',
    isSolid: false,
    color: '#22c55e',
    darkColor: '#15803d',
    lightColor: '#4ade80',
  },
  [TileType.SAND]: { id: TileType.SAND, name: 'Sand', isSolid: true, color: '#e7c873', darkColor: '#c4a24e', lightColor: '#f5e3a2' },
  [TileType.SANDSTONE]: { id: TileType.SANDSTONE, name: 'Sandstone', isSolid: true, color: '#c2a56b', darkColor: '#967b4b', lightColor: '#dfc68f' },
  [TileType.SNOW]: { id: TileType.SNOW, name: 'Snow', isSolid: true, color: '#f8fafc', darkColor: '#cbd5e1', lightColor: '#ffffff' },
  [TileType.SNOWY_DIRT]: { id: TileType.SNOWY_DIRT, name: 'Snowy Dirt', isSolid: true, color: '#8b8d83', darkColor: '#62675f', lightColor: '#b8baae' },
  [TileType.BIRCH_WOOD]: { id: TileType.BIRCH_WOOD, name: 'Birch Wood', isSolid: false, color: '#d6d3c1', darkColor: '#78716c', lightColor: '#f5f5e8' },
  [TileType.BIRCH_LEAVES]: { id: TileType.BIRCH_LEAVES, name: 'Birch Leaves', isSolid: false, color: '#65a30d', darkColor: '#3f6212', lightColor: '#a3e635' },
  [TileType.CACTUS]: { id: TileType.CACTUS, name: 'Cactus', isSolid: false, color: '#15803d', darkColor: '#14532d', lightColor: '#4ade80' },
  [TileType.DRY_GRASS]: { id: TileType.DRY_GRASS, name: 'Dry Grass', isSolid: true, color: '#b99b45', darkColor: '#85712f', lightColor: '#ddc26a' },
  [TileType.ACACIA_WOOD]: { id: TileType.ACACIA_WOOD, name: 'Acacia Wood', isSolid: false, color: '#9b5735', darkColor: '#65351f', lightColor: '#c27a4e' },
  [TileType.ACACIA_LEAVES]: { id: TileType.ACACIA_LEAVES, name: 'Acacia Leaves', isSolid: false, color: '#78923b', darkColor: '#52672a', lightColor: '#a4b85c' },
  [TileType.BAMBOO]: { id: TileType.BAMBOO, name: 'Bamboo', isSolid: false, color: '#86a83d', darkColor: '#557126', lightColor: '#bdd56a' },
  [TileType.CHERRY_WOOD]: { id: TileType.CHERRY_WOOD, name: 'Cherry Wood', isSolid: false, color: '#80534e', darkColor: '#523936', lightColor: '#b77d76' },
  [TileType.CHERRY_LEAVES]: { id: TileType.CHERRY_LEAVES, name: 'Cherry Leaves', isSolid: false, color: '#ec9dbb', darkColor: '#c66b91', lightColor: '#ffd0df' },
  [TileType.FLOWER_GRASS]: { id: TileType.FLOWER_GRASS, name: 'Flower Grass', isSolid: true, color: '#719d45', darkColor: '#4f7130', lightColor: '#f49bc0' },
  [TileType.CORAL]: { id: TileType.CORAL, name: 'Coral', isSolid: false, color: '#ff7b79', darkColor: '#c64b60', lightColor: '#ffc29b' },
  [TileType.CORAL_BLOCK]: { id: TileType.CORAL_BLOCK, name: 'Coral Block', isSolid: true, color: '#f08b9c', darkColor: '#bc6076', lightColor: '#ffc0ca' },
  [TileType.ICE]: { id: TileType.ICE, name: 'Ice', isSolid: true, color: '#b7e6f4', darkColor: '#79bdd7', lightColor: '#e6fbff' },
  [TileType.PACKED_ICE]: { id: TileType.PACKED_ICE, name: 'Packed Ice', isSolid: true, color: '#78c5df', darkColor: '#438ba9', lightColor: '#b7ebf8' },
  [TileType.BLUE_ICE]: { id: TileType.BLUE_ICE, name: 'Blue Ice', isSolid: true, color: '#438bd0', darkColor: '#245d9b', lightColor: '#88c2fa' },
  [TileType.MUD]: { id: TileType.MUD, name: 'Mud', isSolid: true, color: '#594735', darkColor: '#382f27', lightColor: '#80644a' },
  [TileType.ASH]: { id: TileType.ASH, name: 'Ash', isSolid: true, color: '#55545b', darkColor: '#35343a', lightColor: '#77767d' },
  [TileType.BASALT]: { id: TileType.BASALT, name: 'Basalt', isSolid: true, color: '#403b46', darkColor: '#25222b', lightColor: '#69616f' },
  [TileType.MAGMA]: { id: TileType.MAGMA, name: 'Magma', isSolid: true, color: '#e34b20', darkColor: '#912c22', lightColor: '#ffb02e' },
  [TileType.GLOWING_CRYSTAL]: { id: TileType.GLOWING_CRYSTAL, name: 'Glowing Crystal', isSolid: false, color: '#65f2df', darkColor: '#27a99e', lightColor: '#d0fff7' },
  [TileType.GLOWING_MUSHROOM]: { id: TileType.GLOWING_MUSHROOM, name: 'Glowing Mushroom', isSolid: false, color: '#cc74e8', darkColor: '#8843ac', lightColor: '#f3bbff' },
  [TileType.VINE]: { id: TileType.VINE, name: 'Vine', isSolid: false, color: '#477d3b', darkColor: '#2e5429', lightColor: '#78ad56' },
  [TileType.OASIS_GRASS]: { id: TileType.OASIS_GRASS, name: 'Oasis Grass', isSolid: true, color: '#4ca96e', darkColor: '#28784c', lightColor: '#8bdb9a' },
  [TileType.RED_SAND]: { id: TileType.RED_SAND, name: 'Red Sand', isSolid: true, color: '#c96946', darkColor: '#944735', lightColor: '#e88b5c' },
  [TileType.MUSHROOM_GRASS]: { id: TileType.MUSHROOM_GRASS, name: 'Mushroom Soil', isSolid: true, color: '#805c83', darkColor: '#5d4261', lightColor: '#b57da9' },
  [TileType.SALT]: { id: TileType.SALT, name: 'Salt', isSolid: true, color: '#e6e0d4', darkColor: '#bcb6ab', lightColor: '#fffdf5' },
  [TileType.PALM_WOOD]: { id: TileType.PALM_WOOD, name: 'Palm Wood', isSolid: false, color: '#9d7041', darkColor: '#68482d', lightColor: '#c39358' },
  [TileType.PALM_LEAVES]: { id: TileType.PALM_LEAVES, name: 'Palm Leaves', isSolid: false, color: '#5c9f48', darkColor: '#397033', lightColor: '#9bcf65' },
  [TileType.WATER]: { id: TileType.WATER, name: 'Water', isSolid: false, color: '#388fc2', darkColor: '#226496', lightColor: '#72c4eb' },
  [TileType.OBSIDIAN]: { id: TileType.OBSIDIAN, name: 'Obsidian', isSolid: true, color: '#30283f', darkColor: '#171421', lightColor: '#5d4e79' },
  [TileType.COAL_ORE]: { id: TileType.COAL_ORE, name: 'Coal Ore', isSolid: true, color: '#626a70', darkColor: '#383e43', lightColor: '#272a2d' },
  [TileType.COPPER_ORE]: { id: TileType.COPPER_ORE, name: 'Copper Ore', isSolid: true, color: '#776357', darkColor: '#493c35', lightColor: '#d07d4b' },
  [TileType.IRON_ORE]: { id: TileType.IRON_ORE, name: 'Iron Ore', isSolid: true, color: '#71767a', darkColor: '#42484a', lightColor: '#c6a786' },
  [TileType.GOLD_ORE]: { id: TileType.GOLD_ORE, name: 'Gold Ore', isSolid: true, color: '#76684b', darkColor: '#46402e', lightColor: '#e9bd4f' },
  [TileType.CRYSTAL_ORE]: { id: TileType.CRYSTAL_ORE, name: 'Crystal Ore', isSolid: true, color: '#625b75', darkColor: '#3e394d', lightColor: '#b69ae4' },
  [TileType.DIAMOND_ORE]: { id: TileType.DIAMOND_ORE, name: 'Diamond Ore', isSolid: true, color: '#526f73', darkColor: '#34494c', lightColor: '#81dfd5' },
  [TileType.CRAFTING_TABLE]: { id: TileType.CRAFTING_TABLE, name: 'Crafting Table', isSolid: true, color: '#a16207', darkColor: '#713f12', lightColor: '#ca8a04' },
  [TileType.PLANKS]: { id: TileType.PLANKS, name: 'Planks', isSolid: true, color: '#b77943', darkColor: '#7c4526', lightColor: '#d6975a' },
  [TileType.FURNACE]: { id: TileType.FURNACE, name: 'Furnace', isSolid: true, color: '#64748b', darkColor: '#334155', lightColor: '#94a3b8' },
  [TileType.TORCH]: { id: TileType.TORCH, name: 'Torch', isSolid: false, color: '#fbbf24', darkColor: '#b45309', lightColor: '#fef08a' },
  [TileType.CHEST]: { id: TileType.CHEST, name: 'Chest', isSolid: true, color: '#a16207', darkColor: '#713f12', lightColor: '#fbbf24' },
  [TileType.DOOR]: { id: TileType.DOOR, name: 'Door', isSolid: true, color: '#8b5a2b', darkColor: '#593718', lightColor: '#b97b43' },
  [TileType.LADDER]: { id: TileType.LADDER, name: 'Ladder', isSolid: false, color: '#c08445', darkColor: '#854d0e', lightColor: '#e8b66d' },
  [TileType.BED]: { id: TileType.BED, name: 'Bed', isSolid: false, color: '#ef6b86', darkColor: '#a33e61', lightColor: '#ffb5c2' },
  [TileType.CAMPFIRE]: { id: TileType.CAMPFIRE, name: 'Campfire', isSolid: false, color: '#f97316', darkColor: '#9a3412', lightColor: '#fdba74' },
  [TileType.LEVER]: { id: TileType.LEVER, name: 'Lever', isSolid: false, color: '#a8a29e', darkColor: '#57534e', lightColor: '#e7e5e4' },
  [TileType.SIGN]: { id: TileType.SIGN, name: 'Sign', isSolid: false, color: '#b77943', darkColor: '#7c4526', lightColor: '#d6975a' },
  [TileType.PLATFORM]: { id: TileType.PLATFORM, name: 'Platform', isSolid: false, color: '#b77943', darkColor: '#7c4526', lightColor: '#d6975a' },
  [TileType.DOOR_OPEN]: { id: TileType.DOOR_OPEN, name: 'Open Door', isSolid: false, color: '#8b5a2b', darkColor: '#593718', lightColor: '#b97b43' },
  [TileType.LEVER_ON]: { id: TileType.LEVER_ON, name: 'Lever (On)', isSolid: false, color: '#facc15', darkColor: '#a16207', lightColor: '#fef08a' },
  [TileType.CAMPFIRE_OFF]: { id: TileType.CAMPFIRE_OFF, name: 'Campfire (Off)', isSolid: false, color: '#78716c', darkColor: '#44403c', lightColor: '#a8a29e' },
  [TileType.PRESSURE_PLATE]: { id: TileType.PRESSURE_PLATE, name: 'Pressure Plate', isSolid: false, color: '#94a3b8', darkColor: '#475569', lightColor: '#cbd5e1' },
  [TileType.PRESSURE_PLATE_PRESSED]: { id: TileType.PRESSURE_PLATE_PRESSED, name: 'Pressure Plate (Pressed)', isSolid: false, color: '#64748b', darkColor: '#334155', lightColor: '#94a3b8' },
  [TileType.TRAPDOOR]: { id: TileType.TRAPDOOR, name: 'Trapdoor', isSolid: true, color: '#a16207', darkColor: '#713f12', lightColor: '#ca8a04' },
  [TileType.TRAPDOOR_OPEN]: { id: TileType.TRAPDOOR_OPEN, name: 'Trapdoor (Open)', isSolid: false, color: '#a16207', darkColor: '#713f12', lightColor: '#ca8a04' },
  [TileType.GATE]: { id: TileType.GATE, name: 'Gate', isSolid: true, color: '#78350f', darkColor: '#451a03', lightColor: '#a16207' },
  [TileType.GATE_OPEN]: { id: TileType.GATE_OPEN, name: 'Gate (Open)', isSolid: false, color: '#78350f', darkColor: '#451a03', lightColor: '#a16207' },
  [TileType.BRIDGE]: { id: TileType.BRIDGE, name: 'Bridge', isSolid: true, color: '#b77943', darkColor: '#7c4526', lightColor: '#d6975a' },
  [TileType.ROPE]: { id: TileType.ROPE, name: 'Rope', isSolid: false, color: '#d6a85f', darkColor: '#854d0e', lightColor: '#f5d08a' },
  [TileType.TILLED_SOIL]: { id: TileType.TILLED_SOIL, name: 'Tilled Soil', isSolid: false, color: '#a16207', darkColor: '#7c3f00', lightColor: '#d97706' },
  [TileType.BERRY_BUSH]: { id: TileType.BERRY_BUSH, name: 'Berry Bush', isSolid: false, color: '#3f7d32', darkColor: '#24552a', lightColor: '#79b84b' },
  [TileType.BEDROCK]: { id: TileType.BEDROCK, name: 'Bedrock', isSolid: true, color: '#1e1b24', darkColor: '#0d0b10', lightColor: '#3f3a4d' },
  [TileType.BEAR_SKULL]: { id: TileType.BEAR_SKULL, name: 'Bear Skull Trophy', isSolid: false, color: '#e2d9cc', darkColor: '#8a7d6b', lightColor: '#fff8ed' },
  [TileType.WOLF_SKULL]: { id: TileType.WOLF_SKULL, name: 'Wolf Skull Trophy', isSolid: false, color: '#e8e2d5', darkColor: '#968c7c', lightColor: '#faf6ee' },
  [TileType.MAMMOTH_SKULL]: { id: TileType.MAMMOTH_SKULL, name: 'Mammoth Skull Trophy', isSolid: false, color: '#f3ede2', darkColor: '#a89d89', lightColor: '#ffffff' },
  [TileType.LION_SKULL]: { id: TileType.LION_SKULL, name: 'Lion Skull Trophy', isSolid: false, color: '#ede0cb', darkColor: '#9c8d73', lightColor: '#fff5e0' },
  [TileType.CROCODILE_SKULL]: { id: TileType.CROCODILE_SKULL, name: 'Crocodile Skull Trophy', isSolid: false, color: '#d5ded0', darkColor: '#788772', lightColor: '#edf7e8' },
  [TileType.ANIMAL_SKELETON]: { id: TileType.ANIMAL_SKELETON, name: 'Animal Skeleton Mount', isSolid: false, color: '#e5ded5', darkColor: '#887d72', lightColor: '#faf3eb' },
  [TileType.PROTECTOR]: { id: TileType.PROTECTOR, name: 'Protector', isSolid: true, color: '#06b6d4', darkColor: '#0e7490', lightColor: '#67e8f9' },
  [TileType.SKY_GRASS]: { id: TileType.SKY_GRASS, name: 'Sky Grass', isSolid: true, color: '#38bdf8', darkColor: '#0284c7', lightColor: '#7dd3fc' },
  [TileType.SKY_DIRT]: { id: TileType.SKY_DIRT, name: 'Sky Dirt', isSolid: true, color: '#4338ca', darkColor: '#312e81', lightColor: '#6366f1' },
  [TileType.SKY_STONE]: { id: TileType.SKY_STONE, name: 'Sky Stone', isSolid: true, color: '#94a3b8', darkColor: '#64748b', lightColor: '#cbd5e1' },
  [TileType.ASTRAL_ORE]: { id: TileType.ASTRAL_ORE, name: 'Astral Ore', isSolid: true, color: '#f59e0b', darkColor: '#b45309', lightColor: '#fde047' },
  [TileType.CELESTIAL_ORE]: { id: TileType.CELESTIAL_ORE, name: 'Celestial Ore', isSolid: true, color: '#a855f7', darkColor: '#7e22ce', lightColor: '#e9d5ff' },
  [TileType.STAR_FLOWER]: { id: TileType.STAR_FLOWER, name: 'Star Flower', isSolid: false, color: '#fef08a', darkColor: '#eab308', lightColor: '#ffffff' },
  [TileType.SKY_VINE]: { id: TileType.SKY_VINE, name: 'Sky Vine', isSolid: false, color: '#38bdf8', darkColor: '#0369a1', lightColor: '#bae6fd' },
  [TileType.CELESTIAL_WOOD]: { id: TileType.CELESTIAL_WOOD, name: 'Celestial Wood', isSolid: false, color: '#c084fc', darkColor: '#7e22ce', lightColor: '#e9d5ff' },
  [TileType.CELESTIAL_LEAVES]: { id: TileType.CELESTIAL_LEAVES, name: 'Celestial Leaves', isSolid: false, color: '#818cf8', darkColor: '#4f46e5', lightColor: '#c7d2fe' },
};
