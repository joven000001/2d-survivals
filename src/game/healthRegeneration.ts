export const HEALTH_REGEN_DELAY_MS = 10_000;
export const HEALTH_REGEN_INTERVAL_MS = 2_000;
export const HEALTH_REGEN_AMOUNT = 2;

export interface HealthRegenerationState {
  lifeId: number;
  lastDamageAt?: number;
  nextRegenAt?: number;
}

export function resetHealthRegeneration(state: HealthRegenerationState, lifeId: number): void {
  state.lifeId = lifeId;
  state.lastDamageAt = undefined;
  state.nextRegenAt = undefined;
}

export function recordHealthDamage(state: HealthRegenerationState, lifeId: number, now: number): void {
  if (lifeId !== state.lifeId) return;
  state.lastDamageAt = now;
  state.nextRegenAt = now + HEALTH_REGEN_DELAY_MS;
}

export function regenerateHealth(state: HealthRegenerationState, health: number, maxHealth: number, isAlive: boolean, lifeId: number, now: number): number {
  if (!isAlive || lifeId !== state.lifeId || state.nextRegenAt === undefined || now < state.nextRegenAt || health >= maxHealth) return health;
  const nextHealth = Math.min(maxHealth, health + HEALTH_REGEN_AMOUNT);
  state.nextRegenAt = nextHealth < maxHealth ? now + HEALTH_REGEN_INTERVAL_MS : undefined;
  return nextHealth;
}
