import { ToolTier } from './blocks';
import type { ItemType } from './blocks';
import { TileType } from './types';
import type { HotbarSlot, Inventory } from './inventory';

export interface MiningToolProfile {
  allowed: boolean;
  speedMultiplier: number;
  requiredToolName?: string;
  effectiveToolKind?: 'pickaxe' | 'axe';
  effectiveToolTier?: ToolTier;
}

export const TIER_RANK: Record<ToolTier, number> = { wood: 1, stone: 2, copper: 3, iron: 4, gold: 5, diamond: 6, astral: 7, celestial: 8 };
const TIER_NAMES: Record<ToolTier, string> = { wood: 'Wooden', stone: 'Stone', copper: 'Copper', iron: 'Iron', gold: 'Gold', diamond: 'Diamond', astral: 'Astral', celestial: 'Celestial' };

// High-tier metal progression: higher tier ingots yield dramatically faster mining & chopping speeds
export const PICKAXE_SPEED: Record<ToolTier, number> = {
  wood: 2.4,
  stone: 4.0,
  copper: 6.2,
  iron: 9.5,
  gold: 14.5,
  diamond: 21.0,
  astral: 30.0,
  celestial: 42.0,
};

export const AXE_SPEED: Record<ToolTier, number> = {
  wood: 2.4,
  stone: 4.0,
  copper: 6.2,
  iron: 9.5,
  gold: 14.5,
  diamond: 21.0,
  astral: 30.0,
  celestial: 42.0,
};

// Sword damage scaled by metal tier: highest tier metal = highest damage!
export const SWORD_DAMAGE_BY_TIER: Record<ToolTier, number> = {
  wood: 20,
  stone: 32,
  copper: 46,
  iron: 65,
  gold: 90,
  diamond: 125,
  astral: 170,
  celestial: 230,
};

function pickHigherTier(a?: ToolTier | null, b?: ToolTier | null): ToolTier | undefined {
  if (a && b) return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
  return a ?? b ?? undefined;
}

export function getSwordDamage(
  slot?: { type?: string | null; toolTier?: ToolTier; isWeapon?: boolean } | null,
  inventory?: Pick<Inventory, 'getBestOwnedToolTier'> | null
): number {
  const bestOwnedTier = inventory?.getBestOwnedToolTier?.('sword') ?? null;
  let slotTier: ToolTier | undefined = slot?.toolTier;
  if (!slotTier && slot?.type) {
    if (slot.type.startsWith('celestial')) slotTier = 'celestial';
    else if (slot.type.startsWith('astral')) slotTier = 'astral';
    else if (slot.type.startsWith('diamond')) slotTier = 'diamond';
    else if (slot.type.startsWith('gold')) slotTier = 'gold';
    else if (slot.type.startsWith('iron')) slotTier = 'iron';
    else if (slot.type.startsWith('copper')) slotTier = 'copper';
    else if (slot.type.startsWith('stone')) slotTier = 'stone';
    else if (slot.type === 'sword' || slot.type.startsWith('wood')) slotTier = 'wood';
  }
  const effectiveTier = pickHigherTier(slotTier, bestOwnedTier);
  if (effectiveTier && effectiveTier in SWORD_DAMAGE_BY_TIER) {
    return SWORD_DAMAGE_BY_TIER[effectiveTier];
  }
  return 20;
}

export function isSwordItem(type?: string | null): boolean {
  if (!type) return false;
  return type === 'sword' || type.endsWith('_sword');
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

export const WOOD_AND_TREE_BLOCKS = new Set<TileType>([
  TileType.WOOD,
  TileType.BIRCH_WOOD,
  TileType.ACACIA_WOOD,
  TileType.CHERRY_WOOD,
  TileType.PALM_WOOD,
  TileType.CELESTIAL_WOOD,
  TileType.LEAVES,
  TileType.BIRCH_LEAVES,
  TileType.ACACIA_LEAVES,
  TileType.CHERRY_LEAVES,
  TileType.PALM_LEAVES,
  TileType.CELESTIAL_LEAVES,
  TileType.PLANKS,
  TileType.BAMBOO,
  TileType.CACTUS,
  TileType.CRAFTING_TABLE,
  TileType.CHEST,
  TileType.DOOR,
  TileType.PLATFORM,
  TileType.GATE,
  TileType.TRAPDOOR,
  TileType.BRIDGE,
  TileType.LADDER,
  TileType.SIGN,
  TileType.BED,
]);

export const STONE_AND_MINERAL_BLOCKS = new Set<TileType>([
  TileType.STONE,
  TileType.SKY_STONE,
  TileType.SANDSTONE,
  TileType.BASALT,
  TileType.OBSIDIAN,
  TileType.SALT,
  TileType.ICE,
  TileType.PACKED_ICE,
  TileType.BLUE_ICE,
  TileType.CORAL_BLOCK,
  TileType.FURNACE,
  TileType.PRESSURE_PLATE,
  TileType.LEVER,
  TileType.GLOWING_CRYSTAL,
  TileType.PROTECTOR,
]);

export function getMiningToolProfile(
  tile: TileType,
  selected: HotbarSlot | null,
  inventory?: Pick<Inventory, 'getBestOwnedToolTier'> | null
): MiningToolProfile {
  const selectedPickTier = selected?.toolKind === 'pickaxe' ? selected.toolTier : undefined;
  const ownedPickTier = inventory?.getBestOwnedToolTier?.('pickaxe') ?? undefined;
  const effectivePickTier = pickHigherTier(selectedPickTier, ownedPickTier);

  const selectedAxeTier = selected?.toolKind === 'axe' ? selected.toolTier : undefined;
  const ownedAxeTier = inventory?.getBestOwnedToolTier?.('axe') ?? undefined;
  const effectiveAxeTier = pickHigherTier(selectedAxeTier, ownedAxeTier);

  const required = REQUIRED_PICKAXE[tile];
  if (required) {
    if (!effectivePickTier || TIER_RANK[effectivePickTier] < required.rank) {
      return { allowed: false, speedMultiplier: 1, requiredToolName: required.name };
    }
  }

  if (WOOD_AND_TREE_BLOCKS.has(tile) && effectiveAxeTier) {
    return {
      allowed: true,
      speedMultiplier: AXE_SPEED[effectiveAxeTier],
      effectiveToolKind: 'axe',
      effectiveToolTier: effectiveAxeTier,
    };
  }
  if ((STONE_AND_MINERAL_BLOCKS.has(tile) || isOre(tile)) && effectivePickTier) {
    return {
      allowed: true,
      speedMultiplier: PICKAXE_SPEED[effectivePickTier],
      effectiveToolKind: 'pickaxe',
      effectiveToolTier: effectivePickTier,
    };
  }
  return { allowed: true, speedMultiplier: 1 };
}

function isOre(tile: TileType): boolean {
  return (tile >= TileType.COAL_ORE && tile <= TileType.DIAMOND_ORE) || tile === TileType.ASTRAL_ORE || tile === TileType.CELESTIAL_ORE;
}

export function getToolItem(kind: 'pickaxe' | 'axe', tier: ToolTier): ItemType {
  const prefix = tier === 'wood' ? 'wooden' : tier;
  return `${prefix}_${kind}` as ItemType;
}

export const MINING_TOOL_MULTIPLIERS = { hand: 1, pickaxe: PICKAXE_SPEED, axe: AXE_SPEED } as const;
export const MINING_TOOL_TIER_NAMES = TIER_NAMES;
