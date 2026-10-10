// The creature, drawn by hand in parts and composed into frames: 24 × 26, facing right, feet on row 25, about 23 px
// tall (he is 32). A round hood with a soft peak falling back, its opening all darkness; a bell of a cloak to the
// ground with a pale clasp; small boots. It is drawn in the coat's roles and its face in the hood's darkness: the page
// moves the cloak to the creature's own colour and draws its eyes apart (eyes.ts), where src/creature/look.ts says
// its head is. Legend in ../legend.ts.
import { CREATURE, HEAD } from '../../../src/creature/look.ts';
import { block, compose } from '../compose.ts';
import type { Part, Placed } from '../compose.ts';
import type { Sheet } from '../legend.ts';

const { w: W, h: H } = CREATURE;

// ── Parts ──────────────────────────────────────────────────────────────────

/** The hood side on, looking ahead: rows 3–14, the opening on its face side. */
const HOOD: Part = block(3, 3, [
  '..oo..........',
  '..odo.........',
  '...odoo.......',
  '..odmmmoo.....',
  '.odmmmmmllo...',
  '.odmmmmlllLo..',
  'odmmmmmllllLo.',
  'odmmmmLhhhhhlo',
  'odmmmmhhhhhhhlo',
  'odmmmmhhhhhhhlo',
  'odmmmmhhhhhhhlo',
  'oddmmmmhhhhhllo',
]);

/** The hood facing you: the opening in the middle. */
const HOOD_FRONT: Part = block(3, 3, [
  '.......oo.......',
  '......odlo......',
  '.....odmllo.....',
  '....odmmmllo....',
  '...odmmmmmllo...',
  '..odmmmmmmmlLo..',
  '..odmmmmmmmmlo..',
  '.odmmhhhhhhmmlo.',
  '.odmhhhhhhhhmlo.',
  '.odmhhhhhhhhmlo.',
  '.odmhhhhhhhhmlo.',
  '.oddmhhhhhhmmlo.',
]);

/** The cloak side on, from the shoulders to the hem: rows 15–23. Lit at the chest, two folds running down, a sleeve
 * with its mitten peeping out at the front, shadow at the back of the hem. */
const CLOAK: Part = block(1, 15, [
  '..oddmmmmmllllUlo...',
  '.oddmmmmmmmmmlllo...',
  '.oddmmmmdmmmmmmllo..',
  '.oddmmmmdmmmmmmdlo..',
  'oddmmmmmdmmmmmmdbBo.',
  'oddmmmmmmdmmmmmmmlo.',
  'oddmmmmmmdmmmdmmmmlo',
  'odddmmmmmmdmmmdmmmlo',
  'ooddddddddddddddddoo',
]);

/** The cloak facing you. */
const CLOAK_FRONT: Part = block(1, 15, [
  '...oddmmmmUmmmmlo...',
  '..oddmmmmmmmmmllo..',
  '..oddmmmmmmmmmmmlo..',
  '.oddmmdmmmmmmmdmmlo.',
  '.odbbmmmmdmmmmmbblo.',
  '.oddmmmmmdmmmmmmmlo.',
  'oddmmmmmmdmmmmmmmmlo',
  'oddmmmmmmdmmmmmmmmlo',
  'oooddddddddddddddooo',
]);

/** Sitting: the cloak spread on the ground, the boots out in front. Rows 20–25. */
const CLOAK_SIT: Part = block(0, 20, [
  '...oddmmmmmllllUlo.....',
  '..oddmmmmmmmmmmmmlo....',
  '.oddmmmmmdmmmmmmmmlo...',
  'oddmmmmmmdmmmmmmmmmlo..',
  'oddmmmmmmmdmmmmmmmmlobB',
  'ooddddddddddddddddoobbb',
]);

/** Bent over to dig: the back of the cloak, the arms down at the front. Rows 17–25 (with the head moved). */
const CLOAK_DIG: Part = block(1, 17, [
  '...oddmmmmmllllUlo..',
  '..oddmmmmmmmmmmmmlo.',
  '.oddmmmmmdmmmmmmmmlo',
  '.oddmmmmmdmmmmmmmmlo',
  'oddmmmmmmdmmmmmmmmlo',
  'oddmmmmmmmdmmmmmmlo.',
  'ooddddddddddddddoo..',
]);

const feet = (back: number, front: number): Part => ({
  24: [
    [back, 'bbB'],
    [front, 'bbB'],
  ],
  25: [
    [back, 'bbb'],
    [front, 'bbbb'],
  ],
});

/** An arm raised, waving: from the shoulder up to the mitten. */
const arm = (hx: number, hy: number): Part => ({
  [hy]: [[hx, 'bB']],
  [hy + 1]: [[hx - 1, 'lo']],
  [hy + 2]: [[hx - 2, 'mlo']],
  [hy + 3]: [[hx - 3, 'mlo']],
  [hy + 4]: [[hx - 4, 'ml']],
});

/** Both mittens up at the face (eating), or down at the ground (digging). */
const MITTENS_FACE: Part = { 15: [[16, 'bB']], 16: [[15, 'lob']], 17: [[14, 'mlo']] };
const mittensDown = (y: number): Part => ({ [y]: [[20, 'bB']], [y + 1]: [[21, 'bb']] });

const at = (part: Part, dx: number, dy: number): Placed => ({ part, dx, dy });

/** A frame from the hood (moved as src/creature/look.ts says for this pose and frame), a body and its extras. */
function frame(tag: keyof typeof HEAD, i: number, hood: Part, body: readonly (Part | Placed)[]): string[] {
  const [dx, dy] = HEAD[tag][i];
  return compose(W, H, [...body, at(hood, dx, dy)]);
}

const STAND = [0, 1].map((i) => frame('stand', i, HOOD, [CLOAK, feet(6, 13)]));
// The walk: a waddle. Up and a little forward on the passing frames, the feet taking turns in front.
const WALK = [
  frame('walk', 0, HOOD, [CLOAK, feet(4, 14)]),
  frame('walk', 1, HOOD, [at(CLOAK, 1, -1), feet(8, 12)]),
  frame('walk', 2, HOOD, [CLOAK, feet(14, 5)]),
  frame('walk', 3, HOOD, [at(CLOAK, 1, -1), feet(12, 8)]),
];
const SIT = [0, 1].map((i) => frame('sit', i, HOOD, [CLOAK_SIT]));
const JUMP = [frame('jump', 0, HOOD, [at(CLOAK, 0, -1), { 24: [[7, 'bb'], [13, 'bb']] }])];
const WAVE = [frame('wave', 0, HOOD, [CLOAK, feet(6, 13), arm(20, 11)]), frame('wave', 1, HOOD, [CLOAK, feet(6, 13), arm(21, 12)])];
const DIG = [frame('dig', 0, HOOD, [CLOAK_DIG, mittensDown(22), feet(4, 13)]), frame('dig', 1, HOOD, [CLOAK_DIG, mittensDown(23), feet(4, 13)])];
const EAT = [frame('eat', 0, HOOD, [CLOAK, feet(6, 13), MITTENS_FACE]), frame('eat', 1, HOOD, [CLOAK, feet(6, 13), at(MITTENS_FACE, 0, 1)])];
const FRONT = [0, 1].map((i) => frame('front', i, HOOD_FRONT, [CLOAK_FRONT, feet(6, 14)]));
const FRONT_WAVE = [frame('frontwave', 0, HOOD_FRONT, [CLOAK_FRONT, feet(6, 14), arm(21, 11)]), frame('frontwave', 1, HOOD_FRONT, [CLOAK_FRONT, feet(6, 14), arm(22, 12)])];

export const SHEET: Sheet = {
  name: 'creature',
  w: W,
  h: H,
  tags: [
    { name: 'stand', ms: [1100, 900], frames: STAND },
    { name: 'walk', ms: 150, frames: WALK },
    { name: 'sit', ms: [1400, 1200], frames: SIT },
    { name: 'jump', ms: 1000, frames: JUMP },
    { name: 'wave', ms: 260, frames: WAVE },
    { name: 'dig', ms: 200, frames: DIG },
    { name: 'eat', ms: 300, frames: EAT },
    { name: 'front', ms: [1100, 900], frames: FRONT },
    { name: 'frontwave', ms: 260, frames: FRONT_WAVE },
  ],
};
