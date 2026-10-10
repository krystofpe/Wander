// npm run sheet -- [--seed S] [--biomes pine,desert,…] [--hours 7,12,18.5,22] [--weather W] [--out FILE.png]
// A contact sheet for quick looks: each panel is rendered at exactly 2× native (1280×720) and tiled at native
// size (640×360), so every art pixel is one sheet pixel. Panels are labelled.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROAD_BIOMES } from '../src/biomes.ts';
import { seedOf } from '../src/options.ts';
import { flags, open, session } from './headless.ts';
import { biomeCentres } from './places.ts';

const f = flags(process.argv.slice(2));
const seedWord = f.get('seed') ?? 'wander';
const seed = seedOf(seedWord);
const out = f.get('out') ?? 'sheet.png';
const dir = join(out.replace(/\.png$/, ''), '');
mkdirSync(dir, { recursive: true });
const centres = biomeCentres(seed);
const biomes = (f.get('biomes') ?? ROAD_BIOMES.join(',')).split(',');
const hours = (f.get('hours') ?? '12').split(',').map(Number);
const atList = f.get('at')?.split(',').map(Number);
const weather = f.get('weather');
const cols = Number(f.get('cols') ?? (hours.length > 1 ? hours.length : 3));

type Panel = { label: string; q: URLSearchParams };
const panels: Panel[] = [];
const places: { label: string; at: number }[] = atList !== undefined ? atList.map((a) => ({ label: `${a} m`, at: a })) : biomes.map((b) => ({ label: b, at: centres.get(b as never) ?? 0 }));
for (const p of places)
  for (const h of hours) {
    const q = new URLSearchParams({ frozen: '1', seed: seedWord, at: String(Math.round(p.at)), hour: String(h) });
    if (weather !== undefined) q.set('weather', weather);
    if (f.has('pose')) q.set('pose', f.get('pose') ?? 'walk');
    panels.push({ label: `${p.label} ${h}h${weather !== undefined ? ` ${weather}` : ''}`, q });
  }

const s = await session();
const files: string[] = [];
try {
  for (let i = 0; i < panels.length; i++) {
    const { page } = await open(s, 1280, 720, panels[i].q);
    const file = join(dir, `${String(i).padStart(2, '0')}.png`);
    writeFileSync(file, await page.screenshot({ type: 'png' }));
    await page.close();
    // Down to native size, pixel for pixel, with the label.
    execFileSync('magick', [file, '-filter', 'point', '-resize', '50%', '-gravity', 'NorthWest', '-fill', '#ffffffb0', '-pointsize', '11', '-annotate', '+4+3', panels[i].label, file]);
    files.push(file);
  }
} finally {
  await s.close();
}
execFileSync('magick', ['montage', ...files, '-tile', `${cols}x`, '-geometry', '+2+2', '-background', '#000', out]);
writeFileSync(join(dir, 'panels.json'), JSON.stringify(panels.map((p) => ({ label: p.label, query: p.q.toString() })), null, 1));
process.stdout.write(`${out}: ${files.length} panels\n`);
