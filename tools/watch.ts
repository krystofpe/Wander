// npm run watch -- [--seed S] [--biome B] [--hour H] [--speed X] [--minutes M] [--every SEC] [--clip SEC]
//                  [--clipEvery SEC] [--size WxH] [--out DIR]
// Watches the road live in headless Chromium, as it runs unattended: a screenshot and a log line every few seconds
// (day, hour, place, weather, what he does, the fire, what showed itself, his last thought, what is sounding), and
// now and then a short recording of the sound with its loudness and spectrogram. Writes DIR/log.json, DIR/log.md
// and a contact sheet DIR/sheet.png.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { flags, open, session } from './headless.ts';
import { listen } from './listen.ts';

const f = flags(process.argv.slice(2));
const out = f.get('out') ?? 'watch';
const minutes = Number(f.get('minutes') ?? 5);
const every = Number(f.get('every') ?? 20);
const clip = Number(f.get('clip') ?? 0);
const clipEvery = Number(f.get('clipEvery') ?? 120);
const [w, h] = (f.get('size') ?? '1280x720').split('x').map(Number);
const q = new URLSearchParams();
for (const k of ['seed', 'biome', 'hour', 'speed', 'day', 'weather', 'at', 'realclock']) {
  const v = f.get(k);
  if (v !== undefined) q.set(k, v);
}
mkdirSync(out, { recursive: true });

type Wander = { moment(): Record<string, unknown>; sound(): Record<string, unknown> | null; events: string[]; error: string | null };
type Line = { t: number; shot: string; moment: Record<string, unknown>; sound: Record<string, unknown> | null; clip?: { file: string; lufs: number; peak: number } };

const s = await session();
const lines: Line[] = [];
try {
  const { page } = await open(s, w, h, q, f.has('log'));
  const start = Date.now();
  let lastClip = -Infinity;
  for (let i = 0; Date.now() - start < minutes * 60_000; i++) {
    const t = (Date.now() - start) / 1000;
    const shot = join(out, `${String(i).padStart(4, '0')}.png`);
    writeFileSync(shot, await page.screenshot({ type: 'png' }));
    const state = (await page.evaluate(() => {
      const w = (window as unknown as { __wander: Wander }).__wander;
      return { moment: w.moment(), sound: w.sound(), error: w.error };
    })) as { moment: Record<string, unknown>; sound: Record<string, unknown> | null; error: string | null };
    if (state.error !== null) throw new Error(`the page failed: ${state.error}`);
    const line: Line = { t: Math.round(t), shot, moment: state.moment, sound: state.sound };
    if (clip > 0 && t - lastClip >= clipEvery) {
      lastClip = t;
      const file = join(out, `${String(i).padStart(4, '0')}.webm`);
      const m = await listen(page, clip, file);
      line.clip = { file, lufs: m.lufs, peak: m.peak };
    }
    lines.push(line);
    const mo = state.moment;
    process.stdout.write(`${line.t}s day ${mo.day} ${mo.hour}h ${mo.biome} ${mo.weather} ${mo.stage}${mo.fire ? ` fire ${mo.fire}` : ''}${mo.smoking ? ' smoking' : ''}${line.clip ? ` · ${line.clip.lufs} LUFS` : ''}\n`);
    const wait = every * 1000 - ((Date.now() - start) % (every * 1000));
    await page.waitForTimeout(Math.max(200, wait));
  }
  const events = await page.evaluate(() => (window as unknown as { __wander: Wander }).__wander.events);
  writeFileSync(join(out, 'log.json'), `${JSON.stringify({ query: q.toString(), minutes, lines, events }, null, 1)}\n`);
  const md = ['| t (s) | day | hour | place | weather | he | fire | sound |', '|---|---|---|---|---|---|---|---|'];
  for (const l of lines) {
    const m = l.moment;
    const so = l.sound ?? {};
    md.push(`| ${l.t} | ${m.day} | ${m.hour} | ${m.biome} | ${m.weather} | ${m.stage}${m.smoking ? ', smoking' : ''} | ${m.fire} | wind ${so.wind}, rain ${so.rain}, crickets ${so.crickets}${l.clip ? `, ${l.clip.lufs} LUFS` : ''} |`);
  }
  writeFileSync(join(out, 'log.md'), `${md.join('\n')}\n`);
  // A contact sheet: one tile per screenshot, labelled with the moment.
  const labelled: string[] = [];
  for (const l of lines) {
    const m = l.moment;
    labelled.push('-label', `${l.t}s d${m.day} ${m.hour}h ${m.biome} ${m.weather} ${m.stage}`, l.shot);
  }
  if (lines.length > 0) execFileSync('montage', [...labelled, '-tile', '6x', '-geometry', '320x180+2+2', '-pointsize', '10', '-background', '#111', '-fill', '#ccc', join(out, 'sheet.png')]);
  process.stdout.write(`${out}: ${lines.length} moments\n`);
} finally {
  await s.close();
}
