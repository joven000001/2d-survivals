import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { connectedGameplaySeconds, DAILY_PERIOD_MS, LeaderboardStore } from '../server/leaderboards';

test('daily and forever stats rank, persist, and roll over independently', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-frontier-leaderboards-'));
  const file = path.join(dir, 'scores.json');
  try {
    const day = Date.UTC(2026, 0, 5);
    const store = new LeaderboardStore(file, day + 1);
    store.registerPlayer('p-a', 'Alpha', day + 1);
    store.registerPlayer('p-b', 'Beta', day + 1);
    assert.equal(store.get('p-a', day + 2).daily.animals[0].score, 0);
    store.addScoreOnce('p-a', 'Alpha', 'animals', 'animal:world:1', day + 10);
    assert.equal(store.addScoreOnce('p-a', 'Alpha', 'animals', 'animal:world:1', day + 11), false);
    store.addScoreOnce('p-b', 'Beta', 'animals', 'animal:world:2', day + 12);
    store.addScoreOnce('p-a', 'Alpha', 'players', 'pvp:a:b:0', day + 13);
    store.addScore('p-a', 'Alpha', 'time', 90, day + 14);
    const playedSeconds = connectedGameplaySeconds(1_000, 91_000);
    assert.equal(playedSeconds, 90);
    store.addScore('p-a', 'Alpha', 'time', playedSeconds, day + 15);
    assert.equal(connectedGameplaySeconds(91_000, 90_000), 0);
    const beforeReset = store.get('p-a', day + 20);
    assert.deepEqual(beforeReset.daily.animals.map((row) => row.playerId), ['p-a', 'p-b']);
    assert.equal(beforeReset.daily.players[0].score, 1);
    assert.equal(beforeReset.daily.time[0].score, 180);

    const reloaded = new LeaderboardStore(file, day + 21);
    assert.equal(reloaded.get('p-a', day + 22).forever.animals[0].score, 1);
    const nextDay = reloaded.get('p-a', day + DAILY_PERIOD_MS + 1);
    assert.equal(nextDay.daily.animals.length, 0);
    assert.equal(nextDay.forever.animals[0].score, 1);
    assert.equal(nextDay.forever.time[0].score, 180);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
