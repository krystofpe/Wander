import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundVisit, dreamAt, emberStrength, keepEmber, keepMeeting, noticeAt, newWisp, reviveWisp } from '../src/wisp/journey.ts';

test('the dream keeps moving continuously across realm boundaries, including long absences', () => {
  for (const t of [240, 480, 720, 960, 86400]) {
    const before = dreamAt(t - 0.001, 42);
    const after = dreamAt(t, 42);
    assert.equal(before.next, after.realm);
    assert.ok(before.blend > 0.999);
    assert.ok(Math.abs(before.x - after.x) < 0.0001);
    assert.ok(Math.abs(before.y - after.y) < 0.0001);
  }
  assert.deepEqual(dreamAt(120, 42), dreamAt(120, 42));
});

test('guardian crossings are occasional, deterministic, and restricted to real camps', () => {
  let crossings = 0;
  for (let night = 0; night < 100; night++) {
    const road = { seed: 42, clock: night * 24 + 24.5, act: 'camp', stage: 'sleep', fire: {} };
    const v = boundVisit(road);
    assert.deepEqual(v, boundVisit(road));
    if (v !== null) crossings++;
    assert.equal(boundVisit({ ...road, fire: null }), null);
    assert.equal(boundVisit({ ...road, act: 'walk' }), null);
    assert.equal(boundVisit({ ...road, clock: night * 24 + 12 }), null);
    assert.equal(boundVisit(road, true)?.phase, 'with');
  }
  assert.ok(crossings > 20 && crossings < 65);
});

test('a meeting is remembered only once, and malformed saves cannot corrupt a journey', () => {
  const save = newWisp(42, 1234);
  const v = boundVisit({ seed: 42, clock: 24.5, act: 'camp', stage: 'sleep', fire: {} }, true);
  assert.equal(keepMeeting(save, v), true);
  assert.equal(keepMeeting(save, v), false);
  assert.equal(save.meetings, 1);
  assert.deepEqual(reviveWisp(JSON.parse(JSON.stringify(save))), save);
  for (const bad of [null, {}, { ...save, seed: '42' }, { ...save, bornAt: Infinity }, { ...save, meetings: -1 }, { ...save, lastNight: 'yesterday' }]) assert.equal(reviveWisp(bad), null);
});

test('the camp ember is kept once per return and fades through saved wall-clock time', () => {
  const save = newWisp(42, 0);
  const closing = { phase: 'closing' as const, k: 0.5, woke: false, night: 2 };
  assert.equal(keepEmber(save, { ...closing, phase: 'with' }, 1000), false);
  assert.equal(keepEmber(save, closing, 1000), true);
  assert.equal(keepEmber(save, closing, 2000), false);
  const loaded = reviveWisp(JSON.parse(JSON.stringify(save)))!;
  assert.equal(emberStrength(loaded, 1000), 1);
  assert.equal(emberStrength(loaded, 76000), 0.25);
  assert.equal(emberStrength(loaded, 151000), 0);
  const { emberAt, emberNight, ...legacy } = save;
  assert.equal(reviveWisp(legacy)?.emberAt, null);
});
test('noticing a light is seeded, fades smoothly, and leaves the quiet void empty', () => {
  const event = noticeAt(20, 42);
  assert.equal(noticeAt(event.start, 42).strength, 0);
  assert.equal(noticeAt(event.start + 24, 42).strength, 0);
  assert.ok(noticeAt(event.start + 12, 42).strength > 0.99);
  assert.deepEqual(noticeAt(event.start + 12, 42), noticeAt(event.start + 12, 42));
  for (let t = 720; t < 920; t++) assert.equal(noticeAt(t, 42).strength, 0);
});
