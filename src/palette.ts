// Each biome's palette, set before anything is drawn, as pixel art wants: eight ramps of five hue-shifted
// steps (shadows turn cool towards blue, highlights warm towards yellow, saturation highest in the
// middle, a fifth of the lightness apart) and two neutrals. Every frame of the scenery is mapped onto it.
import type { BiomeName } from './config.ts';
import { fromHsl, toHsl, turn } from './color.ts';

/** A ramp's middle step: hue in degrees, saturation 0..1, and its lightness (0.47 unless given); or its five steps given outright. */
type Base = readonly [number, number, number?] | readonly [number, number, number, number, number];

/** What each ramp of a biome's palette is for, in order. */
export type Role = 'sky' | 'glow' | 'ground' | 'foliage' | 'earth' | 'stone' | 'water' | 'accent';
const ROLES: readonly Role[] = ['sky', 'glow', 'ground', 'foliage', 'earth', 'stone', 'water', 'accent'];

/**
 * Per biome, each ramp's middle step. A cold, worn world: greys and greyed greens, blues and browns, low in
 * saturation, so the few warm lights (a window, the glow) are the only warmth in it. The sky's darkest steps
 * are the night; the glow's are the dusk.
 */
const BASES: Readonly<Record<BiomeName, Readonly<Record<Role, Base>>>> = {
  meadow: { sky: [214, 0.2], glow: [34, 0.6], ground: [92, 0.2, 0.34], foliage: [118, 0.18, 0.28], earth: [26, 0.22, 0.34], stone: [222, 0.08], water: [206, 0.22, 0.38], accent: [356, 0.3] },
  // The forest is one colour, deep teal, from near-black to the pale glow between the far trunks: sixteen
  // colours taken from a painting of such a forest, placed by role. Cyan for what glows, violet for what watches.
  forest: {
    sky: [0x060e1c, 0x0d3946, 0x165768, 0x2698a5, 0x36bfcf],
    glow: [0x104952, 0x156874, 0x2698a5, 0x36bfcf, 0x8af0f4],
    ground: [0x060e1c, 0x071927, 0x082a34, 0x0d3946, 0x104952],
    foliage: [0x071927, 0x0d3946, 0x104952, 0x165768, 0x20738a],
    earth: [0x060e1c, 0x071927, 0x082a34, 0x20333d, 0x255a6d],
    stone: [0x20333d, 0x255a6d, 0x4a7a86, 0x7aa8b0, 0xb0d4d8],
    water: [0x082a34, 0x0d3946, 0x156874, 0x20738a, 0x36bfcf],
    accent: [0x242852, 0x2a3b5e, 0x4666a0, 0x8c81c1, 0xc0b8e8],
  },
  tundra: { sky: [218, 0.16], glow: [34, 0.45], ground: [216, 0.12, 0.66], foliage: [168, 0.16, 0.26], earth: [24, 0.18, 0.3], stone: [226, 0.08], water: [204, 0.2, 0.5], accent: [262, 0.22] },
  swamp: { sky: [190, 0.14], glow: [58, 0.35], ground: [82, 0.16, 0.22], foliage: [98, 0.18, 0.24], earth: [32, 0.18, 0.26], stone: [100, 0.06], water: [168, 0.18, 0.3], accent: [140, 0.32] },
};
const NEUTRALS = [0x0a0b10, 0xdcdedc];
/** The palette's near-white, for snow in the light. */
export const WHITE = NEUTRALS[1];

/**
 * Five steps of one colour round a middle lightness m: darker ones cooler, lighter ones warmer, the ends a
 * little greyer.
 */
export function rampOf(h: number, s: number, m = 0.47): number[] {
  const lightness = [m * 0.22, m * 0.6, m, m + (1 - m) * 0.36, m + (1 - m) * 0.72];
  return lightness.map((l, i) => {
    const hue = i === 2 ? h : turn(h, i < 2 ? 240 : 55, Math.abs(i - 2) * 12);
    return fromHsl(hue, s * [0.6, 0.9, 1, 0.9, 0.6][i], l);
  });
}

const palettes = new Map<BiomeName, number[]>();

/** A biome's colours. */
export function paletteOf(biome: BiomeName): number[] {
  let p = palettes.get(biome);
  if (p === undefined) {
    p = [...ROLES.flatMap((role) => stepsOf(BASES[biome][role])), ...NEUTRALS];
    palettes.set(biome, p);
  }
  return p;
}

/** A role's five steps: as given, or made from its middle. */
function stepsOf(base: Base): number[] {
  return base.length === 5 ? [...base] : rampOf(base[0], base[1], base[2]);
}

/** One step (0 darkest … 4 lightest) of a ramp of a biome's palette. */
export function tone(biome: BiomeName, role: Role, step: number): number {
  return paletteOf(biome)[ROLES.indexOf(role) * 5 + Math.max(0, Math.min(4, step))];
}

/** A colour in OKLab, where distances match how different colours look. */
function oklab(c: number): [number, number, number] {
  const lin = (v: number): number => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(c >> 16);
  const g = lin((c >> 8) & 255);
  const b = lin(c & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}

/** How far apart two colours look. Hue counts a little extra, so a sky keeps its blue. */
function distance(a: readonly number[], b: readonly number[]): number {
  return (a[0] - b[0]) ** 2 + 1.4 * ((a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/** For each colour (5 bits a channel), the nearest colour of the palette: as it is, and drained of warmth. */
type Lut = { readonly colors: readonly number[]; readonly near: Uint8Array; readonly cold: Uint8Array };
const luts = new Map<BiomeName, Lut>();

/** How much of a colour's saturation the world keeps; the rest drains away. Glowing things keep all of it. */
const KEEP: Readonly<Record<BiomeName, number>> = { forest: 1, meadow: 0.5, tundra: 0.5, swamp: 0.5 };

/** A colour drained of some of its saturation and turned a little towards blue: the world's light, tired. */
function drain(biome: BiomeName, color: number): number {
  const [h, s, l] = toHsl(color);
  return fromHsl(turn(h, 215, 12 * (1 - s)), s * KEEP[biome], l);
}

function lutOf(biome: BiomeName): Lut {
  let lut = luts.get(biome);
  if (lut !== undefined) return lut;
  const colors = paletteOf(biome);
  const labs = colors.map(oklab);
  const nearest = (color: number): number => {
    const lab = oklab(color);
    let best = 0;
    let bestD = Infinity;
    labs.forEach((p, i) => {
      const d = distance(lab, p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };
  const near = new Uint8Array(32768);
  const cold = new Uint8Array(32768);
  for (let key = 0; key < 32768; key++) {
    const color = (Math.round((((key >> 10) & 31) * 255) / 31) << 16) | (Math.round((((key >> 5) & 31) * 255) / 31) << 8) | Math.round(((key & 31) * 255) / 31);
    near[key] = nearest(color);
    cold[key] = nearest(drain(biome, color));
  }
  lut = { colors, near, cold };
  luts.set(biome, lut);
  return lut;
}

/**
 * Maps a colour onto the biome's palette: drained of warmth first, unless it glows (a window, the lantern's
 * light, a star), so the glowing things are the only warm ones. No dither here: the sky and the mist
 * already step and break their own edges, and dithering every surface would only be noise.
 */
export function toPalette(biome: BiomeName, color: number, glow = false): number {
  const lut = lutOf(biome);
  const key = ((color >> 19) << 10) | (((color >> 11) & 31) << 5) | ((color >> 3) & 31);
  return lut.colors[(glow ? lut.near : lut.cold)[key]];
}
