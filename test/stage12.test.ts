import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { setupMultiplayerWebSocket } from '../server/index';
import { loadWorldData } from '../server/persistence';
import { makeWorldChestId } from '../src/game/chests';
import { TILE_SIZE } from '../src/game/constants';
import { CRAFTING_RECIPES } from '../src/game/recipes';
import { normalizeWorldName } from '../src/game/worldIdentity';
import { InteractiveObjectType, makeWorldObject, sanitizeWorldObject, worldObjectId } from '../src/game/worldObjects';
import { TileType } from '../src/game/types';
import { Inventory } from '../src/game/inventory';
import { updatePlayerPhysics } from '../src/game/physics';

type Message = Record<string, any>;
function client(url: string) {
  const ws = new WebSocket(url), messages: Message[] = [];
  ws.on('message', (data) => { try { messages.push(JSON.parse(data.toString())); } catch {} });
  return {
    ws, messages,
    waitFor(predicate: (message: Message) => boolean, timeout = 3000) {
      const found = messages.find(predicate); if (found) return Promise.resolve(found);
      const waitSite = new Error('WebSocket wait started').stack;
      return new Promise<Message>((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.off('message', handler);
          reject(new Error(`Timed out waiting for predicate ${predicate.toString()}; tail=${JSON.stringify(messages.slice(-5))}\n${waitSite ?? ''}`));
        }, timeout);
        const handler = (data: WebSocket.RawData) => { try { const m = JSON.parse(data.toString()); if (predicate(m)) { clearTimeout(timer); ws.off('message', handler); resolve(m); } } catch {} };
        ws.on('message', handler);
      });
    }, clear() { messages.length = 0; },
    close() { return new Promise<void>((resolve) => { if (ws.readyState === WebSocket.CLOSED) resolve(); else { ws.once('close', () => resolve()); ws.close(); } }); },
  };
}

async function run() {
  const legacyCampfire = makeWorldObject(123, 4, 5, 'campfire');
  delete legacyCampfire.active;
  assert.equal(sanitizeWorldObject(legacyCampfire)?.active, true, 'Legacy campfires should retain their creation default');
  const inactiveCampfire = makeWorldObject(123, 4, 5, 'campfire');
  inactiveCampfire.active = false;
  assert.equal(sanitizeWorldObject(inactiveCampfire)?.active, false, 'Explicitly inactive campfires should remain inactive');

  const expected: Record<string, [string, number][]> = {
    door: [['wood', 6]], ladder: [['wood', 7]], bed: [['wood', 12], ['wool', 3]], campfire: [['wood', 5], ['stone', 5]],
    lever: [['wood', 2], ['stone', 1]], sign: [['wood', 6]], platform: [['wood', 2]], torch: [['wood', 1], ['coal', 1]], furnace: [['stone', 8]],
  };
  for (const [id, ingredients] of Object.entries(expected)) {
    const recipe = CRAFTING_RECIPES.find((entry) => entry.id === id || id === 'torch' && entry.output === 'torch');
    assert.ok(recipe, `Missing ${id} recipe`);
    assert.deepEqual(recipe.ingredients.map(({ item, amount }) => [item, amount]), ingredients);
    assert.equal(recipe.station, 'inventory');
    const inv = new Inventory(); for (const [item, amount] of ingredients) inv.addItem(item as any, amount);
    assert.ok(inv.craft(recipe.ingredients, recipe.output, recipe.outputAmount), `${id} recipe should craft`);
    assert.equal(inv.counts[recipe.output], recipe.outputAmount);
  }
  const physPlayer = (y: number, vy: number) => ({ x: 0, y, vx: 0, vy, width: 14, height: 26, isGrounded: false, wasGrounded: false, facingRight: true, animFrame: 0, animTimer: 0, coyoteTimer: 0, jumpBufferTimer: 0, state: 'fall' as const, health: 100, maxHealth: 100, food: 100, maxFood: 100, stamina: 100, maxStamina: 100, isSprinting: false, invulnerableTimer: 0, flashTimer: 0, isAttacking: false, attackTimer: 0, attackCooldown: 0 });
  const physicsWorld = (tileAt: (x: number, y: number) => TileType) => ({ getTile: tileAt, terrainGen: { getSurfaceHeight: () => 4 } }) as any;
  const climbing = physPlayer(0, 0);
  updatePlayerPhysics(climbing, physicsWorld((x, y) => x === 0 && y === 0 ? TileType.LADDER : TileType.AIR), { left: false, right: false, up: true, down: false, jump: false, jumpJustPressed: false }, 0.1);
  assert.ok(climbing.y < 0 && climbing.vy < 0, 'Ladder should support climbing up');
  const falling = physPlayer(0, 100);
  updatePlayerPhysics(falling, physicsWorld((x, y) => x === 0 && y === 2 ? TileType.PLATFORM : TileType.AIR), { left: false, right: false, up: false, down: false, jump: false, jumpJustPressed: false }, 0.1);
  assert.equal(falling.isGrounded, true, 'Platform should catch a falling player');
  const jumpingThrough = physPlayer(40, -200);
  updatePlayerPhysics(jumpingThrough, physicsWorld((x, y) => x === 0 && y === 2 ? TileType.PLATFORM : TileType.AIR), { left: false, right: false, up: false, down: false, jump: true, jumpJustPressed: false }, 0.01);
  assert.ok(jumpingThrough.y < 40 && !jumpingThrough.isGrounded, 'Platform must allow passing through from below');
  console.log('Verified exact Stage 12 basic crafting recipes');

  const http = createServer(), wss = setupMultiplayerWebSocket(http);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address(); if (!address || typeof address === 'string') throw new Error('No test address');
  const url = `ws://127.0.0.1:${address.port}`, a = client(url), b = client(url), c = client(url), other = client(url);
  const world = `12${Date.now()}`, playerA = `s12a-${Date.now()}`, playerB = `s12b-${Date.now()}`;
  const closeAll = async () => Promise.all([a.close(), b.close(), c.close(), other.close()]);
  try {
    await Promise.all([a, b, c, other].map((p) => new Promise<void>((resolve) => p.ws.once('open', resolve))));
    a.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: world, playerId: playerA }));
    const joinedA = await a.waitFor((m) => m.type === 'lobby_joined');
    b.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: world, playerId: playerB }));
    const joinedB = await b.waitFor((m) => m.type === 'lobby_joined');
    a.ws.send(JSON.stringify({ type: 'developer_grant_test_kit' }));
    const kit = await a.waitFor((m) => m.type === 'inventory_sync');
    const slotFor = (inventory: any, item: string) => {
      const hotbarIndex = inventory.hotbarTypes.indexOf(item);
      if (hotbarIndex >= 1) return { kind: 'hotbar', index: hotbarIndex };
      return { kind: 'inventory', index: inventory.inventoryTypes.indexOf(item) };
    };
    b.ws.send(JSON.stringify({ type: 'player_move', x: joinedA.spawnX, y: joinedA.spawnY, facingRight: true }));
    const bx = Math.floor((joinedA.spawnX + 7) / TILE_SIZE) - 1, by = Math.floor(joinedA.spawnY / TILE_SIZE) - 4;
    let offset = 0;
    const placed = new Map<InteractiveObjectType, { x: number; y: number; id: string }>();
    const place = async (type: InteractiveObjectType, tile: TileType, dy = 0) => {
      const n = offset++, x = bx + n % 5, y = by - Math.floor(n / 5) + dy, id = worldObjectId(joinedA.worldSeed, x, y, type);
      a.clear(); b.clear();
      a.ws.send(JSON.stringify({ type: 'block_break', x, y }));
      const breakResponse = await a.waitFor((m) =>
        m.x === x && m.y === y && (
          m.type === 'block_rejected' || m.type === 'block_changed' && m.tile === TileType.AIR
        )
      );
      if (breakResponse.type === 'block_changed') {
        await b.waitFor((m) => m.type === 'block_changed' && m.x === x && m.y === y && m.tile === TileType.AIR);
      }
      a.clear(); b.clear();
      a.ws.send(JSON.stringify({ type: 'block_place', x, y, tile }));
      const response = await a.waitFor((m) => m.type === 'block_changed' && m.x === x && m.y === y || m.type === 'block_rejected' && m.x === x && m.y === y);
      assert.equal(response.type, 'block_changed', `${type} placement rejected: ${JSON.stringify(response)}`);
      assert.equal((await b.waitFor((m) => m.type === 'block_changed' && m.x === x && m.y === y)).tile, tile);
      const object = await a.waitFor((m) => m.type === 'world_object_updated' && m.object?.id === id);
      assert.equal(object.object.type, type);
      await b.waitFor((m) => m.type === 'world_object_updated' && m.object?.id === id);
      placed.set(type, { x, y, id });
      return { x, y, id };
    };

    const door = await place('door', TileType.DOOR);
    a.clear(); a.ws.send(JSON.stringify({ type: 'block_place', x: door.x, y: door.y, tile: TileType.DOOR }));
    assert.equal((await a.waitFor((m) => m.type === 'block_rejected')).inventory.counts.door, kit.inventory.counts.door - 1);
    const toggle = async (requester: typeof a, observer: typeof b, id: string, expectedState: (m: Message) => boolean) => {
      const requestId = `stage12_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      requester.clear(); observer.clear(); requester.ws.send(JSON.stringify({ type: 'world_object_interact', objectId: id, requestId }));
      const update = await requester.waitFor((m) => m.type === 'world_object_updated' && m.object?.id === id);
      assert.ok(expectedState(update.object));
      assert.ok(expectedState((await observer.waitFor((m) => m.type === 'world_object_updated' && m.object?.id === id)).object));
      return update.object;
    };
    await toggle(a, b, door.id, (o) => o.open === true);
    const doorOpen = await a.waitFor((m) => m.type === 'block_changed' && m.x === door.x && m.y === door.y && m.tile === TileType.DOOR_OPEN);
    assert.equal(doorOpen.tile, TileType.DOOR_OPEN);
    await toggle(b, a, door.id, (o) => o.open === false);

    const ladder = await place('ladder', TileType.LADDER);
    const bed = await place('bed', TileType.BED);
    await toggle(a, b, bed.id, (o) => o.lastInteractedBy === playerA && o.interactionRevision > 0);
    const campfire = await place('campfire', TileType.CAMPFIRE);
    await toggle(a, b, campfire.id, (o) => o.active === false);
    await a.waitFor((m) => m.type === 'block_changed' && m.x === campfire.x && m.y === campfire.y && m.tile === TileType.CAMPFIRE_OFF);
    const lever = await place('lever', TileType.LEVER);
    await toggle(a, b, lever.id, (o) => o.active === true);
    await toggle(b, a, lever.id, (o) => o.active === false);
    await place('sign', TileType.SIGN);
    const sign = placed.get('sign')!;
    a.clear(); b.clear(); a.ws.send(JSON.stringify({ type: 'world_object_interact', objectId: sign.id, requestId: `stage12_open_${Date.now()}` }));
    const inspected = await a.waitFor((m) => m.type === 'world_object_inspected');
    assert.equal(inspected.object.text, '');
    const signText = 'Camp north · supplies inside';
    const signRequest = `stage12_sign_${Date.now()}`;
    a.clear(); b.clear(); a.ws.send(JSON.stringify({ type: 'world_object_sign_update', objectId: sign.id, requestId: signRequest, text: signText }));
    assert.equal((await a.waitFor((m) => m.type === 'world_object_updated' && m.object.id === sign.id)).object.text, signText);
    const bSignUpdate = await b.waitFor((m) => m.type === 'world_object_updated' && m.object.id === sign.id && m.object.text === signText);
    assert.equal(bSignUpdate.object.text, signText, JSON.stringify(bSignUpdate));
    a.clear(); a.ws.send(JSON.stringify({ type: 'world_object_sign_update', objectId: sign.id, requestId: `stage12_bad_${Date.now()}`, text: 'x'.repeat(181) }));
    assert.equal((await a.waitFor((m) => m.type === 'world_object_rejected')).reason.includes('180'), true);
    a.clear(); a.ws.send(JSON.stringify({ type: 'world_object_sign_update', objectId: sign.id, requestId: signRequest, text: 'replay' }));
    await a.waitFor((m) => m.type === 'world_object_rejected');

    const platform = await place('platform', TileType.PLATFORM);
    const torch = await place('torch', TileType.TORCH);
    const furnaceX = bx + offset % 5, furnaceY = by - Math.floor(offset / 5);
    a.ws.send(JSON.stringify({ type: 'player_move', x: furnaceX * TILE_SIZE - 40, y: furnaceY * TILE_SIZE + 8, facingRight: true }));
    const furnace = await place('furnace', TileType.FURNACE);
    const chestId = furnace.id;
    a.clear(); b.clear();
    a.ws.send(JSON.stringify({ type: 'chest_open', chestId }));
    assert.equal((await a.waitFor((m) => m.type === 'chest_opened')).containerType, 'Furnace');
    b.ws.send(JSON.stringify({ type: 'player_move', x: joinedA.spawnX, y: joinedA.spawnY, facingRight: true }));
    b.ws.send(JSON.stringify({ type: 'chest_open', chestId }));
    await b.waitFor((m) => m.type === 'chest_opened');
    const depositId = `stage12_deposit_${Date.now()}`;
    a.clear(); b.clear(); a.ws.send(JSON.stringify({ type: 'chest_transfer', chestId, requestId: depositId, from: slotFor(kit.inventory, 'wood'), to: { kind: 'chest', index: 0 }, count: 10 }));
    assert.equal((await a.waitFor((m) => m.type === 'chest_updated')).slots[0].count, 10);
    assert.equal((await b.waitFor((m) => m.type === 'chest_updated')).slots[0].count, 10);
    const bWoodIndex = joinedB.inventory.inventoryTypes.findIndex((item: string | null) => item === null);
    const withdrawId = `stage12_withdraw_${Date.now()}`;
    a.clear(); b.clear(); b.ws.send(JSON.stringify({ type: 'chest_transfer', chestId, requestId: withdrawId, from: { kind: 'chest', index: 0 }, to: { kind: 'inventory', index: bWoodIndex }, count: 3 }));
    assert.equal((await b.waitFor((m) => m.type === 'chest_updated')).slots[0].count, 7);
    await a.waitFor((m) => m.type === 'chest_updated');
    const bInventory = await b.waitFor((m) => m.type === 'inventory_sync');
    assert.equal(bInventory.inventory.counts.wood, 3);
    b.clear(); b.ws.send(JSON.stringify({ type: 'chest_transfer', chestId, requestId: withdrawId, from: { kind: 'chest', index: 0 }, to: { kind: 'inventory', index: bWoodIndex }, count: 3 }));
    await b.waitFor((m) => m.type === 'chest_rejected');

    // Concurrent stale withdrawals are atomic: only one can consume the final 7.
    const freeA = kit.inventory.inventoryTypes.findIndex((item: string | null) => item === null);
    const freeB = bInventory.inventory.inventoryTypes.findIndex((item: string | null) => item === null);
    const race = Date.now(); a.clear(); b.clear();
    a.ws.send(JSON.stringify({ type: 'chest_transfer', chestId, requestId: `stage12_raceA_${race}`, from: { kind: 'chest', index: 0 }, to: { kind: 'inventory', index: freeA }, count: 7 }));
    b.ws.send(JSON.stringify({ type: 'chest_transfer', chestId, requestId: `stage12_raceB_${race}`, from: { kind: 'chest', index: 0 }, to: { kind: 'inventory', index: freeB }, count: 7 }));
    const raceA = await a.waitFor((m) => m.type === 'chest_updated' && m.requestId === `stage12_raceA_${race}` || m.type === 'chest_rejected');
    const raceB = await b.waitFor((m) => m.type === 'chest_updated' && m.requestId === `stage12_raceB_${race}` || m.type === 'chest_rejected');
    assert.equal([raceA, raceB].filter((m) => m.type === 'chest_updated').length, 1);
    assert.equal([raceA, raceB].filter((m) => m.type === 'chest_rejected').length, 1);
    const storage = loadWorldData(normalizeWorldName(world));
    assert.equal(storage?.chests?.find((entry) => entry.id === chestId)?.slots[0].count, 0);
    console.log('Verified synchronized objects, server-authoritative sign state, Furnace storage, replay protection and atomic concurrent transfer');

    // Put contents back in the Furnace, then break it; its contents must become one authoritative drop.
    a.clear(); b.clear(); a.ws.send(JSON.stringify({ type: 'chest_transfer', chestId, requestId: `stage12_stone_${Date.now()}`, from: slotFor(kit.inventory, 'stone'), to: { kind: 'chest', index: 1 }, count: 5 }));
    await a.waitFor((m) => m.type === 'chest_updated'); await b.waitFor((m) => m.type === 'chest_updated');
    a.clear(); b.clear(); a.ws.send(JSON.stringify({ type: 'block_break', x: furnace.x, y: furnace.y }));
    await a.waitFor((m) => m.type === 'block_changed' && m.x === furnace.x && m.y === furnace.y && m.tile === TileType.AIR);
    await b.waitFor((m) => m.type === 'block_changed' && m.x === furnace.x && m.y === furnace.y && m.tile === TileType.AIR);
    const contentDrop = await a.waitFor((m) => m.type === 'drop_spawned' && m.drop.type === 'stone' && m.drop.count === 5);
    assert.equal((await b.waitFor((m) => m.type === 'drop_spawned' && m.drop.id === contentDrop.drop.id)).drop.count, 5);
    a.clear(); a.ws.send(JSON.stringify({ type: 'block_break', x: furnace.x, y: furnace.y }));
    await a.waitFor((m) => m.type === 'block_rejected');
    assert.equal(a.messages.filter((m) => m.type === 'drop_spawned' && m.drop.type === 'stone').length, 0);
    a.clear(); b.clear(); a.ws.send(JSON.stringify({ type: 'block_break', x: torch.x, y: torch.y }));
    await a.waitFor((m) => m.type === 'block_changed' && m.x === torch.x && m.y === torch.y && m.tile === TileType.AIR);
    await b.waitFor((m) => m.type === 'world_object_removed' && m.objectId === torch.id);
    a.clear(); a.ws.send(JSON.stringify({ type: 'block_break', x: torch.x, y: torch.y }));
    await a.waitFor((m) => m.type === 'block_rejected');

    const latePlayerId = `s12c-${Date.now()}`;
    c.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: world, playerId: latePlayerId }));
    const late = await c.waitFor((m) => m.type === 'lobby_joined');
    assert.ok(late.worldObjects.some((o: any) => o.id === door.id && o.open === false));
    assert.ok(late.worldObjects.some((o: any) => o.id === sign.id && o.text === signText));
    assert.ok(late.worldObjects.some((o: any) => o.id === ladder.id));
    assert.ok(late.worldObjects.some((o: any) => o.id === platform.id));

    // Invalid object, out-of-range, dead, wrong-lobby and placement replay are rejected.
    c.clear(); c.ws.send(JSON.stringify({ type: 'world_object_interact', objectId: 'invalid-object-id', requestId: `stage12_invalid_${Date.now()}` }));
    await c.waitFor((m) => m.type === 'world_object_rejected');
    c.clear(); c.ws.send(JSON.stringify({ type: 'player_move', x: joinedA.spawnX + 10000, y: joinedA.spawnY, facingRight: true }));
    c.ws.send(JSON.stringify({ type: 'world_object_interact', objectId: door.id, requestId: `stage12_far_${Date.now()}` }));
    assert.match((await c.waitFor((m) => m.type === 'world_object_rejected')).reason, /reach/i);
    other.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: `${world}1`, playerId: `s12o-${Date.now()}` }));
    const isolated = await other.waitFor((m) => m.type === 'lobby_joined');
    assert.deepEqual(isolated.worldObjects, []);
    assert.equal(makeWorldChestId(normalizeWorldName(world), joinedA.worldSeed, furnace.x, furnace.y) === chestId, false);
    const persisted = loadWorldData(normalizeWorldName(world));
    assert.ok(persisted?.worldObjects?.some((o) => o.id === sign.id && o.text === signText));
    assert.ok(persisted?.blockModifications.some((m) => m.x === door.x && m.y === door.y && m.tile === TileType.DOOR));
    assert.ok(persisted?.drops.some((d) => d.id === contentDrop.drop.id && d.count === 5));
    await new Promise((resolve) => setTimeout(resolve, 35));
    // Keep wildlife out of this PvP death check. Animals spawned around the
    // lobby can otherwise kill the late player before the final PvP strike.
    const combatX = 1_000_000, combatY = 1_000_000;
    c.ws.send(JSON.stringify({ type: 'player_move', x: combatX, y: combatY, facingRight: true }));
    await b.waitFor((m) => m.type === 'player_moved' && m.playerId === latePlayerId);
    await new Promise((resolve) => setTimeout(resolve, 35));
    b.ws.send(JSON.stringify({ type: 'player_move', x: combatX - 25, y: combatY, facingRight: true }));
    await c.waitFor((m) => m.type === 'player_moved' && m.playerId === playerB);
    let finalHealthUpdate: Message | undefined;
    for (let hit = 0; hit < 7; hit++) {
      c.clear();
      b.ws.send(JSON.stringify({ type: 'player_attack', lifeId: 0, attackId: `stage12-death-${hit}-${Date.now()}` }));
      finalHealthUpdate = await c.waitFor((m) => m.type === 'player_health_changed' && m.playerId === latePlayerId && m.attackerId === playerB);
      if (finalHealthUpdate.isAlive === false) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    assert.equal(finalHealthUpdate?.health, 0, 'PvP should kill the late player through server-authoritative damage');
    assert.equal(finalHealthUpdate?.isAlive, false);
    c.clear(); c.ws.send(JSON.stringify({ type: 'world_object_interact', objectId: door.id, requestId: `stage12_dead_${Date.now()}` }));
    assert.match((await c.waitFor((m) => m.type === 'world_object_rejected')).reason, /dead/i);
    console.log('Verified late join, lobby isolation, break drops and persisted world-object snapshot');
  } finally {
    await closeAll(); wss.close(); await new Promise<void>((resolve) => http.close(() => resolve()));
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
