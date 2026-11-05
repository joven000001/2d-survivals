import assert from 'node:assert/strict';
import test from 'node:test';
import { BIOME_LIST, BiomeType } from '../src/game/biomes';
import { CHUNK_HEIGHT, CHUNK_WIDTH, TILE_SIZE } from '../src/game/constants';
import { GameEngine } from '../src/game/engine';
import { TileType } from '../src/game/types';
import { getBiomeTeleportFeedback } from '../src/game/teleportFeedback';

function makeEngine(biomeId: BiomeType, safeOnArrival = true) {
  const statusUpdates: string[] = [];
  const engine = Object.create(GameEngine.prototype) as any;
  engine.player = { x: 0, y: 0, width: 14, height: 26, vx: 0, vy: 0, coyoteTimer: 0, jumpBufferTimer: 0, isGrounded: false, wasGrounded: false, state: 'idle' };
  engine.camera = { x: 0, y: 0, targetX: 0, targetY: 0, width: 800, height: 600 };
  engine.teleportStatus = '';
  engine.pendingTeleport = null;
  engine.isSafePlayerPosition = () => safeOnArrival;
  engine.findSafeBiomePosition = () => ({ x: 100, y: 100 });
  engine.emitStats = () => statusUpdates.push(engine.teleportStatus);
  engine.chunkManager = {
    loadedChunks: new Map(),
    requestChunk: () => {},
    releaseChunk: () => {},
    processQueue: () => {},
    updatePlayerPosition: () => {},
    getTile: () => TileType.STONE,
    terrainGen: {
      getColumnBiome: () => ({ id: biomeId }),
      getSurfaceHeight: () => 10,
      getBiomeAt: () => ({ id: biomeId }),
      isCave: () => true,
    },
  };
  return { engine, statusUpdates };
}

const destinations: Array<[BiomeType, string]> = [
  ['FOREST', 'Forest'],
  ['DESERT', 'Desert'],
  ['OCEAN', 'Ocean'],
  ['CRYSTAL_CAVERNS', 'Crystal Caverns'],
];

test('biome teleports stay loading until the destination chunk arrives, then report arrival', () => {
  for (const [biomeId, name] of destinations) {
    assert.ok(BIOME_LIST.some((biome) => biome.id === biomeId), `${name} remains selectable`);
    const { engine, statusUpdates } = makeEngine(biomeId);
    assert.equal(engine.teleportToBiome(biomeId), true);
    assert.equal(engine.teleportStatus, `Preparing ${name}…`);
    assert.equal(getBiomeTeleportFeedback(engine.teleportStatus, name)?.message, `Teleporting to ${name}…`);

    const pending = engine.pendingTeleport;
    assert.ok(pending);
    assert.equal(engine.teleportToBiome(biomeId), false, 'a second biome request cannot replace an in-flight teleport');
    assert.equal(engine.pendingTeleport, pending);
    assert.equal(engine.teleportStatus, `Preparing ${name}…`, 'loading stays visible until actual completion');

    const chunkX = Math.floor(pending.x / TILE_SIZE / CHUNK_WIDTH);
    const chunkY = Math.floor(pending.y / TILE_SIZE / CHUNK_HEIGHT);
    engine.chunkManager.loadedChunks.set(`${chunkX},${chunkY}`, {});
    engine.tryCompletePendingTeleport();

    assert.equal(engine.teleportStatus, `Arrived at ${name}`);
    assert.equal(getBiomeTeleportFeedback(engine.teleportStatus, name), null, 'success hides the loading message after arrival');
    assert.ok(statusUpdates.includes(`Arrived at ${name}`));
  }
});

test('failed biome teleport reports friendly feedback after destination validation fails', () => {
  const [biomeId, name] = destinations[0];
  const { engine } = makeEngine(biomeId, false);
  assert.equal(engine.teleportToBiome(biomeId), true);
  const pending = engine.pendingTeleport;
  const chunkX = Math.floor(pending.x / TILE_SIZE / CHUNK_WIDTH);
  const chunkY = Math.floor(pending.y / TILE_SIZE / CHUNK_HEIGHT);
  engine.chunkManager.loadedChunks.set(`${chunkX},${chunkY}`, {});
  engine.tryCompletePendingTeleport();

  const feedback = getBiomeTeleportFeedback(engine.teleportStatus, name);
  assert.equal(feedback?.kind, 'error');
  assert.equal(feedback?.message, 'Teleport failed. Please try again.');
});
