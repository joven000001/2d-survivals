import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { setupMultiplayerWebSocket } from '../server/index';
import { loadWorldData } from '../server/persistence';
import { CHEST_SLOT_COUNT, makeWorldChestId, transferChestItems } from '../src/game/chests';
import { Inventory, ITEM_INFO } from '../src/game/inventory';
import { CRAFTING_RECIPES, getVisibleRecipes } from '../src/game/recipes';
import { normalizeWorldName } from '../src/game/worldIdentity';
import { TILE_SIZE } from '../src/game/constants';

type Message = Record<string, any>;
function check(condition: unknown, reason: string): asserts condition {
  assert.ok(condition, reason);
}

function createClient(url: string) {
  const ws = new WebSocket(url);
  const messages: Message[] = [];
  ws.on('message', (data) => { try { messages.push(JSON.parse(data.toString())); } catch {} });
  return {
    ws,
    messages,
    waitFor(predicate: (message: Message) => boolean, timeoutMs = 3000) {
      const found = messages.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise<Message>((resolve, reject) => {
        const timer = setTimeout(() => { ws.off('message', handler); reject(new Error(`Timed out waiting for WebSocket message; chest=${JSON.stringify(messages.filter((entry) => String(entry.type).startsWith('chest')))}; tail=${JSON.stringify(messages.slice(-2))}`)); }, timeoutMs);
        const handler = (data: WebSocket.RawData) => {
          try {
            const message = JSON.parse(data.toString()) as Message;
            if (predicate(message)) { clearTimeout(timer); ws.off('message', handler); resolve(message); }
          } catch {}
        };
        ws.on('message', handler);
      });
    },
    clear() { messages.length = 0; },
    close() { return new Promise<void>((resolve) => { if (ws.readyState === WebSocket.CLOSED) resolve(); else { ws.once('close', () => resolve()); ws.close(); } }); },
  };
}

async function run() {
  const recipe = CRAFTING_RECIPES.find((entry) => entry.id === 'chest');
  assert.deepEqual(recipe?.ingredients, [{ item: 'wood', amount: 8 }, { item: 'stone', amount: 2 }]);
  assert.equal(recipe?.output, 'chest');
  assert.equal(recipe?.outputAmount, 1);
  assert.equal(recipe?.station, 'inventory');
  const inventory = new Inventory();
  inventory.addItem('wood', 8);
  inventory.addItem('stone', 2);
  assert.ok(getVisibleRecipes('inventory', inventory).some((entry) => entry.id === 'chest'));
  assert.ok(inventory.craft(recipe!.ingredients, 'chest', 1));
  assert.equal(inventory.counts.wood, 0);
  assert.equal(inventory.counts.stone, 0);
  assert.equal(inventory.counts.chest, 1);

  // Verify transfer helper atomicity, stacking, slot movement, and inventory-full safety.
  const helperInventory = new Inventory();
  helperInventory.addItem('wood', 20);
  const chestSlots = Array.from({ length: CHEST_SLOT_COUNT }, () => ({ item: null, count: 0 } as { item: any; count: number }));
  assert.ok(transferChestItems(helperInventory, chestSlots, { kind: 'hotbar', index: 1 }, { kind: 'chest', index: 0 }, 10));
  assert.equal(chestSlots[0].count, 10);
  assert.equal(helperInventory.counts.wood, 10);
  assert.ok(transferChestItems(helperInventory, chestSlots, { kind: 'chest', index: 0 }, { kind: 'chest', index: 1 }, 4));
  assert.equal(chestSlots[0].count, 6);
  assert.equal(chestSlots[1].count, 4);
  assert.ok(transferChestItems(helperInventory, chestSlots, { kind: 'chest', index: 0 }, { kind: 'inventory', index: 0 }));
  assert.equal(helperInventory.counts.wood, 16);
  const fullInventory = new Inventory();
  const itemTypes = (Object.keys(ITEM_INFO) as Array<keyof typeof ITEM_INFO>).filter((item) => item !== 'sword');
  for (const item of itemTypes.slice(0, 56)) fullInventory.addItem(item, 1);
  const savedCount = chestSlots[1].count;
  assert.equal(transferChestItems(fullInventory, chestSlots, { kind: 'chest', index: 1 }, { kind: 'inventory', index: 49 }), false);
  assert.equal(chestSlots[1].count, savedCount);

  const httpServer = createServer();
  const wsServer = setupMultiplayerWebSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Server failed to bind');
  const url = `ws://127.0.0.1:${address.port}`;
  const a = createClient(url);
  const b = createClient(url);
  const world = `11${Date.now()}`;
  try {
    await Promise.all([
      new Promise<void>((resolve) => a.ws.once('open', resolve)),
      new Promise<void>((resolve) => b.ws.once('open', resolve)),
    ]);
    a.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: world, playerId: `s11a-${Date.now()}` }));
    const joinedA = await a.waitFor((message) => message.type === 'lobby_joined');
    b.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: world, playerId: `s11b-${Date.now()}` }));
    const joinedB = await b.waitFor((message) => message.type === 'lobby_joined');
    assert.equal(joinedA.worldSeed, joinedB.worldSeed);
    console.log('Joined shared lobby');

    a.ws.send(JSON.stringify({ type: 'developer_grant_test_kit' }));
    const granted = await a.waitFor((message) => message.type === 'inventory_sync');
    assert.equal(granted.inventory.counts.wood, 40);
    assert.equal(granted.inventory.counts.stone, 40);
    a.clear();
    a.ws.send(JSON.stringify({ type: 'craft_request', recipeId: 'chest' }));
    await a.waitFor((message) => message.type === 'craft_success');
    const crafted = await a.waitFor((message) => message.type === 'inventory_sync');
    assert.equal(crafted.inventory.counts.chest, 1);
    assert.equal(crafted.inventory.counts.wood, 32);
    assert.equal(crafted.inventory.counts.stone, 38);
    console.log('Crafted chest from exact recipe');

    const bx = Math.floor((joinedA.spawnX + 7) / TILE_SIZE) + 2;
    const by = Math.floor(joinedA.spawnY / TILE_SIZE) - 1;
    a.clear(); b.clear();
    a.ws.send(JSON.stringify({ type: 'block_place', x: bx, y: by, tile: 52 }));
    await a.waitFor((message) => message.type === 'block_changed' && message.x === bx && message.y === by);
    await b.waitFor((message) => message.type === 'block_changed' && message.x === bx && message.y === by);
    console.log('Placed and replicated chest');
    const chestId = makeWorldChestId(normalizeWorldName(world), joinedA.worldSeed, bx, by);
    a.clear(); b.clear();
    b.ws.send(JSON.stringify({ type: 'player_move', x: joinedA.spawnX, y: joinedA.spawnY, facingRight: true }));
    a.ws.send(JSON.stringify({ type: 'chest_open', chestId }));
    const openedA = await a.waitFor((message) => message.type === 'chest_opened' || message.type === 'chest_rejected');
    assert.equal(openedA.type, 'chest_opened', JSON.stringify(openedA));
    b.ws.send(JSON.stringify({ type: 'chest_open', chestId }));
    const openedB = await b.waitFor((message) => message.type === 'chest_opened' || message.type === 'chest_rejected');
    assert.equal(openedB.type, 'chest_opened', JSON.stringify(openedB));
    console.log('Both players opened chest');
    assert.deepEqual(openedA.slots, openedB.slots);

    const woodIndex = crafted.inventory.hotbarTypes.indexOf('wood') >= 1
      ? crafted.inventory.hotbarTypes.indexOf('wood')
      : crafted.inventory.inventoryTypes.findIndex((item: string | null) => item === 'wood');
    const woodSlot = woodIndex < 8 ? { kind: 'hotbar', index: woodIndex } : { kind: 'inventory', index: woodIndex };
    const transferId = `s11_transfer_${Date.now()}`;
    a.clear(); b.clear();
    a.ws.send(JSON.stringify({ type: 'chest_transfer', chestId, requestId: transferId, from: woodSlot, to: { kind: 'chest', index: 0 }, count: 10 }));
    const updateA = await a.waitFor((message) => message.type === 'chest_updated' || message.type === 'chest_rejected' || message.type === 'chest_closed');
    assert.equal(updateA.type, 'chest_updated', JSON.stringify(updateA));
    const updateB = await b.waitFor((message) => message.type === 'chest_updated');
    assert.equal(updateA.slots[0].count, 10);
    assert.equal(updateB.slots[0].count, 10);
    await a.waitFor((message) => message.type === 'inventory_sync');

    b.clear(); a.clear();
    b.ws.send(JSON.stringify({ type: 'chest_transfer', chestId, requestId: `s11_withdraw_${Date.now()}`, from: { kind: 'chest', index: 0 }, to: { kind: 'inventory', index: 0 }, count: 4 }));
    const withdrawUpdateA = await a.waitFor((message) => message.type === 'chest_updated');
    const withdrawUpdateB = await b.waitFor((message) => message.type === 'chest_updated');
    assert.equal(withdrawUpdateA.slots[0].count, 6);
    assert.equal(withdrawUpdateB.slots[0].count, 6);
    const bInv = await b.waitFor((message) => message.type === 'inventory_sync');
    assert.equal(bInv.inventory.counts.wood, 4);

    b.clear();
    a.ws.send(JSON.stringify({ type: 'chest_transfer', chestId, requestId: transferId, from: woodSlot, to: { kind: 'chest', index: 0 }, count: 10 }));
    await a.waitFor((message) => message.type === 'chest_rejected');
    assert.equal(bInv.inventory.counts.wood, 4);

    a.clear(); b.clear();
    const raceAt = Date.now();
    const freeA = crafted.inventory.inventoryTypes.findIndex((item: string | null) => item === null);
    const freeB = bInv.inventory.inventoryTypes.findIndex((item: string | null) => item === null);
    a.ws.send(JSON.stringify({ type: 'chest_transfer', chestId, requestId: `s11raceA_${raceAt}`, from: { kind: 'chest', index: 0 }, to: { kind: 'inventory', index: freeA }, count: 6 }));
    b.ws.send(JSON.stringify({ type: 'chest_transfer', chestId, requestId: `s11raceB_${raceAt}`, from: { kind: 'chest', index: 0 }, to: { kind: 'inventory', index: freeB }, count: 6 }));
    const raceA = await a.waitFor((message) => message.type === 'chest_rejected' || message.type === 'chest_updated' && message.requestId === `s11raceA_${raceAt}`);
    const raceB = await b.waitFor((message) => message.type === 'chest_rejected' || message.type === 'chest_updated' && message.requestId === `s11raceB_${raceAt}`);
    assert.equal([raceA, raceB].filter((message) => message.type === 'chest_updated').length, 1, 'Concurrent chest withdrawal must have only one success');
    assert.equal([raceA, raceB].filter((message) => message.type === 'chest_rejected').length, 1, 'Concurrent chest withdrawal must reject the stale request');

    const saved = loadWorldData(normalizeWorldName(world));
    check(saved?.chests?.some((entry) => entry.id === chestId), 'Chest was not saved in world persistence');
    const persisted = saved!.chests!.find((entry) => entry.id === chestId)!;
    assert.equal(persisted.slots[0].count, 0);
    console.log('Stage 11 recipe, inventory transfer, multiplayer sync, request replay, concurrency and persistence tests passed.');
  } finally {
    await Promise.all([a.close(), b.close()]);
    wsServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
