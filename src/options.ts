// Options, from the URL in the page and from the command line on the server: the same names in both places
// (`npm start -- --seed moss --speed 20` opens `?seed=moss&speed=20`).
import { ROAD_BIOMES } from './biomes.ts';
import type { BiomeId } from './biomes.ts';

export type Options = {
  /** A road from this seed (any word), or null for the saved road or a new random one. */
  readonly seed: string | null;
  /** Start a new road. */
  readonly fresh: boolean;
  /** Everything runs this many times faster. */
  readonly speed: number;
  /** Real minutes per world day. */
  readonly day: number;
  /** Follow the local time of day with the natural sun. */
  readonly realClock: boolean;
  /** Start at this hour of the day. */
  readonly hour: number | null;
  /** Start in a stretch of this biome. */
  readonly biome: BiomeId | null;
  readonly offline: boolean;
  /** Time stopped at a fixed distance, hour and weather, for screenshots. */
  readonly frozen: boolean;
  /** Distance along the road, metres (frozen shots). */
  readonly at: number | null;
  readonly weather: string | null;
  /** A pose to hold (frozen shots): walk, look, back, sit, smoke, fire, lie, sleep. */
  readonly pose: string | null;
  /** An exact canvas size in device pixels instead of the window's. */
  readonly size: { readonly w: number; readonly h: number } | null;
  /** Run the in-page bench for this many seconds. */
  readonly bench: number | null;
  /** Start with the sound off. */
  readonly mute: boolean;
  /** The walk-cycle frame or animation time to show in a frozen shot, seconds. */
  readonly t: number | null;
  /** No frame loop: a tool advances the world step by step (motion capture). */
  readonly manual: boolean;
  /** The live road (live.ts): the one wanderer everyone sees, his life a function of the real clock. */
  readonly live: boolean;
  /** On the live road, the moment to show instead of now (ms since 1970, or a date), for pictures and tests. */
  readonly now: number | null;
};

export const DEFAULTS: Options = {
  seed: null,
  fresh: false,
  speed: 1,
  day: 60,
  realClock: false,
  hour: null,
  biome: null,
  offline: false,
  frozen: false,
  at: null,
  weather: null,
  pose: null,
  size: null,
  bench: null,
  mute: false,
  t: null,
  manual: false,
  live: false,
  now: null,
};

/** Option names and whether each takes a value; the command line and the URL share them. */
export const OPTION_NAMES: Readonly<Record<string, boolean>> = {
  seed: true,
  new: false,
  speed: true,
  day: true,
  realclock: false,
  hour: true,
  biome: true,
  offline: false,
  frozen: false,
  at: true,
  weather: true,
  pose: true,
  size: true,
  bench: true,
  mute: false,
  t: true,
  manual: false,
  live: false,
  now: true,
};

const num = (v: string | null, min: number, max: number): number | null => {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

const flag = (v: string | null): boolean => v !== null && v !== '0' && v !== 'false' && v !== 'no';

/** A moment: milliseconds since 1970, or anything Date can read ("2026-10-11T18:20Z"). */
const moment = (v: string | null): number | null => {
  if (v === null || v.trim() === '') return null;
  const ms = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

/** Options from a lookup of raw values (URLSearchParams.get, or parsed argv). Unknown or bad values fall back. */
export function parseOptions(get: (name: string) => string | null): Options {
  const size = get('size')?.match(/^(\d{2,5})x(\d{2,5})$/);
  const biome = get('biome');
  return {
    seed: get('seed') !== null && get('seed') !== '' ? get('seed') : null,
    fresh: flag(get('new')),
    speed: num(get('speed'), 0.01, 10000) ?? DEFAULTS.speed,
    day: num(get('day'), 1, 24 * 60 * 7) ?? DEFAULTS.day,
    realClock: flag(get('realclock')),
    hour: num(get('hour'), 0, 23.999),
    biome: biome !== null && (ROAD_BIOMES as readonly string[]).includes(biome) ? (biome as BiomeId) : null,
    offline: flag(get('offline')),
    frozen: flag(get('frozen')),
    at: num(get('at'), -1e12, 1e12),
    weather: get('weather'),
    pose: get('pose'),
    size: size ? { w: Number(size[1]), h: Number(size[2]) } : null,
    bench: num(get('bench'), 1, 3600),
    mute: flag(get('mute')),
    t: num(get('t'), 0, 1e9),
    manual: flag(get('manual')),
    live: flag(get('live')),
    now: moment(get('now')),
  };
}

/** Command-line arguments (`--seed moss --speed 20 --frozen`) as URL query parameters; throws on unknown names. */
export function argvToQuery(argv: readonly string[]): URLSearchParams {
  const q = new URLSearchParams();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
    const [name, inline] = a.slice(2).split('=', 2);
    const takes = OPTION_NAMES[name];
    if (takes === undefined) throw new Error(`unknown option --${name}`);
    if (!takes) q.set(name, '1');
    else if (inline !== undefined) q.set(name, inline);
    else {
      const v = argv[++i];
      if (v === undefined) throw new Error(`--${name} needs a value`);
      q.set(name, v);
    }
  }
  return q;
}

/** A road's numeric seed from a word: digits are taken as they are, anything else is hashed (FNV-1a). */
export function seedOf(word: string): number {
  if (/^\d{1,9}$/.test(word)) return Number(word) >>> 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
