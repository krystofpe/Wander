// The life around him and what moves at the landmarks: a flock of birds crossing by day, bats at dusk, fireflies on
// warm nights, a deer at the edge of the trees that looks up and bounds away, a fox that trots past and stops to
// watch, a fish leaping under the bridge, leaves falling in the autumn woods; smoke from the lone house's chimney,
// the mast's blinking lamp, the lighthouse's flash, a distant train. Rare and quiet (brief: Life around him). Each
// thing lives in the layer it belongs to and moves with that layer's parallax.
import { BIOME_IDS } from '../src/biomes.ts';
import type { BiomeId } from '../src/biomes.ts';
import { GROUND, LAYERS, PX_PER_M, WALK_Y } from '../src/layers.ts';
import type { Life } from '../src/life.ts';
import { unit } from '../src/noise.ts';
import { landBase, markGround } from '../src/paint/land.ts';
import { BRIDGE, MARK_POINTS, marksOn } from '../src/paint/landmarks.ts';
import type { Placed } from '../src/paint/landmarks.ts';
import { bankTopAt, markTop } from '../src/paint/scene.ts';
import type { Weather } from '../src/sky.ts';
import { biomeAt, blended, groundHeight, landmarkNear, share } from '../src/world.ts';
import { paletteRow } from './render.ts';
import type { Renderer, View } from './render.ts';
import type { Atlas } from './sprites.ts';

const layerIndex = (name: string): number => LAYERS.findIndex((l) => l.name === name);
const RIDGE = layerIndex('ridge');
const FARHILLS = layerIndex('farhills');
const HILLS = layerIndex('hills');
const MID = layerIndex('mid');
const NEAR = layerIndex('near');

/** What the moment is, for the life around him. */
export type Moment = {
  readonly sun: number;
  readonly night: number;
  readonly weather: Weather;
  readonly time: number;
  readonly dt: number;
  /** Rows the native view is taller than 360, and the camera's height. */
  readonly extra: number;
  readonly camY: number;
  /** His column on screen. */
  readonly himX: number;
};

type Bird = { u: number; y: number; phase: number; bob: number };
type Puff = { li: number; u: number; y: number; vy: number; age: number; life: number };
type Fly = { u: number; y: number; phase: number; speed: number };
type Leaf = { x: number; y: number; vx: number; vy: number; phase: number; floor: number };
type Deer = { cell: number; li: number; u: number; state: 'graze' | 'lift' | 'stand' | 'run'; time: number; dir: number };
type Fox = { cell: number; u: number; state: 'trot' | 'sit' | 'gone'; time: number; sat: boolean };

const DEER_HOMES: Partial<Record<BiomeId, number>> = { pine: 0.5, birch: 0.7, autumn: 0.7, meadow: 0.5, stones: 0.3, ruins: 0.3, rail: 0.3, swamp: 0.2 };
const FOX_HOMES: Partial<Record<BiomeId, number>> = { pine: 0.4, birch: 0.5, autumn: 0.5, meadow: 0.5, plateau: 0.4, ruins: 0.5, rail: 0.5, stones: 0.4, swamp: 0.3, desert: 0.3, tundra: 0.3 };
const FIREFLY_HOMES: Partial<Record<BiomeId, number>> = { meadow: 1, birch: 0.8, swamp: 1, pine: 0.4, autumn: 0.3, ruins: 0.6, rail: 0.5 };
const BAT_HOMES: Partial<Record<BiomeId, number>> = { pine: 0.8, birch: 0.8, autumn: 0.8, swamp: 1, ruins: 1, rail: 0.5, meadow: 0.4, stones: 0.5 };

/** A chance at d from per-biome weights, blended. */
const homes = (seed: number, d: number, table: Partial<Record<BiomeId, number>>): number => blended(biomeAt(seed, d), (id) => table[id] ?? 0);

export class Around {
  private readonly birds: Bird[] = [];
  private birdsDir = 1;
  private nextFlock = 20;
  private readonly puffs: Puff[] = Array.from({ length: 40 }, () => ({ li: 0, u: 0, y: 0, vy: 0, age: 0, life: 0 }));
  private puffAt = 0;
  private smokeAt = 0;
  private readonly flies: Fly[] = Array.from({ length: 28 }, (_, i) => ({ u: 0, y: 0, phase: i * 1.7, speed: 0.6 + (i % 5) * 0.15 }));
  private batsUntil = 0;
  private nextBats = 40;
  private batsAt = 0;
  private readonly leaves: Leaf[] = [];
  private leafAt = 0;
  private deer: Deer | null = null;
  private readonly fled = new Set<number>();
  private fox: Fox | null = null;
  private readonly foxSeen = new Set<number>();
  private fish = -1;
  private fishX = 0;
  private nextFish = 4;
  private trainPass = -1;
  /** Set for one frame when a train begins to cross where he can hear it: its place across the screen. */
  trainStarted: number | null = null;
  /** How many of each have shown themselves (the watch tool reads it). */
  readonly seen = { flock: 0, bats: 0, fireflies: 0, leaves: 0, deer: 0, fox: 0, fish: 0, train: 0, smoke: 0, lamp: 0, beacon: 0 };

  update(r: Renderer, atlas: Atlas, v: View, l: Life, m: Moment): void {
    this.trainStarted = null;
    const seed = l.seed;
    const W = r.nativeW;
    const blend = biomeAt(seed, l.at);
    const rows = (li: number, d: number): [number, number, number] => {
      const b = biomeAt(seed, d);
      return [paletteRow(li, BIOME_IDS.indexOf(b.a)), paletteRow(li, BIOME_IDS.indexOf(b.b)), b.k];
    };
    // Screen position of a layer's texture column and row.
    const sx = (li: number, u: number): number => u - v.camX / LAYERS[li].z;
    const sy = (li: number, row: number): number => row - (LAYERS[li].top - m.extra - m.camY / LAYERS[li].z);
    const dAt = (li: number, u: number): number => (u * LAYERS[li].z) / PX_PER_M;
    const frame = (sheet: string, tag: string, t: number): readonly number[] => {
      const frames = atlas.sheets[sheet][tag];
      let total = 0;
      for (const f of frames) total += f[4];
      let x = ((t * 1000) % total + total) % total;
      for (const f of frames) {
        x -= f[4];
        if (x < 0) return f;
      }
      return frames[0];
    };
    const wet = m.weather.precip > 0.3 || m.weather.storm;

    this.landmarks(r, atlas, v, l, m, sx, sy, rows, frame);

    // ── Birds: a loose flock crossing the sky by day, now and then.
    const dt = m.dt;
    if (this.birds.length === 0) {
      this.nextFlock -= dt;
      if (this.nextFlock <= 0 && m.sun > -2 && !wet) {
        this.nextFlock = 50 + Math.random() * 110;
        const n = 4 + Math.floor(Math.random() * 8);
        this.birdsDir = Math.random() < 0.5 ? 1 : -1;
        const start = v.camX / LAYERS[RIDGE].z + (this.birdsDir > 0 ? -30 : W + 30);
        const y = m.extra + v.horizon - 40 - Math.random() * 100;
        this.seen.flock++;
        for (let i = 0; i < n; i++) this.birds.push({ u: start - this.birdsDir * (i * 7 + Math.random() * 10), y: y + Math.abs(i - n / 2) * 2.5 + Math.random() * 4, phase: Math.random(), bob: Math.random() * 6 });
      }
    } else {
      const [a, b, k] = rows(RIDGE, l.at);
      let visible = false;
      for (const bird of this.birds) {
        bird.u += this.birdsDir * 26 * dt;
        const x = sx(RIDGE, bird.u);
        if (x > -40 && x < W + 40) visible = true;
        r.batches[RIDGE].add(x, bird.y + Math.sin(m.time * 1.3 + bird.bob) * 1.5, frame('small', 'bird', m.time + bird.phase), a, b, k, this.birdsDir < 0);
      }
      const lead = sx(RIDGE, this.birds[0].u);
      if (!visible && (this.birdsDir > 0 ? lead > W : lead < 0)) this.birds.length = 0;
    }

    // ── Bats: at dusk and in the night, a few flitting above the trees for a while.
    const batty = homes(seed, l.at, BAT_HOMES);
    if (m.time > this.batsUntil) {
      this.nextBats -= dt;
      if (this.nextBats <= 0 && m.sun < -2 && m.sun > -20 && batty > 0.2 && !wet) {
        this.batsUntil = m.time + 20 + Math.random() * 25;
        this.batsAt = v.camX / LAYERS[NEAR].z + W * (0.2 + Math.random() * 0.6);
        this.nextBats = 60 + Math.random() * 100;
        this.seen.bats++;
      }
    } else {
      const [a, b, k] = rows(NEAR, dAt(NEAR, this.batsAt));
      const left = this.batsUntil - m.time;
      const base = m.extra + v.horizon + 10;
      for (let i = 0; i < 3; i++) {
        const t = m.time * (1 + i * 0.17) + i * 2.1;
        const x = sx(NEAR, this.batsAt) + 50 * Math.sin(t * 0.9) + 18 * Math.sin(t * 3.1) + (left < 4 ? (4 - left) * 50 * (i % 2 ? 1 : -1) : 0);
        const y = base - 30 + 14 * Math.sin(t * 1.7 + i) + 6 * Math.sin(t * 5.3);
        r.batches[NEAR].add(x, y, frame('small', 'bat', m.time + i * 0.37), a, b, k, Math.cos(t * 0.9) < 0);
      }
    }

    // ── Fireflies: warm, dry nights in the meadows and woods, drifting low and blinking.
    const flies = homes(seed, l.at, FIREFLY_HOMES) * m.night * (wet || m.weather.kind === 'snow' ? 0 : 1);
    if (flies > 0.05) {
      const [a, b, k] = rows(GROUND, l.at);
      const n = Math.round(this.flies.length * Math.min(1, flies));
      this.seen.fireflies = Math.max(this.seen.fireflies, n);
      for (let i = 0; i < n; i++) {
        const f = this.flies[i];
        // Each keeps to its own place on the playfield, wandering round it; one that falls behind comes round again
        // just ahead, out of sight, as the road scrolls.
        const span = W + 80;
        const off = (i * 97.3) % span;
        const u = off + span * Math.ceil((v.camX - 40 - off) / span) + 30 * Math.sin(m.time * 0.21 * f.speed + f.phase);
        const ground = WALK_Y + m.extra + m.camY - groundHeight(seed, u / PX_PER_M) * PX_PER_M;
        const y = ground - 6 - ((i * 13) % 34) + 6 * Math.sin(m.time * 0.5 * f.speed + f.phase * 2);
        const blink = Math.sin(m.time * (0.7 + f.speed) + f.phase * 3);
        if (blink < 0.2) continue;
        r.ground.add(u - v.camX, y, frame('small', 'firefly', 0), a, b, k, false, Math.min(1, (blink - 0.2) * 2.5));
      }
    }

    // ── Leaves falling in the autumn woods (a few in the birches), drifting on the wind.
    const autumn = share(blend, 'autumn') + 0.25 * share(blend, 'birch');
    if (autumn > 0.05 && dt > 0) {
      this.leafAt += dt * autumn * (1.2 + 3 * Math.abs(m.weather.wind));
      while (this.leafAt >= 1 && this.leaves.length < 40) {
        this.leafAt -= 1;
        // Leaves keep their place in the world (u, the playfield's column) while the road scrolls under them.
        const u = v.camX + Math.random() * W;
        const ground = WALK_Y + m.extra + m.camY - groundHeight(seed, u / PX_PER_M) * PX_PER_M;
        this.seen.leaves++;
        this.leaves.push({ x: u, y: ground - 60 - Math.random() * 120, vx: 0, vy: 9 + Math.random() * 8, phase: Math.random() * 6, floor: ground - 1 });
      }
      this.leafAt = Math.min(this.leafAt, 1);
    }
    if (this.leaves.length > 0) {
      const [a, b, k] = rows(GROUND, l.at);
      for (let i = this.leaves.length - 1; i >= 0; i--) {
        const f = this.leaves[i];
        f.x += (m.weather.wind * 22 + Math.sin(m.time * 2.3 + f.phase) * 8) * dt;
        f.y += f.vy * dt;
        const x = f.x - v.camX;
        if (f.y >= f.floor || x < -20 || x > W + 20) {
          this.leaves.splice(i, 1);
          continue;
        }
        r.ground.add(x, f.y, frame('small', 'leaf', m.time + f.phase), a, b, k, false);
      }
    }

    this.deerAndFox(r, atlas, v, l, m, sx, sy, rows, frame);

    // ── A fish leaping in the river while he crosses the bridge.
    const bridge = landmarkNear(seed, l.at, BRIDGE.half + 20);
    if (bridge?.kind === 'bridge') {
      const ground = WALK_Y + m.extra + m.camY;
      if (this.fish < 0) {
        this.nextFish -= dt;
        if (this.nextFish <= 0) {
          this.fish = 0;
          this.fishX = bridge.at * PX_PER_M + (Math.random() * 2 - 1) * (BRIDGE.half - 1) * PX_PER_M;
          this.nextFish = 5 + Math.random() * 10;
          this.seen.fish++;
        }
      } else {
        this.fish += dt;
        const [a, b, k] = rows(GROUND, bridge.at);
        const t = this.fish / 0.5;
        if (t >= 1.3) this.fish = -1;
        else {
          const water = ground + BRIDGE.deep;
          const x = this.fishX - v.camX;
          if (t < 1) r.ground.add(x, water - 3 - Math.sin(t * Math.PI) * 9, atlas.sheets.small.fish[Math.min(2, Math.floor(t * 3))], a, b, k, false);
          else r.ground.add(x + 1, water - 2, atlas.sheets.fire.splash[Math.min(2, Math.floor((t - 1) * 10))], a, b, k, false, 0.9);
        }
      }
    }
  }

  /** Smoke from the house, the mast's lamp, the lighthouse's flash, and a train crossing on its line. */
  private landmarks(
    r: Renderer,
    atlas: Atlas,
    v: View,
    l: Life,
    m: Moment,
    sx: (li: number, u: number) => number,
    sy: (li: number, row: number) => number,
    rows: (li: number, d: number) => [number, number, number],
    frame: (sheet: string, tag: string, t: number) => readonly number[],
  ): void {
    const seed = l.seed;
    const W = r.nativeW;
    const view = (li: number): Placed[] => {
      const u0 = v.camX / LAYERS[li].z;
      return marksOn(seed, LAYERS[li], Math.floor(u0) - 60, Math.ceil(u0 + W) + 60);
    };
    // The house: a thread of smoke from the chimney, leaning with the wind.
    for (const p of view(MID)) {
      if (p.mark.kind !== 'house') continue;
      const [dx, dy] = MARK_POINTS.house?.chimney ?? [0, 0];
      const top = markTop(seed, LAYERS[MID], MID, p) + 2 + dy;
      this.smokeAt -= m.dt;
      if (this.smokeAt <= 0 && m.dt > 0) {
        this.smokeAt = 0.7 + Math.random() * 0.5;
        const puff = this.puffs[this.puffAt];
        this.puffAt = (this.puffAt + 1) % this.puffs.length;
        puff.li = MID;
        puff.u = p.u + dx + Math.random() - 0.5;
        puff.y = top - 1;
        puff.vy = -4 - Math.random() * 2;
        puff.age = 0;
        puff.life = 5 + Math.random() * 2;
        this.seen.smoke++;
      }
    }
    const puffFrames = atlas.sheets.fire.puff;
    for (const puff of this.puffs) {
      if (puff.life <= 0) continue;
      puff.age += m.dt;
      if (puff.age >= puff.life) {
        puff.life = 0;
        continue;
      }
      puff.u += m.weather.wind * 5 * m.dt;
      puff.y += puff.vy * m.dt;
      const k = puff.age / puff.life;
      const [a, b, bk] = rows(puff.li, (puff.u * LAYERS[puff.li].z) / PX_PER_M);
      r.batches[puff.li].add(sx(puff.li, puff.u), sy(puff.li, puff.y), puffFrames[Math.min(puffFrames.length - 1, 1 + Math.floor(k * (puffFrames.length - 1)))], a, b, bk, false, 1 - k * 0.5);
    }
    // The mast's red lamp: on for a second, off for a second, day and night.
    for (const p of view(FARHILLS)) {
      const layer = LAYERS[FARHILLS];
      const ground = landBase(seed, layer, p.u) - Math.round(markGround(seed, layer, FARHILLS, p)) + 2;
      if (p.mark.kind === 'mast') {
        const [dx, dy] = MARK_POINTS.mast?.lamp ?? [0, 0];
        if ((m.time + p.mark.cell * 0.3) % 2 < 1) {
          this.seen.lamp++;
          const [a, b, k] = rows(FARHILLS, p.mark.at);
          r.batches[FARHILLS].add(sx(FARHILLS, p.u + dx), sy(FARHILLS, ground + dy), frame('small', 'lamp', 0), a, b, k, false);
        }
      } else if (p.mark.kind === 'train') this.train(r, atlas, v, l, m, p, ground - 2, sx, sy, rows);
    }
    // The lighthouse: a flash every six seconds once the light goes.
    for (const p of view(HILLS)) {
      if (p.mark.kind !== 'lighthouse' || m.night < 0.25) continue;
      const layer = LAYERS[HILLS];
      const ground = landBase(seed, layer, p.u) - Math.round(markGround(seed, layer, HILLS, p)) + 2;
      const [dx, dy] = MARK_POINTS.lighthouse?.lamp ?? [0, 0];
      const t = m.time % 6;
      if (t < 1.4) {
        this.seen.beacon++;
        const [a, b, k] = rows(HILLS, p.mark.at);
        r.batches[HILLS].add(sx(HILLS, p.u + dx) - 1, sy(HILLS, ground + dy) - 1, frame('small', 'beacon', 0), a, b, k, false, Math.sin((t / 1.4) * Math.PI));
      }
    }
  }

  /** A train crossing its line: a locomotive and four carriages, once every few minutes, lit windows at night. */
  private train(
    r: Renderer,
    atlas: Atlas,
    v: View,
    l: Life,
    m: Moment,
    p: Placed,
    rail: number,
    sx: (li: number, u: number) => number,
    sy: (li: number, row: number) => number,
    rows: (li: number, d: number) => [number, number, number],
  ): void {
    const period = 150;
    const speed = 70;
    const cars = 4;
    const long = (cars + 1) * 74;
    const t = (m.time + unit(p.mark.cell, l.seed) * period) % period;
    const pass = Math.floor((m.time + unit(p.mark.cell, l.seed) * period) / period);
    const travel = 2 * p.half + long;
    const dir = p.mark.cell % 2 === 0 ? 1 : -1;
    if (t * speed > travel) return;
    const lead = dir > 0 ? p.u - p.half + t * speed : p.u + p.half - t * speed;
    const lx = sx(FARHILLS, lead);
    if (pass !== this.trainPass && lx > -long - 200 && lx < r.nativeW + long + 200) {
      this.trainPass = pass;
      this.trainStarted = Math.max(0, Math.min(1, lx / r.nativeW));
      this.seen.train++;
    }
    const [a, b, k] = rows(FARHILLS, p.mark.at);
    const y = sy(FARHILLS, rail) - 9;
    const sheet = atlas.sheets.train;
    for (let i = 0; i <= cars; i++) {
      // The locomotive leads; the carriages follow behind it.
      const u = dir > 0 ? lead - 74 * (i + 1) : lead + 74 * i;
      const x = sx(FARHILLS, u);
      if (x < -80 || x > r.nativeW + 80) continue;
      // It fades in and out at the line's ends, where the line runs into the land.
      const inside = Math.min(u + 74 - (p.u - p.half), p.u + p.half - u);
      if (inside <= 0) continue;
      r.batches[FARHILLS].add(x, y, i === 0 ? sheet.loco[0] : sheet.car[0], a, b, k, dir < 0, Math.min(1, inside / 120));
    }
    void v;
  }

  /** A deer at the edge of the woods ahead, and a fox on the road. */
  private deerAndFox(
    r: Renderer,
    atlas: Atlas,
    v: View,
    l: Life,
    m: Moment,
    sx: (li: number, u: number) => number,
    sy: (li: number, row: number) => number,
    rows: (li: number, d: number) => [number, number, number],
    frame: (sheet: string, tag: string, t: number) => readonly number[],
  ): void {
    const seed = l.seed;
    const W = r.nativeW;
    const dt = m.dt;
    // A deer: one cell in a few, at dawn, dusk or by day, grazing where the road will pass it.
    const CELL = 700;
    if (this.deer === null && m.sun > -6 && !(m.weather.precip > 0.5)) {
      const cell = Math.floor((l.at + 90) / CELL);
      const d = cell * CELL + CELL * 0.5;
      const chance = homes(seed, d, DEER_HOMES) * (m.sun < 12 ? 1 : 0.4);
      if (!this.fled.has(cell) && unit(cell, seed ^ 0xdee5) < chance && landmarkNear(seed, d, 80) === null && d > l.at + 30) {
        const u = (d * PX_PER_M) / LAYERS[MID].z;
        if (sx(MID, u) > W + 10 && sx(MID, u) < W + 160) {
          this.deer = { cell, li: MID, u, state: 'graze', time: 0, dir: -1 };
          this.seen.deer++;
        }
      }
    }
    const deer = this.deer;
    if (deer !== null) {
      deer.time += dt;
      const x = sx(deer.li, deer.u);
      const near = x - m.himX;
      if (deer.state === 'graze' && near < 110) {
        deer.state = 'lift';
        deer.time = 0;
      } else if (deer.state === 'lift' && deer.time > 0.4) {
        deer.state = 'stand';
        deer.time = 0;
      } else if (deer.state === 'stand' && deer.time > 1.5 + unit(deer.cell, seed) * 2) {
        deer.state = 'run';
        deer.time = 0;
        deer.dir = near > 0 ? 1 : -1;
      }
      if (deer.state === 'run') deer.u += deer.dir * 85 * dt;
      const top = bankTopAt(seed, LAYERS[deer.li], deer.li, Math.round(deer.u));
      const [a, b, k] = rows(deer.li, (deer.u * LAYERS[deer.li].z) / PX_PER_M);
      const f = deer.state === 'run' ? frame('deer', 'run', m.time) : deer.state === 'graze' ? frame('deer', 'graze', m.time) : deer.state === 'lift' ? atlas.sheets.deer.lift[0] : atlas.sheets.deer.stand[0];
      // It faces him while it grazes and stands, and away as it runs.
      const flip = deer.state === 'run' ? deer.dir < 0 : near > 0;
      r.batches[deer.li].add(x - 9, sy(deer.li, top) - 15, f, a, b, k, flip);
      if (x < -60 || x > W + 200) {
        this.fled.add(deer.cell);
        if (this.fled.size > 64) this.fled.clear();
        this.deer = null;
      }
    }
    // A fox: at dusk, at night or at dawn, now and then, trotting toward him along the road and past; once it stops
    // to sit and watch him.
    const FCELL = 900;
    if (this.fox === null && m.sun < 6) {
      const cell = Math.floor((l.at + 60) / FCELL);
      const d = cell * FCELL + FCELL * 0.5;
      if (!this.foxSeen.has(cell) && unit(cell, seed ^ 0xf0c5) < homes(seed, d, FOX_HOMES) && d > l.at + 25 && landmarkNear(seed, d, 60) === null) {
        const u = d * PX_PER_M;
        if (u - v.camX > W + 10 && u - v.camX < W + 120) {
          this.fox = { cell, u, state: 'trot', time: 0, sat: false };
          this.seen.fox++;
        }
      }
    }
    const fox = this.fox;
    if (fox !== null) {
      fox.time += dt;
      const x = fox.u - v.camX;
      if (fox.state === 'trot') {
        fox.u -= 2.4 * PX_PER_M * dt;
        if (!fox.sat && x - m.himX < 120 && x - m.himX > 60) {
          fox.state = 'sit';
          fox.time = 0;
          fox.sat = true;
        }
      } else if (fox.state === 'sit' && fox.time > 3 + unit(fox.cell, seed) * 3) fox.state = 'trot';
      const ground = WALK_Y + m.extra + m.camY - groundHeight(seed, fox.u / PX_PER_M) * PX_PER_M;
      const [a, b, k] = rows(GROUND, fox.u / PX_PER_M);
      const f = fox.state === 'sit' ? atlas.sheets.fox.sit[0] : frame('fox', 'trot', m.time);
      r.ground.add(x - 11, ground - 10, f, a, b, k, true);
      if (x < -40) {
        this.foxSeen.add(fox.cell);
        if (this.foxSeen.size > 64) this.foxSeen.clear();
        this.fox = null;
      }
    }
    void v;
  }
}
