import { ActiveFoodBuff, TileType } from './types';
import { TILE_DEFS } from './constants';

export type ItemType = 'dirt' | 'stone' | 'wood' | 'leaves' | 'sand' | 'sandstone' | 'snow' | 'snowy_dirt' | 'birch_wood' | 'birch_leaves' | 'cactus' | 'sword' | 'gel'
  | 'dry_grass' | 'acacia_wood' | 'acacia_leaves' | 'bamboo' | 'cherry_wood' | 'cherry_leaves' | 'flower_grass'
  | 'coral' | 'coral_block' | 'ice' | 'packed_ice' | 'blue_ice' | 'mud' | 'ash' | 'basalt' | 'magma'
  | 'glowing_crystal' | 'glowing_mushroom' | 'vine' | 'oasis_grass' | 'red_sand' | 'mushroom_grass' | 'salt'
  | 'palm_wood' | 'palm_leaves' | 'water' | 'obsidian' | 'coal' | 'copper' | 'iron' | 'gold' | 'crystal' | 'diamond'
  | 'copper_bar' | 'iron_bar' | 'gold_bar'
  | 'planks' | 'stick' | 'crafting_table' | 'torch' | 'furnace' | 'chest'
  | 'wooden_pickaxe' | 'wooden_axe' | 'wooden_sword'
  | 'stone_pickaxe' | 'stone_axe' | 'stone_sword'
  | 'copper_pickaxe' | 'iron_pickaxe' | 'gold_pickaxe' | 'diamond_pickaxe'
  | 'copper_axe' | 'iron_axe' | 'gold_axe' | 'diamond_axe'
  | 'copper_sword' | 'iron_sword' | 'gold_sword' | 'diamond_sword'
  | 'door' | 'ladder' | 'bed' | 'campfire' | 'lever' | 'sign' | 'platform' | 'wool'
  | 'pressure_plate' | 'trapdoor' | 'gate' | 'bridge' | 'rope'
  | 'wooden_hoe' | 'tilled_soil' | 'wheat_seed' | 'wheat' | 'carrot_seed' | 'carrot' | 'berry_seed' | 'berry'
  | 'venison' | 'rabbit_meat' | 'boar_meat' | 'fox_meat' | 'bird_meat' | 'fish'
  | 'wolf_meat' | 'bear_meat' | 'lion_meat' | 'crocodile_meat' | 'mammoth_meat'
  | 'bear_skull' | 'wolf_skull' | 'mammoth_skull' | 'lion_skull' | 'crocodile_skull' | 'animal_skeleton' | 'bone'
  | 'protector'
  | 'sky_grass' | 'sky_dirt' | 'sky_stone'
  | 'astral_ore' | 'astral_ingot' | 'celestial_ore' | 'celestial_ingot'
  | 'star_flower' | 'sky_vine' | 'celestial_wood' | 'celestial_leaves' | 'celestial_planks'
  | 'astral_pickaxe' | 'astral_sword' | 'astral_axe' | 'celestial_pickaxe' | 'celestial_sword' | 'celestial_axe';

export const MEAT_ITEMS = new Set<ItemType>([
  'venison',
  'rabbit_meat',
  'boar_meat',
  'fox_meat',
  'bird_meat',
  'fish',
  'wolf_meat',
  'bear_meat',
  'lion_meat',
  'crocodile_meat',
  'mammoth_meat',
]);

export function isMeatItem(item: ItemType | string | null | undefined): item is ItemType {
  return typeof item === 'string' && MEAT_ITEMS.has(item as ItemType);
}

const PLANT_FOOD_ITEMS = new Set<ItemType>(['wheat', 'carrot', 'berry']);

export function isEdibleItem(item: ItemType | string | null | undefined): item is ItemType {
  return isMeatItem(item) || (typeof item === 'string' && PLANT_FOOD_ITEMS.has(item as ItemType));
}

export function getBerryBushSeedDropCount(worldSeed: number, x: number, y: number): number {
  const roll = (Math.imul(worldSeed ^ x, 0x9e3779b1) ^ Math.imul(y, 0x45d9f3b)) >>> 0;
  return roll % 100 < 35 ? 1 + ((roll >>> 8) & 1) : 0;
}

export interface MeatNutrition {
  food: number;
  health: number;
}

export const MEAT_NUTRITION: Record<ItemType | string, MeatNutrition> = {
  wheat: { food: 12, health: 0 },
  carrot: { food: 18, health: 2 },
  berry: { food: 15, health: 1 },
  venison: { food: 30, health: 8 },
  rabbit_meat: { food: 18, health: 4 },
  boar_meat: { food: 35, health: 10 },
  fox_meat: { food: 22, health: 5 },
  bird_meat: { food: 15, health: 3 },
  fish: { food: 25, health: 6 },
  wolf_meat: { food: 32, health: 12 },
  bear_meat: { food: 50, health: 25 },
  lion_meat: { food: 40, health: 18 },
  crocodile_meat: { food: 36, health: 15 },
  mammoth_meat: { food: 65, health: 35 },
};

export const MEAT_BUFFS: Partial<Record<ItemType, Omit<ActiveFoodBuff, 'remainingSec'>>> = {
  wolf_meat: {
    id: 'swiftness',
    name: 'Wolf Sprint',
    icon: '🐺',
    description: '+40% Move Speed & +20% Jump Boost',
    durationSec: 60,
    color: '#38bdf8',
  },
  bear_meat: {
    id: 'fortitude',
    name: 'Ursine Fortitude',
    icon: '🐻',
    description: '+40% Damage Defense & Health Regen',
    durationSec: 60,
    color: '#fb923c',
  },
  lion_meat: {
    id: 'ferocity',
    name: "Lion's Ferocity",
    icon: '🦁',
    description: '+60% Sword Damage & Heavy Knockback',
    durationSec: 60,
    color: '#eab308',
  },
  crocodile_meat: {
    id: 'amphibious',
    name: 'Amphibious Vigor',
    icon: '🐊',
    description: 'Unlimited Breath & 2x Swim Speed',
    durationSec: 60,
    color: '#4ade80',
  },
  mammoth_meat: {
    id: 'titan',
    name: 'Colossal Titan',
    icon: '🐘',
    description: '+50 Max HP Bonus & 2x Mining Speed',
    durationSec: 60,
    color: '#c084fc',
  },
};

export type ToolKind = 'pickaxe' | 'axe' | 'sword' | 'hoe';
export type ToolTier = 'wood' | 'stone' | 'copper' | 'iron' | 'gold' | 'diamond' | 'astral' | 'celestial';

export interface BlockConfig {
  id: TileType;
  name: string;
  miningTime: number; // in seconds
  dropItem: ItemType | null;
  isSolid: boolean;
  isMineable: boolean;
  color: string;
  darkColor: string;
  lightColor: string;
}

const BASE_BLOCK_CONFIGS: Partial<Record<TileType, BlockConfig>> = {
  [TileType.AIR]: {
    id: TileType.AIR,
    name: 'Air',
    miningTime: 0,
    dropItem: null,
    isSolid: false,
    isMineable: false,
    color: 'transparent',
    darkColor: 'transparent',
    lightColor: 'transparent',
  },
  [TileType.GRASS]: {
    id: TileType.GRASS,
    name: 'Grass',
    miningTime: 0.4, // 0.4s
    dropItem: 'dirt',
    isSolid: true,
    isMineable: true,
    color: '#4ade80',
    darkColor: '#16a34a',
    lightColor: '#86efac',
  },
  [TileType.DIRT]: {
    id: TileType.DIRT,
    name: 'Dirt',
    miningTime: 0.35, // 0.35s
    dropItem: 'dirt',
    isSolid: true,
    isMineable: true,
    color: '#854d0e',
    darkColor: '#713f12',
    lightColor: '#a16207',
  },
  [TileType.STONE]: {
    id: TileType.STONE,
    name: 'Stone',
    miningTime: 1.2, // 1.2s
    dropItem: 'stone',
    isSolid: true,
    isMineable: true,
    color: '#64748b',
    darkColor: '#475569',
    lightColor: '#94a3b8',
  },
  [TileType.WOOD]: {
    id: TileType.WOOD,
    name: 'Wood',
    miningTime: 0.7, // 0.7s
    dropItem: 'wood',
    isSolid: false, // player can pass through decorative trunk, or can be placed
    isMineable: true,
    color: '#78350f',
    darkColor: '#451a03',
    lightColor: '#92400e',
  },
  [TileType.LEAVES]: {
    id: TileType.LEAVES,
    name: 'Leaves',
    miningTime: 0.15, // 0.15s
    dropItem: 'leaves',
    isSolid: false,
    isMineable: true,
    color: '#15803d',
    darkColor: '#166534',
    lightColor: '#22c55e',
  },
  [TileType.FLOWER]: {
    id: TileType.FLOWER,
    name: 'Flower',
    miningTime: 0.1,
    dropItem: null,
    isSolid: false,
    isMineable: true,
    color: '#f43f5e',
    darkColor: '#e11d48',
    lightColor: '#fb7185',
  },
  [TileType.TALL_GRASS]: {
    id: TileType.TALL_GRASS,
    name: 'Tall Grass',
    miningTime: 0.1,
    dropItem: null,
    isSolid: false,
    isMineable: true,
    color: '#22c55e',
    darkColor: '#15803d',
    lightColor: '#4ade80',
  },
  [TileType.SAND]: { id: TileType.SAND, name: 'Sand', miningTime: 0.35, dropItem: 'sand', isSolid: true, isMineable: true, color: '#e7c873', darkColor: '#c4a24e', lightColor: '#f5e3a2' },
  [TileType.SANDSTONE]: { id: TileType.SANDSTONE, name: 'Sandstone', miningTime: 0.8, dropItem: 'sandstone', isSolid: true, isMineable: true, color: '#c2a56b', darkColor: '#967b4b', lightColor: '#dfc68f' },
  [TileType.SNOW]: { id: TileType.SNOW, name: 'Snow', miningTime: 0.3, dropItem: 'snow', isSolid: true, isMineable: true, color: '#f8fafc', darkColor: '#cbd5e1', lightColor: '#ffffff' },
  [TileType.SNOWY_DIRT]: { id: TileType.SNOWY_DIRT, name: 'Snowy Dirt', miningTime: 0.4, dropItem: 'snowy_dirt', isSolid: true, isMineable: true, color: '#8b8d83', darkColor: '#62675f', lightColor: '#b8baae' },
  [TileType.BIRCH_WOOD]: { id: TileType.BIRCH_WOOD, name: 'Birch Wood', miningTime: 0.7, dropItem: 'birch_wood', isSolid: false, isMineable: true, color: '#d6d3c1', darkColor: '#78716c', lightColor: '#f5f5e8' },
  [TileType.BIRCH_LEAVES]: { id: TileType.BIRCH_LEAVES, name: 'Birch Leaves', miningTime: 0.15, dropItem: 'birch_leaves', isSolid: false, isMineable: true, color: '#65a30d', darkColor: '#3f6212', lightColor: '#a3e635' },
  [TileType.CACTUS]: { id: TileType.CACTUS, name: 'Cactus', miningTime: 0.25, dropItem: 'cactus', isSolid: false, isMineable: true, color: '#15803d', darkColor: '#14532d', lightColor: '#4ade80' },
  [TileType.CRAFTING_TABLE]: { id: TileType.CRAFTING_TABLE, name: 'Crafting Table', miningTime: 0.6, dropItem: 'crafting_table', isSolid: true, isMineable: true, color: '#a16207', darkColor: '#713f12', lightColor: '#ca8a04' },
  [TileType.PLANKS]: { id: TileType.PLANKS, name: 'Planks', miningTime: 0.5, dropItem: 'planks', isSolid: true, isMineable: true, color: '#b77943', darkColor: '#7c4526', lightColor: '#d6975a' },
  [TileType.FURNACE]: { id: TileType.FURNACE, name: 'Furnace', miningTime: 1.0, dropItem: 'furnace', isSolid: true, isMineable: true, color: '#64748b', darkColor: '#334155', lightColor: '#94a3b8' },
  [TileType.TORCH]: { id: TileType.TORCH, name: 'Torch', miningTime: 0.1, dropItem: 'torch', isSolid: false, isMineable: true, color: '#fbbf24', darkColor: '#b45309', lightColor: '#fef08a' },
  [TileType.CHEST]: { id: TileType.CHEST, name: 'Chest', miningTime: 0.8, dropItem: 'chest', isSolid: true, isMineable: true, color: '#a16207', darkColor: '#713f12', lightColor: '#fbbf24' },
  [TileType.DOOR]: { id: TileType.DOOR, name: 'Door', miningTime: 0.6, dropItem: 'door', isSolid: true, isMineable: true, color: '#8b5a2b', darkColor: '#593718', lightColor: '#b97b43' },
  [TileType.LADDER]: { id: TileType.LADDER, name: 'Ladder', miningTime: 0.3, dropItem: 'ladder', isSolid: false, isMineable: true, color: '#c08445', darkColor: '#854d0e', lightColor: '#e8b66d' },
  [TileType.BED]: { id: TileType.BED, name: 'Bed', miningTime: 0.4, dropItem: 'bed', isSolid: false, isMineable: true, color: '#ef6b86', darkColor: '#a33e61', lightColor: '#ffb5c2' },
  [TileType.CAMPFIRE]: { id: TileType.CAMPFIRE, name: 'Campfire', miningTime: 0.4, dropItem: 'campfire', isSolid: false, isMineable: true, color: '#f97316', darkColor: '#9a3412', lightColor: '#fdba74' },
  [TileType.LEVER]: { id: TileType.LEVER, name: 'Lever', miningTime: 0.2, dropItem: 'lever', isSolid: false, isMineable: true, color: '#a8a29e', darkColor: '#57534e', lightColor: '#e7e5e4' },
  [TileType.SIGN]: { id: TileType.SIGN, name: 'Sign', miningTime: 0.3, dropItem: 'sign', isSolid: false, isMineable: true, color: '#b77943', darkColor: '#7c4526', lightColor: '#d6975a' },
  [TileType.PLATFORM]: { id: TileType.PLATFORM, name: 'Platform', miningTime: 0.2, dropItem: 'platform', isSolid: false, isMineable: true, color: '#b77943', darkColor: '#7c4526', lightColor: '#d6975a' },
  [TileType.DOOR_OPEN]: { id: TileType.DOOR_OPEN, name: 'Open Door', miningTime: 0.6, dropItem: 'door', isSolid: false, isMineable: true, color: '#8b5a2b', darkColor: '#593718', lightColor: '#b97b43' },
  [TileType.LEVER_ON]: { id: TileType.LEVER_ON, name: 'Lever (On)', miningTime: 0.2, dropItem: 'lever', isSolid: false, isMineable: true, color: '#facc15', darkColor: '#a16207', lightColor: '#fef08a' },
  [TileType.CAMPFIRE_OFF]: { id: TileType.CAMPFIRE_OFF, name: 'Campfire (Off)', miningTime: 0.4, dropItem: 'campfire', isSolid: false, isMineable: true, color: '#78716c', darkColor: '#44403c', lightColor: '#a8a29e' },
  [TileType.PRESSURE_PLATE]: { id: TileType.PRESSURE_PLATE, name: 'Pressure Plate', miningTime: 0.2, dropItem: 'pressure_plate', isSolid: false, isMineable: true, color: '#94a3b8', darkColor: '#475569', lightColor: '#cbd5e1' },
  [TileType.PRESSURE_PLATE_PRESSED]: { id: TileType.PRESSURE_PLATE_PRESSED, name: 'Pressure Plate (Pressed)', miningTime: 0.2, dropItem: 'pressure_plate', isSolid: false, isMineable: true, color: '#64748b', darkColor: '#334155', lightColor: '#94a3b8' },
  [TileType.TRAPDOOR]: { id: TileType.TRAPDOOR, name: 'Trapdoor', miningTime: 0.5, dropItem: 'trapdoor', isSolid: true, isMineable: true, color: '#a16207', darkColor: '#713f12', lightColor: '#ca8a04' },
  [TileType.TRAPDOOR_OPEN]: { id: TileType.TRAPDOOR_OPEN, name: 'Trapdoor (Open)', miningTime: 0.5, dropItem: 'trapdoor', isSolid: false, isMineable: true, color: '#a16207', darkColor: '#713f12', lightColor: '#ca8a04' },
  [TileType.GATE]: { id: TileType.GATE, name: 'Gate', miningTime: 0.6, dropItem: 'gate', isSolid: true, isMineable: true, color: '#78350f', darkColor: '#451a03', lightColor: '#a16207' },
  [TileType.GATE_OPEN]: { id: TileType.GATE_OPEN, name: 'Gate (Open)', miningTime: 0.6, dropItem: 'gate', isSolid: false, isMineable: true, color: '#78350f', darkColor: '#451a03', lightColor: '#a16207' },
  [TileType.BRIDGE]: { id: TileType.BRIDGE, name: 'Bridge', miningTime: 0.4, dropItem: 'bridge', isSolid: true, isMineable: true, color: '#b77943', darkColor: '#7c4526', lightColor: '#d6975a' },
  [TileType.ROPE]: { id: TileType.ROPE, name: 'Rope', miningTime: 0.2, dropItem: 'rope', isSolid: false, isMineable: true, color: '#d6a85f', darkColor: '#854d0e', lightColor: '#f5d08a' },
  [TileType.TILLED_SOIL]: { id: TileType.TILLED_SOIL, name: 'Tilled Soil', miningTime: 0.2, dropItem: 'tilled_soil', isSolid: false, isMineable: true, color: '#a16207', darkColor: '#7c3f00', lightColor: '#d97706' },
  [TileType.BERRY_BUSH]: { id: TileType.BERRY_BUSH, name: 'Berry Bush', miningTime: 0.25, dropItem: 'berry', isSolid: false, isMineable: true, color: '#3f7d32', darkColor: '#24552a', lightColor: '#79b84b' },
  [TileType.BEDROCK]: { id: TileType.BEDROCK, name: 'Bedrock', miningTime: Infinity, dropItem: null, isSolid: true, isMineable: false, color: '#1e1b24', darkColor: '#0d0b10', lightColor: '#3f3a4d' },
  [TileType.BEAR_SKULL]: { id: TileType.BEAR_SKULL, name: 'Bear Skull Trophy', miningTime: 0.4, dropItem: 'bear_skull', isSolid: false, isMineable: true, color: '#e2d9cc', darkColor: '#8a7d6b', lightColor: '#fff8ed' },
  [TileType.WOLF_SKULL]: { id: TileType.WOLF_SKULL, name: 'Wolf Skull Trophy', miningTime: 0.35, dropItem: 'wolf_skull', isSolid: false, isMineable: true, color: '#e8e2d5', darkColor: '#968c7c', lightColor: '#faf6ee' },
  [TileType.MAMMOTH_SKULL]: { id: TileType.MAMMOTH_SKULL, name: 'Mammoth Skull Trophy', miningTime: 0.6, dropItem: 'mammoth_skull', isSolid: false, isMineable: true, color: '#f3ede2', darkColor: '#a89d89', lightColor: '#ffffff' },
  [TileType.LION_SKULL]: { id: TileType.LION_SKULL, name: 'Lion Skull Trophy', miningTime: 0.4, dropItem: 'lion_skull', isSolid: false, isMineable: true, color: '#ede0cb', darkColor: '#9c8d73', lightColor: '#fff5e0' },
  [TileType.CROCODILE_SKULL]: { id: TileType.CROCODILE_SKULL, name: 'Crocodile Skull Trophy', miningTime: 0.4, dropItem: 'crocodile_skull', isSolid: false, isMineable: true, color: '#d5ded0', darkColor: '#788772', lightColor: '#edf7e8' },
  [TileType.ANIMAL_SKELETON]: { id: TileType.ANIMAL_SKELETON, name: 'Animal Skeleton Mount', miningTime: 0.5, dropItem: 'animal_skeleton', isSolid: false, isMineable: true, color: '#e5ded5', darkColor: '#887d72', lightColor: '#faf3eb' },
  [TileType.PROTECTOR]: { id: TileType.PROTECTOR, name: 'Protector', miningTime: 1.2, dropItem: 'protector', isSolid: true, isMineable: true, color: '#06b6d4', darkColor: '#0e7490', lightColor: '#67e8f9' },
};

export const EXTRA_BLOCKS: Array<[TileType, ItemType]> = [
  [TileType.DRY_GRASS,'dry_grass'],[TileType.ACACIA_WOOD,'acacia_wood'],[TileType.ACACIA_LEAVES,'acacia_leaves'],[TileType.BAMBOO,'bamboo'],
  [TileType.CHERRY_WOOD,'cherry_wood'],[TileType.CHERRY_LEAVES,'cherry_leaves'],[TileType.FLOWER_GRASS,'flower_grass'],[TileType.CORAL,'coral'],
  [TileType.CORAL_BLOCK,'coral_block'],[TileType.ICE,'ice'],[TileType.PACKED_ICE,'packed_ice'],[TileType.BLUE_ICE,'blue_ice'],[TileType.MUD,'mud'],
  [TileType.ASH,'ash'],[TileType.BASALT,'basalt'],[TileType.MAGMA,'magma'],[TileType.GLOWING_CRYSTAL,'glowing_crystal'],[TileType.GLOWING_MUSHROOM,'glowing_mushroom'],
  [TileType.VINE,'vine'],[TileType.OASIS_GRASS,'oasis_grass'],[TileType.RED_SAND,'red_sand'],[TileType.MUSHROOM_GRASS,'mushroom_grass'],
  [TileType.SALT,'salt'],[TileType.PALM_WOOD,'palm_wood'],[TileType.PALM_LEAVES,'palm_leaves'],[TileType.WATER,'water'],[TileType.OBSIDIAN,'obsidian'],
  [TileType.COAL_ORE,'coal'],[TileType.COPPER_ORE,'copper'],[TileType.IRON_ORE,'iron'],[TileType.GOLD_ORE,'gold'],[TileType.CRYSTAL_ORE,'crystal'],[TileType.DIAMOND_ORE,'diamond'],
  [TileType.SKY_GRASS,'sky_grass'],[TileType.SKY_DIRT,'sky_dirt'],[TileType.SKY_STONE,'sky_stone'],
  [TileType.ASTRAL_ORE,'astral_ore'],[TileType.CELESTIAL_ORE,'celestial_ore'],
  [TileType.STAR_FLOWER,'star_flower'],[TileType.SKY_VINE,'sky_vine'],
  [TileType.CELESTIAL_WOOD,'celestial_wood'],[TileType.CELESTIAL_LEAVES,'celestial_leaves'],
];
export const BLOCK_CONFIGS = {
  ...BASE_BLOCK_CONFIGS,
  ...Object.fromEntries(EXTRA_BLOCKS.map(([id, item]) => {
    const def = TILE_DEFS[id];
    return [id, { id, name: def.name, miningTime: id === TileType.WATER ? 0.12 : def.isSolid ? 0.45 : 0.18, dropItem: item, isSolid: def.isSolid, isMineable: true, color: def.color, darkColor: def.darkColor, lightColor: def.lightColor }];
  })),
} as Record<TileType, BlockConfig>;

// Map item type to tile type when placing
export const ITEM_TO_TILE: Partial<Record<ItemType, TileType>> = {
  ...Object.fromEntries(
    EXTRA_BLOCKS
      .filter(([, item]) => !['coal', 'copper', 'iron', 'gold', 'crystal', 'diamond'].includes(item))
      .map(([tile, item]) => [item, tile])
  ),
  dirt: TileType.DIRT,
  stone: TileType.STONE,
  wood: TileType.WOOD,
  leaves: TileType.LEAVES,
  sand: TileType.SAND,
  sandstone: TileType.SANDSTONE,
  snow: TileType.SNOW,
  snowy_dirt: TileType.SNOWY_DIRT,
  birch_wood: TileType.BIRCH_WOOD,
  birch_leaves: TileType.BIRCH_LEAVES,
  cactus: TileType.CACTUS,
  crafting_table: TileType.CRAFTING_TABLE,
  planks: TileType.PLANKS,
  furnace: TileType.FURNACE,
  chest: TileType.CHEST,
  torch: TileType.TORCH,
  door: TileType.DOOR,
  ladder: TileType.LADDER,
  bed: TileType.BED,
  campfire: TileType.CAMPFIRE,
  lever: TileType.LEVER,
  sign: TileType.SIGN,
  platform: TileType.PLATFORM,
  pressure_plate: TileType.PRESSURE_PLATE,
  trapdoor: TileType.TRAPDOOR,
  gate: TileType.GATE,
  bridge: TileType.BRIDGE,
  rope: TileType.ROPE,
  tilled_soil: TileType.TILLED_SOIL,
  bear_skull: TileType.BEAR_SKULL,
  wolf_skull: TileType.WOLF_SKULL,
  mammoth_skull: TileType.MAMMOTH_SKULL,
  lion_skull: TileType.LION_SKULL,
  crocodile_skull: TileType.CROCODILE_SKULL,
  animal_skeleton: TileType.ANIMAL_SKELETON,
  protector: TileType.PROTECTOR,
  sky_grass: TileType.SKY_GRASS,
  sky_dirt: TileType.SKY_DIRT,
  sky_stone: TileType.SKY_STONE,
  astral_ore: TileType.ASTRAL_ORE,
  celestial_ore: TileType.CELESTIAL_ORE,
  star_flower: TileType.STAR_FLOWER,
  sky_vine: TileType.SKY_VINE,
  celestial_wood: TileType.CELESTIAL_WOOD,
  celestial_leaves: TileType.CELESTIAL_LEAVES,
  celestial_planks: TileType.PLANKS,
};

export const TILE_TO_ITEM: Partial<Record<TileType, ItemType>> = {
  ...Object.fromEntries(EXTRA_BLOCKS),
  ...Object.fromEntries(
    Object.entries(ITEM_TO_TILE).map(([item, tile]) => [tile, item as ItemType])
  ),
};
TILE_TO_ITEM[TileType.DOOR_OPEN] = 'door';
TILE_TO_ITEM[TileType.LEVER_ON] = 'lever';
TILE_TO_ITEM[TileType.CAMPFIRE_OFF] = 'campfire';
TILE_TO_ITEM[TileType.PRESSURE_PLATE_PRESSED] = 'pressure_plate';
TILE_TO_ITEM[TileType.TRAPDOOR_OPEN] = 'trapdoor';
TILE_TO_ITEM[TileType.GATE_OPEN] = 'gate';

// Interaction reach in blocks
export const INTERACTION_RANGE_BLOCKS = 6;
