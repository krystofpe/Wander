// npm run soak -- [--speed 40] [--hours 48 | --minutes M] [--size 1280x720] [--every 60] [--hidden MIN] [--out FILE]
// Leaves the road running in headless Chromium and samples it every minute: in-world hours walked, the JS heap
// (after a collection), the GPU textures, buffers and their bytes alive, frame time p50/p99 over the minute, the
// sound's live voices, and any error. `--hours` stops after that many in-world hours; `--minutes` after that much
// real time. `--hidden MIN` hides the page for the first MIN minutes, to show the road and its sound go on in a
// background window. (Headless Chromium never hides a page, not even behind another tab or minimised, so the page
// is hidden the way a browser hides it: the document reports `hidden`, and animation-frame callbacks wait, queued,
// until it is shown again; timers and the worker clock run on.) Writes the samples as JSON with a summary of each
// series' trend.
import { writeFileSync } from 'node:fs';
import { flags, open, session } from './headless.ts';

const f = flags(process.argv.slice(2));
const speed = Number(f.get('speed') ?? 1);
const worldHours = f.has('hours') ? Number(f.get('hours')) : null;
const minutes = f.has('minutes') ? Number(f.get('minutes')) : null;
const every = Number(f.get('every') ?? 60);
const hidden = Number(f.get('hidden') ?? 0);
const [w, h] = (f.get('size') ?? '1280x720').split('x').map(Number);
const out = f.get('out') ?? 'soak.json';

type Sample = {
  t: number;
  worldHours: number;
  km: number;
  heapMB: number;
  textures: number;
  buffers: number;
  framebuffers: number;
  textureMB: number;
  frames: number;
  p50: number;
  p99: number;
  cpuP50: number;
  voices: number;
  visible: string;
  stage: string;
  biome: string;
  weather: string;
  /** Footsteps the sound has played so far (they go on while the page is hidden). */
  steps: number;
};

type Probe = { soak(): Omit<Sample, 't' | 'visible'>; error: string | null };

const q = new URLSearchParams({ seed: f.get('seed') ?? 'soak', speed: String(speed) });
if (f.has('day')) q.set('day', f.get('day') ?? '60');
const s = await session();
const samples: Sample[] = [];
const errors: string[] = [];
try {
  const { page } = await open(s, w, h, q);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  let isHidden = false;
  if (hidden > 0) {
    await page.evaluate(() => {
      const w = window as unknown as { requestAnimationFrame: typeof requestAnimationFrame; __show?: () => void };
      const raf = window.requestAnimationFrame.bind(window);
      const waiting: FrameRequestCallback[] = [];
      w.requestAnimationFrame = (cb: FrameRequestCallback): number => {
        waiting.push(cb);
        return 0;
      };
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      w.__show = () => {
        delete (document as unknown as Record<string, unknown>).hidden;
        delete (document as unknown as Record<string, unknown>).visibilityState;
        w.requestAnimationFrame = raf;
        document.dispatchEvent(new Event('visibilitychange'));
        for (const cb of waiting.splice(0)) raf(cb);
      };
    });
    isHidden = true;
  }
  const start = Date.now();
  let startHours = -1;
  for (;;) {
    await new Promise((r) => setTimeout(r, every * 1000));
    const t = (Date.now() - start) / 60000;
    if (isHidden && t >= hidden) {
      await page.evaluate(() => (window as unknown as { __show(): void }).__show());
      isHidden = false;
    }
    const probe = (await page.evaluate(() => {
      const w = (window as unknown as { __wander: Probe }).__wander;
      const sound = (w as unknown as { sound(): { body?: { step?: number } } | null }).sound();
      return { sample: { ...w.soak(), steps: sound?.body?.step ?? 0 }, error: w.error, visible: document.visibilityState };
    })) as { sample: Omit<Sample, 't' | 'visible'>; error: string | null; visible: string };
    if (probe.error !== null) errors.push(probe.error);
    if (startHours < 0) startHours = probe.sample.worldHours;
    const sample: Sample = { t: Math.round(t * 10) / 10, visible: probe.visible, ...probe.sample };
    samples.push(sample);
    process.stdout.write(
      `${sample.t} min · ${(sample.worldHours - startHours).toFixed(1)} world h · ${sample.km} km · heap ${sample.heapMB} MB · tex ${sample.textures} (${sample.textureMB} MB) buf ${sample.buffers} fb ${sample.framebuffers} · frame p50 ${sample.p50} p99 ${sample.p99} ms (${sample.frames}) · voices ${sample.voices} · steps ${sample.steps} · ${sample.visible} · ${sample.stage} ${sample.biome} ${sample.weather}${errors.length ? ` · ERRORS ${errors.length}` : ''}\n`,
    );
    writeFileSync(out, `${JSON.stringify({ speed, size: `${w}×${h}`, hidden, samples, errors }, null, 1)}\n`);
    if (worldHours !== null && sample.worldHours - startHours >= worldHours) break;
    if (minutes !== null && t >= minutes) break;
  }
  // Trends: first and last quarter of each series, after the first few minutes of warm-up.
  const body = samples.slice(Math.min(3, Math.floor(samples.length / 4)));
  const q4 = Math.max(1, Math.floor(body.length / 4));
  const mean = (xs: Sample[], k: keyof Sample): number => xs.reduce((a, x) => a + (x[k] as number), 0) / xs.length;
  const trend: Record<string, { first: number; last: number; max: number }> = {};
  for (const k of ['heapMB', 'textures', 'buffers', 'framebuffers', 'textureMB', 'p50', 'p99', 'voices'] as const)
    trend[k] = { first: Math.round(mean(body.slice(0, q4), k) * 100) / 100, last: Math.round(mean(body.slice(-q4), k) * 100) / 100, max: Math.max(...body.map((x) => x[k] as number)) };
  writeFileSync(out, `${JSON.stringify({ speed, size: `${w}×${h}`, hidden, worldHours: samples.length ? samples[samples.length - 1].worldHours - startHours : 0, trend, errors, samples }, null, 1)}\n`);
  process.stdout.write(`${JSON.stringify({ trend, errors: errors.length })}\n`);
} finally {
  await s.close();
}
