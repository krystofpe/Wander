// What watches the hollow at night under the canopy, from the world's clock (so it is the same whoever looks, and
// whenever): the owl that comes to the great tree on most nights, and a pair of eyes in the dark between the trees
// now and then. Pure.
import { unit } from '../noise.ts';

/** The night a moment belongs to: from noon to noon. */
export function nightOf(ms: number): number {
  return Math.floor((ms - 12 * 3600000) / 86400000);
}

/** Whether the owl comes tonight, and where on the trunk it sits (0 low … 1 high), and its own clock's offset. */
export function owlTonight(seed: number, ms: number): { readonly height: number; readonly phase: number } | null {
  const night = nightOf(ms);
  if (unit(night, seed ^ 0x0e1) >= 0.7) return null;
  return { height: unit(night, seed ^ 0x0e3), phase: unit(night, seed ^ 0x0e2) * 9 };
}

/** Every 50 seconds, two chances in five: a pair of eyes for nine seconds, somewhere in the trees, blinking. */
const EYES_EVERY = 50000;
const EYES_FOR = 9;

export function eyesAt(seed: number, ms: number): { readonly x: number; readonly up: number; readonly t: number; readonly blink: boolean } | null {
  const slot = Math.floor(ms / EYES_EVERY);
  const t = (ms - slot * EYES_EVERY) / 1000;
  if (unit(slot, seed ^ 0xe7e5) >= 0.4 || t >= EYES_FOR) return null;
  return { x: unit(slot, seed ^ 0xe7e6), up: unit(slot, seed ^ 0xe7e7), t, blink: t % 2.7 > 2.55 };
}

/** How the eyes fade in and out over their nine seconds (0..1). */
export function eyesFade(t: number): number {
  return Math.max(0, Math.min(1, t * 2, (EYES_FOR - t) * 2));
}
