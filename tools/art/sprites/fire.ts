// The campfire and the small effects, drawn by hand: an 8-frame fire whose tongues rise in waves, bright at the base
// and fading to points (saint11's fire), embers as it dies, cold ashes, and puffs of smoke that fade by palette steps.
import { block, compose } from '../compose.ts';
import type { Part } from '../compose.ts';
import type { Sheet } from '../legend.ts';

const W = 20;
const H = 22;

/** The wood: two logs crossed low, and stones round the ring. */
const LOGS: Part = block(2, 17, ['.......t...t.......', '....n.tTt.tTt.n....', '...nNtTTTTTTTTtnN..', '..nNNnTyTTTyTnNnN..', '..NnnNnnnnnnnnNnn..']);
const ASH: Part = block(2, 18, ['.....aAaAaAaAa.....', '...nNaAAAAAAAaanN..', '..nNNnAAAAAAAnNnN..', '..NnnNnnnnnnnnNnn..']);

/** Tongue heights per column (x 5..14) for each frame: hand-picked so the waves rise and the peak wanders. */
const TONGUES: readonly (readonly number[])[] = [
  [2, 4, 6, 9, 12, 10, 7, 5, 3, 1],
  [1, 3, 6, 10, 11, 13, 8, 5, 3, 2],
  [2, 5, 6, 9, 14, 11, 7, 6, 2, 1],
  [3, 4, 7, 12, 11, 9, 8, 4, 3, 1],
  [1, 4, 8, 10, 13, 11, 7, 5, 2, 2],
  [2, 3, 6, 9, 12, 14, 9, 5, 3, 1],
  [3, 5, 7, 12, 10, 10, 8, 6, 2, 1],
  [2, 4, 6, 10, 13, 12, 6, 5, 3, 1],
];

/** Detached wisps of flame above the tongues: [x, y] per frame. */
const WISPS: readonly (readonly (readonly [number, number])[])[] = [[[9, 3]], [[10, 2], [12, 5]], [[9, 1]], [[8, 4]], [[10, 3]], [[11, 1]], [[8, 3], [11, 4]], [[10, 1]]];

function flames(frame: number, scale: number): Part {
  const out: Record<number, (readonly [number, string])[]> = {};
  const base = 18;
  TONGUES[frame].forEach((h0, i) => {
    const x = 5 + i;
    const h = Math.max(1, Math.round(h0 * scale));
    const central = i >= 3 && i <= 6;
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const c = t < 0.22 && central ? 'J' : t < 0.42 ? 'j' : t < 0.68 ? 'i' : t < 0.88 ? 'g' : 'f';
      const row = base - y;
      out[row] = [...(out[row] ?? []), [x, c]];
    }
  });
  if (scale >= 0.8)
    for (const [x, y] of WISPS[frame]) {
      const row = 18 - 14 + y;
      out[row] = [...(out[row] ?? []), [x, 'g']];
      out[row - 1] = [...(out[row - 1] ?? []), [x, 'f']];
    }
  return out;
}

const fireFrame = (i: number): string[] => compose(W, H, [LOGS, flames(i, 1)]);
const lowFrame = (i: number): string[] => compose(W, H, [LOGS, flames(i, 0.45)]);
const emberFrame = (i: number): string[] =>
  compose(W, H, [ASH, block(7, 18, [['.x.X..x.X.', '..X.x..x..', '.X..xX.x..'][i]]), block(8, 19, [['.xX.Xx.', 'X.x.xX.', '.Xx.x.X'][i]])]);

/** Puffs of smoke: one, two and three pixels, in three shades (the fade happens by changing frame). */
const PUFFS: string[][] = [
  ['w..', '...'],
  ['wv.', '...'],
  ['wv.', 'v..'],
  ['vv.', 'vu.'],
  ['vu.', 'u..'],
  ['u..', '...'],
];

export const SHEET: Sheet = {
  name: 'fire',
  w: W,
  h: H,
  tags: [
    { name: 'burn', ms: [110, 100, 120, 100, 110, 90, 120, 100], frames: [0, 1, 2, 3, 4, 5, 6, 7].map(fireFrame) },
    { name: 'low', ms: 140, frames: [0, 2, 4, 6].map(lowFrame) },
    { name: 'embers', ms: [700, 500, 800], frames: [0, 1, 2].map(emberFrame) },
    { name: 'ashes', ms: 1000, frames: [compose(W, H, [ASH])] },
    { name: 'puff', ms: 300, frames: PUFFS.map((p) => compose(W, H, [block(0, 0, p)])) },
    { name: 'splash', ms: 70, frames: [['.w.', '...'], ['w.w', '.v.'], ['v.v', '...']].map((p) => compose(W, H, [block(0, 0, p)])) },
  ],
};
