// Sprites drawn by hand in Aseprite. The sources are art/*.aseprite, all in the one palette of
// art/palette.gpl; `npm run art` exports them to sprites.json, which is all the game reads.
// A sprite is a grid of palette indices. Most indices are plain colours; some are roles the game paints
// as it draws (a creature's cloak, the mood in its eyes, embers that glow only at night).
import { readFileSync } from 'node:fs';
import type { ColorSprite } from './kit.ts';
import { ramp } from './color.ts';

type SheetData = {
  readonly w: number;
  readonly h: number;
  readonly order: readonly string[];
  readonly slices: Readonly<Record<string, readonly [number, number, number, number]>>;
  readonly frames: Readonly<Record<string, readonly string[]>>;
};
type Data = { readonly palette: readonly string[]; readonly names: readonly string[]; readonly sprites: Readonly<Record<string, SheetData>> };

const DATA = JSON.parse(readFileSync(new URL('./sprites.json', import.meta.url), 'utf8')) as Data;

/** One character per palette index, as tools/export-art.lua writes them. */
const ALPHABET = '.123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ#$%&*+-/:;<=>?@^_~';
const CODE = new Map(Array.from(ALPHABET, (ch, i) => [ch, i]));

/** The palette's colours, by index, and their names (as in art/palette.gpl). */
export const PALETTE: readonly number[] = DATA.palette.map((h) => parseInt(h.slice(1), 16));
export const NAMES: readonly string[] = DATA.names;

/** Palette indices by name (as named in art/palette.gpl). */
export const INK = {
  night: 1,
  deep: 2,
  dark: 3,
  teal0: 4,
  teal1: 5,
  teal2: 6,
  teal3: 7,
  teal4: 8,
  glow: 9,
  spore: 10,
  grey0: 11,
  grey1: 12,
  violet0: 13,
  violet1: 14,
  violet2: 15,
  violet3: 16,
  /** The dark inside a hollow or a doorway. */
  hollow: 23,
  ember: 24,
  emberHot: 25,
  /** The cloak's six tones, outline first: cloak + 0 … cloak + 5. */
  cloak: 26,
  /** The boots' five tones, outline first. */
  boot: 32,
  clasp: 37,
  face: 38,
  /** The lantern's metal: outline, dark, base, light. */
  metal: 39,
  glass: 43,
  flame: 44,
  eye: 45,
  glint: 46,
  tear: 47,
  /** A thing's own colour, given as it is drawn: base, light, dark. */
  tint: 48,
  tintLight: 49,
  tintDark: 50,
  pale: 51,
  stone2: 53,
  stone3: 54,
  stone4: 55,
  violet4: 56,
  /** The first of four colour-cycling indices: cycle + 0 … cycle + 3. */
  cycle: 58,
} as const;

/** Indices that glow unless painted otherwise: the night does not darken them. Most are named "glow …". */
export const GLOWING: ReadonlySet<number> = new Set([
  ...NAMES.flatMap((name, i) => (name.startsWith('glow ') ? [i] : [])),
  INK.face,
  INK.glass,
  INK.flame,
  INK.eye,
  INK.glint,
  INK.tear,
]);

// ── Colour cycling ─────────────────────────────────────────────────────────
// As Mark Ferrari did it: four palette indices take four colours in turn, each a step behind the one
// before, so pixels painted with them twinkle or shimmer without anything moving. Paint a run of them in
// order and light runs along it; scatter them and they glint out of step.

/** The colours the cycle steps through: a glint swelling to pale cyan and fading back. */
const CYCLE_COLORS: readonly number[] = [0x2698a5, 0x36bfcf, 0x8af0f4, 0x36bfcf];

/** The cycle's step at `t` seconds: it moves on a step every `period` seconds. */
export const cycleStep = (t: number, period = 0.9): number => Math.floor(t / period) % CYCLE_COLORS.length;

/** Inks for the cycling indices at a step of the cycle (they glow). */
export function cycleInks(step: number): Inks {
  const n = CYCLE_COLORS.length;
  return Object.fromEntries(CYCLE_COLORS.map((_, k) => [INK.cycle + k, { rgb: CYCLE_COLORS[(k + step) % n], glow: true }]));
}

/** Whether a frame has any cycling pixels in it, so whether it changes with the cycle. */
export function cycles(p: Pixels): boolean {
  return p.px.some((k) => k >= INK.cycle && k < INK.cycle + CYCLE_COLORS.length);
}

/** A frame as palette indices, row by row; 0 is transparent. */
export type Pixels = { readonly w: number; readonly h: number; readonly px: Uint8Array };

const decoded = new Map<string, Pixels>();

/** A frame of a sheet by name. */
export function pixels(sheet: string, frame: string): Pixels {
  const id = `${sheet}/${frame}`;
  let p = decoded.get(id);
  if (p === undefined) {
    const s = DATA.sprites[sheet];
    const rows = s?.frames[frame];
    if (s === undefined || rows === undefined) throw new Error(`no sprite ${id}`);
    const px = new Uint8Array(s.w * s.h);
    rows.forEach((row, y) => {
      for (let x = 0; x < s.w; x++) px[y * s.w + x] = CODE.get(row[x]) ?? 0;
    });
    p = { w: s.w, h: s.h, px };
    decoded.set(id, p);
  }
  return p;
}

/** The names of a sheet's frames, in order. */
export function frames(sheet: string): readonly string[] {
  return DATA.sprites[sheet]?.order ?? [];
}

/** A named rectangle drawn on a sheet (an Aseprite slice): an anchor such as a doorway. */
export function slice(sheet: string, name: string): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | undefined {
  const b = DATA.sprites[sheet]?.slices[name];
  return b === undefined ? undefined : { x: b[0], y: b[1], w: b[2], h: b[3] };
}

/** A frame turned to face the other way. */
export function mirrored(p: Pixels): Pixels {
  const px = new Uint8Array(p.px.length);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) px[y * p.w + x] = p.px[y * p.w + p.w - 1 - x];
  return { w: p.w, h: p.h, px };
}

/** The box round every pixel of an index, or null if there is none. */
export function bounds(p: Pixels, index: number): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.px[y * p.w + x] !== index) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** How far a frame's drawing reaches from its top-left: pieces of different sizes share a sheet's canvas. */
export function extent(p: Pixels): { readonly w: number; readonly h: number } {
  let w = 0;
  let h = 0;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.px[y * p.w + x] === 0) continue;
      w = Math.max(w, x + 1);
      h = Math.max(h, y + 1);
    }
  }
  return { w, h };
}

/**
 * A frame cut down to what is drawn in it, its foot on its bottom row; a transparent row goes on top if
 * need be to make it a whole number of cells tall, so it still stands on the ground.
 */
export function grounded(p: Pixels): Pixels {
  const b = { x0: p.w, y0: p.h, x1: -1, y1: -1 };
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.px[y * p.w + x] === 0) continue;
      b.x0 = Math.min(b.x0, x);
      b.y0 = Math.min(b.y0, y);
      b.x1 = Math.max(b.x1, x);
      b.y1 = Math.max(b.y1, y);
    }
  }
  if (b.x1 < 0) return { w: 0, h: 0, px: new Uint8Array(0) };
  const w = b.x1 - b.x0 + 1;
  const drawn = b.y1 - b.y0 + 1;
  const h = drawn + (drawn % 2);
  const px = new Uint8Array(w * h);
  for (let y = 0; y < drawn; y++) for (let x = 0; x < w; x++) px[(y + h - drawn) * w + x] = p.px[(b.y0 + y) * p.w + b.x0 + x];
  return { w, h, px };
}

/**
 * A frame with snow lying on it: every pixel open to the sky above turns to snow, and the one under it too
 * where the surface is broad. What glows (and the dark of a hollow) stays clear.
 */
export function snowCapped(p: Pixels): Pixels {
  const px = Uint8Array.from(p.px);
  const at = (x: number, y: number): number => (x < 0 || y < 0 || x >= p.w || y >= p.h ? 0 : p.px[y * p.w + x]);
  const clear = (k: number): boolean => k === 0 || GLOWING.has(k) || k === INK.hollow || k === INK.ember || k === INK.emberHot;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const k = at(x, y);
      if (clear(k) || at(x, y - 1) !== 0) continue;
      px[y * p.w + x] = INK.stone4;
      const broad = at(x - 1, y) !== 0 && at(x + 1, y) !== 0;
      if (broad && y + 1 < p.h && !clear(at(x, y + 1))) px[(y + 1) * p.w + x] = INK.stone3;
    }
  }
  return { w: p.w, h: p.h, px };
}

/**
 * The forest's colours from dark to light, in families: a thing further off takes the next lighter in its
 * family (the haze), a nearer one the next darker. Glowing colours keep their own.
 */
const FAMILIES: readonly (readonly number[])[] = [
  [INK.night, INK.deep, INK.dark, INK.teal0, INK.teal1, INK.teal2, INK.teal3, INK.teal4],
  [INK.violet0, INK.violet1, INK.violet2, INK.violet3, INK.violet4],
  [INK.grey0, INK.grey1, INK.stone2, INK.stone3, INK.stone4],
];
/** Each colour's family and its place in it. */
const PLACE = new Map<number, { readonly family: readonly number[]; readonly at: number }>();
for (const family of FAMILIES) family.forEach((k, at) => PLACE.set(k, { family, at }));

/** A frame seen nearer (`step` < 0, darker) or further off (`step` > 0, paler, into the haze), by steps of its colours. */
export function aerial(p: Pixels, step: number): Pixels {
  if (step === 0) return p;
  const px = Uint8Array.from(p.px);
  for (let i = 0; i < px.length; i++) {
    const place = PLACE.get(px[i]);
    if (place !== undefined) px[i] = place.family[Math.max(0, Math.min(place.family.length - 1, place.at + step))];
  }
  return { w: p.w, h: p.h, px };
}

/** Colours for some indices in place of the palette's, and whether they glow. */
export type Inks = Readonly<Record<number, { readonly rgb: number; readonly glow?: boolean }>>;

/** Paints a frame: each index in its ink if it has one, else in the palette's colour. */
export function paintPixels(p: Pixels, inks: Inks = {}): ColorSprite {
  const ph = p.h + (p.h % 2);
  const rgb = new Int32Array(p.w * ph).fill(-1);
  const glow = new Uint8Array(p.w * ph);
  for (let i = 0; i < p.px.length; i++) {
    const k = p.px[i];
    if (k === 0) continue;
    const ink = inks[k];
    rgb[i] = ink?.rgb ?? PALETTE[k];
    glow[i] = (ink?.glow ?? GLOWING.has(k)) ? 1 : 0;
  }
  return { w: p.w, h: ph / 2, rgb, glow };
}

const painted = new Map<string, ColorSprite>();

/**
 * A frame painted, cached under `key` (which must change whenever the inks do). Facing left (`mirror`),
 * it is turned round.
 */
export function art(sheet: string, frame: string, inks: Inks = {}, key = '', mirror = false, trim = false): ColorSprite {
  const id = `${sheet}/${frame}/${key}/${mirror}/${trim}`;
  let s = painted.get(id);
  if (s === undefined) {
    const p = trim ? grounded(pixels(sheet, frame)) : pixels(sheet, frame);
    s = paintPixels(mirror ? mirrored(p) : p, inks);
    if (painted.size > 600) painted.clear();
    painted.set(id, s);
  }
  return s;
}

/** A frame painted in a colour given as it is drawn: its tint, the tint's light and its dark. */
export function tinted(sheet: string, frame: string, color: number, glow = false, mirror = false, trim = false, light?: number): ColorSprite {
  const r = ramp(color);
  const inks: Inks = { [INK.tint]: { rgb: r.base, glow }, [INK.tintLight]: { rgb: light ?? r.light, glow }, [INK.tintDark]: { rgb: r.dark, glow } };
  return art(sheet, frame, inks, `${color}:${glow}:${light}`, mirror, trim);
}
