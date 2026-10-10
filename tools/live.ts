// npm run live -- [--word W] [--hours N] [--from K]
// Lives the live road's hours one after another, each from its own night's camp, and checks that every hour ends
// where the next begins: asleep by the fire at the next camp. Reports when he reached camp, how far he walked, how
// long he sat, and every hour that did not meet the next.
import { STAGES } from '../src/life.ts';
import type { LifeEvent } from '../src/life.ts';
import { LIVE, STEPS_PER_DAY, campOf, liveEnv, nightStart, stepLive } from '../src/live.ts';
import { seedOf } from '../src/options.ts';
import { hourOfDay } from '../src/sky.ts';
import { flags } from './headless.ts';

const f = flags(process.argv.slice(2));
const seed = seedOf(f.get('word') ?? LIVE.word);
const hours = Number(f.get('hours') ?? 200);
const from = Number(f.get('from') ?? 0);
const env = liveEnv(seed);
const events: LifeEvent[] = [];

const arrivals: number[] = [];
const asleep: number[] = [];
const waited: number[] = [];
const misses: string[] = [];
const stages = new Map<string, number>();
const t0 = performance.now();
for (let k = from; k < from + hours; k++) {
  let l = nightStart(seed, k);
  let arrived = -1;
  let slept = -1;
  let wait = 0;
  for (let i = 1; i < STEPS_PER_DAY; i++) {
    l = stepLive(l, k * STEPS_PER_DAY + i, env, events);
    stages.set(l.stage, (stages.get(l.stage) ?? 0) + 1);
    const h = hourOfDay(l.clock);
    if (arrived < 0 && l.act === 'camp' && l.stage === 'kneel') arrived = h;
    if (arrived >= 0 && slept < 0 && l.stage === 'sleep') slept = h;
    if (l.what === 'ground' && (l.stage === 'sit' || l.stage === 'look')) wait += LIVE.tick;
  }
  const next = campOf(seed, k + 1);
  const ok = Math.abs(l.at - next.at) < 1e-6 && l.stage === 'sleep' && l.fire !== null && l.fire.heat > 0.99 && l.smoking < 0;
  if (!ok) misses.push(`hour ${k}: at ${l.at.toFixed(2)} of ${next.at.toFixed(2)}, ${l.stage}, fire ${l.fire?.heat.toFixed(2) ?? 'none'}, arrived ${arrived.toFixed(2)}`);
  arrivals.push(arrived);
  asleep.push(slept);
  waited.push(wait);
}
const ms = performance.now() - t0;
const q = (a: number[], p: number): number => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
const fmt = (h: number): string => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
const total = [...stages.values()].reduce((a, b) => a + b, 0);
process.stdout.write(
  [
    `${hours} hours from hour ${from} of the road "${f.get('word') ?? LIVE.word}" in ${(ms / 1000).toFixed(1)} s (${(ms / hours).toFixed(1)} ms an hour)`,
    `reached camp (world clock): earliest ${fmt(q(arrivals, 0))}, p10 ${fmt(q(arrivals, 0.1))}, median ${fmt(q(arrivals, 0.5))}, p90 ${fmt(q(arrivals, 0.9))}, latest ${fmt(q(arrivals, 1))}`,
    `asleep by: median ${fmt(q(asleep, 0.5))}, latest ${fmt(q(asleep, 1))} (the next hour starts at ${fmt(LIVE.sleep)})`,
    `waiting by the camp before dusk: median ${q(waited, 0.5).toFixed(0)} s, p90 ${q(waited, 0.9).toFixed(0)} s, max ${q(waited, 1).toFixed(0)} s`,
    `time in each stage: ${STAGES.filter((s) => stages.has(s)).map((s) => `${s} ${(((stages.get(s) ?? 0) / total) * 100).toFixed(1)}%`).join(', ')}`,
    misses.length === 0 ? `every hour met the next: ${hours} of ${hours}` : `${misses.length} hours did not meet the next:\n  ${misses.slice(0, 20).join('\n  ')}`,
    '',
  ].join('\n'),
);
if (misses.length > 0) process.exitCode = 1;
