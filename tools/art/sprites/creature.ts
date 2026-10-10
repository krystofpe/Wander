// The creature, drawn by hand in parts and composed into frames: 24 × 26, facing right, floating with its hem on row
// 25. A shadow of the deep in a mask, after Kaonashi's quiet loneliness more than his look: a rounded shroud of
// darkness with no hood to it, its hem thinning into nothing so it seems only half there; on its face a pale oval mask
// with two dark eye holes (the page lays its glowing eyes in them, eyes.ts, where src/creature/look.ts says its head
// is), a short violet mark above each and a longer one below, like tears, and a small dark mouth. Thin arms of shadow
// come out of it only to wave, to eat, to dig or to hold something out. The shroud is drawn in the coat's roles (the
// page moves it to its own colour), the mask in bone, the marks in the violet of flowers, the holes in the hood's
// darkness. Legend in ../legend.ts.
import { CREATURE, HEAD } from '../../../src/creature/look.ts';
import { block, compose } from '../compose.ts';
import type { Part, Placed } from '../compose.ts';
import type { Sheet } from '../legend.ts';

const { w: W, h: H } = CREATURE;

// ── The mask ───────────────────────────────────────────────────────────────

/** Facing you: the eyes go at x 9–13, rows 9–10. */
const MASK_FRONT: Part = block(6, 4, [
  '..z///z....',
  '.z/UUUU/z..',
  'z/UUUUUUU/z',
  'z/U•UUU•U/z',
  'z/U•UUU•U/z',
  'z/hhhUhhh/z',
  'z/hhhUhhh/z',
  'z/U·UUU·U/z',
  'z/U•UUU•U/z',
  '.z/•UUU•/z.',
  '.z/U/hh/U/z',
  '..z/UUUU/z.',
  '...zz//zz..',
]);
/** Turned to the right, on the front of its dome: the eyes go at x 12–16. */
const MASK_SIDE: Part = block(9, 4, [
  '..z///z...',
  '.z/UUUU/z.',
  'z/UUUUUUU/',
  'z/U•UUU•U/',
  'z/U•UUU•Uz',
  'z/hhhUhhhz',
  'z/hhhUhhhz',
  'z/U·UUU·U/',
  'z/U•UUU•U/',
  '.z/•UUU•/.',
  '.z/U/hh/z.',
  '..z/UUU/..',
  '...zz//...',
]);

// ── The shroud ─────────────────────────────────────────────────────────────

/** Facing you: a dome, then a long shroud widening a little, a lit fold down its left. */
const SHROUD_FRONT: Part = block(3, 2, [
  '......odddo.......',
  '....oddmmmmddo....',
  '...odmlmmmmmmdo...',
  '..odmlmmmmmmmmdo..',
  '..odmlmmmmmmmmdo..',
  '.odmlmmmmmmmmmmdo.',
  '.odmlmmmmmmmmmmdo.',
  '.odmlmmmmmmmmmmdo.',
  '.odmlmmmmmmmmmmdo.',
  '.odmlmmmmmmmmmmdo.',
  '.odmlmmmmmmmmmmdo.',
  '.odmlmmmmmmmmmmmdo',
  'odmmlmmmmmmmdmmmdo',
  'odmmlmmmmmmmdmmmdo',
  'odmmlmmmmmmmdmmmdo',
  'odmmlmmmmmmmdmmmdo',
  'oddmmlmmmmmmdmmddo',
  'oddmmlmmmmmmdmmddo',
  'oddmmmmmmmmmmmmddo',
]);
/** Turned to the right: its back rounder, the front falling straight. */
const SHROUD_SIDE: Part = block(2, 2, [
  '......odddo.......',
  '....oddmmmmddo....',
  '...odmlmmmmmmmdo..',
  '..odmlmmmmmmmmmdo.',
  '..odmlmmmmmmmmmdo.',
  '.odmlmmmmmmmmmmmdo',
  '.odmlmmmmmmmmmmmdo',
  '.odmlmmmmmmmmmmmdo',
  '.odmlmmmmmmmmmmmdo',
  '.odmlmmmmmmmmmmmdo',
  'odmlmmmmmmmmmmmmdo',
  'odmlmmmmmmmmmmmmdo',
  'odmmlmmmmmdmmmmdo.',
  'odmmlmmmmmdmmmmdo.',
  'odmmlmmmmmdmmmmdo.',
  'oddmmlmmmmdmmmmdo.',
  'oddmmlmmmmdmmmddo.',
  'oddmmlmmmmmmmmddo.',
  'oddmmmmmmmmmmmddo.',
]);
/** Settled low, its shroud spread on the ground. */
const SHROUD_SIT: Part = block(2, 6, [
  '.......odddo........',
  '.....oddmmmmddo.....',
  '....odmlmmmmmmmdo...',
  '...odmlmmmmmmmmmdo..',
  '...odmlmmmmmmmmmdo..',
  '..odmlmmmmmmmmmmmdo.',
  '..odmlmmmmmmmmmmmdo.',
  '..odmlmmmmmmmmmmmdo.',
  '.odmmlmmmmmmmmmmmmdo',
  '.odmmlmmmmmmmmmmmmdo',
  '.odmmlmmmmmmmdmmmmdo',
  'oddmmlmmmmmmmdmmmmdo',
  'oddmmlmmmmmmmdmmmddo',
  'oddmmmmmmmmmmmmmmddo',
  'ooddddddddddddddddoo',
]);

/** Its hem thinning into nothing: the shapes take turns as it floats (two faces of it, for each way it is drawn). */
const hem = (x0: number, rows: readonly string[]): Part => block(x0, 21, rows);
const HEMS_FRONT: readonly Part[] = [
  hem(3, ['o.dmm.mmmm.mmm.d.o', '.d.m.m.m.mm.m.m.d.', '..m...m...m...m...', '.m...m.....m....m.']),
  hem(3, ['o.dm.mmmm.mmm.md.o', '..dm.m.m.m.m.m.d..', '.m...m...m...m....', '...m....m...m...m.']),
];
const HEMS_SIDE: readonly Part[] = [
  hem(2, ['o.dmm.mmmm.mmd.o..', '.d.m.m.m.mm.m.d...', 'm...m...m...m.....', '..m...m.....m.....']),
  hem(2, ['o.dm.mmmm.mmmd.o..', '..dm.m.m.m.m.d....', '.m...m...m...m....', 'm....m.....m......']),
];

// ── Its arms of shadow ─────────────────────────────────────────────────────

/** An arm raised from its side, waving: up and out to a small hand. */
const armUp = (x: number, y: number, out: 1 | -1): Part => ({
  [y]: [[x, 'lL']],
  [y + 1]: [[x - out, 'ml']],
  [y + 2]: [[x - out, 'dl']],
  [y + 3]: [[x - 2 * out, 'dm']],
  [y + 4]: [[x - 2 * out, 'om']],
});
/** Both hands at its mouth (eating). */
const HANDS_MOUTH: Part = { 16: [[13, 'lL']], 17: [[15, 'ml']], 18: [[15, 'dm']] };
/** Hands down at the ground (digging), scratching. */
const handsDown = (y: number): Part => ({ [y]: [[19, 'ml']], [y + 1]: [[20, 'lL']] });
/** A hand held out in front (for what it holds). */
const HAND_OUT: Part = { 18: [[17, 'dm']], 19: [[18, 'lL']] };

// ── Frames ─────────────────────────────────────────────────────────────────

const at = (part: Part, dx: number, dy: number): Placed => ({ part, dx, dy });

/** A frame: the body parts, then the mask moved as src/creature/look.ts says for this pose and frame. */
function frame(tag: keyof typeof HEAD, i: number, mask: Part, body: readonly (Part | Placed)[]): string[] {
  const [dx, dy] = HEAD[tag][i];
  return compose(W, H, [...body, at(mask, dx, dy)]);
}

// Breathing: it rises and sinks a pixel, its hem shifting.
const STAND = [0, 1].map((i) => frame('stand', i, MASK_SIDE, [at(SHROUD_SIDE, 0, i), HEMS_SIDE[i], at(HAND_OUT, 0, i)]));
// Drifting: a bob, its hem trailing.
const WALK = [0, 1, 2, 3].map((i) => {
  const dy = i === 1 || i === 2 ? -1 : 0;
  return frame('walk', i, MASK_SIDE, [at(SHROUD_SIDE, 0, dy), at(HEMS_SIDE[i % 2], i % 2 === 0 ? 0 : -1, dy)]);
});
const SIT = [0, 1].map((i) => frame('sit', i, MASK_SIDE, [at(SHROUD_SIT, 0, i === 1 ? 0 : 0)]));
const JUMP = [frame('jump', 0, MASK_SIDE, [at(SHROUD_SIDE, 0, -2), at(HEMS_SIDE[1], 0, -2)])];
// Waving: a thin arm of shadow comes out and waves.
const WAVE = [0, 1].map((i) => frame('wave', i, MASK_SIDE, [SHROUD_SIDE, HEMS_SIDE[i], armUp(18 + i, 8 + i, -1)]));
// Bent to dig: the mask low, its hands scratching at the ground.
const DIG = [0, 1].map((i) => frame('dig', i, MASK_SIDE, [at(SHROUD_SIDE, 1, 3), at(HEMS_SIDE[i], 1, 1), handsDown(22 + i)]));
const EAT = [0, 1].map((i) => frame('eat', i, MASK_SIDE, [SHROUD_SIDE, HEMS_SIDE[i], at(HANDS_MOUTH, 0, i)]));
const FRONT = [0, 1].map((i) => frame('front', i, MASK_FRONT, [at(SHROUD_FRONT, 0, i), HEMS_FRONT[i]]));
const FRONT_WAVE = [0, 1].map((i) => frame('frontwave', i, MASK_FRONT, [SHROUD_FRONT, HEMS_FRONT[i], armUp(19 + i, 7 + i, -1)]));

export const SHEET: Sheet = {
  name: 'creature',
  w: W,
  h: H,
  tags: [
    { name: 'stand', ms: [1300, 1100], frames: STAND },
    { name: 'walk', ms: 190, frames: WALK },
    { name: 'sit', ms: [1500, 1300], frames: SIT },
    { name: 'jump', ms: 1000, frames: JUMP },
    { name: 'wave', ms: 280, frames: WAVE },
    { name: 'dig', ms: 220, frames: DIG },
    { name: 'eat', ms: 320, frames: EAT },
    { name: 'front', ms: [1300, 1100], frames: FRONT },
    { name: 'frontwave', ms: 280, frames: FRONT_WAVE },
  ],
};
