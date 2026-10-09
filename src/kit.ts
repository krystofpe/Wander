// Pixel art from shapes. Each shape is shaded by a light from the top left and outlined in the darkest
// shade of its own material; the colours come later, from a palette of materials, so one drawing can be
// painted for every season and biome.
import type { Canvas } from './art.ts';
import type { Ramp } from './color.ts';

/** The tones of a material, darkest first. */
export const OUTLINE = 0;
export const DARK = 1;
export const SHADOW = 2;
export const BASE = 3;
export const LIGHT = 4;
export const GLEAM = 5;

/**
 * A shape: rows of material keys with their top-left at (x, y); '.' is empty and '+' is a gleam on the
 * shape's first material. Shapes are drawn in order, each over the last, each with its own outline.
 */
export type Shape = {
  readonly rows: readonly string[];
  readonly x: number;
  readonly y: number;
  /** No outline round it. */
  readonly bare?: boolean;
  /** One tone all over (BASE unless given): for doors, windows, flames and the like. */
  readonly flat?: number;
  /** Darkens what lies just below it, a step, as its shadow. */
  readonly cast?: boolean;
  /** Changes a pixel's tone after shading: for bark, ripples, speckles. */
  readonly texture?: (x: number, y: number, tone: number) => number;
};

/** A shaded drawing: a material key and a tone per pixel, row by row. */
export type Drawing = { readonly w: number; readonly h: number; readonly mat: string[]; readonly tone: Uint8Array };

/** Rows of keys from a test of each pixel: `key` where `inside(x, y)`, '.' elsewhere. */
export function fill(w: number, h: number, key: string, inside: (x: number, y: number) => boolean): string[] {
  return Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (inside(x, y) ? key : '.')).join(''));
}

/** The tone a filled pixel takes from the light: lit along its top and left, darker to its bottom right. */
function shade(solid: (x: number, y: number) => boolean, x: number, y: number): number {
  const out = (dx: number, dy: number): boolean => !solid(x + dx, y + dy);
  if (out(0, 1) || (out(1, 0) && out(1, 1))) return DARK;
  if (out(1, 0) || out(1, 1) || out(0, 2) || out(1, 2) || out(2, 2)) return SHADOW;
  if (out(0, -1) || out(-1, 0) || out(-1, -1)) return LIGHT;
  return BASE;
}

/** Draws shapes onto a w by h grid of pixels. */
export function draw(w: number, h: number, shapes: readonly Shape[]): Drawing {
  const mat = Array.from({ length: h }, () => Array<string>(w).fill('.'));
  const tone = new Uint8Array(w * h);
  const set = (x: number, y: number, m: string, t: number): void => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    mat[y][x] = m;
    tone[y * w + x] = t;
  };
  for (const s of shapes) {
    const own = new Map<number, string>();
    let first = '';
    s.rows.forEach((row, r) =>
      Array.from(row).forEach((k, c) => {
        if (k === '.') return;
        own.set((s.y + r) * 4096 + s.x + c, k);
        if (first === '' && k !== '+') first = k;
      }),
    );
    const has = (x: number, y: number): boolean => own.has(y * 4096 + x);
    if (s.bare !== true) {
      for (const [key, k] of own) {
        const x = key % 4096;
        const y = Math.floor(key / 4096);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!has(x + dx, y + dy)) set(x + dx, y + dy, k === '+' ? first : k, OUTLINE);
      }
    }
    for (const [key, k] of own) {
      const x = key % 4096;
      const y = Math.floor(key / 4096);
      let t = k === '+' ? GLEAM : s.flat ?? shade(has, x, y);
      if (s.texture !== undefined && k !== '+') t = s.texture(x, y, t);
      set(x, y, k === '+' ? first : k, t);
      // Its shadow falls a pixel below its outline.
      if (s.cast === true && !has(x, y + 1) && y + 2 < h && mat[y + 2][x] !== '.') {
        const below = tone[(y + 2) * w + x];
        if (below > SHADOW && below < GLEAM) tone[(y + 2) * w + x] = below - 1;
      }
    }
  }
  return { w, h, mat: mat.map((r) => r.join('')), tone };
}

/** How a material is painted: a ramp of tones, and whether it glows in the dark. */
export type Material = { readonly ramp: Ramp; readonly glow?: boolean };

/** A painted sprite: w cells wide and h tall, two pixels to a cell; -1 is transparent. */
export type ColorSprite = { readonly w: number; readonly h: number; readonly rgb: Int32Array; readonly glow: Uint8Array };

const TONES = ['outline', 'dark', 'shadow', 'base', 'light', 'gleam'] as const;

/** Paints a drawing; materials missing from `mats` stay transparent. */
export function paint(d: Drawing, mats: Readonly<Record<string, Material>>): ColorSprite {
  const ph = d.h + (d.h % 2);
  const rgb = new Int32Array(d.w * ph).fill(-1);
  const glow = new Uint8Array(d.w * ph);
  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      const m = mats[d.mat[y][x]];
      if (m === undefined) continue;
      rgb[y * d.w + x] = m.ramp[TONES[d.tone[y * d.w + x]]];
      glow[y * d.w + x] = m.glow === true ? 1 : 0;
    }
  }
  return { w: d.w, h: ph / 2, rgb, glow };
}

/** Draws a painted sprite with its top-left cell at (col, row). */
export function drawColors(canvas: Canvas, s: ColorSprite, col: number, row: number): void {
  drawColorsAt(canvas, s, col, row * 2);
}

/** Draws a painted sprite with its top-left at column `col` and pixel row `y`: it can sit half a cell down. */
export function drawColorsAt(canvas: Canvas, s: ColorSprite, col: number, y: number, mirror = false): void {
  const ph = s.h * 2;
  for (let row = y >> 1; row <= (y + ph - 1) >> 1; row++) {
    if (row < 0 || row >= canvas.height) continue;
    const a = 2 * row - y;
    const b = a + 1;
    for (let c = 0; c < s.w; c++) {
      const x = col + c;
      if (x < 0 || x >= canvas.width) continue;
      const sc = mirror ? s.w - 1 - c : c;
      const i = a >= 0 && a < ph ? a * s.w + sc : -1;
      const j = b >= 0 && b < ph ? b * s.w + sc : -1;
      const top = i < 0 ? -1 : s.rgb[i];
      const bottom = j < 0 ? -1 : s.rgb[j];
      if (top < 0 && bottom < 0) continue;
      canvas.halves(x, row, top < 0 ? null : top, bottom < 0 ? null : bottom, i >= 0 && s.glow[i] === 1, j >= 0 && s.glow[j] === 1);
    }
  }
}

/** A 4 by 4 ordered dither: a threshold 0 ≤ t < 1 for each pixel, so blends can fall into a pattern of pixels. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const dither = (x: number, y: number): number => BAYER[((y & 3) << 2) | (x & 3)] / 16;

/** A ramp of one colour everywhere but its outline: for things with no shading of their own. */
export function flat(color: number, outline: number): Ramp {
  return { outline, dark: color, shadow: color, base: color, light: color, gleam: color };
}
