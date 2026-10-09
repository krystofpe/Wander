import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIOME_NAMES, CLOAKS, DRAIN_SEC, SLEEP_REFILL_SEC } from '../src/config.ts';
import {
  DIARY_LIMIT,
  FACT_LIMIT,
  addDiary,
  drain,
  duration,
  isNightFor,
  moodEyes,
  moodOf,
  newLife,
  prettyName,
  remember,
  sleepHours,
  traitWords,
  warm,
} from '../src/creature.ts';

const calm = { joy: 0, fright: 0, annoyance: 0 };

test('a new life is the same for the same seed, and differs between seeds', () => {
  const a = newLife(5, 1000);
  assert.deepEqual(a, newLife(5, 1000));
  assert.ok(BIOME_NAMES.includes(a.biome));
  assert.ok(CLOAKS.includes(a.cloak));
  assert.equal(a.diary[0].text, `${a.name} arrived.`);
  const names = new Set(Array.from({ length: 40 }, (_, i) => newLife(i, 0).name));
  assert.ok(names.size > 10);
  assert.equal(newLife(5, 0, { biome: 'swamp', name: 'Ulo' }).biome, 'swamp');
  assert.equal(newLife(5, 0, { name: 'Ulo' }).name, 'Ulo');
});

test('needs drain awake; asleep they drain slower and rest refills', () => {
  const awake = { food: 1, rest: 1, fun: 1, love: 1 };
  drain(awake, DRAIN_SEC.food / 2, false);
  assert.ok(Math.abs(awake.food - 0.5) < 1e-9);
  assert.equal(awake.fun, 0);
  const asleep = { food: 1, rest: 0, fun: 1, love: 1 };
  drain(asleep, SLEEP_REFILL_SEC / 2, true);
  assert.ok(Math.abs(asleep.rest - 0.5) < 1e-9);
  assert.ok(asleep.food > 0.79 && asleep.food < 0.81, 'food drains at 40% while asleep');
});

test('mood follows the worst need and passing feelings', () => {
  const t = newLife(1, 0).traits;
  const full = { food: 1, rest: 1, fun: 1, love: 1 };
  assert.equal(moodOf(full, calm, t, false), 'content');
  assert.equal(moodOf({ ...full, food: 0.1 }, calm, t, false), 'hungry');
  assert.equal(moodOf({ ...full, love: 0.1 }, calm, t, false), 'lonely');
  assert.equal(moodOf({ ...full, rest: 0.2 }, calm, t, false), 'sleepy');
  assert.equal(moodOf(full, { ...calm, fright: 0.9 }, t, false), 'scared');
  assert.equal(moodOf(full, { ...calm, annoyance: 0.9 }, t, false), 'grumpy');
  assert.equal(moodOf(full, { ...calm, joy: 0.9 }, t, false), 'joyful');
  assert.equal(moodEyes('joyful'), '^ ^');
  assert.equal(Array.from(moodEyes('lonely')).length, 3);
});

test('night owls go to bed later', () => {
  const owl = { ...newLife(1, 0).traits, nightOwl: 1 };
  const lark = { ...newLife(1, 0).traits, nightOwl: 0 };
  assert.ok(sleepHours(owl).bed > sleepHours(lark).bed);
  assert.equal(isNightFor(lark, 22), true);
  assert.equal(isNightFor(lark, 3), true);
  assert.equal(isNightFor(lark, 14), false);
  assert.equal(isNightFor(owl, 22), false);
});

test('the diary and the facts are capped, and facts are not repeated', () => {
  const life = newLife(1, 0);
  for (let i = 0; i < DIARY_LIMIT + 20; i++) addDiary(life, i, `entry ${i}`);
  assert.equal(life.diary.length, DIARY_LIMIT);
  assert.equal(life.diary.at(-1)?.text, `entry ${DIARY_LIMIT + 19}`);
  remember(life, 'likes tea');
  remember(life, 'Likes  tea');
  assert.equal(life.facts.length, 1);
  for (let i = 0; i < FACT_LIMIT + 5; i++) remember(life, `fact ${i}`);
  assert.equal(life.facts.length, FACT_LIMIT);
});

test('kindness raises the bond, by less as it grows', () => {
  const life = newLife(1, 0);
  const before = life.bond;
  warm(life);
  const step1 = life.bond - before;
  warm(life, 20);
  const b = life.bond;
  warm(life);
  assert.ok(life.bond - b < step1);
  assert.ok(life.bond < 1);
});

test('words: traits, durations and names', () => {
  assert.ok(traitWords(newLife(3, 0).traits).split(', ').length === 4);
  assert.equal(duration(20000), 'a moment');
  assert.equal(duration(60000), 'a minute');
  assert.equal(duration(5 * 60000), '5 minutes');
  assert.equal(duration(3 * 3600000), '3 hours');
  assert.equal(duration(2 * 86400000), '2 days');
  assert.equal(prettyName('krystofpe'), 'Krystofpe');
  assert.equal(prettyName('  kryštof!! '), 'Kryštof');
  assert.equal(prettyName('😀'), '');
});
