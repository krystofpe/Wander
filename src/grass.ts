// Grass: blades that lean with the wind and bend away from where you have just walked.
import { BLADES, GRASS } from './config.ts';
import type { Ambient } from './ambient.ts';

type Sample = { readonly x: number; readonly y: number; readonly t: number };

/** Where you have been lately (world units, real time), so blades can part around you and spring back. */
export class Trail {
  private readonly samples: Sample[] = [];

  get size(): number {
    return this.samples.length;
  }

  /** Records your position at real time t, at most once per GRASS.sampleEvery seconds. */
  push(x: number, y: number, t: number): void {
    const last = this.samples[this.samples.length - 1];
    // A microsecond of slack: exact multiples of the interval drift below it in floating point.
    if (last !== undefined && t - last.t < GRASS.sampleEvery - 1e-6) return;
    this.samples.push({ x, y, t });
    let drop = 0;
    while (drop < this.samples.length && t - this.samples[drop].t > GRASS.trailAge) drop++;
    if (this.samples.length - drop > GRASS.maxSamples) drop = this.samples.length - GRASS.maxSamples;
    if (drop > 0) this.samples.splice(0, drop);
  }

  /**
   * Bend vector at world point (x, y) at real time t. Its magnitude is the sum of the pushes from each
   * recent sample, so a blade between two samples on your path is trampled rather than left standing;
   * its direction is that of the vector sum of the pushes, or south when they cancel.
   */
  bendAt(x: number, y: number, t: number): [number, number] {
    let bx = 0;
    let by = 0;
    let total = 0;
    for (const s of this.samples) {
      const age = t - s.t;
      if (age > GRASS.trailAge) continue;
      const dx = x - s.x;
      const dy = y - s.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= GRASS.bendRadius) continue;
      const w = (1 - d / GRASS.bendRadius) ** 2 * Math.exp(-age / GRASS.bendTime);
      total += w;
      if (d >= 0.001) {
        bx += (w * dx) / d;
        by += (w * dy) / d;
      }
    }
    const length = Math.sqrt(bx * bx + by * by);
    if (length < 1e-6) return [0, total];
    if (length < total) return [(bx * total) / length, (by * total) / length];
    return [bx, by];
  }

  /** The area where blades can be bent, [minX, minY, maxX, maxY] grown by the bend radius, or null with no samples. */
  bounds(t: number): [number, number, number, number] | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of this.samples) {
      if (t - s.t > GRASS.trailAge) continue;
      if (s.x < minX) minX = s.x;
      if (s.y < minY) minY = s.y;
      if (s.x > maxX) maxX = s.x;
      if (s.y > maxY) maxY = s.y;
    }
    if (minX === Infinity) return null;
    const r = GRASS.bendRadius;
    return [minX - r, minY - r, maxX + r, maxY + r];
  }
}

/** Horizontal lean from the wind at a cell with gust strength 0..1. Positive leans east. */
export function windLean(amb: Ambient, gust: number): number {
  return GRASS.windLean * amb.windX * amb.windStrength * (0.5 + 0.5 * gust);
}

/** Code point for a blade with lean (leanX east, leanY south); `variant` is the cell's 0..255 hash. Pure. */
export function bladeGlyph(leanX: number, leanY: number, variant: number): number {
  const m = Math.sqrt(leanX * leanX + leanY * leanY);
  if ((variant & 3) === 0) return m >= GRASS.flatThreshold ? BLADES.shortFlat : BLADES.short;
  if (m >= GRASS.flatThreshold) return BLADES.flat;
  // A per-blade threshold, so a gust crossing the field flips blades one by one.
  const t = GRASS.leanThreshold * (0.7 + (0.6 * variant) / 255);
  if (leanX > t) return BLADES.right;
  if (leanX < -t) return BLADES.left;
  return BLADES.upright;
}
