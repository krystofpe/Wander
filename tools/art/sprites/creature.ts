// The creature, drawn by rule and by hand and composed into frames: 24 × 26, facing right, its feet on row 25. A
// small creature of the hollow wearing its moss like a blanket (as in the picture it was asked to look like): a soft
// mound of moss over its back and head, lit from the upper left; under it, low at the front, its face peeking out,
// in the shadow of its moss, a small mouth (the page lays its eyes in, eyes.ts, where src/creature/look.ts says its face is); little
// mossy paws in front; on top, tiny mushrooms, one red and one sea-green, and a couple of leaves. It pads along, sits,
// hops, waves a paw, digs, nibbles, and sleeps settled low. The moss is drawn in the coat's roles (the page moves it
// to its own colour), the face in bone, the mushrooms and leaves in their own. Legend in ../legend.ts.
import { CREATURE, HEAD } from '../../../src/creature/look.ts';
import { block, compose } from '../compose.ts';
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

/** Side on: its pale face peeking out low at the front of the moss; the eyes go at x 14–18, rows 14–15. */
const FACE: Part = block(13, 12, ['..ddd...', '.dz//z..', 'dz//zzz.', 'z//zzzzz', 'z/zzzzz.', '.zzzhzz.', '..zzzz..']);
/** On top: a tiny red mushroom and a sea-green one, and two leaves. */
const CROWN: Part = { 2: [[9, '&+']], 3: [[8, '&&+&'], [14, 'PQ']], 4: [[9, 'UU'], [13, 'PPQ']], 5: [[10, 'U'], [5, 'Y.'], [14, 'U'], [17, '7']], 6: [[4, 'YM'], [17, 'Y7']], 7: [[5, 'M'], [18, 'M']] };
const HEAD_SIDE: readonly Part[] = [CROWN, FACE];
/** Facing you: its face in the middle, low; the eyes go at x 9–13, rows 14–15. */
const FACE_FRONT: Part = block(6, 12, ['..dddddddd..', '.dz//zzzzzd.', 'dz//zzzzzzzd', 'z//zzzzzzzzz', 'z/zzzzzzzzzz', '.zzzzzhzzzz.', '..zzzzzzzz..']);
const CROWN_FRONT: Part = { 2: [[8, '&+']], 3: [[7, '&&+&'], [14, 'PQ']], 4: [[8, 'UU'], [13, 'PPQ']], 5: [[9, 'U'], [4, 'Y.'], [14, 'U'], [18, '7']], 6: [[3, 'YM'], [18, 'Y7']], 7: [[4, 'M'], [19, 'M']] };
const HEAD_FRONT: readonly Part[] = [CROWN_FRONT, FACE_FRONT];
/** Asleep, settled low: the same face, lower down (the eyes shut at x 15–19, rows 19–20). */
const HEAD_CURL: readonly Part[] = [CROWN, FACE];

// ── Its paws and feet ──────────────────────────────────────────────────────

/** Its two stubby mossy feet under it, at columns `far` and `near` (their left), each lifted `up` rows. */
function feet(far: number, near: number, upFar = 0, upNear = 0): Part {
  const out: Record<number, (readonly [number, string])[]> = {};
  const add = (y: number, x: number, s: string): void => {
    out[y] = [...(out[y] ?? []), [x, s]];
  };
  for (let k = 0; k < 3; k++) {
    add(23 + k - upFar, far, k === 2 ? 'odd' : 'odm');
    add(23 + k - upNear, near, k === 2 ? 'oddo' : 'odmo');
  }
  return out;
}
const STANDING: [number, number] = [7, 13];
/** Its little mossy paws in front, under its face. */
const PAWS: Part = block(14, 19, ['.odl.odl', 'odmloddm', '.ooo.oo.']);
/** A paw raised (waving), its top at (x, y). */
const PAW_UP = (x: number, y: number): Part => block(x, y, ['.oo.', 'odLl', 'odl.', '.od.']);
/** Its paws scrabbling at the ground (digging), one forward or the other. */
const SCRABBLE = (i: number): Part => (i === 0 ? block(17, 21, ['.odl', 'odm.', 'oo..']) : block(18, 22, ['odl.', 'ooo.']));

// ── Frames ─────────────────────────────────────────────────────────────────

const at = (part: Part, dx: number, dy: number): Placed => ({ part, dx, dy });
const all = (parts: readonly Part[], dx: number, dy: number): Placed[] => parts.map((p) => at(p, dx, dy));

/** A frame: the body parts, then its face and crown moved as src/creature/look.ts says for this pose and frame. */
function frame(tag: keyof typeof HEAD, i: number, head: readonly Part[], body: readonly (Part | Placed)[]): string[] {
  const [dx, dy] = HEAD[tag][i];
  return compose(W, H, [...body, ...all(head, dx, dy)]);
}

const MOUND = mound(11.5, 15.5, 10, 9, 6.5);
const MOUND_LOW = mound(11.5, 16, 10.2, 8.5, 6.1);

// Breathing: the moss settles a pixel and rises.
const STAND = [
  frame('stand', 0, HEAD_SIDE, [feet(...STANDING), MOUND, PAWS]),
  frame('stand', 1, HEAD_SIDE, [feet(...STANDING), MOUND_LOW, at(PAWS, 0, 1)]),
];
// Padding along on its stubby feet, a bob as they pass.
const WALK = [0, 1, 2, 3].map((i) => {
  const dy = i % 2 === 1 ? -1 : 0;
  const f = i === 0 ? feet(5, 15) : i === 2 ? feet(9, 11) : i === 1 ? feet(7, 13, 1, 0) : feet(7, 13, 0, 1);
  return frame('walk', i, HEAD_SIDE, [f, at(MOUND, 0, dy), at(PAWS, 0, dy)]);
});
// Sitting low, its paws in front of it.
const SIT = [0, 1].map((i) => frame('sit', i, HEAD_SIDE, [mound(11.5, 17.5 + i * 0.5, 10.4, 9 - i * 0.5, 7), at(PAWS, 0, 3)]));
// A hop: up off its feet, its paws tucked.
const JUMP = [frame('jump', 0, HEAD_SIDE, [at(feet(...STANDING, 2, 2), 0, -2), at(mound(11.5, 13.5, 9.6, 9.4, 6.5), 0, 0), at(PAWS, 0, -3)])];
// Waving a paw.
const WAVE = [0, 1].map((i) => frame('wave', i, HEAD_SIDE, [feet(...STANDING), MOUND, block(14, 19, ['.odl', 'odml', '.ooo']), PAW_UP(19, 8 + i)]));
// Digging: leaning forward, its face low, its paws scrabbling.
const DIG = [0, 1].map((i) => frame('dig', i, HEAD_SIDE, [feet(5, 10), mound(12.5, 17.5 + i * 0.5, 10, 8.5, 6), SCRABBLE(i)]));
// Nibbling at the ground, its face down.
const EAT = [0, 1].map((i) => frame('eat', i, HEAD_SIDE, [feet(5, 10), mound(12.5, 18 + i * 0.5, 10, 8.2, 5.8), block(18, 22, ['odl', 'oo.'])]));
// Facing you: its face in the middle, its paws in front.
const MOUND_FRONT = mound(11.5, 15.5, 10, 9, 6.5, 4);
const PAWS_FRONT: Part = block(7, 19, ['.odl...odl', 'odml..odml', '.ooo...ooo']);
const FRONT = [0, 1].map((i) => frame('front', i, HEAD_FRONT, [feet(6, 13), i === 0 ? MOUND_FRONT : mound(11.5, 16, 10.2, 8.5, 6.1, 4), at(PAWS_FRONT, 0, i)]));
const FRONT_WAVE = [0, 1].map((i) => frame('frontwave', i, HEAD_FRONT, [feet(6, 13), MOUND_FRONT, block(7, 19, ['.odl', 'odml', '.ooo']), PAW_UP(18, 9 + i)]));
// Asleep, settled low with its paws in front, rising and falling.
const CURL = [0, 1].map((i) => frame('curl', i, HEAD_CURL, [mound(11.5, 19.5 + i * 0.3, 10.6, 7.5 - i * 0.4, 5.5, 2), at(PAWS, 0, 5)]));

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
