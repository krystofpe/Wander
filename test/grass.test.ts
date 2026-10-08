import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLADES, GRASS } from '../src/config.ts';
import { Trail, bladeGlyph, windLean } from '../src/grass.ts';
import type { Ambient } from '../src/ambient.ts';

const amb = (windX: number, windStrength: number): Ambient => ({
  gameTime: 0,
  realTime: 0,
  hour: 12,
  phase: 'afternoon',
  lightR: 1,
  lightG: 1,
  lightB: 1,
  daylight: 1,
  windX,
  windY: 0,
  windStrength,
  front: 0,
  cloudCover: 0.3,
});

const TALL = 1; // (1 & 3) !== 0
const SHORT = 4; // (4 & 3) === 0

test('a tall blade stands, leans with the lean, and lies flat when pushed hard', () => {
  assert.equal(bladeGlyph(0, 0, TALL), BLADES.upright);
  assert.equal(bladeGlyph(0.1, 0, TALL), BLADES.upright);
  assert.equal(bladeGlyph(0.5, 0, TALL), BLADES.right);
  assert.equal(bladeGlyph(-0.5, 0, TALL), BLADES.left);
  assert.equal(bladeGlyph(0, 0.9, TALL), BLADES.flat);
  assert.equal(bladeGlyph(0.6, 0.6, TALL), BLADES.flat);
});

test('blades do not all flip at once', () => {
  assert.equal(bladeGlyph(0.25, 0, 1), BLADES.right);
  assert.equal(bladeGlyph(0.25, 0, 255), BLADES.upright);
});

test('short blades only stand or lie flat', () => {
  assert.equal(bladeGlyph(0.5, 0, SHORT), BLADES.short);
  assert.equal(bladeGlyph(0, 0.9, SHORT), BLADES.shortFlat);
});

test('wind lean follows the wind, grows with gusts, and never flattens on its own', () => {
  assert.ok(windLean(amb(1, 1), 1) > 0);
  assert.ok(windLean(amb(-1, 1), 1) < 0);
  assert.equal(windLean(amb(1, 0), 1), 0);
  assert.ok(windLean(amb(1, 1), 1) > windLean(amb(1, 1), 0));
  assert.ok(Math.abs(windLean(amb(1, 1), 1)) < GRASS.flatThreshold);
});

test('a fresh trail sample pushes nearby blades away, and the push fades with age', () => {
  const trail = new Trail();
  trail.push(10, 10, 0);
  const [bx, by] = trail.bendAt(11, 10, 0);
  assert.ok(bx > 0 && Math.abs(by) < 1e-9, `east of you: ${bx}, ${by}`);
  assert.ok(trail.bendAt(9, 10, 0)[0] < 0, 'west of you blades are pushed west');
  assert.ok(trail.bendAt(10, 10, 0)[1] > 0, 'right under you blades are pushed south');
  const later = trail.bendAt(11, 10, 0.6)[0];
  assert.ok(later > 0 && later < bx, `fades: ${later} vs ${bx}`);
  assert.deepEqual(trail.bendAt(11, 10, 2), [0, 0]);
  assert.deepEqual(trail.bendAt(10 + GRASS.bendRadius, 10, 0), [0, 0]);
});

test('the trail keeps recent samples only, at most one per 50 ms', () => {
  const trail = new Trail();
  assert.equal(trail.bounds(0), null);
  trail.push(0, 0, 0);
  trail.push(1, 0, 0.01); // too soon after the last sample: ignored
  assert.deepEqual(trail.bounds(0.01), [-GRASS.bendRadius, -GRASS.bendRadius, GRASS.bendRadius, GRASS.bendRadius]);
  for (let i = 1; i <= 200; i++) trail.push(i, 0, i * 0.05);
  assert.ok(trail.size >= 30 && trail.size <= GRASS.maxSamples, `size ${trail.size}`);
  assert.deepEqual(trail.bendAt(0, 0, 10), [0, 0], 'the start of the walk is forgotten');
});

test('standing still keeps the blades under you flat', () => {
  const trail = new Trail();
  for (let t = 0; t <= 3; t += 1 / 60) trail.push(5, 5, t);
  const [, south] = trail.bendAt(5, 5, 3);
  assert.ok(south >= 1, `still pushed down after 3 s: ${south}`);
});

test('running leaves no gaps in the trail', () => {
  const trail = new Trail();
  for (let i = 0; i < 10; i++) trail.push(i * 1.2, 0, i * 0.05); // 24 units/s sampled every 50 ms
  for (let x = 0.6; x < 10.8; x += 1.2) {
    const [bx, by] = trail.bendAt(x, 0.5, 0.45);
    assert.ok(Math.hypot(bx, by) > 0.1, `no bend at ${x}`);
  }
});
