// Tunable constants and the biome table: change the look and feel of Wander here.

// ── Space and time ─────────────────────────────────────────────────────────
/** World units per map row: a character is about twice as tall as it is wide. */
export const ASPECT = 2;
export const FPS = 60;
/** Seconds per simulation step. */
export const FRAME_DT = 1 / FPS;
/** Milliseconds per frame. */
export const FRAME_MS = 1000 / FPS;
/** Most simulation steps run before one render when the loop falls behind. */
export const MAX_CATCH_UP_STEPS = 4;

// ── Movement ───────────────────────────────────────────────────────────────
/** World units per second when walking: 12 columns or 6 rows. */
export const WALK_SPEED = 12;
export const RUN_MULTIPLIER = 2;
/** Seconds for your velocity to close ~63% of the gap to where the keys point. */
export const VELOCITY_TIME_CONSTANT = 0.12;
/** With no keys held, below this speed you stop. */
export const STOP_SPEED = 0.05;

// ── World ──────────────────────────────────────────────────────────────────
export const CHUNK_SIZE = 64;
export const CHUNK_CACHE_LIMIT = 256;
export const PREFETCH_BUDGET_MS = 3;

/** The terrain recipe. Wavelengths are in world units. Calibrated on 2026-10-08 for biome shares. */
export const TERRAIN = {
  warpAmplitude: 60,
  warpWavelength: 500,
  continentWavelength: 1600,
  continentWeight: 1.0,
  detailWavelength: 350,
  detailWeight: 0.75,
  heightBias: 0.11,
  moistureWavelength: 600,
  moistureContrast: 1.0,
  temperatureWavelength: 1500,
  temperatureContrast: 0.8,
  lapseRate: 0.2,
  riverWavelength: 400,
  riverWidthInland: 0.01,
  riverWidthCoast: 0.025,
  riverMinHeight: 0.02,
  riverMaxHeight: 0.55,
  lakeWavelength: 120,
  lakeThreshold: 0.5,
  lakeMinHeight: 0.04,
  lakeMaxHeight: 0.4,
  lakeMinMoisture: 0.4,
  /** Scales height into world units for slope shading. */
  relief: 80,
} as const;

export const Biome = {
  DeepOcean: 0,
  Ocean: 1,
  Shallows: 2,
  River: 3,
  Lake: 4,
  Beach: 5,
  Grassland: 6,
  Forest: 7,
  Swamp: 8,
  Desert: 9,
  Tundra: 10,
  Hills: 11,
  Mountains: 12,
  SnowyPeaks: 13,
} as const;
export type BiomeId = (typeof Biome)[keyof typeof Biome];

export const Water = { None: 0, Sea: 1, River: 2, Lake: 3 } as const;
export type WaterKind = (typeof Water)[keyof typeof Water];

export type BiomeDef = {
  readonly name: string;
  /** Code points; a cell's variant picks one. */
  readonly glyphs: readonly number[];
  /** Daylight foreground colour on black, 0xRRGGBB. */
  readonly fg: number;
  /** Multiplies walking speed. */
  readonly speed: number;
  readonly water: WaterKind;
  /** Trees switch glyph when a gust passes. */
  readonly sways: boolean;
  /** Drawn as blades that lean with the wind and bend around you. */
  readonly blades: boolean;
};

const glyphs = (text: string): number[] => Array.from(text, (ch) => ch.codePointAt(0) ?? 32);

/** One entry per Biome id, in id order. All glyphs are single-width; colours are tuned for a black background. */
export const BIOMES: readonly BiomeDef[] = [
  { name: 'Deep ocean', glyphs: glyphs('≈~'), fg: 0x2f5aa8, speed: 0.45, water: Water.Sea, sways: false, blades: false },
  { name: 'Ocean', glyphs: glyphs('~≈'), fg: 0x4a8be0, speed: 0.45, water: Water.Sea, sways: false, blades: false },
  { name: 'Shallows', glyphs: glyphs('~·'), fg: 0x8fe3e3, speed: 0.55, water: Water.Sea, sways: false, blades: false },
  { name: 'River', glyphs: glyphs('~≈'), fg: 0x9fd4ff, speed: 0.55, water: Water.River, sways: false, blades: false },
  { name: 'Lake', glyphs: glyphs('~≈'), fg: 0x8cc8f0, speed: 0.55, water: Water.Lake, sways: false, blades: false },
  { name: 'Beach', glyphs: glyphs('.:·'), fg: 0xe3cf93, speed: 0.9, water: Water.None, sways: false, blades: false },
  { name: 'Grassland', glyphs: glyphs(',.\'"'), fg: 0x62d45e, speed: 1.0, water: Water.None, sways: false, blades: true },
  { name: 'Forest', glyphs: glyphs('♣♠'), fg: 0x4db35a, speed: 0.6, water: Water.None, sways: true, blades: false },
  { name: 'Swamp', glyphs: glyphs('",~'), fg: 0x9cb064, speed: 0.5, water: Water.None, sways: false, blades: true },
  { name: 'Desert', glyphs: glyphs('.·:'), fg: 0xe6c070, speed: 0.8, water: Water.None, sways: false, blades: false },
  { name: 'Tundra', glyphs: glyphs(".'·"), fg: 0xcfd9cf, speed: 0.85, water: Water.None, sways: false, blades: false },
  { name: 'Hills', glyphs: glyphs('∩n'), fg: 0xb49a5a, speed: 0.65, water: Water.None, sways: false, blades: false },
  { name: 'Mountains', glyphs: glyphs('▲^'), fg: 0xc8c4bf, speed: 0.45, water: Water.None, sways: false, blades: false },
  { name: 'Snowy peaks', glyphs: glyphs('▲^'), fg: 0xffffff, speed: 0.4, water: Water.None, sways: false, blades: false },
];

// ── Day, night and weather ─────────────────────────────────────────────────
/** Game seconds per day. */
export const DAY_LENGTH = 480;
export const DAY_START_HOUR = 8;
/** How much faster the clock and weather run while T is held. */
export const TIME_LAPSE = 20;
/** Sunlight through the day: [hour, red, green, blue, daylight], interpolated linearly. */
export const LIGHT_KEYS: readonly (readonly [number, number, number, number, number])[] = [
  [0, 0.16, 0.2, 0.4, 0],
  [4.5, 0.16, 0.2, 0.4, 0],
  [6, 1.0, 0.62, 0.55, 0.5],
  [7.5, 1.0, 0.92, 0.84, 0.9],
  [12, 1.0, 1.0, 1.0, 1],
  [16.5, 1.0, 0.96, 0.9, 0.95],
  [18.5, 1.0, 0.6, 0.38, 0.5],
  [20, 0.38, 0.33, 0.55, 0.15],
  [21, 0.16, 0.2, 0.4, 0],
  [24, 0.16, 0.2, 0.4, 0],
];
/** World units the lantern reaches: 10 columns or 5 rows. */
export const LANTERN_RADIUS = 10;
export const LANTERN_RGB: readonly [number, number, number] = [1.0, 0.72, 0.42];
export const LANTERN_GAIN = 1.2;

export const WEATHER = {
  firstFrontMin: 60,
  firstFrontMax: 120,
  gapMin: 120,
  gapMax: 300,
  durationMin: 30,
  durationMax: 90,
  /** Seconds a front takes to fade in, and to fade out. */
  fade: 10,
  /** Share of light lost under a full front. */
  dimming: 0.35,
  /** Game seconds per wind wobble. */
  windPeriod: 300,
  cloudWavelength: 180,
  /** Share of light a full cloud blocks. */
  cloudShadow: 0.35,
  /** World units per game second at full wind. */
  cloudSpeed: 6,
  gustWavelength: 30,
  /** World units per real second. */
  gustSpeed: 18,
  /** Share of cells showing a drop at full strength. */
  dropChance: 0.1,
  /** New drop patterns per second. */
  rainRate: 12,
  snowRate: 4,
  /** Cells colder than this get snow instead of rain. */
  snowBelow: 0.25,
} as const;

// ── Grass ──────────────────────────────────────────────────────────────────
/** Blades: how they lean with the wind and bend around you. Distances in world units, times in seconds. */
export const GRASS = {
  /** Lean below which a blade stands upright; jittered per blade by −30%…+30%. */
  leanThreshold: 0.3,
  /** Lean from which a blade lies flat. */
  flatThreshold: 0.8,
  /** Horizontal lean at full wind; below flatThreshold, so wind alone never flattens. */
  windLean: 0.6,
  /** How far around you blades bend. */
  bendRadius: 3,
  /** Time constant for blades to spring back after you pass. */
  bendTime: 0.6,
  /** Trail samples older than this are dropped. */
  trailAge: 1.5,
  /** Least time between two trail samples. */
  sampleEvery: 0.05,
  maxSamples: 32,
} as const;
const codePoint = (ch: string): number => ch.codePointAt(0) ?? 32;
/** Blade glyphs as code points: tall blades stand, lean or lie flat; short blades stand or lie flat. */
export const BLADES = {
  upright: codePoint('|'),
  right: codePoint('/'),
  left: codePoint('\\'),
  flat: codePoint(','),
  short: codePoint("'"),
  shortFlat: codePoint('.'),
} as const;
/** The lit radius: full light inside `inner` of the view's half extents, fading to `edge` at the screen edge. */
export const VIGNETTE = { inner: 0.45, edge: 0.06 } as const;

// ── Screen ─────────────────────────────────────────────────────────────────
export const MIN_COLS = 40;
export const MIN_ROWS = 12;
/** Bits kept per colour channel: 5 gives 32 levels. Lower means less output per frame. */
export const COLOR_BITS = 5;
export const COLORS = {
  /** Every map cell's background. */
  ground: 0x000000,
  player: 0xfff2c8,
  /** Bright blade tips. */
  tip: 0xeaffe0,
  hudFg: 0xd6d9de,
  hudBg: 0x12161c,
  rain: 0xa9c4e8,
  snow: 0xf4f8ff,
  foam: 0xf0f6ff,
} as const;

// ── Keyboard ───────────────────────────────────────────────────────────────
export const DETECT_TIMEOUT_MS = 200;
/** Without release events: how long a key counts as held after its first press… */
export const LEGACY_FIRST_HOLD_MS = 550;
/** …and after each auto-repeat. */
export const LEGACY_REPEAT_HOLD_MS = 120;
