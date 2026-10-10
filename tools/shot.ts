// npm run shot -- --seed S --at DIST --hour H --weather W --size 1920x1080 --out FILE.png [--pose P] [--t SEC]
// Renders one frozen frame in headless Chromium on the GPU.
import { writeFileSync } from 'node:fs';
import { flags, open, session } from './headless.ts';

const f = flags(process.argv.slice(2));
const out = f.get('out') ?? 'shot.png';
const [w, h] = (f.get('size') ?? '1920x1080').split('x').map(Number);
const q = new URLSearchParams({ frozen: '1' });
for (const k of ['seed', 'at', 'hour', 'weather', 'pose', 't', 'biome', 'day', 'realclock', 'layers', 'thought']) {
  const v = f.get(k);
  if (v !== undefined) q.set(k, v);
}

const s = await session();
try {
  const { page, status } = await open(s, w, h, q, f.has('log'));
  const png = await page.screenshot({ type: 'png' });
  writeFileSync(out, png);
  process.stdout.write(`${out} ${w}x${h} · ${status.renderer}\n`);
} finally {
  await s.close();
}
