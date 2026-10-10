// npm run creature:tour -- [--seed WORD] [--out docs/creature] [--only group,group] [--size 1920x1080]
// Pictures of the creature in its hollow, from headless Chromium on the GPU, stepped in fixed steps (no frame loop):
// every biome at dawn, by day, at dusk and at night; its moments (at the glass, waving, sitting, digging, stacking its
// cairn, humming, eating, petted, playing); its nights (the lantern, the stars, asleep at home, its eyes in the dark
// doorway, the visitor); the traveller come by; the weather; and you (talking to it, the journal, a question). JPEG at
// quality 90, with a contact sheet of each group.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from 'playwright-core';
import { LIVE } from '../src/live.ts';
import { seedOf } from '../src/options.ts';
import { visitAt } from '../src/creature/visitor.ts';
import { eyesAt, owlTonight } from '../src/creature/night.ts';
import { daylightAt, localHour } from '../src/creature/sky.ts';
import { ROOT, flags, session } from './headless.ts';

const f = flags(process.argv.slice(2));
const word = f.get('seed') ?? 'moss';
const out = join(ROOT, f.get('out') ?? 'docs/creature');
const only = f.get('only')?.split(',') ?? null;
const [W, H] = (f.get('size') ?? '1920x1080').split('x').map(Number);
void LIVE;

type Shot = {
  readonly group: string;
  readonly name: string;
  readonly q: Record<string, string>;
  /** Seconds to live before the picture. */
  readonly sec: number;
  /** Something to do on the page first (keys, a click), after `before` seconds. */
  readonly act?: (page: Page) => Promise<void>;
  readonly before?: number;
};
const shots: Shot[] = [];
const add = (group: string, name: string, q: Record<string, string>, sec: number, act?: Shot['act'], before?: number): void => {
  if (only === null || only.includes(group)) shots.push({ group, name, q: { seed: word, user: 'Krystof', ...q }, sec, act, before });
};

/** The first moment from a day on (local time) when the tall one walks through the glow, halfway across. */
function visitMoment(seed: number): number {
  const start = new Date(2026, 9, 10, 21, 0).getTime();
  for (let t = start; t < start + 30 * 86400000; t += 5000) {
    if (daylightAt(localHour(t)) >= 0.3) continue;
    const v = visitAt(t, seed, 'forest', daylightAt(localHour(t)));
    if (v !== null && v.progress > 0.45 && v.progress < 0.55) return t;
  }
  return start;
}

/** The first moment from a day on, at that hour of the night, when the owl has come. */
function owlMoment(seed: number, hour: number): number {
  for (let d = 0; d < 30; d++) {
    const t = new Date(2026, 9, 10 + d, Math.floor(hour), Math.round((hour % 1) * 60)).getTime();
    if (owlTonight(seed, t) !== null) return t;
  }
  return new Date(2026, 9, 10, Math.floor(hour)).getTime();
}

/** The first moment from a night on when a pair of eyes watches from the trees, wide open, three seconds in. */
function eyesMoment(seed: number): number {
  const start = new Date(2026, 9, 10, 22, 0).getTime();
  for (let t = start; t < start + 86400000; t += 1000) {
    const e = eyesAt(seed, t);
    if (e !== null && e.t > 3 && e.t < 4 && !e.blink) return t;
  }
  return start;
}

for (const biome of ['forest', 'meadow', 'tundra', 'swamp']) {
  for (const [time, hour] of [['dawn', '6.6'], ['day', '11'], ['dusk', '18.9'], ['night', '23.2']] as const) {
    add('biomes', `${biome}-${time}`, { biome, hour, weather: 'clear', act: time === 'night' ? 'stroll' : 'idle' }, 6);
  }
}

add('moments', 'glass', { hour: '15', weather: 'clear', act: 'visit' }, 5.5);
add('moments', 'wave', { hour: '15', weather: 'clear', act: 'wave' }, 1.2);
add('moments', 'sit', { hour: '16.5', weather: 'clear', act: 'sit' }, 12);
add('moments', 'dig', { hour: '10', weather: 'cloudy', act: 'dig' }, 9);
add('moments', 'stack', { hour: '12', weather: 'clear', act: 'stack' }, 12);
add('moments', 'hum', { hour: '17.5', weather: 'clear', act: 'hum' }, 4);
add('moments', 'eat', { hour: '13', weather: 'clear' }, 8, async (p) => p.keyboard.press('f'), 4);
add('moments', 'petted', { hour: '14', weather: 'clear', act: 'petted' }, 1.2);
add('moments', 'play', { hour: '14', weather: 'clear', act: 'play' }, 1.4);

add('nights', 'lantern', { hour: '20.6', weather: 'clear', act: 'stroll' }, 4);
add('nights', 'stars', { hour: '22.5', weather: 'clear', act: 'stargaze' }, 16);
add('nights', 'asleep', { hour: '2', weather: 'clear', act: 'sleep' }, 40);
add('nights', 'doorway', { hour: '21', weather: 'rain', act: 'shelter' }, 18);
add('nights', 'owl', { now: String(owlMoment(seedOf(word), 22.8)), weather: 'clear', act: 'stargaze' }, 14);
add('nights', 'eyes', { now: String(eyesMoment(seedOf(word))), weather: 'clear', act: 'idle' }, 0.5);
add('nights', 'visitor', { now: String(visitMoment(seedOf(word))), weather: 'clear', act: 'watch' }, 3);

add('traveller', 'walks', { hour: '10.5', weather: 'clear', passer: '14', act: 'idle' }, 2);
add('traveller', 'sits', { hour: '15.5', weather: 'clear', passer: 'sit', act: 'traveller' }, 12);
add('traveller', 'meadow', { biome: 'meadow', hour: '16', weather: 'clear', passer: 'sit', act: 'traveller' }, 12);
add('traveller', 'night', { hour: '21.6', weather: 'clear', passer: 'sit', act: 'traveller' }, 12);

add('weather', 'rain', { hour: '16', weather: 'rain', act: 'dance' }, 3);
add('weather', 'storm', { hour: '19.4', weather: 'storm', act: 'idle' }, 4);
add('weather', 'fog', { hour: '7.5', weather: 'fog', act: 'idle' }, 4);
add('weather', 'overcast', { hour: '13', weather: 'overcast', act: 'idle' }, 4);
add('weather', 'snow', { biome: 'tundra', hour: '12', weather: 'snow', act: 'dance' }, 3);

add('you', 'talk', { hour: '15', weather: 'clear' }, 4, async (p) => {
  await p.keyboard.press('t');
  await p.keyboard.type('do you remember the sea?');
}, 3);
add('you', 'journal', { hour: '15', weather: 'clear' }, 1.5, async (p) => p.keyboard.press('j'), 1);
add('you', 'asks', { hour: '15', weather: 'clear', act: 'ask' }, 9);

mkdirSync(out, { recursive: true });
const s = await session();
const groups = new Map<string, string[]>();
try {
  for (const shot of shots) {
    const page = await s.browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => process.stderr.write(`[page error] ${shot.name}: ${e.message}\n`));
    const q = new URLSearchParams({ manual: '1', size: `${W}x${H}`, mute: '1', ...shot.q });
    await page.goto(`${s.server.url}creature?${q.toString()}`);
    await page.waitForFunction(() => (window as unknown as { __creature?: { ready: boolean; error: string | null } }).__creature?.ready === true || (window as unknown as { __creature?: { error: string | null } }).__creature?.error != null, undefined, { timeout: 60_000 });
    const advance = (sec: number): Promise<void> =>
      page.evaluate((sec) => {
        const c = (window as unknown as { __creature: { advance(dt: number): void } }).__creature;
        for (let t = 0; t < sec - 1e-9; t += 0.25) c.advance(0.25);
      }, sec);
    if (shot.act !== undefined) {
      await advance(shot.before ?? 0);
      await shot.act(page);
      await advance(Math.max(0, shot.sec - (shot.before ?? 0)));
    } else await advance(shot.sec);
    // The words and the bars fade in on the page's own clock.
    await page.waitForTimeout(900);
    const dir = join(out, shot.group);
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${shot.name}.jpg`);
    writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 90 }));
    const m = (await page.evaluate(() => (window as unknown as { __creature: { moment(): Record<string, unknown> } }).__creature.moment())) as Record<string, unknown>;
    process.stdout.write(`${shot.group}/${shot.name}: ${m.biome} ${m.hour}h ${m.weather} · ${m.doing ?? '-'} · ${m.pose}${m.inside ? ' inside' : ''}${m.bubble ? ` · “${m.bubble}”` : ''}\n`);
    groups.set(shot.group, [...(groups.get(shot.group) ?? []), file]);
    await page.close();
  }
} finally {
  await s.close();
}
for (const [group, files] of groups) {
  const labelled = files.flatMap((file) => ['-label', file.split('/').pop()?.replace('.jpg', '') ?? '', file]);
  execFileSync('montage', [...labelled, '-tile', '4x', '-geometry', '480x270+3+3', '-pointsize', '13', '-background', '#0d0e12', '-fill', '#c8c2b4', '-quality', '88', join(out, `${group}-sheet.jpg`)]);
}
process.stdout.write(`${out}: ${shots.length} pictures\n`);
