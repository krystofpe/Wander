// Colour. Every pixel stores a role (`leaf` step 3, `coat` step 1…), never a colour. Each biome gives its
// roles daylight colours; the moment (the sun's elevation, the weather) grades them in Oklab, and each depth
// hazes them toward the fog. The result is one palette row per layer and biome, rebuilt as time passes:
// day to night, blends and haze are palette changes, as in Mark Ferrari's Living Worlds (research: Light §2–3).
import type { BiomeId } from './biomes.ts';
import { BIOME_IDS } from './biomes.ts';

// ── Roles ──────────────────────────────────────────────────────────────────

/** A family of roles: `steps` shades from darkest to lightest, and what is special about them. */
type Family = {
  readonly name: string;
  readonly steps: number;
  /** Glows on its own: kept warm and bright at night, fog cannot cover it, feeds bloom. */
  readonly glow?: boolean;
  /** Not graded by the hour (the sky's own colours, his hood's darkness). */
  readonly fixed?: boolean;
  /** A window pane: dark glass by day, lamplight at night. */
  readonly window?: boolean;
  /** Colour-cycled (water glints), step order rotating over time. */
  readonly cycle?: boolean;
  /** Steps 2 and 3 are faces turned left and right: lit when the sun is on their side of the sky. */
  readonly sided?: boolean;
};

const FAMILIES: readonly Family[] = [
  { name: 'land', steps: 5, sided: true },
  { name: 'rock', steps: 5, sided: true },
  { name: 'soil', steps: 4 },
  { name: 'grass', steps: 5 },
  { name: 'leaf', steps: 5 },
  { name: 'needle', steps: 4 },
  { name: 'bark', steps: 4 },
  { name: 'birch', steps: 4 },
  { name: 'dry', steps: 4 },
  { name: 'sand', steps: 4 },
  { name: 'snow', steps: 4 },
  { name: 'salt', steps: 3 },
  { name: 'water', steps: 4, cycle: true },
  { name: 'stone', steps: 4 },
  { name: 'brick', steps: 3 },
  { name: 'wood', steps: 4 },
  { name: 'metal', steps: 4 },
  { name: 'roof', steps: 3 },
  { name: 'path', steps: 3 },
  { name: 'flower', steps: 3 },
  { name: 'bone', steps: 3 },
  { name: 'cloud', steps: 4 },
  { name: 'fur', steps: 4 },
  { name: 'fire', steps: 5, glow: true },
  { name: 'ember', steps: 3, glow: true },
  { name: 'smoke', steps: 3 },
  { name: 'glass', steps: 2, window: true },
  { name: 'lamp', steps: 1, glow: true },
  { name: 'rail', steps: 2 },
  { name: 'wire', steps: 1 },
  { name: 'bird', steps: 2 },
  { name: 'firefly', steps: 1, glow: true },
  { name: 'coat', steps: 5 },
  { name: 'hood', steps: 1, fixed: true },
  { name: 'eye', steps: 1, glow: true },
  { name: 'pack', steps: 4 },
  { name: 'stick', steps: 2 },
  { name: 'boot', steps: 2 },
  { name: 'cig', steps: 1 },
];

export type RoleInfo = {
  readonly family: string;
  readonly step: number;
  /** 0 for the family's darkest shade (facing away from the light) … 1 for its lightest (facing it). */
  readonly light: number;
  readonly glow: boolean;
  readonly fixed: boolean;
  readonly window: boolean;
  readonly cycle: boolean;
  /** −1 a face turned left (toward the morning sun), +1 turned right (evening), 0 neither. */
  readonly side: number;
};

/** Role 0 is "nothing here" (transparent). */
export const ROLES: readonly RoleInfo[] = (() => {
  const out: RoleInfo[] = [{ family: 'none', step: 0, light: 0, glow: false, fixed: true, window: false, cycle: false, side: 0 }];
  for (const f of FAMILIES) {
    for (let s = 0; s < f.steps; s++) {
      out.push({
        family: f.name,
        step: s,
        light: f.steps === 1 ? 0.5 : s / (f.steps - 1),
        glow: f.glow === true,
        fixed: f.fixed === true,
        window: f.window === true,
        cycle: f.cycle === true,
        side: f.sided === true && s === 2 ? -1 : f.sided === true && s === 3 ? 1 : 0,
      });
    }
  }
  return out;
})();

export const ROLE_COUNT = ROLES.length;

const FIRST: ReadonlyMap<string, number> = (() => {
  const m = new Map<string, number>();
  ROLES.forEach((r, i) => {
    if (i > 0 && r.step === 0) m.set(r.family, i);
  });
  return m;
})();

/** The role index of a family's step (clamped to the family). */
export function role(family: string, step = 0): number {
  const first = FIRST.get(family);
  if (first === undefined) throw new Error(`no colour family ${family}`);
  const f = FAMILIES.find((x) => x.name === family);
  const n = f === undefined ? 1 : f.steps;
  return first + Math.max(0, Math.min(n - 1, Math.round(step)));
}

/** How many steps a family has. */
export function steps(family: string): number {
  return FAMILIES.find((f) => f.name === family)?.steps ?? 0;
}

// ── Oklab ──────────────────────────────────────────────────────────────────

export type Lab = [number, number, number];

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toGamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

export function hexToLab(hex: string): Lab {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return rgbToLab(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** sRGB (0..1, gamma-encoded) to Oklab (Björn Ottosson). */
export function rgbToLab(r8: number, g8: number, b8: number): Lab {
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Oklab to sRGB bytes, clamped, written into `out` at `at`. */
export function labToBytes(L: number, a: number, b: number, out: Uint8Array, at: number): void {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  out[at] = Math.round(255 * Math.min(1, Math.max(0, toGamma(Math.max(0, r)))));
  out[at + 1] = Math.round(255 * Math.min(1, Math.max(0, toGamma(Math.max(0, g)))));
  out[at + 2] = Math.round(255 * Math.min(1, Math.max(0, toGamma(Math.max(0, bl)))));
}

export function labToHex(lab: Lab): string {
  const o = new Uint8Array(3);
  labToBytes(lab[0], lab[1], lab[2], o, 0);
  return `#${[o[0], o[1], o[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** `n` shades through the anchor colours (darkest first), spaced evenly and interpolated in Oklab. */
export function rampThrough(anchors: readonly string[], n: number): Lab[] {
  const labs = anchors.map(hexToLab);
  if (n === 1) return [labs[Math.floor(labs.length / 2)]];
  const out: Lab[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * (labs.length - 1);
    const j = Math.min(labs.length - 2, Math.floor(t));
    const k = t - j;
    const a = labs[j];
    const b = labs[j + 1] ?? labs[j];
    out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]);
  }
  return out;
}

// ── Daylight colours ───────────────────────────────────────────────────────

type Colours = Partial<Record<string, readonly string[]>>;

/**
 * Every family's daylight colours, darkest first: muted, cool in the shadows, a little warmer toward the light,
 * mean chroma kept low so that the ember and the fire are the most saturated things in the world.
 */
const BASE: Colours = {
  land: ['#1f2b33', '#33454c', '#4c6268', '#6b8287', '#93a8a8'],
  rock: ['#202229', '#363a42', '#52565c', '#6c7072', '#8b8a86'],
  soil: ['#1f1918', '#352a24', '#4f3f2f', '#6a573e'],
  grass: ['#1a271f', '#2b3f2a', '#435a34', '#637645', '#8c9a5e'],
  leaf: ['#182620', '#273d30', '#3d583a', '#5c7448', '#86975e'],
  needle: ['#0e1a1d', '#1a2f2f', '#2b463e', '#45624f'],
  bark: ['#1b1515', '#2c2320', '#43352d', '#5c4b3c'],
  birch: ['#38363a', '#8f8c87', '#c2bdb1', '#e3ddd0'],
  dry: ['#3a3123', '#5a4e35', '#81734f', '#a99b6e'],
  sand: ['#65553f', '#877353', '#aa936d', '#c8b38d'],
  snow: ['#69758a', '#919dae', '#c0c9d4', '#e6ebef'],
  salt: ['#a3a29d', '#cbc9c0', '#e9e7de'],
  water: ['#18283a', '#25404f', '#3a5a69', '#6c8c95'],
  stone: ['#29292f', '#414248', '#5e5e5c', '#83827a'],
  brick: ['#36241f', '#52352b', '#704e3c'],
  wood: ['#1e160e', '#33261a', '#4c3a27', '#665136'],
  metal: ['#271b18', '#462b20', '#6a3f27', '#8b5835'],
  roof: ['#1c1d21', '#303138', '#474850'],
  path: ['#372f27', '#514638', '#6c604c'],
  flower: ['#615470', '#85768e', '#ad9ea3'],
  bone: ['#878271', '#b0aa96', '#d6d0bb'],
  cloud: ['#7a8592', '#9fa8b3', '#c3cad2', '#e2e6eb'],
  fur: ['#2a1d16', '#493222', '#6c4a30', '#916e47'],
  fire: ['#7a1e0a', '#c2410c', '#f07a1a', '#ffb347', '#ffe2a0'],
  ember: ['#6b1508', '#d9430f', '#ffb36b'],
  smoke: ['#56585f', '#787a82', '#9c9ea5'],
  glass: ['#15181e', '#2a313b'],
  lamp: ['#ff3a2a'],
  rail: ['#34353a', '#777a7f'],
  wire: ['#1c1d20'],
  bird: ['#141418', '#2a2a31'],
  firefly: ['#d8ff8a'],
  coat: ['#0d0b15', '#181524', '#252135', '#363049', '#4b4364'],
  hood: ['#050407'],
  eye: ['#ffd27a'],
  pack: ['#1d1711', '#31271c', '#483928', '#5d4b35'],
  stick: ['#281e14', '#463524'],
  boot: ['#110e0d', '#221e1b'],
  cig: ['#cdc6b6'],
};

/** What each biome changes from the base. */
const BIOME_COLOURS: Readonly<Record<BiomeId, Colours>> = {
  pine: {
    land: ['#0b1d27', '#143241', '#214b57', '#356771', '#56878a'],
    needle: ['#071419', '#0e2629', '#173a38', '#285449'],
    grass: ['#13201c', '#1f3328', '#2f4a33', '#4a6440', '#6e8350'],
    soil: ['#17120f', '#2a201a', '#3e3023', '#544330'],
    bark: ['#140f0f', '#251c19', '#3a2c25', '#514034'],
  },
  birch: {
    land: ['#1e2a24', '#2f4136', '#4a5e4c', '#4a5e4c', '#7e9277'],
    leaf: ['#22301e', '#38492b', '#566a3a', '#7d8c4e', '#a7ad69'],
    grass: ['#1f2b1c', '#33452a', '#4f6337', '#728048', '#9aa062'],
  },
  meadow: {
    land: ['#253226', '#384a33', '#55683f', '#55683f', '#8c9a63'],
    grass: ['#202d1d', '#344a29', '#506938', '#76874a', '#a2a865'],
    leaf: ['#1d2c20', '#304631', '#4b623e', '#6c7f4e', '#959e66'],
    flower: ['#6e5b7e', '#9583a0', '#c3b1b2'],
  },
  autumn: {
    land: ['#2e2523', '#47352d', '#6a4c38', '#6a4c38', '#a3815c'],
    leaf: ['#3a1c15', '#62301b', '#8a4c22', '#b0742f', '#cfa156'],
    grass: ['#2c2a1c', '#454027', '#625a34', '#857a47', '#a69d63'],
    soil: ['#24191a', '#3b2824', '#55392c', '#6f4f39'],
  },
  plateau: {
    land: ['#332e2a', '#4b4335', '#6c6046', '#6c6046', '#a6976c'],
    grass: ['#2e2c21', '#48452f', '#67633f', '#8a8454', '#aca46f'],
    rock: ['#2a2629', '#433c3d', '#625855', '#867a70', '#aa9f92'],
  },
  pass: {
    land: ['#22252e', '#353a45', '#535a66', '#535a66', '#9aa1a8'],
    rock: ['#1c1f28', '#30353f', '#4b515a', '#6f747b', '#9da0a2'],
    grass: ['#1e2620', '#30392d', '#48523b', '#677049', '#8a8f5f'],
    needle: ['#0d171a', '#18282a', '#273b36', '#3d5446'],
  },
  coast: {
    land: ['#3a3631', '#57504a', '#7d7466', '#7d7466', '#b6aa92'],
    sand: ['#706352', '#93836b', '#b6a587', '#d2c4a5'],
    grass: ['#2c3424', '#454f33', '#626b43', '#858b58', '#a8aa73'],
    water: ['#1a2a37', '#2a4250', '#43606b', '#7896a0'],
  },
  desert: {
    land: ['#3a2220', '#5a3427', '#814b33', '#a66b49', '#c89670'],
    sand: ['#7a523a', '#a06c4c', '#c38e66', '#dcb388'],
    rock: ['#3b231d', '#5c3528', '#844e37', '#a86e4f', '#c69a7b'],
    dry: ['#4a3a27', '#6e5838', '#94794d', '#b99c68'],
    bone: ['#9a917d', '#c2b9a2', '#e2dac3'],
  },
  tundra: {
    land: ['#3e4a5e', '#5c6a80', '#8290a5', '#acb8c8', '#d8dfe8'],
    snow: ['#6c788e', '#94a0b3', '#c3ccd8', '#e9eef2'],
    needle: ['#0d1719', '#18292a', '#273c37', '#3a5347'],
    rock: ['#262931', '#3c414b', '#585e67', '#7d8289', '#a6a9ac'],
  },
  swamp: {
    land: ['#1a2420', '#2a3832', '#3f4f45', '#5a6a5b', '#7f8c7a'],
    water: ['#121a17', '#1d2a25', '#2d3d35', '#4c5f53'],
    grass: ['#1d241a', '#2e3826', '#455132', '#606a41', '#828858'],
    bark: ['#1c1b1b', '#2e2c2a', '#454240', '#5f5b56'],
    dry: ['#2e2a1e', '#4a432e', '#6b6141', '#8d8258'],
  },
  saltflat: {
    land: ['#3d3746', '#5a5262', '#7e7584', '#a59ca8', '#cbc4cb'],
    salt: ['#a8a59f', '#d1cec5', '#eeebe2'],
    metal: ['#2b201c', '#4a3227', '#6c482f', '#8b623f'],
  },
  stones: {
    land: ['#262620', '#3b3a2e', '#5a5640', '#5a5640', '#8d8763'],
    grass: ['#262219', '#3d3727', '#575032', '#756d46', '#958e62'],
    stone: ['#26272d', '#3e4046', '#5c5d5d', '#82827c'],
    flower: ['#4a3346', '#6b4a62', '#8d6c80'],
  },
  ruins: {
    land: ['#262a30', '#3a4047', '#565d62', '#7a8080', '#a2a59f'],
    leaf: ['#16231c', '#24362a', '#38503a', '#556b49', '#7b8a5f'],
    stone: ['#2b2b2f', '#444449', '#626260', '#878580'],
  },
  rail: {
    land: ['#272c33', '#3d454b', '#5a6466', '#7e8783', '#a6ab9f'],
    grass: ['#29291e', '#413f2c', '#5e5a3b', '#807a50', '#a39c6c'],
    path: ['#38332e', '#544c43', '#716759'],
  },
};

/** Daylight colours of every role in a biome, as Oklab triples (index × 3). */
export function daylight(biome: BiomeId): Float32Array {
  const out = new Float32Array(256 * 3);
  const colours = { ...BASE, ...BIOME_COLOURS[biome] };
  for (const f of FAMILIES) {
    const anchors = colours[f.name];
    if (anchors === undefined) continue;
    const ramp = rampThrough(anchors, f.steps);
    if (f.sided === true) {
      // Both faces start from the same colour; the light alone tells them apart.
      const mid: Lab = [(ramp[2][0] + ramp[3][0]) / 2, (ramp[2][1] + ramp[3][1]) / 2, (ramp[2][2] + ramp[3][2]) / 2];
      ramp[2] = mid;
      ramp[3] = [...mid];
      // The rim is a gentle step above the faces: the low sun's boost makes it glow, noon leaves it quiet.
      const rim = ramp[4];
      ramp[4] = [mid[0] + (rim[0] - mid[0]) * 0.35, mid[1] + (rim[1] - mid[1]) * 0.35, mid[2] + (rim[2] - mid[2]) * 0.35];
    }
    const first = FIRST.get(f.name) ?? 0;
    ramp.forEach((lab, i) => out.set(lab, (first + i) * 3));
  }
  return out;
}

// ── The moment: time keys by the sun's elevation ───────────────────────────

/** How the world is graded at one sun elevation (all colours as hex, amounts 0..1). */
type Key = {
  /** Sun elevation in degrees. */
  readonly e: number;
  /** Lightness: L' = lift + L·gain (+ boost on lit roles). */
  readonly lift: number;
  readonly gain: number;
  /** Extra lightness on roles facing the light. */
  readonly boost: number;
  /** The key light's colour and how strongly lit roles turn toward it. */
  readonly light: string;
  readonly warm: number;
  /** The ambient (sky) colour and how strongly shadowed roles turn toward it. */
  readonly ambient: string;
  readonly cool: number;
  /** Chroma kept (night drops it). */
  readonly sat: number;
  /** Sky: zenith, horizon, and the glow lobe around the sun (colour, strength, width in screen fractions). */
  readonly zenith: string;
  readonly horizon: string;
  readonly glow: string;
  readonly glowStrength: number;
  readonly glowWidth: number;
  /** Fog colour at the horizon, and haze density multiplier. */
  readonly fog: string;
  readonly haze: number;
};

// Sky keys after the research's muted teal-by-day / violet-by-night set (Light §10–11) and skygrad's glow lobe.
const EVENING: readonly Key[] = [
  { e: -90, lift: 0.035, gain: 0.42, boost: 0.02, light: '#6f7fb8', warm: 0.1, ambient: '#2a2d4f', cool: 0.55, sat: 0.45, zenith: '#0c0c16', horizon: '#26263a', glow: '#2a2f52', glowStrength: 0.05, glowWidth: 0.4, fog: '#141420', haze: 0.7 },
  { e: -18, lift: 0.035, gain: 0.44, boost: 0.03, light: '#6f7fb8', warm: 0.1, ambient: '#2c2f55', cool: 0.55, sat: 0.45, zenith: '#100f19', horizon: '#29293d', glow: '#2e3458', glowStrength: 0.08, glowWidth: 0.4, fog: '#1a1a28', haze: 0.75 },
  { e: -12, lift: 0.035, gain: 0.48, boost: 0.03, light: '#7a7fb8', warm: 0.12, ambient: '#33335c', cool: 0.5, sat: 0.5, zenith: '#10101c', horizon: '#36324b', glow: '#3a4a78', glowStrength: 0.12, glowWidth: 0.42, fog: '#2a283e', haze: 0.85 },
  { e: -6, lift: 0.03, gain: 0.56, boost: 0.05, light: '#b86a4e', warm: 0.25, ambient: '#3d3a66', cool: 0.45, sat: 0.6, zenith: '#131428', horizon: '#736171', glow: '#b86a4e', glowStrength: 0.45, glowWidth: 0.45, fog: '#5e5068', haze: 1 },
  { e: -3, lift: 0.025, gain: 0.66, boost: 0.1, light: '#e88a3c', warm: 0.5, ambient: '#433f70', cool: 0.4, sat: 0.7, zenith: '#1c253f', horizon: '#b18b6c', glow: '#e88a3c', glowStrength: 0.7, glowWidth: 0.5, fog: '#8c7270', haze: 1 },
  { e: 0, lift: 0.02, gain: 0.76, boost: 0.16, light: '#ffb24a', warm: 0.6, ambient: '#4a4a78', cool: 0.35, sat: 0.8, zenith: '#21364c', horizon: '#d4ad79', glow: '#ffb24a', glowStrength: 0.85, glowWidth: 0.55, fog: '#a88d78', haze: 1 },
  { e: 5, lift: 0.01, gain: 0.86, boost: 0.15, light: '#ffc66a', warm: 0.5, ambient: '#53607e', cool: 0.25, sat: 0.9, zenith: '#2f5366', horizon: '#d1c19c', glow: '#ffd27a', glowStrength: 0.6, glowWidth: 0.55, fog: '#b6ab92', haze: 0.95 },
  { e: 15, lift: 0, gain: 0.95, boost: 0.09, light: '#f4e3b2', warm: 0.2, ambient: '#5e7486', cool: 0.15, sat: 0.95, zenith: '#386c79', horizon: '#c6d4d5', glow: '#f4e3b2', glowStrength: 0.3, glowWidth: 0.6, fog: '#b9c6c6', haze: 0.9 },
  { e: 40, lift: 0, gain: 1, boost: 0.05, light: '#f2f0e4', warm: 0.05, ambient: '#64798a', cool: 0.1, sat: 1, zenith: '#2f7582', horizon: '#c3d8db', glow: '#e8eef5', glowStrength: 0.14, glowWidth: 0.7, fog: '#bccfd2', haze: 0.85 },
  { e: 90, lift: 0, gain: 1, boost: 0.05, light: '#f2f0e4', warm: 0.05, ambient: '#64798a', cool: 0.1, sat: 1, zenith: '#2c7380', horizon: '#c3d8db', glow: '#e8eef5', glowStrength: 0.12, glowWidth: 0.7, fog: '#bccfd2', haze: 0.85 },
];

// Dawn is cooler and pinker than dusk, and shorter on gold (Ferrari's sunrise keys).
const MORNING: readonly Key[] = EVENING.map((k) => {
  if (k.e < -14 || k.e > 20) return k;
  const swap: Readonly<Record<number, Partial<Key>>> = {
    [-12]: { horizon: '#3a3550', glow: '#46507a', ambient: '#363a63' },
    [-6]: { horizon: '#6e6278', glow: '#a87487', light: '#b8879a', ambient: '#424470', fog: '#5d566d' },
    [-3]: { horizon: '#a88c86', glow: '#d99a86', light: '#e2a08a', ambient: '#4b4b78', fog: '#86777c' },
    [0]: { horizon: '#ccae92', glow: '#f2b88a', light: '#f6be8c', fog: '#a38f86' },
    [5]: { horizon: '#ccc3ab', glow: '#f8d6a4', light: '#f8dcb0', fog: '#b2ad9e' },
    [15]: { horizon: '#c4d2d4', glow: '#f2e8c8' },
  };
  return { ...k, ...(swap[k.e] ?? {}) };
});

type KeyLab = {
  e: number;
  lift: number;
  gain: number;
  boost: number;
  light: Lab;
  warm: number;
  ambient: Lab;
  cool: number;
  sat: number;
  zenith: Lab;
  horizon: Lab;
  glow: Lab;
  glowStrength: number;
  glowWidth: number;
  fog: Lab;
  haze: number;
};

const toLabKey = (k: Key): KeyLab => ({
  ...k,
  light: hexToLab(k.light),
  ambient: hexToLab(k.ambient),
  zenith: hexToLab(k.zenith),
  horizon: hexToLab(k.horizon),
  glow: hexToLab(k.glow),
  fog: hexToLab(k.fog),
});
const EVENING_LAB = EVENING.map(toLabKey);
const MORNING_LAB = MORNING.map(toLabKey);

/** Everything the palette and the sky need about one moment. Plain numbers, reused without allocation. */
export type Moment = {
  elevation: number;
  morning: boolean;
  /** 0..1 cloud, rain or snow, fog. */
  cloud: number;
  precip: number;
  fog: number;
  storm: boolean;
  /** 0..1 of a lightning flash. */
  flash: number;
  /** 0 new … 1 full moon, and whether the moon is up. */
  moonlight: number;
  /** Seconds of animation time (colour cycling, blinking lights). */
  time: number;
  /** Where the sun is across the sky, −1 left (morning) … +1 right (evening). */
  side: number;
};

export function newMoment(): Moment {
  return { elevation: 30, morning: false, cloud: 0, precip: 0, fog: 0, storm: false, flash: 0, moonlight: 0, time: 0, side: 0 };
}

/** The graded moment: the interpolated key, after the weather. */
export type Grade = {
  lift: number;
  gain: number;
  boost: number;
  light: Lab;
  warm: number;
  ambient: Lab;
  cool: number;
  sat: number;
  zenith: Lab;
  horizon: Lab;
  glow: Lab;
  glowStrength: number;
  glowWidth: number;
  fog: Lab;
  haze: number;
  /** 0 by day … 1 deep night: lit windows, stars. */
  night: number;
  /** Where the light comes from across the sky, −1 left … +1 right, fading to 0 under cloud and at night. */
  side: number;
};

export function newGrade(): Grade {
  const z: Lab = [0, 0, 0];
  return { lift: 0, gain: 1, boost: 0, light: [...z], warm: 0, ambient: [...z], cool: 0, sat: 1, zenith: [...z], horizon: [...z], glow: [...z], glowStrength: 0, glowWidth: 0.5, fog: [...z], haze: 1, night: 0, side: 0 };
}

const lerpLab = (out: Lab, a: Lab, b: Lab, k: number): void => {
  out[0] = a[0] + (b[0] - a[0]) * k;
  out[1] = a[1] + (b[1] - a[1]) * k;
  out[2] = a[2] + (b[2] - a[2]) * k;
};

const OVERCAST_DAY = hexToLab('#8d969c');
const OVERCAST_SKY = hexToLab('#9aa3a8');
const STORM_SKY = hexToLab('#5d656f');
const FOG_DAY = hexToLab('#a7adb0');

/** Fills `g` with the grade of a moment: keys interpolated by elevation, then the weather. No allocation. */
export function gradeOf(m: Moment, g: Grade): Grade {
  const keys = m.morning ? MORNING_LAB : EVENING_LAB;
  let i = 1;
  while (i < keys.length - 1 && keys[i].e < m.elevation) i++;
  const a = keys[i - 1];
  const b = keys[i];
  const k = Math.min(1, Math.max(0, (m.elevation - a.e) / (b.e - a.e)));
  const mix = (x: number, y: number): number => x + (y - x) * k;
  g.lift = mix(a.lift, b.lift);
  g.gain = mix(a.gain, b.gain);
  g.boost = mix(a.boost, b.boost);
  g.warm = mix(a.warm, b.warm);
  g.cool = mix(a.cool, b.cool);
  g.sat = mix(a.sat, b.sat);
  g.glowStrength = mix(a.glowStrength, b.glowStrength);
  g.glowWidth = mix(a.glowWidth, b.glowWidth);
  g.haze = mix(a.haze, b.haze);
  lerpLab(g.light, a.light, b.light, k);
  lerpLab(g.ambient, a.ambient, b.ambient, k);
  lerpLab(g.zenith, a.zenith, b.zenith, k);
  lerpLab(g.horizon, a.horizon, b.horizon, k);
  lerpLab(g.glow, a.glow, b.glow, k);
  lerpLab(g.fog, a.fog, b.fog, k);
  g.night = Math.min(1, Math.max(0, (-m.elevation - 2) / 12));
  g.side = m.side * (1 - g.night);

  // Weather: cloud flattens the light and greys the sky; fog thickens the haze; storms darken.
  const day = Math.min(1, Math.max(0, (m.elevation + 6) / 18));
  const over = Math.min(1, m.cloud * 0.85 + m.precip * 0.3);
  const dim = 1 - 0.28 * m.precip - (m.storm ? 0.15 : 0);
  g.gain *= 1 - 0.12 * over;
  g.gain *= dim;
  g.boost *= 1 - over;
  g.side *= 1 - 0.8 * over;
  g.warm *= 1 - 0.8 * over;
  g.glowStrength *= 1 - 0.75 * over;
  g.sat *= 1 - 0.3 * over;
  const greySky = m.storm ? STORM_SKY : OVERCAST_SKY;
  const greyFactor = over * (0.25 + 0.75 * day);
  g.zenith[0] = g.zenith[0] + (greySky[0] * (0.25 + 0.75 * day) - g.zenith[0]) * greyFactor * 0.8;
  g.zenith[1] *= 1 - greyFactor * 0.8;
  g.zenith[2] *= 1 - greyFactor * 0.8;
  g.horizon[0] = g.horizon[0] + (OVERCAST_DAY[0] * (0.2 + 0.8 * day) - g.horizon[0]) * greyFactor * 0.7;
  g.horizon[1] *= 1 - greyFactor * 0.7;
  g.horizon[2] *= 1 - greyFactor * 0.7;
  const fogK = Math.min(1, m.fog * 0.9 + m.precip * 0.35);
  g.fog[0] = g.fog[0] + (FOG_DAY[0] * (0.15 + 0.85 * day) - g.fog[0]) * fogK * 0.6;
  g.fog[1] *= 1 - fogK * 0.5;
  g.fog[2] *= 1 - fogK * 0.5;
  g.haze *= 1 + 2.2 * m.fog + 1.2 * m.precip;
  // Moonlight lifts the night a little (and silvers it).
  const moon = m.moonlight * g.night * (1 - over);
  g.lift += 0.012 * moon;
  g.gain += 0.08 * moon;
  // A lightning flash: everything leaps toward a cold white for a moment.
  if (m.flash > 0) {
    g.lift += 0.25 * m.flash;
    g.gain += 0.4 * m.flash;
    g.sat *= 1 - 0.6 * m.flash;
  }
  return g;
}

/** Haze density per depth step for a biome, before the moment's multiplier (σ in 1 − e^(−σ(z−1))). */
export const HAZE_BASE = 0.12;

/** The fraction of fog at depth z. */
export function hazeAt(z: number, sigma: number): number {
  return z <= 1 ? 0 : 1 - Math.exp(-sigma * (z - 1));
}

const WINDOW_LIT = hexToLab('#ffa957');
const WINDOW_DIM = hexToLab('#2a313b');

/**
 * Grades one role's daylight colour for a moment and a haze fraction, into sRGB bytes at `out[at]`. Lightness
 * is remapped (lift + gain, plus a boost on lit roles); lit roles turn toward the key light, shaded ones toward
 * the ambient sky; chroma is scaled; then it all goes `hazeK` of the way to the fog. Glowing roles keep their
 * colour and see through the fog.
 */
export function gradeRole(src: Float32Array, roleIndex: number, g: Grade, hazeK: number, time: number, out: Uint8Array, at: number): void {
  const info = ROLES[roleIndex];
  let L = src[roleIndex * 3];
  let A = src[roleIndex * 3 + 1];
  let B = src[roleIndex * 3 + 2];
  if (info.cycle) {
    // Ferrari's colour cycling: the water family's steps rotate slowly, glints travelling along.
    const n = steps(info.family);
    const first = roleIndex - info.step;
    const shift = Math.floor(time * 2.2) % n;
    const j = first + ((info.step + shift) % n);
    L = src[j * 3];
    A = src[j * 3 + 1];
    B = src[j * 3 + 2];
  }
  if (info.glow) {
    const fogK = hazeK * 0.25;
    labToBytes(L + (g.fog[0] - L) * fogK, A + (g.fog[1] - A) * fogK, B + (g.fog[2] - B) * fogK, out, at);
    return;
  }
  if (info.fixed) {
    labToBytes(L, A, B, out, at);
    return;
  }
  if (info.window) {
    // Dark glass by day; at night, someone's lamp (only the pane, the frame stays dark).
    if (info.step === 1 && g.night > 0.15) {
      const k = Math.min(1, (g.night - 0.15) / 0.35);
      const fogK = hazeK * 0.3;
      const l = WINDOW_DIM[0] + (WINDOW_LIT[0] - WINDOW_DIM[0]) * k;
      const a = WINDOW_DIM[1] + (WINDOW_LIT[1] - WINDOW_DIM[1]) * k;
      const b = WINDOW_DIM[2] + (WINDOW_LIT[2] - WINDOW_DIM[2]) * k;
      labToBytes(l + (g.fog[0] - l) * fogK, a + (g.fog[1] - a) * fogK, b + (g.fog[2] - b) * fogK, out, at);
      return;
    }
  }
  // A face turned toward the sun's side of the sky is lit; the other falls into shade.
  const lit = info.side === 0 ? info.light : Math.min(1, Math.max(0.15, 0.55 + 0.45 * info.side * g.side));
  // Lightness: remapped, lit sides boosted.
  let L2 = g.lift + L * g.gain + g.boost * lit * (0.4 + L);
  // Hue: lit roles lean toward the key light, shaded ones toward the ambient sky.
  const toWarm = g.warm * lit * lit;
  const toCool = g.cool * (1 - lit * 0.7);
  let A2 = A * g.sat;
  let B2 = B * g.sat;
  A2 += (g.light[1] * 0.6 - A2) * toWarm;
  B2 += (g.light[2] * 0.6 - B2) * toWarm;
  A2 += (g.ambient[1] * 0.8 - A2) * toCool;
  B2 += (g.ambient[2] * 0.8 - B2) * toCool;
  // Haze toward the fog colour.
  L2 += (g.fog[0] - L2) * hazeK;
  A2 += (g.fog[1] - A2) * hazeK;
  B2 += (g.fog[2] - B2) * hazeK;
  labToBytes(L2, A2, B2, out, at);
}

/** Daylight Oklab colours for every biome, made once. */
export const DAYLIGHT: Readonly<Record<BiomeId, Float32Array>> = Object.fromEntries(BIOME_IDS.map((id) => [id, daylight(id)])) as Record<BiomeId, Float32Array>;

/** How much a role glows at this moment, 0..1: lights always, window panes once it is dark. */
export function glowOf(roleIndex: number, g: Grade): number {
  const info = ROLES[roleIndex];
  if (info.glow) return 1;
  if (info.window && info.step === 1) return Math.min(1, Math.max(0, (g.night - 0.15) / 0.35));
  return 0;
}

/**
 * Builds one palette row: every role of a biome graded for the moment at haze fraction `hazeK`, as RGBA bytes,
 * into `out` starting at `at`; 256 entries. Alpha carries the glow inverted (255 = no glow), so lights feed the
 * bloom without a second texture.
 */
export function buildRow(biome: BiomeId, g: Grade, hazeK: number, time: number, out: Uint8Array, at: number): void {
  const src = DAYLIGHT[biome];
  out[at] = 0;
  out[at + 1] = 0;
  out[at + 2] = 0;
  out[at + 3] = 0;
  for (let r = 1; r < ROLE_COUNT; r++) {
    const o = at + r * 4;
    gradeRole(src, r, g, hazeK, time, out, o);
    out[o + 3] = 255 - Math.round(255 * glowOf(r, g) * (1 - hazeK * 0.5));
  }
}
