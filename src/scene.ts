// The diorama: where props stand, and the things that move in it (food, the toy, critters, particles).
import { BIOMES, SKY_SHARE } from './config.ts';
import type { BiomeName, CritterKind, PropKind } from './config.ts';
import { FOODS, HOMES, doorOf, propSprite } from './art.ts';
import type { FoodKind, Sprite } from './art.ts';
import { rng } from './noise.ts';
import type { Sky } from './sky.ts';

/** Positions: x is a share of the width (0 left … 1 right), z a depth (0 back at the horizon … 1 front). */
export type Prop = { readonly kind: PropKind; readonly x: number; readonly z: number; readonly variant: number; readonly sprite: Sprite };

export type Layout = {
  readonly props: readonly Prop[];
  readonly home: Prop;
  /** The pond or oasis; null on the shore, where it drinks from the sea. */
  readonly water: Prop | null;
  readonly forage: Prop;
  /** Rocks and stumps to sit on. */
  readonly seats: readonly Prop[];
  /** Where its cairn stands. */
  readonly cairn: { readonly x: number; readonly z: number };
};

/** Columns the layout is planned for; it stretches to the real width. */
const PLAN_COLS = 120;

const BACK: ReadonlySet<PropKind> = new Set(['tree', 'pine', 'palm', 'deadtree', 'cactus']);

/** The same layout for the same seed and biome, whatever the window size. */
export function layoutScene(seed: number, biome: BiomeName): Layout {
  const def = BIOMES[biome];
  const r = rng(seed ^ 0x5ce4e);
  const placed: { x: number; half: number }[] = [];
  const free = (x: number, half: number): boolean => placed.every((p) => Math.abs(p.x - x) * PLAN_COLS > p.half + half + 2);
  const place = (half: number, lo: number, hi: number): number => {
    for (let tries = 0; tries < 40; tries++) {
      const x = lo + r() * (hi - lo);
      if (free(x, half)) {
        placed.push({ x, half });
        return x;
      }
    }
    const x = lo + r() * (hi - lo);
    placed.push({ x, half });
    return x;
  };

  const homeSprite = HOMES[biome];
  const homeLeft = r() < 0.5;
  const homeX = place(homeSprite.w / 2, homeLeft ? 0.1 : 0.72, homeLeft ? 0.28 : 0.9);
  const home: Prop = { kind: 'home', x: homeX, z: 0.12, variant: 0, sprite: homeSprite };

  let water: Prop | null = null;
  if (def.water !== null) {
    const sprite = propSprite(def.water, 0);
    const x = place(sprite.w / 2, homeLeft ? 0.55 : 0.12, homeLeft ? 0.85 : 0.42);
    water = { kind: def.water, x, z: 0.5 + r() * 0.15, variant: 0, sprite };
  }

  const props: Prop[] = [home];
  if (water !== null) props.push(water);
  let forage: Prop | null = null;
  for (const [kind, count] of def.props) {
    for (let i = 0; i < count; i++) {
      const variant = Math.floor(r() * 1000);
      const sprite = propSprite(kind, variant);
      const back = BACK.has(kind);
      const x = place(sprite.w / 2, 0.03, 0.97);
      const z = back ? r() * 0.35 : 0.2 + r() * 0.75;
      const prop: Prop = { kind, x, z, variant, sprite };
      props.push(prop);
      if (kind === def.forage && (forage === null || Math.abs(z - 0.5) < Math.abs(forage.z - 0.5))) forage = prop;
    }
  }
  if (forage === null) {
    const sprite = propSprite(def.forage, 0);
    forage = { kind: def.forage, x: place(sprite.w / 2, 0.05, 0.95), z: 0.4, variant: 0, sprite };
    props.push(forage);
  }
  const seats = props.filter((p) => p.kind === 'rock' || p.kind === 'stump' || p.kind === 'driftwood' || p.kind === 'snowdrift');
  const cairnX = place(3, homeLeft ? homeX + 0.1 : homeX - 0.16, homeLeft ? homeX + 0.16 : homeX - 0.1);
  return { props, home, water, forage, seats, cairn: { x: Math.min(0.95, Math.max(0.05, cairnX)), z: 0.3 } };
}

/** How the scene maps onto a window: rows of sky and ground, and columns for x. */
export class Geometry {
  readonly cols: number;
  /** Rows the scene takes (the window minus the status bar). */
  readonly rows: number;
  /** The first ground row. */
  readonly horizon: number;

  constructor(cols: number, rows: number) {
    this.cols = cols;
    this.rows = rows;
    this.horizon = Math.max(3, Math.floor(rows * SKY_SHARE));
  }

  /** The row a thing at depth z stands on. */
  footRow(z: number): number {
    const top = this.horizon;
    const bottom = this.rows - 1;
    return top + Math.round(Math.max(0, Math.min(1, z)) * (bottom - top));
  }

  /** Depth of a ground row (inverse of footRow). */
  depthOf(row: number): number {
    const span = this.rows - 1 - this.horizon;
    return span <= 0 ? 0 : Math.max(0, Math.min(1, (row - this.horizon) / span));
  }

  col(x: number): number {
    return Math.round(x * (this.cols - 1));
  }

  x(col: number): number {
    return this.cols <= 1 ? 0 : col / (this.cols - 1);
  }

  /** Left column of a sprite centred on x. */
  left(x: number, w: number): number {
    return this.col(x) - (w >> 1);
  }

  /** Where to stand beside a prop: just in front of it, to one side. */
  beside(p: Prop, side: -1 | 1): { x: number; z: number } {
    const dx = (p.sprite.w / 2 + 3) / Math.max(1, this.cols);
    return { x: Math.max(0.03, Math.min(0.97, p.x + side * dx)), z: Math.min(1, p.z + 0.06) };
  }

  /** Where to stand in the doorway of a home. */
  door(home: Prop): { x: number; z: number } {
    const [dc] = doorOf(home.sprite);
    const col = this.left(home.x, home.sprite.w) + dc + 1;
    return { x: this.x(col), z: home.z };
  }
}

export type Food = { readonly kind: FoodKind; x: number; z: number; /** Rows above the ground. */ h: number; vh: number; age: number };
export type Toy = { x: number; z: number; h: number; vx: number; vh: number; age: number; resting: boolean };
export type Critter = {
  readonly kind: CritterKind;
  x: number;
  /** For flyers, a share of the scene's height; for walkers, unused. */
  y: number;
  z: number;
  vx: number;
  t: number;
  life: number;
  readonly flies: boolean;
  readonly phase: number;
};
export type Particle = {
  glyph: string;
  color: number;
  col: number;
  row: number;
  vc: number;
  vr: number;
  life: number;
  readonly glow: boolean;
  readonly gravity: number;
};

const FLYERS: ReadonlySet<CritterKind> = new Set(['butterfly', 'bird', 'gull', 'firefly', 'moth']);
const GRAVITY = 30; // rows per second²
const TOY_LIFE = 45;

/** The moving things in the scene. Positions as in `Prop`; speeds in columns or rows per real second. */
export class Scene {
  readonly layout: Layout;
  readonly biome: BiomeName;
  foods: Food[] = [];
  toy: Toy | null = null;
  critters: Critter[] = [];
  particles: Particle[] = [];
  private nextFood = 0;
  private readonly random: () => number;

  constructor(seed: number, biome: BiomeName, random: () => number) {
    this.biome = biome;
    this.layout = layoutScene(seed, biome);
    this.random = random;
  }

  /** Drops the next food from above, near x. */
  dropFood(x: number, z: number): Food {
    const kind = FOODS[this.nextFood++ % FOODS.length];
    const food: Food = { kind, x: Math.max(0.04, Math.min(0.96, x)), z, h: 14, vh: 0, age: 0 };
    this.foods.push(food);
    if (this.foods.length > 5) this.foods.shift();
    return food;
  }

  /** Throws the glowing toy in from one side. */
  throwToy(fromLeft: boolean): Toy {
    this.toy = { x: fromLeft ? 0.02 : 0.98, z: 0.55 + this.random() * 0.3, h: 5, vx: (fromLeft ? 1 : -1) * (16 + this.random() * 10), vh: 9, age: 0, resting: false };
    return this.toy;
  }

  emit(p: Omit<Particle, 'gravity' | 'glow'> & { gravity?: number; glow?: boolean }): void {
    this.particles.push({ gravity: 0, glow: false, ...p });
    if (this.particles.length > 200) this.particles.shift();
  }

  /** One step: food falls, the toy bounces, critters come and go, particles drift. */
  update(dt: number, geo: Geometry, sky: Sky, lantern: { col: number; row: number } | null): void {
    for (const f of this.foods) {
      f.age += dt;
      if (f.h > 0 || f.vh !== 0) {
        f.vh -= GRAVITY * dt;
        f.h += f.vh * dt;
        if (f.h <= 0) {
          f.h = 0;
          f.vh = Math.abs(f.vh) > 4 ? -f.vh * 0.3 : 0;
        }
      }
    }
    const toy = this.toy;
    if (toy !== null) {
      toy.age += dt;
      if (!toy.resting) {
        toy.vh -= GRAVITY * dt;
        toy.h += toy.vh * dt;
        toy.x += (toy.vx * dt) / Math.max(1, geo.cols);
        if (toy.h <= 0) {
          toy.h = 0;
          toy.vh = -toy.vh * 0.62;
          toy.vx *= 0.8;
          if (toy.vh < 2.5) {
            toy.vh = 0;
            toy.vx *= 0.9;
          }
        }
        if (toy.x < 0.02 || toy.x > 0.98) {
          toy.x = Math.max(0.02, Math.min(0.98, toy.x));
          toy.vx = -toy.vx * 0.7;
        }
        if (toy.h === 0 && toy.vh === 0 && Math.abs(toy.vx) < 0.5) toy.resting = true;
      }
      if (toy.age > TOY_LIFE) this.toy = null;
    }

    this.updateCritters(dt, geo, sky, lantern);

    for (const p of this.particles) {
      p.life -= dt;
      p.vr += p.gravity * dt;
      p.col += p.vc * dt;
      p.row += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.row > -2 && p.row < geo.rows + 2);
  }

  private updateCritters(dt: number, geo: Geometry, sky: Sky, lantern: { col: number; row: number } | null): void {
    const def = BIOMES[this.biome];
    const night = sky.daylight < 0.3;
    const kinds = night ? def.nightCritters : def.dayCritters;
    const wet = sky.weather.precip > 0.3;
    const cold = sky.season === 'winter' || def.cold;
    if (!wet && kinds.length > 0 && this.critters.length < (night ? 6 : 3) && this.random() < dt * (night ? 0.5 : 0.08)) {
      const kind = kinds[Math.floor(this.random() * kinds.length)];
      if (!(cold && (kind === 'butterfly' || kind === 'firefly' || kind === 'frog'))) this.spawn(kind);
    }
    for (const c of this.critters) {
      c.t += dt;
      const sway = Math.sin(c.t * 2 + c.phase);
      switch (c.kind) {
        case 'butterfly':
          c.x += ((c.vx + sway * 4) * dt) / geo.cols;
          c.y = Math.max(0.35, Math.min(0.9, c.y + Math.cos(c.t * 3 + c.phase) * 0.12 * dt));
          break;
        case 'moth':
          if (lantern !== null) {
            const a = c.t * 2.5 + c.phase;
            c.x += ((geo.x(lantern.col + Math.cos(a) * 4) - c.x) * 2 * dt);
            c.y += ((lantern.row + Math.sin(a) * 2) / geo.rows - c.y) * 2 * dt;
          } else {
            c.x += ((c.vx + sway * 3) * dt) / geo.cols;
          }
          break;
        case 'firefly':
          c.x += (sway * 1.5 * dt) / geo.cols;
          c.y += Math.cos(c.t * 0.9 + c.phase) * 0.02 * dt;
          break;
        case 'bird':
        case 'gull':
          c.x += (c.vx * dt) / geo.cols;
          c.y += Math.sin(c.t * 1.3 + c.phase) * 0.01 * dt;
          break;
        default:
          // Walkers move in short bursts.
          if (Math.sin(c.t * 1.7 + c.phase) > 0.2) c.x += (c.vx * dt) / geo.cols;
      }
    }
    this.critters = this.critters.filter((c) => c.t < c.life && c.x > -0.05 && c.x < 1.05);
  }

  spawn(kind: CritterKind): Critter {
    const flies = FLYERS.has(kind);
    const fromLeft = this.random() < 0.5;
    const speed = kind === 'bird' || kind === 'gull' ? 9 + this.random() * 6 : kind === 'butterfly' || kind === 'moth' ? 3 + this.random() * 2 : 2 + this.random() * 2;
    const inside = kind === 'firefly' || kind === 'moth';
    let y = 0.5;
    if (kind === 'bird' || kind === 'gull') y = 0.08 + this.random() * 0.25;
    else if (kind === 'butterfly') y = 0.45 + this.random() * 0.4;
    else if (inside) y = 0.4 + this.random() * 0.5;
    const c: Critter = {
      kind,
      x: inside ? 0.05 + this.random() * 0.9 : fromLeft ? -0.02 : 1.02,
      y,
      z: 0.3 + this.random() * 0.6,
      vx: (fromLeft ? 1 : -1) * speed,
      t: 0,
      life: kind === 'firefly' ? 20 + this.random() * 30 : 60 + this.random() * 60,
      flies,
      phase: this.random() * 6.28,
    };
    this.critters.push(c);
    return c;
  }
}
