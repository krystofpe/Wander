// Entry point: `node src/main.ts [--biome NAME] [--name NAME] [--speed N] [--hour H] [--offline] [--new] [--save PATH]`
// to play, `--bench [--size WxH] [--frames N]` to measure.
import { userInfo } from 'node:os';
import { BIOMES, FRAME_DT, FRAME_MS, MAX_CATCH_UP_STEPS, SAVE_EVERY_SEC } from './config.ts';
import { addDiary, newLife } from './creature.ts';
import type { Life } from './creature.ts';
import { Game, parseOptions, randomSeed, runBench, todayAt } from './game.ts';
import type { Options } from './game.ts';
import { InputParser } from './input.ts';
import { connectMind } from './mind.ts';
import { rng } from './noise.ts';
import { backUp, catchUp, defaultSavePath, loadLife, saveLife } from './save.ts';
import type { Away } from './save.ts';
import { BELL, SYNC_BEGIN, SYNC_END, Terminal } from './terminal.ts';

function fail(err: unknown, code: number): never {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(code);
}

function login(): string {
  try {
    return userInfo().username;
  } catch {
    return process.env.USER ?? '';
  }
}

async function play(options: Options): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) fail('wander needs a terminal', 1);
  const path = options.save ?? defaultSavePath();
  // A demo that bends time is not saved, unless a save file is named.
  const ephemeral = (options.speed !== 1 || options.hour !== null) && options.save === null;
  const now = options.hour !== null ? todayAt(options.hour) : Date.now();
  let life: Life | null = null;
  let away: Away | null = null;
  try {
    if (options.fresh && !ephemeral) backUp(path);
    if (!options.fresh) life = loadLife(path);
  } catch (err) {
    fail(err, 2);
  }
  const first = life === null;
  if (life === null) {
    life = newLife(options.seed ?? randomSeed(), now, { biome: options.biome ?? undefined, name: options.name ?? undefined });
  } else {
    if (options.biome !== null && options.biome !== life.biome) {
      life.biome = options.biome;
      addDiary(life, now, `Moved to the ${BIOMES[options.biome].title.toLowerCase()}.`);
    }
    away = catchUp(life, now, rng((life.seed ^ Math.floor(now / 60000)) >>> 0));
  }
  const mind = await connectMind(options.offline);

  const term = new Terminal({ stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, proc: process });
  term.open();
  const game = new Game(life, {
    cols: term.cols,
    rows: term.rows,
    now,
    speed: options.speed,
    mind,
    away,
    login: login(),
    bell: options.bell,
    firstMeeting: first,
    ephemeral,
  });
  const save = (): void => {
    if (ephemeral) return;
    try {
      saveLife(path, game.snapshot());
    } catch {
      // nothing to be done mid-game; the next save tries again
    }
  };
  // Every way out (Q, a signal, a crash, a closed window) ends in process.exit, so this saves on all of them.
  process.on('exit', save);
  save();
  const input = new InputParser();
  term.onData((text) => {
    for (const e of input.feed(text)) game.handle(e);
  });
  term.onResize(() => game.resize(term.cols, term.rows));

  // Step n is due at start + n × FRAME_MS. Behind? Catch up a few steps, then draw once.
  const start = performance.now();
  let steps = 0;
  let lastSave = start;
  const tick = (): void => {
    const now = performance.now();
    const due = Math.floor((now - start) / FRAME_MS) + 1;
    if (due - steps > MAX_CATCH_UP_STEPS) steps = due - MAX_CATCH_UP_STEPS; // far behind: skip ahead
    if (due > steps) {
      for (; steps < due; steps++) game.update(FRAME_DT);
      if (game.quitRequested) {
        term.restore();
        process.exit(0);
      }
      if (game.bellRequested) {
        term.write(BELL);
        game.bellRequested = false;
      }
      const out = game.draw();
      if (out.length > 0) term.write(SYNC_BEGIN + out + SYNC_END);
      if (now - lastSave > SAVE_EVERY_SEC * 1000) {
        save();
        lastSave = now;
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
  fail(err, 2);
}
if (options.bench) process.stdout.write(`${runBench(options)}\n`);
else await play(options);
