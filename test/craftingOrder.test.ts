import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../src/game/inventory';
import { getVisibleRecipes, isRecipeCraftable, sortRecipesByCraftable } from '../src/game/recipes';

test('Crafting recipes order: craftable recipes appear first, non-craftable at the end', () => {
  const inventory = new Inventory();

  // Give player 2 Wood (can craft planks, rope, platform, etc., but cannot craft door which needs 6 wood)
  inventory.setItem(1, 'wood', 2);

  const inventoryRecipes = getVisibleRecipes('inventory', inventory);
  assert.ok(inventoryRecipes.length > 0, 'Should have visible recipes');

  // Verify that all craftable recipes appear BEFORE any non-craftable recipes
  let seenUncraftable = false;
  let craftableCount = 0;
  let uncraftableCount = 0;

  for (const recipe of inventoryRecipes) {
    const craftable = isRecipeCraftable(recipe, inventory);
    if (craftable) {
      assert.equal(
        seenUncraftable,
        false,
        `Craftable recipe "${recipe.id}" should appear before non-craftable recipes`
      );
      craftableCount++;
    } else {
      seenUncraftable = true;
      uncraftableCount++;
    }
  }

  assert.ok(craftableCount > 0, 'Should have at least one craftable recipe (e.g. planks)');
  assert.ok(uncraftableCount > 0, 'Should have non-craftable recipes at the bottom');

  // First recipe should definitely be craftable
  assert.equal(isRecipeCraftable(inventoryRecipes[0], inventory), true);
  assert.equal(inventoryRecipes[0].output, 'planks');
});

test('Crafting bench station also places craftable recipes first', () => {
  const inventory = new Inventory();

  // Give player 3 Wood and 5 Stone
  inventory.setItem(1, 'wood', 3);
  inventory.setItem(2, 'stone', 5);

  const benchRecipes = getVisibleRecipes('crafting_bench', inventory);
  assert.ok(benchRecipes.length > 0);

  let seenUncraftable = false;
  for (const recipe of benchRecipes) {
    const craftable = isRecipeCraftable(recipe, inventory);
    if (craftable) {
      assert.equal(
        seenUncraftable,
        false,
        `Craftable recipe "${recipe.id}" must appear before uncraftable recipes in crafting bench`
      );
    } else {
      seenUncraftable = true;
    }
  }

  // The first recipe must be craftable
  assert.equal(isRecipeCraftable(benchRecipes[0], inventory), true);
});

test('sortRecipesByCraftable dynamically moves newly craftable recipes to the front', () => {
  const inventory = new Inventory();
  inventory.setItem(1, 'wood', 1);

  let recipes = getVisibleRecipes('inventory', inventory);
  assert.equal(recipes[0].output, 'planks');

  // Now player crafts planks and has 4 planks: crafting_table requires 4 planks and should move to front!
  inventory.setItem(1, 'planks', 4);
  recipes = getVisibleRecipes('inventory', inventory);

  assert.equal(isRecipeCraftable(recipes[0], inventory), true);
  const craftableOutputs = recipes.filter((r) => isRecipeCraftable(r, inventory)).map((r) => r.output);
  assert.ok(craftableOutputs.includes('crafting_table'));
  assert.ok(craftableOutputs.includes('stick'));
});

test('Having 1 Wood: Planks is craftable and appears first, non-craftable wood recipes appear at the end', () => {
  const inventory = new Inventory();
  inventory.setItem(1, 'wood', 1);

  // In inventory
  const invRecipes = getVisibleRecipes('inventory', inventory);
  assert.equal(isRecipeCraftable(invRecipes[0], inventory), true, 'First recipe in inventory must be craftable');
  assert.equal(invRecipes[0].output, 'planks');

  // Verify partition: all craftable first, uncraftable last
  let encounteredUncraftable = false;
  for (const recipe of invRecipes) {
    const canCraft = isRecipeCraftable(recipe, inventory);
    if (canCraft) {
      assert.equal(encounteredUncraftable, false, `Recipe ${recipe.id} should appear before non-craftable items`);
    } else {
      encounteredUncraftable = true;
    }
  }

  // In crafting bench
  const benchRecipes = getVisibleRecipes('crafting_bench', inventory);
  assert.equal(isRecipeCraftable(benchRecipes[0], inventory), true, 'First recipe in bench must be craftable');
  assert.equal(benchRecipes[0].output, 'planks');

  encounteredUncraftable = false;
  for (const recipe of benchRecipes) {
    const canCraft = isRecipeCraftable(recipe, inventory);
    if (canCraft) {
      assert.equal(encounteredUncraftable, false, `Bench recipe ${recipe.id} should appear before non-craftable items`);
    } else {
      encounteredUncraftable = true;
    }
  }
});

test('Having 5 Wood: All craftable items appear before non-craftable items in both inventory and crafting table', () => {
  const inventory = new Inventory();
  inventory.setItem(1, 'wood', 5);

  for (const station of ['inventory', 'crafting_bench'] as const) {
    const recipes = getVisibleRecipes(station, inventory);
    let seenUncraftable = false;
    let craftableCount = 0;

    for (const recipe of recipes) {
      const craftable = isRecipeCraftable(recipe, inventory);
      if (craftable) {
        assert.equal(seenUncraftable, false, `In ${station}, craftable ${recipe.id} must be before uncraftable`);
        craftableCount++;
      } else {
        seenUncraftable = true;
      }
    }
    assert.ok(craftableCount >= 4, `Should have multiple craftable wood items with 5 wood in ${station}`);
  }
});
