import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOME_NAMES, COLOR_BITS } from '../src/config.ts';
import { lit, mix, quantize } from '../src/color.ts';
import {
  flashAt,
  localHour,
  moonGlyph,
  moonPhase,
  moonPosition,
  phaseName,
  seasonOf,
  skyAt,
  sunPosition,
  sunlight,
  weatherAt,
} from '../src/sky.ts';

const at = (y: number, m: number, d: number, h = 12, min = 0): number => new Date(y, m - 1, d, h, min).getTime();

test('colours: quantize keeps the ends and rounds to 2^COLOR_BITS levels; mix and lit', () => {
  assert.equal(quantize(0), 0);
  assert.equal(quantize(255), 255);
  assert.equal(quantize(-4), 0);
  assert.equal(quantize(300), 255);
  const levels = new Set<number>();
  for (let c = 0; c < 256; c++) levels.add(quantize(c));
  assert.equal(levels.size, 1 << COLOR_BITS);
  assert.equal(mix(0x000000, 0xffffff, 0), 0x000000);
  assert.equal(mix(0x000000, 0xffffff, 1), 0xffffff);
  assert.equal(mix(0x102030, 0x102030, 0.5), 0x102030);
  assert.equal(lit(0xffffff, 1, 1, 1), 0xffffff);
  assert.equal(lit(0xffffff, 0, 0, 0), 0x000000);
});

test('the hour, the season and the phase of the day come from the local clock', () => {
  assert.equal(localHour(at(2026, 10, 8, 21, 30)), 21.5);
  assert.equal(seasonOf(at(2026, 10, 8)), 'autumn');
  assert.equal(seasonOf(at(2026, 1, 15)), 'winter');
  assert.equal(seasonOf(at(2026, 4, 1)), 'spring');
  assert.equal(seasonOf(at(2026, 7, 1)), 'summer');
  assert.equal(phaseName(6), 'dawn');
  assert.equal(phaseName(13), 'afternoon');
  assert.equal(phaseName(23), 'night');
});

test('the moon: new at a known new moon, full half a cycle later, with glyphs that match', () => {
  const newMoon = Date.UTC(2000, 0, 6, 18, 14);
  assert.ok(moonPhase(newMoon) < 0.001 || moonPhase(newMoon) > 0.999);
  assert.ok(Math.abs(moonPhase(newMoon + 14.765 * 86400000) - 0.5) < 0.001);
  assert.equal(moonGlyph(0), '○');
  assert.equal(moonGlyph(0.5), '●');
  assert.equal(moonGlyph(0.25), '◑'); // first quarter: the right half lit
  assert.equal(moonGlyph(0.75), '◐');
});

test('sun by day, moon by night', () => {
  assert.equal(sunPosition(3), null);
  assert.ok((sunPosition(12.75)?.y ?? 0) > 0.99);
  assert.equal(moonPosition(12), null);
  assert.ok(moonPosition(1) !== null);
  assert.ok(sunlight(12)[3] > sunlight(0)[3]);
});

test('weather is the same for the same time and seed, and stays in range', () => {
  for (const biome of BIOME_NAMES) {
    for (let i = 0; i < 200; i++) {
      const t = at(2026, 10, 8) + i * 7 * 60000;
      const w = weatherAt(t, 42, biome);
      assert.deepEqual(w, weatherAt(t, 42, biome));
      assert.ok(w.cloud >= 0 && w.cloud <= 1 && w.precip >= 0 && w.precip <= 1, `${biome} ${JSON.stringify(w)}`);
      if (w.kind === 'none') assert.equal(w.precip, 0);
    }
  }
});

test('the desert is dry, the swamp is wet, and the tundra snows', () => {
  const share = (biome: (typeof BIOME_NAMES)[number]): number => {
    let wet = 0;
    for (let i = 0; i < 2000; i++) if (weatherAt(at(2026, 6, 1) + i * 25 * 60000, 7, biome).kind !== 'none') wet++;
    return wet / 2000;
  };
  assert.ok(share('desert') < 0.1);
  assert.ok(share('swamp') > 0.15);
  for (let i = 0; i < 2000; i++) {
    const w = weatherAt(at(2026, 6, 1) + i * 25 * 60000, 7, 'tundra');
    if (w.kind !== 'none') assert.equal(w.kind, 'snow');
  }
});

test('midnight is dark and noon is bright', () => {
  const night = skyAt(at(2026, 10, 8, 0), 3, 'meadow');
  const noon = skyAt(at(2026, 10, 8, 12), 3, 'meadow');
  assert.ok(night.daylight === 0 && noon.daylight === 1);
  assert.ok(noon.lightR > night.lightR);
  assert.ok(Math.abs(night.wind) <= 1);
});

test('lightning flashes only in storms', () => {
  const calm = { cloud: 0, precip: 0, kind: 'none', storm: false, name: 'Clear' } as const;
  const storm = { cloud: 1, precip: 1, kind: 'rain', storm: true, name: 'Storm' } as const;
  let flashes = 0;
  for (let t = 0; t < 600; t += 0.05) {
    assert.equal(flashAt(t, 1, calm), false);
    if (flashAt(t, 1, storm)) flashes++;
  }
  assert.ok(flashes > 0);
});
