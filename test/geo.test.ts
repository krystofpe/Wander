import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METRES_PER_DEGREE, Projection, mercator, tileBounds, tileKey, tileOf, unmercator } from '../src/geo.ts';

test('the projection round-trips, one unit east is scale metres, and y grows south', () => {
  const p = new Projection(50.088, 14.414, 3);
  const { lat, lon } = p.toLatLon(123.4, -56.7);
  const back = p.toWorld(lat, lon);
  assert.ok(Math.abs(back.x - 123.4) < 1e-6 && Math.abs(back.y + 56.7) < 1e-6, `${back.x}, ${back.y}`);
  const east = p.toLatLon(1, 0);
  const metres = (east.lon - 14.414) * METRES_PER_DEGREE * Math.cos((50.088 * Math.PI) / 180);
  assert.ok(Math.abs(metres - 3) < 1e-6, `${metres} m`);
  const south = p.toLatLon(0, 1);
  assert.ok(south.lat < 50.088);
  assert.ok(Math.abs((50.088 - south.lat) * METRES_PER_DEGREE - 3) < 1e-6);
});

test('mercator and tile maths match known values', () => {
  assert.deepEqual(tileOf(50.0875, 14.4213, 13), { tx: 4424, ty: 2775 });
  const { px, py } = mercator(0, 0, 0);
  assert.ok(Math.abs(px - 128) < 1e-9 && Math.abs(py - 128) < 1e-9);
  const back = unmercator(px, py, 0);
  assert.ok(Math.abs(back.lat) < 1e-9 && Math.abs(back.lon) < 1e-9);
  const b = tileBounds(13, 4424, 2775);
  assert.ok(b.south < 50.0875 && 50.0875 < b.north && b.west < 14.4213 && 14.4213 < b.east);
  assert.ok(b.north - b.south < 0.03 && b.east - b.west < 0.05, 'a zoom-13 tile spans a few kilometres');
  assert.equal(tileKey(13, 4424, 2775), '13/4424/2775');
});
