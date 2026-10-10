// What can be tuned about the creature's life: its needs, its brain, its clock, its words, and each of its biomes.
// From the terminal creature (feat/creature src/config.ts), in the wanderer's units: distances in native pixels of
// the 640 × 360 view, depth as a share of the band in front of the walk line. The colours went to src/palette.ts.
import type { BiomeId } from '../biomes.ts';

// ── Time ───────────────────────────────────────────────────────────────────
/** Seconds of a simulation step; the page steps it at this rate whatever its frame rate. */
export const STEP_SEC = 1 / 30;
/** Seconds between saves while it runs. */
export const SAVE_EVERY_SEC = 30;

// ── Needs and bond ─────────────────────────────────────────────────────────
/** World seconds for a need to drain from full to empty while awake. */
export const DRAIN_SEC = { food: 6 * 3600, rest: 16 * 3600, fun: 3 * 3600, love: 5 * 3600 } as const;
/** While asleep, food, fun and love drain at this share of their waking speed. */
export const SLEEP_DRAIN = 0.4;
/** While asleep, rest refills from empty to full in this many world seconds. */
export const SLEEP_REFILL_SEC = 6 * 3600;
/** What it can do for itself: foraging fills food up to this, playing alone fills fun up to this. */
export const SELF_FEED_CAP = 0.6;
export const SELF_PLAY_CAP = 0.55;
export const BOND = {
  start: 0.15,
  /** Share of the remaining gap closed by one kind act. */
  gain: 0.04,
  /** Lost per full day without you, beyond the first. */
  dailyDecay: 0.03,
  /** Kind acts within a minute beyond this count as too much. */
  perMinute: 4,
} as const;

// ── Brain ──────────────────────────────────────────────────────────────────
export const BRAIN = {
  /** Lower is more predictable: picks are weighted by exp(score / temperature). */
  temperature: 0.12,
  /** Share of picks that ignore the scores and follow a whim. */
  whim: 0.08,
  /** Each recent repeat of an activity scales its score by 1 / (1 + novelty × repeats). */
  novelty: 0.5,
  /** How many past activities count as recent. */
  memory: 6,
  /** Native pixels per real second, walking and running. */
  walkSpeed: 15,
  runSpeed: 32,
  /** Seconds it takes to step through its doorway, in or out. */
  doorwaySec: 0.7,
  /** Share of the depth band per real second, moving toward the glass or away. */
  depthSpeed: 0.22,
  /** Seconds of a pending thought bubble before giving up on Claude. */
  thinkTimeoutSec: 20,
} as const;
/** Hours it falls asleep and wakes up, before the night-owl trait shifts them by up to 3 hours. */
export const BEDTIME = 21.5;
export const WAKE_TIME = 7;

/** Real seconds between visits, gifts, questions, knocks, wander-offs. */
export const COOLDOWN_SEC = {
  visit: 240,
  gift: 300,
  ask: 600,
  knock: 300,
  wanderOff: 1800,
  dig: 60,
  stack: 240,
  thought: 90,
} as const;
/** Seconds without input after which you count as away; and how long before it knocks. */
export const PRESENT_SEC = 300;
export const IDLE_KNOCK_SEC = 600;

/** Seconds between chances to blink (two in three are taken), and how long the eyes stay shut. */
export const BLINK_EVERY_SEC = 3.7;
export const BLINK_SEC = 0.14;

// ── The scene ──────────────────────────────────────────────────────────────
/** Native pixels from the walk line (depth 0, the back) to the front of the band (depth 1, "the glass"). */
export const DEPTH_PX = 64;
/** The width the layout is planned for; it is laid out in shares, so it stretches with the view. */
export const PLAN_W = 640;

// ── Claude ─────────────────────────────────────────────────────────────────
export const AI = {
  model: 'claude-opus-5-5',
  effort: 'low',
  maxTokens: 16000,
  timeoutMs: 20000,
  /** At most one unprompted Claude line per this many seconds. */
  spontaneousEverySec: 150,
  /** Exchanges kept as conversation context. */
  historyTurns: 8,
  /** Diary entries and facts sent as context. */
  diaryLines: 8,
} as const;

/**
 * The visitor: something tall that now and then walks through the glow at the end of the path, in the dark only.
 * It may come once in every `everyMin` minutes of the world's clock (with this `chance`), and takes `crossSec`
 * seconds to cross.
 */
export const VISITOR = { everyMin: 23, chance: 0.6, crossSec: 110 } as const;

export const WEATHER = {
  /** World minutes per weather slot, and to fade into the next. */
  slotMinutes: 25,
  fadeMinutes: 5,
  /** Share of rain slots that are storms with lightning. */
  storms: 0.25,
} as const;

/** Daylight (0 night … 1 noon) through the day: [hour, daylight], interpolated linearly. */
export const DAYLIGHT_KEYS: readonly (readonly [number, number])[] = [
  [0, 0],
  [4.5, 0],
  [6, 0.5],
  [7.5, 0.9],
  [12, 1],
  [16.5, 0.95],
  [18.5, 0.5],
  [20, 0.15],
  [21, 0],
  [24, 0],
];

// ── Biomes ─────────────────────────────────────────────────────────────────
export const BIOME_NAMES = ['forest', 'meadow', 'tundra', 'swamp'] as const;
/** Biomes there once were; a creature saved in one moves to another. */
export const FORMER_BIOMES: Readonly<Record<string, string>> = { shore: 'Shore', desert: 'Desert' };
export type BiomeName = (typeof BIOME_NAMES)[number];
/**
 * Where a creature's scene is set: one of the biomes, or the hollow (called 'deep' in the code), the old wood where
 * they all live now (the page sets it there). The hollow is not a biome a creature can be of.
 */
export type PlaceName = BiomeName | 'deep';

export type PropKind = 'bush' | 'fern' | 'shrooms' | 'mushrooms' | 'rock' | 'stump' | 'drift' | 'reeds' | 'pond' | 'home';
export type CritterKind = 'butterfly' | 'bird' | 'firefly' | 'frog' | 'moth' | 'hare' | 'deer' | 'bat';

export type BiomeDef = {
  readonly title: string;
  /** The wanderer's land it stands in: its far hills, its trees, its ground, its light and its weather's look. */
  readonly world: BiomeId;
  /** Share of weather slots with rain (or snow). */
  readonly rain: number;
  /** Snow instead of rain all year. */
  readonly cold: boolean;
  /** Under a dense canopy: its home is the great tree, the woods are full of life, the visitor walks at night. */
  readonly canopy: boolean;
  /** Its home is a nest of moss under a giant toadstool (the hollow), not the great tree or a shelter. */
  readonly nest?: boolean;
  /** Props besides the home: kind and how many. */
  readonly props: readonly (readonly [PropKind, number])[];
  /** Where it finds food for itself. */
  readonly forage: PropKind;
  /** Where it drinks, if anywhere. */
  readonly water: PropKind | null;
  /** Weighted by how often each comes: a list may name one more than once. */
  readonly dayCritters: readonly CritterKind[];
  readonly nightCritters: readonly CritterKind[];
  /** Things it can find by digging or wandering. */
  readonly finds: readonly string[];
  /** What it forages, for its words and diary. */
  readonly forageFood: string;
};

export const BIOMES: Readonly<Record<PlaceName, BiomeDef>> = {
  forest: {
    title: 'Forest',
    world: 'pine',
    rain: 0.25,
    cold: false,
    canopy: true,
    // Lush and deep: bushes in berry, big ferns everywhere, the glowing mushrooms among them, a stone and a stump.
    props: [['bush', 2], ['fern', 7], ['shrooms', 4], ['rock', 1], ['stump', 1]],
    forage: 'bush',
    water: 'pond',
    dayCritters: ['butterfly', 'butterfly', 'bird', 'bird', 'hare', 'hare', 'deer'],
    nightCritters: ['firefly', 'firefly', 'firefly', 'moth', 'bat', 'bat', 'frog'],
    finds: ['an acorn cap', 'a jay feather', 'a beetle shell', 'a perfectly round pebble', 'a pinecone', 'a ring of bark', 'a key to nothing'],
    forageFood: 'berries',
  },
  meadow: {
    title: 'Meadow',
    world: 'meadow',
    rain: 0.2,
    cold: false,
    canopy: false,
    props: [['bush', 2], ['rock', 2], ['fern', 2]],
    forage: 'bush',
    water: 'pond',
    dayCritters: ['butterfly', 'butterfly', 'bird', 'hare'],
    nightCritters: ['firefly', 'firefly', 'moth'],
    finds: ['a four-leaf clover', 'a snail shell', 'a blue feather', 'a smooth stone', 'a dandelion clock', 'a lost button', 'a star fragment'],
    forageFood: 'wild strawberries',
  },
  tundra: {
    title: 'Tundra',
    world: 'tundra',
    rain: 0.3,
    cold: true,
    canopy: false,
    props: [['drift', 2], ['rock', 2], ['bush', 1]],
    forage: 'bush',
    water: 'pond',
    dayCritters: ['bird', 'hare'],
    nightCritters: [],
    finds: ['an ice crystal that will not melt', 'a white feather', 'a frozen berry', 'a reindeer bell', 'a smooth grey stone', 'a shard of the aurora'],
    forageFood: 'crowberries',
  },
  swamp: {
    title: 'Swamp',
    world: 'swamp',
    rain: 0.3,
    cold: false,
    canopy: false,
    props: [['reeds', 3], ['mushrooms', 3], ['stump', 2]],
    forage: 'mushrooms',
    water: 'pond',
    dayCritters: ['frog', 'frog', 'bird', 'butterfly'],
    nightCritters: ['firefly', 'firefly', 'frog', 'moth'],
    finds: ['a frog-shaped stone', 'glowing moss', 'a lily seed', 'a bent spoon', 'a tooth of something', 'a bubble that will not pop'],
    forageFood: 'mushrooms',
  },
  // The hollow, an old wood under a canopy: it lives in a nest of moss under a giant toadstool, glowing toadstools,
  // ferns and flowers all about it, giant mushrooms in ranks into the mist; no weather but the mist; butterflies and wisps of
  // light, moths, bats, a pale frog.
  deep: {
    title: 'Hollow',
    world: 'deep',
    rain: 0,
    cold: false,
    canopy: true,
    nest: true,
    props: [['shrooms', 8], ['fern', 3], ['rock', 1]],
    forage: 'shrooms',
    water: 'pond',
    dayCritters: ['butterfly', 'butterfly', 'moth', 'firefly', 'frog', 'bat'],
    nightCritters: ['firefly', 'firefly', 'firefly', 'moth', 'butterfly', 'bat', 'frog'],
    finds: ['a pale crystal that hums', 'a moth wing thin as breath', 'a cold spark that will not go out', 'a coin of the people who left', 'a key of black glass', 'a seed that glows', 'a pebble from the world above'],
    forageFood: 'pale caps',
  },
};

/** What it may find on a night of the full moon, or on the darkest nights of the new moon. */
export const MOON_FINDS = {
  full: ['a stone that is warm to hold', 'a moth with a face on its wings', 'a ring of pale grass', 'a key that fits nothing here'],
  dark: ['a feather black all the way through', 'a seed that hums', 'a shard of something that fell', 'a cold ember'],
} as const;

/** Six cloaks (the palette's cloak0 … cloak5): a creature's seed picks one. */
export const CLOAKS = 6;

/** What you can drop in, picked in turn: its name in words, and its sprite (things.ts `food`). */
export const FOODS = [
  { name: 'a berry', sprite: 'berry' },
  { name: 'a dewdrop', sprite: 'dewdrop' },
  { name: 'a star crumb', sprite: 'starcrumb' },
  { name: 'a seed cake', sprite: 'seedcake' },
  { name: 'a moon pear', sprite: 'moonpear' },
] as const;
export type FoodKind = (typeof FOODS)[number];
