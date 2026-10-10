// The live road: one wanderer for everyone who opens the published page, his whole life a function of the real
// clock, with no server and nothing saved. Each real hour is one of his days. At the top of every hour (23:00 on his
// clock) he is asleep by the fire at that night's camp, and where each night's camp lies is fixed in advance, so
// anyone can start from the last one and live the hour up to now in fixed steps: everyone sees him in the same place
// doing the same thing. Through the day a plan (life.ts) brings him to the next camp by nightfall. Pure.
import { BIOMES } from './biomes.ts';
import { freshMemory } from './brain.ts';
import { newLife, stepLife } from './life.ts';
import type { Env, Life, LifeEvent, LogEntry, Plan } from './life.ts';
import { squirrel, unit } from './noise.ts';
import { seedOf } from './options.ts';
import { spotsBetween } from './place.ts';
import { dayOf, hourOfDay, shownHour } from './sky.ts';
import { landmarksBetween, stretchAt, stretchesBetween } from './world.ts';

export const LIVE = {
  /** The road's word, and the moon's phase when it began. */
  word: 'wander',
  moon: 0.62,
  /** When the road began (ms): the top of the first hour, him asleep at the first camp. */
  epoch: Date.UTC(2026, 9, 10),
  /** Seconds in a step: everyone steps alike, so everyone's sums come out alike. */
  tick: 0.5,
  /** Real seconds in one of his days. */
  day: 3600,
  /** The world hour of the nightly meeting point, asleep by the fire; and the hour he means to reach camp by. */
  sleep: 23,
  aim: 17.5,
  /** Metres between camps, give or take, and how far a camp may move to find flat, dry ground. */
  spacing: 1350,
  jitter: 120,
  snap: 80,
} as const;

/** Steps in one of his days (one real hour). */
export const STEPS_PER_DAY = LIVE.day / LIVE.tick;

export const LIVE_SEED = seedOf(LIVE.word);

/** The step a real time falls in (ms → steps since the road began). */
export function stepAt(ms: number): number {
  return Math.floor((ms - LIVE.epoch) / (LIVE.tick * 1000));
}

/** The real time (ms) of a step. */
export function msOfStep(n: number): number {
  return LIVE.epoch + n * LIVE.tick * 1000;
}

/** Which night a world clock belongs to: night k runs from 23:00 on day k + 1 to 23:00 the day after. */
export function nightOf(clock: number): number {
  return Math.floor((clock - LIVE.sleep) / 24);
}

export type Camp = { readonly at: number; readonly what: string };

const camps = new Map<number, Camp>();

/** Where he sleeps on night k: about k × spacing metres on, moved to the nearest flat, dry ground if there is any. */
export function campOf(seed: number, k: number): Camp {
  const key = k * 4294967296 + seed;
  const known = camps.get(key);
  if (known !== undefined) return known;
  const raw = k * LIVE.spacing + (unit(k, seed ^ 0xca3b) * 2 - 1) * LIVE.jitter;
  let best: Camp | null = null;
  for (const s of spotsBetween(seed, raw - LIVE.snap, raw + LIVE.snap)) {
    if (s.kind === 'camp' && (best === null || Math.abs(s.at - raw) < Math.abs(best.at - raw))) best = { at: s.at, what: s.what };
  }
  const camp = best ?? { at: raw, what: 'open ground' };
  if (camps.size > 64) camps.clear();
  camps.set(key, camp);
  return camp;
}

/** The plan for a clock: the camp at the end of the day, and when he means to be there. */
export function planOf(seed: number, clock: number): Plan {
  const k = nightOf(clock);
  const c = campOf(seed, k + 1);
  return { camp: c.at, what: c.what, aim: 24 * (k + 1) + LIVE.aim };
}

/** The live road's world: the warped day, the world's own weather, the plan. */
export function liveEnv(seed: number): Env {
  return { hourAt: hourOfDay, natural: false, weather: null, plan: (clock) => planOf(seed, clock) };
}

/**
 * The log of the days before night k: each day's walk from camp to camp, its places and landmarks at the hours they
 * would have come (spread over the walking hours), and each night's camp.
 */
function history(seed: number, k: number, days = 10): LogEntry[] {
  const out: LogEntry[] = [];
  for (let j = Math.max(0, k - days); j < k; j++) {
    const from = campOf(seed, j).at;
    const to = campOf(seed, j + 1);
    const day = dayOf(24 * (j + 1) + 1);
    const when = (d: number): number => shownHour(5 + (12 * (d - from)) / Math.max(1, to.at - from));
    for (const s of stretchesBetween(seed, from, to.at)) if (s.start > from) out.push({ at: s.start, day, hour: when(s.start), kind: 'biome', name: BIOMES[s.biome].title });
    for (const m of landmarksBetween(seed, from, to.at)) if (m.at > from && m.at <= to.at) out.push({ at: m.at, day, hour: when(m.at), kind: 'landmark', name: m.kind });
    out.push({ at: to.at, day, hour: shownHour(LIVE.aim), kind: 'camp', name: to.what });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

/** His life at the top of hour k: asleep by the fire at night k's camp, a randomness of its own for the hour. */
export function nightStart(seed: number, k: number): Life {
  const c = campOf(seed, k);
  const l = newLife(seed, c.at, 0);
  l.clock = 24 * k + LIVE.sleep;
  l.walked = c.at;
  l.rng = squirrel(k, seed ^ 0x11fe) >>> 0;
  l.nightOwl = Math.pow(unit(k, seed ^ 0x0e11), 1.8);
  l.act = 'camp';
  l.stage = 'sleep';
  l.stageTime = 600;
  l.target = c.at;
  l.what = c.what;
  l.until = 'dawn';
  l.smoke = true;
  l.actLength = 1;
  l.slept = true;
  l.fire = { at: c.at + 0.9, heat: 1 };
  l.since = freshMemory(600);
  l.since.camp = 300;
  l.nextThought = 40 + 80 * unit(k, seed ^ 0x7407);
  // What he has passed is in the log already: the stretch he sleeps in and the last landmark are not logged again.
  l.lastBiome = stretchAt(seed, c.at).biome;
  const marks = landmarksBetween(seed, c.at - 3000, c.at + 1).filter((m) => m.at <= c.at);
  const last = marks[marks.length - 1];
  if (last !== undefined) {
    l.lastMark = last.cell;
    l.sinceName = `the ${last.kind === 'circle' ? 'stone circle' : last.kind}`;
  }
  l.log = history(seed, k);
  return l;
}

/**
 * One step on the live road, to step n: the top of an hour starts from that night's camp; any other step lives on.
 * Returns the life to go on with (a new one at the top of the hour).
 */
export function stepLive(l: Life, n: number, env: Env, events: LifeEvent[]): Life {
  if (n % STEPS_PER_DAY === 0) {
    events.length = 0;
    return nightStart(l.seed, n / STEPS_PER_DAY);
  }
  stepLife(l, LIVE.tick, LIVE.day, env, events);
  return l;
}

/**
 * His life at step n: the hour's camp, lived step by step up to n (at most one real hour: 7 200 steps, a few tens of
 * milliseconds). `each` sees every step's events (the page uses it to think the thoughts he had on the way).
 */
export function liveAt(seed: number, n: number, env: Env, each?: (l: Life, events: readonly LifeEvent[], step: number) => void): Life {
  const k = Math.floor(n / STEPS_PER_DAY);
  let l = nightStart(seed, k);
  const events: LifeEvent[] = [];
  for (let i = k * STEPS_PER_DAY + 1; i <= n; i++) {
    l = stepLive(l, i, env, events);
    each?.(l, events, i);
  }
  return l;
}
