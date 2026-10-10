import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/creature/game.ts';
import { newLife } from '../src/creature/life.ts';
import { clockAt, hourAt } from '../src/creature/road.ts';
import { Geometry } from '../src/creature/scene.ts';
import { awakeAt, cameWhileAway, travellerCame } from '../src/creature/traveller.ts';
import { VISIT, camping, sitsUp, visitAt } from '../src/creature/visit.ts';
import { newLife as newRoadLife } from '../src/life.ts';
import { rng } from '../src/noise.ts';
import { seedOf } from '../src/options.ts';

const seed = seedOf('moss');

test('every night it comes to his camp: through the portal, over to the fire, with him, back, and the portal shut', () => {
  const day = 24 * 40;
  assert.equal(visitAt(day + 20, seed), null, 'not in the evening');
  assert.equal(visitAt(day + 12, seed), null, 'nor by day');
  const phases: string[] = [];
  for (let h = VISIT.from; h < VISIT.from + 4.2; h += 0.005) {
    const v = visitAt(day + h, seed);
    const p = v === null ? 'none' : v.phase;
    if (phases.at(-1) !== p) phases.push(p);
  }
  assert.deepEqual(phases, ['opening', 'coming', 'with', 'going', 'closing', 'none']);
  // One night is one visit, the same for everyone who looks.
  const a = visitAt(day + VISIT.from + 1, seed);
  const b = visitAt(day + VISIT.from + 3, seed);
  assert.ok(a !== null && b !== null && a.night === b.night);
  assert.deepEqual(visitAt(day + VISIT.from + 1, seed), a);
});

test('some nights he wakes and sits up with it, some nights he sleeps on', () => {
  let woke = 0;
  for (let n = 0; n < 200; n++) if (visitAt(24 * n + VISIT.from + 1.5, seed)?.woke === true) woke++;
  assert.ok(woke > 60 && woke < 140, `${woke} of 200 nights`);
  for (let n = 0; n < 40; n++) {
    const v = visitAt(24 * n + VISIT.from + 1.5, seed);
    assert.equal(sitsUp(v), v?.woke === true, 'in the middle of the visit, he sits up on the nights he wakes');
    assert.equal(sitsUp(visitAt(24 * n + VISIT.from + 0.1, seed)), false, 'not while the portal is still opening');
  }
});

test('it only comes to his camp, while he sits by the fire or sleeps by it', () => {
  const l = newRoadLife(seed, 1000, 0.5);
  l.act = 'camp';
  l.fire = { at: 1000.9, heat: 1 };
  for (const stage of ['campsit', 'lie', 'sleep'] as const) {
    l.stage = stage;
    assert.ok(camping(l), stage);
  }
  l.stage = 'walk';
  assert.ok(!camping(l));
  l.stage = 'sleep';
  l.fire = null;
  assert.ok(!camping(l));
});

test('from its page, his clock is his journey\'s, moved on a day an hour', () => {
  const journey = { seed, at: 0, savedAt: 0, clock: 22 };
  assert.equal(clockAt(journey, 0), 22);
  assert.equal(hourAt(journey, (3 * 3600 * 1000) / 24), 1);
  assert.equal(clockAt({ seed, at: 0, savedAt: 0 }, 0), 12, 'no clock: noon');
});

test('a visit is kept once a night, in its diary in order, and it tells you when it went while you were away', () => {
  const t = new Date(2026, 9, 10, 15).getTime();
  const life = newLife(4, t - 86400000);
  assert.ok(travellerCame(life, t, 'woke'));
  assert.equal(life.traveller.times, 1);
  assert.ok(life.diary.at(-1)?.text.includes('traveller'));
  assert.ok(!travellerCame(life, t + 5 * 60000, 'slept'), 'not twice in one night');
  assert.ok(travellerCame(life, t + 3600000, 'slept'));
  assert.ok(cameWhileAway(life, t + 1000) && !cameWhileAway(life, t + 2 * 3600000));
  for (let i = 1; i < life.diary.length; i++) assert.ok(life.diary[i].t >= life.diary[i - 1].t);
  assert.equal(awakeAt(0.3, new Date(2026, 9, 10, 14).getTime()), true);
  assert.equal(awakeAt(0.3, new Date(2026, 9, 10, 3).getTime()), false);
});

test('from the deep it opens its portal, goes through, keeps the visit when it comes back, and shuts it', () => {
  const day = new Date(2026, 9, 10, 15).getTime();
  const life = newLife(21, day - 86400000, { biome: 'forest' });
  life.userName = 'Krystof';
  const game = new Game(life, { geo: new Geometry(640), now: day, random: rng(7), mind: null, login: 'k', firstMeeting: false, away: null, place: 'deep' });
  game.hisNight = visitAt(VISIT.from + 0.05, seed);
  game.brain.run('portal');
  let gone = false;
  let opened = 0;
  for (let i = 0; i < 900 && !gone; i++) {
    game.update(0.1);
    opened = Math.max(opened, game.portal);
    gone = game.gone;
  }
  assert.ok(opened === 1 && gone && !game.body.visible, 'the portal opened and it went through');
  game.hisNight = visitAt(VISIT.from + 3.98, seed);
  for (let i = 0; i < 400; i++) game.update(0.1);
  assert.ok(!game.gone && game.body.visible && game.portal === 0, 'back, and the portal shut');
  assert.ok(life.diary.at(-1)?.text.includes('fire'), 'and it keeps the visit');
});
