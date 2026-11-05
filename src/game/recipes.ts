import { ItemType } from './blocks';
import type { Inventory } from './inventory';

export type RecipeCategory = 'Wood' | 'Stone' | 'Copper' | 'Iron' | 'Gold' | 'Diamond' | 'Astral' | 'Celestial' | 'Survival';
export type CraftingStation = 'inventory' | 'crafting_bench' | 'furnace';

export interface CraftingIngredient {
  item: ItemType;
  amount: number;
}

export interface CraftingRecipe {
  id: string;
  category: RecipeCategory;
  station: CraftingStation;
  output: ItemType;
  outputAmount: number;
  ingredients: CraftingIngredient[];
}

export const FURNACE_SMELT_RECIPES: CraftingRecipe[] = [
  {
    id: 'copper-bar',
    category: 'Copper',
    station: 'furnace',
    output: 'copper_bar',
    outputAmount: 1,
    ingredients: [
      { item: 'copper', amount: 1 },
      { item: 'coal', amount: 1 },
    ],
  },
  {
    id: 'iron-bar',
    category: 'Iron',
    station: 'furnace',
    output: 'iron_bar',
    outputAmount: 1,
    ingredients: [
      { item: 'iron', amount: 1 },
      { item: 'coal', amount: 1 },
    ],
  },
  {
    id: 'gold-bar',
    category: 'Gold',
    station: 'furnace',
    output: 'gold_bar',
    outputAmount: 1,
    ingredients: [
      { item: 'gold', amount: 1 },
      { item: 'coal', amount: 1 },
    ],
  },
  {
    id: 'astral-ingot',
    category: 'Astral',
    station: 'furnace',
    output: 'astral_ingot',
    outputAmount: 1,
    ingredients: [
      { item: 'astral_ore', amount: 1 },
      { item: 'coal', amount: 1 },
    ],
  },
  {
    id: 'celestial-ingot',
    category: 'Celestial',
    station: 'furnace',
    output: 'celestial_ingot',
    outputAmount: 1,
    ingredients: [
      { item: 'celestial_ore', amount: 1 },
      { item: 'coal', amount: 1 },
    ],
  },
  {
    id: 'charcoal',
    category: 'Survival',
    station: 'furnace',
    output: 'coal',
    outputAmount: 2,
    ingredients: [{ item: 'wood', amount: 2 }],
  },
];

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  // ====================================================
  // FURNACE STATION: Smelting raw ores with coal into metal bars
  // ====================================================
  ...FURNACE_SMELT_RECIPES,

  // ====================================================
  // INVENTORY STATION: Basic wooden & survival crafting
  // ====================================================
  { id: 'planks', category: 'Wood', station: 'inventory', output: 'planks', outputAmount: 4, ingredients: [{ item: 'wood', amount: 1 }] },
  { id: 'planks-birch', category: 'Wood', station: 'inventory', output: 'planks', outputAmount: 4, ingredients: [{ item: 'birch_wood', amount: 1 }] },
  { id: 'planks-acacia', category: 'Wood', station: 'inventory', output: 'planks', outputAmount: 4, ingredients: [{ item: 'acacia_wood', amount: 1 }] },
  { id: 'planks-cherry', category: 'Wood', station: 'inventory', output: 'planks', outputAmount: 4, ingredients: [{ item: 'cherry_wood', amount: 1 }] },
  { id: 'planks-palm', category: 'Wood', station: 'inventory', output: 'planks', outputAmount: 4, ingredients: [{ item: 'palm_wood', amount: 1 }] },
  { id: 'sticks', category: 'Wood', station: 'inventory', output: 'stick', outputAmount: 4, ingredients: [{ item: 'planks', amount: 2 }] },
  { id: 'crafting-table', category: 'Wood', station: 'inventory', output: 'crafting_table', outputAmount: 1, ingredients: [{ item: 'planks', amount: 4 }] },
  { id: 'chest', category: 'Wood', station: 'inventory', output: 'chest', outputAmount: 1, ingredients: [{ item: 'wood', amount: 8 }, { item: 'stone', amount: 2 }] },
  { id: 'wool', category: 'Survival', station: 'inventory', output: 'wool', outputAmount: 1, ingredients: [{ item: 'leaves', amount: 4 }] },
  { id: 'door', category: 'Wood', station: 'inventory', output: 'door', outputAmount: 1, ingredients: [{ item: 'wood', amount: 6 }] },
  { id: 'ladder', category: 'Wood', station: 'inventory', output: 'ladder', outputAmount: 3, ingredients: [{ item: 'wood', amount: 7 }] },
  { id: 'bed', category: 'Wood', station: 'inventory', output: 'bed', outputAmount: 1, ingredients: [{ item: 'wood', amount: 12 }, { item: 'wool', amount: 3 }] },
  { id: 'campfire', category: 'Survival', station: 'inventory', output: 'campfire', outputAmount: 1, ingredients: [{ item: 'wood', amount: 5 }, { item: 'stone', amount: 5 }] },
  { id: 'lever', category: 'Stone', station: 'inventory', output: 'lever', outputAmount: 1, ingredients: [{ item: 'wood', amount: 2 }, { item: 'stone', amount: 1 }] },
  { id: 'sign', category: 'Wood', station: 'inventory', output: 'sign', outputAmount: 2, ingredients: [{ item: 'wood', amount: 6 }] },
  { id: 'platform', category: 'Wood', station: 'inventory', output: 'platform', outputAmount: 4, ingredients: [{ item: 'wood', amount: 2 }] },
    { id: 'pressure-plate', category: 'Stone', station: 'inventory', output: 'pressure_plate', outputAmount: 1, ingredients: [{ item: 'stone', amount: 2 }] },
    { id: 'trapdoor', category: 'Wood', station: 'inventory', output: 'trapdoor', outputAmount: 1, ingredients: [{ item: 'wood', amount: 6 }] },
    { id: 'gate', category: 'Wood', station: 'inventory', output: 'gate', outputAmount: 1, ingredients: [{ item: 'wood', amount: 6 }] },
    { id: 'bridge', category: 'Wood', station: 'inventory', output: 'bridge', outputAmount: 2, ingredients: [{ item: 'wood', amount: 3 }] },
    { id: 'rope', category: 'Wood', station: 'inventory', output: 'rope', outputAmount: 4, ingredients: [{ item: 'wood', amount: 2 }] },
  { id: 'wooden-pickaxe', category: 'Wood', station: 'inventory', output: 'wooden_pickaxe', outputAmount: 1, ingredients: [{ item: 'planks', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'wooden-axe', category: 'Wood', station: 'inventory', output: 'wooden_axe', outputAmount: 1, ingredients: [{ item: 'planks', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'wooden-sword', category: 'Wood', station: 'inventory', output: 'wooden_sword', outputAmount: 1, ingredients: [{ item: 'planks', amount: 2 }, { item: 'stick', amount: 1 }] },
  { id: 'wooden-hoe', category: 'Wood', station: 'inventory', output: 'wooden_hoe', outputAmount: 1, ingredients: [{ item: 'wood', amount: 5 }] },
  { id: 'wheat-seeds', category: 'Survival', station: 'inventory', output: 'wheat_seed', outputAmount: 2, ingredients: [{ item: 'wheat', amount: 1 }] },
  { id: 'carrot-seeds', category: 'Survival', station: 'inventory', output: 'carrot_seed', outputAmount: 2, ingredients: [{ item: 'carrot', amount: 1 }] },
  { id: 'berry-seeds', category: 'Survival', station: 'inventory', output: 'berry_seed', outputAmount: 2, ingredients: [{ item: 'berry', amount: 1 }] },
  { id: 'torches', category: 'Survival', station: 'inventory', output: 'torch', outputAmount: 4, ingredients: [{ item: 'wood', amount: 1 }, { item: 'coal', amount: 1 }] },
  { id: 'furnace', category: 'Survival', station: 'inventory', output: 'furnace', outputAmount: 1, ingredients: [{ item: 'stone', amount: 8 }] },

  // ====================================================
  // CRAFTING BENCH STATION: Advanced material progression
  // ====================================================
  // STONE TIER
  { id: 'stone-pickaxe', category: 'Stone', station: 'crafting_bench', output: 'stone_pickaxe', outputAmount: 1, ingredients: [{ item: 'stone', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'stone-axe', category: 'Stone', station: 'crafting_bench', output: 'stone_axe', outputAmount: 1, ingredients: [{ item: 'stone', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'stone-sword', category: 'Stone', station: 'crafting_bench', output: 'stone_sword', outputAmount: 1, ingredients: [{ item: 'stone', amount: 2 }, { item: 'stick', amount: 1 }] },

  // COPPER TIER (Crafted from Copper Bars smelted in a Furnace)
  { id: 'copper-pickaxe', category: 'Copper', station: 'crafting_bench', output: 'copper_pickaxe', outputAmount: 1, ingredients: [{ item: 'copper_bar', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'copper-axe', category: 'Copper', station: 'crafting_bench', output: 'copper_axe', outputAmount: 1, ingredients: [{ item: 'copper_bar', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'copper-sword', category: 'Copper', station: 'crafting_bench', output: 'copper_sword', outputAmount: 1, ingredients: [{ item: 'copper_bar', amount: 2 }, { item: 'stick', amount: 1 }] },

  // IRON TIER (Crafted from Iron Bars smelted in a Furnace)
  { id: 'iron-pickaxe', category: 'Iron', station: 'crafting_bench', output: 'iron_pickaxe', outputAmount: 1, ingredients: [{ item: 'iron_bar', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'iron-axe', category: 'Iron', station: 'crafting_bench', output: 'iron_axe', outputAmount: 1, ingredients: [{ item: 'iron_bar', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'iron-sword', category: 'Iron', station: 'crafting_bench', output: 'iron_sword', outputAmount: 1, ingredients: [{ item: 'iron_bar', amount: 2 }, { item: 'stick', amount: 1 }] },

  // GOLD TIER (Crafted from Gold Bars smelted in a Furnace)
  { id: 'gold-pickaxe', category: 'Gold', station: 'crafting_bench', output: 'gold_pickaxe', outputAmount: 1, ingredients: [{ item: 'gold_bar', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'gold-axe', category: 'Gold', station: 'crafting_bench', output: 'gold_axe', outputAmount: 1, ingredients: [{ item: 'gold_bar', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'gold-sword', category: 'Gold', station: 'crafting_bench', output: 'gold_sword', outputAmount: 1, ingredients: [{ item: 'gold_bar', amount: 2 }, { item: 'stick', amount: 1 }] },

  // DIAMOND TIER
  { id: 'diamond-pickaxe', category: 'Diamond', station: 'crafting_bench', output: 'diamond_pickaxe', outputAmount: 1, ingredients: [{ item: 'diamond', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'diamond-axe', category: 'Diamond', station: 'crafting_bench', output: 'diamond_axe', outputAmount: 1, ingredients: [{ item: 'diamond', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'diamond-sword', category: 'Diamond', station: 'crafting_bench', output: 'diamond_sword', outputAmount: 1, ingredients: [{ item: 'diamond', amount: 2 }, { item: 'stick', amount: 1 }] },

  // ASTRAL TIER
  { id: 'astral-pickaxe', category: 'Astral', station: 'crafting_bench', output: 'astral_pickaxe', outputAmount: 1, ingredients: [{ item: 'astral_ingot', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'astral-axe', category: 'Astral', station: 'crafting_bench', output: 'astral_axe', outputAmount: 1, ingredients: [{ item: 'astral_ingot', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'astral-sword', category: 'Astral', station: 'crafting_bench', output: 'astral_sword', outputAmount: 1, ingredients: [{ item: 'astral_ingot', amount: 2 }, { item: 'stick', amount: 1 }] },

  // CELESTIAL TIER
  { id: 'celestial-planks', category: 'Wood', station: 'inventory', output: 'celestial_planks', outputAmount: 4, ingredients: [{ item: 'celestial_wood', amount: 1 }] },
  { id: 'celestial-pickaxe', category: 'Celestial', station: 'crafting_bench', output: 'celestial_pickaxe', outputAmount: 1, ingredients: [{ item: 'celestial_ingot', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'celestial-axe', category: 'Celestial', station: 'crafting_bench', output: 'celestial_axe', outputAmount: 1, ingredients: [{ item: 'celestial_ingot', amount: 3 }, { item: 'stick', amount: 2 }] },
  { id: 'celestial-sword', category: 'Celestial', station: 'crafting_bench', output: 'celestial_sword', outputAmount: 1, ingredients: [{ item: 'celestial_ingot', amount: 2 }, { item: 'stick', amount: 1 }] },

  { id: 'protector', category: 'Diamond', station: 'inventory', output: 'protector', outputAmount: 1, ingredients: [{ item: 'diamond', amount: 1 }, { item: 'stone', amount: 1 }] },
  { id: 'animal-skeleton', category: 'Survival', station: 'crafting_bench', output: 'animal_skeleton', outputAmount: 1, ingredients: [{ item: 'bone', amount: 4 }, { item: 'wood', amount: 2 }] },
];

const BAR_TO_RAW_ORE: Partial<Record<ItemType, ItemType>> = {
  copper_bar: 'copper',
  iron_bar: 'iron',
  gold_bar: 'gold',
  astral_ingot: 'astral_ore',
  celestial_ingot: 'celestial_ore',
};

const WOOD_TYPES: ItemType[] = [
  'wood',
  'birch_wood',
  'acacia_wood',
  'cherry_wood',
  'palm_wood',
  'celestial_wood',
];

export function hasIngredientOrPrecursor(item: ItemType, inventory: Inventory): boolean {
  if ((inventory.counts[item] ?? 0) > 0) return true;

  // Raw ores for bars
  const rawOre = BAR_TO_RAW_ORE[item];
  if (rawOre && (inventory.counts[rawOre] ?? 0) > 0) return true;

  // Wood precursors for planks and sticks
  if (item === 'planks') {
    return WOOD_TYPES.some((w) => (inventory.counts[w] ?? 0) > 0);
  }
  if (item === 'stick') {
    return (inventory.counts['planks'] ?? 0) > 0 || WOOD_TYPES.some((w) => (inventory.counts[w] ?? 0) > 0);
  }

  return false;
}

/**
 * Recipe Relevance:
 * A recipe becomes visible when the player owns at least one of the required ingredient types
 * (or precursor materials like raw ores for bars, or wood for planks/sticks).
 */
export function isRecipeRelevant(recipe: CraftingRecipe, inventory: Inventory): boolean {
  return recipe.ingredients.some((ing) => hasIngredientOrPrecursor(ing.item, inventory));
}

/**
 * Craftable:
 * The player owns every required ingredient in the required quantity and has inventory space.
 */
export function isRecipeCraftable(recipe: CraftingRecipe, inventory: Inventory): boolean {
  return inventory.hasItems(recipe.ingredients) && inventory.canStoreAfterConsuming(recipe.output, recipe.ingredients);
}

/**
 * Sort recipes so that recipes the player CAN currently craft appear FIRST.
 * Non-craftable recipes appear at the end/last.
 * Within non-craftable recipes, recipes where the player owns partial ingredients appear higher.
 */
export function sortRecipesByCraftable(recipes: CraftingRecipe[], inventory: Inventory): CraftingRecipe[] {
  const craftable: CraftingRecipe[] = [];
  const uncraftable: CraftingRecipe[] = [];

  for (const recipe of recipes) {
    if (isRecipeCraftable(recipe, inventory)) {
      craftable.push(recipe);
    } else {
      uncraftable.push(recipe);
    }
  }

  // Sort uncraftable recipes so recipes with available materials/precursors appear before completely unowned ones
  uncraftable.sort((a, b) => {
    const aHasAny = a.ingredients.some((ing) => (inventory.counts[ing.item] ?? 0) > 0);
    const bHasAny = b.ingredients.some((ing) => (inventory.counts[ing.item] ?? 0) > 0);
    if (aHasAny && !bHasAny) return -1;
    if (!aHasAny && bHasAny) return 1;

    const aHasPrecursor = a.ingredients.some((ing) => hasIngredientOrPrecursor(ing.item, inventory));
    const bHasPrecursor = b.ingredients.some((ing) => hasIngredientOrPrecursor(ing.item, inventory));
    if (aHasPrecursor && !bHasPrecursor) return -1;
    if (!aHasPrecursor && bHasPrecursor) return 1;

    // Compare ingredient fulfillment progress percentage (e.g. 4/6 wood = 66% progress)
    const aProgress = a.ingredients.reduce((acc, ing) => {
      const owned = inventory.counts[ing.item] ?? 0;
      return acc + Math.min(1, owned / ing.amount);
    }, 0) / a.ingredients.length;

    const bProgress = b.ingredients.reduce((acc, ing) => {
      const owned = inventory.counts[ing.item] ?? 0;
      return acc + Math.min(1, owned / ing.amount);
    }, 0) / b.ingredients.length;

    if (bProgress !== aProgress) {
      return bProgress - aProgress; // higher progress first
    }

    return 0;
  });

  return [...craftable, ...uncraftable];
}

/**
 * Get dynamic list of visible recipes for a station based on current inventory.
 * - 'inventory' station only shows basic wooden/survival recipes.
 * - 'crafting_bench' station shows both basic and advanced crafting bench recipes.
 * - 'furnace' station shows all furnace smelting recipes.
 * Recipes the player can currently craft are sorted to appear FIRST.
 */
export function getVisibleRecipes(station: CraftingStation, inventory: Inventory): CraftingRecipe[] {
  if (station === 'furnace') {
    return sortRecipesByCraftable(FURNACE_SMELT_RECIPES, inventory);
  }
  const filtered = CRAFTING_RECIPES.filter((recipe) => {
    if (recipe.station === 'furnace') return false;
    if (station === 'inventory' && recipe.station !== 'inventory') {
      return false;
    }
    if (station === 'crafting_bench' && recipe.station === 'crafting_bench') {
      return true;
    }
    return isRecipeRelevant(recipe, inventory);
  });

  return sortRecipesByCraftable(filtered, inventory);
}
