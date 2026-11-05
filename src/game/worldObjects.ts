import { ItemType } from './blocks';
import { CHEST_SLOT_COUNT, CHEST_STACK_LIMIT, ChestSlot, makeEmptyChestSlots, sanitizeChestSlots } from './chests';
import { TILE_SIZE } from './constants';
import { TileType } from './types';

export type InteractiveObjectType = 'door' | 'ladder' | 'bed' | 'campfire' | 'lever' | 'sign' | 'platform' | 'torch' | 'furnace' | 'chest' | 'pressure_plate' | 'trapdoor' | 'gate' | 'bridge' | 'rope' | 'crop';
export type CropType = 'wheat' | 'carrot' | 'berry';

export const CROP_GROWTH_TIMINGS = {
  wheat: { stage1: 60_000, stage2: 120_000 },
  carrot: { stage1: 75_000, stage2: 150_000 },
  berry: { stage1: 90_000, stage2: 180_000 },
} as const;
export type InteractiveObjectState = {
  id: string;
  type: InteractiveObjectType;
  seed: number;
  x: number;
  y: number;
  open?: boolean;
  active?: boolean;
  text?: string;
  lastInteractedBy?: string;
  interactionRevision: number;
  slots?: ChestSlot[];
  containerRevision?: number;
  cropType?: CropType;
  growthStage?: number;
  plantedAt?: number;
  watered?: boolean;
  wateredAt?: number;
};

export function getCropGrowthStage(object: InteractiveObjectState, now = Date.now()): number {
  if (object.type !== 'crop' || !object.cropType || !object.plantedAt) return 0;
  if (object.watered) return 2;
  const timings = CROP_GROWTH_TIMINGS[object.cropType];
  const elapsed = now - object.plantedAt;
  if (elapsed >= timings.stage2) return 2;
  if (elapsed >= timings.stage1) return 1;
  return 0;
}

export function getCropGrowthProgress(object: InteractiveObjectState, now = Date.now()): number {
  if (object.type !== 'crop' || !object.cropType || !object.plantedAt) return 0;
  if (object.watered) return 1;
  const timings = CROP_GROWTH_TIMINGS[object.cropType];
  return Math.max(0, Math.min(1, (now - object.plantedAt) / timings.stage2));
}

export const OBJECT_TILE: Record<InteractiveObjectType, TileType> = {
  door: TileType.DOOR, ladder: TileType.LADDER, bed: TileType.BED, campfire: TileType.CAMPFIRE,
  lever: TileType.LEVER, sign: TileType.SIGN, platform: TileType.PLATFORM, torch: TileType.TORCH,
  furnace: TileType.FURNACE, chest: TileType.CHEST,
  pressure_plate: TileType.PRESSURE_PLATE, trapdoor: TileType.TRAPDOOR, gate: TileType.GATE,
  bridge: TileType.BRIDGE, rope: TileType.ROPE, crop: TileType.AIR,
};
const OBJECT_TILES = new Map<number, InteractiveObjectType>([
  ...Object.entries(OBJECT_TILE).map(([type, tile]) => [tile, type as InteractiveObjectType] as [number, InteractiveObjectType]),
  [TileType.DOOR_OPEN, 'door'], [TileType.LEVER_ON, 'lever'], [TileType.CAMPFIRE_OFF, 'campfire'],
  [TileType.PRESSURE_PLATE_PRESSED, 'pressure_plate'], [TileType.TRAPDOOR_OPEN, 'trapdoor'], [TileType.GATE_OPEN, 'gate'],
]);
export const OBJECT_ITEM: Record<InteractiveObjectType, ItemType> = {
  door: 'door', ladder: 'ladder', bed: 'bed', campfire: 'campfire', lever: 'lever',
  sign: 'sign', platform: 'platform', torch: 'torch', furnace: 'furnace', chest: 'chest',
  pressure_plate: 'pressure_plate', trapdoor: 'trapdoor', gate: 'gate', bridge: 'bridge', rope: 'rope', crop: 'wheat_seed',
};
export function objectTypeForTile(tile: TileType): InteractiveObjectType | null { return OBJECT_TILES.get(tile) ?? null; }
export function isPlayerTouchingPressurePlate(playerX: number, playerY: number, playerWidth: number, playerHeight: number, tileX: number, tileY: number): boolean {
  const feetY = playerY + playerHeight;
  const plateTop = tileY * TILE_SIZE;
  return playerX < (tileX + 1) * TILE_SIZE && playerX + playerWidth > tileX * TILE_SIZE && Math.abs(feetY - plateTop) <= 3;
}
export function worldObjectId(seed: number, x: number, y: number, type: InteractiveObjectType): string { return `object:${seed}:${x},${y}:${type}`; }
export function makeWorldObject(seed: number, x: number, y: number, type: InteractiveObjectType): InteractiveObjectState {
  const base: InteractiveObjectState = { id: worldObjectId(seed, x, y, type), type, seed, x, y, open: false, active: type === 'torch' || type === 'campfire', text: '',
    interactionRevision: 0, ...(type === 'furnace' || type === 'chest' ? { slots: makeEmptyChestSlots(), containerRevision: 0 } : {}) };
  if (type === 'crop') {
    base.cropType = 'wheat';
    base.growthStage = 0;
    base.plantedAt = Date.now();
    base.watered = false;
    base.wateredAt = 0;
  }
  return base;
}
export function sanitizeWorldObject(value: unknown): InteractiveObjectState | null {
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (typeof o.type !== 'string' || (!Object.prototype.hasOwnProperty.call(OBJECT_TILE, o.type) && o.type !== 'crop') || !Number.isSafeInteger(o.seed) || !Number.isSafeInteger(o.x) || !Number.isSafeInteger(o.y)) return null;
  const type = o.type as InteractiveObjectType, seed = o.seed as number, x = o.x as number, y = o.y as number;
  const result = makeWorldObject(seed, x, y, type);
  if (o.id !== result.id) return null;
  result.open = type === 'door' && o.open === true;
  result.open = (type === 'door' || type === 'trapdoor' || type === 'gate') && o.open === true;
  result.active = (type === 'campfire' || type === 'lever' || type === 'torch' || type === 'pressure_plate')
    ? typeof o.active === 'boolean' ? o.active : result.active
    : false;
  result.text = type === 'sign' && typeof o.text === 'string' ? sanitizeSignText(o.text) : '';
  if (type === 'crop') {
    const cropType = o.cropType;
    result.cropType = cropType === 'wheat' || cropType === 'carrot' || cropType === 'berry' ? cropType : 'wheat';
    result.growthStage = Number.isInteger(o.growthStage) ? Math.max(0, Math.min(2, Number(o.growthStage))) : 0;
    result.plantedAt = typeof o.plantedAt === 'number' && Number.isFinite(o.plantedAt) ? o.plantedAt : Date.now();
    result.watered = typeof o.watered === 'boolean' ? o.watered : false;
    result.wateredAt = typeof o.wateredAt === 'number' && Number.isFinite(o.wateredAt) ? o.wateredAt : 0;
  }
  result.lastInteractedBy = typeof o.lastInteractedBy === 'string' ? o.lastInteractedBy.slice(0, 64) : undefined;
  result.interactionRevision = Number.isSafeInteger(o.interactionRevision) && (o.interactionRevision as number) >= 0 ? o.interactionRevision as number : 0;
  if (type === 'furnace' || type === 'chest') {
    result.slots = sanitizeChestSlots(o.slots);
    result.containerRevision = Number.isSafeInteger(o.containerRevision) && (o.containerRevision as number) >= 0 ? o.containerRevision as number : 0;
  }
  return result;
}
export function sanitizeSignText(text: string): string { return [...text.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180)].join(''); }
export function validContainerCount(count: number): boolean { return Number.isSafeInteger(count) && count > 0 && count <= CHEST_STACK_LIMIT && CHEST_SLOT_COUNT === 27; }
