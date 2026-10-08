// The world: terrain fields, biome rules, and cached chunks of map cells.
import { ASPECT, BIOMES, Biome, CHUNK_CACHE_LIMIT, CHUNK_SIZE, TERRAIN, Water } from './config.ts';
import type { BiomeId } from './config.ts';
import { fbm, hash2, makeNoise } from './noise.ts';
import type { Noise2D } from './noise.ts';

/** Raw terrain values at one world point. */
export type Fields = {
  readonly height: number;
  readonly moisture: number;
  readonly temperature: number;
  readonly river: number;
  readonly lake: number;
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Biome from height, moisture and temperature, before rivers and lakes. Rules are checked in order. Pure. */
export function classify(height: number, moisture: number, temperature: number): BiomeId {
  if (height < -0.35) return Biome.DeepOcean;
  if (height < -0.08) return Biome.Ocean;
  if (height < 0) return Biome.Shallows;
  if (height < 0.04) return Biome.Beach;
  if (height >= 0.9 || (height >= 0.7 && temperature < 0.15)) return Biome.SnowyPeaks;
  if (height >= 0.7) return Biome.Mountains;
  if (height >= 0.55) return Biome.Hills;
  if (temperature < 0.2) return Biome.Tundra;
  if (temperature > 0.6 && moisture < 0.35) return Biome.Desert;
  if (moisture > 0.75 && height < 0.2) return Biome.Swamp;
  if (moisture > 0.5) return Biome.Forest;
  return Biome.Grassland;
}

/** Biome including rivers and lakes, which override land below the hills. Pure. */
export function biomeOf(f: Fields): BiomeId {
  const T = TERRAIN;
  if (f.height >= T.riverMinHeight && f.height < T.riverMaxHeight) {
    // Rivers widen towards the coast.
    const inland = clamp01((f.height - T.riverMinHeight) / (T.riverMaxHeight - T.riverMinHeight));
    const width = T.riverWidthCoast + (T.riverWidthInland - T.riverWidthCoast) * inland;
    if (Math.abs(f.river) < width) return Biome.River;
  }
  if (
    f.lake > T.lakeThreshold &&
    f.height >= T.lakeMinHeight &&
    f.height < T.lakeMaxHeight &&
    f.moisture > T.lakeMinMoisture
  ) {
    return Biome.Lake;
  }
  return classify(f.height, f.moisture, f.temperature);
}

export function isWater(biome: BiomeId): boolean {
  return BIOMES[biome].water !== Water.None;
}

/** The terrain noise fields for one seed. */
export class Terrain {
  readonly seed: number;
  private readonly warpX: Noise2D;
  private readonly warpY: Noise2D;
  private readonly continent: Noise2D;
  private readonly detail: Noise2D;
  private readonly moistureNoise: Noise2D;
  private readonly temperatureNoise: Noise2D;
  private readonly riverNoise: Noise2D;
  private readonly lakeNoise: Noise2D;

  constructor(seed: number) {
    this.seed = seed;
    this.warpX = makeNoise(seed ^ 0x51);
    this.warpY = makeNoise(seed ^ 0x52);
    this.continent = makeNoise(seed ^ 0x53);
    this.detail = makeNoise(seed ^ 0x54);
    this.moistureNoise = makeNoise(seed ^ 0x55);
    this.temperatureNoise = makeNoise(seed ^ 0x56);
    this.riverNoise = makeNoise(seed ^ 0x57);
    this.lakeNoise = makeNoise(seed ^ 0x58);
  }

  /** Terrain values at world point (x, y). Pure. */
  fields(x: number, y: number): Fields {
    const T = TERRAIN;
    // Domain warping makes coasts and rivers ragged instead of blobby.
    const wx = x + T.warpAmplitude * fbm(this.warpX, x / T.warpWavelength, y / T.warpWavelength, 2);
    const wy = y + T.warpAmplitude * fbm(this.warpY, x / T.warpWavelength, y / T.warpWavelength, 2);
    const height =
      T.continentWeight * fbm(this.continent, wx / T.continentWavelength, wy / T.continentWavelength, 3) +
      T.detailWeight * fbm(this.detail, wx / T.detailWavelength, wy / T.detailWavelength, 5) +
      T.heightBias;
    const moisture = clamp01(
      0.5 + T.moistureContrast * fbm(this.moistureNoise, x / T.moistureWavelength, y / T.moistureWavelength, 3),
    );
    const temperature =
      clamp01(
        0.5 +
          T.temperatureContrast *
            fbm(this.temperatureNoise, x / T.temperatureWavelength, y / T.temperatureWavelength, 2),
      ) -
      T.lapseRate * Math.max(0, height);
    const river = fbm(this.riverNoise, wx / T.riverWavelength, wy / T.riverWavelength, 3);
    const lake = fbm(this.lakeNoise, x / T.lakeWavelength, y / T.lakeWavelength, 2);
    return { height, moisture, temperature, river, lake };
  }
}

/** Static data for a CHUNK_SIZE × CHUNK_SIZE block of map cells, stored row by row. */
export type Chunk = {
  readonly cx: number;
  readonly cy: number;
  readonly biome: Uint8Array;
  readonly height: Float32Array;
  readonly temperature: Float32Array;
  /** 0..255 from a hash; picks among a biome's glyphs. */
  readonly variant: Uint8Array;
  /** Slope shading for land (0.55..1.35); 1 for water. */
  readonly shade: Float32Array;
  /** Unit vector along a river's flow; 0 elsewhere. */
  readonly flowX: Float32Array;
  readonly flowY: Float32Array;
  /** 1 for sea cells next to land. */
  readonly shore: Uint8Array;
};

// Slope light comes from the north-west, fairly high in the sky.
const LIGHT_LENGTH = Math.hypot(1, 1, 2.5);
const LX = -1 / LIGHT_LENGTH;
const LY = -1 / LIGHT_LENGTH;
const LZ = 2.5 / LIGHT_LENGTH;
const IS_LAND = Uint8Array.from(BIOMES, (b) => (b.water === Water.None ? 1 : 0));

export function generateChunk(terrain: Terrain, cx: number, cy: number): Chunk {
  const S = CHUNK_SIZE;
  const B = S + 2; // one extra cell on every side, for neighbours
  const height = new Float32Array(B * B);
  const river = new Float32Array(B * B);
  const temperature = new Float32Array(B * B);
  const biome = new Uint8Array(B * B);
  const mx0 = cx * S - 1;
  const my0 = cy * S - 1;
  for (let j = 0; j < B; j++) {
    for (let i = 0; i < B; i++) {
      const f = terrain.fields(mx0 + i, (my0 + j) * ASPECT);
      const k = j * B + i;
      height[k] = f.height;
      river[k] = f.river;
      temperature[k] = f.temperature;
      biome[k] = biomeOf(f);
    }
  }
  const n = S * S;
  const chunk: Chunk = {
    cx,
    cy,
    biome: new Uint8Array(n),
    height: new Float32Array(n),
    temperature: new Float32Array(n),
    variant: new Uint8Array(n),
    shade: new Float32Array(n),
    flowX: new Float32Array(n),
    flowY: new Float32Array(n),
    shore: new Uint8Array(n),
  };
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const k = (j + 1) * B + (i + 1);
      const o = j * S + i;
      const b = biome[k];
      chunk.biome[o] = b;
      chunk.height[o] = height[k];
      chunk.temperature[o] = temperature[k];
      chunk.variant[o] = hash2(cx * S + i, cy * S + j, terrain.seed) & 0xff;
      if (IS_LAND[b] === 1) {
        // Slope per world unit (rows are ASPECT units apart), lit like a relief map.
        const sx = (height[k + 1] - height[k - 1]) * 0.5 * TERRAIN.relief;
        const sy = ((height[k + B] - height[k - B]) * 0.5 * TERRAIN.relief) / ASPECT;
        const lambert = (-sx * LX - sy * LY + LZ) / Math.hypot(sx, sy, 1);
        chunk.shade[o] = Math.min(1.35, Math.max(0.55, lambert / LZ));
      } else {
        chunk.shade[o] = 1;
      }
      if (b === Biome.River) {
        // The river runs along a contour of the river noise: its gradient turned 90°.
        const gx = (river[k + 1] - river[k - 1]) * 0.5;
        const gy = ((river[k + B] - river[k - B]) * 0.5) / ASPECT;
        const length = Math.hypot(gx, gy) || 1;
        chunk.flowX[o] = -gy / length;
        chunk.flowY[o] = gx / length;
      }
      if (
        BIOMES[b].water === Water.Sea &&
        (IS_LAND[biome[k - 1]] === 1 || IS_LAND[biome[k + 1]] === 1 || IS_LAND[biome[k - B]] === 1 || IS_LAND[biome[k + B]] === 1)
      ) {
        chunk.shore[o] = 1;
      }
    }
  }
  return chunk;
}

/** A unique number per chunk, safe while |cx| and |cy| stay below 2^20 (67 million cells). */
export function chunkKey(cx: number, cy: number): number {
  return (cx + 1048576) * 2097152 + (cy + 1048576);
}

/** Index of map cell (mx, my) inside its chunk. */
export function cellOffset(mx: number, my: number): number {
  const i = mx - Math.floor(mx / CHUNK_SIZE) * CHUNK_SIZE;
  const j = my - Math.floor(my / CHUNK_SIZE) * CHUNK_SIZE;
  return j * CHUNK_SIZE + i;
}

export class World {
  readonly terrain: Terrain;
  /** How many chunks have been generated; read by tests and the bench. */
  generated = 0;
  private readonly chunks = new Map<number, Chunk>();

  constructor(seed: number) {
    this.terrain = new Terrain(seed);
  }

  get seed(): number {
    return this.terrain.seed;
  }

  /** The chunk at chunk coordinates (cx, cy): generated on first use, cached, least recently used dropped first. */
  chunk(cx: number, cy: number): Chunk {
    const key = chunkKey(cx, cy);
    const cached = this.chunks.get(key);
    if (cached !== undefined) {
      this.chunks.delete(key);
      this.chunks.set(key, cached);
      return cached;
    }
    const made = generateChunk(this.terrain, cx, cy);
    this.generated++;
    this.chunks.set(key, made);
    if (this.chunks.size > CHUNK_CACHE_LIMIT) {
      const oldest = this.chunks.keys().next().value;
      if (oldest !== undefined) this.chunks.delete(oldest);
    }
    return made;
  }

  chunkAt(mx: number, my: number): Chunk {
    return this.chunk(Math.floor(mx / CHUNK_SIZE), Math.floor(my / CHUNK_SIZE));
  }

  biomeAt(mx: number, my: number): BiomeId {
    return this.chunkAt(mx, my).biome[cellOffset(mx, my)] as BiomeId;
  }

  temperatureAt(mx: number, my: number): number {
    return this.chunkAt(mx, my).temperature[cellOffset(mx, my)];
  }

  /**
   * Generates missing chunks for the view (left, top, cols × rows map cells) plus a one-chunk ring,
   * nearest the view's centre first, until `budgetMs` has passed. Returns how many it generated.
   */
  prefetch(
    left: number,
    top: number,
    cols: number,
    rows: number,
    budgetMs: number,
    now: () => number = () => performance.now(),
  ): number {
    const S = CHUNK_SIZE;
    const cx0 = Math.floor(left / S) - 1;
    const cy0 = Math.floor(top / S) - 1;
    const cx1 = Math.floor((left + cols - 1) / S) + 1;
    const cy1 = Math.floor((top + rows - 1) / S) + 1;
    const centreX = (left + cols / 2) / S;
    const centreY = (top + rows / 2) / S;
    const missing: { cx: number; cy: number; distance: number }[] = [];
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!this.chunks.has(chunkKey(cx, cy))) {
          missing.push({ cx, cy, distance: (cx + 0.5 - centreX) ** 2 + (cy + 0.5 - centreY) ** 2 });
        }
      }
    }
    missing.sort((a, b) => a.distance - b.distance);
    const start = now();
    let made = 0;
    for (const m of missing) {
      if (now() - start >= budgetMs) break;
      this.chunk(m.cx, m.cy);
      made++;
    }
    return made;
  }
}

/**
 * Nearest map cell to (mx, my) whose biome passes `wanted`, searching outward in square rings
 * `step` cells apart. It reads the terrain directly, so it never fills the chunk cache.
 */
export function findSpot(
  world: World,
  mx: number,
  my: number,
  wanted: (biome: BiomeId) => boolean,
  step = 8,
  maxRadius = 4096,
): { mx: number; my: number } {
  const ok = (x: number, y: number): boolean => wanted(biomeOf(world.terrain.fields(x, y * ASPECT)));
  if (ok(mx, my)) return { mx, my };
  for (let r = step; r <= maxRadius; r += step) {
    for (let k = -r; k <= r; k += step) {
      if (ok(mx + k, my - r)) return { mx: mx + k, my: my - r };
      if (ok(mx + k, my + r)) return { mx: mx + k, my: my + r };
      if (ok(mx - r, my + k)) return { mx: mx - r, my: my + k };
      if (ok(mx + r, my + k)) return { mx: mx + r, my: my + k };
    }
  }
  return { mx, my };
}

export function findLand(world: World, mx: number, my: number): { mx: number; my: number } {
  return findSpot(world, mx, my, (b) => !isWater(b));
}

export function findSea(world: World, mx: number, my: number): { mx: number; my: number } {
  return findSpot(world, mx, my, (b) => BIOMES[b].water === Water.Sea);
}
