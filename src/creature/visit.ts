// The creature's visits to the wanderer. Every night at his camp, a while after he has lain down, a portal opens beyond
// his fire; the creature comes out, comes over and sits by the fire with him until the small hours; some nights he wakes
// and sits up with it, some nights he sleeps on; before dawn it goes back and the portal closes. A function of his
// clock and the night alone (and that he is camping), so his road, the creature's page and the published page all
// agree. Pure.
import { unit } from '../noise.ts';
import { hourOfDay } from '../sky.ts';

/**
 * The hours of his clock the visit spans; how long (hours) its way up stands open before it climbs out (and after it
 * goes back down), and how long it takes to come over to the fire; how long the ring takes to come up and open, or
 * close. On a road with an hour-long day, an hour of his clock is 150 real seconds: it opens in a second and a half.
 */
export const VISIT = { from: 23.5, to: 3.5, open: 0.04, walk: 0.06, tear: 0.01 } as const;

/** How long the visit lasts, hours of his clock. */
const SPAN = (VISIT.to + 24 - VISIT.from) % 24;

/** Where in the visit it is: the portal opening, it coming over, with him, going back, the portal closing. */
export type Phase = 'opening' | 'coming' | 'with' | 'going' | 'closing';

export type Visit = {
  readonly phase: Phase;
  /** 0..1 through the phase. */
  readonly k: number;
  /** Whether he wakes this night (he sits up while it is with him). */
  readonly woke: boolean;
  /** Which night (for keeping the visit once). */
  readonly night: number;
};

/** The visit at his clock (world hours since his road began) on his road `seed`, if it is the hour; else null. */
export function visitAt(clock: number, seed: number): Visit | null {
  const h = hourOfDay(clock);
  const t = h >= VISIT.from ? h - VISIT.from : h < VISIT.to ? h + 24 - VISIT.from : -1;
  if (t < 0) return null;
  const night = Math.floor((clock - t) / 24 + 0.5);
  const woke = unit(night, seed ^ 0x3a7e) < 0.5;
  const steps: readonly (readonly [Phase, number])[] = [
    ['opening', VISIT.open],
    ['coming', VISIT.walk],
    ['with', SPAN - 2 * (VISIT.open + VISIT.walk)],
    ['going', VISIT.walk],
    ['closing', VISIT.open],
  ];
  let at = t;
  for (const [phase, len] of steps) {
    if (at < len) return { phase, k: at / len, woke, night };
    at -= len;
  }
  return null;
}

/** How open its way up is (0 shut … 1 open): the ring coming up and opening at the start of the visit, closing at its end. */
export function portalOpen(v: Visit): number {
  if (v.phase === 'opening') return Math.min(1, (v.k * VISIT.open) / VISIT.tear);
  if (v.phase === 'closing') return Math.min(1, ((1 - v.k) * VISIT.open) / VISIT.tear);
  return 1;
}

/**
 * Where it is between the portal (0) and its seat by the fire (1), and whether it is walking or showing (0 … 1)
 * as it comes out or goes in: out of the portal it stands a moment, then trots over; back, it trots to the portal
 * and steps in.
 */
export function crossing(v: Visit): { readonly at: number; readonly walking: boolean; readonly shown: number } {
  const OUT = 0.18;
  if (v.phase === 'coming') {
    if (v.k < OUT) return { at: 0, walking: false, shown: Math.min(1, v.k / (OUT * 0.6)) };
    return { at: (v.k - OUT) / (1 - OUT), walking: true, shown: 1 };
  }
  if (v.phase === 'going') {
    if (v.k > 1 - OUT) return { at: 0, walking: false, shown: Math.min(1, (1 - v.k) / (OUT * 0.6)) };
    return { at: 1 - v.k / (1 - OUT), walking: true, shown: 1 };
  }
  return { at: v.phase === 'with' ? 1 : 0, walking: false, shown: v.phase === 'with' ? 1 : 0 };
}

/** Whether he sits up with it now: a night he wakes, in the middle of its time with him. */
export function sitsUp(v: Visit | null): boolean {
  return v !== null && v.woke && v.phase === 'with' && v.k > 0.12 && v.k < 0.88;
}

/** Whether he is at his camp for the night (it only comes to his fire). */
export function camping(l: { readonly act: string; readonly stage: string; readonly fire: unknown }): boolean {
  return l.act === 'camp' && l.fire !== null && (l.stage === 'campsit' || l.stage === 'lie' || l.stage === 'sleep');
}
