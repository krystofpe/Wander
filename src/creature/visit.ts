// The creature's visits to the wanderer. Every night at his camp, a while after he has lain down, a portal opens beyond
// his fire; the creature comes out, comes over and sits by the fire with him until the small hours; some nights he wakes
// and sits up with it, some nights he sleeps on; before dawn it goes back and the portal closes. A function of his
// clock and the night alone (and that he is camping), so his road, the creature's page and the published page all
// agree. Pure.
import { unit } from '../noise.ts';
import { hourOfDay } from '../sky.ts';

/** The hours of his clock the visit spans, and how long (hours) the portal takes to open and it to walk over. */
export const VISIT = { from: 23.5, to: 3.5, open: 0.15, walk: 0.3 } as const;

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

/** Whether he sits up with it now: a night he wakes, in the middle of its time with him. */
export function sitsUp(v: Visit | null): boolean {
  return v !== null && v.woke && v.phase === 'with' && v.k > 0.12 && v.k < 0.88;
}

/** Whether he is at his camp for the night (it only comes to his fire). */
export function camping(l: { readonly act: string; readonly stage: string; readonly fire: unknown }): boolean {
  return l.act === 'camp' && l.fire !== null && (l.stage === 'campsit' || l.stage === 'lie' || l.stage === 'sleep');
}
