// The sky over the scene, from the world clock: hour, light, colours, moon, season, weather and wind. All pure.
import { BIOMES, LIGHT_KEYS, SKY_KEYS, WEATHER } from './config.ts';
import type { BiomeName } from './config.ts';
import { mix, scale } from './color.ts';
import { hash2, makeNoise } from './noise.ts';
import type { Noise2D } from './noise.ts';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Precip = 'none' | 'rain' | 'snow';

export type Weather = {
  /** 0..1 share of the sky under cloud. */
  readonly cloud: number;
  /** 0..1 strength of rain or snow. */
  readonly precip: number;
  readonly kind: Precip;
  readonly storm: boolean;
  readonly name: string;
};

/** Everything about the sky at one moment. */
export type Sky = {
  /** 0 ≤ hour < 24, local time. */
  readonly hour: number;
  readonly phase: string;
  /** 0 at night … 1 at noon. */
  readonly daylight: number;
  /** Light multipliers per channel, already dimmed by weather. */
  readonly lightR: number;
  readonly lightG: number;
  readonly lightB: number;
  readonly zenith: number;
  readonly horizon: number;
  readonly season: Season;
  /** 0 new moon … 0.5 full … 1 new again. */
  readonly moon: number;
  readonly weather: Weather;
  /** −1..1: which way and how hard the wind blows (positive is to the right). */
  readonly wind: number;
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Local hour of the day, 0 ≤ h < 24. */
export function localHour(ms: number): number {
  const d = new Date(ms);
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
}

/** Northern-hemisphere season of a date. */
export function seasonOf(ms: number): Season {
  const month = new Date(ms).getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

const SYNODIC_DAYS = 29.530588853;
const NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14);

/** Moon phase at a time: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter. */
export function moonPhase(ms: number): number {
  const cycles = (ms - NEW_MOON_2000) / 86400000 / SYNODIC_DAYS;
  return ((cycles % 1) + 1) % 1;
}

export function phaseName(hour: number): string {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/** Sunlight [red, green, blue, daylight] at an hour, interpolated between LIGHT_KEYS. */
export function sunlight(hour: number): [number, number, number, number] {
  for (let i = 1; i < LIGHT_KEYS.length; i++) {
    const b = LIGHT_KEYS[i];
    if (hour <= b[0]) {
      const a = LIGHT_KEYS[i - 1];
      const k = (hour - a[0]) / (b[0] - a[0]);
      return [lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k), lerp(a[4], b[4], k)];
    }
  }
  const last = LIGHT_KEYS[LIGHT_KEYS.length - 1];
  return [last[1], last[2], last[3], last[4]];
}

/** Clear-sky [zenith, horizon] colours at an hour. */
export function skyColors(hour: number): [number, number] {
  for (let i = 1; i < SKY_KEYS.length; i++) {
    const b = SKY_KEYS[i];
    if (hour <= b[0]) {
      const a = SKY_KEYS[i - 1];
      const k = (hour - a[0]) / (b[0] - a[0]);
      return [mix(a[1], b[1], k), mix(a[2], b[2], k)];
    }
  }
  const last = SKY_KEYS[SKY_KEYS.length - 1];
  return [last[1], last[2]];
}

type Slot = { cloud: number; precip: number; storm: boolean };

function slotWeather(slot: number, seed: number, biome: BiomeName, season: Season): Slot {
  const u = (k: number): number => hash2(slot, k, seed ^ 0x3a7e) / 4294967296;
  const chance = BIOMES[biome].rain * (season === 'winter' || season === 'autumn' ? 1.25 : 1);
  if (u(1) < chance) {
    return { cloud: 0.75 + 0.25 * u(3), precip: 0.4 + 0.6 * u(2), storm: !BIOMES[biome].cold && u(4) < WEATHER.storms };
  }
  return { cloud: Math.pow(u(3), 1.4) * 0.75, precip: 0, storm: false };
}

/** Whether rain falls as snow here and now. */
export function snows(biome: BiomeName, season: Season): boolean {
  return BIOMES[biome].cold || (season === 'winter' && biome !== 'desert' && biome !== 'shore');
}

/** The weather at a world time: slots of WEATHER.slotMinutes, fading into the next slot. Pure. */
export function weatherAt(ms: number, seed: number, biome: BiomeName): Weather {
  const slotMs = WEATHER.slotMinutes * 60000;
  const slot = Math.floor(ms / slotMs);
  const f = (ms - slot * slotMs) / slotMs;
  const season = seasonOf(ms);
  const a = slotWeather(slot, seed, biome, season);
  const b = slotWeather(slot + 1, seed, biome, season);
  const k = smoothstep(1 - WEATHER.fadeMinutes / WEATHER.slotMinutes, 1, f);
  const cloud = lerp(a.cloud, b.cloud, k);
  const precip = lerp(a.precip, b.precip, k);
  const storm = precip > 0.3 && (k < 0.5 ? a.storm : b.storm);
  const kind: Precip = precip <= 0.02 ? 'none' : snows(biome, season) ? 'snow' : 'rain';
  let name: string;
  if (storm) name = 'Storm';
  else if (kind === 'snow') name = 'Snow';
  else if (kind === 'rain') name = 'Rain';
  else if (cloud > 0.6) name = 'Cloudy';
  else if (cloud > 0.3) name = 'Partly cloudy';
  else name = 'Clear';
  return { cloud, precip: kind === 'none' ? 0 : precip, kind, storm, name };
}

const windNoise = new Map<number, Noise2D>();

/** Wind −1..1, drifting over tens of minutes; storms blow harder. */
export function windAt(ms: number, seed: number, weather: Weather): number {
  let noise = windNoise.get(seed);
  if (noise === undefined) {
    noise = makeNoise(seed ^ 0x77d);
    windNoise.set(seed, noise);
  }
  const w = noise(ms / (40 * 60000), 0.5) * 0.8;
  return Math.max(-1, Math.min(1, w * (weather.storm ? 1.6 : 1 + weather.precip * 0.4)));
}

/** The sky at a world time for a creature's seed and biome. Pure. */
export function skyAt(ms: number, seed: number, biome: BiomeName): Sky {
  const hour = localHour(ms);
  const [r, g, b, daylight] = sunlight(hour);
  const weather = weatherAt(ms, seed, biome);
  const dim = 1 - WEATHER.dimming * weather.precip - 0.12 * weather.cloud;
  let [zenith, horizon] = skyColors(hour);
  const grey = scale(weather.storm ? 0x5a626e : 0x8a929c, 0.2 + 0.8 * daylight);
  const overcast = weather.cloud * 0.75 + weather.precip * 0.25;
  zenith = mix(zenith, grey, overcast);
  horizon = mix(horizon, grey, overcast * 0.8);
  return {
    hour,
    phase: phaseName(hour),
    daylight,
    lightR: r * dim,
    lightG: g * dim,
    lightB: b * dim,
    zenith,
    horizon,
    season: seasonOf(ms),
    moon: moonPhase(ms),
    weather,
    wind: windAt(ms, seed, weather),
  };
}

/** Where the sun is: across the sky from 6:00 to 19:30. x 0..1 left to right, y 0..1 up from the horizon. */
export function sunPosition(hour: number): { x: number; y: number } | null {
  const t = (hour - 6) / 13.5;
  if (t <= 0 || t >= 1) return null;
  return { x: 0.06 + 0.88 * t, y: Math.sin(Math.PI * t) };
}

/** Where the moon is: across the sky from 18:30 to 7:00. */
export function moonPosition(hour: number): { x: number; y: number } | null {
  const h = hour < 12 ? hour + 24 : hour;
  const t = (h - 18.5) / 12.5;
  if (t <= 0 || t >= 1) return null;
  return { x: 0.06 + 0.88 * t, y: Math.sin(Math.PI * t) };
}

/** The moon's glyph for a phase; the filled part is lit. */
export function moonGlyph(phase: number): string {
  const i = Math.round(phase * 8) % 8;
  return ['○', ')', '◑', '●', '●', '●', '◐', '('][i];
}

/** True during a lightning flash, from real time; only in storms. */
export function flashAt(realSec: number, seed: number, weather: Weather): boolean {
  if (!weather.storm) return false;
  const window = Math.floor(realSec / 6);
  const h = hash2(window, 7, seed ^ 0xf1a5);
  if (h / 4294967296 > 0.45) return false;
  const at = ((h >>> 8) & 1023) / 1024; // when in the window
  const f = realSec / 6 - window;
  return (f > at && f < at + 0.02) || (f > at + 0.05 && f < at + 0.065);
}
