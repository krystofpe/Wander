// The creature, drawn by hand in parts and composed into frames: 24 × 26, facing right, paws on row 25. A small furry
// friend of the deep, dark and soft: a round body on stubby legs, a big round head with a darker band across the face
// where its eyes glow (the page lays them in, eyes.ts, where src/creature/look.ts says its head is), a pale crescent on
// its brow, long soft ears and a fluffy tail curled up, their tips glowing violet as the deep's crystal does. It trots,
// sits cat-fashion with its tail round it, pounces, waves a paw, digs, nibbles. The fur is drawn in the coat's roles
// (the page moves it to its own colour), the crescent in bone, the tips in amethyst. Legend in ../legend.ts.
import { CREATURE, HEAD } from '../../../src/creature/look.ts';
import { block, compose } from '../compose.ts';
import type { Part, Placed } from '../compose.ts';
import type { Sheet } from '../legend.ts';

const { w: W, h: H } = CREATURE;

// ── Its head (with its ears): side on, and facing you ────────────────────────

const EARS: Part = block(10, 0, [
  '..β......γ..',
  '.oβd....dγβ.',
  '.odβd..odlβo',
  '.odmo..odlLo',
  'odmmo..odllo',
  'odmo..odmllo',
]);
/** Side on: the eyes go at x 13–17, rows 9–10. */
const FACE: Part = block(9, 5, [
  '...oddddddo...',
  '..odmmmmmmmdo.',
  '.odmmmmmUUmmdo',
  'odmmmmmmmUmmmdo',
  'odmmdddddddmmdo',
  'odmddddddddddmo',
  'odmmdddddddmmlo',
  '.odmmmmmmmmmlLo',
  'od.odmmmmmmlLo.',
  '.o..oddmmmddo..',
  '......oddddo...',
]);
const HEAD_SIDE: readonly Part[] = [EARS, FACE];
/** Ears back, flat along its head (pouncing). */
const EARS_BACK: Part = block(8, 3, ['.γβdo.....', 'βγlddo....', '.oolddo...']);

const EARS_FRONT: Part = block(3, 0, [
  '..γ..........γ..',
  '.βγd........dγβ.',
  '.odβd......dβdo.',
  '.odlLo....oLldo.',
  'odmllo....ollmdo',
  'odmlo......olmdo',
]);
/** Facing you: the eyes go at x 8–12, rows 9–10. */
const FACE_FRONT: Part = block(3, 5, [
  '....odddddddo....',
  '..oddmmmmmmmddo..',
  '.odmmmmmUUmmmmdo.',
  'odmmmmmmUmmmmmmdo',
  'odmddddddddddddmo',
  'odddddddddddddddo',
  'odmddddddddddddmo',
  'o.odmmmmLLmmmmdo.',
  '..odmmmmllmmmmdo.',
  '...ooddmmmmddoo..',
]);
const HEAD_FRONT: readonly Part[] = [EARS_FRONT, FACE_FRONT];

// ── Its body ───────────────────────────────────────────────────────────────

/** Its tail curled up behind it, the tip glowing; two shapes as it sways. */
const TAILS: readonly Part[] = [
  block(0, 6, ['.γγ....', 'βγβl...', 'lLLLl..', 'dlLLm..', 'odmLm..', '.odmm..', '..odm..', '..odmm.', '...odmm', '....odm']),
  block(1, 6, ['.γγ...', 'βγβl..', 'lLLLl.', 'dlLLm.', 'odmLm.', 'odmm..', '.odm..', '.odmm.', '..odmm', '...odm']),
];
const BODY: Part = block(3, 14, [
  '..o.oddmmmmd.o..',
  '.oddmmmmmmmmmdo.',
  'oddmmllmmmmmmmdo',
  'oddmlLlmmmmmmmmo',
  'oddmmlmmmmmmmmdo',
  'oddmmmmmmmmmmmdo',
  '.oddmmmmmmmmmdo.',
  '..o.ddddddddd.o.',
]);
/** Its four stubby legs: back, back, front, front, at these columns; each leg lifted by `up` rows. */
const legs = (cols: readonly number[], up: readonly number[] = [0, 0, 0, 0]): Part => {
  const out: Record<number, (readonly [number, string])[]> = {};
  cols.forEach((x, i) => {
    const lift = up[i];
    for (let k = 0; k < 3 - lift; k++) {
      const y = 22 + k;
      out[y] ??= [];
      out[y].push([x, k === 2 - lift ? 'lLl' : 'odd']);
    }
  });
  return out;
};
const STANDING = [6, 10, 15, 18];

/** Sitting side on: haunch round at the back, front legs straight, tail along the ground. */
const BODY_SIT: Part = block(4, 13, [
  '....oddmmd.o....',
  '..oddmmmmmmmdo..',
  '.oddmmllmmmmmdo.',
  '.oddmlLlmmmmmdo.',
  'oddmmmlmmmmmmmdo',
  'oddmmmmmmmmmmmdo',
  'oddmmmmmmmmodd..',
  'oddmmmmmmmo.od..',
  '.oddmmmmmdo.od..',
  '..oddddddo..lLl.',
  '...lLl.lLl......',
]);
const TAIL_SIT: Part = block(0, 20, ['γβ......', 'βlLLlod.', '.odddo..']);

/** Facing you, sitting: the chest's pale fluff, paws together, tail round its side. */
const BODY_FRONT: Part = block(4, 14, [
  '..o.oLlLLlLo.o..',
  '..odmlLLLLLlmdo.',
  '.odmmlLLLLLlmmdo',
  '.odmmmlLLLlmmmdo',
  'odmmmmmlllmmmmdo',
  'odmmmmmmmmmmmmdo',
  'odmmmmmmmmmmmmdo',
  '.odlLlmmmmlLldo.',
  '..oddddddddddo..',
]);
const TAIL_FRONT: Part = block(17, 14, ['....γ', '...βγ', '..lLβ', '.lLl.', 'odm..', 'odm..', 'dm...', 'm....']);
/** A front paw raised (waving): side on, and facing you. */
const PAW_UP = (y: number): Part => ({ [y]: [[20, 'lL']], [y + 1]: [[19, 'dl']], [y + 2]: [[19, 'od']] });
const PAW_UP_FRONT = (y: number): Part => ({ [y]: [[17, 'lL']], [y + 1]: [[17, 'dl']], [y + 2]: [[16, 'od']], [y + 3]: [[16, 'od']] });

// ── Frames ─────────────────────────────────────────────────────────────────

const at = (part: Part, dx: number, dy: number): Placed => ({ part, dx, dy });
const all = (parts: readonly Part[], dx: number, dy: number): Placed[] => parts.map((p) => at(p, dx, dy));

/** A frame: the body parts, then the head moved as src/creature/look.ts says for this pose and frame. */
function frame(tag: keyof typeof HEAD, i: number, head: readonly Part[], body: readonly (Part | Placed)[]): string[] {
  const [dx, dy] = HEAD[tag][i];
  return compose(W, H, [...body, ...all(head, dx, dy)]);
}

// Breathing, its tail swaying.
const STAND = [0, 1].map((i) => frame('stand', i, HEAD_SIDE, [TAILS[i], BODY, legs(STANDING)]));
// A trot: diagonal legs together, a bob on the passing steps, the tail bouncing.
const WALK = [0, 1, 2, 3].map((i) => {
  const up = i === 0 ? [1, 0, 0, 1] : i === 2 ? [0, 1, 1, 0] : [0, 0, 0, 0];
  const dy = i === 1 || i === 3 ? -1 : 0;
  return frame('walk', i, HEAD_SIDE, [at(TAILS[i % 2], 0, dy), at(BODY, 0, dy), legs(STANDING, up)]);
});
const SIT = [0, 1].map((i) => frame('sit', i, HEAD_SIDE, [TAIL_SIT, at(BODY_SIT, 0, i === 1 ? 0 : 0)]));
// Pouncing: stretched, legs tucked, ears flat back.
const JUMP = [frame('jump', 0, [EARS_BACK, FACE], [at(TAILS[1], 0, -2), at(BODY, 0, -2), at(legs(STANDING, [1, 1, 1, 1]), 0, -2)])];
// Waving a front paw.
const WAVE = [0, 1].map((i) => frame('wave', i, HEAD_SIDE, [TAILS[i], BODY, legs([6, 10, 15]), PAW_UP(15 + i)]));
// Digging: its head down, its front paws scrabbling.
const DIG = [0, 1].map((i) => frame('dig', i, HEAD_SIDE, [TAILS[0], at(BODY, 0, 1), legs(STANDING, i === 0 ? [0, 0, 1, 0] : [0, 0, 0, 1])]));
// Nibbling: its head down at the ground.
const EAT = [0, 1].map((i) => frame('eat', i, HEAD_SIDE, [TAILS[i], BODY, legs(STANDING)]));
const FRONT = [0, 1].map((i) => frame('front', i, HEAD_FRONT, [i === 0 ? TAIL_FRONT : at(TAIL_FRONT, -1, 0), BODY_FRONT]));
const FRONT_WAVE = [0, 1].map((i) => frame('frontwave', i, HEAD_FRONT, [TAIL_FRONT, BODY_FRONT, PAW_UP_FRONT(13 + i)]));

export const SHEET: Sheet = {
  name: 'creature',
  w: W,
  h: H,
  tags: [
    { name: 'stand', ms: [1300, 1100], frames: STAND },
    { name: 'walk', ms: 130, frames: WALK },
    { name: 'sit', ms: [1500, 1300], frames: SIT },
    { name: 'jump', ms: 1000, frames: JUMP },
    { name: 'wave', ms: 260, frames: WAVE },
    { name: 'dig', ms: 160, frames: DIG },
    { name: 'eat', ms: 300, frames: EAT },
    { name: 'front', ms: [1300, 1100], frames: FRONT },
    { name: 'frontwave', ms: 260, frames: FRONT_WAVE },
  ],
};
