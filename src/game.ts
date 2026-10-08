// The game without the terminal: options, world + sky + you, one step and one frame at a time, and the bench.
import { Buffer } from 'node:buffer';
import { parseArgs } from 'node:util';
import { ASPECT, BIOMES, FRAME_DT, PREFETCH_BUDGET_MS, REAL, TIME_LAPSE } from './config.ts';
import { Atmosphere } from './ambient.ts';
import type { AtmosphereOptions } from './ambient.ts';
import { Frame } from './frame.ts';
import type { Intent } from './input.ts';
import { stepPlayer } from './player.ts';
import type { Player } from './player.ts';
import { Renderer, viewOrigin } from './render.ts';
import type { PlaceHud } from './render.ts';
import { diffFrames } from './screen.ts';
import { World, findLand, findSea } from './world.ts';
import type { ChunkSource } from './world.ts';
import type { Projection } from './geo.ts';

export type Options = {
  /** null when no --seed was given. */
  readonly seed: number | null;
  readonly bench: boolean;
  readonly cols: number;
  readonly rows: number;
  readonly frames: number;
  /** A place name to resolve, or null. */
  readonly place: string | null;
  /** Coordinates to start at, or null. */
  readonly at: { readonly lat: number; readonly lon: number } | null;
  /** Metres per column in a real world. */
  readonly scale: number;
};

export function parseOptions(argv: readonly string[]): Options {
  // `--at -33.87,151.21` would read as two options to parseArgs; join a coordinate value onto its flag.
  const args = [...argv];
  for (let i = 0; i + 1 < args.length; i++) {
    if (args[i] === '--at' && /^-?\d/.test(args[i + 1])) args.splice(i, 2, `--at=${args[i + 1]}`);
  }
  const { values } = parseArgs({
    args,
    options: {
      seed: { type: 'string' },
      bench: { type: 'boolean', default: false },
      size: { type: 'string', default: '200x60' },
      frames: { type: 'string', default: '600' },
      place: { type: 'string' },
      at: { type: 'string' },
      scale: { type: 'string', default: String(REAL.scale) },
    },
  });
  const size = /^(\d+)x(\d+)$/.exec(values.size);
  if (size === null || Number(size[1]) < 1 || Number(size[2]) < 1) {
    throw new Error(`--size must look like 200x60, not "${values.size}"`);
  }
  const frames = Number(values.frames);
  if (!Number.isInteger(frames) || frames < 1) {
    throw new Error(`--frames must be a positive whole number, not "${values.frames}"`);
  }
  let at: { lat: number; lon: number } | null = null;
  if (values.at !== undefined) {
    const m = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(values.at);
    const lat = m === null ? NaN : Number(m[1]);
    const lon = m === null ? NaN : Number(m[2]);
    if (m === null || lat < -85 || lat > 85 || lon < -180 || lon > 180) throw new Error(`--at must look like 50.088,14.414, not "${values.at}"`);
    at = { lat, lon };
  }
  if (values.place !== undefined && at !== null) throw new Error('use --place or --at, not both');
  const scale = Number(values.scale);
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`--scale must be a positive number of metres, not "${values.scale}"`);
  return {
    seed: values.seed === undefined ? null : seedFrom(values.seed),
    bench: values.bench,
    cols: Number(size[1]),
    rows: Number(size[2]),
    frames,
    place: values.place ?? null,
    at,
    scale,
  };
}

/** A whole number is used as is; any other text is hashed (FNV-1a), so `--seed hello` works too. */
export function seedFrom(text: string): number {
  if (/^\d+$/.test(text)) return Number(text) % 4294967296;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 100000);
}

/** Code point ranges that take two terminal columns (East Asian wide and fullwidth, emoji). */
const WIDE: readonly (readonly [number, number])[] = [
  [0x1100, 0x115f],
  [0x2e80, 0xa4cf],
  [0xac00, 0xd7a3],
  [0xf900, 0xfaff],
  [0xfe30, 0xfe4f],
  [0xff00, 0xff60],
  [0xffe0, 0xffe6],
  [0x1f300, 0x1faff],
  [0x20000, 0x3fffd],
];
/** Control and format characters, combining marks, and line and paragraph separators. */
const HIDDEN = /[\p{Cc}\p{Cf}\p{M}\p{Zl}\p{Zp}]/u;

/** A label the status bar can draw one character per column: composed, without hidden or double-width characters, at most 32 long. May be empty. */
export function cleanLabel(text: string): string {
  return Array.from(text.normalize('NFC'))
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return !HIDDEN.test(ch) && !WIDE.some(([from, to]) => cp >= from && cp <= to);
    })
    .join('')
    .trim()
    .slice(0, 32)
    .trim();
}

/** A real place for the status bar. */
export type GamePlace = {
  readonly name: string;
  readonly projection: Projection;
  status(): { readonly loading: number; readonly offline: boolean; readonly busy: boolean };
};

export type GameOptions = AtmosphereOptions & {
  readonly spawn?: 'land' | 'coast';
  /** The world to play in; without it a generated world is made from the seed. */
  readonly world?: ChunkSource;
  readonly place?: GamePlace;
};

/** World, sky and you, advanced one fixed step at a time and drawn one frame at a time. */
export class Game {
  readonly world: ChunkSource;
  readonly place: GamePlace | null;
  readonly atm: Atmosphere;
  player: Player;
  showHud = true;
  fps = 0;
  private readonly renderer = new Renderer();
  private frames: [Frame, Frame];
  private previous: Frame | null = null;

  constructor(seed: number, cols: number, rows: number, options: GameOptions = {}) {
    this.atm = new Atmosphere(seed, options);
    this.place = options.place ?? null;
    if (options.world !== undefined) {
      // A real place: you start exactly on the cell the place resolved to.
      this.world = options.world;
      this.player = { x: 0.5, y: 0.5 * ASPECT, vx: 0, vy: 0 };
    } else {
      const world = new World(seed);
      this.world = world;
      // Start on land; the bench starts on the land nearest a sea, so water is in view.
      const from = options.spawn === 'coast' ? findSea(world, 0, 0) : { mx: 0, my: 0 };
      const land = findLand(world, from.mx, from.my);
      this.player = { x: land.mx + 0.5, y: (land.my + 0.5) * ASPECT, vx: 0, vy: 0 };
    }
    this.frames = [new Frame(cols, rows), new Frame(cols, rows)];
  }

  resize(cols: number, rows: number): void {
    this.frames = [new Frame(cols, rows), new Frame(cols, rows)];
    this.previous = null;
  }

  toggleHud(): void {
    this.showHud = !this.showHud;
  }

  /** One fixed simulation step. */
  update(intent: Intent, dt: number): void {
    this.atm.step(dt, intent.fastTime ? TIME_LAPSE : 1);
    const here = this.world.biomeAt(Math.floor(this.player.x), Math.floor(this.player.y / ASPECT));
    this.player = stepPlayer(this.player, intent, BIOMES[here].speed, dt);
  }

  /** Generates chunks in and around the view for up to `budgetMs`. */
  prefetch(budgetMs: number): void {
    const cols = this.frames[0].width;
    const mapRows = this.showHud ? this.frames[0].height - 1 : this.frames[0].height;
    const { left, top } = viewOrigin(this.player, cols, mapRows);
    this.world.prefetch(left, top, cols, mapRows, budgetMs);
  }

  /** Renders the next frame and returns the escape sequences that put it on screen ('' if nothing changed). */
  draw(): string {
    const next = this.previous === this.frames[0] ? this.frames[1] : this.frames[0];
    const hud = this.showHud ? { fps: this.fps, place: this.placeHud() } : null;
    this.renderer.render(next, this.world, this.atm, this.atm.snapshot(), this.player, hud);
    const out = diffFrames(this.previous, next);
    this.previous = next;
    return out;
  }

  private placeHud(): PlaceHud | null {
    if (this.place === null) return null;
    const { loading, offline, busy } = this.place.status();
    return { name: this.place.name, projection: this.place.projection, loading, offline, busy };
  }
}

const LEGS: readonly (readonly [number, number, boolean])[] = [
  [1, 0, false],
  [1, 1, true],
  [-1, 0, false],
  [0, -1, true],
  [-1, 1, false],
];

/** The bench's scripted walk: five 2-second legs (two of them running), repeating. */
export function benchIntent(frame: number): Intent {
  const [dx, dy, run] = LEGS[Math.floor(frame / 120) % LEGS.length];
  return { dx, dy, run, fastTime: false };
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
const p95 = (xs: readonly number[]): number =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.95))];

/** The scripted walk at 10:00 in the rain, from a coast; reports build time and output per frame. */
export function runBench(options: Options): string {
  const seed = options.seed ?? 1;
  const game = new Game(seed, options.cols, options.rows, { startHour: 10, forceFront: 1, spawn: 'coast' });
  game.prefetch(Infinity);
  const times: number[] = [];
  const sizes: number[] = [];
  for (let n = 0; n < options.frames; n++) {
    const t0 = performance.now();
    game.update(benchIntent(n), FRAME_DT);
    game.prefetch(PREFETCH_BUDGET_MS);
    const out = game.draw();
    times.push(performance.now() - t0);
    sizes.push(Buffer.byteLength(out));
  }
  const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
  return [
    `wander bench · seed ${seed} · ${options.cols}×${options.rows} · ${options.frames} frames`,
    `build  mean ${mean(times).toFixed(2)} ms · p95 ${p95(times).toFixed(2)} ms`,
    `output mean ${kb(mean(sizes))} · p95 ${kb(p95(sizes))} · max ${kb(Math.max(...sizes))}`,
  ].join('\n');
}
