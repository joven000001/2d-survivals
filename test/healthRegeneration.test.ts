import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HEALTH_REGEN_AMOUNT,
  HEALTH_REGEN_DELAY_MS,
  HEALTH_REGEN_INTERVAL_MS,
  recordHealthDamage,
  regenerateHealth,
  resetHealthRegeneration,
  type HealthRegenerationState,
} from '../src/game/healthRegeneration';

test('server regeneration waits, heals in steps, and caps at max health', () => {
  const state: HealthRegenerationState = { lifeId: 4 };
  recordHealthDamage(state, 4, 1_000);
  assert.equal(regenerateHealth(state, 70, 100, true, 4, 1_000 + HEALTH_REGEN_DELAY_MS - 1), 70);
  assert.equal(regenerateHealth(state, 70, 100, true, 4, 1_000 + HEALTH_REGEN_DELAY_MS), 72);
  assert.equal(regenerateHealth(state, 72, 100, true, 4, 1_000 + HEALTH_REGEN_DELAY_MS + HEALTH_REGEN_INTERVAL_MS - 1), 72);
  assert.equal(regenerateHealth(state, 99, 100, true, 4, 1_000 + HEALTH_REGEN_DELAY_MS + HEALTH_REGEN_INTERVAL_MS), 100);
  assert.equal(state.nextRegenAt, undefined);
  assert.equal(HEALTH_REGEN_AMOUNT, 2);
});

test('new damage restarts delay; dead and previous-life states cannot regenerate', () => {
  const state: HealthRegenerationState = { lifeId: 7 };
  recordHealthDamage(state, 7, 2_000);
  recordHealthDamage(state, 7, 8_000);
  assert.equal(regenerateHealth(state, 50, 100, true, 7, 17_999), 50);
  assert.equal(regenerateHealth(state, 50, 100, true, 7, 18_000), 52);
  assert.equal(regenerateHealth(state, 0, 100, false, 7, 30_000), 0);
  resetHealthRegeneration(state, 8);
  assert.equal(regenerateHealth(state, 50, 100, true, 7, 30_000), 50);
  assert.equal(regenerateHealth(state, 50, 100, true, 8, 30_000), 50);
  recordHealthDamage(state, 7, 31_000);
  assert.equal(state.lastDamageAt, undefined);
});
