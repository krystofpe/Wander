// Colours as 0xRRGGBB numbers: blending, scaling and rounding.
import { COLOR_BITS } from './config.ts';

const LEVELS = (1 << COLOR_BITS) - 1;
const ROUNDED = Uint8Array.from({ length: 256 }, (_, c) => Math.round((Math.round((c * LEVELS) / 255) * 255) / LEVELS));

/** Rounds a colour channel to 2^COLOR_BITS levels spread over 0..255. */
export function quantize(c: number): number {
  return ROUNDED[c <= 0 ? 0 : c >= 255 ? 255 : c | 0];
}

/** Blend from colour a towards colour b by t (0..1). */
export function mix(a: number, b: number, t: number): number {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const channel = (shift: number): number => {
    const x = (a >> shift) & 255;
    return Math.round(x + (((b >> shift) & 255) - x) * k);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** A colour multiplied per channel (clamped), then rounded. */
export function lit(rgb: number, r: number, g: number, b: number): number {
  return (
    (quantize(((rgb >> 16) & 255) * r) << 16) | (quantize(((rgb >> 8) & 255) * g) << 8) | quantize((rgb & 255) * b)
  );
}

/** Hue (degrees), saturation and lightness (0..1) of a colour. */
export function toHsl(rgb: number): [number, number, number] {
  const r = ((rgb >> 16) & 255) / 255;
  const g = ((rgb >> 8) & 255) / 255;
  const b = (rgb & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

/** A colour from hue (degrees), saturation and lightness (0..1). */
export function fromHsl(h: number, s: number, l: number): number {
  const sat = Math.min(1, Math.max(0, s));
  const lig = Math.min(1, Math.max(0, l));
  const a = sat * Math.min(lig, 1 - lig);
  const channel = (n: number): number => {
    const k = (n + (((h % 360) + 360) % 360) / 30) % 12;
    return Math.round((lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return (channel(0) << 16) | (channel(8) << 8) | channel(4);
}

/** Turns hue `h` by at most `by` degrees towards `target`, the short way round. */
export function turn(h: number, target: number, by: number): number {
  const d = ((target - h + 540) % 360) - 180;
  return h + Math.sign(d) * Math.min(by, Math.abs(d));
}

/** Shades of one colour for pixel art, darkest first: darker ones turn cooler, lighter ones warmer. */
export type Ramp = {
  readonly outline: number;
  readonly dark: number;
  readonly shadow: number;
  readonly base: number;
  readonly light: number;
  readonly gleam: number;
};

/** A hue-shifted ramp around `base`: shadows lean towards blue, highlights towards yellow. */
export function ramp(base: number): Ramp {
  const [h, s, l] = toHsl(base);
  return {
    outline: fromHsl(turn(h, 250, 30), s * 0.8, l * 0.28),
    dark: fromHsl(turn(h, 240, 24), s * 0.9, l * 0.55),
    shadow: fromHsl(turn(h, 240, 12), s, l * 0.78),
    base,
    light: fromHsl(turn(h, 50, 14), s * 0.95, l + (1 - l) * 0.22),
    gleam: fromHsl(turn(h, 50, 24), s * 0.7, l + (1 - l) * 0.6),
  };
}

/** A colour scaled by k, without rounding. */
export function scale(rgb: number, k: number): number {
  const c = (shift: number): number => Math.min(255, Math.max(0, Math.round(((rgb >> shift) & 255) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}
