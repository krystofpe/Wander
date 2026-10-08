import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rng } from '../src/noise.ts';
import { decodePng } from '../src/png.ts';
import { encodePng } from './support/encode-png.ts';

function pixels(count: number): Uint8Array {
  const r = rng(9);
  return Uint8Array.from({ length: count }, () => Math.floor(r() * 256));
}

test('an RGB image through every filter decodes to the original pixels', () => {
  const original = pixels(7 * 10 * 3);
  const png = decodePng(encodePng(7, 10, 3, original));
  assert.equal(png.width, 7);
  assert.equal(png.height, 10);
  assert.equal(png.channels, 3);
  assert.deepEqual(png.data, original);
});

test('RGBA and greyscale images decode too', () => {
  const rgba = pixels(5 * 6 * 4);
  assert.deepEqual(decodePng(encodePng(5, 6, 4, rgba)).data, rgba);
  const grey = pixels(9 * 5);
  const png = decodePng(encodePng(9, 5, 1, grey));
  assert.equal(png.channels, 1);
  assert.deepEqual(png.data, grey);
});

test('anything but 8-bit non-interlaced PNGs is rejected with a clear error', () => {
  assert.throws(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])), /not a PNG/);
  assert.throws(() => decodePng(encodePng(2, 2, 3, pixels(12), 16)), /unsupported PNG: 16-bit/);
});
