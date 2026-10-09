// The page: options, the canvas in device pixels, his life stepped by the clock, the stage drawn by the renderer.
import { newLife, stepLife, weatherOf } from '../src/life.ts';
import type { Env, Life, LifeEvent, Stage as LifeStage } from '../src/life.ts';
import { parseOptions, seedOf } from '../src/options.ts';
import { hourOfDay, localHour, moonPhase, namedWeather } from '../src/sky.ts';
import { Renderer } from './render.ts';
import { loadAtlas } from './sprites.ts';
import { Stage } from './stage.ts';

const params = new URLSearchParams(location.search);
const opts = parseOptions((k) => params.get(k));
const seed = seedOf(opts.seed ?? 'wander');

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
const life = newLife(seed, opts.at ?? 0, opts.hour ?? 7.5);
status.life = life;
const stage = new Stage(seed, moonPhase(Date.now()));
renderer.atlas = await loadAtlas(renderer.gpu);

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

const events: LifeEvent[] = [];
let last = performance.now();
let anim = opts.t ?? 0;

function step(now: number): void {
  // Real seconds since the last frame, clamped so a hidden tab or a stall does not jump the world.
  const dt = opts.frozen ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  anim += dt;
  if (!opts.frozen) {
    stepLife(life, dt * opts.speed, dayLength, env, events);
    for (const e of events) {
      if (status.events.length < 400 && e.type !== 'drag' && e.type !== 'exhale') {
        const what = e.type === 'stage' ? e.stage : e.type === 'act' ? e.act : e.type === 'biome' ? e.id : e.type === 'landmark' ? e.kind : '';
        status.events.push(`${life.clock.toFixed(2)} ${e.type}:${what}`);
      }
    }
  }
  const hour = env.hourAt(life.clock);
  stage.update(renderer, renderer.atlas, life, hour, opts.realClock, weatherOf(life, env), anim, dt, opts.frozen, null);
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
