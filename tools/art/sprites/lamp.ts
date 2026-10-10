// The deep's old lamp (web/creature/hollow.ts): left by the people who are gone, hanging on its chain from the roof
// far off, a caged orb of warm light, the only warmth there but the creature's own eyes and lantern. Its light breathes
// a little (two frames). And a link of its chain (MORE), to hang it by. Legend in ../legend.ts.
import type { Sheet } from '../legend.ts';

const ORB = (core: string): string[] => [
  '....CDC....',
  '...CDEDC...',
  '..CfCgCfC..',
  '.CfiCJCifC.',
  '.fiJC' + core + 'CJif.',
  'CgJJC' + core + 'CJJgC',
  'DiJJC' + core + 'CJJiD',
  'CgJJC' + core + 'CJJgC',
  '.fiJC' + core + 'CJif.',
  '.CfiCJCifC.',
  '..CfCgCfC..',
  '...CDEDC...',
  '....CDC....',
];

export const SHEET: Sheet = {
  name: 'lamp',
  w: 11,
  h: 13,
  tags: [{ name: 'orb', ms: [1700, 1300], frames: [ORB('J'), ORB('j')] }],
};

/** A link of its chain, 1 × 3: hung one under another from the roof down to the lamp. */
export const MORE: readonly Sheet[] = [{ name: 'chain', w: 1, h: 3, tags: [{ name: 'link', ms: 1000, frames: [['C', 'D', '.']] }] }];
