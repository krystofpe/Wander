// The creature's page: its life loaded (or a new one born), lived through the time it was closed, and set in a still
// stretch of the wanderer's world; the stage's sky and air over it, the hollow drawn, its sounds; you at the glass
// with the keys, the mouse and a box to type in; saved every half minute and when the window closes.
import { BIOMES as WORLD_BIOMES } from '../../src/biomes.ts';
import { BIOMES, SAVE_EVERY_SEC, STEP_SEC } from '../../src/creature/config.ts';
import { Game } from '../../src/creature/game.ts';
import type { MindLink } from '../../src/creature/game.ts';
import { addDiary, newLife } from '../../src/creature/life.ts';
import type { Life } from '../../src/creature/life.ts';
import type { Reply } from '../../src/creature/mind.ts';
import { parseCreatureOptions } from '../../src/creature/options.ts';
import { catchUp, revive } from '../../src/creature/save.ts';
import type { Away } from '../../src/creature/save.ts';
import { Geometry } from '../../src/creature/scene.ts';
import { localHour } from '../../src/creature/sky.ts';
import { PX_PER_M } from '../../src/layers.ts';
import { PLAYFIELD } from '../../src/paint/scene.ts';
import { rng } from '../../src/noise.ts';
import { seedOf } from '../../src/options.ts';
import { namedWeather, shownHour, sunElevation } from '../../src/sky.ts';
import { biomeAt, firstStretchOf, landmarkNear, stretchAt } from '../../src/world.ts';
import { Sound, ticker } from '../audio/sound.ts';
import { Bench } from '../bench.ts';
import { Renderer } from '../render.ts';
import { loadAtlas } from '../sprites.ts';
import { Stage } from '../stage.ts';
import { Hollow } from './hollow.ts';
import { CreatureUi } from './ui.ts';

const params = new URLSearchParams(location.search);
const opts = parseCreatureOptions((k) => params.get(k));

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
const ephemeral = opts.speed !== 1 || opts.hour !== null || opts.manual || opts.weather !== null || opts.bench !== null;
const start = opts.hour !== null ? todayAt(opts.hour) : Date.now();

/** The saved life (lived through the time away), or a new one; and whether the server can ask Claude. */
async function born(): Promise<{ life: Life; away: Away | null; first: boolean; mind: string; model: string | null; server: boolean }> {
  let saved: unknown = null;
  let mind = 'local';
  let model: string | null = null;
  let server = false;
  try {
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
  return { life, away: null, first: true, mind, model, server };
}

const b = await born();
const life = b.life;

/** Where in the wanderer's world it lives: the middle of a stretch of its land, away from his landmarks. */
function homeOf(seed: number): number {
  const world = BIOMES[life.biome].world;
  for (let from = 0; from < 2e6; ) {
    const s = firstStretchOf(seed, world, from);
    if (s === null) break;
    for (const k of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      const at = s.start + (s.end - s.start) * k;
      if (s.end - s.start > 320 && landmarkNear(seed, at, 260) === null && stretchAt(seed, at).biome === world) return at;
    }
    from = s.end + 1;
  }
  return 1000;
}
const at = homeOf(life.seed);

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
const stage = new Stage(life.seed, 0.5);
const hollow = new Hollow();
renderer.atlas = await loadAtlas(renderer.gpu);
const ui = new CreatureUi();
/** The walk line's row across the view, from the ground of the world where it lives (the camera never moves). */
const geoFor = (w: number): Geometry => new Geometry(w, (x) => stage.groundRow(renderer, life.seed, (x * w + stage.view.camX) / PX_PER_M));
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
});
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
  /** Saves now (the tools use it). */
  save: () => save(false),
});

// ── Saving and the heartbeat ───────────────────────────────────────────────

function save(beacon: boolean): void {
  if (ephemeral || !b.server) return;
  const body = JSON.stringify(game.snapshot());
  if (beacon) navigator.sendBeacon('/api/creature', new Blob([body], { type: 'application/json' }));
  else void fetch('/api/creature', { method: 'PUT', body }).catch(() => {});
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
}

function step(now: number): void {
  if (!opts.manual) live(now);
  if (game.geo.w !== renderer.nativeW) game.geo = geoFor(renderer.nativeW);
  const world = game.worldNow();
  const hour = localHour(world);
  const w = fixedWeather ?? game.sky.weather;
  stage.sky(renderer, { seed: life.seed, at, clock: world / 3600000, framing: 0.5, moon: game.sky.moon, lift: LIFT }, hour, true, w, anim, opts.manual ? 0.05 : Math.min(0.1, (now - lastFrame) / 1000), status.frames === 0);
  if (renderer.atlas !== null) hollow.draw(renderer, renderer.atlas, stage, game, at, anim);
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
  const blend = biomeAt(life.seed, at);
  const walking = game.body.pose === 'walk' && game.body.visible && !game.body.inside;
  return {
    seed: life.seed,
    time: anim,
    blend,
    place: stretchAt(life.seed, at).k,
    hour: shownHour(hour, true),
    sun: sunElevation(hour, true),
    weather: w,
    stage: walking ? 'walk' : 'stand',
    walked: (game.body.walked / PX_PER_M) * 1.6,
    ground: w.kind === 'snow' && w.precip > 0.4 ? 'snow' : WORLD_BIOMES[BIOMES[life.biome].world].ground.step,
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
    anim += dt;
    clock += dt * 1000;
    frame(clock);
  };
  for (let i = 0; i < 3; i++) (status as unknown as { advance: (dt: number) => void }).advance(0);
} else requestAnimationFrame(frame);
