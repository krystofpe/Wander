// The page: options, the canvas in device pixels, the clock, the camera, the frame loop.
import { GROUND, HIM_X, PX_PER_M, VIEW_H, WALK_Y } from '../src/layers.ts';
import { parseOptions, seedOf } from '../src/options.ts';
import { gradeOf, newGrade, newMoment } from '../src/palette.ts';
import { arcX, dayPhase, moonAt, moonPhase, namedWeather, roadMoon, shownHour, sunElevation, weatherAt } from '../src/sky.ts';
import { biomeAt, blended, groundHeight, tendencyAt } from '../src/world.ts';
import { HORIZON } from '../src/paint/land.ts';
import { BIOME_IDS } from '../src/biomes.ts';
import { walkFrame } from '../src/walker.ts';
import { Renderer, paletteRow } from './render.ts';
import { loadAtlas } from './sprites.ts';

const params = new URLSearchParams(location.search);
const opts = parseOptions((k) => params.get(k));
const seed = seedOf(opts.seed ?? 'wander');

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const renderer = new Renderer(canvas, false);

/** Tools read this: ready once the first frozen frame has every chunk in place. */
const status = {
  ready: false,
  frames: 0,
  renderer: renderer.gpu.renderer(),
  error: null as string | null,
  live: renderer.gpu.live,
  chunks: () => renderer.chunksPainted,
};
(window as unknown as { __wander: typeof status }).__wander = status;
window.addEventListener('error', (e) => {
  status.error = String(e.message);
});

function size(): void {
  if (opts.size !== null) {
    canvas.width = opts.size.w;
    canvas.height = opts.size.h;
    canvas.style.width = `${opts.size.w / devicePixelRatio}px`;
    canvas.style.height = `${opts.size.h / devicePixelRatio}px`;
    renderer.resize(opts.size.w, opts.size.h);
  }
}

if (opts.size !== null) size();
else {
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

// ── The clock and his walk (a first version: he walks steadily; the brain comes later) ──
let distance = opts.at ?? 0;
let worldHours = opts.hour ?? 7.5;
let camY = groundHeight(seed, distance) * PX_PER_M;
const moment = newMoment();
const grade = newGrade();
const view = { seed, camX: 0, camY: 0, grade, sunX: 0, sunY: 0, time: 0, wind: 0, horizon: 190, clear: 1, rimSide: 0, rimStrength: 0, sunUp: 0, moonX: 0, moonY: 0, moonPhase: 0.5, moonUp: 0 };
const moonStart = moonPhase(Date.now());
renderer.atlas = await loadAtlas(renderer.gpu);
let walked = 0;
const forced = opts.weather !== null ? namedWeather(opts.weather) : null;

let last = performance.now();
let anim = 0;

function step(now: number): void {
  // Real seconds since the last frame, clamped so a hidden tab or a stall does not jump the world.
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (!opts.frozen) {
    const sim = dt * opts.speed;
    distance += 1.2 * sim;
    walked += 1.2 * sim;
    worldHours += (sim * 24) / (opts.day * 60);
    anim += dt;
  } else anim = opts.t ?? 0;

  const hour = ((worldHours % 24) + 24) % 24;
  const weather = forced ?? weatherAt(worldHours, seed, tendencyAt(seed, distance));
  moment.elevation = sunElevation(hour, opts.realClock);
  moment.morning = shownHour(hour, opts.realClock) < 12;
  moment.cloud = weather.cloud;
  moment.precip = weather.precip;
  moment.fog = weather.fog;
  moment.storm = weather.storm;
  moment.time = anim;
  const ax = arcX(shownHour(hour, opts.realClock));
  moment.side = Math.max(-1, Math.min(1, ax * 2 - 1));
  gradeOf(moment, grade);

  const W = renderer.nativeW;
  const extra = renderer.nativeH - VIEW_H;
  // The camera keeps him at HIM_X and follows the ground's height slowly.
  const targetY = groundHeight(seed, distance) * PX_PER_M;
  camY += (targetY - camY) * (opts.frozen ? 1 : Math.min(1, dt * 0.8));
  view.camX = distance * PX_PER_M - HIM_X * W;
  view.camY = camY;
  view.time = anim;
  view.wind = weather.wind;
  view.horizon = blended(biomeAt(seed, distance), (id) => HORIZON[id]);
  view.clear = 1 - Math.min(1, weather.cloud * 1.1);
  view.sunX = ax * W;
  view.sunY = extra + view.horizon - (moment.elevation / 52) * view.horizon;
  view.sunUp = Math.min(1, Math.max(0, (moment.elevation + 1) / 3));
  view.moonPhase = roadMoon(worldHours, moonStart);
  const moon = moonAt(hour, view.moonPhase, opts.realClock);
  view.moonX = moon.x * W;
  view.moonY = extra + view.horizon - (moon.elevation / 52) * view.horizon;
  view.moonUp = moon.x > 0 && moon.x < 1 ? Math.min(1, Math.max(0, (moon.elevation + 1) / 3)) * Math.min(1, Math.abs(view.moonPhase - 0.5) < 0.47 ? 1 : 0) : 0;
  // Rim light from the low sun's side, strongest at golden hour and dusk, faint by day, gone at night.
  const low = Math.max(0, 1 - Math.abs(moment.elevation - 2) / 14);
  view.rimSide = moment.side > 0.15 ? 1 : moment.side < -0.15 ? -1 : 0;
  view.rimStrength = Math.min(0.85, 0.15 + 0.7 * low) * (1 - grade.night) * (1 - weather.cloud * 0.8);

  // Him: the walk frame from the distance walked; feet on the ground under him.
  const atlas = renderer.atlas;
  renderer.ground.clear();
  if (atlas !== null) {
    const frames = atlas.sheets.wanderer.walk;
    const f = frames[walkFrame(opts.frozen ? (opts.t ?? 0) * 1.2 : walked)];
    const extra = renderer.nativeH - VIEW_H;
    const feetRow = WALK_Y + extra + camY - groundHeight(seed, distance) * PX_PER_M;
    const x = distance * PX_PER_M - view.camX - 14;
    const b = biomeAt(seed, distance);
    renderer.ground.add(x, feetRow - 35, f, paletteRow(GROUND, BIOME_IDS.indexOf(b.a)), paletteRow(GROUND, BIOME_IDS.indexOf(b.b)), b.k, false);
  }
  void dayPhase;
}

function frame(now: number): void {
  try {
    step(now);
    renderer.frame(view, opts.frozen ? 999 : 1);
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
