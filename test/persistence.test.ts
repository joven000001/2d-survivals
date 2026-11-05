import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mock, test } from 'node:test';
import { getPersistenceDataDir, loadWorldData, safeWriteJson, saveWorldData } from '../server/persistence';

test('saveWorldData retries after Windows rename EPERM and preserves the newest state', () => {
  const worldKey = `persist-win-rename-${Date.now()}`;
  const worldDir = path.join(getPersistenceDataDir(), worldKey.replace(/[^a-z0-9_-]/gi, '_').toLowerCase());
  const worldFile = path.join(worldDir, 'world.json');

  fs.mkdirSync(worldDir, { recursive: true });
  const original = fs.renameSync;
  let failFirstRename = true;

  try {
    fs.writeFileSync(worldFile, JSON.stringify({
      id: 'old',
      name: 'old-world',
      seed: 1,
      createdAt: 1,
      activeTimeElapsedSec: 0,
      blockModifications: [],
      killedWildlifeIds: [],
      drops: [],
      nextDropId: 1,
      lastSavedAt: 10,
    }, null, 2), 'utf8');

    const renameSpy = mock.method(fs, 'renameSync', (from: string, to: string) => {
      if (failFirstRename && path.basename(to) === 'world.json' && path.basename(from).includes('.tmp.')) {
        failFirstRename = false;
        const err = new Error('EPERM: operation not permitted');
        (err as NodeJS.ErrnoException).code = 'EPERM';
        throw err;
      }
      return original.call(fs, from, to);
    });

    const newData = {
      id: 'new',
      name: 'new-world',
      seed: 2,
      createdAt: 2,
      activeTimeElapsedSec: 0,
      blockModifications: [],
      killedWildlifeIds: [],
      drops: [],
      nextDropId: 2,
      lastSavedAt: 20,
    };

    saveWorldData(worldKey, newData as any);

    const saved = loadWorldData(worldKey);
    assert.ok(saved, 'world data should still be readable after the retry');
    assert.equal(saved?.id, 'new');
    assert.equal(saved?.lastSavedAt, 20);
    assert.equal(saved?.seed, 2);

    renameSpy.mock.restore();
  } finally {
    if (fs.existsSync(worldDir)) {
      fs.rmSync(worldDir, { recursive: true, force: true });
    }
    mock.restoreAll();
  }
});

test('failed Windows replacement keeps the prior world snapshot readable', () => {
  const worldKey = `persist-win-failed-replace-${Date.now()}`;
  const worldDir = path.join(getPersistenceDataDir(), worldKey.replace(/[^a-z0-9_-]/gi, '_').toLowerCase());
  const worldFile = path.join(worldDir, 'world.json');
  fs.mkdirSync(worldDir, { recursive: true });
  const original = fs.renameSync;
  let targetRenameCount = 0;
  try {
    fs.writeFileSync(worldFile, JSON.stringify({ id: 'kept', name: 'kept', seed: 31 }), 'utf8');
    const renameSpy = mock.method(fs, 'renameSync', (from: string, to: string) => {
      if (to === worldFile) {
        targetRenameCount++;
        const err = new Error('EPERM: operation not permitted') as NodeJS.ErrnoException;
        err.code = 'EPERM';
        throw err;
      }
      return original.call(fs, from, to);
    });

    assert.throws(() => safeWriteJson(worldFile, { id: 'replacement', seed: 32 }), /EPERM/);

    assert.equal(targetRenameCount, 2, 'replacement should retry once after moving the old snapshot aside');
    assert.deepEqual(JSON.parse(fs.readFileSync(worldFile, 'utf8')), { id: 'kept', name: 'kept', seed: 31 });
    assert.equal(fs.readdirSync(worldDir).some((name) => name.startsWith('world.json.bak.')), false,
      'successful rollback should restore the original filename');
    renameSpy.mock.restore();
  } finally {
    if (fs.existsSync(worldDir)) fs.rmSync(worldDir, { recursive: true, force: true });
    mock.restoreAll();
  }
});

test('persistence root can target a mounted directory without changing the default path', () => {
  const oldValue = process.env.PIXEL_FRONTIER_DATA_DIR;
  try {
    process.env.PIXEL_FRONTIER_DATA_DIR = path.join('mounted', 'pixel-frontier');
    assert.equal(getPersistenceDataDir(), path.resolve('mounted', 'pixel-frontier'));
    delete process.env.PIXEL_FRONTIER_DATA_DIR;
    assert.equal(getPersistenceDataDir(), path.resolve(process.cwd(), 'data', 'multiplayer'));
  } finally {
    if (oldValue === undefined) delete process.env.PIXEL_FRONTIER_DATA_DIR;
    else process.env.PIXEL_FRONTIER_DATA_DIR = oldValue;
  }
});

test('world loader recovers the last good snapshot after an interrupted replacement', () => {
  const worldKey = `persist-recover-backup-${Date.now()}`;
  const worldDir = path.join(getPersistenceDataDir(), worldKey.replace(/[^a-z0-9_-]/gi, '_').toLowerCase());
  const backupFile = path.join(worldDir, 'world.json.bak.recovery');
  fs.mkdirSync(worldDir, { recursive: true });
  try {
    fs.writeFileSync(backupFile, JSON.stringify({ id: worldKey, name: 'recovered', seed: 41 }), 'utf8');
    const recovered = loadWorldData(worldKey);
    assert.equal(recovered?.id, worldKey);
    assert.equal(recovered?.seed, 41);
    assert.equal(fs.existsSync(backupFile), true, 'recovery reads should not remove saved data');
  } finally {
    if (fs.existsSync(worldDir)) fs.rmSync(worldDir, { recursive: true, force: true });
  }
});
