// The characters used in hand-drawn sprite grids, and the colour role each stands for. One character per pixel;
// '.' is clear. A sprite's palette in Aseprite is the authoring palette (palette index = role index), so the
// exported PNG maps back to roles exactly.
import { role } from '../../src/palette.ts';

export const LEGEND: Readonly<Record<string, number>> = {
  '.': 0,
  // His coat, darkest to lightest; the hood's darkness; the eyes.
  o: role('coat', 0),
  d: role('coat', 1),
  m: role('coat', 2),
  l: role('coat', 3),
  L: role('coat', 4),
  h: role('hood', 0),
  e: role('eye', 0),
  // The pack and bedroll.
  p: role('pack', 0),
  q: role('pack', 1),
  r: role('pack', 2),
  s: role('pack', 3),
  // The stick, the boots.
  k: role('stick', 0),
  K: role('stick', 1),
  b: role('boot', 0),
  B: role('boot', 1),
  // The cigarette and its ember (dull, hot, brightest).
  c: role('cig', 0),
  x: role('ember', 0),
  X: role('ember', 1),
  '*': role('ember', 2),
  // Fire and smoke.
  f: role('fire', 0),
  g: role('fire', 1),
  i: role('fire', 2),
  j: role('fire', 3),
  J: role('fire', 4),
  u: role('smoke', 0),
  v: role('smoke', 1),
  w: role('smoke', 2),
  // Wood, bark, stone, ash (for the fire and props).
  t: role('wood', 1),
  T: role('wood', 2),
  y: role('wood', 3),
  n: role('stone', 1),
  N: role('stone', 2),
  a: role('soil', 0),
  A: role('soil', 1),
};

/** A sprite sheet drawn by hand: frames grouped by tag, each frame rows of characters, with frame durations (ms). */
export type Sheet = {
  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly tags: readonly { readonly name: string; readonly ms: number | readonly number[]; readonly frames: readonly (readonly string[])[] }[];
  /** Named points (slices), e.g. where the hand holds the cigarette, as [x, y]. */
  readonly points?: Readonly<Record<string, readonly [number, number]>>;
};

/** Checks a sheet: every frame the right size, every character known. Throws with the place of the fault. */
export function check(sheet: Sheet): void {
  for (const tag of sheet.tags)
    tag.frames.forEach((rows, i) => {
      if (rows.length !== sheet.h) throw new Error(`${sheet.name} ${tag.name}[${i}]: ${rows.length} rows, want ${sheet.h}`);
      rows.forEach((row, y) => {
        if (row.length !== sheet.w) throw new Error(`${sheet.name} ${tag.name}[${i}] row ${y}: ${row.length} columns, want ${sheet.w}: "${row}"`);
        for (const ch of row) if (LEGEND[ch] === undefined) throw new Error(`${sheet.name} ${tag.name}[${i}] row ${y}: unknown '${ch}'`);
      });
    });
}
