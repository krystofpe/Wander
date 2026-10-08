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
export const SKY_SHARE = 0.5;
/** Steps per second of the scenery's own motion (grass, clouds, stars, water, lantern flicker); less means less output. */
export const AMBIENT_HZ = 8;
/** Bits kept per colour channel: 5 gives 32 levels. Lower means less output per frame. */
export const COLOR_BITS = 5;
/** Columns, horizontally, the lantern reaches (rows count double). */
export const LANTERN_RADIUS = 11;
export const LANTERN_RGB: readonly [number, number, number] = [1.0, 0.72, 0.42];
export const LANTERN_GAIN = 1.25;

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
  [0, 0.22, 0.26, 0.45, 0],
  [4.5, 0.22, 0.26, 0.45, 0],
  [6, 1.0, 0.62, 0.55, 0.5],
  [7.5, 1.0, 0.92, 0.84, 0.9],
  [12, 1.0, 1.0, 1.0, 1],
  [16.5, 1.0, 0.96, 0.9, 0.95],
  [18.5, 1.0, 0.6, 0.38, 0.5],
  [20, 0.42, 0.37, 0.58, 0.15],
  [21, 0.22, 0.26, 0.45, 0],
  [24, 0.22, 0.26, 0.45, 0],
];
/** Sky colours through the day: [hour, zenith, horizon], interpolated linearly. */
export const SKY_KEYS: readonly (readonly [number, number, number])[] = [
  [0, 0x05070f, 0x0f1830],
  [4.5, 0x05070f, 0x0f1830],
  [5.6, 0x26305a, 0xd0806a],
  [6.6, 0x3a5a98, 0xf0b080],
  [8, 0x3d7bd0, 0xa8d0f0],
  [12, 0x2f6fd0, 0x9cc8f0],
  [16.5, 0x3a72c8, 0xb0d0ea],
  [18.4, 0x34407a, 0xf08a50],
  [19.6, 0x1a2048, 0x6a3a5a],
  [20.8, 0x070a16, 0x182040],
  [24, 0x05070f, 0x0f1830],
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
export const BIOME_NAMES = ['forest', 'meadow', 'shore', 'tundra', 'desert', 'swamp'] as const;
export type BiomeName = (typeof BIOME_NAMES)[number];

export type PropKind =
  | 'tree'
  | 'pine'
  | 'bush'
  | 'rock'
  | 'pond'
  | 'cactus'
  | 'palm'
  | 'reeds'
  | 'stump'
  | 'deadtree'
  | 'driftwood'
  | 'snowdrift'
  | 'ruin'
  | 'mushrooms'
  | 'tidepool'
  | 'oasis'
  | 'home';
export type CritterKind = 'butterfly' | 'bird' | 'firefly' | 'crab' | 'frog' | 'gull' | 'lizard' | 'moth';

export type BiomeDef = {
  readonly title: string;
  /** Ground texture glyphs, how many cells carry one, and the daylight colours. */
  readonly ground: { readonly glyphs: string; readonly density: number; readonly fg: number; readonly bg: number };
  /** The distant ridge: its glyphs, near and far colours, and how high it rises (share of the sky). */
  readonly ridge: { readonly glyphs: string; readonly near: number; readonly far: number; readonly height: number; readonly smooth: boolean };
  /** True when the horizon is open sea instead of a ridge. */
  readonly sea: boolean;
  /** Share of weather slots with rain (or snow). */
  readonly rain: number;
  /** Snow instead of rain all year. */
  readonly cold: boolean;
  /** Props besides the home: kind and how many. */
  readonly props: readonly (readonly [PropKind, number])[];
  /** Where it finds food for itself. */
  readonly forage: PropKind;
  /** Where it drinks, if anywhere besides the sea. */
  readonly water: PropKind | null;
  readonly dayCritters: readonly CritterKind[];
  readonly nightCritters: readonly CritterKind[];
  /** Things it can find by digging or wandering. */
  readonly finds: readonly string[];
  /** What it forages, for its words and diary. */
  readonly forageFood: string;
};

export const BIOMES: Readonly<Record<BiomeName, BiomeDef>> = {
  forest: {
    title: 'Forest',
    ground: { glyphs: `,.'"♣`, density: 0.32, fg: 0x6fae4e, bg: 0x2c5424 },
    ridge: { glyphs: '♠♣', near: 0x1f3f2a, far: 0x3c5a6a, height: 0.4, smooth: false },
    sea: false,
    rain: 0.25,
    cold: false,
    props: [['tree', 3], ['pine', 2], ['bush', 2], ['mushrooms', 1], ['stump', 1], ['rock', 1]],
    forage: 'bush',
    water: 'pond',
    dayCritters: ['butterfly', 'bird'],
    nightCritters: ['firefly', 'moth'],
    finds: ['an acorn cap', 'a jay feather', 'a beetle shell', 'a perfectly round pebble', 'a pinecone', 'a ring of bark', 'a key to nothing'],
    forageFood: 'berries',
  },
  meadow: {
    title: 'Meadow',
    ground: { glyphs: `,.'"`, density: 0.4, fg: 0xa6dc72, bg: 0x4a8a34 },
    ridge: { glyphs: '∩n', near: 0x4f7a48, far: 0x7a98a8, height: 0.3, smooth: true },
    sea: false,
    rain: 0.2,
    cold: false,
    props: [['tree', 1], ['bush', 2], ['rock', 2], ['mushrooms', 1]],
    forage: 'bush',
    water: 'pond',
    dayCritters: ['butterfly', 'bird'],
    nightCritters: ['firefly', 'moth'],
    finds: ['a four-leaf clover', 'a snail shell', 'a blue feather', 'a smooth stone', 'a dandelion clock', 'a lost button', 'a star fragment'],
    forageFood: 'wild strawberries',
  },
  shore: {
    title: 'Shore',
    ground: { glyphs: '.:·', density: 0.3, fg: 0xb39a5f, bg: 0xdfca92 },
    ridge: { glyphs: '~≈', near: 0x2b6f91, far: 0x163b78, height: 0.12, smooth: true },
    sea: true,
    rain: 0.2,
    cold: false,
    props: [['palm', 2], ['driftwood', 1], ['rock', 2], ['tidepool', 1]],
    forage: 'tidepool',
    water: null,
    dayCritters: ['gull', 'crab'],
    nightCritters: ['crab'],
    finds: ['a spiral shell', 'a piece of sea glass', 'a crab claw', 'a bottle cap', 'a pearl', 'a message with no words', 'a sand dollar'],
    forageFood: 'seaweed',
  },
  tundra: {
    title: 'Tundra',
    ground: { glyphs: `.'·`, density: 0.25, fg: 0x8d9caa, bg: 0xc9d3dc },
    ridge: { glyphs: '▲^', near: 0xd4dbe6, far: 0x8a9ab8, height: 0.55, smooth: false },
    sea: false,
    rain: 0.3,
    cold: true,
    props: [['pine', 3], ['snowdrift', 2], ['rock', 1]],
    forage: 'pine',
    water: 'pond',
    dayCritters: ['bird'],
    nightCritters: [],
    finds: ['an ice crystal that will not melt', 'a white feather', 'a frozen berry', 'a reindeer bell', 'a smooth grey stone', 'a shard of the aurora'],
    forageFood: 'pine nuts',
  },
  desert: {
    title: 'Desert',
    ground: { glyphs: '.·:~', density: 0.25, fg: 0xb98f4c, bg: 0xe0bd78 },
    ridge: { glyphs: '∩', near: 0xc89858, far: 0xd8b48a, height: 0.28, smooth: true },
    sea: false,
    rain: 0.04,
    cold: false,
    props: [['cactus', 3], ['rock', 2], ['ruin', 1]],
    forage: 'cactus',
    water: 'oasis',
    dayCritters: ['lizard', 'bird'],
    nightCritters: ['moth'],
    finds: ['a sun-bleached bone', 'an old coin', 'a scarab', 'a shard of green glass', 'a rose of sand', 'a compass that points home'],
    forageFood: 'cactus fruit',
  },
  swamp: {
    title: 'Swamp',
    ground: { glyphs: `",~.`, density: 0.35, fg: 0x8fa05c, bg: 0x3a4628 },
    ridge: { glyphs: '♣♠', near: 0x2c3626, far: 0x56645a, height: 0.35, smooth: false },
    sea: false,
    rain: 0.3,
    cold: false,
    props: [['deadtree', 2], ['reeds', 3], ['mushrooms', 2], ['stump', 1]],
    forage: 'mushrooms',
    water: 'pond',
    dayCritters: ['frog', 'bird'],
    nightCritters: ['firefly', 'frog'],
    finds: ['a frog-shaped stone', 'glowing moss', 'a lily seed', 'a bent spoon', 'a tooth of something', 'a bubble that will not pop'],
    forageFood: 'mushrooms',
  },
};

/** Leaf colours by season: [light, dark]. Winter means snow on the branches. */
export const LEAVES: Readonly<Record<string, readonly [number, number]>> = {
  spring: [0x9be070, 0x4f9a3a],
  summer: [0x6fbf4e, 0x2f6e2a],
  autumn: [0xe0962e, 0x9a4a22],
  winter: [0xe8eef4, 0x9aa8b4],
};
/** Ground in winter, for biomes that get snow then. */
export const WINTER_GROUND = { fg: 0x9aa6b4, bg: 0xd2dae2 } as const;
