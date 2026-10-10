import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allTemplates, candidates, fill, localThought, pastOf } from '../src/thoughts.ts';
import type { ThoughtContext } from '../src/thoughts.ts';
import { rng } from '../src/noise.ts';

const base: ThoughtContext = {
  seed: 7,
  biome: 'pine',
  phase: 'afternoon',
  sky: 'clear',
  windy: false,
  cold: false,
  doing: 'walking',
  near: null,
  day: 3,
  cigarettes: 0,
  since: null,
  moon: 0.3,
};

test('no line shouts, uses emoji or speaks to the viewer', () => {
  for (const line of allTemplates()) {
    assert.ok(!line.includes('!'), line);
    assert.ok(!/[\u{1F300}-\u{1FAFF}☀-➿]/u.test(line), line);
    assert.ok(!/\b(you|your|yours)\b/i.test(line), line);
  }
});

test('every placeholder in every line is filled', () => {
  const past = pastOf(1);
  const ctx = { ...base, cigarettes: 3, since: 'the river' };
  for (const line of allTemplates()) {
    const out = fill(line, ctx, past, rng(1));
    assert.ok(!/[{}]/.test(out), `${line} → ${out}`);
  }
});

test('the past is fixed by the seed: three different people, two places', () => {
  const a = pastOf(42);
  const b = pastOf(42);
  assert.deepEqual(a, b);
  assert.equal(a.people.length, 3);
  assert.equal(new Set(a.people.map((p) => p.who)).size, 3);
  assert.equal(a.places.length, 2);
  assert.notDeepEqual(pastOf(42), pastOf(43));
});

test('the same context and random numbers give the same thought', () => {
  assert.equal(localThought(base, rng(5)), localThought(base, rng(5)));
});

test('a recent line is not said again', () => {
  const random = rng(9);
  const recent: string[] = [];
  for (let i = 0; i < 20; i++) {
    const line = localThought(base, random, recent);
    assert.ok(!recent.includes(line), line);
    recent.push(line);
  }
});

test('what is around him weighs more than the general', () => {
  const near = { ...base, near: 'house' };
  const random = rng(3);
  let house = 0;
  for (let i = 0; i < 400; i++) if (/house|window|cooking/i.test(localThought(near, random))) house++;
  assert.ok(house > 60, `house lines ${house}/400`);
});

test('a cigarette count is only spoken when there is one', () => {
  assert.ok(candidates({ ...base, doing: 'smoking' }).every((c) => !c.line.includes('{Ordinal}')));
  assert.ok(candidates({ ...base, doing: 'smoking', cigarettes: 3, since: 'the bridge' }).some((c) => c.line.includes('{Ordinal}')));
});

test('hundreds of different things to say', () => {
  const lines = new Set<string>();
  const phases = ['dawn', 'morning', 'noon', 'afternoon', 'golden', 'dusk', 'blue', 'night', 'late'] as const;
  const skies = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'] as const;
  const doings = ['walking', 'looking', 'sitting', 'smoking', 'sheltering', 'camp', 'waking'] as const;
  const biomes = ['pine', 'birch', 'meadow', 'autumn', 'plateau', 'pass', 'coast', 'desert', 'tundra', 'swamp', 'saltflat', 'stones', 'ruins', 'rail'];
  const near = [null, 'house', 'chapel', 'lighthouse', 'mast', 'car', 'bridge', 'train', 'circle', 'shrine', 'skeleton', 'camp'];
  for (const seed of [1, 2, 3, 4])
    for (const phase of phases)
      for (const sky of skies)
        for (const doing of doings) {
          const ctx = { ...base, seed, phase, sky, doing, cigarettes: 2, since: 'the chapel', biome: biomes[(seed * 5 + phases.indexOf(phase)) % biomes.length], near: near[(seed + skies.indexOf(sky) * 3) % near.length] };
          const random = rng(seed);
          for (const c of candidates(ctx)) for (let k = 0; k < 12; k++) lines.add(fill(c.line, ctx, pastOf(seed), random));
        }
  assert.ok(lines.size >= 500, `only ${lines.size} lines`);
});

test('one road alone has hundreds of things to say', () => {
  const lines = new Set<string>();
  const random = rng(11);
  for (let i = 0; i < 20000; i++) {
    const phases = ['dawn', 'morning', 'noon', 'afternoon', 'golden', 'dusk', 'blue', 'night', 'late'] as const;
    const skies = ['clear', 'cloudy', 'fog', 'rain', 'snow', 'storm'] as const;
    const ctx = { ...base, phase: phases[i % phases.length], sky: skies[(i >> 3) % skies.length] };
    lines.add(localThought(ctx, random));
  }
  assert.ok(lines.size >= 300, `only ${lines.size} lines`);
});
