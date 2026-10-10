// The road, as pure functions of the seed and the distance along it (metres): which biome, how they blend,
// how high the ground lies, and where the landmarks stand. The same seed and distance always give the same
// place, and any distance can be looked up directly, without walking there from the start.
import { BIOMES, BIOME_IDS, HOLLOW, LANDMARK_HOMES, LANDMARK_KINDS } from './biomes.ts';
import type { BiomeId, LandmarkKind } from './biomes.ts';
import { fbm1, noise1, unit } from './noise.ts';
import type { Tendency } from './sky.ts';

export const WORLD = {
  /** Mean stretch length and how far a boundary may move from its grid point (metres): 400–1200 m, about 6–17 minutes. */
  stretch: 800,
  jitter: 200,
  /** Half-width of a biome blend, metres (palette, sky, sound, weather). */
  blend: 120,
  /** How far the blend boundary wanders, metres: biomes interleave a little near a border. */
  warp: 35,
  /** Landmark cells: one cell per `cell` metres, a landmark in `chance` of them, never closer than `gap`. */
  landmark: { cell: 800, chance: 0.72, gap: 400 },
} as const;

// Salts keep the hash streams for different decisions apart.
const SALT = { bound: 0x51a7, pick: 0x9b1c, climate: 0x3c11, warp: 0x7a05, ground: 0x2f6d, mark: 0x6e2b, markKind: 0x1d4f, hollow: 0x4011 } as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ── Climate ────────────────────────────────────────────────────────────────

/** Where each biome sits in temperature, moisture, altitude and human trace (−1..1). */
const CENTROIDS: Readonly<Record<BiomeId, readonly [number, number, number, number]>> = {
  pine: [-0.3, 0.45, 0.1, -0.5],
  birch: [0.05, 0.2, -0.1, -0.2],
  meadow: [0.35, 0.05, -0.45, -0.1],
  autumn: [0.15, -0.15, 0.25, -0.3],
  plateau: [-0.15, -0.5, 0.65, -0.4],
  pass: [-0.55, -0.05, 0.8, -0.5],
  coast: [0.35, 0.55, -0.8, -0.2],
  desert: [0.9, -0.9, 0.1, -0.4],
  tundra: [-0.95, 0.1, 0.15, -0.6],
  swamp: [0.4, 0.8, -0.55, -0.35],
  saltflat: [0.65, -0.6, -0.55, 0.55],
  stones: [-0.35, 0.45, 0.35, 0.3],
  ruins: [0.2, 0.35, -0.2, 0.8],
  rail: [0.0, -0.2, -0.3, 0.8],
};

/** Biomes that never touch: the climate keeps them apart, and this catches the rare case it does not. */
const NEVER: ReadonlySet<string> = new Set(['desert|tundra', 'desert|swamp', 'tundra|swamp', 'saltflat|tundra', 'saltflat|swamp', 'desert|pine', 'tundra|coast']);
const forbidden = (a: BiomeId, b: BiomeId): boolean => NEVER.has(`${a}|${b}`) || NEVER.has(`${b}|${a}`);

/** Standard deviation of the 2-octave fBm the climate fields are made from (measured). */
const CLIMATE_SD = 0.21;

/**
 * The four slow climate fields at a stretch, about a dozen stretches per swing. Mapped through tanh so their
 * values spread evenly over −1..1 instead of crowding the middle, which would favour the mildest biomes.
 */
function climate(seed: number, k: number): [number, number, number, number] {
  const f = (i: number, scale: number): number => Math.tanh((0.85 * fbm1(k / scale, seed ^ (SALT.climate + i * 977), 2, 0.5)) / CLIMATE_SD);
  return [f(0, 7), f(1, 5), f(2, 4.3), f(3, 6.1)];
}

/** Biomes ranked for stretch k by how well they fit its climate, each with a weight for a random pick. */
function ranked(seed: number, k: number): { id: BiomeId; weight: number }[] {
  const c = climate(seed, k);
  const scored = BIOME_IDS.map((id) => {
    const p = CENTROIDS[id];
    const d2 = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2 + 0.8 * (c[2] - p[2]) ** 2 + 0.8 * (c[3] - p[3]) ** 2;
    return { id, weight: Math.exp(-d2 / 0.3) * (BIOMES[id].odd ? 0.55 : 1) };
  });
  scored.sort((a, b) => b.weight - a.weight);
  return scored;
}

/** A weighted pick among the best three that pass `ok`, or the best that does. */
function pickFrom(order: { id: BiomeId; weight: number }[], ok: (id: BiomeId) => boolean, u: number): BiomeId {
  const top = order.filter((o) => ok(o.id)).slice(0, 3);
  if (top.length === 0) return order[0].id;
  let total = 0;
  for (const o of top) total += o.weight;
  let x = u * total;
  for (const o of top) {
    x -= o.weight;
    if (x < 0) return o.id;
  }
  return top[top.length - 1].id;
}

/**
 * The biome of stretch k, with no look-back chain: an even stretch picks among the three that fit its climate
 * best; an odd stretch picks among the best that differ from both even neighbours and may sit next to them.
 * So two neighbours are never the same biome, and any stretch is found in a few steps from anywhere.
 */
function biomeOfStretch(seed: number, k: number): BiomeId {
  const u = unit(k, seed ^ SALT.pick);
  if ((k & 1) === 0) return pickFrom(ranked(seed, k), () => true, u);
  const before = pickFrom(ranked(seed, k - 1), () => true, unit(k - 1, seed ^ SALT.pick));
  const after = pickFrom(ranked(seed, k + 1), () => true, unit(k + 1, seed ^ SALT.pick));
  const order = ranked(seed, k);
  const fits = (id: BiomeId): boolean => id !== before && id !== after && !forbidden(id, before) && !forbidden(id, after);
  if (order.some((o) => fits(o.id))) return pickFrom(order, fits, u);
  // Nothing fits both: anything that at least differs from both and may sit next to them.
  for (const id of BIOME_IDS) if (fits(id)) return id;
  return order.find((o) => o.id !== before && o.id !== after)?.id ?? order[0].id;
}

const stretchCache = new Map<string, BiomeId>();

function stretchBiome(seed: number, k: number): BiomeId {
  const key = `${seed}:${k}`;
  let id = stretchCache.get(key);
  if (id === undefined) {
    id = biomeOfStretch(seed, k);
    if (stretchCache.size > 4096) stretchCache.clear();
    stretchCache.set(key, id);
  }
  return id;
}

/** Where stretch k begins, metres. */
function boundary(seed: number, k: number): number {
  return k * WORLD.stretch + WORLD.jitter * (2 * unit(k, seed ^ SALT.bound) - 1);
}

export type Stretch = { readonly k: number; readonly biome: BiomeId; readonly start: number; readonly end: number };

/** The stretch of road containing distance d. */
export function stretchAt(seed: number, d: number): Stretch {
  let k = Math.floor(d / WORLD.stretch);
  while (boundary(seed, k) > d) k--;
  while (boundary(seed, k + 1) <= d) k++;
  return { k, biome: stretchBiome(seed, k), start: boundary(seed, k), end: boundary(seed, k + 1) };
}

/** Every stretch overlapping [from, to). */
export function stretchesBetween(seed: number, from: number, to: number): Stretch[] {
  const out: Stretch[] = [];
  let s = stretchAt(seed, from);
  while (s.start < to) {
    out.push(s);
    s = { k: s.k + 1, biome: stretchBiome(seed, s.k + 1), start: s.end, end: boundary(seed, s.k + 2) };
  }
  return out;
}

/** The first stretch of a biome at or after `from`, searching up to `limit` metres on; null if there is none. */
export function firstStretchOf(seed: number, biome: BiomeId, from = 0, limit = 3e6): Stretch | null {
  let s = stretchAt(seed, from);
  while (s.start < from + limit) {
    if (s.biome === biome && s.start >= from) return s;
    s = { k: s.k + 1, biome: stretchBiome(seed, s.k + 1), start: s.end, end: boundary(seed, s.k + 2) };
  }
  return null;
}

// ── Blending ───────────────────────────────────────────────────────────────

/** Two biomes and how far the blend has gone from `a` to `b` (0..1). Away from any border, a = b and k = 0. */
export type Blend = { readonly a: BiomeId; readonly b: BiomeId; readonly k: number };

/** The biomes at distance d, blended over `half` metres either side of each (wandering) border. */
export function biomeAt(seed: number, d: number, half: number = WORLD.blend): Blend {
  const w = d + WORLD.warp * fbm1(d / 160, seed ^ SALT.warp, 2, 0.5) * 2;
  const s = stretchAt(seed, w);
  if (w < s.start + half) {
    const before = stretchBiome(seed, s.k - 1);
    return { a: before, b: s.biome, k: smooth(s.start - half, s.start + half, w) };
  }
  if (w > s.end - half) {
    const after = stretchBiome(seed, s.k + 1);
    return { a: s.biome, b: after, k: smooth(s.end - half, s.end + half, w) };
  }
  return { a: s.biome, b: s.biome, k: 0 };
}

/** The share of one biome in a blend. */
export function share(blend: Blend, id: BiomeId): number {
  return (blend.a === id ? 1 - blend.k : 0) + (blend.b === id ? blend.k : 0);
}

/** A blended number: each biome's value weighted by its share. */
export function blended(blend: Blend, value: (id: BiomeId) => number): number {
  if (blend.a === blend.b || blend.k === 0) return value(blend.a);
  if (blend.k === 1) return value(blend.b);
  return value(blend.a) * (1 - blend.k) + value(blend.b) * blend.k;
}

/** The weather's lean at a distance, from the blended biomes; `only` forces one biome (tests, frozen shots). */
export function tendencyAt(seed: number, d: number, only?: BiomeId): Tendency {
  const blend: Blend = only !== undefined ? { a: only, b: only, k: 0 } : biomeAt(seed, d);
  const w = (key: keyof Tendency): number => blended(blend, (id) => BIOMES[id].weather[key]);
  return { wet: w('wet'), snow: w('snow'), fog: w('fog'), storm: w('storm'), cloud: w('cloud'), wind: w('wind') };
}

// ── Ground ─────────────────────────────────────────────────────────────────

/** One biome's ground at d, metres: gentle fBm with a low gain, so slopes stay walkable. */
function biomeGround(seed: number, id: BiomeId, d: number): number {
  const g = BIOMES[id].ground;
  return g.amp * fbm1(d / g.wave, seed ^ SALT.ground, 3, 0.35);
}

/** Height of the ground he walks on at d, metres above the road's mean. */
export function groundHeight(seed: number, d: number): number {
  const blend = biomeAt(seed, d, 70);
  const h = blended(blend, (id) => biomeGround(seed, id, d));
  // Near a landmark the ground flattens, so the moment reads as a pause; at a bridge it is level from bank to bank.
  const mark = landmarkNear(seed, d, 60);
  if (mark === null) return h;
  const level = mark.kind === 'bridge' || mark.kind === 'hollow';
  const calm = level ? smooth(12, 60, Math.abs(d - mark.at)) : 1 - 0.6 * (1 - smooth(20, 60, Math.abs(d - mark.at)));
  return h * calm;
}

// ── Landmarks ──────────────────────────────────────────────────────────────

export type Landmark = { readonly cell: number; readonly at: number; readonly kind: LandmarkKind };

/** The landmark of a cell, or null: placed with a minimum gap, its kind fitted to the biome where it stands. */
export function landmarkAt(seed: number, cell: number): Landmark | null {
  const L = WORLD.landmark;
  if (unit(cell, seed ^ SALT.mark) >= L.chance) return null;
  const at = cell * L.cell + unit(cell * 3 + 1, seed ^ SALT.mark) * (L.cell - L.gap);
  const here = stretchAt(seed, at).biome;
  if (HOLLOW.homes.has(here) && unit(cell, seed ^ SALT.hollow) < HOLLOW.chance) return { cell, at, kind: 'hollow' };
  let total = 0;
  for (const kind of LANDMARK_KINDS) total += LANDMARK_HOMES[kind][here] ?? 0;
  if (total === 0) return null;
  let x = unit(cell, seed ^ SALT.markKind) * total;
  for (const kind of LANDMARK_KINDS) {
    x -= LANDMARK_HOMES[kind][here] ?? 0;
    if (x < 0) return { cell, at, kind };
  }
  return null;
}

/** The landmark within `reach` metres of d, if any. */
export function landmarkNear(seed: number, d: number, reach: number): Landmark | null {
  const c = Math.floor(d / WORLD.landmark.cell);
  for (let i = c - 1; i <= c + 1; i++) {
    const m = landmarkAt(seed, i);
    if (m !== null && Math.abs(m.at - d) <= reach) return m;
  }
  return null;
}

/** Every landmark in [from, to), in order. */
export function landmarksBetween(seed: number, from: number, to: number): Landmark[] {
  const out: Landmark[] = [];
  for (let c = Math.floor(from / WORLD.landmark.cell); c * WORLD.landmark.cell < to; c++) {
    const m = landmarkAt(seed, c);
    if (m !== null && m.at >= from && m.at < to) out.push(m);
  }
  return out;
}

/** A gentle wobble shared by things that wander (paths, poles), −1..1. */
export function wander(seed: number, d: number, scale: number, salt: number): number {
  return noise1(d / scale, seed ^ salt);
}
