// The creature's sky: real local time (its clock is yours), the season and the moon of the date, the weather in its
// biome's slots, the wind. From the terminal creature (feat/creature src/sky.ts) without its colours: the light now
// comes from the wanderer's grading with the natural sun. The weather is in the wanderer's own shape, so the
// renderer, the sound and the lightning read it as they read his. Pure.
import { BIOMES, DAYLIGHT_KEYS, WEATHER } from './config.ts';
import type { PlaceName } from './config.ts';
import { hash2, makeNoise } from '../noise.ts';
import type { Noise2D } from '../noise.ts';
import { localHour, moonPhase, seasonOf, smoothstep } from '../sky.ts';
import type { Precip, Season, Weather, WeatherName } from '../sky.ts';

export { localHour, moonPhase, seasonOf };
export type { Season, Weather };

/** Everything about the sky at one moment. */
export type Sky = {
  /** 0 ≤ hour < 24, local time. */
  readonly hour: number;
  readonly phase: string;
  /** 0 at night … 1 at noon. */
  readonly daylight: number;
  readonly season: Season;
  /** 0 new moon … 0.5 full … 1 new again. */
  readonly moon: number;
  readonly weather: Weather;
  /** 0..1: how wet everything still is from rain, now or in the last half hour. */
  readonly wet: number;
};

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export function phaseName(hour: number): string {
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

/** Daylight at an hour, 0 at night … 1 at noon (what its days are made of: when it sleeps, what comes out). */
export function daylightAt(hour: number): number {
  for (let i = 1; i < DAYLIGHT_KEYS.length; i++) {
    const [h1, d1] = DAYLIGHT_KEYS[i];
    if (hour <= h1) {
      const [h0, d0] = DAYLIGHT_KEYS[i - 1];
      return lerp(d0, d1, (hour - h0) / (h1 - h0));
    }
  }
  return 0;
}

type Slot = { cloud: number; precip: number; storm: boolean };

function slotWeather(slot: number, seed: number, biome: PlaceName, season: Season): Slot {
  const u = (k: number): number => hash2(slot, k, seed ^ 0x3a7e) / 4294967296;
  const chance = BIOMES[biome].rain * (season === 'winter' || season === 'autumn' ? 1.25 : 1);
  if (u(1) < chance) {
    return { cloud: 0.75 + 0.25 * u(3), precip: 0.4 + 0.6 * u(2), storm: !BIOMES[biome].cold && u(4) < WEATHER.storms };
  }
  return { cloud: Math.pow(u(3), 1.4) * 0.75, precip: 0, storm: false };
}

/** Whether rain falls as snow here and now. */
export function snows(biome: PlaceName, season: Season): boolean {
  return BIOMES[biome].cold || season === 'winter';
}

const windNoise = new Map<number, Noise2D>();

/** Wind −1..1, drifting over tens of minutes; storms blow harder. */
function windAt(ms: number, seed: number, storm: boolean, precip: number): number {
  let noise = windNoise.get(seed);
  if (noise === undefined) {
    noise = makeNoise(seed ^ 0x77d);
    windNoise.set(seed, noise);
  }
  const w = noise(ms / (40 * 60000), 0.5) * 0.8;
  return Math.max(-1, Math.min(1, w * (storm ? 1.6 : 1 + precip * 0.4)));
}

/** The weather at a world time: slots of WEATHER.slotMinutes, fading into the next. Pure. */
export function weatherAt(ms: number, seed: number, biome: PlaceName): Weather {
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
  // Under the canopy, and in the hollow under the world, a little mist always hangs; rain thickens it everywhere.
  const fog = Math.min(0.9, (BIOMES[biome].canopy || biome === 'deep' ? 0.12 : 0) + precip * 0.2);
  const name: WeatherName = storm ? 'storm' : kind === 'snow' ? 'snow' : kind === 'rain' ? 'rain' : cloud > 0.6 ? 'overcast' : cloud > 0.3 ? 'cloudy' : 'clear';
  return { cloud, precip: kind === 'none' ? 0 : precip, kind, storm, fog, wind: windAt(ms, seed, storm, precip), name };
}

/** The weather in its own words: "partly cloudy" rather than "cloudy". */
export function weatherWords(w: Weather): string {
  if (w.storm) return 'a storm';
  if (w.kind === 'snow') return 'snow';
  if (w.kind === 'rain') return 'rain';
  if (w.cloud > 0.6) return 'cloudy';
  if (w.cloud > 0.3) return 'partly cloudy';
  return 'clear';
}

/** The sky at a world time for a creature's seed and biome. Pure. */
export function skyAt(ms: number, seed: number, biome: PlaceName): Sky {
  const hour = localHour(ms);
  const weather = weatherAt(ms, seed, biome);
  const wet = Math.max(weather.precip, weatherAt(ms - 15 * 60000, seed, biome).precip * 0.75, weatherAt(ms - 30 * 60000, seed, biome).precip * 0.45);
  return { hour, phase: phaseName(hour), daylight: daylightAt(hour), season: seasonOf(ms), moon: moonPhase(ms), weather, wet };
}
