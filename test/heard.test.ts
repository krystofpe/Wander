import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEARD, hear, newMix, windSpeed } from '../web/audio/heard.ts';
import type { Hear } from '../web/audio/heard.ts';
import { BIOME_IDS } from '../src/biomes.ts';
import { namedWeather } from '../src/sky.ts';
import type { Weather } from '../src/sky.ts';

const w = (name: string): Weather => {
  const x = namedWeather(name);
  if (x === null) throw new Error(name);
  return x;
};

const moment = (over: Partial<Hear>): Hear => ({
  seed: 7,
  time: 100,
  blend: { a: 'meadow', b: 'meadow', k: 0 },
  place: 3,
  hour: 12,
  sun: 40,
  weather: w('clear'),
  stage: 'walk',
  walked: 0,
  ground: 'grass',
  fire: 0,
  fireX: 0.5,
  himX: 0.38,
  landmark: null,
  speed: 1,
  ...over,
});

test('every biome has its sound', () => {
  for (const id of BIOME_IDS) {
    const h = HEARD[id];
    assert.ok(h.mode.length >= 5, id);
    for (const v of [h.trees, h.leaves, h.whistle, h.crickets, h.birds, h.owls, h.surf, h.water, h.train]) assert.ok(v >= 0 && v <= 1, id);
  }
});

test('the wind stays between still and a gale, gusting, and blows harder in a storm', () => {
  let calm = 0;
  let storm = 0;
  for (let t = 0; t < 3600; t += 0.7) {
    const a = windSpeed(0.15, t, 7);
    const b = windSpeed(0.85, t, 7);
    assert.ok(a >= 0 && a <= 1 && b >= 0 && b <= 1);
    calm += a;
    storm += b;
  }
  assert.ok(storm > calm * 2, `${storm} vs ${calm}`);
  assert.equal(windSpeed(0.4, 12.3, 9), windSpeed(0.4, 12.3, 9));
});

test('birds sing at dawn and not at night; crickets on warm nights, not in the cold or the rain', () => {
  const m = newMix();
  hear(m, moment({ hour: 6.5, sun: 3 }));
  const dawn = m.dawn;
  hear(m, moment({ hour: 13, sun: 45 }));
  const noon = m.dawn;
  hear(m, moment({ hour: 1, sun: -30 }));
  assert.ok(dawn > 0.8 && noon < dawn && m.dawn === 0, `${dawn} ${noon} ${m.dawn}`);
  assert.equal(m.night, 1);
  assert.ok(m.temperature > 11, 'a meadow night is mild');
  hear(m, moment({ hour: 1, sun: -30, blend: { a: 'tundra', b: 'tundra', k: 0 } }));
  assert.ok(m.temperature < 11 && m.crickets === 0, 'no crickets on the tundra');
  hear(m, moment({ hour: 1, sun: -30, weather: w('rain') }));
  assert.ok(m.rain > 0.5);
});

test('a border blends the sounds of both sides', () => {
  const m = newMix();
  hear(m, moment({ blend: { a: 'pine', b: 'coast', k: 0.5 } }));
  assert.ok(Math.abs(m.trees - (HEARD.pine.trees + HEARD.coast.trees) / 2) < 1e-9);
  assert.ok(Math.abs(m.surf - 0.5) < 1e-9);
  assert.ok(m.mode === HEARD.coast.mode);
  hear(m, moment({ stage: 'sleep', fire: 0.8 }));
  assert.ok(m.sleeping && m.resting && m.fire === 0.8);
});
