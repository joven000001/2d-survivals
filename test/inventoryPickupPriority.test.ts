import assert from 'node:assert/strict';
import test from 'node:test';
import { Inventory } from '../src/game/inventory';

test('new rewards use an empty hotbar slot before the backpack', () => {
  const inventory = new Inventory();

  assert.equal(inventory.addItem('wood', 3), true);
  assert.equal(inventory.getSlots()[1].type, 'wood');
  assert.equal(inventory.getInventorySlots().every((slot) => slot.type === null), true);
  assert.equal(inventory.getSlots()[0].type, 'sword');
});

test('rewards stack in the hotbar and promote an existing backpack stack when possible', () => {
  const inventory = new Inventory();
  inventory.setItem(1, 'wood', 4);
  assert.equal(inventory.addItem('wood', 2), true);
  assert.equal(inventory.counts.wood, 6);
  assert.equal(inventory.getSlots()[1].type, 'wood');

  const backpackStack = new Inventory();
  backpackStack.setItem(8, 'stone', 5);
  assert.equal(backpackStack.addItem('stone', 1), true);
  assert.equal(backpackStack.counts.stone, 6);
  assert.equal(backpackStack.getSlots()[1].type, 'stone');
  assert.equal(backpackStack.getInventorySlots()[0].type, null);
});

test('invalid fractional reward amounts are rejected without changing inventory', () => {
  const inventory = new Inventory();
  assert.equal(inventory.addItem('wood', 0.5), false);
  assert.equal(inventory.counts.wood, 0);
  assert.equal(inventory.getSlots()[0].type, 'sword');
});
