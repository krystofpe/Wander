// The surround: what frames the scene from just in front of the glass, painted per biome. Bare branches
// and trunks at the sides, a few last leaves, snowy boughs, hanging moss.
// Darker than the scene for being so near, lit only along the edges that face it, like a window onto a
// brighter world. Painted pixel by pixel with noise, without outlines.
import type { BiomeName } from './config.ts';
import { tone as paletteTone } from './palette.ts';
import { clumpAt } from './scenery.ts';
import type { ColorSprite } from './kit.ts';
import { hash2, makeNoise } from './noise.ts';
import type { Noise2D } from './noise.ts';
import type { Season } from './sky.ts';

/** The colours of a canopy or a wall: deep inside, its body, and the lit edge facing the scene. */
type Tones = { readonly deep: number; readonly body: number; readonly lit: number; readonly rim: number };

const LEAF: Readonly<Record<Season, Tones>> = {
  spring: { deep: 0x14281e, body: 0x26482c, lit: 0x5e8e3a, rim: 0xa8cc58 },
  summer: { deep: 0x12241c, body: 0x223e2a, lit: 0x4e7a34, rim: 0x94bc4c },
  autumn: { deep: 0x2a1610, body: 0x5a2a18, lit: 0xa85a24, rim: 0xe0a040 },
  winter: { deep: 0x161a22, body: 0x2c3038, lit: 0x8a96a8, rim: 0xeef4fa },
};
const PINE: Tones = { deep: 0x0c1a16, body: 0x16302a, lit: 0x2e5a40, rim: 0x5a8a5a };
const MOSS: Tones = { deep: 0x1a2018, body: 0x3a4632, lit: 0x6e7a52, rim: 0x9aa070 };

const cache = new Map<string, ColorSprite>();
/** Where a crow may sit: the end of the big side's topmost branch, in pixels, by the same key as the cache. */
const perches = new Map<string, { x: number; y: number }>();
const noises = new Map<number, Noise2D>();

function noiseFor(seed: number): Noise2D {
  let n = noises.get(seed);
  if (n === undefined) {
    n = makeNoise(seed ^ 0x5a17);
    noises.set(seed, n);
  }
  return n;
}

/**
 * The surround for a window of `w` columns and `h` pixel rows, whose sky is `sky` pixel rows tall. `sway`
 * shifts leaf edges a pixel with the wind; `side` puts the big trunk left (-1) or right (1).
 */
export function surroundArt(biome: BiomeName, season: Season, snowy: boolean, w: number, h: number, sky: number, seed: number, sway: number, side: -1 | 1): ColorSprite {
  const id = `${biome}:${season}:${snowy}:${w}:${h}:${sky}:${seed}:${sway}:${side}`;
  let s = cache.get(id);
  if (s !== undefined) return s;
  const rgb = new Int32Array(w * h).fill(-1);
  const n = noiseFor(seed);
  const put = (x: number, y: number, c: number): void => {
    if (x >= 0 && y >= 0 && x < w && y < h) rgb[y * w + x] = c;
  };
  /** A pixel of a mass `d` pixels in from its lit edge: rim, lit, body or deep, speckled like leaves or stone. */
  const tone = (t: Tones, d: number, x: number, y: number, grain = 5): number => {
    const hs = hash2(x, y, seed ^ 0x77);
    // Leaves in clumps: a dark seam between clumps where the light reaches.
    if (d < 7 && grain > 4) {
      const c = clumpAt(x, y, 3, seed ^ 0x3c);
      if (c.d > 2.3 && y + 0.5 > c.cy - 0.6) return t.deep;
      if (d >= 1 && d < 4 && (x + 0.5 - c.cx) + (y + 0.5 - c.cy) * 1.3 < -1.4) return t.deep;
    }
    if (d < 1) return hs % 3 === 0 ? t.lit : t.rim;
    if (d < 2.2) return hs % 2 === 0 ? t.lit : t.body;
    if (d < 4) return hs % (grain + 2) === 0 ? t.lit : hs % grain === 1 ? t.deep : t.body;
    return hs % (grain + 1) === 0 ? t.body : t.deep;
  };

  /** Leaves hanging over the top corners: thick at the edges, gone towards the middle, clumped below. */
  const canopy = (t: Tones, reach: number, depth: number): void => {
    for (let x = 0; x < w; x++) {
      const fromEdge = Math.min(x, w - 1 - x) / w;
      // Lighter over the home's side, so its roof shows.
      const onBig = (x < w / 2 ? -1 : 1) === side;
      const base = depth * (onBig ? 1 : 0.45) * Math.max(0, 1 - fromEdge / (onBig ? reach : reach * 0.7)) ** 1.3;
      if (base < 0.5) continue;
      const clumps = 2.5 * Math.abs(n(x / 6 + sway * 0.15, 3)) + 1.5 * n(x / 2.5, 7);
      const edge = base + clumps;
      for (let y = 0; y < edge && y < h; y++) put(x, y, tone(t, edge - y, x, y));
    }
    // Round clumps hanging below the edge, where the canopy is thick.
    for (let k = 0; k < 14; k++) {
      const hs = hash2(k, 11, seed);
      const fromEdge = ((hs % 1000) / 1000) * reach * 0.8;
      const left = hs % 2 === 0;
      if ((left ? -1 : 1) !== side && hs % 3 !== 0) continue;
      const x0 = Math.round((left ? fromEdge : 1 - fromEdge) * (w - 1)) + sway;
      const y0 = depth * ((left ? -1 : 1) === side ? 1 : 0.45) * Math.max(0, 1 - fromEdge / reach) ** 1.3 + 2;
      const r = 2 + (hs % 4);
      for (let y = Math.floor(y0 - r); y <= y0 + r; y++) {
        for (let x = x0 - r; x <= x0 + r; x++) {
          const d = Math.sqrt((x - x0) ** 2 + (y - y0) ** 2);
          if (d <= r) put(x, y, tone(t, y > y0 ? r - d : r - d + 4, x, y));
        }
      }
    }
  };

  /** A trunk standing up the side of the window, flaring into roots, lit on the side facing the scene. */
  const trunk = (on: -1 | 1, thick: number, bark: Tones): void => {
    for (let y = 0; y < h; y++) {
      const flare = y > h * 0.75 ? (y - h * 0.75) * 0.35 : 0;
      const width = thick + flare + n(y / 9, 21) * 1.2;
      for (let i = 0; i < width; i++) {
        const x = on < 0 ? i : w - 1 - i;
        const d = width - i;
        const groove = (Math.floor(x + y / 5) % 3 === 0 ? 1 : 0) + (hash2(x, y, 5) % 9 === 0 ? 1 : 0);
        put(x, y, d < 1.2 ? bark.rim : d < 2.4 ? bark.lit : groove > 0 ? bark.deep : bark.body);
      }
    }
  };

  /** Strands hanging from the canopy: moss, vines. */
  const strands = (t: Tones, count: number, reach: number, depth: number): void => {
    for (let k = 0; k < count; k++) {
      const hs = hash2(k, 23, seed);
      const fromEdge = ((hs % 1000) / 1000) * reach;
      const x0 = Math.round((hs % 2 === 0 ? fromEdge : 1 - fromEdge) * (w - 1));
      const top = depth * Math.max(0, 1 - fromEdge / reach) ** 1.3;
      const len = 4 + (hs % Math.max(1, Math.round(depth * 0.9)));
      for (let i = 0; i < len; i++) put(x0 + Math.round(Math.sin(i * 0.5 + sway) * 0.6), Math.round(top + i), i === len - 1 ? t.rim : tone(t, 2 + (i % 3), x0, i));
    }
  };

  /** Pine boughs reaching in from a top corner, needles hanging, snow along their tops. */
  const boughs = (on: -1 | 1): void => {
    for (let k = 0; k < 5; k++) {
      const len = w * (0.12 + ((k * 37) % 5) * 0.03);
      const y0 = 1 + k * Math.max(2, Math.round(sky / 9));
      for (let i = 0; i < len; i++) {
        const u = i / len;
        const x = on < 0 ? i : w - 1 - i;
        const yb = Math.round(y0 + u * 3 + sway * u);
        const hang = Math.round((1 - u) * 5 + 1 + (hash2(x, k, 3) % 2));
        for (let j = 0; j < hang; j++) put(x, yb + j, snowy && j === 0 ? (hash2(x, k, 9) % 4 === 0 ? 0xc8d4e2 : 0xeef4fa) : tone(PINE, hang - j, x, yb + j, 4));
      }
    }
  };

  // Leaves and bark from the biome's own palette (autumn and winter keep their own colours).
  // Its darkest step is near black, which the shade at the window's edge would push to black.
  const fromPalette: Tones = { deep: paletteTone(biome, 'foliage', 1), body: paletteTone(biome, 'foliage', 2), lit: paletteTone(biome, 'foliage', 3), rim: paletteTone(biome, 'ground', 4) };
  const leaves = snowy && biome !== 'swamp' ? LEAF.winter : season === 'autumn' ? LEAF.autumn : fromPalette;

  /** Bare branches reaching in from a top corner, forking and thinning, dark against the sky. */
  const bareBranches = (on: -1 | 1, bark: Tones, count: number): void => {
    const segs: [number, number, number, number, number][] = [];
    const grow = (x: number, y: number, a: number, len: number, wd: number, depth: number, k: number): void => {
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      segs.push([x, y, x2, y2, wd]);
      if (depth === 0) return;
      const hs = hash2(k, depth, seed);
      grow(x2, y2, a - 0.35 - (hs % 40) / 100, len * 0.7, Math.max(0.5, wd * 0.62), depth - 1, k * 3 + 1);
      if (hs % 3 !== 0) grow(x2, y2, a + 0.3 + ((hs >>> 8) % 40) / 100, len * 0.6, Math.max(0.5, wd * 0.55), depth - 1, k * 3 + 2);
    };
    for (let k = 0; k < count; k++) {
      const y0 = sky * (0.05 + k * 0.22);
      const a = (on < 0 ? 0.15 : Math.PI - 0.15) + (on < 0 ? 1 : -1) * k * 0.18 + Math.sin(sway * 0.5) * 0.03;
      grow(on < 0 ? 0 : w - 1, y0, a, w * (0.16 - k * 0.025), 2.2 - k * 0.4, 4, k + 1);
    }
    // The topmost branch's farthest twig end, with sky above it: a perch.
    if (on === side) {
      let best: { x: number; y: number } | null = null;
      for (const [, , bx, by] of segs) {
        if (by < 1 || by > sky * 0.3) continue;
        const reach = on < 0 ? bx : w - 1 - bx;
        if (best === null || reach > (on < 0 ? best.x : w - 1 - best.x)) best = { x: Math.round(bx), y: Math.round(by) };
      }
      if (best !== null) perches.set(id, best);
    }
    for (const [ax, ay, bx, by, wd] of segs) {
      const x0 = Math.floor(Math.min(ax, bx) - wd - 1);
      const x1 = Math.ceil(Math.max(ax, bx) + wd + 1);
      const y0 = Math.floor(Math.min(ay, by) - wd - 1);
      const y1 = Math.ceil(Math.max(ay, by) + wd + 1);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dx = bx - ax;
          const dy = by - ay;
          const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / (dx * dx + dy * dy || 1)));
          const d = Math.hypot(x + 0.5 - ax - t * dx, y + 0.5 - ay - t * dy);
          // Lit only along the lower edge, where the scene's light reaches it.
          if (d <= wd) put(x, y, y + 0.5 > ay + t * dy + wd * 0.4 ? bark.lit : bark.deep);
        }
      }
    }
  };
  const bark: Tones = { deep: paletteTone(biome, 'earth', 0), body: paletteTone(biome, 'earth', 1), lit: paletteTone(biome, 'earth', 2), rim: paletteTone(biome, 'earth', 3) };
  /**
   * The forest's frame: a great trunk up each side, near-black, its bark in long vertical fissures with
   * clusters of moss; the canopy across the top, thick dark boughs sweeping in from the corners and leaf
   * clusters hanging round them, thinning towards the glow in the middle.
   */
  const forestFrame = (): void => {
    const t = (step: number): number => paletteTone(biome, 'earth', step);
    const f = (step: number): number => paletteTone(biome, 'foliage', step);
    const trunks: [number, number][] = [[side, Math.round(w * 0.2)], [-side as -1 | 1, Math.round(w * 0.15)]];
    for (const [on, thick] of trunks) {
      for (let y = 0; y < h; y++) {
        const flare = y > h * 0.8 ? (y - h * 0.8) * 0.5 : 0;
        const width = thick + flare + Math.abs(n(y / 11, 21 + on)) * 2;
        for (let i = 0; i < width; i++) {
          const x = on < 0 ? i : w - 1 - i;
          const d = width - i;
          // Bark: a near-black base; long fissures, one pixel wide, of the next tone up, running 8 to 24
          // pixels down the column before they break; a few columns a shade darker still.
          const col = hash2(i, on, seed ^ 0x11);
          const run = 8 + (col % 17);
          const phase = (col >>> 8) % run;
          const fissure = col % 3 === 0 && (y + phase) % (run + 5) < run;
          let c = fissure ? (col % 6 === 0 ? t(3) : t(2)) : col % 7 === 0 ? t(0) : t(1);
          if (d < 1.2) c = t(3);
          else if (d < 2.4) c = t(2);
          put(x, y, c);
        }
      }
      // Moss: clusters of 2x2 on the bark, more lower down and on the lit side.
      for (let k = 0; k < 40; k++) {
        const hs = hash2(k, on, seed ^ 0x55);
        const i = (hs % Math.max(1, thick - 2)) + 1;
        const y = ((hs >>> 8) % h);
        if ((hs >>> 16) % 3 === 0 && y < h * 0.4) continue;
        const x = on < 0 ? i : w - 1 - i;
        const c = f((hs >>> 20) % 2 + 1);
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(x + dx, y + dy, c);
      }
    }
    // The canopy: leaf clusters, 2 by 2, packed tight at the top and the corners and thinning towards the
    // glow in the middle; only a thin solid dark along the very top. The glow shows between the clusters.
    const dark = f(0);
    const reach = (x: number): number => {
      const fromEdge = Math.min(x, w - 1 - x) / w;
      return sky * (0.44 * Math.max(0, 1 - fromEdge / 0.45) ** 1.1 + 0.14) + Math.abs(n(x / 7 + sway * 0.2, 5)) * 3;
    };
    for (let x = 0; x < w; x++) for (let y = 0; y < 2 + Math.abs(n(x / 6, 9)) * 2 && y < h; y++) put(x, y, dark);
    // Clumps of leaves on a jittered grid, each one tone, lit a step on its upper left; a clump is there
    // with a chance that falls from nine in ten at the top to one in ten at the canopy's ragged lower edge.
    for (let y = 0; y < sky * 0.6; y++) {
      for (let x = 0; x < w; x++) {
        const r0 = reach(x);
        if (y > r0 + 3) continue;
        const c = clumpAt(x, y, 3, seed ^ 0x3a);
        if (c.d > 2.7) continue;
        const fill = 0.9 - 0.8 * Math.max(0, Math.min(1, c.cy / r0)) ** 1.5;
        if ((c.hs % 1000) / 1000 > fill) continue;
        // Darker up in the thick of it, lighter where the glow reaches the lower clumps.
        const base = c.cy < r0 * 0.45 ? (c.hs % 4 === 0 ? 1 : 2) : c.hs % 4 === 0 ? 3 : 2;
        const lit = (x + 0.5 - c.cx) + (y + 0.5 - c.cy) * 1.2 < -1.6 && c.hs % 3 !== 0;
        put(x, y, f(lit ? base + 1 : c.d > 2.1 ? Math.max(0, base - 1) : base));
      }
    }
    // Boughs: three thick dark branches from each top corner, sweeping down towards the middle.
    for (const on of [-1, 1] as const) {
      for (let k = 0; k < 3; k++) {
        const hs = hash2(k, on + 5, seed);
        const x0 = on < 0 ? w * 0.12 : w * 0.88;
        const x1 = w / 2 + on * -1 * w * (0.02 + k * 0.06) + ((hs % 7) - 3);
        const y1 = sky * (0.18 + k * 0.1) + ((hs >>> 4) % 4);
        const steps = Math.round(Math.abs(x1 - x0));
        for (let i = 0; i <= steps; i++) {
          const u = i / Math.max(1, steps);
          const x = Math.round(x0 + (x1 - x0) * u);
          const y = Math.round(-2 + y1 * u * u);
          const thick = Math.max(2, Math.round(5 - u * 3));
          for (let j = 0; j < thick; j++) put(x, y + j, j === thick - 1 && thick > 1 ? t(2) : t(0));
          // Twigs: short forks down and out from the bough, thinning to a pixel.
          if (i % Math.max(4, Math.round(steps / 5)) === 2 && u > 0.2) {
            const dir = (hash2(i, k, seed) & 1) === 0 ? -1 : 1;
            const len = 3 + (hash2(i, k + 9, seed) % 4);
            for (let q = 1; q <= len; q++) {
              put(x + dir * q * (on < 0 ? 1 : -1) * -1, y + thick - 1 + q, t(0));
              if (q < len / 2) put(x + dir * q * (on < 0 ? 1 : -1) * -1 + 1, y + thick - 1 + q, t(0));
            }
          }
        }
      }
    }
  };

  const big = side;
  const small = -side as -1 | 1;
  switch (biome) {
    case 'forest':
      forestFrame();
      break;
    case 'meadow':
      bareBranches(big, bark, 3);
      trunk(big, 6, bark);
      break;
    case 'tundra':
      boughs(big);
      boughs(small);
      trunk(big, 3, bark);
      break;
    case 'swamp':
      canopy(MOSS, 0.22, sky * 0.4);
      bareBranches(big, bark, 3);
      bareBranches(small, bark, 2);
      strands(MOSS, 22, 0.34, sky * 0.55);
      trunk(big, 7, bark);
      trunk(small, 4, bark);
      break;
  }
  const ph = h + (h % 2);
  const out = new Int32Array(w * ph).fill(-1);
  out.set(rgb);
  s = { w, h: ph / 2, rgb: out, glow: new Uint8Array(w * ph) };
  if (cache.size > 24) {
    cache.clear();
    perches.clear();
  }
  cache.set(id, s);
  return s;
}

/** The end of the frame's topmost branch on the big side (in pixels), if it has branches: a crow's perch. */
export function surroundPerch(biome: BiomeName, season: Season, snowy: boolean, w: number, h: number, sky: number, seed: number, sway: number, side: -1 | 1): { x: number; y: number } | null {
  const id = `${biome}:${season}:${snowy}:${w}:${h}:${sky}:${seed}:${sway}:${side}`;
  if (!cache.has(id)) surroundArt(biome, season, snowy, w, h, sky, seed, sway, side);
  return perches.get(id) ?? null;
}
