// The creature's life: what is saved, how its needs drain, what mood it is in, what it remembers. From the terminal
// creature (feat/creature src/creature.ts) as it was; the cloak is now one of six (the palette's cloak0 … cloak5).
import { BEDTIME, BOND, CLOAKS, DRAIN_SEC, SLEEP_DRAIN, SLEEP_REFILL_SEC, WAKE_TIME } from './config.ts';
import type { BiomeName } from './config.ts';
import { rng } from '../noise.ts';

/** Each 0..1, where 1 is satisfied. */
export type Needs = { food: number; rest: number; fun: number; love: number };
export type NeedName = keyof Needs;
/** Each 0..1, fixed at birth. */
export type Traits = {
  curious: number;
  playful: number;
  shy: number;
  lazy: number;
  nightOwl: number;
  rainLover: number;
};
export type DiaryEntry = { readonly t: number; readonly text: string };
export type Gift = { readonly t: number; readonly item: string };
export type Stats = { visits: number; fed: number; played: number; petted: number; talks: number; gifts: number; finds: number };

/** Everything saved between runs. Times are epoch milliseconds of world time. */
export type Life = {
  version: 1;
  seed: number;
  name: string;
  biome: BiomeName;
  /** Which of the six cloaks (0–5). */
  cloak: number;
  born: number;
  lastSeen: number;
  /** What it calls you; null until it knows. */
  userName: string | null;
  needs: Needs;
  bond: number;
  traits: Traits;
  asleep: boolean;
  /** Gone wandering while you were away; it walks back in soon after you return. */
  away: boolean;
  diary: DiaryEntry[];
  /** Things it found and still keeps. */
  found: string[];
  /** Things it gave you. */
  shelf: Gift[];
  /** What it knows about you. */
  facts: string[];
  /** Stones in its cairn. */
  cairn: number;
  stats: Stats;
  /** Ids of questions already asked. */
  asked: string[];
  /** The traveller who comes by its hollow now and then (src/creature/traveller.ts): how many times, the last time. */
  traveller: { times: number; last: number };
};

/** Short-lived feelings, 0..1, that fade within minutes. Not saved. */
export type Feelings = { joy: number; fright: number; annoyance: number };

export type Mood =
  | 'joyful'
  | 'content'
  | 'calm'
  | 'curious'
  | 'sleepy'
  | 'hungry'
  | 'bored'
  | 'lonely'
  | 'grumpy'
  | 'scared';

export const DIARY_LIMIT = 200;
export const FACT_LIMIT = 30;
export const MAX_CAIRN = 9;

const NAMES = [
  'Ulo', 'Mirr', 'Tavi', 'Oskel', 'Nim', 'Vesper', 'Pell', 'Quill', 'Rook', 'Sable', 'Wren', 'Fen', 'Lumo', 'Ori',
  'Thistle', 'Mote', 'Ember', 'Hush', 'Echo', 'Iska', 'Bram', 'Juniper', 'Kestrel', 'Moss', 'Nox', 'Pip', 'Rune', 'Sorrel',
];

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

export function nameFrom(seed: number): string {
  return NAMES[Math.floor(rng(seed ^ 0x4e41)() * NAMES.length)];
}

export function biomeFrom(_seed: number): BiomeName {
  // The forest is where the story is; the others stay reachable with --biome.
  return 'forest';
}

export function traitsFrom(seed: number): Traits {
  const r = rng(seed ^ 0x7a17);
  return { curious: r(), playful: r(), shy: r(), lazy: r(), nightOwl: r(), rainLover: r() };
}

export function newLife(seed: number, now: number, options: { biome?: BiomeName; name?: string } = {}): Life {
  const name = options.name ?? nameFrom(seed);
  return {
    version: 1,
    seed,
    name,
    biome: options.biome ?? biomeFrom(seed),
    cloak: Math.floor(rng(seed ^ 0xc10a)() * CLOAKS),
    born: now,
    lastSeen: now,
    userName: null,
    needs: { food: 0.8, rest: 0.9, fun: 0.7, love: 0.5 },
    bond: BOND.start,
    traits: traitsFrom(seed),
    asleep: false,
    away: false,
    diary: [{ t: now, text: `${name} arrived.` }],
    found: [],
    shelf: [],
    facts: [],
    cairn: 0,
    stats: { visits: 0, fed: 0, played: 0, petted: 0, talks: 0, gifts: 0, finds: 0 },
    asked: [],
    traveller: { times: 0, last: 0 },
  };
}

/** Needs drain over `sec` world seconds; asleep, rest refills instead. Mutates `needs`. */
export function drain(needs: Needs, sec: number, asleep: boolean): void {
  const k = asleep ? SLEEP_DRAIN : 1;
  needs.food = clamp01(needs.food - (sec / DRAIN_SEC.food) * k);
  needs.fun = clamp01(needs.fun - (sec / DRAIN_SEC.fun) * k);
  needs.love = clamp01(needs.love - (sec / DRAIN_SEC.love) * k);
  needs.rest = clamp01(asleep ? needs.rest + sec / SLEEP_REFILL_SEC : needs.rest - sec / DRAIN_SEC.rest);
}

/** The need it feels most, and how much (0 satisfied … 1 desperate). */
export function worstNeed(needs: Needs): [NeedName, number] {
  let worst: NeedName = 'food';
  for (const k of ['rest', 'fun', 'love'] as const) if (needs[k] < needs[worst]) worst = k;
  return [worst, 1 - needs[worst]];
}

export function moodOf(needs: Needs, feelings: Feelings, traits: Traits, asleep: boolean): Mood {
  if (feelings.fright > 0.5) return 'scared';
  if (feelings.annoyance > 0.5) return 'grumpy';
  if (feelings.joy > 0.55) return 'joyful';
  if (asleep) return 'calm';
  const [worst, urgency] = worstNeed(needs);
  if (urgency > 0.7) return { food: 'hungry', rest: 'sleepy', fun: 'bored', love: 'lonely' }[worst] as Mood;
  if (urgency > 0.55 && worst === 'rest') return 'sleepy';
  const mean = (needs.food + needs.rest + needs.fun + needs.love) / 4;
  if (mean > 0.72) return feelings.joy > 0.25 ? 'joyful' : 'content';
  if (traits.curious > 0.6 && needs.fun > 0.4) return 'curious';
  if (urgency > 0.55) return { food: 'hungry', rest: 'sleepy', fun: 'bored', love: 'lonely' }[worst] as Mood;
  return 'calm';
}

/** Eyes for a mood, as the terminal creature wrote them (src/creature/eyes.ts reads them as shapes). */
export function moodEyes(mood: Mood): string {
  switch (mood) {
    case 'joyful':
      return '^ ^';
    case 'sleepy':
      return '‿ ‿';
    case 'lonely':
      return '╥ ╥';
    case 'grumpy':
      return '> <';
    case 'scared':
      return 'o o';
    case 'hungry':
    case 'bored':
      return '- -';
    default:
      return '• •';
  }
}

/** A few words for its personality, strongest traits first. */
export function traitWords(t: Traits): string {
  // [value, words when high (mild, strong), words when low (mild, strong)]
  const table: [number, [string, string], [string, string]][] = [
    [t.curious, ['curious', 'endlessly curious'], ['unbothered', 'hard to impress']],
    [t.playful, ['playful', 'very playful'], ['serious', 'very serious']],
    [t.shy, ['shy', 'very shy'], ['bold', 'fearless']],
    [t.lazy, ['lazy', 'very lazy'], ['restless', 'never still']],
    [t.nightOwl, ['a night owl', 'very much a night owl'], ['an early riser', 'up with the sun']],
    [t.rainLover, ['fond of rain', 'in love with rain'], ['not fond of rain', 'afraid of rain']],
  ];
  return table
    .sort((a, b) => Math.abs(b[0] - 0.5) - Math.abs(a[0] - 0.5))
    .slice(0, 4)
    .map(([v, high, low]) => (v > 0.5 ? high : low)[Math.abs(v - 0.5) > 0.35 ? 1 : 0])
    .join(', ');
}

export function ageDays(life: Life, now: number): number {
  return Math.max(0, Math.floor((now - life.born) / 86400000));
}

/** Its bedtime and waking hour; night owls go later. Bedtime may be past 24. */
export function sleepHours(traits: Traits): { bed: number; wake: number } {
  const shift = (traits.nightOwl - 0.35) * 3;
  return { bed: BEDTIME + shift, wake: WAKE_TIME + shift };
}

/** True between its bedtime and waking hour. */
export function isNightFor(traits: Traits, hour: number): boolean {
  const { bed, wake } = sleepHours(traits);
  const h = hour < 12 ? hour + 24 : hour;
  return h >= bed && h < wake + 24;
}

export function addDiary(life: Life, t: number, text: string): void {
  life.diary.push({ t, text });
  if (life.diary.length > DIARY_LIMIT) life.diary.splice(0, life.diary.length - DIARY_LIMIT);
}

export function remember(life: Life, fact: string): void {
  const clean = fact.trim().replace(/\s+/g, ' ').slice(0, 140);
  if (clean === '') return;
  const i = life.facts.findIndex((f) => f.toLowerCase() === clean.toLowerCase());
  if (i >= 0) life.facts.splice(i, 1);
  life.facts.push(clean);
  if (life.facts.length > FACT_LIMIT) life.facts.splice(0, life.facts.length - FACT_LIMIT);
}

/** A kind act raises the bond by a share of what is left. */
export function warm(life: Life, times = 1): void {
  for (let i = 0; i < times; i++) life.bond = clamp01(life.bond + (1 - life.bond) * BOND.gain);
}

/** "3 minutes", "2 hours", "5 days". */
export function duration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'a moment';
  if (min < 60) return min === 1 ? 'a minute' : `${min} minutes`;
  const h = Math.round(min / 60);
  if (h < 24) return h === 1 ? 'an hour' : `${h} hours`;
  const d = Math.round(h / 24);
  return d === 1 ? 'a day' : `${d} days`;
}

/** Turns a login name like "krystofpe" into something it can say: "Krystofpe". */
export function prettyName(text: string): string {
  const t = text.trim().replace(/[^\p{L}\p{N} '\-]/gu, '').slice(0, 24).trim();
  return t === '' ? '' : t[0].toUpperCase() + t.slice(1);
}
