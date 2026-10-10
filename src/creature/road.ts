// His road, seen from the hollow (one world, two lives). The hollow stands in his world, at a hollow of his road in the
// creature's land; and whatever hollow his road passes, it is the creature's: when he is near one, he comes by. Where he
// is: on the published page the shared live road (src/live.ts); here, his journey moved on from its last save as his
// own catch-up will move him when you go back to the road (journal.ts: the away pace, a while at each hollow's door).
// Pure.
import { HOLLOW } from '../biomes.ts';
import type { BiomeId } from '../biomes.ts';
import { AWAY, awayAt } from '../journal.ts';
import { hourOfDay } from '../sky.ts';
import { landmarksBetween, stretchAt } from '../world.ts';
import type { Landmark } from '../world.ts';
import { BIOMES } from './config.ts';
import type { BiomeName } from './config.ts';

/** How near (metres) to a hollow's door he is "coming by". */
export const REACH = 42;

/**
 * His evening by his fire, by his clock's hour: while he sits by it and until he is well asleep, the creature goes up
 * to sit with him (web/stage.ts draws it there; from the deep it goes up through its door).
 */
export const FIRESIDE = { from: 20, to: 22.5 } as const;

/** His journey as the hollow knows it: his road's seed, where he was at the last save, and when; his clock then. */
export type Saved = { readonly seed: number; readonly at: number; readonly savedAt: number; readonly clock?: number };

/**
 * Whether he sits by his evening fire at `ms`, from his journey's clock moved on (`daySec` real seconds to his day,
 * an hour unless the road was opened with --day): the hours of FIRESIDE.
 */
export function firesideAt(journey: Saved, ms: number, daySec = 3600): boolean {
  if (journey.clock === undefined) return false;
  const h = hourOfDay(journey.clock + ((ms - journey.savedAt) / 1000) * (24 / daySec));
  return h >= FIRESIDE.from && h < FIRESIDE.to;
}

/** The lands of its biome on his road: the forest is his pine or birch woods; the others his own. */
function landsOf(biome: BiomeName): readonly BiomeId[] {
  return biome === 'forest' ? ['pine', 'birch'] : [BIOMES[biome].world];
}

/** The hollow on his road where it lives: the first in its land (or the first at all), or null on a road without any. */
export function homeHollow(worldSeed: number, biome: BiomeName): Landmark | null {
  const lands = landsOf(biome);
  let first: Landmark | null = null;
  for (let from = 0; from < 3e6; from += 50000) {
    for (const m of landmarksBetween(worldSeed, from, from + 50000)) {
      if (m.kind !== 'hollow') continue;
      first ??= m;
      if (lands.includes(stretchAt(worldSeed, m.at).biome)) return m;
    }
    if (first !== null && from > 400000) break;
  }
  return first;
}

/** The hollow he is coming by at road distance `at`, and how far past its door he is (negative before it), or null. */
export function hollowBy(worldSeed: number, at: number): { readonly mark: Landmark; readonly d: number } | null {
  for (const m of landmarksBetween(worldSeed, at - REACH - 1, at + REACH + 1)) {
    if (m.kind === 'hollow' && Math.abs(at - m.at) <= REACH) return { mark: m, d: at - m.at };
  }
  return null;
}

/** Where he is on his road at `ms`, from his journey's last save, moved on as his catch-up would; and if he sits. */
export function roadFrom(journey: Saved, ms: number): { at: number; sitting: boolean } {
  return awayAt(journey.seed, journey.at, (ms - journey.savedAt) / 1000);
}

/** When he last sat down at a hollow's door between `from` and `to` (ms), moved on as roadFrom moves him; or null. */
export function satBetween(journey: Saved, from: number, to: number): number | null {
  const pause = AWAY.hollowSec * AWAY.pace;
  let last: number | null = null;
  let passed = 0;
  for (const m of landmarksBetween(journey.seed, journey.at - HOLLOW.seat, journey.at + AWAY.capMetres)) {
    const seat = m.at + HOLLOW.seat;
    if (m.kind !== 'hollow' || seat < journey.at) continue;
    const walked = seat - journey.at + passed * pause;
    const t = journey.savedAt + (walked / AWAY.pace) * 1000;
    if (walked >= AWAY.capMetres || t > to) break;
    if (t > from) last = t;
    passed++;
  }
  return last;
}
