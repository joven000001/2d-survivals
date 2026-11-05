import { ItemType } from './blocks';
import { Inventory, InventorySlotRef, ITEM_INFO } from './inventory';

export const CHEST_SLOT_COUNT = 27;
export const CHEST_STACK_LIMIT = 64;

export interface ChestSlot {
  item: ItemType | null;
  count: number;
}

export interface WorldChest {
  id: string;
  x: number;
  y: number;
  slots: ChestSlot[];
  revision: number;
  containerType?: 'Chest' | 'Furnace';
}

export type ChestEndpoint = { kind: 'chest'; index: number } | InventorySlotRef;

export function makeWorldChestId(worldKey: string, seed: number, x: number, y: number): string {
  return `chest:${worldKey.trim().normalize('NFKC').toLocaleLowerCase('en-US')}:${seed}:${x},${y}`;
}

export function makeEmptyChestSlots(): ChestSlot[] {
  return Array.from({ length: CHEST_SLOT_COUNT }, () => ({ item: null, count: 0 }));
}

export function sanitizeChestSlots(value: unknown): ChestSlot[] {
  const slots = makeEmptyChestSlots();
  if (!Array.isArray(value)) return slots;
  for (let index = 0; index < Math.min(value.length, CHEST_SLOT_COUNT); index++) {
    const candidate = value[index];
    if (!candidate || typeof candidate !== 'object') continue;
    const slot = candidate as Record<string, unknown>;
    const item = typeof slot.item === 'string' && Object.prototype.hasOwnProperty.call(ITEM_INFO, slot.item)
      ? slot.item as ItemType
      : null;
    const count = typeof slot.count === 'number' && Number.isSafeInteger(slot.count)
      ? Math.max(0, Math.min(CHEST_STACK_LIMIT, slot.count))
      : 0;
    if (item && item !== 'sword' && count > 0) slots[index] = { item, count };
  }
  return slots;
}

function isEndpointValid(endpoint: ChestEndpoint): boolean {
  if (!endpoint || typeof endpoint !== 'object' || !Number.isInteger(endpoint.index)) return false;
  if (endpoint.kind === 'chest') return endpoint.index >= 0 && endpoint.index < CHEST_SLOT_COUNT;
  if (endpoint.kind === 'inventory') return endpoint.index >= 0 && endpoint.index < 49;
  if (endpoint.kind === 'hotbar') return endpoint.index > 0 && endpoint.index < 8;
  return false;
}

function endpointItem(inventory: Inventory, endpoint: ChestEndpoint): ItemType | null {
  if (endpoint.kind === 'chest') return null;
  const slot = endpoint.kind === 'hotbar'
    ? inventory.getSlots()[endpoint.index]
    : inventory.getInventorySlots()[endpoint.index];
  return slot?.type ?? null;
}

/** Apply one atomic chest transfer against copies, committing only after every check succeeds. */
export function transferChestItems(
  inventory: Inventory,
  chestSlots: ChestSlot[],
  from: ChestEndpoint,
  to: ChestEndpoint,
  requestedCount?: number,
): boolean {
  if (!Array.isArray(chestSlots) || chestSlots.length !== CHEST_SLOT_COUNT ||
      !isEndpointValid(from) || !isEndpointValid(to) ||
      (from.kind === to.kind && from.index === to.index) ||
      (from.kind !== 'chest' && to.kind !== 'chest')) return false;

  const nextSlots = sanitizeChestSlots(chestSlots);
  const nextInventory = new Inventory();
  nextInventory.loadFromJSON(inventory.toJSON());
  const sourceItem = from.kind === 'chest'
    ? nextSlots[from.index].item
    : endpointItem(nextInventory, from);
  const available = from.kind === 'chest'
    ? nextSlots[from.index].count
    : sourceItem && sourceItem !== 'sword' ? nextInventory.counts[sourceItem] : 0;
  if (!sourceItem || sourceItem === 'sword' || available <= 0) return false;

  const amount = requestedCount === undefined ? available : requestedCount;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > available) return false;

  const targetItem = to.kind === 'chest'
    ? nextSlots[to.index].item
    : endpointItem(nextInventory, to);

  if (from.kind === 'chest' && to.kind === 'chest') {
    const source = nextSlots[from.index];
    const target = nextSlots[to.index];
    if (!target.item) {
      const moved = Math.min(amount, CHEST_STACK_LIMIT);
      nextSlots[to.index] = { item: sourceItem, count: moved };
      source.count -= moved;
    } else if (target.item === sourceItem) {
      const moved = Math.min(amount, CHEST_STACK_LIMIT - target.count);
      if (moved <= 0) return false;
      target.count += moved;
      source.count -= moved;
    } else {
      if (amount !== available) return false;
      nextSlots[from.index] = { item: target.item, count: target.count };
      nextSlots[to.index] = { item: sourceItem, count: source.count };
      if (nextSlots[to.index].count > CHEST_STACK_LIMIT) return false;
    }
    if (source.count <= 0) nextSlots[from.index] = { item: null, count: 0 };
  } else if (from.kind === 'chest') {
    const targetRef = to as InventorySlotRef;
    if (targetItem && targetItem !== sourceItem) {
      if (amount !== available || nextInventory.counts[targetItem] > CHEST_STACK_LIMIT) return false;
      const oldCount = nextInventory.counts[targetItem];
      if (!nextInventory.consumeItem(targetItem, oldCount)) return false;
      nextSlots[from.index] = { item: targetItem, count: oldCount };
      if (!nextInventory.addItemToSlot(sourceItem, amount, targetRef)) return false;
    } else {
      if (!nextInventory.canStoreItem(sourceItem) || !nextInventory.addItemToSlot(sourceItem, amount, targetRef)) return false;
      nextSlots[from.index].count -= amount;
      if (nextSlots[from.index].count <= 0) nextSlots[from.index] = { item: null, count: 0 };
    }
  } else {
    const sourceRef = from as InventorySlotRef;
    const target = nextSlots[to.index];
    if (!target.item || target.item === sourceItem) {
      const moved = Math.min(amount, target.item ? CHEST_STACK_LIMIT - target.count : CHEST_STACK_LIMIT);
      if (moved <= 0 || !nextSlots[to.index].item && moved > CHEST_STACK_LIMIT) return false;
      if (!nextInventory.consumeItem(sourceItem, moved)) return false;
      if (!target.item) nextSlots[to.index] = { item: sourceItem, count: moved };
      else target.count += moved;
    } else {
      if (amount !== available || target.count > CHEST_STACK_LIMIT) return false;
      const oldItem = target.item;
      const oldCount = target.count;
      if (!nextInventory.canStoreItem(oldItem) || !nextInventory.consumeItem(sourceItem, available)) return false;
      nextSlots[to.index] = { item: sourceItem, count: available };
      if (!nextInventory.addItem(oldItem, oldCount)) return false;
    }
    void sourceRef;
  }

  inventory.loadFromJSON(nextInventory.toJSON());
  for (let index = 0; index < CHEST_SLOT_COUNT; index++) chestSlots[index] = nextSlots[index];
  return true;
}
