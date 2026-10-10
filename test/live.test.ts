import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LifeEvent } from '../src/life.ts';
import { LIVE, LIVE_SEED, STEPS_PER_DAY, campOf, liveAt, liveEnv, msOfStep, nightStart, stepAt, stepLive } from '../src/live.ts';
import { hourOfDay } from '../src/sky.ts';

const env = liveEnv(LIVE_SEED);

test('the live road starts at its epoch, one of his days to a real hour', () => {
  assert.equal(stepAt(LIVE.epoch), 0);
  assert.equal(stepAt(LIVE.epoch + 3_600_000), STEPS_PER_DAY);
  assert.equal(stepAt(msOfStep(123_456) + 499), 123_456);
  const l = nightStart(LIVE_SEED, 5);
  assert.equal(hourOfDay(l.clock), LIVE.sleep);
  assert.equal(l.stage, 'sleep');
  assert.equal(l.at, campOf(LIVE_SEED, 5).at);
});

test('the camps are fixed in advance, in order, about a day apart', () => {
  let last = -Infinity;
  for (let k = 0; k < 200; k++) {
    const c = campOf(LIVE_SEED, k);
    assert.deepEqual(campOf(LIVE_SEED, k), c);
    assert.ok(c.at > last + 900 || k === 0, `camp ${k} at ${c.at} after ${last}`);
    assert.ok(Math.abs(c.at - k * LIVE.spacing) <= LIVE.jitter + LIVE.snap + 1e-9);
    last = c.at;
  }
});

test('everyone who opens the page at the same moment sees the same life', () => {
  const n = 9 * STEPS_PER_DAY + 4321;
  const a = liveAt(LIVE_SEED, n, env);
  const b = liveAt(LIVE_SEED, n, env);
  assert.deepEqual(a, b);
  // One who opened it earlier and has watched since is where one who opens it now finds him.
  const events: LifeEvent[] = [];
  let c = liveAt(LIVE_SEED, n - 1500, env);
  for (let i = n - 1499; i <= n; i++) c = stepLive(c, i, env, events);
  assert.deepEqual(c, a);
});

test('every hour ends where the next begins: asleep by the fire at the next camp', () => {
  const events: LifeEvent[] = [];
  for (let k = 0; k < 24; k++) {
    let l = nightStart(LIVE_SEED, k);
    let walked = false;
    let atMost = l.at;
    for (let i = 1; i < STEPS_PER_DAY; i++) {
      l = stepLive(l, k * STEPS_PER_DAY + i, env, events);
      if (l.stage === 'walk' && l.at > atMost) walked = true;
      assert.ok(l.at >= atMost - 1e-9, 'he never goes back');
      atMost = Math.max(atMost, l.at);
      assert.ok(l.at <= campOf(LIVE_SEED, k + 1).at + 1e-9, 'he never walks past the camp');
    }
    const next = nightStart(LIVE_SEED, k + 1);
    assert.ok(walked, `hour ${k}: he walked`);
    assert.ok(Math.abs(l.at - next.at) < 1e-6, `hour ${k}: at ${l.at}, the camp at ${next.at}`);
    assert.equal(l.stage, 'sleep', `hour ${k}`);
    assert.ok(l.fire !== null && l.fire.heat > 0.99 && Math.abs(l.fire.at - next.fire!.at) < 1e-6, `hour ${k}: the fire`);
    assert.equal(l.smoking, -1);
    // The top of the hour starts from the camp.
    assert.deepEqual(stepLive(l, (k + 1) * STEPS_PER_DAY, env, events), next);
  }
});

test('the log of a live night holds the days before it', () => {
  const l = nightStart(LIVE_SEED, 30);
  const camps = l.log.filter((e) => e.kind === 'camp');
  assert.equal(camps.length, 10);
  assert.deepEqual(camps.map((e) => e.at), Array.from({ length: 10 }, (_, i) => campOf(LIVE_SEED, 21 + i).at));
  for (let i = 1; i < l.log.length; i++) assert.ok(l.log[i].at >= l.log[i - 1].at);
});
