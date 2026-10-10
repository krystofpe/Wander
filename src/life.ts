// His life on the road, as a pure simulation: the clock, his pace, what he does (the brain picks, this carries it
// out), the stages of a stop (walk there, sit down, smoke, stand up), the camp from dusk to dawn with its fire, when
// a thought is due, and the log of places passed. The page draws it and plays its sounds; the tests and the soak run
// it in Node. Everything random comes from the RNG state kept in the save, so a restored journey goes on exactly.
import { BIOMES } from './biomes.ts';
import type { BiomeId } from './biomes.ts';
import { ACTS, BRAIN, choose, freshMemory } from './brain.ts';
import type { Act, Choice, Memory, Spot, Until } from './brain.ts';
import { spotsBetween } from './place.ts';
import type { SpotAt } from './place.ts';
import { dayOf, dayPhase, hourOfDay, shownHour, sunElevation, weatherAt } from './sky.ts';
import type { Weather } from './sky.ts';
import type { ThoughtContext } from './thoughts.ts';
import { paceFor } from './walker.ts';
import { biomeAt, groundHeight, landmarkNear, landmarksBetween, stretchAt, tendencyAt } from './world.ts';

/** What his body is doing: each stage has its own pose. */
export const STAGES = ['walk', 'stand', 'look', 'back', 'sitdown', 'sit', 'standup', 'kneel', 'campsit', 'lie', 'sleep', 'wake', 'pack'] as const;
export type Stage = (typeof STAGES)[number];

export type LogEntry = { readonly at: number; readonly day: number; readonly hour: number; readonly kind: 'biome' | 'landmark' | 'camp'; readonly name: string };

export type Fire = { at: number; heat: number };

export type Life = {
  version: 1;
  seed: number;
  /** World hours since the road began. */
  clock: number;
  /** Metres along the road, and metres walked (for the walk cycle). */
  at: number;
  walked: number;
  pace: number;
  act: Act;
  /** Where the act happens (metres), or null. */
  target: number | null;
  /** What the spot is ("rock", "clearing"…), and a seat's height in native px. */
  what: string;
  seat: number;
  stage: Stage;
  stageTime: number;
  /** Sim seconds the act lasts once there, and what ends it. */
  actTime: number;
  actLength: number;
  until: Until;
  /** Whether this stop includes a cigarette, and seconds into the current one (−1 when not smoking). */
  smoke: boolean;
  smoking: number;
  since: Memory;
  /** Sim seconds walked since the last stop. */
  walking: number;
  slept: boolean;
  nightOwl: number;
  cigarettes: number;
  sinceName: string | null;
  fire: Fire | null;
  /** Sim seconds until the next thought. */
  nextThought: number;
  /** Sim seconds until he reconsiders while walking. */
  nextLook: number;
  thoughts: string[];
  rng: number;
  log: LogEntry[];
  lastBiome: string;
  lastMark: number;
};

/** What happened in a step, for sounds, the bar and the log. Reused; never grows past a few entries. */
export type LifeEvent =
  | { type: 'stage'; stage: Stage }
  | { type: 'act'; act: Act; what: string }
  | { type: 'thought' }
  | { type: 'biome'; id: BiomeId }
  | { type: 'landmark'; kind: string }
  | { type: 'lighter' }
  | { type: 'drag' }
  | { type: 'exhale' }
  | { type: 'fire'; lit: boolean };

/**
 * A day's plan on the live road (live.ts): where he sleeps tonight, and the world clock by which he means to be there.
 * He never walks past the camp; early, he waits by it until dusk; late, he stops for nothing.
 */
export type Plan = { readonly camp: number; readonly what: string; readonly aim: number };

/** What the step needs to know about the moment that the life does not own. */
export type Env = {
  /** Hour of the day for this clock (the warped day, or the local clock in real-clock mode). */
  hourAt(clock: number): number;
  natural: boolean;
  /** Fixed weather (frozen shots, tests), or null for the world's own. */
  weather: Weather | null;
  /** The live road's plan for a clock; absent on a road of his own, where he camps where the evening finds him. */
  plan?: (clock: number) => Plan;
};

export const LIFE = {
  /** Sim seconds between thoughts: 3 to 5 minutes. */
  thoughtEvery: [180, 300] as const,
  /** Sim seconds a cigarette lasts, and between drags. */
  cigarette: 150,
  drag: [7, 12] as const,
  /** How far ahead he looks for a spot, metres. */
  ahead: 150,
  /** Sim seconds for sitting down, standing up, kindling a fire, packing up. */
  sitdown: 1.2,
  standup: 1.2,
  kneel: 22,
  pack: 14,
  /** The fire: seconds to burn up and to die. */
  catchSec: 12,
  dieSec: 25,
  /** With a plan: the pace (m/s) the rest of the way needs before he stops for nothing, and before he will not wait
   * out the rain; how low the evening sun is when he makes camp. */
  rush: 0.85,
  shelterBelow: 0.5,
  dusk: -2,
} as const;

/** How far ahead (metres) the creature's hollow is when he sees it and thinks again: within the reach of a seat. */
const HOLLOW_SEEN = 40;

// ── Randomness kept in the save ────────────────────────────────────────────

function next(l: Life): number {
  l.rng = (l.rng + 0x6d2b79f5) >>> 0;
  let t = l.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const between = (l: Life, a: number, b: number): number => a + (b - a) * next(l);

export function newLife(seed: number, at = 0, hour = 7.5): Life {
  const l: Life = {
    version: 1,
    seed,
    clock: hour,
    at,
    walked: 0,
    pace: 1.15,
    act: 'walk',
    target: null,
    what: '',
    seat: 0,
    stage: 'walk',
    stageTime: 0,
    actTime: 0,
    actLength: 60,
    until: 'time',
    smoke: false,
    smoking: -1,
    since: freshMemory(600),
    walking: 0,
    slept: false,
    nightOwl: 0.3,
    cigarettes: 0,
    sinceName: null,
    fire: null,
    nextThought: 40,
    nextLook: 5,
    thoughts: [],
    rng: (seed ^ 0x5eed1e) >>> 0,
    log: [],
    lastBiome: '',
    lastMark: Number.NaN,
  };
  l.nightOwl = Math.pow(next(l), 1.8);
  return l;
}

// ── Spots ahead, cached by 100 m segments ──────────────────────────────────

const spotCache = new Map<string, SpotAt[]>();

function spotsAhead(seed: number, at: number, reach: number): SpotAt[] {
  const out: SpotAt[] = [];
  for (let seg = Math.floor(at / 100); seg * 100 < at + reach; seg++) {
    const key = `${seed}:${seg}`;
    let list = spotCache.get(key);
    if (list === undefined) {
      list = spotsBetween(seed, seg * 100, seg * 100 + 100);
      if (spotCache.size > 256) spotCache.clear();
      spotCache.set(key, list);
    }
    for (const s of list) if (s.at >= at && s.at <= at + reach) out.push(s);
  }
  return out;
}

// ── The step ───────────────────────────────────────────────────────────────

export function weatherOf(l: Life, env: Env): Weather {
  return env.weather ?? weatherAt(l.clock, l.seed, tendencyAt(l.seed, l.at));
}

function setStage(l: Life, stage: Stage, events: LifeEvent[]): void {
  if (l.stage === stage) return;
  l.stage = stage;
  l.stageTime = 0;
  events.push({ type: 'stage', stage });
}

/** What ground he walks on, for his pace and his steps. */
export function groundAt(l: Life, w: Weather): string {
  if (landmarkNear(l.seed, l.at, 7.5)?.kind === 'bridge') return 'wood';
  const b = biomeAt(l.seed, l.at);
  const id = b.k < 0.5 ? b.a : b.b;
  if (w.kind === 'snow' && w.precip > 0.4) return 'snow';
  return BIOMES[id].ground.step;
}

function begin(l: Life, c: Choice, events: LifeEvent[]): void {
  l.act = c.act;
  l.target = c.spot?.at ?? null;
  l.what = c.spot?.what ?? '';
  l.seat = c.spot !== null && 'height' in c.spot ? (c.spot as SpotAt).height : 0;
  l.actLength = c.seconds;
  l.until = c.until;
  l.smoke = c.smoke;
  l.actTime = 0;
  events.push({ type: 'act', act: c.act, what: l.what });
  if (c.act === 'walk') l.nextLook = c.seconds;
}

/**
 * The plan's say before the brain's: camp at dusk once the camp is in reach; wait by it when early; walk on without
 * stopping when the way left needs it. Returns null once it has decided, or how hurried he is (the pace the rest of
 * the way needs, m/s) when the brain may choose, among the spots short of the camp.
 */
function planned(l: Life, p: Plan, hour: number, dayLength: number, env: Env, events: LifeEvent[]): { hurry: number } | null {
  const left = p.camp - l.at;
  const evening = shownHour(hour, env.natural) >= 12;
  if (evening && sunElevation(hour, env.natural) < LIFE.dusk && left <= BRAIN.reach.camp) {
    begin(l, { act: 'camp', spot: { kind: 'camp', at: p.camp, what: p.what, quality: 1 }, seconds: 1, until: 'dawn', smoke: true }, events);
    return null;
  }
  if (left <= 0.01) {
    // Early: he waits by the place he will sleep, sitting on the ground or standing to look, until the light goes.
    const r1 = next(l);
    const r2 = next(l);
    const here = { kind: 'seat' as const, at: l.at, what: 'ground', quality: 0.5, height: 0, u: 0 };
    if (r1 < 0.7) begin(l, { act: 'sit', spot: here, seconds: 110 + 120 * r2, until: 'time', smoke: r2 < 0.6 }, events);
    else begin(l, { act: 'look', spot: { ...here, kind: 'view' }, seconds: 14 + 24 * r2, until: 'time', smoke: false }, events);
    return null;
  }
  const seconds = ((p.aim - l.clock) * dayLength) / 24;
  const hurry = left / Math.max(1, seconds);
  if (hurry > LIFE.rush) {
    begin(l, { act: 'walk', spot: null, seconds: 25 + 50 * next(l), until: 'time', smoke: false }, events);
    return null;
  }
  return { hurry };
}

function decide(l: Life, env: Env, w: Weather, dayLength: number, events: LifeEvent[]): void {
  const hour = env.hourAt(l.clock);
  let spots: readonly Spot[] = spotsAhead(l.seed, l.at, LIFE.ahead);
  const p = env.plan?.(l.clock);
  if (p !== undefined) {
    const free = planned(l, p, hour, dayLength, env, events);
    if (free === null) return;
    spots = spots.filter((s) => s.at <= p.camp && s.kind !== 'camp' && (s.kind !== 'shelter' || free.hurry < LIFE.shelterBelow));
  }
  const c = choose(
    {
      hour: shownHour(hour, env.natural),
      sunElevation: sunElevation(hour, env.natural),
      precip: w.precip,
      storm: w.storm,
      snow: w.kind === 'snow',
      at: l.at,
      walking: l.walking,
      since: l.since,
      spots,
      slept: l.slept,
      nightOwl: l.nightOwl,
    },
    () => next(l),
  );
  begin(l, c, events);
}

function startSmoking(l: Life, events: LifeEvent[]): void {
  if (l.smoking >= 0) return;
  l.smoking = 0;
  l.cigarettes++;
  l.since.smoke = 0;
  events.push({ type: 'lighter' });
}

function smokeStep(l: Life, dt: number, events: LifeEvent[]): void {
  if (l.smoking < 0) return;
  const before = l.smoking;
  l.smoking += dt;
  // A drag every 7–12 s (fixed by the cigarette's own rhythm), the exhale two seconds later.
  const period = 9.5;
  const k0 = Math.floor((before - 2) / period);
  const k1 = Math.floor((l.smoking - 2) / period);
  if (k1 > k0) events.push({ type: 'drag' });
  const e0 = Math.floor((before - 4.2) / period);
  const e1 = Math.floor((l.smoking - 4.2) / period);
  if (e1 > e0) events.push({ type: 'exhale' });
  if (l.smoking > LIFE.cigarette) l.smoking = -1;
}

/** Is the cigarette at the mouth (a drag) right now? */
export function dragging(l: Life): boolean {
  if (l.smoking < 0) return false;
  const p = (l.smoking - 2) % 9.5;
  return p >= 0 && p < 1.6;
}

/** Logs a new biome or landmark he walks into. */
function notePlaces(l: Life, env: Env, events: LifeEvent[]): void {
  const b = stretchAt(l.seed, l.at).biome;
  const hour = env.hourAt(l.clock);
  const day = dayOf(l.clock);
  if (b !== l.lastBiome) {
    if (l.lastBiome !== '') events.push({ type: 'biome', id: b });
    l.lastBiome = b;
    l.log.push({ at: l.at, day, hour: shownHour(hour, env.natural), kind: 'biome', name: BIOMES[b].title });
  }
  for (const m of landmarksBetween(l.seed, l.at - 30, l.at + 1)) {
    if (m.cell === l.lastMark || m.at > l.at) continue;
    l.lastMark = m.cell;
    events.push({ type: 'landmark', kind: m.kind });
    l.log.push({ at: m.at, day, hour: shownHour(hour, env.natural), kind: 'landmark', name: m.kind });
    l.sinceName = `the ${m.kind === 'circle' ? 'stone circle' : m.kind}`;
    l.cigarettes = 0;
  }
  if (l.log.length > 500) l.log.splice(0, l.log.length - 500);
}

/**
 * Advances his life by dt sim seconds (real seconds × speed); `dayLength` is real seconds per world day.
 * Events of the step go to `events` (cleared first). Large steps are split, so catching up behaves the same.
 */
export function stepLife(l: Life, dt: number, dayLength: number, env: Env, events: LifeEvent[]): void {
  events.length = 0;
  let left = dt;
  while (left > 0) {
    const h = Math.min(left, 0.5);
    left -= h;
    tick(l, h, dayLength, env, events);
  }
}

function tick(l: Life, dt: number, dayLength: number, env: Env, events: LifeEvent[]): void {
  l.clock += (dt * 24) / dayLength;
  for (const a of ACTS) l.since[a] += dt;
  l.stageTime += dt;
  const w = weatherOf(l, env);
  const hour = env.hourAt(l.clock);
  const elevation = sunElevation(hour, env.natural);
  const morning = shownHour(hour, env.natural) < 12;
  // The evening resets the night: a new night owl draw, not yet slept.
  if (!morning && elevation > 8 && l.slept) {
    l.slept = false;
    l.nightOwl = Math.pow(next(l), 1.8);
  }
  smokeStep(l, dt, events);
  // The fire burns up while it is tended and dies once he leaves it.
  if (l.fire !== null) {
    const tended = l.act === 'camp' && l.stage !== 'pack' && l.stage !== 'walk';
    l.fire.heat = Math.max(0, Math.min(1, l.fire.heat + (tended ? dt / LIFE.catchSec : -dt / LIFE.dieSec)));
    if (l.fire.heat <= 0 && !tended) {
      l.fire = null;
      events.push({ type: 'fire', lit: false });
    }
  }
  // Thoughts: every 3–5 minutes of his time, never asleep.
  if (l.stage !== 'sleep') {
    l.nextThought -= dt;
    if (l.nextThought <= 0) {
      l.nextThought = between(l, LIFE.thoughtEvery[0], LIFE.thoughtEvery[1]);
      events.push({ type: 'thought' });
    }
  }

  // Walking toward a target, or just walking.
  const going = l.stage === 'walk';
  if (going) {
    const slope = (groundHeight(l.seed, l.at + 1) - groundHeight(l.seed, l.at - 1)) / 2;
    const headwind = -w.wind;
    const want = paceFor(slope, groundAt(l, w), headwind, Math.sin(l.clock * 0.7) * 0.5);
    l.pace += (want - l.pace) * Math.min(1, dt * 0.5);
    let step = l.pace * dt;
    if (l.target !== null && l.act !== 'walk') step = Math.min(step, Math.max(0, l.target - l.at));
    // On the live road he never walks past tonight's camp.
    const p = env.plan?.(l.clock);
    if (p !== undefined) step = Math.min(step, Math.max(0, p.camp - l.at));
    l.at += step;
    l.walked += step;
    l.walking += dt;
    notePlaces(l, env, events);
    if (l.act === 'walk') {
      l.nextLook -= dt;
      // The creature's hollow coming into sight ahead: he thinks again (he usually stops there).
      const hollow = landmarksBetween(l.seed, l.at - step + HOLLOW_SEEN, l.at + HOLLOW_SEEN).some((m) => m.kind === 'hollow');
      if (l.nextLook <= 0 || hollow || (p !== undefined && l.at >= p.camp - 0.01)) decide(l, env, w, dayLength, events);
      return;
    }
    if (l.target === null || l.at >= l.target - 0.01) {
      // Right on the spot, not a hair short of it (the live road's camp is where its plan says).
      if (l.target !== null && l.target > l.at) {
        l.walked += l.target - l.at;
        l.at = l.target;
      }
      arrive(l, events, env);
    }
    return;
  }
  l.actTime += dt;
  carryOut(l, dt, w, elevation, morning, events, env);
}

/** He has reached the spot: begin the act there. */
function arrive(l: Life, events: LifeEvent[], env: Env): void {
  l.actTime = 0;
  l.walking = 0;
  l.since[l.act] = 0;
  switch (l.act) {
    case 'look':
      setStage(l, next(l) < 0.3 ? 'back' : 'look', events);
      break;
    case 'sit':
      setStage(l, 'sitdown', events);
      break;
    case 'smoke':
    case 'shelter':
      setStage(l, 'stand', events);
      if (l.smoke) startSmoking(l, events);
      break;
    case 'camp':
      setStage(l, 'kneel', events);
      l.log.push({ at: l.at, day: dayOf(l.clock), hour: shownHour(env.hourAt(l.clock), env.natural), kind: 'camp', name: l.what });
      break;
    default:
      setStage(l, 'walk', events);
  }
}

function walkOn(l: Life, events: LifeEvent[]): void {
  l.act = 'walk';
  l.target = null;
  l.nextLook = 2;
  setStage(l, 'walk', events);
}

function carryOut(l: Life, dt: number, w: Weather, elevation: number, morning: boolean, events: LifeEvent[], env: Env): void {
  void env;
  const done = l.until === 'time' ? l.actTime >= l.actLength : l.until === 'rain eases' ? w.precip < 0.3 || l.actTime > 480 : false;
  switch (l.stage) {
    case 'look':
    case 'back':
      if (done) walkOn(l, events);
      return;
    case 'stand':
      if (done && (l.smoking < 0 || l.until !== 'time' || l.smoking > LIFE.cigarette - 30)) {
        l.smoking = -1;
        walkOn(l, events);
      }
      return;
    case 'sitdown':
      if (l.stageTime >= LIFE.sitdown) {
        setStage(l, 'sit', events);
        if (l.smoke) startSmoking(l, events);
      }
      return;
    case 'sit':
      if (done) setStage(l, 'standup', events);
      return;
    case 'standup':
      if (l.stageTime >= LIFE.standup) {
        l.smoking = -1;
        walkOn(l, events);
      }
      return;
    case 'kneel':
      if (l.fire === null && l.stageTime > 6) {
        l.fire = { at: l.at + 0.9, heat: 0.05 };
        events.push({ type: 'fire', lit: true });
      }
      if (l.stageTime >= LIFE.kneel) {
        setStage(l, 'campsit', events);
        startSmoking(l, events);
      }
      return;
    case 'campsit':
      // Sit by the fire a while, then lie down; in the small hours he may sit up again, then sleep on.
      if (morning && elevation > -9) {
        setStage(l, 'wake', events);
        return;
      }
      if (l.stageTime > 120 && l.smoking < 0) setStage(l, 'lie', events);
      return;
    case 'lie':
      if (l.stageTime > 25) setStage(l, 'sleep', events);
      return;
    case 'sleep':
      l.slept = true;
      if (morning && elevation > -9) setStage(l, 'wake', events);
      else if (morning && elevation < -20 && next(l) < dt / 2400) setStage(l, 'campsit', events);
      return;
    case 'wake':
      if (l.stageTime > 30) setStage(l, 'pack', events);
      return;
    case 'pack':
      if (l.stageTime > LIFE.pack) {
        l.slept = true;
        walkOn(l, events);
      }
      return;
    default:
      walkOn(l, events);
  }
}

/** The local thought context for this moment (see thoughts.ts). */
export function thoughtContext(l: Life, env: Env, moon = 0.5): ThoughtContext {
  const w = weatherOf(l, env);
  const hour = env.hourAt(l.clock);
  const b = stretchAt(l.seed, l.at).biome;
  const near = landmarksBetween(l.seed, l.at - 60, l.at + 120)[0]?.kind ?? null;
  const doing =
    l.stage === 'walk' ? 'walking' : l.stage === 'look' || l.stage === 'back' ? 'looking' : l.stage === 'wake' || l.stage === 'pack' ? 'waking' : l.act === 'camp' ? 'camp' : l.act === 'shelter' ? 'sheltering' : l.smoking >= 0 ? 'smoking' : 'sitting';
  return {
    seed: l.seed,
    biome: b,
    phase: dayPhase(hour, env.natural),
    sky: w.storm ? 'storm' : w.kind === 'snow' ? 'snow' : w.kind === 'rain' ? 'rain' : w.fog > 0.45 ? 'fog' : w.cloud > 0.6 ? 'cloudy' : 'clear',
    windy: Math.abs(w.wind) > 0.6,
    cold: BIOMES[b].cold || w.kind === 'snow',
    doing,
    near,
    day: dayOf(l.clock),
    cigarettes: l.cigarettes,
    since: l.sinceName,
    moon,
  };
}
