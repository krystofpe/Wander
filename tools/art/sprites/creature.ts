// The creature, drawn by hand in parts and composed into frames: 24 × 26, facing right, floating with its wisp on row
// 25. A moth of the deep in a mask: a pale bone mask with two dark sockets (the page lays its glowing eyes in them,
// eyes.ts, where src/creature/look.ts says its head is), feathery antennae that curl at the tips, a collar of pale
// mist, dusty wings folded like a roof over its back with a staring eyespot on each, a small dark body, and below it a
// curl of mist instead of legs. Frightening at a glance, and very small and round. When it waves, its wings flare and
// both eyespots stare. The wings and body are drawn in the coat's roles (the page moves them to its own colour), the
// collar and wisp in mist, the mask in bone, the sockets in the hood's darkness. Legend in ../legend.ts.
import { CREATURE, HEAD } from '../../../src/creature/look.ts';
import { block, compose } from '../compose.ts';
import type { Part, Placed } from '../compose.ts';
import type { Sheet } from '../legend.ts';

const { w: W, h: H } = CREATURE;

// ── Its head: antennae, the tuft between them, the mask ─────────────────────

/** Side on: the antennae swept back, curling at the tips, a tuft of fur behind the mask. */
const ANTENNAE: Part = block(1, 0, [
  '.LL...LL.....',
  'L.lL.L.lL....',
  '.l.ll.l.ll...',
  '..l.lm.l.lm..',
  '....mm...mm..',
]);
const TUFT: Part = block(7, 4, [
  '.o.od..',
  'odmmdo.',
  'odmmmd.',
]);
/** The mask, three-quarters on: two sockets either side of a bone bridge (the eyes go at x 14–18, rows 9–10). */
const MASK: Part = block(11, 5, [
  '..z////z..',
  '.z/UUUUU/.',
  'z/UUUUUUU/',
  'z/hhhUhhh/',
  'z/hhhUhhhz',
  'z/hhhUhhhz',
  'z/UhUUUhU/',
  'z/UUUUUUU/',
  '.z/UUUUU/.',
  '..z/UUU/z.',
  '...zzzz...',
]);
const HEAD_SIDE: readonly Part[] = [ANTENNAE, TUFT, MASK];

/** Facing you: the antennae in a V, the tufts, the mask with its little crack under the bridge. */
const ANTENNAE_FRONT: Part = block(1, 0, [
  '.LL..................LL.',
  'L.lL................Ll.L',
  '.l.ll..............ll.l.',
  '..l.lm............ml.l..',
  '....mm............mm....',
]);
const TUFT_FRONT: Part = block(6, 4, ['.o.od.od.od.', 'odmmdmmdmmdo']);
const MASK_FRONT: Part = block(7, 5, [
  '...z///z...',
  '.zz/UUU/zz.',
  'z/UUUUUUU/z',
  'z/hhhUhhh/z',
  'z/hhhUhhh/z',
  'z/hhhUhhh/z',
  'z/UhUUUhU/z',
  'z/UUUUUUU/z',
  '.z/UU/UU/z.',
  '..z/UUU/z..',
  '...zzzzz...',
]);
const HEAD_FRONT: readonly Part[] = [ANTENNAE_FRONT, TUFT_FRONT, MASK_FRONT];

// ── Its body ───────────────────────────────────────────────────────────────

/** Wings folded like a roof over its back: a long dusty triangle, a pale band, a staring eyespot. */
const WING: Part = block(0, 6, [
  '.........od.',
  '........odm.',
  '.......odml.',
  '......odmml.',
  '.....odmmll.',
  '....odml//l.',
  '...odml/hh/.',
  '..odmml/he/.',
  '.odmmmml//l.',
  'odllllllll..',
  'odmmmmmmml..',
  '.odmmmmml...',
  '..oodddo....',
  '....oo......',
]);
/** A wing raised over its back, the eyespot turned to the world. */
const WING_UP: Part = block(0, 1, [
  'od..........',
  'odm.........',
  '.odml.......',
  '.odm//l.....',
  '..o/hh/l....',
  '..o/he/ml...',
  '...od//mml..',
  '....odmmmml.',
  '.....odmmmml',
  '......odmmml',
  '......odddo.',
]);
/** Folded flat at its sides, sitting. */
const WING_SIT: Part = block(0, 13, [
  '......odm...',
  '.....odml...',
  '....odml//..',
  '...odml/hh/.',
  '..odmml/he/.',
  '.odmmmml//l.',
  'odllllllll..',
  'oodddddddo..',
]);
/** Facing you: both wings half seen behind it, each with its eyespot. */
const WINGS_FRONT: Part = block(0, 9, [
  'od....................do',
  'odm..................mdo',
  'odml................lmdo',
  'od//l..............l//do',
  'o/hh/............../hh/o',
  'o/eh/............../he/o',
  'od//l..............l//do',
  'odllll............lllldo',
  '.odmml............lmmdo.',
  '..odml............lmdo..',
  '...odm............mdo...',
  '....oo............oo....',
]);
/** Facing you, flared wide: both eyespots stare. */
const WINGS_OPEN: Part = block(0, 3, [
  'oo....................oo',
  'odo..................odo',
  'odmo................omdo',
  'odmlo..............olmdo',
  'od//lo............ol//do',
  'o/hh/l............l/hh/o',
  'o/eh/l............l/he/o',
  'od//lm............ml//do',
  'odllllm..........mlllldo',
  '.odmmml..........lmmmdo.',
  '..odmml..........lmmdo..',
  '...odml..........lmdo...',
  '....odm..........mdo....',
  '.....oo..........oo.....',
]);

/** The collar of pale mist under the mask, side on and facing you. */
const COLLAR: Part = block(8, 15, [
  'w.wvw.wvwww.w',
  '.vwwwwwwwwwv.',
  'uvwwvwwwvwwv.',
  '.u.uv.uv.u...',
]);
const COLLAR_FRONT: Part = block(4, 15, [
  '.w.wvwwwwwwvw.w.',
  'vwwwwwwwwwwwwwwv',
  'uvwwvwwwwwwvwwvu',
  '.u.uv.uvvu.vu.u.',
]);

const BODY: Part = block(8, 17, [
  '..oddmmmmo..',
  '.oddmmmmmmo.',
  '.oddmmmmmmo.',
  '..oddmmmmo..',
  '...oddmmo...',
]);
const BODY_FRONT: Part = block(7, 18, ['.oddmmmmmdo', 'oddmmmmmmmdo', '.oddmmmmmdo', '..oddmmmdo.']);
const BODY_SIT: Part = block(7, 19, ['.oddmmmmmmo..', 'oddmmmmmmmmo.', 'oddmmmmmmmmo.']);

/** Its tiny paws: at its front, at its face (eating), down at the ground (digging). */
const PAW: Part = { 20: [[17, 'll']] };
const PAWS_FACE: Part = { 15: [[17, 'lL']], 16: [[18, 'l']] };
const pawsDown = (y: number): Part => ({ [y]: [[19, 'lL']], [y + 1]: [[20, 'll']] });

/** The curl of mist it floats on, in a few shapes that take turns. */
const WISPS: readonly Part[] = [
  block(5, 22, ['.....vwwv...', '...uvwv.....', '..uv.....w..', '.u..........']),
  block(5, 22, ['.....vwwv...', '....uvwv....', '...uv....w..', '..u.........']),
  block(5, 22, ['....vwwv....', '..uvwv......', '.uv......w..', 'u...........']),
];
const WISPS_FRONT: readonly Part[] = [
  block(6, 22, ['...vwwwv....', '...uvw......', '..uv...w....', '.u..........']),
  block(6, 22, ['...vwwwv....', '....vwu.....', '....w..vu...', '.........u..']),
];
/** Settled: the mist pooled flat under it. */
const POOL: Part = block(3, 23, ['...uvwwwwwwvu...', '.uvvwwvwwvwwvvu.', 'u..vu.v..u.vu..u']);
/** Rising: the wisp drawn out long below it. */
const TRAIL: Part = block(7, 21, ['...vwwv...', '...uvw....', '....vu....', '...u..w...', '....u.....']);

// ── Frames ─────────────────────────────────────────────────────────────────

const at = (part: Part, dx: number, dy: number): Placed => ({ part, dx, dy });
const all = (parts: readonly Part[], dx: number, dy: number): Placed[] => parts.map((p) => at(p, dx, dy));

/** A frame: the body parts (each placed), then the head moved as src/creature/look.ts says for this pose and frame. */
function frame(tag: keyof typeof HEAD, i: number, head: readonly Part[], body: readonly (Part | Placed)[]): string[] {
  const [dx, dy] = HEAD[tag][i];
  return compose(W, H, [...body, ...all(head, dx, dy)]);
}

// Breathing: it rises and sinks a pixel, its wisp curling.
const STAND = [
  frame('stand', 0, HEAD_SIDE, [WING, BODY, WISPS[0], COLLAR, PAW]),
  frame('stand', 1, HEAD_SIDE, [at(WING, 0, 1), at(BODY, 0, 1), WISPS[1], at(COLLAR, 0, 1), at(PAW, 0, 1)]),
];
// Drifting along: a bob, the wings lifting a little on the up beats, the wisp trailing behind.
const WALK = [0, 1, 2, 3].map((i) => {
  const dy = i === 1 || i === 2 ? -1 : 0;
  const wing = i === 1 || i === 3 ? at(WING_UP, 2, 6 + dy) : at(WING, 0, dy);
  return frame('walk', i, HEAD_SIDE, [wing, at(BODY, 0, dy), WISPS[i === 3 ? 2 : i], at(COLLAR, 0, dy), at(PAW, 0, dy)]);
});
// Settled on its pool of mist, the wings folded flat, the head sunk into its collar.
const SIT = [0, 1].map((i) => frame('sit', i, HEAD_SIDE, [WING_SIT, BODY_SIT, POOL, at(COLLAR, 0, 4 + i), at(PAW, 0, 3 + i)]));
const JUMP = [frame('jump', 0, HEAD_SIDE, [at(WING_UP, 1, 0), at(BODY, 0, -2), TRAIL, at(COLLAR, 0, -2), at(PAW, 0, -2)])];
// Waving: a wing flares up over its back and down again.
const WAVE = [
  frame('wave', 0, HEAD_SIDE, [WING_UP, BODY, WISPS[0], COLLAR, PAW]),
  frame('wave', 1, HEAD_SIDE, [at(WING_UP, 1, 2), BODY, WISPS[1], COLLAR, PAW]),
];
// Bent down to dig: the mask low, the paws scratching at the ground.
const DIG = [0, 1].map((i) => frame('dig', i, HEAD_SIDE, [at(WING, -1, 3), at(BODY, 1, 3), POOL, at(COLLAR, 2, 4), pawsDown(22 + i)]));
const EAT = [0, 1].map((i) => frame('eat', i, HEAD_SIDE, [WING, BODY, WISPS[i], COLLAR, at(PAWS_FACE, 0, i)]));
const FRONT = [
  frame('front', 0, HEAD_FRONT, [WINGS_FRONT, BODY_FRONT, WISPS_FRONT[0], COLLAR_FRONT]),
  frame('front', 1, HEAD_FRONT, [at(WINGS_FRONT, 0, 1), at(BODY_FRONT, 0, 1), WISPS_FRONT[1], at(COLLAR_FRONT, 0, 1)]),
];
// Waving at you: the wings flare wide, both eyespots staring, and fold half back.
const FRONT_WAVE = [
  frame('frontwave', 0, HEAD_FRONT, [WINGS_OPEN, BODY_FRONT, WISPS_FRONT[0], COLLAR_FRONT]),
  frame('frontwave', 1, HEAD_FRONT, [at(WINGS_OPEN, 0, 3), BODY_FRONT, WISPS_FRONT[1], COLLAR_FRONT]),
];

export const SHEET: Sheet = {
  name: 'creature',
  w: W,
  h: H,
  tags: [
    { name: 'stand', ms: [1100, 900], frames: STAND },
    { name: 'walk', ms: 170, frames: WALK },
    { name: 'sit', ms: [1400, 1200], frames: SIT },
    { name: 'jump', ms: 1000, frames: JUMP },
    { name: 'wave', ms: 240, frames: WAVE },
    { name: 'dig', ms: 200, frames: DIG },
    { name: 'eat', ms: 300, frames: EAT },
    { name: 'front', ms: [1100, 900], frames: FRONT },
    { name: 'frontwave', ms: 240, frames: FRONT_WAVE },
  ],
};
