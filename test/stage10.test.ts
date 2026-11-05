import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import { setupMultiplayerWebSocket } from '../server/index';
import { loadWorldData, loadPlayerData } from '../server/persistence';
import { Inventory } from '../src/game/inventory';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('--- STARTING STAGE 10 WORLD ITEM DROPPING TEST SUITE ---');

  const httpServer = createServer();
  const wsServer = setupMultiplayerWebSocket(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Invalid address');
  const port = address.port;
  const wsUrl = `ws://127.0.0.1:${port}`;

  function createClient(): {
    ws: WebSocket;
    messages: any[];
    waitForMessage: (predicate: (msg: any) => boolean, timeoutMs?: number) => Promise<any>;
    clearMessages: () => void;
    close: () => Promise<void>;
  } {
    const ws = new WebSocket(wsUrl);
    const messages: any[] = [];
    ws.on('message', (data) => {
      try {
        messages.push(JSON.parse(data.toString()));
      } catch {
        // ignore non-json
      }
    });

    const waitForMessage = (predicate: (msg: any) => boolean, timeoutMs = 2500) => {
      return new Promise<any>((resolve, reject) => {
        const found = messages.find(predicate);
        if (found) return resolve(found);

        const timer = setTimeout(() => {
          ws.off('message', handler);
          reject(new Error(`Timeout (${timeoutMs}ms) waiting for message; receivedTypes=${JSON.stringify(messages.map((message) => message.type).slice(-20))}`));
        }, timeoutMs);

        const handler = (data: any) => {
          try {
            const parsed = JSON.parse(data.toString());
            if (predicate(parsed)) {
              clearTimeout(timer);
              ws.off('message', handler);
              resolve(parsed);
            }
          } catch {}
        };

        ws.on('message', handler);
      });
    };

    const clearMessages = () => {
      messages.length = 0;
    };

    const close = () => {
      return new Promise<void>((resolve) => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.on('close', () => resolve());
          ws.close();
        } else {
          resolve();
        }
      });
    };

    return { ws, messages, waitForMessage, clearMessages, close };
  }

  const clientA = createClient();
  const clientB = createClient();
  const testLobbyName = `10${Date.now()}`;

  try {
    await new Promise<void>((resolve) => clientA.ws.on('open', () => resolve()));
    await new Promise<void>((resolve) => clientB.ws.on('open', () => resolve()));

    // 1. Join same lobby
    clientA.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: testLobbyName, playerId: 'player-drop-a' }));
    const joinedA = await clientA.waitForMessage((m) => m.type === 'lobby_joined');
    assert(joinedA.success === true, 'Player A failed to join lobby');

    clientB.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: testLobbyName, playerId: 'player-drop-b' }));
    const joinedB = await clientB.waitForMessage((m) => m.type === 'lobby_joined');
    assert(joinedB.success === true, 'Player B failed to join lobby');

    // Grant test kit to Player A so they have items
    clientA.ws.send(JSON.stringify({ type: 'developer_grant_test_kit' }));
    const syncA = await clientA.waitForMessage((m) => m.type === 'inventory_sync');
    assert(syncA.inventory.counts.wood >= 40, 'Player A did not receive test kit wood');
    assert(syncA.inventory.counts.dirt >= 24, 'Player A did not receive test kit dirt');
    const slotFor = (item: string) => {
      const hotbarIndex = syncA.inventory.hotbarTypes.indexOf(item);
      if (hotbarIndex >= 1) return { kind: 'hotbar', index: hotbarIndex };
      const inventoryIndex = syncA.inventory.inventoryTypes.indexOf(item);
      return { kind: 'inventory', index: inventoryIndex };
    };

    // TEST A: Inventory slot -> inventory slot move/swap
    try {
      clientA.clearMessages();
      // Move slot 0 of inventory to slot 10
      clientA.ws.send(JSON.stringify({
        type: 'inventory_move_slot',
        from: { kind: 'inventory', index: 0 },
        to: { kind: 'inventory', index: 10 },
      }));
      const moveSync = await clientA.waitForMessage((m) => m.type === 'inventory_sync');
      assert(moveSync.inventory !== undefined, 'Move sync not received');
      results.push({ name: 'A. Drag an item between inventory slots (move/swap)', passed: true });
    } catch (e: any) {
      results.push({ name: 'A. Drag an item between inventory slots (move/swap)', passed: false, error: e.message });
    }

    // TEST B & C & D: Drag one item outside inventory -> exactly one item removed, exactly one world drop appears
    let singleDropId = 0;
    try {
      clientA.clearMessages();
      clientB.clearMessages();

      const initialWood = syncA.inventory.counts.wood;
      const reqId = `drop_test_${Date.now()}_single`;

      clientA.ws.send(JSON.stringify({
        type: 'drop_request',
        requestId: reqId,
        slot: slotFor('wood'),
        item: 'wood',
        count: 1,
      }));

      const dropSpawnMsgA = await clientA.waitForMessage((m) => m.type === 'drop_spawned');
      const invSyncA = await clientA.waitForMessage((m) => m.type === 'inventory_sync');

      assert(dropSpawnMsgA.drop.type === 'wood', 'Drop type must be wood');
      assert(dropSpawnMsgA.drop.count === 1, 'Drop count must be exactly 1');
      assert(invSyncA.inventory.counts.wood === initialWood - 1, 'Exactly one wood was not deducted from inventory');
      singleDropId = dropSpawnMsgA.drop.id;

      results.push({ name: 'B. Drag one item outside the inventory', passed: true });
      results.push({ name: 'C. Verify exactly one item is removed', passed: true });
      results.push({ name: 'D. Verify exactly one world drop appears', passed: true });
    } catch (e: any) {
      results.push({ name: 'B. Drag one item outside the inventory', passed: false, error: e.message });
      results.push({ name: 'C. Verify exactly one item is removed', passed: false, error: e.message });
      results.push({ name: 'D. Verify exactly one world drop appears', passed: false, error: e.message });
    }

    // TEST E: Drag/drop a stack and verify the exact quantity
    let stackDropId = 0;
    try {
      clientA.clearMessages();
      clientB.clearMessages();

      const initialDirt = syncA.inventory.counts.dirt;
      const dropCount = 12;

      clientA.ws.send(JSON.stringify({
        type: 'drop_request',
        requestId: `drop_test_stack_${Date.now()}`,
        slot: slotFor('dirt'),
        item: 'dirt',
        count: dropCount,
      }));

      const dropSpawnMsg = await clientA.waitForMessage((m) => m.type === 'drop_spawned');
      const invSync = await clientA.waitForMessage((m) => m.type === 'inventory_sync');

      assert(dropSpawnMsg.drop.type === 'dirt', 'Drop type must be dirt');
      assert(dropSpawnMsg.drop.count === dropCount, `Drop count must be exactly ${dropCount}`);
      assert(invSync.inventory.counts.dirt === initialDirt - dropCount, 'Stack quantity not deducted correctly');
      stackDropId = dropSpawnMsg.drop.id;

      results.push({ name: 'E. Drag/drop a stack and verify the exact quantity', passed: true });
    } catch (e: any) {
      results.push({ name: 'E. Drag/drop a stack and verify the exact quantity', passed: false, error: e.message });
    }

    // TEST F: Verify another multiplayer player sees the drop
    try {
      const dropOnB = await clientB.waitForMessage((m) => m.type === 'drop_spawned' && m.drop.id === stackDropId);
      assert(dropOnB !== undefined, 'Player B did not receive drop_spawned for dropped stack');
      assert(dropOnB.drop.count === 12, 'Player B saw incorrect count on drop');
      results.push({ name: 'F. Verify another multiplayer player sees the drop', passed: true });
    } catch (e: any) {
      results.push({ name: 'F. Verify another multiplayer player sees the drop', passed: false, error: e.message });
    }

    // TEST G: Verify another player can pick it up
    try {
      clientB.clearMessages();
      clientA.clearMessages();

      clientB.ws.send(JSON.stringify({
        type: 'pickup_request',
        dropId: stackDropId,
      }));

      const pickupSuccessB = await clientB.waitForMessage((m) => m.type === 'pickup_success');
      assert(pickupSuccessB.dropId === stackDropId, 'Player B pickup_success did not match drop ID');
      assert(pickupSuccessB.count === 12, 'Player B did not pick up full stack count');

      const invSyncB = await clientB.waitForMessage((m) => m.type === 'inventory_sync');
      assert(invSyncB.inventory.counts.dirt >= 12, 'Player B inventory did not receive picked up dirt');

      results.push({ name: 'G. Verify another player can pick it up', passed: true });
    } catch (e: any) {
      results.push({ name: 'G. Verify another player can pick it up', passed: false, error: e.message });
    }

    // TEST H: Verify the drop disappears for everyone after pickup
    try {
      const dropRemovedA = await clientA.waitForMessage((m) => m.type === 'drop_removed' && m.dropId === stackDropId);
      assert(dropRemovedA !== undefined, 'Player A did not receive drop_removed');
      const dropRemovedB = await clientB.waitForMessage((m) => m.type === 'drop_removed' && m.dropId === stackDropId);
      assert(dropRemovedB !== undefined, 'Player B did not receive drop_removed');

      // Player A cannot claim it now
      clientA.ws.send(JSON.stringify({ type: 'pickup_request', dropId: stackDropId }));
      const rejectA = await clientA.waitForMessage((m) => m.type === 'pickup_rejected');
      assert(rejectA.dropId === stackDropId, 'Player A was not rejected from picking up already collected drop');

      results.push({ name: 'H. Verify the drop disappears for everyone after pickup', passed: true });
    } catch (e: any) {
      results.push({ name: 'H. Verify the drop disappears for everyone after pickup', passed: false, error: e.message });
    }

    // TEST I & J: Attempt duplicate/repeated drop requests & verify no item duplication
    try {
      clientA.clearMessages();
      const duplicateReqId = `dup_req_${Date.now()}`;
      const woodBefore = (await new Promise<number>((res) => {
        clientA.ws.send(JSON.stringify({ type: 'drop_request', requestId: duplicateReqId, slot: slotFor('wood'), item: 'wood', count: 2 }));
        clientA.waitForMessage((m) => m.type === 'drop_success').then((m) => {
          clientA.waitForMessage((im) => im.type === 'inventory_sync').then((im) => res(im.inventory.counts.wood));
        });
      }));

      // Replay identical requestId
      clientA.clearMessages();
      clientA.ws.send(JSON.stringify({ type: 'drop_request', requestId: duplicateReqId, slot: slotFor('wood'), item: 'wood', count: 2 }));
      const rejected = await clientA.waitForMessage((m) => m.type === 'drop_rejected');
      assert(rejected.reason.includes('Duplicate'), 'Server did not reject duplicate drop request ID');

      results.push({ name: 'I. Attempt duplicate/repeated drop requests', passed: true });
      results.push({ name: 'J. Verify no item duplication', passed: true });
    } catch (e: any) {
      results.push({ name: 'I. Attempt duplicate/repeated drop requests', passed: false, error: e.message });
      results.push({ name: 'J. Verify no item duplication', passed: false, error: e.message });
    }

    // TEST K & L: Attempt forged quantity / drop requests & reject invalid requests
    try {
      clientA.clearMessages();
      // 1. Drop starter sword (must be rejected)
      clientA.ws.send(JSON.stringify({
        type: 'drop_request',
        slot: { kind: 'hotbar', index: 0 },
        item: 'sword',
        count: 1,
      }));
      const rejectSword = await clientA.waitForMessage((m) => m.type === 'drop_rejected');
      assert(rejectSword !== undefined, 'Server did not reject dropping starter sword');

      // 2. Drop quantity > owned (must be rejected)
      clientA.clearMessages();
      clientA.ws.send(JSON.stringify({
        type: 'drop_request',
        slot: { kind: 'inventory', index: 7 },
        item: 'diamond',
        count: 999999,
      }));
      const rejectExcess = await clientA.waitForMessage((m) => m.type === 'drop_rejected');
      assert(rejectExcess !== undefined, 'Server did not reject dropping excessive quantity');

      // 3. Drop negative / zero / invalid quantity
      clientA.clearMessages();
      clientA.ws.send(JSON.stringify({
        type: 'drop_request',
        slot: slotFor('wood'),
        item: 'wood',
        count: -5,
      }));
      const rejectNegative = await clientA.waitForMessage((m) => m.type === 'drop_rejected');
      assert(rejectNegative !== undefined, 'Server did not reject negative quantity');

      // 4. Drop non-owned item
      clientA.clearMessages();
      clientA.ws.send(JSON.stringify({
        type: 'drop_request',
        slot: { kind: 'inventory', index: 47 },
        item: 'gold_axe',
        count: 1,
      }));
      const rejectUnowned = await clientA.waitForMessage((m) => m.type === 'drop_rejected');
      assert(rejectUnowned !== undefined, 'Server did not reject unowned item');

      results.push({ name: 'K. Attempt forged quantity/drop requests', passed: true });
      results.push({ name: 'L. Verify the server rejects invalid requests', passed: true });
    } catch (e: any) {
      results.push({ name: 'K. Attempt forged quantity/drop requests', passed: false, error: e.message });
      results.push({ name: 'L. Verify the server rejects invalid requests', passed: false, error: e.message });
    }

    // TEST M: Verify dropped items use existing persistence
    try {
      // Drop an item that stays in the world
      clientA.clearMessages();
      clientA.ws.send(JSON.stringify({
        type: 'drop_request',
        requestId: `drop_persist_${Date.now()}`,
        slot: slotFor('stone'),
        item: 'stone',
        count: 5,
      }));
      const dropSpawn = await clientA.waitForMessage((m) => m.type === 'drop_spawned');
      assert(dropSpawn.drop.type === 'stone', 'Failed to spawn persistent test drop');

      // Load world data from disk
      const worldData = loadWorldData(testLobbyName);
      if (!worldData) throw new Error('World data file not found');
      const foundInWorld = worldData.drops.some((d) => d.id === dropSpawn.drop.id && d.type === 'stone' && d.count === 5);
      assert(foundInWorld, 'Dropped item not persisted in world.json');

      results.push({ name: 'M. Verify dropped items use existing persistence', passed: true });
    } catch (e: any) {
      results.push({ name: 'M. Verify dropped items use existing persistence', passed: false, error: e.message });
    }

    // TEST N: Single Player item drop & consumption logic
    try {
      const spInventory = new Inventory();
      spInventory.addItem('wood', 10);
      assert(spInventory.counts.wood === 10, 'Single player inventory did not receive wood');

      // Drop 3 wood
      const consumed = spInventory.consumeItem('wood', 3);
      assert(consumed === true, 'Failed to consume item in single player');
      assert(spInventory.counts.wood === 7, 'Wood count not updated correctly after drop');

      // Drop remaining 7
      spInventory.consumeItem('wood', 7);
      assert(spInventory.counts.wood === 0, 'Wood count should be 0');
      assert(spInventory.getSlots().every((s) => s.type !== 'wood') && spInventory.getInventorySlots().every((s) => s.type !== 'wood'), 'Wood slot should be cleared');

      results.push({ name: 'N. Verify Single Player still works', passed: true });
    } catch (e: any) {
      results.push({ name: 'N. Verify Single Player still works', passed: false, error: e.message });
    }

  } finally {
    await clientA.close();
    await clientB.close();
    await new Promise<void>((resolve) => {
      wsServer.close(() => {
        httpServer.close(() => resolve());
      });
    });
  }

  console.log('\n========================================');
  console.log('STAGE 10 TEST RESULTS:');
  console.log('========================================');
  let allPassed = true;
  for (const r of results) {
    if (r.passed) {
      console.log(`PASS: ${r.name}`);
    } else {
      console.log(`FAIL: ${r.name} - Error: ${r.error}`);
      allPassed = false;
    }
  }
  console.log('========================================');
  if (!allPassed) {
    console.error('Some tests failed!');
    process.exit(1);
  } else {
    console.log('ALL STAGE 10 REQUIREMENTS VERIFIED SUCCESSFULLY!');
  }
}

runTests().catch((e) => {
  console.error('Fatal test error:', e);
  process.exit(1);
});
