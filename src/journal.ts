// The journey as it is saved: the road's seed, the moon it started under, his life (clock, distance, state, log),
// and the time away when it comes back (research-free, spec §8). Pure, shared by the page and the server.
import { BIOMES, HOLLOW } from './biomes.ts';
import { ACTS, freshMemory } from './brain.ts';
import { STAGES, newLife } from './life.ts';
import type { Life, LogEntry } from './life.ts';
import { seedOf } from './options.ts';
import { dayOf, hourOfDay, shownHour } from './sky.ts';
import { landmarksBetween, stretchAt, stretchesBetween } from './world.ts';

export type Journey = {
  version: 2;
  /** The word the road was made from (its seed). */
  word: string;
  /** The moon's phase when the road began. */
  moonStart: number;
  /** Real times (ms): when the road began, and the last save. */
  startedAt: number;
  savedAt: number;
  life: Life;
};

/**
 * While away he walks on at this average pace (rests and nights included), up to this far; and at every hollow's door
 * on the way he sits a while (seconds), with the creature (src/creature/road.ts follows him from its hollow).
 */
export const AWAY = { pace: 0.62, capMetres: 20000, minMs: 60_000, hollowSec: 150 } as const;

/** Where he is `sec` seconds after leaving road distance `from` (seed's road), walking as he does while away. */
export function awayAt(seed: number, from: number, sec: number): { at: number; sitting: boolean } {
  const walked = Math.min(AWAY.capMetres, Math.max(0, sec) * AWAY.pace);
  let at = from + walked;
  if (walked >= AWAY.capMetres) return { at, sitting: false };
  // Past a hollow's door, he sat there a while: as far behind as he would have walked meanwhile.
  const pause = AWAY.hollowSec * AWAY.pace;
  for (const m of landmarksBetween(seed, from, at + 1)) {
    const seat = m.at + HOLLOW.seat;
    if (m.kind !== 'hollow' || seat < from || at < seat) continue;
    if (at < seat + pause) return { at: seat, sitting: true };
    at -= pause;
  }
  return { at, sitting: false };
}

const WORDS = ['heath', 'ash', 'moss', 'fern', 'flint', 'birch', 'tarn', 'cairn', 'reed', 'slate', 'rowan', 'sloe', 'thorn', 'marsh', 'drift', 'ember', 'hollow', 'barrow'];

/** A new road's word, from a random number: "tarn-4821". */
export function roadWord(random: number): string {
  const n = Math.floor(random * WORDS.length * 10000);
  return `${WORDS[n % WORDS.length]}-${1000 + (Math.floor(n / WORDS.length) % 9000)}`;
}

export function newJourney(word: string, now: number, moonStart: number, hour = 7.5): Journey {
  return { version: 2, word, moonStart, startedAt: now, savedAt: now, life: newLife(seedOf(word), 0, hour) };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const UNTIL: readonly string[] = ['time', 'rain eases', 'dawn'];
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Checks a parsed save and fills in what is missing; throws with a readable message when it is not a journey. */
export function reviveJourney(data: unknown): Journey {
  if (!isObj(data) || data.version !== 2 || typeof data.word !== 'string' || !isObj(data.life)) throw new Error('not a Wander journey (version 2)');
  const base = newLife(seedOf(data.word), 0);
  const l = data.life;
  const life: Life = { ...base };
  // Numbers and strings are copied when they have the right type; anything else keeps the fresh value.
  for (const k of Object.keys(base) as (keyof Life)[]) {
    const v = l[k];
    const b = base[k];
    if (typeof b === 'number' && typeof v === 'number' && Number.isFinite(v)) (life[k] as number) = v;
    else if (typeof b === 'string' && typeof v === 'string') (life[k] as string) = v;
    else if (typeof b === 'boolean' && typeof v === 'boolean') (life[k] as boolean) = v;
  }
  life.seed = seedOf(data.word);
  // Words he knows only: an act, a stage or an ending he does not know (an old or edited save) would leave him
  // stuck, so it starts him walking again.
  const unknown = !(ACTS as readonly string[]).includes(life.act) || !(STAGES as readonly string[]).includes(life.stage) || !UNTIL.includes(life.until);
  if (unknown) {
    life.act = 'walk';
    life.stage = 'walk';
    life.until = 'time';
  }
  life.since = freshMemory(600);
  if (isObj(l.since)) for (const k of ACTS) life.since[k] = num(l.since[k], life.since[k]);
  life.thoughts = Array.isArray(l.thoughts) ? l.thoughts.filter((x): x is string => typeof x === 'string').slice(-8) : [];
  life.log = Array.isArray(l.log) ? (l.log.filter((e) => isObj(e) && typeof e.name === 'string' && typeof e.at === 'number') as LogEntry[]).slice(-500) : [];
  life.fire = isObj(l.fire) && typeof l.fire.at === 'number' && typeof l.fire.heat === 'number' ? { at: l.fire.at, heat: l.fire.heat } : null;
  life.target = !unknown && typeof l.target === 'number' && Number.isFinite(l.target) ? l.target : null;
  life.sinceName = typeof l.sinceName === 'string' ? l.sinceName : null;
  return {
    version: 2,
    word: data.word,
    moonStart: num(data.moonStart, 0.5),
    startedAt: num(data.startedAt, Date.now()),
    savedAt: num(data.savedAt, Date.now()),
    life,
  };
}

/** What happened while the road was closed. */
export type Away = { readonly ms: number; readonly metres: number; readonly places: number };

/**
 * Lives through the time since the last save: the clock moves on as it would have, and he walked on at an average
 * pace, capped, logging the stretches and landmarks he passed. He comes back walking, his fire long cold.
 */
export function catchUp(j: Journey, now: number, dayLengthSec: number): Away {
  const ms = Math.max(0, now - j.savedAt);
  if (ms < AWAY.minMs) return { ms, metres: 0, places: 0 };
  const l = j.life;
  const sec = ms / 1000;
  const from = l.at;
  const to = awayAt(l.seed, from, sec).at;
  const metres = to - from;
  const clock0 = l.clock;
  const hours = (sec * 24) / dayLengthSec;
  const before = l.log.length;
  const when = (d: number): { day: number; hour: number } => {
    const c = clock0 + hours * ((d - from) / Math.max(1, metres));
    return { day: dayOf(c), hour: shownHour(hourOfDay(c)) };
  };
  const notes: LogEntry[] = [];
  for (const s of stretchesBetween(l.seed, from, to)) if (s.start > from) notes.push({ at: s.start, ...when(s.start), kind: 'biome', name: BIOMES[s.biome].title });
  for (const m of landmarksBetween(l.seed, from, to)) notes.push({ at: m.at, ...when(m.at), kind: 'landmark', name: m.kind });
  notes.sort((a, b) => a.at - b.at);
  l.log.push(...notes);
  if (l.log.length > 500) l.log.splice(0, l.log.length - 500);
  l.clock = clock0 + hours;
  l.at = to;
  l.walked += metres;
  l.act = 'walk';
  l.stage = 'walk';
  l.target = null;
  l.fire = null;
  l.smoking = -1;
  l.walking = 0;
  l.nextLook = 3;
  l.nextThought = Math.min(l.nextThought, 30);
  l.slept = false;
  for (const k of Object.keys(l.since) as (keyof Life['since'])[]) l.since[k] += sec;
  // What he passed is logged already: the stretch he is in and the last landmark are not logged again.
  l.lastBiome = stretchAt(l.seed, to).biome;
  const marks = landmarksBetween(l.seed, from, to);
  if (marks.length > 0) l.lastMark = marks[marks.length - 1].cell;
  j.savedAt = now;
  return { ms, metres, places: l.log.length - before };
}
