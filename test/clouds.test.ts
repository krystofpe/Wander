import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYERS } from '../src/layers.ts';
import { seedOf } from '../src/options.ts';
import { Chunk } from '../src/paint/chunk.ts';
import { paintClouds } from '../src/paint/clouds.ts';

test('the cloud deck comes down from the top as the sky closes, level across the sky', () => {
  const layer = LAYERS[0];
  const c = new Chunk(128, layer.height);
  const need = (x: number, row: number): number => c.data[((layer.top + row) * c.w + x) * 2 + 1] & 127;
  for (const u0 of [0, 4096, 131072]) {
    paintClouds(c, seedOf('wander'), layer, u0);
    for (let x = 0; x < c.w; x++) {
      // Above the heaps only the deck is painted: each row needs at least as much cover as the row above it, so the
      // deck shows from the top down, never a whole column at once (that drew hard-edged slabs across the sky).
      for (let row = -43; row < 10; row++) assert.ok(need(x, row) >= need(x, row - 1), `u ${u0 + x}, row ${row}`);
      assert.ok(need(x, 10) - need(x, -44) >= 4, `u ${u0 + x}: the deck comes down, not all at once`);
      // Next to each other, columns hardly differ: its edge waves, it does not step.
      if (x > 0) for (let row = -44; row < 10; row++) assert.ok(Math.abs(need(x, row) - need(x - 1, row)) <= 1, `u ${u0 + x}, row ${row}`);
    }
  }
});
