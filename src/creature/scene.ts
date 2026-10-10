// The diorama: where things stand round its home, and the things that move in it (food, the toy, critters, the
// little signs). From the terminal creature (feat/creature src/scene.ts), in native pixels: x is a share of the
// view's width (0 left … 1 right), z a depth in the band in front of the walk line (0 at the walk line … 1 at the
// front, "the glass"); heights and speeds are pixels and pixels per second.
import { BIOMES, DEPTH_PX, FOODS, PLAN_W } from './config.ts';
import type { CritterKind, FoodKind, PlaceName, PropKind } from './config.ts';
import { rng } from '../noise.ts';
import { NEST, TREE } from './look.ts';
import type { Sky } from './sky.ts';

/** A prop's sprite: its size in native pixels, and for a home where its door is (its centre from the left, width). */
export type Footprint = { readonly w: number; readonly h: number; readonly door?: { readonly x: number; readonly w: number; readonly h: number } };

/** The sizes of what stands in the scene (tools/art/sprites/things.ts and hollow.ts). */
export const FOOTPRINTS: Readonly<Record<PropKind | 'tree' | 'shelter' | 'nest', Footprint>> = {
  tree: { w: TREE.w, h: TREE.h, door: TREE.door },
  nest: { w: NEST.w, h: NEST.h, door: NEST.door },
  shelter: { w: 44, h: 26, door: { x: 28, w: 9, h: 13 } },
  home: { w: 44, h: 26 },
  bush: { w: 24, h: 16 },
  fern: { w: 16, h: 12 },
  shrooms: { w: 10, h: 9 },
  mushrooms: { w: 10, h: 7 },
  rock: { w: 16, h: 9 },
  stump: { w: 14, h: 11 },
  drift: { w: 22, h: 8 },
  reeds: { w: 12, h: 18 },
  pond: { w: 46, h: 10 },
};

/** How far past the view's edge the great tree stands: its door this far in from the edge. */
export const TREE_IN = 60;
/** The share of the width the great tree, its door and its roots take: nothing else stands there. */
export const TREE_CLEAR = (TREE_IN + TREE.w - TREE.door.x - 6) / PLAN_W;

export type Prop = {
  readonly kind: PropKind;
  readonly x: number;
  readonly z: number;
  readonly variant: number;
  readonly sprite: Footprint;
  /** Set for the great tree, which stands against the view's left (-1) or right (1) edge, whatever its width. */
  readonly edge?: -1 | 1;
  /** Set for its stone in the hollow (the code calls it the nest); `variant` 1 turns it round. */
  readonly nest?: boolean;
};

/** Under the canopy the scene is laid out round its home tree: the glow at the end of the path stands off on the open side. */
export function forestFocus(homeLeft: boolean): number {
  return homeLeft ? 0.63 : 0.37;
}

export type Layout = {
  readonly props: readonly Prop[];
  readonly home: Prop;
  /** The pond, if the biome has one. */
  readonly water: Prop | null;
  readonly forage: Prop;
  /** Stones, stumps and drifts to sit on. */
  readonly seats: readonly Prop[];
  /** Where its cairn stands. */
  readonly cairn: { readonly x: number; readonly z: number };
  /** Which side its home is on. */
  readonly homeLeft: boolean;
};

/** Low things that grow among the others and need no room of their own. */
const COVER: ReadonlySet<PropKind> = new Set(['shrooms', 'mushrooms', 'fern']);
const HOME_Z = 0.15;
/** Its stone stands a little nearer than a shelter. */
const NEST_Z = 0.28;
const TREE_Z = 0.22;
const CAIRN_Z = 0.3;

/** The same layout for the same seed and biome, whatever the view's width. */
export function layoutScene(seed: number, biome: PlaceName): Layout {
  const def = BIOMES[biome];
  const r = rng(seed ^ 0x5ce4e);
  /** What is placed: `keep` marks the home, the water and the cairn, which nothing may stand in front of. */
  const placed: { x: number; z: number; half: number; keep: boolean; cover?: boolean; soft?: boolean }[] = [];
  /** Pixels between something of half-width `half` at (x, z) and its nearest neighbour. */
  const room = (x: number, z: number, half: number, plain: boolean, cover = false): number => {
    const near = placed.filter(
      (p) =>
        (cover ? (p.keep && p.soft !== true) || p.cover === true : true) &&
        // A plain prop may stand behind the home or the water.
        !(plain && p.keep && z < p.z - 0.06) &&
        // Plain things far apart in depth may stand one behind the other: that is what makes the scene deep.
        !(plain && !p.keep && Math.abs(p.z - z) > 0.2),
    );
    return Math.min(Infinity, ...near.map((p) => Math.abs(p.x - x) * PLAN_W - p.half - half + (plain && !p.keep ? Math.min(half, p.half) * 0.6 : 0)));
  };
  const find = (half: number, z: number, lo: number, hi: number, plain: boolean, cover = false): { x: number; clear: boolean } => {
    let best = { x: lo + r() * (hi - lo), room: -Infinity };
    for (let tries = 0; tries < 60; tries++) {
      const x = lo + r() * (hi - lo);
      const rm = room(x, z, half, plain, cover);
      if (rm > 2) return { x, clear: true };
      if (rm > best.room) best = { x, room: rm };
    }
    return { x: best.x, clear: false };
  };
  const place = (half: number, z: number, lo: number, hi: number, keep: boolean, soft = false): number => {
    const { x } = find(half, z, lo, hi, false);
    placed.push({ x, z, half, keep, soft });
    return x;
  };
  const placeIfClear = (half: number, z: number, lo: number, hi: number, cover = false): number | null => {
    const { x, clear } = find(half, z, lo, hi, true, cover);
    if (!clear) return null;
    placed.push({ x, z, half, keep: false, cover });
    return x;
  };

  const homeLeft = r() < 0.5;
  let home: Prop;
  let homeX: number;
  if (def.nest === true) {
    // In the hollow it sleeps on a big mossy stone, toward the side of the view's edge.
    const sprite = FOOTPRINTS.nest;
    homeX = place(sprite.w / 2, NEST_Z, homeLeft ? 0.12 : 0.62, homeLeft ? 0.38 : 0.88, true);
    home = { kind: 'home', x: homeX, z: NEST_Z, variant: homeLeft ? 1 : 0, sprite, nest: true };
  } else if (def.canopy) {
    // Under the canopy it lives in the hollow at the foot of the great tree at the view's edge (drawn for the left,
    // turned round for the right). Its door is kept clear; whatever stands behind the tree is hidden anyway.
    const sprite = FOOTPRINTS.tree;
    homeX = homeLeft ? TREE_IN / PLAN_W : 1 - TREE_IN / PLAN_W;
    placed.push({ x: homeX, z: TREE_Z, half: (sprite.door?.w ?? 20) / 2 + 30, keep: true });
    home = { kind: 'home', x: homeX, z: TREE_Z, variant: homeLeft ? 0 : 1, sprite, edge: homeLeft ? -1 : 1 };
  } else {
    const sprite = FOOTPRINTS.shelter;
    homeX = place(sprite.w / 2, HOME_Z, homeLeft ? 0.2 : 0.62, homeLeft ? 0.38 : 0.8, true);
    home = { kind: 'home', x: homeX, z: HOME_Z, variant: def.cold ? 1 : 0, sprite };
  }

  let water: Prop | null = null;
  if (def.water !== null) {
    const sprite = FOOTPRINTS.pond;
    const z = def.canopy ? 0.7 + r() * 0.2 : 0.55 + r() * 0.2;
    const x = place(sprite.w / 2, z, homeLeft ? 0.55 : 0.14, homeLeft ? 0.86 : 0.45, true, true);
    water = { kind: 'pond', x, z, variant: 0, sprite };
  }

  const props: Prop[] = [home];
  if (water !== null) props.push(water);
  let forage: Prop | null = null;
  for (const [kind, count] of def.props) {
    for (let i = 0; i < count; i++) {
      const cover = COVER.has(kind);
      const z = kind === 'reeds' ? 0.05 + r() * 0.5 : cover ? 0.15 + r() * 0.75 : 0.2 + r() * 0.7;
      const variant = Math.floor(r() * 1000);
      const sprite = FOOTPRINTS[kind];
      // Nothing in the doorway of the great tree, where it would be hidden behind the trunk anyway.
      const [lo, hi] = def.canopy && def.nest !== true ? (homeLeft ? [TREE_CLEAR, 0.97] : [0.03, 1 - TREE_CLEAR]) : [0.03, 0.97];
      const half = cover ? 6 : sprite.w / 2;
      const x = placeIfClear(half, z, lo, hi, cover);
      if (x === null) continue;
      const prop: Prop = { kind, x, z, variant, sprite };
      props.push(prop);
      if (kind === def.forage && (forage === null || Math.abs(z - 0.5) < Math.abs(forage.z - 0.5))) forage = prop;
    }
  }
  if (forage === null) {
    const sprite = FOOTPRINTS[def.forage];
    forage = { kind: def.forage, x: place(sprite.w / 2, 0.45, 0.2, 0.8, false), z: 0.45, variant: 0, sprite };
    props.push(forage);
  }
  const seats = props.filter((p) => p.kind === 'rock' || p.kind === 'stump' || p.kind === 'drift');
  const side = homeLeft ? 1 : -1;
  const near = homeX + side * (def.canopy && def.nest !== true ? 0.13 : 0.12);
  const cairnX = place(7, CAIRN_Z, Math.min(near, near + side * 0.06), Math.max(near, near + side * 0.06), true);
  return { props, home, water, forage, seats, cairn: { x: Math.min(0.95, Math.max(0.05, cairnX)), z: CAIRN_Z }, homeLeft };
}

/**
 * How the scene maps onto the view: `w` native pixels wide, the walk line's row at each share of the width (the
 * page reads it from the ground of the wanderer's world; flat in tests).
 */
export class Geometry {
  readonly w: number;
  private readonly ground: (x: number) => number;

  constructor(w: number, ground: (x: number) => number = () => 296) {
    this.w = w;
    this.ground = ground;
  }

  px(x: number): number {
    return x * this.w;
  }

  x(px: number): number {
    return px / this.w;
  }

  /** The row its feet stand on at (x, z). */
  footY(x: number, z: number): number {
    return this.ground(x) + Math.max(0, Math.min(1, z)) * DEPTH_PX;
  }

  /** The depth of a row at share x (inverse of footY), or -1 above the walk line, 2 below the band. */
  depthOf(x: number, y: number): number {
    const z = (y - this.ground(x)) / DEPTH_PX;
    return z < -0.15 ? -1 : z > 1.6 ? 2 : Math.max(0, Math.min(1, z));
  }

  /** The left edge of a prop's sprite: centred on its x, or past the view's edge for the great tree. */
  leftOf(p: Prop): number {
    if (p.edge === undefined) return Math.round(this.px(p.x) - p.sprite.w / 2);
    const door = p.sprite.door?.x ?? 0;
    return p.edge < 0 ? TREE_IN - door : Math.round(this.w - TREE_IN - (p.sprite.w - door));
  }

  /** Where to stand beside a prop: just in front of it, to one side. */
  beside(p: Prop, side: -1 | 1): { x: number; z: number } {
    const dx = (p.sprite.w / 2 + 9) / Math.max(1, this.w);
    return { x: Math.max(0.03, Math.min(0.97, p.x + side * dx)), z: Math.min(1, p.z + 0.12) };
  }

  /** Where to stand in the doorway of its home. */
  door(home: Prop): { x: number; z: number } {
    if (home.edge !== undefined) return { x: this.x(home.edge < 0 ? TREE_IN : this.w - TREE_IN), z: home.z };
    const left = this.leftOf(home);
    const dx = home.sprite.door?.x ?? home.sprite.w / 2;
    return { x: this.x(left + (home.nest === true && home.variant === 1 ? home.sprite.w - dx : dx)), z: home.z };
  }
}

export type Food = { readonly kind: FoodKind; x: number; z: number; /** Pixels above the ground. */ h: number; vh: number; age: number };
export type Toy = { x: number; z: number; h: number; vx: number; vh: number; age: number; resting: boolean };
export type Critter = {
  readonly kind: CritterKind;
  x: number;
  /** For flyers, pixels above the walk line; for walkers, 0. */
  y: number;
  z: number;
  /** Pixels per second across. */
  vx: number;
  t: number;
  life: number;
  readonly flies: boolean;
  readonly phase: number;
};
/** The little signs and bits: hearts, notes, sleep, sparks, dirt, drops, a falling star. In native pixels. */
export type SignKind = 'heart' | 'note' | 'z' | 'Z' | 'spark' | 'dirt' | 'drop' | 'streak';
export type Particle = { kind: SignKind; x: number; y: number; vx: number; vy: number; life: number; readonly gravity: number };

const FLYERS: ReadonlySet<CritterKind> = new Set(['butterfly', 'bird', 'firefly', 'moth', 'bat']);
/** Pixels per second² for falling food and the bouncing toy. */
const GRAVITY = 240;
const TOY_LIFE = 45;

/** The moving things in the scene. */
export class Scene {
  readonly layout: Layout;
  readonly biome: PlaceName;
  foods: Food[] = [];
  toy: Toy | null = null;
  critters: Critter[] = [];
  particles: Particle[] = [];
  private nextFood = 0;
  private readonly random: () => number;

  constructor(seed: number, biome: PlaceName, random: () => number) {
    this.biome = biome;
    this.layout = layoutScene(seed, biome);
    this.random = random;
  }

  /** Drops the next food from above, near x. */
  dropFood(x: number, z: number): Food {
    const kind = FOODS[this.nextFood++ % FOODS.length];
    const food: Food = { kind, x: Math.max(0.04, Math.min(0.96, x)), z, h: 70, vh: 0, age: 0 };
    this.foods.push(food);
    if (this.foods.length > 5) this.foods.shift();
    return food;
  }

  /** Throws the glowing toy in from one side. */
  throwToy(fromLeft: boolean): Toy {
    this.toy = { x: fromLeft ? 0.02 : 0.98, z: 0.5 + this.random() * 0.4, h: 26, vx: (fromLeft ? 1 : -1) * (110 + this.random() * 70), vh: 90, age: 0, resting: false };
    return this.toy;
  }

  emit(p: Omit<Particle, 'gravity'> & { gravity?: number }): void {
    this.particles.push({ gravity: 0, ...p });
    if (this.particles.length > 200) this.particles.shift();
  }

  /** One step: food falls, the toy bounces, critters come and go, particles drift. */
  update(dt: number, geo: Geometry, sky: Sky, lantern: { x: number; y: number } | null): void {
    for (const f of this.foods) {
      f.age += dt;
      if (f.h > 0 || f.vh !== 0) {
        f.vh -= GRAVITY * dt;
        f.h += f.vh * dt;
        if (f.h <= 0) {
          f.h = 0;
          f.vh = Math.abs(f.vh) > 30 ? -f.vh * 0.3 : 0;
        }
      }
    }
    const toy = this.toy;
    if (toy !== null) {
      toy.age += dt;
      if (!toy.resting) {
        toy.vh -= GRAVITY * dt;
        toy.h += toy.vh * dt;
        toy.x += (toy.vx * dt) / Math.max(1, geo.w);
        if (toy.h <= 0) {
          toy.h = 0;
          toy.vh = -toy.vh * 0.62;
          toy.vx *= 0.8;
          if (toy.vh < 18) {
            toy.vh = 0;
            toy.vx *= 0.9;
          }
        }
        if (toy.x < 0.02 || toy.x > 0.98) {
          toy.x = Math.max(0.02, Math.min(0.98, toy.x));
          toy.vx = -toy.vx * 0.7;
        }
        if (toy.h === 0 && toy.vh === 0 && Math.abs(toy.vx) < 4) toy.resting = true;
      }
      if (toy.age > TOY_LIFE) this.toy = null;
    }

    this.updateCritters(dt, geo, sky, lantern);

    for (const p of this.particles) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0 && p.y > -40 && p.y < 460);
  }

  private updateCritters(dt: number, geo: Geometry, sky: Sky, lantern: { x: number; y: number } | null): void {
    const def = BIOMES[this.biome];
    const night = sky.daylight < 0.3;
    const kinds = night ? def.nightCritters : def.dayCritters;
    const wet = sky.weather.precip > 0.3;
    const cold = sky.season === 'winter' || def.cold;
    // Under the canopy the woods are full of life: more of them, more often.
    const lush = def.canopy;
    const most = night ? (lush ? 12 : 6) : lush ? 6 : 3;
    const rate = night ? 0.5 : lush ? 0.2 : 0.08;
    if (!wet && kinds.length > 0 && this.critters.length < most && this.random() < dt * rate) {
      const kind = kinds[Math.floor(this.random() * kinds.length)];
      // Only one deer at a time; nothing cold-blooded or winged in the snow.
      const deer = kind === 'deer' && this.critters.some((c) => c.kind === 'deer');
      if (!deer && !(cold && (kind === 'butterfly' || kind === 'firefly' || kind === 'frog' || kind === 'bat'))) this.spawn(kind);
    }
    const w = Math.max(1, geo.w);
    for (const c of this.critters) {
      c.t += dt;
      const sway = Math.sin(c.t * 2 + c.phase);
      switch (c.kind) {
        case 'butterfly':
          c.x += ((c.vx + sway * 8) * dt) / w;
          c.y = Math.max(8, Math.min(60, c.y + Math.cos(c.t * 3 + c.phase) * 14 * dt));
          break;
        case 'moth':
          if (lantern !== null) {
            const a = c.t * 2.5 + c.phase;
            c.x += (geo.x(lantern.x + Math.cos(a) * 9) - c.x) * 2 * dt;
            const above = geo.footY(c.x, c.z) - (lantern.y + Math.sin(a) * 5);
            c.y += (above - c.y) * 2 * dt;
          } else c.x += ((c.vx + sway * 6) * dt) / w;
          break;
        case 'firefly':
          c.x += (sway * 3 * dt) / w;
          c.y = Math.max(2, Math.min(90, c.y + Math.cos(c.t * 0.9 + c.phase) * 4 * dt));
          break;
        case 'bird':
          c.x += (c.vx * dt) / w;
          c.y += Math.sin(c.t * 1.3 + c.phase) * 3 * dt;
          break;
        case 'bat':
          // Flitting: darting this way and that across its way, dipping and climbing.
          c.x += ((c.vx + Math.sin(c.t * 5.3 + c.phase) * 18) * dt) / w;
          c.y = Math.max(70, Math.min(200, c.y + Math.cos(c.t * 4.1 + c.phase) * 40 * dt));
          break;
        case 'deer':
          // A few steps, then a long while grazing.
          if (Math.sin(c.t * 0.35 + c.phase) > 0.55) c.x += (c.vx * dt) / w;
          break;
        default:
          // Walkers move in short bursts.
          if (Math.sin(c.t * 1.7 + c.phase) > 0.2) c.x += (c.vx * dt) / w;
      }
    }
    this.critters = this.critters.filter((c) => c.t < c.life && c.x > -0.06 && c.x < 1.06);
  }

  spawn(kind: CritterKind): Critter {
    const flies = FLYERS.has(kind);
    const fromLeft = this.random() < 0.5;
    const speed =
      kind === 'bird' ? 40 + this.random() * 25
      : kind === 'bat' ? 26 + this.random() * 16
      : kind === 'hare' ? 34 + this.random() * 14
      : kind === 'deer' ? 7 + this.random() * 4
      : kind === 'butterfly' || kind === 'moth' ? 10 + this.random() * 6
      : 8 + this.random() * 6;
    const inside = kind === 'firefly' || kind === 'moth';
    let y = 0;
    if (kind === 'bird') y = 150 + this.random() * 90;
    else if (kind === 'bat') y = 90 + this.random() * 90;
    else if (kind === 'butterfly') y = 12 + this.random() * 40;
    else if (inside) y = 6 + this.random() * 70;
    const c: Critter = {
      kind,
      x: inside ? 0.05 + this.random() * 0.9 : fromLeft ? -0.03 : 1.03,
      y,
      z: kind === 'deer' ? 0 : 0.15 + this.random() * 0.8,
      vx: (fromLeft ? 1 : -1) * speed,
      t: 0,
      life: kind === 'firefly' ? 20 + this.random() * 30 : kind === 'deer' ? 120 + this.random() * 120 : 60 + this.random() * 60,
      flies,
      phase: this.random() * 6.28,
    };
    this.critters.push(c);
    return c;
  }
}
