// The creature's eyes, drawn apart from it so they can glow in the colour of its mood and look where it looks: two
// eyes of 2 × 2 with a pixel between, in a 5 × 3 sprite (the third row for a tear). Drawn in the eye role; the page
// swaps it for the mood's. Shapes as in src/creature/look.ts EYE_SHAPES.
import type { Sheet } from '../legend.ts';

export const SHEET: Sheet = {
  name: 'eyes',
  w: 5,
  h: 3,
  tags: [
    { name: 'open', ms: 1000, frames: [['ee.ee', 'ee.ee', '.....']] },
    { name: 'shut', ms: 1000, frames: [['.....', 'ee.ee', '.....']] },
    { name: 'happy', ms: 1000, frames: [['ee.ee', '.....', '.....']] },
    { name: 'wide', ms: 1000, frames: [['ee.ee', 'ee.ee', 'e...e']] },
    { name: 'cross', ms: 1000, frames: [['e...e', 'ee.ee', '.....']] },
    { name: 'tear', ms: 1000, frames: [['ee.ee', 'ee.ee', 'P....']] },
  ],
};
