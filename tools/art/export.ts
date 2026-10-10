// npm run art: exports every art/*.aseprite into one packed atlas for the game: assets/atlas.png (indexed: each
// palette index is a colour role) and assets/atlas.json (frames by sheet, tag and frame, durations, slices).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../headless.ts';

const art = join(ROOT, 'art');
const out = join(ROOT, 'assets');
mkdirSync(out, { recursive: true });
const files = readdirSync(art)
  .filter((f) => f.endsWith('.aseprite'))
  .sort()
  .map((f) => join(art, f));
execFileSync('aseprite', [
  '-b',
  ...files,
  '--sheet',
  join(out, 'atlas.png'),
  '--data',
  join(out, 'atlas.raw.json'),
  '--format',
  'json-array',
  '--sheet-type',
  'packed',
  '--shape-padding',
  '1',
  '--list-tags',
  '--list-slices',
  '--filename-format',
  '{title}|{tag}|{tagframe}',
]);

type Raw = {
  frames: { filename: string; frame: { x: number; y: number; w: number; h: number }; duration: number }[];
  meta: { frameTags: unknown[]; slices: { name: string; keys: { bounds: { x: number; y: number } }[] }[]; size: { w: number; h: number } };
};
const raw = JSON.parse(readFileSync(join(out, 'atlas.raw.json'), 'utf8')) as Raw;
// A compact form the game reads: sheet → tag → frames [x, y, w, h, ms].
const sheets: Record<string, Record<string, number[][]>> = {};
for (const f of raw.frames) {
  const [title, tag] = f.filename.split('|');
  const sheet = title.replace(/\.aseprite$/, '');
  sheets[sheet] ??= {};
  sheets[sheet][tag] ??= [];
  sheets[sheet][tag].push([f.frame.x, f.frame.y, f.frame.w, f.frame.h, f.duration]);
}
const points: Record<string, [number, number]> = {};
for (const s of raw.meta.slices) points[s.name] = [s.keys[0].bounds.x, s.keys[0].bounds.y];
writeFileSync(join(out, 'atlas.json'), `${JSON.stringify({ size: raw.meta.size, sheets, points })}\n`);
execFileSync('rm', [join(out, 'atlas.raw.json')]);
process.stdout.write(`assets/atlas.png ${raw.meta.size.w}×${raw.meta.size.h}, ${raw.frames.length} frames\n`);
