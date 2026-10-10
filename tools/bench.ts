// npm run bench -- [--seconds 30] [--sizes 1920x1080,3840x2160] [--out FILE.json]
// Runs the in-page bench (?bench=SEC) in headless Chromium on the GPU, in a few scenes at each size: a walk through
// the pine forest at golden hour, a storm at dusk on the meadow (every weather pass on), a night camp with the fire,
// and a fast walk that streams chunks in quickly. Prints frame interval, CPU and GPU time, p50 and p99.
import { writeFileSync } from 'node:fs';
import { flags, open, session } from './headless.ts';
import { TIMES } from './places.ts';

const f = flags(process.argv.slice(2));
const seconds = Number(f.get('seconds') ?? 30);
const sizes = (f.get('sizes') ?? '1920x1080,3840x2160').split(',').map((x) => x.split('x').map(Number) as [number, number]);
const SCENES: Record<string, Record<string, string>> = {
  'pine golden': { seed: 'wander', biome: 'pine', hour: String(TIMES.golden), weather: 'clear' },
  'meadow storm dusk': { seed: 'wander', biome: 'meadow', hour: String(TIMES.dusk), weather: 'storm' },
  'pine night camp': { seed: 'wander', biome: 'pine', hour: String(TIMES.blue), weather: 'clear', speed: '4' },
  'fast walk (speed 12)': { seed: 'wander', biome: 'coast', hour: String(TIMES.noon), weather: 'cloudy', speed: '12' },
};

type Report = { fps: number; frames: number; late: number; interval: Stat; cpu: Stat; gpu: Stat | null; width: number; height: number };
type Stat = { p50: number; p99: number; max: number; mean: number };

const s = await session();
const results: { scene: string; size: string; report: Report }[] = [];
try {
  for (const [w, h] of sizes)
    for (const [scene, q] of Object.entries(SCENES)) {
      const { page } = await open(s, w, h, new URLSearchParams({ ...q, bench: String(seconds) }));
      await page.waitForFunction(() => (window as unknown as { __wander: { bench: unknown } }).__wander.bench != null, undefined, { timeout: (seconds + 120) * 1000, polling: 500 });
      const report = (await page.evaluate(() => (window as unknown as { __wander: { bench: unknown } }).__wander.bench)) as Report;
      await page.close();
      results.push({ scene, size: `${w}×${h}`, report });
      const g = report.gpu;
      process.stdout.write(
        `${w}×${h} ${scene.padEnd(22)} ${report.fps} fps · interval p50 ${report.interval.p50} p99 ${report.interval.p99} max ${report.interval.max} ms · cpu p50 ${report.cpu.p50} p99 ${report.cpu.p99} · gpu ${g === null ? 'n/a' : `p50 ${g.p50} p99 ${g.p99}`} · late ${report.late}/${report.frames}\n`,
      );
    }
  if (f.has('out')) writeFileSync(f.get('out') ?? 'bench.json', `${JSON.stringify(results, null, 1)}\n`);
} finally {
  await s.close();
}
