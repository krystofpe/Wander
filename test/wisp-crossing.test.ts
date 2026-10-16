import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wispBond, wispCrossing } from '../src/wisp/crossing.ts';
import type { Phase, Visit } from '../src/creature/visit.ts';

const visit = (phase: Phase, k: number): Visit => ({ phase, k, woke: false, night: 1 });
test('crossing choreography joins continuously at every phase boundary', () => {
  const phases: Phase[] = ['opening', 'coming', 'with', 'going', 'closing'];
  for (let i = 0; i < phases.length - 1; i++) assert.deepEqual(wispCrossing(visit(phases[i], 1)), wispCrossing(visit(phases[i + 1], 0)));
  assert.deepEqual(wispCrossing(visit('closing', 1)), wispCrossing(null));
  assert.deepEqual(wispCrossing(visit('opening', 0)), wispCrossing(null));
});
test('a single spirit passes through the opening before travelling to the fire', () => {
  for (const phase of ['opening', 'coming', 'with', 'going', 'closing'] as Phase[]) for (let i = 0; i <= 100; i++) {
    const s = wispCrossing(visit(phase, i / 100));
    assert.ok(s.spirit * s.shown === 0, 'the spirit is never duplicated in both worlds');
    for (const value of Object.values(s)) assert.ok(value >= 0 && value <= 1);
    if (s.camp > 0 && phase === 'coming') assert.equal(s.dream, 0, 'the camp is revealed before travelling to the fire');
  }
  assert.equal(wispCrossing(visit('opening', 0.5)).shown, 0);
  assert.equal(wispCrossing(visit('coming', 0.5)).shown, 1);
  assert.equal(wispCrossing(visit('with', 0.5)).seam, 0, 'the seam closes while it rests');
});

test('on the road the portal stands open only for the wisp to pass, and shuts behind it', () => {
  for (const phase of ['opening', 'with', 'closing'] as Phase[]) for (let i = 0; i <= 100; i++) assert.equal(wispCrossing(visit(phase, i / 100)).gate, 0, `shut while ${phase}`);
  for (const phase of ['coming', 'going'] as Phase[]) for (let i = 0; i <= 1000; i++) {
    const s = wispCrossing(visit(phase, i / 1000));
    if (s.shown > 0 && s.shown < 1) assert.equal(s.gate, 1, `it comes out of, and goes into, an open portal (${phase} ${i / 1000})`);
  }
  assert.equal(wispCrossing(visit('going', 1)).gate, 0, 'shut before the dreaming comes back');
});

test('the greeting occurs only while awake, and sleeping visits dim the guardian', () => {
  const asleep = visit('with', 0.32);
  assert.equal(wispBond(asleep).hand, 0);
  assert.equal(wispBond(asleep).dim, 0.55);
  const awake = { ...asleep, woke: true };
  assert.equal(wispBond(awake).hand, 1);
  assert.equal(wispBond(awake).watch, 0);
  assert.equal(wispBond({ ...awake, k: 0.6 }).hand, 0);
  assert.deepEqual(wispBond(visit('going', 0)), { hand: 0, watch: 0, dim: 1 });
  for (const k of [0.12, 0.88]) {
    const before = wispBond({ ...awake, k: k - 0.00001 });
    const after = wispBond({ ...awake, k: k + 0.00001 });
    assert.ok(Math.abs(before.watch - after.watch) < 0.00001);
  }
});
