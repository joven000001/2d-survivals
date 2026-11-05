import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { setupMultiplayerWebSocket } from '../server/index';
import { loadWorldData } from '../server/persistence';
import { TILE_SIZE, CHUNK_WIDTH, PLAYER_HEIGHT, PLAYER_WIDTH, TILE_DEFS } from '../src/game/constants';
import { TerrainGenerator } from '../src/game/terrainGen';
import { Inventory } from '../src/game/inventory';
import { CRAFTING_RECIPES } from '../src/game/recipes';
import { TileType } from '../src/game/types';
import { sanitizeSignText, worldObjectId } from '../src/game/worldObjects';
import { updatePlayerPhysics } from '../src/game/physics';

type Message = Record<string, any>;
type TestClient = ReturnType<typeof client>;

function client(url: string) {
  const ws = new WebSocket(url);
  const messages: Message[] = [];
  ws.on('message', (data) => { try { messages.push(JSON.parse(data.toString())); } catch {} });
  return {
    ws,
    messages,
    waitFor(predicate: (message: Message) => boolean, timeout = 3000) {
      const found = messages.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise<Message>((resolve, reject) => {
        const timer = setTimeout(() => { ws.off('message', handler); reject(new Error(`Timed out; tail=${JSON.stringify(messages.slice(-6))}`)); }, timeout);
        const handler = (data: WebSocket.RawData) => {
          try {
            const message = JSON.parse(data.toString());
            if (predicate(message)) { clearTimeout(timer); ws.off('message', handler); resolve(message); }
          } catch {}
        };
        ws.on('message', handler);
      });
    },
    clear() { messages.length = 0; },
    close() {
      return new Promise<void>((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) resolve();
        else { ws.once('close', () => resolve()); ws.close(); }
      });
    },
  };
}

async function startServer() {
  const http = createServer();
  const wss = setupMultiplayerWebSocket(http);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  assert.ok(address && typeof address !== 'string');
  return { http, wss, url: `ws://127.0.0.1:${address.port}` };
}

async function stopServer(server: Awaited<ReturnType<typeof startServer>>, clients: TestClient[]) {
  await Promise.all(clients.map((entry) => entry.close()));
  await new Promise<void>((resolve) => server.wss.close(() => resolve()));
  await new Promise<void>((resolve) => server.http.close(() => resolve()));
}

async function movePlayer(moving: TestClient, observer: TestClient, playerId: string, x: number, y: number) {
  await new Promise((resolve) => setTimeout(resolve, 35));
  observer.clear();
  moving.ws.send(JSON.stringify({ type: 'player_move', x, y, facingRight: true }));
  await observer.waitFor((message) => message.type === 'player_moved' && message.playerId === playerId);
}

function player(y: number, vy: number, x = 0) {
  return { x, y, vx: 0, vy, width: PLAYER_WIDTH, height: PLAYER_HEIGHT, isGrounded: false, wasGrounded: false,
    facingRight: true, animFrame: 0, animTimer: 0, coyoteTimer: 0, jumpBufferTimer: 0, state: 'fall' as const,
    health: 100, maxHealth: 100, food: 100, maxFood: 100, stamina: 100, maxStamina: 100, isSprinting: false,
    invulnerableTimer: 0, flashTimer: 0, isAttacking: false, attackTimer: 0, attackCooldown: 0 };
}

function physicsWorld(tileAt: (x: number, y: number) => TileType) {
  return { getTile: tileAt, terrainGen: { getSurfaceHeight: () => 4 } } as any;
}

function verifyRecipesAndPhysics() {
  const recipes: Record<string, { ingredients: Array<[string, number]>; output: string; amount: number }> = {
    'pressure-plate': { ingredients: [['stone', 2]], output: 'pressure_plate', amount: 1 },
    trapdoor: { ingredients: [['wood', 6]], output: 'trapdoor', amount: 1 },
    gate: { ingredients: [['wood', 6]], output: 'gate', amount: 1 },
    bridge: { ingredients: [['wood', 3]], output: 'bridge', amount: 2 },
    rope: { ingredients: [['wood', 2]], output: 'rope', amount: 4 },
  };
  for (const [id, expected] of Object.entries(recipes)) {
    const recipe = CRAFTING_RECIPES.find((entry) => entry.id === id);
    assert.ok(recipe, `Missing recipe ${id}`);
    assert.deepEqual(recipe.ingredients.map(({ item, amount }) => [item, amount]), expected.ingredients);
    assert.equal(recipe.output, expected.output);
    assert.equal(recipe.outputAmount, expected.amount);
    assert.equal(recipe.station, 'inventory');
    const inventory = new Inventory();
    for (const [item, amount] of expected.ingredients) inventory.addItem(item as any, amount);
    assert.ok(inventory.craft(recipe.ingredients, recipe.output, recipe.outputAmount));
    assert.equal(inventory.counts[recipe.output], expected.amount);
  }

  for (const tile of [TileType.DOOR, TileType.TRAPDOOR, TileType.GATE]) assert.equal(TILE_DEFS[tile].isSolid, true);
  for (const tile of [TileType.DOOR_OPEN, TileType.TRAPDOOR_OPEN, TileType.GATE_OPEN]) assert.equal(TILE_DEFS[tile].isSolid, false);
  for (const tile of [TileType.BRIDGE]) assert.equal(TILE_DEFS[tile].isSolid, true);

  const closedDoor = player(0, 0);
  updatePlayerPhysics(closedDoor, physicsWorld((x, y) => x === 1 && y === 0 ? TileType.DOOR : TileType.AIR),
    { left: false, right: true, up: false, down: false, jump: false, jumpJustPressed: false }, 0.1);
  assert.equal(closedDoor.x, TILE_SIZE - PLAYER_WIDTH, 'Closed door blocks horizontal movement');
  const openDoor = player(0, 0);
  updatePlayerPhysics(openDoor, physicsWorld((x, y) => x === 1 && y === 0 ? TileType.DOOR_OPEN : TileType.AIR),
    { left: false, right: true, up: false, down: false, jump: false, jumpJustPressed: false }, 0.1);
  assert.ok(openDoor.x > TILE_SIZE - PLAYER_WIDTH, 'Open door permits passage');

  const bridgeLanding = player(0, 100, CHUNK_WIDTH * TILE_SIZE);
  updatePlayerPhysics(bridgeLanding, physicsWorld((x, y) => x === CHUNK_WIDTH && y === 2 ? TileType.BRIDGE : TileType.AIR),
    { left: false, right: false, up: false, down: false, jump: false, jumpJustPressed: false }, 0.1);
  assert.equal(bridgeLanding.isGrounded, true, 'Bridge supports the player at a chunk boundary');

  const plateLanding = player(0, 100);
  updatePlayerPhysics(plateLanding, physicsWorld((x, y) => x === 0 && y === 2 ? TileType.PRESSURE_PLATE : TileType.AIR),
    { left: false, right: false, up: false, down: false, jump: false, jumpJustPressed: false }, 0.1);
  assert.equal(plateLanding.isGrounded, true, 'Pressure plate detects standing contact without becoming a full block');

  const ropeUp = player(0, 0);
  updatePlayerPhysics(ropeUp, physicsWorld((x, y) => x === 0 && y === 0 ? TileType.ROPE : TileType.AIR),
    { left: false, right: false, up: true, down: false, jump: false, jumpJustPressed: false }, 0.1);
  assert.ok(ropeUp.y < 0 && ropeUp.vy < 0, 'Rope supports climbing up');
  const ropeDown = player(0, 0);
  updatePlayerPhysics(ropeDown, physicsWorld((x, y) => x === 0 && y === 0 ? TileType.ROPE : TileType.AIR),
    { left: false, right: false, up: false, down: true, jump: false, jumpJustPressed: false }, 0.1);
  assert.ok(ropeDown.y > 0 && ropeDown.vy > 0, 'Rope supports climbing down');
}

async function runRestartCheck() {
  const world = process.env.PIXEL_FRONTIER_STAGE13_RESTART_WORLD;
  assert.ok(world, 'Restart world was not provided');
  const server = await startServer();
  const joiner = client(server.url);
  await new Promise<void>((resolve) => joiner.ws.once('open', resolve));
  try {
    joiner.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: world, playerId: `stage13-restart-${Date.now()}` }));
    const snapshot = await joiner.waitFor((message) => message.type === 'lobby_joined');
    assert.ok(snapshot.worldObjects.some((object: any) => object.type === 'pressure_plate' && object.active === false));
    assert.ok(snapshot.worldObjects.some((object: any) => object.type === 'door' && object.open === false));
    assert.ok(snapshot.worldObjects.some((object: any) => object.type === 'trapdoor' && object.open === true));
    assert.ok(snapshot.worldObjects.some((object: any) => object.type === 'gate' && object.open === false));
    assert.ok(snapshot.worldObjects.some((object: any) => object.type === 'sign' && object.text === 'Camp north supplies'));
  } finally {
    await stopServer(server, [joiner]);
  }
}

async function run() {
  if (process.env.PIXEL_FRONTIER_STAGE13_RESTART_WORLD) {
    await runRestartCheck();
    return;
  }

  verifyRecipesAndPhysics();
  assert.equal(sanitizeSignText('North\nCamp\u0000'), 'NorthCamp');
  assert.equal(sanitizeSignText('x'.repeat(200)).length, 180);

  const server = await startServer();
  let a = client(server.url);
  const b = client(server.url), late = client(server.url), isolated = client(server.url);
  const stamp = Date.now();
  const world = `13${stamp}`;
  const playerA = `stage13-a-${stamp}`;
  const playerB = `stage13-b-${stamp}`;
  const objectIds: string[] = [];
  const signText = 'Camp north supplies';
  try {
    await Promise.all([a, b, late, isolated].map((entry) => new Promise<void>((resolve) => entry.ws.once('open', resolve))));
    a.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: world, playerId: playerA }));
    const joined = await a.waitFor((message) => message.type === 'lobby_joined');
    b.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: world, playerId: playerB }));
    await b.waitFor((message) => message.type === 'lobby_joined');
    a.ws.send(JSON.stringify({ type: 'developer_grant_test_kit' }));
    await a.waitFor((message) => message.type === 'inventory_sync');

    const terrain = new TerrainGenerator(joined.worldSeed);
    const playerCenterX = joined.spawnX + PLAYER_WIDTH / 2;
    const playerCenterY = joined.spawnY + PLAYER_HEIGHT / 2;
    const centerX = Math.floor(playerCenterX / TILE_SIZE);
    const centerY = Math.floor(playerCenterY / TILE_SIZE);
    const placementCells: Array<{ x: number; y: number }> = [];
    const candidates: Array<{ x: number; y: number; distance: number }> = [];
    for (let x = centerX - 6; x <= centerX + 6; x++) {
      for (let y = centerY - 6; y <= centerY + 6; y++) {
        const blockCenterX = x * TILE_SIZE + TILE_SIZE / 2;
        const blockCenterY = y * TILE_SIZE + TILE_SIZE / 2;
        const distance = Math.hypot(blockCenterX - playerCenterX, blockCenterY - playerCenterY);
        const overlapsPlayer = joined.spawnX < (x + 1) * TILE_SIZE && joined.spawnX + PLAYER_WIDTH > x * TILE_SIZE &&
          joined.spawnY < (y + 1) * TILE_SIZE && joined.spawnY + PLAYER_HEIGHT > y * TILE_SIZE;
        if (distance > 6 * TILE_SIZE || overlapsPlayer) continue;
        let tile = terrain.getBaseTile(x, y);
        if (tile === TileType.AIR) tile = terrain.getTreeTileAt(x, y);
        if (tile === TileType.AIR && y === terrain.getSurfaceHeight(x) - 1) tile = terrain.getSurfaceFoliage(x);
        if (tile === TileType.AIR) tile = terrain.getCaveDecorationAt(x, y);
        if (tile === TileType.AIR) candidates.push({ x, y, distance });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
    assert.ok(candidates.length >= 11, 'Spawn area must have enough reachable open cells for the object persistence scenario');
    placementCells.push(...candidates.slice(0, 11).map(({ x, y }) => ({ x, y })));
    let placementIndex = 0;
    const placeAt = async (type: string, tile: TileType, x: number, y: number) => {
      const id = worldObjectId(joined.worldSeed, x, y, type as any);
      a.clear(); b.clear();
      a.ws.send(JSON.stringify({ type: 'block_place', x, y, tile }));
      const placed = await a.waitFor((message) => (message.type === 'block_changed' && message.x === x && message.y === y) || (message.type === 'block_rejected' && message.x === x && message.y === y));
      assert.equal(placed.type, 'block_changed', `${type} placement failed: ${JSON.stringify(placed)}`);
      await b.waitFor((message) => message.type === 'block_changed' && message.x === x && message.y === y);
      const updated = await a.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === id);
      assert.equal(updated.object.id, id, 'World-object IDs are deterministic');
      await b.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === id);
      await a.waitFor((message) => message.type === 'inventory_sync');
      objectIds.push(id);
      return { id, x, y };
    };
    const place = async (type: string, tile: TileType) => {
      const cell = placementCells[placementIndex++];
      return placeAt(type, tile, cell.x, cell.y);
    };

    const plate = await place('pressure_plate', TileType.PRESSURE_PLATE);
    const door = await place('door', TileType.DOOR);
    const trapdoor = await place('trapdoor', TileType.TRAPDOOR);
    const gate = await place('gate', TileType.GATE);
    const bridge = await place('bridge', TileType.BRIDGE);
    const rope = await place('rope', TileType.ROPE);
    const sign = await place('sign', TileType.SIGN);
    await place('bed', TileType.BED);
    await place('campfire', TileType.CAMPFIRE);
    await place('lever', TileType.LEVER);
    await place('torch', TileType.TORCH);

    const toggle = async (id: string, expected: (object: Message) => boolean, requestId = `stage13_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`) => {
      a.clear(); b.clear();
      a.ws.send(JSON.stringify({ type: 'world_object_interact', objectId: id, requestId }));
      const update = await a.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === id);
      assert.ok(expected(update.object));
      const observed = await b.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === id);
      assert.ok(expected(observed.object), 'Object state synchronizes to the other player');
      return requestId;
    };

    await toggle(door.id, (object) => object.open === true);
    await toggle(door.id, (object) => object.open === false);
    await toggle(trapdoor.id, (object) => object.open === true);
    await toggle(gate.id, (object) => object.open === true);
    const replayId = `stage13-replay-${stamp}`;
    await toggle(gate.id, (object) => object.open === false, replayId);
    a.clear();
    a.ws.send(JSON.stringify({ type: 'world_object_interact', objectId: gate.id, requestId: replayId }));
    await a.waitFor((message) => message.type === 'world_object_rejected');

    await movePlayer(a, b, playerA, plate.x * TILE_SIZE + 1, plate.y * TILE_SIZE - PLAYER_HEIGHT);
    const pressedForPlayer = await a.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === plate.id);
    assert.equal(pressedForPlayer.object.active, true, 'Player standing on plate presses it');
    const pressedForObserver = await b.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === plate.id);
    assert.equal(pressedForObserver.object.active, true, 'Pressed state synchronizes to the other player');
    await b.waitFor((message) => message.type === 'block_changed' && message.x === plate.x && message.y === plate.y && message.tile === TileType.PRESSURE_PLATE_PRESSED);
    a.clear(); b.clear();
    await movePlayer(a, b, playerA, plate.x * TILE_SIZE + TILE_SIZE + 1, plate.y * TILE_SIZE - PLAYER_HEIGHT);
    const pressed = await a.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === plate.id);
    assert.equal(pressed.object.active, false, 'Plate releases when the player walks off');
    const releasedForObserver = await b.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === plate.id);
    assert.equal(releasedForObserver.object.active, false);
    a.clear();
    a.ws.send(JSON.stringify({ type: 'pressure_plate_state', objectId: plate.id, active: true }));
    await a.waitFor((message) => message.type === 'error');
    a.ws.send(JSON.stringify({ type: 'world_object_interact', objectId: plate.id, requestId: `stage13_plate_forge_${stamp}` }));
    await a.waitFor((message) => message.type === 'world_object_rejected');

    a.clear(); b.clear();
    a.ws.send(JSON.stringify({ type: 'world_object_interact', objectId: sign.id, requestId: `stage13_sign_open_${stamp}` }));
    await a.waitFor((message) => message.type === 'world_object_inspected');
    const signUpdateId = `stage13-sign-update-${stamp}`;
    a.clear(); b.clear();
    a.ws.send(JSON.stringify({ type: 'world_object_sign_update', objectId: sign.id, requestId: signUpdateId, text: signText }));
    assert.equal((await a.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === sign.id && message.object?.text === signText)).object.text, signText);
    assert.equal((await b.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === sign.id && message.object?.text === signText)).object.text, signText);
    a.clear();
    a.ws.send(JSON.stringify({ type: 'world_object_sign_update', objectId: sign.id, requestId: `stage13-long-${stamp}`, text: 'x'.repeat(181) }));
    await a.waitFor((message) => message.type === 'world_object_rejected');
    a.clear();
    a.ws.send(JSON.stringify({ type: 'world_object_sign_update', objectId: sign.id, requestId: signUpdateId, text: 'replayed' }));
    await a.waitFor((message) => message.type === 'world_object_rejected');

    const boundaryX = CHUNK_WIDTH - 1;
    const boundaryY = 10;
    await movePlayer(a, b, playerA, boundaryX * TILE_SIZE - PLAYER_WIDTH, boundaryY * TILE_SIZE - PLAYER_HEIGHT);
    const boundaryBridge = await placeAt('bridge', TileType.BRIDGE, boundaryX, boundaryY);
    const boundaryBridgeRight = await placeAt('bridge', TileType.BRIDGE, boundaryX + 1, boundaryY);
    assert.equal(Math.floor(boundaryBridge.x / CHUNK_WIDTH) + 1, Math.floor(boundaryBridgeRight.x / CHUNK_WIDTH), 'Bridge segments span a chunk boundary');
    a.clear(); b.clear();
    a.ws.send(JSON.stringify({ type: 'block_break', x: boundaryBridgeRight.x, y: boundaryBridgeRight.y }));
    await a.waitFor((message) => message.type === 'block_changed' && message.x === boundaryBridgeRight.x && message.y === boundaryBridgeRight.y && message.tile === TileType.AIR);
    const bridgeInventory = await a.waitFor((message) => message.type === 'inventory_sync');
    assert.equal(bridgeInventory.inventory.counts.bridge, 6, 'Breaking bridge returns the bridge item');
    objectIds.splice(objectIds.indexOf(worldObjectId(joined.worldSeed, boundaryBridgeRight.x, boundaryBridgeRight.y, 'bridge')), 1);

    const lateWorld = world;
    const latePlayerId = `stage13-late-${stamp}`;
    late.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: lateWorld, playerId: latePlayerId }));
    const lateSnapshot = await late.waitFor((message) => message.type === 'lobby_joined');
    for (const id of objectIds) assert.ok(lateSnapshot.worldObjects.some((object: any) => object.id === id), `Late join missing ${id}`);
    assert.ok(lateSnapshot.worldObjects.some((object: any) => object.id === sign.id && object.text === signText));
    assert.ok(lateSnapshot.worldObjects.some((object: any) => object.id === door.id && object.open === false));
    assert.ok(lateSnapshot.worldObjects.some((object: any) => object.id === trapdoor.id && object.open === true));
    assert.ok(lateSnapshot.worldObjects.some((object: any) => object.id === gate.id && object.open === false));

    isolated.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: `${world}1`, playerId: `stage13-isolated-${stamp}` }));
    assert.deepEqual((await isolated.waitFor((message) => message.type === 'lobby_joined')).worldObjects, []);

    await movePlayer(late, b, `stage13-late-${stamp}`, lateSnapshot.spawnX + 10000, lateSnapshot.spawnY);
    late.clear();
    late.ws.send(JSON.stringify({ type: 'world_object_interact', objectId: door.id, requestId: `stage13-range-${stamp}` }));
    assert.match((await late.waitFor((message) => message.type === 'world_object_rejected')).reason, /reach/i);
    // A client health report is intentionally ignored. Exercise the dead-player
    // guard only after the server authoritatively kills this player through PvP.
    await movePlayer(late, b, latePlayerId, lateSnapshot.spawnX, lateSnapshot.spawnY);
    await movePlayer(b, late, playerB, lateSnapshot.spawnX - 25, lateSnapshot.spawnY);
    let finalHealthUpdate: Message | undefined;
    for (let hit = 0; hit < 7; hit++) {
      late.clear();
      b.ws.send(JSON.stringify({ type: 'player_attack', lifeId: 0, attackId: `stage13-death-${stamp}-${hit}` }));
      finalHealthUpdate = await late.waitFor((message) => message.type === 'player_health_changed' &&
        message.playerId === latePlayerId && message.attackerId === playerB);
      if (finalHealthUpdate.isAlive === false) break;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    assert.equal(finalHealthUpdate?.health, 0, 'PvP should kill the late player through server-authoritative damage');
    assert.equal(finalHealthUpdate?.isAlive, false);
    late.clear();
    late.ws.send(JSON.stringify({ type: 'world_object_interact', objectId: door.id, requestId: `stage13-dead-${stamp}` }));
    assert.match((await late.waitFor((message) => message.type === 'world_object_rejected')).reason, /dead/i);

    await a.close();
    a = client(server.url);
    await new Promise<void>((resolve) => a.ws.once('open', resolve));
    a.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: world, playerId: playerA }));
    const rejoined = await a.waitFor((message) => message.type === 'lobby_joined');
    assert.ok(rejoined.worldObjects.some((object: any) => object.id === sign.id && object.text === signText), 'Reconnect preserves sign text');

    const saved = loadWorldData(world);
    assert.ok(saved?.worldObjects?.some((object) => object.id === sign.id && object.text === signText));
    assert.ok(saved?.blockModifications.some((modification) => modification.x === trapdoor.x && modification.y === trapdoor.y && modification.tile === TileType.TRAPDOOR_OPEN));
    assert.ok(saved?.blockModifications.some((modification) => modification.x === gate.x && modification.y === gate.y && modification.tile === TileType.GATE));
    console.log('Stage 13 recipes, collision, server authority, synchronization, sign safety, persistence, reconnect and lobby isolation passed.');
  } finally {
    await stopServer(server, [a, b, late, isolated]);
  }

  const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const loader = pathToFileURL(join(projectRoot, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;
  const child = spawnSync(process.execPath, ['--import', loader, fileURLToPath(import.meta.url)], {
    cwd: process.cwd(),
    env: { ...process.env, PIXEL_FRONTIER_STAGE13_RESTART_WORLD: world },
    encoding: 'utf8',
  });
  assert.equal(child.status, 0, `Restart persistence check failed:\n${child.stdout}\n${child.stderr}`);
  console.log('Stage 13 persisted world state restored by a fresh server process.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
