// What things are drawn on (the canvas), the creature's poses, and the foods you can drop in.

/** Where sprites are drawn: the renderer implements it. `fg`/`bg` of null keep what is there. */
export type Canvas = {
  readonly width: number;
  readonly height: number;
  put(col: number, row: number, glyph: number, fg: number | null, bg: number | null, glow: boolean): void;
  /** Paints a cell as two square pixels, one above the other. A null half keeps the colour it shows now. */
  halves(col: number, row: number, top: number | null, bottom: number | null, glowTop: boolean, glowBottom: boolean): void;
};

/** What the creature is doing with its body; src/figure.ts draws each one. */
export type Pose = 'stand' | 'walk' | 'sit' | 'sleep' | 'jump' | 'wave' | 'dig' | 'eat';

// ── Food ───────────────────────────────────────────────────────────────────

export type FoodKind = { readonly name: string; readonly glyph: string; readonly color: number };

/** What you can drop in, picked in turn. */
export const FOODS: readonly FoodKind[] = [
  { name: 'a berry', glyph: '•', color: 0xd04050 },
  { name: 'a dewdrop', glyph: '°', color: 0x9fe0ff },
  { name: 'a star crumb', glyph: '*', color: 0xffd860 },
  { name: 'a seed cake', glyph: '▪', color: 0xc8a060 },
  { name: 'a moon pear', glyph: 'ó', color: 0xe0e8a0 },
];
