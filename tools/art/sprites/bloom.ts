// Glowing flowers on the deep's floor, around the creature's home (web/creature/hollow.ts): a clump of thin stems
// with small stars of light, pink, violet or blue. Legend in ../legend.ts.
import type { Sheet } from '../legend.ts';

/** A clump: stems in moss green, blossoms in two shades of one light (`a` the petals, `b` the heart). */
const clump = (a: string, b: string): string[] => [
  `.${a}.....${a}..`,
  `${a}${b}${a}...${a}${b}${a}.`,
  `.${a}.9.9.${a}..`,
  '..9..9..9.',
  `..9.${a}9....`,
  `..9${a}${b}${a}9...`,
  `...9${a}.9...`,
  '...9.99...',
  '....99....',
];

export const SHEET: Sheet = {
  name: 'bloom',
  w: 10,
  h: 9,
  tags: [
    { name: 'pink', ms: 1000, frames: [clump('<', 'γ')] },
    { name: 'violet', ms: 1000, frames: [clump('β', 'γ')] },
    { name: 'blue', ms: 1000, frames: [clump('~', '^')] },
  ],
};
