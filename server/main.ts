// npm start [-- --seed moss --speed 20 --day 30 --realclock --hour 18 --biome coast --offline --new]
// npm run creature [-- --biome forest --name Ori --seed moss --speed 20 --hour 21 --offline --new --mute]
// Starts the server, then opens Wander (or, with --creature, the creature in its hollow) in its own Chromium window,
// full screen, sound allowed. Closing the window ends it; if the page stops answering, the window is opened again.
// Extra flags: --no-browser, --port N, --save PATH.
import { argvToQuery, parseOptions } from '../src/options.ts';
import { creatureQuery } from '../src/creature/options.ts';
import { findChromium, openApp } from './browser.ts';
import type { ChildProcess } from 'node:child_process';
import { CreatureStore, connectCreatureMind, defaultCreaturePath } from './creature.ts';
import { JourneyStore, defaultJourneyPath } from './journey.ts';
import { connectThinker } from './mind.ts';
import { startServer } from './server.ts';
import type { Api } from './server.ts';
import { ROOT } from './root.ts';

const argv = process.argv.slice(2);
const own = new Map<string, string>();
const rest: string[] = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--no-browser' || a === '--creature') own.set(a.slice(2), '1');
  else if (a === '--port' || a === '--save') own.set(a.slice(2), argv[++i] ?? '');
  else rest.push(a);
}
const creature = own.has('creature');

let query: URLSearchParams;
try {
  query = creature ? creatureQuery(rest) : argvToQuery(rest);
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
}
let lastBeat = 0;
/** Who waits for the next save (shutdown, after asking the page to save). */
const waiting: (() => void)[] = [];
const saved = (): void => {
  for (const done of waiting.splice(0)) done();
};
const beat = (): void => {
  lastBeat = performance.now();
};

let api: Api;
let about: string;
if (creature) {
  // The creature in its hollow: its save (the terminal creature's own file), its Claude voice.
  const store = new CreatureStore(own.get('save') ?? defaultCreaturePath());
  if (query.has('new')) store.fresh();
  const mind = await connectCreatureMind(query.has('offline'));
  api = {
    loadJourney: async () => null,
    saveJourney: async () => {},
    thought: async () => null,
    mind: () => 'local',
    beat,
    loadCreature: async () => store.load(),
    saveCreature: async (life) => {
      store.save(life);
      saved();
    },
    creatureSay: async (r) => (mind === null ? null : mind.ask(r as Record<string, unknown>)),
    creatureMind: () => ({ mind: mind?.status() ?? 'local', model: mind?.model ?? null }),
  };
  about = `  mind: ${mind === null ? 'local' : `claude (${mind.model})`}\n  creature: ${store.path}\n`;
} else {
  const opts = parseOptions((k) => query.get(k));
  const store = new JourneyStore(own.get('save') ?? defaultJourneyPath());
  if (opts.fresh) store.fresh();
  const thinker = await connectThinker(opts.offline);
  api = {
    loadJourney: async () => store.load(),
    saveJourney: async (j) => {
      store.save(j);
      saved();
    },
    thought: async (ctx) => {
      if (thinker === null) return null;
      const text = await thinker.think(ctx as Record<string, unknown>);
      return text === null ? null : { text };
    },
    mind: () => thinker?.status() ?? 'local',
    beat,
  };
  about = `  mind: ${thinker === null ? 'local' : `claude (${thinker.model})`}\n  road: ${store.path}\n`;
}

const running = await startServer(ROOT, api, Number(own.get('port') ?? 0));

// --new is done once, here (the old one kept as .bak); the page must not start yet another on each reload.
query.delete('new');
const url = `${running.url}${creature ? 'creature' : ''}${query.toString() === '' ? '' : `?${query.toString()}`}`;
process.stdout.write(`${creature ? 'The creature lives' : 'Wander is walking'} at ${url}\n${about}`);

let browser: ChildProcess | null = null;
let closing = false;

async function shutdown(code = 0): Promise<void> {
  if (closing) return;
  closing = true;
  // Ask the page to save the road now, and wait for it (two and a half seconds at most).
  if (running.listeners() > 0) {
    await new Promise<void>((done) => {
      const timer = setTimeout(done, 2500);
      waiting.push(() => {
        clearTimeout(timer);
        done();
      });
      running.tell('save');
    });
  }
  // Let the browser close its window gracefully (SIGTERM), so the page saves the road as it goes, and keep
  // listening until it has, or for three seconds at most.
  const proc = browser;
  if (proc !== null && proc.exitCode === null) {
    await new Promise<void>((done) => {
      const timer = setTimeout(done, 3000);
      proc.once('exit', () => {
        clearTimeout(timer);
        done();
      });
      proc.kill('SIGTERM');
    });
  }
  await running.close();
  process.exit(code);
}

function launch(): void {
  const exe = findChromium();
  if (exe === null) {
    process.stdout.write('Chromium was not found (set WANDER_CHROMIUM); open the address above in a browser.\n');
    return;
  }
  lastBeat = performance.now();
  const proc = openApp(url, exe);
  browser = proc;
  proc.on('exit', () => {
    // The window was closed: Wander ends with it (unless the watchdog is replacing it).
    if (browser === proc) void shutdown(0);
  });
}

if (!own.has('no-browser')) {
  launch();
  // The watchdog: a page that has stopped beating for two minutes is opened again. Its clock is monotonic, so a
  // suspended machine does not count as a silent page; the old browser is gone before the new one starts, or the
  // new one could hand itself over to the dying one and quit.
  let relaunching = false;
  setInterval(() => {
    if (closing || relaunching || browser === null || performance.now() - lastBeat < 120_000) return;
    process.stdout.write('The page stopped answering; opening it again.\n');
    const old = browser;
    browser = null;
    if (old.exitCode !== null || old.signalCode !== null) {
      launch();
      return;
    }
    relaunching = true;
    const timer = setTimeout(() => old.kill('SIGKILL'), 5000);
    old.once('exit', () => {
      clearTimeout(timer);
      relaunching = false;
      if (!closing) launch();
    });
    old.kill();
  }, 30_000).unref();
}

process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
