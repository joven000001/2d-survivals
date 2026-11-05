import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { setupMultiplayerWebSocket } from '../server/index';
import { TileType } from '../src/game/types';
import { getBerryBushSeedDropCount, isEdibleItem } from '../src/game/blocks';
import { CRAFTING_RECIPES } from '../src/game/recipes';
import { TerrainGenerator } from '../src/game/terrainGen';
import { getCropGrowthStage, makeWorldObject } from '../src/game/worldObjects';

function client(url: string) {
  const ws = new WebSocket(url);
  const messages: any[] = [];
  ws.on('message', (data) => { try { messages.push(JSON.parse(data.toString())); } catch {} });
  return {
    ws,
    messages,
    waitFor(predicate: (message: any) => boolean, timeout = 3000) {
      const found = messages.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.off('message', handler);
          const relevant = messages.filter((message) => ['farm_rejected', 'block_rejected', 'block_changed', 'inventory_sync', 'world_object_updated'].includes(message.type));
          reject(new Error(`Timed out; relevant=${JSON.stringify(relevant.slice(-12))}`));
        }, timeout);
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

async function stopServer(server: Awaited<ReturnType<typeof startServer>>, clients: ReturnType<typeof client>[]) {
  await Promise.all(clients.map((entry) => entry.close()));
  await new Promise<void>((resolve) => server.wss.close(() => resolve()));
  await new Promise<void>((resolve) => server.http.close(() => resolve()));
}

async function run() {
  const flora = new TerrainGenerator(1337);
  let berryBushes = 0;
  let seedDroppingBushes = 0;
  for (let x = -512; x < 512; x++) {
    if (flora.getSurfaceFoliage(x) !== TileType.BERRY_BUSH) continue;
    berryBushes++;
    if (getBerryBushSeedDropCount(1337, x, flora.getSurfaceHeight(x) - 1) > 0) seedDroppingBushes++;
  }
  assert.ok(berryBushes > 0, 'surface generation should include berry bushes');
  assert.ok(seedDroppingBushes > 0, 'some berry bushes should drop planting seeds');
  assert.ok(isEdibleItem('wheat') && isEdibleItem('carrot') && isEdibleItem('berry'), 'harvested crops should be edible');

  const timedCrop = makeWorldObject(1337, 0, 0, 'crop');
  timedCrop.cropType = 'berry';
  timedCrop.plantedAt = 1_000;
  assert.equal(getCropGrowthStage(timedCrop, 90_999), 0);
  assert.equal(getCropGrowthStage(timedCrop, 91_000), 1);
  assert.equal(getCropGrowthStage(timedCrop, 181_000), 2);

  const server = await startServer();
  const a = client(server.url);
  const b = client(server.url);
  const stamp = Date.now();
  const world = `14${stamp}`;
  try {
    await Promise.all([a, b].map((entry) => new Promise<void>((resolve) => entry.ws.once('open', resolve))));
    a.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: world, playerId: `stage14-a-${stamp}` }));
    const joined = await a.waitFor((message) => message.type === 'lobby_joined');
    b.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: world, playerId: `stage14-b-${stamp}` }));
    await b.waitFor((message) => message.type === 'lobby_joined');
    a.ws.send(JSON.stringify({ type: 'developer_grant_test_kit' }));
    const grantedInventory = await a.waitFor((message) => message.type === 'inventory_sync');
    const hoeInventoryIndex = grantedInventory.inventory.inventoryTypes.indexOf('wooden_hoe');
    assert.notEqual(hoeInventoryIndex, -1, 'test kit places the hoe in inventory');
    a.ws.send(JSON.stringify({
      type: 'inventory_move_slot',
      from: { kind: 'inventory', index: hoeInventoryIndex },
      to: { kind: 'hotbar', index: 1 },
    }));
    await a.waitFor((message) => message.type === 'inventory_sync' && message.inventory.hotbarTypes[1] === 'wooden_hoe');

    const hoeRecipe = CRAFTING_RECIPES.find((recipe) => recipe.id === 'wooden-hoe');
    assert.ok(hoeRecipe, 'Wooden Hoe recipe exists');
    assert.equal(hoeRecipe.output, 'wooden_hoe');
    assert.equal(hoeRecipe.ingredients[0]?.item, 'wood');
    assert.equal(hoeRecipe.ingredients[0]?.amount, 5);

    const terrain = new TerrainGenerator(joined.worldSeed);
    const centerX = joined.spawnX + 7;
    const centerY = joined.spawnY + 13;
    const playerBlockX = Math.floor(centerX / 16);
    const playerBlockY = Math.floor(centerY / 16);
    let dirtTarget: { x: number; y: number } | null = null;
    for (let radius = 0; radius <= 6 && !dirtTarget; radius++) {
      for (let dx = -radius; dx <= radius && !dirtTarget; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const x = playerBlockX + dx;
          const y = playerBlockY + dy;
          const distance = Math.hypot((x * 16 + 8) - centerX, (y * 16 + 8) - centerY);
          if (distance <= 6 * 16 && terrain.getBaseTile(x, y) === TileType.DIRT) {
            dirtTarget = { x, y };
            break;
          }
        }
      }
    }
    assert.ok(dirtTarget, 'generated Dirt exists within interaction range');
    const { x: dirtX, y: dirtY } = dirtTarget;

    const requestId = `stage14-till-${stamp}`;
    a.ws.send(JSON.stringify({ type: 'farm_till_dirt', x: dirtX, y: dirtY, selectedSlotIndex: 1, requestId }));
    const tillResult = await a.waitFor((message) =>
      message.type === 'farm_rejected' && message.requestId === requestId ||
      message.type === 'block_changed' && message.x === dirtX && message.y === dirtY && message.tile === TileType.TILLED_SOIL
    );
    assert.equal(tillResult.type, 'block_changed', `Till request rejected: ${tillResult.reason ?? 'unknown reason'}`);
    const tillUpdate = tillResult;
    assert.equal(tillUpdate.tile, TileType.TILLED_SOIL);
    const observer = await b.waitFor((message) => message.type === 'block_changed' && message.x === dirtX && message.y === dirtY && message.tile === TileType.TILLED_SOIL);
    assert.equal(observer.tile, TileType.TILLED_SOIL);

    let grassTarget: { x: number; y: number } | null = null;
    for (let radius = 0; radius <= 6 && !grassTarget; radius++) {
      for (let dx = -radius; dx <= radius && !grassTarget; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const x = playerBlockX + dx;
          const y = playerBlockY + dy;
          const distance = Math.hypot((x * 16 + 8) - centerX, (y * 16 + 8) - centerY);
          if (distance <= 6 * 16 && terrain.getBaseTile(x, y) === TileType.GRASS) {
            grassTarget = { x, y };
            break;
          }
        }
      }
    }
    assert.ok(grassTarget, 'generated surface grass exists within interaction range');
    const grassTillRequestId = `stage14-grass-till-${stamp}`;
    a.ws.send(JSON.stringify({ type: 'farm_till_dirt', x: grassTarget.x, y: grassTarget.y, selectedSlotIndex: 1, requestId: grassTillRequestId }));
    const grassTill = await a.waitFor((message) =>
      message.type === 'farm_rejected' && message.requestId === grassTillRequestId ||
      message.type === 'block_changed' && message.x === grassTarget.x && message.y === grassTarget.y && message.tile === TileType.TILLED_SOIL
    );
    assert.equal(grassTill.type, 'block_changed', `Grass till request rejected: ${grassTill.reason ?? 'unknown reason'}`);

    a.ws.send(JSON.stringify({ type: 'farm_till_dirt', x: dirtX, y: dirtY, selectedSlotIndex: 1, requestId }));
    await a.waitFor((message) => message.type === 'farm_rejected');

    a.ws.send(JSON.stringify({ type: 'farm_plant_seed', x: dirtX, y: dirtY, seedType: 'wheat_seed', requestId: `stage14-plant-${stamp}` }));
    const cropUpdate = await a.waitFor((message) => message.type === 'world_object_updated' && message.object?.type === 'crop' && message.object?.cropType === 'wheat');
    assert.ok(cropUpdate.object.id);
    assert.equal((await b.waitFor((message) => message.type === 'world_object_updated' && message.object?.type === 'crop' && message.object?.cropType === 'wheat')).object.cropType, 'wheat');

    const cropId = cropUpdate.object.id;
    a.ws.send(JSON.stringify({ type: 'farm_water_crop', objectId: cropId, requestId: `stage14-water-${stamp}` }));
    const watered = await a.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === cropId && message.object?.watered === true);
    assert.equal(watered.object.watered, true);
    assert.equal((await b.waitFor((message) => message.type === 'world_object_updated' && message.object?.id === cropId && message.object?.watered === true)).object.watered, true);

    a.clear();
    a.ws.send(JSON.stringify({ type: 'farm_harvest_crop', objectId: cropId, requestId: `stage14-harvest-${stamp}` }));
    const harvested = await a.waitFor((message) => message.type === 'inventory_sync');
    assert.ok(harvested.inventory.counts.wheat >= 10, 'harvesting should grant edible produce');

    a.ws.send(JSON.stringify({ type: 'eat_request', item: 'berry' }));
    const ateBerry = await a.waitFor((message) => message.type === 'eat_success' && message.item === 'berry');
    assert.ok(ateBerry.food > 0, 'harvested berries should restore food');

    assert.ok(true, 'Stage 14 smoke test reached harvest path');
    console.log('Stage 14 smoke test passed.');
  } finally {
    await stopServer(server, [a, b]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
