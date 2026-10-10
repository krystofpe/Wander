// The old trees that frame the hollow at the sides of the view (web/creature/hollow.ts), drawn for the left edge (the
// page turns them round for the right): `foot` stands on the ground, the trunk flaring into roots that run out over
// it; `tile` repeats up the trunk into the canopy. Generated, not drawn by hand: bark shaded as a gnarled cylinder lit
// from the open side, furrows wandering up it, knots, moss on the shaded side and the roots. No door. Legend in
// ../legend.ts.
import { EDGE } from '../../../src/creature/look.ts';
import { unit } from '../../../src/noise.ts';
import type { Sheet } from '../legend.ts';

const BARK = ['(', ')', '[', ']'];
const MOSS = ['V', 'M', 'Y', '7'];
const SEED = 0x900d;
const { trunk: T, footW: FW, footH: FH, tile: TH } = EDGE;

/** How far the trunk's open edge wanders in at height y (in step with the tile, so the trunk is seamless). */
const wander = (y: number): number => Math.round(3 * Math.sin((y / TH) * Math.PI * 2) + 2 * Math.sin((y / TH) * Math.PI * 6 + 1));

/** A furrow's darkness: long streaks that wander with height, in step with the tile. */
function furrow(x: number, y: number): number {
  const c = x + Math.round(2 * Math.sin((y / TH) * Math.PI * 4 + x * 0.3));
  const a = unit(Math.floor(c / 3), SEED ^ 0xf00);
  return a > 0.66 ? 2 : a > 0.42 ? 1 : 0;
}

/** The bark at a column of a trunk `w` wide: shaded as a cylinder lit from its open (right) side. */
function bark(x: number, y: number, w: number): string {
  const t = (x + 0.5) / w;
  if (t < 0 || t > 1) return '.';
  if (w - 1 - x < 1) return '(';
  const light = Math.sin(Math.PI * t) * 0.45 + t * 0.65;
  let k = light > 0.8 ? 3 : light > 0.55 ? 2 : light > 0.3 ? 1 : 0;
  k = Math.max(0, k - furrow(x, y));
  return BARK[k];
}

const grid = (w: number, h: number): string[][] => Array.from({ length: h }, () => new Array<string>(w).fill('.'));

/** Moss in streaks up the shaded side; `phase` keeps the tile and the foot in step. */
function moss(g: string[][], y0: number, y1: number, phase: number): void {
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < T * 0.45; x++) {
      if (!BARK.includes(g[y][x])) continue;
      const streak = unit(Math.floor(x / 2), SEED ^ 0x3051);
      const band = unit(Math.floor(x / 2) * 31 + (Math.floor((y + phase) / 7) % (TH / 7)), SEED ^ 0x3052);
      if (streak > 0.5 && band > 0.4 + (x / (T * 0.45)) * 0.45) g[y][x] = band > 0.85 ? 'M' : 'V';
    }
}

/** A knot: a dark hollow ring, its rim catching the light on the open side. */
function knot(g: string[][], cx: number, cy: number, rx: number, ry: number): void {
  for (let y = -ry - 1; y <= ry + 1; y++)
    for (let x = -rx - 1; x <= rx + 1; x++) {
      const gy = cy + y;
      const gx = cx + x;
      if (gy < 0 || gy >= g.length || gx < 0 || gx >= g[0].length || !BARK.includes(g[gy][gx])) continue;
      const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
      if (d < 0.45) g[gy][gx] = '(';
      else if (d < 1) g[gy][gx] = x > 0 ? ']' : ')';
    }
}

/** A segment of the trunk, seamless top to bottom: its open edge wandering, furrowed bark, moss, a knot. */
function tile(): string[] {
  const g = grid(T, TH);
  for (let y = 0; y < TH; y++) {
    const w = T - 4 + wander(y);
    for (let x = 0; x < w; x++) g[y][x] = bark(x, y, w);
  }
  moss(g, 0, TH, 0);
  knot(g, Math.round(T * 0.62), Math.round(TH * 0.35), 3, 5);
  knot(g, Math.round(T * 0.4), Math.round(TH * 0.8), 2, 3);
  return g.map((r) => r.join(''));
}

/** The foot: the trunk flaring toward the ground, roots running out over it, moss on them. */
function foot(): string[] {
  const g = grid(FW, FH);
  for (let y = 0; y < FH; y++) {
    const flare = Math.max(0, (y - (FH - 48)) / 48);
    const w = Math.round(T - 4 + wander(y % TH) * (1 - flare) + flare * flare * (FW * 0.72 - T));
    for (let x = 0; x < w; x++) g[y][x] = bark(x, y % TH, w);
  }
  moss(g, 0, FH - 30, 0);
  // Roots: humps running out to the right over the ground, each with its own lit top.
  const roots = [
    { x: T - 6, len: Math.round(FW * 0.55), h: 16 },
    { x: T - 22, len: Math.round(FW * 0.45), h: 10 },
    { x: T + 18, len: Math.round(FW * 0.4), h: 7 },
  ];
  for (const r of roots)
    for (let i = 0; i < r.len; i++) {
      const x = r.x + i;
      if (x >= FW) break;
      const t = i / r.len;
      const top = Math.round(r.h * (1 - t) * (1 - t)) + 1;
      for (let dy = 0; dy < top; dy++) g[FH - 1 - dy][x] = dy === top - 1 ? ']' : dy === top - 2 ? '[' : ')';
      g[FH - 1 - top][x] = '(';
    }
  // Moss thick on the roots and the lower bark.
  for (let y = FH - 28; y < FH; y++)
    for (let x = 0; x < FW; x++) {
      if (!BARK.includes(g[y][x])) continue;
      const above = y === 0 || !BARK.includes(g[y - 1][x]);
      const chance = (above ? 0.8 : 0.2) * ((y - (FH - 28)) / 28);
      if (unit(x * 131 + y * 7, SEED ^ 0x3055) < chance) g[y][x] = MOSS[Math.min(3, Math.floor(unit(x + y * 53, SEED ^ 0x3056) * 3) + (above ? 1 : 0))];
    }
  knot(g, Math.round(T * 0.55), Math.round(FH * 0.3), 3, 4);
  return g.map((r) => r.join(''));
}

export const SHEET: Sheet = {
  name: 'edge',
  w: FW,
  h: FH,
  tags: [{ name: 'foot', ms: 1000, frames: [foot()] }],
};

/** The trunk's repeating segment is a sheet of its own size. */
export const MORE: readonly Sheet[] = [{ name: 'edgetrunk', w: T, h: TH, tags: [{ name: 'tile', ms: 1000, frames: [tile()] }] }];
