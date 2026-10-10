import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLLOW } from '../src/biomes.ts';
import { Game } from '../src/creature/game.ts';
import { newLife } from '../src/creature/life.ts';
import { eyesAt, eyesFade, owlTonight } from '../src/creature/night.ts';
import { REACH, firesideAt, hollowBy, homeHollow, roadFrom, satBetween } from '../src/creature/road.ts';
import { Geometry } from '../src/creature/scene.ts';
import { cameWhileAway, travellerCame } from '../src/creature/traveller.ts';
import { AWAY, awayAt, catchUp, newJourney } from '../src/journal.ts';
import { rng } from '../src/noise.ts';
import { seedOf } from '../src/options.ts';
import { groundHeight, landmarksBetween, stretchAt } from '../src/world.ts';

const seed = seedOf('moss');
const hollows = landmarksBetween(seed, 0, 200000).filter((m) => m.kind === 'hollow');
const first = hollows[0];

test('hollows stand only in their lands, a few to a road, on level ground', () => {
  assert.ok(hollows.length >= 4 && hollows.length <= 40, `${hollows.length} in 200 km`);
  for (const m of hollows) {
    assert.ok(HOLLOW.homes.has(stretchAt(seed, m.at).biome), `${m.at}: ${stretchAt(seed, m.at).biome}`);
    for (const d of [-10, -5, 5, 10]) assert.ok(Math.abs(groundHeight(seed, m.at + d) - groundHeight(seed, m.at)) < 1e-6, `level at ${d} m`);
  }
});

test('its hollow on his road is in its own land, the same every time', () => {
  const forest = homeHollow(seed, 'forest');
  assert.ok(forest !== null && ['pine', 'birch'].includes(stretchAt(seed, forest.at).biome));
  assert.deepEqual(homeHollow(seed, 'forest'), forest);
  for (const biome of ['meadow', 'tundra', 'swamp'] as const) {
    const h = homeHollow(seed, biome);
    assert.ok(h !== null && h.kind === 'hollow', biome);
  }
});

test('he comes by a hollow when he is within reach of its door', () => {
  assert.deepEqual(hollowBy(seed, first.at - 10)?.d, -10);
  assert.deepEqual(hollowBy(seed, first.at + REACH)?.d, REACH);
  assert.equal(hollowBy(seed, first.at - REACH - 5), null);
});

test('away, he walks at his pace, sits a while at each hollow door, and is that much behind after', () => {
  const from = first.at - 100;
  const seat = first.at + HOLLOW.seat;
  const reach = (seat - from) / AWAY.pace;
  assert.deepEqual(awayAt(seed, from, reach - 10), { at: from + (reach - 10) * AWAY.pace, sitting: false });
  assert.deepEqual(awayAt(seed, from, reach + 10), { at: seat, sitting: true });
  assert.deepEqual(awayAt(seed, from, reach + AWAY.hollowSec - 1), { at: seat, sitting: true });
  const after = awayAt(seed, from, reach + AWAY.hollowSec + 20);
  assert.ok(!after.sitting && Math.abs(after.at - (seat + 20 * AWAY.pace)) < 1e-6);
  // Saved between a door and its seat, he still sits there.
  assert.deepEqual(awayAt(seed, first.at + 1, (HOLLOW.seat - 1) / AWAY.pace + 5), { at: seat, sitting: true });
  assert.ok(satBetween({ seed, at: first.at + 1, savedAt: 0 }, 0, 60_000) !== null);
  // Far away he walks the whole way, with no rests counted.
  assert.equal(awayAt(seed, 0, 1e9).at, AWAY.capMetres);
});

test('the road page and the hollow agree on where he is', () => {
  const j = newJourney('moss', 0, 0.3);
  j.life.at = first.at - 300;
  const journey = { seed: j.life.seed, at: j.life.at, savedAt: j.savedAt };
  const ms = 900_000;
  const seen = roadFrom(journey, ms);
  catchUp(j, ms, 1200);
  assert.ok(Math.abs(j.life.at - seen.at) < 1e-6, `${j.life.at} and ${seen.at}`);
});

test('the time he sat down at a door while the window was closed is the time the road says', () => {
  const journey = { seed, at: first.at - 200, savedAt: 1_000_000 };
  const sat = satBetween(journey, journey.savedAt, journey.savedAt + 3600_000);
  assert.ok(sat !== null);
  assert.equal(roadFrom(journey, sat - 2000).sitting, false);
  assert.equal(roadFrom(journey, sat + 2000).sitting, true);
  assert.equal(satBetween(journey, sat + 1, sat + 60_000), null, 'and no other in the minute after');
  assert.equal(satBetween({ seed, at: first.at + 50, savedAt: 0 }, 0, 60_000), null, 'nor any when he passed no door');
});

test('a visit is kept once, in its diary in order, and it knows he came while you were away', () => {
  const t = new Date(2026, 9, 10, 15).getTime();
  const life = newLife(4, t - 86400000);
  assert.ok(travellerCame(life, t, 'day'));
  assert.equal(life.traveller.times, 1);
  assert.ok(life.diary.at(-1)?.text.includes('traveller'));
  assert.ok(!travellerCame(life, t + 5 * 60000, 'day'), 'not twice for one sitting');
  assert.ok(!travellerCame(life, t - 3600000, 'night'), 'nor one before the last');
  assert.ok(travellerCame(life, t + 3600000, 'asleep'));
  assert.ok(life.diary.at(-1)?.text.includes('ash'));
  assert.ok(cameWhileAway(life, t + 1000) && !cameWhileAway(life, t + 2 * 3600000));
  for (let i = 1; i < life.diary.length; i++) assert.ok(life.diary[i].t >= life.diary[i - 1].t);
});

test('it sits with him when he sits at its door, and keeps the visit; not when it is away wandering', () => {
  const day = new Date(2026, 9, 10, 14).getTime();
  const life = newLife(9, day - 86400000, { biome: 'forest' });
  life.userName = 'Krystof';
  const game = new Game(life, { geo: new Geometry(640), now: day, random: rng(5), mind: null, login: 'k', firstMeeting: false, away: null });
  game.passer = { d: HOLLOW.seat, sitting: true, walking: false, dir: 1 };
  game.brain.run('traveller');
  for (let i = 0; i < 400; i++) game.update(0.1);
  const him = game.traveller();
  assert.ok(him !== null);
  assert.equal(game.body.pose, 'sit');
  assert.ok(Math.abs(game.body.x - him.x) < 0.06, `beside him: ${game.body.x} and ${him.x}`);
  assert.equal(life.traveller.times, 1);
  const away = newLife(10, day - 86400000);
  const g2 = new Game(away, { geo: new Geometry(640), now: day, random: rng(5), mind: null, login: 'k', firstMeeting: false, away: null });
  g2.brain.run('wander');
  g2.update(0.1);
  g2.travellerSat();
  assert.equal(away.traveller.times, 0);
});

test('the owl comes on most nights, the same for everyone; eyes now and then, nine seconds', () => {
  let owls = 0;
  for (let n = 0; n < 400; n++) {
    const ms = new Date(2026, 9, 10 + n, 23).getTime();
    const o = owlTonight(seed, ms);
    assert.deepEqual(owlTonight(seed, ms + 3600000), o, 'all night');
    if (o !== null) owls++;
  }
  assert.ok(owls > 240 && owls < 320, `${owls} of 400 nights`);
  let seen = 0;
  for (let ms = 0; ms < 5000 * 50000; ms += 50000) if (eyesAt(seed, ms + 1000) !== null) seen++;
  assert.ok(seen > 1700 && seen < 2300, `${seen} of 5000`);
  assert.equal(eyesAt(seed, 50000 * 7 + 9500), null);
  assert.equal(eyesFade(0), 0);
  assert.equal(eyesFade(4.5), 1);
});

test('in his evening by the fire the creature comes to sit with him, and goes home before the deep of the night', async () => {
  const { comesToFire } = await import('../web/hollowmark.ts');
  const { newLife: newRoadLife } = await import('../src/life.ts');
  const l = newRoadLife(seed, 1000, 20.5);
  l.act = 'camp';
  l.stage = 'campsit';
  l.fire = { at: 1000.9, heat: 1 };
  l.clock = 20.5;
  assert.ok(comesToFire(l, null), 'by his fire in the evening');
  assert.ok(!comesToFire(l, { name: 'Ori', cloak: 0, away: true, nightOwl: 0.3 }), 'not while it is off wandering');
  l.clock = 23;
  assert.ok(!comesToFire(l, null), 'home before the deep of the night');
  l.clock = 20.5;
  l.stage = 'walk';
  assert.ok(!comesToFire(l, null), 'only at his camp');
  // From the hollow: his journey's clock moved on (a day an hour) says when his fire is lit.
  const journey = { seed, at: 0, savedAt: 0, clock: 19 };
  assert.equal(firesideAt(journey, 0), false);
  assert.equal(firesideAt(journey, (1.5 * 3600 * 1000) / 24), true);
  assert.equal(firesideAt(journey, (4 * 3600 * 1000) / 24), false);
  assert.equal(firesideAt({ seed, at: 0, savedAt: 0 }, 0), false, 'no clock, no fire');
});

test('from the deep it goes up through its door to his fire, keeps the visit, and comes home', () => {
  const day = new Date(2026, 9, 10, 15).getTime();
  const life = newLife(21, day - 86400000, { biome: 'forest' });
  life.userName = 'Krystof';
  const game = new Game(life, { geo: new Geometry(640), now: day, random: rng(7), mind: null, login: 'k', firstMeeting: false, away: null, place: 'deep' });
  game.hisFire = true;
  game.brain.run('fireside');
  let went = false;
  for (let i = 0; i < 600 && !went; i++) {
    game.update(0.1);
    went = game.awayAtFire;
  }
  assert.ok(went && game.body.inside, 'it has gone in through its door');
  assert.ok(life.diary.at(-1)?.text.includes('fire'), 'and keeps the visit');
  game.hisFire = false;
  for (let i = 0; i < 300; i++) game.update(0.1);
  assert.ok(!game.awayAtFire && !game.body.inside, 'home again, outside');
});
