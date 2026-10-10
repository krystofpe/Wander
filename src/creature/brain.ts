// The brain: every activity scores itself from needs, personality, time, weather and the scene; the next one is
// a weighted random pick. Each activity is a little script (a generator) stepped once per frame. From the terminal
// creature (feat/creature src/brain.ts) as it was, walking in native pixels and leaving sprites instead of glyphs.
import { BIOMES, BRAIN, COOLDOWN_SEC, DEPTH_PX, IDLE_KNOCK_SEC, MOON_FINDS, PRESENT_SEC, SELF_FEED_CAP, SELF_PLAY_CAP } from './config.ts';
import type { PlaceName } from './config.ts';
import type { Visit } from './visit.ts';

/** Where in its world its portal opens (a share across, a depth). */
/** Where its portal opens: across the scene from its home. */
export function portalOf(layout: { readonly homeLeft: boolean }): { readonly x: number; readonly z: number } {
  return { x: layout.homeLeft ? 0.74 : 0.26, z: 0.3 };
}
import { MAX_CAIRN, clamp01, isNightFor, warm } from './life.ts';
import type { Feelings, Life, Mood } from './life.ts';
import { CREATURE } from './look.ts';
import { forestFocus } from './scene.ts';
import type { Critter, Geometry, Prop, Scene, SignKind } from './scene.ts';
import type { Sky } from './sky.ts';
import type { Topic } from './speech.ts';
import { visitAt } from './visitor.ts';

/** What the creature is doing with its body; the page draws each one (src/creature/look.ts POSE_TAGS). */
export type Pose = 'stand' | 'walk' | 'sit' | 'sleep' | 'jump' | 'wave' | 'dig' | 'eat';

export type Gaze = 'center' | 'left' | 'right' | 'up' | 'down';

/** How it looks right now. Not saved. */
export type Body = {
  x: number;
  z: number;
  facing: 1 | -1;
  pose: Pose;
  /** Eyes for the current action, or null for its mood's. */
  eyes: string | null;
  /** Where it looks, or null to look where it faces. */
  gaze: Gaze | null;
  /** Pixels above the ground, while jumping. */
  lift: number;
  /** False while it is away wandering. */
  visible: boolean;
  /** Inside its home: only its eyes show, in the doorway. */
  inside: boolean;
  /** Stepping through its doorway: 0 outside, rising to 1 as it fades into the dark inside. */
  doorway: number;
  /** What it holds up: a food's sprite, a find, a stone (things.ts `food` and `carry`). */
  holding: { readonly kind: string } | null;
  /** A small sign above its head: ?, !, …. */
  icon: string | null;
  /** Pixels walked, for its walk cycle and its steps. */
  walked: number;
};

export function newBody(x: number, z: number): Body {
  return { x, z, facing: 1, pose: 'stand', eyes: null, gaze: null, lift: 0, visible: true, inside: false, doorway: 0, holding: null, icon: null, walked: 0 };
}

/** Moments when it may speak with Claude's words instead of its own. */
export type VoiceKind = 'visit' | 'thought' | 'gift' | 'return' | 'greet' | 'stargaze' | 'knock';

/** What activities can see and do; the game provides it. */
export interface Ctx {
  readonly life: Life;
  /** Where its scene is set: its biome, or the hollow ('deep'). */
  readonly place: PlaceName;
  readonly body: Body;
  readonly scene: Scene;
  readonly geo: Geometry;
  readonly sky: Sky;
  readonly feelings: Feelings;
  readonly mood: Mood;
  random(): number;
  /** World time, epoch ms. */
  now(): number;
  /** Seconds since your last key or click. */
  idleSec(): number;
  /** False while the window is known to be in the background. */
  focused(): boolean;
  /** True while you are typing to it. */
  talking(): boolean;
  say(topic: Topic, extra?: Readonly<Record<string, string>>): void;
  sayText(text: string): void;
  /** Speaks with Claude's words when it can, otherwise a local line for `fallback`. */
  voice(kind: VoiceKind, fallback: Topic, extra?: Readonly<Record<string, string>>): void;
  /** True while a bubble shows or words are on their way. */
  speaking(): boolean;
  diary(text: string): void;
  /** Holds out a gift; `offerState` tells whether you took it. */
  offer(item: string): void;
  offerState(): 'none' | 'waiting' | 'taken';
  endOffer(): void;
  /** Asks you a yes/no question; false when it has nothing left to ask. */
  ask(): boolean;
  questionState(): 'none' | 'waiting' | 'answered';
  endQuestion(): void;
  /** At the end of the first meeting: asks your name. */
  askName(): void;
  /** Where you last clicked on the ground, or null. */
  pointed(): { x: number; z: number } | null;
  /** Its visit to the traveller's camp tonight, if it is the hour (src/creature/visit.ts). */
  visit(): Visit | null;
  /** Opens its portal to `k` (0 shut … 1 open). */
  opening(k: number): void;
  /** It has gone through its portal (true), or come back (false: it keeps the visit). */
  through(gone: boolean): void;
  /** Rings the bell, if allowed. */
  bell(): void;
}

export type Script = Generator<void, void, number>;

export const ACTIVITIES = [
  'idle', 'stroll', 'sit', 'nap', 'sleep', 'forage', 'eat', 'drink', 'chase', 'critter', 'play', 'stargaze', 'shelter',
  'dance', 'ponder', 'dig', 'hum', 'stack', 'visit', 'knock', 'gift', 'ask', 'hide', 'wander', 'watch', 'portal',
] as const;
export type ActivityName = (typeof ACTIVITIES)[number];
export const REACTIONS = ['listen', 'petted', 'woken', 'startle', 'greet', 'arrive', 'return', 'go', 'wave', 'jump', 'spin'] as const;
export type ReactionName = (typeof REACTIONS)[number];
export type DoName = ActivityName | ReactionName;

/** What you (or Claude) can ask it to do. */
export const REQUESTABLE: readonly DoName[] = [
  'stroll', 'sit', 'sleep', 'play', 'dance', 'dig', 'hum', 'stargaze', 'ponder', 'visit', 'hide', 'stack', 'wave', 'jump', 'spin', 'wander',
];

export function isDoName(s: string): s is DoName {
  return (ACTIVITIES as readonly string[]).includes(s) || (REACTIONS as readonly string[]).includes(s);
}

// ── Script helpers ─────────────────────────────────────────────────────────

/** Waits `sec` real seconds. */
function* wait(sec: number): Script {
  let t = 0;
  while (t < sec) t += yield;
}

/** Waits until `done()` or `limit` seconds pass. */
function* until(done: () => boolean, limit: number): Script {
  let t = 0;
  while (t < limit && !done()) t += yield;
}

/** A spot to stand on near (x, z), out of the pond. */
export function dry(c: { readonly scene: Scene; readonly geo: Geometry }, x: number, z: number): { x: number; z: number } {
  const w = c.scene.layout.water;
  if (w === null) return { x, z };
  // The pond lies over the depths from its far edge to its near one: its feet must be in front of it, or behind.
  const far = w.z - w.sprite.h / DEPTH_PX;
  const half = (w.sprite.w + CREATURE.w * 0.6) / 2;
  if (Math.abs(x - w.x) * c.geo.w > half || z < far - 0.08 || z > w.z + 0.08) return { x, z };
  return w.z + 0.1 <= 1 ? { x, z: w.z + 0.1 } : { x, z: Math.max(0, far - 0.1) };
}

/** Walks (or runs) to (x, z), stepping round the pond. Gives up after `limit` seconds. */
function* walkTo(c: Ctx, tx: number, tz: number, run = false, limit = 30): Script {
  const { x, z } = tx < 0 || tx > 1 ? { x: tx, z: tz } : dry(c, tx, tz);
  const b = c.body;
  b.pose = 'walk';
  let t = 0;
  while (t < limit) {
    const dt = yield;
    t += dt;
    if (!step(c, x, z, run, dt, 1, 0.02)) break;
  }
  b.pose = 'stand';
}

/** Walks to a moving target, as given by `target()` each frame, until `near()` or the time runs out. */
function* follow(c: Ctx, target: () => { x: number; z: number } | null, near: () => boolean, run: boolean, limit: number): Script {
  const b = c.body;
  let t = 0;
  b.pose = 'walk';
  while (t < limit) {
    const at = target();
    if (at === null || near()) break;
    const dt = yield;
    t += dt;
    step(c, at.x, at.z, run, dt, 0.5, 0.01);
  }
  b.pose = 'stand';
}

/**
 * One step toward (x, z): across at its walking or running pace, in depth at its slower pace, turning to face the
 * way it goes. False once it is there (within `nearPx` across and `nearZ` in depth).
 */
function step(c: Ctx, x: number, z: number, run: boolean, dt: number, nearPx: number, nearZ: number): boolean {
  const b = c.body;
  const dx = (x - b.x) * c.geo.w;
  const dz = z - b.z;
  if (Math.abs(dx) < nearPx && Math.abs(dz) < nearZ) return false;
  if (Math.abs(dx) >= nearPx) {
    const s = Math.sign(dx) * Math.min(Math.abs(dx), (run ? BRAIN.runSpeed : BRAIN.walkSpeed) * dt);
    b.x += s / c.geo.w;
    b.walked += Math.abs(s);
    b.facing = dx > 0 ? 1 : -1;
  }
  if (Math.abs(dz) >= nearZ) {
    const s = Math.sign(dz) * Math.min(Math.abs(dz), BRAIN.depthSpeed * dt);
    b.z += s;
    b.walked += Math.abs(s) * DEPTH_PX;
  }
  return true;
}

/** A hop: up and down again, `height` in eighths of its own height. */
function* hop(c: Ctx, height = 1.5): Script {
  const b = c.body;
  const pose = b.pose;
  b.pose = 'jump';
  let t = 0;
  while (t < 0.5) {
    t += yield;
    b.lift = Math.max(0, Math.sin((Math.min(t, 0.5) / 0.5) * Math.PI) * height * (CREATURE.tall / 8));
  }
  b.lift = 0;
  b.pose = pose === 'jump' ? 'stand' : pose;
}

/** Walks to its door and steps in: framed by the doorway, it fades into the dark inside. Its nest it hops into. */
function* goIn(c: Ctx, run = false): Script {
  const home = c.scene.layout.home;
  const door = c.geo.door(home);
  if (home.nest === true) {
    yield* walkTo(c, door.x, Math.min(1, door.z + 0.08), run);
    yield* hop(c, 1);
    c.body.x = door.x;
    c.body.z = door.z;
    c.body.inside = true;
    return;
  }
  yield* walkTo(c, door.x, door.z, run);
  yield* through(c, 1);
  c.body.inside = true;
  c.body.doorway = 0;
}

/** Steps out of the dark of its doorway (or hops out of its nest) and walks a few steps from it. */
function* comeOut(c: Ctx): Script {
  const home = c.scene.layout.home;
  c.body.inside = false;
  if (home.nest === true) {
    c.body.z = Math.min(1, home.z + 0.08);
    yield* hop(c, 1);
  } else {
    c.body.doorway = 1;
    yield* through(c, 0);
  }
  yield* walkTo(c, c.body.x, Math.min(1, home.z + 0.1));
}

/** Opens its portal (from 0 to 1) or closes it (1 to 0), quickly: a tear in the air. */
function* tear(c: Ctx, from: number, to: number): Script {
  for (let t = 0; t < 0.8; t += yield) c.opening(from + (to - from) * (t / 0.8));
  c.opening(to);
}

/** Moves its doorway fade to `to` (1 gone into the dark, 0 outside) over BRAIN.doorwaySec. */
function* through(c: Ctx, to: number): Script {
  const b = c.body;
  b.pose = 'stand';
  const from = b.doorway;
  let t = 0;
  while (t < BRAIN.doorwaySec) {
    b.doorway = from + (to - from) * (t / BRAIN.doorwaySec);
    t += yield;
  }
  b.doorway = to;
}

const fullMoon = (c: Ctx): boolean => Math.abs(c.sky.moon - 0.5) < 0.06;
const darkMoon = (c: Ctx): boolean => c.sky.moon < 0.05 || c.sky.moon > 0.95;

/** Something it finds: by the full or the new moon at night, sometimes a stranger thing than the biome holds. */
function pickFind(c: Ctx): string {
  const list = c.sky.daylight < 0.25 && c.random() < 0.5 && fullMoon(c) ? MOON_FINDS.full : c.sky.daylight < 0.25 && c.random() < 0.5 && darkMoon(c) ? MOON_FINDS.dark : BIOMES[c.place].finds;
  return list[Math.floor(c.random() * list.length)];
}

/** Waits for its bubble to finish (or `limit` seconds). */
function* hush(c: Ctx, limit = 12): Script {
  yield* until(() => !c.speaking(), limit);
}

/** Faces you: turns to the front and looks out. */
function faceYou(c: Ctx): void {
  c.body.gaze = 'center';
}

/** The sign a terminal glyph stood for. */
function signOf(glyph: string): SignKind {
  if (glyph === '♥') return 'heart';
  if (glyph === '♪' || glyph === '♫') return 'note';
  if (glyph === 'z' || glyph === 'Z') return glyph;
  if (glyph === '*') return 'spark';
  return 'drop';
}

/** Little signs rising from its head (hearts, notes, sleep, sparks) or falling about it (drops). */
function particles(c: Ctx, glyph: string, _color: number, count: number, opts: { up?: number; spread?: number; life?: number; glow?: boolean; gravity?: number } = {}): void {
  const { x, y } = headOf(c);
  for (let i = 0; i < count; i++) {
    c.scene.emit({
      kind: signOf(glyph),
      x: x + (c.random() - 0.5) * (opts.spread ?? 4) * 3,
      y: y - 2 + (c.random() - 0.5) * 2,
      vx: (c.random() - 0.5) * 10,
      vy: -((opts.up ?? 2) * 6 + c.random() * 5),
      life: (opts.life ?? 1.6) + c.random() * 0.6,
      gravity: (opts.gravity ?? 0) * 20,
    });
  }
}

/** The top of its hood, in native pixels: where its thoughts and hearts rise from. */
export function headOf(c: { readonly body: Body; readonly geo: Geometry }): { x: number; y: number } {
  return { x: c.geo.px(c.body.x), y: c.geo.footY(c.body.x, c.body.z) - CREATURE.tall - c.body.lift };
}

const nearestOf = (props: readonly Prop[], x: number): Prop | null =>
  props.reduce<Prop | null>((best, p) => (best === null || Math.abs(p.x - x) < Math.abs(best.x - x) ? p : best), null);

const sideOf = (c: Ctx, p: Prop): -1 | 1 => (c.body.x < p.x ? -1 : 1);

// ── Activities ─────────────────────────────────────────────────────────────

type Activity = {
  readonly cooldown?: number;
  score(c: Ctx): number;
  run(c: Ctx): Script;
};

const raining = (c: Ctx): boolean => c.sky.weather.precip > 0.25;
const present = (c: Ctx): boolean => c.idleSec() < PRESENT_SEC && c.focused();
const bedtime = (c: Ctx): boolean => isNightFor(c.life.traits, c.sky.hour);
const visibleCritter = (c: Ctx): Critter | null =>
  // It chases the small ones; not birds overhead, not bats, not the deer.
  c.scene.critters.find((k) => k.kind !== 'bird' && k.kind !== 'bat' && k.kind !== 'deer' && k.x > 0.05 && k.x < 0.95) ?? null;

const ACT: Readonly<Record<ActivityName, Activity>> = {
  idle: {
    score: (c) => 0.25 + 0.2 * c.life.traits.lazy,
    *run(c) {
      c.body.pose = 'stand';
      const looks: (Gaze | null)[] = ['left', 'right', 'up', null, 'center'];
      for (let i = 0; i < 3; i++) {
        c.body.gaze = looks[Math.floor(c.random() * looks.length)];
        yield* wait(1.5 + c.random() * 2.5);
      }
      c.body.gaze = null;
    },
  },
  stroll: {
    score: (c) => (bedtime(c) ? 0.05 : 0.3 + 0.35 * c.life.traits.curious * (c.life.needs.rest > 0.3 ? 1 : 0.3)),
    *run(c) {
      yield* walkTo(c, 0.06 + c.random() * 0.88, 0.25 + c.random() * 0.7);
      yield* wait(1 + c.random() * 2);
    },
  },
  sit: {
    score: (c) => 0.2 + 0.4 * c.life.traits.lazy + 0.3 * (1 - c.life.needs.rest),
    *run(c) {
      const seat = nearestOf(c.scene.layout.seats, c.body.x);
      if (seat !== null && c.random() < 0.7) {
        const at = c.geo.beside(seat, sideOf(c, seat));
        yield* walkTo(c, at.x, at.z);
      }
      c.body.pose = 'sit';
      yield* wait(8 + c.random() * 14);
      if (c.random() < 0.3) {
        c.body.gaze = 'up';
        yield* wait(3);
      }
      c.body.gaze = null;
      c.body.pose = 'stand';
    },
  },
  nap: {
    cooldown: 300,
    score: (c) => (!bedtime(c) && c.life.needs.rest < 0.35 ? 0.6 + (0.35 - c.life.needs.rest) * 2 + 0.3 * c.life.traits.lazy : 0),
    *run(c) {
      c.body.pose = 'sleep';
      c.body.eyes = '- -';
      c.life.asleep = true;
      try {
        let t = 0;
        const length = 30 + c.random() * 60;
        while (t < length) {
          const dt = yield;
          t += dt;
          if (c.random() < dt * 0.6) particles(c, c.random() < 0.5 ? 'z' : 'Z', 0, 1, { up: 1, spread: 1, life: 2 });
        }
        c.life.needs.rest = clamp01(c.life.needs.rest + 0.05);
      } finally {
        c.life.asleep = false;
        c.body.eyes = null;
      }
    },
  },
  sleep: {
    score: (c) => {
      if (bedtime(c)) return c.life.needs.rest > 0.97 ? 0.4 : 1.4 + (1 - c.life.needs.rest);
      return c.life.needs.rest < 0.12 ? 1.2 : 0;
    },
    *run(c) {
      const already = c.life.asleep && c.body.inside;
      if (!already) {
        if (c.random() < 0.5) c.say('sleepy');
        yield* goIn(c);
      }
      c.body.inside = true;
      c.body.eyes = '- -';
      c.life.asleep = true;
      if (bedtime(c) && !already) c.say('goodnight');
      let t = 0;
      while (bedtime(c) || (c.life.needs.rest < 0.6 && t < 600)) {
        const dt = yield;
        t += dt;
        if (c.random() < dt * 0.4) zFromDoor(c);
        if (!bedtime(c) && c.life.needs.rest >= 1) break;
      }
      c.life.asleep = false;
      c.body.eyes = '‿ ‿';
      yield* wait(1.5);
      yield* comeOut(c);
      c.body.eyes = null;
      c.say('wakeUp');
      yield* hush(c, 4);
    },
  },
  forage: {
    cooldown: 45,
    score: (c) => (c.life.needs.food < SELF_FEED_CAP ? (1 - c.life.needs.food) * 1.6 : 0),
    *run(c) {
      const spot = c.scene.layout.forage;
      const at = c.geo.beside(spot, sideOf(c, spot));
      yield* walkTo(c, at.x, at.z, c.life.needs.food < 0.2);
      c.body.facing = spot.x > c.body.x ? 1 : -1;
      c.body.pose = 'wave';
      yield* wait(1.5);
      c.body.pose = 'eat';
      c.body.holding = { kind: 'berry' };
      for (let i = 0; i < 4; i++) {
        c.body.eyes = i % 2 === 0 ? '^ ^' : '- -';
        yield* wait(0.6);
      }
      c.body.holding = null;
      c.body.eyes = null;
      c.life.needs.food = Math.max(c.life.needs.food, Math.min(SELF_FEED_CAP, c.life.needs.food + 0.35));
      if (c.random() < 0.4) c.say('eatForage');
      yield* wait(2);
      c.body.pose = 'stand';
    },
  },
  eat: {
    score: (c) => (c.scene.foods.some((f) => f.h === 0) ? 0.3 + (1 - c.life.needs.food) * 1.5 + c.life.bond * 0.3 : 0),
    *run(c) {
      const landed = c.scene.foods.filter((f) => f.h === 0);
      const food = landed.reduce((a, f) => (Math.abs(f.x - c.body.x) < Math.abs(a.x - c.body.x) ? f : a), landed[0]);
      if (food === undefined) return;
      const hungry = c.life.needs.food < 0.5;
      yield* walkTo(c, food.x - c.body.facing * 0.01, food.z, hungry);
      c.body.facing = food.x >= c.body.x ? 1 : -1;
      if (!c.scene.foods.includes(food)) return; // gone
      if (c.life.needs.food > 0.92) {
        c.body.gaze = 'down';
        yield* wait(1);
        c.say('full');
        c.body.gaze = null;
        yield* hush(c, 4);
        return;
      }
      c.scene.foods.splice(c.scene.foods.indexOf(food), 1);
      c.body.holding = { kind: food.kind.sprite };
      c.body.pose = 'eat';
      for (let i = 0; i < 6; i++) {
        c.body.eyes = i % 2 === 0 ? '^ ^' : '- -';
        yield* wait(0.5);
      }
      c.body.holding = null;
      c.body.eyes = null;
      c.life.needs.food = clamp01(c.life.needs.food + 0.35);
      c.life.needs.love = clamp01(c.life.needs.love + 0.05);
      c.feelings.joy = clamp01(c.feelings.joy + 0.35);
      c.life.stats.fed++;
      warm(c.life);
      c.say('thanksFood', { food: food.kind.name.replace(/^an? /, '') });
      particles(c, '♥', 0, 2);
      yield* wait(2.5);
      c.body.pose = 'stand';
    },
  },
  drink: {
    cooldown: 180,
    score: (c) => 0.15 + (c.sky.season === 'summer' ? 0.15 : 0),
    *run(c) {
      const water = c.scene.layout.water;
      const at = water !== null ? c.geo.beside(water, sideOf(c, water)) : { x: c.body.x, z: 0.02 };
      yield* walkTo(c, at.x, at.z);
      if (water !== null) c.body.facing = water.x > c.body.x ? 1 : -1;
      c.body.pose = 'sit';
      c.body.gaze = 'down';
      yield* wait(2);
      for (let i = 0; i < 3; i++) particles(c, '.', 0x9fd0ff, 1, { up: 1, spread: 2, life: 0.6 });
      if (c.random() < 0.3) c.say('drink');
      yield* wait(2.5);
      c.body.gaze = null;
      c.body.pose = 'stand';
    },
  },
  chase: {
    score: (c) => (c.scene.toy !== null && c.life.needs.rest > 0.15 ? 0.5 + 0.6 * c.life.traits.playful + 0.6 * (1 - c.life.needs.fun) : 0),
    *run(c) {
      let bats = 0;
      while (c.scene.toy !== null && bats < 4) {
        const toy = c.scene.toy;
        yield* follow(c, () => (c.scene.toy === null ? null : { x: c.scene.toy.x, z: c.scene.toy.z }), () => {
          const t = c.scene.toy;
          return t !== null && Math.abs(t.x - c.body.x) * c.geo.w < 10 && Math.abs(t.z - c.body.z) < 0.2 && t.h < 12;
        }, true, 12);
        if (c.scene.toy !== toy) break;
        // Bat it away, with a hop.
        toy.vx = (c.random() < 0.5 ? -1 : 1) * (90 + c.random() * 80);
        toy.vh = 70 + c.random() * 35;
        toy.resting = false;
        bats++;
        c.life.needs.fun = clamp01(c.life.needs.fun + 0.1);
        c.feelings.joy = clamp01(c.feelings.joy + 0.2);
        c.body.eyes = '^ ^';
        if (bats === 1) c.say('play');
        yield* hop(c, 2);
        c.body.eyes = null;
      }
      if (bats > 0) {
        c.life.stats.played++;
        c.life.needs.love = clamp01(c.life.needs.love + 0.04);
        warm(c.life);
      }
    },
  },
  critter: {
    cooldown: 60,
    score: (c) => (visibleCritter(c) !== null && !bedtime(c) ? 0.25 + 0.4 * c.life.traits.playful + 0.2 * c.life.traits.curious : 0),
    *run(c) {
      const k = visibleCritter(c);
      if (k === null) return;
      c.body.icon = '!';
      yield* wait(0.8);
      c.body.icon = null;
      yield* follow(c, () => (c.scene.critters.includes(k) ? { x: k.x, z: k.flies ? c.body.z : k.z } : null), () => Math.abs(k.x - c.body.x) * c.geo.w < 12, c.life.traits.playful > 0.5, 8);
      // It gets away.
      k.vx = (k.x > c.body.x ? 1 : -1) * Math.max(30, Math.abs(k.vx) * 2);
      yield* hop(c);
      c.body.gaze = k.flies ? 'up' : null;
      yield* wait(1.5);
      c.body.gaze = null;
      c.life.needs.fun = clamp01(c.life.needs.fun + 0.05);
    },
  },
  play: {
    cooldown: 30,
    score: (c) => (c.life.needs.fun < SELF_PLAY_CAP && !bedtime(c) ? (1 - c.life.needs.fun) * 0.9 * (0.5 + c.life.traits.playful) : 0.05),
    *run(c) {
      if (c.random() < 0.5) c.say('playAlone');
      for (let i = 0; i < 4 + Math.floor(c.random() * 4); i++) {
        if (c.random() < 0.4) c.body.facing = c.body.facing === 1 ? -1 : 1;
        c.body.eyes = '^ ^';
        yield* hop(c, 1 + c.random() * 1.5);
        yield* wait(0.2 + c.random() * 0.4);
      }
      c.body.eyes = null;
      c.life.needs.fun = Math.max(c.life.needs.fun, Math.min(SELF_PLAY_CAP, c.life.needs.fun + 0.12));
      c.feelings.joy = clamp01(c.feelings.joy + 0.1);
    },
  },
  stargaze: {
    cooldown: 120,
    score: (c) => (c.sky.daylight < 0.25 && c.sky.weather.cloud < 0.5 && !bedtime(c) ? 0.4 + 0.3 * c.life.traits.curious + (fullMoon(c) ? 0.3 : 0) : 0),
    *run(c) {
      yield* walkTo(c, 0.2 + c.random() * 0.6, 0.6 + c.random() * 0.3);
      c.body.pose = 'sit';
      c.body.gaze = 'up';
      c.body.eyes = '° °';
      yield* wait(4);
      if (c.random() < 0.5) c.voice('stargaze', 'stargaze');
      yield* wait(8 + c.random() * 10);
      if (c.random() < 0.3) {
        shootingStar(c);
        yield* wait(0.8);
        c.body.eyes = 'o o';
        c.say('wish');
        c.diary('Saw a falling star and made a wish.');
        yield* hush(c, 6);
      }
      c.body.eyes = null;
      c.body.gaze = null;
      c.body.pose = 'stand';
    },
  },
  shelter: {
    score: (c) => (raining(c) && c.life.traits.rainLover < 0.5 ? 0.7 + (0.5 - c.life.traits.rainLover) * 1.5 : 0),
    *run(c) {
      c.say('rainDislike');
      yield* goIn(c, true);
      yield* until(() => !raining(c), 90 + c.random() * 90);
      yield* comeOut(c);
    },
  },
  dance: {
    cooldown: 40,
    score: (c) => (raining(c) && c.life.traits.rainLover >= 0.5 ? 0.4 + 0.6 * c.life.traits.rainLover : 0),
    *run(c) {
      c.say(c.sky.weather.kind === 'snow' ? 'snow' : c.random() < 0.5 ? 'rainLike' : 'dance');
      for (let i = 0; i < 6; i++) {
        c.body.facing = c.body.facing === 1 ? -1 : 1;
        c.body.eyes = '^ ^';
        c.body.gaze = 'up';
        yield* hop(c, 1.2);
        if (c.sky.weather.kind === 'rain') particles(c, '.', 0xa9c4e8, 2, { up: -1, spread: 5, life: 0.5, gravity: 10 });
      }
      c.body.eyes = null;
      c.body.gaze = null;
      c.life.needs.fun = clamp01(c.life.needs.fun + 0.08);
      c.feelings.joy = clamp01(c.feelings.joy + 0.2);
    },
  },
  // At night his camp is far away on his road, and it goes to him: it opens its portal, steps through, and is gone a
  // while (his road draws it by his fire); before dawn it comes back the same way, and keeps the visit.
  portal: {
    cooldown: 60,
    score: (c) => {
      const v = c.visit();
      return v !== null && v.phase !== 'going' && v.phase !== 'closing' && c.body.visible && !c.body.inside && !c.life.asleep ? 7 : 0;
    },
    *run(c) {
      c.body.pose = 'stand';
      c.say('portal');
      yield* hush(c, 3);
      const PORTAL = portalOf(c.scene.layout);
      yield* walkTo(c, PORTAL.x - 0.03, PORTAL.z);
      c.body.facing = 1;
      // It tears open in the air before it, turns a moment; it steps in and fades into the light.
      yield* tear(c, 0, 1);
      yield* wait(0.6);
      yield* walkTo(c, PORTAL.x, PORTAL.z);
      for (let t = 0; t < 0.8; t += yield) c.body.doorway = t / 0.8;
      c.body.visible = false;
      c.body.doorway = 0;
      c.through(true);
      yield* wait(0.7);
      yield* tear(c, 1, 0);
      // Gone, until its visit is over.
      let t = 0;
      while (c.visit() !== null && c.visit()?.phase !== 'closing' && t < 1800) t += yield;
      yield* tear(c, 0, 1);
      yield* wait(0.4);
      c.body.visible = true;
      c.body.doorway = 1;
      for (let k = 0; k < 0.8; k += yield) c.body.doorway = 1 - k / 0.8;
      c.body.doorway = 0;
      c.through(false);
      yield* walkTo(c, PORTAL.x - 0.08, Math.min(1, PORTAL.z + 0.1));
      yield* wait(0.5);
      yield* tear(c, 1, 0);
      c.say('portalBack');
      c.feelings.joy = clamp01(c.feelings.joy + 0.25);
      c.life.needs.love = clamp01(c.life.needs.love + 0.1);
    },
  },
  // When the visitor walks through the glow, it stops whatever it would do next and watches it go by,
  // eyes wide, without a sound; afterwards a word, and a line in its diary.
  watch: {
    cooldown: 300,
    score: (c) => (!c.life.asleep && !c.body.inside && visitAt(c.now(), c.life.seed, c.place, c.sky.daylight) !== null ? 3 : 0),
    *run(c) {
      c.body.pose = 'stand';
      c.body.eyes = 'o o';
      yield* wait(1.5);
      let seen = 0;
      while (visitAt(c.now(), c.life.seed, c.place, c.sky.daylight) !== null && seen < 150) {
        const visit = visitAt(c.now(), c.life.seed, c.place, c.sky.daylight);
        // Its gaze follows it across: it walks from one side of the glow to the other.
        const focus = forestFocus(c.scene.layout.home.x < 0.5);
        const at = visit === null ? focus : focus + visit.dir * (visit.progress - 0.5) * 0.72;
        c.body.gaze = at < c.body.x - 0.08 ? 'left' : at > c.body.x + 0.08 ? 'right' : 'up';
        c.body.eyes = null;
        seen += yield;
      }
      c.body.gaze = null;
      yield* wait(2);
      c.say('visitor');
      c.diary('Something tall walked through the light at the end of the path. It did not look back.');
      yield* hush(c, 5);
      c.body.pose = 'stand';
    },
  },
  ponder: {
    cooldown: 45,
    score: (c) => 0.15 + 0.25 * c.life.traits.curious,
    *run(c) {
      if (c.random() < 0.5) c.body.pose = 'sit';
      c.body.icon = '?';
      c.body.gaze = c.random() < 0.5 ? 'up' : 'down';
      yield* wait(3);
      c.body.icon = null;
      const season = c.sky.season;
      if (c.life.traveller.times > 0 && c.random() < 0.2) c.say('traveller');
      else if (c.random() < 0.25) c.say(season);
      else c.voice('thought', 'ponder');
      yield* hush(c);
      yield* wait(2 + c.random() * 3);
      c.body.gaze = null;
      c.body.pose = 'stand';
    },
  },
  dig: {
    cooldown: COOLDOWN_SEC.dig,
    score: (c) => (bedtime(c) ? 0 : 0.1 + 0.35 * c.life.traits.curious),
    *run(c) {
      yield* walkTo(c, 0.08 + c.random() * 0.84, 0.35 + c.random() * 0.6);
      c.say('dig');
      c.body.pose = 'dig';
      c.body.gaze = 'down';
      let t = 0;
      const length = 4 + c.random() * 3;
      while (t < length) {
        const dt = yield;
        t += dt;
        if (c.random() < dt * 6) {
          // Dirt flying out behind its mittens.
          const foot = c.geo.footY(c.body.x, c.body.z);
          c.scene.emit({ kind: 'dirt', x: c.geo.px(c.body.x) + c.body.facing * 9, y: foot - 3, vx: -c.body.facing * (20 + c.random() * 30), vy: -45 - c.random() * 30, life: 0.8, gravity: 320 });
        }
      }
      c.body.pose = 'stand';
      c.body.gaze = null;
      if (c.random() < 0.15 + 0.25 * c.life.traits.curious) {
        const item = pickFind(c);
        c.life.found.push(item);
        if (c.life.found.length > 12) c.life.found.shift();
        c.life.stats.finds++;
        c.body.holding = { kind: 'find' };
        particles(c, '*', 0, 4, { glow: true });
        c.body.eyes = 'o o';
        c.say('found', { item });
        c.diary(`Found ${item}.`);
        yield* hush(c, 5);
        c.body.holding = null;
        c.body.eyes = null;
      } else {
        c.say('digNothing');
        yield* hush(c, 4);
      }
    },
  },
  hum: {
    cooldown: 60,
    score: (c) => (c.mood === 'content' || c.mood === 'joyful' || c.mood === 'calm' ? 0.3 : 0.05),
    *run(c) {
      if (c.random() < 0.5) c.body.pose = 'sit';
      c.body.eyes = '‿ ‿';
      if (c.random() < 0.5) c.say('hum');
      let t = 0;
      while (t < 8) {
        const dt = yield;
        t += dt;
        if (c.random() < dt * 1.5) particles(c, c.random() < 0.5 ? '♪' : '♫', 0, 1, { up: 1.5, spread: 3, life: 2 });
      }
      c.body.eyes = null;
      c.body.pose = 'stand';
    },
  },
  stack: {
    cooldown: COOLDOWN_SEC.stack,
    score: (c) => (c.life.cairn < MAX_CAIRN && !bedtime(c) ? 0.12 + 0.15 * (1 - c.life.traits.lazy) : 0),
    *run(c) {
      const spot = c.scene.layout.cairn;
      c.body.holding = { kind: 'stone' };
      yield* walkTo(c, spot.x - 0.03, spot.z);
      c.body.facing = 1;
      c.body.pose = 'dig';
      c.say('stack');
      yield* wait(2.5);
      c.body.holding = null;
      c.life.cairn++;
      c.body.pose = 'stand';
      if (c.life.cairn === MAX_CAIRN) {
        c.say('cairnDone');
        c.diary('Finished the cairn. Nine stones.');
      } else if (c.life.cairn === 1) {
        c.diary('Started a cairn.');
      }
      yield* hush(c, 4);
    },
  },
  visit: {
    cooldown: COOLDOWN_SEC.visit,
    score: (c) => (present(c) && c.life.needs.love < 0.75 && !bedtime(c) ? (1 - c.life.needs.love) * (0.4 + c.life.bond) : 0),
    *run(c) {
      yield* comeForward(c);
      c.body.pose = 'wave';
      yield* wait(1.2);
      c.body.pose = 'stand';
      c.voice('visit', 'visit');
      yield* hush(c, 15);
      yield* wait(3 + c.random() * 4);
      c.life.needs.love = clamp01(c.life.needs.love + 0.03);
      c.body.gaze = null;
    },
  },
  knock: {
    cooldown: COOLDOWN_SEC.knock,
    score: (c) =>
      (c.idleSec() > IDLE_KNOCK_SEC || !c.focused()) && c.life.needs.love < 0.6 && c.life.bond > 0.25 && !bedtime(c) ? 0.6 : 0,
    *run(c) {
      yield* comeForward(c);
      c.bell();
      for (let i = 0; i < 2; i++) {
        c.body.pose = 'wave';
        // A spark where its mitten taps the glass.
        const { x, y } = headOf(c);
        c.scene.emit({ kind: 'spark', x: x + 9, y: y + 4, vx: 0, vy: 0, life: 0.4 });
        yield* wait(0.5);
        c.body.pose = 'stand';
        yield* wait(0.4);
      }
      c.voice('knock', 'knock');
      const idle = c.idleSec();
      yield* until(() => c.idleSec() < Math.min(idle, 1), 10);
      c.body.gaze = null;
    },
  },
  gift: {
    cooldown: COOLDOWN_SEC.gift,
    score: (c) => (c.life.found.length > 0 && c.life.bond > 0.35 && present(c) && !bedtime(c) ? 0.4 + 0.5 * c.life.bond : 0),
    *run(c) {
      const item = c.life.found[c.life.found.length - 1];
      c.body.holding = { kind: 'find' };
      yield* comeForward(c);
      c.voice('gift', 'gift', { item });
      c.offer(item);
      yield* until(() => c.offerState() !== 'waiting', 25);
      const taken = c.offerState() === 'taken';
      c.endOffer();
      c.body.holding = null;
      if (taken) {
        c.body.eyes = '^ ^';
        particles(c, '♥', 0, 3);
        yield* hop(c);
        c.body.eyes = null;
      } else {
        c.body.eyes = '- -';
        c.say('giftIgnored');
        yield* hush(c, 5);
        c.body.eyes = null;
      }
      c.body.gaze = null;
    },
  },
  ask: {
    cooldown: COOLDOWN_SEC.ask,
    score: (c) => (present(c) && c.life.bond > 0.3 && !bedtime(c) ? 0.25 + 0.4 * c.life.traits.curious : 0),
    *run(c) {
      yield* comeForward(c);
      c.body.icon = '?';
      if (!c.ask()) {
        c.body.icon = null;
        return;
      }
      yield* until(() => c.questionState() !== 'waiting', 30);
      c.body.icon = null;
      if (c.questionState() === 'waiting') c.say('neverMind');
      c.endQuestion();
      yield* hush(c, 8);
      c.body.gaze = null;
    },
  },
  hide: {
    cooldown: 60,
    score: (c) => {
      if (c.feelings.fright > 0.3) return 1.3;
      return c.life.traits.shy > 0.6 && c.life.bond < 0.3 && present(c) ? 0.3 * c.life.traits.shy : 0;
    },
    *run(c) {
      // Only what stands about as tall as it does hides it.
      const big = c.scene.layout.props.filter((p) => p.sprite.h >= CREATURE.tall - 8 && p.kind !== 'home' && p.kind !== 'pond');
      const cover = nearestOf(big, c.body.x);
      if (cover === null || c.random() < 0.4) {
        yield* goIn(c, true);
      } else {
        yield* walkTo(c, cover.x, Math.max(0, cover.z - 0.05), true);
      }
      c.body.eyes = 'o o';
      c.say('hide');
      yield* until(() => c.feelings.fright < 0.1, 20 + c.random() * 20);
      c.body.eyes = null;
      if (c.body.inside) yield* comeOut(c);
      yield* walkTo(c, c.body.x, Math.min(1, c.body.z + 0.25));
    },
  },
  wander: {
    cooldown: COOLDOWN_SEC.wanderOff,
    score: (c) =>
      c.life.traits.curious > 0.45 && c.life.needs.rest > 0.5 && c.life.needs.food > 0.4 && !bedtime(c) && c.idleSec() > 240
        ? 0.1 + 0.2 * c.life.traits.curious
        : 0,
    *run(c) {
      c.say('wanderOff');
      yield* hush(c, 5);
      const left = c.body.x < 0.5;
      yield* walkTo(c, left ? -0.06 : 1.06, c.body.z, false, 40);
      c.body.visible = false;
      yield* wait(120 + c.random() * 240);
      const item = pickFind(c);
      c.life.found.push(item);
      c.life.stats.finds++;
      c.body.visible = true;
      yield* walkTo(c, left ? 0.15 : 0.85, c.body.z, false, 40);
      c.voice('return', 'wanderBack', { item });
      c.diary(`Walked to the edge of the ${BIOMES[c.place].title.toLowerCase()} and back. Found ${item}.`);
      c.life.needs.fun = clamp01(c.life.needs.fun + 0.3);
      yield* hush(c, 10);
    },
  },
};

/** Walks to the front of the scene, near the middle, and looks at you. */
function* comeForward(c: Ctx): Script {
  yield* walkTo(c, 0.35 + c.random() * 0.3, 1, false, 25);
  faceYou(c);
}

function zFromDoor(c: Ctx): void {
  const home = c.scene.layout.home;
  const door = c.geo.door(home);
  c.scene.emit({ kind: c.random() < 0.5 ? 'z' : 'Z', x: c.geo.px(door.x) + 3, y: c.geo.footY(door.x, door.z) - (home.nest === true ? 14 : 22), vx: 4, vy: -6, life: 2.5 });
}

function shootingStar(c: Ctx): void {
  // A streak of light across the upper sky.
  const y = 30 + c.random() * 70;
  const x = c.random() * c.geo.w * 0.6;
  c.scene.emit({ kind: 'streak', x, y, vx: 320, vy: 110, life: 0.5 });
}

// ── Reactions ──────────────────────────────────────────────────────────────

const REACT: Readonly<Record<ReactionName, (c: Ctx) => Script>> = {
  *listen(c) {
    if (c.body.inside || !c.body.visible) return;
    yield* comeForward(c);
    c.body.icon = '…';
    yield* until(() => !c.talking(), 300);
    c.body.icon = null;
    yield* hush(c, BRAIN.thinkTimeoutSec + 10);
    yield* wait(1.5);
    c.body.gaze = null;
  },
  *petted(c) {
    const bond = c.life.bond;
    faceYou(c);
    c.body.pose = 'stand';
    if (c.feelings.annoyance > 0.5) {
      c.body.eyes = '> <';
      c.say('tooMuch');
      yield* hush(c, 4);
      c.body.eyes = null;
      yield* walkTo(c, c.body.x < 0.5 ? c.body.x + 0.2 : c.body.x - 0.2, Math.max(0.2, c.body.z - 0.3));
      return;
    }
    if (bond < 0.25 && c.life.traits.shy > 0.5) {
      c.body.eyes = 'o o';
      c.say('pettedShy');
      yield* wait(1.5);
    } else {
      c.body.eyes = bond > 0.6 ? '♥ ♥' : '^ ^';
      particles(c, '♥', 0, bond > 0.6 ? 3 : 2);
      if (c.random() < 0.6) c.say(bond > 0.6 ? 'pettedLove' : 'petted');
      if (c.life.traits.playful > 0.4) yield* hop(c, 1);
      yield* wait(2);
    }
    c.body.eyes = null;
    yield* hush(c, 4);
    c.body.gaze = null;
  },
  *woken(c) {
    // At home, asleep. Does it get up?
    const deep = bedtime(c) && c.sky.hour > 0 && c.sky.hour < 5;
    const wakes = c.random() < 0.35 + c.life.bond * 0.5 - (deep ? 0.2 : 0);
    if (!wakes) {
      c.body.inside = true;
      c.body.eyes = '- -';
      c.life.asleep = true;
      c.say('sleepTalk');
      zFromDoor(c);
      yield* hush(c, 5);
      return;
    }
    c.life.asleep = false;
    c.body.eyes = '‿ ‿';
    c.body.inside = true;
    yield* wait(1.2);
    yield* comeOut(c);
    c.body.eyes = deep && c.life.bond < 0.5 ? '> <' : '‿ ‿';
    c.say(deep && c.life.bond < 0.5 ? 'wokenGrumpy' : 'woken');
    yield* hush(c, 5);
    yield* comeForward(c);
    c.body.eyes = '‿ ‿';
    yield* wait(8 + c.random() * 6);
    c.body.eyes = null;
    c.body.gaze = null;
  },
  *startle(c) {
    if (c.body.inside || !c.body.visible) return;
    c.body.eyes = 'o o';
    c.body.icon = '!';
    c.say(c.life.traits.shy > 0.5 ? 'startled' : 'thunder');
    yield* hop(c, 2);
    c.body.icon = null;
    yield* wait(1);
    c.body.eyes = null;
  },
  *greet(c) {
    if (c.body.inside || !c.body.visible) return;
    faceYou(c);
    c.body.pose = 'wave';
    c.voice('greet', 'backSoon');
    yield* wait(1.6);
    c.body.pose = 'stand';
    yield* hush(c, 10);
    c.body.gaze = null;
  },
  *arrive(c) {
    // A wisp drifts in and becomes the figure.
    const b = c.body;
    b.visible = false;
    b.x = 0.5;
    b.z = 0.8;
    const x = c.geo.px(0.5);
    const y = c.geo.footY(0.5, 0.8) - 12;
    let t = 0;
    while (t < 3.5) {
      const dt = yield;
      t += dt;
      // A wisp of sparks circling in, closer and closer, until it is there.
      const a = t * 5;
      const r = 22 * (1 - t / 3.5) + 1;
      c.scene.emit({ kind: 'spark', x: x + Math.cos(a) * r * 1.6, y: y + Math.sin(a) * r, vx: 0, vy: 0, life: 0.35 });
    }
    b.visible = true;
    b.eyes = '- -';
    yield* wait(1);
    b.eyes = '° °';
    b.gaze = 'up';
    yield* wait(1.2);
    b.eyes = null;
    faceYou(c);
    yield* wait(0.8);
    c.say('hello');
    yield* hush(c, 6);
    c.askName();
    yield* until(() => c.talking(), 2);
    yield* until(() => !c.talking(), 600);
    yield* hush(c, BRAIN.thinkTimeoutSec + 10);
    b.gaze = null;
  },
  *return(c) {
    // Back from wandering while you were away: the scene is empty for a moment, then it walks in.
    const b = c.body;
    b.visible = false;
    yield* wait(2.5);
    const fromLeft = c.random() < 0.5;
    b.x = fromLeft ? -0.06 : 1.06;
    b.z = 0.7;
    b.visible = true;
    yield* walkTo(c, fromLeft ? 0.3 : 0.7, 0.85, false, 40);
    faceYou(c);
    c.body.pose = 'wave';
    c.voice('greet', 'backDays');
    yield* wait(1.5);
    c.body.pose = 'stand';
    yield* hush(c, 15);
    b.gaze = null;
  },
  *go(c) {
    // You clicked somewhere: it goes to have a look.
    const at = c.pointed();
    if (at === null) return;
    c.body.icon = '?';
    yield* wait(0.5);
    c.body.icon = null;
    yield* walkTo(c, at.x, at.z);
    c.body.gaze = 'down';
    yield* wait(1.5);
    c.body.gaze = null;
    if (c.random() < 0.25 + 0.25 * c.life.traits.curious) yield* ACT.dig.run(c);
  },
  *wave(c) {
    faceYou(c);
    c.body.pose = 'wave';
    yield* wait(2);
    c.body.pose = 'stand';
    yield* hush(c, 6);
    c.body.gaze = null;
  },
  *jump(c) {
    c.body.eyes = '^ ^';
    for (let i = 0; i < 2; i++) yield* hop(c, 2);
    c.body.eyes = null;
    yield* hush(c, 6);
  },
  *spin(c) {
    for (let i = 0; i < 6; i++) {
      c.body.facing = c.body.facing === 1 ? -1 : 1;
      yield* wait(0.25);
    }
    yield* hop(c, 1);
  },
};

// ── The brain ──────────────────────────────────────────────────────────────

/** Picks and runs activities. Deterministic for a given sequence of `random()` values and updates. */
export class Brain {
  /** What it is doing now. */
  current: DoName | null = null;
  private script: Script | null = null;
  private clock = 0;
  private readonly lastRun = new Map<DoName, number>();
  private readonly recent: DoName[] = [];
  private readonly queue: DoName[] = [];
  private readonly c: Ctx;

  constructor(c: Ctx) {
    this.c = c;
  }

  /** One frame: steps the current script, or picks the next activity. */
  update(dt: number): void {
    this.clock += dt;
    if (this.script === null) this.start(this.next());
    const script = this.script;
    if (script === null) return;
    const step = script.next(dt);
    if (step.done === true && this.script === script) {
      this.script = null;
      this.current = null;
    }
  }

  /** Every activity's score right now, for tests and the journal. */
  scores(): [ActivityName, number][] {
    return ACTIVITIES.map((name) => [name, this.scoreOf(name)]);
  }

  /** Stops whatever it is doing and runs `name` now. */
  run(name: DoName): void {
    this.stop();
    this.start(name);
  }

  /** Runs `name` after the current activity ends. */
  later(name: DoName): void {
    if (!this.queue.includes(name)) this.queue.push(name);
  }

  /** Stops the current activity; the next update picks a fresh one. */
  interrupt(): void {
    this.stop();
  }

  private stop(): void {
    const script = this.script;
    this.script = null;
    this.current = null;
    if (script !== null) script.return();
    const b = this.c.body;
    b.pose = 'stand';
    b.lift = 0;
    b.eyes = null;
    b.gaze = null;
    b.icon = null;
    b.holding = null;
    b.doorway = 0;
    if (b.inside && !this.c.life.asleep) b.inside = false;
    // Cut short while it was out of sight (arriving as a wisp, or away wandering), it is back: whatever comes next
    // walks it in from where it is.
    b.visible = true;
  }

  private start(name: DoName): void {
    if (this.c.life.asleep && name !== 'sleep' && name !== 'woken' && name !== 'nap') {
      this.c.life.asleep = false;
      this.c.body.inside = false;
    }
    this.current = name;
    this.lastRun.set(name, this.clock);
    this.recent.push(name);
    if (this.recent.length > BRAIN.memory) this.recent.shift();
    const act = (ACT as Readonly<Record<string, Activity>>)[name];
    const script = act !== undefined ? act.run(this.c) : REACT[name as ReactionName](this.c);
    this.script = script;
    // Run up to the first yield, so the script's first frame happens now.
    const first = script.next(0);
    if (first.done === true && this.script === script) {
      this.script = null;
      this.current = null;
    }
  }

  private scoreOf(name: ActivityName): number {
    const act = ACT[name];
    const since = this.lastRun.get(name);
    if (act.cooldown !== undefined && since !== undefined && this.clock - since < act.cooldown) return 0;
    const base = act.score(this.c);
    if (base <= 0) return 0;
    const repeats = this.recent.filter((r) => r === name).length;
    return base / (1 + BRAIN.novelty * repeats);
  }

  /** The next activity: something queued, a whim, or a weighted random pick by score. */
  private next(): DoName {
    const queued = this.queue.shift();
    if (queued !== undefined) return queued;
    const scored = this.scores().filter(([, s]) => s > 0);
    if (scored.length === 0) return 'idle';
    const r = (): number => this.c.random();
    if (r() < BRAIN.whim) {
      const light = scored.filter(([n]) => n !== 'sleep' && n !== 'wander');
      if (light.length > 0) return light[Math.floor(r() * light.length)][0];
    }
    const top = Math.max(...scored.map(([, s]) => s));
    const weights = scored.map(([, s]) => Math.exp((s - top) / BRAIN.temperature));
    let pick = r() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < scored.length; i++) {
      pick -= weights[i];
      if (pick <= 0) return scored[i][0];
    }
    return scored[scored.length - 1][0];
  }
}
