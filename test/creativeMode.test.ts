import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATIVE_ITEMS, CREATIVE_CREATURES } from '../src/game/creativeCatalog';
import { Inventory } from '../src/game/inventory';
import { SPECIES_HEALTH } from '../src/game/wildlife';

test('Creative Catalog includes every block, flora, food, tools, and creature', () => {
  // Check categories exist
  const categories = new Set(CREATIVE_ITEMS.map((item) => item.category));
  assert.ok(categories.has('blocks'), 'Contains building blocks');
  assert.ok(categories.has('flora'), 'Contains seeds, saplings & flora');
  assert.ok(categories.has('ores'), 'Contains ores and minerals');
  assert.ok(categories.has('food'), 'Contains meats, crops, and food');
  assert.ok(categories.has('tools'), 'Contains weapons and tools');
  assert.ok(categories.has('utility'), 'Contains utilities, furniture and crafting');

  // Verify seeds / flora
  const floraItems = CREATIVE_ITEMS.filter((i) => i.category === 'flora').map((i) => i.type);
  assert.ok(floraItems.includes('wheat_seed'));
  assert.ok(floraItems.includes('carrot_seed'));
  assert.ok(floraItems.includes('berry_seed'));
  assert.ok(floraItems.includes('leaves'));
  assert.ok(floraItems.includes('bamboo'));

  // Verify all wildlife species + slime have creature entries
  const creatureIds = new Set(CREATIVE_CREATURES.map((c) => c.id));
  for (const species of Object.keys(SPECIES_HEALTH)) {
    assert.ok(creatureIds.has(species as any), `Creature ${species} is present in creative spawners`);
  }
  assert.ok(creatureIds.has('slime'), 'Slime enemy spawner is present');
});

test('Inventory supports setItem, getSlot, and clearAll for creative operations', () => {
  const inv = new Inventory();
  inv.setItem(1, 'stone', 99);
  assert.equal(inv.getSlot(1).type, 'stone');
  assert.equal(inv.getSlot(1).count, 99);

  inv.setItem(2, 'diamond_pickaxe', 1);
  assert.equal(inv.getSlot(2).type, 'diamond_pickaxe');

  inv.clearAll();
  assert.equal(inv.getSlot(1).type, null);
  assert.equal(inv.getSlot(2).type, null);
});
