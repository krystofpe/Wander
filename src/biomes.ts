// The biomes of the road: what each one is, where it sits in the climate, how its weather leans, the shape of
// its ground and far land, and what grows and stands in it. Colours live in palette.ts. And one place off the road:
// the deep beyond the creature's hollow, under a sky of stone (web/creature; see `realm` in world.ts).

export const BIOME_IDS = [
  'pine',
  'birch',
  'meadow',
  'autumn',
  'plateau',
  'pass',
  'coast',
  'desert',
  'tundra',
  'swamp',
  'saltflat',
  'stones',
  'ruins',
  'rail',
  'deep',
] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

/** The biomes his road passes through: all but the deep, which lies beyond the hollow and is never on the road. */
export const ROAD_BIOMES: readonly BiomeId[] = BIOME_IDS.filter((id) => id !== 'deep');

/** What a step sounds like. */
export type Ground = 'grass' | 'gravel' | 'snow' | 'sand' | 'wood' | 'mud' | 'leaves' | 'salt';

export type Biome = {
  readonly title: string;
  /** Where it sits in the climate: temperature and moisture, −1..1. */
  readonly climate: readonly [number, number];
  /** An odd, makeshift place: rarer. */
  readonly odd: boolean;
  /** Weather chances (see sky.ts Tendency). */
  readonly weather: { readonly wet: number; readonly snow: number; readonly fog: number; readonly storm: number; readonly cloud: number; readonly wind: number };
  /** The ground he walks: rise and fall in metres, and how quickly it rolls (metres per wave). */
  readonly ground: { readonly amp: number; readonly wave: number; readonly step: Ground };
  /** The far land, in native px at its depth: how high the ridges rise, how rough, and how flat-topped (mesas). */
  readonly far: { readonly height: number; readonly rough: number; readonly mesa: number; readonly ridged: number };
  /** Air: how thick the haze is (fog sigma per depth step) and how much mist gathers at dawn. */
  readonly air: { readonly haze: number; readonly mist: number };
  readonly cold: boolean;
};

export const BIOMES: Readonly<Record<BiomeId, Biome>> = {
  pine: {
    title: 'pine forest',
    climate: [-0.25, 0.45],
    odd: false,
    weather: { wet: 0.3, snow: 0.15, fog: 0.35, storm: 0.15, cloud: 0.6, wind: 0.3 },
    ground: { amp: 5, wave: 140, step: 'leaves' },
    far: { height: 70, rough: 0.5, mesa: 0, ridged: 0.3 },
    air: { haze: 0.052, mist: 0.6 },
    cold: false,
  },
  birch: {
    title: 'birch woods',
    climate: [0.0, 0.25],
    odd: false,
    weather: { wet: 0.25, snow: 0.1, fog: 0.3, storm: 0.15, cloud: 0.5, wind: 0.35 },
    ground: { amp: 3, wave: 120, step: 'grass' },
    far: { height: 45, rough: 0.35, mesa: 0, ridged: 0 },
    air: { haze: 0.042, mist: 0.5 },
    cold: false,
  },
  meadow: {
    title: 'open meadow',
    climate: [0.35, 0.15],
    odd: false,
    weather: { wet: 0.2, snow: 0.05, fog: 0.25, storm: 0.25, cloud: 0.45, wind: 0.55 },
    ground: { amp: 4, wave: 160, step: 'grass' },
    far: { height: 40, rough: 0.3, mesa: 0, ridged: 0 },
    air: { haze: 0.031, mist: 0.45 },
    cold: false,
  },
  autumn: {
    title: 'autumn hills',
    climate: [0.1, -0.1],
    odd: false,
    weather: { wet: 0.28, snow: 0.05, fog: 0.4, storm: 0.15, cloud: 0.6, wind: 0.5 },
    ground: { amp: 9, wave: 170, step: 'leaves' },
    far: { height: 60, rough: 0.35, mesa: 0, ridged: 0 },
    air: { haze: 0.042, mist: 0.6 },
    cold: false,
  },
  plateau: {
    title: 'high plateau',
    climate: [-0.15, -0.5],
    odd: false,
    weather: { wet: 0.12, snow: 0.3, fog: 0.15, storm: 0.2, cloud: 0.35, wind: 0.85 },
    ground: { amp: 2, wave: 200, step: 'gravel' },
    far: { height: 55, rough: 0.25, mesa: 0.4, ridged: 0.2 },
    air: { haze: 0.021, mist: 0.2 },
    cold: false,
  },
  pass: {
    title: 'mountain pass',
    climate: [-0.65, -0.1],
    odd: false,
    weather: { wet: 0.3, snow: 0.6, fog: 0.35, storm: 0.1, cloud: 0.65, wind: 0.8 },
    ground: { amp: 8, wave: 150, step: 'gravel' },
    far: { height: 120, rough: 0.75, mesa: 0, ridged: 0.8 },
    air: { haze: 0.026, mist: 0.5 },
    cold: true,
  },
  coast: {
    title: 'coast and dunes',
    climate: [0.35, 0.7],
    odd: false,
    weather: { wet: 0.25, snow: 0.05, fog: 0.4, storm: 0.25, cloud: 0.5, wind: 0.75 },
    ground: { amp: 4, wave: 110, step: 'sand' },
    far: { height: 25, rough: 0.3, mesa: 0, ridged: 0 },
    air: { haze: 0.047, mist: 0.5 },
    cold: false,
  },
  desert: {
    title: 'desert of mesas',
    climate: [0.95, -0.95],
    odd: false,
    weather: { wet: 0.04, snow: 0, fog: 0.04, storm: 0.6, cloud: 0.15, wind: 0.6 },
    ground: { amp: 5, wave: 190, step: 'sand' },
    far: { height: 70, rough: 0.2, mesa: 1, ridged: 0 },
    air: { haze: 0.018, mist: 0 },
    cold: false,
  },
  tundra: {
    title: 'snowy tundra',
    climate: [-1, 0.05],
    odd: false,
    weather: { wet: 0.32, snow: 1, fog: 0.25, storm: 0, cloud: 0.6, wind: 0.7 },
    ground: { amp: 3, wave: 200, step: 'snow' },
    far: { height: 45, rough: 0.4, mesa: 0, ridged: 0.4 },
    air: { haze: 0.026, mist: 0.3 },
    cold: true,
  },
  swamp: {
    title: 'swamp',
    climate: [0.45, 1],
    odd: false,
    weather: { wet: 0.38, snow: 0.05, fog: 0.6, storm: 0.15, cloud: 0.7, wind: 0.2 },
    ground: { amp: 1, wave: 120, step: 'mud' },
    far: { height: 25, rough: 0.3, mesa: 0, ridged: 0 },
    air: { haze: 0.073, mist: 0.9 },
    cold: false,
  },
  saltflat: {
    title: 'salt flat',
    climate: [0.7, -0.65],
    odd: true,
    weather: { wet: 0.06, snow: 0, fog: 0.1, storm: 0.3, cloud: 0.2, wind: 0.5 },
    ground: { amp: 0.5, wave: 300, step: 'salt' },
    far: { height: 35, rough: 0.2, mesa: 0.5, ridged: 0 },
    air: { haze: 0.016, mist: 0.1 },
    cold: false,
  },
  stones: {
    title: 'field of standing stones',
    climate: [-0.35, 0.5],
    odd: true,
    weather: { wet: 0.35, snow: 0.2, fog: 0.5, storm: 0.1, cloud: 0.7, wind: 0.65 },
    ground: { amp: 6, wave: 170, step: 'grass' },
    far: { height: 50, rough: 0.35, mesa: 0, ridged: 0.1 },
    air: { haze: 0.047, mist: 0.7 },
    cold: false,
  },
  ruins: {
    title: 'ruins of a town',
    climate: [0.2, 0.4],
    odd: true,
    weather: { wet: 0.28, snow: 0.1, fog: 0.35, storm: 0.15, cloud: 0.6, wind: 0.3 },
    ground: { amp: 2, wave: 150, step: 'gravel' },
    far: { height: 40, rough: 0.3, mesa: 0, ridged: 0 },
    air: { haze: 0.047, mist: 0.45 },
    cold: false,
  },
  rail: {
    title: 'rail embankment',
    climate: [0.0, -0.15],
    odd: true,
    weather: { wet: 0.22, snow: 0.15, fog: 0.3, storm: 0.2, cloud: 0.5, wind: 0.5 },
    ground: { amp: 1.5, wave: 260, step: 'gravel' },
    far: { height: 45, rough: 0.3, mesa: 0, ridged: 0 },
    air: { haze: 0.036, mist: 0.4 },
    cold: false,
  },
  // Beyond the hollow: a cavern under a sky of stone, lit by its fungus and one old lamp; no weather but its mist.
  deep: {
    title: 'the deep',
    climate: [0, 0],
    odd: true,
    weather: { wet: 0, snow: 0, fog: 0.7, storm: 0, cloud: 0, wind: 0 },
    ground: { amp: 1.2, wave: 90, step: 'gravel' },
    far: { height: 120, rough: 0.6, mesa: 0, ridged: 1 },
    air: { haze: 0.075, mist: 1 },
    cold: false,
  },
};

export const LANDMARK_KINDS = ['house', 'chapel', 'lighthouse', 'mast', 'car', 'bridge', 'train', 'circle', 'shrine', 'skeleton', 'camp', 'hollow'] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];

/** Where each landmark may stand, with a weight per biome. */
export const LANDMARK_HOMES: Readonly<Record<LandmarkKind, Partial<Record<BiomeId, number>>>> = {
  house: { meadow: 3, birch: 2, autumn: 3, plateau: 1, coast: 1, tundra: 1, ruins: 1, stones: 1 },
  chapel: { meadow: 2, autumn: 2, plateau: 1, stones: 2, ruins: 2, coast: 1 },
  lighthouse: { coast: 6 },
  mast: { plateau: 3, autumn: 2, meadow: 1, rail: 2, saltflat: 2, tundra: 1 },
  car: { desert: 2, saltflat: 2, ruins: 3, rail: 1, plateau: 1, meadow: 1, birch: 1 },
  bridge: { pine: 2, birch: 2, meadow: 2, autumn: 2, swamp: 2, pass: 2, rail: 2 },
  train: { rail: 6, plateau: 2, saltflat: 2, meadow: 1 },
  circle: { stones: 6, plateau: 2, tundra: 1, autumn: 1 },
  shrine: { pass: 3, pine: 2, birch: 1, autumn: 1, swamp: 1 },
  skeleton: { desert: 4, saltflat: 3, tundra: 2, plateau: 1 },
  camp: { pine: 2, birch: 2, meadow: 1, autumn: 1, pass: 1, coast: 1, desert: 1, swamp: 1, tundra: 1 },
  // The creature's hollow is not one of the weighted picks: it takes a few of the landmark places of its lands on its
  // own (HOLLOW), so the other landmarks stay where they were.
  hollow: {},
};

/**
 * The creature's hollow on his road (web/creature): the great tree in the forests, a turf shelter in the open lands.
 * Whatever hollow he comes to, it is the creature's: one world, two lives. A share of the landmark places in these lands;
 * his seat is this many metres past its door.
 */
export const HOLLOW = { homes: new Set<BiomeId>(['pine', 'birch', 'meadow', 'tundra', 'swamp']), chance: 0.14, seat: 3.5 } as const;
