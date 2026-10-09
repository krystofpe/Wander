// The diorama: where props stand, and the things that move in it (food, the toy, critters, particles).
import { BIOMES, SKY_SHARE } from './config.ts';
import type { BiomeName, CritterKind, PropKind } from './config.ts';
import { FOODS } from './art.ts';
import type { FoodKind } from './art.ts';
import { footprint } from './scenery.ts';
import type { Footprint } from './scenery.ts';
import { rng } from './noise.ts';
import type { Sky } from './sky.ts';

/** Positions: x is a share of the width (0 left … 1 right), z a depth (0 back at the horizon … 1 front). */
export type Prop = {
  readonly kind: PropKind;
  readonly x: number;
  readonly z: number;
  readonly variant: number;
  readonly sprite: Footprint;
  /** Set for a prop that stands against the window's left (-1) or right (1) edge, whatever its width. */
  readonly edge?: -1 | 1;
};

/**
 * Under the canopy the scene is laid out round its home tree, not about the middle: the glow at the end of
 * the path stands off on the open side, as a share of the width.
 */
export function forestFocus(homeLeft: boolean): number {
  return homeLeft ? 0.63 : 0.37;
}

/**
 * How many columns the great trunks at the window's sides stand outside it: on a narrow window they move
 * out so the scene still shows; on the side of its home only a little, so its hollow stays in view.
 */
export function frameCrop(cols: number, home: boolean): number {
  const out = Math.max(0, Math.round((128 - cols) / 3));
  // The trunk on the far side stands half outside the window even when it is wide: that side is the open one.
  return home ? Math.min(out, 4) : out + 8;
}

export type Layout = {
  readonly props: readonly Prop[];
  readonly home: Prop;
  /** The pond, if the biome has one. */
  readonly water: Prop | null;
  readonly forage: Prop;
  /** Rocks and stumps to sit on. */
  readonly seats: readonly Prop[];
  /** Where its cairn stands. */
  readonly cairn: { readonly x: number; readonly z: number };
};

/** Columns the layout is planned for; it stretches to the real width. */
const PLAN_COLS = 120;

const BACK: ReadonlySet<PropKind> = new Set(['tree', 'pine', 'deadtree']);
/** Low things that grow among the others and need no room of their own. */
const COVER: ReadonlySet<PropKind> = new Set(['glowshroom', 'mushrooms', 'fern']);
/** What is drawn smaller far off, under the canopy. */
const SCALED: ReadonlySet<PropKind> = new Set(['glowshroom', 'fern', 'bush']);
const HOME_Z = 0.12;
const CAIRN_Z = 0.3;

/** The same layout for the same seed and biome, whatever the window size. */
export function layoutScene(seed: number, biome: BiomeName): Layout {
  const def = BIOMES[biome];
  const r = rng(seed ^ 0x5ce4e);
  // Under a canopy the forest is thick with growth all round, the glow at the back its one open view.
  const corridor = def.gloom !== undefined;
  /**
   * What is placed, at what depth; `keep` marks the home, the water and the cairn, which nothing may stand in
   * front of; `corridor` the path's open middle, which nothing may stand in at any depth.
   */
  const placed: { x: number; z: number; half: number; keep: boolean; corridor?: boolean; cover?: boolean; soft?: boolean; trunk?: boolean }[] = [];
  /**
   * Columns between something of half-width `half` at (x, z) and its nearest neighbour. A plain prop may
   * overlap other plain props a little, and stand anywhere behind the home or the water.
   */
  const room = (x: number, z: number, half: number, plain: boolean, cover = false): number => {
    // Ground cover (`cover`) grows anywhere but on the shelter or other cover: by the water and along the path
    // too (`soft`). A plain prop may also stand behind the home or the water, except under the canopy, where the
    // shelter stands low and anything behind it would cover it.
    const near = placed.filter(
      (p) =>
        (cover ? (p.keep && p.soft !== true) || p.cover === true : true) &&
        !(plain && p.keep && !p.corridor && z < p.z - 0.06) &&
        // Plain things far apart in depth may stand one behind the other: that is what makes the scene deep.
        !(plain && !p.keep && Math.abs(p.z - z) > (p.trunk === true && half < 7 ? 0.07 : 0.15)),
    );
    return Math.min(Infinity, ...near.map((p) => Math.abs(p.x - x) * PLAN_COLS - p.half - half + (plain && !p.keep ? Math.min(half, p.half) * 0.8 : 0)));
  };
  /** The roomiest of some spots between lo and hi at depth z, and whether it is clear. */
  const find = (half: number, z: number, lo: number, hi: number, plain: boolean, cover = false): { x: number; clear: boolean } => {
    let best = { x: lo + r() * (hi - lo), room: -Infinity };
    for (let tries = 0; tries < 60; tries++) {
      const x = lo + r() * (hi - lo);
      const rm = room(x, z, half, plain, cover);
      if (rm > 1) return { x, clear: true };
      if (rm > best.room) best = { x, room: rm };
    }
    return { x: best.x, clear: false };
  };
  /** Places something that must be there, crowded or not; `keep` keeps everything in front off it, `soft` lets ground cover grow by it. */
  const place = (half: number, z: number, lo: number, hi: number, keep: boolean, soft = false): number => {
    const { x } = find(half, z, lo, hi, false);
    placed.push({ x, z, half, keep, soft });
    return x;
  };
  /** Places a plain prop only where it has room. */
  const placeIfClear = (half: number, z: number, lo: number, hi: number, cover = false, trunk = false): number | null => {
    const { x, clear } = find(half, z, lo, hi, true, cover);
    if (!clear) return null;
    placed.push({ x, z, half, keep: false, cover, trunk });
    return x;
  };

  const homeLeft = r() < 0.5;
  let home: Prop;
  let homeX: number;
  if (corridor) {
    // Under the canopy it lives in a hollow at the foot of the great tree at the window's edge (drawn
    // for the left, turned round for the right), right at the front.
    const sprite = footprint('home', homeLeft ? 0 : 1, biome);
    homeX = homeLeft ? 0.12 : 0.88;
    // Only its doorway needs to be kept clear; whatever stands behind the great tree is hidden by it anyway.
    placed.push({ x: homeX, z: 1, half: (sprite.door?.w ?? 12) / 2 + 2, keep: true });
    home = { kind: 'home', x: homeX, z: 1, variant: homeLeft ? 0 : 1, sprite, edge: homeLeft ? -1 : 1 };
  } else {
    const sprite = footprint('home', 0, biome);
    homeX = place(sprite.w / 2, HOME_Z, homeLeft ? 0.24 : 0.64, homeLeft ? 0.36 : 0.76, true);
    home = { kind: 'home', x: homeX, z: HOME_Z, variant: 0, sprite };
  }

  let water: Prop | null = null;
  if (def.water !== null) {
    const sprite = footprint(def.water, 0, biome);
    const z = corridor ? 0.72 + r() * 0.15 : 0.5 + r() * 0.15;
    const x = corridor ? place(sprite.w / 2, z, homeLeft ? 0.7 : 0.14, homeLeft ? 0.86 : 0.3, true, true) : place(sprite.w / 2, z, homeLeft ? 0.55 : 0.12, homeLeft ? 0.85 : 0.42, true, true);
    water = { kind: def.water, x, z, variant: 0, sprite };
  }

  const props: Prop[] = [home];
  if (water !== null) props.push(water);
  let forage: Prop | null = null;
  for (const [kind, count] of def.props) {
    for (let i = 0; i < count; i++) {
      // A trunk's width goes with its depth: thin far off, wide near. Its depth is chosen first.
      const trunkZ = kind === 'trunk' ? 0.04 + (i / Math.max(1, count - 1)) * 0.78 + r() * 0.06 : 0;
      // Under the canopy what grows far off is drawn smaller: its depth is chosen first, and an odd
      // variant asks for a far one.
      const growZ = corridor && SCALED.has(kind) ? (kind === 'fern' ? 0.2 + r() * 0.6 : 0.2 + r() * 0.75) : -1;
      const variant =
        kind === 'trunk' ? (trunkZ < 0.3 ? 0 : trunkZ < 0.58 ? 1 : 2) + 3 * Math.floor(r() * 100)
        : growZ >= 0 ? Math.floor(r() * 500) * 2 + (growZ < 0.45 ? 1 : 0)
        : Math.floor(r() * 1000);
      const sprite = footprint(kind, variant, biome);
      // Under the canopy the trees stand anywhere but in front of the glow, which stays the one open view.
      // Big ferns keep back from the very front, where they would hide it.
      const z = kind === 'trunk' ? trunkZ : growZ >= 0 ? growZ : BACK.has(kind) ? (corridor ? 0.25 + r() * 0.55 : r() * 0.35) : 0.2 + r() * 0.75;
      const focus = forestFocus(homeLeft);
      // Trees and trunks stand anywhere but in front of the glow; the wide near trunks only towards the sides.
      const window = kind === 'trunk' ? (z > 0.58 ? 0.24 : 0.1) : 0.14;
      // Nor where the great tree stands: whatever stood there would be hidden behind it.
      const near = homeLeft ? 0.27 : 0.03;
      const far = homeLeft ? 0.97 : 0.73;
      const [lo, hi] = corridor && (BACK.has(kind) || kind === 'trunk') ? (r() < 0.5 ? [near, focus - window] : [focus + window, far]) : [0.03, 0.97];
      // A trunk needs room for its bark, not its roots: those may run in among the others.
      const half = kind === 'trunk' ? [3, 4.5, 6.5][variant % 3] : COVER.has(kind) ? 5 : sprite.w / 2;
      const x = placeIfClear(half, z, lo, hi, COVER.has(kind), kind === 'trunk');
      if (x === null) continue;
      const prop: Prop = { kind, x, z, variant, sprite };
      props.push(prop);
      if (kind === def.forage && (forage === null || Math.abs(z - 0.5) < Math.abs(forage.z - 0.5))) forage = prop;
    }
  }
  if (forage === null) {
    const sprite = footprint(def.forage, 0, biome);
    forage = { kind: def.forage, x: place(sprite.w / 2, 0.4, 0.05, 0.95, false), z: 0.4, variant: 0, sprite };
    props.push(forage);
  }
  const seats = props.filter((p) => p.kind === 'rock' || p.kind === 'stump' || p.kind === 'snowdrift');
  const cairnX = place(3, CAIRN_Z, homeLeft ? homeX + 0.1 : homeX - 0.16, homeLeft ? homeX + 0.16 : homeX - 0.1, true);
  return { props, home, water, forage, seats, cairn: { x: Math.min(0.95, Math.max(0.05, cairnX)), z: CAIRN_Z } };
}

/**
 * How many terminal pixels each pixel of the art takes, each way, in a window `cols` wide with `rows` for
 * the scene: on a big window the scene is drawn at the size it was made for and enlarged, pixel for pixel,
 * so the art keeps its density instead of shrinking in a sea of flat colour.
 */
export function pixelScale(cols: number, rows: number): number {
  return Math.max(1, Math.min(Math.floor(cols / 95), Math.floor((rows * 2) / 60)));
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

  /** Left column of a prop: centred on its x, or flush with the window's edge if it stands against it. */
  leftOf(p: Prop): number {
    if (p.edge === undefined) return this.left(p.x, p.sprite.w);
    const crop = frameCrop(this.cols, true);
    return p.edge < 0 ? -crop : this.cols - p.sprite.w + crop;
  }

  /** Where to stand beside a prop: just in front of it, to one side. */
  beside(p: Prop, side: -1 | 1): { x: number; z: number } {
    const dx = (p.sprite.w / 2 + 3) / Math.max(1, this.cols);
    return { x: Math.max(0.03, Math.min(0.97, p.x + side * dx)), z: Math.min(1, p.z + 0.06) };
  }

  /** Where to stand in the doorway of a home. */
  door(home: Prop): { x: number; z: number } {
    const col = this.leftOf(home) + (home.sprite.door?.col ?? home.sprite.w >> 1) + 1;
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

const FLYERS: ReadonlySet<CritterKind> = new Set(['butterfly', 'bird', 'firefly', 'moth', 'bat']);
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
    // Under the canopy the woods are full of life: more of them, more often.
    const lush = def.gloom !== undefined;
    const most = night ? (lush ? 12 : 6) : lush ? 6 : 3;
    const rate = night ? 0.5 : lush ? 0.2 : 0.08;
    if (!wet && kinds.length > 0 && this.critters.length < most && this.random() < dt * rate) {
      const kind = kinds[Math.floor(this.random() * kinds.length)];
      // Only one deer at a time; nothing cold-blooded or winged in the snow.
      const deer = kind === 'deer' && this.critters.some((c) => c.kind === 'deer');
      if (!deer && !(cold && (kind === 'butterfly' || kind === 'firefly' || kind === 'frog' || kind === 'bat'))) this.spawn(kind);
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
          c.x += (c.vx * dt) / geo.cols;
          c.y += Math.sin(c.t * 1.3 + c.phase) * 0.01 * dt;
          break;
        case 'bat':
          // Flitting: darting this way and that across its way, dipping and climbing.
          c.x += ((c.vx + Math.sin(c.t * 5.3 + c.phase) * 9) * dt) / geo.cols;
          c.y = Math.max(0.05, Math.min(0.55, c.y + Math.cos(c.t * 4.1 + c.phase) * 0.25 * dt));
          break;
        case 'deer':
          // A few steps, then a long while grazing.
          if (Math.sin(c.t * 0.35 + c.phase) > 0.55) c.x += (c.vx * dt) / geo.cols;
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
    const speed =
      kind === 'bird' ? 9 + this.random() * 6
      : kind === 'bat' ? 6 + this.random() * 4
      : kind === 'hare' ? 6 + this.random() * 3
      : kind === 'deer' ? 2 + this.random()
      : kind === 'butterfly' || kind === 'moth' ? 3 + this.random() * 2
      : 2 + this.random() * 2;
    const inside = kind === 'firefly' || kind === 'moth';
    let y = 0.5;
    if (kind === 'bird') y = 0.08 + this.random() * 0.25;
    else if (kind === 'bat') y = 0.1 + this.random() * 0.3;
    else if (kind === 'butterfly') y = 0.45 + this.random() * 0.4;
    else if (inside) y = 0.4 + this.random() * 0.5;
    const c: Critter = {
      kind,
      x: inside ? 0.05 + this.random() * 0.9 : fromLeft ? -0.02 : 1.02,
      y,
      z: 0.3 + this.random() * 0.6,
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
