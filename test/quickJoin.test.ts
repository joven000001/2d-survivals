import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'node:http';
import { WebSocket } from 'ws';

const testDataDir = mkdtempSync(path.join(tmpdir(), 'pixel-frontier-quick-join-'));
process.env.PIXEL_FRONTIER_DATA_DIR = testDataDir;
const { selectQuickJoinLobby, setupMultiplayerWebSocket } = await import('../server/index');

function candidate(name: string, playerCount: number, createdAt: number) {
  return { name, players: new Set(Array.from({ length: playerCount }, (_, index) => index)), createdAt };
}

test('Quick Join prefers occupied lobbies and selects the fullest lobby with capacity', () => {
  const selected = selectQuickJoinLobby([
    candidate('10001', 0, 1),
    candidate('10002', 3, 2),
    candidate('10003', 7, 3),
    candidate('10004', 8, 0),
  ], 8);
  assert.equal(selected?.name, '10003');
});

test('Quick Join falls back to an existing empty lobby when no occupied lobby has capacity', () => {
  const selected = selectQuickJoinLobby([
    candidate('20001', 8, 1),
    candidate('20002', 0, 2),
  ], 8);
  assert.equal(selected?.name, '20002');
});

test('Quick Join excludes full lobbies and requests a new lobby when all are full', () => {
  const selected = selectQuickJoinLobby([
    candidate('30001', 8, 1),
    candidate('30002', 9, 2),
  ], 8);
  assert.equal(selected, undefined);
});

type TestClient = {
  ws: WebSocket;
  messages: Array<Record<string, any>>;
  waitFor: (predicate: (message: Record<string, any>) => boolean) => Promise<Record<string, any>>;
  close: () => Promise<void>;
};

function createClient(url: string): TestClient {
  const ws = new WebSocket(url);
  const messages: Array<Record<string, any>> = [];
  ws.on('message', (data) => {
    try { messages.push(JSON.parse(data.toString())); } catch { /* Ignore non-JSON frames. */ }
  });
  return {
    ws,
    messages,
    waitFor(predicate) {
      const existing = messages.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          ws.off('message', handler);
          reject(new Error(`Timed out waiting for server message; recent messages=${JSON.stringify(messages.slice(-5))}`));
        }, 15_000);
        const handler = (data: WebSocket.RawData) => {
          try {
            const message = JSON.parse(data.toString()) as Record<string, any>;
            if (!predicate(message)) return;
            clearTimeout(timer);
            ws.off('message', handler);
            resolve(message);
          } catch { /* Ignore malformed frames. */ }
        };
        ws.on('message', handler);
      });
    },
    close() {
      return new Promise((resolve) => {
        if (ws.readyState === WebSocket.CLOSED) return resolve();
        ws.once('close', () => resolve());
        ws.close();
      });
    },
  };
}

function waitForOpen(client: TestClient): Promise<void> {
  if (client.ws.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    client.ws.once('open', resolve);
    client.ws.once('error', reject);
  });
}

test('simultaneous Quick Join requests use server counts and do not exceed lobby capacity', async () => {
  const httpServer = createServer();
  const wsServer = setupMultiplayerWebSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const wsUrl = `ws://127.0.0.1:${address.port}/ws`;
  const clients: TestClient[] = [];

  const makeClient = async () => {
    const client = createClient(wsUrl);
    clients.push(client);
    await waitForOpen(client);
    return client;
  };

  try {
    const stamp = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
    const occupiedCode = `${stamp}1`;
    for (let index = 0; index < 7; index++) {
      const client = await makeClient();
      client.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: occupiedCode, playerId: `qj-base-${stamp}-${index}` }));
      const joined = await client.waitFor((message) => message.type === 'lobby_joined');
      assert.equal(joined.success, true);
    }

    const emptyCode = `${stamp}2`;
    const emptyLobbyClient = await makeClient();
    emptyLobbyClient.ws.send(JSON.stringify({ type: 'join_lobby', lobbyName: emptyCode, playerId: `qj-empty-${stamp}` }));
    await emptyLobbyClient.waitFor((message) => message.type === 'lobby_joined');
    await emptyLobbyClient.close();

    const quickJoiners = await Promise.all([makeClient(), makeClient()]);
    for (const [index, client] of quickJoiners.entries()) {
      client.ws.send(JSON.stringify({ type: 'quick_join_lobby', playerId: `qj-quick-${stamp}-${index}` }));
    }
    const joined = await Promise.all(quickJoiners.map((client) => client.waitFor((message) => message.type === 'lobby_joined')));

    assert.equal(joined[0].success, true);
    assert.equal(joined[1].success, true);
    const occupiedJoin = joined.find((message) => message.lobbyName === occupiedCode);
    const emptyJoin = joined.find((message) => message.lobbyName === emptyCode);
    assert.ok(occupiedJoin, 'one request should take the last available slot in the occupied lobby');
    assert.ok(emptyJoin, 'the other request should fall back to the existing empty lobby');
    assert.equal(occupiedJoin.playerCount, 8);
    assert.equal(emptyJoin.playerCount, 1);
    assert.ok(joined.every((message) => message.playerCount <= 8));
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    await new Promise<void>((resolve) => wsServer.close(() => resolve()));
    await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    rmSync(testDataDir, { recursive: true, force: true });
  }
});
