// The world: terrain fields, biome rules, and cached chunks of map cells.
import { BIOMES, Biome, TERRAIN, Water } from './config.ts';
import type { BiomeId } from './config.ts';
import { fbm, makeNoise } from './noise.ts';
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
