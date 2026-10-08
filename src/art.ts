// ASCII sprites (the creature, props, homes, critters) and how they are drawn onto a canvas.
import type { BiomeName, CritterKind, PropKind } from './config.ts';

/**
 * How a sprite cell is painted: a foreground for its glyph, a background to fill, and whether it glows.
 * With `tint`, the background is only blended that far (0..1) over what is already there.
 */
export type Paint = { readonly fg?: number; readonly bg?: number; readonly glow?: boolean; readonly tint?: number };
export type Palette = Readonly<Record<string, Paint>>;

/**
 * A sprite: rows of glyphs and a mask of palette keys. A cell is transparent when its glyph and mask
 * are both spaces. A space glyph with a mask key fills the cell with that key's background.
 */
export type Sprite = {
  readonly w: number;
  readonly h: number;
  readonly glyphs: readonly (readonly number[])[];
  readonly keys: readonly (readonly string[])[];
};

/** Where sprites are drawn: the renderer implements it. `fg`/`bg` of null keep what is there. */
export type Canvas = {
  readonly width: number;
  readonly height: number;
  put(col: number, row: number, glyph: number, fg: number | null, bg: number | null, glow: boolean, tint?: number): void;
};

const SPACE = 32;
/** Glyph placeholder for the creature's eyes, filled at draw time. */
const EYE = 'E'.codePointAt(0) ?? 69;

/** Builds a sprite. Cells with a glyph but a blank mask use `fallback` as their key. */
export function sprite(rows: readonly string[], mask: readonly string[] = [], fallback = 'a'): Sprite {
  const w = Math.max(...rows.map((r) => Array.from(r).length));
  const glyphs: number[][] = [];
  const keys: string[][] = [];
  rows.forEach((row, r) => {
    const g = Array.from(row.padEnd(w, ' '), (ch) => ch.codePointAt(0) ?? SPACE);
    const m = Array.from((mask[r] ?? '').padEnd(w, ' '));
    glyphs.push(g);
    keys.push(m.map((k, c) => (k !== ' ' ? k : g[c] !== SPACE ? fallback : ' ')));
  });
  return { w, h: rows.length, glyphs, keys };
}

const MIRROR: Readonly<Record<string, string>> = {
  '/': '\\', '\\': '/', '(': ')', ')': '(', '<': '>', '>': '<', '[': ']', ']': '[', '{': '}', '}': '{',
  '╭': '╮', '╮': '╭', '╰': '╯', '╯': '╰', '◐': '◑', '◑': '◐', '▌': '▐', '▐': '▌', '`': "'", "'": '`',
  '┌': '┐', '┐': '┌', '└': '┘', '┘': '└', 'd': 'b', 'b': 'd', '⌐': '¬', '¬': '⌐',
};
const MIRROR_CODES = new Map<number, number>(
  Object.entries(MIRROR).map(([a, b]) => [a.codePointAt(0) ?? 0, b.codePointAt(0) ?? 0]),
);

export type DrawOptions = {
  /** Mirror left to right. */
  readonly flip?: boolean;
  /** Characters for the `E` cells, left to right on screen. */
  readonly eyes?: string;
  /** Paint for the eyes. */
  readonly eyePaint?: Paint;
  /** Replaces glyphs of a key: key → function of (column within sprite, row) → glyph code. */
  readonly animate?: Readonly<Record<string, (c: number, r: number) => number>>;
  /** Rows of the canvas to leave untouched, from this row down (exclusive bound). */
  readonly clipBottom?: number;
};

/** Draws `s` with its top-left at (col, row). Palette keys missing from `pal` are skipped. */
export function drawSprite(canvas: Canvas, s: Sprite, col: number, row: number, pal: Palette, opts: DrawOptions = {}): void {
  const flip = opts.flip === true;
  const eyes = opts.eyes === undefined ? null : Array.from(opts.eyes, (ch) => ch.codePointAt(0) ?? SPACE);
  const bottom = opts.clipBottom ?? canvas.height;
  // Cells are visited left to right on screen, so the eyes are numbered in screen order even when mirrored.
  let eyeIndex = 0;
  for (let r = 0; r < s.h; r++) {
    const y = row + r;
    for (let c = 0; c < s.w; c++) {
      const sc = flip ? s.w - 1 - c : c;
      const x = col + c;
      const key = s.keys[r][sc];
      let glyph = s.glyphs[r][sc];
      const isEye = glyph === EYE;
      if (isEye) eyeIndex++;
      if (key === ' ' || x < 0 || x >= canvas.width || y < 0 || y >= bottom) continue;
      let paint = pal[key];
      if (isEye) {
        glyph = eyes === null ? SPACE : (eyes[Math.min(eyeIndex - 1, eyes.length - 1)] ?? SPACE);
        if (opts.eyePaint !== undefined) paint = { ...paint, ...opts.eyePaint };
      } else {
        const anim = opts.animate?.[key];
        if (anim !== undefined) glyph = anim(sc, r);
        else if (flip) glyph = MIRROR_CODES.get(glyph) ?? glyph;
      }
      if (paint === undefined) continue;
      canvas.put(x, y, glyph, paint.fg ?? null, paint.bg ?? null, paint.glow === true, paint.tint);
    }
  }
}

// ── The creature ───────────────────────────────────────────────────────────
// 7 wide, 4 tall, facing right. `c` is the cloak's outline, `C` its filled inside, `f` the face.

export type Pose = 'stand' | 'walk' | 'sit' | 'sleep' | 'jump' | 'wave' | 'dig' | 'eat';

const BODY_MASK = ['  cCc  ', ' cfffc ', ' cCCCc ', ' cCCCc '];
const SIT_MASK = ['       ', '  cCc  ', ' cfffc ', ' cCCCc '];

export const CREATURE: Readonly<Record<string, Sprite>> = {
  stand: sprite(['  /^\\  ', ' /EEE\\ ', ' |   | ', ' /___\\ '], BODY_MASK),
  walk1: sprite(['  /^\\  ', ' /EEE\\ ', ' |   | ', ' /___\\ '], BODY_MASK),
  walk2: sprite(['  /^\\  ', ' /EEE\\ ', ' |   | ', ' |___| '], BODY_MASK),
  sit: sprite(['       ', '  /^\\  ', ' /EEE\\ ', ' (___) '], SIT_MASK),
  sleep: sprite(['       ', '       ', ' /^\\__ ', '(EEE__)'], ['       ', '       ', ' cCcCC ', 'cfffCCc']),
  jump: sprite(['  /^\\  ', '\\/EEE\\/', ' |   | ', ' /___\\ '], ['  cCc  ', 'ccfffcc', ' cCCCc ', ' cCCCc ']),
  wave1: sprite(['  /^\\  ', ' /EEE\\/', ' |   | ', ' /___\\ '], ['  cCc  ', ' cfffcc', ' cCCCc ', ' cCCCc ']),
  wave2: sprite(['  /^\\  ', ' /EEE\\-', ' |   | ', ' /___\\ '], ['  cCc  ', ' cfffcc', ' cCCCc ', ' cCCCc ']),
  dig1: sprite(['       ', '  /^\\  ', ' /EEE\\ ', ' (___)/'], ['       ', '  cCc  ', ' cfffc ', ' cCCCcc']),
  dig2: sprite(['       ', '  /^\\  ', ' /EEE\\ ', ' (___)_'], ['       ', '  cCc  ', ' cfffc ', ' cCCCcc']),
};

/** Sprite for a pose at an animation time (seconds). */
export function creatureSprite(pose: Pose, t: number): Sprite {
  const beat = Math.floor(t * 4) % 2 === 0;
  switch (pose) {
    case 'walk':
      return beat ? CREATURE.walk1 : CREATURE.walk2;
    case 'wave':
      return Math.floor(t * 3) % 2 === 0 ? CREATURE.wave1 : CREATURE.wave2;
    case 'dig':
      return Math.floor(t * 5) % 2 === 0 ? CREATURE.dig1 : CREATURE.dig2;
    case 'sit':
    case 'eat':
      return CREATURE.sit;
    case 'sleep':
      return CREATURE.sleep;
    case 'jump':
      return CREATURE.jump;
    default:
      return CREATURE.stand;
  }
}

/** Where the creature's eyes are in its sprite for a pose: [column of the middle eye cell, row]. */
export function faceOf(pose: Pose): [number, number] {
  if (pose === 'sit' || pose === 'eat' || pose === 'dig') return [3, 2];
  if (pose === 'sleep') return [2, 3];
  return [3, 1];
}

// ── Props ──────────────────────────────────────────────────────────────────
// Keys: L canopy (leaf on leaf), l leaf outline, T bark, P needles, p needle outline, B berries,
// R rock, r rock outline, W water, w shore mud, C cactus, F flower, M mushroom cap, m stem, K reeds,
// k cattail, S snow, s snow outline, Z driftwood, D door (dark), H wall, h roof, x roof texture,
// G window (glows at night), Y cut wood, n small cap.

export const PROPS: Readonly<Record<string, Sprite>> = {
  tree: sprite(
    ['   %&%%&   ', ' %%&%%&%%% ', '%&%%%&%%&%%', ' %%&%%%&%% ', '   %%|%%   ', '     |     ', '    /|\\    '],
    ['   LLLLL   ', ' LLLLLLLLL ', 'LLLLLLLLLLL', ' LLLLLLLLL ', '   LLTLL   ', '     T     ', '    TTT    '],
  ),
  smalltree: sprite(
    ['  %&%  ', ' %&%%& ', '%%&%&%%', '  %|%  ', '   |   '],
    ['  LLL  ', ' LLLLL ', 'LLLLLLL', '  LTL  ', '   T   '],
  ),
  pine: sprite(
    ['   ^   ', '  /^\\  ', ' /^^^\\ ', '  /^\\  ', ' /^^^\\ ', '/^^^^^\\', '   #   '],
    ['   P   ', '  pPp  ', ' pPPPp ', '  pPp  ', ' pPPPp ', 'pPPPPPp', '   T   '],
  ),
  bush: sprite(['  %o%%  ', ' %%%o%% ', '%o%%%%o%'], ['  LBLL  ', ' LLLBLL ', 'LBLLLLBL']),
  rock: sprite([' .--. ', '(____)'], [' rrrr ', 'rRRRRr']),
  bigrock: sprite(['  .--.  ', ' /    \\ ', '(______)'], ['  rRRr  ', ' rRRRRr ', 'rRRRRRRr']),
  pond: sprite(['  ~~~~~~~~~~  ', '(~~~~~~~~~~~~)'], ['  WWWWWWWWWW  ', 'wWWWWWWWWWWWWw']),
  tidepool: sprite([' o~~~o ', '(~~~~~)'], [' rWWWr ', 'rWWWWWr']),
  cactus: sprite(['  .-.  ', '  | | .', '. | | |', "'-| |-'", '  | |  '], ['  CCC  ', '  CCC C', 'C CCC C', 'CCCCCCC', '  CCC  ']),
  palm: sprite([' .-\\|/-. ', '/  /|\\  \\', '    )    ', '    (    ', '    )    ', '  ._(_.  '], ['', '', '    T    ', '    T    ', '    T    ', '  ZZTZZ  '], 'l'),
  reeds: sprite([' •  • ', ' | •|/', '\\|/||/'], [' k  k ', ' K kKK', 'KKKKKK']),
  stump: sprite([' ___ ', '|_@_|'], [' TTT ', 'TYYYT']),
  deadtree: sprite(['\\  |  /', ' \\ | / ', '  \\|/_ ', '   |   ', '  :|:  ', '  /|\\  '], ['T  T  T', ' T T T ', '  TTTT ', '   T   ', '  KTK  ', '  TTT  ']),
  driftwood: sprite(['~=====-<'], ['ZZZZZZZZ']),
  snowdrift: sprite(['  .--.   ', '.\'    \'-.', '(_______)'], ['  sSSs   ', 'sSSSSSSSs', 'sSSSSSSSs']),
  ruin: sprite([' _.  ', '|  |\\', '|  ||', '|__|_'], [' RR  ', 'RRRRr', 'RRRRr', 'RRRRR']),
  mushrooms: sprite(['/°\\ ∩ ', ' |  | '], ['MMM n ', ' m  m ']),
};

/** The sprite used for each prop kind, by variant. */
export function propSprite(kind: PropKind, variant: number): Sprite {
  switch (kind) {
    case 'tree':
      return variant % 2 === 0 ? PROPS.tree : PROPS.smalltree;
    case 'rock':
      return variant % 3 === 0 ? PROPS.bigrock : PROPS.rock;
    case 'oasis':
      return PROPS.pond;
    case 'home':
      return PROPS.rock; // homes come from homeSprite
    default:
      return PROPS[kind] ?? PROPS.rock;
  }
}

// ── Homes ──────────────────────────────────────────────────────────────────
// Every home is 12 wide; its door is the two cells at columns 5-6 of its last two rows.

export const HOMES: Readonly<Record<BiomeName, Sprite>> = {
  meadow: sprite(
    ['     /\\     ', "   _/''\\_   ", '  /\'"\'"\'"\\  ', ' /________\\ ', '  | |  | #| ', '  |_|  |__| '],
    ['     hh     ', '   hhxxhh   ', '  hxxxxxxh  ', ' hhhhhhhhhh ', '  HHHDDHHGH ', '  HHHDDHHHH '],
  ),
  forest: sprite(
    ["   .-'''-.  ", " .'o  o  o'.", '(__________)', '  | .--. #| ', '  | |  |  | ', '  |_|  |__| '],
    ['   hhhhhhh  ', ' hhxhhxhhxhh', 'hhhhhhhhhhhh', '  HHHHHHHGH ', '  HHHDDHHHH ', '  HHHDDHHHH '],
  ),
  shore: sprite(
    ['     /\\     ', '    /||\\    ', '   / || \\   ', '  /  ||  \\  ', ' /  |  |  \\ ', '/___|  |___\\'],
    ['     ZZ     ', '    ZhhZ    ', '   ZhhhhZ   ', '  ZhhhhhhZ  ', ' ZhhhDDhhhZ ', 'ZZZZhDDhZZZZ'],
  ),
  tundra: sprite(
    ['   .----.   ', " .'_|__|_'. ", '/_|__|__|__\\', '|__|/  \\|__|', '|_|_|  |_|_|'],
    ['   ssssss   ', ' sSSSSSSSSs ', 'sSSSSSSSSSSs', 'SSSSSDDSSSSS', 'SSSSSDDSSSSS'],
  ),
  desert: sprite(
    ['  ________  ', ' /________\\ ', ' |# .--.  | ', ' |  |  |  | ', ' |__|  |__| '],
    ['  hhhhhhhh  ', ' hhhhhhhhhh ', ' HGHHHHHHHH ', ' HHHHDDHHHH ', ' HHHHDDHHHH '],
  ),
  swamp: sprite(
    ['  \\ \\|/ /   ', '   \\_|_/    ', '  _(   )_   ', ' (  .--.#)  ', ' (  |  |  ) ', ' (__|  |__) '],
    ['  T TTT T   ', '   TTTTT    ', '  TTHHHTT   ', ' THHHHHHGT  ', ' THHHDDHHHT ', ' THHHDDHHHT '],
  ),
};

/** The two door cells of a home: [first column, row] within its sprite. */
export function doorOf(home: Sprite): [number, number] {
  for (let r = 0; r < home.h; r++) {
    const c = home.keys[r].indexOf('D');
    if (c >= 0) return [c, r];
  }
  return [5, home.h - 2];
}

// ── Critters, food and toys ────────────────────────────────────────────────

/** Animation frames per critter, facing right. */
export const CRITTERS: Readonly<Record<CritterKind, readonly string[]>> = {
  butterfly: ['}{', '><'],
  bird: ['v', '-'],
  gull: ['~v~', '-v-'],
  firefly: ['•', '·'],
  moth: ['}{', '><'],
  crab: ['v°v', '^°^'],
  frog: ['°v°', '°-°'],
  lizard: ['~=°', '-=°'],
};

export type FoodKind = { readonly name: string; readonly glyph: string; readonly color: number };

/** What you can drop in, picked in turn. */
export const FOODS: readonly FoodKind[] = [
  { name: 'a berry', glyph: '•', color: 0xd04050 },
  { name: 'a dewdrop', glyph: '°', color: 0x9fe0ff },
  { name: 'a star crumb', glyph: '*', color: 0xffd860 },
  { name: 'a seed cake', glyph: '▪', color: 0xc8a060 },
  { name: 'a moon pear', glyph: 'ó', color: 0xe0e8a0 },
];
