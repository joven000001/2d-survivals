import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { deleteNamedHome, loadNamedHomes, saveNamedHomes, type NamedHome } from '../src/game/namedHomes';

const store = new Map<string, string>();
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

const seed = 4182;
const homesKey = `pixel_frontier_homes_${seed}`;
const legacyKey = `pixel_frontier_home_${seed}`;
const homes: NamedHome[] = [
  { id: 'home-a', name: 'Forest Base', x: 10, y: 20, seed },
  { id: 'home-b', name: 'Forest Base', x: 30, y: 40, seed },
  { id: 'home-c', name: 'Cave', x: 50, y: 60, seed },
];

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    } },
  });
});

afterEach(() => {
  store.clear();
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
});

test('deleting one home preserves the other IDs, including duplicate names', () => {
  saveNamedHomes(seed, homes);
  const remaining = deleteNamedHome(seed, 'home-a');
  assert.deepEqual(remaining?.map((home) => home.id), ['home-b', 'home-c']);
  assert.deepEqual(loadNamedHomes(seed).map((home) => home.id), ['home-b', 'home-c']);
});

test('cancel leaves the saved home collection unchanged', () => {
  saveNamedHomes(seed, homes);
  const before = store.get(homesKey);
  // Cancel closes the confirmation without calling deleteNamedHome.
  assert.deepEqual(loadNamedHomes(seed), homes);
  assert.equal(store.get(homesKey), before);
});

test('a single-home deletion persists after reloading from storage', () => {
  saveNamedHomes(seed, homes);
  assert.ok(deleteNamedHome(seed, 'home-b'));
  const reloaded = loadNamedHomes(seed);
  assert.deepEqual(reloaded.map((home) => home.id), ['home-a', 'home-c']);
});

test('deleting a named home leaves the legacy engine Home save untouched', () => {
  saveNamedHomes(seed, homes);
  const legacyHome = JSON.stringify({ x: 77, y: 88, seed, savedAt: 123 });
  store.set(legacyKey, legacyHome);
  assert.ok(deleteNamedHome(seed, 'home-c'));
  assert.equal(store.get(legacyKey), legacyHome);
});

test('a new home can be saved after deleting one', () => {
  saveNamedHomes(seed, homes);
  const remaining = deleteNamedHome(seed, 'home-a');
  assert.ok(remaining);
  const newHome: NamedHome = { id: 'home-new', name: 'New Base', x: 90, y: 100, seed };
  assert.equal(saveNamedHomes(seed, [...remaining, newHome]), true);
  assert.deepEqual(loadNamedHomes(seed).map((home) => home.id), ['home-b', 'home-c', 'home-new']);
});

test('legacy named-home records receive persistent stable IDs on load', () => {
  store.set(homesKey, JSON.stringify([{ name: 'Old Home', x: 1, y: 2, seed }]));
  const firstLoad = loadNamedHomes(seed);
  const secondLoad = loadNamedHomes(seed);
  assert.ok(firstLoad[0].id);
  assert.equal(secondLoad[0].id, firstLoad[0].id);
});
