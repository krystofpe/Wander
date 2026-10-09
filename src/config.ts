// Tunable constants, palettes and the biome table: change the look and feel of Wander here.

// ── Time ───────────────────────────────────────────────────────────────────
export const FPS = 30;
/** Seconds per simulation step. */
export const FRAME_DT = 1 / FPS;
/** Milliseconds per frame. */
export const FRAME_MS = 1000 / FPS;
/** Most simulation steps run before one render when the loop falls behind. */
export const MAX_CATCH_UP_STEPS = 4;
/** Seconds between autosaves. */
export const SAVE_EVERY_SEC = 60;

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
  /** Columns per real second when walking, and when running. */
  walkSpeed: 7,
  runSpeed: 14,
  /** Seconds it takes to step through its doorway, in or out. */
  doorwaySec: 0.6,
  /** Rows per real second when moving towards or away from the front. */
  depthSpeed: 2.2,
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
/** Seconds without input after which you count as away; and how long a knock waits. */
export const PRESENT_SEC = 300;
export const IDLE_KNOCK_SEC = 600;

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

// ── Scene ──────────────────────────────────────────────────────────────────
export const MIN_COLS = 50;
export const MIN_ROWS = 16;
/** Share of the scene's rows that is sky. */
export const SKY_SHARE = 0.55;
/** Steps per second of the scenery's own motion (grass, clouds, stars, water, lantern flicker); less means less output. */
export const AMBIENT_HZ = 8;
/** Bits kept per colour channel: 5 gives 32 levels. Lower means less output per frame. */
export const COLOR_BITS = 5;
/** Columns, horizontally, the lantern reaches (rows count double). */
export const LANTERN_RADIUS = 18;
export const LANTERN_RGB: readonly [number, number, number] = [1.0, 0.72, 0.42];
export const LANTERN_GAIN = 1.25;
/** Seconds between chances to blink (two in three are taken), and how long the eyes stay shut. */
export const BLINK_EVERY_SEC = 3.7;

/**
 * The visitor: something tall that now and then walks through the glow at the end of the path, in the
 * dark only. It may come once in every `everyMin` minutes of the world's clock (with this `chance`), and
 * takes `crossSec` seconds to cross.
 */
export const VISITOR = { everyMin: 23, chance: 0.6, crossSec: 110 } as const;
export const BLINK_SEC = 0.14;

export const WEATHER = {
  /** World minutes per weather slot. */
  slotMinutes: 25,
  /** World minutes to fade between slots. */
  fadeMinutes: 5,
  /** Share of light lost in full rain. */
  dimming: 0.35,
  /** Share of rain slots that are storms with lightning. */
  storms: 0.25,
  /** Drops per column at full strength, and rows per second they fall. */
  dropDensity: 0.22,
  rainSpeed: 22,
  snowSpeed: 3,
} as const;

/** Sunlight through the day: [hour, red, green, blue, daylight], interpolated linearly. */
export const LIGHT_KEYS: readonly (readonly [number, number, number, number, number])[] = [
  [0, 0.26, 0.29, 0.42, 0],
  [4.5, 0.26, 0.29, 0.42, 0],
  [6, 0.78, 0.6, 0.58, 0.5],
  [7.5, 0.84, 0.84, 0.88, 0.9],
  [12, 0.9, 0.92, 0.98, 1],
  [16.5, 0.88, 0.86, 0.88, 0.95],
  [18.5, 0.86, 0.56, 0.44, 0.5],
  [20, 0.38, 0.34, 0.48, 0.15],
  [21, 0.26, 0.29, 0.42, 0],
  [24, 0.26, 0.29, 0.42, 0],
];
/** Sky colours through the day: [hour, zenith, horizon], interpolated linearly. */
export const SKY_KEYS: readonly (readonly [number, number, number])[] = [
  [0, 0x0c1018, 0x1e2634],
  [4.5, 0x0c1018, 0x1e2634],
  [5.6, 0x262a3e, 0x8a6a6a],
  [6.6, 0x4a566e, 0xb89a8a],
  [8, 0x5a6e88, 0xa8b2ba],
  [12, 0x56708c, 0xaab8c0],
  [16.5, 0x586a84, 0xb2b6b8],
  [18.4, 0x3a3e58, 0xb47a62],
  [19.6, 0x1e2032, 0x5a4252],
  [20.8, 0x0e121c, 0x222a3a],
  [24, 0x0c1018, 0x1e2634],
];

export const COLORS = {
  hudFg: 0xd6d9de,
  hudDim: 0x7d848e,
  hudBg: 0x12161c,
  hudAccent: 0xf2c46d,
  bubbleFg: 0x1c1d22,
  bubbleBg: 0xf2efe6,
  bubbleEdge: 0x9b978c,
  thinkFg: 0x5a5d66,
  face: 0x07070b,
  lantern: 0xffd27a,
  lanternMetal: 0x3a3028,
  boot: 0x5a4636,
  clasp: 0xf0c868,
  rain: 0xa9c4e8,
  snow: 0xf4f8ff,
  star: 0xf4f0d8,
  moon: 0xf2ecd0,
  sun: 0xfff2b0,
  cloud: 0xe8ecf2,
  stormCloud: 0x6a7280,
  aurora: 0x5cf0b0,
  toy: 0x8fe8ff,
  heart: 0xff7fb0,
  note: 0xffe08a,
  spark: 0xfff4c0,
  dirt: 0x8a6a40,
  firefly: 0xd8ff70,
} as const;

/** Mysterious cloak colours; a creature's seed picks one. */
export const CLOAKS: readonly number[] = [0x3a3470, 0x2f5040, 0x6a3a30, 0x44506a, 0x5a3060, 0x6a5a3a];

/** Eye glow by mood. */
export const EYE_GLOW: Readonly<Record<string, number>> = {
  joyful: 0xfff0a0,
  content: 0xffd27a,
  calm: 0xf0d8a0,
  curious: 0x9ff0ff,
  sleepy: 0xa08850,
  hungry: 0xffb060,
  bored: 0xc8c0a0,
  lonely: 0x9cb8ff,
  grumpy: 0xff7050,
  scared: 0xffffff,
  love: 0xff8fc8,
  sad: 0x7fb2ff,
};

// ── Biomes ─────────────────────────────────────────────────────────────────
export const BIOME_NAMES = ['forest', 'meadow', 'tundra', 'swamp'] as const;
/** Biomes there once were; a creature saved in one moves to another. */
export const FORMER_BIOMES: Readonly<Record<string, string>> = { shore: 'Shore', desert: 'Desert' };
export type BiomeName = (typeof BIOME_NAMES)[number];

export type PropKind =
  | 'tree'
  | 'pine'
  | 'bush'
  | 'rock'
  | 'pond'
  | 'reeds'
  | 'stump'
  | 'deadtree'
  | 'snowdrift'
  | 'mushrooms'
  | 'glowshroom'
  | 'fern'
  | 'trunk'
  | 'home';
export type CritterKind = 'butterfly' | 'bird' | 'firefly' | 'frog' | 'moth' | 'hare' | 'deer' | 'bat';

export type BiomeDef = {
  readonly title: string;
  /** The ground: how thick its tufts of grass grow (green biomes), its light and its base colour. */
  readonly ground: { readonly density: number; readonly fg: number; readonly bg: number };
  /** The distant ridge: its near and far colours, and how high it rises (share of the sky). */
  readonly ridge: { readonly near: number; readonly far: number; readonly height: number };
  /** Share of weather slots with rain (or snow). */
  readonly rain: number;
  /** Snow instead of rain all year. */
  readonly cold: boolean;
  /** Props besides the home: kind and how many. */
  readonly props: readonly (readonly [PropKind, number])[];
  /** Where it finds food for itself. */
  readonly forage: PropKind;
  /** Where it drinks, if anywhere. */
  readonly water: PropKind | null;
  readonly dayCritters: readonly CritterKind[];
  readonly nightCritters: readonly CritterKind[];
  /** Things it can find by digging or wandering. */
  readonly finds: readonly string[];
  /** What it forages, for its words and diary. */
  readonly forageFood: string;
  /** Under a dense canopy: how much of the daylight gets through, per channel, and the sky seen between the trunks. */
  readonly gloom?: { readonly light: readonly [number, number, number]; readonly zenith: number; readonly horizon: number; readonly mist: number };
};

export const BIOMES: Readonly<Record<BiomeName, BiomeDef>> = {
  forest: {
    title: 'Forest',
    ground: { density: 0.32, fg: 0x6fae4e, bg: 0x2c5424 },
    ridge: { near: 0x1f3f2a, far: 0x3c5a6a, height: 0.4 },
    rain: 0.25,
    cold: false,
    // Lush and deep: trunks at every depth rising into the canopy, young trees, bushes in flower, big ferns
    // everywhere, and the glowing mushrooms among them.
    props: [['trunk', 9], ['tree', 3], ['bush', 3], ['fern', 7], ['glowshroom', 4]],
    gloom: { light: [1, 1, 1], zenith: 0x060e1c, horizon: 0x2698a5, mist: 0.4 },
    forage: 'bush',
    water: 'pond',
    // Weighted by how often each comes: a list may name one more than once.
    dayCritters: ['butterfly', 'butterfly', 'bird', 'bird', 'hare', 'hare', 'deer'],
    nightCritters: ['firefly', 'firefly', 'firefly', 'moth', 'bat', 'bat', 'frog'],
    finds: ['an acorn cap', 'a jay feather', 'a beetle shell', 'a perfectly round pebble', 'a pinecone', 'a ring of bark', 'a key to nothing'],
    forageFood: 'berries',
  },
  meadow: {
    title: 'Meadow',
    ground: { density: 0.4, fg: 0xa6dc72, bg: 0x4a8a34 },
    ridge: { near: 0x4f7a48, far: 0x7a98a8, height: 0.3 },
    rain: 0.2,
    cold: false,
    props: [['tree', 1], ['bush', 1], ['rock', 1]],
    forage: 'bush',
    water: 'pond',
    dayCritters: ['butterfly', 'bird'],
    nightCritters: ['firefly', 'moth'],
    finds: ['a four-leaf clover', 'a snail shell', 'a blue feather', 'a smooth stone', 'a dandelion clock', 'a lost button', 'a star fragment'],
    forageFood: 'wild strawberries',
  },
  tundra: {
    title: 'Tundra',
    ground: { density: 0.25, fg: 0x8d9caa, bg: 0xc9d3dc },
    ridge: { near: 0xd4dbe6, far: 0x8a9ab8, height: 0.55 },
    rain: 0.3,
    cold: true,
    props: [['pine', 2], ['snowdrift', 1], ['rock', 1]],
    forage: 'pine',
    water: 'pond',
    dayCritters: ['bird'],
    nightCritters: [],
    finds: ['an ice crystal that will not melt', 'a white feather', 'a frozen berry', 'a reindeer bell', 'a smooth grey stone', 'a shard of the aurora'],
    forageFood: 'pine nuts',
  },
  swamp: {
    title: 'Swamp',
    ground: { density: 0.35, fg: 0x8fa05c, bg: 0x3a4628 },
    ridge: { near: 0x2c3626, far: 0x56645a, height: 0.35 },
    rain: 0.3,
    cold: false,
    props: [['deadtree', 2], ['reeds', 2], ['mushrooms', 1]],
    forage: 'mushrooms',
    water: 'pond',
    dayCritters: ['frog', 'bird'],
    nightCritters: ['firefly', 'frog'],
    finds: ['a frog-shaped stone', 'glowing moss', 'a lily seed', 'a bent spoon', 'a tooth of something', 'a bubble that will not pop'],
    forageFood: 'mushrooms',
  },
};

/** What it may find on a night of the full moon, or on the darkest nights of the new moon. */
export const MOON_FINDS = {
  full: ['a stone that is warm to hold', 'a moth with a face on its wings', 'a ring of pale grass', 'a key that fits nothing here'],
  dark: ['a feather black all the way through', 'a seed that hums', 'a shard of something that fell', 'a cold ember'],
} as const;

/** Leaf colours by season: [light, dark]. Winter means snow on the branches. */
export const LEAVES: Readonly<Record<string, readonly [number, number]>> = {
  spring: [0x9be070, 0x4f9a3a],
  summer: [0x6fbf4e, 0x2f6e2a],
  autumn: [0xe0962e, 0x9a4a22],
  winter: [0xe8eef4, 0x9aa8b4],
};
/** Ground in winter, for biomes that get snow then. */
export const WINTER_GROUND = { fg: 0x9aa6b4, bg: 0xd2dae2 } as const;
