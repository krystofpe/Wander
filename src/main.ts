// Entry point: `node src/main.ts [--seed N]` to play, `node src/main.ts --bench` to measure.
import { userInfo } from 'node:os';
import { FRAME_DT, FRAME_MS, MAX_CATCH_UP_STEPS, PREFETCH_BUDGET_MS } from './config.ts';
import { Game, parseOptions, randomSeed, runBench } from './game.ts';
import type { Options } from './game.ts';
import { InputState } from './input.ts';
import { SYNC_BEGIN, SYNC_END, Terminal } from './terminal.ts';

/** Your login name, or `you` when the system cannot say. */
function defaultName(): string {
  try {
    return userInfo().username;
  } catch {
    return 'you';
  }
}

async function play(options: Options): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('wander needs a terminal\n');
    process.exit(1);
  }
  const term = new Terminal({ stdin: process.stdin, stdout: process.stdout, stderr: process.stderr, proc: process });
  await term.open();
  const game = new Game(options.seed ?? randomSeed(), term.cols, term.rows, { name: options.name ?? defaultName() });
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
