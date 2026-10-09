// The creature in pixels, drawn by hand in art/creature.aseprite: a frame per pose, facing right, and a
// version of the standing and walking frames with the lantern held out; eyes for its mood go in after.
import type { Pose } from './art.ts';
import { INK, bounds, frames, mirrored, pixels } from './sprites.ts';
import type { Pixels } from './sprites.ts';

/** The figure's size in pixels; in cells it is FIGURE_W wide and FIGURE_ROWS tall. */
export const FIGURE_W = 18;
export const FIGURE_H = 20;
export const FIGURE_ROWS = FIGURE_H / 2;
/** Rows from the top of the figure down to its eyes, standing. */
export const FACE_ROW = 4;

/** A frame: its pixels, where its face is, and where the lantern hangs (in pixels, from its top-left). */
export type FigureFrame = {
  readonly pixels: Pixels;
  readonly face: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null;
  readonly lamp: { readonly x: number; readonly y: number } | null;
};

/** Frames that can carry the lantern; the others set it down. */
const CARRY: ReadonlySet<string> = new Set(['stand', 'breathe', 'walk1', 'walk2', 'walk3']);

function frameOf(p: Pixels): FigureFrame {
  // The face is wherever the dark of the hood's opening is; an arm across it leaves the rest.
  const face = bounds(p, INK.face);
  const flame = bounds(p, INK.flame);
  return { pixels: p, face, lamp: flame === null ? null : { x: flame.x, y: flame.y } };
}

const cache = new Map<string, FigureFrame>();

/** A frame by name, facing right (1) or left (-1), with or without the lantern (from art/creature.aseprite). */
export function figure(name: string, facing: number, lantern: boolean): FigureFrame {
  const id = `${name}${facing < 0 ? '<' : '>'}${lantern ? '*' : ''}`;
  let f = cache.get(id);
  if (f === undefined) {
    const known = frames('creature').includes(name) ? name : 'stand';
    const p = pixels('creature', lantern && CARRY.has(known) ? `lamp-${known}` : known);
    f = frameOf(facing < 0 ? mirrored(p) : p);
    cache.set(id, f);
  }
  return f;
}

/** The lantern on its own, set down on the ground: 5 cells wide and 4 tall. */
export const LANTERN_ON_GROUND: FigureFrame = frameOf(pixels('lantern', 'lantern'));

/** Poses that carry the lantern; in the others it is set down beside it. */
export const LANTERN_POSES: ReadonlySet<Pose> = new Set(['stand', 'walk']);

/**
 * The frame name for a pose at time `t` (seconds). `stride` counts the steps it has walked, so its feet
 * keep pace with the ground instead of sliding.
 */
export function frameName(pose: Pose, t: number, stride: number): string {
  switch (pose) {
    case 'walk':
      return ['walk1', 'walk2', 'walk3', 'walk2'][((Math.floor(stride) % 4) + 4) % 4];
    case 'wave':
      return Math.floor(t * 3) % 2 === 0 ? 'wave1' : 'wave2';
    case 'dig':
      return Math.floor(t * 5) % 2 === 0 ? 'dig1' : 'dig2';
    case 'eat':
      return Math.floor(t * 3) % 2 === 0 ? 'eat1' : 'eat2';
    case 'sit':
      return 'sit';
    case 'sleep':
      return 'sleep';
    case 'jump':
      return 'jump';
    default:
      // Slow breathing: the hood and robe sink a pixel and rise again.
      return t % 3 < 1.6 ? 'stand' : 'breathe';
  }
}

// ── Eyes ───────────────────────────────────────────────────────────────────
// Each eye fits in three pixels square (art/eyes.aseprite), drawn from the glyph that stands for it in the
// game; the colours are its mood's, a white glint and a tear.

const EYE_SHAPES: Readonly<Record<string, string>> = {
  '•': 'open',
  '°': 'open',
  '.': 'small',
  o: 'ring',
  '-': 'shut',
  '‿': 'smile',
  '^': 'arch',
  '>': 'right',
  '<': 'left',
  '♥': 'heart',
  '╥': 'cry',
};

/** Whether the eyes are shut, so a blink would change nothing. */
export const closed = (eyes: string): boolean => /[-‿╥^]/.test(eyes);

/**
 * The frame's pixels with eyes drawn into its face. `eyes` is the game's three face cells: two eye glyphs
 * with a space between, or two side by side to look left (`•• `) or right (` ••`).
 */
export function withEyes(f: FigureFrame, eyes: string): Pixels {
  const face = f.face;
  if (face === null) return f.pixels;
  const cells = Array.from(eyes.padEnd(3, ' '));
  let dx = 0;
  let left = cells[0];
  let right = cells[2];
  if (cells[1] !== ' ') {
    dx = cells[0] === ' ' ? 1 : -1;
    left = cells[1];
    right = cells[1];
  }
  const dy = left === '°' ? -1 : left === '.' ? 1 : 0;
  const { w } = f.pixels;
  const px = Uint8Array.from(f.pixels.px);
  const put = (glyph: string, x0: number): void => {
    const shape = EYE_SHAPES[glyph];
    if (shape === undefined) return;
    const eye = pixels('eyes', shape);
    for (let r = 0; r < eye.h; r++) {
      for (let c = 0; c < eye.w; c++) {
        const k = eye.px[r * eye.w + c];
        const x = x0 + c;
        const y = face.y + 1 + dy + r;
        if (k !== 0 && x >= 0 && x < w && y >= 0 && y < f.pixels.h && px[y * w + x] === INK.face) px[y * w + x] = k;
      }
    }
  };
  put(left, face.x + 1 + dx);
  put(right, face.x + face.w - 4 + dx);
  return { ...f.pixels, px };
}
