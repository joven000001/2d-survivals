import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import { setupMultiplayerWebSocket } from '../server/index';

test('leaderboard_get returns server daily and forever categories over multiplayer WebSocket', async () => {
  const httpServer = createServer();
  const wsServer = setupMultiplayerWebSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  try {
    const response = await new Promise<Record<string, any>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Leaderboard response timed out')), 5000);
      socket.once('error', (error) => { clearTimeout(timer); reject(error); });
      socket.on('message', (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === 'leaderboard_data') { clearTimeout(timer); resolve(message); }
      });
      socket.once('open', () => socket.send(JSON.stringify({ type: 'leaderboard_get' })));
    });
    for (const key of ['animals', 'time', 'players']) {
      assert.ok(Array.isArray(response.daily[key]));
      assert.ok(Array.isArray(response.forever[key]));
    }
    assert.equal(typeof response.dailyResetsAt, 'number');
  } finally {
    socket.close();
    await new Promise<void>((resolve) => wsServer.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
