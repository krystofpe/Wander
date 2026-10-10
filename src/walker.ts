// His body: where he is, how fast he goes, and which frame of which animation shows. The walk cycle advances with
// the distance walked, so the planted foot moves exactly as far as the ground under it (research: Pixel craft §21).
// Pure.
import { PX_PER_M } from './layers.ts';

/** Native pixels the planted foot travels per walk frame (14 px a step, 4 frames a step). */
export const STEP_PX = 3.5;
/** Metres per walk frame. */
export const FRAME_M = STEP_PX / PX_PER_M;
export const WALK_FRAMES = 8;

/** His usual pace (m/s) and how it bends: slower uphill, in snow and sand, against the wind. */
export const PACE = { base: 1.15, min: 0.55, max: 1.45 } as const;

/** Pace for a slope (rise/run, positive uphill), ground and headwind (−1..1, positive in his face). */
export function paceFor(slope: number, ground: string, headwind: number, mood: number): number {
  let p = PACE.base * (1 + 0.06 * mood);
  p *= 1 - Math.max(-0.15, Math.min(0.45, slope * 1.6));
  if (ground === 'snow') p *= 0.78;
  else if (ground === 'sand' || ground === 'mud') p *= 0.86;
  p *= 1 - 0.12 * Math.max(0, headwind);
  return Math.max(PACE.min, Math.min(PACE.max, p));
}

/** The walk frame for a distance walked. */
export function walkFrame(walked: number): number {
  return ((Math.floor(walked / FRAME_M) % WALK_FRAMES) + WALK_FRAMES) % WALK_FRAMES;
}

/** A looping animation's frame for a time, given each frame's duration (ms). */
export function loopFrame(ms: readonly number[], t: number): number {
  let total = 0;
  for (const d of ms) total += d;
  let x = ((t * 1000) % total + total) % total;
  for (let i = 0; i < ms.length; i++) {
    x -= ms[i];
    if (x < 0) return i;
  }
  return ms.length - 1;
}
