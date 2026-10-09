// npm run listen -- [--seed S] [--biome B] [--hour H] [--weather W] [--speed X] [--wait SEC] [--sec SEC] --out FILE
// Lets the page run live in headless Chromium (audio muted at the device, recorded inside the page), records the
// sound for a while and writes it as WebM, with its loudness (EBU R 128, by ffmpeg) and a spectrogram beside it.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import type { Page } from 'playwright-core';
import { flags, open, session } from './headless.ts';

type Wander = { sound(): Record<string, unknown> | null; record(sec: number): Promise<string | null> };

/** Integrated loudness (LUFS) and true peak (dBFS) of a file, from ffmpeg's ebur128 filter. */
export function loudness(file: string): { lufs: number; peak: number } {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const summary = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const i = summary.match(/I:\s+(-?[\d.]+) LUFS/);
  const p = summary.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/);
  return { lufs: i ? Number(i[1]) : Number.NaN, peak: p ? Number(p[1]) : Number.NaN };
}

/** Records `sec` seconds of the page's sound into `out` (WebM), draws its spectrogram, and measures it. */
export async function listen(page: Page, sec: number, out: string): Promise<{ lufs: number; peak: number; png: string }> {
  const b64 = await page.evaluate((n) => (window as unknown as { __wander: Wander }).__wander.record(n), sec);
  if (b64 === null) throw new Error('no sound in the page');
  writeFileSync(out, Buffer.from(b64, 'base64'));
  const png = out.replace(/\.webm$/, '.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-lavfi', 'showspectrumpic=s=960x320:legend=1:scale=log:fscale=log', png]);
  return { ...loudness(out), png };
}

export const soundOf = (page: Page): Promise<Record<string, unknown> | null> => page.evaluate(() => (window as unknown as { __wander: Wander }).__wander.sound());

if (import.meta.main) {
  const f = flags(process.argv.slice(2));
  const out = f.get('out') ?? 'listen.webm';
  const sec = Number(f.get('sec') ?? 20);
  const wait = Number(f.get('wait') ?? 4);
  const q = new URLSearchParams();
  for (const k of ['seed', 'at', 'hour', 'weather', 'biome', 'day', 'speed', 'realclock', 'pose']) {
    const v = f.get(k);
    if (v !== undefined) q.set(k, v);
  }
  const s = await session();
  try {
    const { page } = await open(s, 960, 540, q, f.has('log'));
    await page.waitForTimeout(wait * 1000);
    const m = await listen(page, sec, out);
    process.stdout.write(`${out} · ${sec}s · ${m.lufs} LUFS · peak ${m.peak} dBFS · ${m.png}\n${JSON.stringify(await soundOf(page))}\n`);
  } finally {
    await s.close();
  }
}
