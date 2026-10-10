// npm start [-- --seed moss --speed 20 --day 30 --realclock --hour 18 --biome coast --offline --new]
// npm run creature [-- --biome forest --name Ori --seed moss --speed 20 --hour 21 --offline --new --mute]
// Starts the server for both modes, the endless walk and the creature's hollow, then opens one of them (the one used
// last; the hollow with --creature) in its own Chromium window, full screen, sound allowed. Tab goes from one to the
// other. Closing the window ends it; if the page stops answering, the window is opened again. Extra flags:
// --no-browser, --port N, --save PATH (the mode's file; the other mode's file beside it).
import { argvToQuery } from '../src/options.ts';
import { creatureQuery } from '../src/creature/options.ts';
import { findChromium, openApp } from './browser.ts';
import type { ChildProcess } from 'node:child_process';
import { CreatureStore, connectCreatureMind, defaultCreaturePath } from './creature.ts';
import { JourneyStore, defaultJourneyPath } from './journey.ts';
import { connectThinker } from './mind.ts';
import { startServer } from './server.ts';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
// Which mode opens: the creature with --creature (npm run creature), the walk when it is given its options, otherwise
// the one used last (the pages tell the server when you switch with Tab).
const modeFile = (dir: string): string => join(dir, 'mode');
const saveDir = dirname(own.get('save') ?? defaultJourneyPath());
const lastMode = (): Mode => {
  try {
    return readFileSync(modeFile(saveDir), 'utf8').trim() === 'creature' ? 'creature' : 'wander';
  } catch {
    return 'wander';
  }
};
type Mode = 'wander' | 'creature';
const mode: Mode = own.has('creature') ? 'creature' : rest.length > 0 ? 'wander' : lastMode();
const creature = mode === 'creature';

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

// Both lives at once: his road and the creature's hollow, each in its file. With --save, the other one keeps its file
// beside it, so a run with a save of its own never touches the real ones.
const save = own.get('save');
const journeys = new JourneyStore(save !== undefined && !creature ? save : save !== undefined ? join(dirname(save), 'journey.json') : defaultJourneyPath());
const creatures = new CreatureStore(save !== undefined && creature ? save : save !== undefined ? join(dirname(save), 'creature.json') : defaultCreaturePath());
if (query.has('new')) (creature ? creatures : journeys).fresh();
const offline = query.has('offline');
const thinker = await connectThinker(offline);
const mind = await connectCreatureMind(offline);
const api: Api = {
  loadJourney: async () => journeys.load(),
  saveJourney: async (j) => {
    journeys.save(j);
    saved();
  },
  thought: async (ctx) => {
    if (thinker === null) return null;
    const text = await thinker.think(ctx as Record<string, unknown>);
    return text === null ? null : { text };
  },
  mind: () => thinker?.status() ?? 'local',
  beat: () => {
    lastBeat = performance.now();
  },
  loadCreature: async () => creatures.load(),
  saveCreature: async (life) => {
    creatures.save(life);
    saved();
  },
  creatureSay: async (r) => (mind === null ? null : mind.ask(r as Record<string, unknown>)),
  creatureMind: () => ({ mind: mind?.status() ?? 'local', model: mind?.model ?? null }),
  setMode: async (m) => {
    mkdirSync(saveDir, { recursive: true });
    writeFileSync(modeFile(saveDir), m === 'creature' ? 'creature\n' : 'wander\n');
  },
};
const about = `  mind: ${thinker === null ? 'local' : `claude (${thinker.model})`}\n  road: ${journeys.path}\n  creature: ${creatures.path}\n`;

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
