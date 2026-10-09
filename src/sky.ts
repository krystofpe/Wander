// The sky as numbers: the hour, the sun and the moon, the season, the weather and the wind. All pure functions of
// the world clock (in hours since the road began) and the seed, so a restart shows the same sky.
import { hash2, makeNoise } from './noise.ts';
import type { Noise2D } from './noise.ts';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Precip = 'none' | 'rain' | 'snow';
export type WeatherName = 'clear' | 'cloudy' | 'overcast' | 'fog' | 'rain' | 'snow' | 'storm';
export type DayPhase = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'golden' | 'dusk' | 'blue' | 'night' | 'late';

/** How a place leans: chances per weather slot (0..1), blended from the biomes around him. */
export type Tendency = {
  /** Share of slots with rain or snow. */
  readonly wet: number;
  /** Share of wet slots that fall as snow. */
  readonly snow: number;
  /** Share of dry slots with fog (doubled around dawn). */
  readonly fog: number;
  /** Share of rain slots that are storms. */
  readonly storm: number;
  /** How cloudy a dry sky tends to be, 0..1. */
  readonly cloud: number;
  /** How windy, 0..1. */
  readonly wind: number;
};

export type Weather = {
  /** 0..1 share of the sky under cloud. */
  readonly cloud: number;
  /** 0..1 strength of rain or snow. */
  readonly precip: number;
  readonly kind: Precip;
  readonly storm: boolean;
  /** 0..1 thickness of ground fog. */
  readonly fog: number;
  /** −1..1: which way and how hard the wind blows (positive is to the right). */
  readonly wind: number;
  readonly name: WeatherName;
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Hour of the day, 0 ≤ h < 24, from world hours. */
export function hourOfDay(worldHours: number): number {
  return ((worldHours % 24) + 24) % 24;
}

/** Day on the road, from 1. */
export function dayOf(worldHours: number): number {
  return Math.floor(worldHours / 24) + 1;
}

/** Local hour of the day for a real time. */
export function localHour(ms: number): number {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 + d.getMilliseconds() / 3600000;
}

/** Northern-hemisphere season of a date. */
export function seasonOf(ms: number): Season {
  const month = new Date(ms).getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

/** Highest the sun climbs, in degrees. */
const NOON_ELEVATION = 52;

/**
 * The sun's natural elevation in degrees at a local hour: rising at 6, setting at 18, lingering near the
 * horizon as s·|s|. Used by the real-clock mode, whose day is long enough for twilight to last.
 */
export function naturalElevation(hour: number): number {
  const s = Math.sin((2 * Math.PI * (hour - 6)) / 24);
  return NOON_ELEVATION * s * Math.abs(s);
}

/**
 * The warped day: [clock hour, elevation] keys, linear between. A one-hour day spends 17 real minutes in
 * night, 4 in dawn twilight, 2 in the morning blue hour, 4 in the morning golden hour, 18 in day, 6 in the
 * evening golden hour, 4 in the evening blue hour and 5 in dusk twilight (docs/research/wanderer-research.md,
 * "Light and time of day" 1): the beautiful hours last long enough to be seen, the evening longest.
 */
const WARP: readonly (readonly [number, number])[] = [
  [0, -52],
  [3.4, -18],
  [5.0, -6],
  [5.8, -4],
  [7.4, 6],
  [11.0, NOON_ELEVATION],
  [14.6, 6],
  [17.0, -4],
  [18.6, -8],
  [20.6, -18],
  [24, -52],
];

/** The sun's elevation in degrees at a clock hour of the warped day. */
export function sunElevation(hour: number, natural = false): number {
  const h = ((hour % 24) + 24) % 24;
  if (natural) return naturalElevation(h);
  for (let i = 1; i < WARP.length; i++) {
    const [h1, e1] = WARP[i];
    if (h <= h1) {
      const [h0, e0] = WARP[i - 1];
      return e0 + ((e1 - e0) * (h - h0)) / (h1 - h0);
    }
  }
  return WARP[WARP.length - 1][1];
}

/** The hour a clock would show for this light: where the natural sun has the same elevation, morning or evening. */
export function shownHour(hour: number, natural = false): number {
  const h = ((hour % 24) + 24) % 24;
  if (natural) return h;
  const e = sunElevation(h);
  // The warped sun climbs until 11 and the natural one until 12: invert the natural curve on the same side.
  const rising = h < 11;
  let lo = rising ? 0 : 12;
  let hi = rising ? 12 : 24;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const m = naturalElevation(mid);
    if (rising ? m < e : m > e) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The moon follows the sun by its phase: new rises with the sun, full rises as it sets. */
export function moonElevation(hour: number, phase: number, natural = false): number {
  return naturalElevation(shownHour(hour, natural) - phase * 24);
}

/** Where a body is across the sky: x 0..1 from where it rises (left) to where it sets (right). */
export function arcX(hour: number): number {
  const h = (((hour - 6) % 24) + 24) % 24;
  return h / 12;
}

/** The sun's place: x 0..1 across the sky (left to right), elevation in degrees; x outside 0..1 at night. */
export function sunAt(hour: number, natural = false): { x: number; elevation: number } {
  return { x: arcX(shownHour(hour, natural)), elevation: sunElevation(hour, natural) };
}

export function moonAt(hour: number, phase: number, natural = false): { x: number; elevation: number } {
  return { x: arcX(shownHour(hour, natural) - phase * 24), elevation: moonElevation(hour, phase, natural) };
}

const SYNODIC_DAYS = 29.530588853;
const NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14);

/** Moon phase at a real time: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(ms: number): number {
  const cycles = (ms - NEW_MOON_2000) / 86400000 / SYNODIC_DAYS;
  return ((cycles % 1) + 1) % 1;
}

/** The moon on the road: it starts at `startPhase` and turns once every 29.5 world days. */
export function roadMoon(worldHours: number, startPhase: number): number {
  return (((startPhase + worldHours / 24 / SYNODIC_DAYS) % 1) + 1) % 1;
}

/**
 * The part of the day, from the sun: golden hour is +10°..0° in the evening, dusk 0°..−4°, blue hour
 * −4°..−12° (all of it is dawn in the morning, until +8°), night below −12°; the small hours are "late".
 */
export function dayPhase(hour: number, natural = false): DayPhase {
  const e = sunElevation(hour, natural);
  const shown = shownHour(hour, natural);
  const morning = shown < 12;
  if (e < -12) return morning ? 'late' : 'night';
  if (morning) {
    if (e < 8) return 'dawn';
    return shown < 10.5 ? 'morning' : 'noon';
  }
  if (e < -4) return 'blue';
  if (e < 0) return 'dusk';
  if (e < 10) return 'golden';
  return shown < 14 ? 'noon' : 'afternoon';
}

/** 0 at night … 1 in full day, from the sun's elevation. */
export function daylight(hour: number, natural = false): number {
  return smoothstep(-8, 12, sunElevation(hour, natural));
}

/** World hours per weather slot, and how long a change takes. */
export const WEATHER_SLOT_HOURS = 3;
export const WEATHER_FADE_HOURS = 1;

type Slot = { cloud: number; precip: number; snow: boolean; storm: boolean; fog: number };

function slotWeather(slot: number, seed: number, t: Tendency): Slot {
  const u = (k: number): number => hash2(slot, k, seed ^ 0x3a7e) / 4294967296;
  // The hour the slot starts: fog gathers around dawn.
  const hour = hourOfDay(slot * WEATHER_SLOT_HOURS);
  const dawn = hour >= 3 && hour <= 9 ? 2 : 1;
  if (u(1) < t.wet) {
    const snow = u(5) < t.snow;
    return { cloud: 0.8 + 0.2 * u(3), precip: 0.35 + 0.65 * u(2), snow, storm: !snow && u(4) < t.storm, fog: 0.15 * u(6) };
  }
  const cloud = clamp01(Math.pow(u(3), 1.3) * (0.4 + 0.8 * t.cloud));
  const fog = u(6) < t.fog * dawn ? 0.55 + 0.45 * u(7) : 0;
  return { cloud, precip: 0, snow: false, storm: false, fog };
}

const windNoise = new Map<number, Noise2D>();

/** The wind: drifting over hours, stronger in storms (`storminess` 0..1) and in windy places. −1..1. */
export function windAt(worldHours: number, seed: number, strength: number, storminess: number): number {
  let noise = windNoise.get(seed);
  if (noise === undefined) {
    noise = makeNoise(seed ^ 0x77d);
    windNoise.set(seed, noise);
  }
  const w = noise(worldHours / 9, 0.5) * (0.35 + 0.65 * strength) + noise(worldHours * 1.7, 3.5) * 0.15;
  return Math.max(-1, Math.min(1, w * (1.15 + 0.65 * storminess)));
}

function nameOf(cloud: number, precip: number, kind: Precip, storm: boolean, fog: number): WeatherName {
  if (storm) return 'storm';
  if (kind === 'snow') return 'snow';
  if (kind === 'rain') return 'rain';
  if (fog > 0.45) return 'fog';
  if (cloud > 0.7) return 'overcast';
  if (cloud > 0.35) return 'cloudy';
  return 'clear';
}

/** The weather at a world time for a place's tendency: slots that fade into the next. Pure. */
export function weatherAt(worldHours: number, seed: number, t: Tendency): Weather {
  const slot = Math.floor(worldHours / WEATHER_SLOT_HOURS);
  const f = worldHours / WEATHER_SLOT_HOURS - slot;
  const a = slotWeather(slot, seed, t);
  const b = slotWeather(slot + 1, seed, t);
  const k = smoothstep(1 - WEATHER_FADE_HOURS / WEATHER_SLOT_HOURS, 1, f);
  const cloud = lerp(a.cloud, b.cloud, k);
  const precip = lerp(a.precip, b.precip, k);
  const snow = k < 0.5 ? a.snow : b.snow;
  const storm = precip > 0.3 && (k < 0.5 ? a.storm : b.storm);
  const fog = lerp(a.fog, b.fog, k);
  const kind: Precip = precip <= 0.03 ? 'none' : snow ? 'snow' : 'rain';
  const wind = windAt(worldHours, seed, t.wind, lerp(a.storm ? 1 : 0, b.storm ? 1 : 0, k));
  return { cloud, precip: kind === 'none' ? 0 : precip, kind, storm, fog, wind, name: nameOf(cloud, precip, kind, storm, fog) };
}

/** Weather fixed by name, for the frozen mode and the tour. `wind` is also accepted: clear and blowing. */
export function namedWeather(name: string, windSign = 1): Weather | null {
  const w = (cloud: number, precip: number, kind: Precip, storm: boolean, fog: number, wind: number, n: WeatherName): Weather => ({
    cloud,
    precip,
    kind,
    storm,
    fog,
    wind: wind * windSign,
    name: n,
  });
  switch (name) {
    case 'clear':
      return w(0.08, 0, 'none', false, 0, 0.15, 'clear');
    case 'cloudy':
      return w(0.5, 0, 'none', false, 0, 0.3, 'cloudy');
    case 'overcast':
      return w(0.9, 0, 'none', false, 0.1, 0.25, 'overcast');
    case 'fog':
      return w(0.6, 0, 'none', false, 0.9, 0.05, 'fog');
    case 'rain':
      return w(0.95, 0.7, 'rain', false, 0.15, 0.4, 'rain');
    case 'snow':
      return w(0.9, 0.6, 'snow', false, 0.1, 0.3, 'snow');
    case 'storm':
      return w(1, 0.95, 'rain', true, 0.1, 0.85, 'storm');
    case 'wind':
      return w(0.3, 0, 'none', false, 0, 0.95, 'clear');
    default:
      return null;
  }
}

/** True during a lightning flash (two quick flickers), from real seconds; only in storms. */
export function flashAt(realSec: number, seed: number, weather: Weather): boolean {
  if (!weather.storm) return false;
  const window = Math.floor(realSec / 7);
  const h = hash2(window, 7, seed ^ 0xf1a5);
  if (h / 4294967296 > 0.4) return false;
  const at = ((h >>> 8) & 1023) / 1024;
  const f = realSec / 7 - window;
  return (f > at && f < at + 0.012) || (f > at + 0.03 && f < at + 0.04);
}
