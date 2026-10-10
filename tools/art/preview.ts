// node tools/art/preview.ts SHEET [OUT.png] [--scale 8]: every frame of a hand-drawn sheet, enlarged with a faint
// grid, graded at noon and at dusk, plus a black silhouette row to check that the shape reads (research: Pixel
// craft §15).
import { writeFileSync } from 'node:fs';
import { buildRow, gradeOf, newGrade, newMoment, ROLE_COUNT } from '../../src/palette.ts';
import { encodePng } from '../png.ts';
import { LEGEND, check } from './legend.ts';
import type { Sheet } from './legend.ts';

const name = process.argv[2] ?? 'wanderer';
const out = process.argv[3] ?? `${name}-preview.png`;
const scale = Number(process.argv[process.argv.indexOf('--scale') + 1] || 8) || 8;
const sheet = ((await import(`./sprites/${name}.ts`)) as { SHEET: Sheet }).SHEET;
check(sheet);

const rows: Uint8Array[] = [];
for (const e of [40, -2]) {
  const m = newMoment();
  m.elevation = e;
  const g = gradeOf(m, newGrade());
  const row = new Uint8Array(256 * 4);
  buildRow('meadow', g, 0, 0, row, 0);
  rows.push(row);
}
void ROLE_COUNT;

const frames = sheet.tags.flatMap((t) => t.frames);
const pad = 2;
const cellW = (sheet.w + pad) * scale;
const cellH = (sheet.h + pad) * scale;
const W = cellW * frames.length;
const H = cellH * 3;
const img = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) img.set([96, 104, 112, 255], i * 4);
frames.forEach((rowsOf, fi) => {
  for (let band = 0; band < 3; band++)
    for (let y = 0; y < sheet.h; y++)
      for (let x = 0; x < sheet.w; x++) {
        const r = LEGEND[rowsOf[y][x]];
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const px = fi * cellW + (x + 1) * scale + sx;
            const py = band * cellH + (y + 1) * scale + sy;
            const o = (py * W + px) * 4;
            const grid = sx === 0 || sy === 0;
            if (r === 0) {
              if (grid) img.set([90, 98, 106, 255], o);
              continue;
            }
            if (band === 2) img.set([0, 0, 0, 255], o);
            else {
              const pal = rows[band];
              img.set([pal[r * 4], pal[r * 4 + 1], pal[r * 4 + 2], 255], o);
            }
          }
      }
});
writeFileSync(out, encodePng(W, H, img));
process.stdout.write(`${out}: ${frames.length} frames\n`);
