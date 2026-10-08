// The sky: two clocks, sunlight, rain and snow fronts, wind, clouds, gusts, water motion, the lantern.
import { DAY_LENGTH, DAY_START_HOUR, LANTERN_RADIUS, LIGHT_KEYS, WEATHER } from './config.ts';
import { fbm, hash2, makeNoise, rng } from './noise.ts';
import type { Noise2D } from './noise.ts';

/** Everything about the sky for one frame. */
export type Ambient = {
  readonly gameTime: number;
  readonly realTime: number;
  /** 0 ≤ hour < 24. */
  readonly hour: number;
  readonly phase: string;
  /** Sunlight multipliers per channel, already dimmed by any front. */
  readonly lightR: number;
  readonly lightG: number;
  readonly lightB: number;
  /** 0 at night … 1 at noon. */
  readonly daylight: number;
  /** Unit vector of where the wind blows to (x east, y south). */
  readonly windX: number;
  readonly windY: number;
  /** 0..1. */
  readonly windStrength: number;
  /** 0..1 strength of the current rain or snow front. */
  readonly front: number;
  /** 0..1 share of the sky covered by cloud. */
  readonly cloudCover: number;
};

export type Front = { readonly start: number; readonly end: number };
export type AtmosphereOptions = { readonly startHour?: number; readonly forceFront?: number };

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Hour of day (0 ≤ h < 24) at a game time; game time 0 is DAY_START_HOUR. */
export function hourAt(gameTime: number): number {
  const h = (DAY_START_HOUR + (24 * gameTime) / DAY_LENGTH) % 24;
  return h < 0 ? h + 24 : h;
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

/** The seeded schedule of rain and snow fronts, generated as far as anyone asks. */
export class Fronts {
  private readonly random: () => number;
  private readonly list: Front[] = [];
  private nextStart: number;

  constructor(seed: number) {
    this.random = rng(seed ^ 0xf00d);
    this.nextStart = WEATHER.firstFrontMin + this.random() * (WEATHER.firstFrontMax - WEATHER.firstFrontMin);
  }

  /** Every front that starts at or before game time t. */
  until(t: number): readonly Front[] {
    while (this.nextStart <= t) {
      const start = this.nextStart;
      const end = start + WEATHER.durationMin + this.random() * (WEATHER.durationMax - WEATHER.durationMin);
      this.list.push({ start, end });
      this.nextStart = end + WEATHER.gapMin + this.random() * (WEATHER.gapMax - WEATHER.gapMin);
    }
    return this.list;
  }

  /** 0..1 strength at game time t, fading in and out over WEATHER.fade seconds. */
  intensity(t: number): number {
    const list = this.until(t);
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      if (f.start <= t) return t < f.end ? clamp01(Math.min(t - f.start, f.end - t) / WEATHER.fade) : 0;
    }
    return 0;
  }
}

/**
 * Sky state that moves. Game time drives the clock, fronts, wind and clouds (T speeds it up);
 * real time drives waves, gusts and drops. Drift offsets are integrated in `step`, so a turning
 * wind never makes anything jump. Deterministic for a given seed and sequence of steps.
 */
export class Atmosphere {
  readonly seed: number;
  readonly fronts: Fronts;
  gameTime: number;
  realTime = 0;
  private cloudX = 0;
  private cloudY = 0;
  private gustX = 0;
  private gustY = 0;
  private readonly baseAngle: number;
  private readonly swellX: number;
  private readonly swellY: number;
  private readonly forcedFront: number | null;
  private readonly windNoise: Noise2D;
  private readonly coverNoise: Noise2D;
  private readonly cloudNoise: Noise2D;
  private readonly gustNoise: Noise2D;
  private readonly waveNoise: Noise2D;

  constructor(seed: number, options: AtmosphereOptions = {}) {
    this.seed = seed;
    this.fronts = new Fronts(seed);
    const startHour = options.startHour ?? DAY_START_HOUR;
    this.gameTime = ((((startHour - DAY_START_HOUR) % 24) + 24) % 24) * (DAY_LENGTH / 24);
    this.forcedFront = options.forceFront ?? null;
    this.baseAngle = rng(seed ^ 0xa11ce)() * Math.PI * 2;
    this.swellX = Math.cos(this.baseAngle);
    this.swellY = Math.sin(this.baseAngle);
    this.windNoise = makeNoise(seed ^ 0x3001);
    this.coverNoise = makeNoise(seed ^ 0x3002);
    this.cloudNoise = makeNoise(seed ^ 0x3003);
    this.gustNoise = makeNoise(seed ^ 0x3004);
    this.waveNoise = makeNoise(seed ^ 0x3005);
  }

  /** Advance both clocks by one step of real time; `timeScale` is TIME_LAPSE while T is held, else 1. */
  step(dtReal: number, timeScale: number): void {
    const dtGame = dtReal * timeScale;
    const w = this.wind(this.front());
    this.cloudX += w.x * w.strength * WEATHER.cloudSpeed * dtGame;
    this.cloudY += w.y * w.strength * WEATHER.cloudSpeed * dtGame;
    this.gustX += w.x * WEATHER.gustSpeed * dtReal;
    this.gustY += w.y * WEATHER.gustSpeed * dtReal;
    this.gameTime += dtGame;
    this.realTime += dtReal;
  }

  snapshot(): Ambient {
    const hour = hourAt(this.gameTime);
    const [r, g, b, daylight] = sunlight(hour);
    const front = this.front();
    const dim = 1 - WEATHER.dimming * front;
    const w = this.wind(front);
    return {
      gameTime: this.gameTime,
      realTime: this.realTime,
      hour,
      phase: phaseName(hour),
      lightR: r * dim,
      lightG: g * dim,
      lightB: b * dim,
      daylight,
      windX: w.x,
      windY: w.y,
      windStrength: w.strength,
      front,
      cloudCover: clamp01(0.3 + 0.35 * this.coverNoise(this.gameTime / 240, 3.7) + 0.6 * front),
    };
  }

  /** Cloud density 0..1 at a world position, for a given cover. */
  cloud(x: number, y: number, cover: number): number {
    const v = fbm(this.cloudNoise, (x - this.cloudX) / WEATHER.cloudWavelength, (y - this.cloudY) / WEATHER.cloudWavelength, 3);
    const edge = 0.35 - 0.7 * cover;
    return smoothstep(edge - 0.1, edge + 0.1, v);
  }

  /** Gust strength 0..1 at a world position. */
  gust(x: number, y: number): number {
    const v = this.gustNoise((x - this.gustX) / WEATHER.gustWavelength, (y - this.gustY) / WEATHER.gustWavelength);
    return smoothstep(0.2, 0.6, v);
  }

  /** Open-water surface -1..1: a swell rolling along the prevailing wind, plus chop drifting with the gusts. */
  seaWave(x: number, y: number): number {
    const along = x * this.swellX + y * this.swellY;
    const swell = Math.sin(along / 7 - this.realTime * 1.4 + 2.2 * this.waveNoise(x / 40, y / 40));
    const chop = this.waveNoise((x - this.gustX * 0.3) / 9, (y - this.gustY * 0.3) / 9);
    return 0.6 * swell + 0.4 * chop;
  }

  /** Lake surface -1..1: slow, gentle ripples. */
  lakeRipple(x: number, y: number): number {
    return this.waveNoise(x / 12 + this.realTime * 0.15, y / 12 - 31.7);
  }

  private front(): number {
    return this.forcedFront ?? this.fronts.intensity(this.gameTime);
  }

  /** Wind direction wanders around a seeded prevailing angle; fronts make it stronger. */
  private wind(front: number): { x: number; y: number; strength: number } {
    const t = this.gameTime;
    const angle = this.baseAngle + 1.2 * this.windNoise(t / WEATHER.windPeriod, 0.5);
    const strength = clamp01(0.55 + 0.45 * this.windNoise(t / (WEATHER.windPeriod * 0.7), 7.5) + 0.3 * front);
    return { x: Math.cos(angle), y: Math.sin(angle), strength };
  }
}

/** Lantern light 0..1 at an offset (world units) from your exact position; fades in as daylight fades. */
export function lanternLight(dx: number, dy: number, amb: Ambient): number {
  const night = 1 - amb.daylight;
  if (night <= 0) return 0;
  const d = Math.sqrt(dx * dx + dy * dy) / LANTERN_RADIUS;
  if (d >= 1) return 0;
  const flicker = 1 + 0.06 * Math.sin(amb.realTime * 13) * Math.sin(amb.realTime * 7.3 + 1);
  return (1 - d) * (1 - d) * night * flicker;
}

const STAR = 0x2a;
const MIDDOT = 0xb7;
const PIPE = 0x7c;
const SLASH = 0x2f;
const BACKSLASH = 0x5c;

/** Code point of a rain or snow drop at map cell (mx, my) right now, or 0 for none. */
export function dropAt(mx: number, my: number, amb: Ambient, cold: boolean, seed: number): number {
  if (amb.front <= 0) return 0;
  const slot = Math.floor(amb.realTime * (cold ? WEATHER.snowRate : WEATHER.rainRate));
  const h = hash2(mx * 31 + slot * 7919, my * 17 - slot * 104729, seed ^ 0x5eed);
  if (h / 4294967296 >= WEATHER.dropChance * amb.front) return 0;
  if (cold) return (h & 1) === 1 ? STAR : MIDDOT;
  if (Math.abs(amb.windX) < 0.38) return PIPE;
  return amb.windX * amb.windY > 0 ? BACKSLASH : SLASH; // y grows downwards on screen
}

const ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];

/** Arrow pointing where the wind blows to; y grows southwards (down the screen). */
export function windArrow(x: number, y: number): string {
  const i = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  return ARROWS[((i % 8) + 8) % 8];
}

export function weatherName(amb: Ambient, cold: boolean): string {
  if (amb.front > 0.05) return cold ? 'Snow' : 'Rain';
  return amb.cloudCover > 0.6 ? 'Cloudy' : 'Clear';
}
