// What stands where: plants and props on each layer, placed by jittered grids with density thinning and grove
// masks, species picked by the biome weights so transitions mix naturally (research: Procgen §26). Pure: the
// painters draw from it and the brain finds its seats, views, shelters and camps in it.
import type { BiomeId } from './biomes.ts';
import type { Spot } from './brain.ts';
import { GROUND, LAYERS, PX_PER_M, columnDistance } from './layers.ts';
import { fbm1, unit } from './noise.ts';
import { MARK_ON } from './paint/landmarks.ts';
import { biomeAt, groundHeight, landmarksBetween, share, stretchAt } from './world.ts';
import type { Blend } from './world.ts';

export type Species =
  | 'pine'
  | 'spruce'
  | 'birch'
  | 'oak'
  | 'dead'
  | 'cactus'
  | 'bush'
  | 'shrub'
  | 'fern'
  | 'tuft'
  | 'drytuft'
  | 'flowers'
  | 'reeds'
  | 'marram'
  | 'rock'
  | 'boulder'
  | 'log'
  | 'stump'
  | 'drift'
  // The deep's (src/paint/deep.ts).
  | 'cap'
  | 'palecap'
  | 'torch'
  | 'shelf'
  | 'bulbs'
  | 'tubes'
  | 'coral'
  | 'amethyst'
  | 'pillar'
  | 'urn'
  | 'stalag'
  | 'crystal'
  | 'glowcap'
  | 'glowfern'
  | 'bloom'
  | 'oldtree'
  | 'toadstool';

/** A class of things on one layer of one biome: how dense (per 100 layer px), how big (px), clumped in groves. */
type Flora = {
  readonly species: Species;
  /** Layer names it grows on. */
  readonly on: readonly string[];
  readonly density: number;
  readonly size: readonly [number, number];
  /** 0 spread evenly … 1 only in groves. */
  readonly grove: number;
};

const f = (species: Species, on: readonly string[], density: number, size: readonly [number, number], grove = 0.3): Flora => ({ species, on, density, size, grove });

/** Sizes are on the playfield; far layers scale them by 1/z. */
export const FLORA: Readonly<Record<BiomeId, readonly Flora[]>> = {
  pine: [
    f('pine', ['mid'], 5.5, [50, 150], 0.85),
    f('pine', ['near'], 3.2, [60, 160], 0.9),
    f('spruce', ['mid', 'near'], 2, [50, 120], 0.8),
    f('pine', ['ground'], 0.9, [90, 170], 0.8),
    f('fern', ['ground', 'fore'], 3, [8, 14], 0.5),
    f('tuft', ['ground'], 5, [3, 6], 0.2),
    f('rock', ['ground'], 0.5, [8, 18], 0.3),
    f('log', ['ground'], 0.2, [22, 34], 0.5),
    f('stump', ['ground'], 0.25, [6, 9], 0.5),
  ],
  birch: [
    f('birch', ['hills', 'mid', 'near'], 6, [60, 110], 0.5),
    f('birch', ['ground'], 1.0, [80, 130], 0.6),
    f('bush', ['near', 'ground'], 1.5, [10, 22], 0.4),
    f('fern', ['ground', 'fore'], 2, [7, 12], 0.4),
    f('tuft', ['ground'], 7, [3, 7], 0.2),
    f('flowers', ['ground'], 1.5, [3, 5], 0.6),
    f('log', ['ground'], 0.2, [20, 30], 0.5),
  ],
  meadow: [
    f('oak', ['hills', 'mid'], 1.2, [50, 90], 0.7),
    f('bush', ['mid', 'near'], 1.5, [12, 26], 0.6),
    f('oak', ['ground'], 0.15, [70, 110], 0.9),
    f('tuft', ['ground', 'fore'], 12, [4, 9], 0.15),
    f('flowers', ['ground'], 4, [3, 6], 0.5),
    f('rock', ['ground'], 0.25, [8, 16], 0.3),
  ],
  autumn: [
    f('oak', ['hills', 'mid', 'near'], 4.5, [55, 100], 0.6),
    f('oak', ['ground'], 0.6, [80, 120], 0.7),
    f('bush', ['near', 'ground'], 1.5, [10, 22], 0.5),
    f('drytuft', ['ground', 'fore'], 7, [3, 7], 0.2),
    f('rock', ['ground'], 0.3, [8, 14], 0.3),
    f('stump', ['ground'], 0.2, [6, 9], 0.5),
  ],
  plateau: [
    f('boulder', ['mid', 'near'], 0.8, [20, 40], 0.4),
    f('dead', ['mid', 'near'], 0.22, [30, 60], 0.9),
    f('shrub', ['mid', 'near'], 1.4, [6, 12], 0.5),
    f('drytuft', ['near', 'ground', 'fore'], 9, [3, 7], 0.3),
    f('rock', ['ground'], 0.6, [8, 20], 0.4),
  ],
  pass: [
    f('spruce', ['mid', 'near'], 2.6, [40, 90], 0.75),
    f('boulder', ['mid', 'near'], 2.6, [16, 44], 0.4),
    f('boulder', ['ground'], 0.8, [16, 30], 0.4),
    f('rock', ['ground'], 1.4, [8, 18], 0.3),
    f('drytuft', ['ground'], 3, [3, 5], 0.3),
  ],
  coast: [
    f('marram', ['mid', 'near', 'ground', 'fore'], 6, [10, 22], 0.5),
    f('drift', ['ground'], 0.3, [16, 30], 0.4),
    f('rock', ['ground'], 0.2, [8, 16], 0.3),
  ],
  desert: [
    f('cactus', ['mid', 'near', 'ground'], 0.6, [20, 46], 0.5),
    f('shrub', ['near', 'ground'], 1.2, [6, 12], 0.3),
    f('rock', ['mid', 'ground'], 0.6, [8, 22], 0.4),
    f('boulder', ['near'], 0.3, [20, 36], 0.5),
  ],
  tundra: [
    f('spruce', ['hills', 'mid', 'near'], 1.3, [30, 70], 0.7),
    f('spruce', ['ground'], 0.25, [40, 80], 0.8),
    f('rock', ['ground'], 0.5, [8, 16], 0.4),
    f('drytuft', ['ground'], 2, [2, 4], 0.4),
  ],
  swamp: [
    f('dead', ['hills', 'mid', 'near'], 2.5, [40, 90], 0.5),
    f('dead', ['ground'], 0.5, [50, 100], 0.6),
    f('reeds', ['mid', 'near', 'ground', 'fore'], 6, [12, 22], 0.5),
    f('tuft', ['ground'], 4, [3, 6], 0.3),
    f('stump', ['ground'], 0.4, [6, 10], 0.5),
  ],
  // Bare white to the edge of the world: stones lying out on it here and there, a tuft or a dry shrub, nothing tall.
  saltflat: [
    f('rock', ['mid', 'near'], 0.8, [10, 24], 0.55),
    f('boulder', ['near'], 0.14, [18, 32], 0.7),
    f('shrub', ['near', 'ground'], 0.4, [5, 9], 0.7),
    f('rock', ['ground'], 0.1, [6, 12], 0.5),
    f('drytuft', ['ground'], 0.4, [2, 4], 0.6),
  ],
  // A moor the ice left strewn with boulders, big and small, in drifts across the heather; a few wind-bent trees.
  stones: [
    f('boulder', ['mid', 'near'], 1.6, [18, 48], 0.7),
    f('boulder', ['ground'], 0.45, [16, 30], 0.7),
    f('rock', ['near', 'ground'], 1.1, [8, 16], 0.5),
    f('oak', ['hills', 'mid'], 0.35, [40, 70], 0.85),
    f('bush', ['mid', 'near'], 0.9, [10, 20], 0.6),
    f('drytuft', ['ground', 'fore'], 8, [3, 6], 0.2),
    f('flowers', ['ground'], 2, [2, 4], 0.6),
  ],
  // After Blackreach and the Underdark, made lush and alive: ranks of giant glowing mushrooms of several kinds into the
  // mist, ferns and glowing flowers everywhere underneath, coral shelves, torch-caps, tube fungi, violet crystal,
  // glowing bulbs and purple coral on the floor; a few stalagmites, a broken pillar or two of a people who are gone.
  // The hollow, the world under the world, the world still living: groves of round old trees and pale ones, ferns,
  // bushes, flowers, mossy stones, a few toadstools glowing quietly; lush, but no path and nobody else.
  deep: [
    f('oak', ['hills', 'mid'], 3.5, [45, 85], 0.6),
    f('birch', ['hills', 'mid'], 1.2, [40, 80], 0.6),
    f('oak', ['near'], 0.9, [80, 130], 0.6),
    f('bush', ['mid', 'near'], 1.6, [10, 22], 0.5),
    f('fern', ['near', 'ground'], 2.5, [10, 18], 0.4),
    f('flowers', ['ground'], 1.6, [4, 8], 0.5),
    f('tuft', ['ground', 'fore'], 5, [4, 9], 0.3),
    f('rock', ['ground'], 0.4, [8, 16], 0.3),
    f('boulder', ['ground'], 0.12, [16, 26], 0.5),
    f('stump', ['ground'], 0.12, [6, 10], 0.5),
    f('toadstool', ['ground'], 0.35, [6, 14], 0.7),
    f('glowcap', ['ground'], 0.4, [3, 6], 0.7),
    f('fern', ['fore'], 1.4, [16, 26], 0.4),
  ],
};

/** Minimum spacing in layer px for a species (the jittered grid's cell). */
const SPACING: Readonly<Record<Species, number>> = {
  pine: 14,
  spruce: 12,
  birch: 12,
  oak: 26,
  dead: 18,
  cactus: 22,
  bush: 12,
  shrub: 8,
  fern: 8,
  tuft: 4,
  drytuft: 4,
  flowers: 6,
  reeds: 6,
  marram: 8,
  rock: 20,
  boulder: 30,
  log: 40,
  stump: 24,
  drift: 30,
  cap: 26,
  palecap: 18,
  torch: 12,
  shelf: 18,
  bulbs: 9,
  tubes: 14,
  coral: 10,
  amethyst: 14,
  pillar: 40,
  urn: 20,
  stalag: 14,
  crystal: 14,
  glowcap: 7,
  glowfern: 9,
  bloom: 8,
  oldtree: 30,
  toadstool: 10,
};

export type Placed = {
  readonly species: Species;
  /** Layer column of its root. */
  readonly u: number;
  /** Its size in layer px (height for upright things, width for low ones). */
  readonly size: number;
  /** A seed for its shape. */
  readonly seed: number;
  readonly flip: boolean;
  /** The biome it belongs to. */
  readonly biome: BiomeId;
};

const SPECIES: readonly Species[] = Object.keys(SPACING) as Species[];

/** Things tall enough to hide a landmark behind them, the layers that keep them out of its way, and how far (metres
 * before and after it). */
const UPRIGHT: ReadonlySet<Species> = new Set(['pine', 'spruce', 'birch', 'oak', 'dead', 'cactus']);
const CLEARED: ReadonlySet<string> = new Set(['mid', 'near', 'ground']);
const CLEARING = [42, 16] as const;

/** Groves: a slow mask that clumps trees and leaves clearings. */
function grove(seed: number, layerIndex: number, u: number): number {
  const v = fbm1(u / 420, seed ^ (0x96e + layerIndex * 131), 2, 0.5) * 2.4;
  return Math.min(1, Math.max(0, (v + 0.35) / 0.9));
}

/**
 * Everything of every species standing on a layer between columns u0 and u1, in order of position. Each
 * species has its own jittered grid; a cell holds one candidate, kept with a probability from the biome weights,
 * the density and the grove mask.
 */
export function placeBetween(seed: number, layerName: string, layerIndex: number, z: number, u0: number, u1: number, out: Placed[] = []): Placed[] {
  out.length = 0;
  const scale = 1 / z;
  // In front of a landmark standing further back, the trees leave a clearing, so it is seen from where he stops to look.
  const clear = CLEARED.has(layerName)
    ? landmarksBetween(seed, columnDistance(u0, z) - 60, columnDistance(u1, z) + 60)
        .filter((m) => (LAYERS.find((l) => l.name === MARK_ON[m.kind])?.z ?? 0) > z)
        .map((m) => m.at)
    : [];
  for (let si = 0; si < SPECIES.length; si++) {
    const sp = SPECIES[si];
    const cell = Math.max(3, Math.round(SPACING[sp] * scale));
    const salt = (0x51ed + si * 7331 + layerIndex * 104729) | 0;
    for (let k = Math.floor(u0 / cell) - 1; k * cell < u1 + cell; k++) {
      const u = k * cell + Math.floor(unit(k, seed ^ salt) * cell * 0.85);
      if (u < u0 || u >= u1) continue;
      const d = columnDistance(u, z);
      if (clear.length > 0 && UPRIGHT.has(sp) && clear.some((at) => d > at - CLEARING[0] && d < at + CLEARING[1])) continue;
      const blend = biomeAt(seed, d, 45);
      const pick = chance(blend, sp, layerName, unit(k, seed ^ salt ^ 0x77));
      if (pick === null) continue;
      const g = grove(seed, layerIndex, u);
      const groveK = pick.flora.grove;
      const keep = ((pick.density * cell) / 100) * (1 - groveK + groveK * g * 1.6);
      if (unit(k, seed ^ salt ^ 0x1234) >= keep) continue;
      const [lo, hi] = pick.flora.size;
      const size = Math.max(2, Math.round((lo + (hi - lo) * unit(k, seed ^ salt ^ 0x4321)) * scale));
      out.push({ species: sp, u, size, seed: (seed ^ salt ^ Math.imul(k, 0x9e3779b1)) >>> 0, flip: unit(k, seed ^ salt ^ 0x99) < 0.5, biome: pick.biome });
    }
  }
  out.sort((a, b) => a.u - b.u);
  return out;
}

/**
 * Which biome's flora a candidate belongs to and the blended density there: the candidate goes to one biome or
 * the other in proportion to share × density, and is kept by the summed density, so a transition zone holds
 * exactly the blend of both biomes' plants.
 */
function chance(blend: Blend, sp: Species, layerName: string, r: number): { flora: Flora; density: number; biome: BiomeId } | null {
  const first = blend.k < 1 ? findFlora(blend.a, sp, layerName) : null;
  const second = blend.k > 0 && blend.b !== blend.a ? findFlora(blend.b, sp, layerName) : null;
  const da = first === null ? 0 : share(blend, blend.a) * first.density;
  const db = second === null ? 0 : share(blend, blend.b) * second.density;
  if (da + db <= 0) return null;
  if (first !== null && r * (da + db) < da) return { flora: first, density: da + db, biome: blend.a };
  if (second !== null) return { flora: second, density: da + db, biome: blend.b };
  return first === null ? null : { flora: first, density: da + db, biome: blend.a };
}

function findFlora(id: BiomeId, sp: Species, layerName: string): Flora | null {
  for (const fl of FLORA[id]) if (fl.species === sp && fl.on.includes(layerName)) return fl;
  return null;
}

// ── Spots for the brain ────────────────────────────────────────────────────


/** What he can sit on, and how high its top is (native px above the ground). */
const SEATS: Partial<Record<Species, { quality: number; height: (size: number) => number }>> = {
  rock: { quality: 0.75, height: (s) => Math.round(s * 0.5) },
  boulder: { quality: 0.6, height: (s) => Math.round(s * 0.5) },
  log: { quality: 0.8, height: (s) => Math.max(3, Math.round(s * 0.16)) },
  stump: { quality: 0.55, height: (s) => Math.round(s * 0.6) },
  drift: { quality: 0.7, height: (s) => Math.max(3, Math.round(s * 0.16)) },
};

const SHELTER_TREES: ReadonlySet<Species> = new Set(['pine', 'spruce', 'oak']);
/** Biomes where there is no dry ground to camp on. */
const WET: ReadonlySet<string> = new Set(['swamp']);

export type SpotAt = Spot & { readonly height: number; readonly u: number };

/**
 * The spots between d0 and d1 (metres): seats on rocks, logs and stumps of a fitting height; views from rises and
 * toward landmarks; shelter under big trees; flat, dry places to camp. Pure, from the same placements the playfield
 * is painted with, so a seat he chooses is really there.
 */
export function spotsBetween(seed: number, d0: number, d1: number): SpotAt[] {
  const out: SpotAt[] = [];
  const ground = LAYERS[GROUND];
  const things = placeBetween(seed, ground.name, GROUND, 1, Math.floor(d0 * PX_PER_M), Math.ceil(d1 * PX_PER_M), []);
  for (const p of things) {
    const d = p.u / PX_PER_M;
    const seat = SEATS[p.species];
    if (seat !== undefined && seat.height(p.size) <= 12) out.push({ kind: 'seat', at: d, what: p.species, quality: seat.quality, height: seat.height(p.size), u: p.u });
    if (SHELTER_TREES.has(p.species) && p.size >= 90) out.push({ kind: 'shelter', at: d, what: p.species === 'oak' ? 'oak' : 'pine', quality: 0.6 + Math.min(0.3, (p.size - 90) / 200), height: 0, u: p.u });
  }
  // Rises: a local high point of the ground with a little prominence is a view.
  const step = 12;
  for (let d = Math.ceil(d0 / step) * step; d < d1; d += step) {
    const h = groundHeight(seed, d);
    const around = Math.max(groundHeight(seed, d - 40), groundHeight(seed, d + 40));
    if (h > around + 1.2 && h >= groundHeight(seed, d - step) && h >= groundHeight(seed, d + step)) {
      out.push({ kind: 'view', at: d, what: 'rise', quality: Math.min(1, 0.4 + (h - around) / 6), height: 0, u: Math.round(d * PX_PER_M) });
    }
  }
  // Landmarks are worth stopping for.
  for (const m of landmarksBetween(seed, d0 - 40, d1 + 40)) {
    const at = m.at - 25;
    if (at >= d0 && at < d1) out.push({ kind: 'view', at, what: m.kind, quality: 0.95, height: 0, u: Math.round(at * PX_PER_M) });
  }
  // Camps: flat, dry ground every 20 m, better near trees.
  for (let d = Math.ceil(d0 / 20) * 20; d < d1; d += 20) {
    if (WET.has(stretchAt(seed, d).biome)) continue;
    const slope = Math.abs(groundHeight(seed, d + 3) - groundHeight(seed, d - 3)) / 6;
    if (slope > 0.06) continue;
    const trees = things.filter((p) => SHELTER_TREES.has(p.species) && Math.abs(p.u / PX_PER_M - d) < 18).length;
    out.push({ kind: 'camp', at: d, what: trees > 0 ? 'clearing' : 'open ground', quality: 0.5 + Math.min(0.4, trees * 0.15), height: 0, u: Math.round(d * PX_PER_M) });
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}
