import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOME_NAMES } from '../src/creature/config.ts';
import { daylightAt, localHour, moonPhase, phaseName, seasonOf, skyAt, weatherAt, weatherWords } from '../src/creature/sky.ts';
import type { Weather } from '../src/creature/sky.ts';
import { flashAt } from '../src/sky.ts';

const at = (y: number, m: number, d: number, h = 12, min = 0): number => new Date(y, m - 1, d, h, min).getTime();
const NAMES = ['clear', 'cloudy', 'overcast', 'fog', 'rain', 'snow', 'storm'];

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

test('the moon: new at a known new moon, full half a cycle later', () => {
  const newMoon = Date.UTC(2000, 0, 6, 18, 14);
  assert.ok(moonPhase(newMoon) < 0.001 || moonPhase(newMoon) > 0.999);
  assert.ok(Math.abs(moonPhase(newMoon + 14.765 * 86400000) - 0.5) < 0.001);
});

test('daylight: none in the small hours, full at noon, rising at dawn and falling at dusk', () => {
  assert.equal(daylightAt(3), 0);
  assert.equal(daylightAt(12), 1);
  assert.equal(daylightAt(23), 0);
  assert.ok(daylightAt(6) > daylightAt(5) && daylightAt(7) > daylightAt(6));
  assert.ok(daylightAt(19) < daylightAt(18) && daylightAt(20) < daylightAt(19));
  for (let h = 0; h < 24; h += 0.25) assert.ok(daylightAt(h) >= 0 && daylightAt(h) <= 1, `hour ${h}`);
});

test('weather is the same for the same time and seed, and stays in range', () => {
  for (const biome of BIOME_NAMES) {
    for (let i = 0; i < 200; i++) {
      const t = at(2026, 10, 8) + i * 7 * 60000;
      const w = weatherAt(t, 42, biome);
      assert.deepEqual(w, weatherAt(t, 42, biome));
      assert.ok(w.cloud >= 0 && w.cloud <= 1 && w.precip >= 0 && w.precip <= 1, `${biome} ${JSON.stringify(w)}`);
      assert.ok(w.fog >= 0 && w.fog <= 1 && Math.abs(w.wind) <= 1, `${biome} ${JSON.stringify(w)}`);
      assert.ok(NAMES.includes(w.name), `${biome} ${w.name}`);
      if (w.kind === 'none') assert.equal(w.precip, 0);
      if (w.storm) assert.equal(w.name, 'storm');
    }
  }
});

test('the meadow is drier than the swamp, and the tundra snows', () => {
  const share = (biome: (typeof BIOME_NAMES)[number]): number => {
    let wet = 0;
    for (let i = 0; i < 2000; i++) if (weatherAt(at(2026, 6, 1) + i * 25 * 60000, 7, biome).kind !== 'none') wet++;
    return wet / 2000;
  };
  assert.ok(share('meadow') < share('swamp'));
  assert.ok(share('swamp') > 0.15);
  for (let i = 0; i < 2000; i++) {
    const w = weatherAt(at(2026, 6, 1) + i * 25 * 60000, 7, 'tundra');
    if (w.kind !== 'none') {
      assert.equal(w.kind, 'snow');
      assert.equal(w.storm, false, 'no thunder in the snow');
    }
  }
});

test('under the canopy a little mist always hangs', () => {
  for (let i = 0; i < 100; i++) {
    const t = at(2026, 10, 8) + i * 25 * 60000;
    assert.ok(weatherAt(t, 3, 'forest').fog > 0);
    if (weatherAt(t, 3, 'meadow').precip === 0) assert.equal(weatherAt(t, 3, 'meadow').fog, 0);
  }
});

test('midnight is dark and noon is bright', () => {
  const night = skyAt(at(2026, 10, 8, 0), 3, 'meadow');
  const noon = skyAt(at(2026, 10, 8, 12), 3, 'meadow');
  assert.ok(night.daylight === 0 && noon.daylight === 1);
  assert.equal(night.phase, 'night');
  assert.equal(noon.season, 'autumn');
  assert.ok(Math.abs(night.weather.wind) <= 1);
  assert.ok(noon.wet >= noon.weather.precip && noon.wet <= 1);
});

test('the weather in its own words', () => {
  const w = (o: Partial<Weather>): Weather => ({ cloud: 0, precip: 0, kind: 'none', storm: false, fog: 0, wind: 0, name: 'clear', ...o });
  assert.equal(weatherWords(w({})), 'clear');
  assert.equal(weatherWords(w({ cloud: 0.4, name: 'cloudy' })), 'partly cloudy');
  assert.equal(weatherWords(w({ cloud: 0.8, name: 'overcast' })), 'cloudy');
  assert.equal(weatherWords(w({ cloud: 1, precip: 0.6, kind: 'rain', name: 'rain' })), 'rain');
  assert.equal(weatherWords(w({ cloud: 1, precip: 0.6, kind: 'snow', name: 'snow' })), 'snow');
  assert.equal(weatherWords(w({ cloud: 1, precip: 1, kind: 'rain', storm: true, name: 'storm' })), 'a storm');
});

test('lightning flashes only in storms', () => {
  const calm: Weather = { cloud: 0, precip: 0, kind: 'none', storm: false, fog: 0, wind: 0, name: 'clear' };
  const storm: Weather = { cloud: 1, precip: 1, kind: 'rain', storm: true, fog: 0.2, wind: 0.8, name: 'storm' };
  let flashes = 0;
  for (let t = 0; t < 600; t += 0.05) {
    assert.equal(flashAt(t, 1, calm), false);
    if (flashAt(t, 1, storm)) flashes++;
  }
  assert.ok(flashes > 0);
});
