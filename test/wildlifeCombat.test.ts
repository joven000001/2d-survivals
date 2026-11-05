import assert from 'node:assert/strict';
import test from 'node:test';
import { WildlifeAnimal, WildlifeManager } from '../src/game/wildlife';
import { PLAYER_HEIGHT, PLAYER_WIDTH } from '../src/game/constants';
import { Player, TileType } from '../src/game/types';
import { clearServerWildlifeTargeting, isValidServerWildlifeTarget } from '../server/index';

function makePlayer(partial: Partial<Player> = {}): Player {
  return {
    x: 10, y: 100, vx: 0, vy: 0,
    width: PLAYER_WIDTH, height: PLAYER_HEIGHT,
    isGrounded: true, wasGrounded: true, facingRight: true,
    animFrame: 0, animTimer: 0, coyoteTimer: 0, jumpBufferTimer: 0,
    state: 'idle', health: 24, maxHealth: 100, food: 100, maxFood: 100,
    stamina: 100, maxStamina: 100, isSprinting: false,
    invulnerableTimer: 0, flashTimer: 0, isAttacking: false,
    attackTimer: 0, attackCooldown: 0,
    ...partial,
  };
}

function makeLion(id: string, x: number, y: number): WildlifeAnimal {
  return {
    id, species: 'lion', biome: 'PLAINS', ownerChunkX: 0, ownerChunkY: 0,
    x, y, width: 42, height: 30, direction: 1, state: 'wander',
    stateTimer: 1, animTimer: 0, randomState: 1, homeX: x, homeY: y,
    health: 105, maxHealth: 105, hurtTimer: 0, attackCooldown: 0,
  };
}

test('animal combat clears the dead player target and allows a new nearby attacker', () => {
  const manager = new WildlifeManager();
  const oldLion = makeLion('old-lion', 0, 100);
  oldLion.isEnraged = true;
  oldLion.enragedTimer = 20;
  manager.animals.push(oldLion);
  const player = makePlayer();
  const chunks = {
    getTile: () => TileType.AIR,
    terrainGen: {
      getSurfaceHeight: () => 10,
      getColumnBiome: () => ({ id: 'PLAINS' }),
    },
  } as any;
  let damageEvents = 0;
  const damagePlayer = (damage: number) => {
    damageEvents++;
    player.health = Math.max(0, player.health - damage);
  };
  const updateAnimal = (animal: WildlifeAnimal) =>
    (manager as any).updateAnimal(animal, 0.05, chunks, player, damagePlayer);

  // Aggressive lion gets in range and kills the player.
  updateAnimal(oldLion);
  assert.equal(player.health, 0);
  assert.equal(damageEvents, 1);
  assert.equal(oldLion.state, 'attack');

  // Death immediately drops all active animal attack state.
  manager.clearCombatState();
  assert.equal(oldLion.state, 'idle');
  assert.equal(oldLion.attackCooldown, 0);
  assert.equal(oldLion.isEnraged, true);
  assert.equal(oldLion.targetPlayerId, undefined);

  // Respawn far away: the old lion cannot deliver another hit or reacquire
  // the player using the old combat state.
  player.health = 100;
  player.x = 10_000;
  for (let i = 0; i < 20; i++) updateAnimal(oldLion);
  assert.equal(player.health, 100);
  assert.equal(damageEvents, 1);

  // The same lion can acquire the respawned player as a new target.
  player.x = 10;
  updateAnimal(oldLion);
  assert.equal(oldLion.state, 'attack');
  assert.equal(player.health, 70);
  assert.equal(damageEvents, 2);

  // Player attacks still damage animals after the respawn lifecycle.
  const oldAnimalHealth = oldLion.health;
  const hitAnimal = manager.handleSwordAttack(
    { x: oldLion.x, y: oldLion.y, width: oldLion.width, height: oldLion.height },
    20,
    { spawnDrop: () => {} } as any,
    { addDamageNumber: () => {} } as any,
    chunks
  );
  assert.equal(hitAnimal, true);
  assert.equal(oldLion.health, oldAnimalHealth - 20);

  // Once beyond an enraged lion's chase range, it drops the old target and
  // stops attacking. Its aggression remains available for a future target.
  oldLion.isEnraged = true;
  oldLion.state = 'attack';
  oldLion.attackCooldown = 0.5;
  player.x = 10_000;
  updateAnimal(oldLion);
  assert.equal(oldLion.state, 'idle');
  assert.equal(oldLion.attackCooldown, 0);
  assert.equal(oldLion.isEnraged, true);
  assert.equal(player.health, 70);
  assert.equal(damageEvents, 2);

  // Multiplayer server cleanup also clears a matching active or dormant
  // predator and its pending cooldown when its target dies.
  const serverLion = {
    id: 'server-lion', state: 'attack', stateTimer: 0, attackCooldown: 0.8,
    targetPlayerId: 'dead-player', targetLifeId: 4, isAlive: true, health: 100,
  };
  const dormantLion = {
    id: 'dormant-lion', state: 'chase', stateTimer: 0, attackCooldown: 0.4,
    targetPlayerId: 'dead-player',
  };
  clearServerWildlifeTargeting({
    players: new Set(),
    wildlife: new Map([['server-lion', serverLion]]),
    dormantWildlife: new Map([['dormant-lion', dormantLion]]),
  } as any, 'dead-player');
  for (const lion of [serverLion, dormantLion]) {
    assert.equal(lion.targetPlayerId, undefined);
    assert.equal(lion.state, 'idle');
    assert.equal(lion.attackCooldown, 0);
  }

  // A delayed/queued hit still carrying the previous life cannot be applied
  // to the same stable player id after respawn; removal also invalidates it.
  const previousLifeAttack = {
    ...serverLion, targetPlayerId: 'same-player', targetLifeId: 4,
    state: 'attack', isAlive: true, health: 105,
  };
  const respawnedPlayer = { playerId: 'same-player', lifeId: 5, isAlive: true, health: 100 };
  assert.equal(isValidServerWildlifeTarget(previousLifeAttack as any, respawnedPlayer, previousLifeAttack as any), false);
  previousLifeAttack.targetLifeId = 5;
  assert.equal(isValidServerWildlifeTarget(previousLifeAttack as any, respawnedPlayer, previousLifeAttack as any), true);
  assert.equal(isValidServerWildlifeTarget(previousLifeAttack as any, respawnedPlayer, undefined), false);
});

test('clearing one player life leaves other animal encounters enabled', () => {
  const manager = new WildlifeManager();
  const first = makeLion('first', 0, 100);
  const second = makeLion('second', 0, 100);
  first.state = 'attack';
  first.targetPlayerId = 'player-one';
  first.attackCooldown = 0.7;
  second.state = 'attack';
  second.targetPlayerId = 'player-two';
  second.attackCooldown = 0.6;
  manager.animals.push(first, second);

  manager.clearCombatState('player-one');

  assert.equal(first.state, 'idle');
  assert.equal(first.targetPlayerId, undefined);
  assert.equal(first.attackCooldown, 0);
  assert.equal(second.state, 'attack');
  assert.equal(second.targetPlayerId, 'player-two');
  assert.equal(second.attackCooldown, 0.6);
});
