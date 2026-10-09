// The page: options, the canvas in device pixels, his life stepped by the clock, the stage drawn by the renderer.
import { BIOMES } from '../src/biomes.ts';
import type { BiomeId } from '../src/biomes.ts';
import { catchUp, newJourney, reviveJourney, roadWord } from '../src/journal.ts';
import type { Journey } from '../src/journal.ts';
import { stepLife, thoughtContext, weatherOf } from '../src/life.ts';
import type { Env, Life, LifeEvent, Stage as LifeStage } from '../src/life.ts';
import { rng } from '../src/noise.ts';
import { parseOptions, seedOf } from '../src/options.ts';
import { dayOf, hourOfDay, localHour, moonPhase, namedWeather, shownHour } from '../src/sky.ts';
import { localThought } from '../src/thoughts.ts';
import { stretchAt } from '../src/world.ts';
import { Ui } from './ui.ts';
import { Renderer } from './render.ts';
import { loadAtlas } from './sprites.ts';
import { Stage } from './stage.ts';

const params = new URLSearchParams(location.search);
const opts = parseOptions((k) => params.get(k));

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

const env: Env = {
  hourAt: (clock) => (opts.realClock ? localHour(Date.now()) : hourOfDay(clock)),
  natural: opts.realClock,
  weather: opts.weather !== null ? namedWeather(opts.weather) : null,
};
const dayLength = opts.day * 60;
/** Runs that bend time or only take pictures are not saved. */
const ephemeral = opts.frozen || opts.manual || opts.speed !== 1 || opts.hour !== null || opts.bench !== null || opts.at !== null;
const tool = opts.frozen || opts.manual || opts.bench !== null;

/** The road: the saved one (caught up on the time away), or a new one. */
async function road(): Promise<{ journey: Journey; mind: string }> {
  let saved: unknown = null;
  let mind = 'local';
  if (!tool) {
    try {
      const res = (await (await fetch('/api/journey')).json()) as { journey: unknown; mind: string };
      saved = res.journey;
      mind = res.mind;
    } catch {
      // No server (opened as a plain file): a road of its own, unsaved.
    }
  }
  if (saved !== null && !opts.fresh) {
    try {
      const j = reviveJourney(saved);
      if (opts.seed === null || opts.seed === j.word) {
        catchUp(j, Date.now(), dayLength);
        return { journey: j, mind };
      }
    } catch {
      // Not a journey: start a new road.
    }
  }
  const word = opts.seed ?? roadWord(Math.random());
  const j = newJourney(word, Date.now(), moonPhase(Date.now()), opts.hour ?? (tool ? 7.5 : 15.6));
  if (opts.at !== null) {
    j.life.at = opts.at;
  }
  return { journey: j, mind };
}

const { journey, mind } = await road();
const life = journey.life;
status.life = life;
(status as unknown as { mind: string }).mind = mind;
const stage = new Stage(life.seed, journey.moonStart);
renderer.atlas = await loadAtlas(renderer.gpu);
const ui = new Ui();
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
  if (ephemeral) return;
  journey.savedAt = Date.now();
  const body = JSON.stringify(journey);
  if (beacon) navigator.sendBeacon('/api/journey', new Blob([body], { type: 'application/json' }));
  else void fetch('/api/journey', { method: 'PUT', body }).catch(() => {});
}
if (!tool) {
  setInterval(() => save(false), 30_000);
  setInterval(() => void fetch('/api/beat', { method: 'POST' }).catch(() => {}), 15_000);
  addEventListener('pagehide', () => save(true));
  // Keep the screen awake while he walks (asked again whenever the page is shown).
  const wake = (): void => {
    if (document.visibilityState === 'visible') void (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request('screen').catch(() => {});
  };
  document.addEventListener('visibilitychange', wake);
  wake();
}

// ── His thoughts ───────────────────────────────────────────────────────────

let asking = false;

/** A thought is due: ask Claude (through the server) if it is there, otherwise, or if it is slow, the local voice. */
function think(now: number): void {
  if (asking) return;
  const ctx = thoughtContext(life, env, stage.view.moonPhase);
  const local = localThought(ctx, Math.random, life.thoughts);
  const show = (text: string): void => {
    ui.say(text, anim);
    life.thoughts.push(text);
    if (life.thoughts.length > 8) life.thoughts.shift();
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
  fetch('/api/thought', { method: 'POST', body: JSON.stringify({ ...ctx, place: BIOMES[ctx.biome as BiomeId]?.title ?? ctx.biome, recent: life.thoughts }), signal: abort.signal })
    .then((r) => r.json() as Promise<{ thought: string | null }>)
    .then((r) => show(r.thought ?? local))
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
  } else if (k === 'm') soundToggle();
});
let soundToggle = (): void => {};

const pad = (n: number): string => String(Math.floor(n)).padStart(2, '0');
const clockText = (h: number): string => `${pad(h)}:${pad((h % 1) * 60)}`;

function barText(hour: number): string {
  const w = weatherOf(life, env);
  const place = BIOMES[stretchAt(life.seed, life.at).biome].title;
  const km = (life.at / 1000).toFixed(1);
  return `day ${dayOf(life.clock)} on the road · ${km} km · ${place} · ${clockText(shownHour(hour, opts.realClock))} · ${w.name} · mind: ${mind}`;
}

function logLines(): string[] {
  const out: string[] = [`the road from “${journey.word}”`];
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
let uiAt = 0;

function step(now: number): void {
  // Real seconds since the last frame, clamped so a hidden tab or a stall does not jump the world.
  const dt = opts.frozen ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  anim += dt;
  if (!opts.frozen) {
    stepLife(life, dt * opts.speed, dayLength, env, events);
    for (const e of events) {
      if (e.type === 'thought') think(now);
      if (status.events.length < 400 && e.type !== 'drag' && e.type !== 'exhale') {
        const what = e.type === 'stage' ? e.stage : e.type === 'act' ? e.act : e.type === 'biome' ? e.id : e.type === 'landmark' ? e.kind : '';
        status.events.push(`${life.clock.toFixed(2)} ${e.type}:${what}`);
      }
    }
  }
  const hour = env.hourAt(life.clock);
  stage.update(renderer, renderer.atlas, life, hour, opts.realClock, weatherOf(life, env), anim, dt, opts.frozen, null);
  // Text sits in CSS pixels: one art pixel is scale / devicePixelRatio of them.
  const css = renderer.scale / devicePixelRatio;
  ui.setScale(css);
  const skyRow = renderer.nativeH - 360 + stage.view.horizon - 92;
  ui.place((renderer.viewOffsetX + stage.headX * renderer.scale) / devicePixelRatio, (renderer.viewOffsetY + skyRow * renderer.scale) / devicePixelRatio, anim);
  if (now - uiAt > 500) {
    uiAt = now;
    ui.showBar(barText(hour));
    ui.showLog(logLines());
  }
}

if (opts.frozen && params.get('thought') !== null) {
  const ctx = thoughtContext(life, env, 0.5);
  ui.say(params.get('thought') || localThought(ctx, rng(seedOf(params.get('thought') ?? '') || 1), []), 0, 999, true);
}

function frame(now: number): void {
  try {
    step(now);
    renderer.frame(stage.view, opts.frozen ? 999 : 1);
    status.frames++;
    if (status.frames >= 3) status.ready = true;
  } catch (err) {
    status.error = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    throw err;
  }
  if (!opts.manual) requestAnimationFrame(frame);
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
