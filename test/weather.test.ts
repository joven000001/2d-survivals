import assert from 'node:assert/strict';
import test from 'node:test';
import { getWorldWeather } from '../src/game/renderer';
import { isPlayerExposedToWeather, isPlayerNearHeatSource, updatePlayerPhysics } from '../src/game/physics';
import { Player, TileType } from '../src/game/types';
import { TILE_SIZE, MOVE_SPEED, PLAYER_WIDTH, PLAYER_HEIGHT } from '../src/game/constants';

function makeMockPlayer(partial: Partial<Player> = {}): Player {
  return {
    x: 100,
    y: 100,
    vx: 0,
    vy: 0,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    isGrounded: true,
    wasGrounded: true,
    facingRight: true,
    animFrame: 0,
    animTimer: 0,
    coyoteTimer: 0.1,
    jumpBufferTimer: 0,
    state: 'idle',
    health: 100,
    maxHealth: 100,
    food: 100,
    maxFood: 100,
    stamina: 100,
    maxStamina: 100,
    isSprinting: false,
    invulnerableTimer: 0,
    flashTimer: 0,
    isAttacking: false,
    attackTimer: 0,
    attackCooldown: 0,
    ...partial,
  };
}

function makeMockChunkManager(tileMap: Map<string, TileType> = new Map(), surfaceY = 20) {
  return {
    getTile(x: number, y: number): TileType {
      return tileMap.get(`${x},${y}`) ?? TileType.AIR;
    },
    terrainGen: {
      getSurfaceHeight(_x: number): number {
        return surfaceY;
      },
      getColumnBiome(_x: number) {
        return { id: 'plains', name: 'Plains' };
      },
    },
  } as any;
}

test('Weather System: getWorldWeather outputs correct biome-specific weather', () => {
  // Test across multiple slots and seeds to verify deterministic rain and snow distribution
  let seenRain = false;
  let seenSnowInColdBiome = false;

  for (let slot = 0; slot < 24; slot++) {
    const time = (slot % 6) / 6 + 0.08;
    const day = Math.floor(slot / 6) + 1;
    const weatherPlains = getWorldWeather(day, time, 12345, 'Plains');
    const weatherSnowBiome = getWorldWeather(day, time, 12345, 'Snow Plains');

    if (weatherPlains.type === 'rain') {
      seenRain = true;
      assert.ok(weatherPlains.intensity > 0, 'Rain should have positive intensity');
      assert.equal(weatherPlains.label, 'Rain');
      assert.equal(weatherPlains.icon, '🌧️');
    }

    if (weatherSnowBiome.type === 'snow') {
      seenSnowInColdBiome = true;
      assert.ok(weatherSnowBiome.intensity > 0, 'Snow should have positive intensity');
      assert.equal(weatherSnowBiome.label, 'Snowfall');
      assert.equal(weatherSnowBiome.icon, '❄️');
    }

    // In a cold biome, any precipitation must be snow, never rain
    if (weatherSnowBiome.type !== 'clear' && weatherSnowBiome.type !== 'wind') {
      assert.equal(weatherSnowBiome.type, 'snow', 'Precipitation in cold biome must be snow');
    }
  }

  assert.ok(seenRain, 'Should encounter occasional rain events in temperate biomes');
  assert.ok(seenSnowInColdBiome, 'Should encounter occasional snow events in cold biomes');
});

test('Weather System: player weather exposure and shelter detection', () => {
  const surfaceY = 20;
  const chunkManager = makeMockChunkManager(new Map(), surfaceY);

  // Surface player with open sky
  const surfacePlayer = makeMockPlayer({
    x: 10 * TILE_SIZE,
    y: (surfaceY - 2) * TILE_SIZE,
  });
  assert.equal(
    isPlayerExposedToWeather(surfacePlayer, chunkManager),
    true,
    'Player on surface with open sky should be exposed to weather'
  );

  // Player with a solid stone ceiling above them
  const tilesWithRoof = new Map<string, TileType>();
  tilesWithRoof.set('10,16', TileType.STONE);
  tilesWithRoof.set('11,16', TileType.STONE);
  const shelteredChunkManager = makeMockChunkManager(tilesWithRoof, surfaceY);
  assert.equal(
    isPlayerExposedToWeather(surfacePlayer, shelteredChunkManager),
    false,
    'Player under solid roof should not be exposed to weather'
  );

  // Player deep in a cavern
  const deepCavePlayer = makeMockPlayer({
    x: 10 * TILE_SIZE,
    y: (surfaceY + 15) * TILE_SIZE,
  });
  assert.equal(
    isPlayerExposedToWeather(deepCavePlayer, chunkManager),
    false,
    'Player deep underground should not be exposed to surface weather'
  );
});

test('Weather System: campfire warmth detection', () => {
  const tiles = new Map<string, TileType>();
  tiles.set('12,18', TileType.CAMPFIRE);
  const chunkManager = makeMockChunkManager(tiles, 20);

  const nearPlayer = makeMockPlayer({
    x: 10 * TILE_SIZE,
    y: 18 * TILE_SIZE,
  });
  assert.equal(
    isPlayerNearHeatSource(nearPlayer, chunkManager, 5),
    true,
    'Player near campfire should detect heat source'
  );

  const farPlayer = makeMockPlayer({
    x: 30 * TILE_SIZE,
    y: 18 * TILE_SIZE,
  });
  assert.equal(
    isPlayerNearHeatSource(farPlayer, chunkManager, 5),
    false,
    'Player far from campfire should not detect heat source'
  );
});

test('Weather System: movement speed impacts during rain and snow events', () => {
  const chunkManager = makeMockChunkManager(new Map(), 20);
  const input = { left: false, right: true, up: false, down: false, jump: false, jumpJustPressed: false };
  const dt = 0.5;

  // 1. Clear weather baseline run
  const clearPlayer = makeMockPlayer({ x: 10 * TILE_SIZE, y: 18 * TILE_SIZE });
  for (let i = 0; i < 20; i++) {
    updatePlayerPhysics(clearPlayer, chunkManager, input, dt, 'clear', 0, false);
  }
  const clearSpeed = clearPlayer.vx;
  assert.ok(Math.abs(clearSpeed - MOVE_SPEED) < 2, `Clear speed should approach max MOVE_SPEED (${MOVE_SPEED}), got ${clearSpeed}`);

  // 2. Rain weather: movement speed reduced by ~16%
  const rainPlayer = makeMockPlayer({ x: 10 * TILE_SIZE, y: 18 * TILE_SIZE });
  for (let i = 0; i < 20; i++) {
    updatePlayerPhysics(rainPlayer, chunkManager, input, dt, 'rain', 1.0, true);
  }
  const rainSpeed = rainPlayer.vx;
  assert.ok(rainSpeed < clearSpeed * 0.90, `Rain should reduce movement speed, got ${rainSpeed} vs clear ${clearSpeed}`);
  const expectedRainMax = MOVE_SPEED * (1 - 0.16);
  assert.ok(Math.abs(rainSpeed - expectedRainMax) < 3, `Rain speed should match ~16% reduction, got ${rainSpeed}`);

  // 3. Amphibious buff negates rain slowdown
  const amphibiousPlayer = makeMockPlayer({
    x: 10 * TILE_SIZE,
    y: 18 * TILE_SIZE,
    activeBuffs: [{ id: 'amphibious', name: 'Amphibious', icon: '🌊', description: 'Swim master', remainingSec: 30, durationSec: 30, color: '#10b981' }],
  });
  for (let i = 0; i < 20; i++) {
    updatePlayerPhysics(amphibiousPlayer, chunkManager, input, dt, 'rain', 1.0, true);
  }
  assert.ok(amphibiousPlayer.vx >= clearSpeed * 0.98, 'Amphibious buff should negate rain movement penalty');

  // 4. Snow weather: movement speed reduced by ~22%
  const snowPlayer = makeMockPlayer({ x: 10 * TILE_SIZE, y: 18 * TILE_SIZE });
  for (let i = 0; i < 20; i++) {
    updatePlayerPhysics(snowPlayer, chunkManager, input, dt, 'snow', 1.0, true);
  }
  const snowSpeed = snowPlayer.vx;
  assert.ok(snowSpeed < clearSpeed * 0.82, `Snow should reduce movement speed by ~22%, got ${snowSpeed} vs clear ${clearSpeed}`);
  const expectedSnowMax = MOVE_SPEED * (1 - 0.22);
  assert.ok(Math.abs(snowSpeed - expectedSnowMax) < 3, `Snow speed should match ~22% reduction, got ${snowSpeed}`);

  // 5. When sheltered under a roof, weather penalties are not applied
  const shelteredPlayer = makeMockPlayer({ x: 10 * TILE_SIZE, y: 18 * TILE_SIZE });
  for (let i = 0; i < 20; i++) {
    updatePlayerPhysics(shelteredPlayer, chunkManager, input, dt, 'snow', 1.0, false);
  }
  assert.ok(Math.abs(shelteredPlayer.vx - clearSpeed) < 2, 'Sheltered player should maintain full clear movement speed');
});
