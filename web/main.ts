// The page: options, the canvas in device pixels, his life stepped by the clock, the stage drawn by the renderer.
import { BIOMES } from '../src/biomes.ts';
import type { BiomeId } from '../src/biomes.ts';
import { catchUp, newJourney, reviveJourney, roadWord } from '../src/journal.ts';
import type { Journey } from '../src/journal.ts';
import { groundAt, stepLife, thoughtContext, weatherOf } from '../src/life.ts';
import type { Env, Life, LifeEvent, Stage as LifeStage } from '../src/life.ts';
import { LIVE, LIVE_SEED, STEPS_PER_DAY, liveAt, liveEnv, msOfStep, stepAt, stepLive } from '../src/live.ts';
import { rng, squirrel } from '../src/noise.ts';
import { parseOptions, seedOf } from '../src/options.ts';
import { PX_PER_M } from '../src/layers.ts';
import { dayOf, hourOfDay, localHour, moonPhase, namedWeather, roadMoon, shownHour, sunElevation } from '../src/sky.ts';
import { localThought } from '../src/thoughts.ts';
import { biomeAt, firstStretchOf, landmarkNear, stretchAt } from '../src/world.ts';
import { Sound, ticker } from './audio/sound.ts';
import type { Hear } from './audio/heard.ts';
import { Bench } from './bench.ts';
import { Ui } from './ui.ts';
import { Renderer } from './render.ts';
import { loadAtlas } from './sprites.ts';
import { Stage } from './stage.ts';
import { lastMode, modes } from './modes.ts';
import type { Neighbour } from './neighbour.ts';
import { revive } from '../src/creature/save.ts';
import { travellerCame } from '../src/creature/traveller.ts';
import type { Meeting } from '../src/creature/traveller.ts';

const params = new URLSearchParams(location.search);
const opts = parseOptions((k) => params.get(k));
/** The published page: plain files, no server behind it (tools/site.ts marks its copy of the page). */
const site = document.documentElement.hasAttribute('data-site');
// On the published page, a visitor who was last with their creature goes back to it.
if (site && params.toString() === '' && lastMode() === 'creature') {
  location.replace(new URL('creature/', location.href).href);
  await new Promise(() => {});
}

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new Renderer(canvas, false);
// Debugging: ?layers=1,2,8 draws only those layers.
const onlyLayers = params.get('layers');
if (onlyLayers !== null) renderer.only = new Set(onlyLayers.split(',').map(Number));

/** Tools read this: ready once the first frames are drawn with every chunk in place. */
const status = {
  ready: false,
  frames: 0,
  renderer: renderer.gpu.renderer(),
  error: null as string | null,
  live: renderer.gpu.live,
  events: [] as string[],
  life: null as Life | null,
};
(window as unknown as { __wander: typeof status }).__wander = status;
window.addEventListener('error', (e) => {
  status.error = String(e.message);
});

if (opts.size !== null) {
  canvas.width = opts.size.w;
  canvas.height = opts.size.h;
  canvas.style.width = `${opts.size.w / devicePixelRatio}px`;
  canvas.style.height = `${opts.size.h / devicePixelRatio}px`;
  renderer.resize(opts.size.w, opts.size.h);
} else {
  const observer = new ResizeObserver((entries) => {
    const e = entries[0];
    const box = e.devicePixelContentBoxSize?.[0];
    const w = box !== undefined ? box.inlineSize : Math.round(e.contentRect.width * devicePixelRatio);
    const h = box !== undefined ? box.blockSize : Math.round(e.contentRect.height * devicePixelRatio);
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    renderer.resize(w, h);
  });
  try {
    observer.observe(canvas, { box: 'device-pixel-content-box' });
  } catch {
    observer.observe(canvas);
  }
}

// ── His life ───────────────────────────────────────────────────────────────

const tool = opts.frozen || opts.manual || opts.bench !== null;
/** The live road (live.ts): the published page, or `--live` here. Everyone sees the same wanderer, nothing is saved. */
const shared = (site || opts.live) && !tool;
const env: Env = shared
  ? liveEnv(LIVE_SEED)
  : {
      hourAt: (clock) => (opts.realClock ? localHour(Date.now()) : hourOfDay(clock)),
      natural: opts.realClock,
      weather: opts.weather !== null ? namedWeather(opts.weather) : null,
    };
const dayLength = shared ? LIVE.day : opts.day * 60;
/** Runs that bend time or only take pictures are not saved, and nor is the live road. */
const ephemeral = shared || opts.frozen || opts.manual || opts.speed !== 1 || opts.hour !== null || opts.bench !== null || opts.at !== null;

/** The live road's moment for a performance.now() time: now (or `?now`, run at `?speed`). */
let offset = Date.now() - performance.now();
const startPerf = performance.now();
const startMs = opts.now ?? Date.now();
const liveMs = (perf: number): number => (opts.now === null && opts.speed === 1 ? offset + perf : startMs + (perf - startPerf) * opts.speed);
if (shared) {
  // The computer's clock is the road's: follow it if it is set again or the machine slept.
  setInterval(() => {
    const o = Date.now() - performance.now();
    if (Math.abs(o - offset) > 250) offset = o;
  }, 10_000);
}

/** A live thought at step n: the local voice, with a randomness of the step's own, so everyone hears the same one. */
const liveThought = (l: Life, n: number): string => localThought(thoughtContext(l, env, roadMoon(l.clock, LIVE.moon)), rng(squirrel(n, LIVE_SEED ^ 0x7409)), l.thoughts);
const remember = (l: Life, text: string): void => {
  l.thoughts.push(text);
  if (l.thoughts.length > 8) l.thoughts.shift();
};

/** The live road's step the page's life was lived up to (it goes on from there, whatever the clock says by then). */
let liveFrom = 0;

/**
 * The road: the saved one (caught up on the time away), or a new one. `keep` says whether this run may write over
 * the saved road: not when it only looks at another seed's road, nor when the save could not be read.
 */
async function road(): Promise<{ journey: Journey; mind: string; keep: boolean }> {
  if (shared) {
    // The hour's camp, lived up to now; the thoughts he had on the way are thought too, so the next ones come alike.
    liveFrom = stepAt(liveMs(performance.now()));
    const life = liveAt(LIVE_SEED, liveFrom, env, (l, evs, n) => {
      for (const e of evs) if (e.type === 'thought') remember(l, liveThought(l, n));
    });
    return { journey: { version: 2, word: LIVE.word, moonStart: LIVE.moon, startedAt: LIVE.epoch, savedAt: Date.now(), life }, mind: 'local', keep: false };
  }
  let saved: unknown = null;
  let mind = 'local';
  let keep = true;
  if (!tool && !site) {
    try {
      const res = await fetch('/api/journey');
      const body = (await res.json()) as { journey?: unknown; mind?: unknown };
      if (!res.ok) keep = false;
      saved = body.journey ?? null;
      mind = body.mind === 'claude' ? 'claude' : 'local';
    } catch {
      // No server (opened as a plain file): a road of its own, unsaved.
    }
  }
  if (saved !== null && !opts.fresh) {
    try {
      const j = reviveJourney(saved);
      if (opts.seed === null || opts.seed === j.word) {
        catchUp(j, Date.now(), dayLength);
        // ?at: a look further along this road (not saved), walking from there.
        if (opts.at !== null) Object.assign(j.life, { at: opts.at, act: 'walk', stage: 'walk', target: null, fire: null, smoking: -1 });
        return { journey: j, mind, keep };
      }
      // Another seed's road, for a look: the saved one stays as it is (add --new to make this one the road).
      keep = false;
    } catch {
      // Not a journey: start a new road.
    }
  }
  const word = opts.seed ?? roadWord(Math.random());
  const j = newJourney(word, Date.now(), moonPhase(Date.now()), opts.hour ?? (tool ? 7.5 : 15.6));
  if (opts.at !== null) j.life.at = opts.at;
  else if (opts.biome !== null) {
    // Start a little before the middle of the first stretch of that biome.
    const s = firstStretchOf(j.life.seed, opts.biome);
    if (s !== null) j.life.at = s.start + (s.end - s.start) * 0.4;
  }
  return { journey: j, mind, keep };
}

const started = await road();
const journey = started.journey;
/** Who speaks for him: `claude` while the server can ask Claude, `local` otherwise (it may change as replies come). */
let mind = started.mind;
/** The life that is stepped. On the live road it steps in fixed half seconds, and `life`, what is drawn and heard, is
 * a copy of it in between the last two steps; elsewhere they are one and the same. */
let sim = journey.life;
let simStep = shared ? liveFrom : 0;
const life: Life = shared ? { ...sim } : sim;
journey.life = life;
status.life = life;
(status as unknown as { mind: string }).mind = mind;
const stage = new Stage(life.seed, journey.moonStart);
// The creature that comes through its portal to his camp at night: yours, from its save (its file here, this browser
// on the published page), or a stranger's look when there is none yet.
async function neighbourOf(): Promise<Neighbour | null> {
  let data: unknown = null;
  if (site) {
    try {
      data = JSON.parse(localStorage.getItem('wander.creature') ?? 'null') as unknown;
    } catch {
      data = null;
    }
  } else if (!tool) {
    try {
      const res = await fetch('/api/creature');
      if (res.ok) data = ((await res.json()) as { life?: unknown }).life ?? null;
    } catch {
      data = null;
    }
  }
  if (data === null) return null;
  try {
    const c = revive(data);
    return { name: c.name, cloak: c.cloak, away: c.away, nightOwl: c.traits.nightOwl };
  } catch {
    return null;
  }
}
stage.neighbour = await neighbourOf();

/** It came through its portal and sat by his fire: the creature keeps the visit (its file, or this browser). */
let keptNight = -1;
function keepVisit(how: Meeting): void {
  if (stage.neighbour === null) return;
  if (site) {
    try {
      const c = revive(JSON.parse(localStorage.getItem('wander.creature') ?? 'null') as unknown);
      if (travellerCame(c, Date.now(), how)) localStorage.setItem('wander.creature', JSON.stringify(c));
    } catch {
      // No creature in this browser, or no storage: nothing to keep.
    }
  } else if (!ephemeral) void fetch('/api/creature/visit', { method: 'POST', body: JSON.stringify({ how }) }).catch(() => {});
}
// Still pictures may ask for life to be put in the frame (?show=deer,flock).
if (opts.frozen && params.get('show') !== null) stage.around.show = new Set((params.get('show') ?? '').split(','));
renderer.atlas = await loadAtlas(renderer.gpu);
const ui = new Ui();
/** Pictures and stepped captures are silent; so is a browser that cannot make sound. */
const sound = ((): Sound | null => {
  if (opts.frozen || opts.manual) return null;
  try {
    return new Sound(life.seed, opts.mute);
  } catch {
    return null;
  }
})();
Object.assign(status, {
  /** What is happening now, for the watch tool's log. */
  moment: () => {
    const hour = env.hourAt(life.clock);
    const w = weatherOf(life, env);
    const b = biomeAt(life.seed, life.at);
    return {
      day: dayOf(life.clock),
      hour: Math.round(shownHour(hour, opts.realClock) * 100) / 100,
      sun: Math.round(sunElevation(hour, opts.realClock) * 10) / 10,
      at: Math.round(life.at),
      biome: b.k < 0.02 ? b.a : `${b.a}→${b.b} ${Math.round(b.k * 100)}%`,
      weather: w.name,
      precip: Math.round(w.precip * 100) / 100,
      fog: Math.round(w.fog * 100) / 100,
      stage: life.stage,
      act: life.act,
      smoking: life.smoking >= 0,
      fire: life.fire === null ? 0 : Math.round(life.fire.heat * 100) / 100,
      landmark: landmarkNear(life.seed, life.at, 300)?.kind ?? null,
      seen: { ...stage.around.seen },
      around: stage.around.present(),
      thought: shown[shown.length - 1] ?? null,
    };
  },
  sound: () => sound?.status() ?? null,
  /** Records the sound for `sec` seconds and returns it as base64 WebM (the tools measure it). */
  record: async (sec: number): Promise<string | null> => {
    const blob = await sound?.record(sec);
    if (blob === undefined || blob === null) return null;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  },
});
const shown: string[] = [];
(status as unknown as { thoughts: string[] }).thoughts = shown;

/** A pose held for a frozen shot: the stage, a seat height, a fire for the camp poses. */
if (opts.frozen && opts.pose !== null) {
  const pose = opts.pose;
  const map: Record<string, LifeStage> = { smoke: 'stand', sitsmoke: 'sit', camp: 'campsit' };
  life.stage = map[pose] ?? (pose as LifeStage);
  life.seat = life.stage === 'sit' ? 6 : 0;
  if (pose === 'smoke' || pose === 'sitsmoke' || pose === 'camp') life.smoking = 3;
  if (['kneel', 'campsit', 'lie', 'sleep', 'wake', 'pack'].includes(life.stage)) {
    life.act = 'camp';
    life.fire = { at: life.at + 0.9, heat: life.stage === 'kneel' ? 0.3 : life.stage === 'pack' ? 0.1 : 1 };
  }
}

// ── Saving and the heartbeat ───────────────────────────────────────────────

function save(beacon: boolean): void {
  if (ephemeral || !started.keep) return;
  journey.savedAt = Date.now();
  const body = JSON.stringify(journey);
  if (beacon) navigator.sendBeacon('/api/journey', new Blob([body], { type: 'application/json' }));
  else void fetch('/api/journey', { method: 'PUT', body }).catch(() => {});
}
if (!tool && !site) {
  setInterval(() => save(false), 15_000);
  // The server asks for a save when it is about to stop (Ctrl-C in the terminal, the session ending).
  try {
    new EventSource('/api/events').addEventListener('save', () => save(false));
  } catch {
    // No server to listen to.
  }
  setInterval(() => void fetch('/api/beat', { method: 'POST' }).catch(() => {}), 15_000);
  addEventListener('pagehide', () => save(true));
}
if (!tool) {
  // Keep the screen awake while he walks (asked again whenever the page is shown).
  const wake = (): void => {
    if (document.visibilityState === 'visible') void (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request('screen').catch(() => {});
  };
  document.addEventListener('visibilitychange', wake);
  wake();
}

// A lost GPU context (a driver reset, a suspend) would leave the screen black: the road is saved and the page
// starts again, from where he was, once the context comes back or after a few seconds.
let reloading = false;
const restart = (): void => {
  if (reloading) return;
  reloading = true;
  try {
    save(false);
  } catch {
    // Nothing to save yet.
  }
  setTimeout(() => location.reload(), 400);
};
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  status.error = 'the WebGL context was lost';
  setTimeout(restart, 5000);
});
canvas.addEventListener('webglcontextrestored', restart);

// ── His thoughts ───────────────────────────────────────────────────────────

let asking = false;

/** A thought is due: ask Claude (through the server) if it is there, otherwise, or if it is slow, the local voice. */
function think(now: number): void {
  if (asking) return;
  const ctx = thoughtContext(sim, env, stage.view.moonPhase);
  const local = shared ? liveThought(sim, simStep) : localThought(ctx, Math.random, sim.thoughts);
  const show = (text: string): void => {
    ui.say(text, anim);
    remember(sim, text);
    shown.push(text);
    if (shown.length > 50) shown.shift();
  };
  if (mind !== 'claude' || opts.offline) {
    show(local);
    return;
  }
  asking = true;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 12_000);
  fetch('/api/thought', { method: 'POST', body: JSON.stringify({ ...ctx, place: BIOMES[ctx.biome as BiomeId]?.title ?? ctx.biome, recent: sim.thoughts }), signal: abort.signal })
    .then((r) => r.json() as Promise<{ thought: string | null; mind?: string }>)
    .then((r) => {
      if (r.mind === 'claude' || r.mind === 'local') {
        mind = r.mind;
        (status as unknown as { mind: string }).mind = mind;
      }
      show(r.thought ?? local);
    })
    .catch(() => show(local))
    .finally(() => {
      clearTimeout(timer);
      asking = false;
    });
  void now;
}

// ── Keys ───────────────────────────────────────────────────────────────────

addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k === 'h') ui.barOn = !ui.barOn;
  else if (k === 'l') ui.logOn = !ui.logOn;
  else if (k === 'f') {
    if (document.fullscreenElement === null) void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    else void document.exitFullscreen();
  } else if (k === 'm') {
    // A page not yet touched holds its sound: this key wakes it (sound.ts), and only turns it off once it plays.
    if (sound?.waiting !== true) sound?.toggle();
  }
  else if (k === '+' || k === '=') sound?.volume(1);
  else if (k === '-') sound?.volume(-1);
});

addEventListener('dblclick', () => {
  if (document.fullscreenElement === null) void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  else void document.exitFullscreen();
});

const pad = (n: number): string => String(Math.floor(n)).padStart(2, '0');
const clockText = (h: number): string => `${pad(h)}:${pad((h % 1) * 60)}`;

function barText(hour: number): string {
  const w = weatherOf(life, env);
  const place = BIOMES[stretchAt(life.seed, life.at).biome].title;
  const km = (life.at / 1000).toFixed(1);
  return `day ${dayOf(life.clock)} on the road · ${km} km · ${place} · ${clockText(shownHour(hour, opts.realClock))} · ${w.name} · mind: ${mind}${shared ? ' · live' : ''}`;
}

function logLines(): string[] {
  const out: string[] = [shared ? 'the live road' : `the road from “${journey.word}”`];
  for (let i = life.log.length - 1; i >= 0 && out.length < 32; i--) {
    const e = life.log[i];
    const what = e.kind === 'camp' ? `a night's camp, ${e.name}` : e.kind === 'landmark' ? `a ${e.name}` : e.name;
    out.push(`day ${e.day}, ${clockText(e.hour)}   ${what}`);
  }
  return out;
}

// ── The frame ──────────────────────────────────────────────────────────────

const events: LifeEvent[] = [];
let last = performance.now();
let anim = opts.t ?? 0;
let hintUntil = performance.now() + 15_000;
addEventListener('pointermove', () => {
  hintUntil = Math.max(hintUntil, performance.now() + 4000);
});
// The other mode, the creature's deep: Tab, or the dim line that shows with the bar and when the mouse moves.
if (!tool) modes('wander', site, () => ui.barOn || performance.now() < hintUntil);
let drawnAt = anim;
let uiAt = 0;

/** What the step before this one looked like, for the frames in between (the live road). */
const before = { at: 0, walked: 0, clock: 0, smoking: -1, heat: 0 };
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

function note(e: LifeEvent): void {
  if (status.events.length < 400 && e.type !== 'drag' && e.type !== 'exhale') {
    const what = e.type === 'stage' ? e.stage : e.type === 'act' ? e.act : e.type === 'biome' ? e.id : e.type === 'landmark' ? e.kind : '';
    status.events.push(`${sim.clock.toFixed(2)} ${e.type}:${what}`);
  }
}

/**
 * The live road: steps up to the step after this moment, then draws in between that one and the one before. A long
 * gap (a sleeping machine) starts again from the hour's camp; a short one catches up quietly, thinking on the way.
 */
function liveShared(now: number): void {
  const ms = liveMs(now);
  const target = stepAt(ms) + 1;
  if (target - simStep > STEPS_PER_DAY) {
    sim = liveAt(LIVE_SEED, target - 1, env, (l, evs, n) => {
      for (const e of evs) if (e.type === 'thought') remember(l, liveThought(l, n));
    });
    simStep = target - 1;
  }
  const loud = target - simStep <= 4;
  while (simStep < target) {
    before.at = sim.at;
    before.walked = sim.walked;
    before.clock = sim.clock;
    before.smoking = sim.smoking;
    before.heat = sim.fire?.heat ?? 0;
    simStep++;
    sim = stepLive(sim, simStep, env, events);
    for (const e of events) {
      if (e.type === 'thought') {
        if (loud) think(now);
        else remember(sim, liveThought(sim, simStep));
      } else if (loud) sound?.event(e);
      note(e);
    }
  }
  const k = Math.min(1, Math.max(0, (ms - msOfStep(target - 1)) / (LIVE.tick * 1000)));
  Object.assign(life, sim);
  life.at = lerp(before.at, sim.at, k);
  life.walked = lerp(before.walked, sim.walked, k);
  life.clock = lerp(before.clock, sim.clock, k);
  life.stageTime = Math.max(0, sim.stageTime - (1 - k) * LIVE.tick);
  life.smoking = sim.smoking < 0 || before.smoking < 0 ? sim.smoking : lerp(before.smoking, sim.smoking, k);
  life.fire = sim.fire === null ? null : { at: sim.fire.at, heat: lerp(before.heat, sim.fire.heat, k) };
}

/** Lives the time since the last call: his life, its events (thoughts, sounds), the status for the tools. */
function live(now: number, hidden: boolean): void {
  // Real seconds since the last call, clamped so a stall does not jump the world (more is allowed while hidden,
  // where the worker's ticks may come late).
  const dt = opts.frozen ? 0 : Math.min(hidden ? 1 : 0.25, Math.max(0, (now - last) / 1000));
  last = now;
  anim += dt;
  if (opts.frozen) return;
  if (shared) {
    liveShared(now);
    return;
  }
  stepLife(life, dt * opts.speed, dayLength, env, events);
  for (const e of events) {
    if (e.type === 'thought') think(now);
    sound?.event(e);
    note(e);
  }
}

function step(now: number): void {
  live(now, false);
  const hour = env.hourAt(life.clock);
  stage.update(renderer, renderer.atlas, life, hour, opts.realClock, weatherOf(life, env), anim, opts.frozen ? 0 : Math.min(0.1, anim - drawnAt), opts.frozen, null);
  drawnAt = anim;
  // The creature came through its portal and sits with him: it keeps the visit, once a night.
  const visit = stage.visit;
  if (visit !== null && visit.phase === 'with' && visit.night !== keptNight) {
    keptNight = visit.night;
    keepVisit(visit.woke ? 'woke' : 'slept');
  }
  if (stage.around.trainStarted !== null) sound?.train(stage.around.trainStarted);
  // Text sits in CSS pixels: one art pixel is scale / devicePixelRatio of them.
  const css = renderer.scale / devicePixelRatio;
  ui.setScale(css);
  const skyRow = renderer.nativeH - 360 + stage.view.horizon - 92;
  ui.place((renderer.viewOffsetX + stage.headX * renderer.scale) / devicePixelRatio, (renderer.viewOffsetY + skyRow * renderer.scale) / devicePixelRatio, anim);
  if (now - uiAt > 500) {
    uiAt = now;
    ui.showBar(barText(hour));
    ui.showLog(logLines());
    // The published page says, for a while and when the mouse moves, how to hear it and what the keys do.
    if (site) ui.showHint(now < hintUntil ? `${sound?.waiting === true ? 'click for sound' : 'M sound'} · F full screen · H, L more` : null);
  }
}

/** What the sound hears of the moment. */
function hearing(): Hear {
  const hour = env.hourAt(life.clock);
  const w = weatherOf(life, env);
  const W = renderer.nativeW;
  const mark = landmarkNear(life.seed, life.at, 300);
  return {
    seed: life.seed,
    time: anim,
    blend: biomeAt(life.seed, life.at),
    place: stretchAt(life.seed, life.at).k,
    hour: shownHour(hour, opts.realClock),
    sun: sunElevation(hour, opts.realClock),
    weather: w,
    stage: life.stage,
    walked: life.walked,
    ground: groundAt(life, w),
    fire: life.fire?.heat ?? 0,
    fireX: life.fire === null ? 0.5 : stage.share + ((life.fire.at - life.at) * PX_PER_M) / W,
    himX: stage.share,
    landmark: mark?.kind ?? null,
    speed: opts.speed,
  };
}

// The sound's clock, from a worker: it keeps ticking when the window is hidden and frames stop, and then it also
// keeps his life going, so the road and its sounds go on in the background.
if (!opts.frozen && !opts.manual) {
  ticker(50, () => {
    try {
      // No frame for a quarter of a second (a hidden window, a stalled one): his life goes on from here.
      if (document.hidden || performance.now() - lastFrame > 250) live(performance.now(), true);
      if (sound !== null) {
        const w = weatherOf(life, env);
        sound.tick(hearing(), w.kind === 'rain' && w.precip > 0.3);
      }
    } catch (err) {
      status.error = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      console.error(err);
    }
  });
}

if (opts.frozen && params.get('thought') !== null) {
  const ctx = thoughtContext(life, env, 0.5);
  ui.say(params.get('thought') || localThought(ctx, rng(seedOf(params.get('thought') ?? '') || 1), []), 0, 999, true);
}

// ── Measuring: the bench (?bench=SEC) and the soak's minute-by-minute probe ─────────────────────────────────────

const bench = opts.bench !== null ? new Bench(renderer.gpu, opts.bench) : null;
/** Frame intervals and CPU times since the soak last asked (a fixed buffer: no allocation per frame). */
const intervals = new Float32Array(16384);
const cpuTimes = new Float32Array(16384);
let logged = 0;
let lastFrame = 0;

const percentile = (a: Float32Array, n: number, q: number): number => {
  if (n === 0) return 0;
  const v = Array.from(a.subarray(0, n)).sort((x, y) => x - y);
  return Math.round(v[Math.min(n - 1, Math.floor(q * n))] * 100) / 100;
};

Object.assign(status, {
  /** The live road's last step, for the tools to check against live.ts. */
  liveStep: () => ({ step: simStep, at: sim.at, stage: sim.stage, clock: sim.clock, drawnAt: life.at, waiting: sound?.waiting ?? null }),
  /** The creature's visit to his camp this frame, or null. */
  visit: () => stage.visit,
  bench: null as unknown,
  /** One sample for the soak: the road, the JS heap after a collection, GPU resources alive, frame times. */
  soak: () => {
    (window as unknown as { gc?: () => void }).gc?.();
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    const live = renderer.gpu.live;
    const n = Math.min(logged, intervals.length);
    const b = biomeAt(life.seed, life.at);
    const out = {
      worldHours: Math.round(life.clock * 100) / 100,
      km: Math.round(life.at / 10) / 100,
      heapMB: memory === undefined ? -1 : Math.round((memory.usedJSHeapSize / 1048576) * 100) / 100,
      textures: live.textures,
      buffers: live.buffers,
      framebuffers: live.framebuffers,
      textureMB: Math.round((live.textureBytes / 1048576) * 100) / 100,
      frames: logged,
      p50: percentile(intervals, n, 0.5),
      p99: percentile(intervals, n, 0.99),
      cpuP50: percentile(cpuTimes, n, 0.5),
      voices: (sound?.status().voices as number | undefined) ?? 0,
      stage: life.stage,
      biome: b.k < 0.5 ? b.a : b.b,
      weather: weatherOf(life, env).name,
    };
    logged = 0;
    return out;
  },
});

function frame(now: number): void {
  try {
    const t0 = performance.now();
    bench?.begin(now);
    step(now);
    renderer.frame(stage.view, opts.frozen ? 999 : 1);
    bench?.end();
    if (bench?.report != null && (status as unknown as { bench: unknown }).bench === null) (status as unknown as { bench: unknown }).bench = bench.report;
    // A gap of more than a second is a pause (a hidden window), not a frame: it is not counted as one.
    if (lastFrame > 0 && now - lastFrame < 1000) {
      const i = logged % intervals.length;
      intervals[i] = now - lastFrame;
      cpuTimes[i] = performance.now() - t0;
      logged++;
    }
    lastFrame = now;
    status.frames++;
    if (status.frames >= 3) status.ready = true;
  } catch (err) {
    // Recorded for the tools, and logged, but the walk goes on: the next frame is asked for all the same.
    status.error = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    console.error(err);
  } finally {
    if (!opts.manual) requestAnimationFrame(frame);
  }
}

if (opts.manual) {
  // A tool drives the clock: each call advances the world by dt seconds and draws one frame.
  let clock = performance.now();
  last = clock;
  (status as unknown as { advance: (dt: number) => void }).advance = (dt: number): void => {
    clock += dt * 1000;
    frame(clock);
  };
  for (let i = 0; i < 3; i++) (status as unknown as { advance: (dt: number) => void }).advance(0);
} else requestAnimationFrame(frame);
