// What the sound hears of the world: one state object rebuilt from his life a few times a second, with each biome's
// sound weights blended by the border, the weather, the hour and what he is doing (research: Sound §6). Pure.
import type { BiomeId } from '../../src/biomes.ts';
import type { Stage } from '../../src/life.ts';
import { fbm1, noise1 } from '../../src/noise.ts';
import { smoothstep } from '../../src/sky.ts';
import type { Weather } from '../../src/sky.ts';
import type { Blend } from '../../src/world.ts';

/** What a biome sounds like: weights 0..1 of the ambience layers, its warmth, and the mode its music plays in. */
export type Heard = {
  /** Wind in trees (the forest's hero sound), and dry leaves ticking. */
  readonly trees: number;
  readonly leaves: number;
  /** Whistles where there is something to whistle through: rocks, ruins, wires. */
  readonly whistle: number;
  readonly crickets: number;
  readonly birds: number;
  readonly owls: number;
  readonly surf: number;
  /** Still water near (drops plink, steps squelch). */
  readonly water: number;
  /** A distant train now and then. */
  readonly train: number;
  /** Air temperature by day, °C. */
  readonly warmth: number;
  /** The music's mode: semitones above the road's root. */
  readonly mode: readonly number[];
};

const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const LYDIAN = [0, 2, 4, 6, 7, 9, 11];
const IONIAN = [0, 2, 4, 5, 7, 9, 11];
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10];
const OPEN = [0, 2, 5, 7, 10];

const h = (trees: number, leaves: number, whistle: number, crickets: number, birds: number, owls: number, surf: number, water: number, train: number, warmth: number, mode: readonly number[]): Heard => ({
  trees,
  leaves,
  whistle,
  crickets,
  birds,
  owls,
  surf,
  water,
  train,
  warmth,
  mode,
});

export const HEARD: Readonly<Record<BiomeId, Heard>> = {
  pine: h(1, 0.5, 0, 0.4, 0.8, 1, 0, 0, 0, 15, AEOLIAN),
  birch: h(0.8, 0.4, 0, 0.8, 1, 0.7, 0, 0, 0, 17, DORIAN),
  meadow: h(0.25, 0.1, 0, 1, 0.9, 0.2, 0, 0, 0, 20, IONIAN),
  autumn: h(0.85, 1, 0, 0.5, 0.6, 0.6, 0, 0, 0, 13, AEOLIAN),
  plateau: h(0.1, 0, 0.35, 0.6, 0.4, 0.1, 0, 0, 0.1, 16, OPEN),
  pass: h(0.3, 0.1, 1, 0, 0.2, 0.2, 0, 0, 0, 6, OPEN),
  coast: h(0.1, 0, 0.2, 0.2, 0.3, 0, 1, 0.3, 0, 16, LYDIAN),
  desert: h(0, 0, 0.4, 0.4, 0.1, 0.1, 0, 0, 0, 27, PHRYGIAN),
  tundra: h(0, 0, 0.6, 0, 0.1, 0, 0, 0, 0, 0, OPEN),
  swamp: h(0.5, 0.2, 0, 0.7, 0.5, 0.4, 0, 1, 0, 19, AEOLIAN),
  saltflat: h(0, 0, 0.8, 0, 0, 0, 0, 0, 0.2, 24, PHRYGIAN),
  stones: h(0.1, 0, 0.5, 0.5, 0.5, 0.3, 0, 0, 0, 12, OPEN),
  ruins: h(0.3, 0.3, 0.7, 0.6, 0.5, 0.6, 0, 0, 0, 16, DORIAN),
  rail: h(0.4, 0.2, 0.5, 0.7, 0.6, 0.3, 0, 0, 1, 17, DORIAN),
  // Under stone: no trees, birds or crickets; a hollow wind, far water, music in the strange mode.
  deep: h(0, 0, 0.3, 0, 0, 0, 0, 0.6, 0, 8, PHRYGIAN),
};

/** What the page tells the sound, a few times a second. */
export type Hear = {
  readonly seed: number;
  /** Real seconds of animation (lightning is timed on this clock). */
  readonly time: number;
  readonly blend: Blend;
  /** The stretch he is in (birds belong to a place). */
  readonly place: number;
  /** The hour as shown (0..24) and the sun's elevation in degrees. */
  readonly hour: number;
  readonly sun: number;
  readonly weather: Weather;
  readonly stage: Stage;
  readonly walked: number;
  readonly ground: string;
  /** The fire's heat (0 when there is none), and where it and he are across the screen (0..1). */
  readonly fire: number;
  readonly fireX: number;
  readonly himX: number;
  /** A landmark near him (within 300 m), or null. */
  readonly landmark: string | null;
  /** The world runs this many times faster than real time. */
  readonly speed: number;
};

/** The mix state: everything the layers read. */
export type Mix = {
  time: number;
  /** Wind speed 0..1 with its gusts, now and as it reaches things further off (0.5, 0.9 and 3 s later). */
  wind: number;
  windLate: number;
  windLater: number;
  windLeaves: number;
  /** Blended layer weights (see Heard). */
  trees: number;
  leaves: number;
  whistle: number;
  crickets: number;
  birds: number;
  owls: number;
  surf: number;
  water: number;
  train: number;
  /** Rain 0..1, snow 0..1, fog 0..1, and a storm. */
  rain: number;
  snow: number;
  fog: number;
  storm: boolean;
  /** 1 at night (sun below −6°), the dawn chorus 0..1, daylight 0..1. */
  night: number;
  dawn: number;
  day: number;
  /** °C now. */
  temperature: number;
  hour: number;
  stage: Stage;
  sleeping: boolean;
  resting: boolean;
  fire: number;
  fireX: number;
  himX: number;
  mode: readonly number[];
  place: number;
  seed: number;
  landmark: string | null;
};

export function newMix(): Mix {
  return {
    time: 0,
    wind: 0,
    windLate: 0,
    windLater: 0,
    windLeaves: 0,
    trees: 0,
    leaves: 0,
    whistle: 0,
    crickets: 0,
    birds: 0,
    owls: 0,
    surf: 0,
    water: 0,
    train: 0,
    rain: 0,
    snow: 0,
    fog: 0,
    storm: false,
    night: 0,
    dawn: 0,
    day: 1,
    temperature: 15,
    hour: 12,
    stage: 'walk',
    sleeping: false,
    resting: false,
    fire: 0,
    fireX: 0.5,
    himX: 0.38,
    mode: AEOLIAN,
    place: 0,
    seed: 0,
    landmark: null,
  };
}

/**
 * Wind speed 0..1 at a real time, after Farnell's model (research: Sound §7): the weather's base, swelling over a
 * few minutes rather than on a fixed period, gusts from slow noise that grow with the base, and squalls above 0.4.
 */
export function windSpeed(base: number, t: number, seed: number): number {
  const swell = base * (0.8 + 0.35 * noise1(t / 170, seed ^ 0x77));
  const gust = (0.15 + 0.7 * base) * Math.max(0, fbm1(t * 0.32, seed ^ 0x5a, 3, 0.5)) * 0.9;
  const squall = base > 0.4 ? 3 * (base - 0.4) ** 2 * Math.max(0, fbm1(t * 1.4, seed ^ 0x3c, 2, 0.5)) : 0;
  const w = swell + gust + squall;
  return w < 0 ? 0 : w > 1 ? 1 : w;
}

const STILL: ReadonlySet<Stage> = new Set(['sit', 'sitdown', 'standup', 'stand', 'look', 'back', 'kneel', 'campsit', 'lie', 'sleep', 'wake', 'pack']);

/** Fills the mix from what the page heard. */
export function hear(m: Mix, s: Hear): void {
  const a = HEARD[s.blend.a];
  const b = HEARD[s.blend.b];
  const k = s.blend.k;
  const mixOf = (f: (x: Heard) => number): number => f(a) * (1 - k) + f(b) * k;
  m.time = s.time;
  m.seed = s.seed;
  m.place = s.place;
  m.trees = mixOf((x) => x.trees);
  m.leaves = mixOf((x) => x.leaves);
  m.whistle = mixOf((x) => x.whistle);
  m.crickets = mixOf((x) => x.crickets);
  m.birds = mixOf((x) => x.birds);
  m.owls = mixOf((x) => x.owls);
  m.surf = mixOf((x) => x.surf);
  m.water = mixOf((x) => x.water);
  // Trains heard and never seen belong to the rail line; one seen crossing brings its own sound.
  m.train = mixOf((x) => x.train);
  m.mode = k < 0.5 ? a.mode : b.mode;
  const w = s.weather;
  const base = 0.1 + 0.75 * Math.abs(w.wind);
  m.wind = windSpeed(base, s.time, s.seed);
  m.windLate = windSpeed(base, s.time - 0.5, s.seed);
  m.windLater = windSpeed(base, s.time - 0.9, s.seed);
  m.windLeaves = windSpeed(base, s.time - 3, s.seed);
  m.rain = w.kind === 'rain' ? w.precip : 0;
  m.snow = w.kind === 'snow' ? w.precip : 0;
  m.fog = w.fog;
  m.storm = w.storm;
  m.night = 1 - smoothstep(-8, -2, s.sun);
  m.day = smoothstep(-4, 6, s.sun);
  // The dawn chorus: strongest as the sun clears the horizon in the morning, a little at evening, sparse by day,
  // none at night (research: Sound §14).
  const rising = s.hour < 12;
  const chorus = Math.exp(-(((s.sun - 3) / 6) ** 2));
  m.dawn = Math.min(1, (rising ? chorus : 0.35 * chorus) + 0.15 * m.day) * smoothstep(-9, -3, s.sun);
  // Cooling after dusk, warmest mid-afternoon; rain and snow chill.
  const warmth = mixOf((x) => x.warmth);
  const diurnal = Math.cos(((s.hour - 15) / 24) * 2 * Math.PI);
  m.temperature = warmth + 5 * diurnal - 4 * m.rain - 6 * m.snow;
  m.hour = s.hour;
  m.stage = s.stage;
  m.sleeping = s.stage === 'sleep' || s.stage === 'lie';
  m.resting = STILL.has(s.stage);
  m.fire = s.fire;
  m.fireX = s.fireX;
  m.himX = s.himX;
  m.landmark = s.landmark;
}
