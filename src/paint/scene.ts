// Painting the near layers: the mid and near tree layers (a low bank of land with its trees and props), the
// playfield (the ground he walks on, with the plants and things around it) and the sparse foreground. Pure.
import { BIOME_IDS } from '../biomes.ts';
import type { BiomeId } from '../biomes.ts';
import { columnDistance, PX_PER_M, WALK_Y } from '../layers.ts';
import type { LayerDef } from '../layers.ts';
import { fbm1, noise1, rng, unit } from '../noise.ts';
import { role } from '../palette.ts';
import { placeBetween } from '../place.ts';
import type { Placed } from '../place.ts';
import { biomeAt, blended, groundHeight, share } from '../world.ts';
import { Chunk, FLAG, newStamp, put, stamp } from './chunk.ts';
import type { Stamp } from './chunk.ts';
import { HORIZON } from './land.ts';
import { BRIDGE, levelling, marksOn } from './landmarks.ts';
import type { Placed as Mark } from './landmarks.ts';
import { birch, broadleaf, bush, cactus, cached, conifer, deadTree, reeds, rock, tuft } from './plants.ts';
import { baseline } from '../layers.ts';

/** What the ground is made of in a biome: its surface family, and whether that surface is snowy. */
const SURFACE: Readonly<Record<BiomeId, string>> = {
  pine: 'grass',
  birch: 'grass',
  meadow: 'grass',
  autumn: 'grass',
  plateau: 'grass',
  pass: 'rock',
  coast: 'sand',
  desert: 'sand',
  tundra: 'snow',
  swamp: 'grass',
  saltflat: 'salt',
  stones: 'grass',
  ruins: 'grass',
  rail: 'grass',
};

const SNOWY: ReadonlySet<BiomeId> = new Set(['tundra']);

/**
 * How much of a bank the tree layers (mid, near) have in each biome: a forest floor under the woods; in open country
 * none, so those layers hold only their plants and props and the land behind shows through, instead of terraces.
 */
const BANK: Readonly<Record<BiomeId, number>> = {
  pine: 1,
  birch: 1,
  meadow: 0,
  autumn: 1,
  plateau: 0,
  pass: 1,
  coast: 0.8,
  desert: 0,
  tundra: 0,
  swamp: 0.6,
  saltflat: 0,
  stones: 0,
  ruins: 0.5,
  rail: 0,
};

/** Things that stand on the ground: a stamp for each placed thing, at its layer's scale. */
export function stampFor(p: Placed, z: number): Stamp {
  const snowy = SNOWY.has(p.biome);
  switch (p.species) {
    case 'pine':
      return conifer(p.seed % 64, p.size, false, snowy);
    case 'spruce':
      return conifer(p.seed % 64, p.size, true, snowy || p.biome === 'pass');
    case 'birch':
      return birch(p.seed % 48, p.size);
    case 'oak':
      return broadleaf(p.seed % 48, p.size, 'leaf');
    case 'dead':
      return deadTree(p.seed % 40, p.size, 'bark');
    case 'cactus':
      return cactus(p.seed % 24, p.size);
    case 'bush':
      return bush(p.seed % 32, p.size, 'leaf');
    case 'shrub':
      return bush(p.seed % 24, p.size, 'dry', true);
    case 'fern':
      return fern(p.seed % 24, p.size);
    case 'tuft':
      return tuft(p.seed % 32, p.size, 'grass');
    case 'drytuft':
      return tuft(p.seed % 32, p.size, 'dry');
    case 'flowers':
      return flowers(p.seed % 24, p.size);
    case 'reeds':
      return reeds(p.seed % 32, p.size, 'dry');
    case 'marram':
      return reeds(p.seed % 32, p.size, 'grass');
    case 'rock':
      return rock(p.seed % 48, p.size, 'rock');
    case 'boulder':
      return rock(p.seed % 32, p.size, 'rock');
    case 'stone':
      return standingStone(p.seed % 32, p.size);
    case 'log':
      return log(p.seed % 16, p.size);
    case 'stump':
      return stump(p.seed % 16, p.size);
    case 'drift':
      return log(p.seed % 16, p.size, 'bone');
    case 'pole':
      return pole(p.seed % 8, p.size);
    case 'wall':
      return wall(p.seed % 24, p.size, z);
    case 'post':
      return post(p.seed % 8, p.size);
  }
}

// ── Small props ────────────────────────────────────────────────────────────

function fern(seed: number, size: number): Stamp {
  return cached(`fern:${seed}:${size}`, () => {
    const random = rng(seed);
    const h = Math.max(4, Math.round(size * 0.7));
    const w = Math.max(6, Math.round(size * 1.3));
    const s = newStamp(w, h, w >> 1);
    const L = [role('leaf', 0), role('leaf', 1), role('leaf', 2), role('leaf', 3)];
    const fronds = 3 + Math.floor(random() * 3);
    for (let i = 0; i < fronds; i++) {
      const dir = (i / (fronds - 1)) * 2 - 1;
      for (let t = 0; t < 1; t += 0.08) {
        const x = s.ax + dir * t * (w / 2);
        const y = h - 1 - Math.sin(t * Math.PI * 0.85) * h * (0.6 + 0.4 * (1 - Math.abs(dir)));
        put(s, Math.round(x), Math.round(y), L[Math.min(3, 1 + Math.floor(t * 3))], 3);
        if (t > 0.2 && random() < 0.5) put(s, Math.round(x), Math.round(y) + 1, L[0], 2);
      }
    }
    return s;
  });
}

function flowers(seed: number, size: number): Stamp {
  return cached(`flowers:${seed}:${size}`, () => {
    const random = rng(seed);
    const s = newStamp(5, size + 1, 2);
    for (let i = 0; i < 3; i++) {
      const x = i * 2;
      const h = Math.max(2, Math.round(size * (0.6 + 0.4 * random())));
      for (let y = 0; y < h; y++) put(s, x, size - y, role('grass', 2), 5);
      put(s, x, size - h, role('flower', 1 + (i % 2)), 6);
    }
    return s;
  });
}

function standingStone(seed: number, size: number): Stamp {
  return cached(`stone:${seed}:${size}`, () => {
    const random = rng(seed);
    const h = Math.max(4, Math.round(size));
    const w = Math.max(3, Math.round(h * (0.32 + 0.16 * random())));
    const s = newStamp(w + 2, h, (w + 2) >> 1);
    const S = [role('stone', 0), role('stone', 1), role('stone', 2), role('stone', 3)];
    const lean = (random() - 0.5) * 0.25;
    for (let y = 0; y < h; y++) {
      const t = y / h;
      const round = t < 0.15 ? Math.round((0.15 - t) * w * 2.2) : 0;
      const x0 = 1 + Math.round(lean * (h - y)) + (round >> 1);
      const x1 = x0 + w - 1 - round;
      for (let x = x0; x <= x1; x++) put(s, x, y, S[y === 0 || x === x0 + (round > 0 ? 0 : -9) ? 3 : x === x0 ? 2 : x === x1 ? 0 : 1], FLAG.RIM);
    }
    // Lichen spots in the lit plane.
    for (let i = 0; i < h / 6; i++) put(s, 2 + Math.floor(random() * (w - 1)), 2 + Math.floor(random() * (h - 4)), S[2]);
    return s;
  });
}

function log(seed: number, size: number, family = 'bark'): Stamp {
  return cached(`log:${seed}:${size}:${family}`, () => {
    const random = rng(seed);
    const w = Math.max(8, Math.round(size));
    const h = Math.max(3, Math.round(w * 0.16));
    const s = newStamp(w, h + 1, w >> 1);
    const B = [role(family, 0), role(family, 1), role(family, 2)];
    for (let x = 0; x < w; x++)
      for (let y = 0; y < h; y++) {
        const b = y === 0 ? 2 : y === h - 1 ? 0 : 1;
        put(s, x, y + 1, B[b], FLAG.RIM);
      }
    // The cut end: rings.
    for (let y = 0; y < h; y++) put(s, w - 1, y + 1, family === 'bark' ? role('wood', 3) : B[2]);
    if (random() < 0.6) put(s, Math.round(w * 0.3), 0, B[1]);
    return s;
  });
}

function stump(seed: number, size: number): Stamp {
  return cached(`stump:${seed}:${size}`, () => {
    const w = Math.max(4, Math.round(size));
    const h = Math.max(3, Math.round(w * 0.6));
    const s = newStamp(w + 2, h, (w + 2) >> 1);
    const B = [role('bark', 0), role('bark', 1), role('bark', 2)];
    for (let y = 0; y < h; y++) for (let x = 1; x <= w; x++) put(s, x, y, y === 0 ? role('wood', 3) : B[x === 1 ? 2 : x === w ? 0 : 1], FLAG.RIM);
    put(s, 0, h - 1, B[1]);
    put(s, w + 1, h - 1, B[0]);
    void seed;
    return s;
  });
}

/** A telegraph or power pole: a post with a crossbar and insulators. Wires are drawn between poles. */
function pole(seed: number, size: number): Stamp {
  return cached(`pole:${seed}:${size}`, () => {
    const h = Math.max(10, Math.round(size));
    const bar = Math.max(5, Math.round(h * 0.22)) | 1;
    const s = newStamp(bar + 2, h, (bar + 2) >> 1);
    const W = [role('wood', 0), role('wood', 1), role('wood', 2)];
    const tw = h > 40 ? 2 : 1;
    for (let y = 0; y < h; y++) for (let t = 0; t < tw; t++) put(s, s.ax + t - (tw >> 1), y, t === 0 ? W[2] : W[0], FLAG.RIM);
    const by = Math.round(h * 0.08);
    for (let x = 0; x < s.w; x++) put(s, x, by, W[1], FLAG.RIM);
    put(s, 0, by - 1, role('glass', 0));
    put(s, s.w - 1, by - 1, role('glass', 0));
    void seed;
    return s;
  });
}

function post(seed: number, size: number): Stamp {
  return cached(`post:${seed}:${size}`, () => {
    const h = Math.max(4, Math.round(size));
    const s = newStamp(2, h, 0);
    for (let y = 0; y < h; y++) {
      put(s, 0, y, role('wood', y === 0 ? 3 : 2), FLAG.RIM);
      put(s, 1, y, role('wood', 0), FLAG.RIM);
    }
    void seed;
    return s;
  });
}

/** A ruined wall: stone courses, a broken top, an empty window. */
function wall(seed: number, size: number, z: number): Stamp {
  return cached(`wall:${seed}:${size}:${z}`, () => {
    const random = rng(seed);
    const w = Math.max(10, Math.round(size));
    const h = Math.max(6, Math.round(w * (0.45 + 0.35 * random())));
    const s = newStamp(w, h, w >> 1);
    const S = [role('stone', 0), role('stone', 1), role('stone', 2), role('stone', 3)];
    const tops: number[] = [];
    let t = Math.round(h * 0.2 * random());
    for (let x = 0; x < w; x++) {
      if (random() < 0.25) t = Math.max(0, Math.min(h - 3, t + Math.round((random() - 0.45) * 4)));
      tops.push(t);
    }
    const course = Math.max(2, Math.round(3 / Math.max(1, z)));
    for (let x = 0; x < w; x++)
      for (let y = tops[x]; y < h; y++) {
        const row = Math.floor(y / course);
        const joint = y % course === course - 1 || (x + row * 3) % 7 === 0;
        put(s, x, y, y === tops[x] ? S[3] : joint ? S[0] : x < w * 0.15 ? S[2] : S[1], FLAG.RIM);
      }
    // An empty window, dark inside.
    if (h > 10 && w > 14) {
      const wx = Math.round(w * (0.3 + 0.3 * random()));
      const wy = Math.round(h * 0.3);
      const ww = Math.max(2, Math.round(w * 0.14));
      const wh = Math.max(3, Math.round(h * 0.28));
      for (let y = wy; y < wy + wh; y++) for (let x = wx; x < wx + ww; x++) if (y > tops[x]) put(s, x, y, role('soil', 0));
    }
    return s;
  });
}

// ── Layers ─────────────────────────────────────────────────────────────────

const placed: Placed[] = [];

/** The surface family at a column, by the dominant biome. */
function surfaceAt(seed: number, d: number): string {
  const b = biomeAt(seed, d);
  return SURFACE[b.k < 0.5 ? b.a : b.b];
}

/** Paints a chunk of a tree layer (mid, near): a low bank of the biome's ground, its plants and props. */
export function paintTrees(c: Chunk, seed: number, layer: LayerDef, li: number, u0: number): void {
  c.clear(u0);
  const tops = new Int32Array(c.w);
  // A landmark on this layer stands on a level plot of its own, even in open country.
  const marks = marksOn(seed, layer, u0, u0 + c.w);
  for (let x = 0; x < c.w; x++) {
    const u = u0 + x;
    const d = columnDistance(u, layer.z);
    const blend = biomeAt(seed, d);
    c.setColumnBiome(u, BIOME_IDS.indexOf(blend.a), BIOME_IDS.indexOf(blend.b), blend.k);
    const yh = blended(blend, (id) => HORIZON[id]);
    const base = layer.top + Math.round(baseline(layer.z, yh, WALK_Y));
    const bank = blended(blend, (id) => BANK[id]);
    let bankH = bankHeight(seed, layer, li, u);
    for (const m of marks) {
      const k = levelling(m, u);
      if (k > 0) bankH += (Math.min(6, bankHeight(seed, layer, li, m.u)) - bankH) * k;
    }
    // Things stand on the bank where there is one, on the layer's baseline where there is not.
    tops[x] = Math.round(base - bankH * bank);
    // Where the woods end, the bank slides down behind the playfield instead of stopping in a cliff.
    const hidden = layer.top + WALK_Y + 6;
    const k = Math.min(1, Math.max(0, (bank - 0.15) / 0.7));
    const top = Math.round(hidden + (base - bankH - hidden) * k * k * (3 - 2 * k));
    if (top >= hidden) continue;
    const fam = surfaceAt(seed, d);
    const n = fam === 'rock' || fam === 'snow' || fam === 'sand' || fam === 'salt' ? fam : 'grass';
    const steps = n === 'salt' ? 3 : n === 'snow' || n === 'sand' ? 4 : 5;
    // A bank in the shades of its ground, darker than the playfield's lit surface, with no light rim of its own:
    // it reads as the forest floor beyond, not as a terrace.
    for (let y = top; y < c.h; y++) {
      const k = y - top;
      let r = k < 2 ? role(n, Math.max(0, steps - 3)) : k < 10 ? role(n, Math.max(0, steps - 4)) : role(n, 0);
      // Short strokes of the next lighter shade, like the playfield's ground: a bank reads as ground, not a wall.
      if (k > 2 && k % 3 === 0) {
        const cell = Math.floor((u + k * 5) / 4);
        if (unit(cell * 64 + k, seed ^ (0x7c1 + li)) < 0.22) r = role(n, Math.min(steps - 2, k < 10 ? steps - 3 : 1));
      }
      c.set(u, y, r, FLAG.RIM);
    }
  }
  // Plants and props standing on the bank, back to front by size (big trees behind small ones), none crowding a
  // landmark.
  placeBetween(seed, layer.name, li, layer.z, u0 - 80, u0 + c.w + 80, placed);
  placed.sort((a, b) => b.size - a.size);
  for (const p of placed) {
    if (marks.some((m) => Math.abs(p.u - m.u) < m.half + 6)) continue;
    const s = stampFor(p, layer.z);
    const x = p.u - u0;
    const groundTop = x >= 0 && x < c.w ? tops[x] : bankTopAt(seed, layer, li, p.u);
    stamp(c, s, p.u, groundTop + 1 + (p.species === 'rock' || p.species === 'boulder' ? 1 : 0), p.flip, false);
  }
  for (const m of marks) {
    if (m.stamp === null) continue;
    const top = markTop(seed, layer, li, m);
    // A strip of ground under it, so in open country it sits on the land rather than on nothing.
    const n = surfaceAt(seed, columnDistance(m.u, layer.z));
    const fam = n === 'rock' || n === 'snow' || n === 'sand' || n === 'salt' ? n : 'grass';
    for (let u = m.u - m.half - 8; u <= m.u + m.half + 8; u++) {
      const edge = Math.max(0, Math.abs(u - m.u) - m.half);
      for (let y = top + Math.floor(edge / 3); y <= top + 2; y++) c.set(u, y, role(fam, y === top + Math.floor(edge / 3) ? 1 : 0), FLAG.RIM);
    }
    stamp(c, m.stamp, m.u, top + 2, false, false);
  }
  drawWires(c, seed, layer, li, u0, (u) => bankTopAt(seed, layer, li, u));
}

/** The row a landmark on a tree layer stands on: its plot's top. */
export function markTop(seed: number, layer: LayerDef, li: number, m: Mark): number {
  const blend = biomeAt(seed, columnDistance(m.u, layer.z));
  const yh = blended(blend, (id) => HORIZON[id]);
  const base = layer.top + Math.round(baseline(layer.z, yh, WALK_Y));
  return Math.round(base - Math.min(6, bankHeight(seed, layer, li, m.u)) * blended(blend, (id) => BANK[id]));
}

export function bankTopAt(seed: number, layer: LayerDef, li: number, u: number): number {
  const d = columnDistance(u, layer.z);
  const yh = blended(biomeAt(seed, d), (id) => HORIZON[id]);
  const base = layer.top + Math.round(baseline(layer.z, yh, WALK_Y));
  return Math.round(base - bankHeight(seed, layer, li, u));
}

/** A tree layer's bank: rolling, sometimes high, sometimes dipping to nothing, so the layers overlap unevenly. */
function bankHeight(seed: number, layer: LayerDef, li: number, u: number): number {
  const n = fbm1(u / (260 / layer.z), seed ^ (0x7ab + li), 3, 0.45);
  return Math.max(1, 3 + 16 * (0.5 + 0.7 * n) * (1.6 / layer.z));
}

/** The ground's top row in the playfield texture at a column. */
export function groundTop(seed: number, layer: LayerDef, u: number): number {
  return layer.top + WALK_Y - Math.round(groundHeight(seed, u / PX_PER_M) * PX_PER_M);
}

/**
 * Paints a chunk of the playfield: the ground surface he walks on (a path where there is one), the near ground
 * plane darkening toward the bottom edge in horizontal clusters, and the plants and props standing on it.
 */
export function paintGround(c: Chunk, seed: number, layer: LayerDef, li: number, u0: number): void {
  c.clear(u0);
  const tops = new Int32Array(c.w);
  const marks = marksOn(seed, layer, u0, u0 + c.w);
  for (let x = 0; x < c.w; x++) {
    const u = u0 + x;
    const d = u / PX_PER_M;
    const blend = biomeAt(seed, d);
    c.setColumnBiome(u, BIOME_IDS.indexOf(blend.a), BIOME_IDS.indexOf(blend.b), blend.k);
    const top = groundTop(seed, layer, u);
    tops[x] = top;
    const n = surfaceAt(seed, d);
    const steps = n === 'salt' ? 3 : n === 'snow' || n === 'sand' ? 4 : 5;
    const bridge = marks.find((m) => m.mark.kind === 'bridge' && Math.abs(u - m.u) <= m.half + 2);
    if (bridge !== undefined) {
      bridgeColumn(c, u, top, bridge, n, steps);
      continue;
    }
    // A trodden path runs where the path noise is high (not on bare salt, sand, rock or snow).
    const pathy = n === 'grass' && noise1(d / 260, seed ^ 0x9a7) > -0.1;
    // Band edges below the surface wander a pixel or two, so they read as drawn, not ruled.
    const j1 = Math.round(noise1(u / 9, seed ^ 0x31) * 1.5);
    const j2 = Math.round(noise1(u / 13, seed ^ 0x32) * 2);
    const j3 = Math.round(noise1(u / 17, seed ^ 0x33) * 3);
    const b1 = 3 + j1;
    const b2 = 11 + j2;
    const b3 = 26 + j3;
    // Still pools in the swamp, below the bank he walks on: a bright line of sky on the water, glints, then dark.
    const swamp = share(blend, 'swamp');
    const poolN = swamp > 0.3 ? noise1(d / 16, seed ^ 0x5009) * 0.75 + noise1(d / 5, seed ^ 0x500a) * 0.25 : -1;
    const limit = 0.12 - 0.25 * (swamp - 0.3);
    const pool = poolN > limit ? Math.min(12, Math.round(2 + (poolN - limit) * 26)) : 0;
    for (let y = top; y < c.h; y++) {
      const k = y - top;
      let r: number;
      if (pool > 0 && k >= 4 && k < 4 + pool) {
        const kk = k - 4;
        const glint = kk > 0 && unit(Math.floor((u + kk * 11) / 4) * 64 + kk, seed ^ 0x51) < 0.14;
        c.set(u, y, kk === 0 || glint ? role('water', 3) : kk < 3 ? role('water', 2) : role('water', 1), FLAG.WATER);
        continue;
      }
      if (pathy && k < 3) r = k === 0 ? role('path', 2) : role('path', 1);
      else if (k === 0) r = role(n, steps - 1);
      else if (k < b1) r = role(n, steps - 2);
      else if (k < b2) r = role(n, Math.max(1, steps - 3));
      else if (k < b3) r = role(n, Math.max(0, steps - 4));
      else r = role(n, 0);
      c.set(u, y, r, k < 2 ? FLAG.RIM : 0);
    }
    // Strokes on the ground plane: short horizontal dashes of the next lighter shade, sparser toward the front.
    for (let k = 2; k < 40; k += 2) {
      const cell = Math.floor((u + k * 7) / 5);
      if (unit(cell * 64 + k, seed ^ 0x77) > 0.32 - k * 0.006) continue;
      const len = 2 + Math.floor(unit(cell * 31 + k, seed ^ 0x78) * 4);
      if ((u + k * 7) % 5 >= len) continue;
      const yy = top + k + (unit(cell, seed ^ k) < 0.5 ? 1 : 0);
      const cur = c.role(u, yy);
      if (cur === 0) continue;
      const here = k < b1 ? steps - 2 : k < b2 ? Math.max(1, steps - 3) : k < b3 ? Math.max(0, steps - 4) : 0;
      c.set(u, yy, role(n, Math.min(steps - 1, here + 1)), 0);
    }
  }
  placeBetween(seed, layer.name, li, layer.z, u0 - 90, u0 + c.w + 90, placed);
  placed.sort((a, b) => b.size - a.size);
  for (const p of placed) {
    if (marks.some((m) => Math.abs(p.u - m.u) < m.half + (m.mark.kind === 'bridge' ? 14 : 4))) continue;
    const s = stampFor(p, layer.z);
    const x = p.u - u0;
    const top = x >= 0 && x < c.w ? tops[x] : groundTop(seed, layer, p.u);
    const sink = p.species === 'rock' || p.species === 'boulder' || p.species === 'log' ? 1 : 0;
    stamp(c, s, p.u, top + 1 + sink, p.flip, false);
  }
  for (const m of marks) if (m.stamp !== null) stamp(c, m.stamp, m.u, groundTop(seed, layer, m.u) + 2, false, false);
  drawWires(c, seed, layer, li, u0, (u) => groundTop(seed, layer, u));
}

/**
 * A column of the bridge: the deck he walks on with its railing, and below it the gorge: banks falling to a river
 * whose surface glints as its colours cycle, piers standing in it.
 */
function bridgeColumn(c: Chunk, u: number, top: number, m: Mark, n: string, steps: number): void {
  const gorge = Math.round(BRIDGE.half * PX_PER_M);
  const dx = Math.abs(u - m.u);
  const water = top + BRIDGE.deep;
  const surface = dx < gorge ? water : dx < gorge + BRIDGE.bank ? Math.round(water - ((dx - gorge) / BRIDGE.bank) * BRIDGE.deep) : top;
  for (let y = surface; y < c.h; y++) {
    const k = y - surface;
    if (dx < gorge + 2 && y >= water) {
      // The river from the side: a bright surface line, glints on the water below it, darkening with depth.
      const kk = y - water;
      const glint = kk < 10 && unit(Math.floor((u + kk * 13) / (3 + (kk % 3))) * 64 + kk, 0x5ea) < 0.22 - kk * 0.015;
      const r = kk === 0 ? role('water', 3) : glint ? role('water', 3) : kk < 5 ? role('water', 2) : kk < 16 ? role('water', 1) : role('water', 0);
      c.set(u, y, r, FLAG.WATER);
    } else if (surface === top) c.set(u, y, k === 0 ? role(n, steps - 1) : k < 3 ? role(n, steps - 2) : k < 11 ? role(n, Math.max(1, steps - 3)) : role(n, 0), k < 2 ? FLAG.RIM : 0);
    else c.set(u, y, k === 0 ? role(n, steps - 2) : k < 3 ? role('soil', 2) : k < 9 ? role(n, Math.max(0, steps - 4)) : role(n, 0), k === 0 ? FLAG.RIM : 0);
  }
  if (dx > m.half) return;
  // The deck: planks, their joints, the beam under them.
  c.set(u, top, role('wood', 3), FLAG.RIM);
  c.set(u, top + 1, (u - m.u) % 6 === 0 ? role('wood', 0) : role('wood', 2), FLAG.RIM);
  c.set(u, top + 2, role('wood', 1), 0);
  c.set(u, top + 3, role('wood', 0), 0);
  // The railing: posts, a hand rail and a middle rail.
  const rel = u - (m.u - m.half);
  if (rel % 9 === 0) for (let y = top - 8; y < top; y++) c.set(u, y, role('wood', 2), FLAG.RIM);
  c.set(u, top - 8, role('wood', 3), FLAG.RIM);
  c.set(u, top - 4, role('wood', 1), FLAG.RIM);
  // Piers down into the river, braced.
  const pier = rel % 40;
  if (pier < 2 && dx < gorge) for (let y = top + 4; y < water + 8; y++) c.set(u, y, y < water ? role('wood', pier === 0 ? 2 : 1) : role('wood', 0), FLAG.RIM);
  if (dx < gorge && pier >= 2 && pier < 38) {
    const t = (pier - 2) / 36;
    c.set(u, top + 4 + Math.round(Math.abs(t - 0.5) * 2 * (BRIDGE.deep - 8)), role('wood', 1), 0);
  }
}

/** Wires sagging between neighbouring poles (a parabola looks the same as a catenary at this size). */
function drawWires(c: Chunk, seed: number, layer: LayerDef, li: number, u0: number, topAt: (u: number) => number): void {
  const poles = placeBetween(seed, layer.name, li, layer.z, u0 - 220, u0 + c.w + 220, []).filter((p) => p.species === 'pole');
  for (let i = 1; i < poles.length; i++) {
    const a = poles[i - 1];
    const b = poles[i];
    if (b.u - a.u > 260 / layer.z) continue;
    const ya = topAt(a.u) - a.size + Math.round(a.size * 0.08);
    const yb = topAt(b.u) - b.size + Math.round(b.size * 0.08);
    const sag = Math.max(1, (b.u - a.u) * 0.07);
    for (const off of [-1, 1]) {
      const half = Math.round(Math.max(5, Math.round(a.size * 0.22)) / 2) * off;
      for (let u = Math.max(a.u, u0); u <= Math.min(b.u, u0 + c.w - 1); u++) {
        const t = (u - a.u) / (b.u - a.u);
        const y = Math.round(ya + (yb - ya) * t + sag * 4 * t * (1 - t));
        c.set(u + half, y, role('wire', 0), 0);
      }
    }
  }
}

/** Paints the sparse foreground: dark tall grass, fronds and posts passing close to the eye, rarely. */
export function paintFore(c: Chunk, seed: number, layer: LayerDef, li: number, u0: number): void {
  c.clear(u0);
  for (let x = 0; x < c.w; x++) {
    const u = u0 + x;
    const blend = biomeAt(seed, columnDistance(u, layer.z));
    c.setColumnBiome(u, BIOME_IDS.indexOf(blend.a), BIOME_IDS.indexOf(blend.b), blend.k);
  }
  // A foreground group every few screens: a clump of tall dark blades rising from the bottom edge.
  const cell = 520;
  for (let k = Math.floor((u0 - 200) / cell); k * cell < u0 + c.w + 200; k++) {
    if (unit(k, seed ^ 0xf0e) > 0.45) continue;
    const cu = k * cell + Math.floor(unit(k, seed ^ 0xf1e) * cell * 0.7);
    const bottom = layer.top + 360 + 6;
    const random = rng((seed ^ Math.imul(k, 0x27d4eb2d)) >>> 0);
    const blades = 6 + Math.floor(random() * 10);
    for (let i = 0; i < blades; i++) {
      const bx = cu + Math.round((random() - 0.5) * 60);
      const h = 18 + Math.round(random() * 46);
      const lean = (random() - 0.5) * 16;
      for (let y = 0; y < h; y++) {
        const t = y / h;
        const xx = Math.round(bx + lean * t * t);
        const r = role('grass', 0);
        c.set(xx, bottom - y, r, Math.min(7, Math.round(t * 7)));
        if (t < 0.5) c.set(xx + 1, bottom - y, r, Math.min(7, Math.round(t * 7)));
      }
    }
  }
}
