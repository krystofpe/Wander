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
  // Animals: fur darkest to lightest, birds and bats, falling leaves, a fish, fireflies.
  '1': role('fur', 0),
  '2': role('fur', 1),
  '3': role('fur', 2),
  '4': role('fur', 3),
  '5': role('bird', 0),
  '6': role('bird', 1),
  '7': role('leaf', 3),
  '8': role('leaf', 4),
  // A fox's rust and the white of its chest and tail tip.
  C: role('metal', 1),
  D: role('metal', 2),
  E: role('metal', 3),
  U: role('bone', 2),
  // The creature's mask: bone, darkest to the U above; the marks painted on it, in the violet of flowers.
  z: role('bone', 0),
  '/': role('bone', 1),
  '·': role('flower', 1),
  '•': role('flower', 2),
  P: role('water', 2),
  Q: role('water', 3),
  F: role('firefly', 0),
  // Lamps and a far train: the red lamp, glass (dark, and the pane lit at night), the body, the running gear.
  R: role('lamp', 0),
  G: role('glass', 0),
  W: role('glass', 1),
  I: role('roof', 0),
  O: role('roof', 1),
  H: role('roof', 2),
  S: role('rail', 0),
  Z: role('rail', 1),
  // The creature's world (tools/art/sprites/creature*.ts, hollow.ts). The creature is drawn in the coat's roles
  // (o d m l L), its face in the hood's darkness, its eyes in the eye role: the page swaps both for its own.
  '#': role('shroom', 0),
  '@': role('shroom', 1),
  $: role('shroom', 2),
  '%': role('berry', 0),
  '&': role('berry', 1),
  '+': role('berry', 2),
  '~': role('toy', 0),
  '^': role('toy', 1),
  '<': role('heart', 0),
  '>': role('note', 0),
  '!': role('spark', 0),
  ':': role('wing', 0),
  ';': role('wing', 1),
  ',': role('wing', 2),
  V: role('leaf', 0),
  M: role('leaf', 1),
  Y: role('leaf', 2),
  '9': role('grass', 2),
  '0': role('grass', 3),
  '=': role('grass', 4),
  '(': role('bark', 0),
  ')': role('bark', 1),
  '[': role('bark', 2),
  ']': role('bark', 3),
  '{': role('snow', 1),
  '}': role('snow', 2),
  '|': role('snow', 3),
  '-': role('dry', 1),
  _: role('dry', 2),
  '"': role('stone', 0),
  '?': role('stone', 3),
  '`': role('water', 0),
  "'": role('water', 1),
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
