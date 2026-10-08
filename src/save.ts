// The save file, and what happened while you were away.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { BIOMES, BIOME_NAMES, BOND, SELF_FEED_CAP, SELF_PLAY_CAP } from './config.ts';
import type { BiomeName } from './config.ts';
import { MAX_CAIRN, addDiary, clamp01, drain, isNightFor, newLife } from './creature.ts';
import type { Life } from './creature.ts';
import { localHour, weatherAt } from './sky.ts';

/** `$XDG_DATA_HOME/wander/creature.json`, or `~/.local/share/wander/creature.json`. */
export function defaultSavePath(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const xdg = env.XDG_DATA_HOME;
  const base = xdg !== undefined && xdg !== '' ? xdg : join(homedir(), '.local', 'share');
  return join(base, 'wander', 'creature.json');
}

/** The saved life, or null when there is no file. Throws with a readable message when the file is broken. */
export function loadLife(path: string): Life | null {
  if (!existsSync(path)) return null;
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`cannot read ${path}: ${err instanceof Error ? err.message : String(err)}. Move it away, or start over with --new.`);
  }
  return revive(data, path);
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Checks a parsed save and fills in anything missing, so older files keep working. */
export function revive(data: unknown, path = 'the save file'): Life {
  if (typeof data !== 'object' || data === null) throw new Error(`${path} is not a Wander save. Move it away, or start over with --new.`);
  const o = data as Record<string, unknown>;
  if (o.version !== 1) throw new Error(`${path} is from another version of Wander (version ${String(o.version)}).`);
  const seed = num(o.seed, 1) >>> 0;
  const base = newLife(seed, num(o.born, Date.now()));
  const biome = (BIOME_NAMES as readonly string[]).includes(str(o.biome, '')) ? (o.biome as BiomeName) : base.biome;
  const needs = (o.needs ?? {}) as Record<string, unknown>;
  const traits = (o.traits ?? {}) as Record<string, unknown>;
  const stats = (o.stats ?? {}) as Record<string, unknown>;
  const entries = (v: unknown): { t: number; text: string }[] =>
    Array.isArray(v)
      ? v.flatMap((e) => (typeof e === 'object' && e !== null && typeof (e as { text?: unknown }).text === 'string' ? [{ t: num((e as { t?: unknown }).t, 0), text: (e as { text: string }).text }] : []))
      : [];
  return {
    version: 1,
    seed,
    name: str(o.name, base.name),
    biome,
    cloak: num(o.cloak, base.cloak),
    born: base.born,
    lastSeen: num(o.lastSeen, base.born),
    userName: typeof o.userName === 'string' && o.userName !== '' ? o.userName : null,
    needs: {
      food: clamp01(num(needs.food, base.needs.food)),
      rest: clamp01(num(needs.rest, base.needs.rest)),
      fun: clamp01(num(needs.fun, base.needs.fun)),
      love: clamp01(num(needs.love, base.needs.love)),
    },
    bond: clamp01(num(o.bond, base.bond)),
    traits: {
      curious: clamp01(num(traits.curious, base.traits.curious)),
      playful: clamp01(num(traits.playful, base.traits.playful)),
      shy: clamp01(num(traits.shy, base.traits.shy)),
      lazy: clamp01(num(traits.lazy, base.traits.lazy)),
      nightOwl: clamp01(num(traits.nightOwl, base.traits.nightOwl)),
      rainLover: clamp01(num(traits.rainLover, base.traits.rainLover)),
    },
    asleep: o.asleep === true,
    away: o.away === true,
    diary: entries(o.diary),
    found: strings(o.found),
    shelf: Array.isArray(o.shelf)
      ? o.shelf.flatMap((g) => (typeof g === 'object' && g !== null && typeof (g as { item?: unknown }).item === 'string' ? [{ t: num((g as { t?: unknown }).t, 0), item: (g as { item: string }).item }] : []))
      : [],
    facts: strings(o.facts),
    cairn: Math.max(0, Math.min(MAX_CAIRN, Math.floor(num(o.cairn, 0)))),
    stats: {
      visits: num(stats.visits, 0),
      fed: num(stats.fed, 0),
      played: num(stats.played, 0),
      petted: num(stats.petted, 0),
      talks: num(stats.talks, 0),
      gifts: num(stats.gifts, 0),
      finds: num(stats.finds, 0),
    },
    asked: strings(o.asked),
  };
}

/** Writes the save atomically: a temporary file, then a rename. */
export function saveLife(path: string, life: Life): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(life, null, 1)}\n`);
  renameSync(tmp, path);
}

/** Moves an existing save to `.bak`, for `--new`. Returns the backup path, or null when there was nothing. */
export function backUp(path: string): string | null {
  if (!existsSync(path)) return null;
  const bak = `${path}.bak`;
  renameSync(path, bak);
  return bak;
}

/** What happened while you were away. */
export type Away = { readonly ms: number; readonly wandered: boolean; readonly events: number };

const STEP_MS = 15 * 60000;
const MAX_AWAY_MS = 14 * 86400000;

/**
 * Lives through the time since `life.lastSeen`, in 15-minute steps: sleeping at night, draining, feeding and
 * amusing itself, and noting rare events in the diary. Mutates `life`.
 */
export function catchUp(life: Life, now: number, random: () => number): Away {
  const ms = Math.max(0, now - life.lastSeen);
  if (ms < 60000) {
    life.lastSeen = Math.max(life.lastSeen, now);
    return { ms, wandered: false, events: 0 };
  }
  const span = Math.min(ms, MAX_AWAY_MS);
  const diaryBefore = life.diary.length;
  let stormSlotLogged = -1;
  for (let t = now - span; t < now; t += STEP_MS) {
    const sec = Math.min(STEP_MS, now - t) / 1000;
    const hour = localHour(t);
    const night = isNightFor(life.traits, hour);
    const asleep = night || life.needs.rest < 0.1;
    drain(life.needs, sec, asleep);
    if (asleep) continue;
    if (life.needs.food < SELF_FEED_CAP * 0.8) life.needs.food = Math.min(SELF_FEED_CAP, life.needs.food + 0.25);
    if (life.needs.fun < SELF_PLAY_CAP * 0.7) life.needs.fun = Math.min(SELF_PLAY_CAP, life.needs.fun + 0.15);
    const roll = random();
    const weather = weatherAt(t, life.seed, life.biome);
    const slot = Math.floor(t / (25 * 60000));
    if (roll < 0.012 * (0.5 + life.traits.curious)) {
      const finds = BIOMES[life.biome].finds;
      const item = finds[Math.floor(random() * finds.length)];
      life.found.push(item);
      if (life.found.length > 12) life.found.shift();
      life.stats.finds++;
      addDiary(life, t, `Found ${item}.`);
    } else if (weather.storm && slot !== stormSlotLogged && slot - stormSlotLogged > 40) {
      stormSlotLogged = slot;
      addDiary(life, t, life.traits.rainLover > 0.5 ? 'A storm came through. I watched it from the doorway.' : 'A storm came through. I hid inside.');
    } else if (roll > 0.995 && life.cairn < MAX_CAIRN) {
      life.cairn++;
      addDiary(life, t, `Added a stone to the cairn (${life.cairn}).`);
    }
  }
  const days = span / 86400000;
  if (days > 1) life.bond = Math.max(0.05, life.bond - BOND.dailyDecay * (days - 1));
  const wandered = days > 2 && life.needs.love < 0.3;
  if (wandered) {
    life.away = true;
    addDiary(life, now - 3600000, 'Nobody came for days. I went wandering.');
  }
  life.asleep = !wandered && (isNightFor(life.traits, localHour(now)) || life.needs.rest < 0.1);
  life.lastSeen = now;
  return { ms, wandered, events: life.diary.length - diaryBefore };
}
