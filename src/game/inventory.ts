import { EXTRA_BLOCKS, ItemType } from './blocks';
import { ToolKind, ToolTier } from './blocks';
import { TILE_DEFS } from './constants';

export interface HotbarSlot {
  type: ItemType | null;
  name: string;
  count: number;
  color: string;
  borderColor: string;
  isWeapon?: boolean;
  isPermanent?: boolean;
  toolKind?: ToolKind;
  toolTier?: ToolTier;
  isMeat?: boolean;
}

export interface InventorySlotRef { kind: 'inventory' | 'hotbar'; index: number }

export const ITEM_INFO: Record<ItemType, Omit<HotbarSlot, 'type' | 'count'>> = {
  sword:{name:'Sword',color:'#d97706',borderColor:'#fbbf24',toolKind:'sword',toolTier:'wood',isWeapon:true,isPermanent:true},
  dirt:{name:'Dirt',color:'#854d0e',borderColor:'#a16207'}, stone:{name:'Stone',color:'#64748b',borderColor:'#94a3b8'},
  wood:{name:'Wood',color:'#78350f',borderColor:'#92400e'}, leaves:{name:'Leaves',color:'#15803d',borderColor:'#22c55e'},
  gel:{name:'Gel',color:'#38bdf8',borderColor:'#0284c7'}, sand:{name:'Sand',color:'#e7c873',borderColor:'#c4a24e'},
  sandstone:{name:'Sandstone',color:'#c2a56b',borderColor:'#967b4b'}, snow:{name:'Snow',color:'#f8fafc',borderColor:'#cbd5e1'},
  snowy_dirt:{name:'Snowy Dirt',color:'#8b8d83',borderColor:'#62675f'}, birch_wood:{name:'Birch Wood',color:'#d6d3c1',borderColor:'#78716c'},
  birch_leaves:{name:'Birch Leaves',color:'#65a30d',borderColor:'#3f6212'}, cactus:{name:'Cactus',color:'#15803d',borderColor:'#14532d'},
  ...Object.fromEntries(EXTRA_BLOCKS.map(([tile,item])=>[item,{name:TILE_DEFS[tile].name,color:TILE_DEFS[tile].color,borderColor:TILE_DEFS[tile].darkColor}])) as Record<Exclude<ItemType,'sword'|'dirt'|'stone'|'wood'|'leaves'|'gel'|'sand'|'sandstone'|'snow'|'snowy_dirt'|'birch_wood'|'birch_leaves'|'cactus'>, Omit<HotbarSlot,'type'|'count'>>,
  coal:{name:'Coal',color:'#383e43',borderColor:'#1e293b'},
  copper:{name:'Copper Ore',color:'#c87953',borderColor:'#7c2d12'},
  iron:{name:'Iron Ore',color:'#94a3b8',borderColor:'#475569'},
  gold:{name:'Gold Ore',color:'#eab308',borderColor:'#854d0e'},
  crystal:{name:'Crystal',color:'#a855f7',borderColor:'#581c87'},
  diamond:{name:'Diamond',color:'#38bdf8',borderColor:'#0284c7'},
  copper_bar:{name:'Copper Bar',color:'#ea580c',borderColor:'#9a3412'},
  iron_bar:{name:'Iron Bar',color:'#e2e8f0',borderColor:'#64748b'},
  gold_bar:{name:'Gold Bar',color:'#facc15',borderColor:'#a16207'},
  planks:{name:'Planks',color:'#b77943',borderColor:'#7c4526'},
  stick:{name:'Stick',color:'#854d0e',borderColor:'#5c330a'},
  crafting_table:{name:'Crafting Table',color:'#a16207',borderColor:'#713f12'},
  torch:{name:'Torch',color:'#fbbf24',borderColor:'#b45309'},
  furnace:{name:'Furnace',color:'#64748b',borderColor:'#334155'},
  chest:{name:'Chest',color:'#a16207',borderColor:'#713f12'},
  door:{name:'Door',color:'#8b5a2b',borderColor:'#593718'},
  ladder:{name:'Ladder',color:'#c08445',borderColor:'#854d0e'},
  bed:{name:'Bed',color:'#ef6b86',borderColor:'#a33e61'},
  campfire:{name:'Campfire',color:'#f97316',borderColor:'#9a3412'},
  lever:{name:'Lever',color:'#a8a29e',borderColor:'#57534e'},
  sign:{name:'Sign',color:'#b77943',borderColor:'#7c4526'},
  platform:{name:'Platform',color:'#b77943',borderColor:'#7c4526'},
    pressure_plate:{name:'Pressure Plate',color:'#94a3b8',borderColor:'#475569'},
    trapdoor:{name:'Trapdoor',color:'#a16207',borderColor:'#713f12'},
    gate:{name:'Gate',color:'#78350f',borderColor:'#451a03'},
    bridge:{name:'Bridge',color:'#b77943',borderColor:'#7c4526'},
    rope:{name:'Rope',color:'#d6a85f',borderColor:'#854d0e'},
    tilled_soil:{name:'Tilled Soil',color:'#a16207',borderColor:'#7c3f00'},
    wheat_seed:{name:'Wheat Seeds',color:'#d7b56d',borderColor:'#a16207'},
    wheat:{name:'Wheat',color:'#facc15',borderColor:'#a16207'},
    carrot_seed:{name:'Carrot Seeds',color:'#f59e0b',borderColor:'#9a4d00'},
    carrot:{name:'Carrot',color:'#f97316',borderColor:'#9a4d00'},
    berry_seed:{name:'Berry Seeds',color:'#9f1239',borderColor:'#4c0519'},
    berry:{name:'Berries',color:'#f43f5e',borderColor:'#9f1239'},
    wooden_hoe:{name:'Wooden Hoe',color:'#a66b38',borderColor:'#633d22',toolKind:'hoe',toolTier:'wood'},
  wool:{name:'Wool',color:'#f5f5f4',borderColor:'#a8a29e'},
  wooden_pickaxe:{name:'Wooden Pickaxe',color:'#a66b38',borderColor:'#633d22',toolKind:'pickaxe',toolTier:'wood'},
  wooden_axe:{name:'Wooden Axe',color:'#a66b38',borderColor:'#633d22',toolKind:'axe',toolTier:'wood'},
  wooden_sword:{name:'Wooden Sword',color:'#b77943',borderColor:'#633d22',toolKind:'sword',toolTier:'wood',isWeapon:true},
  stone_pickaxe:{name:'Stone Pickaxe',color:'#94a3b8',borderColor:'#475569',toolKind:'pickaxe',toolTier:'stone'},
  stone_axe:{name:'Stone Axe',color:'#94a3b8',borderColor:'#475569',toolKind:'axe',toolTier:'stone'},
  stone_sword:{name:'Stone Sword',color:'#94a3b8',borderColor:'#475569',toolKind:'sword',toolTier:'stone',isWeapon:true},
  copper_pickaxe:{name:'Copper Pickaxe',color:'#c87953',borderColor:'#78350f',toolKind:'pickaxe',toolTier:'copper'},
  copper_axe:{name:'Copper Axe',color:'#c87953',borderColor:'#78350f',toolKind:'axe',toolTier:'copper'},
  copper_sword:{name:'Copper Sword',color:'#c87953',borderColor:'#78350f',toolKind:'sword',toolTier:'copper',isWeapon:true},
  iron_pickaxe:{name:'Iron Pickaxe',color:'#cbd5e1',borderColor:'#64748b',toolKind:'pickaxe',toolTier:'iron'},
  iron_axe:{name:'Iron Axe',color:'#cbd5e1',borderColor:'#64748b',toolKind:'axe',toolTier:'iron'},
  iron_sword:{name:'Iron Sword',color:'#cbd5e1',borderColor:'#64748b',toolKind:'sword',toolTier:'iron',isWeapon:true},
  gold_pickaxe:{name:'Gold Pickaxe',color:'#facc15',borderColor:'#a16207',toolKind:'pickaxe',toolTier:'gold'},
  gold_axe:{name:'Gold Axe',color:'#facc15',borderColor:'#a16207',toolKind:'axe',toolTier:'gold'},
  gold_sword:{name:'Gold Sword',color:'#facc15',borderColor:'#a16207',toolKind:'sword',toolTier:'gold',isWeapon:true},
  diamond_pickaxe:{name:'Diamond Pickaxe',color:'#38bdf8',borderColor:'#0284c7',toolKind:'pickaxe',toolTier:'diamond'},
  diamond_axe:{name:'Diamond Axe',color:'#38bdf8',borderColor:'#0284c7',toolKind:'axe',toolTier:'diamond'},
  diamond_sword:{name:'Diamond Sword',color:'#38bdf8',borderColor:'#0284c7',toolKind:'sword',toolTier:'diamond',isWeapon:true},
  venison:{name:'Venison',color:'#881337',borderColor:'#4c0519',isMeat:true},
  rabbit_meat:{name:'Rabbit Meat',color:'#e11d48',borderColor:'#881337',isMeat:true},
  boar_meat:{name:'Boar Meat',color:'#991b1b',borderColor:'#450a0a',isMeat:true},
  fox_meat:{name:'Fox Meat',color:'#ea580c',borderColor:'#7c2d12',isMeat:true},
  bird_meat:{name:'Bird Meat',color:'#fb923c',borderColor:'#9a3412',isMeat:true},
  fish:{name:'Fish',color:'#06b6d4',borderColor:'#083344',isMeat:true},
  wolf_meat:{name:'Wolf Meat',color:'#be123c',borderColor:'#881337',isMeat:true},
  bear_meat:{name:'Bear Meat',color:'#7f1d1d',borderColor:'#450a0a',isMeat:true},
  lion_meat:{name:'Lion Meat',color:'#c2410c',borderColor:'#7c2d12',isMeat:true},
  crocodile_meat:{name:'Crocodile Meat',color:'#15803d',borderColor:'#14532d',isMeat:true},
  mammoth_meat:{name:'Mammoth Meat',color:'#581c87',borderColor:'#3b0764',isMeat:true},
  bear_skull:{name:'Bear Skull Trophy',color:'#e2d9cc',borderColor:'#8a7d6b'},
  wolf_skull:{name:'Wolf Skull Trophy',color:'#e8e2d5',borderColor:'#968c7c'},
  mammoth_skull:{name:'Mammoth Skull Trophy',color:'#f3ede2',borderColor:'#a89d89'},
  lion_skull:{name:'Lion Skull Trophy',color:'#ede0cb',borderColor:'#9c8d73'},
  crocodile_skull:{name:'Crocodile Skull Trophy',color:'#d5ded0',borderColor:'#788772'},
  animal_skeleton:{name:'Animal Skeleton Mount',color:'#e5ded5',borderColor:'#887d72'},
  bone:{name:'Bone',color:'#f5f5f4',borderColor:'#a8a29e'},
  protector:{name:'Protector',color:'#06b6d4',borderColor:'#22d3ee'},
  astral_ingot:{name:'Astral Ingot',color:'#fbbf24',borderColor:'#d97706'},
  celestial_ingot:{name:'Celestial Ingot',color:'#c084fc',borderColor:'#9333ea'},
  celestial_planks:{name:'Celestial Planks',color:'#a5b4fc',borderColor:'#6366f1'},
  astral_pickaxe:{name:'Astral Pickaxe',color:'#fbbf24',borderColor:'#d97706',toolKind:'pickaxe',toolTier:'astral'},
  astral_axe:{name:'Astral Axe',color:'#fbbf24',borderColor:'#d97706',toolKind:'axe',toolTier:'astral'},
  astral_sword:{name:'Astral Sword',color:'#fbbf24',borderColor:'#d97706',toolKind:'sword',toolTier:'astral',isWeapon:true},
  celestial_pickaxe:{name:'Celestial Pickaxe',color:'#c084fc',borderColor:'#9333ea',toolKind:'pickaxe',toolTier:'celestial'},
  celestial_axe:{name:'Celestial Axe',color:'#c084fc',borderColor:'#9333ea',toolKind:'axe',toolTier:'celestial'},
  celestial_sword:{name:'Celestial Sword',color:'#c084fc',borderColor:'#9333ea',toolKind:'sword',toolTier:'celestial',isWeapon:true},
};
const MATERIAL_TYPES = (Object.keys(ITEM_INFO) as ItemType[]).filter(type => type !== 'sword');

const SWORD_PROGRESSION: ItemType[] = [
  'celestial_sword',
  'astral_sword',
  'diamond_sword',
  'gold_sword',
  'iron_sword',
  'copper_sword',
  'stone_sword',
  'wooden_sword',
];

const PICKAXE_PROGRESSION: ItemType[] = [
  'celestial_pickaxe',
  'astral_pickaxe',
  'diamond_pickaxe',
  'gold_pickaxe',
  'iron_pickaxe',
  'copper_pickaxe',
  'stone_pickaxe',
  'wooden_pickaxe',
];

const AXE_PROGRESSION: ItemType[] = [
  'celestial_axe',
  'astral_axe',
  'diamond_axe',
  'gold_axe',
  'iron_axe',
  'copper_axe',
  'stone_axe',
  'wooden_axe',
];

export class Inventory {
  public activeSlot = 0;
  public counts: Record<ItemType, number> = Object.fromEntries((Object.keys(ITEM_INFO) as ItemType[]).map(type => [type, type === 'sword' ? 1 : 0])) as Record<ItemType, number>;
  private hotbarTypes: Array<ItemType | null> = ['sword',null,null,null,null,null,null,null];
  private inventoryTypes: Array<ItemType | null> = Array(49).fill(null);

  public getBestOwnedTool(kind: 'sword' | 'pickaxe' | 'axe'): ItemType | null {
    const list = kind === 'sword' ? SWORD_PROGRESSION : kind === 'pickaxe' ? PICKAXE_PROGRESSION : AXE_PROGRESSION;
    for (const item of list) {
      if ((this.counts[item] ?? 0) > 0) return item;
    }
    return null;
  }

  public getBestOwnedToolTier(kind: 'sword' | 'pickaxe' | 'axe'): ToolTier | null {
    const best = this.getBestOwnedTool(kind);
    return best ? (ITEM_INFO[best].toolTier ?? null) : null;
  }

  private makeSlot(type: ItemType | null): HotbarSlot {
    if (!type) return {type:null,name:'',count:0,color:'transparent',borderColor:'transparent'};
    if (type === 'sword') {
      const bestSword = this.getBestOwnedTool('sword');
      if (bestSword) {
        return { ...ITEM_INFO[bestSword], type: 'sword', count: 1, isWeapon: true, isPermanent: true };
      }
      return { ...ITEM_INFO.sword, type: 'sword', count: 1 };
    }
    return {...ITEM_INFO[type],type,count:this.counts[type]};
  }
  public getSlots(): HotbarSlot[] { return this.hotbarTypes.map(type => this.makeSlot(type)); }
  public getInventorySlots(): HotbarSlot[] { return this.inventoryTypes.map(type => this.makeSlot(type)); }
  public getSelectedSlot(): HotbarSlot { return this.makeSlot(this.hotbarTypes[this.activeSlot] ?? null); }
  public selectSlot(index: number) { if (index >= 0 && index < 8) this.activeSlot = index; }
  public cycleSlot(delta: number) { this.activeSlot = (this.activeSlot + delta + 8) % 8; }

  /** Move an item between any two slots, swapping occupied destinations atomically. */
  public moveSlot(from: InventorySlotRef, to: InventorySlotRef): boolean {
    const valid = (slot: InventorySlotRef) => Number.isInteger(slot.index) &&
      slot.index >= 0 && slot.index < (slot.kind === 'hotbar' ? 8 : 49);
    if (!valid(from) || !valid(to) || (from.kind === to.kind && from.index === to.index)) return false;
    // Slot zero is the permanent sword slot: neither the sword nor another item
    // may be moved through it, which also prevents accidental sword removal.
    if ((from.kind === 'hotbar' && from.index === 0) || (to.kind === 'hotbar' && to.index === 0)) return false;
    const source = from.kind === 'hotbar' ? this.hotbarTypes : this.inventoryTypes;
    const destination = to.kind === 'hotbar' ? this.hotbarTypes : this.inventoryTypes;
    if (!source[from.index]) return false;
    [source[from.index], destination[to.index]] = [destination[to.index], source[from.index]];
    return true;
  }

  public assignInventoryItemToHotbar(inventoryIndex: number, hotbarIndex: number): boolean {
    const moved = this.moveSlot({kind:'inventory', index:inventoryIndex}, {kind:'hotbar', index:hotbarIndex});
    if (moved) this.activeSlot = hotbarIndex;
    return moved;
  }

  private locate(type: ItemType): 'hotbar' | 'inventory' | 'none' {
    if (this.hotbarTypes.includes(type)) return 'hotbar';
    if (this.inventoryTypes.includes(type)) return 'inventory';
    return 'none';
  }
  public canStoreItem(item: ItemType): boolean {
    return item !== 'sword' && Object.prototype.hasOwnProperty.call(this.counts, item) &&
      (this.locate(item) !== 'none' || this.hotbarTypes.slice(1).includes(null) || this.inventoryTypes.includes(null));
  }

  public canStoreAfterConsuming(item: ItemType, requirements: Array<{ item: ItemType; amount: number }>): boolean {
    if (this.locate(item) !== 'none') return true;
    let availableSlots = this.inventoryTypes.filter((type) => type === null).length +
      this.hotbarTypes.slice(1).filter((type) => type === null).length;
    const freedItems = new Set<ItemType>();
    const consumed = new Map<ItemType, number>();
    for (const requirement of requirements) consumed.set(requirement.item, (consumed.get(requirement.item) ?? 0) + requirement.amount);
    for (const [ingredient, amount] of consumed) {
      if (ingredient === item || freedItems.has(ingredient)) continue;
      if (this.locate(ingredient) !== 'none' && this.counts[ingredient] <= amount) {
        freedItems.add(ingredient);
        availableSlots++;
      }
    }
    return item !== 'sword' && Object.prototype.hasOwnProperty.call(this.counts, item) && availableSlots > 0;
  }

  public hasItems(requirements: Array<{ item: ItemType; amount: number }>): boolean {
    const needed = new Map<ItemType, number>();
    for (const requirement of requirements) {
      needed.set(requirement.item, (needed.get(requirement.item) ?? 0) + requirement.amount);
    }
    return [...needed].every(([item, amount]) => item !== 'sword' && this.counts[item] >= amount);
  }

  public addItem(item: ItemType, amount: number = 1): boolean {
    if (item === 'sword' || !Object.prototype.hasOwnProperty.call(this.counts, item) ||
        !Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(this.counts[item] + amount)) return false;

    const hotbarIndex = this.hotbarTypes.indexOf(item, 1);
    if (hotbarIndex >= 1) {
      this.counts[item] += amount;
      return true;
    }

    // There is one slot per item type, so promote an existing backpack stack
    // when the hotbar has room rather than creating a duplicate slot.
    const inventoryIndex = this.inventoryTypes.indexOf(item);
    const emptyHotbar = this.hotbarTypes.findIndex((type, idx) => idx > 0 && type === null);
    if (emptyHotbar > 0) {
      this.hotbarTypes[emptyHotbar] = item;
      if (inventoryIndex >= 0) this.inventoryTypes[inventoryIndex] = null;
      this.counts[item] += amount;
      return true;
    }

    if (inventoryIndex >= 0) {
      this.counts[item] += amount;
      return true;
    }

    const emptyInventory = this.inventoryTypes.indexOf(null);
    if (emptyInventory >= 0) {
      this.inventoryTypes[emptyInventory] = item;
      this.counts[item] += amount;
      return true;
    }
    return false;
  }
  public addItemToSlot(item: ItemType, amount: number, slot: InventorySlotRef): boolean {
    if (item === 'sword' || !Object.prototype.hasOwnProperty.call(this.counts, item) ||
        !Number.isSafeInteger(amount) || amount <= 0 || !Number.isSafeInteger(this.counts[item] + amount) || !slot ||
        !Number.isInteger(slot.index) ||
        (slot.kind === 'inventory' ? slot.index < 0 || slot.index >= 49 :
          slot.kind !== 'hotbar' || slot.index < 1 || slot.index >= 8)) return false;
    const destination = slot.kind === 'hotbar' ? this.hotbarTypes : this.inventoryTypes;
    const current = destination[slot.index];
    if (current && current !== item) return false;
    if (!current && this.locate(item) === 'none') destination[slot.index] = item;
    this.counts[item] += amount;
    return true;
  }

  public craft(requirements: Array<{ item: ItemType; amount: number }>, output: ItemType, amount: number = 1): boolean {
    if (!Number.isInteger(amount) || amount <= 0 || output === 'sword' ||
        !this.hasItems(requirements) || !this.canStoreAfterConsuming(output, requirements)) return false;
    const aggregated = new Map<ItemType, number>();
    for (const requirement of requirements) aggregated.set(requirement.item, (aggregated.get(requirement.item) ?? 0) + requirement.amount);
    for (const [item, required] of aggregated) {
      if (!this.consumeItem(item, required)) return false;
    }
    if (this.addItem(output, amount)) return true;
    // A failed output insertion should never happen after preflight, but restore
    // ingredients defensively so crafting remains atomic if storage changes later.
    for (const [item, required] of aggregated) this.addItem(item, required);
    return false;
  }
  public consumeItem(item: ItemType, amount: number = 1): boolean {
    if (item === 'sword' || this.counts[item] < amount) return false;
    this.counts[item] -= amount;
    if (this.counts[item] === 0) {
      const inventoryIndex = this.inventoryTypes.indexOf(item);
      if (inventoryIndex >= 0) this.inventoryTypes[inventoryIndex] = null;
      const hotbarIndex = this.hotbarTypes.indexOf(item);
      if (hotbarIndex > 0) this.hotbarTypes[hotbarIndex] = null;
    }
    return true;
  }
  public getSlot(index: number): HotbarSlot {
    if (index < 8) {
      return this.makeSlot(this.hotbarTypes[index] ?? null);
    }
    return this.makeSlot(this.inventoryTypes[index - 8] ?? null);
  }

  public setItem(index: number, type: ItemType | null, count: number = 99) {
    if (index < 0 || index >= 57) return;
    if (type && type !== 'sword' && !Object.prototype.hasOwnProperty.call(this.counts, type)) return;

    if (index < 8) {
      this.hotbarTypes[index] = type;
    } else {
      this.inventoryTypes[index - 8] = type;
    }

    if (type && type !== 'sword') {
      this.counts[type] = Math.max(1, count);
    }
  }

  public clearAll() {
    this.resetMaterials();
  }

  public resetMaterials() {
    for (const type of MATERIAL_TYPES) this.counts[type] = 0;
    this.hotbarTypes = ['sword',null,null,null,null,null,null,null];
    this.inventoryTypes.fill(null);
    this.activeSlot = 0;
  }

  public toJSON(): SerializedInventory {
    return {
      counts: { ...this.counts },
      hotbarTypes: [...this.hotbarTypes],
      inventoryTypes: [...this.inventoryTypes],
    };
  }

  public loadFromJSON(data: Partial<SerializedInventory>) {
    if (data.counts && typeof data.counts === 'object') {
      for (const key of Object.keys(this.counts) as ItemType[]) {
        if (key === 'sword') {
          this.counts.sword = 1;
        } else {
          const count = (data.counts as Record<string, unknown>)[key];
          this.counts[key] = (typeof count === 'number' && Number.isFinite(count) && count >= 0) ? Math.round(count) : 0;
        }
      }
    }
    if (Array.isArray(data.hotbarTypes) && data.hotbarTypes.length === 8) {
      for (let i = 0; i < 8; i++) {
        const type = data.hotbarTypes[i];
        if (i === 0) {
          this.hotbarTypes[0] = 'sword';
        } else {
          this.hotbarTypes[i] = type && type in this.counts && this.counts[type] > 0 ? type : null;
        }
      }
    }
    if (Array.isArray(data.inventoryTypes) && data.inventoryTypes.length === 49) {
      for (let i = 0; i < 49; i++) {
        const type = data.inventoryTypes[i];
        this.inventoryTypes[i] = type && type in this.counts && this.counts[type] > 0 ? type : null;
      }
    }
  }
}

export interface SerializedInventory {
  counts: Record<ItemType, number>;
  hotbarTypes: Array<ItemType | null>;
  inventoryTypes: Array<ItemType | null>;
}
