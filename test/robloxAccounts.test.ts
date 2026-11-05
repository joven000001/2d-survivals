import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import express from 'express';
import { setupAuthRoutes } from '../server/index';
import {
  registerAccount,
  authenticateUser,
  changeAccountPassword,
  savePlayerCloudProgress,
  loadPlayerCloudProgress,
  validateUsername,
  validatePassword,
  getAccountForToken,
} from '../server/accounts';

test('Username validation: strictly checks length and characters', () => {
  assert.equal(validateUsername('abc').valid, true);
  assert.equal(validateUsername('PixelHero_99').valid, true);
  assert.equal(validateUsername('ab').valid, false); // too short
  assert.equal(validateUsername('a'.repeat(21)).valid, false); // too long
  assert.equal(validateUsername('bad name!').valid, false); // invalid characters
  assert.equal(validateUsername('hack$#').valid, false);
});

test('Password validation: checks minimum length', () => {
  assert.equal(validatePassword('123456').valid, true);
  assert.equal(validatePassword('12345').valid, false);
});

test('Roblox account registration: creates unique account with salted hash and session token', () => {
  const uniqueName = `u_${Date.now()}`;
  const regResult = registerAccount({
    username: uniqueName,
    password: 'supersecretpassword123',
    displayName: 'TestHero',
  });

  assert.equal(regResult.success, true);
  assert.ok(regResult.token, 'Must return session token');
  assert.ok(regResult.account, 'Must return account object');
  assert.equal(regResult.account?.username, uniqueName);
  assert.notEqual(regResult.account?.passwordHash, 'supersecretpassword123', 'Password must be hashed, never plaintext');
  assert.ok(regResult.account?.passwordSalt, 'Must have cryptographic salt');

  // Case-insensitive duplicate rejection
  const dupResult = registerAccount({
    username: uniqueName.toLowerCase(),
    password: 'anotherpassword',
  });
  assert.equal(dupResult.success, false);
  assert.ok(dupResult.error?.includes('already taken'));
});

test('Authentication and rate limiting', () => {
  const username = `a_${Date.now()}`;
  registerAccount({
    username,
    password: 'correctpassword',
  });

  // Successful auth
  const successAuth = authenticateUser(username, 'correctpassword', '10.0.0.1');
  assert.equal(successAuth.success, true);
  assert.ok(successAuth.token);

  // Failed auth
  const failAuth = authenticateUser(username, 'wrongpassword', '10.0.0.1');
  assert.equal(failAuth.success, false);
  assert.equal(failAuth.error, 'Invalid username or password.');
});

test('Password change updates hash and allows login only with new password', () => {
  const username = `p_${Date.now()}`;
  const reg = registerAccount({
    username,
    password: 'oldPassword123',
  });
  assert.ok(reg.account);

  // Wrong current password
  const failChange = changeAccountPassword(reg.account.id, 'incorrectOld', 'newPassword123');
  assert.equal(failChange.success, false);

  // Correct current password
  const successChange = changeAccountPassword(reg.account.id, 'oldPassword123', 'newPassword123');
  assert.equal(successChange.success, true);

  // Old password fails
  const authOld = authenticateUser(username, 'oldPassword123', '10.0.0.2');
  assert.equal(authOld.success, false);

  // New password succeeds
  const authNew = authenticateUser(username, 'newPassword123', '10.0.0.2');
  assert.equal(authNew.success, true);
});

test('Cloud save progress: persists character state, inventory, hotbar, and named homes', () => {
  const username = `c_${Date.now()}`;
  const reg = registerAccount({
    username,
    password: 'savepassword123',
  });
  assert.ok(reg.account);

  const payload = {
    playerState: {
      x: 250.5,
      y: 120.0,
      health: 85,
      maxHealth: 100,
      food: 90,
      maxFood: 100,
      stamina: 75,
      maxStamina: 100,
      isAlive: true,
      seed: 932248,
      facingRight: false,
    },
    inventory: {
      counts: { wood: 32, iron: 5 },
      hotbarTypes: ['sword', 'wood', null, null, null, null, null, null],
      inventoryTypes: Array(49).fill(null),
    },
    hotbar: {
      slots: [{ type: 'sword', count: 1 }, { type: 'wood', count: 32 }],
      activeSlot: 1,
    },
    namedHomes: [
      { id: 'home-1', name: 'Main Fortress', x: 250, y: 120, seed: 932248 },
    ],
    stats: {
      totalPlaytimeSec: 1200,
      blocksPlaced: 45,
      blocksMined: 60,
      kills: 3,
      deaths: 0,
    },
  };

  const saveRes = savePlayerCloudProgress(reg.account.id, payload);
  assert.equal(saveRes.success, true);
  assert.equal(saveRes.saveVersion, 1);

  // Load from disk
  const loaded = loadPlayerCloudProgress(reg.account.id);
  assert.ok(loaded);
  assert.equal(loaded?.playerState.health, 85);
  assert.equal(loaded?.inventory.counts.wood, 32);
  assert.equal(loaded?.namedHomes.length, 1);
  assert.equal(loaded?.namedHomes[0].name, 'Main Fortress');

  // Optimistic locking conflict rejection
  const conflictRes = savePlayerCloudProgress(reg.account.id, payload, 0); // expectedVersion 0 < saveVersion 1
  assert.equal(conflictRes.success, false);
  assert.ok(conflictRes.error?.includes('Conflict'));
});

test('HTTP API: versioned endpoints /api/v1/auth/* and /api/v1/player/*', async () => {
  const app = express();
  setupAuthRoutes(app);

  const httpServer = createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Register via /api/v1/auth/register
    const username = `h_${Date.now()}`;
    const regRes = await fetch(`${baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password: 'testpassword123',
      }),
    });
    assert.equal(regRes.status, 201);
    const regData = (await regRes.json()) as any;
    assert.equal(regData.ok, true);
    assert.ok(regData.token);
    assert.equal(regData.user.username, username);
    const token = regData.token;

    // 2. Fetch /api/v1/auth/me
    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(meRes.status, 200);
    const meData = (await meRes.json()) as any;
    assert.equal(meData.ok, true);
    assert.equal(meData.user.username, username);

    // 3. Save player cloud progress via /api/v1/player/save
    const saveRes = await fetch(`${baseUrl}/api/v1/player/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        playerState: { x: 100, y: 200, health: 95 },
        inventory: { counts: { stone: 20 } },
        namedHomes: [{ id: 'h1', name: 'Mine', x: 100, y: 200, seed: 123 }],
      }),
    });
    assert.equal(saveRes.status, 200);
    const saveData = (await saveRes.json()) as any;
    assert.equal(saveData.ok, true);
    assert.ok(saveData.saveVersion >= 1);

    // 4. Load player cloud progress via /api/v1/player/load
    const loadRes = await fetch(`${baseUrl}/api/v1/player/load`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(loadRes.status, 200);
    const loadData = (await loadRes.json()) as any;
    assert.equal(loadData.ok, true);
    assert.equal(loadData.save.playerState.health, 95);
    assert.equal(loadData.save.inventory.counts.stone, 20);

    // 5. Change password via /api/v1/auth/change-password
    const passRes = await fetch(`${baseUrl}/api/v1/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        currentPassword: 'testpassword123',
        newPassword: 'updatedpassword456',
      }),
    });
    assert.equal(passRes.status, 200);
    const passData = (await passRes.json()) as any;
    assert.equal(passData.ok, true);

    // 6. Login with new credentials via /api/v1/auth/login
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password: 'updatedpassword456',
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginData = (await loginRes.json()) as any;
    assert.equal(loginData.ok, true);
    assert.ok(loginData.token);

    // 7. Logout via /api/v1/auth/logout
    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(logoutRes.status, 200);

    // 8. Re-query /api/v1/auth/me should fail with 401
    const unauthRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.equal(unauthRes.status, 401);
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
