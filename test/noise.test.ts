import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fbm, hash2, makeNoise, rng } from '../src/noise.ts';

test('same seed gives the same noise, different seeds differ', () => {
  const a = makeNoise(7);
  const b = makeNoise(7);
  const c = makeNoise(8);
  let differs = false;
  for (let i = 0; i < 100; i++) {
    const x = i * 0.37;
    const y = i * -0.61;
    assert.equal(a(x, y), b(x, y));
    if (a(x, y) !== c(x, y)) differs = true;
  }
  assert.ok(differs);
});

test('noise and fbm stay within [-1, 1]', () => {
  const n = makeNoise(3);
  const r = rng(1);
  for (let i = 0; i < 20000; i++) {
    const x = r() * 2000 - 1000;
    const y = r() * 2000 - 1000;
    const v = n(x, y);
    assert.ok(v >= -1 && v <= 1, `noise ${v}`);
    const f = fbm(n, x, y, 5);
    assert.ok(f >= -1 && f <= 1, `fbm ${f}`);
  }
});

test('noise varies smoothly', () => {
  const n = makeNoise(5);
  for (let i = 0; i < 1000; i++) {
    const x = i * 0.731;
    const y = i * 0.377;
    assert.ok(Math.abs(n(x, y) - n(x + 0.001, y)) < 0.02);
  }
});

test('hash2 is stable, order-sensitive and well spread', () => {
  assert.equal(hash2(10, -20, 3), hash2(10, -20, 3));
  assert.notEqual(hash2(10, -20, 3), hash2(-20, 10, 3));
  const lowBytes = new Set<number>();
  for (let x = 0; x < 50; x++) for (let y = 0; y < 50; y++) lowBytes.add(hash2(x, y, 1) & 0xff);
  assert.ok(lowBytes.size > 200, `only ${lowBytes.size} distinct low bytes`);
});

test('rng is deterministic and within [0, 1)', () => {
  const a = rng(42);
  const b = rng(42);
  for (let i = 0; i < 1000; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
});
