import fs from 'node:fs';
import path from 'node:path';
import { getPersistenceDataDir, safeWriteJson } from './persistence';

export const DAILY_PERIOD_MS = 24 * 60 * 60 * 1000;
export type LeaderMetric = 'animals' | 'players' | 'time';
type Scores = Record<LeaderMetric, number>;
type Entry = { playerId: string; name: string; scores: Scores };
type Store = { periodStart: number; daily: Record<string, Entry>; forever: Record<string, Entry>; processedEvents?: string[] };
const STORE_PATH = path.join(getPersistenceDataDir(), 'leaderboards.json');
const emptyScores = (): Scores => ({ animals: 0, players: 0, time: 0 });
const utcDayStart = (now: number): number => Math.floor(now / DAILY_PERIOD_MS) * DAILY_PERIOD_MS;
export const connectedGameplaySeconds = (startedAt: number, now: number): number => Math.max(0, Math.floor((now - startedAt) / 1000));

export class LeaderboardStore {
  private data: Store;

  constructor(private readonly filePath: string, now = Date.now()) {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<Store>;
      this.data = { periodStart: typeof parsed.periodStart === 'number' ? parsed.periodStart : utcDayStart(now), daily: parsed.daily ?? {}, forever: parsed.forever ?? {}, processedEvents: parsed.processedEvents ?? [] };
    } catch {
      this.data = { periodStart: utcDayStart(now), daily: {}, forever: {}, processedEvents: [] };
    }
    this.rollDailyPeriod(now);
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    safeWriteJson(this.filePath, this.data);
  }

  rollDailyPeriod(now = Date.now()): void {
    const start = utcDayStart(now);
    if (start !== this.data.periodStart) {
      this.data.periodStart = start;
      this.data.daily = {};
      this.save();
    }
  }

  private record(table: Record<string, Entry>, id: string, name: string): Entry {
    return table[id] ?? (table[id] = { playerId: id, name: name || id, scores: emptyScores() });
  }

  registerPlayer(id: string, name: string, now = Date.now()): void {
    this.rollDailyPeriod(now);
    for (const table of [this.data.daily, this.data.forever]) this.record(table, id, name).name = name || id;
    this.save();
  }

  addScore(id: string, name: string, metric: LeaderMetric, amount: number, now = Date.now()): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.rollDailyPeriod(now);
    for (const table of [this.data.daily, this.data.forever]) {
      const entry = this.record(table, id, name);
      entry.name = name || entry.name;
      entry.scores[metric] += amount;
    }
    this.save();
  }

  addScoreOnce(id: string, name: string, metric: LeaderMetric, eventId: string, now = Date.now()): boolean {
    const processed = this.data.processedEvents ?? (this.data.processedEvents = []);
    if (!eventId || processed.includes(eventId)) return false;
    processed.push(eventId);
    this.addScore(id, name, metric, 1, now);
    return true;
  }

  get(id?: string, now = Date.now()) {
    this.rollDailyPeriod(now);
    const sort = (table: Record<string, Entry>, metric: LeaderMetric) => Object.values(table)
      .sort((a, b) => b.scores[metric] - a.scores[metric] || a.name.localeCompare(b.name) || a.playerId.localeCompare(b.playerId))
      .map((entry, index) => ({ rank: index + 1, playerId: entry.playerId, name: entry.name, score: entry.scores[metric] }));
    const metrics: LeaderMetric[] = ['animals', 'time', 'players'];
    const daily = Object.fromEntries(metrics.map((metric) => [metric, sort(this.data.daily, metric)]));
    const forever = Object.fromEntries(metrics.map((metric) => [metric, sort(this.data.forever, metric)]));
    const own = (table: Record<string, Entry>, metric: LeaderMetric) => id ? sort(table, metric).find((entry) => entry.playerId === id) ?? null : null;
    return {
      daily, forever,
      yourDaily: Object.fromEntries(metrics.map((metric) => [metric, own(this.data.daily, metric)])),
      yourForever: Object.fromEntries(metrics.map((metric) => [metric, own(this.data.forever, metric)])),
      dailyPeriodStart: this.data.periodStart,
      dailyResetsAt: this.data.periodStart + DAILY_PERIOD_MS,
    };
  }
}

const store = new LeaderboardStore(STORE_PATH);
export const rollDailyPeriod = (now?: number): void => store.rollDailyPeriod(now);
export const addLeaderboardScore = (id: string, name: string, metric: LeaderMetric, amount: number, now?: number): void => store.addScore(id, name, metric, amount, now);
export const addLeaderboardScoreOnce = (id: string, name: string, metric: LeaderMetric, eventId: string, now?: number): boolean => store.addScoreOnce(id, name, metric, eventId, now);
export const registerLeaderboardPlayer = (id: string, name: string, now?: number): void => store.registerPlayer(id, name, now);
export const getLeaderboard = (id?: string, now?: number) => store.get(id, now);
