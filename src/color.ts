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

/** A colour scaled by k, without rounding. */
export function scale(rgb: number, k: number): number {
  const c = (shift: number): number => Math.min(255, Math.max(0, Math.round(((rgb >> shift) & 255) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}
