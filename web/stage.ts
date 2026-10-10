// The stage: from his life and the moment, everything the renderer draws: the camera, the light, the sun and moon,
// his sprite in the pose of his stage, the fire, the smoke. No allocation per frame beyond a few small numbers.
import { BIOME_IDS } from '../src/biomes.ts';
import { GROUND, HIM_X, PX_PER_M, VIEW_H, WALK_Y } from '../src/layers.ts';
import { dragging } from '../src/life.ts';
import type { Life } from '../src/life.ts';
import { gradeOf, newGrade, newMoment } from '../src/palette.ts';
import { HORIZON } from '../src/paint/land.ts';
import { BIOMES } from '../src/biomes.ts';
import { LAYERS, baseline } from '../src/layers.ts';
import { labToBytes } from '../src/palette.ts';
import { arcX, flashAt, moonAt, roadMoon, shownHour, sunElevation } from '../src/sky.ts';
import type { Weather } from '../src/sky.ts';
import { loopFrame, walkFrame } from '../src/walker.ts';
import { unit } from '../src/noise.ts';
import { biomeAt, blended, groundHeight } from '../src/world.ts';
import { ALBEDO_ROW, FOG_AFTER, paletteRow } from './render.ts';
import type { Renderer, View } from './render.ts';
import type { Atlas } from './sprites.ts';
import { Around } from './around.ts';

type Puff = { x: number; y: number; vx: number; vy: number; age: number; life: number; big: boolean; splash: boolean };

/** Quake's "flicker" light style: base brightness, popping upward now and then, read at 10 Hz (research: Light §6). */
const FLICKER = 'mmnmmommommnonmmonqnmmo';
const flicker = (time: number, offset: number): number => (FLICKER.charCodeAt(Math.floor(time * 10 + offset) % FLICKER.length) - 97) / 12;

const PUFFS = 48;

export class Stage {
  readonly view: View;
  readonly moment = newMoment();
  readonly grade = newGrade();
  /** Where the camera frames him: his share of the screen width, eased between walking and stopped. */
  private framing = HIM_X;
  private camY = Number.NaN;
  private readonly puffs: Puff[] = Array.from({ length: PUFFS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, big: false, splash: false }));
  private puffAt = 0;
  private fireSmoke = 0;
  private drift = 0;
  private splashAt = 0;
  private readonly bytes = new Uint8Array(3);
  readonly moonStart: number;
  readonly around = new Around();
  /** Where his head is on the native view this frame (for his thoughts). */
  headX = 0;
  headY = 0;

  /** His share of the screen width (the sound places things by it). */
  get share(): number {
    return this.framing;
  }

  constructor(seed: number, moonStart: number) {
    this.moonStart = moonStart;
    this.view = {
      seed,
      camX: 0,
      camY: 0,
      grade: this.grade,
      sunX: 0,
      sunY: 0,
      time: 0,
      wind: 0,
      horizon: 190,
      clear: 1,
      rimSide: 0,
      rimStrength: 0,
      rim: new Float32Array(3),
      milky: 0,
      aurora: 0,
      shine: new Float32Array(3),
      shineX: 0,
      sunUp: 0,
      moonX: 0,
      moonY: 0,
      moonPhase: 0.5,
      moonUp: 0,
      light: { lights: new Float32Array(24), count: 0, color: new Float32Array([1, 0.62, 0.32]), albedoRow: ALBEDO_ROW },
      bloom: 0.5,
      cover: 0,
      here: new Float32Array([0, 0, 0]),
      cloudDrift: 0,
      fogBase: new Float32Array(4),
      fogHeight: new Float32Array(4),
      fogDensity: new Float32Array(4),
      fogDrift: new Float32Array(4),
      fogColor: new Float32Array(3),
      rain: 0,
      snow: false,
      rainColor: new Float32Array(3),
      flash: 0,
    };
  }

  /** A puff of smoke at native screen coordinates, drifting with the wind. */
  puff(x: number, y: number, wind: number, big: boolean): void {
    const p = this.puffs[this.puffAt];
    this.puffAt = (this.puffAt + 1) % PUFFS;
    p.x = x;
    p.y = y;
    p.vx = wind * 6 + (big ? 0 : 1.2);
    p.vy = big ? -5 : -2.2;
    p.age = 0;
    p.life = big ? 3.2 : 2.4;
    p.big = big;
    p.splash = false;
  }

  /**
   * Fills the view for this frame and queues the sprites. `hour` is the hour of the day; `time` real seconds of
   * animation; `dt` real seconds since the last frame (0 when frozen); `still` snaps the camera (frozen shots).
   */
  update(r: Renderer, atlas: Atlas | null, l: Life, hour: number, natural: boolean, w: Weather, time: number, dt: number, still: boolean, pose: string | null): void {
    const v = this.view;
    const m = this.moment;
    const W = r.nativeW;
    const extra = r.nativeH - VIEW_H;
    m.elevation = sunElevation(hour, natural);
    m.morning = shownHour(hour, natural) < 12;
    m.cloud = w.cloud;
    m.precip = w.precip;
    m.fog = w.fog;
    m.storm = w.storm;
    m.time = time;
    const ax = arcX(shownHour(hour, natural));
    m.side = Math.max(-1, Math.min(1, ax * 2 - 1));
    v.moonPhase = roadMoon(l.clock, this.moonStart);
    m.moonlight = 1 - Math.abs(v.moonPhase - 0.5) * 2;
    m.flash = flashAt(time, l.seed, w) ? 1 : 0;
    v.flash = m.flash;
    gradeOf(m, this.grade);

    // The camera: him left of centre while he walks, eased toward the middle when he stops.
    const stopped = l.stage !== 'walk';
    const want = stopped ? 0.5 : HIM_X;
    this.framing = still ? want : this.framing + (want - this.framing) * Math.min(1, dt / 5);
    const groundY = groundHeight(l.seed, l.at) * PX_PER_M;
    if (Number.isNaN(this.camY) || still) this.camY = groundY;
    else this.camY += (groundY - this.camY) * Math.min(1, dt * 0.8);
    v.camX = l.at * PX_PER_M - this.framing * W;
    v.camY = this.camY;
    v.time = time;
    v.wind = w.wind;
    v.horizon = blended(biomeAt(l.seed, l.at), (id) => HORIZON[id]);
    v.clear = 1 - Math.min(1, w.cloud * 1.1);
    v.sunX = ax * W;
    v.sunY = extra + v.horizon - (m.elevation / 52) * v.horizon;
    v.sunUp = Math.min(1, Math.max(0, (m.elevation + 1) / 3));
    const moon = moonAt(hour, v.moonPhase, natural);
    v.moonX = moon.x * W;
    v.moonY = extra + v.horizon - (moon.elevation / 52) * v.horizon;
    v.moonUp = moon.x > 0 && moon.x < 1 && Math.abs(v.moonPhase - 0.5) < 0.47 ? Math.min(1, Math.max(0, (moon.elevation + 1) / 3)) : 0;
    const low = Math.max(0, 1 - Math.abs(m.elevation - 2) / 14);
    v.rimSide = m.side > 0.15 ? 1 : m.side < -0.15 ? -1 : 0;
    const night = this.grade.night;
    const dayRim = Math.min(0.85, 0.15 + 0.7 * low) * (1 - night) * (1 - w.cloud * 0.8);
    // At night a faint cold edge of sky light keeps him apart from the dark woods behind him (Alto's and Limbo keep
    // the figure readable the same way), from the moon's side when it is up.
    const nightRim = 0.5 * Math.min(1, night * 1.6) * (1 - 0.3 * w.cloud);
    v.rimStrength = Math.max(dayRim, nightRim);
    if (nightRim > dayRim) v.rimSide = v.moonUp > 0.2 ? (v.moonX < W / 2 ? -1 : 1) : 0;
    labToBytes(this.grade.light[0], this.grade.light[1], this.grade.light[2], this.bytes, 0);
    const k = Math.min(1, night * 1.4);
    v.rim[0] = (this.bytes[0] / 255) * (1 - k) + 0.44 * k;
    v.rim[1] = (this.bytes[1] / 255) * (1 - k) + 0.5 * k;
    v.rim[2] = (this.bytes[2] / 255) * (1 - k) + 0.62 * k;

    // The Milky Way on clear, dark nights, washed out by a bright moon and by the lights of towns and ruins; aurora
    // over the cold lands on some clear nights.
    const dark = Math.max(0, (this.grade.night - 0.5) * 2) * (1 - Math.min(1, w.cloud * 1.6)) * (1 - w.fog);
    const here = biomeAt(l.seed, l.at);
    v.here[0] = BIOME_IDS.indexOf(here.a);
    v.here[1] = BIOME_IDS.indexOf(here.b);
    v.here[2] = here.k;
    v.milky = dark * (1 - 0.6 * m.moonlight * v.moonUp) * (1 - 0.5 * blended(here, (id) => (id === 'ruins' || id === 'rail' ? 1 : 0)));
    const cold = blended(here, (id) => (id === 'tundra' ? 1 : id === 'pass' ? 0.7 : id === 'coast' || id === 'saltflat' ? 0.35 : 0));
    const which = Math.floor(l.clock / 24 + 0.5);
    v.aurora = cold * dark * (unit(which, l.seed ^ 0xa0a0) < 0.6 ? 1 : 0);

    // What the water reflects: the sun while it is low, the moon by night, as bright as they can be seen through the
    // cloud and the fog (none at all in a thick one).
    const clear = (1 - Math.min(1, w.cloud * 1.2)) * (1 - w.fog);
    const lowSun = v.sunUp * clear * Math.max(0, 1 - m.elevation / 30);
    if (lowSun > 0.02) {
      labToBytes(this.grade.glow[0] + 0.12, this.grade.glow[1], this.grade.glow[2], this.bytes, 0);
      const seen = Math.min(1, lowSun * 2.5);
      for (let i = 0; i < 3; i++) v.shine[i] = (this.bytes[i] / 255) * seen;
      v.shineX = v.sunX;
    } else {
      const moon = v.moonUp * clear * this.grade.night * (0.4 + 0.6 * m.moonlight);
      v.shine[0] = 0.75 * moon;
      v.shine[1] = 0.78 * moon;
      v.shine[2] = 0.85 * moon;
      v.shineX = v.moonX;
    }

    // The air: clouds, fog veils and valley mist, rain or snow.
    v.cover = w.cloud;
    v.cloudDrift += dt * (1.2 + 5 * w.wind);
    this.drift += dt * (2 + 7 * w.wind);
    // Fog is lit by the sky: a little lighter than the haze, so a veil never darkens the ground it lies on.
    labToBytes(this.grade.fog[0] + 0.09, this.grade.fog[1], this.grade.fog[2], this.bytes, 0);
    v.fogColor[0] = this.bytes[0] / 255;
    v.fogColor[1] = this.bytes[1] / 255;
    v.fogColor[2] = this.bytes[2] / 255;
    const e = m.elevation;
    // Mist gathers after a clear night, is thickest just after sunrise, burns off by mid-morning (research: Depth §13).
    const mistTime = m.morning ? Math.max(0.12, Math.min(1, (e + 14) / 12) * (1 - Math.min(1, Math.max(0, (e - 8) / 20)))) : 0.1 + 0.25 * this.grade.night;
    const mist = blended(biomeAt(l.seed, l.at), (id) => BIOMES[id].air.mist);
    const yh = v.horizon;
    for (let i = 0; i < FOG_AFTER.length; i++) {
      const behind = LAYERS[FOG_AFTER[i] + 1] ?? LAYERS[FOG_AFTER[i]];
      const z = behind.z;
      v.fogBase[i] = i === 3 ? extra + WALK_Y + 14 : extra + baseline(z, yh) + this.camY / z + 4;
      v.fogHeight[i] = i === 3 ? 26 : 6 + 16 / z;
      v.fogDensity[i] = Math.min(0.9, mist * mistTime * 0.75 + w.fog * 0.8) * [0.95, 0.85, 0.6, 0.35][i];
      v.fogDrift[i] = (v.camX / z + this.drift * (1.5 - i * 0.3)) % 1e6;
    }
    v.rain = w.precip;
    v.snow = w.kind === 'snow';
    v.rainColor[0] = Math.min(1, v.fogColor[0] * 0.6 + 0.35);
    v.rainColor[1] = Math.min(1, v.fogColor[1] * 0.6 + 0.38);
    v.rainColor[2] = Math.min(1, v.fogColor[2] * 0.6 + 0.45);

    for (const b of r.batches) b.clear();
    const light = v.light;
    light.count = 0;
    v.bloom = 0.35 + 0.55 * this.grade.night;
    if (atlas === null) return;
    const b = biomeAt(l.seed, l.at);
    const rowA = paletteRow(GROUND, BIOME_IDS.indexOf(b.a));
    const rowB = paletteRow(GROUND, BIOME_IDS.indexOf(b.b));
    // Screen row of the ground's top at a distance, and screen column of a distance.
    const groundRow = (d: number): number => WALK_Y + extra + this.camY - groundHeight(l.seed, d) * PX_PER_M;
    const colOf = (d: number): number => d * PX_PER_M - v.camX;

    // The fire, and its smoke.
    const fire = atlas.sheets.fire;
    if (l.fire !== null) {
      const fx = colOf(l.fire.at);
      const fy = groundRow(l.fire.at);
      const tag = l.fire.heat > 0.55 ? 'burn' : l.fire.heat > 0.2 ? 'low' : l.fire.heat > 0.02 ? 'embers' : 'ashes';
      // The fire's light: it reaches further as it burns up, flickering; by day it hardly shows.
      if (l.fire.heat > 0.02 && light.count < 6) {
        const o = light.count * 4;
        const fl = flicker(time, 0);
        light.lights[o] = fx;
        light.lights[o + 1] = fy - 7;
        light.lights[o + 2] = (26 + 70 * l.fire.heat) * (0.96 + 0.04 * fl);
        light.lights[o + 3] = (0.35 + 0.65 * l.fire.heat) * fl * (0.3 + 0.7 * this.grade.night);
        light.count++;
      }
      const frames = fire[tag];
      const f = frames[loopFrame(frames.map((x) => x[4]), time)];
      r.ground.add(fx - 10, fy - 21, f, rowA, rowB, b.k, false);
      this.fireSmoke -= dt * (0.6 + l.fire.heat);
      if (this.fireSmoke <= 0 && dt > 0) {
        this.fireSmoke = 0.5 + Math.random() * 0.6;
        this.puff(fx + (Math.random() - 0.5) * 3, fy - 12 - l.fire.heat * 6, v.wind, true);
      }
    }

    // The life around him and what moves at the landmarks (behind him on the playfield).
    this.around.update(r, atlas, v, l, { sun: m.elevation, night: this.grade.night, weather: w, time, dt, extra, camY: this.camY, himX: colOf(l.at) });

    // Him.
    const sheet = atlas.sheets.wanderer;
    const stage = pose ?? l.stage;
    const seat = l.seat <= 2 ? 0 : l.seat <= 7 ? 5 : 10;
    let frame: readonly number[];
    let lift = 0;
    const loop = (tag: string): readonly number[] => sheet[tag][loopFrame(sheet[tag].map((x) => x[4]), time)];
    switch (stage) {
      case 'walk':
        frame = sheet.walk[walkFrame(l.walked)];
        break;
      case 'stand':
        frame = l.smoking >= 0 ? sheet.smoke[smokeStage(l)] : loop('stand');
        break;
      case 'smoke':
        frame = sheet.smoke[2];
        break;
      case 'look':
        frame = loop('look');
        break;
      case 'back':
        frame = loop('back');
        break;
      case 'sitdown':
      case 'standup':
      case 'sit':
        frame = l.smoking >= 0 && stage === 'sit' ? sheet[`sitsmoke${seat}`][dragging(l) ? 2 : l.smoking % 9.5 < 4 ? 1 : 0] : loop(`sit${seat}`);
        lift = seat - l.seat;
        break;
      case 'kneel':
      case 'pack':
        frame = loop('kneel');
        break;
      case 'campsit':
      case 'wake':
        frame = l.smoking >= 0 ? sheet.sitsmoke0[dragging(l) ? 2 : l.smoking % 9.5 < 4 ? 1 : 0] : loop('sit0');
        break;
      case 'lie':
        frame = loop('lie');
        break;
      case 'sleep':
        frame = loop('sleep');
        break;
      default:
        frame = sheet.stand[0];
    }
    const hx = colOf(l.at);
    const hy = groundRow(l.at) + lift;
    this.headX = hx;
    this.headY = hy - 32 + (stage === 'sit' || stage === 'campsit' || stage === 'wake' ? 12 : stage === 'lie' || stage === 'sleep' ? 26 : 0);
    r.ground.add(hx - 14, hy - 35, frame, rowA, rowB, b.k, false);

    // The ember lights the inside of his hood a little, more on the drag.
    if (l.smoking >= 0 && light.count < 6) {
      const o = light.count * 4;
      const ey = stage === 'stand' ? 12 : 12 + (34 - (stage === 'campsit' || stage === 'wake' ? 0 : seat)) - 21;
      light.lights[o] = hx - 14 + 22;
      light.lights[o + 1] = hy - 35 + ey;
      light.lights[o + 2] = dragging(l) ? 9 : 6;
      light.lights[o + 3] = (dragging(l) ? 0.9 : 0.45) * (0.4 + 0.6 * this.grade.night);
      light.count++;
    }
    // Cigarette smoke: a thin thread from the ember while he smokes, a cloud on the exhale.
    if (l.smoking >= 0 && dt > 0 && Math.random() < dt * 1.5) {
      const ember = stage === 'stand' ? [22, 12] : [22, 12 + (34 - (stage === 'campsit' || stage === 'wake' ? 0 : seat)) - 21];
      this.puff(hx - 14 + ember[0] + 1, hy - 35 + ember[1] - 1, v.wind, false);
    }
    // Splashes where the rain lands near him.
    if (v.rain > 0.1 && !v.snow && dt > 0) {
      this.splashAt += dt * v.rain * 40;
      while (this.splashAt >= 1) {
        this.splashAt -= 1;
        const sx = Math.random() * W;
        const d = (sx + v.camX) / PX_PER_M;
        const p = this.puffs[this.puffAt];
        this.puffAt = (this.puffAt + 1) % PUFFS;
        p.x = sx;
        p.y = groundRow(d) - 2;
        p.vx = 0;
        p.vy = 0;
        p.age = 0;
        p.life = 0.21;
        p.big = false;
        p.splash = true;
      }
    }
    // The puffs, aging and drifting.
    const puffFrames = fire.puff;
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.life = 0;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx += v.wind * dt * 2;
      const k = p.age / p.life;
      if (p.splash) {
        r.ground.add(p.x, p.y, fire.splash[Math.min(2, Math.floor(k * 3))], rowA, rowB, b.k, false, 0.8);
        continue;
      }
      const fi = Math.min(puffFrames.length - 1, Math.floor((p.big ? 1 : 0) + k * (puffFrames.length - (p.big ? 1 : 0))));
      r.ground.add(p.x, p.y, puffFrames[fi], rowA, rowB, b.k, false, 1 - k * 0.3);
    }
  }
}

/** Which standing-smoke frame: hand up (0, 1), the drag (2, 3), hand down (4). */
function smokeStage(l: Life): number {
  const p = (l.smoking - 2 + 9.5) % 9.5;
  if (p < 0.8) return 1;
  if (p < 1.6) return 2;
  if (p < 2.2) return 3;
  if (p < 3) return 4;
  return 0;
}
