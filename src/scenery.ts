// The scenery in pixels: props and homes drawn as shapes with the kit, varied by their seed, and painted
// for the biome, the season and the hour. Sizes are in pixels here and in cells (two pixels tall) outside.
import { BIOMES, LEAVES } from './config.ts';
import type { BiomeName, CritterKind, PropKind } from './config.ts';
import { mix, ramp, toHsl } from './color.ts';
import type { Ramp } from './color.ts';
import { BASE, DARK, GLEAM, LIGHT, OUTLINE, SHADOW, draw, fill, flat, paint } from './kit.ts';
import type { ColorSprite, Drawing, Material, Shape } from './kit.ts';
import { hash2, rng } from './noise.ts';
import type { Season } from './sky.ts';

/** What a prop looks like now: where, when, and the frame of its own motion (water's shimmer). */
export type Look = {
  readonly biome: BiomeName;
  readonly season: Season;
  /** Snow lies on things. */
  readonly snowy: boolean;
  /** Water is ice. */
  readonly frozen: boolean;
  /** Windows are lit. */
  readonly night: boolean;
  readonly frame: number;
  /** The sky's colour at the horizon, which water reflects. */
  readonly sky: number;
  /** Pixels the top of a tree, a palm or reeds leans with the wind. */
  readonly sway: number;
};

/** Where a home's doorway is, from its top-left: the pixels it spans, and the cell left of its middle at eye height. */
export type Doorway = { readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly col: number; readonly row: number };

/** A prop's size in cells, and for a home its doorway and where its smoke rises (in pixels from its top-left). */
export type Footprint = { readonly w: number; readonly h: number; readonly door?: Doorway; readonly smoke?: { readonly x: number; readonly y: number } };

/** Frames of water's shimmer. */
export const WATER_FRAMES = 4;

// ── Shapes ─────────────────────────────────────────────────────────────────

const inEllipse = (x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean =>
  ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

/** Whether (x, y) lies within r of the segment from a to b. */
function nearSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number, r: number): boolean {
  const px = x + 0.5 - ax;
  const py = y + 0.5 - ay;
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
  return (px - t * dx) ** 2 + (py - t * dy) ** 2 <= r * r;
}

const shape = (w: number, h: number, key: string, inside: (x: number, y: number) => boolean, more: Partial<Shape> = {}): Shape => ({
  rows: fill(w, h, key, inside),
  x: 0,
  y: 0,
  ...more,
});

/** A few pixels a shade lighter or darker, so a surface is not flat. */
const speckle = (seed: number, every = 7) => (x: number, y: number, t: number): number => {
  if (t === OUTLINE || t === GLEAM) return t;
  const h = hash2(x, y, seed) % every;
  return h === 0 && t < LIGHT ? t + 1 : h === 1 && t > DARK ? t - 1 : t;
};

/** Bark: dark grooves running down. */
const bark = (x: number, y: number, t: number): number => (t >= BASE && t < GLEAM && (x + (y >> 2)) % 3 === 0 ? SHADOW : t);

/**
 * Leaves grow in clumps. The canopy is divided into clumps of about radius r on a jittered grid; a pixel
 * belongs to the nearest clump's centre. Each clump is lit along its top left and dark along its bottom
 * right, with a dark seam between clumps, so foliage reads as clusters, not as noise or a smooth blob.
 */
export function clumpAt(x: number, y: number, r: number, seed: number): { cx: number; cy: number; d: number; hs: number } {
  const cell = r * 1.75;
  const rowH = cell * 0.85;
  const gx = Math.floor((x + 0.5) / cell);
  const gy = Math.floor((y + 0.5) / rowH);
  let best = { cx: 0, cy: 0, d: Infinity, hs: 0 };
  for (let j = gy - 1; j <= gy + 1; j++) {
    for (let i = gx - 1; i <= gx + 1; i++) {
      const hs = hash2(i, j, seed);
      const cx = (i + 0.5 + ((hs % 100) / 100 - 0.5) * 0.7 + (j % 2 === 0 ? 0 : 0.5)) * cell;
      const cy = (j + 0.5 + (((hs >>> 8) % 100) / 100 - 0.5) * 0.6) * rowH;
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < best.d) best = { cx, cy, d, hs };
    }
  }
  return best;
}

/** The texture of leaf clusters of about radius r, over the shape's own shading. */
const clusters = (r: number, seed: number) => (x: number, y: number, t: number): number => {
  if (t === OUTLINE || t === GLEAM) return t;
  const c = clumpAt(x, y, r, seed);
  const dx = x + 0.5 - c.cx;
  const dy = y + 0.5 - c.cy;
  // The seam between clumps shows on their shaded, lower side.
  if (c.d > r * 0.78 && dy > -r * 0.25) return Math.max(DARK, t - 2);
  const along = (dx + dy * 1.3) / r;
  if (along < -0.55) return Math.min(LIGHT, t + 1);
  if (along > 0.5) return Math.max(DARK, t - 1);
  return t;
};

/**
 * A canopy: the union of clumps whose centres fall inside `within`, so its edge is lumpy at the clumps'
 * scale, with a few clumps missing lower down where the sky shows through to the branches.
 */
function canopy(r: number, seed: number, within: (x: number, y: number) => boolean, holes = true) {
  return (x: number, y: number): boolean => {
    const c = clumpAt(x, y, r, seed);
    if (c.d > r * 0.95 || !within(c.cx, c.cy)) return false;
    return !(holes && c.hs % 9 === 0 && !within(c.cx, c.cy - r * 2.2));
  };
}

/** Pine needles: layered boughs, a shade darker along each layer's underside. */
const needles = (top: number, seed: number) => (x: number, y: number, t: number): number =>
  t === OUTLINE || t === GLEAM ? t : (y - top) % 3 === 2 ? Math.max(DARK, t - 1) : hash2(x, y, seed) % 9 === 0 ? Math.max(DARK, t - 1) : t;

/** Snow lying on top of a shape: its upper pixels, `deep` thick; with `patchy`, not on steep sides. */
function snowOn(w: number, h: number, inside: (x: number, y: number) => boolean, deep = 2, patchy = false): Shape {
  const on = (x: number, y: number): boolean => inside(x, y) && !inside(x, y - deep) && (!patchy || (inside(x - 1, y) && inside(x + 1, y) && hash2(x, y, 41) % 4 !== 0));
  return shape(w, h, 'S', on, { bare: true, flat: LIGHT, texture: speckle(5, 6) });
}

// ── Props ──────────────────────────────────────────────────────────────────

/** Branches growing from (x, y) at angle a: segments as [x1, y1, x2, y2, half-width]. */
function branches(r: () => number, x: number, y: number, a: number, len: number, w: number, depth: number, out: [number, number, number, number, number][]): void {
  const x2 = x + Math.cos(a) * len;
  const y2 = y + Math.sin(a) * len;
  out.push([x, y, x2, y2, w]);
  if (depth === 0) return;
  branches(r, x2, y2, a - 0.45 - r() * 0.3, len * 0.66, Math.max(0.6, w * 0.6), depth - 1, out);
  branches(r, x2, y2, a + 0.4 + r() * 0.3, len * 0.62, Math.max(0.6, w * 0.6), depth - 1, out);
}

/** A broad-leaved tree; in winter its branches are bare, with snow along them. */
function tree(v: number, small: boolean, snowy: boolean, winter: boolean, sway = 0): Drawing {
  const r = rng(v * 7919 + 11);
  const W = small ? 22 : 28;
  const H = small ? 30 : 38;
  const cx = W / 2;
  const R = small ? 7 : 9;
  const trunkTop = small ? 15 : 20;
  if (winter) {
    const segs: [number, number, number, number, number][] = [];
    branches(r, cx, trunkTop + 2, -Math.PI / 2 - 0.55, R * 0.9, 1.5, 2, segs);
    branches(r, cx, trunkTop, -Math.PI / 2 + 0.5, R, 1.5, 2, segs);
    branches(r, cx, trunkTop - 4, -Math.PI / 2, R * 0.8, 1.2, 2, segs);
    const wood = (x: number, y: number): boolean =>
      (y >= trunkTop - 4 && y < H - 1 && Math.abs(x + 0.5 - cx) <= 2 + Math.max(0, y - (H - 4))) || segs.some(([ax, ay, bx, by, w]) => nearSegment(x, y, ax, ay, bx, by, w));
    return draw(W, H, [shape(W, H, 'T', wood, { texture: bark }), ...(snowy ? [snowOn(W, H, wood, 1)] : [])]);
  }
  const shapes: Shape[] = [];
  // A trunk that flares into roots, and two branches up into the crown.
  const side = r() < 0.5 ? -1 : 1;
  shapes.push(shape(W, H, 'T', (x, y) => y >= trunkTop - 3 && y < H - 1 && Math.abs(x + 0.5 - cx) <= 2 + Math.max(0, y - (H - 4)), { texture: bark }));
  shapes.push(shape(W, H, 'T', (x, y) => nearSegment(x, y, cx, trunkTop + 4, cx + side * R * 0.7, trunkTop - 5, 1.1), { bare: true }));
  shapes.push(shape(W, H, 'T', (x, y) => nearSegment(x, y, cx, trunkTop + 1, cx - side * R * 0.5, trunkTop - 7, 0.9), { bare: true }));
  // The crown: a lumpy mass of leaf clumps, wider than tall, leaning with the wind.
  const lean = Math.round(sway);
  const jitter = (r() - 0.5) * 2;
  const crown = canopy(small ? 2.6 : 3.2, v * 13 + 5, (x, y) => inEllipse(x, y, cx + lean + jitter, R + 1.5, R + 1, R * 0.9));
  shapes.push(shape(W, H, 'L', crown, { texture: clusters(small ? 2.6 : 3.2, v * 13 + 5), cast: true }));
  if (snowy) shapes.push(snowOn(W, H, crown, 1));
  return draw(W, H, shapes);
}

function pine(v: number, snowy: boolean, sway = 0): Drawing {
  const r = rng(v * 104729 + 3);
  const W = 22;
  const H = 44;
  const cx = W / 2;
  const shapes: Shape[] = [shape(W, H, 'T', (x, y) => y >= H - 8 && y < H - 1 && Math.abs(x + 0.5 - cx) <= 1.6, { texture: bark })];
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const top = 1 + i * 8 + Math.round(r());
    const height = 12 + i;
    const half = 3.5 + i * 2.1 + r() * 0.8;
    const tilt = Math.round(sway * (1 - i / tiers));
    // Each tier a triangle whose lower edge hangs in a fringe of needles.
    const inside = (x: number, y: number): boolean =>
      y >= top && y < top + height && Math.abs(x + 0.5 - cx - tilt) <= ((y - top + 1) * half) / height && !(y >= top + height - 2 && (x + i) % 3 === 0);
    shapes.push(shape(W, H, 'P', inside, { texture: needles(top, v + i), cast: true }));
    if (snowy) shapes.push(snowOn(W, H, inside, 3, true));
  }
  return draw(W, H, shapes);
}

function bush(v: number, snowy: boolean): Drawing {
  const r = rng(v * 31337 + 5);
  const W = 16;
  const H = 12;
  const jitter = (r() - 0.5) * 2;
  const mass = canopy(2.1, v * 17 + 3, (x, y) => y < H - 0.3 && inEllipse(x, y, 8 + jitter, 7.5, 7, 4.8), false);
  const shapes: Shape[] = [shape(W, H, 'L', (x, y) => y < H - 1 && mass(x, y), { texture: clusters(2.1, v * 17 + 3) })];
  if (snowy) shapes.push(snowOn(W, H, mass, 1));
  return draw(W, H, shapes);
}

function rock(v: number, snowy: boolean): Drawing {
  const big = v % 3 === 0;
  const W = big ? 20 : 14;
  const H = big ? 14 : 10;
  const shapes: Shape[] = [];
  const parts: [number, number, number, number][] = big ? [[9, 7.5, 8.5, 6], [14, 9.5, 5, 3.6]] : [[7, 5.5, 6, 4.5]];
  parts.forEach(([cx, cy, rx, ry], i) => {
    const inside = (x: number, y: number): boolean => y < H - 1 && inEllipse(x, y, cx, cy, rx, ry);
    shapes.push(shape(W, H, 'R', inside, { texture: speckle(v + i, 6), cast: i > 0 }));
    if (snowy) shapes.push(snowOn(W, H, inside));
  });
  return draw(W, H, shapes);
}

/** Inside a rounded oval (a superellipse): fuller than an ellipse, so a flat pond does not end in points. */
const inOval = (x: number, y: number, cx: number, cy: number, rx: number, ry: number): boolean =>
  Math.abs((x + 0.5 - cx) / rx) ** 2.6 + Math.abs((y + 0.5 - cy) / ry) ** 2.6 <= 1;

/** Water in a muddy bank: the far side shaded, ripples of light moving with `frame`. */
function water(W: number, H: number, frozen: boolean, frame: number, rim: string): Drawing {
  const cx = W / 2;
  const cy = H / 2;
  const key = frozen ? 'I' : 'W';
  const shimmer = (x: number, y: number, t: number): number => {
    if (frozen) return (x + y * 3) % 13 === 0 ? LIGHT : (x * 5 + y) % 17 === 0 ? GLEAM : t;
    if (y <= 2) return SHADOW;
    if ((x + y * 4 + frame * 3) % 12 === 0) return LIGHT;
    return (x * 7 + y * 3 + frame * 5) % 29 === 0 ? GLEAM : BASE;
  };
  // The bank: dark where it shades the water at the back, lit along the near edge.
  const bank = (_x: number, y: number, t: number): number => (t === OUTLINE ? t : y < cy ? SHADOW : LIGHT);
  return draw(W, H, [
    shape(W, H, rim, (x, y) => inOval(x, y, cx, cy, cx - 0.5, cy - 0.1), { bare: true, texture: bank }),
    shape(W, H, key, (x, y) => inOval(x, y, cx, cy + 0.4, cx - 2.2, cy - 1.6), { bare: true, texture: shimmer }),
  ]);
}

function reeds(v: number, sway = 0): Drawing {
  const r = rng(v * 4099 + 7);
  const W = 14;
  const H = 18;
  const shapes: Shape[] = [];
  for (let k = 0; k < 5; k++) {
    const x = 2 + k * 2.4 + r();
    const top = 3 + Math.floor(r() * 7);
    const bend = (r() - 0.5) * 3 + sway;
    shapes.push(shape(W, H, 'K', (px, py) => nearSegment(px, py, x, H - 1, x + bend, top, 0.6), { bare: true, texture: (_x, y, t) => (y > H - 6 ? SHADOW : t) }));
    if (k % 2 === 0) shapes.push(shape(W, H, 'k', (px, py) => nearSegment(px, py, x + bend, top + 1, x + bend * 0.85, top + 4, 1.1)));
  }
  return draw(W, H, shapes);
}

function stump(v: number, snowy: boolean): Drawing {
  const W = 14;
  const H = 10;
  const top = (x: number, y: number): boolean => inEllipse(x, y, 7, 3, 5.5, 2.4);
  const rings = (x: number, y: number, t: number): number => {
    const d = Math.sqrt(((x + 0.5 - 7) / 5.5) ** 2 + ((y + 0.5 - 3) / 2.4) ** 2);
    return t === OUTLINE ? t : Math.floor(d * 4) % 2 === 0 ? BASE : SHADOW;
  };
  return draw(W, H, [
    shape(W, H, 'T', (x, y) => y < H - 1 && x >= 2 && x <= 11 && y >= 3, { texture: bark }),
    shape(W, H, snowy ? 'S' : 'Y', top, { texture: snowy ? speckle(v) : rings }),
  ]);
}

function deadtree(v: number): Drawing {
  const r = rng(v * 6151 + 13);
  const W = 28;
  const H = 40;
  const cx = W / 2;
  const segs: [number, number, number, number, number][] = [[cx, H - 1, cx, 14, 2.4]];
  branches(r, cx, 16, -Math.PI / 2 - 0.6, 9, 1.6, 2, segs);
  branches(r, cx, 15, -Math.PI / 2 + 0.55, 10, 1.6, 2, segs);
  branches(r, cx, 24, -0.25, 7, 1.2, 1, segs);
  return draw(W, H, [shape(W, H, 'T', (x, y) => segs.some(([ax, ay, bx, by, w]) => nearSegment(x, y, ax, ay, bx, by, w)) || (y >= H - 3 && Math.abs(x + 0.5 - cx) <= 3 + (y - (H - 3))), { texture: bark })]);
}

function snowdrift(v: number): Drawing {
  const W = 24;
  const H = 10;
  const r = rng(v + 17);
  const a = 6 + r() * 2;
  const b = 3 + r() * 2;
  return draw(W, H, [shape(W, H, 'S', (x, y) => y < H - 1 && H - 1 - y <= a * Math.sin((Math.PI * (x + 0.5)) / W) + b * Math.sin((Math.PI * 2 * (x + 0.5)) / W) * 0.4, { texture: speckle(v, 11) })]);
}

/**
 * Mushrooms that glow: a wide flat dome of a cap, its rim a shade darker, bright spots clustered where the
 * light is strongest near its crown, a row of pale gills along its underside, and a pale tapering stem.
 * A cluster of a main cap and one or two smaller. `capW` is the main cap's width in pixels.
 */
function glowshroom(v: number, capW = 12): Drawing {
  const r = rng(v * 7307 + 9);
  const W = Math.round(capW * 1.9);
  const H = Math.round(capW * 1.05) + (Math.round(capW * 1.05) % 2);
  const shapes: Shape[] = [];
  const caps: [number, number][] = [[capW * 0.55, capW]];
  caps.push([capW * 1.4, capW * 0.6]);
  if (r() < 0.6) caps.push([capW * 1.05, capW * 0.4]);
  for (const [cx, cw] of caps) {
    const capH = Math.max(2, Math.round(cw * 0.42));
    const stemW = Math.max(2, Math.round(cw * 0.28));
    const foot = H - 1;
    const stemH = Math.max(2, Math.round(cw * 0.55));
    const capY = foot - stemH;
    // The cap: a dome, flat along its underside.
    const cap = (x: number, y: number): boolean => y <= capY && y > capY - capH - 1 && inEllipse(x, y, cx, capY + 0.5, cw / 2, capH + 0.5);
    shapes.push(
      shape(W, H, 'Q', cap, {
        cast: true,
        texture: (x, y, t) => {
          if (t === OUTLINE) return t;
          if (y >= capY - 1) return DARK;
          const hs = hash2(x, y, v);
          // Spots: bright, mostly up towards the crown.
          if (hs % 5 === 0 && y < capY - capH * 0.3) return GLEAM;
          if (hs % 11 === 0) return GLEAM;
          return y < capY - capH * 0.6 ? LIGHT : BASE;
        },
      }),
    );
    // Gills: a row of pale dots just under the cap's edge.
    shapes.push(shape(W, H, 'g', (x, y) => y === capY + 1 && Math.abs(x + 0.5 - cx) < cw * 0.42 && (x + Math.round(cx)) % 2 === 0, { bare: true, flat: BASE }));
    // The stem: pale, tapering a little towards the cap, dark down one side.
    shapes.push(
      shape(W, H, 'q', (x, y) => y > capY && y <= foot && Math.abs(x + 0.5 - cx) <= stemW / 2 + ((y - capY) / stemH) * 0.6, {
        texture: (x, _y, t) => (t === OUTLINE ? t : x + 0.5 > cx + stemW * 0.2 ? DARK : x + 0.5 < cx - stemW * 0.2 ? LIGHT : BASE),
      }),
    );
  }
  return draw(W, H, shapes);
}

function mushrooms(v: number): Drawing {
  const r = rng(v * 991 + 1);
  const W = 14;
  const H = 10;
  const shapes: Shape[] = [];
  const caps: [number, number, number][] = [[4, 4, 3.4], [10, 6, 2.6]];
  if (r() < 0.6) caps.push([7.5, 7.5, 1.8]);
  for (const [cx, cy, cr] of caps) {
    shapes.push(shape(W, H, 'm', (x, y) => y > cy && y < H - 1 && Math.abs(x + 0.5 - cx) <= Math.max(0.8, cr * 0.35)));
    shapes.push(shape(W, H, 'M', (x, y) => y <= cy && inEllipse(x, y, cx, cy + 0.5, cr, cr * 0.85), { cast: true }));
    shapes.push({ rows: ['m'], x: Math.round(cx - cr * 0.4), y: Math.round(cy - cr * 0.45), bare: true, flat: LIGHT });
  }
  return draw(W, H, shapes);
}

// ── Homes ──────────────────────────────────────────────────────────────────
// Each 40 pixels wide; `D` is the dark doorway where its eyes show while it is inside, `G` a window.

// ── Shelters ───────────────────────────────────────────────────────────────
// Nothing built: what it found, or made from what was at hand, to get through. Each is 40 pixels wide.
// `D` is the dark hollow where its eyes show while it is inside; `G` a few embers, glowing at night.

type Home = {
  readonly d: Drawing;
  readonly door: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  /** Where its smoke rises from, in pixels: the embers. */
  readonly smoke: { readonly x: number; readonly y: number };
};

/** An arch: a w by h rectangle at (x0, y0) with a round top. */
function arch(x0: number, y0: number, w: number, h: number) {
  return (x: number, y: number): boolean => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h && (y >= y0 + w / 2 || inEllipse(x, y, x0 + w / 2, y0 + w / 2, w / 2, w / 2));
}

/** Whether pixel (x, y), counted from a home's top-left, is inside its arched doorway. */
export function inDoorway(d: Doorway, x: number, y: number): boolean {
  return arch(d.x, d.y, d.w, d.h)(x, y);
}

/** Rags and hides: patched, in uneven strips. */
const rags = (seed: number) => (x: number, y: number, t: number): number =>
  t <= DARK || t >= GLEAM ? t : (Math.floor(x / 5) + Math.floor(y / 4) + seed) % 3 === 0 ? t - 1 : hash2(x, y, seed) % 11 === 0 ? t + 1 : t;

function home(biome: BiomeName, snowy: boolean): Home {
  const W = 40;
  let H: number;
  let door: Home['door'];
  let embers: { x: number; y: number };
  let shapes: Shape[];
  const hollow = (d: Home['door']): Shape => shape(W, H, 'D', arch(d.x, d.y, d.w, d.h), { bare: true, flat: BASE });
  const pole = (key: string, ax: number, ay: number, bx: number, by: number, r: number, more: Partial<Shape> = {}): Shape =>
    shape(W, H, key, (x, y) => y < H - 1 && nearSegment(x, y, ax, ay, bx, by, r), more);
  /** A ring of stones round a few embers, its bottom on the ground at (x0, H - 1). */
  const fire = (x0: number): Shape[] => [
    ...[-3, 0, 3].map((dx, i) => shape(W, H, 'R', (x, y) => inEllipse(x, y, x0 + dx + 1.5, H - 2.2 - (i === 1 ? 0.6 : 0), 1.8, 1.4), { texture: speckle(i + 2) })),
    { rows: ['.G.', 'GGG'], x: x0, y: H - 4, bare: true, flat: BASE },
  ];
  switch (biome) {
    case 'forest': {
      // A great fallen trunk lying low across the ground, its hollow dug beneath where the earth fell away;
      // the stump of a torn root at one end. Low, so it hides none of the glow behind.
      H = 28;
      door = { x: 13, y: 13, w: 12, h: 14 };
      const log = (x: number, y: number): boolean => nearSegment(x, y, 1, 7, 32, 5, 5.2) && y >= 1;
      const bank = (x: number, y: number): boolean => y < H - 1 && y >= 11 && inEllipse(x, y, 19, H + 4, 19, 17);
      const rootEnd = (x: number, y: number): boolean => inEllipse(x, y, 34, 7, 5.5, 6.5) && y >= 1;
      shapes = [
        shape(W, H, 'e', bank, { texture: speckle(5, 9) }),
        shape(W, H, 'Y', rootEnd, { texture: (x, y, t) => (t === OUTLINE ? t : (x + y) % 5 === 0 ? DARK : t) }),
        ...[0.3, 1.1, 2.0, 2.9, 3.9, 5.0].map((a, i) => pole('T', 34 + Math.cos(a) * 4, 7 + Math.sin(a) * 5, 34 + Math.cos(a + 0.1) * (7 + (i % 2)), 7 + Math.sin(a + 0.1) * (8 + (i % 3)), 0.7)),
        shape(W, H, 'T', log, { texture: bark, cast: true }),
        shape(W, H, 'h', (x, y) => log(x, y) && !log(x, y - 2) && hash2(x, 0, 5) % 3 !== 0, { bare: true, texture: speckle(9, 4) }),
        hollow(door),
        ...fire(31),
      ];
      embers = { x: 32, y: H - 4 };
      break;
    }
    case 'meadow': {
      // A lean-to of poles and patched rags, propped against a boulder out of the wind.
      H = 28;
      door = { x: 13, y: 14, w: 12, h: 13 };
      const slope = (x: number): number => 3 + ((x - 12) * 24) / 27;
      shapes = [
        shape(W, H, 'R', (x, y) => y < H - 1 && inEllipse(x, y, 9, 17, 9, 10.5), { texture: speckle(4, 6) }),
        shape(W, H, 'H', (x, y) => x >= 11 && x <= 38 && y < H - 1 && y >= slope(x), { texture: rags(7), cast: true }),
        ...[[12, 3, 39, 27], [15, 2, 36, 27], [18, 4, 39, 22]].map(([ax, ay, bx, by]) => pole('Z', ax, ay, bx, by, 0.7)),
        hollow(door),
        ...fire(29),
      ];
      embers = { x: 30, y: H - 4 };
      break;
    }
    case 'tundra': {
      // A cave dug into a drift, a hide pinned at its mouth, two sticks crossed above as a marker.
      H = 26;
      door = { x: 14, y: 12, w: 10, h: 13 };
      const top = (x: number): number => 6 + ((x + 0.5 - 20) / 19) ** 2 * 16 + (hash2(x >> 2, 0, 11) % 2);
      shapes = [
        shape(W, H, 'S', (x, y) => y < H - 1 && y >= top(x), { texture: speckle(6, 9) }),
        shape(W, H, 'R', (x, y) => inEllipse(x, y, 4, H - 3, 3.5, 2.6), { texture: speckle(2) }),
        hollow(door),
        shape(W, H, 'H', (x, y) => x >= 12 && x <= 15 && y >= 11 && y <= 21 - (x % 2) * 2, { texture: rags(3) }),
        pole('Z', 24, 0, 29, 8, 0.6),
        pole('Z', 30, 1, 24, 8, 0.6),
        { rows: ['HH', 'H.'], x: 28, y: 2, texture: rags(5) },
        ...fire(31),
      ];
      embers = { x: 32, y: H - 4 };
      break;
    }
    case 'swamp': {
      // The roots of a drowned tree, its top long since broken off, arching over a dry hollow.
      H = 34;
      door = { x: 14, y: 18, w: 12, h: 15 };
      const jag = (x: number): number => 2 + (hash2(x, 0, 23) % 4) + (x % 5 === 0 ? 2 : 0);
      const trunk = (x: number, y: number): boolean => y >= jag(x) && y < 24 && Math.abs(x + 0.5 - 20) <= 8 + Math.max(0, y - 16) * 0.6;
      shapes = [
        shape(W, H, 'Z', trunk, { texture: bark }),
        pole('Z', 14, 20, 7, 33, 2.2, { texture: bark }),
        pole('Z', 26, 20, 33, 33, 2.2, { texture: bark }),
        hollow(door),
        pole('Z', 12, 18, 2, 33, 2.4, { texture: bark, cast: true }),
        pole('Z', 28, 18, 38, 33, 2.4, { texture: bark, cast: true }),
        ...[13, 17, 22, 26].map((x0, i) => shape(W, H, 'h', (x, y) => x === x0 && y >= jag(x0) + 1 && y <= jag(x0) + 5 + i * 2, { bare: true })),
        ...fire(33),
      ];
      embers = { x: 34, y: H - 4 };
      break;
    }
  }
  if (snowy && biome !== 'tundra') shapes.push(snowOn(W, H, (x, y) => shapes.slice(0, 3).some((s) => (s.rows[y - s.y]?.[x - s.x] ?? '.') !== '.'), 2, true));
  return { d: draw(W, H, shapes), door, smoke: embers };
}

// ── Colours ────────────────────────────────────────────────────────────────

/** A material's ramp, its outline much softer than a character's. */
function soft(base: number): Ramp {
  const r = ramp(base);
  // Edges in a darker shade of the thing itself, not a black line: shapes read by colour, as in a painting.
  return { ...r, outline: mix(r.outline, r.dark, toHsl(base)[2] > 0.75 ? 0.85 : 0.6) };
}

/** A shelter's rags or hide, its moss, and the pale wood of a broken end. */
const HOME_COLORS: Readonly<Record<BiomeName, { rags: number; moss: number; cut: number }>> = {
  meadow: { rags: 0x7a6a56, moss: 0x6a7a4a, cut: 0x9a7a58 },
  forest: { rags: 0x8a7a64, moss: 0x5a6a3a, cut: 0xb89a70 },
  tundra: { rags: 0x7a6450, moss: 0x6a7058, cut: 0x9a8a78 },
  swamp: { rags: 0x7a6652, moss: 0x6f8a4a, cut: 0x9a7a58 },
};

function materials(look: Look): Readonly<Record<string, Material>> {
  const gloomy = BIOMES[look.biome].gloom !== undefined;
  const swampy = look.biome === 'swamp' && look.season !== 'winter';
  const [leafLight, leafDark] = LEAVES[swampy ? 'summer' : look.season];
  const leaf = mix(leafLight, leafDark, 0.45);
  const hc = HOME_COLORS[look.biome];
  return {
    L: { ramp: soft(leaf) },
    P: { ramp: soft(look.snowy ? 0x2f6a44 : 0x3f8a4c) },
    T: { ramp: soft(gloomy ? 0x0d3946 : look.biome === 'swamp' ? 0x6a5a48 : 0x7a5434) },
    R: { ramp: soft(0x8a8680) },
    S: { ramp: soft(0xe6eef6) },
    W: { ramp: soft(mix(look.biome === 'swamp' ? 0x3e6a5a : 0x3a7cb8, look.sky, 0.35)) },
    I: { ramp: soft(0xb4d4ea) },
    w: { ramp: soft(gloomy ? 0x0d3946 : 0x6a5a3a) },
    e: { ramp: soft(gloomy ? 0x0d3946 : 0x6e5a48) },
    M: { ramp: soft(0x8a7a6a) },
    Q: { ramp: { outline: 0x104952, dark: 0x156874, shadow: 0x2698a5, base: 0x2698a5, light: 0x2698a5, gleam: 0x36bfcf }, glow: true },
    q: { ramp: { outline: 0x20333d, dark: 0x4a7a86, shadow: 0x7aa8b0, base: 0x7aa8b0, light: 0xb0d4d8, gleam: 0xb0d4d8 } },
    g: { ramp: flat(0x7aa8b0, 0x7aa8b0), glow: true },
    m: { ramp: soft(0xeee6d4) },
    K: { ramp: soft(look.biome === 'swamp' ? 0x8a9a4a : 0x9aaa5a) },
    k: { ramp: soft(0x7a4a2a) },
    Y: { ramp: soft(hc.cut) },
    Z: { ramp: soft(0xa88a68) },
    H: { ramp: soft(hc.rags) },
    h: { ramp: soft(hc.moss) },
    D: { ramp: flat(0x100c0a, 0x100c0a) },
    // Embers: grey ash with a glow by day; at night the one warm light besides its own.
    G: look.night ? { ramp: flat(0xff9a40, 0x3a2410), glow: true } : { ramp: flat(0x8a5a40, 0x3a2a24) },
  };
}

// ── Building, cached ───────────────────────────────────────────────────────

function build(kind: PropKind, variant: number, look: Look): { d: Drawing; door?: Home['door']; smoke?: Home['smoke'] } {
  const snowy = look.snowy;
  switch (kind) {
    case 'home':
      return home(look.biome, snowy);
    case 'tree':
      return { d: tree(variant, variant % 2 === 1, snowy, look.season === 'winter', look.sway) };
    case 'pine':
      return { d: pine(variant, snowy, look.sway) };
    case 'bush':
      return { d: bush(variant, snowy) };
    case 'rock':
      return { d: rock(variant, snowy) };
    case 'pond':
      return { d: water(34, 10, look.frozen, look.frame % WATER_FRAMES, 'w') };
    case 'reeds':
      return { d: reeds(variant, look.sway) };
    case 'stump':
      return { d: stump(variant, snowy) };
    case 'deadtree':
      return { d: deadtree(variant) };
    case 'snowdrift':
      return { d: snowdrift(variant) };
    case 'mushrooms':
      return { d: mushrooms(variant) };
    case 'glowshroom':
      return { d: glowshroom(variant, 10 + (variant % 3) * 2) };
  }
}

const sprites = new Map<string, ColorSprite>();
const footprints = new Map<string, Footprint>();
const PLAIN: Omit<Look, 'biome'> = { season: 'summer', snowy: false, frozen: false, night: false, frame: 0, sky: 0x9cc8f0, sway: 0 };

/** Props that sway in the wind. */
export const SWAYS: ReadonlySet<PropKind> = new Set(['tree', 'pine', 'reeds']);

/** The size of a prop in cells; for a home, where its doorway is. */
export function footprint(kind: PropKind, variant: number, biome: BiomeName): Footprint {
  const id = `${kind}:${variant}:${biome}`;
  let f = footprints.get(id);
  if (f === undefined) {
    const { d, door, smoke } = build(kind, variant, { biome, ...PLAIN });
    f = { w: d.w, h: Math.ceil(d.h / 2), ...(door === undefined ? {} : { door: { ...door, col: door.x + (door.w >> 1) - 1, row: (door.y + 5) >> 1 } }), ...(smoke === undefined ? {} : { smoke }) };
    footprints.set(id, f);
  }
  return f;
}

/** A prop painted for how things look now. */
export function propArt(kind: PropKind, variant: number, look: Look): ColorSprite {
  const water = kind === 'pond';
  const id = `${kind}:${variant}:${look.biome}:${look.season}:${look.snowy}:${look.frozen}:${kind === 'home' && look.night}:${water ? `${look.frame % WATER_FRAMES}:${look.sky}` : 0}:${SWAYS.has(kind) ? look.sway : 0}`;
  let s = sprites.get(id);
  if (s === undefined) {
    const { d } = build(kind, variant, look);
    s = paint(d, materials(look));
    if (sprites.size > 400) sprites.clear();
    sprites.set(id, s);
  }
  return s;
}

// ── Small things: critters, food, the toy, the cairn ───────────────────────
// Drawn facing right; each critter has two frames. Keys: `a` its colour, `b` its body, `e` an eye.

const CRITTER_ROWS: Readonly<Record<CritterKind, readonly [readonly string[], readonly string[]]>> = {
  butterfly: [['aa.aa', 'aabaa', '.a.a.'], ['.a.a.', '.aba.', '..b..']],
  moth: [['aa.aa', 'aabaa', '.a.a.'], ['.a.a.', '.aba.', '..b..']],
  bird: [['a...a', '.a.a.', '..a..'], ['.....', 'aaaaa', '..a..']],
  firefly: [['a'], ['a']],
  frog: [['.e..e.', 'aaaaaa', 'aaaaaa', 'a.aa.a'], ['.e..e.', 'aaaaaa', 'aaaaaa', '.a..a.']],
};

/** Flyers that are too small for an outline: a dark line would swallow them. */
const BARE: ReadonlySet<CritterKind> = new Set(['firefly', 'bird']);

/** A critter's frame, in its colour. */
export function critterArt(kind: CritterKind, frame: number, color: number): ColorSprite {
  const id = `critter:${kind}:${frame % 2}:${color}`;
  let s = sprites.get(id);
  if (s === undefined) {
    const rows = CRITTER_ROWS[kind][frame % 2];
    const w = rows[0].length + 2;
    const h = rows.length + 2 + (rows.length % 2);
    const d = draw(w, h, [{ rows, x: 1, y: 1, bare: BARE.has(kind), texture: (_x, _y, t) => Math.max(t, SHADOW) }]);
    s = paint(d, {
      a: { ramp: soft(color), glow: kind === 'firefly' },
      b: { ramp: flat(0x2a2420, 0x2a2420) },
      e: { ramp: flat(0x101010, 0x101010) },
    });
    sprites.set(id, s);
  }
  return s;
}

/** Things it can hold or find, by the glyph the game knows them by. */
const ITEM_ROWS: Readonly<Record<string, readonly string[]>> = {
  '•': ['.l.', 'rrr', 'r+r', '.r.'],
  '°': ['.d.', 'ddd', 'd+d', '.d.'],
  '*': ['..s..', '.sss.', 'ss+ss', '.s.s.'],
  '▪': ['cccc', 'c.cc', 'cc.c'],
  'ó': ['.l.', '.p.', 'p+p', 'ppp'],
  o: ['.oo.', 'o+oo', 'oooo'],
};

/** A small thing: food, a find, a stone; anything unknown is a little gem in its colour. */
export function itemArt(glyph: string, color: number): ColorSprite {
  const id = `item:${glyph}:${color}`;
  let s = sprites.get(id);
  if (s === undefined) {
    const rows = ITEM_ROWS[glyph] ?? ['.x.', 'x+x', '.x.'];
    const h = rows.length + 2;
    const d = draw(rows[0].length + 2, h + (h % 2), [{ rows, x: 1, y: 1 }]);
    const glow = glyph === '*' || glyph === '°';
    s = paint(d, {
      l: { ramp: soft(0x4f9a3a) },
      r: { ramp: soft(color) },
      d: { ramp: soft(color), glow },
      s: { ramp: soft(color), glow },
      c: { ramp: soft(color) },
      p: { ramp: soft(color) },
      o: { ramp: soft(color) },
      x: { ramp: soft(color), glow: true },
    });
    sprites.set(id, s);
  }
  return s;
}

/** The glowing toy: a ball with a glint. */
export function toyArt(color: number): ColorSprite {
  const id = `toy:${color}`;
  let s = sprites.get(id);
  if (s === undefined) {
    s = paint(draw(6, 6, [{ rows: ['.tt.', 't+tt', 'tttt', '.tt.'], x: 1, y: 1 }]), { t: { ramp: soft(color), glow: true } });
    sprites.set(id, s);
  }
  return s;
}

/** Its cairn of `stones`: three at the bottom, then two, two, one, one. */
export function cairnArt(stones: number, snowy: boolean): ColorSprite {
  const id = `cairn:${stones}:${snowy}`;
  let s = sprites.get(id);
  if (s === undefined) {
    const levels = [3, 2, 2, 1, 1];
    const W = 18;
    const H = 18;
    const shapes: Shape[] = [];
    let left = stones;
    for (let level = 0; level < levels.length && left > 0; level++) {
      const n = Math.min(levels[level], left);
      left -= n;
      for (let i = 0; i < n; i++) {
        const cx = W / 2 + (i - (n - 1) / 2) * 5;
        const cy = H - 3 - level * 3;
        const inside = (x: number, y: number): boolean => inEllipse(x, y, cx, cy, 2.8 - level * 0.2, 1.8);
        shapes.push(shape(W, H, 'R', inside, { texture: speckle(level * 3 + i, 5), cast: true }));
        if (snowy) shapes.push(snowOn(W, H, inside, 1));
      }
    }
    s = paint(draw(W, H, shapes), { R: { ramp: soft(0xa8a49c) }, S: { ramp: soft(0xe6eef6) } });
    sprites.set(id, s);
  }
  return s;
}

// ── The foreground ─────────────────────────────────────────────────────────
// What grows right in front of the glass, in the bottom corners: it frames the scene, darker for being
// so near. Drawn for the left corner; the right is the same mirrored, from another seed.

/** A blade of grass or a reed rising from (x, y) by `len`, leaning `lean` pixels at its tip. */
function blade(W: number, H: number, key: string, x: number, y: number, len: number, lean: number, width: number): Shape {
  const pts: [number, number][] = [];
  for (let k = 0; k <= 5; k++) {
    const t = k / 5;
    pts.push([x + lean * t * t, y - len * t]);
  }
  return shape(W, H, key, (px, py) => pts.some(([bx, by], k) => k > 0 && nearSegment(px, py, pts[k - 1][0], pts[k - 1][1], bx, by, width * (1 - (k / 5) * 0.6))), {
    texture: (_x, yy, t) => (t > DARK && t < GLEAM && yy > y - len * 0.3 ? t - 1 : t),
  });
}

function foreground(biome: BiomeName, seed: number, sway: number, heavy = true): Drawing {
  const r = rng(seed * 2971 + 3);
  const W = biome === 'forest' ? 44 : 26;
  const H = biome === 'forest' ? 30 : 22;
  const shapes: Shape[] = [];
  const y = H - 1;
  const grass = (key: string, count: number, tall: number): void => {
    for (let k = 0; k < count; k++) {
      const x = 1 + k * (20 / count) + r() * 2;
      const len = tall * (0.45 + r() * 0.55) * (1 - (x / W) * 0.5);
      shapes.push(blade(W, H, key, x, y, len, (r() - 0.35) * 6 + sway * (len / tall), 1.1));
    }
  };
  switch (biome) {
    case 'meadow':
      // Tall grass gone to seed: thin stalks with a seed head.
      grass('G', 9, 19);
      for (const fx of [6 + r() * 4, 13 + r() * 4]) {
        const top = 4 + Math.floor(r() * 5);
        shapes.push(blade(W, H, 'G', fx, y, H - top, sway, 0.5));
        shapes.push({ rows: ['Z', 'Z', 'Z'], x: Math.round(fx + sway), y: top - 2, bare: true });
      }
      break;
    case 'forest': {
      // Glowing mushrooms low in the corner, the biggest right in front of the glass; no grass in the gloom.
      for (const [capW, x0, dy] of (heavy ? [[11, 2, 0], [18, 16, 0]] : [[9, 1, 0]]) as readonly (readonly [number, number, number])[]) {
        const d = glowshroom(seed + capW, capW);
        d.mat.forEach((row, yy) => Array.from(row).forEach((k, xx) => k !== '.' && shapes.push({ rows: [k], x: xx + x0, y: yy + (H - d.h) + dy, bare: true, flat: d.tone[yy * d.w + xx] })));
      }
      break;
      // A fern: a curved stem with leaflets, and grass round it.
      grass('G', 6, 14);
      const stem: [number, number][] = [];
      for (let k = 0; k <= 8; k++) stem.push([4 + k * 1.8 + sway * (k / 8), y - k * 2.1 + (k * k) / 6]);
      stem.forEach(([sx, sy], k) => {
        if (k === 0 || k > 7) return;
        const len = 5 - k * 0.45;
        shapes.push(blade(W, H, 'G', sx, sy, len, -len * 0.6, 0.8));
        shapes.push(blade(W, H, 'G', sx, sy + 0.5, len * 0.8, len * 0.9, 0.8));
      });
      shapes.push(shape(W, H, 'G', (px, py) => stem.some(([sx, sy], k) => k > 0 && nearSegment(px, py, stem[k - 1][0], stem[k - 1][1], sx, sy, 0.6))));
      break;
    }
    case 'tundra': {
      const rock = (px: number, py: number): boolean => py < H - 1 && inEllipse(px, py, 7, H - 4, 8, 6);
      shapes.push(shape(W, H, 'R', rock, { texture: speckle(seed) }));
      shapes.push(snowOn(W, H, rock, 2));
      grass('Z', 5, 12);
      break;
    }
    case 'swamp':
      grass('K', 6, 20);
      for (let k = 0; k < 3; k++) {
        const x = 3 + k * 6 + r() * 2;
        const top = 2 + Math.floor(r() * 6);
        shapes.push(shape(W, H, 'k', (px, py) => nearSegment(px, py, x + sway * 0.8, top, x + sway * 0.7, top + 4, 1.2)));
      }
      break;
  }
  return draw(W, H, shapes);
}

/** The foreground for a corner: darker than the scene, swaying with the wind in two frames. */
export function foregroundArt(biome: BiomeName, side: -1 | 1, season: Season, snowy: boolean, frame: number, heavy = true): ColorSprite {
  const id = `fg:${biome}:${side}:${season}:${snowy}:${frame % 2}:${heavy}`;
  let s = sprites.get(id);
  if (s === undefined) {
    const [leafLight, leafDark] = LEAVES.summer;
    // Green in spring and summer; golden, dry grass in autumn; pale straw under snow.
    const grass = snowy ? 0xb8ac80 : season === 'autumn' ? 0xc8a04a : season === 'spring' ? 0x7cc458 : mix(leafLight, leafDark, 0.5);
    const near = (c: number): Material => ({ ramp: soft(mix(c, 0x0a0c10, 0.16)) });
    s = paint(foreground(biome, side < 0 ? 1 : 2, (frame % 2) * 1.5 - 0.5, heavy), {
      G: near(biome === 'swamp' && !snowy ? mix(leafLight, leafDark, 0.6) : grass),
      Q: { ramp: { outline: 0x104952, dark: 0x156874, shadow: 0x2698a5, base: 0x2698a5, light: 0x2698a5, gleam: 0x36bfcf }, glow: true },
      q: { ramp: { outline: 0x20333d, dark: 0x4a7a86, shadow: 0x7aa8b0, base: 0x7aa8b0, light: 0xb0d4d8, gleam: 0xb0d4d8 } },
      g: { ramp: flat(0x7aa8b0, 0x7aa8b0), glow: true },
      K: near(0x7a8a4a),
      k: near(0x6a3a22),
      Z: near(0xd8c088),
      T: near(0x7a5a3a),
      R: near(0x8a8680),
      S: near(0xe6eef6),
    });
    sprites.set(id, s);
  }
  return s;
}

// ── Landmarks ──────────────────────────────────────────────────────────────
// One far-off set piece per biome, softened by the haze: a broken windmill in the meadow, a waterfall
// in the forest, a sunken tower in the swamp.

/** Frames of a landmark's own motion: the water's fall. */
export const LANDMARK_FRAMES = 8;

function windmill(): Drawing {
  const W = 22;
  const H = 26;
  const hub = [11, 8];
  const tower = (x: number, y: number): boolean => y >= 9 && y < H - 1 && Math.abs(x + 0.5 - 11) <= 3 + (y - 9) * 0.12;
  const shapes: Shape[] = [
    shape(W, H, 'H', tower, { texture: speckle(4, 9) }),
    shape(W, H, 'h', (x, y) => y >= 6 && y <= 9 && Math.abs(x + 0.5 - 11) <= 1 + (y - 6) * 1.1),
    shape(W, H, 'D', (x, y) => y >= H - 5 && y < H - 1 && Math.abs(x + 0.5 - 11) <= 1, { bare: true, flat: BASE }),
    shape(W, H, 'G', (x, y) => y >= 14 && y <= 15 && Math.abs(x + 0.5 - 11) <= 0.6, { bare: true, flat: BASE }),
  ];
  // Stopped long ago, one sail torn away.
  for (let k = 0; k < 3; k++) {
    const a = 0.35 + k * (Math.PI / 2);
    const [cx, cy] = hub;
    const ex = cx + Math.cos(a) * 10;
    const ey = cy + Math.sin(a) * 10;
    // A sail along each arm, set a little behind it.
    const nx = -Math.sin(a) * 1.6;
    const ny = Math.cos(a) * 1.6;
    shapes.push(shape(W, H, 'x', (x, y) => nearSegment(x, y, cx + Math.cos(a) * 3 + nx, cy + Math.sin(a) * 3 + ny, ex + nx, ey + ny, 1.1), { bare: true }));
    shapes.push(shape(W, H, 'Z', (x, y) => nearSegment(x, y, cx, cy, ex, ey, 0.55), { bare: true, flat: DARK }));
  }
  return draw(W, H, shapes);
}

function waterfall(frame: number): Drawing {
  const W = 26;
  const H = 30;
  // A rocky peak with a notch, the water falling from it into mist; its foot hides behind the woods.
  const top = (x: number): number => 3 + Math.abs(x + 0.5 - 13) * 0.75 + (hash2(x >> 1, 0, 61) % 3) - (Math.abs(x + 0.5 - 13) < 2.5 ? -2 : 0);
  const fall = (x: number, y: number, t: number): number => ((y + frame * 2 + (x % 2)) % 5 < 2 ? GLEAM : t === OUTLINE ? t : LIGHT);
  return draw(W, H, [
    shape(W, H, 'R', (x, y) => x >= 1 && x <= 24 && y >= top(x) && y < H - 1, { texture: speckle(7, 5) }),
    shape(W, H, 'W', (x, y) => x >= 11 && x <= 14 && y >= 6 && y < H - 4, { bare: true, texture: fall }),
    shape(W, H, 'S', (x, y) => inEllipse(x, y, 13, H - 4.5, 6 + (frame % 2) * 0.5, 2), { bare: true, flat: LIGHT }),
  ]);
}

function sunkenTower(): Drawing {
  const W = 14;
  const H = 28;
  const lean = (y: number): number => (H - y) * 0.13;
  const tower = (x: number, y: number): boolean => y < H - 1 && y >= 3 + (x % 3 === 0 ? 3 : x % 2 === 0 ? 1 : 0) && Math.abs(x + 0.5 - 6 - lean(y)) <= 3.4;
  const blocks = (x: number, y: number, t: number): number => (t > DARK && t < GLEAM && (y % 3 === 0 || (x + Math.floor(y / 3)) % 3 === 0) ? t - 1 : t);
  return draw(W, H, [
    shape(W, H, 'R', tower, { texture: blocks }),
    shape(W, H, 'G', (x, y) => y >= 10 && y <= 12 && Math.abs(x + 0.5 - 6 - lean(y)) <= 0.8, { bare: true, flat: BASE }),
  ]);
}

/**
 * The landmark of a biome, if it has one drawn as a sprite (the tundra's frozen lake is drawn into the land
 * itself). Its colours lean towards `haze`, the sky at the horizon.
 */
export function landmarkArt(biome: BiomeName, frame: number, night: boolean, haze: number): ColorSprite | null {
  if (biome === 'tundra' || biome === 'forest') return null;
  const f = biome === 'forest' ? frame % LANDMARK_FRAMES : 0;
  const id = `landmark:${biome}:${f}:${night}:${haze}`;
  let s = sprites.get(id);
  if (s === undefined) {
    const far = (c: number): Material => ({ ramp: soft(mix(c, haze, 0.3)) });
    const window: Material = night && biome === 'swamp' ? { ramp: flat(0xb8c8c0, 0x2a3a3a), glow: true } : far(0x3a4a58);
    const d = biome === 'meadow' ? windmill() : biome === 'forest' ? waterfall(f) : sunkenTower();
    s = paint(d, {
      H: far(0xe8dcc0),
      h: far(0xc0392b),
      x: far(0xf4eee0),
      Z: far(0x6a4a30),
      D: far(0x3a2a20),
      R: far(biome === 'swamp' ? 0x9a9a8a : 0x7a8088),
      W: far(0x9cd0f0),
      S: far(0xf4f8fc),
      Y: far(0x3a3a40),
      G: window,
    });
    sprites.set(id, s);
  }
  return s;
}

// ── Signs: hearts, notes, sleep and the marks above its head ───────────────
// Drawn in pixels, so nothing in the scene is a letter. `x` is the sign's colour, `+` its glint.

const SIGN_ROWS: Readonly<Record<string, readonly string[]>> = {
  '♥': ['x.x', 'xxx', '.x.'],
  '♪': ['.xx', '.x.', 'xx.'],
  '♫': ['xxx', 'x.x', 'x.x'],
  z: ['xxx', '.x.', 'xxx'],
  Z: ['xxxx', '..x.', '.x..', 'xxxx'],
  '?': ['xxx', '..x', '.x.', '...', '.x.'],
  '!': ['x', 'x', 'x', '.', 'x'],
  '…': ['x.x.x'],
};

/** Whether a glyph has a pixel sign. */
export const hasSign = (glyph: string): boolean => glyph in SIGN_ROWS;

/** A sign in its colour, with a dark rim so it reads on any ground. */
export function signArt(glyph: string, color: number): ColorSprite {
  const id = `sign:${glyph}:${color}`;
  let s = sprites.get(id);
  if (s === undefined) {
    const rows = SIGN_ROWS[glyph] ?? SIGN_ROWS['?'];
    const w = rows[0].length + 2;
    const h = rows.length + 2;
    s = paint(draw(w, h + (h % 2), [{ rows, x: 1, y: 1, flat: BASE }]), { x: { ramp: { ...soft(color), base: color }, glow: true } });
    sprites.set(id, s);
  }
  return s;
}
