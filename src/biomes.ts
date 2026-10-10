// The biomes of the road: what each one is, where it sits in the climate, how its weather leans, the shape of
// its ground and far land, and what grows and stands in it. Colours live in palette.ts. And one place off the road:
// the hollow where the creature lives, an old wood under a canopy (web/creature; see `realm` in world.ts).

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
  'deep',
] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

/** The biomes his road passes through: all but the hollow ('deep'), where the creature lives, never on the road. */
export const ROAD_BIOMES: readonly BiomeId[] = BIOME_IDS.filter((id) => id !== 'deep');

/** What a step sounds like. */
export type Ground = 'grass' | 'gravel' | 'snow' | 'sand' | 'mud' | 'leaves' | 'salt';

export type Biome = {
  readonly title: string;
  /** Where it sits in the climate: temperature and moisture, −1..1. */
  readonly climate: readonly [number, number];
  /** An odd, bare place: rarer. */
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
    title: 'moor of boulders',
    climate: [-0.35, 0.5],
    odd: true,
    weather: { wet: 0.35, snow: 0.2, fog: 0.5, storm: 0.1, cloud: 0.7, wind: 0.65 },
    ground: { amp: 6, wave: 170, step: 'grass' },
    far: { height: 50, rough: 0.35, mesa: 0, ridged: 0.1 },
    air: { haze: 0.047, mist: 0.7 },
    cold: false,
  },
  // Where the creature lives: the hollow, an old wood under a canopy, lit by the mist far off and what glows there;
  // no weather but its mist.
  deep: {
    title: 'the hollow',
    climate: [0, 0],
    odd: true,
    weather: { wet: 0, snow: 0, fog: 0.7, storm: 0, cloud: 0, wind: 0 },
    ground: { amp: 1.2, wave: 90, step: 'gravel' },
    far: { height: 120, rough: 0.6, mesa: 0, ridged: 1 },
    air: { haze: 0.075, mist: 1 },
    cold: false,
  },
};

/**
 * The rare sights of his road, all of them made by nothing but time and weather: something huge, long dead, half in
 * the ground; a lone ancient tree on a rise; an arch worn through a hill; a great boulder the ice left behind; a
 * fallen giant with its roots in the air; a tor of stacked stone; a waterfall off a cliff; stacks of rock standing in
 * the sea; spires of banded rock; a dead tree drowned in a pool. Every biome of the road has at least two of them.
 */
export const LANDMARK_KINDS = ['skeleton', 'lonetree', 'arch', 'erratic', 'fallen', 'tor', 'waterfall', 'stacks', 'spires', 'snag'] as const;
export type LandmarkKind = (typeof LANDMARK_KINDS)[number];

/** Where each landmark may stand, with a weight per biome. */
export const LANDMARK_HOMES: Readonly<Record<LandmarkKind, Partial<Record<BiomeId, number>>>> = {
  skeleton: { desert: 3, saltflat: 4, tundra: 2, plateau: 1 },
  lonetree: { meadow: 5, autumn: 3, birch: 2, plateau: 1, stones: 1 },
  arch: { desert: 3, coast: 3, plateau: 3 },
  erratic: { pine: 3, birch: 2, meadow: 2, autumn: 1, pass: 2, tundra: 3, swamp: 1, stones: 4 },
  fallen: { pine: 3, birch: 2, autumn: 3, swamp: 2 },
  tor: { plateau: 3, pass: 2, tundra: 2, stones: 4 },
  waterfall: { pass: 4 },
  stacks: { coast: 4 },
  spires: { desert: 4, saltflat: 3 },
  snag: { swamp: 4 },
};

/** What he calls each landmark once he has passed it, in the log and in his thoughts. */
export const MARK_NAMES: Readonly<Record<LandmarkKind, string>> = {
  skeleton: 'the skeleton',
  lonetree: 'the lone tree',
  arch: 'the stone arch',
  erratic: 'the great boulder',
  fallen: 'the fallen giant',
  tor: 'the tor',
  waterfall: 'the waterfall',
  stacks: 'the sea stacks',
  spires: 'the rock spires',
  snag: 'the drowned tree',
};
