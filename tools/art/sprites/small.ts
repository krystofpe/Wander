// Small life, drawn by hand: a bird's wingbeat, a bat's, falling leaves, a firefly.
import { block, compose } from '../compose.ts';
import type { Sheet } from '../legend.ts';

const W = 8;
const H = 6;
const f = (rows: readonly string[]): string[] => compose(W, H, [block(0, 0, rows)]);

export const SHEET: Sheet = {
  name: 'small',
  w: W,
  h: H,
  tags: [
    // A bird far off, seen from the side: wings up, level, down, level.
    { name: 'bird', ms: [90, 70, 90, 70], frames: [f(['5...5', '.5.5.', '..6..']), f(['.....', '55655', '.....']), f(['.....', '..6..', '.5.5.', '5...5']), f(['.....', '55655', '.....'])] },
    // A bat's ragged wingbeat.
    { name: 'bat', ms: 60, frames: [f(['5.....5', '55...55', '.55655.', '...5...']), f(['.......', '...5...', '5556555', '.5...5.'])] },
    // A leaf turning as it falls.
    { name: 'leaf', ms: 160, frames: [f(['7.', '.8']), f(['78']), f(['.7', '8.']), f(['8', '7'])] },
    { name: 'firefly', ms: 1000, frames: [f(['F'])] },
  ],
};
