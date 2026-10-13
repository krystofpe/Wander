import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIVE, LIVE_SEED, liveAt, liveEnv, stepAt } from '../src/live.ts';
import { boundVisit, keepMeeting, newWisp, reviveWisp } from '../src/wisp/journey.ts';
import { catchUpLiveMeetings } from '../src/wisp/live-memory.ts';

const day = LIVE.day * 1000;
test('a day away recovers the same real camp meetings as watching each night', () => {
  const start = LIVE.epoch + 60 * day;
  const save = newWisp(42, start), watched = newWisp(42, start);
  const env = liveEnv(LIVE_SEED);
  // Independently sample the real road during each night's central visit period.
  for (let i = 0; i < 24; i++) {
    const now = start + i * day + 180000;
    keepMeeting(watched, boundVisit(liveAt(LIVE_SEED, stepAt(now), env)));
  }
  assert.equal(catchUpLiveMeetings(save, start + 24 * day), true);
  assert.equal(save.meetings, watched.meetings);
  assert.ok(save.meetings > 0);
  const loaded = reviveWisp(JSON.parse(JSON.stringify(save)))!;
  catchUpLiveMeetings(loaded, start + 24 * day + 1000);
  assert.equal(loaded.meetings, save.meetings, 'reopening does not count old nights again');
  assert.equal(catchUpLiveMeetings(loaded, start), false, 'moving the clock backwards cannot duplicate history');
});
test('adoption midway through a visit counts it, but adoption after it does not', () => {
  // The first selected night on this road is night 2.
  const middle = LIVE.epoch + day + 180000;
  const present = newWisp(42, middle);
  catchUpLiveMeetings(present, middle + 1000);
  assert.equal(present.meetings, 1);
  keepMeeting(present, boundVisit(liveAt(LIVE_SEED, stepAt(middle), liveEnv(LIVE_SEED))));
  assert.equal(present.meetings, 1, 'a rendered visit and recovered visit are one meeting');
  const later = newWisp(42, LIVE.epoch + day + 700000);
  catchUpLiveMeetings(later, LIVE.epoch + 2 * day);
  assert.equal(later.meetings, 0, 'nothing before the wisp existed is counted');
});
test('old saves migrate without recounting already observed meetings', () => {
  const saved = newWisp(42, LIVE.epoch);
  saved.lastNight = 2; saved.meetings = 1;
  const { liveCheckedAt, ...old } = saved;
  const restored = reviveWisp(old)!;
  assert.equal(restored.liveCheckedAt, null);
  catchUpLiveMeetings(restored, LIVE.epoch + 2 * day);
  assert.equal(restored.meetings, 1);
  assert.equal(reviveWisp({ ...saved, liveCheckedAt: 'broken' }), null);
});
