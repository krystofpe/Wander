// The creature's home in the deep: a nest of moss at the foot of a giant mushroom that leans over it. Generated, not
// drawn by hand: a pale stem flaring at its root, a broad dusky cap lit from the upper left with glowing spots, glowing
// gills under it and threads of light hanging from its rim, as the deep's caps have; under it a bowl of moss with twigs
// and small glowing flowers round its rim. `back` is the mushroom and the bowl's far side and inside; `front` is the
// bowl's near lip, drawn over the creature curled in it. The page hangs its lantern from the cap's rim (NEST.peg).
import { NEST } from '../../../src/creature/look.ts';
import { unit } from '../../../src/noise.ts';
import type { Sheet } from '../legend.ts';

const { w: W, h: H } = NEST;
const SEED = 0x4e57;
const GROUND = H - 1;

const grid = (): string[][] => Array.from({ length: H }, () => Array.from({ length: W }, () => '.'));
const put = (g: string[][], x: number, y: number, c: string): void => {
  if (x >= 0 && x < W && y >= 0 && y < H) g[y][x] = c;
};

/** The bowl of moss: an ellipse ring round its hollow, the near half (`front`) or the far half and the inside. */
function bowl(g: string[][], front: boolean): void {
  const cx = NEST.door.x;
  const cy = GROUND - 3;
  const rx = NEST.door.w / 2 + 3;
  const ry = 5;
  for (let y = cy - ry - 1; y <= GROUND; y++)
    for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const r = Math.sqrt(dx * dx + dy * dy);
      // A lumpy rim of moss.
      const lump = 0.12 * unit(x, SEED ^ 0x1) + 0.06 * Math.sin(x * 1.3);
      if (r > 1 + lump) continue;
      const rim = r > 0.62;
      const near = y > cy;
      if (front !== (near && rim)) continue;
      const n = unit(x * 7 + y * 13, SEED);
      if (!rim) g[y][x] = n > 0.8 ? 'a' : 'V';
      else {
        // Lit on top, shaded below.
        const top = dy < -0.3 || (near && dy < 0.5);
        g[y][x] = top ? (n > 0.55 ? '7' : 'Y') : n > 0.5 ? 'Y' : 'M';
      }
    }
  // Twigs sticking out of the rim, and small glowing flowers on it.
  const twigs: readonly (readonly [number, number, string])[] = front
    ? [
        [cx - rx - 1, cy + 1, ')'],
        [cx - rx - 2, cy + 2, '('],
        [cx + rx + 1, cy + 2, ')'],
      ]
    : [
        [cx - rx + 1, cy - ry, ')'],
        [cx - rx, cy - ry - 1, '('],
        [cx + rx - 2, cy - ry, '('],
        [cx + rx - 1, cy - ry - 1, ')'],
      ];
  for (const [x, y, c] of twigs) put(g, x, y, c);
  for (let k = 0; k < 7; k++) {
    const x = Math.round(cx - rx + 2 + (k / 6) * (2 * rx - 4) + (unit(k, SEED ^ 0x2) - 0.5) * 2);
    const half = Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2));
    const y = Math.round(front ? cy + ry * half * 0.75 : cy - ry * half - 0.3);
    if (front !== (k % 2 === 0)) continue;
    put(g, x, y, k % 3 === 0 ? 'β' : '@');
    put(g, x, y - 1, k % 3 === 0 ? 'α' : '#');
  }
}

/** The giant mushroom: its stem rising behind the nest's far end, leaning over it, and its broad cap. */
function mushroom(g: string[][]): void {
  const base = NEST.stem;
  const top = 17;
  // The stem: pale, shaded as a cylinder lit from the left, leaning left as it rises, flaring at its root.
  for (let y = top; y <= GROUND; y++) {
    const t = (y - top) / (GROUND - top);
    const lean = Math.round((1 - t) * (1 - t) * 6);
    const half = 3 + (t > 0.82 ? Math.round((t - 0.82) * 22) : 0);
    const cx = base - lean;
    for (let x = cx - half; x <= cx + half; x++) {
      const u = (x - (cx - half)) / (2 * half);
      g[y][x] = x === cx - half || x === cx + half ? 'h' : u < 0.25 ? 'U' : u < 0.55 ? '/' : 'z';
    }
  }
  // The cap: a broad dome over the nest; its top dusky violet, lit from the upper left, glowing spots on it.
  const ccx = 30;
  const ccy = 19;
  const rx = 28;
  const ry = 13;
  for (let y = ccy - ry; y <= ccy; y++)
    for (let x = ccx - rx; x <= ccx + rx; x++) {
      const dx = (x - ccx) / rx;
      const dy = (y - ccy) / ry;
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 1) continue;
      const lit = -0.6 * dx - 0.7 * dy;
      const n = unit(x * 5 + y * 11, SEED ^ 0x3);
      g[y][x] = r > 0.93 ? (lit > 0.6 ? ';' : 'h') : lit > 0.95 ? ';' : lit > 0.55 ? (n > 0.8 ? ';' : ':') : n > 0.85 ? ':' : 'h';
      if (r < 0.88 && n > 0.965) g[y][x] = lit > 0.5 ? 'γ' : 'β';
    }
  // Its gills underneath, glowing, darker in towards the stem; and threads of light hanging from its rim.
  for (let x = ccx - rx + 2; x <= ccx + rx - 2; x++) {
    const toStem = Math.abs(x - (base - 6)) / rx;
    for (let k = 1; k <= 3; k++) {
      if (k === 3 && toStem < 0.3) continue;
      put(g, x, ccy + k, x % 2 === 0 ? (k === 1 ? '@' : '#') : k === 1 ? '#' : 'P');
    }
  }
  for (let k = 0; k < 9; k++) {
    const x = Math.round(ccx - rx + 3 + (k / 8) * (2 * rx - 6));
    if (Math.abs(x - (base - 6)) < 4 || Math.abs(x - NEST.peg[0]) < 2) continue;
    const len = 2 + Math.round(unit(k, SEED ^ 0x4) * 5);
    for (let j = 0; j < len; j++) put(g, x, ccy + 4 + j, j === len - 1 ? '$' : '#');
  }
  // The thread its lantern hangs from.
  for (let y = ccy + 1; y < NEST.peg[1]; y++) put(g, NEST.peg[0], y, 'K');
}

function back(): string[] {
  const g = grid();
  mushroom(g);
  bowl(g, false);
  return g.map((r) => r.join(''));
}

function front(): string[] {
  const g = grid();
  bowl(g, true);
  return g.map((r) => r.join(''));
}

export const SHEET: Sheet = {
  name: 'nest',
  w: W,
  h: H,
  tags: [
    { name: 'back', ms: 1000, frames: [back()] },
    { name: 'front', ms: 1000, frames: [front()] },
  ],
};
