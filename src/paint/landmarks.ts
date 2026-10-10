// The landmarks, drawn: rare sights made by nothing but time and weather. Something enormous, long dead, half in the
// ground; a lone ancient tree on a rise; an arch worn through a hill; a great boulder the ice left behind; a fallen
// giant with its roots in the air; a tor of stacked stone, or a boulder balanced on a pillar; a waterfall off a cliff;
// stacks of rock standing in the sea; spires of banded rock; a dead tree drowned in a pool. Each stands on the layer
// that suits its size, drawn at that layer's scale in the plants' manner: roles, never colours; rock faces turned
// left and right, lit as the sun goes round; leaves lit from the upper left; clean clusters, no noise. Pure.
import type { LandmarkKind } from '../biomes.ts';
import { PX_PER_M } from '../layers.ts';
import type { LayerDef } from '../layers.ts';
import { fbm1, rng, unit } from '../noise.ts';
import { ROLES, role } from '../palette.ts';
import { landmarksBetween } from '../world.ts';
import type { Landmark } from '../world.ts';
import { FLAG, newStamp, put } from './chunk.ts';
import type { Stamp } from './chunk.ts';
import { cached, cleanup, clump, line, rock, sway } from './plants.ts';

/** The layer each landmark stands on. */
export const MARK_ON: Readonly<Record<LandmarkKind, string>> = {
  snag: 'mid',
  lonetree: 'hills',
  erratic: 'near',
  fallen: 'near',
  skeleton: 'hills',
  arch: 'hills',
  tor: 'hills',
  waterfall: 'hills',
  spires: 'hills',
  stacks: 'farhills',
};

/** Rows a landmark stands below its layer's ground: the sea stacks rise out of the sea, in front of the far shore. */
const SINK: Partial<Record<LandmarkKind, number>> = { stacks: 10 };

/** Rows the land rises under a landmark on a land layer: the lone tree stands on a rise of its own. */
const RISE: Partial<Record<LandmarkKind, number>> = { lonetree: 12 };

/**
 * A landmark on a layer: its column, its stamp, how far it reaches either side, how far it is sunk, and how far the
 * land rises under it.
 */
export type Placed = { readonly mark: Landmark; readonly u: number; readonly stamp: Stamp; readonly half: number; readonly sink: number; readonly rise: number };

/** Landmarks standing on this layer near columns [u0, u1). */
export function marksOn(seed: number, layer: LayerDef, u0: number, u1: number): Placed[] {
  const out: Placed[] = [];
  const z = layer.z;
  const reach = 120;
  for (const m of landmarksBetween(seed, ((u0 - 400) * z) / PX_PER_M - reach, ((u1 + 400) * z) / PX_PER_M + reach)) {
    if (MARK_ON[m.kind] !== layer.name) continue;
    const u = Math.round((m.at * PX_PER_M) / z);
    const s = markStamp(m);
    const half = Math.ceil(s.w / 2);
    if (u + half + 40 < u0 || u - half - 40 >= u1) continue;
    out.push({ mark: m, u, stamp: s, half, sink: SINK[m.kind] ?? 0, rise: RISE[m.kind] ?? 0 });
  }
  return out;
}

/**
 * How much the ground is levelled for a landmark at column `u` (1 under it, easing to 0 a little beyond), so it
 * stands on a flat plot instead of hanging off a slope.
 */
export function levelling(p: Placed, u: number): number {
  const d = Math.abs(u - p.u) - p.half;
  if (d <= 2) return 1;
  // A rise eases out gently, as a swell of the land; a plot is levelled only just past its edges.
  const ease = p.rise > 0 ? 70 : 26;
  if (d >= ease) return 0;
  const t = 1 - d / ease;
  return t * t * (3 - 2 * t);
}

/** A landmark's stamp: one of a few of its kind, by its cell. */
export function markStamp(m: Landmark): Stamp {
  const v = m.cell & 3;
  switch (m.kind) {
    case 'skeleton':
      return skeleton(v);
    case 'lonetree':
      return lonetree(v);
    case 'arch':
      return arch(v);
    case 'erratic':
      return erratic(v);
    case 'fallen':
      return fallen(v);
    case 'tor':
      return tor(v);
    case 'waterfall':
      return waterfall(v);
    case 'stacks':
      return stacks(v);
    case 'spires':
      return spires(v);
    case 'snag':
      return snag(v);
  }
}

// ── Drawing helpers ────────────────────────────────────────────────────────

const R = FLAG.RIM;
const fam = (name: string, steps: number): number[] => Array.from({ length: steps }, (_, i) => role(name, i));

function fill(s: Stamp, x0: number, y0: number, x1: number, y1: number, r: number, f: number = R): void {
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) put(s, x, y, r, f);
}

/** A role `n` steps darker in its own family (never past its darkest). */
const darker = (r: number, n: number): number => r - Math.min(n, ROLES[r].step);

/** Copies a small stamp into a big one, its root at column x and its foot on row y (as stamp() does on a layer). */
function blit(s: Stamp, src: Stamp, x: number, y: number, flip = false, dim = 0): void {
  const left = x - src.ax;
  const top = y - src.h + 1;
  for (let sy = 0; sy < src.h; sy++)
    for (let sx = 0; sx < src.w; sx++) {
      const r = src.roles[sy * src.w + (flip ? src.w - 1 - sx : sx)];
      if (r !== 0) put(s, left + sx, top + sy, darker(r, dim), src.flags[sy * src.w + (flip ? src.w - 1 - sx : sx)]);
    }
}

/** A shape as a mask, 1 where it is. */
type Mask = { readonly w: number; readonly h: number; readonly m: Uint8Array };
const newMask = (w: number, h: number): Mask => ({ w, h, m: new Uint8Array(w * h) });
const on = (k: Mask, x: number, y: number): boolean => x >= 0 && x < k.w && y >= 0 && y < k.h && k.m[y * k.w + x] === 1;
function mark(k: Mask, x: number, y: number, v = 1): void {
  x = Math.round(x);
  y = Math.round(y);
  if (x >= 0 && x < k.w && y >= 0 && y < k.h) k.m[y * k.w + x] = v;
}

/** Fills a polygon into a mask (even-odd, pixel centres). */
function polygon(k: Mask, pts: readonly (readonly [number, number])[]): void {
  for (let y = 0; y < k.h; y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      if (y0 <= yc === y1 <= yc) continue;
      xs.push(x0 + ((yc - y0) / (y1 - y0)) * (x1 - x0));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i] - 0.5); x <= Math.floor(xs[i + 1] - 0.5); x++) mark(k, x, y);
  }
}

/** Takes the sharp corners off a mask: lone pixels, and the upper corners of steps in its outline. */
function soften(k: Mask): void {
  const copy = k.m.slice();
  const at = (x: number, y: number): boolean => x >= 0 && x < k.w && y >= 0 && y < k.h && copy[y * k.w + x] === 1;
  for (let y = 0; y < k.h; y++)
    for (let x = 0; x < k.w; x++) {
      if (!at(x, y)) continue;
      const u = at(x, y - 1);
      const d = at(x, y + 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const n = (u ? 1 : 0) + (d ? 1 : 0) + (l ? 1 : 0) + (r ? 1 : 0);
      if (n <= 1 || (n === 2 && !u && d && l !== r)) k.m[y * k.w + x] = 0;
    }
}

type RockStyle = {
  /** Bed lines across it (see beds()): shared by the masses of one formation, so its strata run level through all. */
  readonly beds?: Uint8Array;
  /** Facets: the mean size of the flat planes it is broken into (0: one face to each side, split down the middle). */
  readonly facets?: number;
  /** Where along each row's run the face turned left gives way to the face turned right (0..1), when not faceted. */
  readonly split?: number;
  /** The share of each vertical run, from its foot, that lies in shade. */
  readonly low?: number;
  /** Steps darker all over (a mass further back). */
  readonly dark?: number;
  /** Whether some facets face down into shade (a boulder's underside); a cliff's face has none. */
  readonly under?: boolean;
};

/**
 * The bed lines of a bedded rock, w × h: lines at uneven spacing, level or tilted a little, each broken into dashes
 * of uneven length, stepping a row now and then; 1 where a line runs.
 */
function beds(seed: number, w: number, h: number, near: number, far: number, tilt = 0): Uint8Array {
  const out = new Uint8Array(w * h);
  const random = rng(seed);
  for (let y = Math.floor(random() * far) - Math.ceil(Math.abs(tilt) * w); y < h + Math.abs(tilt) * w; y += near + Math.floor(random() * (far - near + 1))) {
    let row = y;
    for (let x = -Math.floor(random() * 8); x < w; ) {
      const dash = 8 + Math.floor(random() * 28);
      for (let i = 0; i < dash; i++) {
        const yy = row + Math.round((x + i) * tilt);
        if (x + i >= 0 && x + i < w && yy >= 0 && yy < h) out[yy * w + x + i] = 1;
      }
      x += dash + 1 + Math.floor(random() * 3);
      if (random() < 0.2) row += random() < 0.5 ? -1 : 1;
      if (Math.abs(row - y) > 1) row = y;
    }
  }
  return out;
}

/**
 * Paints a mass of rock from its mask, as rocks are painted (plants.ts rock): faces turned left and right, lit in turn
 * as the sun goes round (each row split down the middle, or the mass broken into flat facets, each facing its own way);
 * a few pixels on a crest catching the light; the lower part of every face, the underside of an overhang and the foot
 * in shade; the bed lines of its strata across it.
 */
function shadeRock(s: Stamp, k: Mask, seed: number, o: RockStyle = {}): void {
  const Rk = fam('rock', 5);
  const split = o.split ?? 0.45;
  const low = o.low ?? 0.4;
  const dark = o.dark ?? 0;
  // Facets: seeds on a jittered grid inside the mass, each a plane facing left, right, up or down.
  const seeds: { x: number; y: number; b: number }[] = [];
  if ((o.facets ?? 0) > 0) {
    const f = o.facets ?? 1;
    let x0 = k.w;
    let x1 = 0;
    let y0 = k.h;
    let y1 = 0;
    for (let y = 0; y < k.h; y++)
      for (let x = 0; x < k.w; x++)
        if (on(k, x, y)) {
          x0 = Math.min(x0, x);
          x1 = Math.max(x1, x);
          y0 = Math.min(y0, y);
          y1 = Math.max(y1, y);
        }
    const random = rng(seed ^ 0xfac);
    for (let gy = y0; gy <= y1; gy += f)
      for (let gx = x0; gx <= x1; gx += f) {
        const x = Math.round(gx + random() * f);
        const y = Math.round(gy + random() * f * 0.8);
        if (!on(k, x, y)) continue;
        const rx = (x - x0) / Math.max(1, x1 - x0);
        let up = 0;
        while (on(k, x, y - up - 1)) up++;
        const r = random();
        const b = up < f * 0.5 && r < 0.55 ? 4 : o.under !== false && (y - y0) / Math.max(1, y1 - y0) > 0.72 && r < 0.4 ? 1 : (rx < 0.5) !== r < 0.2 ? 2 : 3;
        seeds.push({ x, y, b });
      }
  }
  const facetAt = (x: number, y: number): number => {
    let best = 2;
    let bd = Infinity;
    for (const sd of seeds) {
      const d = (sd.x - x) ** 2 + ((sd.y - y) * 1.3) ** 2;
      if (d < bd) {
        bd = d;
        best = sd.b;
      }
    }
    return best;
  };
  for (let y = 0; y < k.h; y++) {
    let x = 0;
    while (x < k.w) {
      if (!on(k, x, y)) {
        x++;
        continue;
      }
      let x1 = x;
      while (on(k, x1 + 1, y)) x1++;
      const cut = x + Math.round((x1 - x) * split);
      for (let xx = x; xx <= x1; xx++) {
        let up = 0;
        while (on(k, xx, y - up - 1)) up++;
        let down = 0;
        while (on(k, xx, y + down + 1)) down++;
        let b = seeds.length > 0 ? facetAt(xx, y) : xx <= cut ? 2 : 3;
        if (b === 4 && up > 6) b = xx <= cut ? 2 : 3;
        if (down < (up + down + 1) * low && b !== 1) b = 1;
        if (up === 0 && x1 - x > 2 && xx > x && xx <= cut && unit(xx * 7 + y, seed ^ 0x51) < 0.6) b = 4;
        // The underside of an overhang, where it is more than a pixel's ledge at the edge.
        const under = (xq: number, dy: number): boolean => on(k, xq, y) && !on(k, xq, y + dy);
        if (down === 0 && under(xx - 1, 1) && under(xx + 1, 1)) b = 0;
        else if (down === 1 && b > 1 && under(xx - 1, 2) && under(xx + 1, 2)) b = 1;
        if (o.beds !== undefined && (b === 2 || b === 3) && o.beds[y * k.w + xx] === 1 && xx > x && xx < x1 && up > 1) b = 1;
        put(s, xx, y, Rk[Math.max(0, b - dark)], R);
      }
      x = x1 + 1;
    }
  }
}

/** A thick limb: discs along a polyline, thinning from r0 to r1, lit along its top. */
function limb(s: Stamp, pts: readonly (readonly [number, number])[], r0: number, r1: number, roles: readonly number[], f = R): void {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let done = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = Math.hypot(bx - ax, by - ay);
    for (let t = 0; t <= len; t += 0.5) {
      const k = (done + t) / Math.max(1, total);
      const r = r0 + (r1 - r0) * k;
      const cx = ax + ((bx - ax) * t) / Math.max(0.001, len);
      const cy = ay + ((by - ay) * t) / Math.max(0.001, len);
      const R2 = Math.ceil(r);
      for (let dy = -R2; dy <= R2; dy++)
        for (let dx = -R2; dx <= R2; dx++) {
          if (dx * dx + dy * dy > r * r + 0.3) continue;
          const lit = dy < -r * 0.35 || (dx < -r * 0.4 && dy < r * 0.3);
          put(s, Math.round(cx + dx), Math.round(cy + dy), r < 1.2 ? roles[1] : lit ? roles[2] : dy > r * 0.55 ? roles[0] : roles[1], f);
        }
    }
    done += len;
  }
}

/** A path from (x, y) at `angle` (radians from straight up, positive to the right), bending as it goes. */
function bough(random: () => number, x: number, y: number, angle: number, length: number, parts: number, bend: number, lift = 0): [number, number][] {
  const pts: [number, number][] = [[x, y]];
  let a = angle;
  for (let i = 0; i < parts; i++) {
    a += (random() - 0.5) * bend - lift * Math.sign(a) * (i / parts);
    x += Math.sin(a) * (length / parts);
    y -= Math.cos(a) * (length / parts);
    pts.push([x, y]);
  }
  return pts;
}

/** A tuft of grass blades at the foot of something, swaying. */
function blades(s: Stamp, random: () => number, x: number, y: number, n: number, h: number, family = 'grass'): void {
  const G = fam(family, family === 'grass' ? 5 : 4);
  for (let i = 0; i < n; i++) {
    const bx = x + i - (n >> 1);
    const bh = Math.max(2, Math.round(h * (0.5 + 0.5 * random())));
    const lean = (random() - 0.5) * 2;
    for (let j = 0; j < bh; j++) {
      const t = j / bh;
      put(s, Math.round(bx + lean * t * t), y - j, G[Math.min(G.length - 1, 1 + Math.floor(t * 2.5) + (i % 2))], sway(bh - j, bh + 2, 5));
    }
  }
}

// ── The mid layer (9 px a metre) ───────────────────────────────────────────

/**
 * A lone tree, huge and very old, alone on a rise of the land (RISE): a squat trunk flaring into roots, furrowed, a hole where a limb
 * was lost; great limbs climbing into a broad crown massed of leaf clumps, lit from the upper left and darkening
 * underneath, the limbs showing in its gaps; one limb dead and bare, out past the leaves. Its leaves are the biome's:
 * green on the meadow, the colours of the season in the autumn hills.
 */
function lonetree(v: number): Stamp {
  return cached(`mark:lonetree:${v}`, () => {
    const random = rng(0x10e7 + v * 7919);
    const W = 212;
    const H = 128;
    const s = newStamp(W, H, W >> 1);
    const B = fam('bark', 4);
    const L = fam('leaf', 5);
    // It stands on a rise of the land itself (RISE): its foot is the stamp's foot, sunk a row into the ground.
    const ground: number[] = new Array<number>(W).fill(H - 2);
    const cx = (W >> 1) + Math.round((random() - 0.5) * 10);
    const base = ground[cx] + 1;
    const trunkH = 34 + Math.round(random() * 5);
    const top = base - trunkH;
    const lean = (random() - 0.5) * 6;
    const mid = (y: number): number => cx + (lean * (base - y)) / trunkH + Math.sin((base - y) / 8 + v) * 1.2;
    const half = (y: number): number => {
      const t = (base - y) / trunkH;
      return 8 - 2.5 * t + (t > 0.8 ? (t - 0.8) * 25 : 0);
    };
    // The crown: a broad dome of lobes over the trunk, wider than it is tall.
    const ccx = mid(top) + (random() - 0.5) * 8;
    const ccy = top - 30;
    const rx = 80;
    const ry = 42;
    const lobes: { x: number; y: number; r: number }[] = [];
    const n = 10;
    for (let i = 0; i < n; i++) {
      const ang = Math.PI * (1.06 - (1.12 * i) / (n - 1));
      lobes.push({ x: ccx + Math.cos(ang) * rx * 0.74 + (random() - 0.5) * 10, y: ccy - Math.sin(ang) * ry * 0.62 + (random() - 0.5) * 6, r: 15 + random() * 8 });
    }
    for (let i = 0; i < 4; i++) lobes.push({ x: ccx + (random() - 0.5) * 70, y: ccy + (random() - 0.3) * 14, r: 16 + random() * 6 });
    // A notch or two in the crown where the sky shows through.
    const gaps = [0, 1].map(() => ({ x: ccx + (random() - 0.5) * 100, y: ccy + 10 + random() * 14, r: 5 + random() * 3 }));
    const inside = (x: number, y: number): boolean => lobes.some((l) => (x - l.x) ** 2 + (y - l.y) ** 2 < l.r * l.r) && !gaps.some((g) => (x - g.x) ** 2 + (y - g.y) ** 2 < g.r * g.r);
    type Leaves = { x: number; y: number; r: number; darker: number };
    const clumps: Leaves[] = [];
    const cell = 7;
    for (let gy = 0; gy < H; gy += cell)
      for (let gx = 0; gx < W; gx += cell) {
        const x = gx + random() * cell;
        const y = gy + random() * cell;
        if (!inside(x, y)) continue;
        // Light from the upper left on the whole crown; underneath and at the back, darker.
        const lit = -((x - ccx) / rx) * 0.5 - ((y - ccy) / ry) * 0.86;
        clumps.push({ x, y, r: 4 + random() * 2.6, darker: lit > 0.42 ? 0 : lit > -0.2 ? 1 : 2 });
      }
    clumps.sort((p, q) => q.darker - p.darker || p.y - q.y);
    const crown = (from: number, to: number): void => {
      for (const c of clumps) if (c.darker >= from && c.darker <= to) clump(s, random, c.x, c.y, c.r, L, c.darker, H);
    };
    // The limbs climb into the crown; one goes on past it, dead.
    const dead = v % 2 === 0 ? 0 : 4;
    const specs = [-1.25, -0.62, -0.05, 0.55, 1.2];
    const tx = mid(top);
    const paths = specs.map((a, i) => bough(random, tx + a * 3, top + 4, a, i === dead ? 92 : 46 + random() * 14, 4, 0.45, i === dead ? 0.3 : 0.5));
    crown(2, 2);
    for (const [i, p] of paths.entries()) {
      const isDead = i === dead;
      limb(s, p, isDead ? 3.4 : 5, isDead ? 0.7 : 1.6, isDead ? [B[1], B[2], B[3]] : [B[0], B[1], B[2]]);
      if (!isDead) continue;
      const [ex, ey] = p[p.length - 1];
      const [px, py] = p[p.length - 2];
      const a = Math.atan2(ex - px, py - ey);
      for (const d of [-0.7, 0.55]) line(s, ex, ey, ex + Math.sin(a + d) * 11, ey - Math.cos(a + d) * 11, B[2], R);
      const [qx, qy] = p[3];
      line(s, qx, qy, qx + Math.sin(a - 0.9) * 9, qy - Math.cos(a - 0.9) * 9, B[2], R);
    }
    crown(0, 1);
    // Roots flaring over the rise, the trunk on them: furrowed, lit on its left.
    const roots = [
      [-17, 5],
      [-9, 8],
      [10, 7],
      [19, 4],
    ] as const;
    for (let x = cx - 30; x <= cx + 30; x++) {
      let fh = 0;
      for (const [d, h] of roots) fh = Math.max(fh, h - Math.abs(x - (cx + d)) * 0.55);
      if (fh <= 0.5) continue;
      for (let y = Math.round(ground[x] - fh); y <= ground[x] + 1; y++) put(s, x, y, x < cx - 4 ? B[2] : x < cx + 6 ? B[1] : B[0], R);
      put(s, x, Math.round(ground[x] - fh), x < cx + 6 ? B[3] : B[1], R);
    }
    for (let y = top; y <= base; y++) {
      const c = mid(y);
      const hw = half(y);
      const xl = Math.round(c - hw);
      const xr = Math.round(c + hw);
      for (let x = xl; x <= xr; x++) {
        const rel = (x - xl) / Math.max(1, xr - xl);
        let b = rel < 0.2 ? 3 : rel < 0.52 ? 2 : rel < 0.86 ? 1 : 0;
        for (const f of [0.34, 0.6, 0.8]) if (Math.abs(x - (xl + f * (xr - xl) + Math.sin(y / 5 + f * 9))) < 0.6 && (y + Math.round(f * 20)) % 11 < 8) b = Math.max(0, b - 2);
        put(s, x, y, B[b], R);
      }
    }
    // The dark hole where a limb was lost long ago, and a burl.
    const hy = Math.round(base - trunkH * 0.5);
    const hx = Math.round(mid(hy) - 1);
    fill(s, hx - 1, hy - 2, hx + 1, hy + 2, B[0]);
    put(s, hx, hy - 3, B[0]);
    put(s, hx - 2, hy, B[3]);
    const by = Math.round(base - trunkH * 0.25);
    const bx = Math.round(mid(by) + half(by) - 1);
    fill(s, bx, by - 1, bx + 2, by + 2, B[1]);
    put(s, bx + 1, by - 1, B[2]);
    for (const d of [-40, -26, 28, 44]) blades(s, random, cx + d, ground[cx + d], 4, 4);
    cleanup(s, (r) => B.includes(r));
    return s;
  });
}

/**
 * A great boulder the ice carried here and left: blocky and rounded, broken into flat facets, a crack in it, lichen
 * in small patches, a cap of moss on its crest; stones and grass at its foot. One is split clean in two; one has a
 * rowan seedling growing out of a crack on top.
 */
function erratic(v: number): Stamp {
  return cached(`mark:erratic:${v}`, () => {
    const random = rng(0xe7a + v * 131);
    const W = 108;
    const H = 66;
    const s = newStamp(W, H, W >> 1);
    const k = newMask(W, H);
    const r = (a: number): number => (random() - 0.5) * a;
    const peak = 38 + random() * 30;
    const lean = random() < 0.5 ? -1 : 1;
    const pts: [number, number][] = [
      [3, H],
      [4 + r(4), H - 14 + r(6)],
      [9 + r(6), 28 + r(10) - lean * 4],
      [20 + r(6), 12 + r(6) - lean * 3],
      [peak - 10, 3 + r(4)],
      [peak + 8, 1 + r(3)],
      [peak + 24 + r(6), 6 + r(6) + lean * 3],
      [92 + r(6), 20 + r(8) + lean * 4],
      [101 + r(4), 40 + r(10)],
      [104, H],
    ];
    polygon(k, pts);
    soften(k);
    soften(k);
    // One split clean in two by frost, the halves a little apart.
    const split = v === 1 ? Math.round(peak + r(8)) : -1;
    if (split > 0) for (let y = 0; y < H; y++) for (let d = 0; d < 2; d++) mark(k, split + d + Math.round((H - y) * 0.08), y, 0);
    shadeRock(s, k, v * 977 + 5, { facets: 15, low: 0.22 });
    const Rk = fam('rock', 5);
    let cxk = Math.round(peak + (lean > 0 ? -18 : 18) + r(6));
    for (let y = 10; y < H - 12; y++) {
      if (y % 3 === 0) cxk += random() < 0.5 ? -1 : 1;
      if (on(k, cxk, y) && on(k, cxk + 1, y) && on(k, cxk - 1, y)) put(s, cxk, y, Rk[0], R);
    }
    // Moss along the crest, lichen in small patches on the faces.
    const G = fam('grass', 5);
    for (let x = Math.round(peak - 24); x < peak + 20; x++) {
      if (fbm1(x / 7, v * 31 + 7, 2, 0.5) < -0.05) continue;
      let y = 0;
      while (y < H && !on(k, x, y)) y++;
      if (y >= H - 4) continue;
      put(s, x, y, G[3], R | 1);
      put(s, x, y + 1, G[2], R);
      if (unit(x, v ^ 0x3a) < 0.5) put(s, x, y + 2, G[2], R);
    }
    const D = fam('dry', 4);
    for (let i = 0; i < 9; i++) {
      const lx = Math.round(14 + random() * (W - 28));
      const ly = Math.round(16 + random() * (H - 34));
      if (!on(k, lx - 1, ly) || !on(k, lx + 2, ly + 1) || !on(k, lx, ly - 1)) continue;
      put(s, lx, ly, D[3]);
      put(s, lx + 1, ly, D[2]);
      if (random() < 0.5) put(s, lx, ly + 1, D[2]);
    }
    if (v === 2) {
      let y = 0;
      const sx = Math.round(peak + 4);
      while (y < H && !on(k, sx, y)) y++;
      for (let j = 1; j < 12; j++) put(s, sx + (j > 7 ? 1 : 0), y - j, role('bark', 2), sway(12 - j, 14, 3));
      const Lf = fam('leaf', 5);
      clump(s, random, sx + 1, y - 13, 3, Lf, 0, H);
      clump(s, random, sx - 2, y - 9, 2.5, Lf, 1, H);
      clump(s, random, sx + 4, y - 10, 2.5, Lf, 0, H);
    }
    blit(s, rock(v * 3 + 1, 11), 2, H - 1);
    blit(s, rock(v * 3 + 2, 8), W - 6, H - 1, true);
    blit(s, rock(v * 3 + 7, 6), 14, H - 1);
    for (const x of [9, 22, 70, 86, W - 14]) blades(s, random, x, H - 1, 3 + Math.floor(random() * 3), 4);
    cleanup(s);
    return s;
  });
}

/**
 * A giant that fell: its trunk lying long on the ground, moss along its back, small green things and a seedling growing
 * from it, broken branches standing up, the far end splintered pale; at the near end the root plate it tore out of the
 * ground, standing on edge: dark earth webbed with roots, stones caught in it, root ends hanging loose round its rim,
 * the pit beneath.
 */
function fallen(v: number): Stamp {
  return cached(`mark:fallen:${v}`, () => {
    const random = rng(0xfa11 + v * 613);
    const W = 200;
    const H = 56;
    const s = newStamp(W, H, W >> 1);
    const B = fam('bark', 4);
    const So = fam('soil', 4);
    const G = fam('grass', 5);
    const Lf = fam('leaf', 5);
    // The root plate: an upright disc of dark earth, ragged, a little lighter at its upper left where the light
    // catches it.
    const px = 25;
    const py = H - 27;
    const rx = 15 + Math.round(random() * 3);
    const ry = 22;
    const jx = px + 6;
    const jy = H - 14;
    const Wd = fam('wood', 4);
    const rag = (a: number): number => 1 + 0.14 * fbm1(a * 3 + 1, v * 17, 2, 0.6);
    for (let y = py - ry - 3; y <= H - 3; y++)
      for (let x = px - rx - 3; x <= px + rx + 3; x++) {
        const a = Math.atan2(y - py, x - px);
        const d = Math.hypot((x - px) / rx, (y - py) / ry) / rag(a);
        if (d > 1) continue;
        const l = (-(x - px) * 0.6 - (y - py) * 0.8) / Math.max(rx, ry);
        put(s, x, y, d > 0.82 && l > 0.1 ? So[2] : d < 0.55 && l < 0.2 ? So[0] : So[1], R);
      }
    // Roots: thick where the trunk was, branching out across the earth and on past its rim, their ends hanging loose.
    for (let i = 0; i < 15; i++) {
      const a = -Math.PI * 1.05 + (i / 14) * Math.PI * 1.75 + (random() - 0.5) * 0.2;
      const reach = Math.hypot(Math.cos(a) * rx, Math.sin(a) * ry) * (1.1 + random() * 0.35);
      const p = bough(random, jx, jy, a + Math.PI / 2, reach, 3, 0.6);
      const lit = Math.cos(a) < 0.3 && Math.sin(a) < 0.4;
      limb(s, p, i % 3 === 0 ? 2.2 : 1.4, 0.5, lit ? [Wd[1], Wd[2], Wd[3]] : [B[0], Wd[1], Wd[2]]);
      const [ex, ey] = p[p.length - 1];
      line(s, ex, ey, ex + (random() - 0.5) * 5, ey + 2 + random() * 5, Wd[1], R);
      const [mx, my] = p[2];
      if (random() < 0.6) line(s, mx, my, mx + Math.cos(a + 0.7) * 7, my + Math.sin(a + 0.7) * 7, Wd[2], R);
    }
    for (let i = 0; i < 4; i++) {
      const sx = Math.round(px - rx * 0.6 + random() * rx * 1.1);
      const sy = Math.round(py - ry * 0.6 + random() * ry);
      fill(s, sx, sy, sx + 1, sy, role('rock', 3));
      fill(s, sx, sy + 1, sx + 1, sy + 1, role('rock', 1));
    }
    // The pit it left.
    for (let x = px - rx + 2; x <= px + rx - 1; x++) {
      const depth = Math.round(4 - (Math.abs(x - px) / rx) * 3);
      for (let y = H - depth; y < H; y++) put(s, x, y, So[0], R);
    }
    // The trunk, lying along the ground, sloping a little, thinning to its broken end.
    const x0 = px + 5;
    const x1 = W - 10;
    const yc = (x: number): number => H - 10 - ((x1 - x) / (x1 - x0)) * 3;
    const rad = (x: number): number => 8 - 2.6 * ((x - x0) / (x1 - x0));
    const topAt: number[] = [];
    for (let x = x0; x <= x1; x++) {
      const c = yc(x);
      const r = rad(x);
      const t0 = Math.round(c - r);
      const t1 = Math.round(c + r);
      topAt[x] = t0;
      for (let y = t0; y <= t1; y++) {
        const k = (y - t0) / Math.max(1, t1 - t0);
        let b = k < 0.16 ? 3 : k < 0.46 ? 2 : k < 0.82 ? 1 : 0;
        // Long seams in the bark along its length, broken here and there.
        const row = Math.round(k * 6);
        if (b > 0 && (row === 2 || row === 4) && unit(Math.floor((x + row * 7) / 13), v * 7 + row) < 0.7) b -= 1;
        put(s, x, y, B[b], R);
      }
      for (let y = t1 + 1; y < H; y++) put(s, x, y, So[0], R);
    }
    // The broken end: the pale wood inside, splintered in spikes.
    for (let y = Math.round(yc(x1) - rad(x1)); y <= Math.round(yc(x1) + rad(x1)); y++) {
      const l = 1 + Math.round(4 * unit(Math.floor(y / 2) + v * 3, 0x5f1) * (y % 2 === 0 ? 1 : 0.5));
      for (let j = 0; j <= l; j++) put(s, x1 - 1 + j, y, j === 0 ? Wd[2] : j === l ? Wd[2] : Wd[3], R);
    }
    // Branches broken short, standing up off it.
    for (const [j, f] of [0.3, 0.52, 0.78].entries()) {
      const x = Math.round(x0 + f * (x1 - x0) + (random() - 0.5) * 10);
      const a = (j % 2 === 0 ? 1 : -1) * (0.55 + random() * 0.5);
      const p = bough(random, x, topAt[x] + 1, a, 6 + random() * 6, 2, 0.4);
      limb(s, p, 1.7, 0.8, [B[1], B[2], B[3]]);
    }
    // Moss along its back, small green things and a seedling growing out of it.
    for (let x = x0 + 2; x < x1 - 4; x++) {
      if (fbm1(x / 9, v * 29 + 3, 2, 0.5) < -0.1) continue;
      put(s, x, topAt[x], G[3], R);
      put(s, x, topAt[x] + 1, G[2], R);
    }
    for (const f of [0.14, 0.4, 0.66, 0.9]) {
      const x = Math.round(x0 + f * (x1 - x0));
      clump(s, random, x, topAt[x] - 2, 2.6, Lf, 1, H);
      clump(s, random, x + 3, topAt[x] - 1.5, 2.1, Lf, 0, H);
    }
    const sx = Math.round(x0 + 0.56 * (x1 - x0));
    for (let j = 1; j < 14; j++) put(s, sx, topAt[sx] - j, B[2], sway(14 - j, 16, 3));
    clump(s, random, sx, topAt[sx] - 15, 3.2, Lf, 0, H);
    clump(s, random, sx - 3, topAt[sx] - 11, 2.5, Lf, 1, H);
    clump(s, random, sx + 3, topAt[sx] - 12, 2.6, Lf, 0, H);
    for (const x of [48, 96, 150, W - 4]) blades(s, random, x, H - 1, 4, 4);
    cleanup(s, (r) => B.includes(r));
    return s;
  });
}

/**
 * A dead tree, huge, standing drowned in a pool: its top broken off jagged, bare limbs twisting out, one snapped
 * short, the bark gone grey and peeling pale on its lit side, roots flaring into the water, a dark hollow at its foot;
 * its reflection broken in the still water, reeds at the pool's edges.
 */
function snag(v: number): Stamp {
  return cached(`mark:snag:${v}`, () => {
    const random = rng(0x5a9 + v * 337);
    const W = 128;
    const H = 120;
    const s = newStamp(W, H, W >> 1);
    const B = fam('bark', 4);
    const Wt = fam('water', 4);
    const cx = (W >> 1) + Math.round((random() - 0.5) * 10);
    const water = H - 7;
    for (let x = 4; x < W - 4; x++) {
      const t = Math.abs(x - W / 2) / (W / 2 - 4);
      const y0 = water + (t > 0.8 ? Math.round((t - 0.8) * 14) : 0);
      for (let y = y0; y < H; y++) {
        const k = y - y0;
        const glint = k > 0 && unit(Math.floor((x + k * 11) / 4) * 64 + k, v ^ 0x51) < 0.14;
        put(s, x, y, k === 0 || glint ? Wt[3] : k < 3 ? Wt[2] : Wt[1], FLAG.WATER);
      }
    }
    const trunkH = 76 + Math.round(random() * 8);
    const lean = (random() - 0.5) * 8;
    const mid = (y: number): number => cx + (lean * (water - y)) / trunkH + Math.sin((water - y) / 14 + v) * 1.6;
    const half = (y: number): number => {
      const d = water - y;
      return 6 - 2.4 * (d / trunkH) + (d < 9 ? ((9 - d) / 9) ** 2 * 6 : 0);
    };
    const specs = [
      { at: 0.58, a: -1.05, len: 40, r: 2.8 },
      { at: 0.8, a: -0.45, len: 26, r: 2.2 },
      { at: 0.68, a: 0.78, len: 36, r: 2.6 },
      { at: 0.88, a: 0.3, len: 18, r: 1.8 },
      { at: 0.42, a: 1.25, len: 11, r: 2.2, snapped: true },
    ];
    for (const sp of specs) {
      const y = water - trunkH * sp.at;
      const snapped = sp.snapped === true;
      const p = bough(random, mid(y), y, sp.a, sp.len, snapped ? 1 : 4, 0.7, 0.3);
      limb(s, p, sp.r, snapped ? sp.r : 0.7, [B[0], B[1], B[2]]);
      const [ex, ey] = p[p.length - 1];
      if (snapped) {
        put(s, Math.round(ex) + 1, Math.round(ey) - 1, role('bone', 0), R);
        continue;
      }
      const [qx, qy] = p[p.length - 2];
      const a = Math.atan2(ex - qx, qy - ey);
      for (const d of [-0.6, 0.5]) line(s, ex, ey, ex + Math.sin(a + d) * (6 + random() * 5), ey - Math.cos(a + d) * (6 + random() * 5), B[1], R);
      const [mx, my] = p[2];
      line(s, mx, my, mx + Math.sin(a + 0.8) * 7, my - Math.cos(a + 0.8) * 7, B[1], R);
    }
    // The trunk, its top broken off in jagged spikes, the pale wood showing.
    const top = water - trunkH;
    for (let y = top - 10; y <= water; y++) {
      const c = mid(Math.max(top, y));
      const hw = half(Math.max(top, y));
      const xl = Math.round(c - hw);
      const xr = Math.round(c + hw);
      for (let x = xl; x <= xr; x++) {
        if (y < top) {
          const spike = Math.round(10 * unit(Math.floor((x - xl) / 2) + v * 5, 0x5b) * (1 - Math.abs(x - c) / (hw + 1)));
          if (top - y > spike) continue;
        }
        const rel = (x - xl) / Math.max(1, xr - xl);
        let r = B[rel < 0.25 ? 3 : rel < 0.55 ? 2 : rel < 0.85 ? 1 : 0];
        if ((rel < 0.45 && fbm1(y / 6, v * 13 + 2, 2, 0.5) > 0.15) || (y < top + 2 && rel < 0.6)) r = role('bone', 0);
        put(s, x, y, r, R);
      }
    }
    const hx = Math.round(mid(water - 10));
    fill(s, hx - 1, water - 15, hx + 1, water - 6, B[0]);
    put(s, hx, water - 16, B[0]);
    for (let y = water + 1; y < H; y++) {
      if ((y - water) % 2 === 0) continue;
      const c = mid(water - (y - water));
      const hw = half(water - (y - water));
      for (let x = Math.round(c - hw + 1); x <= Math.round(c + hw - 1); x++) put(s, x, y, Wt[0], FLAG.WATER);
    }
    const D = fam('dry', 4);
    for (const [x0, n] of [
      [8, 5],
      [22, 3],
      [W - 32, 4],
      [W - 16, 6],
    ] as const) {
      for (let i = 0; i < n; i++) {
        const bx = x0 + i * 2 + (random() < 0.5 ? 0 : 1);
        const bh = 6 + Math.round(random() * 8);
        const lean2 = (random() - 0.5) * 3;
        for (let j = 0; j < bh; j++) {
          const t = j / bh;
          put(s, Math.round(bx + lean2 * t * t), water + 1 - j, D[Math.min(3, 1 + Math.floor(t * 2.5))], sway(bh - j, bh + 1, 6));
        }
      }
    }
    return s;
  });
}

// ── The hills (6 px a metre) ───────────────────────────────────────────────

/** Something enormous, long dead, half in the ground: an arched spine, ribs curving down into the earth, a skull. */
function skeleton(v: number): Stamp {
  return cached(`mark:skeleton:${v}`, () => {
    const W = 190;
    const H = 58;
    const s = newStamp(W, H, 95);
    const bone = [role('bone', 0), role('bone', 1), role('bone', 2)];
    // The spine, an arch from the buried tail up toward the neck and down again to the skull.
    const spineY = (x: number): number => H - 2 - Math.round(50 * Math.sin(Math.PI * Math.min(1, Math.max(0, (x - 6) / 160))) ** 0.8);
    for (let x = 6; x <= 160; x++) {
      const y = spineY(x);
      put(s, x, y, bone[2]);
      put(s, x, y + 1, bone[1]);
      if (x % 5 === 0) put(s, x, y - 1, bone[1]);
    }
    // Ribs: from the spine, curving out and down to the ground, the near ones fuller.
    for (let x = 40; x <= 132; x += 9) {
      const y0 = spineY(x) + 2;
      const len = H - y0;
      for (let k = 0; k < len; k++) {
        const t = k / len;
        const rx = Math.round(x + 14 * Math.sin(t * Math.PI * 0.9) - 4 * t);
        put(s, rx, y0 + k, t < 0.5 ? bone[1] : bone[0]);
        if (t < 0.6) put(s, rx + 1, y0 + k, bone[0]);
      }
    }
    // The skull, lying at the end: a long jaw, an eye socket, a few teeth.
    for (let y = H - 16; y < H; y++)
      for (let x = 160; x <= 186; x++) {
        const dy = (y - (H - 9)) / 8;
        const dx = (x - 170) / 17;
        if (dx * dx + dy * dy > 1.05 && !(x > 176 && y > H - 9)) continue;
        put(s, x, y, y < H - 13 ? bone[2] : bone[1]);
      }
    fill(s, 167, H - 12, 170, H - 9, role('soil', 0), 0);
    for (let x = 175; x <= 185; x += 2) put(s, x, H - 6, bone[2], 0);
    fill(s, 175, H - 5, 186, H - 5, role('soil', 0), 0);
    void v;
    return s;
  });
}

/**
 * An arch the weather wore through a hill of bedded rock: steep sides leaning in, a broad uneven top, the opening
 * rounded and a little lopsided, the span's underside in shade, the beds running level through it all, fallen blocks
 * at its feet, a bush or two on top. Its stone is the biome's: red in the desert, grey on the coast.
 */
function arch(v: number): Stamp {
  return cached(`mark:arch:${v}`, () => {
    const random = rng(0xa4c + v * 977);
    const W = 160;
    const H = 92;
    const s = newStamp(W, H, W >> 1);
    const k = newMask(W, H);
    const left = 4;
    const right = W - 5;
    // A headland worn through: a lumpy top, a steep end on the left, the land falling away more gently to the right.
    for (let x = left; x <= right; x++) {
      const d = Math.min(x - left, right - x);
      const sh = Math.min(1, d / (x < W / 2 ? 14 : 40));
      const top = Math.round(10 + (1 - Math.pow(sh, x < W / 2 ? 0.6 : 1.3)) * (H - 10) + fbm1(x / 14, v * 13 + 1, 2, 0.55) * 9 + (x / W) * 6);
      for (let y = Math.max(0, top); y < H; y++) mark(k, x, y);
    }
    const ocx = 82 + Math.round((random() - 0.5) * 12);
    const rxL = 32 + Math.round(random() * 6);
    const rxR = 38 + Math.round(random() * 6);
    const ry = 56 + Math.round(random() * 6);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const rx = x < ocx ? rxL : rxR;
        const wob = 1 + 0.09 * fbm1(y / 6, v * 7 + (x < ocx ? 1 : 2), 2, 0.5);
        if (((x - ocx) / (rx * wob)) ** 2 + ((y - H) / ry) ** 2 < 1) k.m[y * W + x] = 0;
      }
    soften(k);
    shadeRock(s, k, v * 331 + 9, { beds: beds(v * 41 + 3, W, H, 6, 13, v % 2 === 0 ? 0.05 : -0.04), low: 0.16, facets: 15, under: false });
    blit(s, rock(v * 5 + 1, 13), 8, H - 1);
    blit(s, rock(v * 5 + 2, 9), ocx - rxL + 8, H - 1);
    blit(s, rock(v * 5 + 3, 7), ocx + 14, H - 1, true);
    blit(s, rock(v * 5 + 4, 11), W - 8, H - 1, true);
    const D = fam('dry', 4);
    for (const fx of [0.3, 0.7]) {
      const x = Math.round(W * fx + (random() - 0.5) * 10);
      let y = 0;
      while (y < H && !on(k, x, y)) y++;
      for (let i = -2; i <= 2; i++) {
        const h = 3 - Math.abs(i);
        for (let j = 0; j < h; j++) put(s, x + i, y - 1 - j, D[j === h - 1 ? 2 : 1], R | 1);
      }
    }
    return s;
  });
}

/**
 * A tor: an outcrop of weathered stone on a rise, and on it stacks of flat blocks, each rounded at its edges and parted
 * from the one under it by a dark joint, some split upright, the stacks crowding together; loose blocks strewn at its
 * foot. One in four is a boulder left balanced on a short pillar of the same stone.
 */
function tor(v: number): Stamp {
  return cached(`mark:tor:${v}`, () => {
    const random = rng(0x7041 + v * 211);
    const W = 132;
    const H = 80;
    const s = newStamp(W, H, W >> 1);
    const Rk = fam('rock', 5);
    /** A block: a flat slab with rounded edges, painted as a rock of its own so a joint shows under it. */
    const block = (x0: number, bottom: number, w: number, h: number, dark: number, joint: boolean): void => {
      const k = newMask(W, H);
      const pts: [number, number][] = [
        [x0, bottom + 1],
        [x0 + random() * 2, bottom - h + 3 + random() * 2],
        [x0 + 2 + random() * 3, bottom - h + 1],
        [x0 + w - 3 - random() * 3, bottom - h + 1 + random() * 2],
        [x0 + w - random() * 2, bottom - h + 4],
        [x0 + w, bottom + 1],
      ];
      polygon(k, pts);
      soften(k);
      shadeRock(s, k, Math.round(x0 * 7 + bottom), { split: 0.4, low: 0.3, dark });
      if (joint && w > 16) {
        const jx = Math.round(x0 + w * (0.3 + 0.4 * random()));
        for (let y = bottom - h + 3; y < bottom; y++) if (on(k, jx, y) && on(k, jx + 1, y)) put(s, jx, y, Rk[0], R);
      }
    };
    /** A stack of blocks from `bottom` up, each a little narrower and set a little off. */
    const stack = (cx: number, bottom: number, w: number, n: number, dark: number): number => {
      for (let i = 0; i < n; i++) {
        const h = Math.round(8 + random() * 4);
        block(Math.round(cx - w / 2), bottom, Math.round(w), h, dark, random() < 0.3);
        bottom -= h - 1;
        w = Math.max(12, w * (0.8 + random() * 0.18));
        cx += (random() - 0.5) * 6;
      }
      return bottom;
    };
    // The outcrop the stacks stand on, broken into facets.
    const ok = newMask(W, H);
    polygon(ok, [
      [6, H],
      [12, H - 12],
      [30, H - 17 - random() * 3],
      [W - 34, H - 16 - random() * 3],
      [W - 12, H - 10],
      [W - 6, H],
    ]);
    soften(ok);
    shadeRock(s, ok, v * 13 + 1, { facets: 12, low: 0.35, dark: 0 });
    const ground = H - 15;
    if (v === 3) {
      // A boulder balanced on a short pillar: the pillar two blocks, the boulder overhanging them.
      const pc = W / 2 - 6;
      let top = stack(pc + 6, ground, 38, 1, 1);
      top = stack(pc, top + 1, 30, 2, 0);
      const bk = newMask(W, H);
      const bcx = pc + 7;
      const bh = 22;
      const bw = 42;
      polygon(bk, [
        [bcx - bw / 2 + 4, top + 2],
        [bcx - bw / 2, top - bh * 0.45],
        [bcx - bw / 2 + 8, top - bh + 2],
        [bcx + 6, top - bh],
        [bcx + bw / 2 - 4, top - bh + 6],
        [bcx + bw / 2, top - bh * 0.4],
        [bcx + bw / 2 - 8, top + 2],
      ]);
      soften(bk);
      soften(bk);
      shadeRock(s, bk, 77 + v, { facets: 13, low: 0.32 });
      stack(22, ground + 2, 24, 1, 1);
    } else {
      // Two or three stacks crowding together, the one behind a step darker.
      stack(W * 0.66 + (random() - 0.5) * 8, ground, 34, 3 + (v === 2 ? 1 : 0), 1);
      stack(W * 0.38 + (random() - 0.5) * 8, ground + 1, 40, 4 + (v === 1 ? 1 : 0), 0);
      if (v !== 2) stack(W * 0.84, ground + 3, 22, 2, 0);
    }
    blit(s, rock(v * 7 + 1, 9), 4, H - 1);
    blit(s, rock(v * 7 + 2, 7), 30, H - 1, true);
    blit(s, rock(v * 7 + 3, 10), W - 6, H - 1, true);
    blit(s, rock(v * 7 + 4, 6), W - 28, H - 1);
    return s;
  });
}

/**
 * A waterfall off a cliff: a face of bedded rock stepping down in ledges either side, the notch the stream has cut in
 * its lip, the rock dark and wet beside the falling water, the water falling in a ribbon streaked white and widening as
 * it goes, a pool foaming where it lands; spruces on the cliff top and the ledges, blocks at its foot.
 */
function waterfall(v: number): Stamp {
  return cached(`mark:waterfall:${v}`, () => {
    const random = rng(0x3a7e + v * 59);
    const W = 164;
    const H = 116;
    const s = newStamp(W, H, W >> 1);
    const k = newMask(W, H);
    const notch = 76 + Math.round((random() - 0.5) * 16);
    const tops: number[] = [];
    for (let x = 0; x < W; x++) {
      // A cliff with a broad top, falling away steeply to either side in broken shoulders, one side higher.
      const side = x < W / 2 ? 0 : 1;
      const d = Math.min(1, Math.min(x, W - 1 - x) / (side === 0 ? 34 : 28));
      const sh = 1 - d * d * (3 - 2 * d);
      const ledge = Math.max(0, fbm1(x / 13, v * 7 + 9, 2, 0.5)) * 16 * sh;
      let top = Math.round(14 + side * 7 + sh * (H - 20) - ledge + fbm1(x / 6, v * 7 + 3, 2, 0.5) * 3);
      if (Math.abs(x - notch) < 10) top += Math.round(7 * (1 - ((x - notch) / 10) ** 2));
      tops.push(Math.min(H - 1, top));
      for (let y = Math.max(0, top); y < H; y++) mark(k, x, y);
    }
    shadeRock(s, k, v * 97 + 1, { low: 0.08, facets: 18, under: false });
    const Rk = fam('rock', 5);
    // Ledges across the face: a lit lip over a line of shadow.
    for (let i = 0; i < 5; i++) {
      const ly = 30 + i * 15 + Math.round((random() - 0.5) * 8);
      const a = Math.round(8 + random() * (W - 40));
      const b = a + 14 + Math.round(random() * 26);
      for (let x = a; x < b; x++) {
        if (Math.abs(x - notch) < 11 || !on(k, x, ly - 1) || !on(k, x, ly + 1)) continue;
        put(s, x, ly, Rk[4], R);
        put(s, x, ly + 1, Rk[0], R);
      }
    }
    // The wet rock either side of the water, and the dark hollow it has worn behind the pool.
    const wTop = tops[notch];
    const pool = H - 9;
    for (let y = wTop; y < pool; y++) {
      const reach = 7 + Math.round(fbm1(y / 6, v * 11, 2, 0.5) * 2) + Math.round(((y - wTop) / (pool - wTop)) * 3);
      for (let x = notch - reach; x <= notch + reach; x++) if (on(k, x, y)) put(s, x, y, Math.abs(x - notch) > reach - 2 ? Rk[1] : Rk[0], R);
    }
    for (let y = pool - 12; y < pool; y++) {
      const hw = 12 - (pool - y) * 0.4;
      for (let x = Math.round(notch - hw); x <= Math.round(notch + hw); x++) if (on(k, x, y)) put(s, x, y, Rk[0], R);
    }
    // The water: a ribbon from the notch down to the pool, white streaks running down it.
    const Wt = fam('water', 4);
    const Sn = fam('snow', 4);
    for (let y = wTop; y < pool; y++) {
      const t = (y - wTop) / (pool - wTop);
      const hw = 3.5 + t * 3.5;
      const c = notch + (y - wTop < 5 ? 1 : 0);
      for (let x = Math.round(c - hw); x <= Math.round(c + hw); x++) {
        const edge = x === Math.round(c - hw) || x === Math.round(c + hw);
        const len = 5 + Math.floor(unit(x * 13, v ^ 0x7a) * 9);
        const phase = Math.floor(unit(x * 7 + 1, v ^ 0x7b) * 20);
        const streak = (y + phase) % (len + 4) < len;
        put(s, x, y, edge ? Wt[1] : streak ? (unit(x, v ^ 0x7c) < 0.5 ? Sn[3] : Sn[2]) : Wt[2], 0);
      }
    }
    for (let x = notch - 36; x <= notch + 36; x++) {
      const t = Math.abs(x - notch) / 36;
      const y0 = pool + (t > 0.7 ? Math.round((t - 0.7) * 10) : 0);
      for (let y = y0; y < H; y++) {
        const kk = y - y0;
        const foam = Math.abs(x - notch) < 10 - kk * 1.5 && unit(x * 3 + kk * 17, v ^ 0x7d) < 0.75;
        const glint = kk > 1 && unit(Math.floor((x + kk * 9) / 3) * 31 + kk, v ^ 0x7e) < 0.16;
        put(s, x, y, foam ? (kk < 2 ? Sn[3] : Sn[2]) : kk === 0 || glint ? Wt[3] : kk < 3 ? Wt[2] : Wt[1], FLAG.WATER);
      }
    }
    for (const d of [-1, 1]) {
      for (let j = 0; j < 5; j++) {
        put(s, notch + d * (8 + j), pool - 1 - j, Sn[j < 2 ? 3 : 2], 0);
        if (j < 3) put(s, notch + d * (7 + j), pool - 1 - j, Sn[2], 0);
      }
    }
    // Spruces on the cliff top and on the ledges, dark against the sky and the rock.
    const N = fam('needle', 4);
    const spruce = (x: number, base: number, th: number): void => {
      for (let j = 0; j < th; j++) {
        const hw = Math.round((j / th) * th * 0.3 + (j % 3 === 2 ? 0.6 : 0));
        for (let dx = -hw; dx <= hw; dx++) put(s, x + dx, base - th + j, N[dx < 0 && j % 3 !== 0 ? 2 : dx === hw && hw > 0 ? 0 : 1], R | sway(th - j, th, 2));
      }
      put(s, x, base, role('bark', 0), R);
    };
    for (let i = 0; i < 9; i++) {
      const x = Math.round(8 + random() * (W - 16));
      if (Math.abs(x - notch) < 14 || tops[x] > H - 14) continue;
      // Only where the ground is level enough to stand on.
      if (Math.abs(tops[x - 2] - tops[x + 2]) > 2) continue;
      spruce(x, tops[x] + 1, 8 + Math.round(random() * 9));
    }
    blit(s, rock(v * 9 + 1, 12), notch - 46, H - 1);
    blit(s, rock(v * 9 + 2, 9), notch + 44, H - 1, true);
    return s;
  });
}

/**
 * Spires of banded rock in a cluster, all that is left of a cliff: each broad at its foot and thinning upward, swelling
 * and pinching as its beds are harder or softer, the beds running level through them all; most wear a cap of harder
 * stone on a thin neck. The ones behind a step darker, a slope of their fallen stone at their feet. Red in the desert,
 * pale on the salt flat.
 */
function spires(v: number): Stamp {
  return cached(`mark:spires:${v}`, () => {
    const random = rng(0x5b1e + v * 89);
    const W = 116;
    const H = 92;
    const s = newStamp(W, H, W >> 1);
    const bed = beds(v * 61 + 7, W, H, 4, 8);
    const tk = newMask(W, H);
    for (let x = 2; x < W - 2; x++) {
      const t = Math.abs(x - W / 2) / (W / 2 - 2);
      const h = Math.round(11 * (1 - t * t) + fbm1(x / 8, v * 3, 2, 0.5) * 2);
      for (let y = H - h; y < H; y++) mark(tk, x, y);
    }
    shadeRock(s, tk, v * 5 + 3, { low: 0.5, dark: 1, facets: 9 });
    const specs = [
      { cx: 18, w: 13, h: 54 },
      { cx: 38, w: 17, h: 88 },
      { cx: 57, w: 12, h: 46 },
      { cx: 75, w: 16, h: 70 },
      { cx: 95, w: 12, h: 38 },
      { cx: 108, w: 8, h: 22 },
    ].map((p) => ({ cx: p.cx + Math.round((random() - 0.5) * 6), w: p.w + Math.round((random() - 0.5) * 3), h: Math.min(H - 2, Math.round(p.h * (0.85 + random() * 0.2))) }));
    for (const i of [0, 2, 4, 5, 1, 3]) {
      const sp = specs[i];
      const back = i === 0 || i === 2 || i === 4;
      const top = H - sp.h;
      const capped = sp.h > 30 && random() < 0.85;
      const capH = capped ? 4 + Math.floor(random() * 3) : 0;
      const neck = capped ? 3 : 0;
      const body = newMask(W, H);
      const cap = newMask(W, H);
      const lean = (random() - 0.5) * 3;
      for (let y = top; y < H; y++) {
        const d = y - top;
        const t = d / sp.h;
        const c = sp.cx + lean * (1 - t);
        let hw: number;
        if (d < capH) hw = sp.w * 0.4 - (d === 0 ? 2 : d === 1 ? 0.8 : 0);
        else if (d < capH + neck) hw = sp.w * 0.26;
        else hw = (sp.w / 2) * (0.6 + 0.4 * t) * (1 + 0.16 * fbm1(y / 5, v * 19 + i, 2, 0.6)) + Math.max(0, d - (sp.h - 10)) * 0.7;
        for (let x = Math.round(c - hw); x <= Math.round(c + hw); x++) mark(d < capH ? cap : body, x, y);
      }
      if (!capped) {
        // An uncapped spire wears to a rounded point.
        for (let d = 0; d < 3; d++) for (let x = 0; x < W; x++) if (on(body, x, top + d) && (!on(body, x - 2 + d, top + d) || !on(body, x + 2 - d, top + d))) mark(body, x, top + d, 0);
      }
      shadeRock(s, body, v * 101 + i * 7, { beds: bed, low: 0.12, dark: back ? 1 : 0 });
      shadeRock(s, cap, v * 103 + i * 11, { low: 0.35, dark: back ? 2 : 1 });
    }
    blit(s, rock(v * 11 + 1, 8), 6, H - 1);
    blit(s, rock(v * 11 + 2, 6), 64, H - 1, true);
    return s;
  });
}

// ── The far hills (3.6 px a metre) ─────────────────────────────────────────

/**
 * Stacks of rock standing in the sea off the coast: columns the waves cut from the land long ago, broad at the foot
 * and narrowing, leaning a little, stepped with ledges, the beds running level through them; one has been worn
 * through at the foot. Grass on the tops of the tallest, foam round their feet.
 */
function stacks(v: number): Stamp {
  return cached(`mark:stacks:${v}`, () => {
    const random = rng(0x57ac + v * 43);
    const W = 132;
    const H = 86;
    const s = newStamp(W, H, W >> 1);
    const sea = H - 4;
    const bed = beds(v * 71 + 1, W, H, 4, 9);
    const specs = [
      { cx: 106, w: 13, h: 26 },
      { cx: 14, w: 9, h: 12 },
      { cx: 78, w: 22, h: 52 },
      { cx: 42, w: 30, h: 78 },
    ].map((p) => ({ cx: p.cx + Math.round((random() - 0.5) * 6), w: p.w + Math.round((random() - 0.5) * 3), h: Math.round(p.h * (0.85 + random() * 0.2)) }));
    const G = fam('grass', 5);
    for (const [i, sp] of specs.entries()) {
      const k = newMask(W, H);
      const top = sea - sp.h;
      const lean = (random() - 0.5) * sp.h * 0.12;
      const ledges = [0.35, 0.62].map((f) => Math.round(top + sp.h * (f + (random() - 0.5) * 0.12)));
      for (let y = top; y <= sea; y++) {
        const d = y - top;
        const t = d / sp.h;
        const c = sp.cx + lean * (1 - t);
        let hw = (sp.w / 2) * (0.62 + 0.38 * Math.pow(t, 0.8)) * (1 + 0.1 * fbm1(y / 4, v * 7 + i, 2, 0.5));
        for (const ly of ledges) if (y > ly) hw += 0.9;
        if (d < 3) hw -= (3 - d) * 0.9;
        const xl = Math.round(c - hw);
        const xr = Math.round(c + hw);
        for (let x = xl; x <= xr; x++) mark(k, x, y);
      }
      // The tallest is worn through at its foot.
      if (i === specs.length - 1 && v % 2 === 1) {
        const ax = Math.round(sp.cx + 2);
        for (let y = sea - 9; y <= sea; y++) for (let x = ax - 5; x <= ax + 5; x++) if (((x - ax) / 5) ** 2 + ((y - sea - 1) / 9) ** 2 < 1) mark(k, x, y, 0);
      }
      soften(k);
      shadeRock(s, k, v * 19 + i, { beds: bed, low: 0.14, dark: i < 2 ? 1 : 0, facets: 10, under: false });
      if (sp.h > 40) {
        for (let x = 0; x < W; x++) {
          let y = 0;
          while (y < H && !on(k, x, y)) y++;
          if (y > top + 3 || y >= H) continue;
          put(s, x, y, G[3], R | 1);
          put(s, x, y + 1, G[2], R);
          if (unit(x, v ^ 0x91) < 0.4) put(s, x, y - 1, G[2], R | 2);
        }
      }
    }
    const Sn = fam('snow', 4);
    for (const sp of specs) {
      for (let x = Math.round(sp.cx - sp.w / 2 - 5); x <= Math.round(sp.cx + sp.w / 2 + 5); x++) {
        for (let y = sea - 1; y <= sea + 2; y++) {
          const near = Math.abs(x - sp.cx) <= sp.w / 2 + 1;
          if (!near && y < sea) continue;
          if (unit(x * 5 + y * 31, v ^ 0x93) < (y === sea + 2 ? 0.55 : 0.25)) continue;
          put(s, x, y, y <= sea ? Sn[3] : Sn[2], FLAG.WATER);
        }
      }
    }
    return s;
  });
}
