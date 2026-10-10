// The creature, drawn by rule and by hand and composed into frames: 24 × 26, facing right, its feet on row 25. A
// small fluffy ball of dark fur: tufts all round its edge, soft light on its upper side, a dark patch of face where
// its eyes glow (the page lays them in, eyes.ts, where src/creature/look.ts says its face is), a sprout of fur on its
// crown with a faintly glowing tip, small feet peeking out under it, paws that come out of the fur to wave, dig or
// hold something. It trots, sits down into a round heap, hops, digs, nibbles, and sleeps curled flat. The fur is drawn
// in the coat's roles (the page moves it to its own colour), the sprout's tip in amethyst. Legend in ../legend.ts.
import { CREATURE, HEAD } from '../../../src/creature/look.ts';
import { block, compose } from '../compose.ts';
import type { Part, Placed } from '../compose.ts';
import type { Sheet } from '../legend.ts';

const { w: W, h: H } = CREATURE;

/**
 * A ball of fur: an ellipse whose edge breaks into tufts, lit from the upper left, with short strands of fur, light
 * where it is lit and dark in its shadow; the tips of its tufts catch the light. `seed` turns the tufts.
 */
function furball(cx: number, cy: number, rx: number, ry: number, seed = 1): Part {
  const tuft = (a: number): number => 0.11 * Math.max(0, Math.sin(a * 11 + seed)) ** 1.5 + 0.04 * Math.max(0, Math.sin(a * 6 + seed * 1.7));
  const inside = (x: number, y: number): boolean => {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return Math.sqrt(dx * dx + dy * dy) <= 1 + tuft(Math.atan2(dy, dx));
  };
  const rows: string[] = [];
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      if (!inside(x, y)) {
        row += '.';
        continue;
      }
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const lit = -0.55 * dx - 0.8 * dy;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) {
        row += lit > 0.5 && Math.sqrt(dx * dx + dy * dy) > 1.02 ? 'l' : lit > 0.2 ? 'd' : 'o';
        continue;
      }
      const near = !inside(x - 2, y) || !inside(x + 2, y) || !inside(x, y - 2) || !inside(x, y + 2);
      const strand = (x * 3 + Math.floor((y + (x % 2)) / 3) * 5 + seed) % 7 === 0 && (y + (x % 2)) % 3 !== 2;
      if (lit > 0.62) row += 'L';
      else if (lit > 0.3) row += strand ? 'L' : 'l';
      else if (lit > -0.1) row += strand ? 'l' : near ? 'd' : 'm';
      else if (lit > -0.6) row += strand || near ? 'd' : 'm';
      else row += near || strand ? 'd' : 'm';
    }
    rows.push(row);
  }
  return block(0, 0, rows);
}

// ── Its face and crown (moved together, as look.ts says) ─────────────────────

/** Side on: the dark of its face; the eyes go at x 13–17, rows 10–11. */
const FACE: Part = block(12, 8, ['..ddd..', '.dhhhhd', 'dhhhhhh', 'dhhhhhd', '.dhhhhd', '..ddd..']);
/** The sprout of fur on its crown, its tip glowing faintly. */
const SPROUT: Part = block(9, 1, ['...β', '..lα', '.ld.', 'od..']);
const HEAD_SIDE: readonly Part[] = [SPROUT, FACE];
/** Facing you: the eyes go at x 9–13, rows 10–11. */
const FACE_FRONT: Part = block(7, 8, ['..ddddd..', '.dhhhhhhd', 'dhhhhhhhh', 'dhhhhhhhh', '.dhhhhhhd', '..ddhdd..']);
const SPROUT_FRONT: Part = block(10, 1, ['..β', '.lα', 'ld.', 'o..']);
const HEAD_FRONT: readonly Part[] = [SPROUT_FRONT, FACE_FRONT];
/** Asleep, curled flat: its sprout drooping over its face. */
const SPROUT_CURL: Part = block(10, 4, ['.ld..', 'l..d.', '....α']);
/** Asleep: a smaller patch of face, low on its side; the eyes shut at x 15–19, rows 18–19. */
const FACE_CURL: Part = block(12, 9, ['.ddd.', 'dhhhhd', 'dhhhhd', '.dddd.']);
const HEAD_CURL: readonly Part[] = [FACE_CURL, SPROUT_CURL];

// ── Its feet, paws and tail ────────────────────────────────────────────────

/** Its two feet under the fur, at columns `far` and `near` (their left), each lifted `up` rows. */
function feet(far: number, near: number, upFar = 0, upNear = 0): Part {
  const out: Record<number, (readonly [number, string])[]> = {};
  const add = (y: number, x: number, s: string): void => {
    out[y] = [...(out[y] ?? []), [x, s]];
  };
  for (let k = 0; k < 4; k++) {
    const yf = 22 + k - upFar;
    if (yf <= 25 - upFar) add(yf, far, k === 3 ? 'oll' : k === 2 ? 'oddd' : 'odd');
    const yn = 22 + k - upNear;
    if (yn <= 25 - upNear) add(yn, near, k === 3 ? 'olLL' : 'oddo');
  }
  return out;
}
const STANDING: [number, number] = [7, 13];
/** A little fluffy tail at its back. */
const TAIL: Part = block(0, 16, ['.oo.', 'odlo', 'odd.', '.o..']);
/** A paw out of the fur at its front: resting, and raised (waving) at row `y`. */
const PAW: Part = block(18, 15, ['od', 'dl', 'o.']);
const PAW_UP = (x: number, y: number): Part => block(x, y, ['.oo.', 'odLl', 'odl.', 'od..', '.o..']);
/** Its front paws scrabbling at the ground (digging), the one forward or the other. */
const SCRABBLE = (i: number): Part => (i === 0 ? block(17, 21, ['.od.', 'odlL', '.o..']) : block(18, 22, ['odl.', '.olL']));

// ── Frames ─────────────────────────────────────────────────────────────────

const at = (part: Part, dx: number, dy: number): Placed => ({ part, dx, dy });
const all = (parts: readonly Part[], dx: number, dy: number): Placed[] => parts.map((p) => at(p, dx, dy));

/** A frame: the body parts, then its face moved as src/creature/look.ts says for this pose and frame. */
function frame(tag: keyof typeof HEAD, i: number, head: readonly Part[], body: readonly (Part | Placed)[]): string[] {
  const [dx, dy] = HEAD[tag][i];
  return compose(W, H, [...body, ...all(head, dx, dy)]);
}

const BALL = furball(11.5, 13.5, 8.5, 8.5);
const BALL_LOW = furball(11.5, 14, 8.6, 8);
// Breathing: the ball settles a pixel and rises.
const STAND = [
  frame('stand', 0, HEAD_SIDE, [feet(...STANDING), TAIL, BALL, PAW]),
  frame('stand', 1, HEAD_SIDE, [feet(...STANDING), at(TAIL, 0, 1), BALL_LOW, at(PAW, 0, 1)]),
];
// A trot on small feet: one foot forward and the other back, a bob as they pass.
const WALK = [0, 1, 2, 3].map((i) => {
  const dy = i % 2 === 1 ? -1 : 0;
  const f = i === 0 ? feet(5, 15) : i === 2 ? feet(9, 11) : i === 1 ? feet(7, 13, 1, 0) : feet(7, 13, 0, 1);
  return frame('walk', i, HEAD_SIDE, [f, at(TAIL, 0, dy), at(BALL, 0, dy), at(PAW, 0, dy)]);
});
// Sitting down into a round heap, its feet poking out in front.
const SIT = [0, 1].map((i) => frame('sit', i, HEAD_SIDE, [block(12, 24, ['oddo.oddo', 'olLL.olLL']), at(TAIL, 0, 5), furball(11.5, 16 + i * 0.5, 9.2, 8.2 - i * 0.5)]));
// A hop: stretched up, its feet tucked.
const JUMP = [frame('jump', 0, HEAD_SIDE, [at(feet(...STANDING, 2, 2), 0, -2), at(TAIL, 0, -3), furball(11.5, 11.5, 8.2, 9.2), at(PAW, 0, -3)])];
// Waving a paw out of the fur.
const WAVE = [0, 1].map((i) => frame('wave', i, HEAD_SIDE, [feet(...STANDING), TAIL, BALL, PAW_UP(18, 4 + i)]));
// Digging: leaning forward, its face low, its paws scrabbling.
const DIG = [0, 1].map((i) => frame('dig', i, HEAD_SIDE, [feet(6, 11), at(TAIL, 0, 3), furball(12.5, 15.5 + i * 0.5, 8.5, 7.5), SCRABBLE(i)]));
// Nibbling at the ground, its face down.
const EAT = [0, 1].map((i) => frame('eat', i, HEAD_SIDE, [feet(6, 11), at(TAIL, 0, 3), furball(12.5, 16 + i * 0.5, 8.5, 7.2), block(19, 22, ['od', 'dl'])]));
// Facing you, breathing.
const BALL_FRONT = furball(11.5, 13.5, 8.5, 8.5, 4);
const FRONT = [0, 1].map((i) => frame('front', i, HEAD_FRONT, [feet(7, 12), i === 0 ? BALL_FRONT : furball(11.5, 14, 8.6, 8, 4)]));
const FRONT_WAVE = [0, 1].map((i) => frame('frontwave', i, HEAD_FRONT, [feet(7, 12), BALL_FRONT, PAW_UP(18, 4 + i)]));
// Asleep, curled flat on the ground, rising and falling.
const CURL = [0, 1].map((i) => frame('curl', i, HEAD_CURL, [furball(12, 19.5 + i * 0.5, 10, 6 - i * 0.5, 2)]));

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
    { name: 'curl', ms: [1800, 1800], frames: CURL },
  ],
};
