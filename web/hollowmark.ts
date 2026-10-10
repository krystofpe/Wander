// The creature's hollow on his road: whichever hollow he comes to, it is the creature's (one world, two lives). The
// great tree in the forests, a turf shelter in the open lands, drawn as the hollow page draws them, and the creature at
// its door as the light of his scene finds it: by day outside, turning to watch him come, waving when he is near,
// sitting beside him while he smokes, watching him go; at night inside, only its eyes in the dark of the doorway (or
// asleep, the lantern lit by the door); nobody at all while it is away wandering.
import type { BiomeId } from '../src/biomes.ts';
import { FIRESIDE } from '../src/creature/road.ts';
import type { Life } from '../src/life.ts';
import { hourOfDay } from '../src/sky.ts';
import { CREATURE, EYES_FRONT, EYES_SIDE, HEAD, TREE } from '../src/creature/look.ts';
import type { PoseTag } from '../src/creature/look.ts';
import { FOOTPRINTS } from '../src/creature/scene.ts';
import { role } from '../src/palette.ts';
import { loopFrame } from '../src/walker.ts';
import type { Renderer, View } from './render.ts';
import type { Atlas } from './sprites.ts';

/** Who lives in the hollow, as its save says: its cloak, whether it is away wandering, how late it stays up. */
export type Neighbour = { readonly name: string | null; readonly cloak: number; readonly away: boolean; readonly nightOwl: number };

/** Where he is: metres from the hollow's door along the road (negative before it), and whether he sits by it. */
export type Passer = { readonly d: number; readonly sitting: boolean };

const COAT = role('coat', 0);
const EYE = role('eye', 0);
const CONTENT = role('mood', 0);
const FLICKER = 'mmnmmommommnonmmonqnmmo';
const flicker = (time: number): number => (FLICKER.charCodeAt(Math.floor(time * 10 + 3) % FLICKER.length) - 97) / 12;

/**
 * Whether the creature is at his fire: he has made camp in the evening and sits by it, or has lain down (it goes home
 * before the deep of the night), and it is not off wandering. It always comes; if it is asleep by its own clock it
 * dozes there by the fire.
 */
export function comesToFire(l: Life, neighbour: Neighbour | null): boolean {
  if (neighbour?.away === true || l.fire === null || l.act !== 'camp') return false;
  if (l.stage !== 'campsit' && l.stage !== 'lie' && l.stage !== 'sleep') return false;
  const h = hourOfDay(l.clock);
  return h >= 12 && h < FIRESIDE.to;
}

/** How the creature met him, by his scene's light: outside by day, in the dark doorway, or asleep (or not at all). */
export function meetingOf(night: number, neighbour: Neighbour | null): 'day' | 'night' | 'asleep' | null {
  if (neighbour?.away === true) return null;
  if (night <= 0.5) return 'day';
  return night > 0.75 + 0.2 * (neighbour?.nightOwl ?? 0.3) ? 'asleep' : 'night';
}

/** The forests have the great tree; the open lands a turf shelter (snowy in the tundra). */
export function hollowShape(biome: BiomeId): 'tree' | 'turf' | 'snow' {
  return biome === 'pine' || biome === 'birch' ? 'tree' : biome === 'tundra' ? 'snow' : 'turf';
}

/**
 * Draws a hollow with its door at native (x, foot) on the playfield batch, and its creature (a stranger's look when
 * there is no save yet). `night` 0..1 is his scene's; `time` real seconds.
 */
export function drawHollow(r: Renderer, atlas: Atlas, v: View, x: number, foot: number, biome: BiomeId, rows: readonly [number, number, number], neighbour: Neighbour | null, passer: Passer, night: number, time: number): void {
  const [ga, gb, gk] = rows;
  const ground = r.ground;
  const sheets = atlas.sheets;
  const put = (px: number, py: number, f: readonly number[], flip = false, alpha = 1, swap?: readonly number[], rim = true): void => ground.add(Math.round(px), Math.round(py), f, ga, gb, gk, flip, alpha, swap, rim);
  const shape = hollowShape(biome);
  const meeting = meetingOf(night, neighbour);
  const away = meeting === null;
  // Late at night it sleeps (a night owl stays up longer); before that it watches from the doorway.
  const asleep = meeting === 'asleep';
  const inside = meeting === 'night' || meeting === 'asleep';
  const swap = [COAT, role(`cloak${neighbour?.cloak ?? 0}`, 0) - COAT, EYE, CONTENT];
  let doorTop = foot - 18;
  if (shape === 'tree') {
    const base = sheets.hollow[inside ? 'lit' : 'base'][0];
    const left = x - TREE.door.x;
    put(left, foot - base[3], base, false, 1, undefined, false);
    const tile = sheets.trunk.tile[0];
    for (let y = foot - base[3] - tile[3]; y > -tile[3] - 60; y -= tile[3]) put(left, y, tile, false, 1, undefined, false);
    if (!inside) put(left + TREE.peg[0] - 1, foot - base[3] + TREE.peg[1], sheets.carry.dark[0]);
    else addLight(v, left + TREE.peg[0] + 1, foot - base[3] + TREE.peg[1] + 4, 34, 0.75 * (0.85 + 0.15 * flicker(time)));
    doorTop = foot - TREE.door.h;
  } else {
    const f = sheets.shelter[shape][0];
    const door = FOOTPRINTS.shelter.door?.x ?? 28;
    put(x - door, foot - f[3], f);
    doorTop = foot - (FOOTPRINTS.shelter.door?.h ?? 13);
  }
  if (away) return;
  if (inside) {
    // Its eyes in the dark of the doorway, turned toward him.
    if (asleep) return;
    const look = passer.d < -6 ? -1 : passer.d > 6 ? 1 : 0;
    put(x - 2 + look, doorTop + 9, sheets.eyes[(time % 3.7) > 3.56 ? 'shut' : 'open'][0], false, 1, swap);
    return;
  }
  // By day, outside its door: it watches him come (facing him), waves when he is near, sits with him, watches him go.
  const near = Math.abs(passer.d) < 22;
  let tag: PoseTag = 'stand';
  let cx = x + 16;
  let flip = passer.d < 0;
  if (passer.sitting) {
    tag = 'sit';
    cx = x + 38;
    flip = false;
  } else if (near && passer.d < 0) {
    tag = 'frontwave';
    flip = false;
  }
  drawNeighbour(r, atlas, cx, foot, tag, flip, neighbour, rows, passer.sitting ? 'happy' : 'open', time);
}

/**
 * Draws the creature (its own wing colour, its eyes in its mask) with its feet at native (cx, foot) on the
 * playfield batch, in a pose, turned left when `flip`, the eyes in a shape unless it blinks.
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

function addLight(v: View, x: number, y: number, radius: number, strength: number): void {
  const light = v.light;
  if (light.count >= 6) return;
  const o = light.count * 4;
  light.lights[o] = x;
  light.lights[o + 1] = y;
  light.lights[o + 2] = radius;
  light.lights[o + 3] = strength;
  light.count++;
}
