// The creature's options, on the command line (`npm run creature -- --biome tundra --name Ori`) and as URL parameters
// of its page (`/creature?biome=tundra&name=Ori`): the same names in both places, as for the wanderer.
import { BIOME_NAMES } from './config.ts';
import type { BiomeName } from './config.ts';
import { prettyName } from './life.ts';

export type CreatureOptions = {
  /** For a new creature: a seed word (any text), or null for a random one. */
  readonly seed: string | null;
  /** For a new creature its biome; an old one moves there. */
  readonly biome: BiomeName | null;
  readonly name: string | null;
  /** How much faster than real time its world runs (not saved unless 1). */
  readonly speed: number;
  /** Start at this hour of today instead of now (not saved). */
  readonly hour: number | null;
  readonly offline: boolean;
  readonly mute: boolean;
  /** An exact canvas size in device pixels (tools). */
  readonly size: { readonly w: number; readonly h: number } | null;
  /** A fixed weather, by the wanderer's names ("rain", "overcast@0.8"), for pictures. */
  readonly weather: string | null;
  /** No frame loop: a tool steps it (pictures, checks). */
  readonly manual: boolean;
  /** Something for it to do at once (pictures): an activity or reaction by name. */
  readonly act: string | null;
  /** The in-page bench, for this many seconds. */
  readonly bench: number | null;
  /** The moment to begin at instead of now (ms since 1970, or a date), for pictures; with --hour, that day's hour. */
  readonly now: number | null;
  /** A new creature that already knows you by this name: no first meeting (pictures, checks). */
  readonly user: string | null;
};

/** Option names and whether each takes a value. */
const NAMES: Readonly<Record<string, boolean>> = {
  seed: true,
  biome: true,
  name: true,
  speed: true,
  hour: true,
  offline: false,
  new: false,
  mute: false,
  size: true,
  weather: true,
  manual: false,
  act: true,
  bench: true,
  now: true,
  user: true,
  /** The traveller put at its door for a look: sit, or metres past its door (walking). */
  passer: true,
};

const num = (v: string | null, min: number, max: number): number | null => {
  if (v === null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};
const flag = (v: string | null): boolean => v !== null && v !== '0' && v !== 'false' && v !== 'no';
const moment = (v: string | null): number | null => {
  if (v === null || v.trim() === '') return null;
  const ms = /^\d+$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

export function parseCreatureOptions(get: (name: string) => string | null): CreatureOptions {
  const size = get('size')?.match(/^(\d{2,5})x(\d{2,5})$/);
  const biome = get('biome')?.toLowerCase() ?? null;
  const name = get('name');
  return {
    seed: get('seed') !== null && get('seed') !== '' ? get('seed') : null,
    biome: biome !== null && (BIOME_NAMES as readonly string[]).includes(biome) ? (biome as BiomeName) : null,
    name: name !== null && prettyName(name) !== '' ? prettyName(name) : null,
    speed: num(get('speed'), 0.01, 100000) ?? 1,
    hour: num(get('hour'), 0, 23.999),
    offline: flag(get('offline')),
    mute: flag(get('mute')),
    size: size ? { w: Number(size[1]), h: Number(size[2]) } : null,
    weather: get('weather'),
    manual: flag(get('manual')),
    act: get('act'),
    bench: num(get('bench'), 1, 3600),
    now: moment(get('now')),
    user: get('user') !== null && prettyName(get('user') ?? '') !== '' ? prettyName(get('user') ?? '') : null,
  };
}

/** Command-line arguments as URL parameters; throws with a readable message on a bad one. */
export function creatureQuery(argv: readonly string[]): URLSearchParams {
  const q = new URLSearchParams();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
    const [name, inline] = a.slice(2).split('=', 2);
    const takes = NAMES[name];
    if (takes === undefined) throw new Error(`unknown option --${name}`);
    if (!takes) {
      q.set(name, '1');
      continue;
    }
    const v = inline ?? argv[++i];
    if (v === undefined) throw new Error(`--${name} needs a value`);
    if (name === 'biome' && !(BIOME_NAMES as readonly string[]).includes(v.toLowerCase())) throw new Error(`--biome must be one of ${BIOME_NAMES.join(', ')}, not "${v}"`);
    if (name === 'speed' && num(v, 0.01, 100000) === null) throw new Error(`--speed must be a positive number, not "${v}"`);
    if (name === 'hour' && num(v, 0, 23.999) === null) throw new Error(`--hour must be between 0 and 24, not "${v}"`);
    if (name === 'name' && prettyName(v) === '') throw new Error('--name needs letters');
    if (name === 'passer' && v !== 'sit' && num(v, -100, 100) === null) throw new Error(`--passer must be sit or metres past its door, not "${v}"`);
    q.set(name, v);
  }
  return q;
}
