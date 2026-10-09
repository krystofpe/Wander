// npm run motion -- [--seed S] [--at D] [--hour H] [--weather W] [--frames 120] [--speed 1] [--size 1280x720] [--out DIR]
// Captures frames exactly 1/60 s apart with the page's clock driven by hand, then builds slit-scans: one pixel row
// from every frame, stacked. Smooth scrolling draws clean diagonals; shimmer and jitter show up as kinks and steps.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flags, open, session } from './headless.ts';

const f = flags(process.argv.slice(2));
const out = f.get('out') ?? 'motion';
mkdirSync(out, { recursive: true });
const [w, h] = (f.get('size') ?? '1280x720').split('x').map(Number);
const n = Number(f.get('frames') ?? 120);
const dt = 1 / Number(f.get('fps') ?? 60);
const q = new URLSearchParams({ manual: '1', mute: '1', offline: '1' });
for (const k of ['seed', 'at', 'hour', 'weather', 'speed', 'day']) {
  const v = f.get(k);
  if (v !== undefined) q.set(k, v);
}

const s = await session();
const files: string[] = [];
try {
  const { page } = await open(s, w, h, q);
  for (let i = 0; i < n; i++) {
    await page.evaluate((d) => (window as unknown as { __wander: { advance(dt: number): void } }).__wander.advance(d), dt);
    const file = join(out, `f${String(i).padStart(4, '0')}.png`);
    writeFileSync(file, await page.screenshot({ type: 'png' }));
    files.push(file);
  }
} finally {
  await s.close();
}
// Slit-scans at a few heights: sky and far land, the tree line, his feet, the foreground.
const rows = (f.get('rows') ?? '0.32,0.5,0.75,0.9').split(',').map(Number);
for (const r of rows) {
  const y = Math.round(h * r);
  const slices = files.map((file) => `${file}[${w}x1+0+${y}]`);
  execFileSync('magick', [...slices, '-append', '-filter', 'point', '-resize', `100%x400%`, join(out, `slit-${Math.round(r * 100)}.png`)]);
}
process.stdout.write(`${out}: ${n} frames, slit-scans at ${rows.join(', ')}\n`);
