// npm run tour -- [--seed S] [--out docs/tour] [--work DIR] [--only group,group] [--png]
// The tour: every biome at dawn, noon, golden hour, dusk, blue hour and night; the blends between them; every weather;
// every pose; every landmark (and the creature come through its portal to his fire at night); the life around him; and
// a few frames at 4K. Each is a frozen frame rendered in headless Chromium on the GPU at 1920×1080 (or 3840×2160).
// Full- quality PNGs go to the work folder (for looking); the committed copies in docs/tour are JPEG at quality 90 with
// full chroma, because film grain makes a 1080p PNG 2.3 MB (see the spec). Contact sheets of each group are written
// too.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANDMARK_KINDS, ROAD_BIOMES } from '../src/biomes.ts';
import { seedOf } from '../src/options.ts';
import { flags, open, session } from './headless.ts';
import { TIMES, biomeCentres, borders, firstLandmarks } from './places.ts';

const f = flags(process.argv.slice(2));
const word = f.get('seed') ?? 'wander';
const seed = seedOf(word);
const out = f.get('out') ?? join('docs', 'tour');
const work = f.get('work') ?? join('tour-png');
const only = f.get('only')?.split(',') ?? null;

type Shot = { group: string; name: string; q: Record<string, string>; size?: [number, number] };
const shots: Shot[] = [];
const add = (group: string, name: string, q: Record<string, string>, size?: [number, number]): void => {
  if (only === null || only.includes(group)) shots.push({ group, name, q: { seed: word, ...q }, size });
};

const centres = biomeCentres(seed);
// Every biome at every time of day, in the weather it most often has (clear).
for (const b of ROAD_BIOMES) {
  const at = String(Math.round(centres.get(b) ?? 0));
  for (const [time, hour] of Object.entries(TIMES)) add('biomes', `${b}-${time}`, { at, hour: String(hour), weather: 'clear' });
}
// The blends: the first borders on the road, at noon and at golden hour in turn.
borders(seed, 0, 40000)
  .slice(0, 12)
  .forEach((x, i) => add('blends', `${String(i + 1).padStart(2, '0')}-${x.a}-${x.b}`, { at: String(Math.round(x.at)), hour: String(i % 2 === 0 ? TIMES.noon : TIMES.golden), weather: 'clear' }));
// Every weather in the pine forest (the primary biome) and on the open meadow.
for (const w of ['clear', 'cloudy', 'overcast', 'fog', 'rain', 'snow', 'storm', 'wind']) {
  add('weather', `pine-${w}`, { at: String(Math.round(centres.get('pine') ?? 0)), hour: String(w === 'fog' ? TIMES.dawn : TIMES.noon), weather: w });
  add('weather', `meadow-${w}`, { at: String(Math.round(centres.get('meadow') ?? 0)), hour: String(w === 'storm' || w === 'rain' ? TIMES.dusk : TIMES.golden), weather: w });
}
// Every pose, the camp ones by night with the fire.
const pine = String(Math.round(centres.get('pine') ?? 0));
for (const [pose, time] of [
  ['walk', 'golden'],
  ['look', 'golden'],
  ['back', 'dusk'],
  ['sit', 'golden'],
  ['smoke', 'blue'],
  ['sitsmoke', 'dusk'],
  ['kneel', 'blue'],
  ['camp', 'night'],
  ['lie', 'night'],
  ['sleep', 'night'],
] as const)
  add('poses', `${pose}`, { at: pine, hour: String(TIMES[time]), weather: 'clear', pose, t: '3.1' });
// A thought, as it shows beside him.
add('poses', 'thought', { at: pine, hour: String(TIMES.golden), weather: 'clear', pose: 'sitsmoke', t: '3.1', thought: 'The pines have been talking all afternoon. Not to me.' });
// Every landmark, at the hour it is best seen.
const marks = firstLandmarks(seed);
const MARK_TIME: Record<string, string> = { house: 'blue', chapel: 'golden', lighthouse: 'dusk', mast: 'blue', car: 'golden', bridge: 'golden', train: 'night', circle: 'dawn', shrine: 'blue', skeleton: 'golden', camp: 'dusk' };
for (const kind of LANDMARK_KINDS) {
  const at = marks.get(kind);
  if (at === undefined) continue;
  // The train is seen crossing: pick an animation time when it is on its line.
  const t = kind === 'train' ? '40' : '3.1';
  add('landmarks', kind, { at: String(Math.round(at - 4)), hour: String(TIMES[MARK_TIME[kind]]), weather: 'clear', t, show: kind === 'bridge' ? 'fish' : '' });
}
// At night at his camp the creature comes through its portal to sit by his fire: just come, and some hours on.
add('landmarks', 'visit', { at: pine, hour: '0.4', weather: 'clear', pose: 'camp', t: '3.1' });
add('landmarks', 'visit-later', { at: pine, hour: '1.5', weather: 'clear', pose: 'camp', t: '3.1' });
// The life around him.
add('life', 'deer', { at: String(Math.round(centres.get('birch') ?? 0)), hour: String(TIMES.dawn), weather: 'clear', show: 'deer' });
add('life', 'deer-alert', { at: String(Math.round(centres.get('autumn') ?? 0)), hour: String(TIMES.golden), weather: 'clear', show: 'deer,alert' });
add('life', 'fox', { at: String(Math.round(centres.get('meadow') ?? 0)), hour: String(TIMES.dusk), weather: 'clear', show: 'fox' });
add('life', 'flock', { at: String(Math.round(centres.get('plateau') ?? 0)), hour: String(TIMES.golden), weather: 'clear', show: 'flock' });
add('life', 'bats', { at: String(Math.round(centres.get('swamp') ?? 0)), hour: String(TIMES.dusk), weather: 'clear', show: 'bats' });
add('life', 'fireflies', { at: String(Math.round(centres.get('meadow') ?? 0) + 200), hour: String(TIMES.night), weather: 'clear' });
add('life', 'leaves', { at: String(Math.round(centres.get('autumn') ?? 0)), hour: String(TIMES.noon), weather: 'wind' });
// A few at 4K.
const big: [number, number] = [3840, 2160];
add('4k', 'pine-golden', { at: pine, hour: String(TIMES.golden), weather: 'clear' }, big);
add('4k', 'pine-camp', { at: pine, hour: String(TIMES.night), weather: 'clear', pose: 'camp', t: '3.1' }, big);
add('4k', 'pass-noon', { at: String(Math.round(centres.get('pass') ?? 0)), hour: String(TIMES.noon), weather: 'clear' }, big);
add('4k', 'coast-dusk', { at: String(Math.round(centres.get('coast') ?? 0)), hour: String(TIMES.dusk), weather: 'clear' }, big);
add('4k', 'house-blue', { at: String(Math.round((marks.get('house') ?? 0) - 4)), hour: String(TIMES.blue), weather: 'clear' }, big);
add('4k', 'tundra-night', { at: String(Math.round(centres.get('tundra') ?? 0)), hour: String(TIMES.night), weather: 'clear' }, big);
add('4k', 'meadow-storm', { at: String(Math.round(centres.get('meadow') ?? 0)), hour: String(TIMES.dusk), weather: 'storm', t: '7.9' }, big);

const s = await session();
const groups = new Map<string, string[]>();
try {
  for (const shot of shots) {
    const [w, h] = shot.size ?? [1920, 1080];
    const q = new URLSearchParams({ frozen: '1' });
    for (const [k, v] of Object.entries(shot.q)) if (v !== '') q.set(k, v);
    const { page } = await open(s, w, h, q);
    const dir = join(work, shot.group);
    mkdirSync(dir, { recursive: true });
    const png = join(dir, `${shot.name}.png`);
    writeFileSync(png, await page.screenshot({ type: 'png' }));
    await page.close();
    const jdir = join(out, shot.group);
    mkdirSync(jdir, { recursive: true });
    execFileSync('magick', [png, '-sampling-factor', '4:4:4', '-quality', '90', join(jdir, `${shot.name}.jpg`)]);
    groups.set(shot.group, [...(groups.get(shot.group) ?? []), png]);
    process.stdout.write(`${shot.group}/${shot.name} ${w}×${h}\n`);
  }
  // A contact sheet per group, for looking at many at once.
  for (const [group, files] of groups) {
    const args: string[] = [];
    for (const file of files) args.push('-label', file.split('/').pop()?.replace(/\.png$/, '') ?? '', file);
    const sheet = join(work, `${group}-sheet.png`);
    execFileSync('montage', [...args, '-tile', group === 'biomes' ? '6x' : '4x', '-geometry', '480x270+3+3', '-pointsize', '13', '-background', '#0d0d10', '-fill', '#bbb', sheet]);
    execFileSync('magick', [sheet, '-quality', '88', join(out, `${group}-sheet.jpg`)]);
  }
  if (only === null) writeFileSync(join(out, 'times.json'), `${JSON.stringify({ seed: word, times: TIMES, shots: shots.map((x) => ({ ...x.q, group: x.group, name: x.name })) }, null, 1)}\n`);
} finally {
  await s.close();
}
