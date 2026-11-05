import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { getUnauthorizedProtector, setupMultiplayerWebSocket } from '../server/index';
import { CRAFTING_RECIPES } from '../src/game/recipes';
import { Inventory } from '../src/game/inventory';
import { TileType } from '../src/game/types';
import { CHUNK_WIDTH, TILE_SIZE, PROTECTOR_RADIUS_BLOCKS } from '../src/game/constants';

test('overlapping Protectors require authorization from every owner and stay lobby scoped', () => {
  const alice = { id: 'a', x: 0, y: 0, ownerPlayerId: 'alice', ownerDisplayName: 'Alice' };
  const bob = { id: 'b', x: 20, y: 0, ownerPlayerId: 'bob', ownerDisplayName: 'Bob' };
  const lobby = { protectors: new Map([[alice.id, alice], [bob.id, bob]]) } as any;
  assert.equal(getUnauthorizedProtector(lobby, 'alice', 10, 0)?.ownerPlayerId, 'bob');
  assert.equal(getUnauthorizedProtector(lobby, 'bob', 10, 0)?.ownerPlayerId, 'alice');
  assert.ok(getUnauthorizedProtector(lobby, 'stranger', 10, 0));
  assert.equal(getUnauthorizedProtector({ protectors: new Map() } as any, 'stranger', 10, 0), null);
  const negativeLobby = { protectors: new Map([['negative', { ...alice, id: 'negative', x: -64, y: -64 }]]) } as any;
  assert.equal(getUnauthorizedProtector(negativeLobby, 'stranger', -114, -114)?.ownerPlayerId, 'alice',
    'negative world coordinates use the same inclusive 50-block protection boundary');
  assert.equal(getUnauthorizedProtector(negativeLobby, 'stranger', -115, -114), null);
});

function createWsClient(url: string) {
  const ws = new WebSocket(url);
  const messages: any[] = [];
  ws.on('message', (data) => {
    try { messages.push(JSON.parse(data.toString())); } catch {}
  });

  return {
    ws,
    messages,
    waitFor(predicate: (message: any) => boolean, timeout = 6000): Promise<any> {
      const found = messages.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.off('message', handler);
          reject(new Error(`Timed out waiting for message; all messages=${JSON.stringify(messages)}`));
        }, timeout);
        const handler = (data: WebSocket.RawData) => {
          try {
            const message = JSON.parse(data.toString());
            if (predicate(message)) {
              clearTimeout(timer);
              ws.off('message', handler);
              resolve(message);
            }
          } catch {}
        };
        ws.on('message', handler);
      });
    },
    clear() { messages.length = 0; },
    close() {
      return new Promise<void>((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) resolve();
        else {
          ws.once('close', () => resolve());
          ws.close();
        }
      });
    },
  };
}

test('Protector crafting recipe is 1 Diamond + 1 Stone in Inventory', () => {
  const recipe = CRAFTING_RECIPES.find((r) => r.id === 'protector');
  assert.ok(recipe, 'Protector recipe must exist');
  assert.equal(recipe.output, 'protector');
  assert.equal(recipe.outputAmount, 1);
  assert.equal(recipe.station, 'inventory');
  assert.deepEqual(recipe.ingredients, [
    { item: 'diamond', amount: 1 },
    { item: 'stone', amount: 1 },
  ]);

  const inv = new Inventory();
  inv.addItem('diamond', 1);
  inv.addItem('stone', 1);
  assert.equal(inv.hasItems(recipe.ingredients), true);
  assert.equal(inv.craft(recipe.ingredients, recipe.output, recipe.outputAmount), true);
  assert.equal(inv.counts.protector, 1);
  assert.equal(inv.counts.diamond, 0);
  assert.equal(inv.counts.stone, 0);
});

test('Protector placement, 50-block zone protection, Chapter 2 Base on first chest, and PvP allowed', async () => {
  const httpServer = createServer();
  const wss = setupMultiplayerWebSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const wsUrl = `ws://127.0.0.1:${address.port}`;

  const lobbyName = `${Math.floor(100000 + Math.random() * 900000)}`;
  const clientA = createWsClient(wsUrl);
  const clientB = createWsClient(wsUrl);
  const clientC = createWsClient(wsUrl);
  const clientD = createWsClient(wsUrl);
  const otherLobbyClient = createWsClient(wsUrl);
  const clientCReconnected = createWsClient(wsUrl);
  const openPromises = [clientA, clientB, clientC, clientD, otherLobbyClient, clientCReconnected].map((client) =>
    new Promise<void>((resolve) => client.ws.on('open', resolve)));

  try {
    await Promise.all(openPromises);

    // Join lobby
    clientA.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName, playerId: 'player-alice' }));
    const joinedA = await clientA.waitFor((m) => m.type === 'lobby_joined');
    assert.equal(joinedA.success, true);

    clientB.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName, playerId: 'player-bob' }));
    const joinedB = await clientB.waitFor((m) => m.type === 'lobby_joined');
    assert.equal(joinedB.success, true);
    assert.ok(Math.hypot(joinedA.spawnX - joinedB.spawnX, joinedA.spawnY - joinedB.spawnY) >= 8 * TILE_SIZE,
      'new players must receive separated spawn positions');

    // Nearly simultaneous joins must reserve distinct positions before either
    // join can race the other's selection.
    clientC.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName, playerId: 'player-carol' }));
    clientD.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName, playerId: 'player-dave' }));
    const [joinedC, joinedD] = await Promise.all([
      clientC.waitFor((m) => m.type === 'lobby_joined'),
      clientD.waitFor((m) => m.type === 'lobby_joined'),
    ]);
    const sameLobbySpawns = [joinedA, joinedB, joinedC, joinedD];
    for (let i = 0; i < sameLobbySpawns.length; i++) {
      for (let j = i + 1; j < sameLobbySpawns.length; j++) {
        assert.ok(Math.hypot(sameLobbySpawns[i].spawnX - sameLobbySpawns[j].spawnX, sameLobbySpawns[i].spawnY - sameLobbySpawns[j].spawnY) >= 8 * TILE_SIZE,
          'all active and reserved same-lobby spawns must be at least 8 tiles apart');
      }
    }
    const separateLobbyName = `${Math.floor(100000 + Math.random() * 900000)}`;
    otherLobbyClient.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: separateLobbyName, playerId: 'player-other-lobby' }));
    const separateLobbyJoin = await otherLobbyClient.waitFor((m) => m.type === 'lobby_joined');
    assert.equal(separateLobbyJoin.success, true, 'spawn reservations must be scoped to a lobby');

    // Give Alice materials for chest
    clientA.ws.send(JSON.stringify({ type: 'developer_grant_test_kit' }));
    await clientA.waitFor((m) => m.type === 'inventory_sync');

    // Craft a chest
    clientA.ws.send(JSON.stringify({ type: 'craft_request', recipeId: 'chest' }));
    await clientA.waitFor((m) => m.type === 'craft_success');

    // Alice places her FIRST chest in this server
    const chestBx = Math.floor(joinedA.spawnX / TILE_SIZE) + 2;
    const chestBy = Math.floor(joinedA.spawnY / TILE_SIZE) - 1;

    clientA.clear();
    clientA.ws.send(JSON.stringify({ type: 'block_place', x: chestBx, y: chestBy, tile: TileType.CHEST }));

    // Alice should receive Chapter 2 BASE popup message
    const chapterMsg = await clientA.waitFor((m) => m.type === 'chapter_unlocked');
    assert.equal(chapterMsg.chapter, 'CHAPTER 2');
    assert.equal(chapterMsg.title, 'BASE');
    assert.equal(chapterMsg.rewardItem, 'protector');

    // Alice should receive a Protector in her inventory
    const invA = await clientA.waitFor((m) => m.type === 'inventory_sync');
    assert.equal(invA.inventory.counts.protector, 1);

    // Alice crafts another chest and places it (SECOND chest)
    clientA.ws.send(JSON.stringify({ type: 'craft_request', recipeId: 'chest' }));
    await clientA.waitFor((m) => m.type === 'craft_success');

    clientA.clear();
    const chest2Bx = chestBx + 1;
    const chest2By = chestBy;
    clientA.ws.send(JSON.stringify({ type: 'block_place', x: chest2Bx, y: chest2By, tile: TileType.CHEST }));
    await clientA.waitFor((m) => m.type === 'block_changed' && m.x === chest2Bx);

    // Should NOT unlock chapter again or give another protector
    const secondChapter = clientA.messages.find((m) => m.type === 'chapter_unlocked');
    assert.equal(secondChapter, undefined, 'Second chest must NOT trigger Chapter 2 again');

    // Alice now places the Protector block
    const protBx = chestBx;
    const protBy = chestBy - 1;
    clientA.clear(); clientB.clear();

    clientA.ws.send(JSON.stringify({ type: 'block_place', x: protBx, y: protBy, tile: TileType.PROTECTOR }));
    const protCreated = await clientA.waitFor((m) => m.type === 'protector_created');
    assert.equal(protCreated.protector.x, protBx);
    assert.equal(protCreated.protector.y, protBy);
    assert.equal(protCreated.protector.ownerPlayerId, 'player-alice');

    // Verify Bob is inside the 50-block zone (spawn is nearby)
    const targetBx = protBx + 10;
    const targetBy = protBy;
    assert.ok(Math.abs(targetBx - protBx) <= PROTECTOR_RADIUS_BLOCKS);

    // Bob attempts to place a block in Alice's protected area -> REJECTED
    clientB.clear();
    clientB.ws.send(JSON.stringify({ type: 'developer_grant_test_kit' }));
    await clientB.waitFor((m) => m.type === 'inventory_sync');

    clientB.clear();
    clientB.ws.send(JSON.stringify({ type: 'block_place', x: targetBx, y: targetBy, tile: TileType.DIRT }));
    const rejectedPlace = await clientB.waitFor((m) => m.type === 'block_rejected');
    assert.ok(rejectedPlace.reason.includes('protected') || rejectedPlace.reason.includes('Protector'));

    // The protection boundary is 50 blocks on both axes, including above and below.
    for (const [dx, dy] of [[50, 0], [-50, 0], [0, 50], [0, -50]]) {
      clientB.clear();
      clientB.ws.send(JSON.stringify({ type: 'block_place', x: protBx + dx, y: protBy + dy, tile: TileType.DIRT, ownerPlayerId: 'player-alice' }));
      const boundaryReject = await clientB.waitFor((m) => m.type === 'block_rejected');
      assert.match(boundaryReject.reason.toLowerCase(), /protect/);
    }

    // Mining the Protector center and blocks below, above, on all sides, at
    // the inclusive boundary, and across positive/negative chunk boundaries
    // must be rejected before any world mutation or reward is produced.
    const crossChunkX = Math.ceil((protBx + 1) / CHUNK_WIDTH) * CHUNK_WIDTH;
    let negativeChunkX: number | undefined;
    for (let candidate = Math.floor((protBx + PROTECTOR_RADIUS_BLOCKS) / CHUNK_WIDTH) * CHUNK_WIDTH;
      candidate >= protBx - PROTECTOR_RADIUS_BLOCKS; candidate -= CHUNK_WIDTH) {
      if (candidate < 0) { negativeChunkX = candidate; break; }
    }
    const mineTargets = [
      [protBx, protBy], [protBx, protBy + 1], [protBx, protBy - 1],
      [protBx + 1, protBy], [protBx - 1, protBy],
      [protBx + 50, protBy], [protBx - 50, protBy],
      [protBx, protBy + 50], [protBx, protBy - 50],
      [crossChunkX, protBy], ...(negativeChunkX === undefined ? [] : [[negativeChunkX, protBy]]),
    ];
    for (const [mineX, mineY] of mineTargets) {
      assert.ok(Math.abs(mineX - protBx) <= PROTECTOR_RADIUS_BLOCKS);
      assert.ok(Math.abs(mineY - protBy) <= PROTECTOR_RADIUS_BLOCKS);
      clientA.clear();
      clientB.clear();
      clientB.ws.send(JSON.stringify({ type: 'block_break', x: mineX, y: mineY, minedItem: 'dirt', ownerPlayerId: 'player-alice' }));
      const rejectedBreak = await clientB.waitFor((m) => m.type === 'block_rejected');
      assert.ok(rejectedBreak.reason.toLowerCase().includes('protect'), `Unexpected reject reason: ${rejectedBreak.reason}`);
      // JSON.stringify canonicalizes -0 to 0, so compare coordinates using
      // the representation that actually crosses the WebSocket boundary.
      assert.equal(rejectedBreak.x, mineX === 0 ? 0 : mineX);
      assert.equal(rejectedBreak.y, mineY === 0 ? 0 : mineY);
      assert.equal(typeof rejectedBreak.currentTile, 'number', 'rejection must carry authoritative tile for optimistic client rollback');
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(clientA.messages.some((m) => m.type === 'block_changed' && m.x === mineX && m.y === mineY), false,
        'rejected mining must not broadcast a successful block change');
      assert.equal(clientA.messages.some((m) => m.type === 'drop_spawned' && m.drop?.x === mineX * TILE_SIZE + 4 && m.drop?.y === mineY * TILE_SIZE + 4), false,
        'rejected mining must not create drops');
    }

    // Bob attempts to open Alice's chest -> REJECTED
    const chestId = `chest_${protBx}_${chestBy}`;
    clientB.clear();
    clientB.ws.send(JSON.stringify({ type: 'chest_open', chestId }));
    const rejectedChest = await clientB.waitFor((m) => m.type === 'chest_rejected' || m.type === 'chest_closed');
    assert.ok(rejectedChest);

    // PvP: Bob attacks Alice within the zone -> ALLOWED!
    clientB.ws.send(JSON.stringify({ type: 'player_move', x: joinedA.spawnX, y: joinedA.spawnY, facingRight: true }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    clientB.clear(); clientA.clear();
    const attackId = `pvp_prot_test_${Date.now()}`;
    clientB.ws.send(JSON.stringify({ type: 'player_attack', lifeId: 0, attackId }));
    const healthChanged = await clientA.waitFor((m) => m.type === 'player_health_changed' && m.playerId === 'player-alice');
    assert.ok(healthChanged.damage > 0, 'Bob should still be able to attack Alice within the territory');

    // Exiting is reported once per owner, including when moving across the full boundary.
    clientB.ws.send(JSON.stringify({ type: 'player_move', x: joinedA.spawnX + 60 * TILE_SIZE, y: joinedA.spawnY, facingRight: true }));
    const exitNotice = `You exited ${joinedA.displayName}'s protected area.`;
    await clientB.waitFor((m) => m.type === 'notice' && m.message === exitNotice);
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(clientB.messages.filter((m) => m.type === 'notice' && m.message === exitNotice).length, 1);

    // Alice mines her own Protector block -> SUCCESS!
    clientA.clear();
    clientA.ws.send(JSON.stringify({ type: 'block_break', x: protBx, y: protBy, minedItem: 'protector' }));
    await clientA.waitFor((m) => m.type === 'protector_removed' && m.x === protBx && m.y === protBy);
    const invAfterA = await clientA.waitFor((m) => m.type === 'inventory_sync');
    assert.equal(invAfterA.inventory.counts.protector, 1, 'Alice retrieved her Protector block');

    await clientC.close();
    clientCReconnected.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName, playerId: 'player-carol' }));
    const rejoinedC = await clientCReconnected.waitFor((m) => m.type === 'lobby_joined');
    for (const existing of [joinedA, joinedB, joinedD]) {
      assert.ok(Math.hypot(rejoinedC.spawnX - existing.spawnX, rejoinedC.spawnY - existing.spawnY) >= 8 * TILE_SIZE,
        'a returning player must retain a safe saved position or receive a new separated reservation');
    }

  } finally {
    await clientA.close();
    await clientB.close();
    await clientC.close();
    await clientD.close();
    await otherLobbyClient.close();
    await clientCReconnected.close();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
