// The creature as his road draws it, when it comes through its portal to sit by his fire at night (web/stage.ts): its
// own colour from its save, its eyes laid in its face, in a pose.
import { CREATURE, EYES_FRONT, EYES_SIDE, HEAD } from '../src/creature/look.ts';
import type { PoseTag } from '../src/creature/look.ts';
import { role } from '../src/palette.ts';
import { loopFrame } from '../src/walker.ts';
import type { Renderer } from './render.ts';
import type { Atlas } from './sprites.ts';

/** The creature, as its save says: its name, its colour, whether it is away wandering, how late it stays up. */
export type Neighbour = { readonly name: string | null; readonly cloak: number; readonly away: boolean; readonly nightOwl: number };

const COAT = role('coat', 0);
const EYE = role('eye', 0);
const CONTENT = role('mood', 0);

/**
 * Draws the creature (its own colour, its eyes in its face) with its feet at native (cx, foot) on the playfield
 * batch, in a pose, turned left when `flip`, the eyes in a shape unless it blinks.
 */
export function drawNeighbour(r: Renderer, atlas: Atlas, cx: number, foot: number, tag: PoseTag, flip: boolean, neighbour: Neighbour | null, rows: readonly [number, number, number], eyes: 'open' | 'happy' | 'shut', time: number, alpha = 1, walked = 0): void {
  const [ga, gb, gk] = rows;
  const sheets = atlas.sheets;
  const swap = [COAT, role(`cloak${neighbour?.cloak ?? 0}`, 0) - COAT, EYE, CONTENT];
  const frames = sheets.creature[tag];
  const i = tag === 'walk' ? Math.floor(walked / 4) % frames.length : frames.length === 1 ? 0 : loopFrame(frames.map((f) => f[4]), time);
  const top = Math.round(foot - CREATURE.foot);
  const left = Math.round(cx - CREATURE.w / 2);
  r.ground.add(left, top, frames[i], ga, gb, gk, flip, alpha, swap);
  const [hx, hy] = HEAD[tag][i];
  const front = tag === 'front' || tag === 'frontwave';
  const [ex, ey] = front ? EYES_FRONT : EYES_SIDE;
  const mx = flip ? CREATURE.w - (ex + hx) - 5 : ex + hx;
  const blink = (time % 4.1) > 3.96;
  r.ground.add(left + mx, top + ey + hy, sheets.eyes[blink ? 'shut' : eyes][0], ga, gb, gk, flip, alpha, swap);
}
