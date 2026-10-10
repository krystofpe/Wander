// A chunk of one layer being painted: roles and flags per pixel, and the biome blend per column. Painters
// write into it; the renderer uploads it into the layer's ring texture. Reused, never reallocated.

/** Flag bits stored beside each pixel's role. */
export const FLAG = {
  /** Low 3 bits: how far this pixel sways in the wind (0 = rooted, 7 = tip of a tall plant). */
  SWAY: 0x07,
  /** Reflective water surface. */
  WATER: 0x08,
  /** Lit from inside at night (an open door, a fire's glow on a wall), not a light source itself. */
  WARM: 0x10,
  /** A light source on this layer (window, lamp): feeds the local light map. */
  LIGHT: 0x20,
  /** Part of a solid silhouette that should catch a rim of light on its edge. */
  RIM: 0x40,
} as const;

export class Chunk {
  readonly w: number;
  readonly h: number;
  /** Interleaved role and flags, row-major, two bytes a pixel: ready for an RG8 upload. */
  readonly data: Uint8Array;
  /** Per column: biome A, biome B, blend (0..255) and a spare byte; ready for an RGBA8 upload. */
  readonly cols: Uint8Array;
  /** The layer column of this chunk's first column. */
  u0 = 0;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 2);
    this.cols = new Uint8Array(w * 4);
  }

  clear(u0: number): void {
    this.u0 = u0;
    this.data.fill(0);
    this.cols.fill(0);
  }

  /** Sets a pixel at layer column u and row y, if it is inside the chunk. */
  set(u: number, y: number, role: number, flags = 0): void {
    const x = u - this.u0;
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    const i = (y * this.w + x) * 2;
    this.data[i] = role;
    this.data[i + 1] = flags;
  }

  /** Sets a pixel only where nothing is yet (to paint behind what is there). */
  under(u: number, y: number, role: number, flags = 0): void {
    const x = u - this.u0;
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    const i = (y * this.w + x) * 2;
    if (this.data[i] !== 0) return;
    this.data[i] = role;
    this.data[i + 1] = flags;
  }

  role(u: number, y: number): number {
    const x = u - this.u0;
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 2];
  }

  /** A vertical run of one role from y0 to y1 inclusive. */
  column(u: number, y0: number, y1: number, role: number, flags = 0): void {
    const x = u - this.u0;
    if (x < 0 || x >= this.w) return;
    const a = Math.max(0, Math.min(y0, y1));
    const b = Math.min(this.h - 1, Math.max(y0, y1));
    for (let y = a; y <= b; y++) {
      const i = (y * this.w + x) * 2;
      this.data[i] = role;
      this.data[i + 1] = flags;
    }
  }

  setColumnBiome(u: number, a: number, b: number, k: number): void {
    const x = u - this.u0;
    if (x < 0 || x >= this.w) return;
    this.cols[x * 4] = a;
    this.cols[x * 4 + 1] = b;
    this.cols[x * 4 + 2] = Math.round(Math.min(1, Math.max(0, k)) * 255);
    this.cols[x * 4 + 3] = 255;
  }
}

/** A small painted thing (a tree, a rock), roles and flags, drawn once and stamped wherever it stands. */
export type Stamp = {
  readonly w: number;
  readonly h: number;
  /** Role per pixel (0 = clear), row-major. */
  readonly roles: Uint8Array;
  readonly flags: Uint8Array;
  /** Column of its root or centre, from its left edge. */
  readonly ax: number;
};

export function newStamp(w: number, h: number, ax: number): Stamp {
  return { w, h, roles: new Uint8Array(w * h), flags: new Uint8Array(w * h), ax };
}

export function put(s: Stamp, x: number, y: number, role: number, flags = 0): void {
  if (x < 0 || x >= s.w || y < 0 || y >= s.h) return;
  s.roles[y * s.w + x] = role;
  s.flags[y * s.w + x] = flags;
}

export function at(s: Stamp, x: number, y: number): number {
  if (x < 0 || x >= s.w || y < 0 || y >= s.h) return 0;
  return s.roles[y * s.w + x];
}

/** Stamps `s` into the chunk with its root at layer column u, bottom row at y (exclusive: the row below it). */
export function stamp(c: Chunk, s: Stamp, u: number, bottom: number, flip = false, behind = false): void {
  const left = u - s.ax;
  const top = bottom - s.h;
  const x0 = Math.max(0, c.u0 - left);
  const x1 = Math.min(s.w, c.u0 + c.w - left);
  for (let sx = x0; sx < x1; sx++) {
    const col = flip ? s.w - 1 - sx : sx;
    for (let sy = 0; sy < s.h; sy++) {
      const r = s.roles[sy * s.w + col];
      if (r === 0) continue;
      if (behind) c.under(left + sx, top + sy, r, s.flags[sy * s.w + col]);
      else c.set(left + sx, top + sy, r, s.flags[sy * s.w + col]);
    }
  }
}
