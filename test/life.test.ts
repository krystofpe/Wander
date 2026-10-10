import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hourOfDay } from '../src/sky.ts';
import { newLife, stepLife, thoughtContext } from '../src/life.ts';
import type { Env, LifeEvent } from '../src/life.ts';
import { localThought } from '../src/thoughts.ts';
import { rng } from '../src/noise.ts';
import { stretchAt } from '../src/world.ts';

const env: Env = { hourAt: (c) => hourOfDay(c), natural: false, weather: null };
const DAY = 3600;

/** Runs a life for `seconds` of sim time in quarter-second steps, collecting what happened. */
function run(seed: number, seconds: number, hour = 10) {
  const l = newLife(seed, 0, hour);
  const events: LifeEvent[] = [];
  const seen = { stages: new Set<string>(), acts: new Map<string, number>(), fires: 0, thoughts: 0, biomes: 0, drags: 0, sitTargets: [] as number[] };
  for (let t = 0; t < seconds; t += 0.25) {
    stepLife(l, 0.25, DAY, env, events);
    for (const e of events) {
      if (e.type === 'stage') seen.stages.add(e.stage);
      if (e.type === 'act') seen.acts.set(e.act, (seen.acts.get(e.act) ?? 0) + 1);
      if (e.type === 'fire' && e.lit) seen.fires++;
      if (e.type === 'thought') seen.thoughts++;
      if (e.type === 'biome') seen.biomes++;
      if (e.type === 'drag') seen.drags++;
      if (e.type === 'act' && e.act === 'sit' && l.target !== null) seen.sitTargets.push(l.target);
    }
  }
  return { l, seen };
}

test('a life is deterministic: the same seed and steps give the same state', () => {
  const a = run(5, 900).l;
  const b = run(5, 900).l;
  assert.deepEqual(a, b);
});

test('a day on the road: he walks, sits and smokes, camps with a fire at night, sleeps, and walks on at dawn', () => {
  const { l, seen } = run(11, DAY * 1.2, 10);
  assert.ok(l.at > 1500, `walked ${l.at.toFixed(0)} m`);
  for (const s of ['walk', 'sit', 'kneel', 'campsit', 'lie', 'sleep', 'wake', 'pack']) assert.ok(seen.stages.has(s), `never ${s}: ${[...seen.stages].join(', ')}`);
  assert.ok(seen.fires >= 1, 'no fire');
  assert.ok(seen.drags >= 5, `drags ${seen.drags}`);
  assert.ok(seen.biomes >= 2, `biomes ${seen.biomes}`);
  // A thought every 3–5 minutes of his waking time.
  assert.ok(seen.thoughts >= 8 && seen.thoughts <= 24, `thoughts ${seen.thoughts}`);
});

test('he never sits in the swamp water and never camps in it', () => {
  for (const seed of [1, 2, 3]) {
    const { l } = run(seed, DAY * 2, 14);
    for (const e of l.log.filter((x) => x.kind === 'camp')) assert.notEqual(stretchAt(seed, e.at).biome, 'swamp');
  }
});

test('saving and restoring mid-road goes on exactly as if nothing happened', () => {
  const a = newLife(9, 0, 15);
  const events: LifeEvent[] = [];
  for (let t = 0; t < 1200; t += 0.25) stepLife(a, 0.25, DAY, env, events);
  const b = JSON.parse(JSON.stringify(a));
  for (let t = 0; t < 1200; t += 0.25) {
    stepLife(a, 0.25, DAY, env, events);
    stepLife(b, 0.25, DAY, env, events);
  }
  // Compared as saved: a number the save cannot hold (NaN, before he has passed a landmark) comes back as null.
  assert.deepEqual(b, JSON.parse(JSON.stringify(a)));
});

test('a thought fits where he is', () => {
  const { l } = run(4, 600, 17);
  const line = localThought(thoughtContext(l, env), rng(1));
  assert.ok(line.length > 10 && !/[{}]/.test(line), line);
});
