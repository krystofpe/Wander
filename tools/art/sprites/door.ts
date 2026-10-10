// The light of his world in the creature's doorway, seen from the deep (web/creature/hollow.ts): when his road comes
// by the hollow above, its door fills with daylight, or moonlight at night, thickest low where the threshold is, thin
// toward the arch. Drawn in a glowing role, laid in at a strength by the page. Legend in ../legend.ts.
import type { Sheet } from '../legend.ts';

/** An arch 13 × 22 (inside the great tree's door), dithered thinner toward its top. */
function arch(c: string): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 22; y++) {
    const half = y < 5 ? Math.round(Math.sqrt(Math.max(0, 25 - (5 - y) ** 2)) * 1.25) : 6;
    let row = '';
    for (let x = 0; x < 13; x++) {
      const inside = Math.abs(x - 6) <= half;
      const dense = y > 15 ? 1 : y > 9 ? ((x + y) % 2 === 0 ? 1 : 0) : (x + y) % 3 === 0 ? 1 : 0;
      row += inside && dense ? c : '.';
    }
    rows.push(row);
  }
  return rows;
}

export const SHEET: Sheet = {
  name: 'doorlight',
  w: 13,
  h: 22,
  tags: [
    { name: 'day', ms: 1000, frames: [arch('!')] },
    { name: 'night', ms: 1000, frames: [arch('^')] },
  ],
};
