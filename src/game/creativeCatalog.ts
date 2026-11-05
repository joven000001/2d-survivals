import { ItemType } from './blocks';
import { WildlifeSpecies } from './wildlife';

export interface CreativeItemEntry {
  type: ItemType;
  name: string;
  category: 'blocks' | 'flora' | 'ores' | 'food' | 'tools' | 'utility';
  icon?: string;
}

export interface CreativeCreatureEntry {
  id: WildlifeSpecies | 'slime';
  name: string;
  category: 'creatures';
  icon: string;
  description: string;
  isHostile?: boolean;
}

export const CREATIVE_ITEMS: CreativeItemEntry[] = [
  // Building Blocks
  { type: 'dirt', name: 'Dirt', category: 'blocks' },
  { type: 'stone', name: 'Stone', category: 'blocks' },
  { type: 'wood', name: 'Wood', category: 'blocks' },
  { type: 'planks', name: 'Planks', category: 'blocks' },
  { type: 'sand', name: 'Sand', category: 'blocks' },
  { type: 'sandstone', name: 'Sandstone', category: 'blocks' },
  { type: 'red_sand', name: 'Red Sand', category: 'blocks' },
  { type: 'birch_wood', name: 'Birch Wood', category: 'blocks' },
  { type: 'acacia_wood', name: 'Acacia Wood', category: 'blocks' },
  { type: 'cherry_wood', name: 'Cherry Wood', category: 'blocks' },
  { type: 'palm_wood', name: 'Palm Wood', category: 'blocks' },
  { type: 'celestial_wood', name: 'Celestial Wood', category: 'blocks' },
  { type: 'celestial_planks', name: 'Celestial Planks', category: 'blocks' },
  { type: 'snow', name: 'Snow', category: 'blocks' },
  { type: 'snowy_dirt', name: 'Snowy Dirt', category: 'blocks' },
  { type: 'ice', name: 'Ice', category: 'blocks' },
  { type: 'packed_ice', name: 'Packed Ice', category: 'blocks' },
  { type: 'blue_ice', name: 'Blue Ice', category: 'blocks' },
  { type: 'mud', name: 'Mud', category: 'blocks' },
  { type: 'ash', name: 'Ash', category: 'blocks' },
  { type: 'basalt', name: 'Basalt', category: 'blocks' },
  { type: 'magma', name: 'Magma', category: 'blocks' },
  { type: 'obsidian', name: 'Obsidian', category: 'blocks' },
  { type: 'salt', name: 'Salt Block', category: 'blocks' },
  { type: 'coral_block', name: 'Coral Block', category: 'blocks' },
  { type: 'sky_grass', name: 'Sky Grass', category: 'blocks' },
  { type: 'sky_dirt', name: 'Sky Dirt', category: 'blocks' },
  { type: 'sky_stone', name: 'Sky Stone', category: 'blocks' },
  { type: 'wool', name: 'Wool', category: 'blocks' },
  { type: 'tilled_soil', name: 'Tilled Soil', category: 'blocks' },

  // Flora, Seeds & Saplings
  { type: 'leaves', name: 'Oak Leaves', category: 'flora' },
  { type: 'birch_leaves', name: 'Birch Leaves', category: 'flora' },
  { type: 'acacia_leaves', name: 'Acacia Leaves', category: 'flora' },
  { type: 'cherry_leaves', name: 'Cherry Leaves', category: 'flora' },
  { type: 'palm_leaves', name: 'Palm Leaves', category: 'flora' },
  { type: 'celestial_leaves', name: 'Celestial Leaves', category: 'flora' },
  { type: 'wheat_seed', name: 'Wheat Seeds', category: 'flora' },
  { type: 'carrot_seed', name: 'Carrot Seeds', category: 'flora' },
  { type: 'berry_seed', name: 'Berry Seeds', category: 'flora' },
  { type: 'star_flower', name: 'Star Flower', category: 'flora' },
  { type: 'bamboo', name: 'Bamboo', category: 'flora' },
  { type: 'cactus', name: 'Cactus', category: 'flora' },
  { type: 'vine', name: 'Vine', category: 'flora' },
  { type: 'sky_vine', name: 'Sky Vine', category: 'flora' },
  { type: 'glowing_mushroom', name: 'Glowing Mushroom', category: 'flora' },
  { type: 'dry_grass', name: 'Dry Grass', category: 'flora' },
  { type: 'flower_grass', name: 'Flower Grass', category: 'flora' },
  { type: 'oasis_grass', name: 'Oasis Grass', category: 'flora' },
  { type: 'mushroom_grass', name: 'Mushroom Grass', category: 'flora' },
  { type: 'coral', name: 'Coral', category: 'flora' },

  // Ores, Minerals & Ingots
  { type: 'coal', name: 'Coal', category: 'ores' },
  { type: 'copper', name: 'Copper Ore', category: 'ores' },
  { type: 'copper_bar', name: 'Copper Bar', category: 'ores' },
  { type: 'iron', name: 'Iron Ore', category: 'ores' },
  { type: 'iron_bar', name: 'Iron Bar', category: 'ores' },
  { type: 'gold', name: 'Gold Ore', category: 'ores' },
  { type: 'gold_bar', name: 'Gold Bar', category: 'ores' },
  { type: 'diamond', name: 'Diamond', category: 'ores' },
  { type: 'crystal', name: 'Crystal', category: 'ores' },
  { type: 'glowing_crystal', name: 'Glowing Crystal', category: 'ores' },
  { type: 'astral_ore', name: 'Astral Ore', category: 'ores' },
  { type: 'astral_ingot', name: 'Astral Ingot', category: 'ores' },
  { type: 'celestial_ore', name: 'Celestial Ore', category: 'ores' },
  { type: 'celestial_ingot', name: 'Celestial Ingot', category: 'ores' },

  // Food & Sustenance
  { type: 'wheat', name: 'Wheat', category: 'food' },
  { type: 'carrot', name: 'Carrot', category: 'food' },
  { type: 'berry', name: 'Berries', category: 'food' },
  { type: 'venison', name: 'Venison', category: 'food' },
  { type: 'rabbit_meat', name: 'Rabbit Meat', category: 'food' },
  { type: 'boar_meat', name: 'Boar Meat', category: 'food' },
  { type: 'fox_meat', name: 'Fox Meat', category: 'food' },
  { type: 'bird_meat', name: 'Bird Meat', category: 'food' },
  { type: 'fish', name: 'Fish', category: 'food' },
  { type: 'wolf_meat', name: 'Wolf Meat', category: 'food' },
  { type: 'bear_meat', name: 'Bear Meat', category: 'food' },
  { type: 'lion_meat', name: 'Lion Meat', category: 'food' },
  { type: 'crocodile_meat', name: 'Crocodile Meat', category: 'food' },
  { type: 'mammoth_meat', name: 'Mammoth Meat', category: 'food' },

  // Tools & Weapons
  { type: 'celestial_pickaxe', name: 'Celestial Pickaxe', category: 'tools' },
  { type: 'celestial_sword', name: 'Celestial Sword', category: 'tools' },
  { type: 'astral_pickaxe', name: 'Astral Pickaxe', category: 'tools' },
  { type: 'astral_sword', name: 'Astral Sword', category: 'tools' },
  { type: 'diamond_pickaxe', name: 'Diamond Pickaxe', category: 'tools' },
  { type: 'diamond_axe', name: 'Diamond Axe', category: 'tools' },
  { type: 'diamond_sword', name: 'Diamond Sword', category: 'tools' },
  { type: 'gold_pickaxe', name: 'Gold Pickaxe', category: 'tools' },
  { type: 'gold_axe', name: 'Gold Axe', category: 'tools' },
  { type: 'gold_sword', name: 'Gold Sword', category: 'tools' },
  { type: 'iron_pickaxe', name: 'Iron Pickaxe', category: 'tools' },
  { type: 'iron_axe', name: 'Iron Axe', category: 'tools' },
  { type: 'iron_sword', name: 'Iron Sword', category: 'tools' },
  { type: 'copper_pickaxe', name: 'Copper Pickaxe', category: 'tools' },
  { type: 'copper_axe', name: 'Copper Axe', category: 'tools' },
  { type: 'copper_sword', name: 'Copper Sword', category: 'tools' },
  { type: 'stone_pickaxe', name: 'Stone Pickaxe', category: 'tools' },
  { type: 'stone_axe', name: 'Stone Axe', category: 'tools' },
  { type: 'stone_sword', name: 'Stone Sword', category: 'tools' },
  { type: 'wooden_pickaxe', name: 'Wooden Pickaxe', category: 'tools' },
  { type: 'wooden_axe', name: 'Wooden Axe', category: 'tools' },
  { type: 'wooden_sword', name: 'Wooden Sword', category: 'tools' },
  { type: 'sword', name: 'Adventurer Blade', category: 'tools' },
  { type: 'wooden_hoe', name: 'Wooden Hoe', category: 'tools' },

  // Utility, Furniture & Mechanics
  { type: 'crafting_table', name: 'Crafting Table', category: 'utility' },
  { type: 'furnace', name: 'Furnace', category: 'utility' },
  { type: 'chest', name: 'Chest', category: 'utility' },
  { type: 'bed', name: 'Bed', category: 'utility' },
  { type: 'campfire', name: 'Campfire', category: 'utility' },
  { type: 'torch', name: 'Torch', category: 'utility' },
  { type: 'door', name: 'Door', category: 'utility' },
  { type: 'trapdoor', name: 'Trapdoor', category: 'utility' },
  { type: 'gate', name: 'Gate', category: 'utility' },
  { type: 'ladder', name: 'Ladder', category: 'utility' },
  { type: 'platform', name: 'Platform', category: 'utility' },
  { type: 'bridge', name: 'Bridge', category: 'utility' },
  { type: 'rope', name: 'Rope', category: 'utility' },
  { type: 'sign', name: 'Sign', category: 'utility' },
  { type: 'lever', name: 'Lever', category: 'utility' },
  { type: 'pressure_plate', name: 'Pressure Plate', category: 'utility' },
  { type: 'protector', name: 'Protector Zone', category: 'utility' },
  { type: 'stick', name: 'Stick', category: 'utility' },
  { type: 'bone', name: 'Bone', category: 'utility' },
  { type: 'gel', name: 'Slime Gel', category: 'utility' },
  { type: 'bear_skull', name: 'Bear Skull Trophy', category: 'utility' },
  { type: 'wolf_skull', name: 'Wolf Skull Trophy', category: 'utility' },
  { type: 'mammoth_skull', name: 'Mammoth Skull Trophy', category: 'utility' },
  { type: 'lion_skull', name: 'Lion Skull Trophy', category: 'utility' },
  { type: 'crocodile_skull', name: 'Crocodile Skull Trophy', category: 'utility' },
  { type: 'animal_skeleton', name: 'Animal Skeleton Mount', category: 'utility' },
  { type: 'water', name: 'Water Bucket', category: 'utility' },
];

export const CREATIVE_CREATURES: CreativeCreatureEntry[] = [
  { id: 'deer', name: 'Deer', category: 'creatures', icon: '🦌', description: 'Graceful herbivore roaming forests & plains' },
  { id: 'rabbit', name: 'Rabbit', category: 'creatures', icon: '🐇', description: 'Quick, nimble woodland hopper' },
  { id: 'boar', name: 'Boar', category: 'creatures', icon: '🐗', description: 'Hardy wild tusked beast' },
  { id: 'fox', name: 'Fox', category: 'creatures', icon: '🦊', description: 'Curious, swift autumn stalker' },
  { id: 'bird', name: 'Songbird', category: 'creatures', icon: '🐦', description: 'Feathered creature flitting through canopies' },
  { id: 'fish', name: 'River Fish', category: 'creatures', icon: '🐟', description: 'Aquatic swimmer found in rivers & seas' },
  { id: 'wolf', name: 'Dire Wolf', category: 'creatures', icon: '🐺', description: 'Fierce pack hunter with swift predatory bite', isHostile: true },
  { id: 'bear', name: 'Grizzly Bear', category: 'creatures', icon: '🐻', description: 'Heavyweight apex bruin with crushing maul', isHostile: true },
  { id: 'lion', name: 'Savanna Lion', category: 'creatures', icon: '🦁', description: 'Golden savanna king with lethal pounce', isHostile: true },
  { id: 'crocodile', name: 'River Crocodile', category: 'creatures', icon: '🐊', description: 'Armor-scaled marsh predator', isHostile: true },
  { id: 'mammoth', name: 'Colossal Mammoth', category: 'creatures', icon: '🦣', description: 'Towering primordial colossus of the frozen peaks' },
  { id: 'slime', name: 'Cave Slime', category: 'creatures', icon: '🟢', description: 'Bouncy underground creature that drops gel', isHostile: true },
];
