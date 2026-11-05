export type NamedHome = { id: string; name: string; x: number; y: number; seed: number };

function storageKey(seed: number) {
  return `pixel_frontier_homes_${seed}`;
}

function createHomeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `home-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function loadNamedHomes(seed: number): NamedHome[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(seed)) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    let migrated = false;
    const seenIds = new Set<string>();
    const homes = parsed.filter((home): home is Record<string, unknown> => !!home && typeof home === 'object')
      .filter((home) => typeof home.name === 'string' && Number.isFinite(home.x) && Number.isFinite(home.y) && home.seed === seed)
      .slice(0, 3)
      .map((home) => {
        if (typeof home.id === 'string' && home.id.length > 0 && !seenIds.has(home.id)) {
          seenIds.add(home.id);
          return { id: home.id, name: home.name as string, x: home.x as number, y: home.y as number, seed };
        }
        migrated = true;
        let id = createHomeId();
        while (seenIds.has(id)) id = createHomeId();
        seenIds.add(id);
        return { id, name: home.name as string, x: home.x as number, y: home.y as number, seed };
      });
    if (migrated) window.localStorage.setItem(storageKey(seed), JSON.stringify(homes));
    return homes;
  } catch {
    return [];
  }
}

export function saveNamedHomes(seed: number, homes: NamedHome[]): boolean {
  try {
    window.localStorage.setItem(storageKey(seed), JSON.stringify(homes));
    return true;
  } catch {
    return false;
  }
}

export function deleteNamedHome(seed: number, id: string): NamedHome[] | null {
  const homes = loadNamedHomes(seed);
  if (!homes.some((home) => home.id === id)) return null;
  const remaining = homes.filter((home) => home.id !== id);
  return saveNamedHomes(seed, remaining) ? remaining : null;
}

export function createNamedHomeId(): string {
  return createHomeId();
}
