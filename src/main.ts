// Entry point: `node src/main.ts [--seed N] [--place TEXT | --at LAT,LON] [--scale M]` to play, `--bench` to measure.
import { FRAME_DT, FRAME_MS, MAX_CATCH_UP_STEPS, PREFETCH_BUDGET_MS } from './config.ts';
import { Game, cleanLabel, parseOptions, randomSeed, runBench, seedFrom } from './game.ts';
import type { GameOptions, Options } from './game.ts';
import { InputState } from './input.ts';
import { Net, defaultCacheDir } from './net.ts';
import { resolvePlace } from './place.ts';
import { RealWorld } from './realworld.ts';
import { SYNC_BEGIN, SYNC_END, Terminal } from './terminal.ts';

/** The real world for `--place` or `--at`, with its seed; null for the generated world. */
async function realWorld(options: Options): Promise<{ seed: number; game: GameOptions } | null> {
  if (options.place === null && options.at === null) return null;
  const net = new Net(defaultCacheDir());
  let origin: { lat: number; lon: number };
  let name: string;
  if (options.at !== null) {
    origin = options.at;
    name = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}`;
  } else {
    const place = await resolvePlace(options.place ?? '', net);
    origin = place;
    name = cleanLabel(place.name) || `${place.lat.toFixed(4)},${place.lon.toFixed(4)}`;
  }
  const seed = options.seed ?? seedFrom(`${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}`);
  const world = new RealWorld(origin, options.scale, seed, net);
  return { seed, game: { world, place: { name, projection: world.projection, status: () => world.status() } } };
}

async function play(options: Options): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('wander needs a terminal\n');
    process.exit(1);
  }
  let real: { seed: number; game: GameOptions } | null;
  try {
    real = await realWorld(options);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  }
  const term = new Terminal({ stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, proc: process });
  await term.open();
  const game = new Game(real?.seed ?? options.seed ?? randomSeed(), term.cols, term.rows, real?.game ?? {});
  game.prefetch(Infinity);
  const input = new InputState(term.kitty);
  term.onData((text) => input.feed(text, performance.now()));
  term.onResize(() => game.resize(term.cols, term.rows));

  // Step n is due at start + n × FRAME_MS. Behind? Catch up a few steps, then draw once.
  const start = performance.now();
  let steps = 0;
  let drawn = 0;
  let fpsSince = start;
  const tick = (): void => {
    const now = performance.now();
    const due = Math.floor((now - start) / FRAME_MS) + 1;
    if (due - steps > MAX_CATCH_UP_STEPS) steps = due - MAX_CATCH_UP_STEPS; // far behind: skip ahead
    if (due > steps) {
      const intent = input.intent(now);
      for (; steps < due; steps++) game.update(intent, FRAME_DT);
      for (const action of input.takeActions()) {
        if (action === 'quit') {
          term.restore();
          process.exit(0);
        } else if (action === 'toggleHud') {
          game.toggleHud();
        }
      }
      game.prefetch(PREFETCH_BUDGET_MS);
      const out = game.draw();
      if (out.length > 0) term.write(SYNC_BEGIN + out + SYNC_END);
      drawn++;
      if (now - fpsSince >= 1000) {
        game.fps = Math.round((drawn * 1000) / (now - fpsSince));
        drawn = 0;
        fpsSince = now;
      }
    }
    setTimeout(tick, Math.max(0, start + steps * FRAME_MS - performance.now()));
  };
  tick();
}

let options: Options;
try {
  options = parseOptions(process.argv.slice(2));
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}
if (options.bench) process.stdout.write(`${runBench(options)}\n`);
else await play(options);
