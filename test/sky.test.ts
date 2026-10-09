import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayOf,
  dayPhase,
  daylight,
  flashAt,
  hourOfDay,
  moonAt,
  moonPhase,
  namedWeather,
  roadMoon,
  seasonOf,
  shownHour,
  sunAt,
  sunElevation,
  weatherAt,
} from '../src/sky.ts';
import type { Tendency } from '../src/sky.ts';

const mild: Tendency = { wet: 0.3, snow: 0, fog: 0.2, storm: 0.2, cloud: 0.5, wind: 0.4 };

test('world hours give the hour of the day and the day on the road', () => {
  assert.equal(hourOfDay(7), 7);
  assert.equal(hourOfDay(24 * 3 + 21.5), 21.5);
  assert.equal(hourOfDay(-1), 23);
  assert.equal(dayOf(7), 1);
  assert.equal(dayOf(24 * 3 + 1), 4);
});

test('the warped sun: highest at 11, far below at midnight, and the clock shows sunrise at 6 and sunset at 18', () => {
  assert.ok(sunElevation(11) > 50);
  assert.ok(sunElevation(0) < -50);
  let rise = 0;
  let set = 0;
  for (let h = 0; h < 24; h += 0.001) {
    if (sunElevation(h) < 0 && sunElevation(h + 0.001) >= 0) rise = h;
    if (sunElevation(h) >= 0 && sunElevation(h + 0.001) < 0) set = h;
  }
  assert.ok(Math.abs(shownHour(rise) - 6) < 0.05, `sunrise shows ${shownHour(rise)}`);
  assert.ok(Math.abs(shownHour(set) - 18) < 0.05, `sunset shows ${shownHour(set)}`);
  for (let h = 0; h < 23.9; h += 0.1) assert.ok(shownHour(h + 0.1) > shownHour(h), `the clock runs forward at ${h}`);
  assert.ok(sunAt(rise + 0.01).x < 0.02 && sunAt(set - 0.01).x > 0.98, 'rises on the left and sets on the right');
  assert.equal(daylight(0), 0);
  assert.equal(daylight(11), 1);
});

test('the real clock keeps the natural sun', () => {
  assert.ok(Math.abs(sunElevation(6, true)) < 1e-9);
  assert.ok(Math.abs(sunElevation(18, true)) < 1e-9);
  assert.equal(shownHour(15.25, true), 15.25);
});

test('the evening twilight lasts longest: golden, dusk and blue hours fill about a quarter of the day', () => {
  const span = (name: string): number => {
    let n = 0;
    for (let h = 0; h < 24; h += 1 / 60) if (dayPhase(h) === name) n++;
    return n / 60;
  };
  // In a one-hour day, a world hour is 2.5 real minutes.
  const minutes = (name: string): number => span(name) * 2.5;
  assert.ok(minutes('golden') >= 4, `golden ${minutes('golden')} min`);
  assert.ok(minutes('dusk') + minutes('blue') >= 6, `dusk+blue ${minutes('dusk') + minutes('blue')} min`);
  assert.ok(minutes('night') + minutes('late') <= 25, `night ${minutes('night') + minutes('late')} min`);
});

test('the parts of the day come in order and last long enough to see', () => {
  const order: string[] = [];
  for (let h = 0; h < 24; h += 1 / 60) {
    const p = dayPhase(h);
    if (order[order.length - 1] !== p) order.push(p);
  }
  assert.deepEqual(order, ['late', 'dawn', 'morning', 'noon', 'afternoon', 'golden', 'dusk', 'blue', 'night']);
  const span = (name: string): number => {
    let n = 0;
    for (let h = 0; h < 24; h += 1 / 60) if (dayPhase(h) === name) n++;
    return n / 60;
  };
  assert.ok(span('golden') >= 1.5, `golden hour ${span('golden')} h`);
  assert.ok(span('blue') >= 0.75, `blue hour ${span('blue')} h`);
  assert.ok(span('dawn') >= 2, `dawn ${span('dawn')} h`);
  assert.ok(span('afternoon') >= 1, `afternoon ${span('afternoon')} h`);
});

test('the moon: new at a known new moon, full half a cycle later, and a full moon is high at midnight', () => {
  const newMoon = Date.UTC(2000, 0, 6, 18, 14);
  assert.ok(moonPhase(newMoon) < 0.001 || moonPhase(newMoon) > 0.999);
  assert.ok(Math.abs(moonPhase(newMoon + 14.765 * 86400000) - 0.5) < 0.001);
  assert.ok(moonAt(0, 0.5).elevation > 45);
  assert.ok(moonAt(0, 0).elevation < -45, 'a new moon is down at night');
  assert.ok(Math.abs(roadMoon(24 * 29.530588853, 0.2) - 0.2) < 1e-9, 'one turn per synodic month');
});

test('seasons follow the date', () => {
  assert.equal(seasonOf(new Date(2026, 9, 9).getTime()), 'autumn');
  assert.equal(seasonOf(new Date(2026, 0, 15).getTime()), 'winter');
});

test('weather is a pure function of time, seed and place', () => {
  for (let h = 0; h < 200; h += 0.7) assert.deepEqual(weatherAt(h, 9, mild), weatherAt(h, 9, mild));
  const dry: Tendency = { ...mild, wet: 0 };
  const wet: Tendency = { ...mild, wet: 1, snow: 0 };
  const cold: Tendency = { ...mild, wet: 1, snow: 1 };
  for (let h = 0; h < 300; h += 0.9) {
    assert.equal(weatherAt(h, 3, dry).kind, 'none');
    assert.equal(weatherAt(h, 3, wet).kind === 'snow', false);
    assert.notEqual(weatherAt(h, 3, cold).kind, 'rain');
  }
  let rainy = 0;
  for (let h = 0; h < 3000; h += 1) if (weatherAt(h, 5, wet).kind === 'rain') rainy++;
  assert.ok(rainy > 2700, `rain ${rainy}/3000`);
});

test('weather changes gradually: no jump between one world minute and the next', () => {
  for (let h = 0; h < 120; h += 1 / 60) {
    const a = weatherAt(h, 11, mild);
    const b = weatherAt(h + 1 / 60, 11, mild);
    assert.ok(Math.abs(a.cloud - b.cloud) < 0.05, `cloud at ${h}`);
    assert.ok(Math.abs(a.fog - b.fog) < 0.05, `fog at ${h}`);
    assert.ok(Math.abs(a.wind - b.wind) < 0.05, `wind at ${h}`);
  }
});

test('every named weather exists for the frozen mode', () => {
  for (const n of ['clear', 'cloudy', 'overcast', 'fog', 'rain', 'snow', 'storm', 'wind']) assert.notEqual(namedWeather(n), null, n);
  assert.equal(namedWeather('hail'), null);
  assert.equal(namedWeather('storm')?.storm, true);
});

test('lightning only in storms, and only for a moment', () => {
  const calm = namedWeather('rain');
  const storm = namedWeather('storm');
  assert.ok(calm !== null && storm !== null);
  let flashes = 0;
  for (let t = 0; t < 600; t += 0.005) {
    assert.equal(flashAt(t, 1, calm), false);
    if (flashAt(t, 1, storm)) flashes++;
  }
  assert.ok(flashes > 0 && flashes < 600 * 200 * 0.02, `flash samples ${flashes}`);
});
