// The creature's home under the canopy: the great tree at the edge of the scene, drawn for the left edge (the page
// turns it round for the right), with the hollow at its foot. Generated, not drawn by hand: a trunk shaded as a
// cylinder lit from the open side, furrowed bark, roots spreading over the ground, moss on the roots, and an arched
// opening whose inside is all darkness. `base` stands on the ground (its last row); `trunk` repeats upward off the
// top of the screen. A lantern hangs on a peg by the door. And for the open lands a turf shelter with a low door.
import { TREE } from '../../../src/creature/look.ts';
import { unit } from '../../../src/noise.ts';
import type { Sheet } from '../legend.ts';

const BARK = ['(', ')', '[', ']'];
const MOSS = ['V', 'M', 'Y', '7'];
const SEED = 0x7ee;

/** Its sizes, shared with the scene and the page (src/creature/look.ts). */
const TRUNK = TREE.trunk;
const BASE_W = TREE.w;
const BASE_H = TREE.h;
const TILE_H = TREE.tile;

/** A furrow's darkness at a column: long vertical streaks that wander a little with height (in step with the tile). */
function furrow(x: number, y: number): number {
  const wobble = Math.round((unit(Math.floor(y / 8) % (TILE_H / 8), SEED ^ 0x51) - 0.5) * 2);
  const c = x + wobble;
  const a = unit(Math.floor(c / 3), SEED ^ 0xf00);
  const b = unit(c, SEED ^ 0xf01);
  return a > 0.62 ? 2 : a > 0.4 || b > 0.85 ? 1 : 0;
}

/** The bark at a column of a trunk `w` wide whose left edge is at `x0`: cylinder shading, lit from the right. */
function bark(x: number, y: number, x0: number, w: number): string {
  const t = (x - x0 + 0.5) / w;
  if (t < 0 || t > 1) return '.';
  // Lit face toward the open side (right), the far side in shadow; outline at both edges.
  if (x - x0 < 1 || x0 + w - 1 - x < 1) return '(';
  const light = Math.sin(Math.PI * t) * 0.55 + t * 0.6;
  let k = light > 0.75 ? 3 : light > 0.5 ? 2 : light > 0.28 ? 1 : 0;
  k = Math.max(0, k - furrow(x, y));
  // Here and there a lighter ridge between furrows catches the light.
  if (k < 3 && furrow(x, y) === 0 && unit(x * 97 + (Math.floor(y / 4) % (TILE_H / 4)), SEED ^ 0xab) > 0.93) k++;
  return BARK[k];
}

function grid(w: number, h: number): string[][] {
  return Array.from({ length: h }, () => new Array<string>(w).fill('.'));
}

/** Moss climbing the shaded side in streaks, in step with the tile. */
function moss(g: string[][], w: number, y0: number, y1: number, phase: number): void {
  for (let y = y0; y < y1; y++)
    for (let x = 1; x < w * 0.42; x++) {
      if (!BARK.includes(g[y][x])) continue;
      const streak = unit(Math.floor(x / 2), SEED ^ 0x3051);
      const band = unit(Math.floor(x / 2) * 31 + (Math.floor((y + phase) / 8) % (TILE_H / 8)), SEED ^ 0x3052);
      const t = x / (w * 0.42);
      if (streak > 0.55 && band > 0.35 + t * 0.5) g[y][x] = band > 0.85 ? 'M' : 'V';
    }
}

/** A knot in the bark: a dark hollow ring, its rim catching the light on the open side. */
function knot(g: string[][], cx: number, cy: number, rx: number, ry: number): void {
  for (let y = -ry - 1; y <= ry + 1; y++)
    for (let x = -rx - 1; x <= rx + 1; x++) {
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      const gy = cy + y;
      const gx = cx + x;
      if (gy < 0 || gy >= g.length || gx < 0 || gx >= g[0].length || !BARK.includes(g[gy][gx])) continue;
      if (d < 0.45) g[gy][gx] = '(';
      else if (d < 1) g[gy][gx] = x > 0 ? ']' : ')';
      else if (d < 1.5 && x > 0) g[gy][gx] = '[';
    }
}

/** A bracket fungus on the bark: a pale shelf with a shadow under it. */
function bracket(g: string[][], x0: number, y0: number, w: number): void {
  for (let i = 0; i < w; i++) {
    const h = Math.round(Math.sin(((i + 0.5) / w) * Math.PI) * 2);
    for (let j = 0; j <= h; j++) g[y0 - j][x0 + i] = j === h ? 'U' : 'n';
    g[y0 + 1][x0 + i] = '(';
  }
}

/** A segment of the trunk, seamless top to bottom: furrowed bark, moss on the shaded side, a knot, a fungus. */
function trunkTile(): string[] {
  const g = grid(TRUNK, TILE_H);
  for (let y = 0; y < TILE_H; y++) for (let x = 0; x < TRUNK; x++) g[y][x] = bark(x, y, 0, TRUNK);
  moss(g, TRUNK, 0, TILE_H, 0);
  knot(g, 52, 38, 3, 5);
  bracket(g, 14, 96, 9);
  bracket(g, 21, 101, 6);
  return g.map((r) => r.join(''));
}

/** The foot of the tree: the trunk flaring into roots over the ground, the hollow, moss, a peg with its lantern. */
function base(lantern: boolean): string[] {
  const g = grid(BASE_W, BASE_H);
  for (let y = 0; y < BASE_H; y++) {
    // The trunk flares toward the ground: at the top it is TRUNK wide; over the last 30 rows its right side spreads
    // out into the roots.
    const flare = Math.max(0, (y - (BASE_H - 34)) / 34);
    const w = Math.round(TRUNK + flare * flare * (BASE_W - TRUNK - 12));
    // Its top row follows on from the bottom row of the trunk's segment above it.
    for (let x = 0; x < w; x++) g[y][x] = bark(x, y % TILE_H, 0, w);
  }
  // Roots: humps running out to the right over the ground, each with its own lit top.
  const roots = [
    { x: TRUNK, len: 42, h: 8 },
    { x: TRUNK - 14, len: 32, h: 5 },
    { x: TRUNK + 20, len: 26, h: 4 },
  ];
  for (const r of roots) {
    for (let i = 0; i < r.len; i++) {
      const x = r.x + i;
      if (x >= BASE_W) break;
      const t = i / r.len;
      const top = Math.round(r.h * (1 - t) * (1 - t)) + 1;
      for (let dy = 0; dy < top; dy++) {
        const y = BASE_H - 1 - dy;
        g[y][x] = dy === top - 1 ? ']' : dy === top - 2 ? '[' : ')';
      }
      g[BASE_H - 1 - top][x] = '(';
    }
  }
  // Moss up the shaded side, as on the trunk above.
  moss(g, TRUNK, 0, BASE_H - 30, 0);
  // The hollow: an arch in the trunk's face near its open side, all darkness inside, a pale worn lip round it.
  const cx = TREE.door.x;
  const hw = 10;
  const top = BASE_H - 30;
  for (let y = top; y < BASE_H; y++) {
    const fromTop = y - top;
    const half = fromTop < hw ? Math.round(Math.sqrt(hw * hw - (hw - fromTop) * (hw - fromTop))) : hw;
    for (let x = cx - half - 1; x <= cx + half + 1; x++) {
      const inside = x >= cx - half && x <= cx + half;
      if (inside) g[y][x] = 'h';
      else g[y][x] = x > cx ? ']' : '(';
    }
    if (half > 0) {
      g[y][cx - half - 2] = ')';
      g[y][cx + half + 2] = '[';
    }
  }
  // The threshold: a worn root across the foot of the door.
  for (let x = cx - hw - 1; x <= cx + hw + 1; x++) g[BASE_H - 1][x] = x % 3 === 0 ? ')' : '[';
  // Moss on the roots and the lower bark, thicker on the shaded side.
  for (let y = BASE_H - 26; y < BASE_H; y++)
    for (let x = 0; x < BASE_W; x++) {
      const c = g[y][x];
      if (!BARK.includes(c)) continue;
      if (Math.abs(x - cx) <= hw + 2 && y >= top - 1) continue;
      const above = y === 0 || !BARK.includes(g[y - 1][x]);
      const chance = (above ? 0.75 : 0.18) * (1 - (x / BASE_W) * 0.5) * ((y - (BASE_H - 26)) / 26);
      if (unit(x * 131 + y * 7, SEED ^ 0x3055) < chance) g[y][x] = MOSS[Math.min(3, Math.floor(unit(x + y * 53, SEED ^ 0x3056) * 3) + (above ? 1 : 0))];
    }
  // A peg by the door, and the lantern hanging from it (lit at night: the fire roles glow).
  const [px, py] = [TREE.peg[0], TREE.peg[1] - 1];
  g[py][px] = 'k';
  g[py][px + 1] = 'K';
  if (lantern) {
    const rows = ['.S.', 'SZS', 'SgS', 'SiS', 'ZZZ'];
    rows.forEach((r, i) => {
      for (let j = 0; j < 3; j++) if (r[j] !== '.') g[py + 1 + i][px + j] = r[j];
    });
  }
  return g.map((r) => r.join(''));
}

/** A turf shelter for the open lands: a low mound of earth with grass on top and a dark doorway. `snow` for the cold. */
function shelter(snow: boolean): string[] {
  const W = 44;
  const H = 26;
  const g = grid(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x - W / 2 + 0.5) / (W / 2);
      const dy = (H - y - 0.5) / H;
      if (dx * dx + dy * dy * 1.05 > 1) continue;
      const edge = dx * dx + dy * dy * 1.05 > 0.86;
      // Lit from the open side, rounding away into shadow on the far side.
      const shade = dx * 0.7 + dy * 0.5 + (unit(x * 7 + y * 13, SEED) - 0.5) * 0.25;
      const topLayer = dy > 0.6 + Math.sin(x * 0.9) * 0.04 || (edge && dy > 0.3);
      if (topLayer) g[y][x] = snow ? (edge ? '{' : shade > 0.55 ? '|' : '}') : edge ? '9' : shade > 0.55 ? '=' : '0';
      else g[y][x] = edge ? 'a' : shade > 0.3 ? (unit(x * 7 + y, SEED) > 0.75 ? 'n' : 'A') : unit(x * 3 + y * 5, SEED) > 0.85 ? '"' : 'a';
    }
  // The door: a low arch facing the open side.
  const cx = 28;
  for (let y = H - 13; y < H; y++) {
    const half = y < H - 9 ? Math.round(Math.sqrt(Math.max(0, 16 - (H - 9 - y) * (H - 9 - y)))) : 4;
    for (let x = cx - half; x <= cx + half; x++) g[y][x] = 'h';
  }
  return g.map((r) => r.join(''));
}

export const SHEET_BASE_W = BASE_W;

export const SHEET: Sheet = {
  name: 'hollow',
  w: BASE_W,
  h: BASE_H,
  tags: [
    { name: 'base', ms: 1000, frames: [base(false)] },
    { name: 'lit', ms: 1000, frames: [base(true)] },
  ],
};

/** The trunk's repeating segment and the shelters are sheets of their own sizes. */
export const MORE: readonly Sheet[] = [
  { name: 'trunk', w: TRUNK, h: TILE_H, tags: [{ name: 'tile', ms: 1000, frames: [trunkTile()] }] },
  {
    name: 'shelter',
    w: 44,
    h: 26,
    tags: [
      { name: 'turf', ms: 1000, frames: [shelter(false)] },
      { name: 'snow', ms: 1000, frames: [shelter(true)] },
    ],
  },
];
