// The creature in pixels: parts layered into poses and drawn with the kit (each outlined, shaded from the
// top left of the screen), then eyes for its mood and a lantern for the night.
import type { Pose } from './art.ts';
import { BASE, draw } from './kit.ts';
import type { Drawing, Shape } from './kit.ts';

/** The figure's size in pixels; in cells it is FIGURE_W wide and FIGURE_ROWS tall. */
export const FIGURE_W = 18;
export const FIGURE_H = 20;
export const FIGURE_ROWS = FIGURE_H / 2;
/** Rows from the top of the figure down to its eyes, standing. */
export const FACE_ROW = 4;

/**
 * Parts are rows of material keys: `c` its cloak, `b` its boots, `k` its mittens, `q` a brass clasp, `p` a
 * worn spot, `F` the darkness of its face, `+` a gleam, `m`/`y`/`Y` the lantern's metal, glass and flame.
 */
type Part = { readonly rows: readonly string[]; readonly x: number; readonly y: number; readonly hood?: boolean };

const at = (rows: readonly string[], x: number, y: number): Part => ({ rows, x, y, hood: rows === HOOD });

// ── Parts, facing right ────────────────────────────────────────────────────

const HOOD = [
  '...cc........',
  '...ccc.......',
  '....ccccc....',
  '..ccccccccc..',
  '.c+ccccccccc.',
  'c+ccccccccccc',
  'ccFFFFFFFFFcc',
  'cFFFFFFFFFFFc',
  'cFFFFFFFFFFFc',
  'ccFFFFFFFFFcc',
  '.cccFFFFFccc.',
  '..ccccccccc..',
];

const ROBE = [
  '...cccccccc...',
  '..cccccccccc..',
  '.cccccccccccc.',
  'cccccccccccccc',
  'cccccqcccccccc',
  'ccpccccccccccc',
  '.cccccccccccc.',
  '..cccccccccc..',
];

const ROBE_SIT = ['..cccccccccc..', '.cccccccccccc.', 'cccccccccccccc', 'cccccccccccccc', '.cccccccccccc.', '..cccccccccc..'];

const ARM_DOWN = ['.c.', 'ccc', 'ccc', 'ccc', '.k.'];
const ARM_UP = ['.k.', 'ccc', 'ccc', 'ccc', '.c.'];
/** An arm held out sideways, its hand at the end; mirrored for the left. */
const ARM_OUT = ['ccck', 'ccc.'];
const ARM_OUT_L = ARM_OUT.map((r) => Array.from(r).reverse().join(''));
/** Waving: the arm out at the shoulder, the hand lifted at its end, then tipped in. */
const WAVE_OUT = ['...k', '...c', 'cccc'];
const WAVE_IN = ['..k.', '..c.', 'ccc.'];
const FOOT = ['.bb.', 'bbbb', '.bb.'];
const LANTERN = ['.m.', 'mmm', 'mYm', 'mym', 'mmm'];

/** The parts of each frame, back to front, facing right. */
const FRAMES: Readonly<Record<string, readonly Part[]>> = {
  stand: [at(FOOT, 4, 16), at(FOOT, 10, 16), at(ARM_DOWN, 1, 11), at(ROBE, 2, 9), at(HOOD, 3, 1), at(ARM_DOWN, 14, 11)],
  breathe: [at(FOOT, 4, 16), at(FOOT, 10, 16), at(ARM_DOWN, 1, 12), at(ROBE, 2, 10), at(HOOD, 3, 2), at(ARM_DOWN, 14, 12)],
  // Feet apart, it sinks a pixel; passing, it rises. The arms swing against the feet.
  walk1: [at(FOOT, 3, 16), at(FOOT, 11, 16), at(ARM_DOWN, 1, 11), at(ROBE, 2, 10), at(HOOD, 3, 2), at(ARM_DOWN, 14, 13)],
  walk2: [at(FOOT, 6, 15), at(FOOT, 8, 16), at(ARM_DOWN, 1, 11), at(ROBE, 2, 9), at(HOOD, 3, 1), at(ARM_DOWN, 14, 11)],
  walk3: [at(FOOT, 11, 16), at(FOOT, 3, 16), at(ARM_DOWN, 1, 13), at(ROBE, 2, 10), at(HOOD, 3, 2), at(ARM_DOWN, 14, 11)],
  sit: [at(FOOT, 11, 16), at(ARM_DOWN, 1, 14), at(ROBE_SIT, 2, 13), at(HOOD, 3, 4), at(ARM_DOWN, 14, 14)],
  sleep: [at(ROBE_SIT, 2, 13), at(HOOD, 3, 6)],
  // Arms flung out at the shoulders, below its face.
  jump: [at(FOOT, 6, 15), at(FOOT, 8, 15), at(ROBE, 2, 9), at(HOOD, 3, 2), at(ARM_OUT_L, 1, 12), at(ARM_OUT, 13, 12)],
  wave1: [at(FOOT, 4, 16), at(FOOT, 10, 16), at(ARM_DOWN, 1, 11), at(ROBE, 2, 9), at(HOOD, 3, 1), at(WAVE_OUT, 13, 10)],
  wave2: [at(FOOT, 4, 16), at(FOOT, 10, 16), at(ARM_DOWN, 1, 11), at(ROBE, 2, 9), at(HOOD, 3, 1), at(WAVE_IN, 13, 10)],
  dig1: [at(FOOT, 11, 16), at(ARM_DOWN, 1, 14), at(ROBE_SIT, 2, 13), at(HOOD, 3, 4), at(ARM_DOWN, 14, 14)],
  dig2: [at(FOOT, 11, 16), at(ARM_DOWN, 1, 14), at(ROBE_SIT, 2, 13), at(HOOD, 3, 4), at(ARM_UP, 13, 12)],
  // Its hand comes up to the bottom of its face.
  eat1: [at(FOOT, 11, 16), at(ARM_DOWN, 1, 14), at(ROBE_SIT, 2, 13), at(HOOD, 3, 4), at(ARM_UP, 12, 12)],
  eat2: [at(FOOT, 11, 16), at(ARM_DOWN, 1, 14), at(ROBE_SIT, 2, 13), at(HOOD, 3, 5), at(ARM_UP, 12, 13)],
};

/** Frames that can carry the lantern; the others set it down. */
const CARRY: ReadonlySet<string> = new Set(['stand', 'breathe', 'walk1', 'walk2', 'walk3']);

/** Night versions: the front arm held out with the lantern hanging from it. */
const HOLD = at(ARM_OUT, 12, 12);
const LAMP = at(LANTERN, 13, 14);

// ── Composing ──────────────────────────────────────────────────────────────

/** A composed frame: its drawing, where its face is, and where the lantern hangs (in pixels, on screen). */
export type FigureFrame = {
  readonly drawing: Drawing;
  readonly face: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null;
  readonly lamp: { readonly x: number; readonly y: number } | null;
};

const mirror = (p: Part, w: number): Part => ({ ...p, x: w - p.x - Math.max(...p.rows.map((r) => r.length)), rows: p.rows.map((r) => Array.from(r).reverse().join('')) });

/** The flat materials: its face, the clasp, its mittens and the lantern's glass and flame have no shading. */
const FLAT = /[FqkyY]/;

function compose(parts: readonly Part[], w = FIGURE_W, h = FIGURE_H): FigureFrame {
  const shapes: Shape[] = parts.map((p) => ({
    rows: p.rows,
    x: p.x,
    y: p.y,
    // The hood darkens the robe under it; flat materials keep one tone.
    cast: p.hood === true,
    texture: (x, y, t) => (FLAT.test(rowsAt(p, x, y)) ? BASE : t),
  }));
  const drawing = draw(w, h, shapes);
  // The face is where the hood's opening is, even where an arm passes in front of it, so the eyes keep still.
  const hood = parts.find((p) => p.hood === true);
  const face = hood === undefined ? null : { x: hood.x + 1, y: hood.y + 6, w: 11, h: 5 };
  let lamp: FigureFrame['lamp'] = null;
  for (let y = 0; y < h && lamp === null; y++) {
    const x = drawing.mat[y].indexOf('Y');
    if (x >= 0) lamp = { x, y };
  }
  return { drawing, face, lamp };
}

/** The key of a part at a screen pixel. */
function rowsAt(p: Part, x: number, y: number): string {
  return p.rows[y - p.y]?.[x - p.x] ?? '.';
}

const cache = new Map<string, FigureFrame>();

/** A frame by name, facing right (1) or left (-1), with or without the lantern. */
export function figure(name: string, facing: number, lantern: boolean): FigureFrame {
  const id = `${name}${facing < 0 ? '<' : '>'}${lantern ? '*' : ''}`;
  let f = cache.get(id);
  if (f === undefined) {
    let parts = FRAMES[name] ?? FRAMES.stand;
    // The lantern replaces the front arm, the last part of the frames that can carry it.
    if (lantern && CARRY.has(name)) parts = [...parts.slice(0, -1), HOLD, LAMP];
    f = compose(facing < 0 ? parts.map((p) => mirror(p, FIGURE_W)) : parts);
    cache.set(id, f);
  }
  return f;
}

/** The lantern on its own, set down on the ground: 5 cells wide and 4 tall. */
export const LANTERN_ON_GROUND: FigureFrame = compose([at(LANTERN, 1, 1)], 5, 8);

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
// Each eye fits in three pixels square (open, a tall oval), drawn from the glyph that stands for it in the
// game: `e` glows in the mood's colour, `g` is a white glint, `t` a tear.

const EYE_SHAPES: Readonly<Record<string, readonly string[]>> = {
  '•': ['.ge', '.ee', '.ee'],
  '°': ['.ge', '.ee', '.ee'],
  '.': ['...', '.ge', '.ee'],
  o: ['eee', 'e.e', 'eee'],
  '-': ['...', 'eee', '...'],
  '‿': ['...', 'e.e', '.e.'],
  '^': ['.e.', 'e.e', '...'],
  '>': ['e..', '.e.', 'e..'],
  '<': ['..e', '.e.', '..e'],
  '♥': ['e.e', 'eee', '.e.'],
  '╥': ['eee', '.t.', '.t.'],
};

/** Whether the eyes are shut, so a blink would change nothing. */
export const closed = (eyes: string): boolean => /[-‿╥^]/.test(eyes);

/**
 * The frame's drawing with eyes drawn into its face. `eyes` is the game's three face cells: two eye glyphs
 * with a space between, or two side by side to look left (`•• `) or right (` ••`).
 */
export function withEyes(f: FigureFrame, eyes: string): Drawing {
  const face = f.face;
  if (face === null) return f.drawing;
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
  const mat = f.drawing.mat.map((r) => Array.from(r));
  const tone = Uint8Array.from(f.drawing.tone);
  const put = (shape: readonly string[] | undefined, x0: number): void => {
    shape?.forEach((row, r) => {
      Array.from(row).forEach((k, c) => {
        const x = x0 + c;
        const y = face.y + 1 + dy + r;
        if (k !== '.' && mat[y]?.[x] === 'F') {
          mat[y][x] = k;
          tone[y * f.drawing.w + x] = BASE;
        }
      });
    });
  };
  put(EYE_SHAPES[left], face.x + 1 + dx);
  put(EYE_SHAPES[right], face.x + face.w - 4 + dx);
  return { ...f.drawing, mat: mat.map((r) => r.join('')), tone };
}
