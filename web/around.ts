// The life around him: a flock of birds crossing by day, bats at dusk, fireflies on warm nights, a deer at the edge
// of the trees that looks up and bounds away, a fox that trots past and stops to watch, leaves falling in the autumn
// woods. Rare and quiet (brief: Life around him). Each thing lives in the layer it belongs to and moves with that
// layer's parallax.
import { BIOME_IDS } from '../src/biomes.ts';
import type { BiomeId } from '../src/biomes.ts';
import { GROUND, LAYERS, PX_PER_M, WALK_Y } from '../src/layers.ts';
import type { Life } from '../src/life.ts';
import { unit } from '../src/noise.ts';
import { bankTopAt } from '../src/paint/scene.ts';
import type { Weather } from '../src/sky.ts';
import { biomeAt, blended, groundHeight, landmarkNear, share } from '../src/world.ts';
import { paletteRow } from './render.ts';
import type { Renderer, View } from './render.ts';
import type { Atlas } from './sprites.ts';

const layerIndex = (name: string): number => LAYERS.findIndex((l) => l.name === name);
const RIDGE = layerIndex('ridge');
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
type Fly = { u: number; y: number; phase: number; speed: number };
type Leaf = { x: number; y: number; vx: number; vy: number; phase: number; floor: number };
type Deer = { cell: number; li: number; u: number; state: 'graze' | 'lift' | 'stand' | 'run'; time: number; dir: number };
type Fox = { cell: number; u: number; state: 'trot' | 'sit' | 'gone'; time: number; sat: boolean };

const DEER_HOMES: Partial<Record<BiomeId, number>> = { pine: 0.5, birch: 0.7, autumn: 0.7, meadow: 0.5, stones: 0.4, swamp: 0.2, plateau: 0.2 };
const FOX_HOMES: Partial<Record<BiomeId, number>> = { pine: 0.4, birch: 0.5, autumn: 0.5, meadow: 0.5, plateau: 0.4, stones: 0.5, swamp: 0.3, desert: 0.3, tundra: 0.3, coast: 0.2 };
const FIREFLY_HOMES: Partial<Record<BiomeId, number>> = { meadow: 1, birch: 0.8, swamp: 1, pine: 0.4, autumn: 0.3 };
const BAT_HOMES: Partial<Record<BiomeId, number>> = { pine: 0.8, birch: 0.8, autumn: 0.8, swamp: 1, meadow: 0.4, stones: 0.5 };

/** A chance at d from per-biome weights, blended. */
const homes = (seed: number, d: number, table: Partial<Record<BiomeId, number>>): number => blended(biomeAt(seed, d), (id) => table[id] ?? 0);

export class Around {
  private readonly birds: Bird[] = [];
  private birdsDir = 1;
  private nextFlock = 20;
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
  /** How many of each have shown themselves (the watch tool reads it). */
  readonly seen = { flock: 0, bats: 0, fireflies: 0, leaves: 0, deer: 0, fox: 0 };

  /** What is about now, for the logs. */
  present(): string[] {
    const out: string[] = [];
    if (this.birds.length > 0) out.push(`flock of ${this.birds.length}`);
    if (this.deer !== null) out.push(`deer ${this.deer.state}@${Math.round(this.deer.u)}`);
    if (this.fox !== null) out.push(`fox ${this.fox.state}@${Math.round(this.fox.u)}`);
    if (this.leaves.length > 0) out.push(`${this.leaves.length} leaves`);
    return out;
  }

  /** For still pictures (time stopped): what to put in the frame anyway (flock, bats, deer, fox). */
  show = new Set<string>();
  private still = false;

  update(r: Renderer, atlas: Atlas, v: View, l: Life, m: Moment): void {
    if (m.dt === 0 && !this.still) {
      this.still = true;
      this.stillLife(v, l, m, r.nativeW);
    }
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
  }

  /**
   * A still picture has no time for things to arrive, so they are put in place: leaves already falling, and
   * whatever the picture asks for, near him.
   */
  private stillLife(v: View, l: Life, m: Moment, W: number): void {
    const seed = l.seed;
    for (let i = 0; i < 18; i++) {
      const u = v.camX + Math.random() * W;
      const ground = WALK_Y + m.extra + m.camY - groundHeight(seed, u / PX_PER_M) * PX_PER_M;
      this.leaves.push({ x: u, y: ground - 10 - Math.random() * 150, vx: 0, vy: 0, phase: Math.random() * 6, floor: ground - 1 });
    }
    if (this.show.has('flock')) {
      this.birdsDir = 1;
      const y = m.extra + v.horizon - 70;
      for (let i = 0; i < 9; i++) this.birds.push({ u: v.camX / LAYERS[RIDGE].z + W * 0.62 - i * 8 - Math.random() * 6, y: y + Math.abs(i - 4) * 2.5 + Math.random() * 3, phase: Math.random(), bob: Math.random() * 6 });
    }
    if (this.show.has('bats')) {
      this.batsUntil = m.time + 60;
      this.batsAt = v.camX / LAYERS[NEAR].z + W * 0.55;
    }
    if (this.show.has('deer')) this.deer = { cell: -1, li: NEAR, u: v.camX / LAYERS[NEAR].z + m.himX + 90, state: this.show.has('alert') ? 'stand' : 'graze', time: 0, dir: -1 };
    if (this.show.has('fox')) this.fox = { cell: -1, u: v.camX + m.himX + 80, state: 'sit', time: 0, sat: true };
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
        const u = (d * PX_PER_M) / LAYERS[NEAR].z;
        if (sx(NEAR, u) > W + 10 && sx(NEAR, u) < W + 160) {
          this.deer = { cell, li: NEAR, u, state: 'graze', time: 0, dir: -1 };
          this.seen.deer++;
        }
      }
    }
    const deer = this.deer;
    if (deer !== null) {
      deer.time += dt;
      const x = sx(deer.li, deer.u);
      const near = x - m.himX;
      if (dt === 0) {
        // Time stopped: it holds still.
      } else if (deer.state === 'graze' && near < 110) {
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
