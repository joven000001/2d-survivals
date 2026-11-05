import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';
import express from 'express';
import { setupMultiplayerWebSocket, setupAuthRoutes, MAX_PROTECTORS_PER_PLAYER } from '../server/index';
import { TileType } from '../src/game/types';
import { TILE_SIZE } from '../src/game/constants';

function createWsClient(url: string) {
  const ws = new WebSocket(url);
  ws.on('error', () => {});
  const messages: any[] = [];
  ws.on('message', (data) => {
    try { messages.push(JSON.parse(data.toString())); } catch {}
  });

  return {
    ws,
    messages,
    waitFor(predicate: (message: any) => boolean, timeout = 3500): Promise<any> {
      const found = messages.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.off('message', handler);
          reject(new Error(`Timed out waiting for message; all messages=${JSON.stringify(messages.slice(-8))}`));
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

test('Friends system: send request, accept, online status (green dot / gray dot), and join lobby', async () => {
  const app = express();
  app.use(express.json());
  setupAuthRoutes(app);
  const httpServer = createServer(app);
  const wss = setupMultiplayerWebSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const wsUrl = `ws://127.0.0.1:${address.port}`;
  const httpUrl = `http://127.0.0.1:${address.port}`;

  const clientA = createWsClient(wsUrl);
  const clientB = createWsClient(wsUrl);

  const stamp = Date.now();
  const playerAId = `player-alice-${stamp}`;
  const playerAName = `Alice_${stamp % 1000}`;
  const playerBId = `player-bob-${stamp}`;
  const playerBName = `Bob_${stamp % 1000}`;
  const lobbyCode = `${Math.floor(100000 + Math.random() * 900000)}`;

  try {
    await Promise.all([
      new Promise<void>((resolve) => clientA.ws.on('open', resolve)),
      new Promise<void>((resolve) => clientB.ws.on('open', resolve)),
    ]);

    // Alice joins lobby
    clientA.ws.send(JSON.stringify({
      type: 'join_lobby',
      lobbyName: lobbyCode,
      playerId: playerAId,
      displayName: playerAName,
    }));
    const joinedA = await clientA.waitFor((m) => m.type === 'lobby_joined');
    assert.equal(joinedA.success, true);

    // Alice speaks in chat -> verify name is present
    clientA.clear();
    clientA.ws.send(JSON.stringify({ type: 'chat_message', text: 'Hello Bob!' }));
    const chatBroadcast = await clientA.waitFor((m) => m.type === 'chat_message');
    assert.equal(chatBroadcast.playerName, playerAName);
    assert.equal(chatBroadcast.text, 'Hello Bob!');

    // Bob identifies on server (title screen)
    clientB.ws.send(JSON.stringify({
      type: 'player_identify',
      playerId: playerBId,
      displayName: playerBName,
    }));
    await clientB.waitFor((m) => m.type === 'player_identified');

    // Bob right-clicks Alice's name in chat / sends friend request to Alice
    clientB.clear(); clientA.clear();
    clientB.ws.send(JSON.stringify({
      type: 'send_friend_request',
      fromPlayerId: playerBId,
      fromPlayerName: playerBName,
      targetPlayerId: playerAId,
      targetPlayerName: playerAName,
    }));

    const reqResult = await clientB.waitFor((m) => m.type === 'friend_request_result');
    assert.equal(reqResult.success, true);

    // Alice receives friends_updated / friends_list with incoming request from Bob
    const aliceFriends = await clientA.waitFor((m) => m.type === 'friends_list');
    const incomingFromBob = aliceFriends.incomingRequests.find((r: any) => r.fromPlayerId === playerBId);
    assert.ok(incomingFromBob, 'Alice must have incoming friend request from Bob');

    // Alice accepts Bob's friend request
    clientA.clear(); clientB.clear();
    clientA.ws.send(JSON.stringify({
      type: 'respond_friend_request',
      playerId: playerAId,
      fromPlayerId: playerBId,
      action: 'accept',
    }));

    const acceptResult = await clientA.waitFor((m) => m.type === 'friend_respond_result');
    assert.equal(acceptResult.success, true);

    // Verify Bob's updated friends list: Alice is now a friend and is ONLINE (green dot status) in lobbyCode
    const bobFriends = await clientB.waitFor((m) => m.type === 'friends_list');
    const aliceInBobList = bobFriends.friends.find((f: any) => f.playerId === playerAId);
    assert.ok(aliceInBobList, 'Alice must be in Bob friends list');
    assert.equal(aliceInBobList.isOnline, true, 'Alice should be online (green dot)');
    assert.equal(aliceInBobList.lobbyName, lobbyCode, 'Alice lobby should be visible to Bob so Bob can join');

    // Bob sees Alice's online status and joins Alice's lobby!
    clientB.clear();
    clientB.ws.send(JSON.stringify({
      type: 'join_lobby',
      lobbyName: aliceInBobList.lobbyName,
      playerId: playerBId,
      displayName: playerBName,
    }));
    const joinedB = await clientB.waitFor((m) => m.type === 'lobby_joined');
    assert.equal(joinedB.success, true);
    assert.equal(joinedB.lobbyName, lobbyCode);

    // Verify REST API endpoint /api/friends returns friends with online status
    const restRes = await fetch(`${httpUrl}/api/friends?playerId=${encodeURIComponent(playerBId)}&displayName=${encodeURIComponent(playerBName)}`, {
      headers: { connection: 'close' },
    });
    assert.equal(restRes.status, 200);
    const restData: any = await restRes.json();
    assert.equal(restData.ok, true);
    const friendAliceRest = restData.friends.find((f: any) => f.playerId === playerAId);
    assert.ok(friendAliceRest);
    assert.equal(friendAliceRest.isOnline, true);
    assert.equal(friendAliceRest.lobbyName, lobbyCode);

    // When Alice disconnects, Bob receives friends_updated and Alice shows offline (gray dot)
    await clientA.close();
    await new Promise((r) => setTimeout(r, 100));

    const restResAfterDisconnect = await fetch(`${httpUrl}/api/friends?playerId=${encodeURIComponent(playerBId)}`, {
      headers: { connection: 'close' },
    });
    const restDataAfter: any = await restResAfterDisconnect.json();
    const friendAliceOffline = restDataAfter.friends.find((f: any) => f.playerId === playerAId);
    assert.ok(friendAliceOffline);
    assert.equal(friendAliceOffline.isOnline, false, 'Alice should be offline (gray dot)');

  } finally {
    await clientA.close();
    await clientB.close();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    (httpServer as any).closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});

test('Protectors limit: only 10 protectors allowed per player', async () => {
  const httpServer = createServer();
  const wss = setupMultiplayerWebSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const wsUrl = `ws://127.0.0.1:${address.port}`;

  const lobbyCode = `${Math.floor(100000 + Math.random() * 900000)}`;
  const client = createWsClient(wsUrl);

  try {
    await new Promise<void>((resolve) => client.ws.on('open', resolve));

    client.ws.send(JSON.stringify({
      type: 'join_lobby',
      lobbyName: lobbyCode,
      playerId: 'player-builder',
      displayName: 'Builder',
    }));
    const joined = await client.waitFor((m) => m.type === 'lobby_joined');
    assert.equal(joined.success, true);

    const startBx = Math.floor(joined.spawnX / TILE_SIZE);
    const startBy = Math.floor(joined.spawnY / TILE_SIZE) - 2;

    // Place 10 protectors
    for (let i = 0; i < MAX_PROTECTORS_PER_PLAYER; i++) {
      client.ws.send(JSON.stringify({ type: 'developer_grant_test_kit' }));
      await client.waitFor((m) => m.type === 'inventory_sync');

      // Craft protector
      client.ws.send(JSON.stringify({ type: 'craft_request', recipeId: 'protector' }));
      await client.waitFor((m) => m.type === 'craft_success');

      // Place protector
      const bx = startBx + (i % 5) - 2;
      const by = startBy - Math.floor(i / 5);

      // Move player nearby so block is within 6 tiles reach
      client.ws.send(JSON.stringify({ type: 'player_move', x: bx * TILE_SIZE, y: by * TILE_SIZE + 20, facingRight: true }));

      client.clear();
      client.ws.send(JSON.stringify({ type: 'block_place', x: bx, y: by, tile: TileType.PROTECTOR }));
      const placed = await client.waitFor((m) => m.type === 'protector_created');
      assert.equal(placed.protector.x, bx);
      assert.equal(placed.protector.y, by);
    }

    // Now player has placed exactly 10 protectors.
    // Try to place the 11th protector!
    client.ws.send(JSON.stringify({ type: 'developer_grant_test_kit' }));
    await client.waitFor((m) => m.type === 'inventory_sync');
    client.ws.send(JSON.stringify({ type: 'craft_request', recipeId: 'protector' }));
    await client.waitFor((m) => m.type === 'craft_success');

    const bx11 = startBx + 3;
    const by11 = startBy;
    client.ws.send(JSON.stringify({ type: 'player_move', x: bx11 * TILE_SIZE, y: by11 * TILE_SIZE + 20, facingRight: true }));

    client.clear();
    client.ws.send(JSON.stringify({ type: 'block_place', x: bx11, y: by11, tile: TileType.PROTECTOR }));
    const rejected = await client.waitFor((m) => m.type === 'block_rejected');
    assert.ok(rejected, '11th protector placement must be rejected');
    assert.ok(
      rejected.reason.includes('10 Protectors') || rejected.reason.includes('up to 10'),
      `Expected rejection reason about 10 protectors, got: ${rejected.reason}`
    );

    // Mine one of the player's 10 protectors
    client.clear();
    client.ws.send(JSON.stringify({ type: 'block_break', x: startBx - 2, y: startBy, minedItem: 'protector' }));
    await client.waitFor((m) => m.type === 'protector_removed');

    // Now player has 9 protectors placed. Placing again should SUCCEED!
    client.clear();
    client.ws.send(JSON.stringify({ type: 'block_place', x: bx11, y: by11, tile: TileType.PROTECTOR }));
    const success10 = await client.waitFor((m) => m.type === 'protector_created');
    assert.equal(success10.protector.x, bx11);

  } finally {
    await client.close();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    (httpServer as any).closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});

test('Send friend request by entering player name into bottom section', async () => {
  const app = express();
  app.use(express.json());
  setupAuthRoutes(app);
  const httpServer = createServer(app);
  const wss = setupMultiplayerWebSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const wsUrl = `ws://127.0.0.1:${address.port}`;
  const httpUrl = `http://127.0.0.1:${address.port}`;

  const clientSender = createWsClient(wsUrl);
  const clientTarget = createWsClient(wsUrl);

  const stamp = Date.now();
  const targetId = `player-target-${stamp}`;
  const targetName = `Target_${stamp % 1000}`;
  const senderId = `player-sender-${stamp}`;
  const senderName = `Sender_${stamp % 1000}`;

  try {
    await Promise.all([
      new Promise<void>((resolve) => clientSender.ws.on('open', resolve)),
      new Promise<void>((resolve) => clientTarget.ws.on('open', resolve)),
    ]);

    // Target player is online
    clientTarget.ws.send(JSON.stringify({
      type: 'player_identify',
      playerId: targetId,
      displayName: targetName,
    }));
    await clientTarget.waitFor((m) => m.type === 'player_identified');
    clientTarget.clear();

    // Sender types target's DISPLAY NAME into bottom dropdown arrow form
    const response = await fetch(`${httpUrl}/api/friends/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', connection: 'close' },
      body: JSON.stringify({
        fromPlayerId: senderId,
        fromPlayerName: senderName,
        targetPlayerName: targetName, // typed in by player
      }),
    });
    const result: any = await response.json();
    assert.equal(result.ok, true);

    // Target receives the friend request
    const targetFriends = await clientTarget.waitFor(
      (m) => m.type === 'friends_list' && Array.isArray(m.incomingRequests) && m.incomingRequests.some((r: any) => r.fromPlayerId === senderId)
    );
    const incomingReq = targetFriends.incomingRequests.find((r: any) => r.fromPlayerId === senderId);
    assert.ok(incomingReq, 'Target must have incoming request sent by name');
    assert.equal(incomingReq.fromPlayerName, senderName);

  } finally {
    await clientSender.close();
    await clientTarget.close();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    (httpServer as any).closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});

