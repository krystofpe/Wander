// His small, quiet brain: what to do next, from the hour, the weather, how long he has walked, what is just
// ahead and how long since he last did each thing. No needs, no bars: every act scores itself, and the pick
// is random, weighted by exp(score / temperature), so he acts for reasons but never on a script. Pure.

export const ACTS = ['walk', 'look', 'sit', 'smoke', 'shelter', 'camp'] as const;
export type Act = (typeof ACTS)[number];

/** A place just ahead that is good for something: a seat, a view, shelter from rain, or a camp. */
export type SpotKind = 'seat' | 'view' | 'shelter' | 'camp';
export type Spot = {
  readonly kind: SpotKind;
  /** Where, in metres along the road. */
  readonly at: number;
  /** What it is ("rock", "log", "lonetree"…), for his thoughts and his pose. */
  readonly what: string;
  /** 0..1, how good a spot it is: a rock with a view is better than a stump in a ditch. */
  readonly quality: number;
};

/** Sim seconds since he last did each act. */
export type Memory = Record<Act, number>;

export function freshMemory(seconds: number): Memory {
  return { walk: 0, look: seconds, sit: seconds, smoke: seconds, shelter: seconds, camp: seconds };
}

export type Situation = {
  readonly hour: number;
  readonly sunElevation: number;
  /** 0..1 rain or snow. */
  readonly precip: number;
  readonly storm: boolean;
  readonly snow: boolean;
  /** Where he is, metres. */
  readonly at: number;
  /** Sim seconds walked since he last stopped. */
  readonly walking: number;
  readonly since: Memory;
  /** Spots ahead within reach, nearest first. */
  readonly spots: readonly Spot[];
  /** Has he slept since the last dusk? */
  readonly slept: boolean;
  /** 0..1, drawn once a night: how late he is willing to walk before he camps. */
  readonly nightOwl: number;
};

export type Until = 'time' | 'rain eases' | 'dawn';
export type Choice = { readonly act: Act; readonly spot: Spot | null; readonly seconds: number; readonly until: Until; readonly smoke: boolean };

export const BRAIN = {
  temperature: 0.35,
  /** How far ahead (metres) a spot counts for each act. */
  reach: { seat: 70, view: 50, shelter: 90, camp: 140 },
  /** Fewest sim seconds between two of the same act. */
  cooldown: { look: 200, sit: 300, smoke: 420, shelter: 90 },
} as const;

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function nearest(s: Situation, kind: SpotKind): Spot | null {
  let best: Spot | null = null;
  for (const spot of s.spots) {
    if (spot.kind !== kind || spot.at < s.at || spot.at - s.at > BRAIN.reach[kind]) continue;
    // A better spot a little further on beats a poor one close by.
    if (best === null || spot.quality - (spot.at - s.at) / 400 > best.quality - (best.at - s.at) / 400) best = spot;
  }
  return best;
}

/** Is it time to look for a camp? From dusk on, later for a night owl; never once he has slept. */
function campUrge(s: Situation): number {
  if (s.slept) return 0;
  const evening = s.hour >= 12;
  // −2° at dusk for an early sleeper, down to −30° (deep night) for one who walks late.
  const threshold = -2 - 28 * s.nightOwl;
  if (evening && s.sunElevation > threshold) return 0;
  if (!evening && s.sunElevation > -6) return 0; // too close to dawn to bother
  return 1;
}

/** Scores for every act that is possible now; absent means impossible. */
export function scores(s: Situation): Partial<Record<Act, { score: number; spot: Spot | null }>> {
  const out: Partial<Record<Act, { score: number; spot: Spot | null }>> = {};
  const golden = s.sunElevation > -6 && s.sunElevation < 10 ? 0.9 : 0;
  const tired = clamp01(s.walking / 900);
  const wet = s.precip > 0.1;

  out.walk = { score: 1.4 - 0.9 * tired - (wet && !s.snow ? 0.2 : 0), spot: null };

  const view = nearest(s, 'view');
  if (view !== null && s.since.look >= BRAIN.cooldown.look && s.precip < 0.6) {
    out.look = { score: 0.2 + 0.8 * clamp01(s.since.look / 900) + 0.7 * view.quality + golden - 0.4 * s.precip, spot: view };
  }

  const seat = nearest(s, 'seat');
  if (seat !== null && s.since.sit >= BRAIN.cooldown.sit && s.precip < 0.45) {
    out.sit = { score: 0.4 * seat.quality + 1.7 * tired + 0.5 * clamp01(s.since.sit / 1200) + 0.3 * golden - 0.3 * s.precip, spot: seat };
  }

  if (s.since.smoke >= BRAIN.cooldown.smoke && s.precip < 0.3) {
    out.smoke = { score: -0.1 + 0.7 * clamp01(s.since.smoke / 1500) + 0.3 * tired, spot: null };
  }

  const roof = nearest(s, 'shelter');
  if (roof !== null && s.precip > 0.45 && s.since.shelter >= BRAIN.cooldown.shelter) {
    out.shelter = { score: 2 + 2.2 * s.precip + (s.storm ? 1 : 0) - (s.snow ? 0.6 : 0), spot: roof };
  }

  const camp = nearest(s, 'camp');
  if (camp !== null && campUrge(s) > 0) {
    out.camp = { score: 3 + camp.quality + (s.sunElevation < -12 ? 1 : 0), spot: camp };
  }
  return out;
}

const range = (random: () => number, a: number, b: number): number => a + (b - a) * random();

/** The next thing to do. `random` is called a fixed number of times, so choices replay exactly. */
export function choose(s: Situation, random: () => number): Choice {
  const options = scores(s);
  const acts = ACTS.filter((a) => options[a] !== undefined);
  let max = -Infinity;
  for (const a of acts) max = Math.max(max, options[a]?.score ?? -Infinity);
  let total = 0;
  const weights = acts.map((a) => {
    const w = Math.exp(((options[a]?.score ?? 0) - max) / BRAIN.temperature);
    total += w;
    return w;
  });
  const r1 = random();
  const r2 = random();
  const r3 = random();
  let x = r1 * total;
  let act: Act = 'walk';
  for (let i = 0; i < acts.length; i++) {
    x -= weights[i];
    if (x < 0) {
      act = acts[i];
      break;
    }
  }
  const spot = options[act]?.spot ?? null;
  const pick = (a: number, b: number): number => range(() => r2, a, b);
  switch (act) {
    case 'walk':
      return { act, spot, seconds: pick(25, 75), until: 'time', smoke: false };
    case 'look':
      return { act, spot, seconds: pick(14, 38), until: 'time', smoke: r3 < 0.25 };
    case 'sit':
      return { act, spot, seconds: pick(110, 230), until: 'time', smoke: r3 < 0.8 };
    case 'smoke':
      return { act, spot, seconds: pick(70, 120), until: 'time', smoke: true };
    case 'shelter':
      return { act, spot, seconds: 480, until: 'rain eases', smoke: r3 < 0.5 };
    case 'camp':
      return { act, spot, seconds: 1, until: 'dawn', smoke: true };
  }
}
