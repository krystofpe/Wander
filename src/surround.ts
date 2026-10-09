// The surround: what frames the scene from just in front of the glass, painted per biome. Bare branches
// and trunks at the sides, a few last leaves, snowy boughs, hanging moss.
// Darker than the scene for being so near, lit only along the edges that face it, like a window onto a
// brighter world. Painted pixel by pixel with noise, without outlines.
import type { BiomeName } from './config.ts';
import { tone as paletteTone } from './palette.ts';
import { PALETTE, extent, pixels } from './sprites.ts';
import { frameCrop } from './scene.ts';
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
   * The forest's frame, drawn in art/forest-frame.aseprite: a great trunk up each side with the mist beyond
   * it, the canopy arching over the glow from the top corners. The canopy sits in the corner, bark repeats
   * down the trunk below it and the roots stand at the foot; the right side is the left turned round. On a
   * narrow window the trunks stand partly outside it; on a wide one the canopy spans the top between them.
   */
  const forestFrame = (): void => {
    const piece = (name: string, x0: number, y0: number, mirror: boolean, rows = Infinity): void => {
      const p = pixels('forest-frame', name);
      const { w: pw, h: ph } = extent(p);
      for (let y = 0; y < Math.min(ph, rows); y++) {
        for (let x = 0; x < pw; x++) {
          const k = p.px[y * p.w + x];
          if (k !== 0) put(mirror ? x0 - x : x0 + x, y0 + y, PALETTE[k]);
        }
      }
    };
    const out = frameCrop(w, false);
    const span = extent(pixels('forest-frame', 'span')).w;
    for (let x = 60 - out; x < w - 60 + out; x += span) piece('span', x, 0, false);
    for (const [on, size] of [[side, 'big'], [-side, 'small']] as const) {
      const mirror = on > 0;
      // The great tree is its home's: its foot, with the hollow, is drawn with the scene (it stands in
      // front of some things and behind others), so the frame stops where it begins.
      const home = size === 'big';
      const crop = frameCrop(w, home);
      const x0 = mirror ? w - 1 + crop : -crop;
      const canopy = extent(pixels('forest-frame', `canopy-${size}`)).h;
      const roots = home ? extent(pixels('shelter-forest', 'shelter')).h : extent(pixels('forest-frame', `roots-${size}`)).h;
      const tile = extent(pixels('forest-frame', `bark-${size}`)).h;
      for (let y = canopy; y < h - roots; y += tile) piece(`bark-${size}`, x0, y, mirror, h - roots - y);
      piece(`canopy-${size}`, x0, 0, mirror, Math.max(0, h - roots));
      if (!home) piece(`roots-${size}`, x0, h - roots, mirror);
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
