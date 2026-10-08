import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_LENGTH, LANTERN_RADIUS } from '../src/config.ts';
import {
  Atmosphere,
  Fronts,
  dropAt,
  hourAt,
  lanternLight,
  phaseName,
  sunlight,
  weatherName,
  windArrow,
} from '../src/ambient.ts';
import type { Ambient } from '../src/ambient.ts';

const amb = (overrides: Partial<Ambient> = {}): Ambient => ({
  gameTime: 0,
  realTime: 0,
  hour: 12,
  phase: 'afternoon',
  lightR: 1,
  lightG: 1,
  lightB: 1,
  daylight: 1,
  windX: 1,
  windY: 0,
  windStrength: 0.5,
  front: 0,
  cloudCover: 0.3,
  ...overrides,
});

test('the clock starts at 08:00 and wraps after a day', () => {
  assert.equal(hourAt(0), 8);
  assert.ok(Math.abs(hourAt(DAY_LENGTH / 2) - 20) < 1e-9);
  assert.ok(Math.abs(hourAt(DAY_LENGTH) - 8) < 1e-9);
});

test('phase names follow the hours', () => {
  assert.equal(phaseName(6), 'dawn');
  assert.equal(phaseName(8), 'morning');
  assert.equal(phaseName(13), 'afternoon');
  assert.equal(phaseName(18), 'dusk');
  assert.equal(phaseName(23), 'night');
  assert.equal(phaseName(2), 'night');
});

test('light is dimmest at night and full at noon', () => {
  const sum = (l: readonly number[]): number => l[0] + l[1] + l[2];
  const night = sunlight(2);
  const dusk = sunlight(18.5);
  const noon = sunlight(12);
  assert.equal(noon[3], 1);
  assert.equal(night[3], 0);
  assert.ok(sum(night) < sum(dusk) && sum(dusk) < sum(noon));
});

test('sunlight is continuous across midnight', () => {
  const late = sunlight(23.999);
  const early = sunlight(0);
  for (let i = 0; i < 4; i++) assert.ok(Math.abs(late[i] - early[i]) < 1e-3);
});

test('fronts follow a seeded schedule', () => {
  const list = new Fronts(9).until(3600);
  assert.deepEqual(new Fronts(9).until(3600), list);
  assert.ok(list.length >= 8);
  assert.ok(list[0].start >= 60 && list[0].start <= 120);
  for (let i = 0; i < list.length; i++) {
    const duration = list[i].end - list[i].start;
    assert.ok(duration >= 30 && duration <= 90);
    if (i > 0) {
      const gap = list[i].start - list[i - 1].end;
      assert.ok(gap >= 120 && gap <= 300);
    }
  }
});

test('a front fades in and out over 10 seconds', () => {
  const fronts = new Fronts(9);
  const f = fronts.until(200)[0];
  assert.equal(fronts.intensity(f.start - 1), 0);
  assert.ok(Math.abs(fronts.intensity(f.start + 5) - 0.5) < 1e-9);
  assert.equal(fronts.intensity((f.start + f.end) / 2), 1);
  assert.ok(Math.abs(fronts.intensity(f.end - 5) - 0.5) < 1e-9);
  assert.equal(fronts.intensity(f.end + 1), 0);
});

test('the atmosphere is deterministic for the same seed and steps', () => {
  const a = new Atmosphere(5);
  const b = new Atmosphere(5);
  for (let i = 0; i < 300; i++) {
    a.step(1 / 60, i < 150 ? 1 : 20);
    b.step(1 / 60, i < 150 ? 1 : 20);
  }
  assert.deepEqual(a.snapshot(), b.snapshot());
  assert.equal(a.cloud(10, 20, 0.5), b.cloud(10, 20, 0.5));
  assert.equal(a.seaWave(10, 20), b.seaWave(10, 20));
});

test('time-lapse speeds up game time but not real time', () => {
  const a = new Atmosphere(5);
  a.step(1, 20);
  assert.equal(a.realTime, 1);
  assert.equal(a.gameTime, 20);
});

test('start hour and forced front options', () => {
  const s = new Atmosphere(5, { startHour: 10, forceFront: 1 }).snapshot();
  assert.ok(Math.abs(s.hour - 10) < 1e-9);
  assert.equal(s.front, 1);
  assert.ok(s.lightR < 1, 'a front dims the light');
});

test('more cover means more cloud, always within 0..1', () => {
  const atm = new Atmosphere(2);
  let thin = 0;
  let thick = 0;
  for (let i = 0; i < 400; i++) {
    const a = atm.cloud(i * 37, i * 11, 0.1);
    const b = atm.cloud(i * 37, i * 11, 0.9);
    assert.ok(a >= 0 && a <= 1 && b >= 0 && b <= 1);
    thin += a;
    thick += b;
  }
  assert.ok(thick > thin);
});

test('the lantern glows around you at night and not at noon', () => {
  const night = amb({ daylight: 0 });
  assert.ok(lanternLight(0, 0, night) > 0.9);
  assert.ok(lanternLight(5, 0, night) < lanternLight(2, 0, night));
  assert.equal(lanternLight(LANTERN_RADIUS, 0, night), 0);
  assert.equal(lanternLight(0, 0, amb({ daylight: 1 })), 0);
});

test('rain follows the wind, snow falls where it is cold, nothing falls without a front', () => {
  const drops = (a: Ambient, cold: boolean): number[] => {
    const seen = new Set<number>();
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        const d = dropAt(x, y, a, cold, 1);
        if (d !== 0) seen.add(d);
      }
    }
    return [...seen].sort((p, q) => p - q);
  };
  assert.deepEqual(drops(amb({ front: 0 }), false), []);
  assert.deepEqual(drops(amb({ front: 1, windX: 0.9, windY: 0.4 }), false), [0x5c]); // \
  assert.deepEqual(drops(amb({ front: 1, windX: 0.9, windY: -0.4 }), false), [0x2f]); // /
  assert.deepEqual(drops(amb({ front: 1, windX: 0.1, windY: 1 }), false), [0x7c]); // |
  assert.deepEqual(drops(amb({ front: 1 }), true), [0x2a, 0xb7]); // * ·
});

test('wind arrows point where the wind blows', () => {
  assert.equal(windArrow(1, 0), '→');
  assert.equal(windArrow(0.7, 0.7), '↘');
  assert.equal(windArrow(0, 1), '↓');
  assert.equal(windArrow(-1, 0), '←');
  assert.equal(windArrow(0, -1), '↑');
  assert.equal(windArrow(0.7, -0.7), '↗');
});

test('weather names', () => {
  assert.equal(weatherName(amb({ front: 0.5 }), true), 'Snow');
  assert.equal(weatherName(amb({ front: 0.5 }), false), 'Rain');
  assert.equal(weatherName(amb({ cloudCover: 0.8 }), false), 'Cloudy');
  assert.equal(weatherName(amb(), false), 'Clear');
});
