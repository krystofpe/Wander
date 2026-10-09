// Seeded noise and hashing. Everything here is a pure function of its inputs.

export type Noise2D = (x: number, y: number) => number;

/** Small, fast seeded PRNG (mulberry32). Returns numbers in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of an integer cell position and a seed. */
export function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float64Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);

/** 2D simplex noise (after Stefan Gustavson) with a seeded permutation; values in [-1, 1]. */
export function makeNoise(seed: number): Noise2D {
  const random = rng(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  return (x: number, y: number): number => {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = (perm[ii + perm[jj]] & 7) << 1;
      t0 *= t0;
      n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = (perm[ii + i1 + perm[jj + j1]] & 7) << 1;
      t1 *= t1;
      n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = (perm[ii + 1 + perm[jj + 1]] & 7) << 1;
      t2 *= t2;
      n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2);
    }
    const v = 70 * n;
    return v > 1 ? 1 : v < -1 ? -1 : v;
  };
}

/** Fractal sum of `octaves` noise layers, each at twice the frequency and half the weight; values in [-1, 1]. */
export function fbm(noise: Noise2D, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    // Offsetting each octave keeps them from lining up at the origin.
    sum += amplitude * noise(x * frequency + o * 17.3, y * frequency - o * 9.1);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

/** Squirrel Eiserloh's SquirrelNoise5: a counter-based hash of an integer position and a seed (uint32). */
export function squirrel(position: number, seed: number): number {
  let m = Math.imul(position | 0, 0xd2a80a3f);
  m = (m + (seed | 0)) | 0;
  m ^= m >>> 9;
  m = (m + 0xa884f197) | 0;
  m ^= m >>> 11;
  m = Math.imul(m, 0x6c736f4b);
  m ^= m >>> 13;
  m = (m + 0xb79f3abb) | 0;
  m ^= m >>> 15;
  m = Math.imul(m, 0x1b56c4f5);
  m ^= m >>> 17;
  return m >>> 0;
}

/** A hash of an integer position and a seed in [0, 1). Positions past 2^31 wrap, which stays deterministic. */
export function unit(position: number, seed: number): number {
  // Floor first so that negative and huge positions hash the same way everywhere.
  const p = Math.floor(position);
  const lo = p % 4294967296;
  const hi = Math.floor(p / 4294967296);
  return squirrel(lo, squirrel(hi, seed)) / 4294967296;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * 1D gradient noise on an unbounded integer lattice (no permutation table, so it never repeats), in about
 * [-1, 1]. Built only from + − × and floor, so it gives the same bits in every engine.
 */
export function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const g0 = unit(i, seed) * 2 - 1;
  const g1 = unit(i + 1, seed) * 2 - 1;
  const a = g0 * f;
  const b = g1 * (f - 1);
  return 2 * (a + (b - a) * fade(f));
}

/** Fractal 1D noise: `octaves` layers, each at twice the frequency and `gain` times the weight. About [-1, 1]. */
export function fbm1(x: number, seed: number, octaves: number, gain = 0.5): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise1(x * freq + o * 31.7, seed + o * 1013);
    total += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / total;
}
