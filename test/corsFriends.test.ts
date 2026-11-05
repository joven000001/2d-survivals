import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import express from 'express';
import { setupAuthRoutes, isAllowedOrigin } from '../server/index';

test('isAllowedOrigin correctly permits valid game origins and rejects untrusted origins', () => {
  // Google AI Studio preview & Cloud Run domains
  assert.equal(isAllowedOrigin('https://ais-dev-whdc5yym725g5oh5h6qcgs-965824245914.asia-southeast1.run.app'), true);
  assert.equal(isAllowedOrigin('https://ais-pre-whdc5yym725g5oh5h6qcgs-965824245914.asia-southeast1.run.app'), true);
  assert.equal(isAllowedOrigin('https://custom-preview-abc123.run.app'), true);

  // Render server domain
  assert.equal(isAllowedOrigin('https://pixel-frontier.onrender.com'), true);
  assert.equal(isAllowedOrigin('https://staging-server.onrender.com'), true);

  // Local development
  assert.equal(isAllowedOrigin('http://localhost:3000'), true);
  assert.equal(isAllowedOrigin('http://localhost:5173'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:3000'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:5173'), true);

  // Disallowed origins
  assert.equal(isAllowedOrigin('https://evil.com'), false);
  assert.equal(isAllowedOrigin('http://attacker.org'), false);
  assert.equal(isAllowedOrigin(''), false);
  // @ts-expect-error test non-string
  assert.equal(isAllowedOrigin(null), false);
});

test('CORS middleware and friend endpoints handle GET and OPTIONS with allowed origins', async () => {
  const app = express();
  app.use(express.json());
  setupAuthRoutes(app);

  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const httpUrl = `http://127.0.0.1:${address.port}`;

  const aiStudioOrigin = 'https://ais-dev-whdc5yym725g5oh5h6qcgs-965824245914.asia-southeast1.run.app';
  const renderOrigin = 'https://pixel-frontier.onrender.com';
  const maliciousOrigin = 'https://malicious-site.example.com';

  try {
    // 1. OPTIONS preflight for /friends with allowed origin
    const preflightRes = await fetch(`${httpUrl}/friends?playerId=player-68&displayName=NOOP`, {
      method: 'OPTIONS',
      headers: {
        Origin: aiStudioOrigin,
        'Access-Control-Request-Method': 'GET',
      },
    });
    assert.equal(preflightRes.status, 204);
    assert.equal(preflightRes.headers.get('access-control-allow-origin'), aiStudioOrigin);
    assert.match(preflightRes.headers.get('access-control-allow-methods') || '', /GET/);

    // 2. OPTIONS preflight for /friends with disallowed origin
    const badPreflightRes = await fetch(`${httpUrl}/friends?playerId=player-68&displayName=NOOP`, {
      method: 'OPTIONS',
      headers: {
        Origin: maliciousOrigin,
        'Access-Control-Request-Method': 'GET',
      },
    });
    assert.equal(badPreflightRes.status, 403);
    assert.equal(badPreflightRes.headers.get('access-control-allow-origin'), null);

    // 3. GET /friends from AI Studio origin
    const getFriendsRes = await fetch(`${httpUrl}/friends?playerId=player-68&displayName=NOOP`, {
      method: 'GET',
      headers: {
        Origin: aiStudioOrigin,
      },
    });
    assert.equal(getFriendsRes.status, 200);
    assert.equal(getFriendsRes.headers.get('access-control-allow-origin'), aiStudioOrigin);
    const friendsData: any = await getFriendsRes.json();
    assert.equal(friendsData.ok, true);
    assert.ok(Array.isArray(friendsData.friends));

    // 4. GET /api/friends from Render origin
    const getApiFriendsRes = await fetch(`${httpUrl}/api/friends?playerId=player-68&displayName=NOOP`, {
      method: 'GET',
      headers: {
        Origin: renderOrigin,
      },
    });
    assert.equal(getApiFriendsRes.status, 200);
    assert.equal(getApiFriendsRes.headers.get('access-control-allow-origin'), renderOrigin);

    // 5. GET /friends from disallowed origin does NOT include CORS allow header
    const badGetFriendsRes = await fetch(`${httpUrl}/friends?playerId=player-68&displayName=NOOP`, {
      method: 'GET',
      headers: {
        Origin: maliciousOrigin,
      },
    });
    assert.equal(badGetFriendsRes.status, 200);
    assert.equal(badGetFriendsRes.headers.get('access-control-allow-origin'), null);

    // 6. POST /friends/request preflight and execution
    const postPreflight = await fetch(`${httpUrl}/friends/request`, {
      method: 'OPTIONS',
      headers: {
        Origin: aiStudioOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type',
      },
    });
    assert.equal(postPreflight.status, 204);
    assert.equal(postPreflight.headers.get('access-control-allow-origin'), aiStudioOrigin);

    const postRes = await fetch(`${httpUrl}/friends/request`, {
      method: 'POST',
      headers: {
        Origin: aiStudioOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fromPlayerId: 'player-test-1',
        fromPlayerName: 'Player1',
        targetPlayerId: 'player-test-2',
        targetPlayerName: 'Player2',
      }),
    });
    assert.equal(postRes.status, 200);
    assert.equal(postRes.headers.get('access-control-allow-origin'), aiStudioOrigin);
    const postData: any = await postRes.json();
    assert.equal(typeof postData.ok, 'boolean');

    // 7. POST /api/friends/request works with allowed origin
    const postApiRes = await fetch(`${httpUrl}/api/friends/request`, {
      method: 'POST',
      headers: {
        Origin: renderOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fromPlayerId: 'player-test-3',
        fromPlayerName: 'Player3',
        targetPlayerId: 'player-test-4',
        targetPlayerName: 'Player4',
      }),
    });
    assert.equal(postApiRes.status, 200);
    assert.equal(postApiRes.headers.get('access-control-allow-origin'), renderOrigin);

  } finally {
    (httpServer as any).closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
