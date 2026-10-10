// The creature's page: its life loaded (or a new one born), lived through the time it was closed, and set in a still
// stretch of the wanderer's world; the stage's sky and air over it, the hollow drawn, its sounds; you at the glass
// with the keys, the mouse and a box to type in; saved every half minute and when the window closes. Its hollow stands
// on his road, and when his road comes by (the live road on the published page, his journey here), he does.
import { BIOMES as WORLD_BIOMES, HOLLOW } from '../../src/biomes.ts';
import { BIOMES, SAVE_EVERY_SEC, STEP_SEC } from '../../src/creature/config.ts';
import { Game } from '../../src/creature/game.ts';
import type { MindLink } from '../../src/creature/game.ts';
import { addDiary, isNightFor, newLife } from '../../src/creature/life.ts';
import type { Life } from '../../src/creature/life.ts';
import type { Reply } from '../../src/creature/mind.ts';
import { parseCreatureOptions } from '../../src/creature/options.ts';
import { hollowBy, homeHollow, roadFrom, satBetween } from '../../src/creature/road.ts';
import type { Saved } from '../../src/creature/road.ts';
import { travellerCame } from '../../src/creature/traveller.ts';
import { catchUp, revive } from '../../src/creature/save.ts';
import type { Away } from '../../src/creature/save.ts';
import { Geometry } from '../../src/creature/scene.ts';
import { localHour } from '../../src/creature/sky.ts';
import { PX_PER_M } from '../../src/layers.ts';
import type { Life as Road, LifeEvent } from '../../src/life.ts';
import { LIVE, LIVE_SEED, STEPS_PER_DAY, liveAt, liveEnv, msOfStep, stepAt, stepLive } from '../../src/live.ts';
import { PLAYFIELD } from '../../src/paint/scene.ts';
import { rng } from '../../src/noise.ts';
import { seedOf } from '../../src/options.ts';
import { namedWeather, shownHour, sunElevation } from '../../src/sky.ts';
import { biomeAt, realm, stretchAt } from '../../src/world.ts';
import { Sound, ticker } from '../audio/sound.ts';
import { Bench } from '../bench.ts';
import { Renderer } from '../render.ts';
import { loadAtlas } from '../sprites.ts';
import { Stage } from '../stage.ts';
import { Hollow } from './hollow.ts';
import { modes } from '../modes.ts';
import { CreatureUi } from './ui.ts';

const params = new URLSearchParams(location.search);
const opts = parseCreatureOptions((k) => params.get(k));
/** The published page: no server; each visitor's creature lives in their own browser, with its own voice. */
const site = document.documentElement.hasAttribute('data-site');
const STORE = 'wander.creature';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new Renderer(canvas, false);

/** Tools read this: ready once the first frames are drawn. */
const status = { ready: false, frames: 0, renderer: renderer.gpu.renderer(), error: null as string | null };
(window as unknown as { __creature: typeof status }).__creature = status;
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

// ── Its life ───────────────────────────────────────────────────────────────

/** Today at `hour`, local time. */
function todayAt(hour: number, now: number = Date.now()): number {
  const d = new Date(now);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return d.getTime();
}

/** Runs that bend time or take pictures are not saved. */
const ephemeral = opts.speed !== 1 || opts.hour !== null || opts.now !== null || opts.manual || opts.weather !== null || opts.bench !== null || params.has('passer');
const start = opts.hour !== null ? todayAt(opts.hour, opts.now ?? Date.now()) : (opts.now ?? Date.now());

/** The saved life (lived through the time away), or a new one; and whether the server can ask Claude. */
async function born(): Promise<{ life: Life; away: Away | null; first: boolean; mind: string; model: string | null; server: boolean }> {
  let saved: unknown = null;
  let mind = 'local';
  let model: string | null = null;
  let server = false;
  if (site) {
    try {
      const raw = localStorage.getItem(STORE);
      saved = raw === null ? null : (JSON.parse(raw) as unknown);
    } catch {
      saved = null;
    }
  } else try {
    const res = await fetch('/api/creature');
    if (res.ok) {
      const body = (await res.json()) as { life?: unknown; mind?: unknown; model?: unknown };
      saved = body.life ?? null;
      mind = body.mind === 'claude' ? 'claude' : 'local';
      model = typeof body.model === 'string' ? body.model : null;
      server = true;
    }
  } catch {
    // No server: a creature of its own, unsaved.
  }
  if (saved !== null) {
    try {
      const life = revive(saved);
      if (opts.biome !== null && opts.biome !== life.biome) {
        addDiary(life, start, `Moved from the ${BIOMES[life.biome].title.toLowerCase()} to the ${BIOMES[opts.biome].title.toLowerCase()}.`);
        life.biome = opts.biome;
      }
      const away = catchUp(life, start, rng((life.seed ^ Math.floor(start / 1000)) >>> 0));
      return { life, away, first: false, mind, model, server };
    } catch (err) {
      console.error(err);
    }
  }
  const seed = opts.seed !== null ? seedOf(opts.seed) : Math.floor(Math.random() * 4294967296);
  const life = newLife(seed, start, { biome: opts.biome ?? undefined, name: opts.name ?? undefined });
  // For pictures and checks: one that already knows you, past its first meeting.
  if (opts.user !== null) {
    life.userName = opts.user;
    life.bond = 0.5;
    return { life, away: null, first: false, mind, model, server };
  }
  return { life, away: null, first: true, mind, model, server };
}

const b = await born();
const life = b.life;

// ── His road ───────────────────────────────────────────────────────────────

/** His journey here, as last saved: the road its hollow stands on, and where he was on it. Null without one. */
async function journeyOf(): Promise<Saved | null> {
  if (site || !b.server) return null;
  try {
    const res = await fetch('/api/journey');
    const j = ((await res.json()) as { journey?: { savedAt?: unknown; life?: { seed?: unknown; at?: unknown } } | null }).journey;
    const seed = j?.life?.seed;
    const at = j?.life?.at;
    const savedAt = j?.savedAt;
    return typeof seed === 'number' && typeof at === 'number' && typeof savedAt === 'number' ? { seed, at, savedAt } : null;
  } catch {
    return null;
  }
}
let journey = await journeyOf();
/** His world, where its hollow stands: the shared live road's on the published page, his own road's here (its own before he has one). */
const worldSeed = site ? LIVE_SEED : (journey?.seed ?? life.seed);
// He came by while the window was closed: it finds the ash on the root by its door.
if (journey !== null && b.away !== null && !ephemeral && !life.away) {
  const t = satBetween(journey, start - b.away.ms, start);
  if (t !== null) travellerCame(life, t, isNightFor(life.traits, localHour(t)) ? 'asleep' : 'day');
}
if (journey !== null && !ephemeral) {
  // The road page may be open in another window, saving as he goes.
  setInterval(() => void journeyOf().then((j) => (journey = j ?? journey)), 60_000);
}

/** The hollow on his road it lives beyond: its door, where he sits when he comes by. */
const home = homeHollow(worldSeed, life.biome);
/**
 * Beyond the hollow lies the deep: a place of its own under a sky of stone (a realm, world.ts), the same for this
 * creature every time. Its scene is painted from this seed; his road stays his.
 */
const sceneSeed = realm(life.seed);
/** Where in the deep the view stands (any place is like any other there, but always the same one). */
const DEEP_AT = 2400;

// ── Its words from Claude, through the server ───────────────────────────────

class Link implements MindLink {
  model: string;
  disabled = false;
  private inFlight = 0;
  private lastVolunteer = -Infinity;

  constructor(model: string) {
    this.model = model;
  }

  get busy(): boolean {
    return this.inFlight > 0;
  }

  mayVolunteer(nowSec: number): boolean {
    return !this.disabled && !this.busy && nowSec - this.lastVolunteer >= 150;
  }

  async ask(l: Life, situation: string, volunteered: boolean, nowSec: number): Promise<Reply | null> {
    if (this.disabled) return null;
    if (volunteered) this.lastVolunteer = nowSec;
    this.inFlight++;
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 22_000);
    try {
      const res = await fetch('/api/creature/say', { method: 'POST', body: JSON.stringify({ life: l, situation, volunteered }), signal: abort.signal });
      const body = (await res.json()) as { reply?: Reply | null; mind?: string };
      if (body.mind === 'local') this.disabled = true;
      return body.reply ?? null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      this.inFlight--;
    }
  }
}
const mind: MindLink | null = b.mind === 'claude' && !opts.offline ? new Link(b.model ?? 'claude') : null;

// ── The scene ──────────────────────────────────────────────────────────────

// Its forest has no road through it; the camera looks a little lower than his, at the ground before the glass.
PLAYFIELD.road = false;
PLAYFIELD.floor = 2.6;
const LIFT = Number(params.get('lift') ?? 64);
const stage = new Stage(sceneSeed, 0.5);
const hollow = new Hollow();
renderer.atlas = await loadAtlas(renderer.gpu);
const ui = new CreatureUi();
/** The walk line's row across the view, from the ground of the world where it lives (the camera never moves). */
const geoFor = (w: number): Geometry => new Geometry(w, (x) => stage.groundRow(renderer, sceneSeed, (x * w + stage.view.camX) / PX_PER_M));
const game = new Game(life, {
  geo: geoFor(renderer.nativeW),
  now: start,
  speed: opts.speed,
  mind,
  away: b.away,
  login: 'friend',
  firstMeeting: b.first,
  ephemeral,
  weather: opts.weather !== null ? namedWeather(opts.weather) : null,
  place: 'deep',
});
const at = DEEP_AT;
/** Past its door is into the clearing: he comes from behind its home and goes on across. */
const dir: 1 | -1 = game.scene.layout.homeLeft ? 1 : -1;

/** Pictures put him where they want him: ?passer=-12 (metres before its door, walking), ?passer=sit. */
const pinned = ((): { d: number; sitting: boolean; walking: boolean } | null => {
  const p = params.get('passer');
  if (p === null) return null;
  return p === 'sit' ? { d: HOLLOW.seat, sitting: true, walking: false } : { d: Number(p), sitting: false, walking: true };
})();
/** The live road (the published page): his life stepped along with the clock, as the road page steps it. */
const road = { env: liveEnv(LIVE_SEED), sim: null as Road | null, step: 0, before: 0, events: [] as LifeEvent[] };

/** Where he is now if his road comes by a hollow (whichever it is, it is its own): metres past its door, and how. */
function passerAt(ms: number): { d: number; sitting: boolean; walking: boolean } | null {
  if (pinned !== null) return pinned;
  if (site) {
    if (ms < LIVE.epoch) return null;
    const target = stepAt(ms) + 1;
    if (road.sim === null || target <= road.step || target - road.step > STEPS_PER_DAY) {
      road.sim = liveAt(LIVE_SEED, target - 1, road.env);
      road.step = target - 1;
    }
    while (road.step < target) {
      road.before = road.sim.at;
      road.sim = stepLive(road.sim, ++road.step, road.env, road.events);
    }
    const s = road.sim;
    const k = Math.min(1, Math.max(0, (ms - msOfStep(target - 1)) / (LIVE.tick * 1000)));
    const by = hollowBy(LIVE_SEED, road.before + (s.at - road.before) * k);
    if (by === null) return null;
    const sitting = (s.stage === 'sit' || s.stage === 'sitdown' || s.stage === 'standup') && s.what === 'hollow' && Math.abs(by.d - HOLLOW.seat) < 2;
    return { d: by.d, sitting, walking: s.stage === 'walk' };
  }
  if (journey === null) return null;
  const pos = roadFrom(journey, ms);
  const by = hollowBy(journey.seed, pos.at);
  return by === null ? null : { d: by.d, sitting: pos.sitting, walking: !pos.sitting };
}
let wasSitting = false;
/** Follows his road: where he is for the creature and the drawing; when he sits down at its door, it keeps the visit. */
function follow(): void {
  const p = passerAt(game.worldNow());
  game.passer = p === null ? null : { ...p, dir };
  if (p?.sitting === true && !wasSitting) game.travellerSat();
  wasSitting = p?.sitting === true;
}
follow();
if (opts.act !== null) game.brain.run(opts.act as Parameters<typeof game.brain.run>[0]);
const fixedWeather = opts.weather !== null ? namedWeather(opts.weather) : null;

const sound = ((): Sound | null => {
  if (opts.manual) return null;
  try {
    return new Sound(life.seed, opts.mute);
  } catch {
    return null;
  }
})();

Object.assign(status, {
  game,
  /** What is happening, for the tools. */
  moment: () => ({
    name: life.name,
    biome: life.biome,
    hour: Math.round(localHour(game.worldNow()) * 100) / 100,
    weather: (fixedWeather ?? game.sky.weather).name,
    mood: game.mood,
    doing: game.brain.current,
    pose: game.body.pose,
    inside: game.body.inside,
    asleep: life.asleep,
    x: Math.round(game.body.x * 1000) / 1000,
    z: Math.round(game.body.z * 1000) / 1000,
    needs: { ...life.needs },
    bond: Math.round(life.bond * 1000) / 1000,
    bubble: game.bubble()?.text ?? null,
    critters: game.scene.critters.map((c) => c.kind),
    mind: mind === null ? 'local' : mind.disabled ? 'local' : 'claude',
    first: b.first,
    away: b.away,
  }),
  sound: () => sound?.status() ?? null,
  /** Where it stands in his world, and where he is (for the tools). */
  road: () => ({ seed: worldSeed, at, home: home?.at ?? null, passer: game.passer, site }),
  /** Saves now (the tools use it). */
  save: () => save(false),
});

// ── Saving and the heartbeat ───────────────────────────────────────────────

function save(beacon: boolean): void {
  if (ephemeral) return;
  if (site) {
    // In this browser only.
    try {
      localStorage.setItem(STORE, JSON.stringify(game.snapshot()));
    } catch {
      // Private window or blocked storage: it lives until the page closes.
    }
    return;
  }
  if (!b.server) return;
  const body = JSON.stringify(game.snapshot());
  if (beacon) navigator.sendBeacon('/api/creature', new Blob([body], { type: 'application/json' }));
  else void fetch('/api/creature', { method: 'PUT', body }).catch(() => {});
}
if (site && !opts.manual) {
  setInterval(() => save(false), SAVE_EVERY_SEC * 1000);
  addEventListener('pagehide', () => save(true));
}
if (b.server && !opts.manual) {
  setInterval(() => save(false), SAVE_EVERY_SEC * 1000);
  try {
    new EventSource('/api/events').addEventListener('save', () => save(false));
  } catch {
    // No server to listen to.
  }
  setInterval(() => void fetch('/api/beat', { method: 'POST' }).catch(() => {}), 15_000);
  addEventListener('pagehide', () => save(true));
}
const wake = (): void => {
  if (document.visibilityState === 'visible') void (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request('screen').catch(() => {});
};
document.addEventListener('visibilitychange', wake);
wake();
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  save(false);
  setTimeout(() => location.reload(), 4000);
});

// ── You ────────────────────────────────────────────────────────────────────

/** A pointer position in native pixels of the view. */
function nativeAt(e: MouseEvent): { x: number; y: number } {
  const x = (e.clientX * devicePixelRatio - renderer.viewOffsetX) / renderer.scale;
  const y = (e.clientY * devicePixelRatio - renderer.viewOffsetY) / renderer.scale;
  return { x, y };
}
let cursorUntil = 0;
canvas.addEventListener('pointermove', (e) => {
  const p = nativeAt(e);
  game.hover(p.x, p.y);
  cursorUntil = performance.now() + 4000;
});
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const p = nativeAt(e);
  game.click(p.x, p.y);
});
// The other mode, the endless road: Tab, or the dim line that shows with the bar and when the mouse moves (not while
// you type to it).
if (!opts.manual) modes('creature', site, () => game.showHud || performance.now() < cursorUntil, () => game.mode !== 'talk' && game.mode !== 'name');
addEventListener('focus', () => game.focus(true));
addEventListener('blur', () => game.focus(false));
document.addEventListener('visibilitychange', () => game.focus(document.visibilityState === 'visible'));

ui.input.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') {
    game.submit(ui.input.value);
    ui.input.value = '';
  } else if (e.key === 'Escape') game.cancel();
});

addEventListener('keydown', (e) => {
  if (game.mode === 'talk' || game.mode === 'name') return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const k = e.key.toLowerCase();
  game.touched();
  if (game.mode === 'journal') {
    if (k === 'j' || k === 'escape' || k === ' ' || k === 'q') game.toggleJournal();
    return;
  }
  switch (k) {
    case 'f':
      game.feed();
      break;
    case 'p':
      game.play();
      break;
    case 'e':
    case ' ':
      e.preventDefault();
      game.pet();
      break;
    case 't':
    case 'enter':
      e.preventDefault();
      game.startTalk();
      break;
    case 'j':
      game.toggleJournal();
      break;
    case 'h':
      game.showHud = !game.showHud;
      break;
    case 'y':
      game.answer(true);
      break;
    case 'n':
      game.answer(false);
      break;
    case 'm':
      if (sound?.waiting !== true) sound?.toggle();
      break;
    case '+':
    case '=':
      sound?.volume(1);
      break;
    case '-':
      sound?.volume(-1);
      break;
  }
});

// ── The frame ──────────────────────────────────────────────────────────────

const bench = opts.bench !== null ? new Bench(renderer.gpu, opts.bench) : null;
let last = performance.now();
let acc = 0;
let anim = 0;
let lastFrame = 0;
let titleAt = 0;

/** Lives the time since the last call in fixed steps (at most half a second's worth at once). */
function live(now: number): void {
  const dt = Math.min(0.5, Math.max(0, (now - last) / 1000));
  last = now;
  anim += dt;
  acc += dt;
  while (acc >= STEP_SEC) {
    acc -= STEP_SEC;
    game.update(STEP_SEC);
  }
  follow();
}

function step(now: number): void {
  if (!opts.manual) live(now);
  if (game.geo.w !== renderer.nativeW) game.geo = geoFor(renderer.nativeW);
  const world = game.worldNow();
  const hour = localHour(world);
  const w = fixedWeather ?? game.sky.weather;
  stage.sky(renderer, { seed: sceneSeed, at, clock: world / 3600000, framing: 0.5, moon: game.sky.moon, lift: LIFT }, hour, true, w, anim, opts.manual ? 0.05 : Math.min(0.1, (now - lastFrame) / 1000), status.frames === 0);
  if (renderer.atlas !== null) hollow.draw(renderer, renderer.atlas, stage, game, sceneSeed, at, anim);
  // Its words above its head, the bar and the hints, the journal, the box to type in.
  const css = renderer.scale / devicePixelRatio;
  ui.setScale(css);
  ui.say(game.bubble(), (renderer.viewOffsetX + hollow.headX * renderer.scale) / devicePixelRatio, (renderer.viewOffsetY + hollow.headY * renderer.scale) / devicePixelRatio);
  ui.showBar(game.statusBar(), game.showHud);
  ui.showHints(game.hints(), game.showHud || game.mode !== 'live');
  ui.showJournal(game.mode === 'journal' ? game.journal() : null);
  ui.showTalk(game.mode === 'talk' || game.mode === 'name' ? game.mode : null);
  document.body.classList.toggle('cursor', performance.now() < cursorUntil);
  // It taps on the glass while you are in another window: a tap, and the window's title says so.
  if (game.knocked && now - titleAt > 1000) {
    titleAt = now;
    document.title = document.title.startsWith('(tap tap)') ? life.name : `(tap tap) ${life.name}`;
  } else if (!game.knocked && document.title !== life.name) document.title = life.name;
}

/** What the sound hears: the place, the hour, the weather, its small steps. */
function hearing(): Parameters<Sound['tick']>[0] {
  const world = game.worldNow();
  const hour = localHour(world);
  const w = fixedWeather ?? game.sky.weather;
  const blend = biomeAt(sceneSeed, at);
  const walking = game.body.pose === 'walk' && game.body.visible && !game.body.inside;
  return {
    seed: sceneSeed,
    time: anim,
    blend,
    place: stretchAt(sceneSeed, at).k,
    hour: shownHour(hour, true),
    sun: sunElevation(hour, true),
    weather: w,
    stage: walking ? 'walk' : 'stand',
    walked: (game.body.walked / PX_PER_M) * 1.6,
    ground: WORLD_BIOMES[BIOMES[game.place].world].ground.step,
    fire: 0,
    fireX: 0.5,
    himX: game.body.x,
    landmark: null,
    speed: opts.speed,
  };
}

if (!opts.manual) {
  ticker(50, () => {
    try {
      // A hidden window: its life goes on all the same.
      if (document.hidden || performance.now() - lastFrame > 250) live(performance.now());
      if (sound !== null) {
        const w = fixedWeather ?? game.sky.weather;
        sound.tick(hearing(), w.kind === 'rain' && w.precip > 0.3);
      }
    } catch (err) {
      status.error = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      console.error(err);
    }
  });
}

function frame(now: number): void {
  try {
    bench?.begin(now);
    step(now);
    renderer.frame(stage.view, status.frames < 3 ? 999 : 1);
    bench?.end();
    if (bench?.report != null && (status as unknown as { bench?: unknown }).bench === undefined) (status as unknown as { bench: unknown }).bench = bench.report;
    lastFrame = now;
    status.frames++;
    if (status.frames >= 3) status.ready = true;
  } catch (err) {
    status.error = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    console.error(err);
  } finally {
    if (!opts.manual) requestAnimationFrame(frame);
  }
}

if (opts.manual) {
  // A tool drives the clock: each call lives dt seconds in fixed steps and draws one frame.
  let clock = performance.now();
  (status as unknown as { advance: (dt: number) => void }).advance = (dt: number): void => {
    for (let t = 0; t < dt - 1e-9; t += STEP_SEC) game.update(STEP_SEC);
    follow();
    anim += dt;
    clock += dt * 1000;
    frame(clock);
  };
  for (let i = 0; i < 3; i++) (status as unknown as { advance: (dt: number) => void }).advance(0);
} else requestAnimationFrame(frame);
