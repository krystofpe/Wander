// The creature, drawn by rule and by hand and composed into frames: 24 × 26, facing right, its feet on row 25. A
// small spirit of moss: a soft mound, round on top and wide at the bottom, mossy all over, lit from the upper left;
// a tuft of grass blades on its crown; little twig arms held out at its sides; two stubby feet of dark root; a small
// smile and a blush under its eyes (the page lays the eyes in, eyes.ts, where src/creature/look.ts says its face
// is); tiny flowers growing on it that glow. It waddles, sits with its feet out in front, hops, waves, digs, nibbles,
// and sleeps settled flat. The moss is drawn in the coat's roles (the page moves it to its own colour), the feet in
// bark, the flowers in glowing roles. Legend in ../legend.ts.
import { CREATURE, HEAD } from '../../../src/creature/look.ts';
import { block, compose, stroke } from '../compose.ts';
import type { Part, Placed } from '../compose.ts';
import type { Sheet } from '../legend.ts';

const { w: W, h: H } = CREATURE;

/**
 * A mound of moss centred on (cx, cy): `top` rows high above its middle, `bottom` below, `rx` to each side. Its edge
 * breaks into small soft tufts; lit from the upper left, with flecks of lighter moss where it is lit and darker in its
 * shadow; the tips of its tufts catch the light. `seed` turns the tufts and flecks.
 */
function mound(cx: number, cy: number, rx: number, top: number, bottom: number, seed = 1): Part {
  const tuft = (a: number): number => 0.07 * Math.max(0, Math.sin(a * 12 + seed)) ** 1.5 + 0.035 * Math.max(0, Math.sin(a * 5 + seed * 1.7));
  const inside = (x: number, y: number): boolean => {
    const dx = (x - cx) / rx;
    const dy = (y - cy) / (y < cy ? top : bottom);
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
      const dy = (y - cy) / top;
      const lit = -0.5 * dx - 0.85 * dy;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      if (edge) {
        row += lit > 0.75 && Math.sqrt(dx * dx + dy * dy) > 0.98 ? 'l' : lit > 0.45 ? 'd' : 'o';
        continue;
      }
      const near = !inside(x - 2, y) || !inside(x + 2, y) || !inside(x, y - 2) || !inside(x, y + 2);
      // Flecks of moss: a scatter of single lighter or darker pixels, never two side by side.
      const fleck = ((x * 7 + y * 11 + seed * 3) % 9 === 0 || (x * 5 + y * 3 + seed) % 13 === 0) && (x + y) % 2 === 0;
      if (lit > 0.85) row += fleck ? 'l' : 'L';
      else if (lit > 0.45) row += fleck ? 'L' : 'l';
      else if (lit > 0.05) row += fleck ? 'l' : near ? 'd' : 'm';
      else if (lit > -0.45) row += fleck ? 'd' : near ? 'd' : 'm';
      else row += fleck ? 'm' : 'd';
    }
    rows.push(row);
  }
  return block(0, 0, rows);
}

// ── Its face and crown (moved together, as look.ts says) ─────────────────────

/** Blades of grass from its crown, lighter at their tips, swayed `sway` (−1, 0, 1) at the top. */
function blades(x0: number, y0: number, sway = 0): Part {
  const BLADES: readonly (readonly [number, number, number])[] = [
    // root x, tip x, tip y (from y0)
    [2, 0, 3],
    [3, 2, 0],
    [4, 5, -1],
    [5, 6, 1],
    [6, 8, 0],
    [7, 9, 3],
  ];
  const out: Record<number, (readonly [number, string])[]> = {};
  for (const [rx, tx, ty] of BLADES) {
    const p = stroke(x0 + tx + sway, y0 + ty, x0 + rx, y0 + 6, 'l', 'L');
    for (const [k, segs] of Object.entries(p)) out[Number(k)] = [...(out[Number(k)] ?? []), ...segs];
  }
  return out;
}
/** Side on: a small smile under the eyes (which go at x 13–17, rows 12–13), a blush either side. */
const FACE: Part = { 14: [[12, '·'], [18, '·']], 15: [[14, 'h'], [17, 'h']], 16: [[15, 'hh']] };
const CROWN = blades(6, 1);
const HEAD_SIDE: readonly Part[] = [CROWN, FACE];
/** Facing you: the eyes go at x 9–13, rows 12–13. */
const FACE_FRONT: Part = { 14: [[7, '··'], [14, '··']], 15: [[9, 'h'], [13, 'h']], 16: [[10, 'hhh']] };
const HEAD_FRONT: readonly Part[] = [CROWN, FACE_FRONT];
/** Asleep, settled flat: its blades lying over, its face low on its side (the eyes shut at x 15–19, rows 18–19). */
const FACE_CURL: Part = { 14: [[12, '·']], 15: [[14, 'hh']] };
const CROWN_CURL: Part = { 7: [[4, 'Ll']], 8: [[2, 'L.lll']], 9: [[1, 'L.l.dd']], 10: [[3, 'ldd']] };
const HEAD_CURL: readonly Part[] = [CROWN_CURL, FACE_CURL];

// ── Its arms, feet and flowers ─────────────────────────────────────────────

/** Its feet of dark root, at columns `far` and `near` (their left), each lifted `up` rows. */
function feet(far: number, near: number, upFar = 0, upNear = 0): Part {
  const out: Record<number, (readonly [number, string])[]> = {};
  const add = (y: number, x: number, s: string): void => {
    out[y] = [...(out[y] ?? []), [x, s]];
  };
  for (let k = 0; k < 3; k++) {
    add(23 + k - upFar, far, k === 0 ? ')[' : k === 1 ? ')[[' : '())');
    add(23 + k - upNear, near, k === 0 ? '[]]' : k === 1 ? '[]][' : ')[[(');
  }
  return out;
}
const STANDING: [number, number] = [6, 12];
/** Its near arm, a little twig held out at its side, its fingers forked; and the far one behind. */
const ARM: Part = block(19, 13, ['...l', '..ld', 'odd.', 'od..']);
const ARM_FAR: Part = block(0, 13, ['o...', 'do..', '.do.']);
/** An arm raised (waving), at its tip (x, y). */
const ARM_UP = (x: number, y: number): Part => block(x, y, ['.l.l', '.ld.', 'od..', 'od..', 'o...']);
/** Its arms scrabbling at the ground (digging), one forward or the other. */
const SCRABBLE = (i: number): Part => (i === 0 ? block(18, 19, ['..od', '.odl', 'od..']) : block(18, 20, ['.odl', 'odd.']));
/** Tiny flowers growing in its moss, glowing faintly. */
const FLOWERS: Part = { 11: [[5, '•']], 16: [[4, '$']], 19: [[9, 'β']] };
const FLOWERS_FRONT: Part = { 11: [[16, '•']], 17: [[4, '$']], 19: [[15, 'β']], 12: [[6, 'β']] };

// ── Frames ─────────────────────────────────────────────────────────────────

const at = (part: Part, dx: number, dy: number): Placed => ({ part, dx, dy });
const all = (parts: readonly Part[], dx: number, dy: number): Placed[] => parts.map((p) => at(p, dx, dy));

/** A frame: the body parts, then its face and crown moved as src/creature/look.ts says for this pose and frame. */
function frame(tag: keyof typeof HEAD, i: number, head: readonly Part[], body: readonly (Part | Placed)[]): string[] {
  const [dx, dy] = HEAD[tag][i];
  return compose(W, H, [...body, ...all(head, dx, dy)]);
}

const MOUND = mound(11.5, 16.5, 9.5, 9.5, 6);
const MOUND_LOW = mound(11.5, 17, 9.7, 9, 5.6);
const side = (dy: number, body: Part = MOUND): (Part | Placed)[] => [at(ARM_FAR, 0, dy), at(body, 0, dy), at(FLOWERS, 0, dy)];

// Breathing: the mound settles a pixel and rises.
const STAND = [
  frame('stand', 0, HEAD_SIDE, [feet(...STANDING), ...side(0), ARM]),
  frame('stand', 1, HEAD_SIDE, [feet(...STANDING), ...side(0, MOUND_LOW), at(ARM, 0, 1)]),
];
// A waddle on its root feet, one forward and one back, a bob as they pass.
const WALK = [0, 1, 2, 3].map((i) => {
  const dy = i % 2 === 1 ? -1 : 0;
  const f = i === 0 ? feet(4, 14) : i === 2 ? feet(8, 10) : i === 1 ? feet(6, 12, 1, 0) : feet(6, 12, 0, 1);
  return frame('walk', i, HEAD_SIDE, [f, ...side(dy), at(ARM, 0, dy + (i % 2 === 0 ? 0 : -1))]);
});
// Sitting, its feet out in front of it.
const SIT_FEET: Part = { 22: [[14, '[]]'], [18, '[]]']], 23: [[13, '[]]]['], [17, '[]]][']], 24: [[13, ')[[[(.)[[[(']], 25: [[14, '()(..()((']] };
const SIT = [0, 1].map((i) => frame('sit', i, HEAD_SIDE, [at(ARM_FAR, 0, 2), mound(11.5, 18.5 + i * 0.5, 9.8, 9.5 - i * 0.5, 5.5), at(FLOWERS, 0, 2), SIT_FEET, at(ARM, 0, 2)]));
// A hop: up off its feet, its arms out, its blades swaying back.
const JUMP = [frame('jump', 0, [blades(6, 1, -1), FACE], [at(feet(...STANDING, 2, 2), 0, -2), ...side(-2, mound(11.5, 14.5, 9.2, 9.8, 6)), ARM_UP(20, 8)])];
// Waving its near arm.
const WAVE = [0, 1].map((i) => frame('wave', i, HEAD_SIDE, [feet(...STANDING), ...side(0), ARM_UP(19, 6 + i)]));
// Digging: leaning forward, its face low, its arms scrabbling.
const DIG = [0, 1].map((i) => frame('dig', i, HEAD_SIDE, [feet(5, 10), at(ARM_FAR, 0, 3), mound(12.5, 18.5 + i * 0.5, 9.5, 8.5, 5.5), at(FLOWERS, 1, 3), SCRABBLE(i)]));
// Nibbling at the ground, its face down.
const EAT = [0, 1].map((i) => frame('eat', i, HEAD_SIDE, [feet(5, 10), at(ARM_FAR, 0, 3), mound(12.5, 19 + i * 0.5, 9.5, 8.2, 5.2), at(FLOWERS, 1, 3), block(19, 21, ['od', 'dl'])]));
// Facing you: both arms held out at its sides, its feet in front.
const ARMS_FRONT: Part = { 13: [[0, 'l'], [22, 'l']], 14: [[0, 'dl'], [21, 'ld']], 15: [[1, 'ddo'], [20, 'odd']], 16: [[2, 'do'], [20, 'od']] };
const ARM_FRONT_LEFT: Part = { 13: [[0, 'l']], 14: [[0, 'dl']], 15: [[1, 'ddo']], 16: [[2, 'do']] };
const ARM_FRONT_UP: Part = block(19, 6, ['l.l', '.ld', '.do', 'odd', 'od.']);
const FEET_FRONT: Part = { 22: [[5, '[]]['], [15, '[]][']], 23: [[4, '[]]]]['], [14, '[]]]][']], 24: [[4, ')[[[[('], [14, ')[[[[(']], 25: [[5, '()()'], [15, '()()']] };
const MOUND_FRONT = mound(11.5, 16.5, 9.5, 9.5, 6, 4);
const FRONT = [0, 1].map((i) => frame('front', i, HEAD_FRONT, [FEET_FRONT, ARMS_FRONT, i === 0 ? MOUND_FRONT : mound(11.5, 17, 9.7, 9, 5.6, 4), FLOWERS_FRONT]));
const FRONT_WAVE = [0, 1].map((i) => frame('frontwave', i, HEAD_FRONT, [FEET_FRONT, ARM_FRONT_LEFT, MOUND_FRONT, FLOWERS_FRONT, at(ARM_FRONT_UP, 0, i)]));
// Asleep, settled flat on the ground, rising and falling.
const CURL = [0, 1].map((i) => frame('curl', i, HEAD_CURL, [mound(12, 21.5 + i * 0.3, 10.5, 6.5 - i * 0.4, 3.5, 2), { 21: [[6, '•']], 23: [[16, 'β']] }]));

export const SHEET: Sheet = {
  name: 'creature',
  w: W,
  h: H,
  tags: [
    { name: 'stand', ms: [1300, 1100], frames: STAND },
    { name: 'walk', ms: 150, frames: WALK },
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
